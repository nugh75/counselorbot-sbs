"""Upload/auth boundaries without database writes or audio-provider calls."""
import base64
import json
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, database
from backend.routes import audio_input
from backend.privacy import gateway, policy
from backend.privacy.errors import AuditUnavailable, EgressBlockedError
from backend.privacy.types import AIRequest, Decision, LegalBasis, PurposePolicy, Target


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *args):
        return self

    def all(self):
        return self.rows


class FakeSession:
    """Only the transcription engine/model config rows are ever read here."""
    def __init__(self, values=None):
        self.rows = [SimpleNamespace(key=key, value=value) for key, value in (values or {}).items()]

    def query(self, *args):
        return FakeQuery(self.rows)


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(audio_input.router)
    app.dependency_overrides[auth.get_identity] = lambda: {'authenticated': True, 'is_admin': False, 'username': 'test'}
    app.dependency_overrides[database.get_db] = lambda: FakeSession()
    with TestClient(app) as client:
        yield client


def configure_model(client, value, engine=None):
    values = {'transcription_model': value} if engine is None else {'transcription_model': value, 'transcription_engine': engine}
    client.app.dependency_overrides[database.get_db] = lambda: FakeSession(values)


def upload(client, content=b'audio', language=None, fallback=None):
    data = {} if language is None else {'language': language}
    if fallback is not None:
        data['fallback_language'] = fallback
    return client.post('/audio/transcribe', files={'audio': ('private-name.wav', content)}, data=data)


def test_auth_required(client):
    client.app.dependency_overrides[auth.get_identity] = lambda: {'authenticated': False}
    assert upload(client).status_code == 401


def test_size_empty_and_language_are_rejected_before_forwarding(client, monkeypatch):
    monkeypatch.setattr(audio_input, 'MAX_BYTES', 3)
    with patch.object(audio_input.httpx, 'AsyncClient') as service:
        assert upload(client, b'').status_code == 400
        assert upload(client, b'1234').status_code == 413
        assert upload(client, b'123', 'xx').status_code == 422
        assert upload(client, b'123', 'auto', 'xx').status_code == 422
        service.assert_not_called()


def forward(client, language=None, fallback=None):
    service = AsyncMock()
    service.post.return_value = httpx.Response(200, json={'text': 'Vorrei organizzare lo studio.', 'language': 'it'})
    with patch.object(audio_input.httpx, 'AsyncClient') as factory:
        factory.return_value.__aenter__.return_value = service
        response = upload(client, language=language, fallback=fallback)
    return response, service.post.call_args


def test_audio_stays_on_local_service_and_detected_language_is_reported(client):
    response, (args, kwargs) = forward(client, 'it')
    assert response.json() == {'text': 'Vorrei organizzare lo studio.', 'language': 'it', 'model': 'large-v3-turbo'}
    assert args == ('http://transcription:8000/transcribe',)
    assert kwargs['data'] == {'language': 'it', 'fallback_language': 'auto', 'model': 'large-v3-turbo',
                              'engine': 'faster-whisper'}
    assert kwargs['files']['audio'] == ('recording', b'audio', 'application/octet-stream')


def test_language_defaults_to_automatic_detection(client):
    _, (_, kwargs) = forward(client)
    assert kwargs['data']['language'] == 'auto'


def test_interface_language_is_forwarded_as_detection_fallback(client):
    _, (_, kwargs) = forward(client, 'auto', 'it')
    assert (kwargs['data']['language'], kwargs['data']['fallback_language']) == ('auto', 'it')


def test_configured_model_is_used_and_unknown_names_fall_back(client):
    configure_model(client, 'large-v3')
    _, (_, kwargs) = forward(client)
    assert kwargs['data']['model'] == 'large-v3'
    configure_model(client, 'gpt-whisper')
    _, (_, kwargs) = forward(client)
    assert kwargs['data']['model'] == 'large-v3-turbo'


@pytest.mark.parametrize('engine,model,expected', [
    ('whisper.cpp', 'base', ('whisper.cpp', 'base')),
    ('whisper.cpp', 'large-v3', ('whisper.cpp', 'small')),
    ('faster-whisper', 'base', ('faster-whisper', 'large-v3-turbo')),
    ('cloud-whisper', 'large-v3', ('faster-whisper', 'large-v3')),
    ('', '', ('faster-whisper', 'large-v3-turbo')),
])
def test_engine_selection_filters_models_and_falls_back(client, engine, model, expected):
    configure_model(client, model, engine)
    _, (_, kwargs) = forward(client)
    assert (kwargs['data']['engine'], kwargs['data']['model']) == expected


