"""TF3 replay-safe typed envelopes and truthful legacy result provenance."""

from sqlalchemy import text
from .. import models


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(15020261009)"))
        additions = {
            "administration_plans": [
                "delivery_mode VARCHAR(32) NOT NULL DEFAULT 'in_app'"
            ],
            "class_path_steps": [
                "step_type VARCHAR(40) NOT NULL DEFAULT 'tool'",
                "administration_plan_id INTEGER REFERENCES administration_plans(id) ON DELETE RESTRICT",
                "active_from TIMESTAMPTZ",
            ],
            "questionnaire_results": [
                "source VARCHAR(24) NOT NULL DEFAULT 'in-app'",
                "capture_method VARCHAR(32) NOT NULL DEFAULT 'legacy_unknown'",
                "source_system VARCHAR(64)",
                "source_record_id VARCHAR",
                "locale VARCHAR(8)",
            ],
        }
        for table, columns in additions.items():
            for column in columns:
                connection.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column}")
                )
        connection.execute(
            text("ALTER TABLE class_path_steps ALTER COLUMN tool_key DROP NOT NULL")
        )
        connection.execute(
            text(
                "UPDATE administration_plans SET delivery_mode = 'external_it' WHERE locale = 'it' AND delivery_mode = 'in_app'"
            )
        )
        connection.execute(
            text("""UPDATE class_path_steps s SET active_from = p.published_at FROM class_paths p
            WHERE s.path_id = p.id AND s.step_type = 'tool' AND s.active_from IS NULL AND p.published_at IS NOT NULL""")
        )
        constraint = connection.execute(
            text(
                "SELECT 1 FROM pg_constraint WHERE conrelid = 'class_path_steps'::regclass AND conname = 'class_path_step_target'"
            )
        ).first()
        if not constraint:
            connection.execute(
                text("""ALTER TABLE class_path_steps ADD CONSTRAINT class_path_step_target CHECK (
                (step_type = 'tool' AND tool_key IS NOT NULL AND administration_plan_id IS NULL) OR
                (step_type = 'questionnaire_administration' AND tool_key IS NULL AND administration_plan_id IS NOT NULL))""")
            )
        for table in (
            models.QuestionnaireGuidedEntry.__table__,
            models.QuestionnaireImportConfirmation.__table__,
            models.ClassPathStepEvidence.__table__,
        ):
            table.create(connection, checkfirst=True)
