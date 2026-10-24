"""Helper di dialetto Postgres/SQLite (ADR-0003 §3).

Accettano un Engine, una Connection o una Session: tutto cio' che espone il dialetto
direttamente (`.dialect`) o tramite il bind (`.get_bind()`).
"""


def _dialect_name(bind) -> str:
    dialect = getattr(bind, "dialect", None)
    if dialect is None:
        dialect = bind.get_bind().dialect
    return dialect.name


def is_sqlite(bind) -> bool:
    return _dialect_name(bind) == "sqlite"


def is_postgres(bind) -> bool:
    return _dialect_name(bind) == "postgresql"
