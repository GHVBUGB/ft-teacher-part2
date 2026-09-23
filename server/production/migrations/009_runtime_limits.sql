BEGIN;
-- No identities are activated by this migration.
CREATE TABLE ft_training.request_limits (
 scope text NOT NULL,
 subject_hash text NOT NULL,
 window_start timestamptz NOT NULL,
 hits integer NOT NULL CHECK(hits>0),
 PRIMARY KEY(scope,subject_hash,window_start)
);
COMMENT ON TABLE ft_training.request_limits IS '认证和评测限流；只存哈希，不存IP或密码；服务端定期清理过期窗口';
CREATE INDEX request_limits_expiry ON ft_training.request_limits(window_start);
ALTER TABLE ft_training.speech_assessments ADD COLUMN request_digest text;
CREATE TABLE ft_training.provider_slots (
 id smallint PRIMARY KEY CHECK(id IN(1,2)),
 lease_owner uuid,
 lease_expires_at timestamptz
);
INSERT INTO ft_training.provider_slots(id) VALUES(1),(2);
COMMENT ON TABLE ft_training.provider_slots IS 'SpeechSuper全实例并发2；请求先持久化再调用，租约120秒大于供应商请求超时60秒';
INSERT INTO ft_training.schema_versions(version) VALUES(9);
COMMIT;
