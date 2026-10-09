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


def test_publish_and_archive_restore_boundary(class_paths_api):
    client, db, group_id, identity = class_paths_api
    created = client.post(
        f"/teacher/groups/{group_id}/paths",
        json={"title": "Publish Path", "mode": "recommended"},
    ).json()
    path_id = created["id"]
    assert created["status"] == "draft"
    assert created["published_at"] is None

    # 1. Publish sets status and records published_at
    pub_res = client.post(f"/teacher/paths/{path_id}/publish")
    assert pub_res.status_code == 200
    pub_data = pub_res.json()
    assert pub_data["status"] == "published"
    assert pub_data["published_at"] is not None
    original_published_at = pub_data["published_at"]

    # 2. Archive sets status to archived but preserves published_at
    arch_res = client.post(f"/teacher/paths/{path_id}/archive")
    assert arch_res.status_code == 200
    arch_data = arch_res.json()
    assert arch_data["status"] == "archived"
    assert arch_data["published_at"] == original_published_at
    assert arch_data["archived_at"] is not None

    # 3. Restore restores back to published (decision 11 boundary kept)
    rest_res = client.post(f"/teacher/paths/{path_id}/restore")
    assert rest_res.status_code == 200
    rest_data = rest_res.json()
    assert rest_data["status"] == "published"
    assert rest_data["published_at"] == original_published_at
    assert rest_data["archived_at"] is None

    # 4. Re-publish is idempotent and retains first published_at
    pub_again = client.post(f"/teacher/paths/{path_id}/publish")
    assert pub_again.status_code == 200
    assert pub_again.json()["published_at"] == original_published_at


def test_student_paths_visibility_and_membership(class_paths_api):
    client, db, group_id, identity = class_paths_api

    # Create second group
    group2 = models.StudentGroup(code="GR-PATH02", name="Other Group", owner_username="owner")
    db.add(group2)
    db.commit()

    # Create published path in group 1
    p1 = client.post(
        f"/teacher/groups/{group_id}/paths",
        json={"title": "Class 1 Path", "mode": "recommended"},
    ).json()
    client.put(
        f"/teacher/paths/{p1['id']}",
        json={
            "revision": 1,
            "title": "Class 1 Path",
            "steps": [{"tool_key": "bussola", "title": "Bussola Orientation"}],
        },
    )
    client.post(f"/teacher/paths/{p1['id']}/publish")

    # Create draft path in group 1
    p1_draft = client.post(
        f"/teacher/groups/{group_id}/paths",
        json={"title": "Class 1 Draft", "mode": "recommended"},
    ).json()

    # Create published path in group 2
    p2 = client.post(
        f"/teacher/groups/{group2.id}/paths",
        json={"title": "Class 2 Path", "mode": "recommended"},
    ).json()
    client.put(
        f"/teacher/paths/{p2['id']}",
        json={
            "revision": 1,
            "title": "Class 2 Path",
            "steps": [{"tool_key": "timeline", "title": "Milestones"}],
        },
    )
    client.post(f"/teacher/paths/{p2['id']}/publish")

    # Enroll student in group 1 only
    db.add(models.GroupMembership(group_id=group_id, username="student_anna"))
    db.commit()

    # Switch identity to student_anna
    identity.update(username="student_anna", groups=[], is_admin=False, is_researcher=False)

    # GET /user/paths
    res = client.get("/user/paths")
    assert res.status_code == 200
    paths = res.json()
    # Student sees ONLY group 1's published path; NOT draft, NOT group 2 (non-member)
    assert len(paths) == 1
    assert paths[0]["id"] == p1["id"]
    assert paths[0]["title"] == "Class 1 Path"
    assert paths[0]["group_id"] == group_id
    assert paths[0]["group_name"] == "Class Path Test Group"
    assert paths[0]["done"] == 0
    assert paths[0]["total"] == 1
    assert len(paths[0]["steps"]) == 1
    assert paths[0]["steps"][0]["tool_key"] == "bussola"
    assert paths[0]["steps"][0]["state"] == "not_done"
    assert paths[0]["steps"][0]["can_self_mark"] is False  # Bussola has auto-detect
    assert paths[0]["next_step_id"] == paths[0]["steps"][0]["id"]

    # Teacher archives group 1's path
    identity.update(username="owner", groups=["docenti"], is_admin=False)
    client.post(f"/teacher/paths/{p1['id']}/archive")

    # Student now sees 0 paths (archived paths disappear for students)
    identity.update(username="student_anna", groups=[], is_admin=False)
    res_archived = client.get("/user/paths")
    assert res_archived.status_code == 200
    assert res_archived.json() == []


