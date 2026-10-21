"""Real synthetic envelopes and public payloads, never a paid model/replayed user.

These tests establish instruction delivery and navigation permissions. They do
not claim that a live LLM follows the boundary or that production texts were read.
"""
import asyncio
from types import SimpleNamespace

import pytest

from backend import models, prompt_config, schemas
from backend.ai_service import AIService
from backend.api_models import ChatRequest
from backend.chat_preparation import prepare_chat_turn
from backend.model_context import fit_context
from backend.prompt_audit import build_prompt_audit
from backend.prompt_contract import _facilitation_contract, _self_questioning_contract
from backend.prompt_variants import variant_key
from backend.qsa_essential import directive
from backend.questionnaire_description import SENTINEL, public_suggestions
from backend.tests.artifact_database import artifact_session

PATHS = [getattr(prompt_config, name) for name in (
    'DEFAULT_GUIDED_STEPS', 'DEFAULT_QSAR_GUIDED_STEPS', 'DEFAULT_ZTPI_GUIDED_STEPS',
    'DEFAULT_QPCS_GUIDED_STEPS', 'DEFAULT_QPCC_GUIDED_STEPS', 'DEFAULT_QAP_GUIDED_STEPS',
    'DEFAULT_SAVICKAS_GUIDED_STEPS', 'DEFAULT_EVENTO_STUDIO_GUIDED_STEPS',
    'DEFAULT_EVENTO_PROFESSIONALE_GUIDED_STEPS', 'DEFAULT_OBIETTIVO_STUDIO_GUIDED_STEPS',
    'DEFAULT_OBIETTIVO_DOCENZA_GUIDED_STEPS', 'DEFAULT_IDEA_GUIDED_STEPS',
)]
STEPS = {step['id']: step for path in PATHS for step in path}
# Expected scope comes from the agreed path audit, not the production classifier.
READINGS = ['cognitive', 'affective', 'qsar-cognitive', 'qsar-affective',
            'ztpi-t1', 'ztpi-t2', 'ztpi-t3', 'ztpi-t4', 'ztpi-t5', 'ztpi-btp',
            'qpcs-profilo', 'qpcc-profilo', 'qap-profilo', 'qsa-essential-focus']
NEXT = ['sl-elaboration', 'qsar-processing', 'qpcs-emozioni',
        'qpcc-comunicazione', 'qap-preoccupazione']
LANGUAGES = ['it', 'en', 'es', 'fr', 'de', 'sv']
SCORES = {
    'QSA': 'C1: 7/9\nC3: 8/9\nA1: 2/9',
    'QSAr': 'C1r: 7/9\nC2r: 8/9\nA1r: 2/9',
    'ZTPI': 'T1: 2.5\nT2: 3.5\nT3: 3.0\nT4: 2.0\nT5: 4.0',
    'QPCS': 'S1: 3/9\nS2: 7/9\nS3: 5/9\nS4: 6/9\nS5: 4/9',
    'QPCC': '\n'.join(f'{code}: {index % 9 + 1}/9' for index, code in enumerate(
        ['A1', 'A2', 'A3', 'V1', 'V2', 'C1', 'C2', 'M1', 'M2', 'M3'])),
    'QAP': 'AD1: 7/9\nAD2: 3/9\nAD3: 5/9\nAD4: 6/9',
}


@pytest.fixture(scope='module')
def runtime():
    with artifact_session() as db:
        db.add_all(models.GuidedStep(**step) for step in STEPS.values())
        db.flush()
        ai = AIService(db)
        ai.config.update(active_provider='ollama', model_name='synthetic-no-model')
        for level in ('ristretto', 'minimo'):
            ai.config[variant_key('prompt_generic', level)] = 'ADMIN variant: ask about habits.'
        yield db, ai


@pytest.fixture(autouse=True)
def forbid_generation(monkeypatch):
    monkeypatch.setattr(AIService, 'get_response', lambda *a, **kw:
                        pytest.fail('These checks must not call a model'))


def request(phase, *, entry=False, language='it', message='', **kwargs):
    if phase.startswith('qsa-essential-'):
        kwargs.setdefault('guided_path', 'essential')
    step = STEPS.get(phase, {'questionnaire_type': 'QSA', 'system_prompt_mode': 'generic'})
    return ChatRequest(questionnaire_type=step['questionnaire_type'], phase=phase,
        mode=step['system_prompt_mode'] if entry else 'generic', use_phase_prompt=entry,
        language=language, message=message, scores_context=SCORES.get(step['questionnaire_type'], ''),
        **kwargs)


