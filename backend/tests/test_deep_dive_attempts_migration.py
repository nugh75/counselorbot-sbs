"""Upgrade an old Postgres schema without losing analysis bindings."""
import os
import uuid
from datetime import UTC, datetime
from importlib import import_module

import pytest
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import Session

from backend import models


@pytest.mark.postgres_only
def test_migration_keeps_existing_binding_and_allows_another_attempt():
    assert os.environ["DATABASE_URL"] == "postgresql://c5_test@127.0.0.1:18650/counselorbot_test"
    schema = "attempts_" + uuid.uuid4().hex
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
            conn.execute(text("ALTER TABLE class_path_deep_dive_sessions ADD CONSTRAINT uq_deep_dive_step_result UNIQUE (step_id, username, result_id)"))
        with Session(engine) as db, db.begin():
            group = models.StudentGroup(code="attempt-test", name="Class", owner_username="teacher")
            db.add(group); db.flush()
            path = models.ClassPath(group_id=group.id, title="Plan", created_by="teacher")
            db.add(path); db.flush()
            step = models.ClassPathStep(path_id=path.id, position=1, step_type="tool", tool_key="QSA")
            result = models.QuestionnaireResult(session_id="source", questionnaire_type="QSA", username="student")
            db.add_all([step, result]); db.flush()
            db.add(models.ClassPathDeepDiveSession(step_id=step.id, username="student", result_id=result.id,
                                                   session_id="previous", started_at=datetime.now(UTC)))
        migrate = import_module("backend.migrations.20261028_deep_dive_attempts").migrate
        migrate(engine); migrate(engine)
        assert "uq_deep_dive_step_result" not in {c["name"] for c in inspect(engine).get_unique_constraints("class_path_deep_dive_sessions")}
        with Session(engine) as db, db.begin():
            previous = db.query(models.ClassPathDeepDiveSession).one()
            assert previous.session_id == "previous"
            db.add(models.ClassPathDeepDiveSession(step_id=previous.step_id, username=previous.username,
                                                   result_id=previous.result_id, session_id="new", started_at=datetime.now(UTC)))
        with Session(engine) as db:
            assert db.query(models.ClassPathDeepDiveSession).count() == 2
    finally:
        with engine.begin() as conn:
            conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        engine.dispose()
