"""Idempotent migration: add institution_code/hashed_password to institutions
and institution_code/institution_password to administration_plans.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import database

def _has_column(conn, table: str, column: str) -> bool:
    inspector = conn.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = %s AND column_name = %s",
        (table, column),
    )
    return list(inspector) != []


def run(connection):
    migrations = [
        ("institutions", "institution_code", "ALTER TABLE institutions ADD COLUMN institution_code VARCHAR(50) DEFAULT NULL UNIQUE"),
        ("institutions", "hashed_password", "ALTER TABLE institutions ADD COLUMN hashed_password VARCHAR(255) DEFAULT NULL"),
        ("administration_plans", "institution_code", "ALTER TABLE administration_plans ADD COLUMN institution_code VARCHAR(50) DEFAULT NULL"),
        ("administration_plans", "institution_password", "ALTER TABLE administration_plans ADD COLUMN institution_password VARCHAR(100) DEFAULT NULL"),
    ]
    for tbl, col, sql_str in migrations:
        if not _has_column(connection, tbl, col):
            connection.execute(sql_str)
            print(f"  + {tbl}.{col} creato.")
        else:
            print(f"  - {tbl}.{col} gia' esistente, nessun cambiamento.")


if __name__ == "__main__":
    engine = database.get_engine()
    conn = engine.connect()
    print("Avvio migrazione 20260206...")
    run(conn)
    conn.close()
    print("Migrazione completata.")
