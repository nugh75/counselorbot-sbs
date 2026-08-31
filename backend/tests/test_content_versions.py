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
# `create_all` non altera una tabella gia' esistente: la migrazione delle colonne
# JSON va applicata anche qui, ed e' la stessa che gira all'avvio dell'app.
from backend.content_versions_seed import ensure_i18n_columns  # noqa: E402

ensure_i18n_columns(_engine)

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


# --- campi i18n -------------------------------------------------------------

from backend import i18n_fields  # noqa: E402
from backend.content_versions_seed import backfill_i18n_columns  # noqa: E402


def test_json_wins_over_the_legacy_column():
    item = models.QuestionnaireItem(
        instrument_code="X", item_number=1,
        text_en="legacy english", text_i18n={"en": "json english", "fr": "francais"},
    )
    assert i18n_fields.localized(item, "text", "en") == "json english"
    assert i18n_fields.localized(item, "text", "fr") == "francais"


def test_legacy_column_is_still_read_when_json_is_missing():
    item = models.QuestionnaireItem(instrument_code="X", item_number=1, text_sv="svenska")
    assert i18n_fields.localized(item, "text", "sv") == "svenska"


def test_a_missing_language_is_none_not_another_language():
    item = models.QuestionnaireItem(instrument_code="X", item_number=1, text_en="english")
    assert i18n_fields.localized(item, "text", "de") is None


def test_merged_view_lists_every_language_that_has_text():
    factor = models.Factor(
        instrument_code="X", code="C1",
        label_en="Elaborative", label_sv="Elaborativa", label_i18n={"fr": "Elaboratives"},
    )
    assert i18n_fields.merged_i18n(factor, "label") == {
        "en": "Elaborative", "sv": "Elaborativa", "fr": "Elaboratives",
    }
    assert i18n_fields.locales_with_text(factor, "label") == {"en", "sv", "fr"}


def test_empty_string_does_not_count_as_translated():
    factor = models.Factor(instrument_code="X", code="C1", label_en="", label_i18n={"sv": "   "})
    assert i18n_fields.locales_with_text(factor, "label") == set()


def test_backfill_moves_legacy_columns_into_json_and_is_idempotent():
    db = _TestSession()
    try:
        code = f"{PREFIX}-BF"
        db.add(models.QuestionnaireItem(
            instrument_code=code, item_number=1, text_en="english", text_sv="svenska",
        ))
        db.commit()
        moved = backfill_i18n_columns(db)
        assert moved >= 1
        row = (
            db.query(models.QuestionnaireItem)
            .filter(models.QuestionnaireItem.instrument_code == code)
            .first()
        )
        assert row.text_i18n == {"en": "english", "sv": "svenska"}
        # la colonna vecchia non viene svuotata: un rollback del codice deve poter leggere ancora
        assert row.text_en == "english"
        # seconda passata: nessuna riga toccata
        assert backfill_i18n_columns(db) == 0
    finally:
        db.close()


# --- derivazione degli stati iniziali ---------------------------------------

from backend.content_versions_seed import (  # noqa: E402
    derive_instrument_versions,
    derive_strategy_versions,
)


def test_derivation_gives_every_language_a_row():
    db = _TestSession()
    try:
        code = f"{PREFIX}-DER"
        db.add(models.Instrument(code=code, response_scale_min=1, response_scale_max=4))
        db.add(models.Factor(instrument_code=code, code="C1", label_en="Elaborative"))
        db.add(models.QuestionnaireItem(
            instrument_code=code, item_number=1, factor_code="C1",
            text_en="english item", text_sv="svenskt item",
        ))
        db.commit()

        derive_instrument_versions(db)
        statuses = cvs.status_map(db, "instrument", code)
        # tutte e sei hanno una riga: "in che stato e' il tedesco?" ha sempre risposta
        assert set(statuses) == set(APP_LOCALES)
        # en e sv hanno item ma nessuna norma validata -> pilot, come oggi
        assert statuses["en"] == "pilot"
        assert statuses["sv"] == "pilot"
        # le altre non hanno item -> draft
        assert statuses["es"] == "draft"
        assert statuses["fr"] == "draft"
        assert statuses["de"] == "draft"
        assert statuses["it"] == "draft"
    finally:
        db.close()


def test_validated_norms_promote_the_language_to_validated():
    db = _TestSession()
    try:
        code = f"{PREFIX}-NORM"
        db.add(models.Instrument(code=code, response_scale_min=1, response_scale_max=4))
        db.add(models.QuestionnaireItem(
            instrument_code=code, item_number=1, factor_code="C1", text_en="english item",
        ))
        db.add(models.NormThreshold(
            instrument_code=code, locale="en", factor_code="C1",
            raw_min=0, raw_max=10, stanine=5, status="validated",
        ))
        db.commit()

        derive_instrument_versions(db)
        assert cvs.status_map(db, "instrument", code)["en"] == "validated"
    finally:
        db.close()


def test_derivation_never_overwrites_an_existing_row():
    db = _TestSession()
    try:
        code = f"{PREFIX}-KEEP"
        db.add(models.Instrument(code=code, response_scale_min=1, response_scale_max=4))
        db.add(models.QuestionnaireItem(
            instrument_code=code, item_number=1, factor_code="C1", text_en="english item",
        ))
        db.commit()
        # un admin ha gia' portato l'inglese a reviewed: la derivazione non lo riporta a pilot
        cvs.upsert_version(db, "instrument", code, "en", status="reviewed", approved_by="daniele")

        derive_instrument_versions(db)
        assert cvs.status_map(db, "instrument", code)["en"] == "reviewed"
    finally:
        db.close()


