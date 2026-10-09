"""Replay/upgrade contract against disposable synthetic PostgreSQL schemas."""

import os
import uuid
from importlib import import_module
import pytest
from sqlalchemy import create_engine, event, text
from backend import models

migration = import_module("backend.migrations.20261009_typed_administration_steps")


@pytest.fixture
def legacy():
    assert (
        os.environ["DATABASE_URL"]
        == "postgresql://c5_test@127.0.0.1:18650/counselorbot_test"
    )
    engine = create_engine(os.environ["DATABASE_URL"])
    schema = "tf150_" + uuid.uuid4().hex

    @event.listens_for(engine, "connect")
    def scope(connection, _):
        connection.autocommit = True
        with connection.cursor() as cursor:
            cursor.execute(f'SET search_path TO "{schema}"')
        connection.autocommit = False

    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        models.Base.metadata.create_all(connection)
        for table in [
            "class_path_step_evidence",
            "questionnaire_guided_entries",
            "questionnaire_import_confirmations",
        ]:
            connection.execute(text(f"DROP TABLE {table}"))
        connection.execute(
            text("ALTER TABLE class_path_steps DROP CONSTRAINT class_path_step_target")
        )
        for table, columns in {
            "class_path_steps": ["step_type", "administration_plan_id", "active_from"],
            "administration_plans": ["delivery_mode"],
            "questionnaire_results": [
                "source",
                "capture_method",
                "source_system",
                "source_record_id",
                "locale",
            ],
        }.items():
            for column in columns:
                connection.execute(text(f"ALTER TABLE {table} DROP COLUMN {column}"))
        connection.execute(
            text("ALTER TABLE class_path_steps ALTER COLUMN tool_key SET NOT NULL")
        )
    yield engine
    with engine.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    engine.dispose()


def test_upgrade_retains_steps_marks_and_unknown_provenance_on_second_run(legacy):
    with legacy.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO student_groups (id,code,name,is_active,owner_username,context_visible_to_students) VALUES (1,'SYN-150','Synthetic',true,'teacher',false)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO class_paths (id,group_id,title,mode,status,created_by,revision,published_at) VALUES (1,1,'Legacy','recommended','published','teacher',1,'2026-01-01')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO class_path_steps (id,path_id,position,tool_key,removed_at) VALUES (12,1,1,'QSA',NULL),(13,1,2,'timeline','2026-02-01')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO class_path_progress (step_id,username,state,source,actor_username) VALUES (13,'student','done','teacher','teacher')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO questionnaire_results (session_id,questionnaire_type,scores,username) VALUES ('old','QSA','{}','student')"
            )
        )
        connection.execute(
            text(
                "INSERT INTO administration_plans (code,title,instrument_code,locale,status) VALUES ('AP-LEGACY','Legacy','QSA','it','active')"
            )
        )
    for _ in range(2):
        migration.migrate(legacy)
        with legacy.begin() as connection:
            steps = connection.execute(
                text(
                    "SELECT id,tool_key,step_type,active_from,removed_at FROM class_path_steps ORDER BY id"
                )
            ).all()
            assert [(row.id, row.tool_key, row.step_type) for row in steps] == [
                (12, "QSA", "tool"),
                (13, "timeline", "tool"),
            ]
            assert all(
                row.active_from.year == 2026 and row.active_from.month == 1
                for row in steps
            )
            assert steps[1].removed_at is not None
            assert connection.execute(
                text("SELECT state,source FROM class_path_progress")
            ).one() == ("done", "teacher")
            assert connection.execute(
                text(
                    "SELECT source,capture_method,source_system,locale FROM questionnaire_results"
                )
            ).one() == ("in-app", "legacy_unknown", None, None)
            assert (
                connection.execute(
                    text("SELECT count(*) FROM questionnaire_guided_entries")
                ).scalar()
                == 0
            )
            assert (
                connection.execute(
                    text("SELECT delivery_mode FROM administration_plans")
                ).scalar()
                == "external_it"
            )


def test_empty_schema_migration_is_replay_safe(legacy):
    migration.migrate(legacy)
    migration.migrate(legacy)
    with legacy.begin() as connection:
        assert (
            connection.execute(
                text("SELECT count(*) FROM class_path_step_evidence")
            ).scalar()
            == 0
        )
