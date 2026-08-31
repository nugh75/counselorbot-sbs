"""Test degli stati di certificazione per (contenuto, lingua).

Parte pura (vocabolari e transizioni) piu' il registro su database Postgres
DEDICATO ai test (`counselorbot_test`).

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_content_versions
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import uuid
from urllib.parse import urlsplit, urlunsplit

import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import content_version_service as cvs
from backend import database, models
from backend.content_versions import (
    APP_LOCALES,
    CONTENT_TYPES,
    INSTRUMENT_STATUSES,
    TOOL_STATUSES,
    ContentVersionError,
    assert_transition,
    can_transition,
    is_served,
    statuses_for,
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

PREFIX = f"t{uuid.uuid4().hex[:6]}"


def test_app_locales_are_the_six_of_the_interface():
    assert APP_LOCALES == ("it", "en", "es", "fr", "de", "sv")


def test_instruments_and_tools_have_different_ladders():
    assert INSTRUMENT_STATUSES == ("draft", "translated", "reviewed", "pilot", "validated")
    assert TOOL_STATUSES == ("draft", "translated", "certified")
    assert statuses_for("instrument") == INSTRUMENT_STATUSES
    assert statuses_for("certified_strategy") == TOOL_STATUSES


def test_unknown_content_type_is_refused():
    try:
        statuses_for("nonesiste")
    except ContentVersionError:
        return
    raise AssertionError("un tipo di contenuto sconosciuto deve essere rifiutato")


def test_only_the_last_rungs_are_served():
    assert is_served("instrument", "pilot") is True
    assert is_served("instrument", "validated") is True
    assert is_served("instrument", "reviewed") is False
    assert is_served("instrument", "draft") is False
    assert is_served("certified_strategy", "certified") is True
    assert is_served("certified_strategy", "translated") is False


def test_promotion_advances_one_rung_at_a_time():
    assert can_transition("instrument", "draft", "translated") is True
    assert can_transition("instrument", "translated", "reviewed") is True
    # saltare la revisione cognitiva per andare al pilot non e' ammesso
    assert can_transition("instrument", "translated", "pilot") is False
    assert can_transition("instrument", "draft", "validated") is False


def test_demotion_is_always_allowed():
    # una traduzione trovata sbagliata deve poter tornare indietro di quanto serve
    assert can_transition("instrument", "validated", "draft") is True
    assert can_transition("instrument", "pilot", "translated") is True
    assert can_transition("certified_strategy", "certified", "draft") is True


def test_same_status_is_not_a_transition():
    assert can_transition("instrument", "pilot", "pilot") is False


def test_status_outside_the_ladder_is_refused():
    assert can_transition("certified_strategy", "draft", "validated") is False
    try:
        assert_transition("certified_strategy", "draft", "validated")
    except ContentVersionError as exc:
        assert "validated" in str(exc)
        return
    raise AssertionError("uno stato fuori vocabolario deve essere rifiutato")


def test_every_content_type_has_a_served_status():
    for content_type, ladder in CONTENT_TYPES.items():
        assert any(is_served(content_type, s) for s in ladder), content_type


# --- registro (con database) -------------------------------------------------

def test_upsert_creates_then_updates_the_same_row():
    db = _TestSession()
    try:
        key = f"{PREFIX}-QSA"
        first = cvs.upsert_version(db, "instrument", key, "fr", status="draft", source="llm:gemma")
        again = cvs.upsert_version(db, "instrument", key, "fr", status="translated")
        assert first.id == again.id
        assert again.status == "translated"
        # la provenienza precedente non viene cancellata da un aggiornamento parziale
        assert again.source == "llm:gemma"
    finally:
        db.close()


def test_promote_records_who_approved_and_when():
    db = _TestSession()
    try:
        key = f"{PREFIX}-QSAr"
        row = cvs.upsert_version(db, "instrument", key, "de", status="draft")
        promoted = cvs.promote(db, row, "translated", approved_by="daniele")
        assert promoted.status == "translated"
        assert promoted.approved_by == "daniele"
        assert promoted.approved_at is not None
    finally:
        db.close()


def test_promote_refuses_a_skipped_rung():
    db = _TestSession()
    try:
        key = f"{PREFIX}-ZTPI"
        row = cvs.upsert_version(db, "instrument", key, "de", status="translated")
        try:
            cvs.promote(db, row, "pilot", approved_by="daniele")
        except ContentVersionError:
            db.rollback()
            return
        raise AssertionError("promuovere da translated a pilot deve essere rifiutato")
    finally:
        db.close()


def test_served_locales_returns_only_the_exposed_ones():
    db = _TestSession()
    try:
        key = f"{PREFIX}-QPCS"
        cvs.upsert_version(db, "instrument", key, "en", status="pilot")
        cvs.upsert_version(db, "instrument", key, "sv", status="validated")
        cvs.upsert_version(db, "instrument", key, "es", status="draft")
        assert sorted(cvs.served_locales(db, "instrument", key)) == ["en", "sv"]
        assert cvs.status_map(db, "instrument", key)["es"] == "draft"
    finally:
        db.close()


def test_upsert_refuses_a_locale_outside_the_app():
    db = _TestSession()
    try:
        try:
            cvs.upsert_version(db, "instrument", f"{PREFIX}-X", "pt", status="draft")
        except ContentVersionError:
            db.rollback()
            return
        raise AssertionError("una lingua fuori dalle sei deve essere rifiutata")
    finally:
        db.close()


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"ok   {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}")
        except Exception as exc:
            failed += 1
            print(f"ERROR {test.__name__}: {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
