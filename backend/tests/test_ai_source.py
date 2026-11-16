"""#1020: the navbar learns which key answers a person, never the key itself."""
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, class_api_sharing, database, models, personal_api
from backend.routes import personal_api as routes
from backend.tests.test_personal_api import db, identity  # noqa: F401


def connection(db, username, provider="openai", model="own-model"):
    row = models.PersonalAPIConnection(id=uuid.uuid4().hex, username=username, name="key",
                                       provider=provider, model_name=model, encrypted_key="")
    row.encrypted_key = personal_api.encrypt_key(username, provider, f"{username}-secret-key", row.id)
    db.add(row)
    db.flush()
    return row


@pytest.fixture
def client(db):
    db.add_all([models.Config(key="active_provider", value="anthropic"), models.Config(key="model_name", value="system-model"),
                models.Counselor(id=30, name="Clio", slug="clio", is_active=True)])
    db.commit()
    current = {"identity": identity("bob", groups=["studenti"])}
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[database.get_db] = lambda: db
    app.dependency_overrides[auth.get_identity] = lambda: current["identity"]
    with TestClient(app) as c:
        c.actor = current
        yield c


def source(client, counselor=None):
    response = client.get("/me/ai-source", params={"counselor": counselor} if counselor else None)
    assert response.status_code == 200, response.text
    assert "secret-key" not in response.text
    return response.json()


def test_system_key_by_default(client):
    data = source(client, 30)
    assert data == {"source": "system", "owner_role": "admin", "viewer_role": "student", "owner_label": None, "provider": "anthropic",
                    "connection": "api", "model": "system-model", "fallback": False, "fallback_reason": None}


def test_own_api_key_for_the_counselor_or_by_default(client, db):
    key = connection(db, "bob", "mistral", "mistral-small")
    db.add(models.PersonalAIRouting(username="bob", enabled=True, default_connection_id=key.id))
    db.commit()
    for counselor in (None, 30):
        data = source(client, counselor)
        assert (data["source"], data["owner_role"], data["provider"], data["model"]) == ("own_api", "student", "mistral", "mistral-small")
    client.actor["identity"] = identity("bob", groups=["docenti"])
    assert source(client)["owner_role"] == "teacher"


def test_chatgpt_subscription(client, db):
    db.add(models.PersonalAIRouting(username="bob", enabled=True, default_chatgpt_model="gpt-5.4"))
    db.add(models.ChatGPTConnection(username="bob"))
    db.commit()
    data = source(client, 30)
    assert (data["source"], data["connection"], data["provider"], data["model"]) == ("chatgpt", "subscription", "openai", "gpt-5.4")


def test_teacher_key_shared_with_the_class(client, db):
    class_api_sharing.set_switch(db, True)
    group = models.StudentGroup(code="GR-SRC1", name="Class", owner_username="alice")
    db.add(group)
    db.flush()
    db.add(models.GroupMembership(group_id=group.id, username="bob"))
    db.add(models.UserDisplayName(username="alice", display_name="Prof. Rossi"))
    key = connection(db, "alice", "gemini", "gemini-pro")
    db.add(models.PersonalAIRouting(username="alice", enabled=True, share_with_classes=True))
    db.add(models.PersonalCounselorConnection(username="alice", counselor_id=30, connection_id=key.id))
    db.commit()
    data = source(client, 30)
    assert (data["source"], data["owner_role"], data["owner_label"], data["provider"]) == ("teacher_api", "teacher", "Prof. Rossi", "gemini")
    assert source(client)["source"] == "system"  # Offers are per counselor, never the default.


def test_fallback_when_the_own_choice_cannot_be_used(client, db):
    key = connection(db, "bob")
    db.add(models.PersonalAIRouting(username="bob", enabled=True, default_connection_id=key.id))
    db.query(models.Config).filter_by(key=personal_api.POLICY_KEY).update({"value": "false"})
    db.commit()
    data = source(client, 30)
    assert (data["source"], data["fallback"], data["fallback_reason"]) == ("system", True, "disabled")
    routing = db.get(models.PersonalAIRouting, "bob")
    routing.default_connection_id, routing.default_chatgpt_model = None, "gpt-5.4"
    db.commit()
    assert source(client)["fallback_reason"] == "notConnected"


def test_requires_an_account(client):
    client.actor["identity"] = auth._anonymous_identity()
    assert client.get("/me/ai-source").status_code == 401
