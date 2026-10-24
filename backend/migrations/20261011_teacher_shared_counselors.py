"""Teachers offer their API-backed counselors to their classes; replaces the per-class key."""

from sqlalchemy import text
from ..db_compat import add_column_if_missing


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(22620261011)"))
        add_column_if_missing(connection, "personal_ai_routing", "share_with_classes", "BOOLEAN NOT NULL", default="FALSE")
        add_column_if_missing(connection, "personal_ai_routing", "share_last_error", "VARCHAR(64)")
        # The single key per class is replaced; the table only ever held test rows.
        connection.execute(text("DROP TABLE IF EXISTS class_api_shares"))
