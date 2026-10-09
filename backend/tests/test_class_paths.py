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


def test_path_availability_matches_the_class_access_resolver(class_paths_api):
    """Paths tab and student view answer like /user/access (bug 838e6852)."""
    from backend.class_access import resolve_access
    client, db, group_id, identity = class_paths_api
    db.add(models.GroupMembership(group_id=group_id, username="student_lia"))
    db.commit()
    path_id = client.post(f"/teacher/groups/{group_id}/paths", json={"title": "Aligned"}).json()["id"]
    client.put(f"/teacher/paths/{path_id}", json={"revision": 1, "title": "Aligned", "steps": [
        {"tool_key": key} for key in ("QSA", "SAVICKAS", "timeline", "bussola")]})
    client.post(f"/teacher/paths/{path_id}/publish")

    # Teacher deny-list plus an admin lock that switches a tool off.
    db.add(models.ClassSettings(group_id=group_id, updated_by="owner", disabled_tool_keys=["timeline"],
                                locked_tool_keys={"SAVICKAS": {"enabled": False}}))
    db.commit()

    student = {"username": "student_lia", "groups": [], "is_admin": False, "is_researcher": False,
               "authenticated": True}
    allowed = set(resolve_access(db, student)["tool_keys"])
    expected = {key: key in allowed for key in ("QSA", "SAVICKAS", "timeline", "bussola")}
    assert expected == {"QSA": True, "SAVICKAS": False, "timeline": False, "bussola": True}

    teacher = client.get(f"/teacher/paths/{path_id}/progress").json()
    assert {s["tool_key"]: s["available"] for s in teacher["steps"]} == expected

    identity.update(student)
    steps = client.get("/user/paths").json()[0]["steps"]
    assert {s["tool_key"]: s["state"] != "unavailable" for s in steps} == expected


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




# --- Automatic completion and strict mode (#98, plan §4.2) -------------------

from contextlib import contextmanager  # noqa: E402
from datetime import datetime, timedelta, timezone  # noqa: E402
from unittest.mock import patch  # noqa: E402

from sqlalchemy.orm import Session  # noqa: E402

from backend import class_access, class_path_completion  # noqa: E402
from backend.diagram_render import DiagramEdge, DiagramNode, DiagramSpec  # noqa: E402
from backend.dynamic_registry import set_session_factory  # noqa: E402
from backend.routes import chat  # noqa: E402

PUBLISHED_AT = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)
BEFORE = PUBLISHED_AT - timedelta(days=1)
AFTER = PUBLISHED_AT + timedelta(hours=1)
STUDENT = "student_auto"


def _published_path(client, db, group_id, identity, steps, *, mode="recommended"):
    """Publish a path with the given tool keys and pin `published_at` (transaction-safe)."""
    identity.update(username="owner", groups=["docenti"], is_admin=False, is_researcher=False)
    created = client.post(f"/teacher/groups/{group_id}/paths", json={"title": "Auto", "mode": mode}).json()
    put = client.put(
        f"/teacher/paths/{created['id']}",
        json={"revision": 1, "title": "Auto", "mode": mode,
              "steps": [{"tool_key": key} for key in steps]},
    ).json()
    client.post(f"/teacher/paths/{created['id']}/publish")
    path = db.get(models.ClassPath, created["id"])
    path.published_at = PUBLISHED_AT
    if not db.query(models.GroupMembership).filter_by(group_id=group_id, username=STUDENT).first():
        db.add(models.GroupMembership(group_id=group_id, username=STUDENT))
    db.commit()
    identity.update(username=STUDENT, groups=[], is_admin=False, is_researcher=False)
    return created["id"], [s["id"] for s in put["steps"]]


def _student_path(client, path_id):
    return next(p for p in client.get("/user/paths").json() if p["id"] == path_id)


def _focused_spec():
    return DiagramSpec(
        type="mindmap", title="Open a study group",
        nodes=[DiagramNode(id="n0", label="Study group", role="idea"),
               DiagramNode(id="n1", label="Find members", role="task")],
        edges=[DiagramEdge(source="n0", target="n1")],
    ).model_dump(mode="json")


def _unfocused_spec():
    return DiagramSpec(
        type="mindmap", title="Loose notes",
        nodes=[DiagramNode(id="n0", label="Something"), DiagramNode(id="n1", label="Other")],
        edges=[DiagramEdge(source="n0", target="n1")],
    ).model_dump(mode="json")


