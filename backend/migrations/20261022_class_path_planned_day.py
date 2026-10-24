"""Informational planned day for class path steps.

The planned day coexists with the optional deadline. It is shown to teachers and
students but never used for availability or completion checks.
"""
from sqlalchemy import text
from ..db_compat import add_column_if_missing


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(2026102201)"))
        add_column_if_missing(connection, "class_path_steps", "scheduled_date", "DATE")
