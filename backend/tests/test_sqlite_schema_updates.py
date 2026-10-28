"""F1-05g: upgrading an existing SQLite file (ADR-0003 §3.3-§3.4).

Each test builds its own SQLite file with the desktop PRAGMAs, whatever TEST_DB is.
"""
import pytest
from sqlalchemy import CheckConstraint, MetaData, String, UniqueConstraint, create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend import models
from backend.database import configure_sqlite_engine
from backend.sqlite_schema import sqlite_rebuild_table, sync_sqlite_check_constraints

OLD_STEP_TARGET = "(step_type = 'tool' AND tool_key IS NOT NULL)"


def _engine(path):
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    configure_sqlite_engine(engine)
    return engine


def _previous_metadata():
    """The current schema, except class_path_steps with the CHECKs of an older release."""
    old = MetaData()
    for table in models.Base.metadata.sorted_tables:
        table.to_metadata(old)
    steps = old.tables["class_path_steps"]
    for constraint in [c for c in steps.constraints if isinstance(c, CheckConstraint)]:
        steps.constraints.discard(constraint)
    steps.append_constraint(CheckConstraint(OLD_STEP_TARGET, name="class_path_step_target"))
    return old


@pytest.fixture
def previous_sqlite(tmp_path):
    """A SQLite file written by an older release, with a path, steps and child progress rows."""
    engine = _engine(tmp_path / "previous.sqlite3")
    _previous_metadata().create_all(engine)
    with Session(engine) as db, db.begin():
        group = models.StudentGroup(code="C1", name="Classe", owner_username="prof")
        db.add(group)
        db.flush()
        path = models.ClassPath(group_id=group.id, title="Percorso", created_by="prof")
        db.add(path)
        db.flush()
        db.add_all([models.ClassPathStep(id=step_id, path_id=path.id, position=step_id, step_type="tool", tool_key="QSA")
                    for step_id in (1, 2)])
        db.flush()
        db.add(models.ClassPathProgress(step_id=1, username="s1", state="done", source="student", actor_username="s1"))
    yield engine
    engine.dispose()


def _insert_pending_step(conn):
    conn.execute(text("INSERT INTO class_path_steps (id, path_id, position, step_type, pending_config) "
                      "VALUES (3, 1, 3, 'pending', '{}')"))


def test_old_check_rejects_a_new_step_type_until_the_startup_sync(previous_sqlite):
    with pytest.raises(IntegrityError), previous_sqlite.begin() as conn:
        _insert_pending_step(conn)

    assert sync_sqlite_check_constraints(previous_sqlite, models.Base.metadata) == ["class_path_steps"]

    inspector = inspect(previous_sqlite)
    names = {c["name"] for c in inspector.get_check_constraints("class_path_steps")}
    assert names == {"class_path_step_target", "class_path_step_follows"}
    assert "ix_class_path_steps_path_id" in {i["name"] for i in inspector.get_indexes("class_path_steps")}
    with previous_sqlite.begin() as conn:
        assert conn.execute(text("SELECT id, step_type, tool_key FROM class_path_steps ORDER BY id")).all() == [
            (1, "tool", "QSA"), (2, "tool", "QSA")]
        # foreign_keys=ON would have cascaded the DROP TABLE into the progress rows.
        assert conn.execute(text("SELECT step_id, username FROM class_path_progress")).all() == [(1, "s1")]
        assert conn.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
        _insert_pending_step(conn)
    with pytest.raises(IntegrityError), previous_sqlite.begin() as conn:
        conn.execute(text("INSERT INTO class_path_steps (path_id, position, step_type) VALUES (1, 4, 'tool')"))

    assert sync_sqlite_check_constraints(previous_sqlite, models.Base.metadata) == []


def test_fresh_create_all_needs_no_rebuild(tmp_path):
    engine = _engine(tmp_path / "fresh.sqlite3")
    models.Base.metadata.create_all(engine)
    assert sync_sqlite_check_constraints(engine, models.Base.metadata) == []
    engine.dispose()


