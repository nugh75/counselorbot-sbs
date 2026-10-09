"""TF5 replay-safe deep-dive step target and bound guided sessions."""

from sqlalchemy import text
from .. import models

# Frozen TF5 target check: later slices widen it in their own migration, after
# adding their column, so this one must not read the current model constant.
TF5_STEP_TARGET_CHECK = (
    "(step_type = 'tool' AND tool_key IS NOT NULL AND administration_plan_id IS NULL AND results_step_id IS NULL) OR "
    "(step_type = 'questionnaire_administration' AND tool_key IS NULL AND administration_plan_id IS NOT NULL "
    "AND results_step_id IS NULL) OR "
    "(step_type = 'guided_results_chat' AND tool_key IS NULL AND administration_plan_id IS NULL "
    "AND results_step_id IS NOT NULL)"
)


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(15220261009)"))
        connection.execute(
            text(
                "ALTER TABLE class_path_steps ADD COLUMN IF NOT EXISTS results_step_id "
                "INTEGER REFERENCES class_path_steps(id)"
            )
        )
        # Widen the TF3 target check once; existing rows already satisfy it.
        definition = connection.execute(
            text(
                "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = "
                "'class_path_steps'::regclass AND conname = 'class_path_step_target'"
            )
        ).scalar()
        if definition is None or "guided_results_chat" not in definition:
            connection.execute(
                text(
                    "ALTER TABLE class_path_steps DROP CONSTRAINT IF EXISTS class_path_step_target"
                )
            )
            connection.execute(
                text(
                    "ALTER TABLE class_path_steps ADD CONSTRAINT class_path_step_target "
                    f"CHECK ({TF5_STEP_TARGET_CHECK})"
                )
            )
        models.ClassPathDeepDiveSession.__table__.create(connection, checkfirst=True)