@pytest.mark.parametrize('status,code', [(413, 'too_long'), (400, 'invalid_audio'), (503, 'busy')])
def test_actionable_service_errors(client, status, code):
    service = AsyncMock()
    service.post.return_value = httpx.Response(status, json={'detail': code})
    with patch.object(audio_input.httpx, 'AsyncClient') as factory:
        factory.return_value.__aenter__.return_value = service
        response = upload(client)
    assert response.status_code == status
    assert response.json()['detail'] == code


@pytest.mark.parametrize('error,status', [(httpx.ConnectError('internal'), 502), (httpx.ReadTimeout('internal'), 504)])
def test_transport_errors_do_not_expose_internal_details(client, error, status):
    service = AsyncMock()
    service.post.side_effect = error
    with patch.object(audio_input.httpx, 'AsyncClient') as factory:
        factory.return_value.__aenter__.return_value = service
        response = upload(client)
    assert response.status_code == status
    assert 'internal' not in response.text


def test_model_list_is_admin_only(client):
    assert client.get('/audio/models').status_code == 403
    client.app.dependency_overrides[auth.get_identity] = lambda: {'authenticated': True, 'is_admin': True, 'username': 'boss'}
    service = AsyncMock()
    service.get.return_value = httpx.Response(200, json={'default': 'large-v3-turbo', 'models': [
        {'id': 'small', 'loaded': False, 'bytes': 1}, {'id': 'large-v3-turbo', 'loaded': True, 'bytes': 2}]})
    with patch.object(audio_input.httpx, 'AsyncClient') as factory:
        factory.return_value.__aenter__.return_value = service
        body = client.get('/audio/models').json()
    assert body['active'] == 'large-v3-turbo' and body['reachable'] is True
    assert [model['id'] for model in body['available']] == ['small', 'large-v3-turbo']


@pytest.mark.parametrize('key,value', [('transcription_engine', 'openrouter'),
                                     ('transcription_model', 'openai/whisper-1')])
def test_researcher_cannot_change_global_audio_egress_settings(client, key, value):
    from backend.routes import admin

    client.app.include_router(admin.router)
    client.app.dependency_overrides[auth.get_identity] = lambda: {
        'authenticated': True, 'is_admin': False, 'is_researcher': True, 'username': 'researcher'}
    with patch.object(FakeSession, 'query', side_effect=AssertionError('No configuration write allowed')):
        response = client.post('/admin/config', json={'key': key, 'value': value})
    assert response.status_code == 403


def test_model_list_survives_an_unreachable_service(client):
    client.app.dependency_overrides[auth.get_identity] = lambda: {'authenticated': True, 'is_admin': True, 'username': 'boss'}
    service = AsyncMock()
    service.get.side_effect = httpx.ConnectError('internal')
    with patch.object(audio_input.httpx, 'AsyncClient') as factory:
        factory.return_value.__aenter__.return_value = service
        body = client.get('/audio/models').json()
    assert body == {'active': 'large-v3-turbo', 'default': 'large-v3-turbo', 'key': 'transcription_model',
                    'engine': 'faster-whisper', 'default_engine': 'faster-whisper', 'engine_key': 'transcription_engine',
                    'default_models': audio_input.DEFAULT_MODELS,
                    'available': [], 'reachable': False,
                    'providers': {name: {'configured': bool(audio_input.resolve_api_secret(FakeSession(), name).value)}
                                  for name in audio_input.ONLINE}}


@pytest.fixture
def online(monkeypatch):
    """Real strict gateway, fake purpose/grants/audit, no DB or provider network."""
    monkeypatch.setenv('PRIVACY_GATEWAY_MODE', 'strict')
    monkeypatch.setenv('API_KEY_OPENROUTER', 'synthetic-openrouter-key')
    monkeypatch.setenv('API_KEY_MISTRAL', 'synthetic-mistral-key')
    monkeypatch.delenv('OPENROUTER_API_KEY', raising=False)
    active = PurposePolicy('guided_chat', True, LegalBasis.PUBLIC_TASK, False)
    monkeypatch.setattr(gateway, '_resolve_purposes', lambda ctx: (active, False))
    monkeypatch.setattr(gateway, '_no_pid', lambda subject: 'synthetic-pid')
    monkeypatch.setattr(policy, 'authorize_data_access', lambda *args: Decision(True, 'ok'))
    events = []
    monkeypatch.setattr(policy, 'record_privacy_event', events.append)
    return events


