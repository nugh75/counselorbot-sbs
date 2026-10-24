"""Abbinamento studenti (ADR-0002 §4, F1-13), su Postgres e SQLite.

Usa l'app reale senza lifespan e il database isolato di artifact_database.
"""
import hashlib
from contextlib import nullcontext
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from backend import auth, database, local_auth, local_pairing, models
from backend.main import app
from backend.shell_internal import SECRET_ENV
from backend.tests.artifact_database import artifact_session

SHELL_SECRET = "fixture-shell-secret"
FRONTEND_SECRET = "fixture-frontend-secret"
LOCAL = {"X-CounselorBot-Origin": "local", "X-CounselorBot-Frontend-Secret": FRONTEND_SECRET}


def tunnel(ip="203.0.113.7"):
    return {"X-CounselorBot-Origin": "tunnel", "X-CounselorBot-Frontend-Secret": FRONTEND_SECRET,
            "X-CounselorBot-Client-IP": ip}


@pytest.fixture
def db():
    with artifact_session() as session:
        yield session


@pytest.fixture
def client(db, monkeypatch):
    monkeypatch.setattr(auth, "AUTH_PROVIDER", "local")
    monkeypatch.setenv(SECRET_ENV, SHELL_SECRET)
    monkeypatch.setenv("COUNSELORBOT_FRONTEND_SECRET", FRONTEND_SECRET)
    monkeypatch.setenv("COUNSELORBOT_PUBLIC_ORIGIN", "https://classe.example.org/")
    monkeypatch.setattr(local_auth, "_open_session", lambda: nullcontext(db))
    local_pairing.limiter.reset()
    previous = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    app.dependency_overrides[database.get_db] = lambda: db
    yield TestClient(app, client=("127.0.0.1", 50000))
    app.dependency_overrides.clear()
    app.dependency_overrides.update(previous)
    local_pairing.limiter.reset()


@pytest.fixture
def group(db):
    row = models.StudentGroup(code="GR-PAIR01", name="3A", owner_username="docente")
    db.add(row)
    db.commit()
    return row


@pytest.fixture
def teacher(client):
    link = client.post("/internal/local-auth/teacher-link", headers={"X-CounselorBot-Shell-Secret": SHELL_SECRET})
    response = client.post("/local-auth/redeem", json={"token": link.json()["token"]}, headers=LOCAL)
    assert response.status_code == 204
    cookie = response.cookies[local_auth.COOKIE_NAME]
    client.cookies.clear()
    return cookie


def _as(client, cookie):
    client.cookies.clear()
    if cookie:
        client.cookies.set(local_auth.COOKIE_NAME, cookie)
    return client


def _new_code(client, teacher, group_id, **body):
    response = _as(client, teacher).post(f"/local-auth/classes/{group_id}/pairing-code", json=body or None,
                                         headers=LOCAL)
    assert response.status_code == 200, response.text
    client.cookies.clear()
    link = response.json()["link"]
    assert link.startswith("https://classe.example.org/unisciti#k=")
    return link.split("#k=", 1)[1]


def _pair(client, key, pseudonym="Luna", ip="203.0.113.7", **extra):
    client.cookies.clear()
    return client.post("/local-auth/pair", json={"key": key, "pseudonym": pseudonym, **extra}, headers=tunnel(ip))


def _me(client, cookie, headers=None):
    return _as(client, cookie).get("/auth/me", headers=headers or tunnel()).json()


def test_new_code_stores_only_the_hash_with_seven_day_expiry(client, teacher, group, db):
    key = _new_code(client, teacher, group.id)
    assert len(key) >= 43  # 32 byte base64url
    row = db.query(models.ClassPairingCode).one()
    assert row.key_hash == hashlib.sha256(key.encode()).hexdigest()
    assert row.expires_at - row.created_at == timedelta(days=7)
    assert row.uses == 0 and row.max_uses is None and row.requires_approval is False


