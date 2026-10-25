"""Regression tests for the full-startup smoke's data checks; temporary files only."""
from contextlib import closing
import importlib.util
import json
from pathlib import Path
import sqlite3

import pytest

spec = importlib.util.spec_from_file_location("teacher_data_check", Path(__file__).with_name("check-teacher-data.py"))
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


@pytest.fixture
def profile(tmp_path):
    (tmp_path / "layout.json").write_text(json.dumps({"layout": 1, "app": "teacher"}))
    (tmp_path / "db").mkdir()
    with closing(sqlite3.connect(tmp_path / "db/counselorbot.sqlite3")) as db, db:
        for table in ("configs", "instruments", "local_sessions", "class_pairing_codes", "local_students"):
            db.execute(f"CREATE TABLE {table} (id INTEGER PRIMARY KEY)")
        for table in ("configs", "instruments"):
            db.execute(f"INSERT INTO {table} VALUES (1)")
    return tmp_path


def test_seeded_profile_passes_twice(profile):
    checker.check_profile(profile)
    checker.check_profile(profile)


@pytest.mark.parametrize("table", ["local_sessions", "class_pairing_codes", "local_students"])
def test_missing_local_schema_fails(profile, table):
    with closing(sqlite3.connect(profile / "db/counselorbot.sqlite3")) as db, db:
        db.execute(f"DROP TABLE {table}")
    with pytest.raises(ValueError, match="schema incomplete"):
        checker.check_profile(profile)


@pytest.mark.parametrize("table", ["configs", "instruments"])
def test_missing_seed_fails(profile, table):
    with closing(sqlite3.connect(profile / "db/counselorbot.sqlite3")) as db, db:
        db.execute(f"DELETE FROM {table}")
    with pytest.raises(ValueError, match="seed missing"):
        checker.check_profile(profile)


def test_missing_database_is_not_created(profile):
    database = profile / "db/counselorbot.sqlite3"
    database.unlink()
    with pytest.raises(sqlite3.OperationalError):
        checker.check_profile(profile)
    assert not database.exists()


def test_corruption_fails(profile):
    (profile / "db/counselorbot.sqlite3").write_bytes(b"broken SQLite")
    with pytest.raises(sqlite3.DatabaseError):
        checker.check_profile(profile)


def test_foreign_key_violation_fails(profile):
    with closing(sqlite3.connect(profile / "db/counselorbot.sqlite3")) as db, db:
        db.execute("CREATE TABLE child (parent_id INTEGER REFERENCES configs(id))")
        db.execute("INSERT INTO child VALUES (999)")
    with pytest.raises(ValueError, match="foreign key"):
        checker.check_profile(profile)


def test_unknown_layout_fails(profile):
    (profile / "layout.json").write_text('{"layout": 2, "app": "teacher"}')
    with pytest.raises(ValueError, match="layout"):
        checker.check_profile(profile)
