"""Read-only common mock API. Not a production identity or assessment service."""
import json
from pathlib import Path
from uuid import UUID,uuid4
from fastapi import FastAPI,Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from common.schemas import Envelope,ErrorEnvelope,Teacher,Enrollment,ProgressResponse,CourseResponse
fixture=json.loads((Path(__file__).resolve().parent.parent/'contracts/mock.json').read_text())
app=FastAPI(responses={422:{'model':ErrorEnvelope},405:{'model':ErrorEnvelope}},title='FT Training Common API (mock)',version='0.1.0',description='Shared mock contract only. No database, login or real assessment. No client write endpoint can set passed.')
def result(data):return {'data':data,'request_id':str(uuid4())}
@app.exception_handler(RequestValidationError)
async def invalid(request:Request,exc:RequestValidationError):
    return JSONResponse(status_code=422,content={'error':{'code':'INVALID_REQUEST','message':'Invalid request parameters.','retryable':False},'request_id':str(uuid4())})
@app.exception_handler(HTTPException)
async def http_error(request:Request,exc:HTTPException):
    return JSONResponse(status_code=exc.status_code,content={'error':{'code':'HTTP_'+str(exc.status_code),'message':str(exc.detail),'retryable':exc.status_code>=500},'request_id':str(uuid4())})
@app.get('/api/v1/me',response_model=Envelope[Teacher])
def me():return result(fixture['teacher'])
@app.get('/api/v1/enrollments',response_model=Envelope[list[Enrollment]])
def enrollments():return result([fixture['enrollment']])
def missing():return JSONResponse(status_code=404,content={'error':{'code':'NOT_FOUND','message':'Training assignment not found in mock data.','retryable':False},'request_id':str(uuid4())})
@app.get('/api/v1/enrollments/{enrollment_id}/progress',response_model=Envelope[ProgressResponse],responses={404:{'model':ErrorEnvelope}})
def progress(enrollment_id:UUID):
    if str(enrollment_id)!=fixture['enrollment']['id']:return missing()
    return result(fixture['progress'])
@app.get('/api/v1/enrollments/{enrollment_id}/course',response_model=Envelope[CourseResponse],responses={404:{'model':ErrorEnvelope}})
def course(enrollment_id:UUID):
    if str(enrollment_id)!=fixture['enrollment']['id']:return missing()
    return result(fixture['course'])

from practice.speechsuper import router as speechsuper_router
app.include_router(speechsuper_router)

from practice.speechace import router as speechace_router
app.include_router(speechace_router)