def _evidence(kind, when):
    """One evidence row per tool kind, created at `when` (plan §4.2 table)."""
    if kind == "QSA":
        return models.QuestionnaireResult(session_id="s-qsa", questionnaire_type="QSA",
                                          username=STUDENT, scores={}, submitted_at=when)
    if kind == "SAVICKAS":
        return models.Log(session_id="s-sav", action="guided_chat_completed",
                          questionnaire_type="SAVICKAS", username=STUDENT, timestamp=when)
    if kind == "IDEA":
        return models.IdeaMapRevision(session_id="s-idea", username=STUDENT,
                                      spec=_focused_spec(), created_at=when)
    if kind == "bussola":
        return models.OrientationSession(session_id=f"s-bus-{when.isoformat()}", username=STUDENT,
                                         status="completed", completed_at=when)
    if kind == "tavolo":
        return models.Tavolo(id=f"t-{when.isoformat()}", username=STUDENT, title="Desk", saved_at=when)
    if kind == "goals":
        return models.PersonalGoal(username=STUDENT, title="Read daily", created_at=when)
    if kind == "pqbl":
        return models.Log(session_id="s-pqbl", action="pqbl_session_completed",
                          username=STUDENT, timestamp=when)
    raise AssertionError(kind)


AUTO_KINDS = ["QSA", "SAVICKAS", "IDEA", "bussola", "tavolo", "goals", "pqbl"]


@pytest.mark.parametrize("kind", AUTO_KINDS)
def test_evidence_before_published_at_is_ignored(class_paths_api, kind):
    client, db, group_id, identity = class_paths_api
    path_id, _ = _published_path(client, db, group_id, identity, [kind])
    db.add(_evidence(kind, BEFORE))
    db.commit()

    step = _student_path(client, path_id)["steps"][0]
    assert step["state"] == "not_done"
    assert step["source"] is None


@pytest.mark.parametrize("kind", AUTO_KINDS)
def test_evidence_after_published_at_completes_the_step(class_paths_api, kind):
    client, db, group_id, identity = class_paths_api
    path_id, _ = _published_path(client, db, group_id, identity, [kind])
    db.add(_evidence(kind, AFTER))
    db.commit()

    path = _student_path(client, path_id)
    assert path["steps"][0]["state"] == "done"
    assert path["steps"][0]["source"] == "automatic"
    assert path["steps"][0]["can_self_mark"] is False
    assert (path["done"], path["total"]) == (1, 1)
    assert path["next_step_id"] is None


def test_evidence_of_another_student_or_tool_does_not_count(class_paths_api):
    client, db, group_id, identity = class_paths_api
    path_id, _ = _published_path(client, db, group_id, identity, ["QSA", "SAVICKAS"])
    db.add_all([
        models.QuestionnaireResult(session_id="x", questionnaire_type="QSA", username="someone_else",
                                   scores={}, submitted_at=AFTER),
        models.QuestionnaireResult(session_id="y", questionnaire_type="ZTPI", username=STUDENT,
                                   scores={}, submitted_at=AFTER),
        models.Log(session_id="z", action="guided_chat_completed", questionnaire_type="QSA",
                   username=STUDENT, timestamp=AFTER),
        models.Log(session_id="w", action="chat_message", questionnaire_type="SAVICKAS",
                   username=STUDENT, timestamp=AFTER),
    ])
    db.commit()

    assert [s["state"] for s in _student_path(client, path_id)["steps"]] == ["not_done", "not_done"]


def test_idea_map_counts_only_when_focused(class_paths_api):
    client, db, group_id, identity = class_paths_api
    path_id, _ = _published_path(client, db, group_id, identity, ["IDEA"])
    db.add(models.IdeaMapRevision(session_id="s-idea", username=STUDENT,
                                  spec=_unfocused_spec(), created_at=AFTER))
    db.commit()
    assert _student_path(client, path_id)["steps"][0]["state"] == "not_done"

    db.add(models.IdeaMapRevision(session_id="s-idea", username=STUDENT,
                                  spec=_focused_spec(), created_at=AFTER + timedelta(minutes=5)))
    db.commit()
    assert _student_path(client, path_id)["steps"][0]["state"] == "done"


