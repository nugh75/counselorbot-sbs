"""Teachers offer their API-backed counselors to their classes; replaces the per-class key."""

from sqlalchemy import text


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(22620261011)"))
        connection.execute(text("ALTER TABLE personal_ai_routing ADD COLUMN IF NOT EXISTS share_with_classes BOOLEAN NOT NULL DEFAULT FALSE"))
        connection.execute(text("ALTER TABLE personal_ai_routing ADD COLUMN IF NOT EXISTS share_last_error VARCHAR(64)"))
        # The single key per class is replaced; the table only ever held test rows.
        connection.execute(text("DROP TABLE IF EXISTS class_api_shares"))
