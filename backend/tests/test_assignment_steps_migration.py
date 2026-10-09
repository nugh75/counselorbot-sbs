"""TF6 upgrade contract against disposable synthetic PostgreSQL schemas."""

import os
import uuid
from importlib import import_module

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import IntegrityError

from backend import models

typed_steps = import_module("backend.migrations.20261009_typed_administration_steps")
results_chat = import_module("backend.migrations.20261009_guided_results_chat_steps")
migration = import_module("backend.migrations.20261009_assignment_steps")


@pytest.fixture
def upgraded_tf5():
    """A TF5 schema: typed steps and deep dives without the assignment target."""
    assert os.environ["DATABASE_URL"] == "postgresql://c5_test@127.0.0.1:18650/counselorbot_test"
    engine = create_engine(os.environ["DATABASE_URL"])
    schema = "tf153_" + uuid.uuid4().hex

    @event.listens_for(engine, "connect")
    def scope(connection, _):
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute(f'SET search_path TO "{schema}"')
        connection.autocommit = False

    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        models.Base.metadata.create_all(connection)
        connection.execute(text("ALTER TABLE class_path_steps DROP CONSTRAINT class_path_step_target"))
        connection.execute(text("ALTER TABLE class_path_steps DROP COLUMN assignment_id"))
        connection.execute(text("DROP TABLE class_path_deep_dive_sessions"))
        connection.execute(text("ALTER TABLE class_path_steps DROP COLUMN results_step_id"))
    # The earlier migrations must still replay on a schema without the TF6 column.
    typed_steps.migrate(engine)
    results_chat.migrate(engine)
    yield engine
    with engine.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    engine.dispose()


def insert_path(connection):
    connection.execute(text(
        "INSERT INTO student_groups (id,code,name,is_active,owner_username,context_visible_to_students) "
        "VALUES (1,'SYN-153','Synthetic',true,'teacher',false)"))
    connection.execute(text(
        "INSERT INTO administration_plans (id,code,title,instrument_code,locale,status) "
        "VALUES (1,'AP-SYN','Synthetic','QSA','it','active')"))
    connection.execute(text(
        "INSERT INTO teacher_assignments (id,author_username,author_name,group_id,group_name,source_kind,"
        "source_id,snapshot,instructions,request_id,request_hash) "
        "VALUES (1,'teacher','Teacher',1,'Synthetic','goal',1,'{\"title\":\"Goal\"}','','req-153','hash')"))
    connection.execute(text(
        "INSERT INTO class_paths (id,group_id,title,mode,status,created_by,revision,published_at) "
        "VALUES (1,1,'Typed','recommended','published','teacher',1,'2026-01-01')"))
    connection.execute(text(
        "INSERT INTO class_path_steps (id,path_id,position,step_type,tool_key,administration_plan_id,"
        "results_step_id,active_from) VALUES "
        "(12,1,1,'tool','timeline',NULL,NULL,'2026-01-01'),"
        "(13,1,2,'questionnaire_administration',NULL,1,NULL,'2026-01-01'),"
        "(14,1,3,'guided_results_chat',NULL,NULL,13,'2026-01-01')"))


def test_upgrade_keeps_existing_steps_and_accepts_assignments_on_second_run(upgraded_tf5):
    with upgraded_tf5.begin() as connection:
        insert_path(connection)
    for _ in range(2):
        migration.migrate(upgraded_tf5)
    with upgraded_tf5.begin() as connection:
        rows = connection.execute(text(
            "SELECT id,step_type,tool_key,administration_plan_id,results_step_id,assignment_id "
            "FROM class_path_steps ORDER BY id")).all()
        assert [tuple(row) for row in rows] == [
            (12, "tool", "timeline", None, None, None),
            (13, "questionnaire_administration", None, 1, None, None),
            (14, "guided_results_chat", None, None, 13, None),
        ]
        connection.execute(text(
            "INSERT INTO class_path_steps (id,path_id,position,step_type,assignment_id) "
            "VALUES (15,1,4,'assignment',1)"))
    # A referenced assignment cannot be deleted from under a step.
    with pytest.raises(IntegrityError):
        with upgraded_tf5.begin() as connection:
            connection.execute(text("DELETE FROM teacher_assignments WHERE id = 1"))


@pytest.mark.parametrize("values", [
    "(15,1,4,'assignment',NULL,NULL,NULL,NULL)",
    "(15,1,4,'assignment','timeline',NULL,NULL,1)",
    "(15,1,4,'tool','timeline',NULL,NULL,1)",
    "(15,1,4,'questionnaire_administration',NULL,1,NULL,1)",
    "(15,1,4,'guided_results_chat',NULL,NULL,13,1)",
])
def test_upgraded_check_rejects_mixed_targets(upgraded_tf5, values):
    with upgraded_tf5.begin() as connection:
        insert_path(connection)
    migration.migrate(upgraded_tf5)
    with pytest.raises(IntegrityError):
        with upgraded_tf5.begin() as connection:
            connection.execute(text(
                "INSERT INTO class_path_steps "
                "(id,path_id,position,step_type,tool_key,administration_plan_id,results_step_id,assignment_id) "
                f"VALUES {values}"))
