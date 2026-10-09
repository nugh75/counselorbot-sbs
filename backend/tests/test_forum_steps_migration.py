"""TF7 upgrade contract against disposable synthetic PostgreSQL schemas."""

import os
import uuid
from importlib import import_module

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import IntegrityError

from backend import models

typed_steps = import_module("backend.migrations.20261009_typed_administration_steps")
results_chat = import_module("backend.migrations.20261009_guided_results_chat_steps")
assignment_steps = import_module("backend.migrations.20261009_assignment_steps")
migration = import_module("backend.migrations.20261010_forum_steps")


@pytest.fixture
def upgraded_tf6():
    """A TF6 schema: typed, deep-dive and assignment steps without the forum target."""
    assert os.environ["DATABASE_URL"] == "postgresql://c5_test@127.0.0.1:18650/counselorbot_test"
    engine = create_engine(os.environ["DATABASE_URL"])
    schema = "tf154_" + uuid.uuid4().hex

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
        connection.execute(text("ALTER TABLE class_path_steps DROP COLUMN topic_id"))
    # The earlier migrations must still replay on a schema without the TF7 column.
    typed_steps.migrate(engine)
    results_chat.migrate(engine)
    assignment_steps.migrate(engine)
    yield engine
    with engine.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    engine.dispose()


def insert_path(connection):
    connection.execute(text(
        "INSERT INTO student_groups (id,code,name,is_active,owner_username,context_visible_to_students) "
        "VALUES (1,'SYN-154','Synthetic',true,'teacher',false)"))
    connection.execute(text(
        "INSERT INTO administration_plans (id,code,title,instrument_code,locale,status) "
        "VALUES (1,'AP-SYN','Synthetic','QSA','it','active')"))
    connection.execute(text(
        "INSERT INTO teacher_assignments (id,author_username,author_name,group_id,group_name,source_kind,"
        "source_id,snapshot,instructions,request_id,request_hash) "
        "VALUES (1,'teacher','Teacher',1,'Synthetic','goal',1,'{\"title\":\"Goal\"}','','req-154','hash')"))
    connection.execute(text(
        "INSERT INTO forum_topics (id,group_id,title,body,author_username,author_display_name,status,pinned,locked) "
        "VALUES (1,1,'Synthetic','Synthetic','teacher','Teacher','published',false,false)"))
    connection.execute(text(
        "INSERT INTO class_paths (id,group_id,title,mode,status,created_by,revision,published_at) "
        "VALUES (1,1,'Typed','recommended','published','teacher',1,'2026-01-01')"))
    connection.execute(text(
        "INSERT INTO class_path_steps (id,path_id,position,step_type,tool_key,administration_plan_id,"
        "results_step_id,assignment_id,active_from) VALUES "
        "(12,1,1,'tool','timeline',NULL,NULL,NULL,'2026-01-01'),"
        "(13,1,2,'questionnaire_administration',NULL,1,NULL,NULL,'2026-01-01'),"
        "(14,1,3,'guided_results_chat',NULL,NULL,13,NULL,'2026-01-01'),"
        "(15,1,4,'assignment',NULL,NULL,NULL,1,'2026-01-01')"))


def test_upgrade_keeps_existing_steps_and_accepts_forum_steps_on_second_run(upgraded_tf6):
    with upgraded_tf6.begin() as connection:
        insert_path(connection)
    for _ in range(2):
        migration.migrate(upgraded_tf6)
    with upgraded_tf6.begin() as connection:
        rows = connection.execute(text(
            "SELECT id,step_type,tool_key,administration_plan_id,results_step_id,assignment_id,topic_id "
            "FROM class_path_steps ORDER BY id")).all()
        assert [tuple(row) for row in rows] == [
            (12, "tool", "timeline", None, None, None, None),
            (13, "questionnaire_administration", None, 1, None, None, None),
            (14, "guided_results_chat", None, None, 13, None, None),
            (15, "assignment", None, None, None, 1, None),
        ]
        connection.execute(text(
            "INSERT INTO class_path_steps (id,path_id,position,step_type,topic_id) VALUES (16,1,5,'forum',1)"))
    # A referenced discussion cannot be deleted from under a step...
    with pytest.raises(IntegrityError):
        with upgraded_tf6.begin() as connection:
            connection.execute(text("DELETE FROM forum_topics WHERE id = 1"))
    # ...but deleting the whole class still cascades to its topics and paths.
    with upgraded_tf6.begin() as connection:
        connection.execute(text("DELETE FROM student_groups WHERE id = 1"))
        assert connection.execute(text("SELECT count(*) FROM class_path_steps")).scalar() == 0


@pytest.mark.parametrize("values", [
    "(16,1,5,'forum',NULL,NULL,NULL,NULL,NULL)",
    "(16,1,5,'forum','timeline',NULL,NULL,NULL,1)",
    "(16,1,5,'forum',NULL,NULL,NULL,1,1)",
    "(16,1,5,'tool','timeline',NULL,NULL,NULL,1)",
    "(16,1,5,'questionnaire_administration',NULL,1,NULL,NULL,1)",
    "(16,1,5,'guided_results_chat',NULL,NULL,13,NULL,1)",
    "(16,1,5,'assignment',NULL,NULL,NULL,1,1)",
])
def test_upgraded_check_rejects_mixed_targets(upgraded_tf6, values):
    with upgraded_tf6.begin() as connection:
        insert_path(connection)
    migration.migrate(upgraded_tf6)
    with pytest.raises(IntegrityError):
        with upgraded_tf6.begin() as connection:
            connection.execute(text(
                "INSERT INTO class_path_steps (id,path_id,position,step_type,tool_key,"
                f"administration_plan_id,results_step_id,assignment_id,topic_id) VALUES {values}"))
