"""Multiple own connections, private counselors and routing in isolated PostgreSQL."""
import asyncio
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, Response, HTTPException
from fastapi.testclient import TestClient

from backend import auth, database, models, personal_api
from backend.ai_service import AIService, AIError
from backend.chatgpt_connections import bind_identity
from backend.routes import counselors, personal_api as routes
from backend.tests.test_personal_api import db, identity  # pytest fixtures


@pytest.fixture
def client(db):
    app = FastAPI()
    app.include_router(routes.router)
    app.include_router(counselors.router)
    current = {'identity': identity()}
    app.dependency_overrides[database.get_db] = lambda: db
    app.dependency_overrides[auth.get_identity] = lambda: current['identity']
    app.dependency_overrides[auth.get_identity_view_as] = lambda: current['identity']
    with TestClient(app, headers={'X-Requested-With': 'CounselorBot'}) as c:
        c.actor = current
        yield c


def connect(client, name='Account 1', provider='openrouter', model='qwen/test:free', **values):
    data = dict(name=name, provider=provider, model=model, api_key='fake-test-key')
    data.update(values)
    return client.post('/user/api-connections', json=data)


def private_counselor(client, name='My counselor', persona='Aiutami a scegliere un piccolo passo concreto.'):
    return client.post('/user/counselors', json=dict(name=name, description='Private description', persona=persona))


def route(client, default, bindings=(), enabled=True):
    return client.put('/user/api-routing', json=dict(enabled=enabled, default_connection_id=default, bindings=list(bindings)))


def test_multiple_keys_for_same_provider_and_distinct_accounts_are_private(client, db):
    first = connect(client).json()['connections'][0]['id']
    second = next(c['id'] for c in connect(client, name='Account 2', api_key='second-fake-key').json()['connections'] if c['name'] == 'Account 2')
    state = client.get('/user/api-connections').json()
    assert len(state['connections']) == 2 and first != second
    assert 'fake-test-key' not in str(state) and 'encrypted_key' not in str(state)
    records = db.query(models.PersonalAPIConnection).all()
    assert {personal_api.decrypt_key(r) for r in records} == {'fake-test-key', 'second-fake-key'}
    client.actor['identity'] = identity('bob')
    assert client.get('/user/api-connections').json()['connections'] == []
    for method, suffix, body in [('put', '', dict(name='stolen', provider='openrouter', model='model', api_key='other')), ('delete', '', None), ('post', '/test', None)]:
        kwargs = {'json': body} if body else {}
        assert getattr(client, method)('/user/api-connections/' + first + suffix, **kwargs).status_code == 404
    assert route(client, first).status_code == 404


def test_scoped_models_many_counselors_and_no_shared_mutations(client, db):
    db.add_all([models.Counselor(id=10, name='One', slug='one', persona='One persona', is_active=True),
                models.Counselor(id=11, name='Two', slug='two', is_active=True),
                models.Counselor(id=12, name='Three', slug='three', is_active=True)])
    db.commit()
    a = connect(client, model='first:free').json()['connections'][0]['id']
    b = next(c['id'] for c in connect(client, name='Account 2', provider='openai', model='second-model', api_key='second-key').json()['connections'] if c['name'] == 'Account 2')
    bindings = [{'counselor_id': 10, 'connection_id': b}, {'counselor_id': 11, 'connection_id': b}]
    assert route(client, a, bindings).status_code == 200
    bind_identity(db, identity())
    for cid, expected in [(10, ('openai', 'second-model')), (11, ('openai', 'second-model')), (12, ('openrouter', 'first:free')), (None, ('openrouter', 'first:free'))]:
        personal_api.bind_counselor(db, cid)
        service = AIService(db)
        assert service._targets('ollama', 'school') == [expected]
    assert db.get(models.Counselor, 10).persona == 'One persona'
    assert db.get(models.Counselor, 10).preset_id is None
    listing = asyncio.run(counselors.list_public_counselors(response=Response(), db=db, lang='it', questionnaire_type=None, language=None, identity=identity()))
    assert {c.id: c.model for c in listing} == {10: 'second-model', 11: 'second-model', 12: 'first:free'}
    assert route(client, None, bindings).status_code == 200
    personal_api.bind_counselor(db, 12)
    assert AIService(db)._targets(None, None)[0][0] != 'openrouter'
    assert route(client, a, bindings, enabled=False).status_code == 200
    personal_api.bind_counselor(db, 10)
    assert AIService(db).personal_target is None


