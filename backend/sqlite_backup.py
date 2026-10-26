"""Verified online SQLite snapshots and offline restore (ADR-0003, F1-05j).

No application startup, scheduler or HTTP routes are installed by this module.
The desktop updater can call these helpers; PostgreSQL returns None immediately.
"""

import hashlib
import math
import os
import re
import sqlite3
import tempfile
import threading
import time
from contextlib import closing
from dataclasses import dataclass
from datetime import UTC, datetime, timezone
from pathlib import Path
from uuid import uuid4

from .db_compat import is_postgres, is_sqlite

DEFAULT_RETENTION = 7
DEFAULT_TIMEOUT = 30.0
# Desktop SQLite has one worker. Serialize publication, retention and restore,
# without blocking the application's independent reader/writer connections.
_operations = threading.RLock()


class BackupIntegrityError(RuntimeError):
    """A snapshot failed integrity_check; it must not be published or restored."""


class BackupTimeoutError(TimeoutError):
    """SQLite could not complete a copy within the allowed time."""


class RestoreError(RuntimeError):
    """Restore failed after the verified safety snapshot was published."""

    def __init__(self, safety_backup):
        super().__init__("SQLite restore failed; the pre-restore backup is preserved")
        self.safety_backup = safety_backup


@dataclass(frozen=True)
class RestoreResult:
    database: Path
    safety_backup: Path


def _settings(engine, data_dir):
    if engine is None:
        from .database import engine
    if is_postgres(engine):
        return None
    if not is_sqlite(engine):
        raise ValueError("SQLite backup supports SQLite and PostgreSQL engines only")
    name = engine.url.database
    if not name or name == ":memory:" or name.startswith("file:"):
        raise ValueError("SQLite backup requires a regular file database URL")
    database = Path(name).resolve()
    if data_dir is None:
        backup_dir = os.getenv("COUNSELORBOT_BACKUP_DIR")
        if backup_dir:
            directory = Path(backup_dir).resolve()
        else:
            from .database import DATA_DIR
            directory = Path(DATA_DIR).resolve() / "backups"
    else:
        directory = Path(data_dir).resolve() / "backups"
    # Keep retention independent if several database files share DATA_DIR.
    identity = hashlib.sha256(os.fsencode(database)).hexdigest()[:16]
    return engine, database, directory, f"sqlite-{identity}-"


def _validate_options(retain, timeout):
    if isinstance(retain, bool) or not isinstance(retain, int) or retain < 1:
        raise ValueError("retain must be a positive integer")
    if not math.isfinite(timeout) or timeout <= 0:
        raise ValueError("timeout must be positive and finite")


def _connect(path, *, writable=False):
    # mode=ro/rw prevents a typo or a missing DB from creating an empty database.
    if not path.is_file() or path.stat().st_size == 0:
        raise ValueError("SQLite source must be an existing, nonempty database file")
    mode = "rw" if writable else "ro"
    return sqlite3.connect(f"{path.as_uri()}?mode={mode}", uri=True, timeout=0.1)


def _copy_database(source, destination, timeout):
    deadline = time.monotonic() + timeout

    def progress(status, _remaining, _total):
        # backup() retries BUSY/LOCKED indefinitely unless its callback aborts.
        if status != sqlite3.SQLITE_DONE and time.monotonic() >= deadline:
            raise BackupTimeoutError("SQLite backup timed out")

    source.backup(destination, pages=128, progress=progress, sleep=0.01)


def _check_integrity(connection):
    try:
        rows = connection.execute("PRAGMA integrity_check").fetchall()
    except sqlite3.Error as exc:
        raise BackupIntegrityError("SQLite integrity_check failed") from exc
    if rows != [("ok",)]:
        # PRAGMA diagnostics may contain user data. Do not put them in errors.
        raise BackupIntegrityError("SQLite integrity_check did not return ok")


def _remove_temporary(path):
    # Some SQLite versions leave SHM behind even after switching a copied WAL
    # database to DELETE. These belong only to our closed, private temporary DB.
    for suffix in ("-wal", "-shm", "-journal", ""):
        Path(str(path) + suffix).unlink(missing_ok=True)


