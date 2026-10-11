"""Reasoning level per personal source (#202)."""

from sqlalchemy import text

LEVELS = ("none", "minimal", "low", "medium", "high", "xhigh")


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    allowed = ", ".join(f"'{level}'" for level in LEVELS)
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(20220261011)"))
        for table, column, name in (("personal_ai_routing", "default_reasoning", "personal_routing_reasoning_level"),
                                    ("personal_counselor_connections", "reasoning", "personal_counselor_reasoning_level")):
            connection.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} VARCHAR(16)"))
            connection.execute(text(f"""
                DO $$ BEGIN
                    ALTER TABLE {table} ADD CONSTRAINT {name} CHECK ({column} IS NULL OR {column} IN ({allowed}));
                EXCEPTION WHEN duplicate_object THEN NULL; END $$"""))
