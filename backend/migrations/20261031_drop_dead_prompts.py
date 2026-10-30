"""Remove prompt keys that no flow reads (prompt coherence audit, D01).

Editing them in Administration changed nothing; the factory catalogue no
longer defines them, so the seed does not recreate them.
"""
from sqlalchemy import inspect, text

DEAD_PROMPT_KEYS = ("pqbl_skill_extraction_prompt",)


def drop_dead_prompt_keys(conn):
    if not inspect(conn).has_table("configs"):
        return
    for key in DEAD_PROMPT_KEYS:
        conn.execute(text("DELETE FROM configs WHERE key = :key"), {"key": key})


def migrate(engine):
    with engine.begin() as conn:
        drop_dead_prompt_keys(conn)