def test_deep_dive_migration_preserves_old_rows_and_accepts_more_attempts(tmp_path):
    from importlib import import_module
    from datetime import UTC, datetime

    engine = _engine(tmp_path / "attempts.sqlite3")
    old = MetaData()
    for table in models.Base.metadata.sorted_tables:
        table.to_metadata(old)
    old.tables["class_path_deep_dive_sessions"].append_constraint(
        UniqueConstraint("step_id", "username", "result_id", name="uq_deep_dive_step_result"))
    old.create_all(engine)
    with Session(engine) as db, db.begin():
        group = models.StudentGroup(code="attempts", name="Class", owner_username="teacher")
        db.add(group); db.flush()
        path = models.ClassPath(group_id=group.id, title="Plan", created_by="teacher")
        db.add(path); db.flush()
        step = models.ClassPathStep(path_id=path.id, position=1, step_type="tool", tool_key="QSA")
        result = models.QuestionnaireResult(session_id="result", questionnaire_type="QSA", username="student")
        db.add_all([step, result]); db.flush()
        db.add(models.ClassPathDeepDiveSession(step_id=step.id, username="student", result_id=result.id,
                                                session_id="old", started_at=datetime.now(UTC)))
    migration = import_module("backend.migrations.20261028_deep_dive_attempts")
    migration.migrate(engine)
    migration.migrate(engine)
    with Session(engine) as db, db.begin():
        first = db.query(models.ClassPathDeepDiveSession).one()
        assert first.session_id == "old"
        db.add(models.ClassPathDeepDiveSession(step_id=first.step_id, username=first.username,
                                              result_id=first.result_id, session_id="new", started_at=datetime.now(UTC)))
    with Session(engine) as db:
        assert db.query(models.ClassPathDeepDiveSession).count() == 2
    engine.dispose()


def test_sync_refuses_tables_whose_columns_differ_from_the_model(previous_sqlite):
    with previous_sqlite.begin() as conn:
        conn.execute(text("ALTER TABLE class_path_steps DROP COLUMN instructions"))
    with pytest.raises(RuntimeError, match="dual migration"):
        sync_sqlite_check_constraints(previous_sqlite, models.Base.metadata)
    with previous_sqlite.begin() as conn:
        assert conn.execute(text("SELECT count(*) FROM class_path_steps")).scalar() == 2


def test_rebuild_table_changes_nullability_and_keeps_rows(tmp_path):
    engine = _engine(tmp_path / "legacy.sqlite3")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE legacy_rows (id INTEGER PRIMARY KEY, label VARCHAR(20) NOT NULL)"))
        conn.execute(text("INSERT INTO legacy_rows (id, label) VALUES (1, 'a')"))
    with sqlite_rebuild_table(engine, "legacy_rows") as batch:
        batch.alter_column("label", existing_type=String(20), nullable=True)
        batch.create_check_constraint("legacy_rows_label", "label IS NULL OR length(label) > 0")
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO legacy_rows (id, label) VALUES (2, NULL)"))
        assert conn.execute(text("SELECT id, label FROM legacy_rows ORDER BY id")).all() == [(1, "a"), (2, None)]
    assert [c["name"] for c in inspect(engine).get_check_constraints("legacy_rows")] == ["legacy_rows_label"]
    engine.dispose()


def test_rebuild_table_rolls_back_on_foreign_key_violation(tmp_path):
    engine = _engine(tmp_path / "fk.sqlite3")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE parents (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE children (id INTEGER PRIMARY KEY, parent_id INTEGER)"))
        conn.execute(text("INSERT INTO children (id, parent_id) VALUES (1, 99)"))
    with pytest.raises(RuntimeError, match="foreign keys"):
        with sqlite_rebuild_table(engine, "children") as batch:
            batch.create_foreign_key("fk_children_parent", "parents", ["parent_id"], ["id"])
    assert inspect(engine).get_foreign_keys("children") == []
    with engine.connect() as conn:
        assert conn.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
        assert conn.execute(text("SELECT count(*) FROM children")).scalar() == 1
    engine.dispose()


def test_postgres_is_left_alone():
    engine = create_engine("postgresql+psycopg2://user@127.0.0.1:1/none")  # never connects
    assert sync_sqlite_check_constraints(engine, models.Base.metadata) == []
    with pytest.raises(NotImplementedError), sqlite_rebuild_table(engine, "class_path_steps"):
        pass


def test_rebuild_from_the_model_keeps_the_create_all_indexes(tmp_path):
    """Partial (`sqlite_where`) and `index=True` indexes survive every CHECK-sync rebuild."""
    engine = _engine(tmp_path / "indexes.sqlite3")
    models.Base.metadata.create_all(engine)
    tables = [t for t in models.Base.metadata.sorted_tables if any(isinstance(c, CheckConstraint) for c in t.constraints)]
    index_sql = "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = :t ORDER BY name"
    with engine.connect() as conn:
        before = {t.name: conn.execute(text(index_sql), {"t": t.name}).all() for t in tables}
    for table in tables:
        with sqlite_rebuild_table(engine, table.name, copy_from=table):
            pass
    with engine.connect() as conn:
        after = {t.name: conn.execute(text(index_sql), {"t": t.name}).all() for t in tables}
    assert after == before
    assert any("WHERE" in (sql or "") for sql in (row[1] for row in before["class_meeting_bookings"]))
    assert sync_sqlite_check_constraints(engine, models.Base.metadata) == []
    engine.dispose()
