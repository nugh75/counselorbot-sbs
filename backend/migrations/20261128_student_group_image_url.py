"""Add `student_groups.image_url` before any ORM read of the classes table.

`create_all` does not add columns to tables that already exist. The column was
added later in `_run_seed_and_migrations`, but earlier startup migrations already
query `StudentGroup` through the ORM, which selects every mapped column: on a
legacy database the very first read failed with `column image_url does not exist`.
Idempotent, safe to run on every start.
"""
from sqlalchemy import inspect

from ..db_compat import add_column_if_missing


def migrate(engine):
    if not inspect(engine).has_table("student_groups"):
        return
    with engine.begin() as conn:
        add_column_if_missing(conn, "student_groups", "image_url", "VARCHAR")
