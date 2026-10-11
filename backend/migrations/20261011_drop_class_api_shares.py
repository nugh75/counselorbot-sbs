"""Remove the teacher key sharing of #201, withdrawn by the owner on 2026-10-11.

The table was created at startup but never used (the feature shipped switched off).
"""

from sqlalchemy import text


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(20120261011)"))
        connection.execute(text("DROP TABLE IF EXISTS class_api_shares"))
        connection.execute(text("DELETE FROM configs WHERE key = 'class_api_sharing_enabled'"))
