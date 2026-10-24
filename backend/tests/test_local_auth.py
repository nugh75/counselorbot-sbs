"""Fornitore `local` e sessioni `cb_session` (ADR-0002 §3, F1-06), su Postgres e SQLite.

Usa l'app reale senza lifespan e il database isolato di artifact_database.
"""
import hashlib
from contextlib import nullcontext
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from backend import auth, database, local_auth, models
from backend.main import app
from backend.shell_internal import SECRET_ENV
from backend.tests.artifact_database import artifact_session

SHELL_SECRET = "fixture-shell-secret"
FRONTEND_SECRET = "fixture-frontend-secret"
LOCAL = {"X-CounselorBot-Origin": "local", "X-CounselorBot-Frontend-Secret": FRONTEND_SECRET}
TUNNEL = {"X-CounselorBot-Origin": "tunnel", "X-CounselorBot-Frontend-Secret": FRONTEND_SECRET}


@pytest.fixture
def db():
    with artifact_session() as session:
        yield session


@pytest.fixture
def local(db, monkeypatch):
    monkeypatch.setattr(auth, "AUTH_PROVIDER", "local")
    # A configured proxy secret must not matter with the local provider.
    monkeypatch.setattr(auth, "FORWARD_AUTH_SHARED_SECRET", "fixture-proxy-secret")
    monkeypatch.setenv(SECRET_ENV, SHELL_SECRET)
    monkeypatch.setenv("COUNSELORBOT_FRONTEND_SECRET", FRONTEND_SECRET)
    monkeypatch.setattr(local_auth, "_open_session", lambda: nullcontext(db))
    # Other suites leave auth overrides on the shared app: run with real auth only.
    previous = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    app.dependency_overrides[database.get_db] = lambda: db
    yield TestClient(app, client=("127.0.0.1", 50000))
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous)


def _teacher_link(client):
    response = client.post("/internal/local-auth/teacher-link", headers={"X-CounselorBot-Shell-Secret": SHELL_SECRET})
    assert response.status_code == 200
    body = response.json()
    assert body["expires_in"] == 60
    return body["token"]


def _teacher_cookie(client):
    response = client.post("/local-auth/redeem", json={"token": _teacher_link(client)}, headers=LOCAL)
    assert response.status_code == 204
    return response.cookies[local_auth.COOKIE_NAME]


def _me(client, cookie, headers=LOCAL):
    client.cookies.clear()
    client.cookies.set(local_auth.COOKIE_NAME, cookie)
    return client.get("/auth/me", headers=headers).json()


def test_redeem_sets_a_teacher_session_cookie(local, db):
    response = local.post("/local-auth/redeem", json={"token": _teacher_link(local)}, headers=LOCAL)
    assert response.status_code == 204
    set_cookie = response.headers["set-cookie"]
    assert set_cookie.startswith("cb_session=")
    lowered = set_cookie.lower()
    assert "httponly" in lowered and "samesite=lax" in lowered and "path=/" in lowered
    assert "secure" not in lowered  # http://127.0.0.1
    token = response.cookies[local_auth.COOKIE_NAME]
    row = db.query(models.LocalSession).one()
    assert row.token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert row.kind == "teacher" and row.username == "docente"
    assert row.expires_at - row.created_at == timedelta(days=30)


def test_teacher_identity_is_the_local_admin(local):
    assert _me(local, _teacher_cookie(local)) == {
        "email": "",
        "username": "docente",
        "name": "Docente",
        "groups": ["docenti", "admins"],
        "is_admin": True,
        "is_researcher": False,
        "authenticated": True,
        "auth_provider": "local",
    }


def test_teacher_link_is_single_use(local):
    token = _teacher_link(local)
    assert local.post("/local-auth/redeem", json={"token": token}, headers=LOCAL).status_code == 204
    assert local.post("/local-auth/redeem", json={"token": token}, headers=LOCAL).status_code == 401


