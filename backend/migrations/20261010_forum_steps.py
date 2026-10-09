"""TF7 replay-safe forum step target."""

from sqlalchemy import text
from .. import models

# Frozen TF7 target check, added after its column; later slices widen it themselves.
TF7_STEP_TARGET_CHECK = (
    "(step_type = 'tool' AND tool_key IS NOT NULL AND administration_plan_id IS NULL AND results_step_id IS NULL "
    "AND assignment_id IS NULL AND topic_id IS NULL) OR "
    "(step_type = 'questionnaire_administration' AND tool_key IS NULL AND administration_plan_id IS NOT NULL "
    "AND results_step_id IS NULL AND assignment_id IS NULL AND topic_id IS NULL) OR "
    "(step_type = 'guided_results_chat' AND tool_key IS NULL AND administration_plan_id IS NULL "
    "AND results_step_id IS NOT NULL AND assignment_id IS NULL AND topic_id IS NULL) OR "
    "(step_type = 'assignment' AND tool_key IS NULL AND administration_plan_id IS NULL "
    "AND results_step_id IS NULL AND assignment_id IS NOT NULL AND topic_id IS NULL) OR "
    "(step_type = 'forum' AND tool_key IS NULL AND administration_plan_id IS NULL "
    "AND results_step_id IS NULL AND assignment_id IS NULL AND topic_id IS NOT NULL)"
)


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    # The reference comes from the model, the single place that names the table.
    (foreign_key,) = models.ClassPathStep.__table__.c.topic_id.foreign_keys
    target = foreign_key.column
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(15420261010)"))
        connection.execute(
            text(
                "ALTER TABLE class_path_steps ADD COLUMN IF NOT EXISTS topic_id "
                f"INTEGER REFERENCES {target.table.name}({target.name})"
            )
        )
        # Widen the TF6 target check once; existing rows already satisfy it.
        definition = connection.execute(
            text(
                "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = "
                "'class_path_steps'::regclass AND conname = 'class_path_step_target'"
            )
        ).scalar()
        if definition is None or "topic_id" not in definition:
            connection.execute(
                text("ALTER TABLE class_path_steps DROP CONSTRAINT IF EXISTS class_path_step_target")
            )
            connection.execute(
                text(
                    "ALTER TABLE class_path_steps ADD CONSTRAINT class_path_step_target "
                    f"CHECK ({TF7_STEP_TARGET_CHECK})"
                )
            )
