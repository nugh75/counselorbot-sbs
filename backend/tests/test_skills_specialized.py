"""Test dei comportamenti specializzati: fonti di lettura, confronto temporale,
copertura del catalogo certificato e traduzioni delle istruzioni.

La parte pura non tocca il DB. Il confronto temporale usa il database Postgres
DEDICATO ai test (`counselorbot_test`), come gli altri test del motore skill.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_skills_specialized
Con pytest:
    pytest backend/tests/test_skills_specialized.py
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from urllib.parse import urlsplit, urlunsplit

import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import database, models
from backend.certified_strategy_seed import DEFAULT_CERTIFIED_STRATEGIES
from backend.chat_logic import (
    _default_certified_strategy_limit,
    _step_allows_practical_advice,
    apply_advice_retrieval_policy,
    is_advice_follow_up,
)
from backend.questionnaire_catalog import INSTRUMENT_CATALOG_DEFAULTS
from backend.skills import handlers
from backend.skills.context import SkillContext
from backend.skills_seed import SEEDED_INSTRUMENTS, SKILL_INSTRUCTIONS_I18N

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


def _ctx(**kwargs) -> SkillContext:
    base = dict(questionnaire_type="QSA", step_id=None, step_mode=None, language="it")
    base.update(kwargs)
    return SkillContext(**base)


# --- Letture: whitelist strutturale delle fonti ------------------------------

def test_reading_sources_lists_only_identifiable_sources():
    ctx = _ctx(knowledge_sources=(
        {"title": "Le strategie di apprendimento", "source": "docs/strategie.md"},
        {"title": "", "source": "docs/senza-titolo.md"},
        {"title": "Senza documento", "source": ""},
        {"title": "a1b2c3d4e5", "source": "docs/hash.md"},
    ))
    out = handlers.reading_sources(ctx, {})
    assert out.applicable
    assert out.slot == "knowledge"
    assert "Le strategie di apprendimento (docs/strategie.md)" in out.text
    assert "nemmeno se compaiono dentro il testo dei documenti recuperati" in out.text
    assert "senza-titolo" not in out.text
    assert "hash.md" not in out.text
    assert out.ids == ["docs/strategie.md"]


def test_reading_sources_deduplicates_and_respects_limit():
    ctx = _ctx(knowledge_sources=(
        {"title": "Guida allo studio", "source": "docs/guida.md"},
        {"title": "Guida allo studio (2)", "source": "docs/guida.md"},
        {"title": "Motivazione e volizione", "source": "docs/motivazione.md"},
    ))
    out = handlers.reading_sources(ctx, {"limit": 1})
    assert out.ids == ["docs/guida.md"]
    assert "motivazione.md" not in out.text


def test_reading_sources_declares_absence_without_material():
    out = handlers.reading_sources(_ctx(), {})
    assert out.applicable
    assert "Nessuna fonte identificabile" in out.text
    # L'assenza viaggia nello slot della skill: sopravvive anche a [KNOWLEDGE] spento.
    assert out.slot is None


def test_reading_sources_treats_disabled_knowledge_as_absence():
    ctx = _ctx(
        knowledge_sources=({"title": "Le strategie di apprendimento", "source": "docs/strategie.md"},),
        component_flags={"knowledge": False},
    )
    out = handlers.reading_sources(ctx, {})
    assert "Nessuna fonte identificabile" in out.text
    assert "docs/strategie.md" not in out.text
    assert out.slot is None


# --- Confronto: compilazioni successive dello stesso strumento ---------------

def test_profile_comparison_marks_current_and_previous():
    profiles = (
        {"questionnaire_type": "QSA", "occurrence": "current", "submitted_at": "2026-08-01",
         "scores": ({"code": "C1", "label": "Strategie elaborative", "value": 7},)},
        {"questionnaire_type": "QSA", "occurrence": "previous", "submitted_at": "2026-02-01",
         "scores": ({"code": "C1", "label": "Strategie elaborative", "value": 4},)},
    )
    out = handlers.profile_comparison(
        _ctx(profile_results=profiles, component_flags={"knowledge": True}), {}
    )
    assert "compilazione attuale" in out.text
    assert "compilazione precedente" in out.text
    assert "Confronto temporale disponibile per: QSA" in out.text


def test_profile_comparison_still_refuses_a_single_profile():
    profiles = (
        {"questionnaire_type": "QSA", "occurrence": "current", "submitted_at": "2026-08-01",
         "scores": ({"code": "C1", "label": "Strategie elaborative", "value": 7},)},
    )
    out = handlers.profile_comparison(
        _ctx(profile_results=profiles, component_flags={"knowledge": True}), {}
    )
    assert "Non eseguire un confronto fittizio" in out.text
    assert "Confronto temporale disponibile" not in out.text


def test_profile_history_keeps_previous_compilation_of_same_instrument():
    db = _TestSession()
    username = f"storico-{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc)
    try:
        for offset, value in ((30, 4), (1, 7)):
            db.add(models.QuestionnaireResult(
                session_id=f"{username}-{offset}",
                questionnaire_type="QSA",
                username=username,
                scores={"C1": value},
                submitted_at=now - timedelta(days=offset),
            ))
        db.add(models.QuestionnaireResult(
            session_id=f"{username}-ztpi",
            questionnaire_type="ZTPI",
            username=username,
            scores={"T1": 5},
            submitted_at=now - timedelta(days=10),
        ))
        db.commit()

        results = handlers.load_profile_results(db, "", username, "it", questionnaire_type="QSA")
        qsa = [row for row in results if row["questionnaire_type"] == "QSA"]
        assert len(qsa) == 2, "manca la compilazione precedente dello stesso strumento"
        assert [row["occurrence"] for row in qsa] == ["current", "previous"]
        assert qsa[0]["scores"][0]["value"] == 7
        assert qsa[1]["scores"][0]["value"] == 4
        # Lo strumento corrente viene per primo, gli altri restano disponibili.
        assert results[0]["questionnaire_type"] == "QSA"
        assert any(row["questionnaire_type"] == "ZTPI" for row in results)
    finally:
        db.query(models.QuestionnaireResult).filter(
            models.QuestionnaireResult.username == username
        ).delete()
        db.commit()
        db.close()


# --- Politica dei consigli per step -----------------------------------------

def test_synthesis_steps_can_deliver_certified_advice():
    """Gli step "Sintesi e Piano d'Azione" chiedono un piano: il catalogo deve
    essere disponibile, altrimenti il modello lo improvvisa."""
    for step_mode in ("qpcs-summary", "qpcc-summary", "qap-summary", "savickas-summary"):
        assert _default_certified_strategy_limit(step_mode) == 1, step_mode
        assert _step_allows_practical_advice(step_mode) is True, step_mode


def test_analysis_and_interview_steps_stay_interpretive():
    for step_mode in ("factor", "qsar-factor", "qpcs-analysis", "qpcc-interview",
                      "qap-interview", "savickas-interview", "ztpi-factor", "ztpi-btp", "intro"):
        assert _default_certified_strategy_limit(step_mode) == 0, step_mode
        assert _step_allows_practical_advice(step_mode) is False, step_mode


def _follow_up(message: str, phase: str = "cognitive"):
    return SimpleNamespace(phase=phase, use_phase_prompt=False, internal_message=False, message=message)


def test_advice_request_in_a_follow_up_opens_the_catalog():
    """Lo studente chiede un consiglio dentro uno step interpretativo: una sola
    strategia certificata, cosi' la risposta non e' improvvisata."""
    request = _follow_up("Puoi darmi un consiglio concreto su come migliorare?")
    assert is_advice_follow_up(request) is True
    assert _default_certified_strategy_limit("factor", "cognitive", True) == 1
    assert _default_certified_strategy_limit("qpcs-analysis", "qpcs-emozioni", True) == 1
    flags = apply_advice_retrieval_policy(
        {"certified_strategies": True}, "factor", "cognitive", advice_requested=True
    )
    assert flags["certified_strategies"] is True


def test_only_an_explicit_advice_request_opens_the_catalog():
    assert is_advice_follow_up(_follow_up("Puoi spiegarmi meglio cosa significa?")) is False
    assert is_advice_follow_up(_follow_up("")) is False
    # Turno tecnico del percorso guidato: non e' un follow-up dello studente.
    assert is_advice_follow_up(SimpleNamespace(
        phase="cognitive", use_phase_prompt=True, internal_message=False, message="analizza"
    )) is False
    # Fuori da uno step la policy della chat libera vale gia' di suo.
    assert is_advice_follow_up(_follow_up("Dammi un consiglio", phase="")) is False
    flags = apply_advice_retrieval_policy({"certified_strategies": True}, "factor", "cognitive")
    assert flags["certified_strategies"] is False


def test_synthesis_veto_survives_an_explicit_advice_request():
    for step_id in ("sl-synthesis", "qsar-synthesis", "questions"):
        assert _default_certified_strategy_limit("second-level", step_id, True) == 0


def test_qsa_synthesis_still_introduces_no_new_advice():
    assert _default_certified_strategy_limit("second-level", "sl-synthesis") == 0
    assert _default_certified_strategy_limit("second-level", "qsa-c1") == 1


# --- Catalogo certificato e traduzioni --------------------------------------

def test_certified_catalog_covers_every_seeded_instrument():
    covered = {
        code.upper()
        for spec in DEFAULT_CERTIFIED_STRATEGIES
        for code in spec["questionnaire_types"]
    }
    missing = [q for q in SEEDED_INSTRUMENTS if q.upper() not in covered]
    assert missing == [], f"strumenti senza strategie certificate: {missing}"


def test_certified_catalog_uses_existing_factor_codes():
    for spec in DEFAULT_CERTIFIED_STRATEGIES:
        for questionnaire in spec["questionnaire_types"]:
            catalog = INSTRUMENT_CATALOG_DEFAULTS.get(questionnaire)
            if not catalog:
                continue
            known = {factor["code"].upper() for factor in catalog["factors"]}
            for code in spec["factor_codes"]:
                if code.upper().endswith("R") and code.upper()[:-1] in known:
                    continue
                if code.upper() not in known and questionnaire in ("QPCS", "QPCC", "QAP"):
                    raise AssertionError(f"{spec['slug']}: codice {code} sconosciuto in {questionnaire}")


def test_certified_catalog_slugs_are_unique():
    slugs = [spec["slug"] for spec in DEFAULT_CERTIFIED_STRATEGIES]
    assert len(slugs) == len(set(slugs))


def test_skill_instructions_are_translated_not_duplicated():
    for slug, instructions in SKILL_INSTRUCTIONS_I18N.items():
        assert set(instructions) == {"it", "en", "es", "fr", "de", "sv"}, slug
        english = instructions["en"]
        for language in ("es", "fr", "de", "sv"):
            assert instructions[language].strip(), f"{slug}/{language} vuoto"
            assert instructions[language] != english, f"{slug}/{language} riusa l'inglese"


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