def test_student_paths_unavailable_tool_rule(class_paths_api):
    client, db, group_id, identity = class_paths_api

    # Enroll student
    db.add(models.GroupMembership(group_id=group_id, username="student_marco"))
    db.commit()

    # Create published path with 3 steps: bussola, QSA, timeline
    created = client.post(
        f"/teacher/groups/{group_id}/paths",
        json={"title": "Multi-tool path", "mode": "recommended"},
    ).json()
    path_id = created["id"]
    put_res = client.put(
        f"/teacher/paths/{path_id}",
        json={
            "revision": 1,
            "title": "Multi-tool path",
            "steps": [
                {"tool_key": "bussola", "title": "Step 1: Compass"},
                {"tool_key": "QSA", "title": "Step 2: QSA"},
                {"tool_key": "timeline", "title": "Step 3: Timeline"},
            ],
        },
    ).json()
    client.post(f"/teacher/paths/{path_id}/publish")
    step_ids = [s["id"] for s in put_res["steps"]]

    # Student initially sees 3 available steps: done=0, total=3
    identity.update(username="student_marco", groups=[], is_admin=False)
    res = client.get("/user/paths")
    assert res.status_code == 200
    p = res.json()[0]
    assert p["total"] == 3
    assert p["done"] == 0
    assert [s["state"] for s in p["steps"]] == ["not_done", "not_done", "not_done"]

    # Teacher disables QSA for the class in class_settings
    identity.update(username="owner", groups=["docenti"])
    settings = models.ClassSettings(group_id=group_id, disabled_tool_keys=["QSA"], updated_by="owner")
    db.add(settings)
    db.commit()

    # Student reads paths again: QSA is now unavailable and excluded from total!
    identity.update(username="student_marco", groups=[])
    res_disabled = client.get("/user/paths")
    assert res_disabled.status_code == 200
    p_disabled = res_disabled.json()[0]
    # Total is now 2 (QSA is excluded from count!)
    assert p_disabled["total"] == 2
    assert p_disabled["done"] == 0
    qsa_step = next(s for s in p_disabled["steps"] if s["tool_key"] == "QSA")
    assert qsa_step["state"] == "unavailable"
    assert qsa_step["can_self_mark"] is False

    # Student self-marks timeline (Step 3) as done
    mark_res = client.post(f"/user/paths/{path_id}/steps/{step_ids[2]}/done")
    assert mark_res.status_code == 200
    assert mark_res.json()["state"] == "done"

    # Read back: done=1, total=2; next step is step 1 (bussola)
    res_after_mark = client.get("/user/paths")
    p_after_mark = res_after_mark.json()[0]
    assert p_after_mark["done"] == 1
    assert p_after_mark["total"] == 2
    assert p_after_mark["next_step_id"] == step_ids[0]

    # Attempting to self-mark unavailable QSA step is rejected (422)
    fail_qsa = client.post(f"/user/paths/{path_id}/steps/{step_ids[1]}/done")
    assert fail_qsa.status_code == 422
    assert fail_qsa.json()["detail"] == "Tool is not available"


