"""Who confirms meeting attendance: the student, the teacher or either."""

from sqlalchemy import text


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(18920261022)"))
        # Existing meetings keep the student's own mark.
        connection.execute(text(
            "ALTER TABLE class_meetings ADD COLUMN IF NOT EXISTS attendance_mode VARCHAR(20) NOT NULL DEFAULT 'student'"))
        connection.execute(text(
            "ALTER TABLE class_meetings DROP CONSTRAINT IF EXISTS class_meeting_attendance_mode"))
        connection.execute(text(
            "ALTER TABLE class_meetings ADD CONSTRAINT class_meeting_attendance_mode "
            "CHECK (attendance_mode IN ('student', 'teacher', 'both'))"))
        connection.execute(text(
            "ALTER TABLE class_meeting_attendance ADD COLUMN IF NOT EXISTS marked_by VARCHAR"))
