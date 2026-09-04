"""Contratto di rollout del motore skill per il blocco strategie.

Test su DB Postgres DEDICATO (`counselorbot_test`, stessa istanza dell'app):
costruisce una strategia certificata, poi confronta l'output di
`_retrieved_context` con `skills_engine_enabled` spento e acceso. Il percorso
nuovo deve conservare la strategia certificata ed escludere la fonte approvata.

Il RAG e' disattivato dai component flags, cosi' il test non tocca la rete.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_skills_parity
Con pytest:
    pytest backend/tests/test_skills_parity.py
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import json
import uuid
from urllib.parse import urlsplit, urlunsplit

import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import database, models
from backend.api_models import ChatRequest
from backend.chat_logic import _retrieved_context
from backend.skills_seed import seed_skills
from backend.strategy_memory import APPROVED_STRATEGIES_CONFIG_KEY
from backend.content_versions_seed import derive_strategy_versions

# --- DB Postgres dedicato ai test (stessa istanza, db separato) ---
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
database.Base.metadata.drop_all(bind=_engine)
database.Base.metadata.create_all(bind=_engine)

NO_RAG_FLAGS = {
    "rag_competenzestrategiche": False,
    "rag_counselorbot": False,
    "rag_questionari": False,
    "approved_strategies": True,
    "certified_strategies": True,
    "shared_responses": False,
    "allowed_strategies": None,
}

SCORES = "C6: 8/9\nA2: 2/9"


def _set_config(db, key: str, value: str) -> None:
    row = db.query(models.Config).filter(models.Config.key == key).first()
    if row is None:
        db.add(models.Config(key=key, value=value))
    else:
        row.value = value
    db.commit()


# Il percorso storico legge le strategie approvate dalla config, non dai
# certificati. Il test le semina da se': dipendere da `test_smoke`, che le
# scrive dentro un proprio test, faceva passare questo file solo quando la
# suite girava intera e in quell'ordine.
APPROVED_MARKDOWN = """# Strategie condivise

