"""Passo «Strategie e consigli» sugli impianti esistenti (#749).

Le installazioni gia' popolate ricevono il passo una volta, dopo la sintesi,
senza toccare gli id e l'ordine dei passi che le sessioni in corso usano.
"""
import os
from urllib.parse import urlsplit, urlunsplit

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import database, models, prompt_config
from backend.certified_reading_seed import SEED_CERTIFIED_READINGS, seed_certified_readings
from backend.skills_seed import apply_strategies_step_policy, seed_skills
from backend.strategies_step import (
    STRATEGIES_STEP_MARKER,
    TEST_READINGS_MARKER,
    TEST_CATALOGUE_READING_SLUGS,
    certify_test_readings,
    ensure_strategies_steps,
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
_Session = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
database.Base.metadata.create_all(bind=_engine)


def _clean(db):
    db.query(models.GuidedStep).delete()
    db.query(models.Config).filter(models.Config.key.in_(
        [STRATEGIES_STEP_MARKER, TEST_READINGS_MARKER])).delete(synchronize_session=False)
    db.commit()


def _old_install(db, questionnaire_type, steps):
    """Un impianto creato prima del passo nuovo: gli stessi passi, senza strategie."""
    for step in steps:
        if step["system_prompt_mode"] == prompt_config.STRATEGIES_STEP_MODE:
            continue
        db.add(models.GuidedStep(**{**step, "questionnaire_type": questionnaire_type}))
    db.commit()


def test_existing_installs_get_the_step_after_the_synthesis_once():
    db = _Session()
    try:
        _clean(db)
        _old_install(db, "QSA", prompt_config.DEFAULT_GUIDED_STEPS)
        _old_install(db, "QPCC", prompt_config.DEFAULT_QPCC_GUIDED_STEPS)
        before = {s.id: s.sort_order for s in db.query(models.GuidedStep).all()}

        assert ensure_strategies_steps(db) == 2
        rows = {s.id: s for s in db.query(models.GuidedStep).all()}
        # Le sessioni in corso puntano a id e posizioni che non cambiano.
        assert {k: rows[k].sort_order for k in before} == before
        qsa = rows["sl-strategies"]
        assert qsa.questionnaire_type == "QSA"
        assert qsa.system_prompt_mode == prompt_config.STRATEGIES_STEP_MODE
        assert qsa.sort_order == before["sl-synthesis"] + 1
        assert qsa.label_i18n["en"] == f"{qsa.sort_order}. Strategies and advice"
        assert rows["qpcc-strategie"].sort_order == before["qpcc-sintesi"] + 1
        # Strumenti senza passi non ricevono un passo isolato.
        assert "ztpi-strategies" not in rows

        # Una tantum: se l'admin lo toglie, non torna al riavvio.
        db.delete(rows["sl-strategies"])
        db.commit()
        assert ensure_strategies_steps(db) == 0
        assert db.query(models.GuidedStep).filter_by(id="sl-strategies").first() is None
    finally:
        _clean(db)
        db.close()


def test_test_catalogue_readings_are_certified_once():
    db = _Session()
    try:
        _clean(db)
        seed_certified_readings(db, models)
        slugs = {spec["slug"] for spec in SEED_CERTIFIED_READINGS}
        assert set(TEST_CATALOGUE_READING_SLUGS) <= slugs
        # Una scelta dell'admin precedente resta: una voce disattivata non si riattiva.
        disabled = db.query(models.CertifiedReading).filter_by(slug=TEST_CATALOGUE_READING_SLUGS[0]).one()
        disabled.is_active = False
        db.commit()

        certify_test_readings(db)
        rows = {r.slug: r for r in db.query(models.CertifiedReading).all()}
        for slug in TEST_CATALOGUE_READING_SLUGS:
            assert rows[slug].status == "certified", slug
        assert rows[TEST_CATALOGUE_READING_SLUGS[0]].is_active is False
        others = slugs - set(TEST_CATALOGUE_READING_SLUGS)
        assert all(rows[slug].status == "draft" for slug in others)
        # Fiction and films are outside the test catalogue.
        assert all(rows[slug].kind in {"essay", "article"} for slug in TEST_CATALOGUE_READING_SLUGS)

        rows[TEST_CATALOGUE_READING_SLUGS[1]].status = "draft"
        db.commit()
        assert certify_test_readings(db) == 0
        assert db.query(models.CertifiedReading).filter_by(slug=TEST_CATALOGUE_READING_SLUGS[1]).one().status == "draft"
    finally:
        db.query(models.CertifiedReading).delete()
        _clean(db)
        db.close()


def test_skills_follow_the_strategies_step():
    db = _Session()
    try:
        db.query(models.Config).filter(models.Config.key == "skills_strategies_step_v1").delete()
        db.commit()
        seed_skills(db)
        advice = db.query(models.Skill).filter_by(slug="certified-advice").one()
        advice.conditions = {"intents": ["advice", "guided"]}
        advice.instructions_i18n = {"en": "old"}
        reading = db.query(models.Skill).filter_by(slug="reading-guide").one()
        reading.conditions = {"intents": ["reading"]}
        db.commit()

        assert apply_strategies_step_policy(db) is True
        db.refresh(advice)
        db.refresh(reading)
        assert "strategies" in advice.conditions["intents"]
        assert "strategies" in reading.conditions["intents"]
        assert "second strategy" not in advice.instructions_i18n["en"]
        assert apply_strategies_step_policy(db) is False
    finally:
        db.close()


# --- Il turno preparato: gate, contratto e rinvio --------------------------------

SCORES = "- C1: 2/9\n- C2: 2/9\n- A1: 8/9\n- A2: 7/9"


def _prepare(**fields):
    from backend.ai_service import AIService
    from backend.api_models import ChatRequest
    from backend.chat_logic import _ensure_questionnaire_guided_steps
    from backend.chat_preparation import prepare_chat_turn

    db = _Session()
    try:
        _ensure_questionnaire_guided_steps(db, "QSA")
        ai = AIService(db)
        ai.config.update(active_provider="ollama", model_name="test-local")
        request = ChatRequest(questionnaire_type="QSA", language="it", scores_context=SCORES, **fields)
        return prepare_chat_turn(db, ai, request, "strategies-step", {}, include_retrieval=False,
                                 include_history=False, create_anonymous_code=False)
    finally:
        db.rollback()
        db.close()


def test_factor_step_defers_an_early_strategy_request():
    asked = "Puoi suggerirmi una strategia semplice da usare subito?"
    turn = _prepare(phase="cognitive", mode="factor-qa", message=asked, memory_message=asked)
    system = turn.system_prompt_final
    assert "«Strategie e consigli»" in system
    assert "Introduce no new practical action" in system
    assert "[ADVICE DISTRIBUTION]" not in system
    assert "[CERTIFIED ADVICE]" not in system


def test_strategies_step_opens_strategies_without_a_number():
    turn = _prepare(phase="sl-strategies", mode="strategies", use_phase_prompt=True, message="")
    system = turn.system_prompt_final
    assert "[ADVICE DISTRIBUTION]" in system
    assert "at most ONE new practical" not in system
    assert "approved support strategies" in system
