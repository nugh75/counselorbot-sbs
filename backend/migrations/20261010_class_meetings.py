"""Class and group meetings (#175): meeting tables and the replay-safe `meeting` step type."""

from sqlalchemy import text
from .. import models

# Frozen #175 target check: every other step type keeps meeting_id empty.
MEETINGS_STEP_TARGET_CHECK = (
    "(step_type = 'tool' AND tool_key IS NOT NULL AND administration_plan_id IS NULL AND results_step_id IS NULL "
    "AND assignment_id IS NULL AND topic_id IS NULL AND meeting_id IS NULL) OR "
    "(step_type = 'questionnaire_administration' AND tool_key IS NULL AND administration_plan_id IS NOT NULL "
    "AND results_step_id IS NULL AND assignment_id IS NULL AND topic_id IS NULL AND meeting_id IS NULL) OR "
    "(step_type = 'guided_results_chat' AND tool_key IS NULL AND administration_plan_id IS NULL "
    "AND results_step_id IS NOT NULL AND assignment_id IS NULL AND topic_id IS NULL AND meeting_id IS NULL) OR "
    "(step_type = 'assignment' AND tool_key IS NULL AND administration_plan_id IS NULL "
    "AND results_step_id IS NULL AND assignment_id IS NOT NULL AND topic_id IS NULL AND meeting_id IS NULL) OR "
    "(step_type = 'forum' AND tool_key IS NULL AND administration_plan_id IS NULL "
    "AND results_step_id IS NULL AND assignment_id IS NULL AND topic_id IS NOT NULL AND meeting_id IS NULL) OR "
    "(step_type = 'pending' AND tool_key IS NULL AND administration_plan_id IS NULL "
    "AND results_step_id IS NULL AND assignment_id IS NULL AND topic_id IS NULL AND meeting_id IS NULL "
    "AND pending_config IS NOT NULL) OR "
    "(step_type = 'meeting' AND tool_key IS NULL AND administration_plan_id IS NULL "
    "AND results_step_id IS NULL AND assignment_id IS NULL AND topic_id IS NULL AND meeting_id IS NOT NULL)"
)


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(17520261010)"))
        # create_all already ran at startup; repeat it here so the references exist.
        models.ClassMeeting.__table__.create(connection, checkfirst=True)
        models.ClassMeetingAttendance.__table__.create(connection, checkfirst=True)
        connection.execute(text(
            "ALTER TABLE class_path_steps ADD COLUMN IF NOT EXISTS meeting_id INTEGER REFERENCES class_meetings(id)"))
        # Widen the #172 target check once; existing rows have no meeting and satisfy it.
        definition = connection.execute(text(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = "
            "'class_path_steps'::regclass AND conname = 'class_path_step_target'")).scalar()
        if definition is None or "meeting" not in definition:
            connection.execute(text("ALTER TABLE class_path_steps DROP CONSTRAINT IF EXISTS class_path_step_target"))
            connection.execute(text(
                "ALTER TABLE class_path_steps ADD CONSTRAINT class_path_step_target "
                f"CHECK ({MEETINGS_STEP_TARGET_CHECK})"))