def test_unfinished_bussola_and_draft_tavolo_do_not_count(class_paths_api):
    client, db, group_id, identity = class_paths_api
    path_id, _ = _published_path(client, db, group_id, identity, ["bussola", "tavolo"])
    db.add_all([
        models.OrientationSession(session_id="s-open", username=STUDENT, status="in_progress",
                                  created_at=AFTER, completed_at=None),
        models.Tavolo(id="t-draft", username=STUDENT, created_at=AFTER, saved_at=None),
    ])
    db.commit()

    assert [s["state"] for s in _student_path(client, path_id)["steps"]] == ["not_done", "not_done"]


def test_teacher_mark_beats_student_mark_beats_automatic(class_paths_api):
    client, db, group_id, identity = class_paths_api
    path_id, (goal_step,) = _published_path(client, db, group_id, identity, ["goals"])
    db.add(_evidence("goals", AFTER))
    db.add(models.ClassPathProgress(step_id=goal_step, username=STUDENT, state="not_done",
                                    source="student", actor_username=STUDENT))
    db.commit()
    step = _student_path(client, path_id)["steps"][0]
    assert (step["state"], step["source"]) == ("not_done", "student")

    db.add(models.ClassPathProgress(step_id=goal_step, username=STUDENT, state="done",
                                    source="teacher", actor_username="owner"))
    db.commit()
    step = _student_path(client, path_id)["steps"][0]
    assert (step["state"], step["source"]) == ("done", "teacher")

    teacher = db.query(models.ClassPathProgress).filter_by(step_id=goal_step, source="teacher").one()
    teacher.state = "not_done"
    db.commit()
    step = _student_path(client, path_id)["steps"][0]
    assert (step["state"], step["source"]) == ("not_done", "teacher")


def test_strict_mode_counts_a_step_only_after_earlier_steps(class_paths_api):
    client, db, group_id, identity = class_paths_api
    path_id, (s1, s2, s3) = _published_path(
        client, db, group_id, identity, ["timeline", "goals", "actions"], mode="strict")
    # Later steps have evidence / a self-mark, the first does not.
    db.add(_evidence("goals", AFTER))
    db.commit()
    assert client.post(f"/user/paths/{path_id}/steps/{s3}/done").status_code == 200

    path = _student_path(client, path_id)
    assert [s["state"] for s in path["steps"]] == ["not_done", "locked", "locked"]
    assert [s["source"] for s in path["steps"]] == [None, None, None]
    assert (path["done"], path["total"], path["next_step_id"]) == (0, 3, s1)

    assert client.post(f"/user/paths/{path_id}/steps/{s1}/done").status_code == 200
    path = _student_path(client, path_id)
    assert [s["state"] for s in path["steps"]] == ["done", "done", "done"]
    assert [s["source"] for s in path["steps"]] == ["student", "automatic", "student"]
    assert (path["done"], path["next_step_id"]) == (3, None)


def test_recommended_mode_counts_steps_out_of_order(class_paths_api):
    client, db, group_id, identity = class_paths_api
    path_id, (s1, s2, s3) = _published_path(
        client, db, group_id, identity, ["timeline", "goals", "actions"])
    db.add(_evidence("goals", AFTER))
    db.commit()
    assert client.post(f"/user/paths/{path_id}/steps/{s3}/done").status_code == 200

    path = _student_path(client, path_id)
    assert [s["state"] for s in path["steps"]] == ["not_done", "done", "done"]
    assert (path["done"], path["next_step_id"]) == (2, s1)


def test_strict_mode_skips_unavailable_steps(class_paths_api):
    client, db, group_id, identity = class_paths_api
    path_id, (s1, s2, s3) = _published_path(
        client, db, group_id, identity, ["QSA", "goals", "actions"], mode="strict")
    db.add(models.ClassSettings(group_id=group_id, disabled_tool_keys=["QSA"], updated_by="owner"))
    db.add(_evidence("goals", AFTER))
    db.commit()

    path = _student_path(client, path_id)
    assert [s["state"] for s in path["steps"]] == ["unavailable", "done", "not_done"]
    assert (path["done"], path["total"], path["next_step_id"]) == (1, 2, s3)


def test_strict_lock_does_not_change_tool_access(class_paths_api):
    client, db, group_id, identity = class_paths_api
    path_id, _ = _published_path(client, db, group_id, identity, ["timeline", "QSA"], mode="strict")
    assert _student_path(client, path_id)["steps"][1]["state"] == "locked"

    student = dict(identity)
    access = class_access.resolve_access(db, student)
    assert "QSA" in access["tool_keys"]
    class_access.require_tool(db, student, "QSA")


