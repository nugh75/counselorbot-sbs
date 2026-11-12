"""Teacher adds a student to a class by email (#836).

Synthetic Postgres via artifact_session. No email is sent: Counselorbot only
stores the pending invitation; the student signs in through ai4auth with that
email and is enrolled when opening the class link (code still required, since
ai4auth password signup does not verify the email).
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, database, models
from backend.routes import groups
from backend.tests.artifact_database import artifact_session

TEACHER = dict(username="teacher", email="teacher@example.test", name="Teacher",
               authenticated=True, is_admin=False, groups=["docenti"])


@pytest.fixture
def api():
    with artifact_session() as db:
        group = models.StudentGroup(name="Synthetic 2A", code="SYN-836-2A", owner_username="teacher")
        db.add(group)
        db.commit()
        identity = dict(TEACHER)
        app = FastAPI()
        app.include_router(groups.router)
        app.dependency_overrides[database.get_db] = lambda: db
        for dep in (auth.get_current_user, auth.get_current_plan_manager):
            app.dependency_overrides[dep] = lambda: dict(identity)
        with TestClient(app) as client:
            yield client, db, identity, group


def _as_student(identity, username, email):
    identity.update(username=username, email=email, groups=["studenti"])


def test_teacher_invites_lists_resends_and_cancels(api):
    client, db, identity, group = api
    url = f"/admin/groups/{group.id}/invitations"
    created = client.post(url, json={"email": "  Anna@Example.TEST "})
    assert created.status_code == 201
    body = created.json()
    assert body["email"] == "anna@example.test" and body["sent_at"] is None
    assert "password" not in body
    assert client.post(url, json={"email": "anna@example.test"}).status_code == 409
    assert client.post(url, json={"email": "not-an-email"}).status_code == 400

    sent = client.post(f"{url}/{body['id']}/sent")
    assert sent.status_code == 200 and sent.json()["sent_at"]
    assert [row["email"] for row in client.get(url).json()] == ["anna@example.test"]

    assert client.delete(f"{url}/{body['id']}").status_code == 200
    assert client.get(url).json() == []
    _as_student(identity, "anna", "anna@example.test")
    client.post("/groups/join", json={"code": group.code})
    membership = db.query(models.GroupMembership).filter_by(group_id=group.id, username="anna").one()
    assert membership.joined_via == "web"  # cancelled: an ordinary link join


def test_invited_email_opening_class_link_is_enrolled_and_invitation_accepted(api):
    client, db, identity, group = api
    client.post(f"/admin/groups/{group.id}/invitations", json={"email": "anna@example.test"})

    _as_student(identity, "anna", "ANNA@example.test")
    assert client.get("/user/groups").json() == []  # no class code, no enrolment
    joined = client.post("/groups/join", json={"code": group.code})
    assert joined.status_code == 200 and joined.json()["already_member"] is False
    mine = client.get("/user/groups").json()
    assert [(row["group_id"], row["joined_via"]) for row in mine] == [(group.id, "teacher")]
    invitation = db.query(models.GroupInvitation).one()
    assert invitation.accepted_username == "anna" and invitation.accepted_at is not None

    identity.update(TEACHER)
    assert client.get(f"/admin/groups/{group.id}/invitations").json() == []


def test_invitation_for_another_class_is_not_accepted(api):
    client, db, identity, group = api
    other = models.StudentGroup(name="Other", code="SYN-836-OTH", owner_username="teacher")
    db.add(other)
    db.commit()
    client.post(f"/admin/groups/{other.id}/invitations", json={"email": "anna@example.test"})
    _as_student(identity, "anna", "anna@example.test")
    client.post("/groups/join", json={"code": group.code})
    assert db.query(models.GroupInvitation).one().accepted_at is None
    assert db.query(models.GroupMembership).filter_by(group_id=other.id).count() == 0


def test_owner_and_demo_accounts_are_never_enrolled_by_invitation(api):
    client, db, identity, group = api
    url = f"/admin/groups/{group.id}/invitations"
    client.post(url, json={"email": "teacher@example.test"})
    client.post(url, json={"email": "studente.demo@anteprima.local"})
    assert client.post("/groups/join", json={"code": group.code}).status_code == 403  # owner
    _as_student(identity, "studente.demo", "studente.demo@anteprima.local")
    assert client.post("/groups/join", json={"code": group.code}).status_code == 403
    assert db.query(models.GroupInvitation).filter(models.GroupInvitation.accepted_at.isnot(None)).count() == 0
    assert db.query(models.GroupMembership).filter_by(group_id=group.id).count() == 0


def test_other_teacher_cannot_see_invitations(api):
    client, db, identity, group = api
    client.post(f"/admin/groups/{group.id}/invitations", json={"email": "anna@example.test"})
    identity.update(username="colleague", email="colleague@example.test")
    assert client.get(f"/admin/groups/{group.id}/invitations").status_code == 404


def test_local_provider_has_no_email_invitations(api, monkeypatch):
    client, db, identity, group = api
    monkeypatch.setattr(auth, "local_provider_enabled", lambda: True)
    assert client.get(f"/admin/groups/{group.id}/invitations").status_code == 404
    assert client.post(f"/admin/groups/{group.id}/invitations", json={"email": "a@b.it"}).status_code == 404
