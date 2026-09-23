BEGIN;
-- Additive migration: existing records are retained; legacy assessments have no round.
ALTER TABLE ft_training.teachers
 ADD COLUMN is_test_account boolean NOT NULL DEFAULT false,
 ADD COLUMN password_hash text,
 ADD CONSTRAINT password_hash_not_empty CHECK(password_hash IS NULL OR length(password_hash)>=20);
COMMENT ON COLUMN ft_training.teachers.password_hash IS '可选密码登录的单向密码哈希；禁止存明文密码；算法与校验由认证服务负责';
COMMENT ON COLUMN ft_training.teachers.is_test_account IS '模拟测试账号标记，不代表真实教师资格';

CREATE TABLE ft_training.login_challenges(
 id uuid PRIMARY KEY,
 teacher_id uuid NOT NULL REFERENCES ft_training.teachers(id),
 code_digest text NOT NULL CHECK(length(code_digest)>=32),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 failed_attempts integer NOT NULL DEFAULT 0,
 max_attempts integer NOT NULL DEFAULT 5 CHECK(max_attempts BETWEEN 1 AND 20),
 used_at timestamptz,
 CHECK(expires_at>created_at),
 CHECK(failed_attempts BETWEEN 0 AND max_attempts),
 CHECK(used_at IS NULL OR (used_at>=created_at AND used_at<expires_at AND failed_attempts<max_attempts))
);
CREATE INDEX login_challenges_teacher ON ft_training.login_challenges(teacher_id,created_at DESC);
CREATE INDEX login_challenges_expiry ON ft_training.login_challenges(expires_at);
COMMENT ON TABLE ft_training.login_challenges IS '邮箱验证码挑战，邮箱取教师表；摘要须由服务端秘密密钥HMAC生成，不存明文验证码。服务端仍须原子验证有效期、次数、未使用和教师启用状态，并限制发码频率';

ALTER TABLE ft_training.enrollments ADD CONSTRAINT enrollment_owner_version UNIQUE(id,teacher_id,content_version);
ALTER TABLE ft_training.speech_questions ADD CONSTRAINT speech_question_kind UNIQUE(content_version,id,kind);
CREATE TABLE ft_training.speech_rounds(
 id uuid PRIMARY KEY,
 enrollment_id uuid NOT NULL,
 teacher_id uuid NOT NULL,
 content_version text NOT NULL,
 stage text NOT NULL CHECK(stage IN('word','sentence')),
 status text NOT NULL DEFAULT 'in_progress' CHECK(status IN('in_progress','passed','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 FOREIGN KEY(enrollment_id,teacher_id,content_version) REFERENCES ft_training.enrollments(id,teacher_id,content_version),
 FOREIGN KEY(content_version,stage) REFERENCES ft_training.assessment_rules(content_version,stage),
 UNIQUE(id,enrollment_id,teacher_id,content_version),
 UNIQUE(id,content_version,stage),
 CHECK((status='in_progress' AND finished_at IS NULL) OR(status<>'in_progress' AND finished_at IS NOT NULL AND finished_at>=created_at))
);
CREATE UNIQUE INDEX speech_one_active_round ON ft_training.speech_rounds(enrollment_id,stage) WHERE status='in_progress';
CREATE TABLE ft_training.speech_round_items(
 round_id uuid NOT NULL,
 content_version text NOT NULL,
 stage text NOT NULL CHECK(stage IN('word','sentence')),
 item_id text NOT NULL,
 position integer NOT NULL CHECK(position>0),
 PRIMARY KEY(round_id,item_id),
 UNIQUE(round_id,position),
 UNIQUE(round_id,item_id,content_version),
 FOREIGN KEY(round_id,content_version,stage) REFERENCES ft_training.speech_rounds(id,content_version,stage),
 FOREIGN KEY(content_version,item_id,stage) REFERENCES ft_training.speech_questions(content_version,id,kind)
);
COMMENT ON TABLE ft_training.speech_rounds IS '第一二关考核轮次；服务端须在同一事务抽满规则要求的题数，锁定后不得随意换题';
COMMENT ON TABLE ft_training.speech_round_items IS '本轮抽中的题目及固定顺序，支持刷新或跨设备恢复';

ALTER TABLE ft_training.speech_assessments
 ADD COLUMN round_id uuid,
 ADD COLUMN scoring_rule_version text,
 ADD COLUMN pronunciation numeric CHECK(pronunciation BETWEEN 0 AND 100),
 ADD COLUMN fluency numeric CHECK(fluency BETWEEN 0 AND 100),
 ADD COLUMN rhythm numeric CHECK(rhythm BETWEEN 0 AND 100),
 ADD COLUMN integrity numeric CHECK(integrity BETWEEN 0 AND 100),
 ADD CONSTRAINT assessment_round_owner FOREIGN KEY(round_id,enrollment_id,teacher_id,content_version) REFERENCES ft_training.speech_rounds(id,enrollment_id,teacher_id,content_version),
 ADD CONSTRAINT assessment_round_item FOREIGN KEY(round_id,item_id,content_version) REFERENCES ft_training.speech_round_items(round_id,item_id,content_version),
 ADD CONSTRAINT assessment_rule_required CHECK(round_id IS NULL OR (scoring_rule_version IS NOT NULL AND length(trim(scoring_rule_version))>0)),
 ADD CONSTRAINT assessment_dimensions_required CHECK(round_id IS NULL OR status<>'scored' OR pronunciation IS NOT NULL);
CREATE INDEX speech_assessments_round ON ft_training.speech_assessments(round_id,created_at);
COMMENT ON COLUMN ft_training.speech_assessments.round_id IS '旧记录允许空；新接库提交必须由服务端提供轮次，并验证句子评分所需维度、评分公式与规则版本';

CREATE TABLE ft_training.teacher_feedback(
 id uuid PRIMARY KEY,
 teacher_id uuid NOT NULL REFERENCES ft_training.teachers(id),
 enrollment_id uuid,
 page_path text NOT NULL CHECK(length(trim(page_path)) BETWEEN 1 AND 500),
 stage text CHECK(stage IN('word','sentence','grammar')),
 question_id text,
 content_version text REFERENCES ft_training.content_versions(version),
 content text NOT NULL CHECK(length(trim(content)) BETWEEN 1 AND 5000),
 status text NOT NULL DEFAULT 'new' CHECK(status IN('new','reviewing','resolved','closed')),
 resolution_note text,
 client_submission_id uuid NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 FOREIGN KEY(enrollment_id,teacher_id) REFERENCES ft_training.enrollments(id,teacher_id),
 CHECK(question_id IS NULL OR(stage IS NOT NULL AND content_version IS NOT NULL)),
 CHECK(updated_at>=created_at),
 CHECK((status IN('new','reviewing') AND resolved_at IS NULL) OR(status IN('resolved','closed') AND resolved_at IS NOT NULL AND resolved_at>=created_at))
);
CREATE INDEX teacher_feedback_owner ON ft_training.teacher_feedback(teacher_id,created_at DESC);
CREATE INDEX teacher_feedback_queue ON ft_training.teacher_feedback(status,created_at);
COMMENT ON TABLE ft_training.teacher_feedback IS '教师体验反馈；页面不含令牌等敏感查询参数，题目存在性及查看处理权限由服务端检查';
INSERT INTO ft_training.schema_versions(version) VALUES(3);
COMMIT;
