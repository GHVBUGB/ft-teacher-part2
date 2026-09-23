from pathlib import Path
import json,uuid,datetime
root=Path('/Users/guhongji/Desktop/教师/project/教师/ft-practice')
s=(root/'src/features/practice/lib/catalog.ts').read_text()
d=json.JSONDecoder(); words=d.raw_decode(s.split('export const words = ',1)[1])[0]; grammar=d.raw_decode(s.split('export const grammar = ',1)[1])[0]
v='ft-target-words-v2-round-v1-grammar-20260920'
def uid(k):return str(uuid.uuid5(uuid.NAMESPACE_URL,'ft-synthetic-20260920/'+k))
def q(x):
 if x is None:return 'NULL'
 if isinstance(x,bool):return 'true' if x else 'false'
 if isinstance(x,(int,float)):return str(x)
 return "'"+str(x).replace("'","''")+"'"
sql=['BEGIN;']; base=datetime.datetime(2026,9,20,1,tzinfo=datetime.timezone.utc)
def ts(sec):return (base+datetime.timedelta(seconds=sec)).isoformat()
def ins(table,**kw):sql.append('INSERT INTO ft_training.'+table+'('+','.join(kw)+') VALUES('+','.join(map(q,kw.values()))+');')
for person,slow in [('smooth',False),('retry',True)]:
 t=uid(person);e=uid(person+'/enrollment');offset=0 if not slow else 14400
 ins('teachers',id=t,external_id='SIM-'+('顺利通过' if not slow else '多次重考'),email=person+'-demo@example.invalid',active=False,is_test_account=True)
 ins('enrollments',id=e,teacher_id=t,content_version=v,created_at=ts(offset),started_at=ts(offset))
 cursor=offset
 for kind,count in [('word',30),('sentence',20)]:
  items=[w for w in words if (w['kind']=='关键词')==(kind=='word')][:count]; r=uid(person+'/'+kind); start=cursor;duration=0
  # Write round first, then fill its final times after attempts.
  ins('speech_rounds',id=r,enrollment_id=e,teacher_id=t,content_version=v,stage=kind,created_at=ts(cursor))
  for i,w in enumerate(items):
   ins('speech_round_items',round_id=r,content_version=v,stage=kind,item_id=w['id'],position=i+1)
   scores=([58,72,88] if i%7==0 else [74,86] if i%5==0 else [90]) if slow else [96]
   for n,score in enumerate(scores):
    spent=35 if slow else 20; begin=cursor;cursor+=spent;duration+=spent
    ins('speech_assessments',id=uid(person+'/'+kind+'/'+str(i)+'/'+str(n)),enrollment_id=e,teacher_id=t,item_id=w['id'],content_version=v,provider='synthetic-demo',client_submission_id=uid(person+'/submit/'+kind+'/'+str(i)+'/'+str(n)),status='scored',score=score,created_at=ts(begin),finished_at=ts(cursor+1),round_id=r,scoring_rule_version=kind+'-v1',pronunciation=score,fluency=score if kind=='sentence' else None,rhythm=score if kind=='sentence' else None,integrity=100 if kind=='sentence' else None,answer_started_at=ts(begin),submitted_at=ts(cursor),active_duration_ms=spent*1000)
    cursor+=2
  sql.append(f"UPDATE ft_training.speech_rounds SET status='passed',finished_at={q(ts(cursor))},active_duration_ms={duration*1000} WHERE id={q(r)};")
  cursor+=300 if slow else 30
 for attempt in range(3 if slow else 1):
  failed=slow and attempt<2; order=grammar[attempt*3:]+grammar[:attempt*3];r=uid(person+'/grammar/'+str(attempt)); start=cursor
  ins('grammar_rounds',id=r,enrollment_id=e,teacher_id=t,content_version=v,question_order=json.dumps([x['id'] for x in order]),created_at=ts(cursor))
  length=14 if failed else 30; duration=0
  for i,g in enumerate(order[:length]):
   correct=(i%2==0) if failed else (i not in [3,11,20] if slow else True);spent=45 if slow else 20;begin=cursor;cursor+=spent;duration+=spent
   answer=g['variants'][0]['answer']
   ins('grammar_answers',round_id=r,content_version=v,question_id=g['id'],sequence=i+1,selected_option=answer if correct else 1-answer,correct=correct,client_submission_id=uid(person+'/grammar-submit/'+str(attempt)+'/'+str(i)),created_at=ts(cursor),answer_started_at=ts(begin),submitted_at=ts(cursor),active_duration_ms=spent*1000)
  sql.append(f"UPDATE ft_training.grammar_rounds SET status={q('failed' if failed else 'passed')},finished_at={q(ts(cursor))},active_duration_ms={duration*1000} WHERE id={q(r)};")
  if failed:cursor+=600
 sql.append(f"UPDATE ft_training.enrollments SET completed_at={q(ts(cursor))} WHERE id={q(e)};")
 ins('teacher_feedback',id=uid(person+'/feedback'),teacher_id=t,enrollment_id=e,page_path='/practice',content='【人工构造的演示数据，非真实教师反馈】'+('流程顺利完成。' if not slow else '多次重试后通过，用于演示重考与逐题错误统计。'),client_submission_id=uid(person+'/feedback-submit'),created_at=ts(cursor),updated_at=ts(cursor))
sql+=['COMMIT;'];(root/'server/production/tests/seed_two_demo_teachers.sql').write_text('\n'.join(sql))
print('Generated explicit synthetic teacher seed:',len(sql),'statements')
