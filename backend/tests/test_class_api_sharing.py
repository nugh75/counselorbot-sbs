"""A teacher offers the counselors bound to their API connections to their classes."""
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, class_access, class_api_sharing, database, models, personal_api
from backend.ai_service import AIService, AIError
from backend.routes import personal_api as routes
from backend.tests.test_personal_api import db, identity  # noqa: F401


def connection(db, username, model="teacher-model"):
    row = models.PersonalAPIConnection(id=uuid.uuid4().hex, username=username, name=f"{username} key",
                                       provider="openai", model_name=model, encrypted_key="")
    row.encrypted_key = personal_api.encrypt_key(username, "openai", f"{username}-fake-key", row.id)
    db.add(row)
    db.flush()
    return row


@pytest.fixture
def school(db):
    class_api_sharing.set_switch(db, True)
    group = models.StudentGroup(code="GR-OFFER1", name="Class", owner_username="alice")
    other = models.StudentGroup(code="GR-OFFER2", name="Other", owner_username="dora")
    db.add_all([group, other])
    db.flush()
    db.add(models.GroupMembership(group_id=group.id, username="bob"))
    db.add_all([models.Counselor(id=20, name="Institution", slug="inst", is_active=True),
                models.Counselor(id=21, name="Alice private", slug="alice-own", is_active=True, owner_username="alice"),
                models.Counselor(id=22, name="Not offered", slug="plain", is_active=True)])
    key = connection(db, "alice")
    db.add(models.PersonalAIRouting(username="alice", enabled=True, share_with_classes=True))
    db.add_all([models.PersonalCounselorConnection(username="alice", counselor_id=20, connection_id=key.id, reasoning="low"),
                models.PersonalCounselorConnection(username="alice", counselor_id=21, connection_id=key.id)])
    db.commit()
    current = {"identity": identity("alice", groups=["docenti"])}
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[database.get_db] = lambda: db
    app.dependency_overrides[auth.get_identity] = lambda: current["identity"]
    with TestClient(app, headers={"X-Requested-With": "CounselorBot"}) as client:
        client.actor = current
        yield client, group, key


def targets(db, username, counselor_id):
    personal_api.bind_counselor(db, counselor_id)
    return AIService(db, username=username)._targets("ollama", "institution-model")


def test_students_use_the_teachers_counselors_through_the_teachers_key(db, school):
    client, _, key = school
    service = (personal_api.bind_counselor(db, 20), AIService(db, username="bob"))[1]
    assert service.shared_owner == "alice" and service.personal_reasoning == "low"
    assert service.config["api_key_openai"] == "alice-fake-key"
    assert targets(db, "bob", 20) == [("openai", "teacher-model")]
    assert targets(db, "bob", 22) == [("ollama", "institution-model")]  # Not bound by the teacher.
    assert targets(db, "carol", 20) == [("ollama", "institution-model")]  # Not in the class.
    # The teacher's private counselor becomes visible to the student, never the key.
    assert 21 in {c.id for c in personal_api.visible_counselors(db, "bob")}
    assert 21 not in {c.id for c in personal_api.visible_counselors(db, "carol")}
    assert 21 in class_access._counselor_access(db, "bob", [(0, None)])[0]


def test_stopping_or_switch_off_applies_on_the_next_message(db, school):
    client, _, key = school
    bindings = [{"counselor_id": 20, "connection_id": key.id}, {"counselor_id": 21, "connection_id": key.id}]
    # The teacher's own routing can stay off: offering is separate from using it personally.
    response = client.put("/user/api-routing", json={"enabled": False, "bindings": bindings, "share_with_classes": False})
    assert response.status_code == 200, response.text
    assert targets(db, "bob", 20) == [("ollama", "institution-model")]
    assert client.put("/user/api-routing", json={"enabled": False, "bindings": bindings, "share_with_classes": True}).status_code == 200
    assert targets(db, "bob", 20) == [("openai", "teacher-model")]
    class_api_sharing.set_switch(db, False)
    assert targets(db, "bob", 20) == [("ollama", "institution-model")]
    assert 21 not in {c.id for c in personal_api.visible_counselors(db, "bob")}


def test_only_teachers_can_offer_and_the_page_reports_usage(db, school):
    client, _, _ = school
    db.add(models.Log(action="chat_message", cost_usd=0.5, details={"shared_owner": "alice"}))
    db.commit()
    state = client.get("/user/api-connections").json()
    assert state["share_available"] and state["share_with_classes"]
    assert state["share_usage"] == {"requests": 1, "cost_usd": 0.5}
    client.actor["identity"] = identity("bob", groups=["studenti"])
    assert client.get("/user/api-connections").json()["share_available"] is False
    response = client.put("/user/api-routing", json={"enabled": False, "bindings": [], "share_with_classes": True})
    assert response.status_code == 403


def test_own_choice_wins_and_conflicting_teachers_fall_back(db, school):
    client, group, _ = school
    other = connection(db, "dora", "dora-model")
    db.add(models.GroupShare(group_id=group.id, shared_with_username="dora", granted_by_username="alice"))
    db.add(models.PersonalAIRouting(username="dora", enabled=True, share_with_classes=True))
    db.add(models.PersonalCounselorConnection(username="dora", counselor_id=20, connection_id=other.id))
    db.commit()
    assert targets(db, "bob", 20) == [("ollama", "institution-model")]  # Two keys for one counselor.
    own = connection(db, "bob", "bob-model")
    db.add(models.PersonalAIRouting(username="bob", enabled=True, default_connection_id=own.id))
    db.commit()
    assert targets(db, "bob", 20) == [("openai", "bob-model")]


def test_failures_are_neutral_for_students_and_recorded_for_the_teacher(db, school):
    personal_api.bind_counselor(db, 20)
    service = AIService(db, username="bob")
    error = service._personal_failure(type("Quota", (Exception,), {"status_code": 429, "body": None})())
    assert isinstance(error, AIError) and error.code == class_api_sharing.SHARE_ERROR
    db.expire_all()
    assert db.get(models.PersonalAIRouting, "alice").share_last_error == "personalAPI.errors.rateLimit"