# --- guided_chat_completed marker -------------------------------------------

def _guided_steps(db):
    db.add_all([
        models.GuidedStep(id="sav-1", sort_order=1, label="Start", prompt="Start",
                          system_prompt_mode="generic", questionnaire_type="SAVICKAS"),
        models.GuidedStep(id="sav-2", sort_order=2, label="Close", prompt="Close",
                          system_prompt_mode="generic", questionnaire_type="SAVICKAS"),
    ])
    db.commit()


def _markers(db, session_id=None):
    query = db.query(models.Log).filter(models.Log.action == "guided_chat_completed")
    if session_id:
        query = query.filter(models.Log.session_id == session_id)
    return query.all()


def test_marker_written_only_on_the_last_step_once_per_session(class_paths_api):
    _, db, _, _ = class_paths_api
    _guided_steps(db)

    def record(session_id, phase):
        written = class_path_completion.record_guided_chat_completion(
            db, session_id=session_id, username=STUDENT, phase=phase)
        db.commit()
        return written

    assert record("sess-1", "sav-1") is False
    assert _markers(db) == []

    assert record("sess-1", "sav-2") is True
    assert record("sess-1", "sav-2") is False      # same session, another turn
    assert record("sess-1", "sav-2") is False      # resumed session, later turn
    markers = _markers(db)
    assert len(markers) == 1
    assert (markers[0].questionnaire_type, markers[0].username, markers[0].phase) == (
        "SAVICKAS", STUDENT, "sav-2")

    assert record("sess-2", "sav-2") is True       # a new session is a new completion
    assert len(_markers(db)) == 2


def test_marker_needs_a_user_and_a_known_step(class_paths_api):
    _, db, _, _ = class_paths_api
    _guided_steps(db)
    for username, phase in [("", "sav-2"), (None, "sav-2"), (STUDENT, ""), (STUDENT, "missing")]:
        assert class_path_completion.record_guided_chat_completion(
            db, session_id="sess-x", username=username, phase=phase) is False
    db.commit()
    assert _markers(db) == []


@contextmanager
def _chat_client(db, identity):
    app = FastAPI()
    app.include_router(chat.router)
    app.add_exception_handler(class_access.ToolAccessDenied, class_access.tool_access_denied_handler)

    def override_db():
        yield db

    app.dependency_overrides[database.get_db] = override_db
    app.dependency_overrides[auth.get_identity_view_as] = lambda: identity
    app.dependency_overrides[auth.get_current_user] = lambda: identity

    def fresh_session():
        return Session(bind=db.connection(), join_transaction_mode="create_savepoint")

    set_session_factory(fresh_session)
    try:
        with patch.object(database, "SessionLocal", fresh_session), TestClient(app) as client:
            yield client
    finally:
        set_session_factory(None)


def _mock_stream(*_args, **_kwargs):
    yield {"type": "delta", "text": "streamed reply"}


@pytest.mark.parametrize("route", ["/chat", "/chat/stream"])
def test_chat_turn_on_last_step_writes_marker_once_even_when_resumed(class_paths_api, route):
    _, db, _, _ = class_paths_api
    _guided_steps(db)
    student = {"username": STUDENT, "groups": ["studenti"], "is_admin": False,
               "is_researcher": False, "authenticated": True}

    def turn(client, phase, session_id="sess-chat"):
        response = client.post(route, json={"message": "Hi", "questionnaire_type": "SAVICKAS",
                                            "session_id": session_id, "phase": phase})
        assert response.status_code == 200, response.text
        return response

    with patch.object(chat.AIService, "get_response", return_value="plain reply"), \
            patch.object(chat.AIService, "stream_response", side_effect=_mock_stream):
        with _chat_client(db, student) as client:
            turn(client, "sav-1")
            assert _markers(db) == []
            turn(client, "sav-2")
            turn(client, "sav-2")
        # Resumed later in a new client (page reload): same session, no new marker.
        with _chat_client(db, student) as client:
            turn(client, "sav-2")

    markers = _markers(db, "sess-chat")
    assert len(markers) == 1
    assert markers[0].questionnaire_type == "SAVICKAS"


