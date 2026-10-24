"""Recoverable display copy for the institute class password.

The external password is still verified against ``institutions.hashed_password``.
This migration only adds the encrypted copy used to show the class access code
to members of the class in the external administration step. Existing hashed
credentials have no readable copy: the teacher re-enters them once to enable the
display.
"""
from sqlalchemy import text
from ..db_compat import add_column_if_missing


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(20261022)"))
        add_column_if_missing(connection, "institutions", "encrypted_password", "TEXT")