def test_derivation_is_idempotent():
    db = _TestSession()
    try:
        code = f"{PREFIX}-IDEM"
        db.add(models.Instrument(code=code, response_scale_min=1, response_scale_max=4))
        db.add(models.QuestionnaireItem(
            instrument_code=code, item_number=1, factor_code="C1", text_en="english item",
        ))
        db.commit()
        first = derive_instrument_versions(db)
        assert first >= 1
        assert derive_instrument_versions(db) == 0
    finally:
        db.close()


def test_certified_strategies_get_an_italian_registry_row():
    db = _TestSession()
    try:
        slug = f"{PREFIX}-strategia"
        db.add(models.CertifiedStrategy(
            slug=slug, name_it="Ripasso distribuito", description_it="Come si fa",
            status="certified", is_active=True,
        ))
        db.commit()
        derive_strategy_versions(db)
        statuses = cvs.status_map(db, "certified_strategy", slug)
        assert statuses["it"] == "certified"
        # le altre lingue non hanno testo: restano bozza, non nascono certificate
        assert statuses["de"] == "draft"
    finally:
        db.close()


# --- cancello di somministrazione -------------------------------------------

from backend import scoring_service  # noqa: E402


def _instrument_with_english_items(db, code):
    db.add(models.Instrument(code=code, name_en="Test instrument",
                             response_scale_min=1, response_scale_max=4))
    db.add(models.Factor(instrument_code=code, code="C1", label_en="Elaborative",
                         orientation="resource"))
    db.add(models.QuestionnaireItem(instrument_code=code, item_number=1,
                                    factor_code="C1", text_en="english item"))
    db.commit()
    derive_instrument_versions(db)


def test_supported_locales_covers_the_six_app_languages():
    assert set(scoring_service.SUPPORTED_LOCALES) == set(APP_LOCALES)


def test_a_language_without_items_is_refused_with_its_status():
    db = _TestSession()
    try:
        code = f"{PREFIX}-GATE"
        _instrument_with_english_items(db, code)
        try:
            scoring_service.get_rules(db, code, "de")
        except scoring_service.LocaleUnavailable as exc:
            assert exc.status == "draft"
            assert "en" in exc.available
            return
        raise AssertionError("il tedesco senza item non deve essere somministrabile")
    finally:
        db.close()


def test_the_language_that_has_items_is_served():
    db = _TestSession()
    try:
        code = f"{PREFIX}-OK"
        _instrument_with_english_items(db, code)
        rules = scoring_service.get_rules(db, code, "en")
        assert rules["items"][0]["text"] == "english item"
        assert rules["factors"][0]["label"] == "Elaborative"
        assert rules["locale_status"] == "pilot"
    finally:
        db.close()


def test_no_locale_ever_serves_another_language_text():
    db = _TestSession()
    try:
        code = f"{PREFIX}-MIX"
        db.add(models.Instrument(code=code, response_scale_min=1, response_scale_max=4))
        db.add(models.Factor(instrument_code=code, code="C1", label_en="Elaborative"))
        db.add(models.QuestionnaireItem(instrument_code=code, item_number=1,
                                        factor_code="C1",
                                        text_i18n={"en": "english item", "sv": "svenskt item"}))
        db.commit()
        derive_instrument_versions(db)
        en = scoring_service.get_rules(db, code, "en")["items"][0]["text"]
        sv = scoring_service.get_rules(db, code, "sv")["items"][0]["text"]
        assert en != sv, "due lingue non possono servire lo stesso testo"
    finally:
        db.close()


def test_a_locale_outside_the_app_is_a_plain_scoring_error():
    db = _TestSession()
    try:
        code = f"{PREFIX}-PT"
        _instrument_with_english_items(db, code)
        try:
            scoring_service.get_rules(db, code, "pt")
        except scoring_service.LocaleUnavailable:
            raise AssertionError("una lingua inesistente non e' 'non ancora disponibile'")
        except scoring_service.ScoringError:
            return
        raise AssertionError("una lingua fuori dall'app deve essere rifiutata")
    finally:
        db.close()


def test_scoring_refuses_an_unavailable_locale_before_computing():
    db = _TestSession()
    try:
        code = f"{PREFIX}-SCORE"
        _instrument_with_english_items(db, code)
        try:
            scoring_service.compute_profile(db, code, "fr", {1: 3})
        except scoring_service.LocaleUnavailable:
            return
        raise AssertionError("non si calcola un profilo in una lingua non somministrabile")
    finally:
        db.close()


# --- API --------------------------------------------------------------------

def test_registered_routes_cover_the_new_endpoints():
    import backend.main as main_module

    # FastAPI >= 0.138 avvolge i router inclusi in `_IncludedRouter` (lazy), senza
    # path propri: vanno espansi, come fa gia' `_registered_routes` nello smoke.
    paths = set()
    for r in main_module.app.routes:
        if hasattr(r, "original_router"):
            for sub in getattr(r.original_router, "routes", []):
                if getattr(sub, "path", None):
                    paths.add(sub.path)
        elif getattr(r, "path", None):
            paths.add(r.path)

    assert "/instruments" in paths
    assert "/admin/content-versions" in paths
    assert "/admin/content-versions/{version_id}/promote" in paths


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
