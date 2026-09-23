BEGIN;
ALTER TABLE ft_training.enrollments
 ADD COLUMN started_at timestamptz,
 ADD COLUMN completed_at timestamptz,
 ADD CONSTRAINT enrollment_times CHECK(completed_at IS NULL OR (started_at IS NOT NULL AND completed_at>=started_at));
ALTER TABLE ft_training.speech_rounds ADD COLUMN active_duration_ms bigint CHECK(active_duration_ms>=0);
ALTER TABLE ft_training.grammar_rounds ADD COLUMN active_duration_ms bigint CHECK(active_duration_ms>=0);
ALTER TABLE ft_training.speech_assessments
 ADD COLUMN answer_started_at timestamptz,
 ADD COLUMN submitted_at timestamptz,
 ADD COLUMN active_duration_ms bigint CHECK(active_duration_ms>=0),
 ADD CONSTRAINT speech_answer_times CHECK(submitted_at IS NULL OR(answer_started_at IS NOT NULL AND submitted_at>=answer_started_at));
ALTER TABLE ft_training.grammar_answers
 ADD COLUMN answer_started_at timestamptz,
 ADD COLUMN submitted_at timestamptz,
 ADD COLUMN active_duration_ms bigint CHECK(active_duration_ms>=0),
 ADD CONSTRAINT grammar_answer_times CHECK(submitted_at IS NULL OR(answer_started_at IS NOT NULL AND submitted_at>=answer_started_at));
COMMENT ON COLUMN ft_training.speech_rounds.active_duration_ms IS '有效练习毫秒数；NULL代表未采集。暂停/离开/长时间无操作停计策略仍需前后端实现，不用总历时代替';
COMMENT ON COLUMN ft_training.grammar_rounds.active_duration_ms IS '有效作答毫秒数；NULL代表未采集；跨设备计时需服务端去重';
CREATE VIEW ft_training.speech_question_summary AS
 SELECT a.teacher_id,a.enrollment_id,a.content_version,a.item_id,
 count(*) AS submission_count,
 count(*) FILTER(WHERE a.status='scored') AS scored_attempt_count,
 count(*) FILTER(WHERE a.status='scored' AND a.score<r.pass_percent) AS unsuccessful_count,
 count(*) FILTER(WHERE a.status='failed') AS technical_failure_count,
 count(*) FILTER(WHERE a.status='pending') AS pending_count,
 max(a.score) FILTER(WHERE a.status='scored') AS best_score,
 min(a.finished_at) FILTER(WHERE a.status='scored' AND a.score>=r.pass_percent) AS first_passed_at,
 sum(a.active_duration_ms) AS recorded_active_duration_ms,
 count(a.active_duration_ms) AS timed_submission_count
 FROM ft_training.speech_assessments a
 JOIN ft_training.speech_questions q ON(q.content_version=a.content_version AND q.id=a.item_id)
 JOIN ft_training.assessment_rules r ON(r.content_version=q.content_version AND r.stage=q.kind)
 GROUP BY a.teacher_id,a.enrollment_id,a.content_version,a.item_id;
CREATE VIEW ft_training.grammar_question_summary AS
 SELECT r.teacher_id,r.enrollment_id,a.content_version,a.question_id,
 count(*) AS attempt_count,
 count(*) FILTER(WHERE NOT a.correct) AS wrong_count,
 count(*) FILTER(WHERE a.correct) AS correct_count,
 min(a.created_at) FILTER(WHERE a.correct) AS first_correct_at,
 sum(a.active_duration_ms) AS recorded_active_duration_ms,
 count(a.active_duration_ms) AS timed_attempt_count
 FROM ft_training.grammar_answers a JOIN ft_training.grammar_rounds r ON r.id=a.round_id
 GROUP BY r.teacher_id,r.enrollment_id,a.content_version,a.question_id;
CREATE VIEW ft_training.stage_timing_summary AS
 SELECT teacher_id,enrollment_id,id AS round_id,stage,status,created_at AS started_at,finished_at,
 CASE WHEN finished_at IS NOT NULL THEN (extract(epoch FROM(finished_at-created_at))*1000)::bigint END AS elapsed_duration_ms,
 active_duration_ms FROM ft_training.speech_rounds
 UNION ALL
 SELECT teacher_id,enrollment_id,id,'grammar',status,created_at,finished_at,
 CASE WHEN finished_at IS NOT NULL THEN (extract(epoch FROM(finished_at-created_at))*1000)::bigint END,
 active_duration_ms FROM ft_training.grammar_rounds;
COMMENT ON VIEW ft_training.speech_question_summary IS '按教师培训题目汇总；评分未通过与技术失败分开，门槛取绑定版本；仅含可关联题库的成绩';
COMMENT ON VIEW ft_training.grammar_question_summary IS '跨重考轮次累计逐题对错，不丢失原始答案';
COMMENT ON VIEW ft_training.stage_timing_summary IS '每关每轮总历时及有效时长，未完成历时为空；不是实时在线计时器';
INSERT INTO ft_training.schema_versions(version) VALUES(4);
COMMIT;
