"""TF6 replay-safe assignment step target."""

from sqlalchemy import text

# Frozen TF6 target check, added after its column; later slices widen it themselves.
TF6_STEP_TARGET_CHECK = (
    "(step_type = 'tool' AND tool_key IS NOT NULL AND administration_plan_id IS NULL AND results_step_id IS NULL "
    "AND assignment_id IS NULL) OR "
    "(step_type = 'questionnaire_administration' AND tool_key IS NULL AND administration_plan_id IS NOT NULL "
    "AND results_step_id IS NULL AND assignment_id IS NULL) OR "
    "(step_type = 'guided_results_chat' AND tool_key IS NULL AND administration_plan_id IS NULL "
    "AND results_step_id IS NOT NULL AND assignment_id IS NULL) OR "
    "(step_type = 'assignment' AND tool_key IS NULL AND administration_plan_id IS NULL "
    "AND results_step_id IS NULL AND assignment_id IS NOT NULL)"
)


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(15320261009)"))
        connection.execute(
            text(
                "ALTER TABLE class_path_steps ADD COLUMN IF NOT EXISTS assignment_id "
                "INTEGER REFERENCES teacher_assignments(id) ON DELETE RESTRICT"
            )
        )
        # Widen the TF5 target check once; existing rows already satisfy it.
        definition = connection.execute(
            text(
                "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = "
                "'class_path_steps'::regclass AND conname = 'class_path_step_target'"
            )
        ).scalar()
        if definition is None or "assignment_id" not in definition:
            connection.execute(
                text("ALTER TABLE class_path_steps DROP CONSTRAINT IF EXISTS class_path_step_target")
            )
            connection.execute(
                text(
                    "ALTER TABLE class_path_steps ADD CONSTRAINT class_path_step_target "
                    f"CHECK ({TF6_STEP_TARGET_CHECK})"
                )
            )
