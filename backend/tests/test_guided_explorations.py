"""Branch protocol, isolated model history, completion and owned resume."""
import asyncio
import json

import pytest
from pydantic import ValidationError

from backend import models, schemas
from backend.api_models import ChatRequest
from backend.ai_service import AIService
from backend.chat_preparation import prepare_chat_turn
from backend.guided_explorations import Exploration, branch_history, directive, transition
from backend.memory_service import SessionMemory
from backend.routes import chat as routes
from backend.routes.frozen_sessions import freeze_session, get_frozen_session
from backend.tests.artifact_database import artifact_session
from backend.tests.test_server_side_step_closure import test_db, client_app, _MockAIService


BRANCH = dict(id='branch-one', title='Iniziare a studiare', origin_phase='test-final')


def test_api_requires_capability_matching_origin_and_no_step_entry():
    for extra in ({}, {'supports_explorations': True, 'phase': 'elsewhere'},
                  {'supports_explorations': True, 'phase': 'test-final', 'use_phase_prompt': True}):
        with pytest.raises(ValidationError):
            ChatRequest(exploration=BRANCH, **extra)
    assert ChatRequest(supports_explorations=True, phase='test-final', exploration=BRANCH).exploration.title
    with pytest.raises(ValidationError):
        Exploration(**{**BRANCH, 'id': '../other'})


def test_transition_requires_capability_and_completed_continuation():
    request = ChatRequest(phase='step', message='Sì')
    assert transition(request, ['APRI_APPROFONDIMENTO']) == (None, [])
    request.supports_explorations = True
    request.use_phase_prompt = True
    event, signals = transition(request, ['APRI_APPROFONDIMENTO'])
    assert event is None
    request.use_phase_prompt = False
    event, signals = transition(request, ['APRI_APPROFONDIMENTO', 'AVANZA_STEP'], title='Organizzazione')
    assert event['action'] == 'open' and event['origin_phase'] == 'step'
    assert 'AVANZA_STEP' not in signals
    original_id = event['id']
    event, _ = transition(request, ['APRI_APPROFONDIMENTO', 'AVANZA_STEP'])
    assert event['id'] == original_id and event['action'] == 'stay'
    event, _ = transition(request, ['TORNA_AL_PERCORSO', 'AVANZA_STEP'])
    assert event['action'] == 'return'
    assert directive(ChatRequest()) == ''
    assert 'first ask whether' in directive(ChatRequest(supports_explorations=True))


def test_history_selects_parent_checkpoint_and_own_messages():
    rows = [dict(role='user', content='parent'), dict(role='assistant', content='one', exploration_id='a'),
            dict(role='user', content='later parent'), dict(role='assistant', content='two', exploration_id='b'),
            dict(role='user', content='one again', exploration_id='a')]
    assert [r['content'] for r in branch_history(rows)] == ['parent', 'later parent']
    assert [r['content'] for r in branch_history(rows, 'a')] == ['parent', 'one', 'one again']
    assert all(set(r) == {'role', 'content'} for r in branch_history(rows, 'a'))


def test_long_branch_preserves_parent_and_checkpoint_when_reopened(tmp_path):
    memory = SessionMemory(memory_dir=tmp_path)
    memory.record_interaction('s', user_message='Parent question', transcript_user='Parent question', bot_response='Parent answer', phase='origin')
    before = memory.get_progress('s')
    for i in range(20):
        memory.record_interaction('s', user_message='Branch fact', transcript_user=f'deep {i}', bot_response=f'reply {i}',
                                  phase='final', completed_step=True, exploration_id='a')
    assert memory.get_progress('s') == before
    assert [r['content'] for r in memory.get_transcript('s')] == ['Parent question', 'Parent answer']
    memory.record_interaction('s', transcript_user='Later parent', bot_response='Later answer')
    memory.record_interaction('s', transcript_user='Different branch', bot_response='Different reply', exploration_id='b')
    branch = memory.get_exploration_transcript('s', 'a')
    assert branch[0]['content'] == 'Parent question'
    assert branch[-1]['content'] == 'reply 19'
    assert not any('Later' in r['content'] or 'Different' in r['content'] for r in branch)
    assert 'deep 19' not in memory.get_summary('s')
    # Reopen from the persisted Markdown, after a fresh service instance.
    assert SessionMemory(memory_dir=tmp_path).get_exploration_transcript('s', 'a') == branch


