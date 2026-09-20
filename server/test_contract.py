from fastapi.testclient import TestClient
from main import app,fixture
client=TestClient(app)
def test_same_assignment_and_separate_assessment():
    teacher=client.get('/api/v1/me').json()['data']
    enrollment=client.get('/api/v1/enrollments').json()['data'][0]
    assert enrollment['teacher_id']==teacher['id']
    response=client.get(f"/api/v1/enrollments/{enrollment['id']}/progress")
    data=response.json()['data']
    assert data['course_version_id']==enrollment['course_version_id']
    assert {p['part_key'] for p in data['parts']}=={'orientation','practice'}
    assert all(p['assessment_state']=='not_evaluated' for p in data['parts'])
    assert all(p['progress_percent'] is None for p in data['parts'])
def test_unknown_assignment_and_invalid_uuid():
    for id,status in [('99999999-9999-4999-8999-999999999999',404),('bad-id',422)]:
        r=client.get(f'/api/v1/enrollments/{id}/progress')
        assert r.status_code==status
        assert r.json()['error']['retryable'] is False
        assert r.json()['request_id']
def test_no_client_pass_write():
    r=client.post(f"/api/v1/enrollments/{fixture['enrollment']['id']}/progress",json={'assessment_state':'passed'})
    assert r.status_code==405