def test_student_self_mark_endpoints_and_restrictions(class_paths_api):
    client, db, group_id, identity = class_paths_api

    # Enroll student_lucia
    db.add(models.GroupMembership(group_id=group_id, username="student_lucia"))
    db.commit()

    # Create published path with auto-detect (bussola) and self-mark (timeline)
    p = client.post(
        f"/teacher/groups/{group_id}/paths",
        json={"title": "Self Mark Tests", "mode": "recommended"},
    ).json()
    path_id = p["id"]
    put_data = client.put(
        f"/teacher/paths/{path_id}",
        json={
            "revision": 1,
            "title": "Self Mark Tests",
            "steps": [
                {"tool_key": "bussola", "title": "Bussola"},
                {"tool_key": "timeline", "title": "Timeline"},
            ],
        },
    ).json()
    client.post(f"/teacher/paths/{path_id}/publish")
    bussola_step_id = put_data["steps"][0]["id"]
    timeline_step_id = put_data["steps"][1]["id"]

    # 1. Non-member student receives 403 on self-mark endpoints
    identity.update(username="outsider", groups=[], is_admin=False)
    outsider_post = client.post(f"/user/paths/{path_id}/steps/{timeline_step_id}/done")
    assert outsider_post.status_code == 403
    assert outsider_post.json()["detail"] == "Class path access denied"

    outsider_del = client.delete(f"/user/paths/{path_id}/steps/{timeline_step_id}/done")
    assert outsider_del.status_code == 403
    assert outsider_del.json()["detail"] == "Class path access denied"

    # 2. Member student calls done on auto-detect step -> 422
    identity.update(username="student_lucia", groups=[])
    auto_post = client.post(f"/user/paths/{path_id}/steps/{bussola_step_id}/done")
    assert auto_post.status_code == 422
    assert "automatic completion" in auto_post.json()["detail"]

    # 3. Member student marks timeline done -> 200
    mark_done = client.post(f"/user/paths/{path_id}/steps/{timeline_step_id}/done")
    assert mark_done.status_code == 200
    assert mark_done.json() == {
        "ok": True,
        "step_id": timeline_step_id,
        "state": "done",
        "source": "student",
    }

    # Verify state in /user/paths
    paths_data = client.get("/user/paths").json()
    t_step = next(s for s in paths_data[0]["steps"] if s["id"] == timeline_step_id)
    assert t_step["state"] == "done"
    assert t_step["source"] == "student"

    # 4. Member student unmarks timeline -> 200
    unmark = client.delete(f"/user/paths/{path_id}/steps/{timeline_step_id}/done")
    assert unmark.status_code == 200
    assert unmark.json() == {
        "ok": True,
        "step_id": timeline_step_id,
        "state": "not_done",
        "source": None,
    }

    paths_data2 = client.get("/user/paths").json()
    t_step2 = next(s for s in paths_data2[0]["steps"] if s["id"] == timeline_step_id)
    assert t_step2["state"] == "not_done"
    assert t_step2["source"] is None


def test_strict_mode_and_resolution_precedence(class_paths_api):
    client, db, group_id, identity = class_paths_api

    db.add(models.GroupMembership(group_id=group_id, username="student_sara"))
    db.commit()

    # Create path with strict mode: step 1 (bussola), step 2 (timeline), step 3 (actions)
    p = client.post(
        f"/teacher/groups/{group_id}/paths",
        json={"title": "Strict Mode Path", "mode": "strict"},
    ).json()
    path_id = p["id"]
    put_data = client.put(
        f"/teacher/paths/{path_id}",
        json={
            "revision": 1,
            "title": "Strict Mode Path",
            "mode": "strict",
            "steps": [
                {"tool_key": "bussola", "title": "Step 1"},
                {"tool_key": "timeline", "title": "Step 2"},
                {"tool_key": "actions", "title": "Step 3"},
            ],
        },
    ).json()
    client.post(f"/teacher/paths/{path_id}/publish")
    s1_id = put_data["steps"][0]["id"]
    s2_id = put_data["steps"][1]["id"]
    s3_id = put_data["steps"][2]["id"]

    identity.update(username="student_sara", groups=[])
    paths = client.get("/user/paths").json()
    steps = paths[0]["steps"]
    # In strict mode: step 1 is next_step_id; steps 2 and 3 are locked!
    assert paths[0]["next_step_id"] == s1_id
    assert steps[0]["state"] == "not_done"
    assert steps[1]["state"] == "locked"
    assert steps[2]["state"] == "locked"

    # Teacher explicitly marks Step 1 as done in class_path_progress
    db.add(
        models.ClassPathProgress(
            step_id=s1_id,
            username="student_sara",
            state="done",
            source="teacher",
            actor_username="owner",
        )
    )
    db.commit()

    # Now step 1 is done, step 2 is unlocked (next_step_id), step 3 is locked
    paths2 = client.get("/user/paths").json()
    steps2 = paths2[0]["steps"]
    assert paths2[0]["next_step_id"] == s2_id
    assert steps2[0]["state"] == "done"
    assert steps2[0]["source"] == "teacher"
    assert steps2[1]["state"] == "not_done"
    assert steps2[2]["state"] == "locked"

    # Teacher mark takes precedence over student mark (resolution rule §4.2):
    # Student marked not_done, but teacher marked done -> remains done
    db.add(
        models.ClassPathProgress(
            step_id=s1_id,
            username="student_sara",
            state="not_done",
            source="student",
            actor_username="student_sara",
        )
    )
    db.commit()

    paths3 = client.get("/user/paths").json()
    steps3 = paths3[0]["steps"]
    assert steps3[0]["state"] == "done"
    assert steps3[0]["source"] == "teacher"


