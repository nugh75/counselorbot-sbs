import json
import pytest

from backend import models, schemas, database, chat_logic
from backend.ai_service import AIService
from backend.chat_preparation import prepare_chat_turn
from backend.model_context import DEFAULT_CONTEXT_LEVELS, context_profile, fit_context
from backend.prompt_audit import build_prompt_audit
from backend.api_models import ChatRequest
from backend.tests.test_admin_prompt_map import INSTRUMENTS, _client, _map, _entries
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def db():
    # Every API test owns a rolled-back schema, including commits by routes.
    with artifact_session() as session:
        for instrument in INSTRUMENTS:
            chat_logic._ensure_questionnaire_guided_steps(session, instrument)
        yield session


@pytest.fixture
def client(db):
    from backend.main import app
    client = _client()
    previous = app.dependency_overrides[database.get_db]
    app.dependency_overrides[database.get_db] = lambda: db
    try:
        yield client
    finally:
        app.dependency_overrides[database.get_db] = previous


def test_levels_endpoint_is_read_only_and_all_prompt_variants_start_empty(db, client):
    before = (db.query(models.Config).count(), db.query(models.PromptRevision).count())
    response = client.get('/admin/model-context-levels')
    assert response.status_code == 200 and set(response.json()['levels']) == set(DEFAULT_CONTEXT_LEVELS)
    entries = [entry for _, entry in _entries(_map(client, 'QSA')) if entry['destination'] == 'model' and entry['kind'] != 'counselor_persona']
    assert entries and all(set(entry['variants']) == {'ristretto', 'minimo'} for entry in entries)
    assert all(variant['value'] == '' and not variant['stored'] for entry in entries for variant in entry['variants'].values())
    assert before == (db.query(models.Config).count(), db.query(models.PromptRevision).count())


def test_admin_saves_manual_assignments_and_cannot_remove_in_use_level(db, client):
    def save(key, value): return client.post('/admin/config', json={'key': key, 'value': json.dumps(value), 'description': 'test'})
    assert save('model_context_profiles', {'ollama/small': {'level': 'missing'}}).status_code == 400
    assert save('model_context_profiles', {'ollama/small': {'level': 'ristretto'}}).status_code == 200
    assert save('model_context_levels', {'totale': DEFAULT_CONTEXT_LEVELS['totale']}).status_code == 400
    assert client.get('/admin/model-context-levels').json()['profiles']['ollama/small']['level'] == 'ristretto'


def test_short_and_normal_receive_the_same_dynamic_score_contracts(db):
    db.add(models.Config(key='prompt_second_level__short', value='User-written concise section.'))
    db.flush()
    ai = AIService(db)
    step = db.query(models.GuidedStep).filter_by(questionnaire_type='QSA', system_prompt_mode='second-level').first()
    request = ChatRequest(message='test', use_phase_prompt=True, phase=step.id, mode=step.system_prompt_mode,
                          questionnaire_type='QSA', scores_context='C1: 5/9', language='it')
    prepared = prepare_chat_turn(db, ai, request, 'fixture-short', {'username': ''}, include_retrieval=False,
                include_history=False, create_anonymous_code=False, allow_generation=False,
                retrieval_context={'knowledge_context':'', 'skills_blocks':{}})
    fitted, message, _, report = fit_context(prepared.system_prompt_final, prepared.full_message, prepared.history,
                {'level': 'ristretto', 'limits': DEFAULT_CONTEXT_LEVELS['ristretto']}, prepared.max_tokens, context_data=ai.context_data)
    assert report['prompt_variant'] == 'ristretto' and 'User-written concise section.' in fitted
    assert '[LANGUAGE]' in fitted and '[TURN CONTRACT]' in fitted
    assert prepared.full_message == message
    assert '[CURRENT STEP' in fitted
    # A different provider/model uses its own level against the original.
    full, _, _, _ = fit_context(prepared.system_prompt_final, prepared.full_message, prepared.history,
                {'limits': DEFAULT_CONTEXT_LEVELS['totale']}, prepared.max_tokens, context_data=ai.context_data)
    assert 'User-written concise section.' not in full


def test_preview_selected_preset_uses_its_manual_context_assignment(db):
    preset = models.ModelPreset(name='fixture-context', provider='ollama', model='fixture-small', is_active=True, disable_thinking=True)
    db.add(preset); db.add(models.Config(key='model_context_profiles', value='{"ollama/fixture-small":{"level":"minimo"}}')); db.flush()
    step = db.query(models.GuidedStep).filter_by(questionnaire_type='IDEA').first()
    payload = schemas.PromptAuditRequest(questionnaire_type='IDEA', phase=step.id, mode=step.system_prompt_mode,
                use_phase_prompt=True, message='test', include_knowledge=False, model_preset_id=preset.id)
    result = build_prompt_audit(db, payload)
    assert result['resolved']['model'] == 'fixture-small'
    assert result['resolved']['context_budget']['level'] == 'minimo'
