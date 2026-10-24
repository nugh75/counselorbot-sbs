"""Helper di dialetto Postgres/SQLite (ADR-0003 §3).

Accettano un Engine, una Connection o una Session: tutto cio' che espone il dialetto
direttamente (`.dialect`) o tramite il bind (`.get_bind()`).
"""
from sqlalchemy import inspect, text


def _dialect_name(bind) -> str:
    dialect = getattr(bind, "dialect", None)
    if dialect is None:
        dialect = bind.get_bind().dialect
    return dialect.name


def is_sqlite(bind) -> bool:
    return _dialect_name(bind) == "sqlite"


def is_postgres(bind) -> bool:
    return _dialect_name(bind) == "postgresql"


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
