BEGIN;
CREATE SCHEMA ft_training;
REVOKE ALL ON SCHEMA ft_training FROM PUBLIC;
CREATE TABLE ft_training.schema_versions(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ft_training.teachers(
 id uuid PRIMARY KEY, external_id text UNIQUE, email text NOT NULL UNIQUE CHECK(email=lower(email)),
 active boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ft_training.sessions(
 token_hash text PRIMARY KEY, teacher_id uuid NOT NULL REFERENCES ft_training.teachers(id),
 expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON ft_training.sessions(teacher_id);
CREATE TABLE ft_training.enrollments(
 id uuid PRIMARY KEY, teacher_id uuid NOT NULL REFERENCES ft_training.teachers(id),
 content_version text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,teacher_id)
);
CREATE TABLE ft_training.grammar_questions(
 content_version text NOT NULL, id text NOT NULL, prompt text NOT NULL,
 option_a text NOT NULL, option_b text NOT NULL, correct_option smallint NOT NULL CHECK(correct_option IN(0,1)),
 explanation text NOT NULL, PRIMARY KEY(content_version,id)
);
CREATE TABLE ft_training.grammar_rounds(
 id uuid PRIMARY KEY, enrollment_id uuid NOT NULL, teacher_id uuid NOT NULL,
 content_version text NOT NULL, question_order jsonb NOT NULL CHECK(jsonb_typeof(question_order)='array' AND jsonb_array_length(question_order)=30),
 status text NOT NULL DEFAULT 'in_progress' CHECK(status IN('in_progress','passed','failed')),
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 FOREIGN KEY(enrollment_id,teacher_id) REFERENCES ft_training.enrollments(id,teacher_id),
 UNIQUE(id,content_version),
 CHECK((status='in_progress' AND finished_at IS NULL) OR(status<>'in_progress' AND finished_at IS NOT NULL))
);
CREATE UNIQUE INDEX one_active_grammar_round ON ft_training.grammar_rounds(enrollment_id) WHERE status='in_progress';
CREATE TABLE ft_training.grammar_answers(
 round_id uuid NOT NULL, content_version text NOT NULL, question_id text NOT NULL,
 sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 30),
 selected_option smallint NOT NULL CHECK(selected_option IN(0,1)),
 correct boolean NOT NULL, client_submission_id uuid NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(round_id,question_id), UNIQUE(round_id,sequence),
 FOREIGN KEY(round_id,content_version) REFERENCES ft_training.grammar_rounds(id,content_version),
 FOREIGN KEY(content_version,question_id) REFERENCES ft_training.grammar_questions(content_version,id)
);
CREATE TABLE ft_training.speech_assessments(
 id uuid PRIMARY KEY, enrollment_id uuid NOT NULL, teacher_id uuid NOT NULL,
 item_id text NOT NULL, content_version text NOT NULL, provider text NOT NULL,
 provider_request_id text, client_submission_id uuid NOT NULL UNIQUE,
 status text NOT NULL CHECK(status IN('pending','scored','failed')),
 score numeric CHECK(score BETWEEN 0 AND 100), error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 FOREIGN KEY(enrollment_id,teacher_id) REFERENCES ft_training.enrollments(id,teacher_id),
 UNIQUE(provider,provider_request_id),
 CHECK((status='scored' AND score IS NOT NULL AND finished_at IS NOT NULL) OR(status<>'scored' AND score IS NULL))
);
INSERT INTO ft_training.schema_versions(version) VALUES(1);
COMMIT;
