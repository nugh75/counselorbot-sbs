"""Per-class permission for students' own APIs and ChatGPT (#217)."""

from sqlalchemy import text


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(21720261011)"))
        # Existing classes keep today's behaviour: allowed.
        connection.execute(text("ALTER TABLE class_settings ADD COLUMN IF NOT EXISTS students_personal_ai BOOLEAN NOT NULL DEFAULT TRUE"))
