"""Offline parity battery over every guided step and response language."""
import re
import json

import pytest
from fastapi import HTTPException

from backend import models, schemas
from backend.ai_service import AIService
from backend.api_models import ChatRequest
from backend.chat_preparation import prepare_chat_turn
from backend.journey_context import SYNTHESIS_STEPS
from backend.model_context import context_profile, fit_context
from backend.prompt_audit import build_prompt_audit, run_prompt_audit_live
from backend.prompt_config import ALL_CONFIG_TEXT_DEFINITIONS
from backend.reasoning_profiles import resolve_plan
from backend.tests.test_smoke import _TestSession, _ensure_guided_steps
from backend.tests.artifact_database import artifact_session


def test_all_steps_and_languages_use_identical_runtime_and_audit_preparation():
    for qtype in ("QSA", "QSAr", "ZTPI", "SAVICKAS", "QPCS", "QPCC", "QAP", "IDEA"):
        _ensure_guided_steps(qtype)
    db = _TestSession()
    try:
        for definition in ALL_CONFIG_TEXT_DEFINITIONS:
            if not db.query(models.Config).filter_by(key=definition["key"]).first():
                db.add(models.Config(key=definition["key"], value=definition["default"]))
        db.flush()
        ai = AIService(db)
        ai.config.update(active_provider="ollama", model_name="test-local", ollama_num_ctx="32768")
        class FixedAI:
            def __new__(cls, _db):
                return ai
        steps = db.query(models.GuidedStep).all()
        # Existing installations may have additional admin-defined interview steps.
        assert len(steps) == 53
        for step in steps:
            for lang in ("it", "en", "es", "fr", "de", "sv"):
                for length in ("short", "medium", "long"):
                    payload = schemas.PromptAuditRequest(
                        questionnaire_type=step.questionnaire_type, phase=step.id,
                        mode=step.system_prompt_mode, use_phase_prompt=True, language=lang,
                        include_knowledge=False, response_length=length,
                        idea_variant="concept", idea_budget=8,
                    )
                    request = ChatRequest(**payload.model_dump())
                    actual = prepare_chat_turn(db, ai, request, "parity", {},
                                               include_retrieval=False, include_history=False,
                                               create_anonymous_code=False)
                    audited = build_prompt_audit(db, payload, ai_service_cls=FixedAI)
                    plan = resolve_plan("test-local", disable_thinking=ai.disable_thinking,
                                        requested_max_tokens=actual.max_tokens, fallback_max_tokens=700)
                    sys, msg, history, _report = fit_context(
                        actual.system_prompt_final, actual.full_message, actual.history,
                        context_profile(ai.config, "ollama", "test-local"), plan.max_tokens,
                    )
                    assert audited["envelope"] == {"system_prompt_final": sys, "full_message": msg, "history": history}, (step.id, lang, length)
                    assert audited["resolved"]["max_tokens"] == actual.max_tokens
                    assert f"Response language: {lang}" in sys
                    if step.questionnaire_type == "QSAr":
                        assert not re.search(r"\b[AC][1-7]\b", actual.components.get("meta_system_prompt", ""))
                    if step.questionnaire_type == "IDEA":
                        assert "Reply with exactly [[AVANZA_STEP]]" not in sys
                        assert '"add_nodes"' in sys and '"add_edges"' in sys
                        assert '"source"' in sys and '"target"' in sys
                        assert "your narrowing question in the same reply, after the block" not in sys
                        assert actual.effective_response_length == length
                        assert actual.max_tokens >= 1456
                    errors = {item["code"] for item in audited["warnings"]}
                    assert not errors & {"qsar_foreign_factors", "idea_linear_navigation", "conflicting_output_counts", "conflicting_language", "unresolved_persona", "unconditional_advice"}, (step.id, lang, errors)
    finally:
        db.rollback()
        db.close()


def test_dry_run_replays_material_and_history_without_writes_or_retrieval(monkeypatch, tmp_path):
    from backend import chat_logic, chat_preparation
    from backend.memory_service import SessionMemory
    memory = SessionMemory(memory_dir=tmp_path)
    memory.record_interaction('captured', user_message='Early example retained', bot_response='A previous reflection', transcript_user='Early example retained')
    before = {path.name: (path.read_bytes(), path.stat().st_mtime_ns) for path in tmp_path.iterdir()}
    monkeypatch.setattr(chat_logic, 'session_memory', memory)
    monkeypatch.setattr(chat_preparation, '_retrieved_context', lambda *args, **kwargs: pytest.fail('dry run must not retrieve'))
    captured = {'knowledge_context': 'Captured source material', 'skills_blocks': {'section': ['Captured operative skill']}}
    with artifact_session() as db:
        ai = AIService(db)
        ai.config.update(active_provider='ollama', model_name='test-local')
        payload = schemas.PromptAuditRequest(session_id='captured', message='Reflect on my example', include_history=True, include_knowledge=True, retrieval_context=captured)
        audited = build_prompt_audit(db, payload, ai_service_cls=lambda _db: ai)
        assert 'Captured source material' in audited['envelope']['system_prompt_final']
        assert 'Captured operative skill' in audited['envelope']['system_prompt_final']
        assert audited['envelope']['history'][0]['content'] == 'Early example retained'
        assert not db.new and not db.dirty
    assert {path.name: (path.read_bytes(), path.stat().st_mtime_ns) for path in tmp_path.iterdir()} == before


