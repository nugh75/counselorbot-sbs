"""Contratto guscio <-> backend delle app desktop (ADR-0002 §2.2, §2.6).

Nessun database: il TestClient senza context manager non esegue il lifespan.
"""
import os

import pytest
from fastapi.testclient import TestClient

from backend import database
from backend.main import app
from backend.shell_internal import SECRET_ENV
from backend.version import __version__

SECRET = "s3cr3t-for-tests"
LOOPBACK = ("127.0.0.1", 50000)


@pytest.fixture
def shell_secret():
    previous = os.environ.get(SECRET_ENV)
    os.environ[SECRET_ENV] = SECRET
    yield SECRET
    if previous is None:
        os.environ.pop(SECRET_ENV, None)
    else:
        os.environ[SECRET_ENV] = previous


def _client(host=LOOPBACK):
    return TestClient(app, client=host)


def test_health_reports_version_contract_and_dialect():
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "version": __version__,
        "desktop_contract": 2 if database.engine.dialect.name == "postgresql" else 1,
        "db": database.engine.dialect.name,
    }
    assert response.json()["db"] in ("sqlite", "postgresql")


def test_internal_answers_the_shell(shell_secret):
    response = _client().get("/internal/ping", headers={"X-CounselorBot-Shell-Secret": shell_secret})
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_internal_backup_triggers_sqlite_backup(shell_secret, monkeypatch, tmp_path):
    backup_file = tmp_path / "sqlite-backup.sqlite3"
    monkeypatch.setattr("backend.sqlite_backup.create_backup", lambda: backup_file)
    response = _client().post("/internal/backup", headers={"X-CounselorBot-Shell-Secret": shell_secret})
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "path": str(backup_file)}


def test_internal_backup_returns_500_on_error(shell_secret, monkeypatch):
    def _fail():
        raise RuntimeError("Disk full")
    monkeypatch.setattr("backend.sqlite_backup.create_backup", _fail)
    response = _client().post("/internal/backup", headers={"X-CounselorBot-Shell-Secret": shell_secret})
    assert response.status_code == 500
    assert response.json() == {"status": "error", "detail": "Disk full"}


def test_internal_answers_loopback_ipv6(shell_secret):
    response = _client(("::1", 50000)).get("/internal/ping", headers={"X-CounselorBot-Shell-Secret": shell_secret})
    assert response.status_code == 200


@pytest.mark.parametrize("headers", [
    {},
    {"X-CounselorBot-Shell-Secret": "wrong"},
    {"X-CounselorBot-Shell-Secret": SECRET, "Cf-Connecting-Ip": "203.0.113.7"},
    {"X-CounselorBot-Shell-Secret": SECRET, "CF-Ray": "abc"},
    # The Next rewrite of /api/internal/* adds these: the backend refuses it anyway.
    {"X-CounselorBot-Shell-Secret": SECRET, "X-Forwarded-For": "127.0.0.1"},
    {"X-CounselorBot-Shell-Secret": SECRET, "X-Forwarded-Host": "127.0.0.1:3000"},
    {"X-CounselorBot-Shell-Secret": SECRET, "X-CounselorBot-Origin": "local"},
])
def test_internal_refuses_anything_but_the_shell(shell_secret, headers):
    response = _client().get("/internal/ping", headers=headers)
    assert response.status_code == 404


def test_internal_refuses_duplicate_secret_headers(shell_secret):
    response = _client().get(
        "/internal/ping",
        headers=[("X-CounselorBot-Shell-Secret", "wrong"), ("X-CounselorBot-Shell-Secret", SECRET)],
    )
    assert response.status_code == 404


def test_internal_refuses_non_loopback_clients(shell_secret):
    response = _client(("192.168.1.20", 50000)).get(
        "/internal/ping", headers={"X-CounselorBot-Shell-Secret": shell_secret}
    )
    assert response.status_code == 404


def test_internal_does_not_exist_without_the_secret_in_the_environment(shell_secret):
    os.environ.pop(SECRET_ENV)
    response = _client().get("/internal/ping", headers={"X-CounselorBot-Shell-Secret": ""})
    assert response.status_code == 404


def test_unknown_internal_paths_are_guarded_too(shell_secret):
    # Same answer with or without the secret for a path no router declares.
    assert _client().get("/internal/anything").status_code == 404
    assert _client().post("/internal").status_code == 404
