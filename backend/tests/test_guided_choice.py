"""Shared choice contract across real paths; no model or production data.

These assertions verify model instructions, navigation and evidence delivery.
They do not certify that a live model follows the instructions naturally.
"""
from pathlib import Path

import pytest

from backend import models, prompt_config, schemas
from backend.ai_service import AIService
from backend.api_models import ChatRequest
from backend.chat_logic import _guided_path_context
from backend.chat_preparation import prepare_chat_turn
from backend.model_context import fit_context
from backend.prompt_audit import build_prompt_audit
from backend.prompt_contract import GUIDED_CHOICE_SENTINEL
from backend.prompt_variants import variant_key
from backend.qsa_essential import QSA_PHASES, OBBSTUDIO_PHASES, OBBDOCENZA_PHASES
from backend.tests.artifact_database import artifact_session

STEPS = [step for name in dir(prompt_config)
         if name.startswith('DEFAULT_') and name.endswith('GUIDED_STEPS')
         for step in getattr(prompt_config, name)]
STEPS = list({step['id']: step for step in STEPS}.values())
CUSTOM = dict(id='choice-custom-work', questionnaire_type='CHOICE_CUSTOM', sort_order=1,
              label='Tema personalizzato', label_i18n={'en': 'Custom topic'},
              prompt='ADMIN INSTRUCTION: explore the chosen theme.', system_prompt_mode='generic')


@pytest.fixture(scope='module')
def runtime():
    with artifact_session() as db:
        db.add_all(models.GuidedStep(**step) for step in [*STEPS, CUSTOM])
        db.add(models.GuidedStep(id='choice-custom-next', questionnaire_type='CHOICE_CUSTOM',
                                sort_order=2, label='Il seguito reale', prompt='Next theme',
                                system_prompt_mode='generic'))
        db.flush()
        ai = AIService(db)
        ai.config.update(active_provider='ollama', model_name='test-local')
        for level in ('ristretto', 'minimo'):
            ai.config[variant_key('prompt_generic', level)] = f'ADMIN {level} text'
        yield db, ai


@pytest.fixture(autouse=True)
def forbid_generation(monkeypatch):
    monkeypatch.setattr(AIService, 'get_response', lambda *args, **kwargs:
                        pytest.fail('Envelope tests must not call a model'))


def prepare(runtime, step, *, language='it', entry=False, message='Vorrei approfondire.', **extra):
    db, ai = runtime
    request = ChatRequest(questionnaire_type=step['questionnaire_type'], phase=step['id'],
                          mode=step['system_prompt_mode'] if entry else 'generic', language=language,
                          use_phase_prompt=entry, message=message, **extra)
    return prepare_chat_turn(db, ai, request, 'choice-synthetic', {'username': 'choice-student'},
                             include_retrieval=False, include_history=False,
                             create_anonymous_code=False)


@pytest.mark.parametrize('step', [*STEPS, CUSTOM], ids=lambda step: step['id'])
@pytest.mark.parametrize('language', ['it', 'en', 'es', 'fr', 'de', 'sv'])
def test_every_path_receives_choice_in_every_language_and_context_level(runtime, step, language):
    for entry in (True, False):
        result = prepare(runtime, step, language=language, entry=entry)
        directive = prompt_config.GUIDED_CHOICE_DIRECTIVE
        assert directive in result.components['turn_contract']
        assert result.system_prompt_final.count(GUIDED_CHOICE_SENTINEL) == 1
        assert f'Response language: {language}' in result.system_prompt_final
        for level in ('ristretto', 'minimo'):
            system = runtime[1].context_data['variants'][level]['system']
            fitted, _, _, _ = fit_context(system, result.full_message, [],
                                         {'context_tokens': 32768, 'compact': True}, 1000)
            assert directive in fitted
        assert not runtime[0].new and not runtime[0].dirty


@pytest.mark.parametrize('phases,qtype', [(QSA_PHASES, 'QSA'),
    (OBBSTUDIO_PHASES, 'OBIETTIVO_STUDIO'), (OBBDOCENZA_PHASES, 'OBIETTIVO_DOCENZA')])
def test_essential_orientation_uses_virtual_stages_not_complete_path(runtime, phases, qtype):
    for phase in phases:
        result = prepare(runtime, {'id': phase, 'questionnaire_type': qtype,
                                  'system_prompt_mode': 'generic'}, guided_path='essential')
        assert GUIDED_CHOICE_SENTINEL in result.system_prompt_final
        assert 'Current guided step:' in result.components['guided_path']
        assert 'Next guided step:' in result.components['guided_path']
        assert 'moves to the next step after each completed reply' not in result.system_prompt_final


def test_actual_navigation_and_custom_text_survive(runtime):
    result = prepare(runtime, CUSTOM)
    assert 'ADMIN INSTRUCTION' in result.system_prompt_final
    assert 'Next guided step: Il seguito reale' in result.system_prompt_final
    assert runtime[0].get(models.GuidedStep, CUSTOM['id']).prompt == CUSTOM['prompt']
    context = _guided_path_context(runtime[0], CUSTOM['questionnaire_type'], CUSTOM['id'], 'en')
    assert 'Current guided step: Custom topic' in context
    assert 'without asking again' in context
    assert 'next step opening supplies the visible orientation' in context


