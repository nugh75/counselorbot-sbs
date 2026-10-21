"""#249: questionnaire analysis from a plan step or a student's own result."""
from sqlalchemy import text

# Frozen target constraint; existing step IDs and bindings are untouched.
STEP_TARGET_CHECK = (
    "(step_type = 'tool' AND tool_key IS NOT NULL AND administration_plan_id IS NULL AND results_step_id IS NULL "
    "AND assignment_id IS NULL AND topic_id IS NULL AND meeting_id IS NULL) OR "
    "(step_type = 'guided_chat' AND tool_key IS NOT NULL AND administration_plan_id IS NULL AND results_step_id IS NULL "
    "AND assignment_id IS NULL AND topic_id IS NULL AND meeting_id IS NULL) OR "
    "(step_type = 'questionnaire_administration' AND tool_key IS NULL AND administration_plan_id IS NOT NULL "
    "AND results_step_id IS NULL AND assignment_id IS NULL AND topic_id IS NULL AND meeting_id IS NULL) OR "
    "(step_type = 'guided_results_chat' AND administration_plan_id IS NULL "
    "AND ((results_step_id IS NOT NULL AND tool_key IS NULL) OR "
    "(results_step_id IS NULL AND tool_key IS NOT NULL AND tool_key IN ('QSA','QSAr','ZTPI','QPCS','QPCC','QAP'))) "
    "AND assignment_id IS NULL AND topic_id IS NULL AND meeting_id IS NULL) OR "
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
        connection.execute(text("SELECT pg_advisory_xact_lock(24920261021)"))
        definition = connection.execute(text(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = "
            "'class_path_steps'::regclass AND conname = 'class_path_step_target'"
        )).scalar()
        if definition and "QSAr" in definition:
            return
        connection.execute(text("ALTER TABLE class_path_steps DROP CONSTRAINT IF EXISTS class_path_step_target"))
        connection.execute(text("ALTER TABLE class_path_steps ADD CONSTRAINT class_path_step_target CHECK ("
                                + STEP_TARGET_CHECK + ")"))
