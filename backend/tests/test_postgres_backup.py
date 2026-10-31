"""Pre-update PostgreSQL backup of the desktop app (#738).

pg_dump/pg_restore are replaced by a fake runner: the tests check the command
lines, the secret handling, publication and retention, without a server.
"""
import os
import shutil
import subprocess
from pathlib import Path

import pytest
from sqlalchemy import create_engine

from backend import postgres_backup

URL = "postgresql://counselorbot_app:s%40cret@127.0.0.1:54321/counselorbot"


@pytest.fixture
def tools(tmp_path, monkeypatch):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    suffix = ".exe" if os.name == "nt" else ""
    for name in ("pg_dump", "pg_restore"):
        (bin_dir / f"{name}{suffix}").write_bytes(b"")
    monkeypatch.setenv(postgres_backup.BIN_DIR_ENV, str(bin_dir))
    calls = []
    failing = set()

    def run(command, *, env, timeout, **_):
        calls.append((command, env))
        tool = Path(command[0]).stem
        if tool in failing:
            return subprocess.CompletedProcess(command, 1, "", "pg_dump: error: connection refused\n")
        if tool == "pg_dump":
            Path(command[command.index("--file") + 1]).write_bytes(b"PGDMP synthetic archive")
        return subprocess.CompletedProcess(command, 0, "", "")

    monkeypatch.setattr(postgres_backup.subprocess, "run", run)
    return calls, failing


def test_dump_is_verified_and_published(tools, tmp_path):
    calls, _ = tools
    backup = postgres_backup.create_backup(create_engine(URL), backup_dir=tmp_path / "backups")
    assert backup.parent == (tmp_path / "backups").resolve()
    assert postgres_backup._BACKUP_NAME.fullmatch(backup.name)
    assert backup.read_bytes() == b"PGDMP synthetic archive"
    assert [Path(command[0]).stem for command, _ in calls] == ["pg_dump", "pg_restore"]
    dump, env = calls[0]
    assert dump[-1] == "counselorbot"
    assert ["--port", "54321"] == dump[dump.index("--port"):dump.index("--port") + 2]
    assert "--format=custom" in dump and "--no-password" in dump
    assert env["PGPASSWORD"] == "s@cret"
    assert not any("s@cret" in part or "s%40cret" in part for part in dump)
    assert not list(backup.parent.glob("*.partial"))


def test_failures_remove_the_partial_file_and_keep_old_backups(tools, tmp_path):
    _, failing = tools
    directory = tmp_path / "backups"
    old = postgres_backup.create_backup(create_engine(URL), backup_dir=directory)
    for tool in ("pg_dump", "pg_restore"):
        failing.clear()
        failing.add(tool)
        with pytest.raises(postgres_backup.BackupError, match="connection refused"):
            postgres_backup.create_backup(create_engine(URL), backup_dir=directory)
        assert sorted(directory.iterdir()) == [old]


def test_retention_keeps_the_newest_and_ignores_other_files(tools, tmp_path):
    directory = tmp_path / "backups"
    directory.mkdir()
    unrelated = directory / "export.dump"
    unrelated.write_text("keep")
    made = [postgres_backup.create_backup(create_engine(URL), backup_dir=directory, retain=2) for _ in range(3)]
    assert sorted(directory.iterdir()) == sorted([unrelated, *made[1:]])


def test_backup_dir_comes_from_the_desktop_environment(tools, tmp_path, monkeypatch):
    monkeypatch.setenv("COUNSELORBOT_BACKUP_DIR", str(tmp_path / "profile-backups"))
    backup = postgres_backup.create_backup(create_engine(URL))
    assert backup.parent == (tmp_path / "profile-backups").resolve()


def test_missing_bundled_tool_is_an_error(tmp_path, monkeypatch):
    monkeypatch.setenv(postgres_backup.BIN_DIR_ENV, str(tmp_path))
    with pytest.raises(postgres_backup.BackupError, match="pg_dump"):
        postgres_backup.create_backup(create_engine(URL), backup_dir=tmp_path / "backups")


def test_only_postgresql_urls_are_accepted(tools, tmp_path):
    with pytest.raises(ValueError):
        postgres_backup.create_backup(create_engine("sqlite://"), backup_dir=tmp_path)


@pytest.mark.skipif(not (os.getenv("DATABASE_URL", "").startswith("postgresql") and shutil.which("pg_dump")),
                    reason="needs a PostgreSQL DATABASE_URL and pg_dump on PATH")
def test_real_pg_dump_of_the_test_database(tmp_path, monkeypatch):
    monkeypatch.delenv(postgres_backup.BIN_DIR_ENV, raising=False)
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        backup = postgres_backup.create_backup(engine, backup_dir=tmp_path)
    finally:
        engine.dispose()
    assert backup.read_bytes().startswith(b"PGDMP")
