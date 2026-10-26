"""Aggiornamenti dello schema di un file SQLite esistente (ADR-0003 §3.3-§3.4, F1-05g).

SQLite non sa `ALTER COLUMN` ne' `ADD/DROP CONSTRAINT`: vincoli, nullabilita' e tipi
si cambiano ricostruendo la tabella. Qui si usa `batch_alter_table` di Alembic come
libreria, senza catena di revisioni: tabella nuova, copia dei dati, rinomina.
"""
import logging
import re
from contextlib import contextmanager

from sqlalchemy import CheckConstraint, inspect

from .db_compat import is_sqlite

logger = logging.getLogger(__name__)


@contextmanager
def sqlite_rebuild_table(engine, table_name, **batch_kwargs):
    """Ricostruisce `table_name` in una transazione; produce l'oggetto batch di Alembic.

    Le chiavi esterne sono spente durante la ricostruzione: con `foreign_keys=ON` il
    `DROP TABLE` della vecchia tabella cancellerebbe a cascata le righe figlie.
    Alla fine `PRAGMA foreign_key_check` sulla tabella: una violazione annulla tutto.
    `batch_kwargs` va a `batch_alter_table` (es. `copy_from=` per ricostruire dal modello).
    """
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    if not is_sqlite(engine):
        raise NotImplementedError("sqlite_rebuild_table is for SQLite only")
    with engine.connect() as conn:
        # PRAGMA foreign_keys e' ignorato dentro una transazione: va dato prima del BEGIN.
        raw = conn.connection.driver_connection
        foreign_keys = raw.execute("PRAGMA foreign_keys").fetchone()[0]
        raw.execute("PRAGMA foreign_keys=OFF")
        try:
            with conn.begin():
                operations = Operations(MigrationContext.configure(conn))
                with operations.batch_alter_table(table_name, recreate="always", **batch_kwargs) as batch:
                    yield batch
                copy_from = batch_kwargs.get("copy_from")
                if copy_from is not None:
                    # Alembic salta gli indici di `Column(index=True)` del modello: si ricreano qui.
                    present = {index["name"] for index in inspect(conn).get_indexes(table_name)}
                    for index in copy_from.indexes:
                        if index.name not in present:
                            index.create(conn)
                violations = conn.exec_driver_sql(f'PRAGMA foreign_key_check("{table_name}")').fetchall()
                if violations:
                    raise RuntimeError(f"Rebuilding {table_name} breaks foreign keys: {violations[:5]}")
        finally:
            raw.execute(f"PRAGMA foreign_keys={'ON' if foreign_keys else 'OFF'}")


def _checks(constraints):
    return sorted((name or "", re.sub(r"\s+", " ", sqltext).strip()) for name, sqltext in constraints)


def sync_sqlite_check_constraints(engine, metadata):
    """Allinea i CHECK delle tabelle SQLite a quelli del modello; restituisce le tabelle ricostruite.

    Caso tipico: dopo l'aggiornamento dell'app un CHECK vecchio rifiuterebbe un tipo di
    passo nuovo. La tabella si ricostruisce dal modello (`copy_from`), quindi con indici
    e chiavi esterne del modello; serve che le colonne coincidano, altrimenti una
    migrazione doppia deve prima allinearle.
    """
    if not is_sqlite(engine):
        return []
    inspector = inspect(engine)
    existing = set(inspector.get_table_names())
    rebuilt = []
    for table in metadata.sorted_tables:
        if table.name not in existing:
            continue
        wanted = _checks((c.name, str(c.sqltext)) for c in table.constraints if isinstance(c, CheckConstraint))
        found = _checks((c["name"], c["sqltext"]) for c in inspector.get_check_constraints(table.name))
        if wanted == found:
            continue
        columns = {column["name"] for column in inspector.get_columns(table.name)}
        if columns != set(table.columns.keys()):
            raise RuntimeError(
                f"SQLite table {table.name} has columns {sorted(columns)} but the model has "
                f"{sorted(table.columns.keys())}: align them with a dual migration before syncing CHECKs")
        logger.info("SQLite: rebuilding %s to sync CHECK constraints", table.name)
        with sqlite_rebuild_table(engine, table.name, copy_from=table):
            pass
        rebuilt.append(table.name)
    return rebuilt
