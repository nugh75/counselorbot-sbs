"""Recoverable display copy for the institute class password.

The external password is still verified against ``institutions.hashed_password``.
This migration only adds the encrypted copy used to show the class access code
to members of the class in the external administration step. Existing hashed
credentials have no readable copy: the teacher re-enters them once to enable the
display.
"""
from sqlalchemy import text


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(20261022)"))
        connection.execute(
            text(
                "ALTER TABLE institutions ADD COLUMN IF NOT EXISTS encrypted_password TEXT"
            )
        )
