BEGIN;
-- Human-readable projections only. Application keys, foreign keys and scores stay intact.
CREATE SCHEMA IF NOT EXISTS "中文查看";
REVOKE ALL ON SCHEMA "中文查看" FROM PUBLIC;
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['teachers','enrollments','content_versions','grammar_rounds','speech_rounds','grammar_questions','speech_questions','grammar_answers','speech_assessments','speech_round_items','teacher_feedback','sessions','login_challenges','assessment_rules'] LOOP
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='ft_training' AND table_name=t AND column_name='display_no') THEN
   EXECUTE format('ALTER TABLE ft_training.%I ADD COLUMN display_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE',t);
  END IF;
 END LOOP;
END $$;
CREATE FUNCTION "中文查看".编号(prefix text, n bigint) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$ SELECT prefix || lpad(n::text,greatest(3,length(n::text)),'0') $$;
REVOKE ALL ON FUNCTION "中文查看".编号(text,bigint) FROM PUBLIC;
CREATE FUNCTION "中文查看".关联(kind text, raw text, ver text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE n bigint; prefix text; target text;
BEGIN
 IF raw IS NULL THEN RETURN NULL; END IF;
 target := CASE kind WHEN 'T' THEN 'teachers' WHEN 'E' THEN 'enrollments' WHEN 'G' THEN 'grammar_rounds' WHEN 'R' THEN 'speech_rounds' WHEN 'QG' THEN 'grammar_questions' WHEN 'QS' THEN 'speech_questions' WHEN 'V' THEN 'content_versions' END;
 IF target IS NULL THEN RAISE EXCEPTION 'Unknown identifier kind: %',kind; END IF;
 IF kind='V' THEN
  SELECT display_no INTO n FROM ft_training.content_versions WHERE version=raw;
 ELSIF kind IN ('QG','QS') THEN
  EXECUTE format('SELECT display_no FROM ft_training.%I WHERE id=$1 AND content_version=$2',target) INTO n USING raw,ver;
 ELSE
  EXECUTE format('SELECT display_no FROM ft_training.%I WHERE id::text=$1',target) INTO n USING raw;
 END IF;
 RETURN CASE WHEN n IS NULL THEN '未关联（查看原记录）' ELSE "中文查看".编号(kind,n) END;
END $$;
REVOKE ALL ON FUNCTION "中文查看".关联(text,text,text) FROM PUBLIC;
DO $$
DECLARE
 t record; c record; expr text; label text; cols text;
 names jsonb := '{"teachers":"教师","enrollments":"培训记录","content_versions":"题库版本","grammar_rounds":"语法考核","speech_rounds":"朗读考核","grammar_questions":"语法题目","speech_questions":"朗读题目","grammar_answers":"语法答题记录","speech_assessments":"朗读评分记录","speech_round_items":"朗读抽题顺序","teacher_feedback":"教师反馈","sessions":"登录会话","login_challenges":"邮箱验证码","assessment_rules":"考核规则","schema_versions":"数据库版本"}';
 prefixes jsonb := '{"teachers":"T","enrollments":"E","content_versions":"V","grammar_rounds":"G","speech_rounds":"R","grammar_questions":"QG","speech_questions":"QS","grammar_answers":"AG","speech_assessments":"AS","speech_round_items":"RI","teacher_feedback":"F","sessions":"S","login_challenges":"L","assessment_rules":"RULE"}';
 labels jsonb := '{"external_id":"教师标识","email":"邮箱","active":"启用","created_at":"创建时间","expires_at":"到期时间","revoked_at":"撤销时间","started_at":"开始时间","completed_at":"完成时间","finished_at":"结束时间","teacher_id":"教师编号","enrollment_id":"培训编号","round_id":"考核编号","content_version":"题库版本","version":"版本","question_id":"题目编号","item_id":"题目编号","question_order":"题目顺序","prompt":"题目","text":"题目","option_a":"选项A","option_b":"选项B","correct_option":"正确选项","explanation":"答案解释","sequence":"作答顺序","selected_option":"所选答案","correct":"是否答对","status":"状态","provider":"评分服务","provider_request_id":"服务请求记录","client_submission_id":"提交编号","score":"总分","error_code":"错误代码","source_description":"来源说明","source_sha256":"源文件校验","kind":"题型","metadata":"题目附加信息","stage":"关卡","question_count":"题目数量","pass_percent":"通过门槛","settings":"规则详情","description_zh":"规则说明","is_test_account":"模拟账号","password_hash":"密码配置","code_digest":"验证码摘要","failed_attempts":"验证失败次数","max_attempts":"允许失败次数","used_at":"使用时间","position":"题目顺序","scoring_rule_version":"评分规则版本","pronunciation":"发音分","fluency":"流利度","rhythm":"节奏分","integrity":"完整度","page_path":"所在页面","content":"反馈内容","resolution_note":"处理说明","updated_at":"更新时间","resolved_at":"处理时间","answer_started_at":"答题开始时间","submitted_at":"提交时间","active_duration_ms":"有效耗时_秒","applied_at":"应用时间"}';
BEGIN
 FOR t IN SELECT key AS source,value AS title FROM jsonb_each_text(names) LOOP
  cols := CASE WHEN t.source='schema_versions' THEN '' ELSE format('"中文查看".编号(%L,b.display_no) AS "编号"',prefixes->>t.source) END;
  FOR c IN SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='ft_training' AND table_name=t.source ORDER BY ordinal_position LOOP
   IF c.column_name IN ('id','display_no') THEN CONTINUE; END IF;
   label := coalesce(labels->>c.column_name,c.column_name);
   expr := format('b.%I',c.column_name);
   CASE
    WHEN c.column_name='teacher_id' THEN expr := '"中文查看".关联(''T'',b.teacher_id::text)';
    WHEN c.column_name='enrollment_id' THEN expr := '"中文查看".关联(''E'',b.enrollment_id::text)';
    WHEN c.column_name='round_id' THEN expr := format('"中文查看".关联(%L,b.round_id::text)',CASE WHEN t.source='grammar_answers' THEN 'G' ELSE 'R' END);
    WHEN c.column_name='content_version' OR (c.column_name='version' AND t.source='content_versions') THEN
     IF t.source='content_versions' THEN CONTINUE; END IF;
     expr := '"中文查看".关联(''V'',b.content_version)';
    WHEN c.column_name IN ('question_id','item_id') THEN
     expr := format('"中文查看".关联(%s,b.%I,b.content_version)',CASE WHEN t.source='grammar_answers' THEN '''QG''' WHEN t.source='teacher_feedback' THEN 'CASE WHEN b.stage=''grammar'' THEN ''QG'' ELSE ''QS'' END' ELSE '''QS''' END,c.column_name);
    WHEN c.column_name='question_order' THEN expr := '(SELECT string_agg("中文查看".关联(''QG'',q.value,b.content_version),'' → '' ORDER BY q.ord) FROM jsonb_array_elements_text(b.question_order) WITH ORDINALITY q(value,ord))';
    WHEN c.column_name IN ('token_hash','password_hash','code_digest','source_sha256') THEN
     label := CASE c.column_name WHEN 'token_hash' THEN '会话凭证' ELSE label END;
     expr := format('CASE WHEN b.%I IS NULL THEN ''未配置'' ELSE ''已保存（隐藏原值）'' END',c.column_name);
    WHEN c.column_name IN ('client_submission_id','provider_request_id') THEN expr := format('CASE WHEN b.%I IS NULL THEN NULL ELSE "中文查看".编号(%L,b.display_no) END',c.column_name,CASE WHEN c.column_name='provider_request_id' THEN '请求-' ELSE '提交-' END || (prefixes->>t.source));
    WHEN c.column_name IN ('correct_option','selected_option') THEN expr := format('CASE b.%I WHEN 0 THEN ''A'' WHEN 1 THEN ''B'' END',c.column_name);
    WHEN c.column_name IN ('stage','kind') THEN expr := format('CASE b.%I WHEN ''word'' THEN ''第一关·单词'' WHEN ''sentence'' THEN ''第二关·句子'' WHEN ''grammar'' THEN ''第三关·语法'' ELSE b.%I END',c.column_name,c.column_name);
    WHEN c.column_name='status' THEN expr := format('CASE b.status WHEN ''passed'' THEN ''通过'' WHEN ''failed'' THEN %L WHEN ''in_progress'' THEN ''进行中'' WHEN ''pending'' THEN ''等待评分'' WHEN ''scored'' THEN ''已评分'' WHEN ''new'' THEN ''待处理'' WHEN ''reviewing'' THEN ''处理中'' WHEN ''resolved'' THEN ''已解决'' WHEN ''closed'' THEN ''已关闭'' ELSE b.status END',CASE WHEN t.source='speech_assessments' THEN '评分服务失败' ELSE '未通过' END);
    WHEN c.column_name='active_duration_ms' THEN expr := 'round(b.active_duration_ms/1000.0,2)';
    WHEN c.data_type='boolean' THEN expr := format('CASE WHEN b.%I THEN ''是'' WHEN b.%I IS FALSE THEN ''否'' ELSE NULL END',c.column_name,c.column_name);
    WHEN c.data_type='timestamp with time zone' THEN expr := format('b.%I AT TIME ZONE ''Asia/Shanghai''',c.column_name); label := label || '_北京时间';
    ELSE NULL;
   END CASE;
   cols := cols || CASE WHEN cols='' THEN '' ELSE ', ' END || expr || format(' AS %I',label);
  END LOOP;
  EXECUTE format('CREATE VIEW "中文查看".%I WITH (security_barrier=true) AS SELECT %s FROM ft_training.%I b OFFSET 0',t.title,cols,t.source);
  EXECUTE format('REVOKE ALL ON "中文查看".%I FROM PUBLIC',t.title);
  EXECUTE format('COMMENT ON VIEW "中文查看".%I IS %L',t.title,'只读查看入口；短编号稳定不截断；实时读取原表，不复制业务记录。底层完整标识用于系统关联。');
 END LOOP;
END $$;
CREATE VIEW "中文查看".语法错题统计 AS
SELECT "中文查看".关联('T',teacher_id::text) AS 教师编号,
 "中文查看".关联('E',enrollment_id::text) AS 培训编号,
 "中文查看".关联('V',content_version) AS 题库版本,
 "中文查看".关联('QG',question_id,content_version) AS 题目编号,
 attempt_count AS 作答次数, wrong_count AS 答错次数, correct_count AS 答对次数,
 first_correct_at AT TIME ZONE 'Asia/Shanghai' AS 首次答对时间_北京时间,
 round(recorded_active_duration_ms/1000.0,2) AS 已记录耗时_秒,
 timed_attempt_count AS 已计时次数 FROM ft_training.grammar_question_summary;
CREATE VIEW "中文查看".朗读重试统计 AS
SELECT "中文查看".关联('T',teacher_id::text) AS 教师编号,
 "中文查看".关联('E',enrollment_id::text) AS 培训编号,
 "中文查看".关联('V',content_version) AS 题库版本,
 "中文查看".关联('QS',item_id,content_version) AS 题目编号,
 submission_count AS 提交次数,scored_attempt_count AS 已评分次数,
 unsuccessful_count AS 未达标次数,technical_failure_count AS 服务失败次数,
 pending_count AS 等待评分次数,best_score AS 最高分,
 first_passed_at AT TIME ZONE 'Asia/Shanghai' AS 首次通过时间_北京时间,
 round(recorded_active_duration_ms/1000.0,2) AS 已记录耗时_秒,
 timed_submission_count AS 已计时次数 FROM ft_training.speech_question_summary;
CREATE VIEW "中文查看".关卡用时统计 AS
SELECT "中文查看".关联('T',teacher_id::text) AS 教师编号,
 "中文查看".关联('E',enrollment_id::text) AS 培训编号,
 "中文查看".关联(CASE WHEN stage='grammar' THEN 'G' ELSE 'R' END,round_id::text) AS 考核编号,
 CASE stage WHEN 'word' THEN '第一关·单词' WHEN 'sentence' THEN '第二关·句子' ELSE '第三关·语法' END AS 关卡,
 CASE status WHEN 'passed' THEN '通过' WHEN 'failed' THEN '未通过' ELSE '进行中' END AS 状态,
 started_at AT TIME ZONE 'Asia/Shanghai' AS 开始时间_北京时间,
 finished_at AT TIME ZONE 'Asia/Shanghai' AS 结束时间_北京时间,
 round(elapsed_duration_ms/1000.0,2) AS 总历时_秒,
 round(active_duration_ms/1000.0,2) AS 有效耗时_秒 FROM ft_training.stage_timing_summary;
REVOKE ALL ON ALL TABLES IN SCHEMA "中文查看" FROM PUBLIC;
INSERT INTO ft_training.schema_versions(version) VALUES(6);
COMMIT;
