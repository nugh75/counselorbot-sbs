"""Authenticated macOS downloads: disposable ZIP and mocked SSO, no database."""
import io
from pathlib import Path
import zipfile
from unittest.mock import Mock

from fastapi import FastAPI
from fastapi.testclient import TestClient
import httpx
import pytest

from backend import auth, database
from backend.routes import chatgpt


@pytest.fixture
def helper_client(monkeypatch, tmp_path):
    monkeypatch.setenv("CHATGPT_MACOS_HELPER_DIR", str(tmp_path))
    monkeypatch.setattr(auth, "FORWARD_AUTH_SHARED_SECRET", "")
    monkeypatch.setattr(auth, "AI4AUTH_VERIFY_URL", "http://ai4auth:9091/api/verify")
    monkeypatch.setattr(auth, "AI4AUTH_PUBLIC_HOST", "counselorbot.labform.net")
    verified_requests = []

    def verify(request):
        verified_requests.append(request)
        if request.headers.get("Cookie") != "ai4auth_session=fixture-owner":
            return httpx.Response(401)
        return httpx.Response(200, headers={"Remote-User": "fixture.owner", "Remote-Groups": "studenti"})

    real_async_client = httpx.AsyncClient
    monkeypatch.setattr(auth.httpx, "AsyncClient", lambda **kwargs: real_async_client(
        transport=httpx.MockTransport(verify), **kwargs))
    db = object()
    status = Mock(return_value={"available": True, "connected": False})
    monkeypatch.setattr(chatgpt.accounts, "status", status)
    app = FastAPI()
    app.include_router(chatgpt.router, prefix="/api")
    app.dependency_overrides[database.get_db] = lambda: db
    with TestClient(app) as client:
        yield client, tmp_path, status, db, verified_requests


def make_helper(directory):
    path = directory / chatgpt.MACOS_HELPER_FILENAME
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("CounselorBot-ChatGPT.app/Contents/fixture.txt", "Disposable test helper")
    return path.read_bytes()


SESSION = {"Cookie": "ai4auth_session=fixture-owner"}
DOWNLOAD = "/api/chatgpt/helper/macos"


def test_download_requires_verified_console_session(helper_client):
    client, directory, status, _, requests = helper_client
    make_helper(directory)
    for headers in ({}, {"Remote-User": "forged.owner", "Remote-Groups": "admins"},
                    {"Cookie": "ai4auth_session=invalid", "Remote-User": "forged.owner"}):
        response = client.get(DOWNLOAD, headers=headers)
        assert response.status_code == 401
        assert response.json() == {"detail": "chatgpt.errors.signIn"}
        assert response.headers["Cache-Control"] == "no-store"
    status.assert_not_called()
    assert len(requests) == 1


@pytest.mark.parametrize("extra_headers,query", [({"X-View-As": "studente.demo"}, ""), ({}, "?view_as=studente.demo")])
def test_preview_identity_cannot_download(helper_client, extra_headers, query):
    client, directory, _, _, _ = helper_client
    make_helper(directory)
    response = client.get(DOWNLOAD + query, headers={**SESSION, **extra_headers})
    assert response.status_code == 403
    assert response.json() == {"detail": "chatgpt.errors.signIn"}
    assert response.headers["Cache-Control"] == "no-store"


def test_owner_download_is_zip_attachment_without_cache(helper_client):
    client, directory, status, _, requests = helper_client
    payload = make_helper(directory)
    response = client.get(DOWNLOAD, headers=SESSION)
    assert response.status_code == 200
    assert response.content == payload
    assert response.headers["Content-Type"] == "application/zip"
    assert response.headers["Content-Disposition"] == 'attachment; filename="CounselorBot-ChatGPT.zip"'
    assert response.headers["Cache-Control"] == "no-store"
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        assert archive.read("CounselorBot-ChatGPT.app/Contents/fixture.txt") == b"Disposable test helper"
    assert requests[0].headers["Host"] == "counselorbot.labform.net"
    assert requests[0].headers["Cookie"] == SESSION["Cookie"]
    status.assert_not_called()


def test_missing_helper_is_safe_404_and_status_reports_availability(helper_client):
    client, directory, status, db, _ = helper_client
    response = client.get(DOWNLOAD, headers=SESSION)
    assert response.status_code == 404
    assert response.json() == {"detail": "chatgpt.errors.unavailable"}
    assert str(directory) not in response.text
    assert response.headers["Cache-Control"] == "no-store"
    response = client.get("/api/user/chatgpt", headers=SESSION)
    assert response.json() == {"available": True, "connected": False, "macos_helper_available": False}
    assert response.headers["Cache-Control"] == "no-store"
    status.assert_called_once_with(db, "fixture.owner")
    make_helper(directory)
    assert client.get("/api/user/chatgpt", headers=SESSION).json()["macos_helper_available"] is True


def test_helper_must_be_file_and_default_path_needs_no_artifact(helper_client, monkeypatch):
    client, directory, _, _, _ = helper_client
    (directory / chatgpt.MACOS_HELPER_FILENAME).mkdir()
    assert client.get(DOWNLOAD, headers=SESSION).status_code == 404
    assert client.get("/api/user/chatgpt", headers=SESSION).json()["macos_helper_available"] is False
    monkeypatch.delenv("CHATGPT_MACOS_HELPER_DIR")
    assert chatgpt.macos_helper_path() == Path(chatgpt.__file__).resolve().parents[2] / "dist" / "chatgpt-macos" / "CounselorBot-ChatGPT.zip"


def test_authenticated_proxy_identity_without_browser_cookie_cannot_download(helper_client):
    client, directory, _, _, _ = helper_client
    make_helper(directory)
    client.app.dependency_overrides[auth.get_identity] = lambda: {"authenticated": True, "username": "fixture.owner"}
    assert client.get(DOWNLOAD).status_code == 401
