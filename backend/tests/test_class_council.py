"""Class council link (#422): password-protected, expiring, read-only class overview.

Synthetic PostgreSQL only. The owner creates the link and sees the password
once; a signed-in user with the password reads what the teacher already sees,
never unshared goals or other classes; wrong passwords lock the link.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, class_council, database, models
from backend.routes import class_council as council_routes
from backend.routes import survey
from backend.tests.artifact_database import artifact_session

TEACHER = dict(username="teacher", name="Teacher One", authenticated=True, is_admin=False, groups=["docenti"])


def who(name, groups=()):
    return dict(username=name, name=name, authenticated=True, is_admin=False, groups=list(groups))


@pytest.fixture
def api():
    with artifact_session() as db:
        group = models.StudentGroup(name="Synthetic 3B", code="SYN-422-3B", owner_username="teacher")
        other = models.StudentGroup(name="Other class", code="SYN-422-OT", owner_username="colleague")
        db.add_all([group, other])
        db.flush()
        db.add_all([models.GroupMembership(group_id=group.id, username="alice"),
                    models.GroupMembership(group_id=other.id, username="bob")])
        db.add_all([
            models.QuestionnaireResult(session_id="s-alice", questionnaire_type="QSAr", username="alice",
                                       scores={"C1": 7}),
            models.QuestionnaireResult(session_id="s-bob", questionnaire_type="QSA", username="bob", scores={}),
            models.Log(session_id="s-alice", action=survey.PDF_SUMMARY_ACTION, details={"summary": "Sintesi breve"}),
            models.Log(session_id="s-alice", action="chat_message", username="alice", details={"text": "private"}),
            models.PersonalGoal(username="alice", title="Shared goal", shared_group_id=group.id),
            models.PersonalGoal(username="alice", title="Private goal"),
        ])
        assignment = models.TeacherAssignment(
            author_username="teacher", author_name="Teacher One", group_id=group.id, group_name=group.name,
            source_kind="goal", source_id=1, snapshot={"title": "Study plan"}, instructions="",
            request_id="r1", request_hash="h1")
        db.add(assignment)
        db.flush()
        db.add(models.AssignmentWork(assignment_id=assignment.id, username="alice",
                                     submission={"text": "My plan"}, feedback="Well done"))
        db.commit()
        identity = dict(TEACHER)
        app = FastAPI()
        app.include_router(council_routes.router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_identity] = lambda: dict(identity)
        with TestClient(app) as client:
            yield client, db, identity, group, other


def as_user(identity, user):
    identity.clear()
    identity.update(user)


def test_summary_action_matches_the_report_summaries():
    assert class_council.PDF_SUMMARY_ACTION == survey.PDF_SUMMARY_ACTION


def test_owner_creates_a_link_and_sees_the_password_once(api):
    client, _db, identity, group, other = api
    created = client.post(f"/teacher/groups/{group.id}/council-links", json={"days": 7})
    assert created.status_code == 200, created.text
    body = created.json()
    assert len(body["password"]) == 10 and body["state"] == "active"
    listed = client.get(f"/teacher/groups/{group.id}/council-links").json()
    assert [row["id"] for row in listed] == [body["id"]] and "password" not in listed[0]
    assert client.post(f"/teacher/groups/{group.id}/council-links", json={"days": 0}).status_code == 422
    assert client.post(f"/teacher/groups/{group.id}/council-links", json={"days": 91}).status_code == 422
    # Another class stays invisible to this teacher.
    assert client.post(f"/teacher/groups/{other.id}/council-links", json={"days": 7}).status_code == 404


def test_council_reads_only_what_the_teacher_sees(api):
    client, db, identity, group, _other = api
    link = client.post(f"/teacher/groups/{group.id}/council-links", json={"days": 30}).json()
    as_user(identity, who("council-member"))
    assert client.post(f"/council/{link['token']}", json={"password": "wrong"}).status_code == 403
    view = client.post(f"/council/{link['token']}", json={"password": link["password"]})
    assert view.status_code == 200, view.text
    data = view.json()
    assert data["group"]["name"] == "Synthetic 3B"
    assert [s["username"] for s in data["students"]] == ["alice"]
    alice = data["students"][0]
    assert alice["results"] == [{"questionnaire_type": "QSAr", "scores": {"C1": 7},
                                 "submitted_at": alice["results"][0]["submitted_at"], "summary": "Sintesi breve"}]
    assert [g["title"] for g in alice["goals"]] == ["Shared goal"]
    assert alice["assignments"][0]["title"] == "Study plan"
    assert alice["assignments"][0]["submission"] == {"text": "My plan"}
    assert alice["assignments"][0]["feedback"] == "Well done"
    assert "private" not in view.text
    logged = db.query(models.Log).filter_by(action="class_council_view").one()
    assert logged.username == "council-member" and logged.details["group_id"] == group.id
    row = db.get(models.ClassCouncilLink, link["id"])
    assert row.failed_attempts == 0 and row.last_viewed_at is not None


def test_wrong_passwords_lock_the_link(api):
    client, db, identity, group, _other = api
    link = client.post(f"/teacher/groups/{group.id}/council-links", json={"days": 7}).json()
    as_user(identity, who("council-member"))
    for _ in range(council_routes.MAX_FAILED_ATTEMPTS):
        assert client.post(f"/council/{link['token']}", json={"password": "nope"}).status_code == 403
    locked = client.post(f"/council/{link['token']}", json={"password": link["password"]})
    assert locked.status_code == 429
    # The lock lasts a quarter of an hour.
    row = db.get(models.ClassCouncilLink, link["id"])
    row.last_failed_at = datetime.now(timezone.utc) - council_routes.LOCKOUT - timedelta(seconds=1)
    db.commit()
    assert client.post(f"/council/{link['token']}", json={"password": link["password"]}).status_code == 200


def test_revoked_expired_and_unknown_links_answer_alike(api):
    client, db, identity, group, _other = api
    revoked = client.post(f"/teacher/groups/{group.id}/council-links", json={"days": 7}).json()
    expired = client.post(f"/teacher/groups/{group.id}/council-links", json={"days": 7}).json()
    as_user(identity, who("colleague", ["docenti"]))
    assert client.delete(f"/teacher/council-links/{revoked['id']}").status_code == 404
    as_user(identity, TEACHER)
    assert client.delete(f"/teacher/council-links/{revoked['id']}").json()["state"] == "revoked"
    db.get(models.ClassCouncilLink, expired["id"]).expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()
    as_user(identity, who("council-member"))
    for token, password in ((revoked["token"], revoked["password"]), (expired["token"], expired["password"]),
                            ("unknown-token", "whatever")):
        response = client.post(f"/council/{token}", json={"password": password})
        assert response.status_code == 404 and response.json()["detail"] == "council_link_unavailable"
