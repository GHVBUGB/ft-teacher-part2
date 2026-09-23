BEGIN;
ALTER TABLE ft_training.teachers ADD COLUMN display_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE;
ALTER TABLE ft_training.enrollments ADD COLUMN display_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE;
ALTER TABLE ft_training.grammar_rounds ADD COLUMN display_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE;
ALTER TABLE ft_training.speech_rounds ADD COLUMN display_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE;
ALTER TABLE ft_training.content_versions ADD COLUMN display_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE;
CREATE VIEW ft_training.语法考核明细 AS
SELECT 'G'||lpad(g.display_no::text,greatest(3,length(g.display_no::text)),'0') AS 考核编号,
 'E'||lpad(e.display_no::text,greatest(3,length(e.display_no::text)),'0') AS 培训编号,
 'T'||lpad(t.display_no::text,greatest(3,length(t.display_no::text)),'0') AS 教师编号,
 t.external_id AS 教师标识,
 t.is_test_account AS 模拟账号,
 'V'||lpad(v.display_no::text,greatest(2,length(v.display_no::text)),'0') AS 题库版本,
 CASE g.status WHEN 'passed' THEN '通过' WHEN 'failed' THEN '未通过' ELSE '进行中' END AS 状态,
 (SELECT count(*) FROM ft_training.grammar_answers a WHERE a.round_id=g.id) AS 已答题数,
 (SELECT count(*) FROM ft_training.grammar_answers a WHERE a.round_id=g.id AND a.correct) AS 答对题数,
 (SELECT count(*) FROM ft_training.grammar_answers a WHERE a.round_id=g.id AND NOT a.correct) AS 答错题数,
 g.created_at AT TIME ZONE 'Asia/Shanghai' AS 开始时间_北京时间,
 g.finished_at AT TIME ZONE 'Asia/Shanghai' AS 结束时间_北京时间,
 round(g.active_duration_ms/60000.0,2) AS 有效分钟
FROM ft_training.grammar_rounds g
JOIN ft_training.enrollments e ON e.id=g.enrollment_id
JOIN ft_training.teachers t ON t.id=g.teacher_id
JOIN ft_training.content_versions v ON v.version=g.content_version;
CREATE VIEW ft_training.朗读考核明细 AS
SELECT 'R'||lpad(r.display_no::text,greatest(3,length(r.display_no::text)),'0') AS 考核编号,
 'E'||lpad(e.display_no::text,greatest(3,length(e.display_no::text)),'0') AS 培训编号,
 'T'||lpad(t.display_no::text,greatest(3,length(t.display_no::text)),'0') AS 教师编号,
 t.external_id AS 教师标识,t.is_test_account AS 模拟账号,
 'V'||lpad(v.display_no::text,greatest(2,length(v.display_no::text)),'0') AS 题库版本,
 CASE r.stage WHEN 'word' THEN '单词' ELSE '句子' END AS 关卡,
 CASE r.status WHEN 'passed' THEN '通过' WHEN 'failed' THEN '未通过' ELSE '进行中' END AS 状态,
 r.created_at AT TIME ZONE 'Asia/Shanghai' AS 开始时间_北京时间,
 r.finished_at AT TIME ZONE 'Asia/Shanghai' AS 结束时间_北京时间,
 round(r.active_duration_ms/60000.0,2) AS 有效分钟
FROM ft_training.speech_rounds r JOIN ft_training.enrollments e ON e.id=r.enrollment_id
JOIN ft_training.teachers t ON t.id=r.teacher_id JOIN ft_training.content_versions v ON v.version=r.content_version;
COMMENT ON VIEW ft_training.语法考核明细 IS '人工查看用短编号；内部UUID和题库版本保持不变。display_no为永久唯一编号，非权限凭证';
INSERT INTO ft_training.schema_versions(version) VALUES(5);
COMMIT;