def test_private_counselor_crud_preserves_any_language_and_is_owner_only(client, db):
    result = private_counselor(client)
    assert result.status_code == 200
    c = result.json()
    assert c['persona'].startswith('Aiutami')
    assert db.get(models.Counselor, c['id']).owner_username == 'alice'
    assert personal_api.visible_counselor(db, c['id'], 'alice') is not None
    assert personal_api.visible_counselor(db, c['id'], 'bob') is None
    assert asyncio.run(counselors.list_counselors(current_user=identity('admin', is_admin=True), db=db)) == []
    client.actor['identity'] = identity('bob')
    assert client.get('/user/counselors').json() == []
    assert client.put(f"/user/counselors/{c['id']}", json=c | {'id': c['id']}).status_code == 422
    assert client.put(f"/user/counselors/{c['id']}", json={k: v for k, v in c.items() if k != 'id'}).status_code == 404
    assert client.delete(f"/user/counselors/{c['id']}").status_code == 404
    b = connect(client).json()['connections'][0]['id']
    assert route(client, b, [{'counselor_id': c['id'], 'connection_id': b}]).status_code == 422
    client.actor['identity'] = identity()
    assert client.put(f"/user/counselors/{c['id']}", json=dict(name='Updated', description='', persona='Hjälp mig på svenska.')).json()['persona'] == 'Hjälp mig på svenska.'
    assert client.delete(f"/user/counselors/{c['id']}").status_code == 200
    assert db.get(models.Counselor, c['id']) is None


def test_empty_or_foreign_associations_cannot_activate_an_account(client, db):
    assert route(client, None).status_code == 422
    cid = private_counselor(client).json()['id']
    key = connect(client).json()['connections'][0]['id']
    assert route(client, key, [{'counselor_id': cid, 'connection_id': key}] * 2).status_code == 422
    assert private_counselor(client, persona='   ').status_code == 422
    assert connect(client, provider='https://arbitrary.example').status_code == 422


def test_key_preservation_and_connection_removal_do_not_resurrect_credentials(client, db):
    key = connect(client).json()['connections'][0]['id']
    counselor = private_counselor(client).json()['id']
    assert route(client, key, [{'counselor_id': counselor, 'connection_id': key}]).status_code == 200
    assert client.put(f'/user/api-connections/{key}', json=dict(name='Renamed', provider='openrouter', model='new:free', api_key='')).status_code == 200
    assert personal_api.decrypt_key(db.get(models.PersonalAPIConnection, key)) == 'fake-test-key'
    assert client.put(f'/user/api-connections/{key}', json=dict(name='Renamed', provider='openai', model='new', api_key='')).status_code == 422
    removed = client.delete(f'/user/api-connections/{key}').json()
    assert removed['connections'] == [] and removed['bindings'] == [] and not removed['enabled']
    assert db.get(models.Counselor, counselor) is not None
    personal_api.migrate_legacy_connections(db)
    db.commit()
    assert client.get('/user/api-connections').json()['connections'] == []


def test_legacy_key_migration_is_idempotent_and_keeps_ciphertext(client, db):
    encrypted = personal_api.encrypt_key('alice', 'openai', 'legacy-fake-key')
    db.add(models.PersonalAPISettings(username='alice', provider='openai', model_name='legacy-model', encrypted_key=encrypted, enabled=True))
    db.commit()
    personal_api.migrate_legacy_connections(db); db.commit()
    personal_api.migrate_legacy_connections(db); db.commit()
    state = client.get('/user/api-connections').json()
    assert state['enabled'] and len(state['connections']) == 1
    c = db.get(models.PersonalAPIConnection, state['default_connection_id'])
    assert c.encrypted_key == encrypted and c.model_name == 'legacy-model'
    assert personal_api.decrypt_key(c) == 'legacy-fake-key'
    assert client.delete('/user/api-connections/' + c.id).status_code == 200
    personal_api.migrate_legacy_connections(db); db.commit()
    assert client.get('/user/api-connections').json()['connections'] == []


def test_model_connection_test_is_explicit_and_uses_own_saved_connection(client, db, monkeypatch):
    key = connect(client).json()['connections'][0]['id']
    seen = []
    def answer(self, message, system, mode, **kw):
        seen.append(self._targets('ollama', 'school'))
        assert message == 'Reply with OK.' and kw['max_tokens'] == 64
        assert self.config['api_key_openrouter'] == 'fake-test-key'
        assert 'api_key_openai' not in self.config
        return 'OK'
    monkeypatch.setattr(AIService, 'get_response', answer)
    assert seen == [], 'saving never calls an LLM'
    assert client.post(f'/user/api-connections/{key}/test').json() == {'working': True}
    assert seen == [[('openrouter', 'qwen/test:free')]]
    def broken(*args, **kwargs):
        raise AIError('Private upstream text must not be exposed', code='personalAPI.errors.quota')
    monkeypatch.setattr(AIService, 'get_response', broken)
    result = client.post(f'/user/api-connections/{key}/test')
    assert result.json() == {'working': False, 'error_code': 'personalAPI.errors.quota'}
    assert 'Private upstream' not in result.text


