"""Activity tools (#174): personal tools an assignment asks the student to use."""

from sqlalchemy import text
from ..db_compat import add_column_if_missing


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(17420261010)"))
        # Older assignments keep NULL: no tools, exactly as before.
        add_column_if_missing(connection, "teacher_assignments", "tool_keys", "JSON")