def prepare(runtime, req, flag=True, **kwargs):
    db, ai = runtime
    return prepare_chat_turn(db, ai, req, 'description-synthetic', {},
        config_overrides={'facilitation_contract_enabled': str(flag).lower()},
        include_retrieval=False, include_history=False, create_anonymous_code=False,
        allow_generation=False, **kwargs)


@pytest.mark.parametrize('phase', READINGS)
@pytest.mark.parametrize('language', LANGUAGES)
@pytest.mark.parametrize('flag', [True, False])
def test_entry_and_repeated_clarifications_keep_description_in_all_contexts(runtime, phase, language, flag):
    for entry, message in [(True, ''), (False, 'Che cosa misura questo fattore?'),
                           (False, 'Puoi spiegare meglio la differenza tra queste scale?')]:
        result = prepare(runtime, request(phase, entry=entry, language=language, message=message), flag)
        contract = result.components['turn_contract']
        assert SENTINEL in contract
        assert 'no mandatory closing question' in contract
        assert 'Ask a clarification question ONLY when useful' in contract
        assert 'Do not ask whether they recognise themselves' in contract
        assert 'without answering any personal or comprehension question' in contract
        assert 'Explore the student\'s concrete actions' not in contract
        assert 'Offer this invitation once' not in contract
        assert not result.hypothesis_allowed
        assert f'Response language: {language}' in result.system_prompt_final
        assert result.system_prompt_final.count(SENTINEL + "\n") == 1
        for level in ('totale', 'ristretto', 'minimo'):
            system = (result.system_prompt_final if level == 'totale' else
                      runtime[1].context_data['variants'][level]['system'])
            fitted, _, _, _ = fit_context(system, result.full_message, [],
                {'context_tokens': 32768, 'compact': True}, 1000)
            assert contract in fitted
        assert not runtime[0].new and not runtime[0].dirty


@pytest.mark.parametrize('phase', NEXT)
@pytest.mark.parametrize('flag', [True, False])
def test_subsequent_areas_still_support_personal_inquiry(runtime, phase, flag):
    result = prepare(runtime, request(phase, message='Vorrei capire come scelgo di agire.'), flag)
    contract = result.components['turn_contract']
    assert SENTINEL not in contract
    expected = ('Explore the student\'s concrete actions' if flag else
                'explore an experience and the person\'s interpretation')
    assert expected in contract


def test_ztpi_personal_followup_and_essential_boundary_use_existing_steps(runtime):
    req = ChatRequest(questionnaire_type='ZTPI', phase='questions', message='Vorrei riflettere sulle mie scelte.')
    assert SENTINEL not in prepare(runtime, req).system_prompt_final
    for entry in (True, False):
        result = prepare(runtime, request('qsa-essential-focus', entry=entry, guided_path='essential'))
        assert SENTINEL in result.system_prompt_final
        assert 'No personal focus, answer or comprehension question is required' in directive(
            'qsa-essential-focus', entry=False)
        assert 'Ask the person to choose' not in result.components['turn_contract']
        experience = prepare(runtime, request('qsa-essential-experience', entry=entry, guided_path='essential'))
        assert SENTINEL not in experience.system_prompt_final
        assert 'invite them to choose one aspect' in directive('qsa-essential-experience', entry=True)
    # First response keeps the existing no-marker opening rule; later closure needs no personal answer.
    assert 'Do not emit [[AVANZA_STEP]]' in directive('qsa-essential-focus', entry=True)


@pytest.mark.parametrize('phase', ['savickas-r1', 'evstudio-racconto', 'evprof-racconto',
    'obbstudio-partenza', 'obbdocenza-partenza', 'idea-statement'])
def test_narrative_paths_do_not_receive_the_questionnaire_boundary(runtime, phase):
    # Select actual IDs from the corresponding instrument if its interview ID differs.
    if phase not in STEPS:
        prefix = phase.split('-')[0] + '-'
        phase = next(key for key in STEPS if key.startswith(prefix) and 'intro' not in key)
    assert SENTINEL not in prepare(runtime, request(phase)).system_prompt_final