def test_pair_creates_a_pseudonymous_student_session(client, teacher, group, db):
    key = _new_code(client, teacher, group.id)
    response = _pair(client, key, device_label="Tablet di classe")
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "active" and body["group_id"] == group.id and body["pseudonym"] == "Luna"
    assert body["username"].startswith("s-") and len(body["username"]) == 12
    assert len(body["personal_code"]) == 12 and set(body["personal_code"]) <= set(local_pairing.BASE32)
    set_cookie = response.headers["set-cookie"].lower()
    assert "httponly" in set_cookie and "samesite=lax" in set_cookie and "secure" in set_cookie  # tunnel = https

    student = db.query(models.LocalStudent).one()
    assert student.personal_code_hash == hashlib.sha256(body["personal_code"].encode()).hexdigest()
    session = db.query(models.LocalSession).filter_by(kind="student").one()
    assert session.device_label == "Tablet di classe"
    assert session.expires_at - session.created_at == timedelta(days=180)
    assert db.query(models.GroupMembership).filter_by(group_id=group.id, username=body["username"]).count() == 1
    assert db.query(models.ClassPairingCode).one().uses == 1

    me = _me(client, response.cookies[local_auth.COOKIE_NAME])
    assert me == {"email": "", "username": body["username"], "name": "Luna", "groups": ["studenti"],
                  "is_admin": False, "is_researcher": False, "authenticated": True, "auth_provider": "local"}


def test_duplicate_pseudonym_gets_a_suffix_never_an_error(client, teacher, group):
    key = _new_code(client, teacher, group.id)
    names = [_pair(client, key, name).json()["pseudonym"] for name in ("Luna", "luna", "  Luna ", "Sole")]
    assert names == ["Luna", "luna 2", "Luna 3", "Sole"]


@pytest.mark.parametrize("body", [
    {}, {"key": "x"}, {"pseudonym": "Luna"}, {"key": "x", "pseudonym": "   "},
    {"key": "x", "pseudonym": "L" * 41}, {"key": "x", "pseudonym": "Lu\nna"}, {"key": 1, "pseudonym": "Luna"},
    {"key": "x", "pseudonym": "Luna", "device_label": "d" * 81}, [],
])
def test_pair_rejects_invalid_payload(client, body):
    response = client.post("/local-auth/pair", json=body, headers=tunnel())
    assert response.status_code == 400 and response.json()["detail"] == "invalid_payload"


def test_pair_rejects_non_json_body(client):
    response = client.post("/local-auth/pair", content=b"not json", headers=tunnel())
    assert response.status_code == 400


def test_unknown_expired_and_revoked_codes_look_the_same(client, teacher, group, db):
    old_key = _new_code(client, teacher, group.id)
    expired_key = _new_code(client, teacher, group.id)  # revokes old_key
    db.query(models.ClassPairingCode).filter(models.ClassPairingCode.revoked_at.is_(None)).one().expires_at = (
        local_pairing._now() - timedelta(seconds=1))
    db.commit()
    responses = [_pair(client, key) for key in ("made-up", old_key, expired_key)]
    assert {r.status_code for r in responses} == {401}
    assert {r.text for r in responses} == {'{"detail":"invalid_or_expired_code"}'}
    assert all("set-cookie" not in r.headers for r in responses)
    assert db.query(models.LocalStudent).count() == 0


def test_inactive_class_refuses_its_code(client, teacher, group, db):
    key = _new_code(client, teacher, group.id)
    group.is_active = False
    db.commit()
    assert _pair(client, key).status_code == 401


def test_new_code_keeps_paired_students_inside(client, teacher, group):
    first = _pair(client, _new_code(client, teacher, group.id))
    _new_code(client, teacher, group.id)
    assert _me(client, first.cookies[local_auth.COOKIE_NAME])["authenticated"] is True


def test_max_uses_is_enforced(client, teacher, group):
    key = _new_code(client, teacher, group.id, max_uses=2)
    assert [_pair(client, key, f"S{i}").status_code for i in range(3)] == [201, 201, 401]


