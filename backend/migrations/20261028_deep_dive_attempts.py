"""Keep all analysis attempts for the same step and result."""
from sqlalchemy import inspect, text


def migrate(engine):
    table = "class_path_deep_dive_sessions"
    if not inspect(engine).has_table(table):
        return
    if engine.dialect.name == "postgresql":
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE class_path_deep_dive_sessions DROP CONSTRAINT IF EXISTS uq_deep_dive_step_result"))
