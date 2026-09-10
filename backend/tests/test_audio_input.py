"""Upload/auth boundaries without database writes or audio-provider calls."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, database
from backend.routes import audio_input


class FakeQuery:
    def __init__(self, row):
        self.row = row

    def filter(self, *args):
        return self

    def first(self):
        return self.row


class FakeSession:
    """Only the transcription-model config row is ever read here."""
    def __init__(self, row=None):
        self.row = row

    def query(self, *args):
        return FakeQuery(self.row)


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(audio_input.router)
    app.dependency_overrides[auth.get_identity] = lambda: {'authenticated': True, 'is_admin': False, 'username': 'test'}
    app.dependency_overrides[database.get_db] = lambda: FakeSession()
    with TestClient(app) as client:
        yield client


def configure_model(client, value):
    client.app.dependency_overrides[database.get_db] = lambda: FakeSession(SimpleNamespace(value=value))


def upload(client, content=b'audio', language=None):
    data = {} if language is None else {'language': language}
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
        service.assert_not_called()


def forward(client, language=None):
    service = AsyncMock()
    service.post.return_value = httpx.Response(200, json={'text': 'Vorrei organizzare lo studio.', 'language': 'it'})
    with patch.object(audio_input.httpx, 'AsyncClient') as factory:
        factory.return_value.__aenter__.return_value = service
        response = upload(client, language=language)
    return response, service.post.call_args


def test_audio_stays_on_local_service_and_detected_language_is_reported(client):
    response, (args, kwargs) = forward(client, 'it')
    assert response.json() == {'text': 'Vorrei organizzare lo studio.', 'language': 'it', 'model': 'large-v3-turbo'}
    assert args == ('http://transcription:8000/transcribe',)
    assert kwargs['data'] == {'language': 'it', 'model': 'large-v3-turbo'}
    assert kwargs['files']['audio'] == ('recording', b'audio', 'application/octet-stream')


def test_language_defaults_to_automatic_detection(client):
    _, (_, kwargs) = forward(client)
    assert kwargs['data']['language'] == 'auto'


def test_configured_model_is_used_and_unknown_names_fall_back(client):
    configure_model(client, 'large-v3')
    _, (_, kwargs) = forward(client)
    assert kwargs['data']['model'] == 'large-v3'
    configure_model(client, 'gpt-whisper')
    _, (_, kwargs) = forward(client)
    assert kwargs['data']['model'] == 'large-v3-turbo'


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


def test_model_list_survives_an_unreachable_service(client):
    client.app.dependency_overrides[auth.get_identity] = lambda: {'authenticated': True, 'is_admin': True, 'username': 'boss'}
    service = AsyncMock()
    service.get.side_effect = httpx.ConnectError('internal')
    with patch.object(audio_input.httpx, 'AsyncClient') as factory:
        factory.return_value.__aenter__.return_value = service
        body = client.get('/audio/models').json()
    assert body == {'active': 'large-v3-turbo', 'default': 'large-v3-turbo',
                    'key': 'transcription_model', 'available': [], 'reachable': False}
