#!/usr/bin/env python3
"""Check a stopped, isolated teacher profile after a non-minimal bundle smoke."""
import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3


def check_profile(root: Path) -> None:
    layout = json.loads((root / "layout.json").read_text(encoding="utf-8"))
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
    args = parser.parse_args()
    check_profile(args.data_dir)
    print("ok: full teacher schema, seed and SQLite integrity")


if __name__ == "__main__":
    main()