@contextmanager
def provider_http(status=200, body=None, error=None):
    requests = []
    real_client = httpx.AsyncClient

    def handle(request):
        requests.append(request)
        if error:
            raise error
        return httpx.Response(status, json=body if body is not None else
                              {'text': 'Frase sintetica.', 'usage': {'seconds': 1}})

    with patch.object(audio_input.httpx, 'AsyncClient',
                      side_effect=lambda **kwargs: real_client(transport=httpx.MockTransport(handle), **kwargs)):
        yield requests


@pytest.mark.parametrize('engine', ['openrouter', 'mistral'])
@pytest.mark.parametrize('language,fallback,expected', [('de', 'it', 'de'), ('auto', 'it', 'it'),
                                                       ('auto', 'auto', None)])
def test_online_contract_language_and_no_local_service(client, online, engine, language, fallback, expected, caplog):
    caplog.set_level('DEBUG')
    configure_model(client, audio_input.DEFAULT_MODELS[engine], engine)
    with provider_http() as requests:
        response = upload(client, language=language, fallback=fallback)
    assert response.json() == {'text': 'Frase sintetica.', 'language': expected or 'auto',
                               'model': audio_input.DEFAULT_MODELS[engine]}
    assert len(requests) == 1 and str(requests[0].url) == audio_input.ONLINE[engine]
    request = requests[0]
    assert request.headers['authorization'] == f'Bearer synthetic-{engine}-key'
    assert request.extensions['timeout'] == {'connect': 10, 'read': 300, 'write': 300, 'pool': 300}
    if engine == 'openrouter':
        payload = json.loads(request.content)
        assert payload == {'model': audio_input.DEFAULT_MODELS[engine],
                           'input_audio': {'data': base64.b64encode(b'audio').decode(), 'format': 'wav'},
                           **({'language': expected} if expected else {})}
    else:
        assert 'multipart/form-data' in request.headers['content-type']
        assert b'name="file"; filename="recording.wav"' in request.content
        assert b'voxtral-mini-latest' in request.content
        if expected:
            assert f'name="language"\r\n\r\n{expected}\r\n'.encode() in request.content
        else:
            assert b'name="language"' not in request.content
    assert b'private-name' not in request.content
    assert len(online) == 1 and online[0].target == engine
    assert online[0].categories_count == {}
    assert 'Frase sintetica.' not in caplog.text
    assert 'synthetic-' not in caplog.text
    assert base64.b64encode(b'audio').decode() not in caplog.text


@pytest.mark.parametrize('engine', ['openrouter', 'mistral'])
def test_missing_provider_key_fails_without_http(client, monkeypatch, engine):
    monkeypatch.delenv(f'API_KEY_{engine.upper()}', raising=False)
    monkeypatch.delenv('OPENROUTER_API_KEY', raising=False)
    configure_model(client, '', engine)
    with patch.object(audio_input.httpx, 'AsyncClient') as factory:
        assert upload(client).json() == {'detail': 'unavailable'}
        assert upload(client).status_code == 503
        factory.assert_not_called()


@pytest.mark.parametrize('engine', ['openrouter', 'mistral'])
def test_online_custom_model_and_provider_language(client, online, engine):
    model = 'openai/whisper-1' if engine == 'openrouter' else 'voxtral-mini-2602'
    configure_model(client, model, engine)
    with provider_http(body={'text': 'Synthetic phrase.', 'language': 'sv'}) as requests:
        response = upload(client)
    assert response.json() == {'text': 'Synthetic phrase.', 'language': 'sv', 'model': model}
    assert len(requests) == 1
    assert model.encode() in requests[0].content


@pytest.mark.parametrize('engine', ['openrouter', 'mistral'])
@pytest.mark.parametrize('status,body,detail', [(401, {'error': 'sensitive'}, 'unavailable'),
    (302, {}, 'unavailable'),
    (429, {'error': 'sensitive'}, 'busy'), (500, {'error': 'sensitive'}, 'unavailable'),
    (200, {'text': None}, 'unavailable'), (200, [], 'unavailable')])
def test_online_provider_errors_are_sanitized(client, online, engine, status, body, detail):
    configure_model(client, '', engine)
    with provider_http(status, body):
        response = upload(client)
    assert response.status_code == 503
    assert response.json() == {'detail': detail}