def test_teacher_link_expires_after_60_seconds(local, monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(local_auth.time, "monotonic", lambda: clock[0])
    fresh, stale = _teacher_link(local), _teacher_link(local)
    clock[0] += 59
    assert local.post("/local-auth/redeem", json={"token": fresh}, headers=LOCAL).status_code == 204
    clock[0] += 1
    assert local.post("/local-auth/redeem", json={"token": stale}, headers=LOCAL).status_code == 401


def test_unknown_token_is_refused(local):
    assert local.post("/local-auth/redeem", json={"token": "made-up"}, headers=LOCAL).status_code == 401


@pytest.mark.parametrize("headers", [
    TUNNEL,
    {},  # fail-closed: no signed origin
    {"X-CounselorBot-Origin": "local", "X-CounselorBot-Frontend-Secret": "wrong"},
])
def test_redeem_from_tunnel_is_refused_and_keeps_the_link(local, headers):
    token = _teacher_link(local)
    assert local.post("/local-auth/redeem", json={"token": token}, headers=headers).status_code == 401
    assert local.post("/local-auth/redeem", json={"token": token}, headers=LOCAL).status_code == 204


@pytest.mark.parametrize("headers", [
    TUNNEL,
    {},
    {"X-CounselorBot-Origin": "local", "X-CounselorBot-Frontend-Secret": "wrong"},
    {"X-CounselorBot-Origin": "elsewhere", "X-CounselorBot-Frontend-Secret": FRONTEND_SECRET},
])
def test_teacher_session_from_tunnel_is_anonymous(local, headers):
    cookie = _teacher_cookie(local)
    me = _me(local, cookie, headers)
    assert me["authenticated"] is False and me["is_admin"] is False
    local.cookies.clear()
    local.cookies.set(local_auth.COOKIE_NAME, cookie)
    assert local.get("/admin/config/env-status", headers=headers).status_code == 403  # F1-07
    assert local.get("/admin/config/env-status", headers=LOCAL).status_code == 200


def test_revocation_is_immediate(local, db):
    cookie = _teacher_cookie(local)
    assert _me(local, cookie)["authenticated"] is True
    db.query(models.LocalSession).one().revoked_at = local_auth._now()
    db.commit()
    assert _me(local, cookie)["authenticated"] is False


def test_expired_session_is_anonymous(local, db):
    cookie = _teacher_cookie(local)
    db.query(models.LocalSession).one().expires_at = local_auth._now() - timedelta(seconds=1)
    db.commit()
    assert _me(local, cookie)["authenticated"] is False


def test_last_seen_is_touched_at_most_hourly(local, db):
    cookie = _teacher_cookie(local)
    row = db.query(models.LocalSession).one()
    recent = local_auth._now() - timedelta(minutes=30)
    row.last_seen_at = recent
    db.commit()
    _me(local, cookie)
    db.refresh(row)
    assert row.last_seen_at == recent
    row.last_seen_at = local_auth._now() - timedelta(hours=2)
    db.commit()
    _me(local, cookie)
    db.refresh(row)
    assert local_auth._now() - row.last_seen_at < timedelta(minutes=1)


def test_local_provider_ignores_remote_headers(local):
    forged = {**LOCAL, "X-Forwarded-Auth-Secret": "fixture-proxy-secret",
              "Remote-User": "forged.admin", "Remote-Groups": "admins"}
    me = local.get("/auth/me", headers=forged).json()
    assert me["authenticated"] is False and me["auth_provider"] == "local"


def test_local_routes_do_not_exist_with_ai4auth(local, monkeypatch):
    monkeypatch.setattr(auth, "AUTH_PROVIDER", "ai4auth")
    assert local.post("/local-auth/redeem", json={"token": "x"}, headers=LOCAL).status_code == 404
    response = local.post("/internal/local-auth/teacher-link", headers={"X-CounselorBot-Shell-Secret": SHELL_SECRET})
    assert response.status_code == 404


def test_ai4auth_ignores_local_session_cookie(local, monkeypatch):
    cookie = _teacher_cookie(local)
    monkeypatch.setattr(auth, "AUTH_PROVIDER", "ai4auth")
    monkeypatch.setattr(auth, "AI4AUTH_VERIFY_URL", "")
    me = _me(local, cookie)
    assert me["authenticated"] is False and me["auth_provider"] == "ai4auth"


def test_ai4auth_proxy_identity_reports_its_provider(local, monkeypatch):
    monkeypatch.setattr(auth, "AUTH_PROVIDER", "ai4auth")
    me = local.get("/auth/me", headers={"X-Forwarded-Auth-Secret": "fixture-proxy-secret",
                                        "Remote-User": "studente.uno", "Remote-Groups": "studenti"}).json()
    assert me["authenticated"] is True and me["username"] == "studente.uno"
    assert me["auth_provider"] == "ai4auth"


def test_teacher_link_needs_the_shell(local):
    assert local.post("/internal/local-auth/teacher-link").status_code == 404
    response = local.post("/internal/local-auth/teacher-link",
                          headers={"X-CounselorBot-Shell-Secret": SHELL_SECRET, **LOCAL})
    assert response.status_code == 404
