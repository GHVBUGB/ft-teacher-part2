"""Speechace local pilot. Scores never determine teacher eligibility."""
import os
from uuid import uuid4
import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError
from .speechsuper import Assessment, validate_audio
router = APIRouter(prefix='/api/speechace')
REGIONS = {'us': 'https://api.speechace.co', 'sg': 'https://api2.speechace.com', 'eu': 'https://api4.speechace.com', 'in': 'https://api5.speechace.com'}
def config():
    return os.getenv('SPEECHACE_API_KEY', '').strip(), os.getenv('SPEECHACE_REGION', 'us').strip()
@router.get('/status')
def status():
    key, region = config()
    return {'provider':'speechace','configured':bool(key) and region in REGIONS,'region':region,'mode':'local_pilot'}
def fields(item):
    if item.kind == 'speech':
        return 'speech', {'relevance_context':item.text.strip(), 'include_ielts_feedback':'1', 'pronunciation_score_mode':'default'}
    return 'text', {'text':item.text.strip()}
async def vendor_call(base, endpoint, key, data, audio):
    async with httpx.AsyncClient(timeout=60, follow_redirects=False) as client:
        response = await client.post(base + '/api/scoring/' + endpoint + '/v9/json', params={'key':key,'dialect':'en-us'}, data=data, files={'user_audio_file':('recording.wav',audio,'audio/wav')})
        response.raise_for_status()
        return response.json()
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
    if not item.text.strip() or (item.kind == 'word' and len(item.text.split()) != 1):
        raise HTTPException(422, '单词题只能填写一个单词；多词请使用句子题。')
    audio, duration = validate_audio(item.audio)
    if item.kind != 'speech' and duration > 30:
        raise HTTPException(422, '本试点词句朗读限 30 秒，请缩短录音。')
    key, region = config()
    if not key:
        raise HTTPException(503, 'Speechace 尚未配置 API Key，请配置后端 SPEECHACE_API_KEY 后重试。')
    if region not in REGIONS:
        raise HTTPException(503, 'Speechace 区域配置无效，请使用 us、sg、eu 或 in。')
    endpoint, data = fields(item)
    try:
        raw = await vendor_call(REGIONS[region], endpoint, key, data, audio)
    except httpx.TimeoutException:
        raise HTTPException(504, 'Speechace 响应超时，请稍后重试。')
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, 'Speechace 请求失败，请检查密钥所属区域、套餐权限和额度。')
    if not isinstance(raw, dict) or raw.get('status') != 'success':
        raise HTTPException(502, 'Speechace 未完成评分，请检查录音、套餐权限和额度。')
    result = raw.get('speech_score' if endpoint == 'speech' else 'text_score')
    if not isinstance(result, dict) or not result:
        raise HTTPException(502, 'Speechace 未返回有效评测结果。')
    metrics = result.get('speechace_score')
    if not isinstance(metrics, dict):
        score = result.get('quality_score')
        metrics = {'pronunciation':score} if isinstance(score,(int,float)) else {}
    return {'id':str(uuid4()),'provider':'speechace','kind':item.kind,'text':item.text.strip(),'duration':duration,'result':result,'metrics':metrics,'scale':'Speechace 0–100；其他量表见原始反馈','qualification':'human_review_required'}