def test_pending_student_stays_anonymous_until_approved(client, teacher, group, db):
    key = _new_code(client, teacher, group.id, requires_approval=True)
    response = _pair(client, key)
    assert response.status_code == 201 and response.json()["status"] == "pending"
    cookie = response.cookies[local_auth.COOKIE_NAME]
    assert _me(client, cookie)["authenticated"] is False

    listing = _as(client, teacher).get("/local-auth/devices", headers=LOCAL).json()
    [entry] = listing["classes"]
    assert entry["group_id"] == group.id and entry["group_name"] == "3A"
    [device] = entry["devices"]
    assert device["status"] == "pending" and device["pseudonym"] == "Luna"

    assert _as(client, teacher).post(f"/local-auth/devices/{device['id']}/approve", headers=LOCAL).status_code == 204
    assert _me(client, cookie)["authenticated"] is True
    assert db.query(models.LocalStudent).one().approved_at is not None


def test_revoking_a_device_is_immediate(client, teacher, group, db):
    response = _pair(client, _new_code(client, teacher, group.id))
    cookie = response.cookies[local_auth.COOKIE_NAME]
    session_id = db.query(models.LocalSession).filter_by(kind="student").one().id
    assert _as(client, teacher).delete(f"/local-auth/devices/{session_id}", headers=LOCAL).status_code == 204
    assert _me(client, cookie)["authenticated"] is False
    assert _as(client, teacher).delete(f"/local-auth/devices/{session_id}", headers=LOCAL).status_code == 404
    listing = _as(client, teacher).get("/local-auth/devices", headers=LOCAL).json()
    assert listing == {"classes": []}


def test_recover_opens_a_new_session_with_the_personal_code(client, teacher, group, db):
    paired = _pair(client, _new_code(client, teacher, group.id)).json()
    code = paired["personal_code"]
    grouped = f" {code[:4].lower()}-{code[4:8]} {code[8:]} "
    client.cookies.clear()
    response = client.post("/local-auth/recover", json={"personal_code": grouped, "device_label": "Casa"},
                           headers=tunnel())
    assert response.status_code == 200
    assert response.json() == {"username": paired["username"], "pseudonym": "Luna"}
    assert _me(client, response.cookies[local_auth.COOKIE_NAME])["username"] == paired["username"]
    assert db.query(models.LocalSession).filter_by(kind="student").count() == 2


@pytest.mark.parametrize("value", ["AAAAAAAAAAAA", "nope", ""])
def test_recover_rejects_unknown_codes(client, value):
    response = client.post("/local-auth/recover", json={"personal_code": value}, headers=tunnel())
    assert response.status_code in (400, 401)
    if value:
        assert response.json() == {"detail": "invalid_code"}


def test_regenerated_personal_code_replaces_the_old_one(client, teacher, group):
    paired = _pair(client, _new_code(client, teacher, group.id)).json()
    response = _as(client, teacher).post(f"/local-auth/students/{paired['username']}/personal-code", headers=LOCAL)
    assert response.status_code == 200
    fresh = response.json()["personal_code"]
    assert fresh != paired["personal_code"]
    client.cookies.clear()
    assert client.post("/local-auth/recover", json={"personal_code": paired["personal_code"]},
                       headers=tunnel()).status_code == 401
    assert client.post("/local-auth/recover", json={"personal_code": fresh}, headers=tunnel()).status_code == 200


def test_teacher_routes_404_for_unknown_targets(client, teacher):
    c = _as(client, teacher)
    assert c.post("/local-auth/classes/9999/pairing-code", headers=LOCAL).status_code == 404
    assert c.post("/local-auth/devices/9999/approve", headers=LOCAL).status_code == 404
    assert c.delete("/local-auth/devices/9999", headers=LOCAL).status_code == 404
    assert c.post("/local-auth/students/s-unknown/personal-code", headers=LOCAL).status_code == 404


def test_teacher_session_cannot_be_revoked_as_a_device(client, teacher, db):
    session_id = db.query(models.LocalSession).filter_by(kind="teacher").one().id
    assert _as(client, teacher).delete(f"/local-auth/devices/{session_id}", headers=LOCAL).status_code == 404


