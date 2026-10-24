"""SQLAlchemy column types that seal content at rest (P11, docs/privacy/p11-cifratura-db.md).

The database schema does not change: ``EncryptedText`` is a ``Text`` and ``EncryptedLogDetails`` a ``JSON``.
Sealing follows ``field_crypto`` (explicit switch, transparent reads of records stored in clear).
"""
from __future__ import annotations

import json

from sqlalchemy import JSON, Text
from sqlalchemy.types import TypeDecorator

from . import field_crypto

# Free-text content of a log row's ``details``; the other keys stay readable for JSON-path queries and filters.
LOG_CONTENT_KEYS = ("user_input", "effective_user_input", "bot_response", "reasoning", "scores_context", "envelope")


class EncryptedText(TypeDecorator):
    impl = Text
    cache_ok = True

    def __init__(self, table: str, column: str) -> None:
        super().__init__()
        self.table, self.column = table, column

    def process_bind_param(self, value, dialect):
        if value is None or not field_crypto.enabled():
            return value
        return field_crypto.seal_text(self.table, self.column, value)

    def process_result_value(self, value, dialect):
        return None if value is None else field_crypto.open_text(self.table, self.column, value)


class EncryptedLogDetails(TypeDecorator):
    """``logs.details``: only the content keys are sealed (as JSON text), whatever their value type."""
    impl = JSON
    cache_ok = True
    table, column = "logs", "details"

    def process_bind_param(self, value, dialect):
        if not isinstance(value, dict) or not field_crypto.enabled():
            return value
        return {key: field_crypto.seal_text(self.table, f"details_{key}", json.dumps(item))
                if key in LOG_CONTENT_KEYS and item is not None else item
                for key, item in value.items()}

    def process_result_value(self, value, dialect):
        if not isinstance(value, dict):
            return value
        return {key: json.loads(field_crypto.open_text(self.table, f"details_{key}", item))
                if key in LOG_CONTENT_KEYS and field_crypto.is_sealed(item) else item
                for key, item in value.items()}