@pytest.mark.parametrize('phase', ['cognitive', 'qsar-cognitive', 'ztpi-t1', 'qpcs-profilo', 'qpcc-profilo', 'qap-profilo'])
def test_audit_lab_and_continued_reply_share_runtime_boundary(runtime, phase):
    from backend.prompt_lab.context_comparison import render_case
    req = request(phase, message='Come si legge questa scala?', partial_response='Il fattore indica')
    result = prepare(runtime, req)
    db, ai = runtime
    audit = build_prompt_audit(db, schemas.PromptAuditRequest(
        questionnaire_type=req.questionnaire_type, phase=phase, mode='generic',
        message=req.message, scores_context=req.scores_context, include_knowledge=False,
        include_history=False), ai_service_cls=lambda _db: ai)
    assert result.components['turn_contract'] in audit['envelope']['system_prompt_final']
    lab = render_case(db, db.get(models.GuidedStep, phase))
    assert SENTINEL in lab['system']
    assert result.components['turn_contract'] in lab['system']


@pytest.mark.parametrize('language', LANGUAGES)
@pytest.mark.parametrize('qtype', ['QSA', 'QSAr', 'ZTPI', 'QPCS', 'QPCC', 'QAP'])
def test_public_payload_is_safe_on_populated_db_without_mutating_admin_rows(runtime, language, qtype):
    from backend.routes.chat import get_guided_ui_texts
    from backend.routes.guided_step_questions import list_guided_step_questions
    db, _ = runtime
    reading = next(key for key in READINGS if key in STEPS and STEPS[key]['questionnaire_type'] == qtype)
    next_step = next((key for key in NEXT if STEPS[key]['questionnaire_type'] == qtype), 'questions')
    rows = [models.GuidedStepQuestion(questionnaire_type=qtype, step_id=phase,
            language=language, text=text, sort_order=index, is_active=True)
            for index, (phase, text) in enumerate([
                (reading, 'ADMIN: Mi riconosco in…'),
                (reading, 'ADMIN: Che cosa significa questa scala?'),
                (next_step, 'ADMIN: Vorrei raccontare la mia esperienza…')])]
    db.add_all(rows)
    db.flush()
    before = [(row.id, row.text) for row in rows]
    try:
        payload = asyncio.run(get_guided_ui_texts(qtype, language, db))
        by_id = {step['id']: step['suggested_questions'] for step in payload['guided_steps']}
        assert len(by_id[reading]) == 3
        assert not any('ADMIN' in text for text in by_id[reading])
        assert rows[-1].text in (payload['fixed_phase_questions'] if next_step == 'questions' else by_id[next_step])
        admin = asyncio.run(list_guided_step_questions({}, db))
        assert all((row.id, row.text) in [(item.id, item.text) for item in admin] for row in rows)
        assert before == [(db.get(models.GuidedStepQuestion, row.id).id,
                           db.get(models.GuidedStepQuestion, row.id).text) for row in rows]
    finally:
        for row in rows:
            db.delete(row)
        db.flush()


def test_custom_description_modes_and_legacy_ids_keep_scope_without_narrative_leak():
    for qtype, mode in [('QSA', 'factor'), ('QSAr', 'qsar-factor'), ('ZTPI', 'ztpi-factor'),
                         ('QPCS', 'qpcs-factor'), ('QPCC', 'qpcc-factor'), ('QAP', 'qap-factor')]:
        step = SimpleNamespace(questionnaire_type=qtype, id='custom-reading', system_prompt_mode=mode)
        assert public_suggestions(step, 'en', ['Personal custom question']) != ['Personal custom question']
    step = SimpleNamespace(questionnaire_type='SAVICKAS', id='custom-reading', system_prompt_mode='factor')
    assert public_suggestions(step, 'en', ['Personal custom question']) == ['Personal custom question']


def test_both_wording_contracts_delegate_to_the_same_boundary():
    for contract in (_facilitation_contract('profile', thread_state='introduced'),
                     _self_questioning_contract('profile')):
        assert 'Do not ask whether they recognise themselves' in contract
        assert 'The topic has just opened: explore what the student does' not in contract


@pytest.mark.parametrize('phase', READINGS)
def test_chosen_depth_stays_with_comprehension_in_a_separate_branch(runtime, phase):
    result = prepare(runtime, request(phase, guided_path='essential' if phase.startswith('qsa-essential') else 'complete',
        message='Approfondiamo il significato della scala.', supports_explorations=True,
        exploration={'id': 'meaning-branch', 'title': 'Significato della scala',
                     'origin_phase': phase, 'origin_label': 'Lettura'}))
    assert SENTINEL in result.system_prompt_final
    assert 'Optional depth here means understanding factors or scores' in result.system_prompt_final
    assert '[GUIDED EXPLORATION]' in result.system_prompt_final
    assert not result.hypothesis_allowed


