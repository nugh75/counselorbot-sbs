"""Real file/WAL snapshots, concurrent commits and failure-safe restore."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime, timezone
import os
from pathlib import Path
import sqlite3
import threading
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import URL

from backend import sqlite_backup as backups


@pytest.fixture
def desktop(tmp_path):
    # Reserved URI characters also exercise the read-only connection URI.
    name = "desktop #1.sqlite3" if os.name == "nt" else "desktop #1 ?.sqlite3"
    database = tmp_path / name
    with closing(sqlite3.connect(database)) as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("CREATE TABLE entries (id INTEGER PRIMARY KEY, value TEXT)")
        conn.execute("INSERT INTO entries VALUES (1, 'original')")
        conn.commit()
    engine = create_engine(URL.create("sqlite", database=str(database)))
    yield SimpleNamespace(engine=engine, database=database,
                          data=tmp_path / "uploads", directory=tmp_path / "uploads/backups")
    engine.dispose()


def snapshot(desktop, **kwargs):
    return backups.create_backup(desktop.engine, data_dir=desktop.data, **kwargs)


def restore(desktop, path, **kwargs):
    return backups.restore_backup(path, desktop.engine, data_dir=desktop.data,
                                  database_stopped=True, **kwargs)


def values(path):
    with closing(sqlite3.connect(path)) as conn:
        assert conn.execute("PRAGMA integrity_check").fetchall() == [("ok",)]
        return conn.execute("SELECT id, value FROM entries ORDER BY id").fetchall()


def insert(desktop, id, value):
    with closing(sqlite3.connect(desktop.database)) as conn:
        conn.execute("INSERT INTO entries VALUES (?, ?)", (id, value))
        conn.commit()


def test_snapshot_is_verified_private_and_standalone(desktop):
    path = snapshot(desktop)
    assert path.parent == desktop.directory
    assert values(path) == [(1, "original")]
    assert list(desktop.directory.iterdir()) == [path]
    with closing(sqlite3.connect(path)) as conn:
        assert conn.execute("PRAGMA journal_mode").fetchone() == ("delete",)
    if os.name != "nt":
        assert path.stat().st_mode & 0o777 == 0o600
        assert desktop.directory.stat().st_mode & 0o777 == 0o700


def test_snapshot_includes_committed_wal_and_excludes_uncommitted(desktop):
    with closing(sqlite3.connect(desktop.database)) as writer:
        writer.execute("PRAGMA wal_autocheckpoint=0")
        writer.execute("INSERT INTO entries VALUES (2, 'committed WAL')")
        writer.commit()
        assert Path(str(desktop.database) + "-wal").stat().st_size > 0
        writer.execute("INSERT INTO entries VALUES (3, 'pending')")
        path = snapshot(desktop)
        assert values(path) == [(1, "original"), (2, "committed WAL")]
        writer.rollback()


def test_backup_during_concurrent_transaction_is_consistent(desktop, monkeypatch):
    with closing(sqlite3.connect(desktop.database)) as conn:
        conn.execute("CREATE TABLE ledger (id INTEGER PRIMARY KEY, balance INTEGER)")
        conn.executemany("INSERT INTO ledger VALUES (?, ?)", [(1, 100), (2, 100)])
        # Enough pages to require several native backup steps.
        conn.execute("CREATE TABLE payload (body BLOB)")
        conn.executemany("INSERT INTO payload VALUES (zeroblob(8192))", [()] * 64)
        conn.commit()
    copying = threading.Event()
    committed = threading.Event()
    native_connect = sqlite3.connect

    class ObservedConnection(sqlite3.Connection):
        def backup(self, target, **kwargs):
            original_progress = kwargs["progress"]

            def progress(status, remaining, total):
                original_progress(status, remaining, total)
                if status == sqlite3.SQLITE_OK and remaining and not copying.is_set():
                    copying.set()
                    assert committed.wait(5), "concurrent writer did not commit"

            super().backup(target, **{**kwargs, "pages": 1, "progress": progress})

    def observed_connect(*args, **kwargs):
        return native_connect(*args, **{**kwargs, "factory": ObservedConnection})

    def write():
        assert copying.wait(5), "backup did not reach its first step"
        with closing(native_connect(desktop.database)) as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute("UPDATE ledger SET balance = balance - 10 WHERE id = 1")
            conn.execute("UPDATE ledger SET balance = balance + 10 WHERE id = 2")
            conn.commit()
        committed.set()

    monkeypatch.setattr(backups.sqlite3, "connect", observed_connect)
    with ThreadPoolExecutor(max_workers=1) as pool:
        writer = pool.submit(write)
        path = snapshot(desktop)
        writer.result(timeout=5)
    with closing(native_connect(path)) as conn:
        assert conn.execute("PRAGMA integrity_check").fetchall() == [("ok",)]
        assert conn.execute("SELECT balance FROM ledger ORDER BY id").fetchall() == [(90,), (110,)]


def test_retention_keeps_latest_and_ignores_unmanaged_files(desktop):
    paths = [snapshot(desktop, retain=3) for _ in range(6)]
    assert sorted(desktop.directory.iterdir()) == paths[-3:]
    unrelated = [desktop.directory / name for name in ("export.sqlite3", ".failed.partial", "notes.txt")]
    for path in unrelated:
        path.write_text("untouched")
    latest = snapshot(desktop, retain=1)
    assert set(desktop.directory.iterdir()) == {latest, *unrelated}


def test_retention_is_scoped_to_database(desktop, tmp_path):
    other = tmp_path / "another.sqlite3"
    with closing(sqlite3.connect(other)) as conn:
        conn.execute("CREATE TABLE other (id INTEGER)")
    engine = create_engine("sqlite:///" + str(other))
    try:
        other_backup = backups.create_backup(engine, data_dir=desktop.data, retain=1)
        for _ in range(3):
            latest = snapshot(desktop, retain=1)
        assert set(desktop.directory.iterdir()) == {other_backup, latest}
    finally:
        engine.dispose()


def test_parallel_backups_serialize_retention(desktop):
    with ThreadPoolExecutor(max_workers=4) as pool:
        paths = list(pool.map(lambda _: snapshot(desktop, retain=2), range(8)))
    remaining = set(desktop.directory.iterdir())
    assert remaining == set(sorted(paths)[-2:])
    for path in remaining:
        assert values(path) == [(1, "original")]


def test_integrity_failure_removes_new_copy_and_preserves_old(desktop):
    old = snapshot(desktop, retain=1)
    with closing(sqlite3.connect(desktop.database)) as conn:
        conn.execute("CREATE TABLE invalid (value INTEGER CHECK (value > 0))")
        conn.execute("PRAGMA ignore_check_constraints=ON")
        conn.execute("INSERT INTO invalid VALUES (-1)")
        conn.commit()
    with pytest.raises(backups.BackupIntegrityError, match="did not return ok"):
        snapshot(desktop, retain=1)
    assert list(desktop.directory.iterdir()) == [old]
    assert values(old) == [(1, "original")]


@pytest.mark.parametrize("rows", [[], [("ok",), ("anomaly",)], [("private data",)]])
def test_integrity_check_requires_exact_ok(rows):
    conn = SimpleNamespace(execute=lambda _: SimpleNamespace(fetchall=lambda: rows))
    with pytest.raises(backups.BackupIntegrityError) as error:
        backups._check_integrity(conn)
    assert "private data" not in str(error.value)


def test_integrity_check_exception_is_rejected():
    def fail(_):
        raise sqlite3.DatabaseError("bad page")
    with pytest.raises(backups.BackupIntegrityError):
        backups._check_integrity(SimpleNamespace(execute=fail))


def test_copy_error_cleans_partial_and_does_not_rotate(desktop, monkeypatch):
    old = snapshot(desktop, retain=1)

    def fail(*_):
        raise sqlite3.OperationalError("simulated copy error")

    monkeypatch.setattr(backups, "_copy_database", fail)
    with pytest.raises(sqlite3.OperationalError):
        snapshot(desktop, retain=1)
    assert list(desktop.directory.iterdir()) == [old]


def test_busy_database_times_out_and_cleans_partial(desktop):
    # An exclusive rollback-journal lock prevents even the first backup step.
    with closing(sqlite3.connect(desktop.database)) as writer:
        writer.execute("PRAGMA journal_mode=DELETE")
        writer.execute("BEGIN EXCLUSIVE")
        try:
            with pytest.raises(backups.BackupTimeoutError):
                snapshot(desktop, timeout=0.02)
        finally:
            writer.rollback()
    assert list(desktop.directory.iterdir()) == []


@pytest.mark.parametrize("retain", [0, -1, 1.5, True])
def test_invalid_retention_has_no_filesystem_effect(desktop, retain):
    with pytest.raises(ValueError, match="retain"):
        snapshot(desktop, retain=retain)
    assert not desktop.directory.exists()


@pytest.mark.parametrize("timeout", [0, -1, float("inf"), float("nan")])
def test_invalid_timeout_has_no_filesystem_effect(desktop, timeout):
    with pytest.raises(ValueError, match="timeout"):
        snapshot(desktop, timeout=timeout)
    assert not desktop.directory.exists()


def test_missing_source_does_not_create_an_empty_database(desktop):
    desktop.database.unlink()
    with pytest.raises(ValueError, match="existing"):
        snapshot(desktop)
    assert not desktop.database.exists()
    assert list(desktop.directory.iterdir()) == []


def test_memory_database_is_rejected(desktop):
    engine = create_engine("sqlite:///:memory:")
    try:
        with pytest.raises(ValueError, match="regular file"):
            backups.create_backup(engine, data_dir=desktop.data)
        assert not desktop.directory.exists()
    finally:
        engine.dispose()


def test_restore_preserves_current_state_then_restores_selected_snapshot(desktop):
    old = snapshot(desktop)
    insert(desktop, 2, "before restore")
    # A checked-in connection in the Engine pool must be disposed by restore.
    with desktop.engine.connect():
        pass
    result = restore(desktop, old)
    assert result.database == desktop.database
    assert result.safety_backup != old
    assert values(desktop.database) == [(1, "original")]
    assert values(result.safety_backup) == [(1, "original"), (2, "before restore")]
    assert values(old) == [(1, "original")]
    assert set(desktop.directory.iterdir()) == {old, result.safety_backup}


def test_restore_with_retention_one_can_restore_oldest_backup(desktop):
    selected = snapshot(desktop)
    insert(desktop, 2, "later")
    snapshot(desktop)
    result = restore(desktop, selected, retain=1)
    assert values(desktop.database) == [(1, "original")]
    assert values(result.safety_backup) == [(1, "original"), (2, "later")]
    assert list(desktop.directory.iterdir()) == [result.safety_backup]


def test_restore_retains_safety_snapshot_after_clock_moves_back(desktop, monkeypatch):
    selected = snapshot(desktop)
    insert(desktop, 2, "later")
    monkeypatch.setattr(backups, "datetime", SimpleNamespace(
        now=lambda _: datetime(2000, 1, 1, tzinfo=timezone.utc)))
    result = restore(desktop, selected, retain=1)
    assert values(result.safety_backup) == [(1, "original"), (2, "later")]
    assert list(desktop.directory.iterdir()) == [result.safety_backup]


def test_publication_failure_removes_verified_temporary(desktop, monkeypatch):
    old = snapshot(desktop, retain=1)

    def fail(*_):
        raise OSError("simulated rename error")

    monkeypatch.setattr(backups.Path, "replace", fail)
    with pytest.raises(OSError, match="rename error"):
        snapshot(desktop, retain=1)
    assert list(desktop.directory.iterdir()) == [old]


def test_integrity_exception_removes_new_temporary(desktop, monkeypatch):
    old = snapshot(desktop, retain=1)

    def fail(_):
        raise backups.BackupIntegrityError("simulated check error")

    monkeypatch.setattr(backups, "_check_integrity", fail)
    with pytest.raises(backups.BackupIntegrityError):
        snapshot(desktop, retain=1)
    assert list(desktop.directory.iterdir()) == [old]


def test_restore_requires_explicit_shutdown_acknowledgement(desktop):
    old = snapshot(desktop)
    insert(desktop, 2, "keep")
    with pytest.raises(ValueError, match="Stop database users"):
        backups.restore_backup(old, desktop.engine, data_dir=desktop.data)
    assert values(desktop.database) == [(1, "original"), (2, "keep")]


@pytest.mark.parametrize("kind", ["missing", "empty", "corrupt", "invalid_check"])
def test_invalid_restore_source_preserves_database_and_backups(desktop, tmp_path, kind):
    old = snapshot(desktop)
    invalid = tmp_path / "invalid.sqlite3"
    if kind == "empty":
        invalid.touch()
    elif kind == "corrupt":
        invalid.write_bytes(b"not a SQLite database")
    elif kind == "invalid_check":
        with closing(sqlite3.connect(invalid)) as conn:
            conn.execute("CREATE TABLE bad (n INTEGER CHECK (n > 0))")
            conn.execute("PRAGMA ignore_check_constraints=ON")
            conn.execute("INSERT INTO bad VALUES (-1)")
            conn.commit()
    with pytest.raises((ValueError, sqlite3.DatabaseError, backups.BackupIntegrityError)):
        restore(desktop, invalid)
    assert list(desktop.directory.iterdir()) == [old]
    assert values(desktop.database) == [(1, "original")]


def test_restore_rejects_active_database_and_hardlink(desktop, tmp_path):
    with pytest.raises(ValueError, match="differ"):
        restore(desktop, desktop.database)
    alias = tmp_path / "alias.sqlite3"
    os.link(desktop.database, alias)
    with pytest.raises(ValueError, match="differ"):
        restore(desktop, alias)
    assert not desktop.directory.exists()


def test_safety_backup_failure_aborts_restore(desktop, monkeypatch):
    old = snapshot(desktop)
    insert(desktop, 2, "keep")

    def fail(*_):
        raise OSError("simulated disk full")

    monkeypatch.setattr(backups, "_publish_backup", fail)
    with pytest.raises(OSError, match="disk full"):
        restore(desktop, old)
    assert values(desktop.database) == [(1, "original"), (2, "keep")]
    assert list(desktop.directory.iterdir()) == [old]


def test_restore_failure_preserves_safety_backup_and_skips_retention(desktop, monkeypatch):
    old = snapshot(desktop)
    insert(desktop, 2, "keep")
    copy = backups._copy_database
    calls = 0

    def fail_restore(source, destination, timeout):
        nonlocal calls
        calls += 1
        if calls == 3:  # selected staging, safety snapshot, then restore
            raise sqlite3.OperationalError("simulated restore error")
        return copy(source, destination, timeout)

    monkeypatch.setattr(backups, "_copy_database", fail_restore)
    with pytest.raises(backups.RestoreError) as error:
        restore(desktop, old, retain=1)
    safety = error.value.safety_backup
    assert values(safety) == [(1, "original"), (2, "keep")]
    assert values(desktop.database) == [(1, "original"), (2, "keep")]
    assert set(desktop.directory.iterdir()) == {old, safety}


def test_postgres_operations_are_transparent_noops(desktop, monkeypatch):
    engine = SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))

    def unexpected(*_, **__):
        pytest.fail("PostgreSQL must not open SQLite or touch backups")

    monkeypatch.setattr(backups.sqlite3, "connect", unexpected)
    assert backups.create_backup(engine, data_dir=desktop.data, retain=0) is None
    assert backups.restore_backup("missing", engine, data_dir=desktop.data) is None
    assert not desktop.directory.exists()


def test_default_engine_and_data_dir_are_from_database_module(desktop, monkeypatch):
    from backend import database
    monkeypatch.setattr(database, "engine", desktop.engine)
    monkeypatch.setattr(database, "DATA_DIR", str(desktop.data))
    path = backups.create_backup()
    assert path.parent == desktop.directory
    assert values(path) == [(1, "original")]
