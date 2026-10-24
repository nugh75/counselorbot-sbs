"""Per-class permission for students' own APIs and ChatGPT (#217)."""

from sqlalchemy import text
from ..db_compat import add_column_if_missing


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(21720261011)"))
        # Existing classes keep today's behaviour: allowed.
        add_column_if_missing(connection, "class_settings", "students_personal_ai", "BOOLEAN NOT NULL", default="TRUE")
