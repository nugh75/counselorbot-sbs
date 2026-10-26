"""Helper per la compatibilita' runtime tra PostgreSQL e SQLite (ADR-0003).

Accettano un Engine, una Connection o una Session: tutto cio' che espone il dialetto
direttamente (`.dialect`) o tramite il bind (`.get_bind()`).
"""
import hashlib
import os
import shlex
import sys
import threading
from datetime import UTC, datetime, timezone
from weakref import WeakValueDictionary

from sqlalchemy import DateTime, event, inspect, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.orm import Session
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator):
    """Colonna data e ora sempre aware con fuso orario UTC (ADR-0003 §2.4).

    In SQLite, le colonne DateTime restituiscono datetime naïve (senza fuso orario),
    causando TypeError nei confronti e sottrazioni con datetime aware (come
    datetime.now(timezone.utc)).
    Questo TypeDecorator assicura che:
    1. In scrittura: converte i datetime aware in UTC e assume UTC per i datetime naïve; None invariato.
    2. In lettura: restituisce sempre un datetime aware con tzinfo=timezone.utc (se naive, replace; se aware, astimezone); None invariato.
    3. Su Postgres: la DDL compilata resta identica a DateTime(timezone=True) ('TIMESTAMP WITH TIME ZONE'),
       garantendo nessuna migrazione e nessuna modifica allo schema Postgres in produzione.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, str):
            try:
                value = datetime.fromisoformat(value)
            except (ValueError, TypeError):
                return value
        if isinstance(value, datetime):
            if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
                return value.replace(tzinfo=UTC)
            return value.astimezone(UTC)
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, str):
            try:
                value = datetime.fromisoformat(value)
            except (ValueError, TypeError):
                return value
        if isinstance(value, datetime):
            if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
                return value.replace(tzinfo=UTC)
            return value.astimezone(UTC)
        return value


_locks = WeakValueDictionary()
_locks_guard = threading.Lock()
_LOCKS_INFO = "counselorbot_xact_locks"


def check_sqlite_workers():
    """Refuse known multi-process server configurations: locks are process-local."""
    settings = {name: os.environ[name] for name in ("WEB_CONCURRENCY", "UVICORN_WORKERS")
                if os.environ.get(name)}
    for source, args in (("argv", sys.argv[1:]),
                         ("GUNICORN_CMD_ARGS", shlex.split(os.getenv("GUNICORN_CMD_ARGS", "")))):
        for index, arg in enumerate(args):
            if arg in ("--workers", "-w") and index + 1 < len(args):
                settings[source] = args[index + 1]
            elif arg.startswith("--workers="):
                settings[source] = arg.split("=", 1)[1]
            elif arg.startswith("-w") and arg[2:].isdigit():
                settings[source] = arg[2:]
    for source, value in settings.items():
        try:
            workers = int(value)
        except ValueError:
            raise RuntimeError(f"SQLite requires one worker; invalid {source}={value!r}") from None
        if workers > 1:
            raise RuntimeError(f"SQLite transaction locks require one worker; {source}={value} (ADR-0003 §4.2)")


def _release_locks(held):
    locks = list(held.values())
    held.clear()
    for lock in locks:
        lock.release()


def _session_transaction_end(session, transaction):
    # Unlike after_commit/after_rollback, this also handles close() and lets us
    # distinguish the outer transaction from flush subtransactions and SAVEPOINTs.
    if transaction.parent is None:
        _release_locks(session.info.get(_LOCKS_INFO, {}))


def _connection_transaction_end(connection):
    _release_locks(connection._counselorbot_xact_locks)


def xact_lock(db, *parts):
    """Hold a deterministic advisory lock until the transaction ends (ADR-0003 §4.2).

    Accepts a Session or Connection. SQLite uses weakly registered thread locks
    and requires one process. Repeated acquisition in one transaction is a no-op;
    SAVEPOINT completion does not release locks owned by the outer transaction.
    SQLite Sessions use the write engine option (BEGIN IMMEDIATE in database.py).
    """
    if not parts:
        raise ValueError("xact_lock requires at least one identifying part")
    key = int.from_bytes(hashlib.blake2b(
        ":".join(str(part) for part in parts).encode("utf-8"), digest_size=8
    ).digest(), byteorder="big", signed=True)
    if is_postgres(db):
        db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})
        return
    if not is_sqlite(db):
        raise NotImplementedError("xact_lock supports PostgreSQL and SQLite")
    check_sqlite_workers()
    if isinstance(db, Session):
        if _LOCKS_INFO not in db.info:
            db.info[_LOCKS_INFO] = {}
            event.listen(db, "after_transaction_end", _session_transaction_end)
        # Do not acquire a physical database connection before the thread lock:
        # a waiting request must not occupy the pool or hold SQLite's writer lock.
        if isinstance(db.bind, Engine) and db.bind.get_execution_options().get("sqlite_begin") != "IMMEDIATE":
            db.bind = db.bind.execution_options(sqlite_begin="IMMEDIATE")
        if not db.in_transaction():
            db.begin()
        held = db.info[_LOCKS_INFO]
    elif isinstance(db, Connection):
        if not hasattr(db, "_counselorbot_xact_locks"):
            db._counselorbot_xact_locks = {}
            event.listen(db, "commit", _connection_transaction_end)
            event.listen(db, "rollback", _connection_transaction_end)
        db.execution_options(sqlite_begin="IMMEDIATE")
        held = db._counselorbot_xact_locks
    else:
        raise TypeError("xact_lock requires a SQLAlchemy Session or Connection")
    if key in held:
        return
    # Keep a strong reference while waiting and while held. The registry alone
    # must not retain a lock for every username/request ever seen by the server.
    with _locks_guard:
        lock = _locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _locks[key] = lock
    lock.acquire()
    held[key] = lock
    if isinstance(db, Connection) and not db.in_transaction():
        try:
            db.begin()
        except BaseException:
            _release_locks(held)
            raise


def _dialect_name(bind) -> str:
    if hasattr(bind, "dialect"):
        return bind.dialect.name
    if hasattr(bind, "get_bind"):
        b = bind.get_bind()
        if b is not None and hasattr(b, "dialect"):
            return b.dialect.name
    raise TypeError(f"Impossibile ricavare il dialetto da {type(bind)!r}")


def is_postgres(bind) -> bool:
    return _dialect_name(bind) == "postgresql"


def is_sqlite(bind) -> bool:
    return _dialect_name(bind) == "sqlite"


def dialect_insert(bind, table):
    """Build an INSERT with ON CONFLICT for the actual Session/Connection/Engine.

    Both supported dialects expose excluded, on_conflict_do_nothing and
    on_conflict_do_update. Unsupported engines fail before executing any SQL.
    """
    dialect = _dialect_name(bind)
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    elif dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert
    else:
        raise NotImplementedError(f"dialect_insert does not support {dialect!r}")
    return insert(table)


def add_column_if_missing(conn, table_name, column_name, type_expr, default=None) -> bool:
    """Aggiunge la colonna se manca; True se l'ha aggiunta. Idempotente su entrambi i dialetti.

    `type_expr` e' il tipo con gli eventuali vincoli (`"INTEGER REFERENCES t(id)"`,
    `"JSON NOT NULL"`) oppure un tipo SQLAlchemy, compilato per il dialetto di `conn`.
    `default` e' un'espressione SQL letterale (`"'[]'"`, `"1"`, `"false"`), senza cast `::`.
    Su Postgres resta `IF NOT EXISTS`: piu' worker che partono insieme non si scontrano.
    """
    if any(column["name"] == column_name for column in inspect(conn).get_columns(table_name)):
        return False
    if not isinstance(type_expr, str):
        type_expr = type_expr.compile(dialect=conn.dialect)
    guard = "IF NOT EXISTS " if is_postgres(conn) else ""
    ddl = f"ALTER TABLE {table_name} ADD COLUMN {guard}{column_name} {type_expr}"
    if default is not None:
        ddl += f" DEFAULT {default}"
    conn.execute(text(ddl))
    return True
