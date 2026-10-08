from fastapi.testclient import TestClient

from main import app
from practice import tencent as tc
from test_speechsuper import data

client = TestClient(app)


def test_unconfigured_and_unsupported_speech(monkeypatch):
    for name in ('TENCENT_SOE_APP_ID', 'TENCENT_SOE_SECRET_ID', 'TENCENT_SOE_SECRET_KEY'):
        monkeypatch.delenv(name, raising=False)
    assert client.get('/api/tencent/status').json()['configured'] is False
    assert client.post('/api/tencent/assess', json=data()).status_code == 503
    assert client.post('/api/tencent/assess', json=data('speech', 'Explain an apple.')).status_code == 422


def test_recording_result_is_normalized_without_leaking_credentials(monkeypatch):
    monkeypatch.setenv('TENCENT_SOE_APP_ID', 'test-app')
    monkeypatch.setenv('TENCENT_SOE_SECRET_ID', 'test-secret-id')
    monkeypatch.setenv('TENCENT_SOE_SECRET_KEY', 'test-secret-key')
    seen = []

    async def fake(url, audio):
        seen.append((url, audio))
        assert audio[:4] == b'RIFF'
        return [
            {
                'code': 0,
                'result': '{SuggestedScore:88.5 PronAccuracy:88.5 PronFluency:0.91 PronCompletion:0.98 Words:[{Word:apple PronAccuracy:88.5 MatchTag:0 PhoneInfos:[{ReferencePhone:ae PronAccuracy:80 MatchTag:0}]}]}',
            },
            {'code': 0, 'final': 1},
        ]

    monkeypatch.setattr(tc, 'vendor_call', fake)
    response = client.post('/api/tencent/assess', json=data())
    assert response.status_code == 200
    body = response.json()
    assert body['provider'] == 'tencent'
    assert body['metrics'] == {
        'pronunciation': 88.5,
        'fluency': 91.0,
        'completion': 98.0,
        'suggestedScore': 88.5,
    }
    assert body['result']['words'][0]['phonemes'][0]['pronunciation'] == 80
    assert body['result']['words'][0]['phonemes'][0]['matchTag'] == 0
    assert seen and 'test-secret-key' not in seen[0][0] + response.text


def test_upstream_error_is_not_scored(monkeypatch):
    monkeypatch.setenv('TENCENT_SOE_APP_ID', 'test-app')
    monkeypatch.setenv('TENCENT_SOE_SECRET_ID', 'test-secret-id')
    monkeypatch.setenv('TENCENT_SOE_SECRET_KEY', 'test-secret-key')

    async def rejected(*args):
        return [{'code': 4002, 'message': 'sensitive secret detail'}]

    monkeypatch.setattr(tc, 'vendor_call', rejected)
    response = client.post('/api/tencent/assess', json=data())
    assert response.status_code == 502
    assert '敏感' not in response.text
    assert 'test-secret' not in response.text
