#!/usr/bin/env python3
"""Check a stopped, isolated teacher profile after a non-minimal bundle smoke."""
import argparse
from contextlib import closing
import json
import os
from pathlib import Path
import sqlite3
import subprocess


def check_profile(root: Path, postgres_report: Path | None = None) -> None:
    layout = json.loads((root / "layout.json").read_text(encoding="utf-8"))
    if layout.get("layout") == 2 and layout.get("app") == "teacher":
        if postgres_report is None:
            raise ValueError("PostgreSQL requires a live isolated smoke report")
        report = json.loads(postgres_report.read_text(encoding="utf-8"))
        if Path(report["data_dir"]).resolve() != root.resolve():
            raise ValueError("PostgreSQL report belongs to a different profile")
        identity = json.loads((root / "run/postgresql.json").read_text(encoding="utf-8"))
        if Path(identity["pgdata_path"]).resolve() != (root / "db/postgresql").resolve():
            raise ValueError("Unexpected PostgreSQL data path")
        suffix = ".exe" if os.name == "nt" else ""
        sql = "SELECT tablename FROM pg_tables WHERE schemaname='public'; SELECT count(*) FROM configs; SELECT count(*) FROM instruments;"
        result = subprocess.run(
            [str(Path(report["postgresql_bin_dir"]) / ("psql" + suffix)), "-X", "-w", "-h", "127.0.0.1",
             "-p", str(report["postgresql_port"]), "-U", "counselorbot_app", "-d", "counselorbot",
             "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql],
            env={**os.environ, "PGPASSWORD": "isolated-headless-test-only"},
            check=True, capture_output=True, text=True, timeout=15,
        )
        rows = result.stdout.strip().splitlines()
        required = {"configs", "instruments", "local_sessions", "class_pairing_codes", "local_students"}
        if not required <= set(rows[:-2]):
            raise ValueError("Teacher schema incomplete")
        if any(int(count) <= 0 for count in rows[-2:]):
            raise ValueError("Teacher seed missing")
        return
    if layout.get("layout") != 1 or layout.get("app") != "teacher":
        raise ValueError("Unexpected teacher data layout")
    database = root / "db" / "counselorbot.sqlite3"
    # mode=ro prevents a missing DB from being silently created by the check.
    with closing(sqlite3.connect(database.resolve().as_uri() + "?mode=ro", uri=True)) as db:
        if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("SQLite integrity check failed")
        if db.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("SQLite foreign key check failed")
        tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        required = {"configs", "instruments", "local_sessions", "class_pairing_codes", "local_students"}
        if not required <= tables:
            raise ValueError("Teacher schema incomplete")
        for table in ("configs", "instruments"):
            if db.execute(f"SELECT count(*) FROM {table}").fetchone()[0] == 0:
                raise ValueError(f"Teacher seed missing: {table}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data_dir", type=Path)
    parser.add_argument("--postgres-report", type=Path)
    args = parser.parse_args()
    check_profile(args.data_dir, args.postgres_report)
    print("ok: full teacher schema and seed; SQLite integrity when applicable")


if __name__ == "__main__":
    main()
