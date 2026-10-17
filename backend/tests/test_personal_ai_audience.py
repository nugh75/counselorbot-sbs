"""Separate switches for teachers and students, per feature (personal APIs, ChatGPT)."""
from backend import chatgpt_connections as accounts, models, personal_ai_audience as audience
from backend.tests.test_personal_api import identity  # noqa: F401
from backend.tests.test_unified_ai_sources import api_connection, chatgpt, client, db, route, signed, targets  # noqa: F401


def as_student(db):
    db.info["personal_ai_staff"] = ("alice", False)


def as_teacher(db):
    db.info["personal_ai_staff"] = ("alice", True)


def test_unsaved_switches_keep_both_audiences_on(db):
    assert audience.audiences(db) == {"api": {"teachers": True, "students": True},
                                      "chatgpt": {"teachers": True, "students": True}}


def test_student_switch_off_keeps_teachers_and_vice_versa(client, db, chatgpt):
    cid = api_connection(client)
    assert route(client, default_connection_id=cid, bindings=[{"counselor_id": 11, "chatgpt_model": "fixture-model"}]).status_code == 200
    audience.set_audiences(db, {"api": {"teachers": True, "students": False}, "chatgpt": {"teachers": False, "students": True}})
    as_student(db)
    assert targets(db, 10) == [("ollama", "institution-model")]
    assert targets(db, 11) == [("openai_chatgpt", "fixture-model")]
    as_teacher(db)
    assert targets(db, 10) == [("openai", "own-model")]
    assert targets(db, 11) == [("ollama", "institution-model")]
    assert accounts.status(db, "alice")["enabled"] is False


def test_catalog_and_routing_follow_the_role(client, db, chatgpt):
    cid = api_connection(client)
    audience.set_audiences(db, {"api": {"teachers": True, "students": False}})
    client.actor["identity"] = identity(groups=["studenti"])
    state = client.get("/user/api-connections").json()
    assert state["api_enabled"] is False and state["chatgpt_enabled"] is True
    assert route(client, default_connection_id=cid).status_code == 403
    client.actor["identity"] = identity(groups=["docenti"])
    assert client.get("/user/api-connections").json()["api_enabled"] is True
    assert route(client, default_connection_id=cid).status_code == 200


def test_background_calls_treat_class_owners_as_teachers(db):
    db.add(models.StudentGroup(code="GR-AUD1", name="Class", owner_username="teach"))
    db.commit()
    audience.set_audiences(db, {"api": {"teachers": False, "students": True}})
    assert audience.allowed(db, "api", "teach") is False
    assert audience.allowed(db, "api", "pupil") is True


def test_admin_endpoint_saves_both_features(client, db):
    client.actor["identity"] = identity("admin", is_admin=True)
    response = client.put("/admin/personal-ai-audiences", json={"chatgpt": {"teachers": True, "students": False}})
    assert response.status_code == 200, response.text
    assert response.json()["chatgpt"] == {"teachers": True, "students": False}
    assert response.json()["api"] == {"teachers": True, "students": True}
    client.actor["identity"] = identity()
    assert client.get("/admin/personal-ai-audiences").status_code == 403