def test_teacher_routes_refuse_students_anonymous_and_tunnel(client, teacher, group):
    student = _pair(client, _new_code(client, teacher, group.id)).cookies[local_auth.COOKIE_NAME]
    calls = [
        ("get", "/local-auth/devices"),
        ("post", f"/local-auth/classes/{group.id}/pairing-code"),
        ("post", "/local-auth/devices/1/approve"),
        ("delete", "/local-auth/devices/1"),
        ("post", "/local-auth/students/s-x/personal-code"),
    ]
    for cookie, headers in [(teacher, tunnel()), (student, LOCAL), (student, tunnel()), (None, LOCAL)]:
        for method, path in calls:
            assert getattr(_as(client, cookie), method)(path, headers=headers).status_code == 403, (method, path)


def test_ip_rate_limit_returns_retry_after(client):
    for _ in range(local_pairing.RateLimiter.IP_LIMIT):
        client.post("/local-auth/recover", json={"personal_code": "x"}, headers=tunnel("198.51.100.1"))
    response = client.post("/local-auth/recover", json={"personal_code": "x"}, headers=tunnel("198.51.100.1"))
    assert response.status_code == 429 and response.json()["detail"] == "rate_limited"
    assert int(response.headers["Retry-After"]) >= 1
    # Another IP is unaffected.
    assert client.post("/local-auth/recover", json={"personal_code": "x"},
                       headers=tunnel("198.51.100.2")).status_code == 401


def test_ten_consecutive_failures_lock_the_ip_for_fifteen_minutes(client, teacher, group, monkeypatch):
    key = _new_code(client, teacher, group.id)
    clock = [1000.0]
    monkeypatch.setattr(local_pairing.time, "monotonic", lambda: clock[0])
    for i in range(local_pairing.RateLimiter.LOCK_AFTER):
        clock[0] += 7  # stays under the per-minute limit
        assert _pair(client, "wrong", ip="198.51.100.9").status_code == 401
    clock[0] += 61
    locked = _pair(client, key, ip="198.51.100.9")
    assert locked.status_code == 429 and int(locked.headers["Retry-After"]) > 60
    clock[0] += 15 * 60
    assert _pair(client, key, ip="198.51.100.9").status_code == 201


def test_success_resets_the_failure_streak(client, teacher, group, monkeypatch):
    key = _new_code(client, teacher, group.id)
    clock = [1000.0]
    monkeypatch.setattr(local_pairing.time, "monotonic", lambda: clock[0])
    for i in range(local_pairing.RateLimiter.LOCK_AFTER * 2):
        clock[0] += 7
        good = i % 9 == 8
        assert _pair(client, key if good else "wrong", f"S{i}", ip="198.51.100.10").status_code == (
            201 if good else 401)


def test_class_rate_limit(client, teacher, group, monkeypatch):
    monkeypatch.setattr(local_pairing.RateLimiter, "CLASS_LIMIT", 3)
    key = _new_code(client, teacher, group.id)
    statuses = [_pair(client, key, f"S{i}", ip=f"198.51.100.{20 + i}").status_code for i in range(4)]
    assert statuses == [201, 201, 201, 429]


def test_logout_revokes_the_current_session(client, teacher, group):
    cookie = _pair(client, _new_code(client, teacher, group.id)).cookies[local_auth.COOKIE_NAME]
    assert _as(client, cookie).post("/local-auth/logout", headers=tunnel()).status_code == 204
    assert _me(client, cookie)["authenticated"] is False
    assert _as(client, None).post("/local-auth/logout", headers=tunnel()).status_code == 204


def test_pairing_routes_do_not_exist_with_ai4auth(client, monkeypatch):
    monkeypatch.setattr(auth, "AUTH_PROVIDER", "ai4auth")
    assert client.post("/local-auth/pair", json={"key": "x", "pseudonym": "y"}).status_code == 404
    assert client.post("/local-auth/recover", json={"personal_code": "x"}).status_code == 404
    assert client.get("/local-auth/devices").status_code == 404
