"""Integration tests use an explicitly supplied, disposable local PostgreSQL cluster.
SpeechSuper and SMTP are replaced with deterministic test doubles; no paid calls.
"""
import base64
import io
import math
import os
from pathlib import Path
import struct
import unittest
from uuid import uuid4
import wave

import psycopg
from fastapi.testclient import TestClient
from production.app import create_app, COOKIE
from production.database import Database
from production.security import password_hash, password_matches, otp_digest
from production.scoring import calculate

ORIGIN = 'https://training.test'
PASSWORD = 'test-only-strong-password'
VERSION = 'ft-target-words-v2-round-v1-grammar-20260920'


def recording():
    out = io.BytesIO()
    with wave.open(out,'wb') as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(16000)
        wav.writeframes(b''.join(struct.pack('<h', int(8000*math.sin(i/10))) for i in range(16000)))
    return base64.b64encode(out.getvalue()).decode()


class SecurityTests(unittest.TestCase):
    def test_password_hash(self):
        value = password_hash(PASSWORD)
        self.assertNotIn(PASSWORD,value)
        self.assertTrue(password_matches(PASSWORD,value))
        self.assertFalse(password_matches('wrong',value))
        self.assertFalse(password_matches(PASSWORD,'scrypt$999999999$8$1$AA$AA'))
        self.assertNotEqual(value,password_hash(PASSWORD))

    def test_otp_is_bound_to_challenge(self):
        self.assertNotEqual(otp_digest('secret','a','123456'),otp_digest('secret','b','123456'))

    def test_formula_rejects_missing_values(self):
        self.assertEqual(calculate('word',{'pronunciation':79.95}),80)
        self.assertEqual(calculate('sentence',{'pronunciation':100,'fluency':100,'rhythm':100,'integrity':50}),50)
        for metrics in ({},{'pronunciation':True},{'pronunciation':float('nan')},{'pronunciation':101}):
            with self.assertRaises(ValueError): calculate('word',metrics)


