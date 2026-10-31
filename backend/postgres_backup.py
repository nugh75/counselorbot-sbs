"""Verified pg_dump snapshots of the desktop PostgreSQL database (#738, ADR-0004).

The desktop updater asks for one before every update, through
`/internal/backup` or the sidecar `--backup`. pg_dump and pg_restore come from
the binaries bundled with the app (COUNSELORBOT_PG_BIN_DIR, set by the shell);
outside the app they are looked up on PATH. The password reaches them through
PGPASSWORD, never on the command line.
"""

import os
import re
import shutil
import subprocess
import tempfile
import threading
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

BIN_DIR_ENV = "COUNSELORBOT_PG_BIN_DIR"
DEFAULT_RETENTION = 7
# The shell waits 60 s for the /internal/backup reply.
DEFAULT_TIMEOUT = 45.0
PREFIX = "postgres-"
_BACKUP_NAME = re.compile(re.escape(PREFIX) + r"\d{8}T\d{12}Z-[0-9a-f]{32}\.dump")
_operations = threading.Lock()


class BackupError(RuntimeError):
    """pg_dump could not produce a complete, readable archive."""


def _tool(name):
    executable = name + (".exe" if os.name == "nt" else "")
    bin_dir = os.getenv(BIN_DIR_ENV)
    if bin_dir:
        path = Path(bin_dir) / executable
        if not path.is_file():
            raise BackupError(f"{executable} non trovato in {BIN_DIR_ENV}")
        return str(path)
    found = shutil.which(name)
    if not found:
        raise BackupError(f"{name} non trovato: imposta {BIN_DIR_ENV}")
    return found


def _backup_dir(backup_dir):
    if backup_dir is not None:
        return Path(backup_dir).resolve()
    configured = os.getenv("COUNSELORBOT_BACKUP_DIR")
    if configured:
        return Path(configured).resolve()
    from .database import DATA_DIR
    return Path(DATA_DIR).resolve() / "backups"


def _connection(engine):
    url = engine.url
    if url.get_backend_name() != "postgresql" or not url.database:
        raise ValueError("PostgreSQL backup requires a PostgreSQL database URL")
    args = ["--host", url.host or "127.0.0.1", "--port", str(url.port or 5432), "--no-password"]
    if url.username:
        args += ["--username", url.username]
    env = {**os.environ, "PGCONNECT_TIMEOUT": "10"}
    env.pop("PGPASSWORD", None)
    if url.password:
        env["PGPASSWORD"] = url.password
    return args, url.database, env


def _run(command, env, timeout):
    try:
        result = subprocess.run(
            command, env=env, capture_output=True, text=True, timeout=timeout,
            # No console window flashes from the windowed app on Windows.
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except subprocess.TimeoutExpired as exc:
        raise BackupError(f"{Path(command[0]).stem}: tempo scaduto") from exc
    if result.returncode != 0:
        lines = (result.stderr or "").strip().splitlines()
        raise BackupError(f"{Path(command[0]).stem} fallito: {lines[-1] if lines else result.returncode}")


def _prune(directory, retain, newest):
    # Never touch other files, symlinks, or incomplete archives.
    backups = sorted(
        (path for path in directory.iterdir()
         if _BACKUP_NAME.fullmatch(path.name) and path.is_file() and not path.is_symlink()),
        # The new archive survives even if the system clock moved backwards.
        key=lambda path: (path == newest, path.name), reverse=True,
    )
    for obsolete in backups[retain:]:
        obsolete.unlink()


def create_backup(engine=None, *, backup_dir=None, retain=DEFAULT_RETENTION,
                  timeout=DEFAULT_TIMEOUT) -> Path:
    """Return a verified pg_dump archive (custom format) in the backup folder.

    pg_restore reads the whole archive before it is published; only then are
    older archives pruned to the last ``retain``. Errors propagate and remove
    the partial file, so the updater stops and old backups survive.
    """
    if isinstance(retain, bool) or not isinstance(retain, int) or retain < 1:
        raise ValueError("retain must be a positive integer")
    if engine is None:
        from .database import engine
    args, database, env = _connection(engine)
    directory = _backup_dir(backup_dir)
    with _operations:
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        fd, name = tempfile.mkstemp(prefix=".postgres-", suffix=".partial", dir=directory)
        os.close(fd)
        temporary = Path(name)
        try:
            _run([_tool("pg_dump"), *args, "--format=custom", "--file", str(temporary), database], env, timeout)
            # Reading every block to a null script proves the archive is complete.
            _run([_tool("pg_restore"), "--file", os.devnull, str(temporary)], env, timeout)
            with temporary.open("r+b") as archive:
                os.fsync(archive.fileno())
            stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
            destination = directory / f"{PREFIX}{stamp}-{uuid4().hex}.dump"
            temporary.replace(destination)
        finally:
            temporary.unlink(missing_ok=True)
        _prune(directory, retain, destination)
        return destination
