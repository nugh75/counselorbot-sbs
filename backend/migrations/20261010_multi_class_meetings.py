"""Meetings for more than one class or group (#190): the linked classes of a meeting."""

from sqlalchemy import text
from .. import models


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(19020261010)"))
        # Existing meetings keep their single class; links are only added from now on.
        models.ClassMeetingGroup.__table__.create(connection, checkfirst=True)
