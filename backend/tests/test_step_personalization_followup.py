"""Tests for Issue #56: preserving step personalization in follow-up turns."""
import json
from types import SimpleNamespace
import pytest

from backend import models, schemas
from backend.ai_service import AIService
from backend.api_models import ChatRequest
from backend.chat_logic import (
    extract_clean_student_message,
    format_step_continuation_prompt,
    prompt_component_config_key,
)
from backend.chat_preparation import prepare_chat_turn
from backend.model_context import DEFAULT_CONTEXT_LEVELS, fit_context
from backend.prompt_audit import build_prompt_audit
from backend.prompt_variants import variant_key
from backend.tests.test_smoke import _TestSession, _ensure_guided_steps


def test_extract_clean_student_message_unit():
    # Regular message
    assert extract_clean_student_message("Vorrei un consiglio su C1") == "Vorrei un consiglio su C1"
    
    # Message with internal instructions prefix
    raw = (
        'CURRENT STEP INTERNAL INSTRUCTIONS (use them only as guidance; answer the student in language "it"):\n'
        'Analizza il fattore C1.\n\n'
        'STUDENT ANSWER:\n'
        'Non so come organizzarmi con i tempi.'
    )
    assert extract_clean_student_message(raw) == "Non so come organizzarmi con i tempi."
    
    # Memory message takes precedence if provided
    assert extract_clean_student_message(raw, memory_message="Testo pulito") == "Testo pulito"
    
    # Empty / None
    assert extract_clean_student_message(None) == ""
    assert extract_clean_student_message("") == ""


def test_format_step_continuation_prompt_unit():
    assert format_step_continuation_prompt("") == ""
    assert format_step_continuation_prompt("   ") == ""
    continuation = format_step_continuation_prompt("Discuti l'ansia da esame.")
    assert "[CURRENT STEP MANDATE - CONTINUATION]" in continuation
    assert "Discuti l'ansia da esame." in continuation
    assert "Do not regenerate or restart the initial profile analysis" in continuation


@pytest.mark.parametrize("instrument", ["QSA", "QPCC", "SAVICKAS", "ZTPI"])
def test_followup_preserves_step_mandate_and_separates_student_input(instrument):
    _ensure_guided_steps(instrument)
    db = _TestSession()
    try:
        step = (
            db.query(models.GuidedStep)
            .filter(models.GuidedStep.questionnaire_type == instrument)
            .order_by(models.GuidedStep.sort_order.asc())
            .first()
        )
        assert step is not None
        step.prompt = f"Mandato speciale per {instrument} {step.id}"
        db.flush()

        ai = AIService(db)
        ai.config.update(active_provider="ollama", model_name="test-local")

        # 1. Entry turn: use_phase_prompt = True
        entry_req = ChatRequest(
            message="",
            questionnaire_type=instrument,
            phase=step.id,
            mode=step.system_prompt_mode,
            use_phase_prompt=True,
            language="it",
        )
        entry_turn = prepare_chat_turn(
            db, ai, entry_req, f"entry-{instrument}", {},
            include_retrieval=False, include_history=False, create_anonymous_code=False,
        )
        assert f"Mandato speciale per {instrument} {step.id}" in entry_turn.system_prompt_final
        assert "[CURRENT STEP MANDATE - CONTINUATION]" not in entry_turn.system_prompt_final

        # 2. Follow-up turn: use_phase_prompt = False, student reply
        student_reply = "Ho letto l'analisi, ma come faccio a migliorare concretamente?"
        followup_req = ChatRequest(
            message=student_reply,
            questionnaire_type=instrument,
            phase=step.id,
            mode=step.system_prompt_mode,
            use_phase_prompt=False,
            language="it",
            scores_context="C1: 4/9\nC2: 5/9" if instrument == "QSA" else "",
        )
        followup_turn = prepare_chat_turn(
            db, ai, followup_req, f"followup-{instrument}", {},
            include_retrieval=False, include_history=False, create_anonymous_code=False,
        )

        # Continuation prompt is in system prompt
        assert "[CURRENT STEP MANDATE - CONTINUATION]" in followup_turn.system_prompt_final
        assert f"Mandato speciale per {instrument} {step.id}" in followup_turn.system_prompt_final
        assert "Do not regenerate or restart the initial profile analysis" in followup_turn.system_prompt_final

        # Full message has the clean student reply and does not leak step instructions
        assert student_reply in followup_turn.full_message
        assert f"Mandato speciale per {instrument} {step.id}" not in followup_turn.full_message

        # components['step_prompt'] has continuation prompt
        assert followup_turn.components.get("step_prompt", "").startswith("[CURRENT STEP MANDATE - CONTINUATION]")
    finally:
        db.close()


def test_followup_strips_internal_instructions_from_mangled_message():
    _ensure_guided_steps("QPCC")
    db = _TestSession()
    try:
        step = (
            db.query(models.GuidedStep)
            .filter(models.GuidedStep.questionnaire_type == "QPCC")
            .order_by(models.GuidedStep.sort_order.asc())
            .first()
        )
        ai = AIService(db)
        ai.config.update(active_provider="ollama", model_name="test-local")

        mangled = (
            'CURRENT STEP INTERNAL INSTRUCTIONS (use them only as guidance; answer the student in language "it"):\n'
            f'{step.prompt}\n\n'
            'STUDENT ANSWER:\n'
            'Non mi sento a mio agio a parlare in pubblico.'
        )
        req = ChatRequest(
            message=mangled,
            questionnaire_type="QPCC",
            phase=step.id,
            mode=step.system_prompt_mode,
            use_phase_prompt=False,
            language="it",
        )
        turn = prepare_chat_turn(
            db, ai, req, "mangled-test", {},
            include_retrieval=False, include_history=False, create_anonymous_code=False,
        )
        # Student message is extracted and clean
        assert turn.full_message == "Non mi sento a mio agio a parlare in pubblico."
        assert "CURRENT STEP INTERNAL INSTRUCTIONS" not in turn.full_message
        assert "[CURRENT STEP MANDATE - CONTINUATION]" in turn.system_prompt_final
    finally:
        db.close()


