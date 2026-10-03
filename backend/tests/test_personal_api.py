"""Personal credentials and feature policy, isolated in PostgreSQL."""
import asyncio

import pytest
from cryptography.fernet import Fernet
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from backend import auth, database, models, personal_api, schemas
from backend.ai_service import AIService, AIError
from backend.routes import admin, personal_api as routes
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def db(monkeypatch, tmp_path):
    monkeypatch.setenv('PERSONAL_API_CREDENTIALS_DIR', str(tmp_path / 'personal'))
    monkeypatch.setenv('PERSONAL_API_ENCRYPTION_KEY', Fernet.generate_key().decode())
    monkeypatch.setenv('API_KEY_OPENAI', 'system-openai-test')
    monkeypatch.setenv('API_KEY_ANTHROPIC', 'system-anthropic-test')
    with artifact_session() as session:
        session.add(models.Config(key=personal_api.POLICY_KEY, value='true'))
        session.add(models.Config(key='external_pii_redact', value='false'))
        session.commit()
        yield session


def identity(username='alice', **values):
    return dict(auth._anonymous_identity(), authenticated=True, username=username, **values)


@pytest.fixture
def client(db):
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[database.get_db] = lambda: db
    current = {'identity': identity()}
    app.dependency_overrides[auth.get_identity] = lambda: current['identity']
    with TestClient(app, headers={'X-Requested-With': 'CounselorBot'}) as c:
        c.actor = current
        yield c


def save(client, **values):
    payload = {'provider': 'openai', 'model': 'own-model', 'api_key': 'personal-test-key', 'enabled': True}
    payload.update(values)
    return client.put('/user/api-settings', json=payload)


def test_credentials_are_encrypted_and_scoped_to_account(client, db):
    response = save(client)
    assert response.status_code == 200
    assert response.json()['active'] is True
    assert 'personal-test-key' not in response.text
    stored = db.query(models.PersonalAPISettings).one()
    assert 'personal-test-key' not in stored.encrypted_key
    assert personal_api.decrypt_key(stored) == 'personal-test-key'
    assert AIService(db).config['api_key_openai'] == 'system-openai-test'
    client.actor['identity'] = identity('bob')
    assert client.get('/user/api-settings').json()['configured'] is False
    assert client.delete('/user/api-settings').status_code == 200
    assert db.query(models.PersonalAPISettings).count() == 1
    assert save(client, username='alice').status_code == 422


def test_key_preservation_provider_change_and_deletion(client, db):
    assert save(client).status_code == 200
    assert save(client, api_key='', model='new-model').status_code == 200
    assert personal_api.decrypt_key(db.query(models.PersonalAPISettings).one()) == 'personal-test-key'
    assert save(client, api_key='', provider='anthropic').status_code == 422
    assert save(client, provider='anthropic', api_key='replacement-test').status_code == 200
    assert client.delete('/user/api-settings').json()['configured'] is False
    assert db.query(models.PersonalAPISettings).count() == 0
    assert AIService(db, username='alice').personal_target is None


@pytest.mark.parametrize('provider,model,key', [
    ('omniroute', 'm', 'key'), ('ollama', 'm', 'key'), ('https://localhost', 'm', 'key'),
    ('openai', '   ', 'key'), ('openai', 'm', 'bad key'), ('openai', 'm', 'x' * 4097),
])
def test_invalid_or_internal_targets_are_rejected(client, provider, model, key):
    assert save(client, provider=provider, model=model, api_key=key).status_code == 422


def test_only_real_admin_can_control_policy(client, db):
    for actor in (identity(), identity('teacher', groups=['docenti']), identity('researcher', is_researcher=True)):
        client.actor['identity'] = actor
        assert client.put('/admin/personal-api-policy', json={'enabled': False}).status_code == 403
        with pytest.raises(HTTPException) as exc:
            asyncio.run(admin.create_or_update_config(schemas.ConfigCreate(key=personal_api.POLICY_KEY, value='false'), current_user=actor, db=db))
        assert exc.value.status_code == 403
    client.actor['identity'] = identity('admin', is_admin=True)
    assert client.put('/admin/personal-api-policy', json={'enabled': False}).json()['enabled'] is False
    with pytest.raises(HTTPException) as exc:
        asyncio.run(admin.create_or_update_config(schemas.ConfigCreate(key=personal_api.POLICY_KEY, value='yes'), current_user=identity('admin', is_admin=True), db=db))
    assert exc.value.status_code == 409


def test_disabled_feature_blocks_writes_and_dispatch_but_allows_removal(client, db):
    save(client)
    client.actor['identity'] = identity('admin', is_admin=True)
    client.put('/admin/personal-api-policy', json={'enabled': False})
    client.actor['identity'] = identity()
    state = client.get('/user/api-settings').json()
    assert state['configured'] and state['enabled'] and not state['active'] and not state['available']
    assert save(client).status_code == 403
    assert client.post('/user/api-settings/verify').status_code == 403
    assert AIService(db, username='alice').config['api_key_openai'] == 'system-openai-test'
    assert client.delete('/user/api-settings').json()['configured'] is False
    db.query(models.Config).filter_by(key=personal_api.POLICY_KEY).delete()
    db.commit()
    assert not personal_api.feature_enabled(db), 'disabled by default on existing installations'


