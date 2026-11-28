"""Teacher-selected conversations shared with the class council (#1027).

Synthetic PostgreSQL only. Nothing is shared by default; each share has its own
expiry and revocation; the council sees only active shares; extracts contain the
student's own messages only.
"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, database, models
from backend.routes import class_council as council_routes
from backend.tests.artifact_database import artifact_session

TEACHER = dict(username="teacher", name="Teacher One", authenticated=True, is_admin=False, groups=["docenti"])


def who(name, groups=("docenti",)):
    return dict(username=name, name=name, authenticated=True, is_admin=False, groups=list(groups))


@pytest.fixture
def api():
    with artifact_session() as db:
        group = models.StudentGroup(name="Synthetic 3B", code="SYN-1027-3B", owner_username="teacher")
        other = models.StudentGroup(name="Other class", code="SYN-1027-OT", owner_username="colleague")
        db.add_all([group, other])
        db.flush()
        db.add_all([
            models.GroupShare(group_id=group.id, shared_with_username="co-teacher", granted_by_username="teacher"),
            models.GroupMembership(group_id=group.id, username="alice"),
            models.GroupMembership(group_id=other.id, username="bob"),
            models.QuestionnaireResult(session_id="s-alice", questionnaire_type="QSA", username="alice", scores={"C1": 7}),
            models.QuestionnaireResult(session_id="s-bob", questionnaire_type="QSA", username="bob", scores={}),
        ])
        db.add_all([
            models.Log(username="alice", session_id="s-alice", action="chat_message",
                       details={"user_input": "Primo messaggio di Alice", "bot_response": "Risposta uno"}),
            models.Log(username="alice", session_id="s-alice", action="chat_message",
                       details={"user_input": "Secondo messaggio di Alice", "bot_response": "Risposta due"}),
            models.Log(username="classmate", session_id="s-alice", action="chat_message",
                       details={"user_input": "Parole del compagno", "bot_response": "Risposta del compagno"}),
        ])
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


def share_path(group, username="alice"):
    return f"/teacher/groups/{group.id}/students/{username}/council-shares"


def share(client, group, *, result_id=1, days=30, message_indexes=None, username="alice"):
    body = {"result_id": result_id, "days": days}
    if message_indexes is not None:
        body["message_indexes"] = message_indexes
    return client.post(share_path(group, username), json=body)


def council_view(client, identity, group):
    link = client.post(f"/teacher/groups/{group.id}/council-links", json={"days": 30}).json()
    as_user(identity, who("council-member"))
    response = client.post(f"/council/{link['token']}", json={"password": link["password"]})
    assert response.status_code == 200, response.text
    return response.json()


def test_owner_and_co_teacher_share_and_the_council_reads_only_active_shares(api):
    client, db, identity, group, _other = api
    result = db.query(models.QuestionnaireResult).filter_by(username="alice").one()
    created = share(client, group, result_id=result.id)
    assert created.status_code == 200, created.text
    assert created.json()["whole_chat"] is True

    as_user(identity, who("co-teacher"))
    assert share(client, group, result_id=result.id, days=7).status_code == 200

    as_user(identity, dict(TEACHER))
    listed = client.get(share_path(group)).json()
    assert len(listed) == 2 and all(row["state"] == "active" for row in listed)

    data = council_view(client, identity, group)
    alice = next(student for student in data["students"] if student["username"] == "alice")
    conversations = alice["shared_conversations"]
    assert len(conversations) == 2
    messages = conversations[0]["messages"]
    assert [message["text"] for message in messages] == [
        "Primo messaggio di Alice", "Risposta uno", "Secondo messaggio di Alice", "Risposta due",
    ]
    assert "Parole del compagno" not in str(conversations)


def test_another_teacher_cannot_share(api):
    client, db, identity, group, other = api
    result = db.query(models.QuestionnaireResult).filter_by(username="alice").one()
    as_user(identity, who("stranger"))
    assert share(client, group, result_id=result.id).status_code == 404
    as_user(identity, who("colleague"))
    assert share(client, other, result_id=result.id).status_code == 404


def test_extracts_contain_only_selected_student_messages(api):
    client, db, identity, group, _other = api
    result = db.query(models.QuestionnaireResult).filter_by(username="alice").one()
    # Index 1 is a counselor reply: never selectable. Index 9 is out of range.
    assert share(client, group, result_id=result.id, message_indexes=[1]).status_code == 400
    assert share(client, group, result_id=result.id, message_indexes=[9]).status_code == 400
    assert share(client, group, result_id=result.id, message_indexes=[]).status_code == 400
    created = share(client, group, result_id=result.id, message_indexes=[0, 2])
    assert created.status_code == 200, created.text
    assert created.json()["whole_chat"] is False

    data = council_view(client, identity, group)
    alice = next(student for student in data["students"] if student["username"] == "alice")
    messages = alice["shared_conversations"][0]["messages"]
    assert [message["text"] for message in messages] == ["Primo messaggio di Alice", "Secondo messaggio di Alice"]
    assert all(message["role"] == "student" for message in messages)


def test_revoked_and_expired_shares_disappear(api):
    client, db, identity, group, _other = api
    result = db.query(models.QuestionnaireResult).filter_by(username="alice").one()
    revoked = share(client, group, result_id=result.id).json()
    expired = share(client, group, result_id=result.id).json()
    assert client.delete(f"/teacher/council-shares/{revoked['id']}").json()["state"] == "revoked"
    row = db.get(models.ClassCouncilShare, expired["id"])
    row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()

    data = council_view(client, identity, group)
    alice = next(student for student in data["students"] if student["username"] == "alice")
    assert alice["shared_conversations"] == []
    as_user(identity, dict(TEACHER))
    listed = client.get(share_path(group)).json()
    assert {row["state"] for row in listed} == {"revoked", "expired"}


def test_days_must_stay_within_seven_and_ninety(api):
    client, db, identity, group, _other = api
    result = db.query(models.QuestionnaireResult).filter_by(username="alice").one()
    assert share(client, group, result_id=result.id, days=6).status_code == 422
    assert share(client, group, result_id=result.id, days=91).status_code == 422


def test_student_sees_own_shares_with_class_and_expiry(api):
    client, db, identity, group, _other = api
    result = db.query(models.QuestionnaireResult).filter_by(username="alice").one()
    share(client, group, result_id=result.id, days=14)

    as_user(identity, who("alice", ["studenti"]))
    own = client.get("/user/council-shares")
    assert own.status_code == 200, own.text
    rows = own.json()
    assert len(rows) == 1 and rows[0]["group_name"] == "Synthetic 3B"
    assert rows[0]["questionnaire_type"] == "QSA" and rows[0]["expires_at"]

    as_user(identity, who("bob", ["studenti"]))
    assert client.get("/user/council-shares").json() == []
