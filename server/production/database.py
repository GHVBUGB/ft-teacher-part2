"""PostgreSQL transactions; production never falls back to browser/mock state."""
from contextlib import contextmanager
import psycopg
from psycopg.rows import dict_row


class Database:
    def __init__(self, url):
        if not url:
            raise RuntimeError('DATABASE_URL is required')
        self.url = url

    @contextmanager
    def transaction(self):
        # TLS configuration belongs in DATABASE_URL; credentials are never logged.
        with psycopg.connect(self.url, row_factory=dict_row, connect_timeout=10) as connection:
            connection.execute("SET LOCAL statement_timeout = '15s'")
            connection.execute("SET LOCAL lock_timeout = '5s'")
            yield connection


def one(db, sql, args=()):
    return db.execute(sql, args).fetchone()


def rows(db, sql, args=()):
    return db.execute(sql, args).fetchall()


def lock(db, value):
    # Transaction-scoped: released on both commit and rollback.
    db.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))', (value,))


def allow_request(db, scope, subject_hash, maximum, seconds):
    record = one(db, '''INSERT INTO ft_training.request_limits(scope,subject_hash,window_start,hits)
      VALUES(%s,%s,to_timestamp(floor(extract(epoch FROM now())/%s)*%s),1)
      ON CONFLICT(scope,subject_hash,window_start) DO UPDATE SET hits=request_limits.hits+1
      RETURNING hits''', (scope, subject_hash, seconds, seconds))
    return record['hits'] <= maximum
