"""Existing class results/transcript HTTP boundary, isolated synthetic Postgres."""
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, database, models
from backend.routes import groups
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def class_results_api():
    with artifact_session() as db:
        owned = models.StudentGroup(code="GR-S3OWN", name="Owned fixture", owner_username="owner")
        shared = models.StudentGroup(code="GR-S3SHARED", name="Shared fixture", owner_username="colleague")
        private = models.StudentGroup(code="GR-S3PRIVATE", name="Private fixture", owner_username="unrelated")
        empty = models.StudentGroup(code="GR-S3EMPTY", name="Empty fixture", owner_username="owner")
        db.add_all([owned, shared, private, empty])
        db.flush()
        db.add_all([
            models.GroupShare(group_id=shared.id, shared_with_username="owner", granted_by_username="colleague"),
            models.GroupMembership(group_id=owned.id, username="student.owned", joined_via="web"),
            models.GroupMembership(group_id=owned.id, username="student.no-results", joined_via="web"),
            models.GroupMembership(group_id=shared.id, username="student.shared", joined_via="web"),
            models.GroupMembership(group_id=private.id, username="student.private", joined_via="web"),
        ])
        for username, session, kind in [
            ("student.owned", "owned-qsa", "QSA"),
            ("student.owned", "owned-qualitative", "SAVICKAS"),
            ("student.shared", "shared-result", "ZTPI"),
            ("student.private", "private-result", "QSA"),
            ("outsider", "outsider-result", "QSA"),
        ]:
            db.add(models.QuestionnaireResult(username=username, session_id=session,
                questionnaire_type=kind, scores=None if kind == "SAVICKAS" else {"C1": 7},
                submitted_at=datetime(2026, 10, 13, 8, tzinfo=timezone.utc)))
            db.add(models.Log(username=username, session_id=session, action="chat_message",
                details={"user_input": f"Synthetic {session}", "bot_response": "Synthetic reply"}))
        db.commit()
        identity = {"username": "owner", "authenticated": True, "is_admin": False,
                    "is_researcher": False, "groups": ["docenti"]}
        app = FastAPI()
        app.include_router(groups.router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        with TestClient(app) as client:
            yield client, db, identity, (owned.id, shared.id, private.id, empty.id)


def test_class_picker_lists_only_owned_and_shared_classes(class_results_api):
    client, _, _, (owned, shared, private, empty) = class_results_api
    assert {row["id"] for row in client.get("/admin/groups").json()} == {owned, shared, empty}
    assert client.get(f"/admin/groups/{private}/students").status_code == 404


def test_saved_results_only_current_members_and_class_scope(class_results_api):
    client, _, _, (owned, shared, _, empty) = class_results_api
    payload = client.get(f"/admin/groups/{owned}/students").json()
    assert payload["group_id"] == owned
    students = {student["username"]: student["results"] for student in payload["students"]}
    assert set(students) == {"student.owned", "student.no-results"}
    assert students["student.no-results"] == []
    assert {row["questionnaire_type"] for row in students["student.owned"]} == {"QSA", "SAVICKAS"}
    assert all(row["submitted_at"] for row in students["student.owned"])
    shared_payload = client.get(f"/admin/groups/{shared}/students").json()
    assert [row["username"] for row in shared_payload["students"]] == ["student.shared"]
    assert client.get(f"/admin/groups/{empty}/students").json() == {"group_id": empty, "students": []}


@pytest.mark.parametrize("role", ["owner", "colleague", "unrelated", "no-classes", "admin", "student"])
def test_list_and_transcript_permissions(class_results_api, role):
    client, _, identity, (owned, shared, private, empty) = class_results_api
    identity.update(username=role, is_admin=role == "admin", groups=["studenti" if role == "student" else "docenti"])
    response = client.get("/admin/groups")
    if role == "student":
        assert response.status_code == 403
        assert client.get(f"/admin/groups/{owned}/students").status_code == 403
        assert client.get(f"/admin/groups/{owned}/students/student.owned/conversation/owned-qsa").status_code == 403
        return
    visible = {"owner": {owned, shared, empty}, "colleague": {shared}, "unrelated": {private}, "no-classes": set(), "admin": {owned, shared, private, empty}}[role]
    assert {row["id"] for row in response.json()} == visible
    for group_id, username, session in [(owned, "student.owned", "owned-qsa"), (shared, "student.shared", "shared-result"), (private, "student.private", "private-result")]:
        expected = 200 if group_id in visible else 404
        assert client.get(f"/admin/groups/{group_id}/students").status_code == expected
        transcript = client.get(f"/admin/groups/{group_id}/students/{username}/conversation/{session}")
        assert transcript.status_code == expected
        if expected == 200:
            assert [message["text"] for message in transcript.json()] == [f"Synthetic {session}", "Synthetic reply"]


def test_revoked_share_membership_and_mismatched_session_remain_denied(class_results_api):
    client, db, _, (owned, shared, private, _) = class_results_api
    base = f"/admin/groups/{owned}/students"
    for username, session in [("student.owned", "private-result"), ("student.private", "private-result"), ("outsider", "outsider-result"), ("student.no-results", "owned-qsa")]:
        assert client.get(f"{base}/{username}/conversation/{session}").status_code == 404
    db.query(models.GroupShare).filter_by(group_id=shared).delete()
    db.commit()
    assert client.get(f"/admin/groups/{shared}/students").status_code == 404
    assert client.get(f"/admin/groups/{shared}/students/student.shared/conversation/shared-result").status_code == 404
    db.query(models.GroupMembership).filter_by(group_id=owned, username="student.owned").delete()
    db.commit()
    assert client.get(f"{base}/student.owned/conversation/owned-qsa").status_code == 404
    assert all(not student["results"] for student in client.get(base).json()["students"])
