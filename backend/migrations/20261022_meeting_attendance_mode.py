"""Who confirms meeting attendance: the student, the teacher or either."""

from sqlalchemy import text
from ..db_compat import add_column_if_missing


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(18920261022)"))
        # Existing meetings keep the student's own mark.
        add_column_if_missing(connection, "class_meetings", "attendance_mode", "VARCHAR(20) NOT NULL", default="'student'")
        connection.execute(text(
            "ALTER TABLE class_meetings DROP CONSTRAINT IF EXISTS class_meeting_attendance_mode"))
        connection.execute(text(
            "ALTER TABLE class_meetings ADD CONSTRAINT class_meeting_attendance_mode "
            "CHECK (attendance_mode IN ('student', 'teacher', 'both'))"))
        add_column_if_missing(connection, "class_meeting_attendance", "marked_by", "VARCHAR")
