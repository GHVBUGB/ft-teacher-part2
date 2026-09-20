import base64
import io
import json
import math
import struct
import wave
import httpx
from fastapi.testclient import TestClient
from main import app
from practice import speechsuper as ss
client = TestClient(app)
def recording(silent=False):
    b = io.BytesIO()
    with wave.open(b, 'wb') as w:
        w.setparams((1,2,16000,0,'NONE','not compressed'))
        w.writeframes(b''.join(struct.pack('<h', 0 if silent else int(4000*math.sin(i/10))) for i in range(16000)))
    return base64.b64encode(b.getvalue()).decode()
def data(kind='word', text='apple', silent=False):
    return {'kind':kind, 'text':text, 'audio':recording(silent)}
def test_missing_keys(monkeypatch):
    monkeypatch.delenv('SPEECHSUPER_APP_KEY', raising=False); monkeypatch.delenv('SPEECHSUPER_SECRET_KEY', raising=False)
    assert not client.get('/api/speechsuper/status').json()['configured']
    r=client.post('/api/speechsuper/assess',json=data()); assert r.status_code==503
    assert 'result' not in r.json()
def test_silence_and_bad_input():
    assert client.post('/api/speechsuper/assess',json=data(silent=True)).status_code==422
    assert client.post('/api/speechsuper/assess',json=data(text='two words')).status_code==422
    assert client.post('/api/speechsuper/assess',json={**data(),'audio':'not audio'}).status_code==422
    assert client.post('/api/speechsuper/assess',json=data(),headers={'Origin':'https://evil.example'}).status_code==403

def test_signed_mapping_and_vendor_result(monkeypatch):
    monkeypatch.setenv('SPEECHSUPER_APP_KEY','test-app');monkeypatch.setenv('SPEECHSUPER_SECRET_KEY','test-secret')
    seen=[]
    async def fake(core,params,audio):
        seen.append((core,params))
        assert audio[:4]==b'RIFF'
        return {'result':{'overall':61,'details':[{'char':'apple','score':61}]}}
    monkeypatch.setattr(ss,'vendor_call',fake)
    for kind,text,core in [('word','apple','word.eval.promax'),('sentence','This is an apple.','sent.eval.promax'),('speech','Explain an apple to a child.','speak.eval.pro')]:
        r=client.post('/api/speechsuper/assess',json=data(kind,text)); assert r.status_code==200
        assert r.json()['result']['overall']==61 and 'passed' not in r.json()
        assert seen[-1][0]==core
        req=seen[-1][1]['start']['param']['request']
        assert req['question_prompt' if kind=='speech' else 'refText']==text
        assert 'test-secret' not in json.dumps(seen[-1][1])
        assert 'test-app' not in r.text

def test_upstream_errors_never_score(monkeypatch):
    monkeypatch.setenv('SPEECHSUPER_APP_KEY','test');monkeypatch.setenv('SPEECHSUPER_SECRET_KEY','secret')
    for value in ({'error':'bad key'},{'errId':100},{'result':{}},{'result':None}):
        async def fake(*args): return value
        monkeypatch.setattr(ss,'vendor_call',fake)
        assert client.post('/api/speechsuper/assess',json=data()).status_code==502
    async def timeout(*args): raise httpx.ReadTimeout('timeout')
    monkeypatch.setattr(ss,'vendor_call',timeout)
    assert client.post('/api/speechsuper/assess',json=data()).status_code==504

def test_transport_errors_are_distinguished_without_leaking_secrets(monkeypatch, caplog):
    monkeypatch.setenv('SPEECHSUPER_APP_KEY','test');monkeypatch.setenv('SPEECHSUPER_SECRET_KEY','secret')
    request = httpx.Request('POST', 'https://api.speechsuper.com/word.eval.promax')
    response = httpx.Response(503, request=request)
    cases = [(httpx.ConnectError('sensitive-transport-detail'), '网络'),
             (httpx.HTTPStatusError('sensitive-transport-detail', request=request, response=response), 'HTTP 503'),
             (ValueError('sensitive-transport-detail'), '格式异常')]
    for error, expected in cases:
        async def fake(*args): raise error
        monkeypatch.setattr(ss, 'vendor_call', fake)
        result = client.post('/api/speechsuper/assess', json=data())
        assert result.status_code == 502 and expected in result.json()['error']['message']
        assert 'sensitive-transport-detail' not in result.text + caplog.text


def test_vendor_rejection_code_does_not_expose_secret(monkeypatch):
    monkeypatch.setenv('SPEECHSUPER_APP_KEY', 'test-app')
    monkeypatch.setenv('SPEECHSUPER_SECRET_KEY', 'test-secret')
    async def rejected(*args):
        return {'errId': 1001, 'error': 'test-secret rejected'}
    monkeypatch.setattr(ss, 'vendor_call', rejected)
    response = client.post('/api/speechsuper/assess', json=data())
    assert response.status_code == 502
    assert '1001' in response.json()['error']['message']
    assert 'test-secret' not in response.text
