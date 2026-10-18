"""Tests for F3: Lean Envelope (Envelope snello).

Verifies:
(a) [SESSION NOTES] is positioned at the very tail/coda of the assembled system prompt.
(b) Elimination of contractual redundancies and duplicate blocks in the assembled envelope.
(c) Deactivation of site guide RAG (corpus guida/documenti sito) in guided questionnaire and path chats, preserving certified strategies/readings.
(d) Strict no-bullet rule enforced in interview and guided path contracts and envelope.
"""
import pytest
from backend import models
from backend.ai_service import AIService
from backend.api_models import ChatRequest
from backend.chat_preparation import prepare_chat_turn
from backend.chat_logic import (
    ROLE_BLOCK,
    get_prompt_component_flags,
    is_guided_chat,
    _retrieved_context,
)
from backend.prompt_contract import (
    FACILITATION_SENTINEL,
    SELF_QUESTIONING_SENTINEL,
    turn_contract,
    _facilitation_contract,
    _self_questioning_contract,
    _objective_focus_contract,
)
from backend.tests.test_smoke import _TestSession, _ensure_guided_steps
from backend.prompt_config import ALL_CONFIG_TEXT_DEFINITIONS


@pytest.fixture(scope="module")
def runtime_db():
    for qtype in ("QSA", "QSAr", "QPCS", "QPCC", "QAP", "ZTPI", "SAVICKAS", "IDEA"):
        _ensure_guided_steps(qtype)
    db = _TestSession()
    for definition in ALL_CONFIG_TEXT_DEFINITIONS:
        if not db.query(models.Config).filter_by(key=definition["key"]).first():
            db.add(models.Config(key=definition["key"], value=definition["default"]))
    db.flush()
    ai = AIService(db)
    ai.config.update(active_provider="ollama", model_name="test-local")
    yield db, ai
    db.rollback()
    db.close()


def test_session_notes_positioned_in_tail_of_assembled_envelope(runtime_db):
    db, ai = runtime_db
    # QPCS step area 1
    req = ChatRequest(
        questionnaire_type="QPCS",
        phase="qpcs-area1",
        mode="qpcs-interview",
        use_phase_prompt=False,
        message="Raccontami del mio metodo di studio",
        language="it",
    )
    prepared = prepare_chat_turn(
        db, ai, req, "session-notes-tail", {},
        include_retrieval=False, include_history=False, create_anonymous_code=False,
    )
    final_prompt = prepared.system_prompt_final
    assert "[SESSION NOTES]" in final_prompt
    assert "[TURN CONTRACT]" in final_prompt
    # SESSION NOTES must appear after TURN CONTRACT and after VISIBLE RESPONSE FORMAT
    idx_notes = final_prompt.rfind("[SESSION NOTES]")
    idx_contract = final_prompt.rfind("[TURN CONTRACT]")
    assert idx_notes > idx_contract, "SESSION NOTES must appear after TURN CONTRACT"

    # Must be at the very tail of the prompt
    tail_after_notes = final_prompt[idx_notes:]
    assert "never expose it in prose." in tail_after_notes

    # Also verify that for all context variants, SESSION NOTES is at the end
    variants = ai.context_data.get("variants", {})
    for level, data in variants.items():
        variant_sys = data["system"]
        assert "[SESSION NOTES]" in variant_sys
        assert variant_sys.rfind("[SESSION NOTES]") > variant_sys.rfind("[TURN CONTRACT]")


