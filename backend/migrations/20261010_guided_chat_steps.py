"""Guided chat steps and their follow-up (#177): `guided_chat` type and `follows_step_id`."""

from sqlalchemy import text

# Frozen #177 target check: `guided_chat` names its chat in tool_key like a tool step.
GUIDED_CHAT_STEP_TARGET_CHECK = (
    "(step_type = 'tool' AND tool_key IS NOT NULL AND administration_plan_id IS NULL AND results_step_id IS NULL "
    "AND assignment_id IS NULL AND topic_id IS NULL AND meeting_id IS NULL) OR "
    "(step_type = 'guided_chat' AND tool_key IS NOT NULL AND administration_plan_id IS NULL AND results_step_id IS NULL "
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
        connection.execute(text("SELECT pg_advisory_xact_lock(17720261010)"))
        connection.execute(text(
            "ALTER TABLE class_path_steps ADD COLUMN IF NOT EXISTS follows_step_id INTEGER "
            "REFERENCES class_path_steps(id) ON DELETE SET NULL"))
        # Widen the #175 target check once; existing rows have no guided_chat step.
        definition = connection.execute(text(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = "
            "'class_path_steps'::regclass AND conname = 'class_path_step_target'")).scalar()
        if definition is None or "guided_chat'" not in definition:
            connection.execute(text("ALTER TABLE class_path_steps DROP CONSTRAINT IF EXISTS class_path_step_target"))
            connection.execute(text(
                "ALTER TABLE class_path_steps ADD CONSTRAINT class_path_step_target "
                f"CHECK ({GUIDED_CHAT_STEP_TARGET_CHECK})"))
        present = connection.execute(text(
            "SELECT 1 FROM pg_constraint WHERE conrelid = 'class_path_steps'::regclass "
            "AND conname = 'class_path_step_follows'")).scalar()
        if not present:
            connection.execute(text(
                "ALTER TABLE class_path_steps ADD CONSTRAINT class_path_step_follows "
                "CHECK (follows_step_id IS NULL OR step_type = 'meeting')"))