@unittest.skipUnless(os.getenv('FT_TEST_DATABASE_URL'),'isolated PostgreSQL URL required')
class RuntimeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = Database(os.environ['FT_TEST_DATABASE_URL'])
        with cls.db.transaction() as db:
            for migration in sorted((Path(__file__).parents[1]/'migrations').glob('*.sql')):
                db.execute(migration.read_text())

    def setUp(self):
        self.calls = []
        self.mail = []
        self.metrics = {'pronunciation':100,'fluency':100,'rhythm':100,'integrity':100}
        async def provider(core,params,audio):
            self.calls.append(core)
            return {'result':self.metrics}
        self.config = {'APP_ORIGIN':ORIGIN,'SPEECHSUPER_APP_KEY':'test','SPEECHSUPER_SECRET_KEY':'test','SPEECHSUPER_TRIAL_EXPIRES_AT':'2099-01-01T00:00:00Z',
          'OTP_SECRET':'test-secret-do-not-use','SMTP_HOST':'test.invalid','SMTP_USER':'test','SMTP_PASSWORD':'test','SMTP_FROM':'test@example.invalid'}
        self.app = create_app(self.config,self.db,lambda config,email,code:self.mail.append((email,code)),provider)
        self.client = TestClient(self.app,base_url=ORIGIN)
        self.client.headers['origin'] = ORIGIN
        self.teacher, self.enrollment, self.email = str(uuid4()), str(uuid4()), str(uuid4())+'@example.invalid'
        with self.db.transaction() as db:
            db.execute('INSERT INTO ft_training.teachers(id,email,active,is_test_account,password_hash) VALUES(%s,%s,true,true,%s)',(self.teacher,self.email,password_hash(PASSWORD)))
            db.execute('INSERT INTO ft_training.enrollments(id,teacher_id,content_version) VALUES(%s,%s,%s)',(self.enrollment,self.teacher,VERSION))
            # Each test gets independent IP rate-limit identity.
        self.client = TestClient(self.app,base_url=ORIGIN,client=(self.teacher,50000))
        self.client.headers['origin']=ORIGIN

    def login(self):
        r = self.client.post('/api/v1/auth/password',json={'email':self.email,'password':PASSWORD})
        self.assertEqual(r.status_code,200,r.text)
        return r

    def start(self,stage):
        r=self.client.post(f'/api/v1/enrollments/{self.enrollment}/stages/{stage}/round',json={})
        self.assertEqual(r.status_code,200,r.text)
        return r.json()['data']

    def finish_reading(self,stage):
        data=self.start(stage)
        for q in data['items']:
            r=self.client.post(f"/api/v1/speech/rounds/{data['id']}/assessments",json={'question_id':q['id'],'client_submission_id':str(uuid4()),'audio':recording(),'active_duration_ms':1500})
            self.assertEqual(r.status_code,200,r.text)
            self.assertEqual(r.json()['data']['score'],100,r.text)
        return data

    def grammar(self,round_record,correct):
        q=round_record['question']
        with self.db.transaction() as db:
            answer=db.execute('SELECT correct_option FROM ft_training.grammar_questions WHERE content_version=%s AND id=%s',(VERSION,q['id'])).fetchone()['correct_option']
        body={'question_id':q['id'],'selected_option':answer if correct else 1-answer,'active_duration_ms':2000,'client_submission_id':str(uuid4())}
        response=self.client.post(f"/api/v1/grammar/rounds/{round_record['id']}/answers",json=body)
        self.assertEqual(response.status_code,200,response.text)
        return response.json()['data']['round'],body

    def test_01_auth_csrf_ownership_logout(self):
        self.assertEqual(self.client.get('/api/v1/me').status_code,401)
        response=self.login()
        self.assertIn('HttpOnly',response.headers['set-cookie']); self.assertIn('Secure',response.headers['set-cookie'])
        self.assertEqual(self.client.get('/api/v1/me').json()['data']['id'],self.teacher)
        self.assertEqual(self.client.get(f'/api/v1/enrollments/{uuid4()}/progress').status_code,404)
        self.assertEqual(self.client.post('/api/v1/auth/logout',headers={'origin':'https://evil.test'},json={}).status_code,403)
        self.client.post('/api/v1/auth/logout',json={})
        self.assertEqual(self.client.get('/api/v1/me').status_code,401)

    def test_02_stage_lock_resume_and_idempotency(self):
        self.login()
        r=self.client.post(f'/api/v1/enrollments/{self.enrollment}/stages/sentence/round',json={})
        self.assertEqual(r.status_code,403)
        data=self.start('word'); self.assertEqual(len(data['items']),30)
        self.assertEqual(data['id'],self.start('word')['id'])
        body={'question_id':data['items'][0]['id'],'client_submission_id':str(uuid4()),'audio':recording(),'active_duration_ms':1500}
        path=f"/api/v1/speech/rounds/{data['id']}/assessments"
        first=self.client.post(path,json=body); second=self.client.post(path,json=body)
        self.assertEqual(first.status_code,200,first.text); self.assertEqual(second.status_code,200,second.text)
        self.assertEqual(first.json()['data']['id'],second.json()['data']['id']); self.assertEqual(len(self.calls),1)
        attacker=TestClient(self.app,base_url=ORIGIN); attacker.headers['origin']=ORIGIN
        self.assertEqual(attacker.post(path,json=body).status_code,401)
        with self.db.transaction() as db:
            row=db.execute('SELECT status,score,active_duration_ms FROM ft_training.speech_assessments WHERE client_submission_id=%s',(body['client_submission_id'],)).fetchone()
        self.assertEqual(row,{'status':'scored','score':100,'active_duration_ms':1500})

    def test_03_three_stages_pass_and_restart_failure(self):
        self.login(); self.finish_reading('word'); self.finish_reading('sentence')
        data=self.start('grammar'); original=data['id']
        self.assertNotIn('correct_option',str(data))
        for _ in range(7): data,_=self.grammar(data,False)
        self.assertEqual(data['status'],'failed'); self.assertIsNone(data['question'])
        data=self.start('grammar'); self.assertNotEqual(data['id'],original)
        with self.db.transaction() as db:
            orders=db.execute('SELECT question_order FROM ft_training.grammar_rounds WHERE enrollment_id=%s ORDER BY created_at',(self.enrollment,)).fetchall()
        self.assertNotEqual(orders[0],orders[1])
        for index in range(30): data,body=self.grammar(data,index>=6)
        self.assertEqual(data['status'],'passed')
        replay=self.client.post(f"/api/v1/grammar/rounds/{data['id']}/answers",json=body)
        self.assertEqual(replay.status_code,200)
        with self.db.transaction() as db:
            row=db.execute('SELECT completed_at FROM ft_training.enrollments WHERE id=%s',(self.enrollment,)).fetchone()
            count=db.execute('SELECT count(*) AS n FROM ft_training.grammar_answers WHERE round_id=%s',(data['id'],)).fetchone()['n']
        self.assertIsNotNone(row['completed_at']); self.assertEqual(count,30)
        self.assertEqual(self.start('grammar')['status'],'passed')

    def test_04_otp_failures_and_replay(self):
        r=self.client.post('/api/v1/auth/email',json={'email':self.email})
        self.assertEqual(r.status_code,200,r.text)
        challenge=r.json()['data']['challenge_id']; code=self.mail[0][1]
        wrong='000000' if code!='000000' else '111111'
        r=self.client.post('/api/v1/auth/verify',json={'challenge_id':challenge,'code':wrong}); self.assertEqual(r.status_code,401)
        with self.db.transaction() as db:
            row=db.execute('SELECT failed_attempts,code_digest FROM ft_training.login_challenges WHERE id=%s',(challenge,)).fetchone()
        self.assertEqual(row['failed_attempts'],1); self.assertNotEqual(row['code_digest'],code)
        r=self.client.post('/api/v1/auth/verify',json={'challenge_id':challenge,'code':code}); self.assertEqual(r.status_code,200,r.text)
        r=self.client.post('/api/v1/auth/verify',json={'challenge_id':challenge,'code':code}); self.assertEqual(r.status_code,401)

    def test_05_technical_failure_is_not_wrong_score(self):
        self.login(); data=self.start('word'); self.metrics={}
        r=self.client.post(f"/api/v1/speech/rounds/{data['id']}/assessments",json={'question_id':data['items'][0]['id'],'client_submission_id':str(uuid4()),'audio':recording(),'active_duration_ms':1500})
        self.assertEqual(r.status_code,200,r.text); self.assertEqual(r.json()['data']['status'],'failed'); self.assertIsNone(r.json()['data']['score'])
        current=self.start('word'); self.assertTrue(all(item['wrong_count']==0 for item in current['items']))

    def test_06_feedback_and_replay(self):
        self.login(); body={'enrollment_id':self.enrollment,'client_submission_id':str(uuid4()),'page_path':'/practice','content':'Test feedback'}
        a=self.client.post('/api/v1/feedback',json=body); b=self.client.post('/api/v1/feedback',json=body)
        self.assertEqual(a.status_code,200,a.text); self.assertEqual(a.json()['data'],b.json()['data'])
        body['content']='Different payload'; self.assertEqual(self.client.post('/api/v1/feedback',json=body).status_code,409)

    def test_07_two_authenticated_teachers_are_isolated(self):
        self.login(); data=self.start('word')
        other_id,other_enrollment=str(uuid4()),str(uuid4())
        with self.db.transaction() as db:
            db.execute('INSERT INTO ft_training.teachers(id,email,active,is_test_account,password_hash) VALUES(%s,%s,true,true,%s)',(other_id,other_id+'@example.invalid',password_hash(PASSWORD)))
            db.execute('INSERT INTO ft_training.enrollments(id,teacher_id,content_version) VALUES(%s,%s,%s)',(other_enrollment,other_id,VERSION))
        other=TestClient(self.app,base_url=ORIGIN,client=(other_id,50001));other.headers['origin']=ORIGIN
        self.assertEqual(other.post('/api/v1/auth/password',json={'email':other_id+'@example.invalid','password':PASSWORD}).status_code,200)
        self.assertEqual(other.get(f'/api/v1/enrollments/{self.enrollment}/progress').status_code,404)
        self.assertEqual(other.post(f"/api/v1/speech/rounds/{data['id']}/assessments",json={'question_id':data['items'][0]['id'],'client_submission_id':str(uuid4()),'audio':recording(),'active_duration_ms':1000}).status_code,404)
        self.assertEqual(len(self.calls),0)
        self.assertEqual(len(other.get('/api/v1/enrollments').json()['data']),1)
        self.assertEqual(other.get('/api/v1/enrollments').json()['data'][0]['id'],other_enrollment)

    def test_08_provider_expiry_and_global_concurrency_limit(self):
        self.login();data=self.start('word')
        body={'question_id':data['items'][0]['id'],'client_submission_id':str(uuid4()),'audio':recording(),'active_duration_ms':1000}
        with self.db.transaction() as db:
            db.execute("UPDATE ft_training.provider_slots SET lease_expires_at=now()+interval '120 seconds'")
        try:
            r=self.client.post(f"/api/v1/speech/rounds/{data['id']}/assessments",json=body)
            self.assertEqual(r.status_code,429,r.text);self.assertEqual(len(self.calls),0)
        finally:
            with self.db.transaction() as db: db.execute('UPDATE ft_training.provider_slots SET lease_expires_at=NULL')
        expired=dict(self.config);expired['SPEECHSUPER_TRIAL_EXPIRES_AT']='2000-01-01T00:00:00Z'
        client=TestClient(create_app(expired,self.db),base_url=ORIGIN);client.headers['origin']=ORIGIN;client.cookies.update(self.client.cookies)
        self.assertEqual(client.post(f"/api/v1/speech/rounds/{data['id']}/assessments",json=body).status_code,503)

    def test_09_otp_locks_after_five_errors(self):
        r=self.client.post('/api/v1/auth/email',json={'email':self.email})
        challenge=r.json()['data']['challenge_id'];code=self.mail[0][1];wrong='000000' if code!='000000' else '111111'
        for _ in range(5): self.assertEqual(self.client.post('/api/v1/auth/verify',json={'challenge_id':challenge,'code':wrong}).status_code,401)
        self.assertEqual(self.client.post('/api/v1/auth/verify',json={'challenge_id':challenge,'code':code}).status_code,401)
        with self.db.transaction() as db:
            self.assertEqual(db.execute('SELECT failed_attempts FROM ft_training.login_challenges WHERE id=%s',(challenge,)).fetchone()['failed_attempts'],5)

    def test_10_extra_score_and_boolean_answer_are_rejected(self):
        self.login()
        r=self.client.post(f'/api/v1/grammar/rounds/{uuid4()}/answers',json={'question_id':'q','client_submission_id':str(uuid4()),'selected_option':True,'active_duration_ms':100})
        self.assertEqual(r.status_code,422)
        r=self.client.post(f'/api/v1/speech/rounds/{uuid4()}/assessments',json={'question_id':'q','client_submission_id':str(uuid4()),'audio':recording(),'active_duration_ms':100,'score':100})
        self.assertEqual(r.status_code,422)

    def test_07_no_mock_fallback_when_database_unconfigured(self):
        with TestClient(create_app({'APP_ORIGIN':ORIGIN}),base_url=ORIGIN) as client:
            self.assertEqual(client.get('/api/v1/me').status_code,503)


if __name__=='__main__': unittest.main()