def test_factory_alignment_is_explicit_reviewed_and_preserves_admin_text():
    import json
    from pathlib import Path
    from backend import prompt_factory_alignment, prompt_revisions
    previous = json.loads((Path(__file__).parent /
        'fixtures/questionnaire-description-previous-prompts.json').read_text())
    with artifact_session() as db:
        for key, value in previous['configs'].items():
            db.add(models.Config(key=key, value=value))
        for key, value in previous['steps'].items():
            db.add(models.GuidedStep(**{**STEPS[key], 'prompt': value}))
        custom = models.Config(key='prompt_generic', value='ADMIN: ask about personal priorities.')
        db.add(custom)
        db.flush()
        # Even exact legacy text is admin-owned when the last revision says so.
        key = 'prompt_factor_qa'
        row = db.get(models.Config, key)
        assert row is not None
        prompt_revisions.record(db, scope='config', target_key=key, value=row.value,
                                origin=prompt_revisions.ORIGIN_ADMIN, author='synthetic-admin')
        db.commit()
        plan = prompt_factory_alignment.make_plan(db)
        expected = set(previous['configs']) | set(previous['steps'])
        assert {change['key'] for change in plan['changes']} == expected - {key}
        assert {item['key'] for item in plan['preserved']} == {key, custom.key}
        assert all(db.get(models.Config, k).value == v for k, v in previous['configs'].items())
        with pytest.raises(ValueError, match='changed since review'):
            prompt_factory_alignment.apply_review(db, 'stale-review', author='synthetic-admin')
        # Recompute after rollback; the fixture transaction is retained by artifact_session.
        plan = prompt_factory_alignment.make_plan(db)
        prompt_factory_alignment.apply_review(db, prompt_factory_alignment.review_hash(plan), author='synthetic-admin')
        assert custom.value == 'ADMIN: ask about personal priorities.'
        for change in plan['changes']:
            cls, field = ((models.Config, 'value') if change['scope'] == 'config' else
                          (models.GuidedStep, 'prompt'))
            assert getattr(db.get(cls, change['key']), field) == change['after']
        assert db.get(models.Config, key).value == previous['configs'][key]



@pytest.mark.parametrize('phase', ['cognitive', 'qsar-cognitive', 'ztpi-t1', 'qpcs-profilo', 'qpcc-profilo', 'qap-profilo'])
def test_sync_and_stream_deliver_same_phase_contract_to_provider(runtime, phase, monkeypatch, tmp_path):
    from fastapi import BackgroundTasks
    from backend import chat_logic, chat_preparation
    from backend.memory_service import SessionMemory
    from backend.routes import chat
    db, ai = runtime
    memory = SessionMemory(memory_dir=tmp_path)
    for module in (chat, chat_logic, chat_preparation):
        monkeypatch.setattr(module, 'session_memory', memory)
    monkeypatch.setattr(chat, 'AIService', lambda *a, **kw: ai)
    monkeypatch.setattr(chat, '_resolve_counselor', lambda *a: (None,) * 7)
    captured = []

    class EnvelopeDelivered(RuntimeError):
        pass

    def stop_after_delivery(message, system, *args, **kwargs):
        captured.append((message, system))
        raise EnvelopeDelivered('Synthetic provider: stop before generation')

    monkeypatch.setattr(ai, 'get_response', stop_after_delivery)
    monkeypatch.setattr(ai, 'stream_response', stop_after_delivery)

    def isolated_prepare(*args, **kwargs):
        kwargs.update(include_history=False, include_retrieval=False, allow_generation=False)
        return prepare_chat_turn(*args, **kwargs)

    monkeypatch.setattr(chat, 'prepare_chat_turn', isolated_prepare)
    req = request(phase, message='Come si interpreta il punteggio?', session_id='description-transport', preview=True)
    with pytest.raises(EnvelopeDelivered):
        asyncio.run(chat.chat(req, BackgroundTasks(), db=db, identity={'is_admin': True}))

    async def run_stream():
        response = await chat.chat_stream(req, db=db, identity={'is_admin': True})
        return [event async for event in response.body_iterator]

    events = asyncio.run(run_stream())
    assert events
    assert len(captured) == 2
    assert captured[0] == captured[1]
    assert SENTINEL in captured[0][1]
    assert 'no mandatory closing question' in captured[0][1]


