"""Profilo teacher-pc (F1-07, #208): docente admin, rotte admin solo locali,
funzioni di laboratorio escluse (ADR-0001), su Postgres e SQLite.

Usa l'app reale senza lifespan e il database isolato di artifact_database.
"""
from contextlib import nullcontext

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend import auth, database, install_profile, local_auth
from backend.main import app
from backend.shell_internal import SECRET_ENV
from backend.tests.artifact_database import artifact_session

SHELL_SECRET = "fixture-shell-secret"
FRONTEND_SECRET = "fixture-frontend-secret"
LOCAL = {"X-CounselorBot-Origin": "local", "X-CounselorBot-Frontend-Secret": FRONTEND_SECRET}
TUNNEL = {"X-CounselorBot-Origin": "tunnel", "X-CounselorBot-Frontend-Secret": FRONTEND_SECRET}
UNTRUSTED_ORIGINS = [
    TUNNEL,
    {},  # fail-closed: no signed origin
    {"X-CounselorBot-Origin": "local", "X-CounselorBot-Frontend-Secret": "wrong"},
]
ADMIN_ROUTES = ["/admin/config/env-status", "/admin/personal-api-policy"]
# One route per excluded feature; Piper is the `piper` engine of the reader.
LAB_ROUTES = [
    ("get", "/admin/prompt-experiments", {}),
    ("get", "/telegram/bot-info", {}),
    ("post", "/opencode/workspace", {"json": {}}),
    ("get", "/chatgpt/helper", {}),
    ("get", "/tts/voices?engine=piper", {}),
    ("post", "/tts/stream", {"json": {"text": "Ciao", "engine": "piper", "voice": "it_IT-paola-medium"}}),
]


@pytest.fixture
def db():
    with artifact_session() as session:
        yield session


@pytest.fixture
def teacher_pc(db, monkeypatch):
    monkeypatch.setattr(install_profile, "PROFILE", "teacher-pc")
    monkeypatch.setattr(auth, "AUTH_PROVIDER", "local")
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


def _login_teacher(client):
    link = client.post("/internal/local-auth/teacher-link", headers={"X-CounselorBot-Shell-Secret": SHELL_SECRET})
    response = client.post("/local-auth/redeem", json={"token": link.json()["token"]}, headers=LOCAL)
    assert response.status_code == 204
    client.cookies.set(local_auth.COOKIE_NAME, response.cookies[local_auth.COOKIE_NAME])


def test_teacher_is_the_local_admin(teacher_pc):
    _login_teacher(teacher_pc)
    me = teacher_pc.get("/auth/me", headers=LOCAL).json()
    assert me["username"] == "docente"
    assert me["groups"] == ["docenti", "admins"]
    assert me["is_admin"] is True and me["auth_provider"] == "local"


@pytest.mark.parametrize("path", ADMIN_ROUTES)
def test_admin_routes_answer_locally(teacher_pc, path):
    _login_teacher(teacher_pc)
    assert teacher_pc.get(path, headers=LOCAL).status_code == 200


@pytest.mark.parametrize("headers", UNTRUSTED_ORIGINS)
@pytest.mark.parametrize("path", ADMIN_ROUTES)
def test_admin_routes_are_forbidden_from_the_tunnel(teacher_pc, path, headers):
    _login_teacher(teacher_pc)
    assert teacher_pc.get(path, headers=headers).status_code == 403
    teacher_pc.cookies.clear()
    assert teacher_pc.get(path, headers=headers).status_code == 403


def test_admin_routes_need_a_session_locally(teacher_pc):
    assert teacher_pc.get("/admin/config/env-status", headers=LOCAL).status_code == 401


def test_ai4auth_admin_routes_ignore_the_origin(teacher_pc, monkeypatch):
    monkeypatch.setattr(install_profile, "PROFILE", "")
    monkeypatch.setattr(auth, "AUTH_PROVIDER", "ai4auth")
    monkeypatch.setattr(auth, "FORWARD_AUTH_SHARED_SECRET", "fixture-proxy-secret")
    admin = {"X-Forwarded-Auth-Secret": "fixture-proxy-secret", "Remote-User": "admin", "Remote-Groups": "admins"}
    assert teacher_pc.get("/admin/config/env-status", headers=admin).status_code == 200


@pytest.mark.parametrize("method,path,kwargs", LAB_ROUTES)
def test_lab_features_are_missing_on_teacher_pc(teacher_pc, method, path, kwargs):
    _login_teacher(teacher_pc)
    assert getattr(teacher_pc, method)(path, headers=LOCAL, **kwargs).status_code == 404


@pytest.mark.parametrize("method,path,kwargs", [route for route in LAB_ROUTES if not route[1].startswith("/tts")])
def test_lab_features_exist_on_other_profiles(teacher_pc, monkeypatch, method, path, kwargs):
    monkeypatch.setattr(install_profile, "PROFILE", "")
    monkeypatch.setattr(auth, "AUTH_PROVIDER", "ai4auth")
    monkeypatch.setattr(auth, "AI4AUTH_VERIFY_URL", "")
    # Anonymous: the route exists, so the answer is about auth or input, not 404.
    assert getattr(teacher_pc, method)(path, **kwargs).status_code != 404


def test_opencode_terminal_is_missing_on_teacher_pc(teacher_pc):
    _login_teacher(teacher_pc)
    with pytest.raises(WebSocketDisconnect):
        with teacher_pc.websocket_connect("/term?key=abc", headers=LOCAL):
            pass


def test_edge_reader_stays_on_teacher_pc(teacher_pc, monkeypatch):
    async def no_voices():
        return []

    monkeypatch.setattr("backend.routes.voice_reader.edge_tts.list_voices", no_voices)
    monkeypatch.setattr("backend.routes.voice_reader._voice_cache", (0.0, []))
    assert teacher_pc.get("/tts/voices?engine=edge", headers=LOCAL).status_code == 200


def test_console_sync_does_not_start_on_teacher_pc(teacher_pc, monkeypatch):
    from backend import admin_sync

    started = []
    class FakeThread:
        def __init__(self, **kwargs):
            pass

        def start(self):
            started.append(True)

    monkeypatch.setattr(admin_sync.threading, "Thread", FakeThread)
    admin_sync.sync_admins_async()
    assert started == []
    monkeypatch.setattr(install_profile, "PROFILE", "")
    monkeypatch.delenv("ADMIN_SYNC_DISABLED", raising=False)
    admin_sync.sync_admins_async()
    assert len(started) == 1
