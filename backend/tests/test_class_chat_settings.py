"""Class policy and provider inputs on isolated synthetic databases."""
from unittest.mock import patch

import pytest

from backend import models
from backend.api_models import ChatRequest
from backend.class_chat_settings import apply_class_chat_settings, resolve_class_chat_settings
from backend.routes import chat
from backend.chat_preparation import prepare_chat_turn
from backend.tests.artifact_database import artifact_session
from backend.tests.test_class_access import _client
from backend.tests.test_class_settings import settings_api as settings_api

STUDENT = {"username": "learner", "authenticated": True, "groups": ["studenti"]}


def add_class(db, code, *, active=True, member="learner", **settings):
    group = models.StudentGroup(code=code, name=code, owner_username="owner", is_active=active)
    db.add(group)
    db.flush()
    if member:
        db.add(models.GroupMembership(group_id=group.id, username=member))
    db.add(models.ClassSettings(group_id=group.id, updated_by="owner", **settings))
    db.commit()
    return group


@pytest.mark.parametrize("roles", [["studenti"], ["docenti"]])
@pytest.mark.parametrize("route", ["/chat", "/chat/stream"])
def test_actual_memberships_enforce_every_parameter_before_provider(roles, route):
    with artifact_session() as db:
        db.add(models.Instrument(code="QSA", is_active=True, target_audience="student"))
        add_class(db, "GR-LOCK", response_format="bullets", response_length="short", response_reasoning="off",
                  allow_student_response_format=False, allow_student_response_length=False,
                  allow_student_response_reasoning=False)
        identity = {**STUDENT, "groups": roles}
        seen = []

        def prepare(*args, **kwargs):
            return prepare_chat_turn(*args, **{**kwargs, "include_retrieval": False, "include_history": False})

        def check(ai, message, system, *args, **kwargs):
            seen.append(True)
            assert "Use concise Markdown bullet points" in system
            assert kwargs["max_tokens"] == 1000
            assert ai.reasoning_effort_override == "off" and ai.disable_thinking
            return "Synthetic reply"

        def stream(ai, *args, **kwargs):
            yield {"type": "delta", "text": check(ai, *args, **kwargs)}

        with _client(db, identity) as client, patch.object(chat, "prepare_chat_turn", side_effect=prepare), \
                patch.object(chat.AIService, "get_response", new=check), \
                patch.object(chat.AIService, "stream_response", new=stream):
            for claimed_groups in (None, [], [999999]):
                response = client.post(route, json={"message": "Synthetic", "questionnaire_type": "QSA",
                    "session_id": "class-policy", "response_format": "table", "response_length": "long",
                    "reasoning_effort": "deep", "group_ids": claimed_groups})
                assert response.status_code == 200, response.text
        assert len(seen) == 3


def test_locking_class_supplies_value_and_conflicts_have_stable_priority():
    with artifact_session() as db:
        add_class(db, "GR-OPEN", response_format="table", response_length="long", response_reasoning="deep")
        locked = add_class(db, "GR-LOCK", response_format="bullets", response_length="short", response_reasoning="off",
                           allow_student_response_format=False, allow_student_response_length=False,
                           allow_student_response_reasoning=False)
        add_class(db, "GR-CONFLICT", response_format="standard", allow_student_response_format=False)
        policy = resolve_class_chat_settings(db, STUDENT)
        assert (policy["response_format"], policy["response_length"], policy["response_reasoning"]) == ("bullets", "short", "off")
        locked.is_active = False
        db.commit()
        assert resolve_class_chat_settings(db, STUDENT)["response_format"] == "standard"


def test_inactive_and_other_users_classes_do_not_constrain_learner():
    with artifact_session() as db:
        add_class(db, "GR-INACTIVE", active=False, allow_student_response_length=False)
        add_class(db, "GR-OTHER", member="other", allow_student_response_length=False)
        policy = resolve_class_chat_settings(db, STUDENT)
        assert policy["group_ids"] == [] and policy["allow_student_response_length"]


