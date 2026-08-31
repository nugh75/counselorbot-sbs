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
from backend.content_versions_seed import derive_reading_versions
from backend.reading_audience import band_from_age, band_from_text, most_protective, resolve_audience_band
from backend.reading_frame import READING_FRAME, frame
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

# Il modulo e' eseguibile anche dopo le altre suite sullo stesso DB dedicato:
# parte senza letture o stati residui che altererebbero ranking e limit.
with _TestSession() as _cleanup_db:
    _cleanup_db.query(models.ContentLanguageVersion).filter(
        models.ContentLanguageVersion.content_type == "certified_reading"
    ).delete(synchronize_session=False)
    _cleanup_db.query(models.CertifiedReading).delete(synchronize_session=False)
    _cleanup_db.commit()

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
    derive_reading_versions(db)
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


# --- fascia di pubblico ------------------------------------------------------

def test_the_band_comes_from_age_and_from_free_text():
    assert band_from_age(16) == "secondaria"
    assert band_from_age("22") == "universita"
    assert band_from_age(50) == "adulti"
    assert band_from_age("non lo dico") is None
    assert band_from_text("quinta liceo scientifico") == "secondaria"
    assert band_from_text("3rd Year, National PhD Programme") == "universita"
    assert band_from_text("mi piace studiare") is None


def test_contradicting_signals_resolve_to_the_most_protective():
    assert most_protective(["adulti", "secondaria"]) == "secondaria"
    assert most_protective(["adulti", "universita"]) == "universita"
    assert most_protective([None, None]) is None


def test_a_reading_does_not_cross_into_another_band():
    db = _TestSession()
    try:
        _reading(db, "per-adulti", audience=["adulti"])
        _reading(db, "per-tutti", audience=[])
        out = certified_reading_memory.retrieve(
            db, themes={"ansia-e-prestazione"}, language="it", limit=5, audience_band="secondaria")
        assert [e["id"] for e in out] == [f"{PREFIX}-per-tutti"]
        # Fascia ignota: nessun filtro, la decisione passa al turno.
        both = certified_reading_memory.retrieve(
            db, themes={"ansia-e-prestazione"}, language="it", limit=5)
        assert len(both) == 2
    finally:
        db.query(models.CertifiedReading).delete()
        db.commit(); db.close()


def test_without_a_band_the_model_is_told_to_ask():
    db = _TestSession()
    try:
        _reading(db, "con-pubblico", audience=["universita"])
        ctx = _ctx(db=db, message="ho ansia prima della verifica", component_flags={"knowledge": True})
        assert "chiediglielo" in handlers.reading_sources(ctx, {}).text
    finally:
        db.query(models.CertifiedReading).delete()
        db.commit(); db.close()


def test_the_band_is_read_from_the_learner_profile():
    db = _TestSession()
    user = f"{PREFIX}-studente"
    try:
        db.add(models.LearnerProfileRevision(username=user, data={"age": 16, "school_year": "quarta"}))
        db.commit()
        assert resolve_audience_band(db, user) == "secondaria"
        # Eta' adulta ma percorso scolastico: vince il segnale piu' protettivo.
        db.add(models.LearnerProfileRevision(username=user, data={"age": 40, "school_class": "liceo"}))
        db.commit()
        assert resolve_audience_band(db, user) == "secondaria"
        assert resolve_audience_band(db, "chi-non-esiste") is None
    finally:
        db.query(models.LearnerProfileRevision).filter(
            models.LearnerProfileRevision.username == user).delete()
        db.commit(); db.close()


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


# --- sinossi -----------------------------------------------------------------

def test_the_synopsis_tells_the_student_what_the_work_is_about():
    db = _TestSession()
    try:
        _reading(db, "sinossi",
                 synopsis_i18n={"it": "Un uomo anziano ripercorre la propria vita in un viaggio in auto."},
                 synopsis_source={"source": "wikipedia", "url": "https://it.wikipedia.org/wiki/X"})
        out = certified_reading_memory.retrieve(
            db, themes={"ansia-e-prestazione"}, language="it")
        block = certified_reading_memory.render_context(out)
        assert "Di cosa parla: Un uomo anziano" in block
        # La sinossi non prende il posto del motivo della raccomandazione.
        assert "Perche':" in block
    finally:
        db.query(models.CertifiedReading).delete()
        db.commit(); db.close()


def test_a_long_synopsis_is_clipped_before_reaching_the_prompt():
    db = _TestSession()
    try:
        _reading(db, "sinossi-lunga", synopsis_i18n={"it": "parola " * 200})
        out = certified_reading_memory.retrieve(
            db, themes={"ansia-e-prestazione"}, language="it")
        assert len(out[0]["synopsis"]) <= 224
        assert out[0]["synopsis"].endswith("...")
    finally:
        db.query(models.CertifiedReading).delete()
        db.commit(); db.close()


def test_a_synopsis_without_provenance_cannot_be_certified():
    from fastapi import HTTPException

    from backend.routes.certified_readings import _guard_certification

    row = models.CertifiedReading(
        slug="x", kind="essay", title="T", themes=["ansia-e-prestazione"],
        why_i18n={"it": "perche' si'"}, status="certified",
        synopsis_i18n={"it": "Racconta qualcosa."},
    )
    try:
        _guard_certification(row)
        raise AssertionError("una sinossi senza URL non deve poter essere certificata")
    except HTTPException as exc:
        assert "provenienza" in exc.detail

    row.synopsis_source = {"url": "https://it.wikipedia.org/wiki/T"}
    _guard_certification(row)  # con la fonte dichiarata passa


# --- cornice del blocco ------------------------------------------------------

def test_the_frame_speaks_the_language_of_the_turn():
    db = _TestSession()
    try:
        _reading(db, "cornice", synopsis_i18n={"en": "A man looks back on his life."},
                 synopsis_source={"source": "wikipedia", "url": "https://en.wikipedia.org/wiki/X"},
                 why_i18n={"it": "perche' si'", "en": "because it fits"})
        out = certified_reading_memory.retrieve(db, themes={"ansia-e-prestazione"}, language="en")
        block = certified_reading_memory.render_context(out, "en")
        assert "What it is about: A man looks back" in block
        assert "Why: because it fits" in block
        assert "Approved catalogue" in block
        # Il tag resta un marcatore per il motore, non una frase da tradurre.
        assert "[CERTIFIED_READINGS]" in block
        assert "Di cosa parla" not in block and "Perche'" not in block

        italian = certified_reading_memory.render_context(
            certified_reading_memory.retrieve(db, themes={"ansia-e-prestazione"}, language="it"), "it")
        assert "Perche': perche' si'" in italian
    finally:
        db.query(models.CertifiedReading).delete()
        db.commit(); db.close()


def test_every_interface_language_has_a_complete_frame():
    expected = set(READING_FRAME["en"])
    for language in ("it", "en", "es", "fr", "de", "sv"):
        missing = expected - set(READING_FRAME[language])
        assert not missing, f"{language} senza {missing}"
        assert all(READING_FRAME[language][key].strip() for key in expected), language
    # Una lingua non prevista ricade sull'inglese, non su una lingua a caso.
    assert frame("pt") is READING_FRAME["en"]


def test_the_absence_of_sources_is_declared_in_the_turn_language():
    db = _TestSession()
    try:
        ctx = _ctx(db=db, language="en", message="suggest me a reading",
                   component_flags={"knowledge": True})
        assert "No identifiable source" in handlers.reading_sources(ctx, {}).text
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
        except Exception as exc:  # un errore non-assert non deve interrompere la suite
            failed += 1
            print(f"ERROR {test.__name__}: {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
