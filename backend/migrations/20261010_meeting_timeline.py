"""Meetings on the student's timeline (#189): the teacher's per-meeting choice."""

from sqlalchemy import text
from ..db_compat import add_column_if_missing


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(18920261010)"))
        # Existing meetings appear on the timeline, like new ones by default.
        add_column_if_missing(connection, "class_meetings", "show_on_timeline", "BOOLEAN NOT NULL", default="true")
