"""Meetings on the student's timeline (#189): the teacher's per-meeting choice."""

from sqlalchemy import text


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(18920261010)"))
        # Existing meetings appear on the timeline, like new ones by default.
        connection.execute(text(
            "ALTER TABLE class_meetings ADD COLUMN IF NOT EXISTS show_on_timeline BOOLEAN NOT NULL DEFAULT true"))
