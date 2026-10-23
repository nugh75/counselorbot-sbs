"""Il materiale verificato delle skill raggiunge il prompt anche senza [KNOWLEDGE].

Regressione: su Idea `_retrieved_context` escludeva tutti i blocchi knowledge
delle skill e l'envelope li recuperava solo con il componente `knowledge`
spento, che per Idea resta acceso; e il cancello non conosceva `[REFERRALS]`.
Il modello riceveva la direttiva «cita solo le fonti elencate» senza le fonti.

DB SQLite in memoria: niente Postgres, niente rete (il motore e' sostituito da
uno stub che restituisce blocchi noti).
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import chat_logic, database, models
from backend.ai_service import AIService
from backend.api_models import ChatRequest
from backend.memory_service import session_memory
from backend.skills import engine as skills_engine

_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
database.Base.metadata.create_all(bind=_engine)
_Session = sessionmaker(bind=_engine, autoflush=False, autocommit=False)

SKILL_BLOCKS = {
    "knowledge": [
        "[RAG]\nblocco generico che deve restare fuori",
        "[CERTIFIED_READINGS]\nCatalogo approvato",
        "[WEB_SOURCES]\n- Immanuel Kant — wikipedia",
        "[REFERRALS]\n- Referente DSA dell'istituto",
    ],
    "directive_tail": ["## Referral and event guidance\nName only the people listed."],
}


def _envelope(db, questionnaire_type, component_flags, knowledge_context="", skills_blocks=SKILL_BLOCKS):
    sid = f"source-markers-{questionnaire_type}-{component_flags.get('knowledge')}"
    session_memory.clear(sid)
    request = ChatRequest(message="a chi mi rivolgo?", questionnaire_type=questionnaire_type, language="it")
    system_final, _, _ = chat_logic.build_context_envelope(
        db, AIService(db), request, sid, {"username": "student"},
        c_persona="", system_prompt="SYS", step_label=None, questionnaire_type=questionnaire_type,
        effective_message="a chi mi rivolgo?", model_scores_context="", message_scores_context="",
        knowledge_context=knowledge_context, component_flags=component_flags,
        skills_blocks=skills_blocks, components={},
    )
    session_memory.clear(sid)
    return system_final


def test_idea_with_default_flags_receives_skill_sources():
    db = _Session()
    try:
        system_final = _envelope(db, "IDEA", {"knowledge": True, "history": False})
    finally:
        db.close()
    assert "[KNOWLEDGE]" in system_final
    for marker in chat_logic.SKILL_SOURCE_MARKERS:
        assert marker in system_final, marker
    assert "[RAG]" not in system_final


def test_referrals_cross_the_gate_when_knowledge_is_off():
    db = _Session()
    try:
        system_final = _envelope(db, "QSA", {"knowledge": False, "history": False})
    finally:
        db.close()
    assert "Referente DSA" in system_final
    assert "[CERTIFIED_READINGS]" in system_final
    assert "[RAG]" not in system_final


def test_sources_are_not_repeated_when_knowledge_is_on():
    db = _Session()
    try:
        knowledge = "\n\n".join(SKILL_BLOCKS["knowledge"])
        system_final = _envelope(db, "QSA", {"knowledge": True, "history": False}, knowledge_context=knowledge)
    finally:
        db.close()
    assert system_final.count("[REFERRALS]") == 1
    assert system_final.count("[KNOWLEDGE]") == 1


def test_idea_turn_end_to_end_keeps_skill_sources(monkeypatch):
    """Dal recupero all'envelope, con i flag che la chat calcola davvero per Idea."""
    db = _Session()
    try:
        for key, value in (("skills_engine_enabled", "true"), ("skills_engine_instruments", '["IDEA"]')):
            db.merge(models.Config(key=key, value=value))
        db.commit()
        monkeypatch.setattr(
            skills_engine, "run_skills",
            lambda ctx, **kw: skills_engine.SkillsResult(blocks=SKILL_BLOCKS),
        )
        flags = chat_logic.get_prompt_component_flags(db, "IDEA", None)
        flags["shared_responses"] = False
        request = ChatRequest(message="a chi mi rivolgo?", questionnaire_type="IDEA", language="it")
        knowledge_context, _, _, skills_blocks, _, _ = chat_logic._retrieved_context(
            db, "source-markers-e2e", request, "IDEA", "query", component_flags=flags,
        )
        system_final = _envelope(db, "IDEA", flags, knowledge_context=knowledge_context, skills_blocks=skills_blocks)
    finally:
        db.close()
    assert "Referente DSA" in system_final
    assert "[WEB_SOURCES]" in system_final
    assert "[RAG]" not in system_final
