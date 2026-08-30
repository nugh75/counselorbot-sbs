"""Test del catalogo delle letture certificate.

Parte pura (temi, seme, verifica offline) piu' il recupero su database Postgres
DEDICATO ai test (`counselorbot_test`).

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_certified_readings
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import uuid
from types import SimpleNamespace
from urllib.parse import urlsplit, urlunsplit

import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import database, models
from backend.certified_reading_seed import SEED_CERTIFIED_READINGS, seed_certified_readings
from backend.certified_reading_service import certified_reading_memory
from backend.reading_themes import READING_THEMES, themes_from_factors, themes_from_text
from backend.reading_verification import verify_reading
from backend.skills import handlers
from backend.skills.context import SkillContext

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


def _reading(db, slug, **kwargs):
    data = dict(
        slug=f"{PREFIX}-{slug}", kind="essay", title=f"Titolo {slug}", creators=["Autrice"],
        year=2020, themes=["ansia-e-prestazione"], audience=["secondaria"],
        available_languages=["it"], why_i18n={"it": "perche' si', in italiano"},
        status="certified", is_active=True, sort_order=0,
    )
    data.update(kwargs)
    row = models.CertifiedReading(**data)
    db.add(row)
    db.commit()
    return row


def _ctx(**kwargs):
    base = dict(questionnaire_type="QSA", step_id=None, step_mode=None, language="it")
    base.update(kwargs)
    return SkillContext(**base)


# --- vocabolario dei temi ----------------------------------------------------

def test_themes_come_from_words_and_from_factors():
    assert "ansia-e-prestazione" in themes_from_text("ho paura della verifica")
    assert "futuro-e-orientamento" in themes_from_text("non so cosa fare dopo la scuola")
    assert themes_from_text("grazie mille") == set()
    assert "tempo-e-memoria" in themes_from_factors(["T1"])
    assert "metodo-di-studio" in themes_from_factors(["C5"])


def test_every_theme_declares_labels_and_keywords():
    for code, theme in READING_THEMES.items():
        assert theme["label"].strip(), code
        assert theme["keywords"], code


# --- recupero ----------------------------------------------------------------

def test_theme_match_lets_a_reading_through():
    db = _TestSession()
    try:
        _reading(db, "tema")
        out = certified_reading_memory.retrieve(
            db, themes={"ansia-e-prestazione"}, language="it", query="ansia prima della prova")
        assert [e["id"] for e in out] == [f"{PREFIX}-tema"]
        assert "[CERTIFIED_READINGS]" in certified_reading_memory.render_context(out)
    finally:
        db.query(models.CertifiedReading).delete()
        db.commit(); db.close()


def test_factor_codes_are_a_second_channel():
    db = _TestSession()
    try:
        _reading(db, "fattori", themes=[], factor_codes=["T1"])
        out = certified_reading_memory.retrieve(db, themes=set(), factor_codes={"T1"}, language="it")
        assert [e["id"] for e in out] == [f"{PREFIX}-fattori"]
    finally:
        db.query(models.CertifiedReading).delete()
        db.commit(); db.close()


def test_an_entry_without_themes_or_factors_never_enters():
    db = _TestSession()
    try:
        _reading(db, "jolly", themes=[], factor_codes=[])
        out = certified_reading_memory.retrieve(
            db, themes={"ansia-e-prestazione"}, factor_codes={"A1"}, language="it")
        assert out == []
    finally:
        db.query(models.CertifiedReading).delete()
        db.commit(); db.close()


def test_sensitive_material_is_off_by_default():
    """Doppia condizione: interruttore admin acceso E tema nominato dallo studente."""
    db = _TestSession()
    try:
        _reading(db, "sensibile", is_sensitive=True, content_warning="Contiene un suicidio.")
        # tema nominato dallo studente, ma interruttore spento
        assert certified_reading_memory.retrieve(
            db, themes=set(), explicit_themes={"ansia-e-prestazione"}, language="it") == []
        # interruttore acceso, ma il tema arriva solo dal contesto
        assert certified_reading_memory.retrieve(
            db, themes={"ansia-e-prestazione"}, language="it", allow_sensitive=True) == []
        # entrambe le condizioni: entra, con l'avvertenza
        out = certified_reading_memory.retrieve(
            db, themes=set(), explicit_themes={"ansia-e-prestazione"}, language="it",
            allow_sensitive=True)
        assert [e["id"] for e in out] == [f"{PREFIX}-sensibile"]
        assert "suicidio" in certified_reading_memory.render_context(out).lower()
    finally:
        db.query(models.CertifiedReading).delete()
        db.commit(); db.close()


def test_the_handler_keeps_sensitive_material_out_unless_configured():
    db = _TestSession()
    try:
        _reading(db, "handler-sensibile", is_sensitive=True, content_warning="Contiene un suicidio.",
                 themes=["futuro-e-orientamento"])
        ctx = _ctx(db=db, message="non so cosa fare dopo la scuola",
                   component_flags={"knowledge": True})
        assert "Nessuna fonte identificabile" in handlers.reading_sources(ctx, {}).text
    finally:
        db.query(models.CertifiedReading).delete()
        db.query(models.Config).filter(models.Config.key == "readings_allow_sensitive").delete()
        db.commit(); db.close()


def test_draft_and_instrument_scope_are_respected():
    db = _TestSession()
    try:
        _reading(db, "bozza", status="draft")
        _reading(db, "altro-strumento", questionnaire_types=["ZTPI"])
        out = certified_reading_memory.retrieve(
            db, themes={"ansia-e-prestazione"}, questionnaire_type="QSA", language="it")
        assert out == []
    finally:
        db.query(models.CertifiedReading).delete()
        db.commit(); db.close()


def test_the_language_of_the_turn_wins_at_equal_relevance():
    db = _TestSession()
    try:
        _reading(db, "solo-it", available_languages=["it"])
        _reading(db, "anche-sv", available_languages=["it", "sv"])
        out = certified_reading_memory.retrieve(
            db, themes={"ansia-e-prestazione"}, language="sv", limit=2)
        assert out[0]["id"] == f"{PREFIX}-anche-sv"
        assert "sv" in out[0]["languages"]
    finally:
        db.query(models.CertifiedReading).delete()
        db.commit(); db.close()


# --- handler -----------------------------------------------------------------

def test_the_handler_merges_catalog_and_retrieved_documents():
    db = _TestSession()
    try:
        _reading(db, "handler")
        ctx = _ctx(db=db, message="ho ansia prima della verifica",
                   knowledge_sources=({"title": "Guida 2023", "source": "fonti/guida.pdf"},),
                   component_flags={"knowledge": True})
        out = handlers.reading_sources(ctx, {})
        assert "[CERTIFIED_READINGS]" in out.text
        assert "[READING_SOURCES]" in out.text
        assert out.slot == "knowledge"
    finally:
        db.query(models.CertifiedReading).delete()
        db.commit(); db.close()


def test_the_catalog_alone_is_enough_without_retrieved_documents():
    db = _TestSession()
    try:
        _reading(db, "solo-catalogo")
        ctx = _ctx(db=db, message="ho ansia prima della verifica", component_flags={"knowledge": True})
        out = handlers.reading_sources(ctx, {})
        assert "[CERTIFIED_READINGS]" in out.text
        assert out.slot == "knowledge"
    finally:
        db.query(models.CertifiedReading).delete()
        db.commit(); db.close()


def test_absence_is_still_declared_when_nothing_matches():
    db = _TestSession()
    try:
        ctx = _ctx(db=db, message="grazie, per ora va bene", component_flags={"knowledge": True})
        out = handlers.reading_sources(ctx, {})
        assert "Nessuna fonte identificabile" in out.text
    finally:
        db.close()


# --- seme e verifica ---------------------------------------------------------

def test_the_seed_is_consistent_and_idempotent():
    slugs = [s["slug"] for s in SEED_CERTIFIED_READINGS]
    assert len(slugs) == len(set(slugs))
    for spec in SEED_CERTIFIED_READINGS:
        assert spec["kind"] in {"essay", "fiction", "film", "documentary", "series", "article", "podcast", "video"}
        assert all(t in READING_THEMES for t in spec["themes"]), spec["slug"]
        assert spec.get("source_reference"), spec["slug"]
        if spec.get("is_sensitive"):
            assert spec.get("content_warning"), spec["slug"]
    db = _TestSession()
    try:
        db.query(models.CertifiedReading).delete()
        db.commit()
        first = seed_certified_readings(db, models)
        second = seed_certified_readings(db, models)
        assert first == len(SEED_CERTIFIED_READINGS)
        assert second == 0, "il seme non e' idempotente"
        assert db.query(models.CertifiedReading).filter(
            models.CertifiedReading.status == "certified").count() == 0, \
            "il seme non deve certificare da solo: la firma la mette l'admin"
    finally:
        db.query(models.CertifiedReading).delete()
        db.commit(); db.close()


def test_verification_admits_it_cannot_check_a_film():
    result = verify_reading({"title": "Il posto delle fragole", "kind": "film", "year": 1957})
    assert result["match"] is None
    assert result["source"] == "manual"
    assert "film" in result["note"]


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
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