@pytest.mark.parametrize('engine', ['openrouter', 'mistral'])
@pytest.mark.parametrize('error,status,detail', [(httpx.ReadTimeout('secret'), 504, 'timeout'),
                                               (httpx.ConnectError('secret'), 503, 'unavailable')])
def test_online_transport_failure(client, online, engine, error, status, detail):
    configure_model(client, '', engine)
    with provider_http(error=error):
        response = upload(client)
    assert response.status_code == status and response.json() == {'detail': detail}


@pytest.mark.parametrize('value,expected', [('', 'mistralai/voxtral-mini-transcribe'),
    ('openai/whisper-1', 'openai/whisper-1'), (' future/transcriber ', 'future/transcriber'),
    ('bad model', 'mistralai/voxtral-mini-transcribe'),
    ('bad\x00model', 'mistralai/voxtral-mini-transcribe'),
    ('bad\x7fmodel', 'mistralai/voxtral-mini-transcribe'),
    ('a' * 201, 'mistralai/voxtral-mini-transcribe')])
def test_online_model_ids_are_configurable(value, expected):
    assert audio_input.selected(FakeSession({'transcription_engine': 'openrouter',
                                            'transcription_model': value})) == ('openrouter', expected)


@pytest.mark.parametrize('filename,mime,expected', [('x.webm', 'audio/webm;codecs=opus', 'webm'),
    ('x', 'audio/mp4', 'mp4'), ('x.OGG', 'application/octet-stream', 'ogg'),
    ('x.flac', None, 'flac')])
def test_online_audio_formats(filename, mime, expected):
    assert audio_input.audio_format(filename, mime) == expected


def test_online_unknown_format_is_rejected_before_network(client, online):
    configure_model(client, '', 'openrouter')
    with provider_http() as requests:
        response = client.post('/audio/transcribe', files={'audio': ('x.bin', b'fake', 'application/octet-stream')})
    assert response.status_code == 400 and requests == []


@pytest.mark.parametrize('failure', ['purpose', 'authorization', 'audit'])
def test_online_strict_privacy_failure_prevents_http(client, online, monkeypatch, failure):
    configure_model(client, '', 'openrouter')
    if failure == 'purpose':
        monkeypatch.setattr(gateway, '_resolve_purposes', lambda ctx: (None, False))
    elif failure == 'authorization':
        monkeypatch.setattr(policy, 'authorize_data_access', lambda *args: Decision(False))
    else:
        def fail(event):
            raise AuditUnavailable()
        monkeypatch.setattr(policy, 'record_privacy_event', fail)
    with provider_http() as requests:
        response = upload(client)
    assert response.status_code == 503 and requests == []


@pytest.mark.parametrize('kind,provider,host,texts,images,opt_in', [
    ('transcription', 'openrouter', audio_input.ONLINE['openrouter'], [], [], False),
    ('vision', 'openrouter', audio_input.ONLINE['openrouter'], [], [], True),
    ('transcription', 'unknown', 'https://example.com', [], [], True),
    ('transcription', 'unknown', None, [], [], True),
    ('transcription', 'mistral', 'https://example.com', [], [], True),
    ('transcription', 'mistral', audio_input.ONLINE['mistral'], ['private'], [], True),
    ('transcription', 'mistral', audio_input.ONLINE['mistral'], [], [b'image'], True),
])
def test_online_opt_in_does_not_allow_other_egress(online, kind, provider, host, texts, images, opt_in):
    with pytest.raises(EgressBlockedError):
        gateway.AIGateway(allow_external_transcription=opt_in).prepare(
            AIRequest(kind, Target(provider, 'fake', host), texts=texts, images=images, audio=b'fake'),
            gateway.context_for('test'))


def test_admin_only_receives_key_presence_with_local_service_down(client, online, monkeypatch):
    monkeypatch.delenv('API_KEY_MISTRAL')
    client.app.dependency_overrides[auth.get_identity] = lambda: {'authenticated': True, 'is_admin': True, 'username': 'boss'}
    service = AsyncMock()
    service.get.side_effect = httpx.ConnectError('internal')
    with patch.object(audio_input.httpx, 'AsyncClient') as factory:
        factory.return_value.__aenter__.return_value = service
        response = client.get('/audio/models')
    assert response.json()['providers'] == {'openrouter': {'configured': True}, 'mistral': {'configured': False}}
    assert response.json()['engine'] == 'faster-whisper'
    assert 'synthetic-' not in response.text
