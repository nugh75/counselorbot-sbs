"""Upload/auth boundaries without database writes or audio-provider calls."""
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth
from backend.routes import audio_input


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(audio_input.router)
    app.dependency_overrides[auth.get_identity] = lambda: {'authenticated': True, 'is_admin': False, 'username': 'test'}
    with TestClient(app) as client:
        yield client


def upload(client, content=b'audio', language='it'):
    return client.post('/audio/transcribe', files={'audio': ('private-name.wav', content)}, data={'language': language})


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


def test_audio_stays_on_local_service_and_selected_language_is_preserved(client):
    service = AsyncMock()
    service.post.return_value = httpx.Response(200, json={'text': 'Vorrei organizzare lo studio.', 'language': 'en'})
    with patch.object(audio_input.httpx, 'AsyncClient') as factory:
        factory.return_value.__aenter__.return_value = service
        response = upload(client)
    assert response.json() == {'text': 'Vorrei organizzare lo studio.', 'language': 'it'}
    args, kwargs = service.post.call_args
    assert args == ('http://transcription:8000/transcribe',)
    assert kwargs['data'] == {'language': 'it'}
    assert kwargs['files']['audio'] == ('recording', b'audio', 'application/octet-stream')


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
