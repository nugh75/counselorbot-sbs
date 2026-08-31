"""Test della traduzione degli item degli strumenti.

Traduttore iniettato: nessuna chiamata a Ollama. Database Postgres DEDICATO ai
test (`counselorbot_test`).

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_instrument_translation
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
from backend.content_versions_seed import derive_instrument_versions, ensure_i18n_columns
from backend.instrument_translation import (
    refresh_instrument_status,
    translate_instrument,
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


def _translator(targets, calls=None):
    def translate(text: str, source: str, wanted: list[str]) -> dict[str, str]:
        if calls is not None:
            calls.append((text, source, tuple(wanted)))
        return {lang: f"[{lang}] {text}" for lang in wanted if lang in targets}
    return translate


def _instrument(db, code, item_texts):
    db.add(models.Instrument(code=code, name_en="Test instrument",
                             response_scale_min=1, response_scale_max=4,
                             response_labels={
                                 "en": ["Never", "Sometimes", "Often", "Always"],
                             }))
    db.add(models.Factor(instrument_code=code, code="C1", label_en="Elaborative strategies",
                         orientation="resource"))
    for number, text in enumerate(item_texts, start=1):
        db.add(models.QuestionnaireItem(instrument_code=code, item_number=number,
                                        factor_code="C1", text_en=text))
    db.commit()
    derive_instrument_versions(db)


def test_items_factors_and_name_all_get_the_target_languages():
    db = _TestSession()
    try:
        code = f"{PREFIX}-A"
        _instrument(db, code, ["first item", "second item"])
        translate_instrument(db, code, targets=["fr", "de"], translate=_translator({"fr", "de"}))

        items = db.query(models.QuestionnaireItem).filter(
            models.QuestionnaireItem.instrument_code == code
        ).order_by(models.QuestionnaireItem.item_number).all()
        assert items[0].text_i18n["fr"] == "[fr] first item"
        assert items[1].text_i18n["de"] == "[de] second item"

        factor = db.query(models.Factor).filter(models.Factor.instrument_code == code).first()
        assert factor.label_i18n["de"].startswith("[de]")

        instrument = db.query(models.Instrument).filter(models.Instrument.code == code).first()
        assert instrument.name_i18n["fr"].startswith("[fr]")
    finally:
        db.close()


def test_response_scale_labels_are_translated_with_the_instrument():
    db = _TestSession()
    try:
        code = f"{PREFIX}-LABELS"
        _instrument(db, code, ["only item"])
        translate_instrument(db, code, targets=["fr"], translate=_translator({"fr"}))

        instrument = db.query(models.Instrument).filter(models.Instrument.code == code).first()
        assert instrument.response_labels["fr"] == [
            "[fr] Never", "[fr] Sometimes", "[fr] Often", "[fr] Always",
        ]
    finally:
        db.close()


def test_the_source_language_is_passed_to_the_translator():
    db = _TestSession()
    try:
        code = f"{PREFIX}-B"
        _instrument(db, code, ["only item"])
        calls: list[tuple] = []
        translate_instrument(db, code, targets=["fr"], translate=_translator({"fr"}, calls),
                             source="en")
        assert calls, "il traduttore deve essere chiamato"
        assert all(source == "en" for _, source, _ in calls)
    finally:
        db.close()


def test_a_fully_covered_language_becomes_translated():
    db = _TestSession()
    try:
        code = f"{PREFIX}-C"
        _instrument(db, code, ["one", "two"])
        assert cvs.status_map(db, "instrument", code)["fr"] == "draft"
        translate_instrument(db, code, targets=["fr"], translate=_translator({"fr"}))
        assert cvs.status_map(db, "instrument", code)["fr"] == "translated"
    finally:
        db.close()


def test_a_partially_covered_language_stays_draft():
    db = _TestSession()
    try:
        code = f"{PREFIX}-D"
        _instrument(db, code, ["one", "two"])
        # traduttore che copre solo il primo item: la lingua non e' pronta
        def half(text, source, wanted):
            return {"fr": f"[fr] {text}"} if text == "one" else {}
        translate_instrument(db, code, targets=["fr"], translate=half)
        assert cvs.status_map(db, "instrument", code)["fr"] == "draft", (
            "una lingua con item scoperti non puo' dirsi tradotta"
        )
    finally:
        db.close()


def test_a_machine_translation_never_reaches_pilot():
    db = _TestSession()
    try:
        code = f"{PREFIX}-E"
        _instrument(db, code, ["one"])
        translate_instrument(db, code, targets=["de"], translate=_translator({"de"}),
                             model_label="qwen3.8")
        version = cvs.get_version(db, "instrument", code, "de")
        assert version.status == "translated"
        assert version.source == "llm:qwen3.8"
        # somministrabile significa pilot o validated: una macchina non ci arriva
        assert "de" not in cvs.served_locales(db, "instrument", code)
    finally:
        db.close()


def test_an_existing_translation_is_not_overwritten():
    db = _TestSession()
    try:
        code = f"{PREFIX}-F"
        _instrument(db, code, ["one"])
        item = db.query(models.QuestionnaireItem).filter(
            models.QuestionnaireItem.instrument_code == code
        ).first()
        item.text_i18n = {"en": "one", "fr": "traduzione umana"}
        db.commit()
        translate_instrument(db, code, targets=["fr"], translate=_translator({"fr"}))
        db.refresh(item)
        assert item.text_i18n["fr"] == "traduzione umana"
    finally:
        db.close()


def test_refresh_never_demotes_a_language_above_translated():
    db = _TestSession()
    try:
        code = f"{PREFIX}-G"
        _instrument(db, code, ["one", "two"])
        cvs.upsert_version(db, "instrument", code, "fr", status="pilot")
        # il francese e' in pilot ma senza item: il ricalcolo non lo tocca,
        # perche' una decisione umana vale piu' di un conteggio
        refresh_instrument_status(db, code, ["fr"])
        assert cvs.status_map(db, "instrument", code)["fr"] == "pilot"
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
