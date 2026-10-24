"""F1-05b: SQLite engine for the desktop apps (ADR-0003 §4.1, §4.3), Postgres unchanged."""

import os
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest
from sqlalchemy import (
    Column,
    ForeignKey,
    Integer,
    create_engine,
    create_mock_engine,
    event,
    text,
)
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import declarative_base, sessionmaker
from starlette.requests import HTTPConnection

from backend import database, db_compat

REPO_ROOT = Path(__file__).resolve().parents[2]

Base = declarative_base()


class Parent(Base):
    __tablename__ = "parents"
    id = Column(Integer, primary_key=True)


class Child(Base):
    __tablename__ = "children"
    id = Column(Integer, primary_key=True)
    parent_id = Column(Integer, ForeignKey("parents.id", ondelete="CASCADE"), nullable=False)


class Note(Base):
    __tablename__ = "notes"
    id = Column(Integer, primary_key=True)
    parent_id = Column(Integer, ForeignKey("parents.id", ondelete="SET NULL"), nullable=True)


class Counter(Base):
    __tablename__ = "counters"
    id = Column(Integer, primary_key=True)
    value = Column(Integer, nullable=False)


@pytest.fixture
def sqlite_engine(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'desktop.db'}", connect_args={"check_same_thread": False}
    )
    database.configure_sqlite_engine(engine)
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def statements(sqlite_engine):
    seen = []

    @event.listens_for(sqlite_engine, "before_cursor_execute")
    def _record(_conn, _cursor, statement, *_args):
        seen.append(statement)

    return seen


def test_pragmas_are_active_on_every_connection(sqlite_engine):
    for _ in range(2):
        with sqlite_engine.connect() as conn:
            assert conn.exec_driver_sql("PRAGMA journal_mode").scalar() == "wal"
            assert conn.exec_driver_sql("PRAGMA busy_timeout").scalar() == 5000
            assert conn.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
            assert conn.exec_driver_sql("PRAGMA synchronous").scalar() == 1  # NORMAL
        sqlite_engine.dispose()


def test_ondelete_cascade_and_set_null_apply_on_sqlite(sqlite_engine):
    Session = sessionmaker(bind=sqlite_engine)
    with Session() as db:
        db.add(Parent(id=1))
        db.flush()
        db.add_all([Child(id=1, parent_id=1), Note(id=1, parent_id=1)])
        db.commit()
        db.execute(text("DELETE FROM parents WHERE id = 1"))
        db.commit()
        assert db.execute(text("SELECT count(*) FROM children")).scalar() == 0
        assert db.execute(text("SELECT parent_id FROM notes WHERE id = 1")).scalar() is None


def test_foreign_keys_reject_orphans(sqlite_engine):
    Session = sessionmaker(bind=sqlite_engine)
    with Session() as db:
        db.add(Child(id=1, parent_id=99))
        with pytest.raises(Exception, match="FOREIGN KEY"):
            db.commit()


@pytest.mark.parametrize("version", [(3, 34, 1), (3, 7, 17), (2, 99, 99)])
def test_sqlite_older_than_3_35_exits_with_code_3(version, capsys):
    with pytest.raises(SystemExit) as exited:
        database.check_sqlite_version(version)
    assert exited.value.code == 3
    assert "3.35.0" in capsys.readouterr().err


@pytest.mark.parametrize("version", [(3, 35, 0), (3, 51, 0), (4, 0, 0)])
def test_sqlite_3_35_or_newer_is_accepted(version):
    database.check_sqlite_version(version)


def test_bundled_sqlite_meets_the_minimum():
    database.check_sqlite_version()


def test_read_sessions_begin_deferred_and_write_sessions_begin_immediate(sqlite_engine, statements):
    Session = sessionmaker(bind=sqlite_engine)
    with Session() as reader:
        reader.execute(text("SELECT 1"))
    assert "BEGIN" in statements and "BEGIN IMMEDIATE" not in statements

    statements.clear()
    with database.as_write_session(Session()) as writer:
        writer.execute(text("SELECT 1"))
        writer.commit()
        writer.execute(text("SELECT 1"))  # Every transaction of the session, not just the first.
    assert statements.count("BEGIN IMMEDIATE") == 2 and "BEGIN" not in statements


def _run_get_db(method):
    dependency = database.get_db(HTTPConnection({"type": "http", "method": method, "headers": []}))
    db = next(dependency)
    try:
        db.execute(text("SELECT 1"))
    finally:
        dependency.close()


@pytest.mark.parametrize("method,begin", [
    ("GET", "BEGIN"), ("HEAD", "BEGIN"), ("OPTIONS", "BEGIN"),
    ("POST", "BEGIN IMMEDIATE"), ("PUT", "BEGIN IMMEDIATE"),
    ("PATCH", "BEGIN IMMEDIATE"), ("DELETE", "BEGIN IMMEDIATE"),
])
def test_get_db_begins_immediate_only_for_write_methods(method, begin, sqlite_engine, statements, monkeypatch):
    monkeypatch.setattr(database, "SessionLocal", sessionmaker(bind=sqlite_engine))
    _run_get_db(method)
    assert [s for s in statements if s.startswith("BEGIN")] == [begin]


