"""F1-05c: add_column_if_missing on the selected database (ADR-0003 §3, TEST_DB=postgres|sqlite)."""
from sqlalchemy import JSON, inspect, text

from backend.db_compat import add_column_if_missing
from backend.tests.artifact_database import artifact_session


def _columns(conn, table):
    return {column["name"] for column in inspect(conn).get_columns(table)}


def test_add_column_if_missing_is_idempotent_and_fills_existing_rows():
    with artifact_session() as db:
        conn = db.connection()
        conn.execute(text("CREATE TABLE legacy_rows (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO legacy_rows (id) VALUES (1)"))
        for expected in (True, False):
            assert add_column_if_missing(conn, "legacy_rows", "tags", "JSON NOT NULL", default="'[]'") is expected
            assert add_column_if_missing(conn, "legacy_rows", "label", "VARCHAR(20) NOT NULL", default="'group'") is expected
            assert add_column_if_missing(conn, "legacy_rows", "extra", JSON()) is expected
        assert {"tags", "label", "extra"} <= _columns(conn, "legacy_rows")
        tags, label = conn.execute(text("SELECT tags, label FROM legacy_rows")).one()
        assert tags in ("[]", []) and label == "group"


def test_personal_api_ensure_schema_adds_the_startup_columns_twice_without_errors():
    from backend import personal_api

    with artifact_session() as db:
        conn = db.connection()
        personal_api.ensure_schema(conn)
        personal_api.ensure_schema(conn)
        assert {"owner_username", "tagline_i18n", "approach_categories", "avatar_url"} <= _columns(conn, "counselors")
        assert "counselor_id" in _columns(conn, "pqbl_documents")