def test_absence_of_redundancies_and_duplicate_blocks(runtime_db):
    db, ai = runtime_db
    req = ChatRequest(
        questionnaire_type="QSA",
        phase="sl-motivation",
        mode="factor",
        use_phase_prompt=False,
        message="Come posso migliorare la mia perseveranza?",
        language="it",
        scores_context="C1: 5/9\nC2: 6/9\nA5: 3/9",
    )
    prepared = prepare_chat_turn(
        db, ai, req, "dedup-check", {},
        include_retrieval=False, include_history=False, create_anonymous_code=False,
    )
    final_prompt = prepared.system_prompt_final

    # Check that structural sentinels appear at most once
    sentinels = [
        ROLE_BLOCK,
        "[STUDENT]",
        "[GUIDED PATH]",
        "[PROFILE]",
        "[TURN CONTRACT]",
        FACILITATION_SENTINEL,
        SELF_QUESTIONING_SENTINEL,
        "[SESSION NOTES]",
        "[LANGUAGE]",
        "[REGISTER]",
        "[THINKING]",
        "[ORIENTATION]",
        "[VISIBLE RESPONSE FORMAT]",
    ]
    for sentinel in sentinels:
        count = final_prompt.count(sentinel)
        assert count <= 1, f"Sentinel {sentinel} appears {count} times in assembled prompt!"


def test_absence_of_site_guide_rag_chunks_in_guided_chats(runtime_db, monkeypatch):
    db, ai = runtime_db

    # 1. is_guided_chat returns True for guided steps and questionnaire chats
    assert is_guided_chat("QSA", "cognitive") is True
    assert is_guided_chat("QSAr", None) is True
    assert is_guided_chat("QPCS", "qpcs-area1") is True
    assert is_guided_chat("OBIETTIVO_STUDIO", "obbstudio-partenza") is True
    assert is_guided_chat(None, "generic-step") is True
    assert is_guided_chat("GENERIC", None) is False
    assert is_guided_chat("", None) is False
    assert is_guided_chat(None, None) is False

    # 2. get_prompt_component_flags disables site guide RAG flags for guided chats
    qsa_flags = get_prompt_component_flags(db, "QSA", "cognitive")
    assert qsa_flags["rag_competenzestrategiche"] is False
    assert qsa_flags["rag_counselorbot"] is False
    assert qsa_flags["rag_questionari"] is False

    qpcs_flags = get_prompt_component_flags(db, "QPCS", "qpcs-area1")
    assert qpcs_flags["rag_competenzestrategiche"] is False
    assert qpcs_flags["rag_counselorbot"] is False
    assert qpcs_flags["rag_questionari"] is False

    # 3. In guided chats, _retrieved_context does not execute site guide search
    called_site_search = []
    from backend import chat_logic
    monkeypatch.setattr(
        chat_logic.site_rag_index,
        "search",
        lambda *args, **kwargs: called_site_search.append(True) or [{"title": "Site Guide Chunk", "source": "guide"}],
    )

    req = ChatRequest(
        questionnaire_type="QSA",
        phase="sl-motivation",
        message="Cos'è la volizione?",
        language="it",
    )
    retrieved_text, _, _, _, _, _ = _retrieved_context(
        db, "session-rag-check", req, "QSA", "Cos'è la volizione?", ai_service=ai,
    )
    assert len(called_site_search) == 0, "site_rag_index.search must not be called in guided chats"
    assert "Site Guide Chunk" not in retrieved_text


def test_no_bullet_rule_in_interviews_and_guided_contracts():
    # 1. turn_contract includes the explicit no-bullet directive
    contract_text = turn_contract(
        language="it",
        questionnaire_type="QPCS",
        phase="qpcs-area1",
        advice_allowed=False,
    )
    assert "Never use bullet points, numbered lists or itemized options" in contract_text
    assert "fluid, natural prose with at most ONE open question per turn" in contract_text

    # 2. _facilitation_contract includes no-bullet directive
    fac_text = _facilitation_contract("area")
    assert "Never use bullet points or numbered lists: converse in fluid, natural prose with a single open question per turn." in fac_text

    # 3. _self_questioning_contract includes no-bullet directive
    self_q_text = _self_questioning_contract("area")
    assert "Never use bullet points or numbered lists: maintain a fluid conversational dialogue in continuous prose with a single open question." in self_q_text

    # 4. _objective_focus_contract includes no-bullet directive
    obj_text = _objective_focus_contract("OBIETTIVO_STUDIO", "definition")
    assert "Never use bullet points or numbered lists: write in fluid conversational prose." in obj_text
