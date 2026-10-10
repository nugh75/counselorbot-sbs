"""Path templates (#172): template links on paths and replay-safe pending steps."""

from sqlalchemy import text
from .. import models

# Frozen #172 target check, added after its column; later slices widen it themselves.
TEMPLATES_STEP_TARGET_CHECK = (
    "(step_type = 'tool' AND tool_key IS NOT NULL AND administration_plan_id IS NULL AND results_step_id IS NULL "
    "AND assignment_id IS NULL AND topic_id IS NULL) OR "
    "(step_type = 'questionnaire_administration' AND tool_key IS NULL AND administration_plan_id IS NOT NULL "
    "AND results_step_id IS NULL AND assignment_id IS NULL AND topic_id IS NULL) OR "
    "(step_type = 'guided_results_chat' AND tool_key IS NULL AND administration_plan_id IS NULL "
    "AND results_step_id IS NOT NULL AND assignment_id IS NULL AND topic_id IS NULL) OR "
    "(step_type = 'assignment' AND tool_key IS NULL AND administration_plan_id IS NULL "
    "AND results_step_id IS NULL AND assignment_id IS NOT NULL AND topic_id IS NULL) OR "
    "(step_type = 'forum' AND tool_key IS NULL AND administration_plan_id IS NULL "
    "AND results_step_id IS NULL AND assignment_id IS NULL AND topic_id IS NOT NULL) OR "
    "(step_type = 'pending' AND tool_key IS NULL AND administration_plan_id IS NULL "
    "AND results_step_id IS NULL AND assignment_id IS NULL AND topic_id IS NULL AND pending_config IS NOT NULL)"
)


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(17220261010)"))
        # create_all already ran at startup; repeat it here so the references exist.
        models.PathTemplate.__table__.create(connection, checkfirst=True)
        models.PathTemplateStep.__table__.create(connection, checkfirst=True)
        connection.execute(text(
            "ALTER TABLE class_paths ADD COLUMN IF NOT EXISTS template_id "
            "INTEGER REFERENCES path_templates(id) ON DELETE SET NULL"))
        connection.execute(text("ALTER TABLE class_paths ADD COLUMN IF NOT EXISTS template_revision INTEGER"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_class_paths_template_id ON class_paths (template_id)"))
        connection.execute(text("ALTER TABLE class_path_steps ADD COLUMN IF NOT EXISTS pending_config JSON"))
        connection.execute(text(
            "ALTER TABLE class_path_steps ADD COLUMN IF NOT EXISTS template_step_id "
            "INTEGER REFERENCES path_template_steps(id) ON DELETE SET NULL"))
        # Widen the TF7 target check once; existing rows already satisfy it.
        definition = connection.execute(text(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = "
            "'class_path_steps'::regclass AND conname = 'class_path_step_target'")).scalar()
        if definition is None or "pending" not in definition:
            connection.execute(text("ALTER TABLE class_path_steps DROP CONSTRAINT IF EXISTS class_path_step_target"))
            connection.execute(text(
                "ALTER TABLE class_path_steps ADD CONSTRAINT class_path_step_target "
                f"CHECK ({TEMPLATES_STEP_TARGET_CHECK})"))
