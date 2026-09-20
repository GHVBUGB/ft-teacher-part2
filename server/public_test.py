"""Temporary public demo gateway. Serves built assets and only SpeechSuper routes.

Run explicitly on loopback port 8088 behind an HTTPS tunnel, without proxy headers.
The existing backend and its credentials remain local and unmodified.
"""
import asyncio
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from starlette.middleware.gzip import GZipMiddleware

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(GZipMiddleware, minimum_size=1024)
ROOT = (Path(__file__).resolve().parent.parent / 'work/public-test/dist').resolve()
slots = asyncio.Semaphore(2)
recent = deque()
# Stop supplier calls when the currently verified free trial expires.
TRIAL_END = datetime(2026, 9, 22, 16, tzinfo=timezone.utc).timestamp()


def error(status, message):
    return JSONResponse({'error': {'message': message}}, status_code=status)


@app.middleware('http')
async def headers(request, call_next):
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'same-origin'
    response.headers['X-Robots-Tag'] = 'noindex, nofollow'
    response.headers['Permissions-Policy'] = 'microphone=(self), camera=()'
    return response


@app.get('/api/speechsuper/status')
async def status():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get('http://127.0.0.1:8000/api/speechsuper/status')
        return JSONResponse(r.json(), status_code=r.status_code)
    except httpx.HTTPError:
        return error(503, '测试服务暂时离线，请稍后重试。')


@app.post('/api/speechsuper/assess')
async def assess(request: Request):
    if time.time() >= TRIAL_END:
        return error(503, '本次免费试用已结束。')
    origin = request.headers.get('origin')
    expected = 'https://' + request.headers.get('host', '')
    if origin and origin != expected:
        return error(403, '请从本测试网站提交录音。')
    if request.headers.get('content-type', '').split(';')[0] != 'application/json':
        return error(415, '请上传有效录音。')
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 5_300_000:
            return error(413, '录音文件过大，请缩短录音。')
    now = time.monotonic()
    while recent and recent[0] < now - 60:
        recent.popleft()
    if len(recent) >= 60 or slots.locked():
        return error(429, '当前正在评测的用户较多，请稍后重试；录音仍保留。')
    recent.append(now)
    async with slots:
        try:
            async with httpx.AsyncClient(timeout=70) as client:
                r = await client.post('http://127.0.0.1:8000/api/speechsuper/assess',
                                      content=bytes(body), headers={'Content-Type': 'application/json'})
            return JSONResponse(r.json(), status_code=r.status_code)
        except (httpx.HTTPError, ValueError):
            return error(503, '测试评测服务暂时离线，请稍后重试。')


@app.get('/{path:path}')
async def static(path: str):
    if path.startswith('api/') or any(part.startswith('.') for part in path.split('/')):
        return error(404, 'Not found')
    target = (ROOT / path).resolve()
    if not target.is_relative_to(ROOT):
        return error(404, 'Not found')
    if target.is_file():
        cache = 'public, max-age=31536000, immutable' if path.startswith('assets/') else 'public, max-age=3600'
        return FileResponse(target, headers={'Cache-Control': cache})
    if path == '' or path.startswith('training/'):
        return FileResponse(ROOT / 'index.html', headers={'Cache-Control': 'no-store'})
    return error(404, 'Not found')
