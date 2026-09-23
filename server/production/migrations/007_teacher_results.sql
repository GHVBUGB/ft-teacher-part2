BEGIN;
CREATE VIEW "中文查看"."一张表看教师成绩" AS
WITH events AS (
 SELECT a.teacher_id,a.enrollment_id,a.content_version,q.kind AS stage,a.item_id AS question_id,
 q.text AS question,a.created_at AS at,a.display_no AS event_no,
 "中文查看".关联('R',a.round_id::text) AS round_code,
 CASE WHEN a.status='scored' THEN a.score::text||'分' WHEN a.status='failed' THEN '评分服务失败' ELSE '等待评分' END AS grade,
 CASE WHEN a.status='scored' AND a.score>=rules.pass_percent THEN '通过'
 WHEN a.status='scored' THEN '未达标' WHEN a.status='failed' THEN '评分服务失败' ELSE '等待评分' END AS result,
 (a.status='scored' AND a.score<rules.pass_percent) AS wrong,
 a.active_duration_ms
 FROM ft_training.speech_assessments a
 JOIN ft_training.speech_questions q ON q.id=a.item_id AND q.content_version=a.content_version
 JOIN ft_training.assessment_rules rules ON rules.content_version=a.content_version AND rules.stage=q.kind
 UNION ALL
 SELECT r.teacher_id,r.enrollment_id,a.content_version,'grammar',a.question_id,q.prompt,a.created_at,a.display_no,
 "中文查看".关联('G',a.round_id::text),
 CASE WHEN a.correct THEN '答对' ELSE '答错' END,
 CASE WHEN a.correct THEN '答对' ELSE '答错' END,NOT a.correct,a.active_duration_ms
 FROM ft_training.grammar_answers a
 JOIN ft_training.grammar_rounds r ON r.id=a.round_id
 JOIN ft_training.grammar_questions q ON q.id=a.question_id AND q.content_version=a.content_version
), latest_stage AS (
 SELECT DISTINCT ON (teacher_id,enrollment_id,stage) teacher_id,enrollment_id,stage,status
 FROM ft_training.stage_timing_summary
 ORDER BY teacher_id,enrollment_id,stage,started_at DESC,round_id DESC
), per_question AS (
 SELECT teacher_id,enrollment_id,content_version,stage,question_id,question,
 (array_agg(grade ORDER BY at DESC,event_no DESC))[1] AS last_grade,
 (array_agg(result ORDER BY at DESC,event_no DESC))[1] AS last_result,
 count(*) AS attempts,count(*) FILTER(WHERE wrong) AS errors,
 string_agg(coalesce(round_code,'旧记录')||'：'||grade,' → ' ORDER BY at,event_no) AS history,
 round(sum(active_duration_ms)/1000.0,2) AS seconds,
 count(active_duration_ms) AS timed_attempts
 FROM events GROUP BY teacher_id,enrollment_id,content_version,stage,question_id,question
)
SELECT coalesce(t.external_id,"中文查看".编号('T',t.display_no)) AS 老师,
 CASE WHEN t.is_test_account THEN '模拟老师' ELSE '正式账号' END AS 数据类型,
 CASE p.stage WHEN 'word' THEN '第一关·单词' WHEN 'sentence' THEN '第二关·句子' ELSE '第三关·语法' END AS 关卡,
 p.question AS 题目,p.last_grade AS 最近一次成绩,p.last_result AS 最近作答结果,
 CASE s.status WHEN 'passed' THEN '已过关' WHEN 'failed' THEN '未过关' WHEN 'in_progress' THEN '考核中' ELSE '未关联轮次' END AS 本关最新状态,
 p.attempts AS 作答次数,p.errors AS 答错或未达标次数,p.history AS 每次作答成绩,
 p.seconds AS 累计有效耗时_秒,p.timed_attempts AS 已计时次数,
 "中文查看".关联('E',p.enrollment_id::text) AS 培训编号,
 "中文查看".关联(CASE p.stage WHEN 'grammar' THEN 'QG' ELSE 'QS' END,p.question_id,p.content_version) AS 题号
FROM per_question p JOIN ft_training.teachers t ON t.id=p.teacher_id
LEFT JOIN latest_stage s ON s.teacher_id=p.teacher_id AND s.enrollment_id=p.enrollment_id AND s.stage=p.stage
ORDER BY t.display_no,p.enrollment_id,CASE p.stage WHEN 'word' THEN 1 WHEN 'sentence' THEN 2 ELSE 3 END,p.question_id;
REVOKE ALL ON "中文查看"."一张表看教师成绩" FROM PUBLIC;
COMMENT ON VIEW "中文查看"."一张表看教师成绩" IS '每个教师每次培训每题一行。仅含已提交题目；成绩为最近一次作答，历史保留全部重试；语法显示对错，不伪造百分制单题分；本关状态取最新轮次。模拟不代表真实资格。';
INSERT INTO ft_training.schema_versions(version) VALUES(7);
COMMIT;
