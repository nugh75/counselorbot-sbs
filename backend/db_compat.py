"""Helper di dialetto e schema per PostgreSQL (ADR-0003).

Accettano un Engine, una Connection o una Session: tutto cio' che espone il dialetto
direttamente (`.dialect`) o tramite il bind (`.get_bind()`).
"""
import hashlib
from datetime import UTC, datetime, timezone

from sqlalchemy import DateTime, inspect, text
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator):
    """Colonna data e ora sempre aware con fuso orario UTC (ADR-0003 §2.4).

    Un datetime naïve (senza fuso orario) causa TypeError nei confronti e
    sottrazioni con datetime aware (come datetime.now(timezone.utc)).
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


def xact_lock(db, *parts):
    """Hold a PostgreSQL advisory lock until the transaction ends (ADR-0003 §4.2).

    Accepts a Session or Connection; the key is deterministic for the parts.
    """
    if not parts:
        raise ValueError("xact_lock requires at least one identifying part")
    key = int.from_bytes(hashlib.blake2b(
        ":".join(str(part) for part in parts).encode("utf-8"), digest_size=8
    ).digest(), byteorder="big", signed=True)
    if not is_postgres(db):
        raise NotImplementedError("xact_lock supports PostgreSQL only")
    db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": key})


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

    PostgreSQL exposes excluded, on_conflict_do_nothing and on_conflict_do_update.
    Unsupported engines fail before executing any SQL.
    """
    dialect = _dialect_name(bind)
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
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
