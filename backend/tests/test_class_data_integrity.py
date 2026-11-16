"""Class data integrity (#1000): one membership per student, complete class deletion,
consistent goal catalog targets. Synthetic data on isolated PostgreSQL schemas."""
import os
import uuid
from datetime import UTC, datetime, timedelta
from importlib import import_module

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend import auth, database, models
from backend.routes import groups
from backend.tests.artifact_database import artifact_session

migration = import_module("backend.migrations.20261116_class_data_integrity")


@pytest.fixture
def class_api(tmp_path, monkeypatch):
    monkeypatch.setattr(groups, "CLASS_IMAGES_STORAGE_DIR", str(tmp_path))
    with artifact_session() as db:
        group = models.StudentGroup(code="GR-INTEG1", name="Synthetic class", owner_username="owner")
        db.add(group)
        db.flush()
        identity = {"username": "owner", "name": "Owner", "groups": ["docenti"],
                    "is_admin": False, "is_researcher": False, "authenticated": True}
        app = FastAPI()
        app.include_router(groups.router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        with TestClient(app) as client:
            yield client, db, group.id, tmp_path


def _link_everything(db, gid):
    now = datetime.now(UTC)
    db.add_all([
        models.GroupMembership(group_id=gid, username="student"),
        models.TeacherNote(group_id=gid, username="student", author_username="owner", text="Note"),
        models.GroupShare(group_id=gid, shared_with_username="co-teacher", granted_by_username="owner"),
        models.ClassCouncilLink(group_id=gid, token="tok-" + uuid.uuid4().hex, password_hash="x",
                                created_by="owner", expires_at=now + timedelta(days=1)),
        models.ClassPairingCode(group_id=gid, key_hash=uuid.uuid4().hex * 2, created_at=now,
                                expires_at=now + timedelta(days=7)),
        models.LocalStudent(username="ls-" + uuid.uuid4().hex[:8], pseudonym="Luna", group_id=gid,
                            personal_code_hash=uuid.uuid4().hex * 2, created_at=now),
    ])
    entry = models.GoalCatalogEntry(author_username="owner", group_id=gid, data={})
    goal = models.PersonalGoal(username="student", title="Goal", shared_group_id=gid)
    other_goal = models.PersonalGoal(username="student", title="Other", shared_group_id=gid + 1000)
    notebook = models.TeacherPracticeNotebook(owner_username="owner", title="Test student", group_ids=[gid, gid + 1000])
    db.add_all([entry, goal, other_goal, notebook])
    db.flush()
    db.add(models.GoalCatalogTarget(catalog_id=entry.id, group_id=gid))
    assignment = models.TeacherAssignment(author_username="owner", author_name="Owner", group_id=gid,
                                          group_name="Synthetic class", source_kind="goal",
                                          source_id=entry.id, snapshot={}, request_id="req-1", request_hash="h")
    path = models.ClassPath(group_id=gid, title="Plan", created_by="owner")
    db.add_all([assignment, path])
    db.flush()
    # The step references the assignment with RESTRICT: deletion order matters.
    db.add(models.ClassPathStep(path_id=path.id, position=1, step_type="assignment", assignment_id=assignment.id))
    db.commit()
    return goal.id, other_goal.id, notebook.id


def test_delete_class_leaves_no_orphans(class_api):
    client, db, gid, image_dir = class_api
    goal_id, other_goal_id, notebook_id = _link_everything(db, gid)
    (image_dir / f"group_{gid}.png").write_bytes(b"png")
    (image_dir / f"group_{gid + 1}.png").write_bytes(b"other class")

    response = client.delete(f"/admin/groups/{gid}")

    assert response.status_code == 200, response.text
    db.expire_all()
    assert db.get(models.StudentGroup, gid) is None
    for model in (models.GroupMembership, models.TeacherNote, models.GroupShare, models.ClassCouncilLink,
                  models.ClassPairingCode, models.LocalStudent, models.GoalCatalogEntry,
                  models.GoalCatalogTarget, models.TeacherAssignment, models.ClassPath, models.ClassPathStep):
        assert db.query(model).count() == 0, model.__name__
    assert db.get(models.PersonalGoal, goal_id).shared_group_id is None
    assert db.get(models.PersonalGoal, other_goal_id).shared_group_id == gid + 1000
    assert db.get(models.TeacherPracticeNotebook, notebook_id).group_ids == [gid + 1000]
    assert not (image_dir / f"group_{gid}.png").exists()
    assert (image_dir / f"group_{gid + 1}.png").exists()


def test_delete_class_with_administration_plans_still_409(class_api):
    client, db, gid, _ = class_api
    db.add(models.AdministrationPlan(code="PLAN-INTEG", title="Plan", instrument_code="QSA", group_id=gid))
    db.add(models.GroupMembership(group_id=gid, username="student"))
    db.commit()

    assert client.delete(f"/admin/groups/{gid}").status_code == 409
    assert db.get(models.StudentGroup, gid) is not None
    assert db.query(models.GroupMembership).count() == 1


def test_ensure_membership_is_idempotent_and_duplicates_are_rejected(class_api):
    _, db, gid, _ = class_api
    first = groups.ensure_membership(db, gid, "student", "web")
    second = groups.ensure_membership(db, gid, "student", "telegram")
    db.commit()
    assert first.id == second.id
    assert second.joined_via == "web"
    assert db.query(models.GroupMembership).count() == 1
    with pytest.raises(IntegrityError):
        with db.begin_nested():
            db.add(models.GroupMembership(group_id=gid, username="student"))


def test_goal_catalog_targets_reject_duplicates_and_empty_recipients(class_api):
    _, db, gid, _ = class_api
    entry = models.GoalCatalogEntry(author_username="owner", group_id=gid, data={})
    db.add(entry)
    db.flush()
    db.add_all([models.GoalCatalogTarget(catalog_id=entry.id, group_id=gid),
                models.GoalCatalogTarget(catalog_id=entry.id, group_id=gid, username="student")])
    db.flush()
    for duplicate in (models.GoalCatalogTarget(catalog_id=entry.id, group_id=gid),
                      models.GoalCatalogTarget(catalog_id=entry.id, group_id=gid, username="student"),
                      models.GoalCatalogTarget(catalog_id=entry.id)):
        with pytest.raises(IntegrityError):
            with db.begin_nested():
                db.add(duplicate)


@pytest.fixture
def legacy_engine():
    """A schema shaped like a database created before #1000."""
    schema = "integrity_" + uuid.uuid4().hex
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
            conn.execute(text("ALTER TABLE group_memberships DROP CONSTRAINT uq_group_membership_user"))
            conn.execute(text("ALTER TABLE goal_catalog_targets DROP CONSTRAINT ck_goal_catalog_target_recipient"))
            for name in migration.TARGET_INDEXES:
                conn.execute(text(f"DROP INDEX {name}"))
            conn.execute(text("DROP INDEX ix_goal_catalog_targets_practice_notebook_id"))
            for table in migration.CASCADE_TABLES:
                fk = next(f for f in inspect(conn).get_foreign_keys(table) if f["referred_table"] == "student_groups")
                conn.execute(text(f'ALTER TABLE {table} DROP CONSTRAINT "{fk["name"]}"'))
                conn.execute(text(f'ALTER TABLE {table} ADD CONSTRAINT "{fk["name"]}" '
                                  "FOREIGN KEY (group_id) REFERENCES student_groups (id)"))
        yield engine
    finally:
        with engine.begin() as conn:
            conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        engine.dispose()


@pytest.mark.postgres_only
def test_migration_merges_duplicates_and_adds_constraints(legacy_engine):
    old, new = datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 6, 1, tzinfo=UTC)
    with Session(legacy_engine) as db, db.begin():
        group = models.StudentGroup(code="GR-LEGACY", name="Legacy", owner_username="owner")
        db.add(group)
        db.flush()
        gid = group.id
        db.add_all([
            models.GroupMembership(group_id=gid, username="student", joined_via="telegram", created_at=new),
            models.GroupMembership(group_id=gid, username="student", joined_via="web", created_at=old),
            models.GroupMembership(group_id=gid, username="other", joined_via="web", created_at=new),
        ])
        entry = models.GoalCatalogEntry(author_username="owner", group_id=gid, data={})
        db.add(entry)
        db.flush()
        db.add_all([models.GoalCatalogTarget(catalog_id=entry.id, group_id=gid),
                    models.GoalCatalogTarget(catalog_id=entry.id, group_id=gid),
                    models.GoalCatalogTarget(catalog_id=entry.id)])

    migration.migrate(legacy_engine)
    migration.migrate(legacy_engine)

    inspector = inspect(legacy_engine)
    assert "uq_group_membership_user" in {c["name"] for c in inspector.get_unique_constraints("group_memberships")}
    assert set(migration.TARGET_INDEXES) <= {i["name"] for i in inspector.get_indexes("goal_catalog_targets")}
    for table in migration.CASCADE_TABLES:
        fk = next(f for f in inspector.get_foreign_keys(table) if f["referred_table"] == "student_groups")
        assert fk["options"].get("ondelete") == "CASCADE"
    with Session(legacy_engine) as db:
        rows = db.query(models.GroupMembership).order_by(models.GroupMembership.username).all()
        assert [(r.username, r.joined_via) for r in rows] == [("other", "web"), ("student", "web")]
        assert db.query(models.GoalCatalogTarget).count() == 1