def test_preview_turn_writes_no_marker(class_paths_api):
    _, db, _, _ = class_paths_api
    _guided_steps(db)
    admin = {"username": "root", "groups": ["admins"], "is_admin": True,
             "is_researcher": False, "authenticated": True}
    with patch.object(chat.AIService, "get_response", return_value="plain reply"), \
            _chat_client(db, admin) as client:
        response = client.post("/chat", json={"message": "Hi", "questionnaire_type": "SAVICKAS",
                                              "session_id": "sess-prev", "phase": "sav-2",
                                              "preview": True})
        assert response.status_code == 200, response.text
    assert _markers(db) == []


# --- Teacher progress view and overrides (#99, plan §5.2) -------------------


def _as_owner(identity):
    identity.update(username="owner", groups=["docenti"], is_admin=False, is_researcher=False)


def _progress(client, path_id):
    response = client.get(f"/teacher/paths/{path_id}/progress")
    assert response.status_code == 200, response.text
    return response.json()


def _override(client, path_id, step_id, username, state, reason=None):
    body = {"state": state}
    if reason is not None:
        body["reason"] = reason
    return client.put(f"/teacher/paths/{path_id}/steps/{step_id}/progress/{username}", json=body)


def test_teacher_progress_matrix_lists_current_members_with_sources(class_paths_api):
    client, db, group_id, identity = class_paths_api
    path_id, (goal_step, timeline_step, qsa_step) = _published_path(
        client, db, group_id, identity, ["goals", "timeline", "QSA"])
    db.add_all([
        models.GroupMembership(group_id=group_id, username="student_b"),
        models.UserDisplayName(username="student_b", display_name="Bea B."),
        _evidence("goals", AFTER),
        models.ClassPathProgress(step_id=timeline_step, username="student_b", state="done",
                                 source="student", actor_username="student_b"),
        # A former member keeps their marks but is not listed.
        models.ClassPathProgress(step_id=timeline_step, username="gone", state="done",
                                 source="student", actor_username="gone"),
    ])
    db.commit()
    _as_owner(identity)

    body = _progress(client, path_id)
    assert body["path_id"] == path_id
    assert body["mode"] == "recommended"
    assert [s["id"] for s in body["steps"]] == [goal_step, timeline_step, qsa_step]
    assert [s["done_count"] for s in body["steps"]] == [1, 1, 0]
    assert all(s["available"] for s in body["steps"])

    students = {s["username"]: s for s in body["students"]}
    assert set(students) == {STUDENT, "student_b"}
    assert students["student_b"]["display_name"] == "Bea B."
    assert students[STUDENT]["display_name"] == STUDENT

    auto = students[STUDENT]
    assert [(c["step_id"], c["state"], c["source"]) for c in auto["cells"]] == [
        (goal_step, "done", "automatic"),
        (timeline_step, "not_done", None),
        (qsa_step, "not_done", None),
    ]
    assert (auto["done"], auto["total"]) == (1, 3)
    marked = students["student_b"]
    assert marked["cells"][1]["source"] == "student"
    assert marked["cells"][1]["at"] is not None
    assert (marked["done"], marked["total"]) == (1, 3)


def test_teacher_progress_requires_a_published_path(class_paths_api):
    client, _db, group_id, _ = class_paths_api
    draft = client.post(f"/teacher/groups/{group_id}/paths", json={"title": "Draft"}).json()
    assert client.get(f"/teacher/paths/{draft['id']}/progress").status_code == 422


def test_teacher_progress_marks_strict_and_unavailable_cells(class_paths_api):
    client, db, group_id, identity = class_paths_api
    path_id, (qsa_step, goal_step, action_step) = _published_path(
        client, db, group_id, identity, ["QSA", "goals", "actions"], mode="strict")
    db.add(models.ClassSettings(group_id=group_id, disabled_tool_keys=["QSA"], updated_by="owner"))
    db.commit()
    _as_owner(identity)

    body = _progress(client, path_id)
    assert [s["available"] for s in body["steps"]] == [False, True, True]
    (row,) = body["students"]
    assert [c["state"] for c in row["cells"]] == ["unavailable", "not_done", "locked"]
    assert (row["done"], row["total"]) == (0, 2)

    # A teacher mark on a locked step is kept and shown, but still waits for step 2.
    assert _override(client, path_id, action_step, STUDENT, "done", reason="Oral check").status_code == 200
    locked = _progress(client, path_id)["students"][0]["cells"][2]
    assert (locked["state"], locked["source"], locked["teacher_state"]) == ("locked", None, "done")
    assert (locked["actor"], locked["reason"]) == ("owner", "Oral check")


