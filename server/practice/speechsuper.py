"""Local integration pilot. No identity or teacher eligibility decisions."""
import base64
import binascii
import hashlib
import io
import json
import logging
import math
import os
import time
import wave
from uuid import uuid4
import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, ValidationError
from typing import Literal

router = APIRouter(prefix='/api/speechsuper')
logger = logging.getLogger(__name__)

class Assessment(BaseModel):
    kind: Literal['word', 'sentence', 'speech']
    text: str = Field(min_length=1, max_length=2000)
    audio: str = Field(min_length=1, max_length=5_200_000)


def keys():
    return os.getenv('SPEECHSUPER_APP_KEY', '').strip(), os.getenv('SPEECHSUPER_SECRET_KEY', '').strip()

@router.get('/status')
def status():
    return {'provider': 'speechsuper', 'configured': all(keys()), 'mode': 'local_pilot', 'qualification': 'human_review_required'}


def validate_audio(encoded: str):
    try:
        audio = base64.b64decode(encoded, validate=True)
        with wave.open(io.BytesIO(audio)) as wav:
            if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype()) != (1, 2, 16000, 'NONE'):
                raise ValueError()
            duration = wav.getnframes() / 16000
            pcm = wav.readframes(wav.getnframes())
            if len(pcm) != wav.getnframes() * 2 or not 0.3 <= duration <= 120:
                raise ValueError()
        import array
        samples = array.array('h', pcm)
        if __import__('sys').byteorder != 'little':
            samples.byteswap()
        rms = math.sqrt(sum(s * s for s in samples) / len(samples)) / 32768
        if rms < 0.004:
            raise HTTPException(422, '未检测到有效声音，请重新录音。')
        return audio, duration
    except HTTPException:
        raise
    except (ValueError, binascii.Error, wave.Error, EOFError):
        raise HTTPException(422, '音频需为 0.3–120 秒、16kHz 单声道 PCM WAV。')


def payload(item, app_key, secret, token):
    timestamp = str(int(time.time()))
    user_id = 'ft-local-pilot'
    core = {'word': 'word.eval.promax', 'sentence': 'sent.eval.promax', 'speech': 'speak.eval.pro'}[item.kind]
    sig = lambda s: hashlib.sha1(s.encode()).hexdigest()
    request = {'coreType': core, 'tokenId': token}
    if item.kind == 'speech':
        request.update(test_type='ielts', question_prompt=item.text.strip(), model='non_native', penalize_offtopic=1)
    else:
        request['refText'] = item.text.strip()
    return core, {
        'connect': {'cmd': 'connect', 'param': {'sdk': {'version': 16777472, 'source': 9, 'protocol': 2}, 'app': {'applicationId': app_key, 'sig': sig(app_key + timestamp + secret), 'timestamp': timestamp}}},
        'start': {'cmd': 'start', 'param': {'app': {'userId': user_id, 'applicationId': app_key, 'timestamp': timestamp, 'sig': sig(app_key + timestamp + user_id + secret)}, 'audio': {'audioType': 'wav', 'channel': 1, 'sampleBytes': 2, 'sampleRate': 16000}, 'request': request}},
    }

async def vendor_call(core, params, audio):
    async with httpx.AsyncClient(timeout=60, follow_redirects=False) as client:
        response = await client.post('https://api.speechsuper.com/' + core, data={'text': json.dumps(params)}, files={'audio': ('recording.wav', audio, 'audio/wav')}, headers={'Request-Index': '0'})
        response.raise_for_status()
        return response.json()

@router.post('/assess')
async def assess(request: Request):
    # This pilot must stay on localhost until real authentication is integrated.
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
    if not item.text.strip() or (item.kind == 'word' and len(item.text.split()) != 1):
        raise HTTPException(422, '单词题只能填写一个单词；多词请使用句子题。')
    audio, duration = validate_audio(item.audio)
    limit = {'word':20, 'sentence':90, 'speech':120}[item.kind]
    if duration > limit:
        raise HTTPException(422, f'此题型录音最长 {limit} 秒，请缩短录音。')
    if item.kind == 'sentence' and len(item.text.split()) > 200:
        raise HTTPException(422, '句子题最多 200 个词。')
    app_key, secret = keys()
    if not app_key or not secret:
        raise HTTPException(503, 'SpeechSuper 尚未配置密钥，请配置后端 appKey 和 secretKey 后重试。')
    token = str(uuid4())
    core, params = payload(item, app_key, secret, token)
    try:
        raw = await vendor_call(core, params, audio)
    except httpx.TimeoutException as exc:
        logger.warning('SpeechSuper transport timeout: %s', type(exc).__name__)
        raise HTTPException(504, 'SpeechSuper 响应超时，请稍后重试。')
    except httpx.HTTPStatusError as exc:
        logger.warning('SpeechSuper upstream HTTP status: %s', exc.response.status_code)
        raise HTTPException(502, f'SpeechSuper 服务返回异常（HTTP {exc.response.status_code}），请稍后重试。')
    except httpx.HTTPError as exc:
        # Never log request bodies, URLs, signatures, credentials or recordings.
        logger.warning('SpeechSuper transport error: %s', type(exc).__name__)
        raise HTTPException(502, '本地服务连接 SpeechSuper 失败，请检查网络后重试。')
    except ValueError:
        logger.warning('SpeechSuper returned invalid JSON')
        raise HTTPException(502, 'SpeechSuper 返回格式异常，请稍后重试。')
    if not isinstance(raw, dict) or raw.get('error') or raw.get('errId') or raw.get('errorId'):
        import re
        code = str(raw.get('errId') or raw.get('errorId') or 'unknown') if isinstance(raw, dict) else 'invalid_response'
        code = code if re.fullmatch(r'[A-Za-z0-9_-]{1,40}', code) else 'unknown'
        logger.warning('SpeechSuper rejected assessment: code=%s', code)
        reason = '密钥签名校验失败，请核对 App Key 与 Secret Key。' if code == '41030' else '供应商拒绝本次评测，具体原因待核查。'
        raise HTTPException(502, f'SpeechSuper 错误码 {code}：{reason}')
    result = raw.get('result')
    if not isinstance(result, dict) or not result:
        raise HTTPException(502, 'SpeechSuper 未返回有效评测结果。')
    # Return only vendor results, never request/signature material; do not invent missing scores.
    return {'id': token, 'provider': 'speechsuper', 'kind': item.kind, 'text': item.text.strip(), 'duration': duration, 'result': result, 'qualification': 'human_review_required', 'scale': 'IELTS/vendor scale' if item.kind == 'speech' else 'vendor 0–100'}
