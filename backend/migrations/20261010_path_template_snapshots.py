"""Update from template (#172): the template step each applied class step was copied from."""

import json

from sqlalchemy import text


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(17220261011)"))
        connection.execute(text("ALTER TABLE class_path_steps ADD COLUMN IF NOT EXISTS template_snapshot JSON"))
        # Steps applied before this column existed are taken as in step with their template.
        rows = connection.execute(text(
            "SELECT s.id, t.template_id, t.step_type, t.config, t.title, t.instructions "
            "FROM class_path_steps s JOIN path_template_steps t ON t.id = s.template_step_id "
            "WHERE s.template_snapshot IS NULL")).all()
        for step_id, template_id, step_type, config, title, instructions in rows:
            config = dict(config or {})
            if step_type == "guided_results_chat":
                source = connection.execute(text(
                    "SELECT id FROM path_template_steps WHERE template_id = :template AND position = :position"),
                    {"template": template_id, "position": config.get("results_position")}).scalar()
                config = {"results_template_step_id": source}
            snapshot = {"step_type": step_type, "config": config, "title": title, "instructions": instructions}
            connection.execute(text("UPDATE class_path_steps SET template_snapshot = CAST(:snapshot AS JSON) WHERE id = :id"),
                               {"snapshot": json.dumps(snapshot), "id": step_id})