def test_lock_without_value_has_safe_default_and_allowed_choice_wins():
    with artifact_session() as db:
        group = add_class(db, "GR-LOCK", allow_student_response_format=False,
                          allow_student_response_length=False, allow_student_response_reasoning=False)
        request = ChatRequest(response_format="table", response_length="long", reasoning_effort="deep")
        effective = apply_class_chat_settings(db, STUDENT, request)
        assert (effective.response_format, effective.response_length, effective.reasoning_effort) == ("standard", "medium", "standard")
        settings = db.get(models.ClassSettings, group.id)
        settings.allow_student_response_format = True
        settings.response_format = "bullets"
        db.commit()
        assert apply_class_chat_settings(db, STUDENT, request).response_format == "table"
        assert apply_class_chat_settings(db, STUDENT, ChatRequest()).response_format == "bullets"


def test_teacher_work_does_not_inherit_learner_policy():
    with artifact_session() as db:
        add_class(db, "GR-LOCK", response_length="short", allow_student_response_length=False)
        request = ChatRequest(questionnaire_type="OBIETTIVO_DOCENZA", response_length="long")
        assert apply_class_chat_settings(db, {**STUDENT, "groups": ["docenti"]}, request).response_length == "long"
        preview = ChatRequest(preview=True, response_length="long")
        assert apply_class_chat_settings(db, {**STUDENT, "is_admin": True}, preview).response_length == "long"


@pytest.mark.parametrize("field,value", [("response_format", "table"), ("response_length", "short"), ("response_reasoning", "off")])
def test_explicit_null_clears_value_and_omitted_field_preserves_it(settings_api, field, value):
    client, db, group_id, identity = settings_api
    path = f"/teacher/groups/{group_id}/settings"
    saved = client.put(path, json={"revision": 1, "disabled_tool_keys": [], field: value})
    assert saved.status_code == 200 and saved.json()[field] == value
    unchanged = client.put(path, json={"revision": 2, "disabled_tool_keys": []})
    assert unchanged.json()[field] == value
    cleared = client.put(path, json={"revision": 3, "disabled_tool_keys": [], field: None})
    assert cleared.status_code == 200 and cleared.json()[field] is None
    assert client.get(path).json()[field] is None
    assert db.query(models.ClassSettingsAuditLog).filter_by(group_id=group_id, target_id=field).count() == 2


def test_teacher_can_join_as_learner_without_gaining_management(settings_api):
    client, db, group_id, identity = settings_api
    identity.update(username="learner-teacher", groups=["docenti"])
    group = db.get(models.StudentGroup, group_id)
    assert client.post("/groups/join", json={"code": group.code}).status_code == 200
    assert client.get("/user/groups").json()[0]["group_id"] == group_id
    assert client.get(f"/teacher/groups/{group_id}/settings").status_code == 403
    assert client.get(f"/admin/groups/{group_id}/students").status_code == 404
    assert client.get("/student/class-chat-settings").json()["group_ids"] == [group_id]


def test_institution_class_owner_and_shared_teacher_see_teacher_learners(settings_api):
    client, db, group_id, identity = settings_api
    school = models.Institution(slug="synthetic-school", name="Synthetic school", kind="school")
    db.add(school)
    db.flush()
    db.get(models.StudentGroup, group_id).institution_id = school.id
    db.add_all([models.GroupMembership(group_id=group_id, username="teacher-learner"),
                models.GroupShare(group_id=group_id, shared_with_username="shared", granted_by_username="owner")])
    db.commit()
    for username in ("owner", "shared", "outsider"):
        identity["username"] = username
        response = client.get(f"/admin/groups/{group_id}/students")
        if username == "outsider":
            assert response.status_code == 404
        else:
            assert response.status_code == 200
            assert [row["username"] for row in response.json()["students"]] == ["teacher-learner"]