@pytest.mark.parametrize('lang', ['it', 'en', 'es', 'fr', 'de', 'sv'])
def test_branch_does_not_run_parent_synthesis_even_in_reduced_context(lang):
    with artifact_session() as db:
        db.add(models.GuidedStep(id='test-final', questionnaire_type='QSA', label='Sintesi', sort_order=1,
                                system_prompt_mode='summary', prompt='PARENT FINAL TASK'))
        db.flush()
        ai = AIService(db)
        request = ChatRequest(questionnaire_type='MISDIRECTED', phase='test-final', supports_explorations=True,
                              exploration=BRANCH, message='Un esempio?', language=lang)
        result = prepare_chat_turn(db, ai, request, 'branch-envelope', {}, include_retrieval=False, include_history=False)
        assert result.questionnaire_type == 'QSA'  # The authorized origin step wins over client claims.
        assert '[GUIDED EXPLORATION]' in result.system_prompt_final
        assert 'PARENT FINAL TASK' not in result.system_prompt_final
        assert 'journey_coverage' not in result.components
        for variant in ai.context_data['variants'].values():
            assert '[GUIDED EXPLORATION]' in variant['system']


@pytest.mark.parametrize('stream', [False, True])
def test_open_return_and_no_parent_completion_in_both_transports(monkeypatch, test_db, client_app, tmp_path, stream):
    memory = SessionMemory(memory_dir=tmp_path)
    from backend import chat_logic, chat_preparation
    for module in (routes, chat_logic, chat_preparation):
        monkeypatch.setattr(module, 'session_memory', memory)

    class BranchAI(_MockAIService):
        text = 'Entriamo nel tema. [[APRI_APPROFONDIMENTO]] [[AVANZA_STEP]]'
        def get_response(self, *args, **kwargs):
            return self.text
        def stream_response(self, *args, **kwargs):
            yield {'type': 'content', 'text': self.text}

    monkeypatch.setattr(routes, 'AIService', BranchAI)
    payload = dict(session_id='branch-api', questionnaire_type='TEST_Q', phase='test-final',
                   supports_explorations=True, message='Sì, approfondiamo', memory_message='Sì, approfondiamo')
    def send():
        response = client_app.post('/chat/stream' if stream else '/chat', json=payload)
        assert response.status_code == 200, response.text
        if not stream:
            return response.json()
        return next(json.loads(line[6:]) for line in response.text.splitlines() if line.startswith('data: ') and json.loads(line[6:]).get('done'))
    result = send()
    assert result['exploration']['action'] == 'open'
    assert 'AVANZA_STEP' not in result['control_signals']
    assert '[[' not in result['response']
    assert not test_db.query(models.Log).filter_by(action='guided_chat_completed').first()
    assert memory.get_transcript('branch-api') == []
    payload['exploration'] = {key: value for key, value in result['exploration'].items() if key != 'action'}
    BranchAI.text = 'Torniamo alla domanda lasciata aperta. [[TORNA_AL_PERCORSO]] [[AVANZA_STEP]]'
    result = send()
    assert result['exploration']['action'] == 'return'
    assert 'AVANZA_STEP' not in result['control_signals']
    assert not test_db.query(models.Log).filter_by(action='guided_chat_completed').first()
    logs = test_db.query(models.Log).filter_by(action='chat_message').all()
    assert len(logs) == 2 and all(log.details['exploration']['id'] == payload['exploration']['id'] for log in logs)


