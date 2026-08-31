"""Test della traduzione dei contenuti certificati (strategie e letture).

Il traduttore e' iniettato: nessuna chiamata a Ollama nei test. Database Postgres
DEDICATO ai test (`counselorbot_test`).

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_certified_translation
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import uuid
from urllib.parse import urlsplit, urlunsplit

import psycopg2
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import content_version_service as cvs
from backend import database, models
from backend.certified_translation import (
    TOOL_TARGET_LANGS,
    translate_readings,
    translate_strategies,
)
from backend.certified_strategy_service import certified_strategy_memory
from backend.certified_reading_service import certified_reading_memory
from backend.content_versions_seed import (
    derive_reading_versions,
    derive_strategy_versions,
    ensure_i18n_columns,
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
ensure_i18n_columns(_engine)

PREFIX = f"t{uuid.uuid4().hex[:6]}"


def _fake_translator(calls=None):
    """Traduttore finto: prefissa il codice lingua, cosi' si vede chi ha scritto cosa."""
    def translate(text: str) -> dict[str, str]:
        if calls is not None:
            calls.append(text)
        return {lang: f"[{lang}] {text}" for lang in TOOL_TARGET_LANGS}
    return translate


def _strategy(db, slug, **kwargs):
    data = dict(
        slug=f"{PREFIX}-{slug}",
        name_it="Ripasso distribuito",
        recommended_when_it="Quando studi tutto la sera prima",
        description_it="Dividi il ripasso su piu' giorni",
        status="certified", is_active=True, sort_order=0,
    )
    data.update(kwargs)
    row = models.CertifiedStrategy(**data)
    db.add(row)
    db.commit()
    return row


def _reading(db, slug, **kwargs):
    data = dict(
        slug=f"{PREFIX}-{slug}", kind="essay", title=f"Titolo {slug}", creators=["Autrice"],
        year=2020, themes=["ansia-e-prestazione"], audience=["secondaria"],
        available_languages=["it"],
        why_i18n={"it": "perche' parla di ansia da prestazione"},
        summary_i18n={"it": "aiuta a capire l'ansia"},
        status="certified", is_active=True, sort_order=0,
    )
    data.update(kwargs)
    row = models.CertifiedReading(**data)
    db.add(row)
    db.commit()
    return row


