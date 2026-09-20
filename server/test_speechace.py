from fastapi.testclient import TestClient
import httpx
from main import app
from practice import speechace as sa
from test_speechsuper import data
client=TestClient(app)
def test_unconfigured(monkeypatch):
    monkeypatch.delenv('SPEECHACE_API_KEY',raising=False)
    assert not client.get('/api/speechace/status').json()['configured']
    assert client.post('/api/speechace/assess',json=data()).status_code==503
    assert client.post('/api/speechace/assess',json=data(silent=True)).status_code==422

def test_routes_and_scales(monkeypatch):
    monkeypatch.setenv('SPEECHACE_API_KEY','test-secret');monkeypatch.setenv('SPEECHACE_REGION','sg')
    async def stub(base,endpoint,key,fields,audio):
        assert base=='https://api2.speechace.com' and key=='test-secret' and audio[:4]==b'RIFF'
        if endpoint=='speech':
            assert fields['relevance_context']=='Explain an apple.'
            assert fields['pronunciation_score_mode']=='default'
            return {'status':'success','speech_score':{'speechace_score':{'overall':71,'grammar':62},'ielts_score':{'overall':6},'relevance':{'class':'FALSE'}}}
        assert fields['text']=='apple'
        return {'status':'success','text_score':{'quality_score':83,'word_score_list':[]}}
    monkeypatch.setattr(sa,'vendor_call',stub)
    r=client.post('/api/speechace/assess',json=data());assert r.json()['metrics']['pronunciation']==83
    r=client.post('/api/speechace/assess',json=data('speech','Explain an apple.'))
    assert r.json()['metrics']['overall']==71 and r.json()['result']['ielts_score']['overall']==6
    assert 'passed' not in r.json() and 'test-secret' not in r.text

def test_failures(monkeypatch):
    monkeypatch.setenv('SPEECHACE_API_KEY','secret');monkeypatch.setenv('SPEECHACE_REGION','us')
    for value in ({'status':'error','detail_message':'secret'},{'status':'success','text_score':{}},{}):
        async def stub(*args):return value
        monkeypatch.setattr(sa,'vendor_call',stub)
        r=client.post('/api/speechace/assess',json=data());assert r.status_code==502 and 'secret' not in r.text
    async def timeout(*args):raise httpx.ReadTimeout('secret')
    monkeypatch.setattr(sa,'vendor_call',timeout)
    assert client.post('/api/speechace/assess',json=data()).status_code==504
    monkeypatch.setenv('SPEECHACE_REGION','invalid')
    assert client.post('/api/speechace/assess',json=data()).status_code==503