## parity-approved-c6
- status: approved
- questionnaires: QSA
- keywords: organizzazione studio tempo
- text.it: Dividi lo studio in blocchi e fissane l'ordine la sera prima.
"""


def _ensure_approved(db) -> None:
    _set_config(db, APPROVED_STRATEGIES_CONFIG_KEY, APPROVED_MARKDOWN)


def _ensure_certified(db) -> None:
    if db.query(models.CertifiedStrategy).filter(models.CertifiedStrategy.slug == "parity-c6").first():
        return
    db.add(models.CertifiedStrategy(
        slug="parity-c6",
        name_it="Organizzare lo studio",
        recommended_when_it="Utile quando C6 e' un'area di crescita",
        description_it="Dividi il materiale in blocchi da 25 minuti.",
        factor_codes=["C6"], match_mode="any", questionnaire_types=["QSA"],
        keywords="organizzazione studio tempo", status="certified", sort_order=1, is_active=True,
    ))
    db.commit()
    # Le strategie sono fail-closed per lingua: senza le righe di
    # `content_language_versions` l'italiano non viene servito e il recupero
    # torna vuoto.
    derive_strategy_versions(db)


def _request() -> ChatRequest:
    return ChatRequest(
        message="Come faccio a organizzarmi meglio?",
        session_id=f"parity-{uuid.uuid4().hex[:8]}",
        phase=None,
        language="it",
        scores_context=SCORES,
    )


def _run(db) -> tuple:
    return _retrieved_context(
        db,
        session_id="parity-session",
        request=_request(),
        questionnaire_type="QSA",
        query="organizzazione dello studio",
        ai_service=None,
        certified_strategy_limit=2,
        component_flags=dict(NO_RAG_FLAGS),
    )


def test_engine_on_uses_certified_advice_only():
    db = _TestSession()
    try:
        _ensure_certified(db)
        _ensure_approved(db)
        seed_skills(db)

        _set_config(db, "skills_engine_enabled", "false")
        off_text, off_strategy_ids, off_certified_ids, _off_blocks, _off_readings, _off_meta = _run(db)

        _set_config(db, "skills_engine_enabled", "true")
        _set_config(db, "skills_engine_instruments", json.dumps(["QSA"]))
        on_text, on_strategy_ids, on_certified_ids, on_blocks, _on_readings, _on_meta = _run(db)

        assert off_strategy_ids, "setup: il percorso storico non contiene strategie approvate"
        assert on_strategy_ids == []
        assert on_certified_ids == off_certified_ids
        assert on_certified_ids, "nessuna strategia certificata recuperata: test cieco"
        assert "## Strategie di supporto approvate" in off_text
        assert "## Strategie di supporto approvate" not in on_text
        assert "## Student advice contract" in "\n".join(
            on_blocks["directive_tail"]
        )
        assert "[CERTIFIED_STRATEGIES]" in on_text
    finally:
        _set_config(db, "skills_engine_enabled", "false")
        _set_config(db, "skills_engine_instruments", "[]")
        db.close()


def test_engine_off_for_unlisted_instrument():
    db = _TestSession()
    try:
        seed_skills(db)
        _set_config(db, "skills_engine_enabled", "true")
        _set_config(db, "skills_engine_instruments", json.dumps(["ZTPI"]))
        from backend.skills import engine
        assert engine.enabled(db, "QSA") is False
        assert engine.enabled(db, "ZTPI") is True
    finally:
        _set_config(db, "skills_engine_enabled", "false")
        _set_config(db, "skills_engine_instruments", "[]")
        db.close()


def test_disabled_binding_removes_only_its_block():
    db = _TestSession()
    try:
        _ensure_certified(db)
        seed_skills(db)
        _set_config(db, "skills_engine_enabled", "true")
        _set_config(db, "skills_engine_instruments", json.dumps(["QSA"]))

        full_text, _, full_certified_ids, _full_blocks, _full_readings, _full_meta = _run(db)
        assert full_certified_ids, "setup: nessuna strategia certificata"

        skill = db.query(models.Skill).filter(models.Skill.slug == "certified-advice").first()
        binding = (
            db.query(models.GuidedStepSkill)
            .filter(models.GuidedStepSkill.skill_id == skill.id,
                    models.GuidedStepSkill.questionnaire_type == "QSA")
            .first()
        )
        binding.enabled = False
        db.commit()
        try:
            reduced_text, _, reduced_certified_ids, _reduced_blocks, _reduced_readings, _reduced_meta = _run(db)
        finally:
            binding.enabled = True
            db.commit()

        assert reduced_certified_ids == []
        assert len(reduced_text) < len(full_text)
        assert "[CERTIFIED_STRATEGIES]" not in reduced_text
    finally:
        _set_config(db, "skills_engine_enabled", "false")
        _set_config(db, "skills_engine_instruments", "[]")
        db.close()


def test_idea_is_bound_to_sources_like_the_other_instruments():
    """Idea non deve perdere le fonti: web-lookup e reading-guide valgono
    anche li', come per gli altri strumenti (regressione: il seed le legava
    solo ai sette strumenti storici, lasciando Idea senza ricerche)."""
    db = _TestSession()
    try:
        seed_skills(db)
        skill_ids = {
            slug: db.query(models.Skill).filter(models.Skill.slug == slug).first().id
            for slug in ("web-lookup", "reading-guide")
        }
        for slug, skill_id in skill_ids.items():
            for questionnaire_type in ("IDEA", "QSA"):
                binding = (
                    db.query(models.GuidedStepSkill)
                    .filter(models.GuidedStepSkill.skill_id == skill_id,
                            models.GuidedStepSkill.questionnaire_type == questionnaire_type,
                            models.GuidedStepSkill.step_id == "*")
                    .first()
                )
                assert binding is not None and binding.enabled, (
                    f"{slug} non agganciata a {questionnaire_type}"
                )
    finally:
        db.close()


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"ok   {t.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {t.__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
