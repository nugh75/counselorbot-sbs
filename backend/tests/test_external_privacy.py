"""Administrator choice and worker-independent filtering, no provider requests."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, database, models, pii_ner, personal_api
from backend.ai_service import AIService, AIError
from backend.routes import admin, external_privacy
from backend.tests.test_personal_api import db, identity


@pytest.fixture
def client(db):
    app = FastAPI()
    app.include_router(external_privacy.router)
    app.include_router(admin.router)
    actor = {'identity': identity('admin', is_admin=True)}
    app.dependency_overrides[database.get_db] = lambda: db
    app.dependency_overrides[auth.get_identity] = lambda: actor['identity']
    app.dependency_overrides[auth.get_current_active_admin] = lambda: actor['identity']
    with TestClient(app, headers={'X-Requested-With': 'CounselorBot'}) as c:
        c.actor = actor
        yield c


def test_reading_policy_preserves_defaults_and_custom_configuration(client, db):
    db.query(models.Config).filter(models.Config.key.in_(external_privacy.KEYS)).delete(); db.commit()
    response = client.get('/admin/external-privacy')
    assert response.json() == {'mode': 'local', 'local_model': 'qwen3:0.6b'}
    assert response.headers['cache-control'] == 'no-store'
    assert db.query(models.Config).filter(models.Config.key.in_(external_privacy.KEYS)).count() == 0
    db.add(models.Config(key='external_pii_redact', value='false')); db.commit()
    assert client.get('/admin/external-privacy').json()['mode'] == 'custom'


@pytest.mark.parametrize('mode,local', [('basic', 'false'), ('local', 'true')])
def test_explicit_mode_atomically_keeps_external_filter_and_block_policy(client, db, mode, local):
    response = client.put('/admin/external-privacy', json={'mode': mode})
    assert response.status_code == 200 and response.json()['mode'] == mode
    rows = {r.key: r.value for r in db.query(models.Config).filter(models.Config.key.in_(external_privacy.KEYS))}
    assert rows == {'external_pii_redact': 'true', 'external_pii_fallback': 'block', 'pii_ner_enabled': local}
    assert response.headers['cache-control'] == 'no-store'


@pytest.mark.parametrize('actor,status', [(identity('student'), 403), (identity('researcher', is_researcher=True), 403),
    (auth._anonymous_identity(), 401), (identity('studente.demo', is_admin=True), 403)])
def test_only_real_administrators_can_read_or_change_privacy(client, actor, status):
    client.actor['identity'] = actor
    assert client.get('/admin/external-privacy').status_code == status
    assert client.put('/admin/external-privacy', json={'mode': 'basic'}).status_code == status


def test_preview_csrf_and_invalid_modes_are_rejected_without_mutations(client, db):
    assert client.get('/admin/external-privacy', headers={'X-View-As': 'demostudent'}).status_code == 403
    assert client.put('/admin/external-privacy', json={'mode': 'basic'}, headers={'X-Requested-With': ''}).status_code == 403
    for body in [{'mode': 'off'}, {'mode': 'send_raw'}, {'mode': 'basic', 'username': 'other'}]:
        assert client.put('/admin/external-privacy', json=body).status_code == 422
    assert client.get('/admin/external-privacy').json()['mode'] == 'custom'


@pytest.mark.parametrize('key', external_privacy.KEYS + ('pii_ner_model',))
def test_researcher_cannot_bypass_privacy_panel_via_generic_config(client, key):
    client.actor['identity'] = identity('researcher', is_researcher=True)
    assert client.post('/admin/config', json={'key': key, 'value': 'false'}).status_code == 403


def test_basic_mode_uses_db_snapshot_on_other_workers_and_still_masks_all_messages(client, db, monkeypatch):
    def local_call(*args, **kwargs):
        pytest.fail('Basic filtering must not contact a local model')
    monkeypatch.setattr(pii_ner, '_ner_enabled', True)  # another worker's stale global
    monkeypatch.setattr(pii_ner, '_ner_entities', local_call)
    assert client.put('/admin/external-privacy', json={'mode': 'basic'}).status_code == 200
    service = AIService(db)
    service.use_personal_connection(models.PersonalAPIConnection(id='a'*32, username='alice', provider='openrouter',
        model_name='qwen/test:free', encrypted_key=personal_api.encrypt_key('alice', 'openrouter', 'fake-privacy-key', 'a'*32)))
    seen = []
    def answer(message, system, model, **kwargs):
        seen.append((message, system, kwargs['history']))
        assert 'student@example.com' not in message
        assert 'teacher@example.com' not in system
        assert 'previous@example.com' not in str(kwargs['history'])
        return message
    service._providers['openrouter'].update(call=answer, stream=None)
    result = service.get_response('Email: student@example.com', 'Teacher: teacher@example.com', 'generic',
        history=[{'role': 'user', 'content': 'previous@example.com'}])
    assert seen and result == 'Email: student@example.com'


def test_local_mode_remains_blocking_despite_a_stale_disabled_global(client, db, monkeypatch):
    assert client.put('/admin/external-privacy', json={'mode': 'local'}).status_code == 200
    service = AIService(db)
    monkeypatch.setattr(pii_ner, '_ner_enabled', False)
    def unavailable(*args, **kwargs):
        raise ConnectionError('Local detector unavailable')
    monkeypatch.setattr(pii_ner, '_ner_entities', unavailable)
    with pytest.raises(AIError) as error:
        service._anonymize_external('openrouter', 'Neutral message', 'System', [])
    assert error.value.code == 'personalAPI.errors.privacy'