def test_get_db_accepts_websocket_scopes(sqlite_engine, statements, monkeypatch):
    monkeypatch.setattr(database, "SessionLocal", sessionmaker(bind=sqlite_engine))
    dependency = database.get_db(HTTPConnection({"type": "websocket", "headers": []}))
    next(dependency).execute(text("SELECT 1"))
    dependency.close()
    assert [s for s in statements if s.startswith("BEGIN")] == ["BEGIN"]


def test_write_session_uses_the_current_session_factory(sqlite_engine, statements, monkeypatch):
    monkeypatch.setattr(database, "SessionLocal", sessionmaker(bind=sqlite_engine))
    with database.write_session() as db:
        db.execute(text("SELECT 1"))
    assert "BEGIN IMMEDIATE" in statements


def _read_then_write(Session, rounds, errors, start=None):
    try:
        for _ in range(rounds):
            with Session() as db:
                if start is not None:
                    start.wait(5)
                value = db.execute(text("SELECT value FROM counters WHERE id = 1")).scalar()
                time.sleep(0.005)  # Widen the window between the read and the write.
                db.execute(text("UPDATE counters SET value = :v WHERE id = 1"), {"v": value + 1})
                db.commit()
    except OperationalError as exc:
        errors.append(exc)


def _seed_counter(engine):
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO counters (id, value) VALUES (1, 0)"))


def test_concurrent_read_then_write_sessions_do_not_hit_sqlite_busy(sqlite_engine):
    _seed_counter(sqlite_engine)
    Session = sessionmaker(bind=sqlite_engine)
    errors = []
    threads = [
        threading.Thread(target=_read_then_write, args=(lambda: database.as_write_session(Session()), 20, errors))
        for _ in range(2)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(60)
    assert errors == []
    with sqlite_engine.connect() as conn:
        assert conn.execute(text("SELECT value FROM counters WHERE id = 1")).scalar() == 40


def test_deferred_read_then_write_sessions_fail_without_immediate(sqlite_engine):
    """Control: the failure BEGIN IMMEDIATE prevents (busy_timeout does not help here)."""
    _seed_counter(sqlite_engine)
    Session = sessionmaker(bind=sqlite_engine)
    errors = []
    start = threading.Barrier(2)
    threads = [threading.Thread(target=_read_then_write, args=(Session, 1, errors, start)) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(60)
    assert len(errors) == 1
    assert "locked" in str(errors[0]) or "busy" in str(errors[0]).lower()


def test_savepoints_work_with_the_begin_event(sqlite_engine):
    Session = sessionmaker(bind=sqlite_engine)
    with database.as_write_session(Session()) as db:
        db.add(Parent(id=1))
        nested = db.begin_nested()
        db.add(Parent(id=2))
        nested.rollback()
        db.commit()
        assert db.execute(text("SELECT id FROM parents")).scalars().all() == [1]


def test_db_compat_detects_the_dialect(sqlite_engine):
    Session = sessionmaker(bind=sqlite_engine)
    with sqlite_engine.connect() as conn, Session() as db:
        for bind in (sqlite_engine, conn, db):
            assert db_compat.is_sqlite(bind) and not db_compat.is_postgres(bind)
    postgres = create_mock_engine("postgresql://", lambda *_: None)
    assert db_compat.is_postgres(postgres) and not db_compat.is_sqlite(postgres)
    assert db_compat.is_postgres(sessionmaker(bind=postgres)())


_POSTGRES_PROBE = """
import importlib.util, sys, types
if importlib.util.find_spec("psycopg2") is None:  # Never connects: the driver only has to import.
    stub = types.ModuleType("psycopg2")
    stub.paramstyle, stub.__version__ = "pyformat", "2.9.9"
    sys.modules["psycopg2"] = stub
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from starlette.requests import HTTPConnection
from backend import database
engine = database.engine
assert engine.dialect.name == "postgresql", engine.dialect.name
from sqlalchemy import create_engine
plain = create_engine(database.SQLALCHEMY_DATABASE_URL)
assert len(engine.pool.dispatch.connect) == len(plain.pool.dispatch.connect)
assert len(engine.dispatch.begin) == 0
assert engine.execution_options().get_execution_options() == {}
dependency = database.get_db(HTTPConnection({"type": "http", "method": "POST", "headers": []}))
db = next(dependency)
assert db.bind is engine, db.bind
assert database.write_session().bind is engine
print("postgres-unchanged")
"""


def test_postgres_engine_is_unchanged():
    """Production Postgres: no listeners, no BEGIN IMMEDIATE, no rebinding (nothing connects)."""
    env = {**os.environ, "DATABASE_URL": "postgresql://user:secret@127.0.0.1:1/counselorbot"}
    result = subprocess.run(
        [sys.executable, "-c", _POSTGRES_PROBE], check=False, cwd=REPO_ROOT, env=env,
        capture_output=True, text=True, timeout=120,
    )
    assert result.returncode == 0, result.stderr
    assert "postgres-unchanged" in result.stdout


def test_old_sqlite_stops_the_backend_with_exit_code_3(tmp_path):
    probe = (
        "import sqlite3; sqlite3.sqlite_version_info = (3, 31, 1)\n"
        "import backend.database\n"
    )
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{tmp_path / 'old.db'}"}
    result = subprocess.run(
        [sys.executable, "-c", probe], check=False, cwd=REPO_ROOT, env=env, capture_output=True, text=True, timeout=120,
    )
    assert result.returncode == 3, result.stderr
    assert "3.31.1" in result.stderr
