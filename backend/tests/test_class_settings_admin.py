"""Admin class directory, per-class locks and the settings audit log (#109)."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, class_access, database, models
from backend.routes import groups
from backend.tests.artifact_database import artifact_session

ADMIN = {"username": "root", "name": "Root Admin", "groups": ["admins"], "is_admin": True,
         "is_researcher": False, "authenticated": True}
STUDENT = {"username": "anna", "groups": ["studenti"], "is_admin": False, "is_researcher": False, "authenticated": True}


@pytest.fixture
def api():
    with artifact_session() as db:
        school = models.Institution(slug="fermi", name="Liceo Fermi")
        db.add(school)
        db.flush()
        group = models.StudentGroup(code="GR-LOCK1", name="3B Liceo", school="Liceo Fermi",
                                    owner_username="owner", institution_id=school.id)
        other = models.StudentGroup(code="GR-OTHER", name="5A ITI", school="ITIS Da Vinci",
                                    owner_username="someone", is_active=False)
        db.add_all([group, other])
        db.add_all([
            models.Instrument(code="QSA", name_en="Learning strategies", is_active=True, tool_category="assessment"),
            models.Instrument(code="OFF", name_en="Platform disabled", is_active=False, tool_category="assessment"),
        ])
        clio = models.Counselor(slug="clio", name="Clio", is_active=True)
        retired = models.Counselor(slug="retired", name="Retired", is_active=False)
        db.add_all([clio, retired])
        db.flush()
        db.add(models.GroupShare(group_id=group.id, shared_with_username="co-teacher", granted_by_username="owner"))
        db.add(models.GroupMembership(group_id=group.id, username="anna"))
        db.add(models.UserDisplayName(username="owner", display_name="Maria Rossi", email=""))
        db.commit()
        identity = dict(ADMIN)
        app = FastAPI()
        app.include_router(groups.router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        with TestClient(app) as client:
            yield client, db, group, other, identity, {"clio": clio.id, "retired": retired.id}


def as_role(identity, role):
    identity.clear()
    identity.update({"username": role, "name": role, "authenticated": True, "is_researcher": role == "researcher",
                     "is_admin": role == "root", "groups": ["studenti"] if role == "anna" else ["docenti"]})


def lock(client, group_id, kind, target, state, reason=None):
    body = {"target_kind": kind, "target_id": target, "state": state}
    if reason:
        body["reason"] = reason
    return client.post(f"/admin/groups/{group_id}/settings/lock", json=body)


# --- Admin directory --------------------------------------------------------

def test_admin_classes_lists_every_class_with_search_and_filters(api):
    client, db, group, other, _, _ = api
    rows = client.get("/admin/classes").json()
    assert {row["id"] for row in rows} == {group.id, other.id}
    row = next(row for row in rows if row["id"] == group.id)
    assert row["institution_name"] == "Liceo Fermi"
    assert row["owner_display_name"] == "Maria Rossi"
    assert row["co_teachers"] == ["co-teacher"]
    assert row["members_count"] == 1
    assert row["has_custom_settings"] is False and row["locked_items_count"] == 0
    for query, expected in [("search=3b", {group.id}), ("search=GR-OTHER", {other.id}), ("search=da vinci", {other.id}),
                            ("owner=owner", {group.id}), (f"institution_id={group.institution_id}", {group.id}),
                            ("is_active=false", {other.id})]:
        assert {row["id"] for row in client.get(f"/admin/classes?{query}").json()} == expected, query


@pytest.mark.parametrize("role", ["owner", "researcher", "anna"])
def test_admin_only_routes_reject_other_roles(api, role):
    client, _, group, _, identity, _ = api
    as_role(identity, role)
    assert client.get("/admin/classes").status_code == 403
    assert lock(client, group.id, "tool", "QSA", False).status_code == 403
    assert client.post(f"/admin/groups/{group.id}/settings/unlock",
                       json={"target_kind": "tool", "target_id": "QSA"}).status_code == 403


# --- Locks ------------------------------------------------------------------

def test_lock_off_forces_the_item_and_blocks_teacher_changes(api):
    client, db, group, _, identity, _ = api
    response = lock(client, group.id, "tool", "QSA", False, "School policy")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "locked" and body["state"] is False and body["locked_by"] == "root" and body["locked_at"]
    settings = db.get(models.ClassSettings, group.id)
    assert settings.locked_tool_keys["QSA"]["enabled"] is False
    assert "QSA" in settings.disabled_tool_keys
    assert class_access.resolve_access(db, STUDENT)["tool_keys"].count("QSA") == 0

    as_role(identity, "owner")
    path = f"/teacher/groups/{group.id}/settings"
    current = client.get(path).json()
    qsa = next(row for row in current["tools"] if row["key"] == "QSA")
    assert qsa["locked"] is True and qsa["locked_enabled"] is False and qsa["locked_by"] == "root"
    refused = client.put(path, json={"revision": current["revision"], "disabled_tool_keys": []})
    assert refused.status_code == 422
    assert refused.json() == {"detail": "item_locked_by_admin", "item_kind": "tool", "item_id": "QSA"}
    assert "QSA" in db.get(models.ClassSettings, group.id).disabled_tool_keys
    ok = client.put(path, json={"revision": current["revision"], "disabled_tool_keys": ["QSA", "tavolo"]})
    assert ok.status_code == 200


def test_unlock_lets_teachers_change_the_item_again(api):
    client, db, group, _, identity, _ = api
    assert lock(client, group.id, "tool", "tavolo", False).status_code == 200
    unlocked = client.post(f"/admin/groups/{group.id}/settings/unlock", json={"target_kind": "tool", "target_id": "tavolo"})
    assert unlocked.status_code == 200
    assert unlocked.json() == {"status": "unlocked", "target_kind": "tool", "target_id": "tavolo"}
    assert db.get(models.ClassSettings, group.id).locked_tool_keys == {}
    assert client.post(f"/admin/groups/{group.id}/settings/unlock",
                       json={"target_kind": "tool", "target_id": "tavolo"}).status_code == 404
    as_role(identity, "owner")
    path = f"/teacher/groups/{group.id}/settings"
    revision = client.get(path).json()["revision"]
    assert client.put(path, json={"revision": revision, "disabled_tool_keys": []}).status_code == 200


def test_lock_on_requires_platform_enabled_item_and_platform_disable_still_wins(api):
    client, db, group, _, _, counselors = api
    assert lock(client, group.id, "tool", "OFF", True).json()["detail"] == "cannot_lock_on_platform_disabled"
    assert lock(client, group.id, "tool", "OFF", True).status_code == 422
    assert lock(client, group.id, "counselor", str(counselors["retired"]), True).status_code == 422
    assert lock(client, group.id, "tool", "OFF", False).status_code == 200, "locking OFF is always allowed"
    assert lock(client, group.id, "tool", "QSA", True).status_code == 200
    db.query(models.Instrument).filter(models.Instrument.code == "QSA").update({"is_active": False})
    db.commit()
    with pytest.raises(class_access.ToolAccessDenied) as denied:
        class_access.require_tool(db, STUDENT, "QSA")
    assert denied.value.detail == "tool_unavailable"


@pytest.mark.parametrize("kind,target", [("tool", "unknown"), ("tool", "notebook"), ("counselor", "999999"),
                                         ("counselor", "abc"), ("forum_option", "anything"), ("other", "QSA")])
def test_lock_rejects_unknown_targets(api, kind, target):
    client, _, group, _, _, _ = api
    assert lock(client, group.id, kind, target, False).status_code == 422


def test_counselor_and_forum_locks(api):
    client, db, group, _, identity, counselors = api
    clio = counselors["clio"]
    path = f"/teacher/groups/{group.id}/settings"
    assert client.put(path, json={"revision": 1, "disabled_tool_keys": [], "default_counselor_id": clio}).status_code == 200
    assert lock(client, group.id, "counselor", str(clio), False).status_code == 200
    settings = db.get(models.ClassSettings, group.id)
    assert clio in settings.disabled_counselor_ids
    assert settings.default_counselor_id is None, "a counselor locked OFF cannot stay the class default"
    assert lock(client, group.id, "forum_option", "premoderation", True).status_code == 200
    body = client.get(path).json()
    assert body["forum"]["premoderation"] is True and body["forum"]["premoderation_locked"] is True
    assert body["forum"]["students_can_open_locked"] is False
    row = next(row for row in body["counselors"] if row["id"] == clio)
    assert row["locked"] is True and row["locked_enabled"] is False and row["enabled"] is False
    as_role(identity, "owner")
    refused = client.put(path, json={"revision": body["revision"], "disabled_tool_keys": [], "disabled_counselor_ids": []})
    assert refused.json() == {"detail": "item_locked_by_admin", "item_kind": "counselor", "item_id": str(clio)}


def test_lock_bumps_revision_so_open_teacher_drafts_reload(api):
    client, _, group, _, identity, _ = api
    assert lock(client, group.id, "tool", "QSA", False).status_code == 200
    as_role(identity, "owner")
    assert client.put(f"/teacher/groups/{group.id}/settings",
                      json={"revision": 1, "disabled_tool_keys": ["QSA"]}).status_code == 409


# --- Audit log --------------------------------------------------------------

def test_admin_edits_locks_and_teacher_changes_are_audited(api):
    client, db, group, _, identity, _ = api
    path = f"/teacher/groups/{group.id}/settings"
    assert client.put(path, json={"revision": 1, "disabled_tool_keys": ["tavolo"], "reason": "Pilot"}).status_code == 200
    assert lock(client, group.id, "tool", "QSA", False, "School policy").status_code == 200
    assert client.post(f"/admin/groups/{group.id}/settings/unlock",
                       json={"target_kind": "tool", "target_id": "QSA", "reason": "Policy ended"}).status_code == 200
    tools = {row["key"]: row for row in client.get(path).json()["tools"]}
    assert tools["tavolo"]["changed_by_admin"] is True and tools["goals"]["changed_by_admin"] is False

    as_role(identity, "owner")
    revision = client.get(path).json()["revision"]
    assert client.put(path, json={"revision": revision, "disabled_tool_keys": []}).status_code == 200
    log = client.get(f"{path}/audit-log").json()
    entries = [(row["action"], row["target_kind"], row["target_id"], row["actor_role"]) for row in log]
    assert sorted(entries[:2]) == [("setting_change", "tool", "QSA", "teacher"), ("setting_change", "tool", "tavolo", "teacher")]
    assert entries[2:] == [
        ("unlock", "tool", "QSA", "admin"),
        ("lock", "tool", "QSA", "admin"),
        ("setting_change", "tool", "tavolo", "admin"),
    ]
    first_admin_edit = log[-1]
    assert first_admin_edit["actor_username"] == "root" and first_admin_edit["actor_display_name"] == "Root Admin"
    assert first_admin_edit["old_value"] == {"enabled": True} and first_admin_edit["new_value"] == {"enabled": False}
    assert first_admin_edit["reason"] == "Pilot"
    assert log[3]["new_value"] == {"enabled": False, "locked": True} and log[3]["reason"] == "School policy"
    assert log[2]["old_value"] == {"enabled": False, "locked": True} and log[2]["new_value"] == {"enabled": False, "locked": False}
    tools = {row["key"]: row for row in client.get(path).json()["tools"]}
    assert tools["tavolo"]["changed_by_admin"] is False, "a later teacher change clears the admin marker"


def test_default_counselor_change_is_audited_as_bulk_setting(api):
    client, _, group, _, _, counselors = api
    path = f"/teacher/groups/{group.id}/settings"
    assert client.put(path, json={"revision": 1, "disabled_tool_keys": [],
                                  "default_counselor_id": counselors["clio"]}).status_code == 200
    log = client.get(f"{path}/audit-log").json()
    assert [(row["target_kind"], row["target_id"], row["old_value"], row["new_value"]) for row in log] == [
        ("settings_bulk", "default_counselor_id", None, counselors["clio"])]


def test_unchanged_save_writes_no_audit_rows(api):
    client, db, group, _, _, _ = api
    path = f"/teacher/groups/{group.id}/settings"
    assert client.put(path, json={"revision": 1, "disabled_tool_keys": []}).status_code == 200
    assert db.query(models.ClassSettingsAuditLog).count() == 0


@pytest.mark.parametrize("role", ["owner", "co-teacher", "root", "other-teacher", "anna"])
def test_audit_log_permissions(api, role):
    client, _, group, _, identity, _ = api
    as_role(identity, role)
    expected = 200 if role in {"owner", "co-teacher", "root"} else 403
    assert client.get(f"/teacher/groups/{group.id}/settings/audit-log").status_code == expected


@pytest.mark.parametrize("role", ["owner", "co-teacher"])
def test_locked_on_cannot_be_disabled_by_any_teacher_and_rejection_is_atomic(api, role):
    client, _, group, _, identity, _ = api
    assert lock(client, group.id, "tool", "QSA", True).status_code == 200
    path = f"/teacher/groups/{group.id}/settings"
    before = client.get(path).json()
    audit = client.get(f"{path}/audit-log").json()
    as_role(identity, role)
    response = client.put(path, json={"revision": before["revision"], "disabled_tool_keys": ["QSA", "tavolo"]})
    assert response.status_code == 422
    assert response.json()["detail"] == "item_locked_by_admin"
    assert client.get(path).json() == before
    assert client.get(f"{path}/audit-log").json() == audit


def test_relocking_changes_state_and_unlock_preserves_last_value(api):
    client, _, group, _, _, _ = api
    path = f"/teacher/groups/{group.id}/settings"
    for state in (True, False):
        assert lock(client, group.id, "tool", "QSA", state).status_code == 200
    assert client.post(f"/admin/groups/{group.id}/settings/unlock", json={"target_kind": "tool", "target_id": "QSA"}).status_code == 200
    body = client.get(path).json()
    assert body["revision"] == 4 and body["disabled_tool_keys"] == ["QSA"]
    assert next(row for row in body["tools"] if row["key"] == "QSA")["changed_by_admin"] is True
    assert [row["action"] for row in client.get(f"{path}/audit-log").json()] == ["unlock", "lock", "lock"]


def test_private_counselors_are_never_targets_or_directory_data(api):
    client, db, group, _, _, _ = api
    private = models.Counselor(slug="private", name="Private", owner_username="anna", is_active=True)
    db.add(private)
    db.commit()
    assert lock(client, group.id, "counselor", str(private.id), False).status_code == 422
    assert private.id not in {row["id"] for row in client.get(f"/teacher/groups/{group.id}/settings").json()["counselors"]}


@pytest.mark.parametrize("state", ["false", 1, None])
def test_lock_requires_a_boolean_state(api, state):
    client, _, group, _, _, _ = api
    assert lock(client, group.id, "tool", "QSA", state).status_code == 422
    assert client.get(f"/teacher/groups/{group.id}/settings/audit-log").json() == []


def test_audit_reasons_reject_control_characters_before_database_write(api):
    client, _, group, _, _, _ = api
    path = f"/teacher/groups/{group.id}/settings"
    assert lock(client, group.id, "tool", "QSA", False, "Bad\x00reason").status_code == 422
    assert client.put(path, json={"revision": 1, "disabled_tool_keys": ["QSA"], "reason": "Bad\x01reason"}).status_code == 422
    assert client.get(f"{path}/audit-log").json() == []