@pytest.mark.parametrize('phase', ['cognitive', 'qsar-cognitive', 'ztpi-t1', 'qpcs-profilo', 'qpcc-profilo', 'qap-profilo'])
def test_resumed_history_and_partial_reply_keep_the_boundary(runtime, phase, monkeypatch, tmp_path):
    from backend import chat_logic, chat_preparation
    from backend.memory_service import SessionMemory
    memory = SessionMemory(memory_dir=tmp_path)
    memory.record_interaction('description-resumed', phase=phase,
        user_message='Che cosa significa la scala?', transcript_user='Che cosa significa la scala?',
        bot_response='La scala riguarda le strategie. Ti riconosci?')
    restored = SessionMemory(memory_dir=tmp_path)
    for module in (chat_logic, chat_preparation):
        monkeypatch.setattr(module, 'session_memory', restored)
    db, ai = runtime
    req = request(phase, message='Puoi chiarire il significato?', partial_response='Questa scala misura')
    result = prepare_chat_turn(db, ai, req, 'description-resumed', {},
        include_retrieval=False, include_history=True, create_anonymous_code=False,
        allow_generation=False)
    assert any('Ti riconosci?' in turn['content'] for turn in result.history)
    assert SENTINEL in result.system_prompt_final
    assert 'continuations of interrupted replies' in result.system_prompt_final
    assert 'Do not ask whether they recognise themselves' in result.system_prompt_final
    assert restored.get_progress('description-resumed')['current_phase'] == phase


def test_custom_saved_prompt_and_compact_variants_are_preserved_beneath_phase_contract(runtime):
    db, ai = runtime
    row = db.get(models.GuidedStep, 'qpcs-profilo')
    original = row.prompt
    row.prompt = 'ADMIN personalised reading. Close by asking how I study.'
    keys = [variant_key('guided_step:qpcs-profilo:prompt', level) for level in ('ristretto', 'minimo')]
    previous = {key: ai.config.get(key) for key in keys}
    try:
        db.flush()
        for key in keys:
            ai.config[key] = 'ADMIN compact reading. Ask me to choose a personal priority.'
        result = prepare(runtime, request('qpcs-profilo', entry=True))
        assert row.prompt == 'ADMIN personalised reading. Close by asking how I study.'
        assert row.prompt in result.system_prompt_final
        assert result.system_prompt_final.index(row.prompt) < result.system_prompt_final.index(SENTINEL)
        for level in ('ristretto', 'minimo'):
            system = ai.context_data['variants'][level]['system']
            assert 'ADMIN compact reading' in system
            assert 'This phase boundary takes priority' in system
        assert not db.dirty
    finally:
        row.prompt = original
        db.flush()
        for key, value in previous.items():
            if value is None:
                ai.config.pop(key, None)
            else:
                ai.config[key] = value


def test_fresh_and_populated_seeds_keep_personal_openings_in_later_areas_only():
    from backend.guided_step_questions_seed import (
        seed_guided_step_questions, seed_response_openings, RESPONSE_OPENINGS,
    )
    with artifact_session() as db:
        db.add_all(models.GuidedStep(**STEPS[key]) for key in READINGS + NEXT if key in STEPS)
        custom = models.GuidedStepQuestion(questionnaire_type='QSA', step_id='cognitive',
            language='it', text='ADMIN descriptive wording', sort_order=0, is_active=True)
        db.add(custom)
        db.commit()
        seed_guided_step_questions(db, models)
        assert seed_response_openings(db, models) > 0
        count = db.query(models.GuidedStepQuestion).count()
        assert seed_response_openings(db, models) == 0
        assert count == db.query(models.GuidedStepQuestion).count()
        assert db.get(models.GuidedStepQuestion, custom.id).text == 'ADMIN descriptive wording'
        for key in READINGS:
            if key not in STEPS:
                continue
            personal = db.query(models.GuidedStepQuestion).filter_by(step_id=key).all()
            assert not any(row.text in RESPONSE_OPENINGS.get(row.language, []) for row in personal)
            from backend.questionnaire_description import COMPREHENSION_SUGGESTIONS
            for language in LANGUAGES:
                texts = [row.text for row in personal if row.language == language]
                assert texts == (['ADMIN descriptive wording'] if key == 'cognitive' and language == 'it'
                                 else COMPREHENSION_SUGGESTIONS[language])
        for key in NEXT:
            for language in LANGUAGES:
                rows = db.query(models.GuidedStepQuestion).filter_by(step_id=key, language=language).all()
                assert all(text in [row.text for row in rows] for text in RESPONSE_OPENINGS[language])
