"""#201: a teacher's personal API connection shared with a class."""
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, class_api_sharing, database, models, personal_api
from backend.ai_service import AIService, AIError
from backend.routes import groups
from backend.tests.test_personal_api import db  # noqa: F401


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
    first = models.StudentGroup(code="GR-SHARE1", name="Shared class", owner_username="alice")
    second = models.StudentGroup(code="GR-SHARE2", name="Other class", owner_username="dora")
    db.add_all([first, second])
    db.flush()
    db.add(models.GroupMembership(group_id=first.id, username="bob"))
    keys = {"alice": connection(db, "alice"), "dora": connection(db, "dora", "dora-model")}
    db.commit()
    current = {"identity": {"username": "alice", "groups": ["docenti"], "is_admin": False, "is_researcher": False, "authenticated": True}}
    app = FastAPI()
    app.include_router(groups.router)
    app.dependency_overrides[database.get_db] = lambda: db
    app.dependency_overrides[auth.get_current_user] = lambda: current["identity"]
    with TestClient(app, headers={"X-Requested-With": "CounselorBot"}) as client:
        client.actor = current
        yield client, first, second, keys


def targets(db, username):
    return AIService(db, username=username)._targets("ollama", "institution-model")


def test_class_students_use_the_shared_key_others_do_not(db, school):
    client, first, _, keys = school
    path = f"/teacher/groups/{first.id}/api-share"
    assert client.get(path).json()["share"] is None
    response = client.put(path, json={"connection_id": keys["alice"].id, "reasoning": "low"})
    assert response.status_code == 200, response.text
    state = response.json()
    assert state["share"]["mine"] and state["share"]["model"] == "teacher-model"
    assert "fake-key" not in response.text and "encrypted_key" not in response.text
    service = AIService(db, username="bob")
    assert service.shared_group_id == first.id and service.personal_reasoning == "low"
    assert service.config["api_key_openai"] == "alice-fake-key"
    assert targets(db, "bob") == [("openai", "teacher-model")]
    assert targets(db, "carol") == [("ollama", "institution-model")]
    # Revoking applies to the next message.
    assert client.delete(path).json()["share"] is None
    assert targets(db, "bob") == [("ollama", "institution-model")]


def test_only_own_connections_and_never_with_the_switch_off(db, school):
    client, first, _, keys = school
    path = f"/teacher/groups/{first.id}/api-share"
    assert client.put(path, json={"connection_id": keys["dora"].id}).status_code == 404
    assert client.put(path, json={"connection_id": keys["alice"].id, "reasoning": "turbo"}).status_code == 422
    assert client.put(path, json={"connection_id": keys["alice"].id}).status_code == 200
    class_api_sharing.set_switch(db, False)
    assert targets(db, "bob") == [("ollama", "institution-model")]
    assert client.put(path, json={"connection_id": keys["alice"].id}).status_code == 403
    assert client.get(path).json()["available"] is False
    # Stopping stays possible.
    assert client.delete(path).status_code == 200


def test_own_choice_wins_and_conflicting_classes_fall_back(db, school):
    client, first, second, keys = school
    assert client.put(f"/teacher/groups/{first.id}/api-share", json={"connection_id": keys["alice"].id}).status_code == 200
    db.add(models.ClassAPIShare(group_id=second.id, owner_username="dora", connection_id=keys["dora"].id))
    db.add(models.GroupMembership(group_id=second.id, username="bob"))
    db.commit()
    assert targets(db, "bob") == [("ollama", "institution-model")]  # Two different shares: ambiguous.
    db.query(models.ClassAPIShare).filter_by(group_id=second.id).delete()
    own = connection(db, "bob", "bob-model")
    db.add(models.PersonalAIRouting(username="bob", enabled=True, default_connection_id=own.id))
    db.commit()
    assert targets(db, "bob") == [("openai", "bob-model")]


def test_failures_are_neutral_for_students_and_recorded_for_the_teacher(db, school):
    client, first, _, keys = school
    path = f"/teacher/groups/{first.id}/api-share"
    client.put(path, json={"connection_id": keys["alice"].id})
    service = AIService(db, username="bob")
    error = service._personal_failure(type("Quota", (Exception,), {"status_code": 429, "body": None})())
    assert isinstance(error, AIError) and error.code == class_api_sharing.SHARE_ERROR
    db.expire_all()
    assert client.get(path).json()["share"]["last_error"] == "personalAPI.errors.rateLimit"
    # Saving again clears it.
    assert client.put(path, json={"connection_id": keys["alice"].id}).json()["share"]["last_error"] is None


def test_month_usage_counts_only_this_class(db, school):
    client, first, second, _ = school
    db.add_all([models.Log(action="chat_message", cost_usd=0.25, details={"shared_group_id": first.id}),
                models.Log(action="chat_message", cost_usd=0.5, details={"shared_group_id": first.id}),
                models.Log(action="chat_message", cost_usd=9.0, details={"shared_group_id": second.id}),
                models.Log(action="chat_message", cost_usd=1.0, details={})])
    db.commit()
    assert client.get(f"/teacher/groups/{first.id}/api-share").json()["usage"] == {"requests": 2, "cost_usd": 0.75}
