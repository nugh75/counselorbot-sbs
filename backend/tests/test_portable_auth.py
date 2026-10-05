"""Portable SSO trust boundaries, using HTTP fixtures with no database or network."""
import httpx
import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from backend import auth


@pytest.fixture
def sso(monkeypatch):
    monkeypatch.setattr(auth, "FORWARD_AUTH_SHARED_SECRET", "fixture-proxy-secret")
    monkeypatch.setattr(auth, "AI4AUTH_VERIFY_URL", "http://ai4auth:9091/api/verify")
    monkeypatch.setattr(auth, "AI4AUTH_PUBLIC_HOST", "counselorbot.labform.net")
    monkeypatch.setattr(auth, "ADMIN_GROUPS", {"admins", "counselorbot-sbs-admin"})
    verified_requests = []
    verification = {"status": 200, "headers": {
        "Remote-User": "student.fixture",
        "Remote-Email": "student@example.invalid",
        "Remote-Groups": "studenti",
    }}

    def verify(request):
        verified_requests.append(request)
        if verification.get("unavailable"):
            raise httpx.ConnectError("Isolated auth fixture unavailable", request=request)
        return httpx.Response(verification["status"], headers=verification["headers"])

    real_async_client = httpx.AsyncClient
    monkeypatch.setattr(auth.httpx, "AsyncClient", lambda **kwargs: real_async_client(
        transport=httpx.MockTransport(verify), **kwargs))
    app = FastAPI()

    @app.get("/auth/me")
    async def identity(identity=Depends(auth.get_identity)):
        return identity

    @app.get("/admin/check")
    async def administration(identity=Depends(auth.get_current_active_admin)):
        return {"username": identity["username"], "is_admin": identity["is_admin"]}

    with TestClient(app) as client:
        yield client, verified_requests, verification


FORGED_ADMIN = {"Remote-User": "forged.admin", "Remote-Groups": "admins"}


@pytest.mark.parametrize("secret", [None, "wrong-secret"])
def test_untrusted_identity_headers_never_authenticate_without_a_session(sso, secret):
    client, requests, _ = sso
    headers = dict(FORGED_ADMIN)
    if secret is not None:
        headers["X-Forwarded-Auth-Secret"] = secret
    assert client.get("/auth/me", headers=headers).json()["authenticated"] is False
    assert client.get("/admin/check", headers=headers).status_code == 401
    assert requests == []


def test_empty_shared_secret_does_not_trust_identity_headers(sso, monkeypatch):
    client, requests, _ = sso
    monkeypatch.setattr(auth, "FORWARD_AUTH_SHARED_SECRET", "")
    assert client.get("/admin/check", headers=FORGED_ADMIN).status_code == 401
    assert requests == []


@pytest.mark.parametrize("groups,expected", [
    ("admins", True), ("studenti,counselorbot-sbs-admin", True), ("studenti", False),
])
def test_valid_proxy_secret_uses_global_and_service_admin_groups(sso, groups, expected):
    client, requests, _ = sso
    headers = {"X-Forwarded-Auth-Secret": "fixture-proxy-secret",
               "Remote-User": "trusted.fixture", "Remote-Groups": groups}
    identity = client.get("/auth/me", headers=headers).json()
    assert identity["authenticated"] is True
    assert identity["username"] == "trusted.fixture"
    assert identity["is_admin"] is expected
    assert client.get("/admin/check", headers=headers).status_code == (200 if expected else 403)
    assert requests == []


def test_cookie_fallback_uses_verified_identity_and_fixed_public_host(sso):
    client, requests, _ = sso
    headers = {**FORGED_ADMIN, "X-Forwarded-Auth-Secret": "wrong-secret",
               "Cookie": "ai4auth_session=isolated-fixture",
               "Host": "backend:8000", "X-Forwarded-Host": "attacker.example"}
    identity = client.get("/auth/me", headers=headers).json()
    assert identity["username"] == "student.fixture"
    assert identity["is_admin"] is False
    assert identity["groups"] == ["studenti"]
    assert client.get("/admin/check", headers=headers).status_code == 403
    assert len(requests) == 2
    for request, path in zip(requests, ["/auth/me", "/admin/check"]):
        assert request.url == "http://ai4auth:9091/api/verify"
        assert request.headers["Host"] == "counselorbot.labform.net"
        assert request.headers["X-Original-URL"] == f"https://counselorbot.labform.net{path}"
        assert request.headers["Cookie"] == "ai4auth_session=isolated-fixture"
        assert "Remote-User" not in request.headers
        assert "X-Forwarded-Auth-Secret" not in request.headers


def test_cookie_verification_preserves_service_admin_permissions(sso):
    client, requests, verification = sso
    verification["headers"]["Remote-Groups"] = "studenti,counselorbot-sbs-admin"
    response = client.get("/admin/check", headers={"Cookie": "ai4auth_session=isolated-fixture"})
    assert response.status_code == 200
    assert response.json() == {"username": "student.fixture", "is_admin": True}
    assert len(requests) == 1


@pytest.mark.parametrize("status", [401, 403, 500])
def test_denied_or_failed_cookie_verification_never_uses_forged_headers(sso, status):
    client, requests, verification = sso
    verification["status"] = status
    headers = {**FORGED_ADMIN, "Cookie": "ai4auth_session=isolated-fixture"}
    assert client.get("/auth/me", headers=headers).json()["authenticated"] is False
    assert client.get("/admin/check", headers=headers).status_code == 401
    assert len(requests) == 2


def test_auth_connection_failure_denies_administration(sso):
    client, requests, verification = sso
    verification["unavailable"] = True
    response = client.get("/admin/check", headers={**FORGED_ADMIN, "Cookie": "ai4auth_session=isolated-fixture"})
    assert response.status_code == 401
    assert len(requests) == 1