def test_owned_freeze_roundtrip_restores_active_branch_and_drafts(tmp_path):
    with artifact_session() as db:
        nav = dict(visited=['intro', 'test-final'], completed=['intro'], agreement_accepted=True,
                   active_exploration_id='branch-one', checkpoints={'test-final': dict(draft='Bozza padre', scroll_top=120)},
                   explorations=[{**BRANCH, 'checkpoint': dict(draft='Bozza ramo', scroll_top=50)}])
        messages = [dict(role='user', content='Parent'), dict(role='assistant', content='Parent answer'),
                    dict(role='user', content='Branch', explorationId='branch-one'),
                    dict(role='assistant', content='Branch answer', explorationId='branch-one'),
                    dict(role='user', content='Later root')]
        payload = schemas.FrozenSessionCreate(session_id='branch-frozen', questionnaire_type='QSA',
                    current_phase='test-final', messages=messages, guided_navigation=nav)
        asyncio.run(freeze_session(payload, {'username': 'owner'}, db))
        saved = asyncio.run(get_frozen_session(payload.session_id, {'username': 'owner'}, db))
        assert saved.guided_navigation.checkpoints['test-final'].draft == 'Bozza padre'
        assert saved.guided_navigation.explorations[0].checkpoint.draft == 'Bozza ramo'
        assert saved.messages[2].explorationId == 'branch-one'
        memory = SessionMemory(memory_dir=tmp_path)
        memory.restore_guided_snapshot(payload.session_id, saved.model_dump())
        history = memory.get_exploration_transcript(payload.session_id, 'branch-one')
        assert [row['content'] for row in history] == ['Parent', 'Parent answer', 'Branch', 'Branch answer']
        from backend.guided_explorations import restore_owned_snapshot
        request = ChatRequest(supports_explorations=True)
        other = SessionMemory(memory_dir=tmp_path / 'other')
        restore_owned_snapshot(db, other, payload.session_id, {'authenticated': True, 'username': 'other'}, request)
        assert other.get_transcript(payload.session_id) == []
        restore_owned_snapshot(db, other, payload.session_id, {'authenticated': True, 'username': 'owner'}, request)
        assert other.get_exploration_transcript(payload.session_id, 'branch-one') == history


def test_prompt_audit_can_inspect_the_same_branch_contract_without_writes():
    from backend.prompt_audit import build_prompt_audit
    with artifact_session() as db:
        result = build_prompt_audit(db, schemas.PromptAuditRequest(
            questionnaire_type='QSA', phase='qsa-essential-action', guided_path='essential',
            supports_explorations=True, exploration={**BRANCH, 'origin_phase': 'qsa-essential-action'},
            include_knowledge=False, include_history=False,
        ))
        assert '[GUIDED EXPLORATION]' in result['envelope']['system_prompt_final']
        assert not db.new and not db.dirty


@pytest.mark.parametrize('stream', [False, True])
def test_incomplete_output_does_not_open_a_branch(monkeypatch, test_db, client_app, stream):
    class LongAI(_MockAIService):
        text = 'Una risposta ancora da finire. ' * 80 + ' [[APRI_APPROFONDIMENTO]]'
        def get_response(self, *args, **kwargs):
            return self.text
        def stream_response(self, *args, **kwargs):
            yield {'type': 'content', 'text': self.text}
    monkeypatch.setattr(routes, 'AIService', LongAI)
    response = client_app.post('/chat/stream' if stream else '/chat', json=dict(
        session_id='branch-incomplete', questionnaire_type='TEST_Q', phase='test-step1',
        supports_explorations=True, message='Sì, approfondiamo', response_length='short'))
    assert response.status_code == 200
    result = response.json() if not stream else next(json.loads(line[6:]) for line in response.text.splitlines()
                                                    if line.startswith('data: ') and json.loads(line[6:]).get('done'))
    assert not result.get('exploration')
    if stream:
        assert result['incomplete'] is True


def test_idea_branch_cannot_apply_map_patches(monkeypatch):
    patch = '<!-- IDEA_MAP {"operations": []} -->'
    monkeypatch.setattr(routes, 'extract_patch', lambda value: ('Visible only', {'operations': []}))
    monkeypatch.setattr(routes, 'apply_and_store', lambda *args, **kwargs: pytest.fail('A branch must not write the parent map'))
    assert routes._apply_idea_patch(patch, questionnaire_type='IDEA', username='owner', session_id='s', step_id='p', allow_write=False) == ('Visible only', None)


def test_parent_choice_counter_ignores_optional_branch_logs(test_db):
    from backend.step_closure import count_step_assistant_exchanges
    for details in ({}, {'exploration': None}, {'exploration': BRANCH}):
        test_db.add(models.Log(session_id='counter', phase='test-step1', action='chat_message', details=details))
    test_db.flush()
    assert count_step_assistant_exchanges(test_db, 'counter', 'test-step1') == 2
