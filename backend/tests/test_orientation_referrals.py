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
from backend import orientation_referral_service
from backend.orientation_referral_service import MAX_REFERRAL_CONTEXT_CHARS, orientation_referral_memory
from backend.referral_frame import REFERRAL_FRAME, frame

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


def test_the_frame_covers_the_six_interface_languages():
    assert set(REFERRAL_FRAME) == {"it", "en", "es", "fr", "de", "sv"}
    for lang in REFERRAL_FRAME:
        assert frame(lang)["intro"].strip(), lang
    # Una lingua sconosciuta ricade sull'inglese, mai su una a caso.
    assert frame("pt") == frame("en")


def test_a_need_match_lets_a_referral_through():
    db = _TestSession()
    try:
        institution = _institution(db)
        _referral(db, institution_id=institution.id)
        out = orientation_referral_memory.retrieve_referrals(
            db, needs={"disagio-emotivo"}, institution_ids=[institution.id],
            audience_band="secondaria", language="it")
        assert [e["id"] for e in out] == [f"{PREFIX}-sportello"]
        block = orientation_referral_memory.render_context(out, [], "it")
        assert "[REFERRALS]" in block
        assert "Sportello d'ascolto" in block
    finally:
        _clear(db); db.close()


def test_a_row_without_needs_never_enters():
    db = _TestSession()
    try:
        institution = _institution(db)
        _referral(db, institution_id=institution.id, needs=[])
        out = orientation_referral_memory.retrieve_referrals(
            db, needs={"disagio-emotivo"}, institution_ids=[institution.id], language="it")
        assert out == []
        # Nemmeno senza filtro sui bisogni: una riga che entrerebbe ovunque
        # non e' una raccomandazione.
        assert orientation_referral_memory.retrieve_referrals(
            db, needs=set(), institution_ids=[institution.id], language="it") == []
    finally:
        _clear(db); db.close()


def test_an_empty_need_set_does_not_filter_by_need():
    db = _TestSession()
    try:
        institution = _institution(db)
        _referral(db, "uno", institution_id=institution.id, needs=["dsa-bes"])
        out = orientation_referral_memory.retrieve_referrals(
            db, needs=set(), institution_ids=[institution.id], language="it")
        assert [e["id"] for e in out] == [f"{PREFIX}-uno"]
    finally:
        _clear(db); db.close()


def test_a_draft_row_never_reaches_a_student():
    db = _TestSession()
    try:
        institution = _institution(db)
        _referral(db, institution_id=institution.id, status="draft")
        assert orientation_referral_memory.retrieve_referrals(
            db, needs={"disagio-emotivo"}, institution_ids=[institution.id], language="it") == []
    finally:
        _clear(db); db.close()


def test_another_institution_row_is_not_visible():
    db = _TestSession()
    try:
        mine = _institution(db, "mio")
        theirs = _institution(db, "loro")
        _referral(db, "loro-sportello", institution_id=theirs.id)
        assert orientation_referral_memory.retrieve_referrals(
            db, needs={"disagio-emotivo"}, institution_ids=[mine.id], language="it") == []
    finally:
        _clear(db); db.close()


def test_a_national_row_reaches_everyone():
    db = _TestSession()
    try:
        mine = _institution(db, "mio")
        _referral(db, "nazionale", institution_id=None)
        out = orientation_referral_memory.retrieve_referrals(
            db, needs={"disagio-emotivo"}, institution_ids=[mine.id], language="it")
        assert [e["id"] for e in out] == [f"{PREFIX}-nazionale"]
    finally:
        _clear(db); db.close()


def test_audience_excludes_the_wrong_band():
    db = _TestSession()
    try:
        institution = _institution(db)
        _referral(db, institution_id=institution.id, audience=["universita"])
        assert orientation_referral_memory.retrieve_referrals(
            db, needs={"disagio-emotivo"}, institution_ids=[institution.id],
            audience_band="secondaria", language="it") == []
    finally:
        _clear(db); db.close()


def test_a_past_event_is_never_returned():
    db = _TestSession()
    try:
        institution = _institution(db)
        _event(db, "passato", institution_id=institution.id,
               starts_at=NOW - timedelta(days=30), ends_at=NOW - timedelta(days=29))
        assert orientation_referral_memory.retrieve_events(
            db, needs={"scelta-percorso"}, institution_ids=[institution.id], language="it") == []
    finally:
        _clear(db); db.close()


