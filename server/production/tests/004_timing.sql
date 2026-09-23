BEGIN;
CREATE TEMP TABLE timing_checks(label text,result text) ON COMMIT DROP;
DO $$
DECLARE t uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); v text:='ft-target-words-v2-round-v1-grammar-20260920'; w text; x record;
BEGIN
 SELECT id INTO w FROM ft_training.speech_questions WHERE kind='word' AND content_version=v LIMIT 1;
 INSERT INTO ft_training.teachers(id,email,is_test_account) VALUES(t,t::text||'@example.invalid',true);
 INSERT INTO ft_training.enrollments(id,teacher_id,content_version,started_at) VALUES(e,t,v,now()-interval '25 minutes');
 INSERT INTO ft_training.speech_rounds(id,enrollment_id,teacher_id,content_version,stage,status,created_at,finished_at,active_duration_ms)
 VALUES(r,e,t,v,'word','passed',now()-interval '25 minutes',now(),960000);
 INSERT INTO ft_training.speech_round_items VALUES(r,v,'word',w,1);
 INSERT INTO ft_training.speech_assessments(id,enrollment_id,teacher_id,item_id,content_version,provider,client_submission_id,status,score,finished_at,round_id,scoring_rule_version,pronunciation,active_duration_ms)
 SELECT gen_random_uuid(),e,t,w,v,'timing-test',gen_random_uuid(),'scored',n,now(),r,'word-v1',n,10000 FROM unnest(ARRAY[65,76,88]) n;
 INSERT INTO ft_training.speech_assessments(id,enrollment_id,teacher_id,item_id,content_version,provider,client_submission_id,status,round_id,scoring_rule_version)
 VALUES(gen_random_uuid(),e,t,w,v,'timing-test',gen_random_uuid(),'failed',r,'word-v1');
 SELECT * INTO STRICT x FROM ft_training.speech_question_summary WHERE enrollment_id=e;
 IF x.submission_count<>4 OR x.scored_attempt_count<>3 OR x.unsuccessful_count<>2 OR x.technical_failure_count<>1 OR x.best_score<>88 OR x.first_passed_at IS NULL OR x.recorded_active_duration_ms<>30000 OR x.timed_submission_count<>3 THEN RAISE EXCEPTION 'summary mismatch'; END IF;
 INSERT INTO timing_checks VALUES('3次评分、2次未过、1次技术失败、最高88分','PASS');
 SELECT * INTO STRICT x FROM ft_training.stage_timing_summary WHERE round_id=r;
 IF x.elapsed_duration_ms<>1500000 OR x.active_duration_ms<>960000 THEN RAISE EXCEPTION 'timing mismatch'; END IF;
 INSERT INTO timing_checks VALUES('总历时25分钟、有效16分钟分别保存','PASS');
 BEGIN
  UPDATE ft_training.speech_rounds SET active_duration_ms=-1 WHERE id=r;
  RAISE EXCEPTION 'negative duration accepted';
 EXCEPTION WHEN check_violation THEN INSERT INTO timing_checks VALUES('负时长拒绝写入','PASS'); END;
 BEGIN
  UPDATE ft_training.enrollments SET completed_at=started_at-interval '1 second' WHERE id=e;
  RAISE EXCEPTION 'invalid times accepted';
 EXCEPTION WHEN check_violation THEN INSERT INTO timing_checks VALUES('完成早于开始被拒绝','PASS'); END;
END $$;
SELECT * FROM timing_checks;
ROLLBACK;