@pytest.fixture(autouse=True)
def _cleanup_translation_rows():
    """Le righe create qui (prefisso PREFIX) non devono inquinare gli altri file.

    Ogni file di test ricrea il DB `counselorbot_test` solo all'import; in un
    singolo processo pytest l'esecuzione dei file successivi (letture, smoke)
    vede quindi le righe lasciate qui. Il prefisso e' unico per processo.
    """
    yield
    db = _TestSession()
    try:
        db.query(models.CertifiedStrategy).filter(
            models.CertifiedStrategy.slug.like(f"{PREFIX}%")
        ).delete(synchronize_session=False)
        db.query(models.CertifiedReading).filter(
            models.CertifiedReading.slug.like(f"{PREFIX}%")
        ).delete(synchronize_session=False)
        db.query(models.ContentLanguageVersion).filter(
            models.ContentLanguageVersion.content_key.like(f"{PREFIX}%")
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


# --- strategie ---------------------------------------------------------------

def test_translation_fills_every_target_language():
    db = _TestSession()
    try:
        row = _strategy(db, "s1")
        translated = translate_strategies(db, translate=_fake_translator())
        assert translated >= 1
        db.refresh(row)
        for lang in TOOL_TARGET_LANGS:
            assert row.name_i18n[lang] == "[%s] Ripasso distribuito" % lang
            assert row.description_i18n[lang].startswith(f"[{lang}]")
    finally:
        db.close()


def test_italian_source_is_kept_in_the_json_too():
    db = _TestSession()
    try:
        row = _strategy(db, "s2")
        translate_strategies(db, translate=_fake_translator())
        db.refresh(row)
        # senza l'italiano nel JSON, il lettore i18n dovrebbe ripiegare sulla
        # colonna vecchia proprio per la lingua sorgente: incoerente.
        assert row.name_i18n["it"] == "Ripasso distribuito"
    finally:
        db.close()


def test_a_machine_translation_is_registered_as_translated_not_certified():
    db = _TestSession()
    try:
        row = _strategy(db, "s3")
        # Lo stato iniziale nasce dalla derivazione all'avvio: l'italiano di una
        # strategia certificata e' `certified`.
        derive_strategy_versions(db)
        translate_strategies(db, translate=_fake_translator(), model_label="qwen3.8")
        statuses = cvs.status_map(db, "certified_strategy", row.slug)
        for lang in TOOL_TARGET_LANGS:
            assert statuses[lang] == "translated", lang
        # l'italiano, che e' la sorgente umana certificata, non viene retrocesso
        assert statuses["it"] == "certified"
        version = cvs.get_version(db, "certified_strategy", row.slug, "de")
        assert version.source == "llm:qwen3.8"
    finally:
        db.close()


def test_a_partial_tool_translation_stays_draft():
    db = _TestSession()
    row = None
    try:
        row = _strategy(db, "partial")
        derive_strategy_versions(db)

        def partial(text: str) -> dict[str, str]:
            return {"fr": "Nom francais"} if text == "Ripasso distribuito" else {}

        translate_strategies(db, translate=partial, model_label="partial-model")
        version = cvs.get_version(db, "certified_strategy", row.slug, "fr")
        assert version.status == "draft"
        assert version.source == "llm:partial-model"
    finally:
        if row is not None:
            db.query(models.ContentLanguageVersion).filter(
                models.ContentLanguageVersion.content_type == "certified_strategy",
                models.ContentLanguageVersion.content_key == row.slug,
            ).delete(synchronize_session=False)
            db.delete(row)
            db.commit()
        db.close()


def test_chat_uses_only_a_certified_language_and_falls_back_to_certified_italian():
    db = _TestSession()
    try:
        row = _strategy(db, "gate")
        derive_strategy_versions(db)
        translate_strategies(db, translate=_fake_translator(), model_label="qwen3.8")

        before_review = certified_strategy_memory.retrieve(
            db,
            questionnaire_type="QSA",
            language="fr",
            allowed_ids={row.slug},
            limit=1,
        )
        assert before_review[0]["name"] == "Ripasso distribuito"

        version = cvs.get_version(db, "certified_strategy", row.slug, "fr")
        cvs.promote(db, version, "certified", approved_by="reviewer")
        after_review = certified_strategy_memory.retrieve(
            db,
            questionnaire_type="QSA",
            language="fr",
            allowed_ids={row.slug},
            limit=1,
        )
        assert after_review[0]["name"] == "[fr] Ripasso distribuito"
    finally:
        db.close()


def test_already_translated_rows_are_skipped():
    db = _TestSession()
    try:
        _strategy(db, "s4")
        calls: list[str] = []
        translate_strategies(db, translate=_fake_translator(calls))
        first = len(calls)
        assert first >= 1
        calls.clear()
        translate_strategies(db, translate=_fake_translator(calls))
        assert calls == [], "una seconda passata non deve richiamare il traduttore"
    finally:
        db.close()


def test_force_retranslates_even_when_complete():
    db = _TestSession()
    try:
        _strategy(db, "s5")
        translate_strategies(db, translate=_fake_translator())
        calls: list[str] = []
        translate_strategies(db, translate=_fake_translator(calls), force=True)
        assert calls, "force deve ritradurre"
    finally:
        db.close()


def test_a_row_without_italian_source_is_left_alone():
    db = _TestSession()
    try:
        _strategy(db, "s6", name_it=None, recommended_when_it=None, description_it=None)
        calls: list[str] = []
        translate_strategies(db, translate=_fake_translator(calls))
        assert calls == []
    finally:
        db.close()


# --- letture -----------------------------------------------------------------

def test_readings_get_the_missing_languages_only():
    db = _TestSession()
    try:
        row = _reading(db, "r1", why_i18n={"it": "perche' si'", "en": "because yes"})
        translate_readings(db, translate=_fake_translator())
        db.refresh(row)
        # l'inglese gia' presente non viene riscritto dalla macchina
        assert row.why_i18n["en"] == "because yes"
        assert row.why_i18n["de"].startswith("[de]")
        assert row.why_i18n["it"] == "perche' si'"
    finally:
        db.close()


def test_readings_register_their_language_status():
    db = _TestSession()
    try:
        row = _reading(db, "r2")
        translate_readings(db, translate=_fake_translator(), model_label="qwen3.8")
        statuses = cvs.status_map(db, "certified_reading", row.slug)
        assert statuses["fr"] == "translated"
    finally:
        db.close()


def test_reading_chat_uses_only_certified_language_text():
    db = _TestSession()
    try:
        row = _reading(db, "reading-gate", synopsis_i18n={"it": "Sinossi italiana"})
        derive_reading_versions(db)
        translate_readings(db, translate=_fake_translator(), model_label="qwen3.8")

        before_review = certified_reading_memory.retrieve(
            db,
            themes=["ansia-e-prestazione"],
            language="fr",
            audience_band="secondaria",
            limit=100,
        )
        entry = next(item for item in before_review if item["id"] == row.slug)
        assert entry["synopsis"] == "Sinossi italiana"

        version = cvs.get_version(db, "certified_reading", row.slug, "fr")
        cvs.promote(db, version, "certified", approved_by="reviewer")
        after_review = certified_reading_memory.retrieve(
            db,
            themes=["ansia-e-prestazione"],
            language="fr",
            audience_band="secondaria",
            limit=100,
        )
        entry = next(item for item in after_review if item["id"] == row.slug)
        assert entry["synopsis"] == "[fr] Sinossi italiana"
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
