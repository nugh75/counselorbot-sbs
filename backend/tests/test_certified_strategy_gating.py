"""Test del gating del catalogo `certified_strategies` e della copertura del seme.

Parte pura (copertura per fattore, stato dichiarato) piu' il recupero su database
Postgres DEDICATO ai test (`counselorbot_test`).

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_certified_strategy_gating
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import uuid
from collections import Counter
from urllib.parse import urlsplit, urlunsplit

import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import database, models
from backend.certified_strategy_seed import (
    DEFAULT_CERTIFIED_STRATEGIES,
    seed_certified_strategies,
)
from backend.certified_strategy_service import certified_strategy_memory
from backend.content_versions_seed import derive_strategy_versions

TEST_DB_NAME = "counselorbot_test"
_prod = urlsplit(os.environ["DATABASE_URL"])
_test_url = urlunsplit((_prod.scheme, _prod.netloc, f"/{TEST_DB_NAME}", _prod.query, _prod.fragment))
_admin_url = urlunsplit((_prod.scheme, _prod.netloc, "/postgres", _prod.query, _prod.fragment))

# Fattori degli strumenti che avevano un solo consiglio ciascuno: e' la copertura
# che questo modulo sorveglia perche' non torni a scendere.
THIN_INSTRUMENT_FACTORS = {
    "QPCS": ["S1", "S2", "S3", "S4", "S5"],
    "QPCC": ["K1", "K2", "K3", "K4", "K5"],
    "QAP": ["AD1", "AD2", "AD3", "AD4"],
    "ZTPI": ["T1", "T2", "T3", "T4", "T5"],
}
MIN_STRATEGIES_PER_FACTOR = 3


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

# Il modulo e' eseguibile anche dopo le altre suite sullo stesso DB dedicato.
with _TestSession() as _cleanup_db:
    _cleanup_db.query(models.ContentLanguageVersion).filter(
        models.ContentLanguageVersion.content_type == "certified_strategy"
    ).delete(synchronize_session=False)
    _cleanup_db.query(models.CertifiedStrategy).delete(synchronize_session=False)
    _cleanup_db.commit()

PREFIX = f"t{uuid.uuid4().hex[:6]}"


def _reset(db):
    db.query(models.ContentLanguageVersion).filter(
        models.ContentLanguageVersion.content_type == "certified_strategy"
    ).delete(synchronize_session=False)
    db.query(models.CertifiedStrategy).delete(synchronize_session=False)
    db.commit()
    db.close()


def _strategy(db, slug, **kwargs):
    data = dict(
        slug=f"{PREFIX}-{slug}",
        name_it=f"Nome {slug}",
        recommended_when_it="Quando serve.",
        description_it="Che cosa fare, in concreto.",
        factor_codes=["T2"],
        questionnaire_types=["ZTPI"],
        keywords="",
        match_mode="any",
        status="certified",
        is_active=True,
        sort_order=0,
    )
    data.update(kwargs)
    row = models.CertifiedStrategy(**data)
    db.add(row)
    db.commit()
    # Senza una versione di contenuto servita, `served_locale` non restituisce
    # alcuna lingua e la voce esce dal recupero con i testi vuoti.
    derive_strategy_versions(db)
    return row


# --- copertura del seme ------------------------------------------------------

def test_every_thin_instrument_factor_has_enough_strategies():
    counts = Counter()
    for spec in DEFAULT_CERTIFIED_STRATEGIES:
        for code in spec.get("factor_codes") or []:
            counts[str(code).upper()] += 1
    for instrument, codes in THIN_INSTRUMENT_FACTORS.items():
        for code in codes:
            assert counts[code] >= MIN_STRATEGIES_PER_FACTOR, (
                f"{instrument}/{code}: {counts[code]} strategie, "
                f"minimo {MIN_STRATEGIES_PER_FACTOR}"
            )


def test_no_seeded_strategy_is_a_global_wildcard():
    for spec in DEFAULT_CERTIFIED_STRATEGIES:
        assert (spec.get("factor_codes") or spec.get("questionnaire_types")), (
            f"{spec['slug']} non dichiara ne' fattori ne' strumento: entrerebbe ovunque"
        )


def test_seed_honours_the_status_declared_by_a_spec():
    db = _TestSession()
    try:
        seed_certified_strategies(db, models)
        drafts = {
            spec["slug"] for spec in DEFAULT_CERTIFIED_STRATEGIES
            if spec.get("status") == "draft"
        }
        assert drafts, "il seme non contiene bozze: il test non verifica nulla"
        rows = (
            db.query(models.CertifiedStrategy)
            .filter(models.CertifiedStrategy.slug.in_(drafts))
            .all()
        )
        assert {row.slug for row in rows} == drafts
        assert {row.status for row in rows} == {"draft"}
        # Le voci storiche restano certificate: lo stato di default non cambia.
        historical = db.query(models.CertifiedStrategy).filter(
            models.CertifiedStrategy.slug == "qsa-elaborative-links"
        ).one()
        assert historical.status == "certified"
    finally:
        _reset(db)


# --- gating ------------------------------------------------------------------

def test_a_strategy_without_codes_and_without_scope_never_enters():
    db = _TestSession()
    try:
        _strategy(db, "jolly", factor_codes=[], questionnaire_types=[])
        out = certified_strategy_memory.retrieve(
            db, "ZTPI", scores_context="T2 8/9", query="il passato mi da' forza")
        assert out == []
    finally:
        _reset(db)


def test_a_strategy_without_codes_but_scoped_to_an_instrument_enters():
    db = _TestSession()
    try:
        _strategy(db, "narrativa", factor_codes=[], questionnaire_types=["SAVICKAS"])
        out = certified_strategy_memory.retrieve(
            db, "SAVICKAS", query="raccontami un ricordo di infanzia")
        assert [entry["id"] for entry in out] == [f"{PREFIX}-narrativa"]
    finally:
        _reset(db)


def test_a_factor_match_still_lets_a_strategy_through():
    db = _TestSession()
    try:
        _strategy(db, "passato-positivo")
        out = certified_strategy_memory.retrieve(
            db, "ZTPI", scores_context="T2 8/9", query="ricordi belli")
        assert [entry["id"] for entry in out] == [f"{PREFIX}-passato-positivo"]
    finally:
        _reset(db)


def test_a_scoped_strategy_stays_out_of_another_instrument():
    db = _TestSession()
    try:
        _strategy(db, "solo-ztpi")
        out = certified_strategy_memory.retrieve(
            db, "QSA", scores_context="T2 8/9", query="ricordi belli")
        assert out == []
    finally:
        _reset(db)


# --- provenienza --------------------------------------------------------------

def test_a_retrieved_strategy_says_which_factor_opened_the_gate():
    db = _TestSession()
    try:
        _strategy(db, "provenienza")
        out = certified_strategy_memory.retrieve(
            db, "ZTPI", scores_context="T2 8/9", query="ricordi belli")
        assert out[0]["matched_on"] == ["T2"]
    finally:
        _reset(db)


def test_a_scoped_strategy_without_codes_says_the_instrument():
    db = _TestSession()
    try:
        _strategy(db, "narrativa2", factor_codes=[], questionnaire_types=["SAVICKAS"])
        out = certified_strategy_memory.retrieve(db, "SAVICKAS", query="un ricordo")
        assert out[0]["matched_on"] == ["scope:SAVICKAS"]
    finally:
        _reset(db)


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
