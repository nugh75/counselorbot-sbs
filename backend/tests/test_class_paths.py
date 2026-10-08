"""Tests for class paths backend models, validation, and teacher endpoints."""
import pytest
from datetime import date
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, database, models
from backend.routes import class_paths, groups
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def class_paths_api():
    with artifact_session() as db:
        group = models.StudentGroup(
            code="GR-PATH01",
            name="Class Path Test Group",
            owner_username="owner",
        )
        db.add(group)
        db.add_all([
            models.Instrument(code="QSA", name_en="Learning strategies", is_active=True, tool_category="assessment"),
            models.Instrument(code="SAVICKAS", name_en="Career interview", is_active=True, tool_category="guided"),
            models.Instrument(code="IDEA", name_en="Idea focus", is_active=True, tool_category="guided"),
            models.Instrument(code="OFF_INST", name_en="Disabled instrument", is_active=False, tool_category="assessment"),
            models.Instrument(code="TEACHER_INST", target_audience="teacher", is_active=True),
        ])
        db.commit()

        identity = {
            "username": "owner",
            "groups": ["docenti"],
            "is_admin": False,
            "is_researcher": False,
            "authenticated": True,
        }
        app = FastAPI()
        app.include_router(groups.router)
        app.include_router(class_paths.router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: identity

        with TestClient(app) as client:
            yield client, db, group.id, identity


def test_create_draft_path_and_list(class_paths_api):
    client, db, group_id, _ = class_paths_api
    # Create draft
    payload = {
        "title": "Start of year",
        "description": "Guidance orientation path",
        "mode": "recommended",
    }
    response = client.post(f"/teacher/groups/{group_id}/paths", json=payload)
    assert response.status_code == 200
    created = response.json()
    assert created["id"] > 0
    assert created["group_id"] == group_id
    assert created["title"] == "Start of year"
    assert created["description"] == "Guidance orientation path"
    assert created["mode"] == "recommended"
    assert created["status"] == "draft"
    assert created["revision"] == 1
    assert created["created_by"] == "owner"
    assert created["steps"] == []
    assert created["steps_count"] == 0

    # List paths
    list_resp = client.get(f"/teacher/groups/{group_id}/paths")
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert len(items) == 1
    assert items[0]["id"] == created["id"]
    assert items[0]["title"] == "Start of year"


def test_put_steps_reorder_and_soft_remove(class_paths_api):
    client, db, group_id, _ = class_paths_api
    created = client.post(
        f"/teacher/groups/{group_id}/paths",
        json={"title": "Draft 1", "mode": "recommended"},
    ).json()
    path_id = created["id"]

    # Initial steps: 1: Bussola, 2: QSA, 3: Timeline
    put_payload = {
        "revision": 1,
        "title": "Draft 1 (updated)",
        "mode": "strict",
        "steps": [
            {"tool_key": "bussola", "title": "Start here", "instructions": "Complete orientation"},
            {"tool_key": "QSA", "due_date": "2026-10-15"},
            {"tool_key": "timeline", "title": "Personal milestone"},
        ],
    }
    res = client.put(f"/teacher/paths/{path_id}", json=put_payload)
    assert res.status_code == 200
    body = res.json()
    assert body["revision"] == 2
    assert body["mode"] == "strict"
    assert body["title"] == "Draft 1 (updated)"
    assert len(body["steps"]) == 3
    assert body["steps_count"] == 3

    step_bussola, step_qsa, step_timeline = body["steps"]
    assert step_bussola["position"] == 1
    assert step_bussola["tool_key"] == "bussola"
    assert step_bussola["auto_detect"] is True
    assert step_bussola["can_self_mark"] is False

    assert step_qsa["position"] == 2
    assert step_qsa["tool_key"] == "QSA"
    assert step_qsa["due_date"] == "2026-10-15"
    assert step_qsa["auto_detect"] is True
    assert step_qsa["can_self_mark"] is False

    assert step_timeline["position"] == 3
    assert step_timeline["tool_key"] == "timeline"
    assert step_timeline["auto_detect"] is False
    assert step_timeline["can_self_mark"] is True

    # Reorder (swap QSA and Bussola) and soft-remove timeline by omitting its ID
    reorder_payload = {
        "revision": 2,
        "title": "Draft 1 (reordered)",
        "mode": "strict",
        "steps": [
            {"id": step_qsa["id"], "tool_key": "QSA", "due_date": "2026-10-15"},
            {"id": step_bussola["id"], "tool_key": "bussola", "title": "Now compass"},
            {"tool_key": "goals", "title": "Study goal"},
        ],
    }
    reorder_res = client.put(f"/teacher/paths/{path_id}", json=reorder_payload)
    assert reorder_res.status_code == 200
    reordered_body = reorder_res.json()
    assert reordered_body["revision"] == 3
    assert len(reordered_body["steps"]) == 3

    assert reordered_body["steps"][0]["id"] == step_qsa["id"]
    assert reordered_body["steps"][0]["position"] == 1
    assert reordered_body["steps"][1]["id"] == step_bussola["id"]
    assert reordered_body["steps"][1]["position"] == 2
    assert reordered_body["steps"][2]["tool_key"] == "goals"
    assert reordered_body["steps"][2]["position"] == 3

    # Check soft-remove in DB
    timeline_row = db.get(models.ClassPathStep, step_timeline["id"])
    assert timeline_row is not None
    assert timeline_row.removed_at is not None, "Omitted step must have removed_at set (soft-remove)"

    # Total rows in DB: 4 steps created overall, 3 active
    total_steps = db.query(models.ClassPathStep).filter(models.ClassPathStep.path_id == path_id).count()
    assert total_steps == 4


def test_put_rejects_stale_revision_409(class_paths_api):
    client, db, group_id, _ = class_paths_api
    created = client.post(
        f"/teacher/groups/{group_id}/paths",
        json={"title": "Draft Concurrency", "mode": "recommended"},
    ).json()
    path_id = created["id"]

    # First update increments revision to 2
    res1 = client.put(
        f"/teacher/paths/{path_id}",
        json={"revision": 1, "title": "Rev 2", "steps": []},
    )
    assert res1.status_code == 200
    assert res1.json()["revision"] == 2

    # Second update using stale revision 1 receives 409
    res_stale = client.put(
        f"/teacher/paths/{path_id}",
        json={"revision": 1, "title": "Stale Update", "steps": []},
    )
    assert res_stale.status_code == 409
    assert "revision mismatch" in res_stale.json()["detail"].lower()


def test_put_rejects_tool_not_enabled_for_class_422(class_paths_api):
    client, db, group_id, _ = class_paths_api
    created = client.post(
        f"/teacher/groups/{group_id}/paths",
        json={"title": "Test Disabled Tools", "mode": "recommended"},
    ).json()
    path_id = created["id"]

    # 1. Platform-disabled instrument OFF_INST -> 422
    res_off = client.put(
        f"/teacher/paths/{path_id}",
        json={"revision": 1, "title": "Try OFF", "steps": [{"tool_key": "OFF_INST"}]},
    )
    assert res_off.status_code == 422

    # 2. Unknown tool -> 422
    res_unknown = client.put(
        f"/teacher/paths/{path_id}",
        json={"revision": 1, "title": "Try Unknown", "steps": [{"tool_key": "nonexistent_tool"}]},
    )
    assert res_unknown.status_code == 422

    # 3. Always-on section (e.g. notebook) cannot be a path step -> 422
    res_always_on = client.put(
        f"/teacher/paths/{path_id}",
        json={"revision": 1, "title": "Try Always-on", "steps": [{"tool_key": "notebook"}]},
    )
    assert res_always_on.status_code == 422

    # 4. Tool disabled by teacher in class_settings -> 422
    settings_payload = {"revision": 1, "disabled_tool_keys": ["QSA"]}
    save_settings = client.put(f"/teacher/groups/{group_id}/settings", json=settings_payload)
    assert save_settings.status_code == 200

    res_teacher_disabled = client.put(
        f"/teacher/paths/{path_id}",
        json={"revision": 1, "title": "Try QSA", "steps": [{"tool_key": "QSA"}]},
    )
    assert res_teacher_disabled.status_code == 422


@pytest.mark.parametrize("role", ["owner", "co-teacher", "admin", "other-teacher", "student"])
def test_permissions_owner_coteacher_admin_only(class_paths_api, role):
    client, db, group_id, identity = class_paths_api
    db.add(models.GroupShare(group_id=group_id, shared_with_username="co-teacher", granted_by_username="owner"))
    db.commit()

    # Create path as owner
    created = client.post(
        f"/teacher/groups/{group_id}/paths",
        json={"title": "Permission Path", "mode": "recommended"},
    ).json()
    path_id = created["id"]

    # Switch identity
    identity.update(
        username=role,
        is_admin=(role == "admin"),
        groups=["studenti" if role == "student" else "docenti"],
    )

    expected = 200 if role in {"owner", "co-teacher", "admin"} else 403
    list_res = client.get(f"/teacher/groups/{group_id}/paths")
    assert list_res.status_code == expected

    get_res = client.get(f"/teacher/paths/{path_id}")
    assert get_res.status_code == expected

    put_res = client.put(f"/teacher/paths/{path_id}", json={"revision": 1, "title": "Perm test", "steps": []})
    assert put_res.status_code == expected


def test_archive_restore_and_delete_class_path(class_paths_api):
    client, db, group_id, _ = class_paths_api
    created = client.post(
        f"/teacher/groups/{group_id}/paths",
        json={"title": "Lifecycle Path", "mode": "recommended"},
    ).json()
    path_id = created["id"]

    # Archive
    arch_res = client.post(f"/teacher/paths/{path_id}/archive")
    assert arch_res.status_code == 200
    assert arch_res.json()["status"] == "archived"
    assert arch_res.json()["archived_at"] is not None

    # Restore
    rest_res = client.post(f"/teacher/paths/{path_id}/restore")
    assert rest_res.status_code == 200
    assert rest_res.json()["status"] == "draft"
    assert rest_res.json()["archived_at"] is None

    # Delete
    del_res = client.delete(f"/teacher/paths/{path_id}")
    assert del_res.status_code == 200
    assert del_res.json()["ok"] is True

    # 403 after deletion (no 404 existence oracle)
    del_get = client.get(f"/teacher/paths/{path_id}")
    assert del_get.status_code == 403
    assert del_get.json()["detail"] == "Class path access denied"


def test_path_access_denied_oracle_prevention(class_paths_api):
    client, db, group_id, identity = class_paths_api
    db.add(models.GroupShare(group_id=group_id, shared_with_username="co-teacher", granted_by_username="owner"))
    db.commit()

    created = client.post(
        f"/teacher/groups/{group_id}/paths",
        json={"title": "Oracle Guard Path", "mode": "recommended"},
    ).json()
    path_id = created["id"]
    unknown_path_id = 999_999

    # 1. Unknown path id -> 403 "Class path access denied" (no 404 oracle across all endpoints)
    unknown_get = client.get(f"/teacher/paths/{unknown_path_id}")
    assert unknown_get.status_code == 403
    assert unknown_get.json()["detail"] == "Class path access denied"

    unknown_put = client.put(f"/teacher/paths/{unknown_path_id}", json={"revision": 1, "title": "X", "steps": []})
    assert unknown_put.status_code == 403
    assert unknown_put.json()["detail"] == "Class path access denied"

    unknown_arch = client.post(f"/teacher/paths/{unknown_path_id}/archive")
    assert unknown_arch.status_code == 403
    assert unknown_arch.json()["detail"] == "Class path access denied"

    unknown_restore = client.post(f"/teacher/paths/{unknown_path_id}/restore")
    assert unknown_restore.status_code == 403
    assert unknown_restore.json()["detail"] == "Class path access denied"

    unknown_del = client.delete(f"/teacher/paths/{unknown_path_id}")
    assert unknown_del.status_code == 403
    assert unknown_del.json()["detail"] == "Class path access denied"

    # 2. Other teacher accessing existing path -> 403 "Class path access denied"
    identity.update(username="other-teacher", is_admin=False, groups=["docenti"])
    other_get = client.get(f"/teacher/paths/{path_id}")
    assert other_get.status_code == 403
    assert other_get.json()["detail"] == "Class path access denied"

    other_put = client.put(f"/teacher/paths/{path_id}", json={"revision": 1, "title": "X", "steps": []})
    assert other_put.status_code == 403
    assert other_put.json()["detail"] == "Class path access denied"

    # 3. Owner / Co-teacher / Admin -> 200
    for allowed_role in ["owner", "co-teacher", "admin"]:
        identity.update(
            username=allowed_role,
            is_admin=(allowed_role == "admin"),
            groups=["docenti"],
        )
        res = client.get(f"/teacher/paths/{path_id}")
        assert res.status_code == 200
        assert res.json()["id"] == path_id

