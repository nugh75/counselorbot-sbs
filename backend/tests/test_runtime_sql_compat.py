"""Runtime SQL contracts executed on both TEST_DB engines (ADR-0003)."""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend import models
from backend.db_compat import dialect_insert
from backend.routes.admin import _cost_period_aggregate
from backend.tests.artifact_database import artifact_session


@pytest.mark.parametrize("binding", ["session", "connection", "engine"])
def test_upsert_inserts_ignores_and_updates_only_the_conflicting_row(binding):
    with artifact_session() as db:
        bind = {"session": db, "connection": db.connection(), "engine": db.get_bind().engine}[binding]
        statement = dialect_insert(bind, models.Config).values(key="runtime-upsert", value="first", description="keep")
        db.execute(statement.on_conflict_do_nothing(index_elements=["key"]))
        db.execute(dialect_insert(bind, models.Config).values(key="other", value="untouched"))
        db.execute(dialect_insert(bind, models.Config).values(key="runtime-upsert", value="ignored")
                   .on_conflict_do_nothing(index_elements=["key"]))
        assert db.query(models.Config).filter_by(key="runtime-upsert").one().value == "first"
        statement = dialect_insert(bind, models.Config).values(key="runtime-upsert", value="updated")
        db.execute(statement.on_conflict_do_update(index_elements=["key"], set_={"value": statement.excluded.value}))
        db.expire_all()
        row = db.query(models.Config).filter_by(key="runtime-upsert").one()
        assert (row.value, row.description) == ("updated", "keep")
        assert db.query(models.Config).filter_by(key="other").one().value == "untouched"
        assert db.query(models.Config).count() == 2


def test_upsert_rejects_an_unsupported_dialect():
    bind = SimpleNamespace(dialect=SimpleNamespace(name="mysql"))
    with pytest.raises(NotImplementedError, match="mysql"):
        dialect_insert(bind, models.Config)


@pytest.mark.parametrize("unit, expected", [
    ("week", [("2020-W53", "2020-12-28", 3.0, 2), ("2021-W01", "2021-01-04", 4.0, 1),
              ("2021-W05", "2021-02-01", 0.0, 1)]),
    ("month", [("2020-12", "2020-12-01", 1.0, 1), ("2021-01", "2021-01-01", 6.0, 2),
               ("2021-02", "2021-02-01", 0.0, 1)]),
    ("year", [("2020", "2020-01-01", 1.0, 1), ("2021", "2021-01-01", 6.0, 3)]),
])
def test_cost_periods_keep_iso_week_boundaries_order_filters_and_null_costs(unit, expected):
    with artifact_session() as db:
        assert _cost_period_aggregate(db, unit, {}) == []
        for stamp, cost in [("2020-12-28T23:59:59", 1), ("2021-01-03T23:59:59", 2),
                            ("2021-01-04T00:00:00", 4), ("2021-02-01T00:00:00", None)]:
            db.add(models.Log(timestamp=datetime.fromisoformat(stamp).replace(tzinfo=timezone.utc),
                              cost_usd=cost, provider="openai"))
        db.add(models.Log(timestamp=datetime(2021, 1, 4, tzinfo=timezone.utc), cost_usd=100, provider="anthropic"))
        db.flush()
        rows = _cost_period_aggregate(db, unit, {"provider": "openai"})
        assert [(r["period"], r["start"], r["cost"], r["turns"]) for r in rows] == expected


@pytest.mark.parametrize("conflict", ["slot", "student"])
def test_only_active_meeting_bookings_are_unique(conflict):
    with artifact_session() as db:
        group = models.StudentGroup(code="runtime-bookings", name="Test", owner_username="teacher")
        db.add(group)
        db.flush()
        meeting = models.ClassMeeting(group_id=group.id, title="Meeting", starts_at=datetime.now(timezone.utc),
                                      mode="in_person", organizer_username="teacher", manager_username="teacher")
        db.add(meeting)
        db.flush()
        slots = [models.ClassMeetingSlot(meeting_id=meeting.id, starts_at=datetime.now(timezone.utc)) for _ in range(2)]
        db.add_all(slots)
        db.flush()
        values = dict(meeting_id=meeting.id, slot_id=slots[0].id, username="alice")
        # Cancellation history must not reserve a slot or a student's place.
        db.add_all([models.ClassMeetingBooking(**values, status="cancelled_by_teacher") for _ in range(2)])
        db.flush()
        db.add(models.ClassMeetingBooking(**values, status="active"))
        db.flush()
        duplicate = {**values, "username": "bob"} if conflict == "slot" else {**values, "slot_id": slots[1].id}
        with pytest.raises(IntegrityError), db.begin_nested():
            db.add(models.ClassMeetingBooking(**duplicate, status="active"))
            db.flush()
        assert db.query(models.ClassMeetingBooking).count() == 3


def test_sqlite_create_all_builds_partial_booking_indexes():
    # Exercise SQLite explicitly even in a PostgreSQL test run.
    engine = create_engine("sqlite://")
    try:
        models.Base.metadata.create_all(engine)
        with Session(engine) as db:
            from sqlalchemy import text
            indexes = db.execute(text("SELECT sql FROM sqlite_master WHERE name LIKE 'uq_class_meeting_booking_%'"))
            definitions = indexes.scalars().all()
            assert len(definitions) == 2
            assert all("WHERE status = 'active'" in sql for sql in definitions)
    finally:
        engine.dispose()
