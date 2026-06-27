import argparse
import dotenv
import os
from pathlib import Path

from sqlalchemy import MetaData, Table, create_engine, inspect, text

from backend.models import Base


dotenv.load_dotenv()

SQLITE_PATH = Path(os.getenv("SQLITE_SOURCE_PATH", "counselorbot.db"))
SQLITE_URL = f"sqlite:///{SQLITE_PATH}"
POSTGRES_USER = os.getenv("POSTGRES_USER", "counselorbot_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "")
POSTGRES_DB = os.getenv("POSTGRES_DB", "counselorbot")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.getenv("POSTGRES_HOST_PORT", "5435")
POSTGRES_URL = os.getenv(
    "DATABASE_URL_HOST",
    f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}",
)

LEGACY_DEFAULTS = {
    "guided_steps": {
        "system_prompt_mode": "generic",
        "color_theme": "blue",
        "questionnaire_type": "QSA",
    },
}


def migrate(dry_run: bool = False) -> int:
    """Import missing legacy SQLite rows into the current PostgreSQL database."""
    if not SQLITE_PATH.exists():
        print(f"Error: {SQLITE_PATH} not found.")
        return 1

    action = "Checking migration from" if dry_run else "Migrating"
    print(f"{action} {SQLITE_PATH} to PostgreSQL at {POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}...")
    sqlite_engine = create_engine(SQLITE_URL)
    postgres_engine = create_engine(POSTGRES_URL)
    if not dry_run:
        Base.metadata.create_all(bind=postgres_engine)
    sqlite_tables = set(inspect(sqlite_engine).get_table_names())
    postgres_tables = set(inspect(postgres_engine).get_table_names())
    copied = 0

    with sqlite_engine.connect() as source, postgres_engine.begin() as target:
        for table_name in sorted(sqlite_tables & postgres_tables):
            pg_table = Table(table_name, MetaData(), autoload_with=postgres_engine)
            source_columns = {column["name"] for column in inspect(sqlite_engine).get_columns(table_name)}
            primary_keys = [column.name for column in pg_table.primary_key.columns]
            if not primary_keys or not set(primary_keys).issubset(source_columns):
                print(f"{table_name}: skipped (no compatible primary key)")
                continue

            columns = [column.name for column in pg_table.columns if column.name in source_columns]
            rows = source.execute(
                text(f'SELECT {", ".join(columns)} FROM "{table_name}"')
            ).mappings().all()
            key_expression = ", ".join(f'"{key}"' for key in primary_keys)
            existing_keys = {
                tuple(row)
                for row in target.execute(text(f'SELECT {key_expression} FROM "{table_name}"')).all()
            }
            missing_rows = []
            for row in rows:
                key = tuple(row[key] for key in primary_keys)
                if key in existing_keys:
                    continue
                record = dict(row)
                record.update({
                    key: value
                    for key, value in LEGACY_DEFAULTS.get(table_name, {}).items()
                    if key not in record
                })
                missing_rows.append(record)
            if missing_rows and not dry_run:
                target.execute(pg_table.insert(), missing_rows)
                copied += len(missing_rows)
                sequence = target.execute(
                    text("SELECT pg_get_serial_sequence(:table_name, 'id')"),
                    {"table_name": table_name},
                ).scalar()
                if sequence:
                    max_id = target.execute(text(f'SELECT COALESCE(MAX(id), 0) FROM "{table_name}"')).scalar_one()
                    target.execute(
                        text("SELECT setval(CAST(:sequence AS regclass), :value, :called)"),
                        {
                            "sequence": sequence,
                            "value": max(1, max_id),
                            "called": max_id > 0,
                        },
                    )
            operation = "would copy" if dry_run else "copied"
            print(f"{table_name}: {operation} {len(missing_rows)} of {len(rows)} legacy rows")

    if dry_run:
        print("Dry run completed: no rows inserted.")
    else:
        print(f"Migration completed: {copied} rows inserted.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Report rows to import without writing to PostgreSQL.")
    args = parser.parse_args()
    raise SystemExit(migrate(dry_run=args.dry_run))