def _verified_copy(source_path, directory, timeout):
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".sqlite-", suffix=".partial", dir=directory)
    os.close(fd)
    temporary = Path(name)
    try:
        with closing(_connect(source_path)) as source:
            with closing(sqlite3.connect(temporary)) as destination:
                _copy_database(source, destination, timeout)
                # A snapshot must be usable without an accompanying WAL file.
                destination.execute("PRAGMA journal_mode=DELETE")
                _check_integrity(destination)
        # A writable descriptor also permits FlushFileBuffers/_commit on Windows.
        with temporary.open("r+b") as snapshot:
            os.fsync(snapshot.fileno())
        return temporary
    except BaseException:
        _remove_temporary(temporary)
        raise
    finally:
        for suffix in ("-wal", "-shm", "-journal"):
            Path(str(temporary) + suffix).unlink(missing_ok=True)


def _publish_backup(database, directory, prefix, timeout):
    temporary = _verified_copy(database, directory, timeout)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
    destination = directory / f"{prefix}{stamp}-{uuid4().hex}.sqlite3"
    try:
        temporary.replace(destination)
    finally:
        _remove_temporary(temporary)
    return destination


def _prune(directory, prefix, retain, newest):
    # Never touch exports, other DBs, symlinks, or incomplete snapshots.
    pattern = re.compile(re.escape(prefix) + r"\d{8}T\d{12}Z-[0-9a-f]{32}\.sqlite3")
    backups = sorted(
        (path for path in directory.iterdir()
         if pattern.fullmatch(path.name) and path.is_file() and not path.is_symlink()),
        # The just-created copy must survive even if the system clock moves
        # backwards, especially the safety snapshot immediately before restore.
        key=lambda path: (path == newest, path.name), reverse=True,
    )
    for obsolete in backups[retain:]:
        obsolete.unlink()


def create_backup(engine=None, *, data_dir=None, retain=DEFAULT_RETENTION,
                  timeout=DEFAULT_TIMEOUT) -> Path | None:
    """Return a verified snapshot in DATA_DIR/backups, or None for PostgreSQL.

    Uses an independent read connection: committed WAL writes are included and
    uncommitted transactions are excluded. Only after verification/publication
    are older snapshots of this database pruned to the last ``retain`` files.
    Errors propagate; incomplete/invalid copies are removed, old backups survive.
    """
    settings = _settings(engine, data_dir)
    if settings is None:
        return None
    _validate_options(retain, timeout)
    _, database, directory, prefix = settings
    with _operations:
        backup = _publish_backup(database, directory, prefix, timeout)
        _prune(directory, prefix, retain, backup)
        return backup


def restore_backup(backup_path, engine=None, *, data_dir=None,
                   database_stopped=False, retain=DEFAULT_RETENTION,
                   timeout=DEFAULT_TIMEOUT) -> RestoreResult | None:
    """Restore a verified file, first saving the current state; PostgreSQL: None.

    The caller MUST stop requests/background writers and close all sessions and
    external DB connections before passing database_stopped=True. This flag is
    an explicit acknowledgement, not an interprocess lock. Idle engine pool
    connections are disposed here. See docs/operations/sqlite-backups.md.

    Stage/verify the selected snapshot before making a safety backup. Restore
    via SQLite's backup API too, preserving WAL semantics without replacing a
    live database inode. Retention runs only after a successful restore; it may
    remove the selected old backup, but always keeps the new safety snapshot.
    """
    settings = _settings(engine, data_dir)
    if settings is None:
        return None
    if database_stopped is not True:
        raise ValueError("Stop database users before restoring; set database_stopped=True")
    _validate_options(retain, timeout)
    engine, database, directory, prefix = settings
    selected = Path(backup_path).resolve()
    if selected == database or (selected.exists() and database.exists()
                                and selected.samefile(database)):
        raise ValueError("The restore source must differ from the active database")
    with _operations:
        engine.dispose()
        staged = _verified_copy(selected, directory, timeout)
        try:
            safety = _publish_backup(database, directory, prefix, timeout)
            try:
                with closing(_connect(staged)) as source:
                    with closing(_connect(database, writable=True)) as destination:
                        _copy_database(source, destination, timeout)
                        _check_integrity(destination)
            except Exception as exc:
                raise RestoreError(safety) from exc
            _prune(directory, prefix, retain, safety)
            return RestoreResult(database=database, safety_backup=safety)
        finally:
            _remove_temporary(staged)
