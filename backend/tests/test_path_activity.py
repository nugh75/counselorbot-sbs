"""Plan actions address the exact attempt, including drafts on another device."""
from uuid import uuid4
import os
import pytest

from backend import models
from backend.tests.test_class_paths import class_paths_api as class_paths_api
from backend.tests.test_it_administration import api as api, typed_path
from backend.tests.test_results_deep_dive import deep_dive_path, enter_scores, marker

pytestmark = pytest.mark.skipif(os.environ.get('TEST_DB', 'postgres') != 'postgres',
                               reason='Operational-plan business data uses PostgreSQL (ADR-0004)')


def chat_path(fixture):
    client, db, group_id, identity = fixture
    path = client.post(f"/teacher/groups/{group_id}/paths", json={"title": "Direct activity"}).json()
    response = client.put(f"/teacher/paths/{path['id']}", json={"title": path["title"], "revision": path["revision"],
                         "steps": [{"step_type": "guided_chat", "tool_key": "SAVICKAS"}]})
    assert response.status_code == 200, response.text
    path = response.json()
    response = client.post(f"/teacher/paths/{path['id']}/publish", json={"revision": path["revision"]})
    assert response.status_code == 200, response.text
    db.add(models.GroupMembership(group_id=group_id, username="student")); db.commit()
    identity.update(username="student", groups=[])
    return path, f"/user/paths/{path['id']}/steps/{path['steps'][0]['id']}"


def test_chat_start_resume_complete_repeat_and_history(class_paths_api):
    client, db, _, identity = class_paths_api
    path, url = chat_path(class_paths_api)
    assert client.get(url + "/activity").json()["primary"]["label"] == "start"
    first = client.post(url + "/attempts", json={"attempt_id": str(uuid4())})
    assert first.status_code == 200, first.text
    sid = first.json()["session_id"]
    # An initial launch racing from another tab returns the same attempt.
    assert client.post(url + "/attempts", json={"attempt_id": str(uuid4())}).json()["session_id"] == sid
    state = client.get(url + "/activity").json()
    assert state["primary"]["label"] == "resume"
    assert state["current"]["resumable"] is True  # registered even before first chat turn
    assert db.query(models.QuestionnaireResult).filter_by(session_id=sid, username="student").count() == 1
    marker(db, sid, questionnaire_type="SAVICKAS")
    state = client.get(url + "/activity").json()
    assert state["primary"]["label"] == "review"
    assert client.get("/user/paths").json()[0]["steps"][0]["state"] == "done"
    token = str(uuid4())
    second = client.post(url + "/attempts", json={"attempt_id": token, "new_attempt": True}).json()
    assert second["session_id"] == token != sid
    assert client.post(url + "/attempts", json={"attempt_id": token, "new_attempt": True}).json() == second
    row = client.get("/user/paths").json()[0]
    assert row["done"] == 1
    assert row["steps"][0]["activity"]["primary"]["label"] == "resume"
    assert [item["state"] for item in row["steps"][0]["activity"]["attempts"]] == ["in_progress", "completed"]
    # No other member can select/claim this conversation's ID.
    db.add(models.GroupMembership(group_id=path["group_id"], username="other")); db.commit()
    identity.update(username="other")
    assert client.get(url + "/activity").json()["attempts"] == []
    assert client.post(url + "/attempts", json={"attempt_id": token, "new_attempt": True}).status_code == 409


def test_unrelated_conversation_does_not_complete_chat_step(class_paths_api):
    client, db, _, _ = class_paths_api
    _, url = chat_path(class_paths_api)
    marker(db, "personal-session", questionnaire_type="SAVICKAS")
    assert client.get(url + "/activity").json()["current"] is None
    assert client.get("/user/paths").json()[0]["done"] == 0


def test_completed_legacy_pause_keeps_its_exact_history_when_removed(class_paths_api):
    from backend.routes import frozen_sessions
    client, db, _, identity = class_paths_api
    path, url = chat_path(class_paths_api)
    result = models.QuestionnaireResult(username="student", session_id="legacy-plan-chat", questionnaire_type="SAVICKAS", scores={})
    frozen = models.FrozenSession(username="student", session_id=result.session_id, questionnaire_type="SAVICKAS",
                data={"path_id": path["id"], "path_step_id": path["steps"][0]["id"]})
    db.add_all([result, frozen]); db.commit()
    marker(db, result.session_id, questionnaire_type="SAVICKAS")
    client.app.include_router(frozen_sessions.router)
    response = client.delete(f"/session/frozen/{result.session_id}")
    assert response.status_code == 200, response.text
    assert db.query(models.FrozenSession).filter_by(session_id=result.session_id).count() == 0
    detail = client.get(url + "/activity").json()
    assert detail["primary"]["label"] == "review"
    assert [attempt["session_id"] for attempt in detail["attempts"]] == [result.session_id]
    assert client.get("/user/paths").json()[0]["done"] == 1


