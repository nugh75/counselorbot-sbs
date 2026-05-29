"""Read-only check of PostgreSQL identity sequences used by CounselorBot."""

import os

import dotenv
from sqlalchemy import create_engine, text


dotenv.load_dotenv()

POSTGRES_USER = os.getenv("POSTGRES_USER", "counselorbot_user")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "")
POSTGRES_DB = os.getenv("POSTGRES_DB", "counselorbot")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.getenv("POSTGRES_HOST_PORT", "5435")
POSTGRES_URL = os.getenv(
    "DATABASE_URL_HOST",
    f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}",
)

TABLES = (
    "logs",
    "questionnaire_results",
    "strategy_feedback",
    "survey_responses",
    "users",
)


def check_sequences() -> int:
    """Report tables whose next generated id could collide with existing data."""
    print(f"Checking sequences at {POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}...")
    issues = 0
    engine = create_engine(POSTGRES_URL)
    with engine.connect() as conn:
        for table in TABLES:
            sequence = conn.execute(
                text("SELECT pg_get_serial_sequence(:table_name, 'id')"),
                {"table_name": table},
            ).scalar()
            if not sequence:
                print(f"{table}: no serial/identity sequence found")
                continue

            max_id = conn.execute(text(f'SELECT COALESCE(MAX(id), 0) FROM "{table}"')).scalar_one()
            last_value, is_called = conn.execute(
                text(f"SELECT last_value, is_called FROM {sequence}")
            ).one()
            next_value = last_value + 1 if is_called else last_value
            status = "OK" if next_value > max_id else "COLLISION RISK"
            if status != "OK":
                issues += 1
            print(f"{table}: max_id={max_id}, next_id={next_value}, sequence={sequence} [{status}]")

    return issues


if __name__ == "__main__":
    raise SystemExit(1 if check_sequences() else 0)
