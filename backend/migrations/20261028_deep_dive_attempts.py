"""Keep all analysis attempts for the same step and result."""
from sqlalchemy import inspect, text

from .. import models
from ..sqlite_schema import sqlite_rebuild_table


def migrate(engine):
    table = "class_path_deep_dive_sessions"
    if not inspect(engine).has_table(table):
        return
    if engine.dialect.name == "sqlite":
        constraints = inspect(engine).get_unique_constraints(table)
        if any(c.get("name") == "uq_deep_dive_step_result" for c in constraints):
            with sqlite_rebuild_table(engine, table, copy_from=models.ClassPathDeepDiveSession.__table__):
                pass
    elif engine.dialect.name == "postgresql":
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE class_path_deep_dive_sessions DROP CONSTRAINT IF EXISTS uq_deep_dive_step_result"))