def test_teacher_override_beats_student_and_automatic_and_clear_restores(class_paths_api):
    client, db, group_id, identity = class_paths_api
    path_id, (goal_step, timeline_step) = _published_path(
        client, db, group_id, identity, ["goals", "timeline"])
    db.add(_evidence("goals", AFTER))
    db.commit()
    assert client.post(f"/user/paths/{path_id}/steps/{timeline_step}/done").status_code == 200
    _as_owner(identity)

    res = _override(client, path_id, goal_step, STUDENT, "not_done", reason="Copied from a friend")
    assert res.status_code == 200, res.text
    assert (res.json()["state"], res.json()["source"]) == ("not_done", "teacher")
    res = _override(client, path_id, timeline_step, STUDENT, "not_done")
    assert res.status_code == 200

    cells = _progress(client, path_id)["students"][0]["cells"]
    assert [(c["state"], c["source"]) for c in cells] == [("not_done", "teacher"), ("not_done", "teacher")]
    assert cells[0]["reason"] == "Copied from a friend"
    assert cells[0]["actor"] == "owner"
    assert cells[0]["at"] is not None

    row = db.query(models.ClassPathProgress).filter_by(step_id=goal_step, source="teacher").one()
    assert (row.username, row.actor_username, row.reason) == (STUDENT, "owner", "Copied from a friend")

    # The student sees the teacher's decision.
    identity.update(username=STUDENT, groups=[])
    steps = _student_path(client, path_id)["steps"]
    assert [(s["state"], s["source"]) for s in steps] == [("not_done", "teacher"), ("not_done", "teacher")]

    # Overwriting keeps one teacher row per (step, student).
    _as_owner(identity)
    assert _override(client, path_id, goal_step, STUDENT, "done").status_code == 200
    assert db.query(models.ClassPathProgress).filter_by(step_id=goal_step, source="teacher").count() == 1
    assert _progress(client, path_id)["students"][0]["cells"][0]["reason"] is None

    # Clearing falls back to the student mark and to automatic evidence.
    assert _override(client, path_id, goal_step, STUDENT, "clear").json()["source"] == "automatic"
    cleared = _override(client, path_id, timeline_step, STUDENT, "clear").json()
    assert (cleared["state"], cleared["source"]) == ("done", "student")
    assert db.query(models.ClassPathProgress).filter_by(source="teacher").count() == 0


def test_teacher_override_validation(class_paths_api):
    client, db, group_id, identity = class_paths_api
    path_id, (qsa_step, goal_step) = _published_path(client, db, group_id, identity, ["QSA", "goals"])
    other_path, (other_step,) = _published_path(client, db, group_id, identity, ["goals"])
    db.add(models.ClassSettings(group_id=group_id, disabled_tool_keys=["QSA"], updated_by="owner"))
    db.commit()
    _as_owner(identity)

    assert _override(client, path_id, goal_step, STUDENT, "maybe").status_code == 422
    assert _override(client, path_id, goal_step, STUDENT, "done", reason="x" * 501).status_code == 422
    assert _override(client, path_id, goal_step, "not_a_member", "done").status_code == 404
    assert _override(client, path_id, other_step, STUDENT, "done").status_code == 404
    assert _override(client, path_id, qsa_step, STUDENT, "done").status_code == 422
    assert _override(client, path_id, qsa_step, STUDENT, "clear").status_code == 200

    draft = client.post(f"/teacher/groups/{group_id}/paths", json={"title": "Draft"}).json()
    put = client.put(f"/teacher/paths/{draft['id']}",
                     json={"revision": 1, "title": "Draft", "steps": [{"tool_key": "goals"}]}).json()
    assert _override(client, draft["id"], put["steps"][0]["id"], STUDENT, "done").status_code == 422


@pytest.mark.parametrize("role", ["co-teacher", "admin", "other-teacher", "student"])
def test_teacher_progress_permissions(class_paths_api, role):
    client, db, group_id, identity = class_paths_api
    db.add(models.GroupShare(group_id=group_id, shared_with_username="co-teacher", granted_by_username="owner"))
    db.commit()
    path_id, (goal_step,) = _published_path(client, db, group_id, identity, ["goals"])
    identity.update(username=role, is_admin=(role == "admin"),
                    groups=["studenti" if role == "student" else "docenti"])

    expected = 200 if role in {"co-teacher", "admin"} else 403
    assert client.get(f"/teacher/paths/{path_id}/progress").status_code == expected
    assert _override(client, path_id, goal_step, STUDENT, "done").status_code == expected
