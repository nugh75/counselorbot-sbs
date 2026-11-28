"""A legacy classes table gains `image_url` before the ORM reads it."""
import os
import uuid
from importlib import import_module

import pytest
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import Session

from backend import models


@pytest.mark.postgres_only
def test_legacy_student_groups_gain_image_url_and_orm_reads_work():
    schema = "group_image_" + uuid.uuid4().hex
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA "{schema}"'))

    @event.listens_for(engine, "connect")
    def scope(connection, _):
        with connection.cursor() as cursor:
            cursor.execute(f'SET search_path TO "{schema}"')
        connection.commit()

    engine.dispose()
    try:
        models.Base.metadata.create_all(engine)
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE student_groups DROP COLUMN image_url"))
        migrate = import_module("backend.migrations.20261128_student_group_image_url").migrate
        migrate(engine)
        migrate(engine)
        assert "image_url" in {c["name"] for c in inspect(engine).get_columns("student_groups")}
        with Session(engine) as db, db.begin():
            db.add(models.StudentGroup(code="image-test", name="Class", owner_username="teacher"))
        with Session(engine) as db:
            assert db.query(models.StudentGroup).one().image_url is None
    finally:
        with engine.begin() as conn:
            conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        engine.dispose()
