"""Catalogo dei referenti e degli eventi di orientamento.

Retrieval su database Postgres DEDICATO ai test (`counselorbot_test`).

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_orientation_referrals
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit, urlunsplit

import psycopg2
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from backend import database, models

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

# Il modulo gira anche dopo le altre suite sullo stesso DB dedicato: parte
# senza righe residue, che altererebbero ordinamenti e limit.
with _TestSession() as _cleanup_db:
    _cleanup_db.query(models.OrientationEvent).delete(synchronize_session=False)
    _cleanup_db.query(models.OrientationReferral).delete(synchronize_session=False)
    _cleanup_db.query(models.Institution).delete(synchronize_session=False)
    _cleanup_db.commit()

PREFIX = f"t{uuid.uuid4().hex[:6]}"
NOW = datetime.now(timezone.utc)


def _institution(db, slug="istituto", **kwargs):
    data = dict(
        slug=f"{PREFIX}-{slug}", name="Liceo di prova", kind="school",
        website_url="https://esempio.test",
        orientation_page_url="https://esempio.test/orientamento",
        is_active=True,
    )
    data.update(kwargs)
    row = models.Institution(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _referral(db, slug="sportello", **kwargs):
    data = dict(
        slug=f"{PREFIX}-{slug}",
        role_label_i18n={"it": "Sportello d'ascolto", "en": "Listening desk"},
        needs=["disagio-emotivo"], audience=["secondaria"],
        contact_channel={"email": "sportello@esempio.test", "hours": "mar 10-12"},
        what_for_i18n={"it": "Puoi parlare di come stai."},
        how_to_reach_i18n={"it": "Passa in aula 12 negli orari indicati."},
        status="certified", is_active=True, sort_order=0,
    )
    data.update(kwargs)
    row = models.OrientationReferral(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _event(db, slug="openday", **kwargs):
    data = dict(
        slug=f"{PREFIX}-{slug}", kind="open-day",
        title_i18n={"it": "Open day"}, summary_i18n={"it": "Visita alla scuola."},
        starts_at=NOW + timedelta(days=10), ends_at=NOW + timedelta(days=10, hours=4),
        page_url="https://esempio.test/openday",
        needs=["scelta-percorso"], audience=["secondaria"],
        status="certified", is_active=True, sort_order=0,
    )
    data.update(kwargs)
    row = models.OrientationEvent(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _clear(db):
    db.query(models.OrientationEvent).delete(synchronize_session=False)
    db.query(models.OrientationReferral).delete(synchronize_session=False)
    db.query(models.Institution).delete(synchronize_session=False)
    db.commit()


# --- schema ------------------------------------------------------------------

def test_the_three_tables_and_the_group_column_exist():
    names = set(inspect(_engine).get_table_names())
    assert {"institutions", "orientation_referrals", "orientation_events"} <= names
    columns = {c["name"] for c in inspect(_engine).get_columns("student_groups")}
    assert "institution_id" in columns


def test_a_referral_and_an_event_can_be_stored_against_an_institution():
    db = _TestSession()
    try:
        institution = _institution(db)
        referral = _referral(db, institution_id=institution.id)
        event = _event(db, institution_id=institution.id)
        assert referral.institution_id == institution.id
        assert event.ends_at > NOW
        assert referral.needs == ["disagio-emotivo"]
    finally:
        _clear(db); db.close()


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
