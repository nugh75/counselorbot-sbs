"""Create `class_council_shares` for teacher-selected conversations (#1027).

A new table, so `create_all` would create it on startup anyway; this migration
is idempotent and covers databases where the startup step is skipped.
"""
from .. import models


def migrate(engine):
    models.ClassCouncilShare.__table__.create(bind=engine, checkfirst=True)
