"""Whole-class goal assignments as class-path steps (TF6, #153).

Synthetic PostgreSQL only, in a rolled-back schema. The same TeacherAssignment
and AssignmentWork rows serve the standalone list and the path step; completion
is the student's explicit, current submission after the step's activation.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, database, models
from backend.routes import class_paths
from backend.routes.assignments import router as assignments_router
from backend.routes.assignment_work import router as work_router
from backend.tests.artifact_database import artifact_session

TEACHER = dict(username="teacher", name="Teacher One", authenticated=True, is_admin=False, groups=["docenti"])


@pytest.fixture
def api():
    with artifact_session() as db:
        group = models.StudentGroup(name="Synthetic class", code="SYN-153", owner_username="teacher")
        other = models.StudentGroup(name="Other class", code="SYN-153-OTHER", owner_username="teacher")
        db.add_all([group, other])
        db.flush()
        goal = models.GoalCatalogEntry(
            author_username="teacher", group_id=group.id, status="published",
            data=dict(title="Plan the study week", description="Invented", criteria="One week", language="en"),
        )
        strategy = models.CertifiedStrategy(slug="spaced", name_en="Spaced review", status="certified")
        reading = models.CertifiedReading(slug="synthetic-film", title="Synthetic film", kind="film", status="certified")
        db.add_all([
            goal, strategy, reading,
            models.GroupMembership(group_id=group.id, username="alice"),
            models.GroupMembership(group_id=group.id, username="bob"),
            models.GroupMembership(group_id=other.id, username="eve"),
        ])
        db.commit()
        identity = dict(TEACHER)
        app = FastAPI()
        for router in (class_paths.router, assignments_router, work_router):
            app.include_router(router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_identity] = lambda: dict(identity)
        with TestClient(app) as client:
            yield client, db, identity, group, other, dict(goal=goal, strategy=strategy, reading=reading)


def as_user(identity, username, groups=None):
    identity.clear()
    identity.update(TEACHER if username == "teacher" else
                    dict(username=username, name=username, authenticated=True, is_admin=False, groups=groups or []))


def assign(client, group, sources, request_id="request-153-a", **extra):
    payload = dict(
        source_kind="goal", source_id=sources["goal"].id, group_id=group.id, request_id=request_id,
        attachments=[{"source_kind": "strategy", "source_id": sources["strategy"].id},
                     {"source_kind": "reading", "source_id": sources["reading"].id}],
        **extra,
    )
    response = client.post("/teacher/assignments", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def assignment_step(assignment, step_id=None):
    row = {"step_type": "assignment", "assignment_id": assignment["id"]}
    return {**row, "id": step_id} if step_id else row


def new_path(client, group, steps, *, mode="recommended", publish=True):
    path = client.post(f"/teacher/groups/{group.id}/paths", json={"title": "Assignments", "mode": mode}).json()
    response = save(client, path, steps, mode=mode)
    assert response.status_code == 200, response.text
    path = response.json()
    if publish:
        response = client.post(f"/teacher/paths/{path['id']}/publish")
        assert response.status_code == 200, response.text
        path = response.json()
    return path


def save(client, path, steps, mode=None):
    return client.put(f"/teacher/paths/{path['id']}", json={
        "revision": path["revision"], "title": path["title"], "mode": mode or path["mode"], "steps": steps})


def plan_work(client, assignment):
    response = client.post(f"/user/assignments/{assignment['id']}/plan", json={})
    assert response.status_code == 200, response.text
    return response.json()


def submit(client, assignment, text="My explicit work"):
    work = client.get(f"/user/assignments/{assignment['id']}/work").json()
    if not work["planned"]:
        work = plan_work(client, assignment)
    response = client.post(f"/user/assignments/{assignment['id']}/submission",
                           json={"revision": work["revision"], "text": text})
    assert response.status_code == 200, response.text
    return response.json()


def withdraw(client, assignment):
    work = client.get(f"/user/assignments/{assignment['id']}/work").json()
    response = client.delete(f"/user/assignments/{assignment['id']}/submission?revision={work['revision']}")
    assert response.status_code == 200, response.text
    return response.json()


def student_step(client, index=0):
    return client.get("/user/paths").json()[0]["steps"][index]


def teacher_cell(client, path, username="alice", index=0):
    progress = client.get(f"/teacher/paths/{path['id']}/progress").json()
    return next(row for row in progress["students"] if row["username"] == username)["cells"][index]


def test_builder_creates_snapshot_and_step_shares_the_standalone_assignment(api):
    client, db, identity, group, _other, sources = api
    created = assign(client, group, sources)
    listed = client.get(f"/teacher/groups/{group.id}/path-assignments")
    assert listed.status_code == 200, listed.text
    assert [row["id"] for row in listed.json()] == [created["id"]]
    path = new_path(client, group, [assignment_step(created)])
    step = path["steps"][0]
    assert step["step_type"] == "assignment" and step["assignment_id"] == created["id"]
    assert step["tool_key"] is None and step["auto_detect"] is True and step["can_self_mark"] is False
    assert step["active_from"] is not None
    summary = step["target_summary"]
    assert summary["title"] == "Plan the study week"
    assert [item["title"] for item in summary["attachments"]] == ["Spaced review", "Synthetic film"]
    as_user(identity, "alice")
    standalone = client.get("/user/assignments").json()
    assert [row["id"] for row in standalone] == [created["id"]]
    row = student_step(client)
    assert row["state"] == "not_done" and row["can_self_mark"] is False
    assert row["start_href"] == f"/profilo/assegnazioni#assignment-{created['id']}"
    launch = client.post(f"/user/paths/{path['id']}/steps/{step['id']}/launch")
    assert launch.status_code == 200, launch.text
    assert launch.json() == {"step_type": "assignment", "path_id": path["id"], "step_id": step["id"],
                             "assignment_id": created["id"],
                             "start_href": f"/profilo/assegnazioni#assignment-{created['id']}"}
    # One submission state: the standalone submission completes the path step.
    submit(client, created)
    row = student_step(client)
    assert row["state"] == "done" and row["source"] == "automatic"
    assert row["completion_kind"] == "assignment_submission"
    assert client.get("/user/assignments").json()[0]["progress"]["shared"] is True
    assert db.query(models.AssignmentWork).count() == 1


def test_catalog_deletion_preserves_the_delivered_snapshot(api):
    client, db, identity, group, _other, sources = api
    created = assign(client, group, sources)
    path = new_path(client, group, [assignment_step(created)])
    db.delete(sources["goal"])
    db.commit()
    step = client.get(f"/teacher/paths/{path['id']}").json()["steps"][0]
    assert step["availability_reason"] is None
    assert step["target_summary"]["title"] == "Plan the study week"
    as_user(identity, "alice")
    submit(client, created)
    assert student_step(client)["state"] == "done"


def test_cross_class_targeted_revoked_and_legacy_targets_are_rejected(api):
    client, db, identity, group, other, sources = api
    path = client.post(f"/teacher/groups/{group.id}/paths", json={"title": "Rejected"}).json()
    foreign_goal = models.GoalCatalogEntry(author_username="teacher", group_id=None, status="published",
                                           data=dict(title="Foreign", language="en"))
    db.add(foreign_goal)
    db.commit()
    foreign = assign(client, other, dict(sources, goal=foreign_goal), request_id="request-153-foreign")
    targeted = assign(client, group, sources, request_id="request-153-targeted", recipient_username="alice")
    revoked = assign(client, group, sources, request_id="request-153-revoked")
    assert client.delete(f"/teacher/assignments/{revoked['id']}").status_code == 200
    legacy = models.TeacherAssignment(
        author_username="teacher", author_name="Teacher One", group_id=group.id, group_name=group.name,
        source_kind="reading", source_id=sources["reading"].id, snapshot={"title": "Legacy"},
        instructions="", request_id="legacy-153", request_hash="legacy")
    db.add(legacy)
    db.commit()
    expected = {
        foreign["id"]: (422, "assignment_class_mismatch"),
        targeted["id"]: (422, "assignment_targeted"),
        revoked["id"]: (409, "assignment_revoked"),
        legacy.id: (422, "assignment_not_goal"),
        999999: (422, "assignment_class_mismatch"),
    }
    for assignment_id, (status, detail) in expected.items():
        response = save(client, path, [{"step_type": "assignment", "assignment_id": assignment_id}])
        assert (response.status_code, response.json()["detail"]) == (status, detail)
    listed = {row["id"] for row in client.get(f"/teacher/groups/{group.id}/path-assignments").json()}
    assert listed == set()
    # Standalone targeted delivery keeps working outside paths.
    as_user(identity, "alice")
    assert targeted["id"] in [row["id"] for row in client.get("/user/assignments").json()]
    assert client.get(f"/user/assignments/{targeted['id']}/work").status_code == 200
    # A rejected save writes nothing.
    as_user(identity, "teacher")
    current = client.get(f"/teacher/paths/{path['id']}").json()
    assert current["revision"] == path["revision"] and current["steps"] == []


def test_duplicate_assignment_targets_and_failed_saves_keep_the_draft(api):
    client, db, _identity, group, _other, sources = api
    created = assign(client, group, sources)
    second = assign(client, group, sources, request_id="request-153-b")
    path = client.post(f"/teacher/groups/{group.id}/paths", json={"title": "Draft"}).json()
    response = save(client, path, [assignment_step(created), assignment_step(created)])
    assert (response.status_code, response.json()["detail"]) == (422, "duplicate_assignment_step")
    assert client.delete(f"/teacher/assignments/{second['id']}").status_code == 200
    response = save(client, path, [assignment_step(created), assignment_step(second)])
    assert response.status_code == 409
    assert db.query(models.ClassPathStep).filter_by(path_id=path["id"]).count() == 0
    response = save(client, path, [assignment_step(created)])
    assert response.status_code == 200, response.text


def test_unauthorized_contexts(api):
    client, db, identity, group, other, sources = api
    created = assign(client, group, sources)
    path = new_path(client, group, [assignment_step(created)])
    step_id = path["steps"][0]["id"]
    as_user(identity, "alice")
    assert client.get(f"/teacher/groups/{group.id}/path-assignments").status_code == 403
    as_user(identity, "eve")
    assert client.post(f"/user/paths/{path['id']}/steps/{step_id}/launch").status_code == 403
    assert client.get(f"/user/assignments/{created['id']}/work").status_code == 404
    as_user(identity, "stranger", ["docenti"])
    assert client.get(f"/teacher/groups/{group.id}/path-assignments").status_code == 404
    stranger_path = client.put(f"/teacher/paths/{path['id']}", json={
        "revision": path["revision"], "title": "x", "steps": [assignment_step(created)]})
    assert stranger_path.status_code == 403
    # An assignment step never accepts a student self-mark.
    as_user(identity, "alice")
    assert client.post(f"/user/paths/{path['id']}/steps/{step_id}/done").status_code == 422


def test_explicit_submission_only_and_withdrawal(api):
    client, db, identity, group, _other, sources = api
    created = assign(client, group, sources)
    path = new_path(client, group, [assignment_step(created)])
    as_user(identity, "alice")
    client.get(f"/user/assignments/{created['id']}/work")
    plan_work(client, created)
    work = client.get(f"/user/assignments/{created['id']}/work").json()
    response = client.put(f"/user/assignments/{created['id']}/reflection", json={
        "revision": work["revision"], "workspace_revision": work["workspace_revision"], "reflection": "Private"})
    assert response.status_code == 200, response.text
    assert student_step(client)["state"] == "not_done"
    submit(client, created)
    assert student_step(client)["state"] == "done"
    as_user(identity, "teacher")
    progress = client.get(f"/teacher/paths/{path['id']}/progress").json()
    assert "My explicit work" not in str(progress) and "Private" not in str(progress)
    cell = teacher_cell(client, path)
    assert cell["state"] == "done" and cell["completion_kind"] == "assignment_submission"
    assert teacher_cell(client, path, "bob")["state"] == "not_done"
    work = client.get(f"/teacher/assignments/{created['id']}/submissions").json()[0]
    response = client.put(f"/teacher/assignments/{created['id']}/submissions/alice/feedback",
                          json={"revision": work["revision"], "text": "Feedback"})
    assert response.status_code == 200, response.text
    as_user(identity, "alice")
    withdraw(client, created)
    assert student_step(client)["state"] == "not_done"
    submit(client, created, "Second version")
    assert student_step(client)["state"] == "done"


def test_feedback_alone_and_pre_activation_submission_do_not_count(api):
    client, db, identity, group, _other, sources = api
    created = assign(client, group, sources)
    as_user(identity, "alice")
    submit(client, created)
    as_user(identity, "teacher")
    path = new_path(client, group, [assignment_step(created)])
    as_user(identity, "alice")
    # Submitted before the step existed: an unchanged resubmission is not new evidence.
    assert student_step(client)["state"] == "not_done"
    withdraw(client, created)
    submit(client, created)
    assert student_step(client)["state"] == "done"


def test_teacher_override_precedence_and_clear(api):
    client, db, identity, group, _other, sources = api
    created = assign(client, group, sources)
    path = new_path(client, group, [assignment_step(created)])
    step_id = path["steps"][0]["id"]
    url = f"/teacher/paths/{path['id']}/steps/{step_id}/progress/alice"
    response = client.put(url, json={"state": "done", "reason": "Handed in on paper"})
    assert response.status_code == 200, response.text
    assert response.json()["state"] == "done" and response.json()["source"] == "teacher"
    as_user(identity, "alice")
    submit(client, created)
    as_user(identity, "teacher")
    assert client.put(url, json={"state": "not_done"}).json()["state"] == "not_done"
    cleared = client.put(url, json={"state": "clear"}).json()
    assert cleared["state"] == "done" and cleared["source"] == "automatic"


def test_revocation_makes_step_unavailable_and_blocks_override(api):
    client, db, identity, group, _other, sources = api
    created = assign(client, group, sources)
    path = new_path(client, group, [assignment_step(created), {"step_type": "tool", "tool_key": "timeline"}])
    as_user(identity, "alice")
    submit(client, created)
    as_user(identity, "teacher")
    assert client.delete(f"/teacher/assignments/{created['id']}").status_code == 200
    step = client.get(f"/teacher/paths/{path['id']}").json()["steps"][0]
    assert step["availability_reason"] == "assignment_revoked"
    assert teacher_cell(client, path)["state"] == "unavailable"
    response = client.put(f"/teacher/paths/{path['id']}/steps/{step['id']}/progress/alice", json={"state": "done"})
    assert response.status_code == 422
    assert client.post(f"/teacher/paths/{path['id']}/publish").status_code == 409
    as_user(identity, "alice")
    row = client.get("/user/paths").json()[0]
    assert row["steps"][0]["state"] == "unavailable" and row["total"] == 1
    assert client.post(f"/user/paths/{path['id']}/steps/{step['id']}/launch").status_code == 409


def test_membership_changes_follow_the_current_class(api):
    client, db, identity, group, _other, sources = api
    created = assign(client, group, sources)
    path = new_path(client, group, [assignment_step(created)])
    db.add(models.GroupMembership(group_id=group.id, username="carol"))
    db.commit()
    as_user(identity, "carol")
    submit(client, created)
    assert student_step(client)["state"] == "done"
    db.query(models.GroupMembership).filter_by(group_id=group.id, username="carol").delete()
    db.commit()
    assert client.get("/user/paths").json() == []
    as_user(identity, "teacher")
    usernames = [row["username"] for row in client.get(f"/teacher/paths/{path['id']}/progress").json()["students"]]
    assert "carol" not in usernames
    from backend.path_step_types import completion_evidence
    step = db.get(models.ClassPathStep, path["steps"][0]["id"])
    assert completion_evidence(db, db.get(models.ClassPath, path["id"]), step, "carol") is None


def test_strict_order_locks_later_assignment_and_target_is_immutable(api):
    client, db, identity, group, _other, sources = api
    created = assign(client, group, sources)
    second = assign(client, group, sources, request_id="request-153-b")
    path = new_path(client, group, [{"step_type": "tool", "tool_key": "timeline"}, assignment_step(created)],
                    mode="strict")
    as_user(identity, "alice")
    submit(client, created)
    row = client.get("/user/paths").json()[0]
    assert [step["state"] for step in row["steps"]] == ["not_done", "locked"]
    assert client.post(f"/user/paths/{path['id']}/steps/{path['steps'][1]['id']}/launch").status_code == 409
    # Standalone use is never banned by path ordering.
    assert client.get(f"/user/assignments/{created['id']}/work").status_code == 200
    assert client.post(f"/user/paths/{path['id']}/steps/{path['steps'][0]['id']}/done").status_code == 200
    assert [step["state"] for step in client.get("/user/paths").json()[0]["steps"]] == ["done", "done"]
    as_user(identity, "teacher")
    tool, step = path["steps"]
    response = save(client, path, [{"step_type": "tool", "tool_key": "timeline", "id": tool["id"]},
                                   assignment_step(second, step["id"])])
    assert (response.status_code, response.json()["detail"]) == (409, "activated_step_target_immutable")
    reordered = save(client, path, [assignment_step(created, step["id"]),
                                    {"step_type": "tool", "tool_key": "timeline", "id": tool["id"]}])
    assert reordered.status_code == 200, reordered.text
    assert reordered.json()["steps"][0]["id"] == step["id"]
    assert reordered.json()["steps"][0]["active_from"] == path["steps"][1]["active_from"]


def test_request_id_retry_returns_the_same_assignment_for_the_builder(api):
    client, db, _identity, group, _other, sources = api
    first = assign(client, group, sources)
    again = assign(client, group, sources)
    assert again["id"] == first["id"]
    assert db.query(models.TeacherAssignment).count() == 1
    path = new_path(client, group, [assignment_step(again)])
    assert path["steps"][0]["assignment_id"] == first["id"]


def test_late_added_step_uses_its_own_activation(api):
    client, db, identity, group, _other, sources = api
    created = assign(client, group, sources)
    path = new_path(client, group, [{"step_type": "tool", "tool_key": "timeline"}])
    as_user(identity, "alice")
    submit(client, created)
    work = db.query(models.AssignmentWork).one()
    work.submitted_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    db.commit()
    as_user(identity, "teacher")
    tool = path["steps"][0]
    response = save(client, path, [{"step_type": "tool", "tool_key": "timeline", "id": tool["id"]},
                                   assignment_step(created)])
    assert response.status_code == 200, response.text
    late = response.json()["steps"][1]
    assert late["active_from"] > path["steps"][0]["active_from"]
    as_user(identity, "alice")
    assert student_step(client, 1)["state"] == "not_done"
