"""Tencent Cloud SOE (智聆口语评测) local integration pilot.

Credentials stay on the server. The browser sends the same base64 WAV payload
used by the existing practice panel; this adapter translates it to Tencent's
signed WSS recording protocol and returns the normalized assessment contract.
"""
import base64
import hashlib
import hmac
import json
import logging
import math
import os
import re
import secrets
import time
from typing import Any
from urllib.parse import urlencode
from uuid import uuid4

import websockets
from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError

from .speechsuper import Assessment, validate_audio

router = APIRouter(prefix='/api/tencent')
logger = logging.getLogger(__name__)
HOST = 'soe.cloud.tencent.com'


def config() -> dict[str, str]:
    return {
        'app_id': os.getenv('TENCENT_SOE_APP_ID', '').strip(),
        'secret_id': os.getenv('TENCENT_SOE_SECRET_ID', '').strip(),
        'secret_key': os.getenv('TENCENT_SOE_SECRET_KEY', '').strip(),
        'score_coeff': os.getenv('TENCENT_SOE_SCORE_COEFF', '4.0').strip() or '4.0',
    }


@router.get('/status')
def status():
    cfg = config()
    configured = all(cfg[key] for key in ('app_id', 'secret_id', 'secret_key'))
    return {
        'provider': 'tencent',
        'configured': configured,
        'mode': 'local_pilot',
        'qualification': 'human_review_required',
        'server_engine_type': '16k_en',
        'score_coeff': cfg['score_coeff'],
    }


def _signed_url(cfg: dict[str, str], *, kind: str, text: str, voice_id: str) -> str:
    now = int(time.time())
    params = {
        'eval_mode': '0' if kind == 'word' else '1',
        'expired': str(now + 300),
        'nonce': str(secrets.randbelow(900_000_000) + 1),
        'rec_mode': '1',
        'ref_text': text,
        'score_coeff': cfg['score_coeff'],
        'secretid': cfg['secret_id'],
        'server_engine_type': '16k_en',
        'timestamp': str(now),
        'voice_format': '1',
        'voice_id': voice_id,
    }
    query = '&'.join(f'{key}={params[key]}' for key in sorted(params))
    source = f'{HOST}/soe/api/{cfg["app_id"]}?{query}'
    signature = base64.b64encode(
        hmac.new(cfg['secret_key'].encode(), source.encode(), hashlib.sha1).digest()
    ).decode()
    return f'wss://{HOST}/soe/api/{cfg["app_id"]}?{urlencode({**params, "signature": signature})}'


async def vendor_call(url: str, audio: bytes) -> list[dict[str, Any]]:
    """Send one complete WAV recording and collect Tencent text messages."""
    messages: list[dict[str, Any]] = []
    try:
        async with websockets.connect(url, proxy=None, open_timeout=10, close_timeout=5, max_size=8_000_000) as ws:
            async for message in _messages_after_audio(ws, audio):
                if isinstance(message, str):
                    try:
                        item = json.loads(message)
                    except json.JSONDecodeError:
                        item = {'raw': message}
                    messages.append(item)
                    if item.get('code', 0) != 0:
                        break
                    if item.get('final') == 1:
                        break
    except TimeoutError as exc:
        raise TimeoutError('Tencent SOE websocket timeout') from exc
    return messages


async def _messages_after_audio(ws, audio: bytes):
    """Yield the handshake response, then final responses for recording mode."""
    handshake = await ws.recv()
    yield handshake
    if isinstance(handshake, str):
        try:
            data = json.loads(handshake)
        except json.JSONDecodeError:
            data = {'code': -1}
        if data.get('code', 0) != 0:
            return
    await ws.send(audio)
    await ws.send(json.dumps({'type': 'end'}))
    while True:
        try:
            message = await ws.recv()
        except websockets.exceptions.ConnectionClosed:
            return
        yield message
        if isinstance(message, str):
            try:
                data = json.loads(message)
            except json.JSONDecodeError:
                continue
            if data.get('final') == 1 or data.get('code', 0) != 0:
                return


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _balanced(text: str, start: int, opening: str = '[', closing: str = ']') -> str:
    depth = 0
    quote = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if quote:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '"':
                quote = False
            continue
        if char == '"':
            quote = True
        elif char == opening:
            depth += 1
        elif char == closing:
            depth -= 1
            if depth == 0:
                return text[start:index + 1]
    return text[start:]


