"""The PostgreSQL engine has no listeners or rebinding (ADR-0003 §4.1)."""

import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_mock_engine
from sqlalchemy.orm import sessionmaker

from backend import db_compat

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_db_compat_detects_the_dialect():
    postgres = create_mock_engine("postgresql://", lambda *_: None)
    assert db_compat.is_postgres(postgres)
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


def test_get_db_is_only_used_as_a_fastapi_dependency():
    """get_db needs the request: scripts and jobs use SessionLocal() or write_session()."""
    import re
    direct_call = re.compile(r"(?<![\w.])(?:database\.)?get_db\(\)")
    offenders = []
    for folder in ("backend", "scripts"):
        for path in (REPO_ROOT / folder).rglob("*.py"):
            if "tests" in path.parts:
                continue
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if direct_call.search(line) and "Depends(" not in line and not line.lstrip().startswith("def "):
                    offenders.append(f"{path.relative_to(REPO_ROOT)}:{number}")
    assert offenders == []
