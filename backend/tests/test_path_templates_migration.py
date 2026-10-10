"""#172 upgrade contract against disposable synthetic PostgreSQL schemas."""

import os
import uuid
from importlib import import_module

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import IntegrityError

from backend import models

forum_steps = import_module("backend.migrations.20261010_forum_steps")
migration = import_module("backend.migrations.20261010_path_templates")
snapshots = import_module("backend.migrations.20261010_path_template_snapshots")


@pytest.fixture
def upgraded_tf7():
    """A TF7 schema: every typed step, without templates or pending steps."""
    # Never run against an operational database.
    assert os.environ["DATABASE_URL"].rsplit("/", 1)[-1].endswith("_test")
    engine = create_engine(os.environ["DATABASE_URL"])
    schema = "tpl172_" + uuid.uuid4().hex

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
        connection.execute(text("ALTER TABLE class_path_steps DROP COLUMN pending_config"))
        connection.execute(text("ALTER TABLE class_path_steps DROP COLUMN template_snapshot"))
        connection.execute(text("ALTER TABLE class_path_steps DROP COLUMN template_step_id"))
        connection.execute(text("ALTER TABLE class_paths DROP COLUMN template_id"))
        connection.execute(text("ALTER TABLE class_paths DROP COLUMN template_revision"))
        connection.execute(text("DROP TABLE path_template_steps"))
        connection.execute(text("DROP TABLE path_templates"))
    # The TF7 migration restores its own target check on the older schema.
    forum_steps.migrate(engine)
    yield engine
    with engine.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    engine.dispose()


def insert_path(connection):
    connection.execute(text(
        "INSERT INTO student_groups (id,code,name,is_active,owner_username,context_visible_to_students) "
        "VALUES (1,'SYN-172','Synthetic',true,'teacher',false)"))
    connection.execute(text(
        "INSERT INTO class_paths (id,group_id,title,mode,status,created_by,revision) "
        "VALUES (1,1,'Existing','recommended','draft','teacher',1)"))
    connection.execute(text(
        "INSERT INTO class_path_steps (id,path_id,position,step_type,tool_key) VALUES (12,1,1,'tool','timeline')"))


def test_upgrade_keeps_existing_paths_and_accepts_templates_on_second_run(upgraded_tf7):
    with upgraded_tf7.begin() as connection:
        insert_path(connection)
    for _ in range(2):
        migration.migrate(upgraded_tf7)
    with upgraded_tf7.begin() as connection:
        assert connection.execute(text(
            "SELECT id,step_type,tool_key,pending_config,template_step_id FROM class_path_steps")).all() == [
            (12, "tool", "timeline", None, None)]
        assert connection.execute(text("SELECT template_id FROM class_paths")).scalar() is None
        connection.execute(text(
            "INSERT INTO path_templates (id,owner_username,title,mode,revision) VALUES (1,'teacher','T','recommended',1)"))
        connection.execute(text(
            "INSERT INTO path_template_steps (id,template_id,position,step_type,config) "
            "VALUES (1,1,1,'forum','{\"title\":\"T\",\"body\":\"B\"}')"))
        connection.execute(text("UPDATE class_paths SET template_id = 1, template_revision = 1"))
        connection.execute(text(
            "INSERT INTO class_path_steps (id,path_id,position,step_type,pending_config,template_step_id) "
            "VALUES (13,1,2,'pending','{\"kind\":\"forum\"}',1)"))
    # Deleting a template keeps the applied copy and empties its origin links.
    with upgraded_tf7.begin() as connection:
        connection.execute(text("DELETE FROM path_templates WHERE id = 1"))
        assert connection.execute(text("SELECT template_id FROM class_paths")).scalar() is None
        assert connection.execute(text("SELECT template_step_id FROM class_path_steps WHERE id = 13")).scalar() is None


@pytest.mark.parametrize("values", [
    "(13,1,2,'pending',NULL,NULL)",
    "(13,1,2,'pending','timeline','{\"kind\":\"forum\"}')",
])
def test_upgraded_check_rejects_pending_steps_without_config_or_with_a_target(upgraded_tf7, values):
    with upgraded_tf7.begin() as connection:
        insert_path(connection)
    migration.migrate(upgraded_tf7)
    with pytest.raises(IntegrityError):
        with upgraded_tf7.begin() as connection:
            connection.execute(text(
                f"INSERT INTO class_path_steps (id,path_id,position,step_type,tool_key,pending_config) VALUES {values}"))


def test_snapshot_upgrade_takes_applied_steps_as_in_step_with_their_template(upgraded_tf7):
    with upgraded_tf7.begin() as connection:
        insert_path(connection)
    migration.migrate(upgraded_tf7)
    with upgraded_tf7.begin() as connection:
        connection.execute(text(
            "INSERT INTO path_templates (id,owner_username,title,mode,revision) VALUES (1,'teacher','T','recommended',1)"))
        connection.execute(text(
            "INSERT INTO path_template_steps (id,template_id,position,step_type,config,title) VALUES "
            "(5,1,1,'questionnaire_administration',:questionnaire,NULL),(6,1,2,'guided_results_chat',:chat,'Talk')"),
            {"questionnaire": '{"instrument_code":"QSA","locale":"it","plan_title":""}', "chat": '{"results_position":1}'})
        connection.execute(text(
            "INSERT INTO class_path_steps (id,path_id,position,step_type,pending_config,template_step_id) VALUES "
            "(13,1,2,'pending',:config,6)"), {"config": '{"kind":"guided_results_chat","results_step_id":12}'})
    for _ in range(2):
        snapshots.migrate(upgraded_tf7)
    with upgraded_tf7.begin() as connection:
        rows = dict(connection.execute(text("SELECT id, template_snapshot FROM class_path_steps")).all())
    assert rows == {12: None, 13: {"step_type": "guided_results_chat", "config": {"results_template_step_id": 5},
                                   "title": "Talk", "instructions": None}}