def test_followup_respects_component_flags_step_prompt_disabled():
    _ensure_guided_steps("QSA")
    db = _TestSession()
    try:
        step = (
            db.query(models.GuidedStep)
            .filter(models.GuidedStep.questionnaire_type == "QSA")
            .order_by(models.GuidedStep.sort_order.asc())
            .first()
        )
        step.prompt = "Mandato che deve sparire se disabilitato"
        db.flush()

        ai = AIService(db)
        ai.config.update(active_provider="ollama", model_name="test-local")

        req = ChatRequest(
            message="Messaggio studente",
            questionnaire_type="QSA",
            phase=step.id,
            mode=step.system_prompt_mode,
            use_phase_prompt=False,
            language="it",
        )
        turn = prepare_chat_turn(
            db, ai, req, "disabled-step-test", {},
            include_retrieval=False, include_history=False, create_anonymous_code=False,
            component_overrides={"step_prompt": False},
        )
        assert "[CURRENT STEP MANDATE - CONTINUATION]" not in turn.system_prompt_final
        assert "Mandato che deve sparire se disabilitato" not in turn.system_prompt_final
        assert turn.components.get("step_prompt") == ""
    finally:
        db.close()


def test_followup_preserves_admin_customizations_and_variants():
    _ensure_guided_steps("QSA")
    db = _TestSession()
    try:
        step = (
            db.query(models.GuidedStep)
            .filter(models.GuidedStep.questionnaire_type == "QSA")
            .order_by(models.GuidedStep.sort_order.asc())
            .first()
        )
        step.prompt = "PROMPT_BASE_TOTALE"
        db.flush()

        # Admin creates level variants in configs
        v_minimo_key = variant_key(f"guided_step:{step.id}:prompt", "minimo")
        v_ristretto_key = variant_key(f"guided_step:{step.id}:prompt", "ristretto")
        db.add(models.Config(key=v_minimo_key, value="PROMPT_VARIANT_MINIMO"))
        db.add(models.Config(key=v_ristretto_key, value="PROMPT_VARIANT_RISTRETTO"))
        db.flush()

        ai = AIService(db)
        ai.config.update(active_provider="ollama", model_name="test-local")

        req = ChatRequest(
            message="Come posso applicare questa strategia?",
            questionnaire_type="QSA",
            phase=step.id,
            mode=step.system_prompt_mode,
            use_phase_prompt=False,
            language="it",
        )
        turn = prepare_chat_turn(
            db, ai, req, "variants-test", {},
            include_retrieval=False, include_history=False, create_anonymous_code=False,
        )

        # Totale
        assert "PROMPT_BASE_TOTALE" in turn.system_prompt_final
        assert "[CURRENT STEP MANDATE - CONTINUATION]" in turn.system_prompt_final

        # Variants dictionary
        variants = ai.context_data.get("variants", {})
        assert "minimo" in variants
        assert "ristretto" in variants

        # Minimo variant has continuation prompt wrapping the minimal text
        minimo_sys = variants["minimo"]["system"]
        assert "PROMPT_VARIANT_MINIMO" in minimo_sys
        assert "[CURRENT STEP MANDATE - CONTINUATION]" in minimo_sys
        assert variants["minimo"]["components"]["step_prompt"].startswith("[CURRENT STEP MANDATE - CONTINUATION]")

        # Ristretto variant has continuation prompt wrapping the restricted text
        ristretto_sys = variants["ristretto"]["system"]
        assert "PROMPT_VARIANT_RISTRETTO" in ristretto_sys
        assert "[CURRENT STEP MANDATE - CONTINUATION]" in ristretto_sys
    finally:
        db.close()


def test_followup_parity_between_chat_and_prompt_audit():
    _ensure_guided_steps("QSA")
    db = _TestSession()
    try:
        step = (
            db.query(models.GuidedStep)
            .filter(models.GuidedStep.questionnaire_type == "QSA")
            .order_by(models.GuidedStep.sort_order.asc())
            .first()
        )
        ai = AIService(db)
        ai.config.update(active_provider="ollama", model_name="test-local")

        class FixedAI:
            def __new__(cls, _db):
                return ai

        payload = schemas.PromptAuditRequest(
            questionnaire_type="QSA",
            phase=step.id,
            mode=step.system_prompt_mode,
            message="Domanda di follow-up dello studente",
            use_phase_prompt=False,
            language="it",
            include_knowledge=False,
        )
        request = ChatRequest(**payload.model_dump())
        actual = prepare_chat_turn(
            db, ai, request, "followup-parity", {},
            include_retrieval=False, include_history=False, create_anonymous_code=False,
        )
        audited = build_prompt_audit(db, payload, ai_service_cls=FixedAI)

        assert audited["envelope"]["system_prompt_final"] == actual.system_prompt_final
        assert audited["envelope"]["full_message"] == actual.full_message
        assert audited["resolved"]["guided_phase_prompt_key"] == f"guided_step:{step.id}"
    finally:
        db.close()