def test_missing_or_rotated_encryption_key_never_uses_system_credentials(client, db, monkeypatch):
    save(client)
    monkeypatch.setenv('PERSONAL_API_ENCRYPTION_KEY', Fernet.generate_key().decode())
    service = AIService(db, username='alice')
    assert 'api_key_openai' not in service.config
    with pytest.raises(AIError, match='save the key again'):
        service.get_response('hello', 'system', 'generic')
    assert save(client, api_key='').status_code == 409
    assert save(client, api_key='new-test-key').status_code == 200
    monkeypatch.delenv('PERSONAL_API_ENCRYPTION_KEY')
    assert save(client).status_code == 409
    client.actor['identity'] = identity('admin', is_admin=True)
    assert client.put('/admin/personal-api-policy', json={'enabled': True}).status_code == 409
    assert client.put('/admin/personal-api-policy', json={'enabled': False}).status_code == 200


def test_swapped_ciphertext_is_rejected(client, db):
    save(client)
    alice = db.query(models.PersonalAPISettings).one()
    client.actor['identity'] = identity('bob')
    save(client)
    bob = db.query(models.PersonalAPISettings).filter_by(username='bob').one()
    bob.encrypted_key = alice.encrypted_key
    db.commit()
    with pytest.raises(personal_api.PersonalAPIError):
        personal_api.decrypt_key(bob)


@pytest.mark.parametrize('streaming', [False, True])
def test_user_target_overrides_counselor_and_never_falls_back(client, db, streaming):
    save(client)
    db.add(models.Config(key='ai_fallback_targets', value='[{"provider":"anthropic","model":"system-model"}]'))
    db.add(models.Config(key='monthly_budget_usd', value='0.01'))
    db.commit()
    service = AIService(db, username='alice')
    assert service.config.get('api_key_anthropic') is None
    assert service._targets('ollama', 'local-model') == [('openai', 'own-model')]
    seen = []
    def answer(message, system, model, **kwargs):
        seen.append(model)
        assert service._get_api_key('api_key_openai') == 'personal-test-key'
        return 'personal response'
    service._providers['openai'].update(call=answer, stream=None)
    kwargs = {'provider': 'anthropic', 'model': 'other-model'}
    if streaming:
        output = ''.join(item['text'] for item in service.stream_response('hello', 'system', 'generic', **kwargs))
    else:
        output = service.get_response('hello', 'system', 'generic', **kwargs)
    assert output == 'personal response'
    assert seen == ['own-model']
    assert service.last_provider == 'openai'
    def fail(*args, **kwargs):
        raise RuntimeError('provider down')
    service._providers['openai'].update(call=fail, stream=None)
    service._providers['anthropic'].update(call=lambda *a, **k: pytest.fail('system fallback used'))
    with pytest.raises(AIError):
        if streaming: list(service.stream_response('hello', 'system', 'generic'))
        else: service.get_response('hello', 'system', 'generic')


def test_direct_calls_and_summaries_use_personal_model(client, db):
    save(client)
    service = AIService(db, username='alice')
    models_seen = []
    service._providers['openai']['call'] = lambda m, s, model, **k: models_seen.append(model) or 'result'
    assert service.call_model('anthropic', 'system-model', 'message', 'system') == 'result'
    assert service.generate_summary('message', 'answer') == 'result'
    assert models_seen == ['own-model', 'own-model']
    assert AIService(db, username='bob').personal_target is None


def test_verification_uses_only_the_current_accounts_key(client, monkeypatch):
    save(client, enabled=False)
    seen = []
    def verify(self, provider):
        seen.append((provider, self._get_api_key('api_key_openai')))
        return True
    monkeypatch.setattr(AIService, 'verify_api_key', verify)
    assert client.post('/user/api-settings/verify').json() == {'working': True}
    assert seen == [('openai', 'personal-test-key')]
    client.actor['identity'] = identity('bob')
    assert client.post('/user/api-settings/verify').status_code == 409


def test_unauthenticated_users_cannot_access_credentials(client):
    client.actor['identity'] = auth._anonymous_identity()
    assert client.get('/user/api-settings').status_code == 401
    assert save(client).status_code == 401
    assert client.delete('/user/api-settings').status_code == 401
    assert client.get('/admin/personal-api-policy').status_code == 401


def test_personal_costs_do_not_lock_system_budget(db):
    db.add(models.Config(key='monthly_budget_usd', value='1'))
    db.add(models.Log(action='chat_message', cost_usd=100, details={'credential_source': 'personal'}))
    db.commit()
    assert not AIService(db)._budget_is_locked()
    db.add(models.Log(action='chat_message', cost_usd=2, details={}))
    db.commit()
    assert AIService(db)._budget_is_locked()