def test_live_audit_fallback_receives_original_history(monkeypatch, tmp_path):
    from backend import chat_logic
    from backend.memory_service import SessionMemory
    memory = SessionMemory(memory_dir=tmp_path)
    early = 'EARLY_EVIDENCE ' + 'example ' * 600
    memory.record_interaction('fallback', user_message=early, bot_response='Previous reply', transcript_user=early)
    monkeypatch.setattr(chat_logic, 'session_memory', memory)
    with artifact_session() as db:
        ai = AIService(db)
        ai.config.update(active_provider='ollama', model_name='small', ai_fallback_targets=json.dumps([{'provider':'ollama','model':'large'}]), model_context_profiles=json.dumps({'ollama/small': {'context_tokens':2048}, 'ollama/large':{'context_tokens':16384}}))
        def answer(message, system, model, **kwargs):
            assert model == 'large'
            assert 'EARLY_EVIDENCE' in kwargs['history'][0]['content']
            return 'La tua esperienza offre un esempio concreto da approfondire.'
        ai._providers['ollama']['call'] = answer
        payload = schemas.PromptAuditRequest(session_id='fallback', message='Please reflect', include_history=True, include_knowledge=False)
        result = run_prompt_audit_live(db, payload, ai_service_cls=lambda _db: ai)
        assert result['resolved']['model'] == 'large'
        assert result['resolved']['context_budget']['history_messages_dropped'] == 0
        assert 'EARLY_EVIDENCE' in result['envelope']['history'][0]['content']


def test_only_the_synthesis_opens_on_life_and_work():
    """QSA, QSAr e QPCC chiudevano sul metodo di studio e basta: la prospettiva
    di vita e professione viveva solo in QAP, ZTPI, SAVICKAS e nell'area 5 del
    QPCS. Taccuino e Portfolio erano gia' nell'envelope, ma nessuno chiedeva di
    usarli per collegare un filo al perche' dello studente."""
    for qtype in ("QSA", "QSAr", "QPCS", "QPCC", "QAP", "ZTPI", "SAVICKAS", "IDEA"):
        _ensure_guided_steps(qtype)
    db = _TestSession()
    try:
        for definition in ALL_CONFIG_TEXT_DEFINITIONS:
            if not db.query(models.Config).filter_by(key=definition["key"]).first():
                db.add(models.Config(key=definition["key"], value=definition["default"]))
        db.flush()
        ai = AIService(db)
        ai.config.update(active_provider="ollama", model_name="test-local")
        carried = set()
        for step in db.query(models.GuidedStep).all():
            request = ChatRequest(questionnaire_type=step.questionnaire_type, phase=step.id,
                                  mode=step.system_prompt_mode, use_phase_prompt=True, language="it")
            prepared = prepare_chat_turn(db, ai, request, "perspective", {},
                                         include_retrieval=False, include_history=False,
                                         create_anonymous_code=False)
            is_synthesis = step.id in SYNTHESIS_STEPS or step.system_prompt_mode.endswith("-summary")
            assert ("[PERSPECTIVE]" in prepared.system_prompt_final) == is_synthesis, step.id
            if is_synthesis:
                carried.add(step.id)
        # La chiusura di ogni strumento deve arrivarci: nessuno resta sul metodo.
        # QPCC e QAP portano gli id di fabbrica; in produzione le stesse chiusure
        # si chiamano `qpcc-sintesi`/`qap-sintesi` e rientrano per il suffisso
        # `-summary` del loro mode, non per l'id.
        assert {"sl-synthesis", "qsar-synthesis", "qpcs-sintesi", "qpcc-factors",
                "qap-factors", "ztpi-btp", "savickas-final", "idea-synthesis"} <= carried
    finally:
        db.close()


def test_invalid_phase_is_preview_only():
    with artifact_session() as db:
        payload = schemas.PromptAuditRequest(use_phase_prompt=True, phase='missing-step', include_knowledge=False)
        assert not build_prompt_audit(db, payload)['resolved']['runtime_valid']
        with pytest.raises(HTTPException) as exc:
            run_prompt_audit_live(db, payload)
        assert exc.value.status_code == 400
