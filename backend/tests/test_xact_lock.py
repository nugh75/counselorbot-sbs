"""PostgreSQL transaction locks (ADR-0003 §4.2)."""
import hashlib
import os
from unittest.mock import Mock

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from backend.db_compat import xact_lock


@pytest.mark.parametrize("parts", [("assignment", "student", 17), (149, "scuola"), ("città", None)])
def test_postgres_uses_deterministic_signed_blake2b_key(parts):
    db = Mock(spec=Session)
    db.get_bind.return_value.dialect.name = "postgresql"
    expected = int.from_bytes(hashlib.blake2b(
        ":".join(map(str, parts)).encode("utf-8"), digest_size=8
    ).digest(), "big", signed=True)
    for _ in range(2):
        xact_lock(db, *parts)
        statement, params = db.execute.call_args.args
        assert str(statement) == "SELECT pg_advisory_xact_lock(:key)"
        assert params == {"key": expected}
        assert -(2 ** 63) <= params["key"] < 2 ** 63


def test_requires_identifying_parts():
    db = Mock(spec=Session)
    db.get_bind.return_value.dialect.name = "postgresql"
    with pytest.raises(ValueError, match="at least one"):
        xact_lock(db)


def test_rejects_other_dialects():
    db = Mock(spec=Session)
    db.get_bind.return_value.dialect.name = "sqlite"
    with pytest.raises(NotImplementedError, match="PostgreSQL only"):
        xact_lock(db, "key")


@pytest.mark.postgres_only
@pytest.mark.skipif(not os.getenv("DATABASE_URL", "").startswith("postgresql"),
                    reason="requires the dedicated PostgreSQL test database")
@pytest.mark.parametrize("connection", [False, True], ids=["session", "connection"])
@pytest.mark.parametrize("end", ["commit", "rollback"])
def test_postgres_server_holds_lock_until_transaction_end(connection, end):
    engine = create_engine(os.environ["DATABASE_URL"])
    parts = ("f105d-integration", end, connection)
    key = int.from_bytes(hashlib.blake2b(
        ":".join(map(str, parts)).encode(), digest_size=8
    ).digest(), "big", signed=True)
    try:
        with engine.connect() if connection else Session(engine) as owner:
            with engine.connect() as observer:
                xact_lock(owner, *parts)
                xact_lock(owner, *parts)
                probe = text("SELECT pg_try_advisory_xact_lock(:key)")
                assert observer.execute(probe, {"key": key}).scalar_one() is False
                observer.rollback()
                getattr(owner, end)()
                assert observer.execute(probe, {"key": key}).scalar_one() is True
    finally:
        engine.dispose()
