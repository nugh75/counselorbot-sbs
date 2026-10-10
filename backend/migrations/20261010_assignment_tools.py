"""Activity tools (#174): personal tools an assignment asks the student to use."""

from sqlalchemy import text


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(17420261010)"))
        # Older assignments keep NULL: no tools, exactly as before.
        connection.execute(text("ALTER TABLE teacher_assignments ADD COLUMN IF NOT EXISTS tool_keys JSON"))
