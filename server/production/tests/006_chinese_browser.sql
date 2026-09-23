DO $$
DECLARE v record; n bigint; bad bigint;
BEGIN
 IF (SELECT count(*) FROM information_schema.views WHERE table_schema='中文查看')<>18 THEN RAISE EXCEPTION 'Expected 18 readable views'; END IF;
 IF "中文查看".编号('T',1000)<>'T1000' THEN RAISE EXCEPTION 'Identifier truncated'; END IF;
 FOR v IN SELECT table_name FROM information_schema.views WHERE table_schema='中文查看' LOOP
  EXECUTE format('SELECT count(*) FROM "中文查看".%I',v.table_name) INTO n;
  -- Forces evaluation of every projected column, including empty and nullable cases.
  EXECUTE format('SELECT count(*) FROM "中文查看".%I b CROSS JOIN LATERAL jsonb_each_text(to_jsonb(b)) j WHERE j.value LIKE ''%%未关联（查看原记录）%%'' OR j.value ~ ''[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}''',v.table_name) INTO bad;
  IF bad>0 THEN RAISE EXCEPTION 'Unresolved or raw identifier in %',v.table_name; END IF;
 END LOOP;
 IF (SELECT count(*) FROM "中文查看".教师)<>(SELECT count(*) FROM ft_training.teachers) OR
 (SELECT count(*) FROM "中文查看".语法答题记录)<>(SELECT count(*) FROM ft_training.grammar_answers) OR
 (SELECT count(*) FROM "中文查看".朗读评分记录)<>(SELECT count(*) FROM ft_training.speech_assessments) THEN RAISE EXCEPTION 'Projection lost rows'; END IF;
 IF EXISTS(SELECT 1 FROM ft_training.teachers t JOIN "中文查看".教师 shown ON shown.编号="中文查看".编号('T',t.display_no) WHERE shown.模拟账号<>CASE WHEN t.is_test_account THEN '是' ELSE '否' END) THEN RAISE EXCEPTION 'Test marker mismatch'; END IF;
END $$;
SELECT '18个中文视图、编号关联、原始行数、模拟标记检查通过' AS 检查结果;
