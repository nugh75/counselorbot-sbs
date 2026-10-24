"""F1-05e: SQLite UTC datetime compatibility with UTCDateTime (ADR-0003 §2.4)."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import Column, DateTime, Integer, MetaData, Table, create_engine, select, text
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.schema import CreateTable

from backend import models
from backend.db_compat import UTCDateTime
from backend.tests.artifact_database import artifact_session


def test_utc_datetime_ddl_compilation_contracts():
    """c) Verifica contrattuale che la DDL compilata per postgresql sia identica a prima ('TIMESTAMP WITH TIME ZONE')."""
    utc_type = UTCDateTime()
    legacy_type = DateTime(timezone=True)

    pg_dialect = postgresql.dialect()
    sl_dialect = sqlite.dialect()

    # DDL compilation for the type itself
    assert utc_type.compile(dialect=pg_dialect) == "TIMESTAMP WITH TIME ZONE"
    assert utc_type.compile(dialect=pg_dialect) == legacy_type.compile(dialect=pg_dialect)
    assert utc_type.compile(dialect=sl_dialect) == "DATETIME"
    assert utc_type.compile(dialect=sl_dialect) == legacy_type.compile(dialect=sl_dialect)

    # Full table CREATE TABLE DDL comparison on PostgreSQL
    meta1 = MetaData()
    t_legacy = Table(
        "sample_events",
        meta1,
        Column("id", Integer, primary_key=True),
        Column("occurred_at", DateTime(timezone=True), nullable=False),
        Column("completed_at", DateTime(timezone=True), nullable=True),
    )
    meta2 = MetaData()
    t_utc = Table(
        "sample_events",
        meta2,
        Column("id", Integer, primary_key=True),
        Column("occurred_at", UTCDateTime, nullable=False),
        Column("completed_at", UTCDateTime, nullable=True),
    )

    ddl_legacy = str(CreateTable(t_legacy).compile(dialect=pg_dialect)).strip()
    ddl_utc = str(CreateTable(t_utc).compile(dialect=pg_dialect)).strip()
    assert ddl_legacy == ddl_utc, "DDL for PostgreSQL must be identical to DateTime(timezone=True)"


def test_models_use_utcdatetime_and_no_raw_datetime_timezone():
    """Verify all DateTime columns in backend.models use UTCDateTime."""
    found_utc_columns = 0
    raw_datetime_columns = []

    for table in models.Base.metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, UTCDateTime):
                found_utc_columns += 1
            elif isinstance(column.type, DateTime):
                raw_datetime_columns.append(f"{table.name}.{column.name}")

    assert found_utc_columns >= 161, f"Expected at least 161 UTCDateTime columns, found {found_utc_columns}"
    assert raw_datetime_columns == [], f"Found raw DateTime columns in models: {raw_datetime_columns}"


def test_sqlite_roundtrip_aware_and_naive_values(tmp_path):
    """a) Andata e ritorno di valori aware e naive su SQLite: il valore riletto deve essere sempre aware in UTC."""
    engine = create_engine(f"sqlite:///{tmp_path / 'test_utc.db'}")
    meta = MetaData()
    events = Table(
        "events",
        meta,
        Column("id", Integer, primary_key=True),
        Column("dt", UTCDateTime, nullable=True),
    )
    meta.create_all(engine)

    dt_aware_utc = datetime(2026, 10, 24, 12, 34, 56, 789000, tzinfo=timezone.utc)
    dt_naive = datetime(2026, 10, 24, 12, 34, 56, 789000)
    rome_tz = timezone(timedelta(hours=2))
    dt_aware_rome = datetime(2026, 10, 24, 14, 34, 56, 789000, tzinfo=rome_tz)

    with engine.begin() as conn:
        conn.execute(events.insert().values(id=1, dt=dt_aware_utc))
        conn.execute(events.insert().values(id=2, dt=dt_naive))
        conn.execute(events.insert().values(id=3, dt=dt_aware_rome))
        conn.execute(events.insert().values(id=4, dt=None))

    with engine.connect() as conn:
        rows = {
            row.id: row.dt
            for row in conn.execute(select(events.c.id, events.c.dt).order_by(events.c.id)).fetchall()
        }

    # 1. Aware UTC roundtrip
    assert rows[1] is not None
    assert rows[1].tzinfo == timezone.utc
    assert rows[1] == dt_aware_utc

    # 2. Naive datetime roundtrip (assumed UTC)
    assert rows[2] is not None
    assert rows[2].tzinfo == timezone.utc
    assert rows[2] == dt_aware_utc

    # 3. Aware non-UTC datetime roundtrip (converted to UTC)
    assert rows[3] is not None
    assert rows[3].tzinfo == timezone.utc
    assert rows[3] == dt_aware_utc
    assert rows[3].hour == 12

    # 4. None remains None
    assert rows[4] is None


def test_sqlite_comparison_and_subtraction_with_now_utc(tmp_path):
    """b) Confronto e sottrazione con datetime.now(timezone.utc) su SQLite senza TypeError."""
    engine = create_engine(f"sqlite:///{tmp_path / 'test_math.db'}")
    meta = MetaData()
    events = Table(
        "events",
        meta,
        Column("id", Integer, primary_key=True),
        Column("dt_utc", UTCDateTime, nullable=False),
        Column("dt_legacy", DateTime(timezone=True), nullable=False),
    )
    meta.create_all(engine)

    stored_instant = datetime.now(timezone.utc) - timedelta(minutes=5)
    with engine.begin() as conn:
        conn.execute(events.insert().values(id=1, dt_utc=stored_instant, dt_legacy=stored_instant))

    with engine.connect() as conn:
        row = conn.execute(select(events.c.dt_utc, events.c.dt_legacy).where(events.c.id == 1)).fetchone()

    now = datetime.now(timezone.utc)

    # UTCDateTime: comparison and subtraction work cleanly
    diff = now - row.dt_utc
    assert isinstance(diff, timedelta)
    assert diff >= timedelta(minutes=4)
    assert row.dt_utc < now
    assert row.dt_utc <= now
    assert now > row.dt_utc
    assert now >= row.dt_utc
    assert (row.dt_utc == now) is False

    # Control verification: legacy DateTime(timezone=True) on SQLite returns offset-naive
    assert row.dt_legacy.tzinfo is None
    with pytest.raises(TypeError, match="can't subtract offset-naive and offset-aware datetimes"):
        _ = now - row.dt_legacy
    with pytest.raises(TypeError, match="can't compare offset-naive and offset-aware datetimes"):
        _ = row.dt_legacy < now


def test_process_bind_and_result_param_direct_logic():
    """Verify UTCDateTime process methods directly for edge cases and timezones."""
    utc_type = UTCDateTime()
    sqlite_dialect = sqlite.dialect()
    pg_dialect = postgresql.dialect()

    for dialect in (sqlite_dialect, pg_dialect):
        assert utc_type.process_bind_param(None, dialect) is None
        assert utc_type.process_result_value(None, dialect) is None

        # Naive datetime
        dt_naive = datetime(2026, 10, 24, 10, 30, 0)
        bound = utc_type.process_bind_param(dt_naive, dialect)
        assert bound.tzinfo == timezone.utc
        assert bound.hour == 10

        res = utc_type.process_result_value(dt_naive, dialect)
        assert res.tzinfo == timezone.utc
        assert res.hour == 10

        # Aware datetime in non-UTC timezone (+03:00)
        tz_plus3 = timezone(timedelta(hours=3))
        dt_plus3 = datetime(2026, 10, 24, 13, 30, 0, tzinfo=tz_plus3)
        bound = utc_type.process_bind_param(dt_plus3, dialect)
        assert bound.tzinfo == timezone.utc
        assert bound.hour == 10

        res = utc_type.process_result_value(dt_plus3, dialect)
        assert res.tzinfo == timezone.utc
        assert res.hour == 10

        # ISO format strings
        bound_str = utc_type.process_bind_param("2026-10-24T10:30:00+00:00", dialect)
        assert bound_str.tzinfo == timezone.utc
        assert bound_str.hour == 10

        res_str = utc_type.process_result_value("2026-10-24 10:30:00", dialect)
        assert res_str.tzinfo == timezone.utc
        assert res_str.hour == 10


def test_active_database_roundtrip_aware_and_naive():
    """Roundtrip on the configured test database (SQLite in local/desktop CI, Postgres in Postgres CI)."""
    with artifact_session() as db:
        conn = db.connection()
        conn.execute(
            text(
                "CREATE TABLE test_utc_roundtrip ("
                "  id INTEGER PRIMARY KEY,"
                "  dt_val " + ("TIMESTAMP WITH TIME ZONE" if conn.dialect.name == "postgresql" else "DATETIME") +
                ")"
            )
        )
        meta = MetaData()
        t = Table(
            "test_utc_roundtrip",
            meta,
            Column("id", Integer, primary_key=True),
            Column("dt_val", UTCDateTime, nullable=True),
        )

        now_utc = datetime(2026, 10, 24, 8, 15, 30, tzinfo=timezone.utc)
        naive = datetime(2026, 10, 24, 8, 15, 30)
        conn.execute(t.insert().values(id=1, dt_val=now_utc))
        conn.execute(t.insert().values(id=2, dt_val=naive))
        conn.execute(t.insert().values(id=3, dt_val=None))

        rows = {
            row.id: row.dt_val
            for row in conn.execute(select(t.c.id, t.c.dt_val).order_by(t.c.id)).fetchall()
        }

        assert rows[1] is not None
        assert rows[1].tzinfo == timezone.utc
        assert rows[1] == now_utc

        assert rows[2] is not None
        assert rows[2].tzinfo == timezone.utc
        assert rows[2] == now_utc

        assert rows[3] is None


@pytest.mark.postgres_only
def test_postgres_roundtrip_explicit():
    """Explicit Postgres test (runs in CI when TEST_DB=postgres)."""
    with artifact_session() as db:
        conn = db.connection()
        conn.execute(text("CREATE TABLE test_pg_utc (id INT PRIMARY KEY, dt TIMESTAMP WITH TIME ZONE)"))
        meta = MetaData()
        t = Table("test_pg_utc", meta, Column("id", Integer, primary_key=True), Column("dt", UTCDateTime))

        now_utc = datetime.now(timezone.utc)
        conn.execute(t.insert().values(id=1, dt=now_utc))

        val = conn.execute(select(t.c.dt).where(t.c.id == 1)).scalar()
        assert val is not None
        assert val.tzinfo is not None
        assert val == now_utc
