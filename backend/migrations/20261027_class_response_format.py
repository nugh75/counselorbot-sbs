"""Per-class default response format, length and reasoning chosen by the teacher."""

from sqlalchemy import text
from ..db_compat import add_column_if_missing


def migrate(engine):
    if engine.dialect.name != "postgresql":
        return
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(202610271)"))
        add_column_if_missing(connection, "class_settings", "response_format", "VARCHAR", default=None)
        add_column_if_missing(connection, "class_settings", "response_length", "VARCHAR", default=None)
        add_column_if_missing(connection, "class_settings", "response_reasoning", "VARCHAR", default=None)
        add_column_if_missing(connection, "class_settings", "allow_student_response_format", "BOOLEAN NOT NULL", default="TRUE")
        add_column_if_missing(connection, "class_settings", "allow_student_response_length", "BOOLEAN NOT NULL", default="TRUE")
        add_column_if_missing(connection, "class_settings", "allow_student_response_reasoning", "BOOLEAN NOT NULL", default="TRUE")
