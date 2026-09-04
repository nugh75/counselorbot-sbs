"""Test del servizio di raccomandazioni per sidebar.

docker exec counselorbot_backend python -m backend.tests.test_recommendations
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import uuid
from urllib.parse import urlsplit, urlunsplit

import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import database, models
from backend.recommendation_service import (
    list_for_session,
    record,
    slugs_shown,
)

TEST_DB_NAME = "counselorbot_test"
_prod = urlsplit(os.environ["DATABASE_URL"])
_test_url = urlunsplit((_prod.scheme, _prod.netloc, f"/{TEST_DB_NAME}", _prod.query, _prod.fragment))
_admin_url = urlunsplit((_prod.scheme, _prod.netloc, "/postgres", _prod.query, _prod.fragment))


def _ensure_test_database():
    conn = psycopg2.connect(_admin_url)
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TEST_DB_NAME,))
            if not cur.fetchone():
                cur.execute(f'CREATE DATABASE "{TEST_DB_NAME}"')
    finally:
        conn.close()


_ensure_test_database()
_engine = create_engine(_test_url)
_TestSession = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
database.Base.metadata.create_all(bind=_engine)

# Pulisci il log prima di ogni separato test.
with _TestSession() as _cleanup_db:
    _cleanup_db.query(models.RecommendationHistory).delete(synchronize_session=False)
    _cleanup_db.commit()

PREFIX = f"t{uuid.uuid4().hex[:6]}"


# ---------------------------------------------------------------------------
# record
# ---------------------------------------------------------------------------

def test_record_creates_entry():
    db = _TestSession()
    rows = record(
        db,
        session_id=f"{PREFIX}-s1",
        username="stud",
        recommendation_type="reading",
        payloads=[{"slug": f"{PREFIX}-wild", "title": "Into the Wild", "year": "1994"}],
        turn_index=3,
    )
    assert len(rows) == 1
    assert rows[0].slug.startswith(PREFIX)
    assert rows[0].recommendation_type == "reading"
    assert rows[0].payload["title"] == "Into the Wild"
    assert rows[0].turn_index == 3
    db.close()


def test_record_deduplicates_by_slug():
    db = _TestSession()
    rec_id = f"{PREFIX}-r1"
    record(db, session_id=rec_id, username="stud", recommendation_type="reading",
           payloads=[{"slug": "harry-potter", "title": "Harry Potter"}])
    row = (
        db.query(models.RecommendationHistory)
        .filter(models.RecommendationHistory.session_id == rec_id,
                models.RecommendationHistory.slug == "harry-potter")
        .first()
    )
    assert row is not None
    updated = record(
        db,
        session_id=rec_id,
        username="stud",
        recommendation_type="reading",
        payloads=[{"slug": "harry-potter", "title": "Harry Potter (rev)", "year": "1997"}],
        turn_index=5,
    )
    assert len(updated) == 1
    assert updated[0].payload["title"] == "Harry Potter (rev)"
    assert updated[0].turn_index == 5
    db.close()


# ---------------------------------------------------------------------------
# slugs_shown
# ---------------------------------------------------------------------------

def test_slugs_shown_returns_previous():
    db = _TestSession()
    sid = f"{PREFIX}-s2"
    record(db, session_id=sid, username="stud", recommendation_type="strategy",
           payloads=[{"slug": "pomodoro", "name": "Pomodoro"}])
    record(db, session_id=sid, username="stud", recommendation_type="reading",
           payloads=[{"slug": "into-the-wild", "title": "Into the Wild"}])
    shown = slugs_shown(db, session_id=sid, username="stud", recommendation_type="strategy")
    assert "pomodoro" in shown
    assert "into-the-wild" not in shown
    db.close()


def test_slugs_shown_ignore_other_sessions():
    db = _TestSession()
    rec_id1 = f"{PREFIX}-sA"
    rec_id2 = f"{PREFIX}-sB"
    record(db, session_id=rec_id1, username="stud", recommendation_type="reading",
           payloads=[{"slug": "into-the-wild"}])
    record(db, session_id=rec_id2, username="stud", recommendation_type="reading",
           payloads=[{"slug": "harry-potter"}])
    shown = slugs_shown(db, session_id=rec_id1, username="stud", recommendation_type="reading")
    assert shown == {"into-the-wild"}
    db.close()


# ---------------------------------------------------------------------------
# list_for_session
# ---------------------------------------------------------------------------

def test_list_for_session_separates_types():
    db = _TestSession()
    sid = f"{PREFIX}-s3"
    record(db, session_id=sid, username="stud", recommendation_type="reading",
           payloads=[{"slug": "into-the-wild", "title": "Into the Wild", "year": "1994"}])
    record(db, session_id=sid, username="stud", recommendation_type="strategy",
           payloads=[{"slug": "pomodoro", "name": "Pomodoro"}])
    result = list_for_session(db, session_id=sid, username="stud")
    assert len(result["reading"]) == 1
    assert len(result["strategy"]) == 1
    assert result["reading"][0]["slug"] == "into-the-wild"
    assert result["strategy"][0]["slug"] == "pomodoro"
    db.close()


def test_list_for_session_orders_by_turn():
    db = _TestSession()
    sid = f"{PREFIX}-s4"
    record(db, session_id=sid, username="stud", recommendation_type="reading",
           payloads=[{"slug": "second", "title": "Second"}], turn_index=2)
    record(db, session_id=sid, username="stud", recommendation_type="reading",
           payloads=[{"slug": "first", "title": "First"}], turn_index=1)
    result = list_for_session(db, session_id=sid, username="stud")
    assert [item["slug"] for item in result["reading"]] == ["first", "second"]
    db.close()


def test_list_for_session_empty_session():
    db = _TestSession()
    result = list_for_session(db, session_id=f"{PREFIX}-nope", username="stud")
    assert result == {"reading": [], "strategy": []}
    db.close()


def test_same_session_id_keeps_each_students_recommendations_separate():
    db = _TestSession()
    sid = f"{PREFIX}-shared"
    record(db, session_id=sid, username="alice", recommendation_type="reading",
           payloads=[{"slug": "same-book", "title": "Alice title"}])
    record(db, session_id=sid, username="bob", recommendation_type="reading",
           payloads=[{"slug": "same-book", "title": "Bob title"}])

    alice = list_for_session(db, session_id=sid, username="alice")
    bob = list_for_session(db, session_id=sid, username="bob")

    assert [item["title"] for item in alice["reading"]] == ["Alice title"]
    assert [item["title"] for item in bob["reading"]] == ["Bob title"]
    assert slugs_shown(
        db, session_id=sid, username="alice", recommendation_type="reading",
    ) == {"same-book"}
    db.close()
