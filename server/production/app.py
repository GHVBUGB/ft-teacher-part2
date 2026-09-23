"""Authenticated PostgreSQL API. Run explicitly: uvicorn production.app:app.

It does not mount the old localhost pilot or mock identity endpoints.
"""
import hmac
import asyncio
import os
import secrets
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage
from uuid import UUID, uuid4

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ConfigDict, Field
from psycopg.types.json import Jsonb
from .database import Database, one, rows, lock, allow_request
from .security import token_digest, password_matches, password_hash, otp_digest
from .scoring import calculate
from .grammar import new_round, GrammarRound, ExamError
from practice.speechsuper import Assessment, validate_audio, payload, vendor_call

COOKIE = '__Host-ft_session'
DUMMY_HASH = password_hash(secrets.token_urlsafe(24))


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)


class Login(Input):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class EmailInput(Input):
    email: str = Field(min_length=3, max_length=254)


class Verify(Input):
    challenge_id: str
    code: str = Field(pattern=r'^\d{6}$')


class Submission(Input):
    client_submission_id: str
    question_id: str = Field(min_length=1, max_length=150)
    # Client-reported effective time is recorded separately from server timestamps.
    active_duration_ms: int = Field(ge=0, le=7_200_000)


class GrammarSubmission(Submission):
    selected_option: int = Field(ge=0, le=1)


class SpeechSubmission(Submission):
    audio: str = Field(min_length=1, max_length=5_200_000)


class Feedback(Input):
    enrollment_id: str
    client_submission_id: str
    page_path: str = Field(min_length=1, max_length=500)
    content: str = Field(min_length=1, max_length=5000)


def uid(value):
    try:
        return str(UUID(value))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(422, 'INVALID_ID')


def result(data):
    return {'data': data, 'request_id': str(uuid4())}


def send_code(config, email, code):
    message = EmailMessage()
    message['From'] = config['SMTP_FROM']
    message['To'] = email
    message['Subject'] = 'FT teacher training verification code'
    message.set_content(f'Your verification code is {code}. It expires in 5 minutes. If you did not request it, ignore this email.')
    with smtplib.SMTP_SSL(config['SMTP_HOST'], int(config.get('SMTP_PORT', '465')), timeout=15) as smtp:
        smtp.login(config['SMTP_USER'], config['SMTP_PASSWORD'])
        smtp.send_message(message)