def _scalar(block: str, key: str) -> Any:
    pattern = rf'(?:^|[{{,\s]){re.escape(key)}\s*:\s*(?:"([^"]*)"|([^,}}\s\]]+))'
    match = re.search(pattern, block)
    if not match:
        return None
    value = match.group(1) if match.group(1) is not None else match.group(2)
    return _number(value) if re.fullmatch(r'-?\d+(?:\.\d+)?', value or '') else value


def _object_blocks(block: str) -> list[str]:
    result: list[str] = []
    start: int | None = None
    depth = 0
    for index, char in enumerate(block):
        if char == '{':
            if depth == 0:
                start = index
            depth += 1
        elif char == '}' and depth:
            depth -= 1
            if depth == 0 and start is not None:
                result.append(block[start:index + 1])
                start = None
    return result


def _parse_result(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if not isinstance(value, str):
        raise ValueError('Tencent result is not an object or string')
    try:
        parsed = json.loads(value)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    parsed: dict[str, Any] = {}
    for key in ('SuggestedScore', 'PronAccuracy', 'PronFluency', 'PronCompletion', 'MatchTag', 'RefTextId'):
        number = _scalar(value, key)
        if number is not None:
            parsed[key] = number
    words_start = value.find('Words:[')
    if words_start >= 0:
        words_block = _balanced(value, words_start + len('Words:'))
        words: list[dict[str, Any]] = []
        for item in _object_blocks(words_block):
            word: dict[str, Any] = {}
            for key in ('Word', 'ReferenceWord', 'PronAccuracy', 'PronFluency', 'MatchTag'):
                scalar = _scalar(item, key)
                if scalar is not None:
                    word[key] = scalar
            phones_start = item.find('PhoneInfos:')
            phone_key = 'PhoneInfos:'
            if phones_start < 0:
                phones_start = item.find('PhoneInfo:')
                phone_key = 'PhoneInfo:'
            if phones_start >= 0:
                phones_block = _balanced(item, phones_start + len(phone_key))
                phones: list[dict[str, Any]] = []
                for phone in _object_blocks(phones_block):
                    entry: dict[str, Any] = {}
                    for key in ('Phone', 'ReferencePhone', 'PronAccuracy', 'PronFluency', 'MatchTag'):
                        scalar = _scalar(phone, key)
                        if scalar is not None:
                            entry[key] = scalar
                    if entry:
                        phones.append(entry)
                if phones:
                    word['PhoneInfo'] = phones
            words.append(word)
        if words:
            parsed['Words'] = words
    return parsed


def normalize_result(messages: list[dict[str, Any]], *, kind: str) -> tuple[dict[str, Any], dict[str, Any]]:
    errors = [item for item in messages if item.get('code', 0) not in (0, None)]
    if errors:
        code = errors[-1].get('code', 'unknown')
        message = str(errors[-1].get('message') or '腾讯云口语评测返回错误')
        raise ValueError(f'{code}:{message}')
    candidates = [item.get('result') for item in messages if item.get('result') is not None]
    if not candidates:
        raise ValueError('Tencent SOE returned no result')
    result = _parse_result(candidates[-1])
    accuracy = _number(result.get('PronAccuracy'))
    fluency = _number(result.get('PronFluency'))
    completion = _number(result.get('PronCompletion'))
    metrics: dict[str, Any] = {}
    if accuracy is not None:
        metrics['pronunciation'] = accuracy
    if fluency is not None:
        metrics['fluency'] = fluency * 100 if 0 <= fluency <= 1 else fluency
    if completion is not None:
        metrics['completion'] = completion * 100 if 0 <= completion <= 1 else completion
    suggested = _number(result.get('SuggestedScore'))
    if suggested is not None:
        metrics['suggestedScore'] = suggested
    normalized_words: list[dict[str, Any]] = []
    for word in result.get('Words', []) if isinstance(result.get('Words'), list) else []:
        if not isinstance(word, dict):
            continue
        row: dict[str, Any] = {
            'word': word.get('Word') or word.get('ReferenceWord') or '',
            'pronunciation': word.get('PronAccuracy'),
            'matchTag': word.get('MatchTag'),
        }
        phones: list[dict[str, Any]] = []
        phone_values = word.get('PhoneInfos')
        if not isinstance(phone_values, list):
            phone_values = word.get('PhoneInfo')
        for phone in phone_values if isinstance(phone_values, list) else []:
            if isinstance(phone, dict):
                phones.append({
                    'phoneme': phone.get('ReferencePhone') or phone.get('Phone') or '',
                    'pronunciation': phone.get('PronAccuracy'),
                    'matchTag': phone.get('MatchTag'),
                })
        row['phonemes'] = phones
        normalized_words.append(row)
    if normalized_words:
        result['words'] = normalized_words
    result['provider'] = 'tencent'
    result['kind'] = kind
    return result, metrics


def _error_message(code: str) -> str:
    return {
        '4002': '腾讯云鉴权失败，请检查 AppID、SecretID 和 SecretKey。',
        '4003': '腾讯云口语评测服务尚未开通。',
        '4004': '腾讯云口语评测资源不足，请补充资源后重试。',
    }.get(code, '腾讯云口语评测暂时失败，请稍后重试。')


@router.post('/assess')
async def assess(request: Request):
    if request.client and request.client.host not in ('127.0.0.1', '::1', 'testclient'):
        raise HTTPException(403, '此评测入口仅供本机试点。')
    origin = request.headers.get('origin')
    if origin and origin not in ('http://localhost:3000', 'http://127.0.0.1:3000'):
        raise HTTPException(403, '请求来源不允许。')
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 5_300_000:
            raise HTTPException(413, '录音文件过大，请缩短录音。')
    try:
        item = Assessment.model_validate_json(bytes(body))
    except ValidationError:
        raise HTTPException(422, '请选择题型并填写有效题目和录音。')
    if item.kind == 'speech':
        raise HTTPException(422, '腾讯云 Demo 当前只接入英语单词和句子评测。')
    if not item.text.strip() or (item.kind == 'word' and len(item.text.split()) != 1):
        raise HTTPException(422, '单词题只能填写一个单词；多词请使用句子题。')
    if item.kind == 'sentence' and len(item.text.split()) > 30:
        raise HTTPException(422, '腾讯云句子评测最多 30 个英文单词。')
    audio, duration = validate_audio(item.audio)
    if duration > (20 if item.kind == 'word' else 60):
        raise HTTPException(422, '录音过长，请重新录音。')
    cfg = config()
    if not all(cfg[key] for key in ('app_id', 'secret_id', 'secret_key')):
        raise HTTPException(503, '腾讯云口语评测尚未配置，请在后端环境变量中配置密钥。')
    token = str(uuid4())
    url = _signed_url(cfg, kind=item.kind, text=item.text.strip(), voice_id=token)
    try:
        messages = await vendor_call(url, audio)
        result, metrics = normalize_result(messages, kind=item.kind)
    except TimeoutError:
        logger.warning('Tencent SOE transport timeout')
        raise HTTPException(504, '腾讯云口语评测响应超时，请稍后重试。')
    except ValueError as exc:
        code, _, reason = str(exc).partition(':')
        if code in {'4002', '4003', '4004'}:
            logger.warning('Tencent SOE rejected assessment: code=%s', code)
            raise HTTPException(502, _error_message(code))
        logger.warning('Tencent SOE returned invalid result: %s', type(exc).__name__)
        raise HTTPException(502, '腾讯云口语评测返回格式异常，请稍后重试。')
    except (OSError, websockets.exceptions.WebSocketException) as exc:
        logger.warning('Tencent SOE transport error: %s', type(exc).__name__)
        raise HTTPException(502, '本地服务连接腾讯云失败，请检查网络后重试。')
    return {
        'id': token,
        'provider': 'tencent',
        'kind': item.kind,
        'text': item.text.strip(),
        'duration': duration,
        'result': result,
        'metrics': metrics,
        'scale': '腾讯云 SOE：发音/流利/完整度为 0–100；腾讯建议分见原始结果',
        'qualification': 'human_review_required',
    }
