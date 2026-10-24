"""Blind index column for the sealed ``logs.email`` (P11, docs/privacy/p11-cifratura-db.md).

Additive and nullable; SQLite files get it from ``create_all``. Existing rows stay as they are (no backfill here).
"""
from sqlalchemy import text
from ..db_compat import add_column_if_missing


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(2026102401)"))
        add_column_if_missing(connection, "logs", "email_idx", "VARCHAR")
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_logs_email_idx ON logs (email_idx)"))