def test_metadata_toggle_keeps_the_contract_without_inventing_navigation(runtime):
    db, ai = runtime
    request = ChatRequest(questionnaire_type=CUSTOM['questionnaire_type'], phase=CUSTOM['id'],
                          message='Vorrei approfondire.')
    result = prepare_chat_turn(db, ai, request, 'choice-no-metadata', {},
                              component_overrides={'metadata': False}, include_retrieval=False,
                              include_history=False, create_anonymous_code=False)
    assert GUIDED_CHOICE_SENTINEL in result.system_prompt_final
    assert 'If the next step is unknown' in result.system_prompt_final


@pytest.mark.parametrize('message', ['Vorrei approfondire.', 'Sì, approfondiamo quel tema.',
    'Continuiamo il percorso.', 'Che cosa significa questa parola?', 'Non so.',
    'Restiamo ancora su questo tema.'])
def test_requests_reach_audit_and_runtime_with_the_same_choice_contract(runtime, message):
    db, ai = runtime
    payload = schemas.PromptAuditRequest(questionnaire_type=CUSTOM['questionnaire_type'],
        phase=CUSTOM['id'], mode='generic', message=message, include_knowledge=False,
        include_history=False)
    result = prepare(runtime, CUSTOM, message=message)
    audit = build_prompt_audit(db, payload, ai_service_cls=lambda _db: ai)
    assert audit['envelope']['system_prompt_final'] == result.system_prompt_final
    assert message in audit['envelope']['full_message']
    assert 'Wait for their choice before starting' in result.system_prompt_final
    assert 'briefly return what was learned' in result.system_prompt_final
    assert 'without justification, another content question' in result.system_prompt_final


def test_free_chat_does_not_invent_a_guided_path(runtime):
    db, ai = runtime
    request = ChatRequest(message='Ciao', questionnaire_type='', phase=None)
    result = prepare_chat_turn(db, ai, request, 'choice-free', {}, include_retrieval=False,
                              include_history=False, create_anonymous_code=False)
    assert GUIDED_CHOICE_SENTINEL not in result.system_prompt_final


def test_previous_factory_qa_prompts_align_explicitly_while_custom_text_is_preserved():
    import json
    from backend import prompt_factory_alignment
    old = json.loads((Path(__file__).parent / 'fixtures/guided-choice-previous-qa.json').read_text())
    with artifact_session() as db:
        for key, value in old.items():
            db.add(models.Config(key=key, value=value))
        custom = models.Config(key='prompt_qpcs_analysis', value='ADMIN PERSONALISED TEXT')
        db.add(custom)
        db.flush()
        plan = prompt_factory_alignment.make_plan(db)
        assert {row['key'] for row in plan['changes']} == set(old)
        assert {row['key'] for row in plan['preserved']} == {custom.key}
        assert all(db.get(models.Config, key).value == value for key, value in old.items())
        prompt_factory_alignment.apply_review(db, prompt_factory_alignment.review_hash(plan), author='test')
        defaults, _ = prompt_factory_alignment.factory_catalog()
        assert all(db.get(models.Config, key).value == defaults[key] for key in old)
        assert custom.value == 'ADMIN PERSONALISED TEXT'


def test_resumed_history_keeps_the_actual_depth_choice(runtime, monkeypatch, tmp_path):
    from backend import chat_logic, chat_preparation
    from backend.memory_service import SessionMemory
    memory = SessionMemory(memory_dir=tmp_path)
    memory.record_interaction('choice-resumed', phase=CUSTOM['id'],
        user_message='Sì, approfondiamo come scelgo di iniziare.',
        transcript_user='Sì, approfondiamo come scelgo di iniziare.',
        bot_response='Restiamo su questo aspetto; dopo torneremo al percorso.')
    monkeypatch.setattr(chat_logic, 'session_memory', memory)
    monkeypatch.setattr(chat_preparation, 'session_memory', memory)
    db, ai = runtime
    request = ChatRequest(questionnaire_type=CUSTOM['questionnaire_type'], phase=CUSTOM['id'],
                          message='Preferisco adesso proseguire.', language='it')
    result = prepare_chat_turn(db, ai, request, 'choice-resumed', {}, include_retrieval=False,
                              include_history=True, create_anonymous_code=False)
    assert any('Sì, approfondiamo' in turn['content'] for turn in result.history)
    assert 'Preferisco adesso proseguire.' in result.full_message
    assert GUIDED_CHOICE_SENTINEL in result.system_prompt_final
    assert memory.get_progress('choice-resumed')['current_phase'] == CUSTOM['id']


def test_resumed_session_still_invites_to_move_on_after_several_exchanges(runtime):
    """#411: the exchange count is persisted, so a resumed step keeps the choice invitation."""
    from backend.step_closure import step_choice_context
    db, _ = runtime
    step = db.get(models.GuidedStep, CUSTOM['id'])
    ctx = lambda: step_choice_context(db, step, CUSTOM['id'], CUSTOM['questionnaire_type'], 'resumed-411')
    for _ in range(3):
        db.add(models.Log(session_id='resumed-411', action='chat_message', phase=CUSTOM['id'], details={}))
    db.flush()
    assert ctx() == ''
    db.add(models.Log(session_id='resumed-411', action='chat_message', phase=CUSTOM['id'], details={}))
    db.add(models.Log(session_id='resumed-411', action='chat_message', phase=CUSTOM['id'],
                      details={'exploration': 'chosen'}))
    db.flush()
    text = ctx()
    assert '[STEP DIRECTION CHOICE]' in text and 'consent' in text