@pytest.mark.parametrize('status,body,expected', [(401, {}, 'authentication'), (402, {}, 'quota'), (429, {}, 'rateLimit'), (404, {}, 'modelUnavailable'), (400, {}, 'invalidRequest'), (503, {}, 'connection'), (429, {'message': 'Daily limit exceeded'}, 'quota')])
def test_provider_error_classifications_never_echo_upstream_messages(status, body, expected):
    assert personal_api.connection_error_code(SimpleNamespace(status_code=status, body=body)) == 'personalAPI.errors.' + expected


def test_disabled_policy_hides_private_counselors_and_blocks_all_new_writes(client, db):
    c = private_counselor(client).json()['id']
    key = connect(client).json()['connections'][0]['id']
    db.query(models.Config).filter_by(key=personal_api.POLICY_KEY).update({'value': 'false'}); db.commit()
    assert not client.get('/user/api-connections').json()['available']
    assert personal_api.visible_counselor(db, c, 'alice') is None
    assert client.get('/user/counselors').status_code == 403
    assert connect(client).status_code == 403
    assert route(client, key).status_code == 403
    assert client.post(f'/user/api-connections/{key}/test').status_code == 403
    assert client.delete(f'/user/api-connections/{key}').status_code == 200

@pytest.mark.parametrize('streaming', [False, True])
def test_private_persona_and_assigned_model_are_used_and_provider_error_does_not_fallback(client, db, monkeypatch, streaming):
    from backend.routes.chat import _resolve_counselor
    c = private_counselor(client, persona='Aiutami nella mia lingua, con esempi concreti.').json()['id']
    key = connect(client).json()['connections'][0]['id']
    assert route(client, None, [{'counselor_id': c, 'connection_id': key}]).status_code == 200
    bind_identity(db, identity())
    personal_api.bind_counselor(db, c)
    _, _, persona, name, _, _ = _resolve_counselor(db, c)
    service = AIService(db)
    def answer(message, system, model, **kwargs):
        assert persona in system and name == 'My counselor'
        assert model == 'qwen/test:free' and service.config['api_key_openrouter'] == 'fake-test-key'
        return 'Test response'
    service._providers['openrouter'].update(call=answer, stream=None)
    if streaming:
        assert ''.join(item['text'] for item in service.stream_response('Question', persona, 'generic')) == 'Test response'
    else:
        assert service.get_response('Question', persona, 'generic') == 'Test response'
    service._providers['openrouter'].update(call=lambda *args, **kwargs: (_ for _ in ()).throw(AIError('Private details', code='personalAPI.errors.modelUnavailable')))
    service._providers['openai'].update(call=lambda *args, **kwargs: pytest.fail('paid fallback'))
    with pytest.raises(AIError) as error:
        if streaming: list(service.stream_response('Question', persona, 'generic'))
        else: service.get_response('Question', persona, 'generic')
    assert error.value.code == 'personalAPI.errors.modelUnavailable'
    bind_identity(db, identity('bob'))
    with pytest.raises(HTTPException) as denied:
        _resolve_counselor(db, c)
    assert denied.value.status_code == 404


def test_existing_schema_upgrade_precedes_prompt_queries_and_is_repeatable(db):
    from sqlalchemy import text, inspect
    db.execute(text('ALTER TABLE counselors DROP COLUMN owner_username'))
    db.execute(text('ALTER TABLE pqbl_documents DROP COLUMN counselor_id'))
    personal_api.ensure_schema(db.connection())
    personal_api.ensure_schema(db.connection())
    assert 'owner_username' in {c['name'] for c in inspect(db.connection()).get_columns('counselors')}
    assert 'counselor_id' in {c['name'] for c in inspect(db.connection()).get_columns('pqbl_documents')}
    assert db.query(models.Counselor).count() == 0


def test_ciphertext_is_also_bound_to_its_connection_within_the_same_account(client, db):
    first = connect(client).json()['connections'][0]['id']
    second = next(c['id'] for c in connect(client, name='Another account').json()['connections'] if c['id'] != first)
    a, b = db.get(models.PersonalAPIConnection, first), db.get(models.PersonalAPIConnection, second)
    b.encrypted_key = a.encrypted_key
    db.flush()
    with pytest.raises(personal_api.PersonalAPIError):
        personal_api.decrypt_key(b)
