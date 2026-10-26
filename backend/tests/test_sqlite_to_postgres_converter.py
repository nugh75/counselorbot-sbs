"""Test per il converter SQLite → PostgreSQL (ADR-0004 §7).

Questi test richiedono un database PostgreSQL di test (TEST_DB=postgres).
Saltati automaticamente se PostgreSQL non è disponibile.
"""

import json
import os
import sqlite3
import tempfile
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

from backend.sqlite_to_postgres_converter import (
    EXIT_CODES,
    ConverterError,
    ImportState,
    SQLiteToPostgresConverter,
)


@pytest.fixture
def sqlite_source(tmp_path):
    """Crea un database SQLite di test con dati."""
    db_path = tmp_path / "test.sqlite3"
    conn = sqlite3.connect(db_path)
    conn.executescript("""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL,
            email TEXT,
            created_at TEXT
        );
        CREATE TABLE groups (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL
        );
        CREATE TABLE memberships (
            id INTEGER PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            group_id INTEGER REFERENCES groups(id)
        );
        INSERT INTO users (id, username, email, created_at) VALUES
            (1, 'mario', 'mario@example.com', '2026-01-01T00:00:00'),
            (2, 'luigi', 'luigi@example.com', '2026-01-02T00:00:00');
        INSERT INTO groups (id, name) VALUES (1, 'Classe 1A'), (2, 'Classe 2B');
        INSERT INTO memberships (id, user_id, group_id) VALUES (1, 1, 1), (2, 2, 2);
    """)
    conn.commit()
    conn.close()
    return db_path


@pytest.fixture
def postgres_engine():
    """Engine PostgreSQL di test. Salta se non disponibile."""
    database_url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not database_url or not database_url.startswith("postgresql://"):
        pytest.skip("PostgreSQL non disponibile (imposta TEST_DATABASE_URL)")

    engine = create_engine(database_url)

    # Crea schema di test (tabelle minime)
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS memberships CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS groups CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS users CASCADE"))
        conn.execute(text("""
            CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                username TEXT NOT NULL,
                email TEXT,
                created_at TEXT
            )
        """))
        conn.execute(text("""
            CREATE TABLE groups (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL
            )
        """))
        conn.execute(text("""
            CREATE TABLE memberships (
                id INTEGER PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                group_id INTEGER REFERENCES groups(id)
            )
        """))
        conn.execute(text("CREATE TABLE target_only_seed (id INTEGER PRIMARY KEY, name TEXT)"))
        conn.execute(text("INSERT INTO target_only_seed (id, name) VALUES (1, 'seed')"))

    yield engine

    # Cleanup
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS target_only_seed CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS memberships CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS groups CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS users CASCADE"))


def test_import_state_save_load(tmp_path):
    """Test salvataggio e caricamento stato."""
    state_path = tmp_path / "migration" / "sqlite-import.json"
    state = ImportState(state_path)

    state.set("attempt_id", "test-123")
    state.set("state", "pending")

    # Ricarica
    state2 = ImportState(state_path)
    assert state2.get("attempt_id") == "test-123"
    assert state2.get("state") == "pending"


def test_converter_basic_import(sqlite_source, postgres_engine, tmp_path):
    """Test import base da SQLite a PostgreSQL."""
    attempt_id = str(uuid.uuid4())
    snapshot_path = tmp_path / "snapshots" / f"snapshot-{attempt_id}.sqlite3"
    report_path = tmp_path / "reports" / f"report-{attempt_id}.json"

    converter = SQLiteToPostgresConverter(
        source_path=sqlite_source,
        target_engine=postgres_engine,
        snapshot_dir=snapshot_path.parent,
        report_path=report_path,
        attempt_id=attempt_id,
        app_version="0.2.0-test",
    )

    exit_code = converter.run()
    assert exit_code == EXIT_CODES["ok"]

    # Verifica dati in PostgreSQL
    with postgres_engine.connect() as conn:
        users = conn.execute(text("SELECT COUNT(*) FROM users")).scalar()
        groups = conn.execute(text("SELECT COUNT(*) FROM groups")).scalar()
        memberships = conn.execute(text("SELECT COUNT(*) FROM memberships")).scalar()

    assert users == 2
    assert groups == 2
    assert memberships == 2

    # Verifica report
    assert report_path.exists()
    with open(report_path) as f:
        report = json.load(f)
    assert report["total_rows_source"] == report["total_rows_target"]


def test_converter_missing_source(postgres_engine, tmp_path):
    """Test errore con sorgente mancante."""
    converter = SQLiteToPostgresConverter(
        source_path=tmp_path / "nonexistent.sqlite3",
        target_engine=postgres_engine,
        snapshot_dir=tmp_path / "snapshots",
        report_path=tmp_path / "report.json",
        attempt_id=str(uuid.uuid4()),
        app_version="0.2.0-test",
    )

    exit_code = converter.run()
    assert exit_code == EXIT_CODES["source_unusable"]


def test_converter_corrupted_source(postgres_engine, tmp_path):
    """Test errore con sorgente corrotta."""
    # Crea file non-SQLite
    bad_source = tmp_path / "corrupted.sqlite3"
    bad_source.write_bytes(b"not a sqlite database")

    converter = SQLiteToPostgresConverter(
        source_path=bad_source,
        target_engine=postgres_engine,
        snapshot_dir=tmp_path / "snapshots",
        report_path=tmp_path / "report.json",
        attempt_id=str(uuid.uuid4()),
        app_version="0.2.0-test",
    )

    exit_code = converter.run()
    assert exit_code == EXIT_CODES["source_unusable"]


def test_converter_resume(sqlite_source, postgres_engine, tmp_path):
    """Test ripresa da stato esistente."""
    attempt_id = str(uuid.uuid4())
    snapshot_path = tmp_path / "snapshots" / f"snapshot-{attempt_id}.sqlite3"
    report_path = tmp_path / "reports" / f"report-{attempt_id}.json"

    # Prima esecuzione
    converter1 = SQLiteToPostgresConverter(
        source_path=sqlite_source,
        target_engine=postgres_engine,
        snapshot_dir=snapshot_path.parent,
        report_path=report_path,
        attempt_id=attempt_id,
        app_version="0.2.0-test",
    )
    exit_code = converter1.run()
    assert exit_code == EXIT_CODES["ok"]

    # Seconda esecuzione (ripresa) — deve fallire o gestire correttamente
    converter2 = SQLiteToPostgresConverter(
        source_path=sqlite_source,
        target_engine=postgres_engine,
        snapshot_dir=snapshot_path.parent,
        report_path=report_path,
        attempt_id=str(uuid.uuid4()),  # nuovo attempt_id
        app_version="0.2.0-test",
    )
    # Dovrebbe fare rollback e rieseguire
    exit_code = converter2.run()
    assert exit_code == EXIT_CODES["ok"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
