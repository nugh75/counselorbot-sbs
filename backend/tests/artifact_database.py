"""Isolated test database for one test, on Postgres or SQLite (ADR-0003 §5.1).

TEST_DB=postgres (default): a rolled-back schema of counselorbot_test.
TEST_DB=sqlite: a fresh temporary file with the desktop PRAGMAs (WAL, busy
timeout, foreign keys), never :memory:, which would hide both.
"""
import os
import shutil
import tempfile
import uuid
from contextlib import contextmanager
from urllib.parse import urlsplit, urlunsplit

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session

from backend import models

TEST_DB = os.environ.get('TEST_DB', 'postgres').strip().lower()
if TEST_DB not in ('postgres', 'sqlite'):
    raise RuntimeError(f"TEST_DB must be 'postgres' or 'sqlite', not {TEST_DB!r}")

# Same settings as the desktop engine (ADR-0003 §4.1).
SQLITE_PRAGMAS = (
    'PRAGMA journal_mode=WAL',
    'PRAGMA busy_timeout=5000',
    'PRAGMA foreign_keys=ON',
    'PRAGMA synchronous=NORMAL',
)


def is_sqlite_test_db():
    return TEST_DB == 'sqlite'


def sqlite_engine(path):
    engine = create_engine(f'sqlite:///{path}', connect_args={'check_same_thread': False})

    @event.listens_for(engine, 'connect')
    def _pragmas(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        try:
            for pragma in SQLITE_PRAGMAS:
                cursor.execute(pragma)
        finally:
            cursor.close()

    return engine


@contextmanager
def _sqlite_session():
    folder = tempfile.mkdtemp(prefix='cb-artifacts-')
    engine = sqlite_engine(os.path.join(folder, 'test.sqlite3'))
    try:
        models.Base.metadata.create_all(engine)
        with Session(bind=engine) as session:
            yield session
    finally:
        engine.dispose()
        shutil.rmtree(folder, ignore_errors=True)


@contextmanager
def _postgres_session():
    import psycopg2

    parsed = urlsplit(os.environ['DATABASE_URL'])
    test_url = urlunsplit((parsed.scheme, parsed.netloc, '/counselorbot_test', parsed.query, parsed.fragment))
    admin_url = urlunsplit((parsed.scheme, parsed.netloc, '/postgres', parsed.query, parsed.fragment))
    admin = psycopg2.connect(admin_url)
    try:
        admin.autocommit = True
        with admin.cursor() as cursor:
            cursor.execute('SELECT 1 FROM pg_database WHERE datname = %s', ('counselorbot_test',))
            if not cursor.fetchone():
                cursor.execute('CREATE DATABASE counselorbot_test')
    finally:
        admin.close()
    engine = create_engine(test_url)
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                schema = 'artifacts_' + uuid.uuid4().hex
                connection.execute(text(f'CREATE SCHEMA "{schema}"'))
                connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
                models.Base.metadata.create_all(connection)
                with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
                    yield session
            finally:
                transaction.rollback()
    finally:
        engine.dispose()


def artifact_session():
    return _sqlite_session() if is_sqlite_test_db() else _postgres_session()
