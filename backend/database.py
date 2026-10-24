import os
import sqlite3
import sys
from fastapi import Depends, Request
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker
from starlette.requests import HTTPConnection
from . import auth
from .db_compat import check_sqlite_workers

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./counselorbot.db")
DATA_DIR = os.getenv("DATA_DIR", "/app/uploads")

# ADR-0003 §4.1: RETURNING, DROP COLUMN e upsert richiedono SQLite >= 3.35.
MIN_SQLITE_VERSION = (3, 35, 0)
SQLITE_TOO_OLD_EXIT_CODE = 3
WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


def check_sqlite_version(version_info=None):
    version_info = sqlite3.sqlite_version_info if version_info is None else tuple(version_info)
    if version_info < MIN_SQLITE_VERSION:
        found = ".".join(str(part) for part in version_info)
        required = ".".join(str(part) for part in MIN_SQLITE_VERSION)
        print(f"SQLite {found} non supportato: serve almeno {required}", file=sys.stderr)
        raise SystemExit(SQLITE_TOO_OLD_EXIT_CODE)


def configure_sqlite_engine(sqlite_engine):
    """PRAGMA desktop e transazioni aperte da SQLAlchemy (ADR-0003 §4.1, §4.3).

    Ricetta SQLAlchemy per pysqlite: il driver non emette piu' BEGIN da solo,
    lo fa l'evento `begin`, IMMEDIATE se il motore ha `sqlite_begin="IMMEDIATE"`.
    """

    check_sqlite_workers()

    @event.listens_for(sqlite_engine, "connect")
    def _on_connect(dbapi_connection, _record):
        dbapi_connection.isolation_level = None
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA synchronous=NORMAL")
        finally:
            cursor.close()

    @event.listens_for(sqlite_engine, "begin")
    def _on_begin(conn):
        mode = conn.get_execution_options().get("sqlite_begin")
        conn.exec_driver_sql("BEGIN IMMEDIATE" if mode == "IMMEDIATE" else "BEGIN")


if "sqlite" in SQLALCHEMY_DATABASE_URL:
    check_sqlite_version()
    connect_args = {"check_same_thread": False}
else:
    connect_args = {}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args=connect_args
)
if engine.dialect.name == "sqlite":
    configure_sqlite_engine(engine)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def as_write_session(db):
    """Le transazioni di questa sessione aprono con BEGIN IMMEDIATE su SQLite.

    Su Postgres (o con un bind che non e' un Engine SQLite) la sessione resta com'e'.
    """
    bind = db.bind
    if isinstance(bind, Engine) and bind.dialect.name == "sqlite":
        db.bind = bind.execution_options(sqlite_begin="IMMEDIATE")
    return db


def write_session():
    """Sessione di scrittura per cicli in background e job; chi la apre la chiude."""
    return as_write_session(SessionLocal())


def independent_read_session(db):
    """Short committed-state lookup without inheriting SQLite's write intent.

    Callers own/close this session before provider I/O. A Connection bind keeps
    test savepoints; production Engine binds use a separate connection.
    """
    bind = db.get_bind()
    if isinstance(bind, Engine) and bind.dialect.name == "sqlite":
        bind = bind.execution_options(sqlite_begin=None)
    return Session(bind=bind, join_transaction_mode="create_savepoint")


def get_db(connection: HTTPConnection):
    db = SessionLocal()
    if connection.scope.get("method") in WRITE_METHODS:
        as_write_session(db)
    try:
        yield db
    finally:
        db.close()


def get_personal_ai_db(request: Request, db=Depends(get_db), identity=Depends(auth.get_identity_view_as)):
    """Request-scoped AI owner; never derive it from a session/result ID."""
    from .chatgpt_connections import bind_identity
    bind_identity(db, identity, request.headers.get("X-CounselorBot-Language", "it"))
    return db