def test_missing_snapshot_with_existing_turns_is_not_a_fresh_chat(class_paths_api):
    client, db, _, _ = class_paths_api
    _, url = chat_path(class_paths_api)
    first = client.post(url + "/attempts", json={}).json()
    db.add(models.Log(username="student", session_id=first["session_id"], action="chat_message", questionnaire_type="SAVICKAS")); db.commit()
    assert client.get(url + "/activity").json()["current"]["resumable"] is False
    # A late autosave restores resumability without creating another attempt.
    db.add(models.FrozenSession(username="student", session_id=first["session_id"], questionnaire_type="SAVICKAS", data={})); db.commit()
    assert client.get(url + "/activity").json()["current"]["resumable"] is True


def test_questionnaire_draft_revision_owner_and_completed_result(api):
    client, db, group, identity = api
    plan, path = typed_path(client, group)
    identity.update(username="student", groups=[])
    url = f"/user/paths/{path['id']}/steps/{path['steps'][0]['id']}"
    attempt = client.post(url + "/attempts", json={}).json()
    sid = attempt["session_id"]
    draft_url = url + f"/attempts/{sid}/draft"
    body = {"revision": 0, "scores": {"C1": 5, "C2": 7}, "answers": {"1": 2}}
    assert client.put(draft_url, json=body).json() == {"revision": 1}
    assert client.put(draft_url, json=body).json() == {"revision": 1}
    assert client.put(draft_url, json={**body, "answers": {"1": 3}}).status_code == 409
    detail = client.get(url + "/activity").json()
    assert detail["current"]["draft"]["scores"] == body["scores"]
    assert "draft" not in client.get("/user/paths").json()[0]["steps"][0]["activity"]["current"]
    grant = client.post(f"/user/administrations/{plan['id']}/verify-institution",
                       json={"institution_code": "SYN-150", "password": "Invented-150"}).json()["grant"]
    accepted = client.post(url + "/guided-entry", json={"session_id": sid, "request_id": sid,
                           "scores": body["scores"], "institution_grant": grant})
    assert accepted.status_code == 200, accepted.text
    detail = client.get(url + "/activity").json()
    assert detail["current"]["state"] == "completed"
    assert detail["current"]["result"]["scores"] == body["scores"]
    assert detail["repeat"]["label"] == "newCompilation"
    assert client.put(draft_url, json={**body, "revision": 1}).status_code == 409
    assert db.query(models.Log).count() == 0  # Completing data collection needs no AI chat.
    db.add(models.GroupMembership(group_id=group.id, username="other")); db.commit()
    identity.update(username="other")
    assert client.get(url + "/activity").json()["attempts"] == []
    assert client.put(draft_url, json=body).status_code == 404


def test_analysis_history_and_latest_compilation(api):
    client, db, group, identity = api
    plan, path = deep_dive_path(client, group)
    identity.update(username="student", groups=[])
    first_result = enter_scores(client, plan, path)
    analysis_url = f"/user/paths/{path['id']}/steps/{path['steps'][1]['id']}"
    first = client.post(analysis_url + "/deep-dive").json()
    marker(db, first["session_id"])
    detail = client.get(analysis_url + "/activity").json()
    assert detail["primary"]["label"] == "review"
    source_url = f"/user/paths/{path['id']}/steps/{path['steps'][0]['id']}"
    assert client.get(source_url + "/activity").json()["next_href"].endswith(f"/{path['steps'][1]['id']}")
    grant = client.post(f"/user/administrations/{plan['id']}/verify-institution", json={"institution_code": "SYN-150", "password": "Invented-150"}).json()["grant"]
    second_result = client.post(source_url + "/guided-entry", json={"session_id": str(uuid4()), "request_id": str(uuid4()),
                                "scores": {"C1": 6, "C2": 8}, "institution_grant": grant}).json()
    second = client.post(analysis_url + "/deep-dive", json={"attempt_id": str(uuid4())}).json()
    assert second["result"]["id"] == second_result["result"]["id"] != first_result["result"]["id"]
    detail = client.get(analysis_url + "/activity").json()
    assert detail["primary"]["label"] == "resume"
    assert len(detail["attempts"]) == 2
    assert detail["attempts"][1]["session_id"] == first["session_id"]
