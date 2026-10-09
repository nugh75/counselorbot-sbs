"""TF5 upgrade contract against disposable synthetic PostgreSQL schemas."""

import os
import uuid
from importlib import import_module
import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import IntegrityError
from backend import models

typed_steps = import_module("backend.migrations.20261009_typed_administration_steps")
migration = import_module("backend.migrations.20261009_guided_results_chat_steps")


@pytest.fixture
def upgraded_tf4():
    """A TF4 schema: typed steps without the deep-dive column, check or table."""
    assert (
        os.environ["DATABASE_URL"]
        == "postgresql://c5_test@127.0.0.1:18650/counselorbot_test"
    )
    engine = create_engine(os.environ["DATABASE_URL"])
    schema = "tf152_" + uuid.uuid4().hex

    @event.listens_for(engine, "connect")
    def scope(connection, _):
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute(f'SET search_path TO "{schema}"')
        connection.autocommit = False

    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        models.Base.metadata.create_all(connection)
        connection.execute(text("DROP TABLE class_path_deep_dive_sessions"))
        connection.execute(
            text("ALTER TABLE class_path_steps DROP CONSTRAINT class_path_step_target")
        )
        connection.execute(text("ALTER TABLE class_path_steps DROP COLUMN results_step_id"))
    typed_steps.migrate(engine)
    yield engine
    with engine.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    engine.dispose()


def insert_path(connection):
    connection.execute(
        text(
            "INSERT INTO student_groups (id,code,name,is_active,owner_username,context_visible_to_students) "
            "VALUES (1,'SYN-152','Synthetic',true,'teacher',false)"
        )
    )
    connection.execute(
        text(
            "INSERT INTO administration_plans (id,code,title,instrument_code,locale,status) "
            "VALUES (1,'AP-SYN','Synthetic','QSA','it','active')"
        )
    )
    connection.execute(
        text(
            "INSERT INTO class_paths (id,group_id,title,mode,status,created_by,revision,published_at) "
            "VALUES (1,1,'Typed','recommended','published','teacher',1,'2026-01-01')"
        )
    )
    connection.execute(
        text(
            "INSERT INTO class_path_steps (id,path_id,position,step_type,tool_key,administration_plan_id,active_from) "
            "VALUES (12,1,1,'tool','timeline',NULL,'2026-01-01'),"
            "(13,1,2,'questionnaire_administration',NULL,1,'2026-01-01')"
        )
    )


def test_upgrade_keeps_typed_steps_and_accepts_deep_dives_on_second_run(upgraded_tf4):
    with upgraded_tf4.begin() as connection:
        insert_path(connection)
    for _ in range(2):
        migration.migrate(upgraded_tf4)
    with upgraded_tf4.begin() as connection:
        rows = connection.execute(
            text("SELECT id,step_type,results_step_id FROM class_path_steps ORDER BY id")
        ).all()
        assert [tuple(row) for row in rows] == [
            (12, "tool", None),
            (13, "questionnaire_administration", None),
        ]
        connection.execute(
            text(
                "INSERT INTO class_path_steps (id,path_id,position,step_type,results_step_id) "
                "VALUES (14,1,3,'guided_results_chat',13)"
            )
        )
        assert (
            connection.execute(
                text("SELECT count(*) FROM class_path_deep_dive_sessions")
            ).scalar()
            == 0
        )


@pytest.mark.parametrize(
    "values",
    [
        "(15,1,3,'guided_results_chat',NULL,NULL,NULL)",
        "(15,1,3,'guided_results_chat','timeline',NULL,13)",
        "(15,1,3,'tool','timeline',NULL,13)",
        "(15,1,3,'questionnaire_administration',NULL,1,13)",
    ],
)
def test_upgraded_check_rejects_mixed_targets(upgraded_tf4, values):
    with upgraded_tf4.begin() as connection:
        insert_path(connection)
    migration.migrate(upgraded_tf4)
    with pytest.raises(IntegrityError):
        with upgraded_tf4.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO class_path_steps "
                    "(id,path_id,position,step_type,tool_key,administration_plan_id,results_step_id) "
                    f"VALUES {values}"
                )
            )
