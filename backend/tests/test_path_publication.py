"""Mixed class-path publication and lifecycle (TF8, #155).

Synthetic PostgreSQL only, in a rolled-back schema. One class of a teacher's
institute composes a path with every step type: Italian administration,
results deep dive, goal assignment, exact forum discussion and another tool.
Publication validates every target at once; lifecycle actions are guarded by
the path revision; activation times and step identities survive reorder,
archive and restore; unavailable steps carry an actionable reason.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, database, models
from backend.routes import administration_plans, class_paths
from backend.routes.assignment_work import router as work_router
from backend.routes.assignments import router as assignments_router
from backend.routes.forum import router as forum_router
from backend.tests.artifact_database import artifact_session

TEACHER = dict(username="teacher", name="Teacher One", authenticated=True, is_admin=False, groups=["docenti"])


@pytest.fixture
def api():
    with artifact_session() as db:
        school = models.Institution(
            slug="synthetic-tf8", name="Synthetic institute", kind="school",
            institution_code="SYN-155", hashed_password=models.get_password_hash("Invented-155"),
        )
        db.add(school)
        db.flush()
        group = models.StudentGroup(name="Synthetic 3B", code="SYN-155-3B", owner_username="teacher",
                                    institution_id=school.id)
        other = models.StudentGroup(name="Synthetic 4C", code="SYN-155-4C", owner_username="teacher",
                                    institution_id=school.id)
        db.add_all([group, other])
        db.flush()
        goal = models.GoalCatalogEntry(
            author_username="teacher", group_id=group.id, status="published",
            data=dict(title="Plan the study week", description="Invented", criteria="One week", language="en"),
        )
        db.add_all([
            goal,
            models.InstitutionTeacher(institution_id=school.id, username="teacher", is_active=True,
                                      created_by="teacher", updated_by="teacher"),
            models.Instrument(code="QSA", name_en="Learning strategies", tool_category="assessment", is_active=True),
            models.Factor(code="C1", instrument_code="QSA"),
            models.Factor(code="C2", instrument_code="QSA"),
            models.GroupMembership(group_id=group.id, username="alice"),
            models.GroupMembership(group_id=other.id, username="eve"),
        ])
        db.commit()
        identity = dict(TEACHER)
        app = FastAPI()
        for router in (class_paths.router, administration_plans.router, assignments_router, work_router,
                       forum_router):
            app.include_router(router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_identity] = lambda: dict(identity)
        with TestClient(app) as client:
            yield client, db, identity, group, other, goal


def as_user(identity, username):
    identity.clear()
    identity.update(TEACHER if username == "teacher" else
                    dict(username=username, name=username, authenticated=True, is_admin=False, groups=[]))


def targets(client, group, goal):
    plan = client.post(f"/teacher/groups/{group.id}/administrations", json={
        "title": "Italian questionnaire", "instrument_code": "QSA", "locale": "it", "status": "active"})
    assert plan.status_code == 200, plan.text
    assignment = client.post("/teacher/assignments", json=dict(
        source_kind="goal", source_id=goal.id, group_id=group.id, request_id="request-155"))
    assert assignment.status_code == 201, assignment.text
    topic = client.post(f"/groups/{group.id}/forum/topics", json={"title": "Discussion", "body": "Opening"})
    assert topic.status_code == 201, topic.text
    return plan.json(), assignment.json(), topic.json()


def save(client, path, steps):
    return client.put(f"/teacher/paths/{path['id']}", json={
        "revision": path["revision"], "title": path["title"], "mode": path["mode"], "steps": steps})


def keep(step, **changes):
    """A saved step sent back as is, with its identity and target."""
    fields = ("id", "step_type", "tool_key", "administration_plan_id", "results_step_id", "assignment_id",
              "topic_id", "title", "instructions")
    row = {key: step[key] for key in fields if step.get(key) is not None}
    return {**row, **changes}


def mixed_path(client, group, goal, *, mode="recommended"):
    plan, assignment, topic = targets(client, group, goal)
    path = client.post(f"/teacher/groups/{group.id}/paths", json={"title": "Orientation 3B", "mode": mode}).json()
    response = save(client, path, [{"step_type": "questionnaire_administration", "administration_plan_id": plan["id"]}])
    assert response.status_code == 200, response.text
    path = response.json()
    administration = path["steps"][0]
    response = save(client, path, [
        keep(administration),
        {"step_type": "guided_results_chat", "results_step_id": administration["id"]},
        {"step_type": "assignment", "assignment_id": assignment["id"]},
        {"step_type": "forum", "topic_id": topic["id"]},
        {"step_type": "tool", "tool_key": "timeline"},
    ])
    assert response.status_code == 200, response.text
    return response.json(), plan, assignment, topic


def publish(client, path, **body):
    return client.post(f"/teacher/paths/{path['id']}/publish", json=body or None)


def test_mixed_path_publishes_every_type_with_one_activation(api):
    client, db, identity, group, other, goal = api
    path, plan, assignment, topic = mixed_path(client, group, goal)
    assert all(step["active_from"] is None for step in path["steps"])
    response = publish(client, path, revision=path["revision"])
    assert response.status_code == 200, response.text
    published = response.json()
    assert [step["step_type"] for step in published["steps"]] == [
        "questionnaire_administration", "guided_results_chat", "assignment", "forum", "tool"]
    activations = {step["active_from"] for step in published["steps"]}
    assert len(activations) == 1 and None not in activations
    assert all(step["availability_reason"] is None for step in published["steps"])

    as_user(identity, "alice")
    [student_path] = client.get("/user/paths").json()
    assert student_path["done"] == 0 and student_path["total"] == 5
    assert [step["state"] for step in student_path["steps"]] == ["not_done"] * 5
    # Only the tool step can be self-marked; every typed step waits for its own evidence.
    assert [step["can_self_mark"] for step in student_path["steps"]] == [False, False, False, False, True]

    # Another class of the same institute neither sees nor launches it.
    as_user(identity, "eve")
    assert client.get("/user/paths").json() == []
    step_id = published["steps"][0]["id"]
    assert client.post(f"/user/paths/{published['id']}/steps/{step_id}/launch").status_code == 403


def test_publication_reports_every_unavailable_target_without_partial_writes(api):
    client, db, identity, group, other, goal = api
    path, plan, assignment, topic = mixed_path(client, group, goal)
    # The targets change after the draft was saved: revoked, forum off, instrument off.
    db.get(models.TeacherAssignment, assignment["id"]).revoked_at = datetime.now(timezone.utc)
    db.add(models.ClassSettings(group_id=group.id, updated_by="teacher", disabled_tool_keys=["forum"]))
    db.query(models.Instrument).filter_by(code="QSA").one().is_active = False
    db.commit()

    response = publish(client, path, revision=path["revision"])
    assert response.status_code == 409, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "path_publication_blocked"
    reasons = {(row["position"], row["step_type"], row["reason"]) for row in detail["problems"]}
    assert reasons == {
        (1, "questionnaire_administration", "tool_unavailable"),
        (2, "guided_results_chat", "tool_unavailable"),
        (3, "assignment", "assignment_revoked"),
        (4, "forum", "forum_disabled_for_class"),
    }
    assert {row["step_id"] for row in detail["problems"]} == {step["id"] for step in path["steps"][:4]}
    current = client.get(f"/teacher/paths/{path['id']}").json()
    assert current["status"] == "draft" and current["published_at"] is None
    assert current["revision"] == path["revision"]
    assert all(step["active_from"] is None for step in current["steps"])


def test_stale_revisions_block_publish_archive_and_restore(api):
    client, db, identity, group, other, goal = api
    path, *_ = mixed_path(client, group, goal)
    stale = path["revision"] - 1
    assert publish(client, path, revision=stale).status_code == 409
    assert client.get(f"/teacher/paths/{path['id']}").json()["status"] == "draft"

    published = publish(client, path, revision=path["revision"]).json()
    # Two tabs publishing from the same revision: the second one is stale.
    assert publish(client, path, revision=path["revision"]).status_code == 409
    assert client.post(f"/teacher/paths/{path['id']}/archive", json={"revision": stale}).status_code == 409
    archived = client.post(f"/teacher/paths/{path['id']}/archive", json={"revision": published["revision"]})
    assert archived.status_code == 200, archived.text
    archived = archived.json()
    assert client.post(f"/teacher/paths/{path['id']}/restore",
                       json={"revision": published["revision"]}).status_code == 409
    restored = client.post(f"/teacher/paths/{path['id']}/restore", json={"revision": archived["revision"]})
    assert restored.status_code == 200 and restored.json()["status"] == "published"
    # Older clients that send no body keep working.
    assert client.post(f"/teacher/paths/{path['id']}/archive").status_code == 200


def test_reorder_and_text_edits_keep_identity_and_activation(api):
    client, db, identity, group, other, goal = api
    path, *_ = mixed_path(client, group, goal)
    published = publish(client, path).json()
    before = {step["id"]: step["active_from"] for step in published["steps"]}
    administration, deep_dive, assignment, forum, tool = published["steps"]
    response = save(client, published, [
        keep(administration), keep(deep_dive), keep(forum, title="Discuss first"),
        keep(assignment, instructions="Submit by Friday"), keep(tool)])
    assert response.status_code == 200, response.text
    after = response.json()["steps"]
    assert [step["id"] for step in after] == [administration["id"], deep_dive["id"], forum["id"],
                                              assignment["id"], tool["id"]]
    assert {step["id"]: step["active_from"] for step in after} == before
    assert after[2]["title"] == "Discuss first" and after[3]["instructions"] == "Submit by Friday"


def test_replacing_an_activated_target_creates_a_new_step(api):
    client, db, identity, group, other, goal = api
    path, plan, assignment, topic = mixed_path(client, group, goal)
    published = publish(client, path).json()
    forum = published["steps"][3]
    second = client.post(f"/groups/{group.id}/forum/topics", json={"title": "Second", "body": "Opening"}).json()
    client.put(f"/teacher/paths/{path['id']}/steps/{forum['id']}/progress/alice",
               json={"state": "done", "reason": "Discussed in class"})

    # The same step ID cannot silently point to another discussion.
    kept = [keep(step) for step in published["steps"]]
    swapped = [*kept[:3], {**kept[3], "topic_id": second["id"]}, kept[4]]
    response = save(client, published, swapped)
    assert response.status_code == 409 and response.json()["detail"] == "activated_step_target_immutable"

    # Replacement: drop the old step and add the new target; it activates now.
    response = save(client, published, [*kept[:3], {"step_type": "forum", "topic_id": second["id"]}, kept[4]])
    assert response.status_code == 200, response.text
    replacement = response.json()["steps"][3]
    assert replacement["id"] != forum["id"] and replacement["topic_id"] == second["id"]
    assert replacement["active_from"] > forum["active_from"]
    old = db.get(models.ClassPathStep, forum["id"])
    assert old.removed_at is not None and old.topic_id == topic["id"]
    # The removed step keeps its history; the new one starts honest.
    assert db.query(models.ClassPathProgress).filter_by(step_id=forum["id"], username="alice").count() == 1
    as_user(identity, "alice")
    assert client.get("/user/paths").json()[0]["steps"][3]["state"] == "not_done"


def test_steps_added_while_archived_activate_on_restore(api):
    client, db, identity, group, other, goal = api
    path, plan, assignment, topic = mixed_path(client, group, goal)
    published = publish(client, path).json()
    archived = client.post(f"/teacher/paths/{path['id']}/archive").json()
    late = client.post(f"/groups/{group.id}/forum/topics", json={"title": "Late", "body": "Opening"}).json()
    response = save(client, archived, [*[keep(step) for step in published["steps"]],
                                       {"step_type": "forum", "topic_id": late["id"]}])
    assert response.status_code == 200, response.text
    assert response.json()["steps"][5]["active_from"] is None
    restored = client.post(f"/teacher/paths/{path['id']}/restore").json()
    assert restored["status"] == "published"
    late_step = restored["steps"][5]
    assert late_step["active_from"] is not None and late_step["active_from"] > published["published_at"]
    # Earlier steps keep their first activation.
    assert [step["active_from"] for step in restored["steps"][:5]] == [
        step["active_from"] for step in published["steps"]]

    as_user(identity, "alice")
    reply = client.post(f"/forum/topics/{late['id']}/posts", json={"body": "My reply"})
    assert reply.status_code == 201, reply.text
    assert client.get("/user/paths").json()[0]["steps"][5]["state"] == "done"


def test_restore_validates_targets_like_publication(api):
    client, db, identity, group, other, goal = api
    path, plan, assignment, topic = mixed_path(client, group, goal)
    publish(client, path)
    archived = client.post(f"/teacher/paths/{path['id']}/archive").json()
    db.get(models.TeacherAssignment, assignment["id"]).revoked_at = datetime.now(timezone.utc)
    db.commit()
    response = client.post(f"/teacher/paths/{path['id']}/restore", json={"revision": archived["revision"]})
    assert response.status_code == 409, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "path_publication_blocked"
    assert [(row["position"], row["reason"]) for row in detail["problems"]] == [(3, "assignment_revoked")]
    assert client.get(f"/teacher/paths/{path['id']}").json()["status"] == "archived"


def test_unavailable_steps_explain_themselves_and_overrides_stay_honest(api):
    client, db, identity, group, other, goal = api
    path, *_ = mixed_path(client, group, goal)
    published = publish(client, path).json()
    tool = published["steps"][4]
    response = client.put(f"/teacher/paths/{path['id']}/steps/{tool['id']}/progress/alice",
                          json={"state": "done", "reason": "Shown in class"})
    assert response.status_code == 200 and response.json()["state"] == "done"

    # The administrator disables the instrument; the class switches the timeline off.
    db.query(models.Instrument).filter_by(code="QSA").one().is_active = False
    db.add(models.ClassSettings(group_id=group.id, updated_by="teacher", disabled_tool_keys=["timeline"]))
    db.commit()
    progress = client.get(f"/teacher/paths/{path['id']}/progress").json()
    reasons = {step["position"]: step["availability_reason"] for step in progress["steps"]}
    assert reasons == {1: "tool_unavailable", 2: "tool_unavailable", 3: None, 4: None, 5: "tool_unavailable"}
    alice = progress["students"][0]
    assert alice["total"] == 2
    assert [cell["state"] for cell in alice["cells"]] == [
        "unavailable", "unavailable", "not_done", "not_done", "unavailable"]
    # The teacher's own mark stays visible, never counted, and can be cleared.
    assert alice["cells"][4]["teacher_state"] == "done"
    blocked = client.put(f"/teacher/paths/{path['id']}/steps/{tool['id']}/progress/alice", json={"state": "done"})
    assert blocked.status_code == 422
    cleared = client.put(f"/teacher/paths/{path['id']}/steps/{tool['id']}/progress/alice", json={"state": "clear"})
    assert cleared.status_code == 200 and cleared.json()["teacher_state"] is None

    as_user(identity, "alice")
    steps = client.get("/user/paths").json()[0]["steps"]
    assert [(step["state"], step["availability_reason"]) for step in steps] == [
        ("unavailable", "tool_unavailable"), ("unavailable", "tool_unavailable"),
        ("not_done", None), ("not_done", None), ("unavailable", "tool_unavailable")]


def test_unauthorized_contexts_cannot_manage_the_path(api):
    client, db, identity, group, other, goal = api
    path, *_ = mixed_path(client, group, goal)
    as_user(identity, "alice")
    for action in ("publish", "archive", "restore"):
        assert client.post(f"/teacher/paths/{path['id']}/{action}").status_code == 403
    identity.update(username="stranger", groups=["docenti"])
    for action in ("publish", "archive", "restore"):
        assert client.post(f"/teacher/paths/{path['id']}/{action}").status_code == 403
    as_user(identity, "teacher")
    assert client.get(f"/teacher/paths/{path['id']}").json()["status"] == "draft"


def test_strict_mixed_path_unlocks_in_order(api):
    client, db, identity, group, other, goal = api
    path, plan, assignment, topic = mixed_path(client, group, goal, mode="strict")
    published = publish(client, path).json()
    as_user(identity, "alice")
    steps = client.get("/user/paths").json()[0]["steps"]
    assert [step["state"] for step in steps] == ["not_done", "locked", "locked", "locked", "locked"]
    forum = published["steps"][3]
    assert client.post(f"/user/paths/{path['id']}/steps/{forum['id']}/launch").status_code == 409
    # A reply posted while locked counts once the earlier steps are done.
    assert client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Early"}).status_code == 201
    as_user(identity, "teacher")
    for step in published["steps"][:3]:
        response = client.put(f"/teacher/paths/{path['id']}/steps/{step['id']}/progress/alice",
                              json={"state": "done", "reason": "Checked"})
        assert response.status_code == 200, response.text
    as_user(identity, "alice")
    steps = client.get("/user/paths").json()[0]["steps"]
    assert [step["state"] for step in steps] == ["done", "done", "done", "done", "not_done"]
    assert steps[3]["source"] == "automatic"


def test_class_view_selection_keeps_path_rules_and_explains_hidden_tools(api):
    client, db, identity, group, other, goal = api
    path, plan, assignment, topic = mixed_path(client, group, goal)
    publish(client, path)
    # Alice also belongs to 4C, which switches the timeline and the forum off,
    # and she chooses the 4C view (#147).
    db.add_all([
        models.GroupMembership(group_id=other.id, username="alice"),
        models.ClassSettings(group_id=other.id, updated_by="teacher", disabled_tool_keys=["timeline", "forum"]),
        models.AccountPreferences(username="alice", class_view=str(other.id)),
    ])
    db.commit()
    as_user(identity, "alice")
    [student_path] = client.get("/user/paths").json()
    steps = student_path["steps"]
    # 3B's own forum setting still applies to its discussion step.
    assert (steps[3]["state"], steps[3]["availability_reason"]) == ("not_done", None)
    # The timeline is out of this view: unavailable, with a reason the page can show.
    assert (steps[4]["state"], steps[4]["availability_reason"]) == ("unavailable", "tool_unavailable")
    assert student_path["total"] == 4
