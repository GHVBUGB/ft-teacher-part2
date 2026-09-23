BEGIN;
CREATE TEMP TABLE migration_test_results(test text, result text) ON COMMIT DROP;
DO $$
DECLARE
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); r uuid:=gen_random_uuid();
 c uuid:=gen_random_uuid(); f uuid:=gen_random_uuid(); sub uuid:=gen_random_uuid();
 v text:='ft-target-words-v2-round-v1-grammar-20260920'; w text; s text;
BEGIN
 SELECT id INTO STRICT w FROM ft_training.speech_questions WHERE content_version=v AND kind='word' ORDER BY id LIMIT 1;
 SELECT id INTO STRICT s FROM ft_training.speech_questions WHERE content_version=v AND kind='sentence' ORDER BY id LIMIT 1;
 INSERT INTO ft_training.teachers(id,email,active,is_test_account) VALUES(a,a::text||'@example.invalid',true,true),(b,b::text||'@example.invalid',true,true);
 INSERT INTO ft_training.enrollments(id,teacher_id,content_version) VALUES(e,a,v);
 INSERT INTO ft_training.login_challenges(id,teacher_id,code_digest,expires_at) VALUES(c,a,repeat('x',64),now()+interval '10 minutes');
 BEGIN
  UPDATE ft_training.login_challenges SET failed_attempts=6 WHERE id=c;
  RAISE EXCEPTION 'FAILED: allowed too many failures';
 EXCEPTION WHEN check_violation THEN INSERT INTO migration_test_results VALUES('验证码失败次数越界被拒绝','PASS'); END;
 BEGIN
  UPDATE ft_training.login_challenges SET used_at=expires_at+interval '1 second' WHERE id=c;
  RAISE EXCEPTION 'FAILED: allowed expired usage';
 EXCEPTION WHEN check_violation THEN INSERT INTO migration_test_results VALUES('验证码过期使用时间被拒绝','PASS'); END;
 UPDATE ft_training.login_challenges SET failed_attempts=5 WHERE id=c;
 BEGIN
  UPDATE ft_training.login_challenges SET used_at=now() WHERE id=c;
  RAISE EXCEPTION 'FAILED: allowed exhausted challenge';
 EXCEPTION WHEN check_violation THEN INSERT INTO migration_test_results VALUES('次数耗尽后标记使用被拒绝','PASS'); END;
 INSERT INTO ft_training.speech_rounds(id,enrollment_id,teacher_id,content_version,stage) VALUES(r,e,a,v,'word');
 BEGIN
  INSERT INTO ft_training.speech_rounds(id,enrollment_id,teacher_id,content_version,stage) VALUES(gen_random_uuid(),e,b,v,'sentence');
  RAISE EXCEPTION 'FAILED: allowed wrong teacher';
 EXCEPTION WHEN foreign_key_violation THEN INSERT INTO migration_test_results VALUES('跨教师挂接考核轮次被拒绝','PASS'); END;
 BEGIN
  INSERT INTO ft_training.speech_rounds(id,enrollment_id,teacher_id,content_version,stage) VALUES(gen_random_uuid(),e,a,v,'word');
  RAISE EXCEPTION 'FAILED: duplicate active round';
 EXCEPTION WHEN unique_violation THEN INSERT INTO migration_test_results VALUES('同关卡重复进行中轮次被拒绝','PASS'); END;
 INSERT INTO ft_training.speech_round_items VALUES(r,v,'word',w,1);
 BEGIN
  INSERT INTO ft_training.speech_round_items VALUES(r,v,'word',s,2);
  RAISE EXCEPTION 'FAILED: wrong question kind';
 EXCEPTION WHEN foreign_key_violation THEN INSERT INTO migration_test_results VALUES('单词轮次混入句子被拒绝','PASS'); END;
 BEGIN
  UPDATE ft_training.speech_rounds SET status='passed' WHERE id=r;
  RAISE EXCEPTION 'FAILED: missing finished timestamp';
 EXCEPTION WHEN check_violation THEN INSERT INTO migration_test_results VALUES('结束轮次缺少时间被拒绝','PASS'); END;
 INSERT INTO ft_training.speech_assessments(id,enrollment_id,teacher_id,item_id,content_version,provider,client_submission_id,status,score,finished_at,round_id,scoring_rule_version,pronunciation)
 VALUES(gen_random_uuid(),e,a,w,v,'constraint-test',sub,'scored',85,now(),r,'word-v1',85);
 INSERT INTO migration_test_results VALUES('有效成绩及评分明细可保存','PASS');
 BEGIN
  INSERT INTO ft_training.speech_assessments(id,enrollment_id,teacher_id,item_id,content_version,provider,client_submission_id,status,round_id,scoring_rule_version)
  VALUES(gen_random_uuid(),e,a,w,v,'constraint-test',sub,'pending',r,'word-v1');
  RAISE EXCEPTION 'FAILED: duplicate submission';
 EXCEPTION WHEN unique_violation THEN INSERT INTO migration_test_results VALUES('同一成绩提交编号重复被拒绝','PASS'); END;
 BEGIN
  UPDATE ft_training.speech_assessments SET pronunciation=101 WHERE client_submission_id=sub;
  RAISE EXCEPTION 'FAILED: score out of range';
 EXCEPTION WHEN check_violation THEN INSERT INTO migration_test_results VALUES('评分维度超出100被拒绝','PASS'); END;
 INSERT INTO ft_training.teacher_feedback(id,teacher_id,enrollment_id,page_path,content,client_submission_id) VALUES(f,a,e,'/practice','事务内测试，回滚不保留',gen_random_uuid());
 BEGIN
  UPDATE ft_training.teacher_feedback SET teacher_id=b WHERE id=f;
  RAISE EXCEPTION 'FAILED: feedback wrong owner';
 EXCEPTION WHEN foreign_key_violation THEN INSERT INTO migration_test_results VALUES('反馈挂接其他教师培训被拒绝','PASS'); END;
 BEGIN
  UPDATE ft_training.teacher_feedback SET status='resolved' WHERE id=f;
  RAISE EXCEPTION 'FAILED: resolved without timestamp';
 EXCEPTION WHEN check_violation THEN INSERT INTO migration_test_results VALUES('反馈处理完成缺少时间被拒绝','PASS'); END;
END $$;
SELECT * FROM migration_test_results;
ROLLBACK;
