"""Portable transaction locks, with real threads and independent SQLite connections."""
import hashlib
import os
import sys
import threading
import time
from queue import Queue
from unittest.mock import Mock

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from backend.db_compat import check_sqlite_workers, xact_lock


@pytest.fixture(autouse=True)
def single_worker(monkeypatch):
    for name in ("WEB_CONCURRENCY", "UVICORN_WORKERS", "GUNICORN_CMD_ARGS"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(sys, "argv", ["pytest"])


@pytest.fixture
def engine(tmp_path):
    from backend.database import configure_sqlite_engine

    engine = create_engine(f"sqlite:///{tmp_path / 'locks.sqlite3'}")
    configure_sqlite_engine(engine)
    yield engine
    engine.dispose()


def contender(engine, *parts, connection=False):
    started, acquired = threading.Event(), threading.Event()
    errors = Queue()

    def run():
        try:
            with engine.connect() if connection else Session(engine) as db:
                started.set()
                xact_lock(db, *parts)
                acquired.set()
                db.commit()
        except BaseException as exc:
            errors.put(exc)

    worker = threading.Thread(target=run, daemon=True)
    worker.start()
    assert started.wait(5)
    return worker, acquired, errors


def finish_contender(worker, acquired, errors):
    worker.join(5)
    assert not worker.is_alive(), "transaction lock leaked"
    if not errors.empty():
        raise errors.get()
    assert acquired.is_set()


@pytest.mark.parametrize("connection", [False, True], ids=["session", "connection"])
@pytest.mark.parametrize("end", ["commit", "rollback", "close"])
def test_same_key_waits_until_transaction_ends(engine, end, connection):
    with engine.connect() if connection else Session(engine) as owner:
        xact_lock(owner, "same", "student")
        # Connection contenders begin a write transaction; a waiting contender
        # must not prevent the owner from finishing its logical transaction.
        worker, acquired, errors = contender(engine, "same", "student")
        try:
            assert not acquired.wait(0.1)
        finally:
            getattr(owner, end)()
        finish_contender(worker, acquired, errors)


def test_different_keys_do_not_block(engine):
    with Session(engine) as owner:
        xact_lock(owner, "first")
        finish_contender(*contender(engine, "second"))
        owner.rollback()


@pytest.mark.parametrize("connection", [False, True])
def test_reacquiring_same_key_and_reusing_transaction_owner(engine, connection):
    errors = Queue()

    def run():
        try:
            with engine.connect() if connection else Session(engine) as db:
                for _ in range(5):
                    xact_lock(db, "reentrant")
                    xact_lock(db, "reentrant")
                    xact_lock(db, "another-key")
                    db.commit()
        except BaseException as exc:
            errors.put(exc)

    worker = threading.Thread(target=run, daemon=True)
    worker.start()
    worker.join(5)
    assert not worker.is_alive(), "repeated acquisition deadlocked"
    if not errors.empty():
        raise errors.get()
    finish_contender(*contender(engine, "reentrant"))
    finish_contender(*contender(engine, "another-key"))


@pytest.mark.parametrize("end", ["commit", "rollback"])
@pytest.mark.parametrize("connection", [False, True])
def test_savepoint_end_keeps_outer_transaction_lock(engine, end, connection):
    with engine.connect() if connection else Session(engine) as db:
        xact_lock(db, "savepoint")
        nested = db.begin_nested()
        xact_lock(db, "inside-savepoint")
        getattr(nested, end)()
        contenders = [contender(engine, key) for key in ("savepoint", "inside-savepoint")]
        try:
            for _, acquired, _ in contenders:
                assert not acquired.wait(0.1)
        finally:
            db.rollback()
        for args in contenders:
            finish_contender(*args)


def test_concurrent_threads_are_mutually_exclusive(engine):
    ready = threading.Barrier(6)
    state = {"active": 0, "completed": 0}
    errors = Queue()

    def run():
        try:
            ready.wait(5)
            with Session(engine) as db:
                for _ in range(10):
                    xact_lock(db, "concurrent", "student")
                    assert state["active"] == 0
                    state["active"] += 1
                    time.sleep(0.001)
                    state["completed"] += 1
                    state["active"] -= 1
                    db.commit()
        except BaseException as exc:
            errors.put(exc)

    workers = [threading.Thread(target=run, daemon=True) for _ in range(6)]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join(5)
        assert not worker.is_alive(), "concurrent acquisition deadlocked"
    if not errors.empty():
        raise errors.get()
    assert state == {"active": 0, "completed": 60}


def test_commit_makes_writes_visible_to_next_lock_holder(engine):
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE saved (value INTEGER)"))
    with Session(engine) as db:
        xact_lock(db, "saved")
        db.execute(text("INSERT INTO saved VALUES (42)"))
        db.commit()
    with Session(engine) as db:
        xact_lock(db, "saved")
        assert db.execute(text("SELECT value FROM saved")).scalar_one() == 42


def test_waiting_connection_does_not_hold_sqlite_writer_lock(engine):
    with Session(engine) as db:
        xact_lock(db, "writer-order")
        worker, acquired, errors = contender(engine, "writer-order", connection=True)
        try:
            assert not acquired.wait(0.1)
            db.execute(text("CREATE TABLE writer_order (value INTEGER)"))
            db.commit()
        finally:
            db.rollback()
        finish_contender(worker, acquired, errors)


@pytest.mark.parametrize("name,value", [
    ("WEB_CONCURRENCY", "2"), ("UVICORN_WORKERS", "4"),
    ("GUNICORN_CMD_ARGS", "--workers 3"), ("GUNICORN_CMD_ARGS", "-w2"),
])
def test_sqlite_rejects_multiple_workers(engine, monkeypatch, name, value):
    from backend.database import configure_sqlite_engine

    monkeypatch.setenv(name, value)
    with Session(engine) as db, pytest.raises(RuntimeError, match="SQLite.*one worker"):
        xact_lock(db, "worker")
    with pytest.raises(RuntimeError, match="SQLite.*one worker"):
        configure_sqlite_engine(engine)


@pytest.mark.parametrize("args", [["--workers", "2"], ["--workers=3"], ["-w", "4"], ["-w2"]])
def test_sqlite_rejects_multiple_workers_from_cli(monkeypatch, args):
    monkeypatch.setattr(sys, "argv", ["uvicorn", "backend.main:app", *args])
    with pytest.raises(RuntimeError, match="one worker"):
        check_sqlite_workers()


def test_sqlite_accepts_single_worker(engine, monkeypatch):
    monkeypatch.setenv("WEB_CONCURRENCY", "1")
    monkeypatch.setenv("UVICORN_WORKERS", "1")
    monkeypatch.setenv("GUNICORN_CMD_ARGS", "--workers=1")
    with Session(engine) as db:
        xact_lock(db, "single-worker")


@pytest.mark.parametrize("parts", [("assignment", "student", 17), (149, "scuola"), ("città", None)])
def test_postgres_uses_deterministic_signed_blake2b_key(parts, monkeypatch):
    db = Mock(spec=Session)
    db.get_bind.return_value.dialect.name = "postgresql"
    # PostgreSQL workers remain unrestricted.
    monkeypatch.setenv("WEB_CONCURRENCY", "4")
    expected = int.from_bytes(hashlib.blake2b(
        ":".join(map(str, parts)).encode("utf-8"), digest_size=8
    ).digest(), "big", signed=True)
    for _ in range(2):
        xact_lock(db, *parts)
        statement, params = db.execute.call_args.args
        assert str(statement) == "SELECT pg_advisory_xact_lock(:key)"
        assert params == {"key": expected}
        assert -(2 ** 63) <= params["key"] < 2 ** 63


def test_requires_identifying_parts(engine):
    with Session(engine) as db, pytest.raises(ValueError, match="at least one"):
        xact_lock(db)


@pytest.mark.postgres_only
@pytest.mark.skipif(not os.getenv("DATABASE_URL", "").startswith("postgresql"),
                    reason="requires the dedicated PostgreSQL test database")
@pytest.mark.parametrize("connection", [False, True], ids=["session", "connection"])
@pytest.mark.parametrize("end", ["commit", "rollback"])
def test_postgres_server_holds_lock_until_transaction_end(connection, end):
    engine = create_engine(os.environ["DATABASE_URL"])
    parts = ("f105d-integration", end, connection)
    key = int.from_bytes(hashlib.blake2b(
        ":".join(map(str, parts)).encode(), digest_size=8
    ).digest(), "big", signed=True)
    try:
        with engine.connect() if connection else Session(engine) as owner:
            with engine.connect() as observer:
                xact_lock(owner, *parts)
                xact_lock(owner, *parts)
                probe = text("SELECT pg_try_advisory_xact_lock(:key)")
                assert observer.execute(probe, {"key": key}).scalar_one() is False
                observer.rollback()
                getattr(owner, end)()
                assert observer.execute(probe, {"key": key}).scalar_one() is True
    finally:
        engine.dispose()