def create_app(config=None, database=None, mailer=send_code, assessor=vendor_call):
    config = dict(os.environ if config is None else config)
    db = database
    application = FastAPI(title='FT Teacher Training API', docs_url=None, redoc_url=None, openapi_url=None)

    def database_ready():
        nonlocal db
        if db is None:
            if not config.get('DATABASE_URL'):
                raise HTTPException(503, 'DATABASE_NOT_CONFIGURED')
            db = Database(config['DATABASE_URL'])
        return db

    @application.exception_handler(HTTPException)
    async def http_error(request, exc):
        return JSONResponse(status_code=exc.status_code, content={'error': {'code': str(exc.detail), 'message': str(exc.detail), 'retryable': exc.status_code in (429,502,503,504)}, 'request_id': str(uuid4())})

    @application.exception_handler(RequestValidationError)
    async def invalid(request, exc):
        # Do not echo submitted passwords, codes or recordings in validation errors.
        return JSONResponse(status_code=422, content={'error': {'code':'INVALID_REQUEST','message':'Invalid request parameters','retryable':False},'request_id':str(uuid4())})

    @application.middleware('http')
    async def boundary(request, call_next):
        origin = config.get('APP_ORIGIN', '').rstrip('/')
        if request.method not in ('GET','HEAD','OPTIONS'):
            if not origin or request.headers.get('origin') != origin:
                return JSONResponse(status_code=403, content={'error': {'code':'ORIGIN_DENIED','message':'Request origin denied','retryable':False}})
            if not request.headers.get('content-type','').startswith('application/json'):
                return JSONResponse(status_code=415, content={'error': {'code':'JSON_REQUIRED'}})
            # Bound actual received data, not just attacker-controlled Content-Length.
            data = bytearray()
            async for chunk in request.stream():
                data.extend(chunk)
                if len(data) > 5_300_000:
                    return JSONResponse(status_code=413,content={'error': {'code':'BODY_TOO_LARGE'}})
            request._body = bytes(data)
        try:
            response = await call_next(request)
        except Exception:
            # Correlation ID only: never log DB URLs, query values or vendor signatures.
            response = JSONResponse(status_code=503, content={'error': {'code':'SERVICE_UNAVAILABLE','message':'Service temporarily unavailable','retryable':True},'request_id':str(uuid4())})
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    def actor(connection, request):
        token = request.cookies.get(COOKIE, '')
        if not token or len(token) > 200:
            raise HTTPException(401, 'LOGIN_REQUIRED')
        teacher = one(connection, '''SELECT t.id,t.external_id,t.email,t.is_test_account FROM ft_training.sessions s
          JOIN ft_training.teachers t ON t.id=s.teacher_id
          WHERE s.token_hash=%s AND s.revoked_at IS NULL AND s.expires_at>now() AND t.active''', (token_digest(token),))
        if not teacher:
            raise HTTPException(401,'LOGIN_REQUIRED')
        return teacher

    def enrollment(connection, teacher, enrollment_id):
        item = one(connection, 'SELECT * FROM ft_training.enrollments WHERE id=%s AND teacher_id=%s FOR UPDATE', (uid(enrollment_id),teacher['id']))
        if not item:
            raise HTTPException(404,'NOT_FOUND')
        return item

    def session(connection, teacher_id, response):
        token = secrets.token_urlsafe(32)
        connection.execute('INSERT INTO ft_training.sessions(token_hash,teacher_id,expires_at) VALUES(%s,%s,now()+interval \'8 hours\')', (token_digest(token),teacher_id))
        response.set_cookie(COOKIE,token,secure=True,httponly=True,samesite='strict',max_age=28800,path='/')

    def limit(scope, subject, maximum, seconds):
        # Separate commit: denied/failed logins must still consume the rate budget.
        with database_ready().transaction() as connection:
            allowed = allow_request(connection,scope,token_digest(subject),maximum,seconds)
        if not allowed:
            raise HTTPException(429,'RATE_LIMITED')

    @application.get('/api/v1/health')
    def health():
        with database_ready().transaction() as connection:
            version = one(connection,'SELECT max(version) AS version FROM ft_training.schema_versions')['version']
        if not version or version < 9:
            raise HTTPException(503,'MIGRATION_REQUIRED')
        return result({'database':'connected','schema_version':version})

    @application.post('/api/v1/auth/password')
    def login(body: Login, request: Request, response: Response):
        email = body.email.strip().lower()
        limit('login-email',email,10,900)
        limit('login-ip',request.client.host if request.client else 'unknown',60,900)
        with database_ready().transaction() as connection:
            teacher = one(connection,'SELECT * FROM ft_training.teachers WHERE email=%s',(email,))
            valid = password_matches(body.password, teacher['password_hash'] if teacher and teacher.get('password_hash') else DUMMY_HASH)
            if not teacher or not teacher['active'] or not valid:
                raise HTTPException(401,'INVALID_CREDENTIALS')
            session(connection,teacher['id'],response)
        return result({'authenticated':True})

    @application.post('/api/v1/auth/email')
    def email_code(body: EmailInput, request: Request):
        if not all(config.get(k) for k in ('SMTP_HOST','SMTP_FROM','SMTP_USER','SMTP_PASSWORD','OTP_SECRET')):
            raise HTTPException(503,'EMAIL_NOT_CONFIGURED')
        email = body.email.strip().lower()
        limit('otp-email',email,10,86400)
        limit('otp-ip',request.client.host if request.client else 'unknown',30,3600)
        challenge_id = str(uuid4())
        with database_ready().transaction() as connection:
            teacher = one(connection,'SELECT * FROM ft_training.teachers WHERE email=%s AND active FOR UPDATE',(email,))
            if teacher:
                recent = one(connection,"SELECT id FROM ft_training.login_challenges WHERE teacher_id=%s AND created_at>now()-interval '60 seconds' LIMIT 1",(teacher['id'],))
                if recent:
                    raise HTTPException(429,'WAIT_BEFORE_RESEND')
                code = f'{secrets.randbelow(1_000_000):06d}'
                # Invalidate earlier challenges without marking them successfully used.
                connection.execute('UPDATE ft_training.login_challenges SET failed_attempts=max_attempts WHERE teacher_id=%s AND used_at IS NULL',(teacher['id'],))
                connection.execute("INSERT INTO ft_training.login_challenges(id,teacher_id,code_digest,expires_at) VALUES(%s,%s,%s,now()+interval '5 minutes')",(challenge_id,teacher['id'],otp_digest(config['OTP_SECRET'],challenge_id,code)))
                mailer(config,email,code)
        # Unknown/unapproved addresses receive no mail and are never enrolled.
        return result({'challenge_id':challenge_id,'message':'If this address is eligible, a code has been sent.'})

    @application.post('/api/v1/auth/verify')
    def verify(body: Verify, request: Request, response: Response):
        challenge_id = uid(body.challenge_id)
        limit('verify-ip',request.client.host if request.client else 'unknown',60,900)
        valid = False
        with database_ready().transaction() as connection:
            record = one(connection,'''SELECT c.*,t.active FROM ft_training.login_challenges c JOIN ft_training.teachers t ON t.id=c.teacher_id
              WHERE c.id=%s FOR UPDATE OF c''',(challenge_id,))
            if record and record['active'] and record['used_at'] is None and record['expires_at'] > datetime.now(timezone.utc) and record['failed_attempts'] < record['max_attempts']:
                valid = hmac.compare_digest(record['code_digest'],otp_digest(config.get('OTP_SECRET',''),challenge_id,body.code))
                if valid:
                    connection.execute('UPDATE ft_training.login_challenges SET used_at=now() WHERE id=%s',(challenge_id,))
                    session(connection,record['teacher_id'],response)
                else:
                    connection.execute('UPDATE ft_training.login_challenges SET failed_attempts=failed_attempts+1 WHERE id=%s',(challenge_id,))
        if not valid:
            raise HTTPException(401,'INVALID_OR_EXPIRED_CODE')
        return result({'authenticated':True})

    @application.post('/api/v1/auth/logout')
    def logout(request: Request, response: Response):
        with database_ready().transaction() as connection:
            connection.execute('UPDATE ft_training.sessions SET revoked_at=now() WHERE token_hash=%s',(token_digest(request.cookies.get(COOKIE,'')),))
        response.delete_cookie(COOKIE,path='/',secure=True,httponly=True,samesite='strict')
        return result({'authenticated':False})

    @application.get('/api/v1/me')
    def me(request: Request):
        with database_ready().transaction() as connection:
            return result(actor(connection,request))

    @application.get('/api/v1/enrollments')
    def assignments(request: Request):
        with database_ready().transaction() as connection:
            teacher = actor(connection,request)
            return result(rows(connection,'SELECT id,content_version,started_at,completed_at FROM ft_training.enrollments WHERE teacher_id=%s ORDER BY created_at DESC',(teacher['id'],)))

    def require_stage(connection, assignment, stage):
        rule = one(connection,'SELECT * FROM ft_training.assessment_rules WHERE content_version=%s AND stage=%s',(assignment['content_version'],stage))
        if not rule:
            raise HTTPException(409,'RULE_NOT_CONFIGURED')
        if rule['pass_percent'] != 80 or rule['question_count'] != {'word':30,'sentence':20,'grammar':30}[stage]:
            raise HTTPException(409,'UNSUPPORTED_RULE_VERSION')
        prerequisite = rule['settings'].get('prerequisite')
        if prerequisite and not one(connection,"SELECT id FROM ft_training.speech_rounds WHERE enrollment_id=%s AND stage=%s AND status='passed'",(assignment['id'],prerequisite)):
            raise HTTPException(403,'PREVIOUS_STAGE_REQUIRED')
        return rule

    def read_round(connection, round_record, stage):
        if stage == 'grammar':
            answers = rows(connection,'SELECT question_id,correct,selected_option,sequence,active_duration_ms FROM ft_training.grammar_answers WHERE round_id=%s ORDER BY sequence',(round_record['id'],))
            question = None
            if round_record['status'] == 'in_progress':
                question = one(connection,'SELECT id,prompt,option_a,option_b FROM ft_training.grammar_questions WHERE content_version=%s AND id=%s',(round_record['content_version'],round_record['question_order'][len(answers)]))
            return {'id':round_record['id'],'stage':stage,'status':round_record['status'],'total':len(round_record['question_order']),'answers':answers,'question':question}
        items = rows(connection,'''SELECT q.id,q.text,i.position,max(a.score) FILTER(WHERE a.status='scored') AS best_score,
            count(a.id) FILTER(WHERE a.status='scored' AND a.score<rule.pass_percent) AS wrong_count
          FROM ft_training.speech_round_items i JOIN ft_training.speech_questions q ON q.content_version=i.content_version AND q.id=i.item_id
          JOIN ft_training.assessment_rules rule ON rule.content_version=i.content_version AND rule.stage=i.stage
          LEFT JOIN ft_training.speech_assessments a ON a.round_id=i.round_id AND a.item_id=i.item_id
          WHERE i.round_id=%s GROUP BY q.id,q.text,i.position ORDER BY i.position''',(round_record['id'],))
        return {'id':round_record['id'],'stage':stage,'status':round_record['status'],'items':items}

    @application.post('/api/v1/enrollments/{enrollment_id}/stages/{stage}/round')
    def start(enrollment_id: str, stage: str, request: Request):
        if stage not in ('word','sentence','grammar'):
            raise HTTPException(404,'NOT_FOUND')
        with database_ready().transaction() as connection:
            teacher = actor(connection,request)
            assignment = enrollment(connection,teacher,enrollment_id)
            rule = require_stage(connection,assignment,stage)
            table = 'grammar_rounds' if stage == 'grammar' else 'speech_rounds'
            suffix = '' if stage == 'grammar' else ' AND stage=%s'
            args = (assignment['id'],) if stage == 'grammar' else (assignment['id'],stage)
            current = one(connection,f"SELECT * FROM ft_training.{table} WHERE enrollment_id=%s"+suffix+" AND status IN('in_progress','passed') ORDER BY created_at DESC LIMIT 1",args)
            if current:
                return result(read_round(connection,current,stage))
            round_id = str(uuid4())
            if stage == 'grammar':
                questions = rows(connection,'SELECT id FROM ft_training.grammar_questions WHERE content_version=%s ORDER BY id',(assignment['content_version'],))
                if len(questions) != 30 or rule['question_count'] != 30 or rule['pass_percent'] != 80:
                    raise HTTPException(409,'UNSUPPORTED_RULE_VERSION')
                previous = one(connection,'SELECT question_order FROM ft_training.grammar_rounds WHERE enrollment_id=%s ORDER BY created_at DESC LIMIT 1',(assignment['id'],))
                order = new_round(str(teacher['id']),tuple(q['id'] for q in questions),previous['question_order'] if previous else ()).order
                connection.execute('INSERT INTO ft_training.grammar_rounds(id,enrollment_id,teacher_id,content_version,question_order,active_duration_ms) VALUES(%s,%s,%s,%s,%s,0)',(round_id,assignment['id'],teacher['id'],assignment['content_version'],Jsonb(list(order))))
            else:
                questions = rows(connection,'SELECT id FROM ft_training.speech_questions WHERE content_version=%s AND kind=%s ORDER BY random() LIMIT %s',(assignment['content_version'],stage,rule['question_count']))
                if len(questions) != rule['question_count']:
                    raise HTTPException(409,'QUESTION_BANK_INCOMPLETE')
                connection.execute('INSERT INTO ft_training.speech_rounds(id,enrollment_id,teacher_id,content_version,stage,active_duration_ms) VALUES(%s,%s,%s,%s,%s,0)',(round_id,assignment['id'],teacher['id'],assignment['content_version'],stage))
                for position, question in enumerate(questions,1):
                    connection.execute('INSERT INTO ft_training.speech_round_items(round_id,content_version,stage,item_id,position) VALUES(%s,%s,%s,%s,%s)',(round_id,assignment['content_version'],stage,question['id'],position))
            connection.execute('UPDATE ft_training.enrollments SET started_at=coalesce(started_at,now()) WHERE id=%s',(assignment['id'],))
            return result(read_round(connection,one(connection,f'SELECT * FROM ft_training.{table} WHERE id=%s',(round_id,)),stage))

    @application.get('/api/v1/enrollments/{enrollment_id}/progress')
    def progress(enrollment_id: str, request: Request):
        with database_ready().transaction() as connection:
            assignment = enrollment(connection,actor(connection,request),enrollment_id)
            stages = rows(connection,'SELECT id,stage,status,active_duration_ms,created_at,finished_at FROM ft_training.speech_rounds WHERE enrollment_id=%s ORDER BY created_at',(assignment['id'],))
            stages += rows(connection,"SELECT id,'grammar' AS stage,status,active_duration_ms,created_at,finished_at FROM ft_training.grammar_rounds WHERE enrollment_id=%s ORDER BY created_at",(assignment['id'],))
            return result({'enrollment':assignment,'rounds':stages})

    @application.post('/api/v1/grammar/rounds/{round_id}/answers')
    def grammar_answer(round_id: str, body: GrammarSubmission, request: Request):
        round_id, submission = uid(round_id), uid(body.client_submission_id)
        with database_ready().transaction() as connection:
            teacher = actor(connection,request)
            current = one(connection,'SELECT * FROM ft_training.grammar_rounds WHERE id=%s AND teacher_id=%s FOR UPDATE',(round_id,teacher['id']))
            if not current:
                raise HTTPException(404,'NOT_FOUND')
            lock(connection,submission)
            previous = one(connection,'SELECT * FROM ft_training.grammar_answers WHERE client_submission_id=%s',(submission,))
            if previous:
                if str(previous['round_id']) != round_id or previous['question_id'] != body.question_id or previous['selected_option'] != body.selected_option:
                    raise HTTPException(409,'SUBMISSION_CONFLICT')
                return result({'correct':previous['correct'],'round':read_round(connection,current,'grammar')})
            if current['status'] != 'in_progress':
                raise HTTPException(409,'ROUND_FINISHED')
            answers = rows(connection,'SELECT question_id,selected_option,correct FROM ft_training.grammar_answers WHERE round_id=%s',(round_id,))
            state = GrammarRound(str(teacher['id']),tuple(current['question_order']),{a['question_id']:a['selected_option'] for a in answers},sum(a['correct'] for a in answers))
            question = one(connection,'SELECT correct_option FROM ft_training.grammar_questions WHERE content_version=%s AND id=%s',(current['content_version'],body.question_id))
            if not question:
                raise HTTPException(422,'INVALID_QUESTION')
            try:
                outcome = state.submit(str(teacher['id']),body.question_id,body.selected_option,{body.question_id:question['correct_option']})
            except ExamError as error:
                raise HTTPException(409,str(error))
            connection.execute('''INSERT INTO ft_training.grammar_answers(round_id,content_version,question_id,sequence,selected_option,correct,client_submission_id,active_duration_ms)
              VALUES(%s,%s,%s,%s,%s,%s,%s,%s)''',(round_id,current['content_version'],body.question_id,len(state.answers),body.selected_option,outcome['correct'],submission,body.active_duration_ms))
            status = 'passed' if outcome['passed'] else 'failed' if outcome['finished'] else 'in_progress'
            connection.execute("UPDATE ft_training.grammar_rounds SET status=%s,finished_at=CASE WHEN %s='in_progress' THEN NULL ELSE now() END,active_duration_ms=coalesce(active_duration_ms,0)+%s WHERE id=%s",(status,status,body.active_duration_ms,round_id))
            if outcome['passed']:
                connection.execute('UPDATE ft_training.enrollments SET completed_at=now() WHERE id=%s',(current['enrollment_id'],))
            current['status'] = status
            # No correct_option or explanation is disclosed on a wrong submission.
            return result({'correct':outcome['correct'],'round':read_round(connection,current,'grammar')})

    @application.post('/api/v1/speech/rounds/{round_id}/assessments')
    def speech_answer(round_id: str, body: SpeechSubmission, request: Request):
        round_id, submission = uid(round_id), uid(body.client_submission_id)
        # Authenticate before decoding a potentially large recording.
        with database_ready().transaction() as connection:
            teacher = actor(connection,request)
        limit('speech-teacher',str(teacher['id']),120,3600)
        digest = token_digest(body.question_id + ':' + body.audio)
        with database_ready().transaction() as connection:
            current = one(connection,'SELECT * FROM ft_training.speech_rounds WHERE id=%s AND teacher_id=%s FOR UPDATE',(round_id,teacher['id']))
            if not current:
                raise HTTPException(404,'NOT_FOUND')
            lock(connection,submission)
            previous = one(connection,'SELECT id,round_id,item_id,status,score,error_code,request_digest FROM ft_training.speech_assessments WHERE client_submission_id=%s',(submission,))
            if previous:
                if str(previous['round_id']) != round_id or previous['item_id'] != body.question_id or previous['request_digest'] != digest:
                    raise HTTPException(409,'SUBMISSION_CONFLICT')
                # A pending request after a worker crash stays pending; never rebill silently.
                return result({k:v for k,v in previous.items() if k!='request_digest'})
            expiry = config.get('SPEECHSUPER_TRIAL_EXPIRES_AT','')
            try:
                active = datetime.fromisoformat(expiry.replace('Z','+00:00')) > datetime.now(timezone.utc)
            except (ValueError,TypeError):
                active = False
            if not active:
                raise HTTPException(503,'PROVIDER_TRIAL_NOT_CONFIRMED')
            if not config.get('SPEECHSUPER_APP_KEY') or not config.get('SPEECHSUPER_SECRET_KEY'):
                raise HTTPException(503,'PROVIDER_NOT_CONFIGURED')
            if current['status'] != 'in_progress':
                raise HTTPException(409,'ROUND_FINISHED')
            question = one(connection,'''SELECT q.text FROM ft_training.speech_round_items i JOIN ft_training.speech_questions q
              ON q.id=i.item_id AND q.content_version=i.content_version WHERE i.round_id=%s AND i.item_id=%s''',(round_id,body.question_id))
            audio, duration = validate_audio(body.audio)
            if not question or duration > (20 if current['stage']=='word' else 90):
                raise HTTPException(422,'INVALID_QUESTION_OR_DURATION')
            outstanding = one(connection,"SELECT id FROM ft_training.speech_assessments WHERE round_id=%s AND status='pending' LIMIT 1",(round_id,))
            if outstanding:
                raise HTTPException(409,'ASSESSMENT_PENDING_RECONCILIATION')
            slot = one(connection,'''SELECT id FROM ft_training.provider_slots
              WHERE lease_expires_at IS NULL OR lease_expires_at<=now() ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1''')
            if not slot:
                raise HTTPException(429,'PROVIDER_BUSY')
            token = str(uuid4())
            item = Assessment(kind=current['stage'],text=question['text'],audio=body.audio)
            core, params = payload(item,config['SPEECHSUPER_APP_KEY'],config['SPEECHSUPER_SECRET_KEY'],token)
            connection.execute('''INSERT INTO ft_training.speech_assessments(id,enrollment_id,teacher_id,item_id,content_version,provider,provider_request_id,client_submission_id,status,round_id,scoring_rule_version,active_duration_ms,request_digest)
              VALUES(%s,%s,%s,%s,%s,'speechsuper',%s,%s,'pending',%s,%s,%s,%s)''',(token,current['enrollment_id'],teacher['id'],body.question_id,current['content_version'],token,submission,round_id,current['stage']+'-v1',body.active_duration_ms,digest))
            connection.execute("UPDATE ft_training.provider_slots SET lease_owner=%s,lease_expires_at=now()+interval '120 seconds' WHERE id=%s",(token,slot['id']))
        # The intent is committed before any external side effect. No DB lock while uploading.
        try:
            raw = asyncio.run(assessor(core,params,audio))
            if not isinstance(raw,dict) or raw.get('error') or raw.get('errId') or raw.get('errorId') or not isinstance(raw.get('result'),dict):
                raise ValueError('Provider rejected assessment')
            metrics = raw['result']
            score = calculate(current['stage'],metrics)
            failed = False
        except Exception:
            failed = True
        with database_ready().transaction() as connection:
            one(connection,'SELECT id FROM ft_training.speech_rounds WHERE id=%s FOR UPDATE',(round_id,))
            if failed:
                connection.execute("UPDATE ft_training.speech_assessments SET status='failed',error_code='PROVIDER_ASSESSMENT_FAILED',finished_at=now() WHERE id=%s",(token,))
                response_data = {'id':token,'status':'failed','error_code':'PROVIDER_ASSESSMENT_FAILED','score':None}
            else:
                connection.execute("UPDATE ft_training.speech_assessments SET status='scored',score=%s,pronunciation=%s,fluency=%s,rhythm=%s,integrity=%s,finished_at=now() WHERE id=%s",(score,metrics['pronunciation'],metrics.get('fluency'),metrics.get('rhythm'),metrics.get('integrity'),token))
                count = one(connection,'''SELECT count(DISTINCT a.item_id) AS passed FROM ft_training.speech_assessments a JOIN ft_training.assessment_rules r ON r.content_version=a.content_version AND r.stage=%s
                  WHERE a.round_id=%s AND a.status='scored' AND a.score>=r.pass_percent''',(current['stage'],round_id))['passed']
                rule = one(connection,'SELECT question_count,pass_percent FROM ft_training.assessment_rules WHERE content_version=%s AND stage=%s',(current['content_version'],current['stage']))
                if count == rule['question_count']:
                    connection.execute("UPDATE ft_training.speech_rounds SET status='passed',finished_at=now() WHERE id=%s",(round_id,))
                response_data = {'id':token,'status':'scored','score':score,'passed':score>=rule['pass_percent'],'metrics':{k:metrics[k] for k in ('pronunciation','fluency','rhythm','integrity') if k in metrics}}
            connection.execute('UPDATE ft_training.speech_rounds SET active_duration_ms=coalesce(active_duration_ms,0)+%s WHERE id=%s',(body.active_duration_ms,round_id))
            connection.execute('UPDATE ft_training.provider_slots SET lease_owner=NULL,lease_expires_at=NULL WHERE id=%s AND lease_owner=%s',(slot['id'],token))
        return result(response_data)

    @application.post('/api/v1/feedback')
    def feedback(body: Feedback, request: Request):
        submission = uid(body.client_submission_id)
        if not body.content.strip() or not body.page_path.startswith('/') or '?' in body.page_path:
            raise HTTPException(422,'INVALID_FEEDBACK')
        with database_ready().transaction() as connection:
            teacher = actor(connection,request)
            limit('feedback',str(teacher['id']),20,3600)
            assignment = enrollment(connection,teacher,body.enrollment_id)
            lock(connection,submission)
            existing = one(connection,'SELECT id,teacher_id,content FROM ft_training.teacher_feedback WHERE client_submission_id=%s',(submission,))
            if existing:
                if existing['teacher_id'] != teacher['id'] or existing['content'] != body.content:
                    raise HTTPException(409,'SUBMISSION_CONFLICT')
                return result({'id':existing['id']})
            identifier = str(uuid4())
            connection.execute('INSERT INTO ft_training.teacher_feedback(id,teacher_id,enrollment_id,page_path,content,client_submission_id) VALUES(%s,%s,%s,%s,%s,%s)',(identifier,teacher['id'],assignment['id'],body.page_path,body.content,submission))
            return result({'id':identifier})

    return application


app = create_app()
