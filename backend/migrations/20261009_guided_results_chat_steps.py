"""TF5 replay-safe deep-dive step target and bound guided sessions."""

from sqlalchemy import text
from .. import models


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
                    f"CHECK ({models.STEP_TARGET_CHECK})"
                )
            )
        models.ClassPathDeepDiveSession.__table__.create(connection, checkfirst=True)
