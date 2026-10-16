"""Test della traduzione editoriale attraverso il provider AI configurato.

Il provider e' finto (`AIService._call_mistral` sostituito) e Ollama e' escluso:
nessuna chiamata di rete. Database Postgres DEDICATO ai test
(`counselorbot_test`).

    python -m pytest backend/tests/test_translation_provider.py
    # oppure, senza pytest, dentro il container backend:
    python -m backend.tests.test_translation_provider
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import json
import uuid
from contextlib import contextmanager
from urllib.parse import urlsplit, urlunsplit

import psycopg2
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import database, models
from backend.ai_service import AIService
from backend.certified_translation import translate_strategies
from backend.instrument_translation import translate_instrument
from backend.translation_provider import (
    TranslationUnavailable,
    _parse_json_object,
    resolve_target,
)

TEST_DB_NAME = "counselorbot_test"
_prod = urlsplit(os.environ["DATABASE_URL"])
_test_url = urlunsplit((_prod.scheme, _prod.netloc, f"/{TEST_DB_NAME}", _prod.query, _prod.fragment))
_admin_url = urlunsplit((_prod.scheme, _prod.netloc, "/postgres", _prod.query, _prod.fragment))

ALL_LANGS = ["en", "es", "fr", "de", "sv"]
CONFIG_KEYS = (
    "active_provider", "model_name", "pii_ner_enabled",
    "translation_provider", "translation_model",
    "model_name_mistral", "model_name_openai", "ai_fallback_targets",
)


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


def _snapshot_config(db):
    return {
        row.key: (row.value, row.description)
        for row in db.query(models.Config).filter(models.Config.key.in_(CONFIG_KEYS)).all()
    }


def _restore_config(db, snapshot):
    db.query(models.Config).filter(models.Config.key.in_(CONFIG_KEYS)).delete(synchronize_session=False)
    for key, (value, description) in snapshot.items():
        db.add(models.Config(key=key, value=value, description=description))
    db.commit()


def _set_config(db, **values):
    for key, value in values.items():
        row = db.query(models.Config).filter(models.Config.key == key).first()
        if row:
            row.value = value
        else:
            db.add(models.Config(key=key, value=value, description="test"))
    db.commit()


@contextmanager
def _isolated():
    """Ripristina Config e righe di test dopo ogni caso (nessun inquinamento)."""
    db = _TestSession()
    snapshot = _snapshot_config(db)
    db.close()
    try:
        yield
    finally:
        db = _TestSession()
        try:
            db.query(models.CertifiedStrategy).filter(
                models.CertifiedStrategy.slug.like(f"{PREFIX}%")
            ).delete(synchronize_session=False)
            db.query(models.ContentLanguageVersion).filter(
                models.ContentLanguageVersion.content_key.like(f"{PREFIX}%")
            ).delete(synchronize_session=False)
            for code in [f"{PREFIX}-A"]:
                db.query(models.QuestionnaireItem).filter(
                    models.QuestionnaireItem.instrument_code == code
                ).delete(synchronize_session=False)
                db.query(models.Factor).filter(
                    models.Factor.instrument_code == code
                ).delete(synchronize_session=False)
                db.query(models.Instrument).filter(
                    models.Instrument.code == code
                ).delete(synchronize_session=False)
                db.query(models.ContentLanguageVersion).filter(
                    models.ContentLanguageVersion.content_key == code
                ).delete(synchronize_session=False)
            _restore_config(db, snapshot)
        finally:
            db.close()


@pytest.fixture(autouse=True)
def _isolate_rows_and_config():
    with _isolated():
        yield


def _fake_provider(calls=None):
    """Provider esterno finto: risponde JSON, non tocca la rete."""
    def call(self, user_message, system_prompt, model, max_tokens=None, history=None):
        if calls is not None:
            calls.append({"provider": "mistral", "model": model})
        return json.dumps({lang: f"[mistral-{lang}] {model}" for lang in ALL_LANGS})
    return call


def _forbid_ollama(monkeypatch):
    def boom(*args, **kwargs):  # pragma: no cover - deve fallire se chiamata
        raise AssertionError("Ollama non deve essere usato quando il provider e' configurato")
    monkeypatch.setattr(AIService, "_call_ollama", boom)


def _external_provider(db):
    _set_config(
        db,
        active_provider="mistral",
        model_name="mistral-small-latest",
        pii_ner_enabled="false",
    )


def _strategy(db, slug):
    row = models.CertifiedStrategy(
        slug=f"{PREFIX}-{slug}",
        name_it="Ripasso distribuito",
        recommended_when_it="Quando studi tutto la sera prima",
        description_it="Dividi il ripasso su piu' giorni",
        questionnaire_types=["QSA"], status="certified", is_active=True, sort_order=0,
    )
    db.add(row)
    db.commit()
    return row


def _instrument(db, code):
    db.add(models.Instrument(code=code, name_en="Test instrument",
                             response_scale_min=1, response_scale_max=4,
                             response_labels={"en": ["Never", "Sometimes"]}))
    db.add(models.Factor(instrument_code=code, code="C1", label_en="Strategies",
                         orientation="resource"))
    db.add(models.QuestionnaireItem(instrument_code=code, item_number=1,
                                    factor_code="C1", text_en="first item"))
    db.commit()


# --- provider esterno configurato -------------------------------------------

def test_catalog_translation_uses_the_configured_external_provider(monkeypatch):
    from backend import content_version_service as cvs
    db = _TestSession()
    try:
        _external_provider(db)
        monkeypatch.setenv("API_KEY_MISTRAL", "test-key")
        monkeypatch.setattr(AIService, "_call_mistral", _fake_provider())
        _forbid_ollama(monkeypatch)

        row = _strategy(db, "ext")
        translated = translate_strategies(db)
        assert translated >= 1
        db.refresh(row)
        assert row.name_i18n["de"] == "[mistral-de] mistral-small-latest"
        # La provenienza registrata nomina provider e modello, non piu' Ollama.
        version = cvs.get_version(db, "certified_strategy", row.slug, "de")
        assert version.source == "llm:mistral/mistral-small-latest"
    finally:
        db.close()


def test_instrument_translation_uses_the_configured_external_provider(monkeypatch):
    db = _TestSession()
    try:
        _external_provider(db)
        monkeypatch.setenv("API_KEY_MISTRAL", "test-key")
        monkeypatch.setattr(AIService, "_call_mistral", _fake_provider())
        _forbid_ollama(monkeypatch)

        code = f"{PREFIX}-A"
        _instrument(db, code)
        translate_instrument(db, code, targets=["fr", "de"])

        item = db.query(models.QuestionnaireItem).filter(
            models.QuestionnaireItem.instrument_code == code
        ).first()
        assert item.text_i18n["fr"] == "[mistral-fr] mistral-small-latest"
        assert item.text_i18n["de"] == "[mistral-de] mistral-small-latest"
        # "es" non era tra le lingue richieste: il filtro non la inventa.
        assert "es" not in item.text_i18n
    finally:
        db.close()


# --- preset configurabile ----------------------------------------------------

def test_translation_provider_preset_overrides_the_active_provider(monkeypatch):
    db = _TestSession()
    try:
        _set_config(db, active_provider="openai", model_name="gpt-4o",
                    translation_provider="mistral", translation_model="mistral-large-latest")
        monkeypatch.setenv("API_KEY_MISTRAL", "test-key")
        target = resolve_target(db)
        assert target.provider == "mistral"
        assert target.model == "mistral-large-latest"
        assert target.label == "mistral/mistral-large-latest"
    finally:
        db.close()


def test_without_a_preset_the_active_model_is_used(monkeypatch):
    db = _TestSession()
    try:
        _external_provider(db)
        monkeypatch.setenv("API_KEY_MISTRAL", "test-key")
        target = resolve_target(db)
        assert target.provider == "mistral"
        assert target.model == "mistral-small-latest"
    finally:
        db.close()


# --- errori chiari -----------------------------------------------------------

def test_no_configured_provider_raises_a_clear_error(monkeypatch):
    db = _TestSession()
    try:
        _set_config(db, active_provider="", model_name="",
                    translation_provider="", translation_model="")
        monkeypatch.delenv("TRANSLATION_PROVIDER", raising=False)
        with pytest.raises(TranslationUnavailable) as excinfo:
            resolve_target(db)
        assert "Nessun provider AI configurato" in str(excinfo.value)
    finally:
        db.close()


def test_translation_without_a_provider_raises_the_same_clear_error(monkeypatch):
    db = _TestSession()
    try:
        _set_config(db, active_provider="", model_name="",
                    translation_provider="", translation_model="")
        monkeypatch.delenv("TRANSLATION_PROVIDER", raising=False)
        with pytest.raises(TranslationUnavailable) as excinfo:
            translate_strategies(db)
        assert "Nessun provider AI configurato" in str(excinfo.value)
    finally:
        db.close()


def test_missing_api_key_for_an_external_provider_is_reported(monkeypatch):
    db = _TestSession()
    try:
        _external_provider(db)
        monkeypatch.delenv("API_KEY_MISTRAL", raising=False)
        with pytest.raises(TranslationUnavailable) as excinfo:
            resolve_target(db)
        assert "Chiave API mancante" in str(excinfo.value)
    finally:
        db.close()


def test_provider_set_to_none_raises_a_clear_error(monkeypatch):
    db = _TestSession()
    try:
        _set_config(db, active_provider="none", model_name="",
                    translation_provider="", translation_model="")
        monkeypatch.delenv("TRANSLATION_PROVIDER", raising=False)
        with pytest.raises(TranslationUnavailable) as excinfo:
            resolve_target(db)
        assert "Nessun provider AI configurato" in str(excinfo.value)
    finally:
        db.close()


# --- parsing senza rete ------------------------------------------------------

def test_parse_json_object_accepts_a_code_fence_and_surrounding_prose():
    assert _parse_json_object('```json\n{"en": "hi"}\n```') == {"en": "hi"}
    assert _parse_json_object('Ecco la traduzione: {"fr": "salut"} fine.') == {"fr": "salut"}


def test_parse_json_object_rejects_garbage():
    assert _parse_json_object("") == {}
    assert _parse_json_object("not json at all") == {}


class _MonkeyPatch:
    """Sostituto minimo di pytest.monkeypatch per il runner senza pytest."""

    def __init__(self):
        self._env: list = []
        self._attrs: list = []

    def setenv(self, name, value):
        self._env.append((name, os.environ.get(name)))
        os.environ[name] = value

    def delenv(self, name, raising=True):
        self._env.append((name, os.environ.get(name)))
        os.environ.pop(name, None)

    def setattr(self, obj, name, value):
        self._attrs.append((obj, name, getattr(obj, name)))
        setattr(obj, name, value)

    def undo(self):
        for name, value in reversed(self._env):
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        for obj, name, value in reversed(self._attrs):
            setattr(obj, name, value)


if __name__ == "__main__":
    import inspect
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for test in tests:
        mp = _MonkeyPatch()
        try:
            try:
                with _isolated():
                    if inspect.signature(test).parameters:
                        test(mp)
                    else:
                        test()
            finally:
                mp.undo()
            print(f"ok   {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}")
        except Exception as exc:
            failed += 1
            print(f"ERROR {test.__name__}: {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