def test_events_come_out_with_the_nearest_first():
    db = _TestSession()
    try:
        institution = _institution(db)
        _event(db, "lontano", institution_id=institution.id,
               starts_at=NOW + timedelta(days=40), ends_at=NOW + timedelta(days=41))
        _event(db, "vicino", institution_id=institution.id,
               starts_at=NOW + timedelta(days=2), ends_at=NOW + timedelta(days=3))
        out = orientation_referral_memory.retrieve_events(
            db, needs={"scelta-percorso"}, institution_ids=[institution.id],
            language="it", limit=5)
        assert [e["id"] for e in out] == [f"{PREFIX}-vicino", f"{PREFIX}-lontano"]
    finally:
        _clear(db); db.close()


def test_the_block_falls_back_to_english_then_italian():
    db = _TestSession()
    try:
        institution = _institution(db)
        _referral(db, institution_id=institution.id,
                  role_label_i18n={"en": "Listening desk"},
                  what_for_i18n={"it": "Puoi parlare di come stai."})
        out = orientation_referral_memory.retrieve_referrals(
            db, needs={"disagio-emotivo"}, institution_ids=[institution.id], language="sv")
        assert out[0]["role"] == "Listening desk"
        assert out[0]["what_for"] == "Puoi parlare di come stai."
    finally:
        _clear(db); db.close()


def test_the_context_block_truncates_whole_lines_not_partial_ones():
    db = _TestSession()
    try:
        institution = _institution(db)
        for i in range(6):
            _referral(
                db, f"lungo-{i}", institution_id=institution.id,
                role_label_i18n={"it": f"Sportello numero {i} con un nome piuttosto lungo"},
                what_for_i18n={"it": ("Puoi parlare di come stai e di tutto cio' che ti serve. " * 3)},
                how_to_reach_i18n={"it": ("Passa in aula 12 negli orari indicati oppure scrivi prima. " * 3)},
                contact_channel={
                    "email": f"sportello{i}@esempio.test", "hours": "mar 10-12", "location": "aula 12",
                    "page_url": f"https://esempio.test/sportello-{i}-con-un-percorso-molto-lungo-di-prova",
                },
            )
        for i in range(6):
            _event(
                db, f"lungo-{i}", institution_id=institution.id,
                title_i18n={"it": f"Evento numero {i} con un titolo piuttosto lungo"},
                summary_i18n={"it": ("Vieni a visitare la scuola e scopri tutti i percorsi disponibili. " * 3)},
                starts_at=NOW + timedelta(days=i + 1), ends_at=NOW + timedelta(days=i + 1, hours=4),
                page_url=f"https://esempio.test/evento-{i}-con-un-percorso-molto-lungo-di-prova",
            )
        referrals = orientation_referral_memory.retrieve_referrals(
            db, needs={"disagio-emotivo"}, institution_ids=[institution.id], language="it", limit=20)
        events = orientation_referral_memory.retrieve_events(
            db, needs={"scelta-percorso"}, institution_ids=[institution.id], language="it", limit=20)

        original_cap = orientation_referral_service.MAX_REFERRAL_CONTEXT_CHARS
        orientation_referral_service.MAX_REFERRAL_CONTEXT_CHARS = 10**6
        try:
            full = orientation_referral_memory.render_context(referrals, events, "it")
        finally:
            orientation_referral_service.MAX_REFERRAL_CONTEXT_CHARS = original_cap

        assert len(full) > MAX_REFERRAL_CONTEXT_CHARS, "il payload di prova deve superare il limite"
        capped = orientation_referral_memory.render_context(referrals, events, "it")
        assert len(capped) <= MAX_REFERRAL_CONTEXT_CHARS

        full_lines = full.split("\n")
        capped_lines = capped.split("\n")
        assert capped_lines, capped_lines
        # Ogni riga del blocco troncato deve comparire per intero nel blocco
        # senza limite, nello stesso ordine: nessuna riga a meta'.
        assert capped_lines == full_lines[: len(capped_lines)]
        assert len(capped_lines) < len(full_lines)
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
