"""Informational planned day for class path steps.

The planned day coexists with the optional deadline. It is shown to teachers and
students but never used for availability or completion checks.
"""
from sqlalchemy import text


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(2026102201)"))
        connection.execute(
            text(
                "ALTER TABLE class_path_steps ADD COLUMN IF NOT EXISTS scheduled_date DATE"
            )
        )
