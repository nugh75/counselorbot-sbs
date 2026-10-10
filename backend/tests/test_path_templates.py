"""Reusable path templates applied to classes or groups (#172).

Synthetic PostgreSQL only, in a rolled-back schema. A template is private to its
author until shared as a preset; applying it makes an independent draft copy whose
questionnaire, assignment, discussion and deep-dive steps stay `pending` until
publication creates the class objects in one transaction. Students see nothing
before publication, and a blocked publication leaves no object behind.
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, database, models
from backend.routes import administration_plans, class_paths, path_templates
from backend.routes.assignments import router as assignments_router
from backend.tests.artifact_database import artifact_session

TEACHER = dict(username="teacher", name="Teacher One", authenticated=True, is_admin=False, groups=["docenti"])
OTHER_TEACHER = dict(username="colleague", name="Colleague", authenticated=True, is_admin=False, groups=["docenti"])


@pytest.fixture
def api():
    with artifact_session() as db:
        school = models.Institution(slug="synthetic-172", name="Synthetic institute", kind="school",
                                    institution_code="SYN-172", hashed_password=models.get_password_hash("Invented-172"))
        db.add(school)
        db.flush()
        group = models.StudentGroup(name="Synthetic 3B", code="SYN-172-3B", owner_username="teacher",
                                    institution_id=school.id)
        tutors = models.StudentGroup(name="Tutors (not a class)", code="SYN-172-TUT", owner_username="teacher")
        foreign = models.StudentGroup(name="Colleague class", code="SYN-172-COL", owner_username="colleague",
                                      institution_id=school.id)
        db.add_all([group, tutors, foreign])
        db.flush()
        goal = models.GoalCatalogEntry(author_username="teacher", group_id=None, status="published",
                                       data=dict(title="Plan the study week", description="Invented", language="en"))
        class_goal = models.GoalCatalogEntry(author_username="teacher", group_id=group.id, status="published",
                                             data=dict(title="Class only goal", language="en"))
        db.add_all([
            goal, class_goal,
            models.InstitutionTeacher(institution_id=school.id, username="teacher", is_active=True,
                                      created_by="teacher", updated_by="teacher"),
            models.Instrument(code="QSA", name_en="Learning strategies", tool_category="assessment", is_active=True),
            models.Factor(code="C1", instrument_code="QSA"),
            models.GroupMembership(group_id=group.id, username="alice"),
            models.GroupMembership(group_id=tutors.id, username="tom"),
        ])
        db.commit()
        identity = dict(TEACHER)
        app = FastAPI()
        for router in (class_paths.router, path_templates.router, administration_plans.router, assignments_router):
            app.include_router(router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_identity] = lambda: dict(identity)
        with TestClient(app) as client:
            yield client, db, identity, dict(group=group, tutors=tutors, foreign=foreign, goal=goal, class_goal=class_goal)


def as_user(identity, who):
    identity.clear()
    identity.update(who if isinstance(who, dict) else
                    dict(username=who, name=who, authenticated=True, is_admin=False, groups=[]))


def full_steps(goal):
    return [
        {"step_type": "tool", "tool_key": "tavolo", "title": "Warm up"},
        {"step_type": "questionnaire_administration", "instrument_code": "QSA", "locale": "it", "plan_title": "Start"},
        {"step_type": "guided_results_chat", "results_position": 2},
        {"step_type": "assignment", "goal_id": goal.id, "assignment_instructions": "Write your plan"},
        {"step_type": "forum", "topic_title": "How did it go?", "topic_body": "Share one thing"},
    ]


def create(client, goal, **extra):
    response = client.post("/teacher/path-templates", json={"title": "Start of year", "steps": full_steps(goal), **extra})
    assert response.status_code == 201, response.text
    return response.json()


def apply(client, template, *groups):
    return client.post(f"/teacher/path-templates/{template['id']}/apply", json={"group_ids": [g.id for g in groups]})


def counts(db):
    return (db.query(models.AdministrationPlan).count(), db.query(models.TeacherAssignment).count(),
            db.query(models.ForumTopic).count())


def test_template_is_private_until_shared_and_then_a_preset(api):
    client, _db, identity, data = api
    template = create(client, data["goal"])
    assert [row["step_type"] for row in template["steps"]] == [
        "tool", "questionnaire_administration", "guided_results_chat", "assignment", "forum"]
    as_user(identity, OTHER_TEACHER)
    assert client.get("/teacher/path-templates").json() == {"mine": [], "shared": []}
    assert client.get(f"/teacher/path-templates/{template['id']}").status_code == 404
    assert apply(client, template, data["foreign"]).status_code == 404
    as_user(identity, TEACHER)
    shared = client.post(f"/teacher/path-templates/{template['id']}/share",
                         json={"revision": template["revision"], "shared": True})
    assert shared.status_code == 200 and shared.json()["shared"] is True
    as_user(identity, OTHER_TEACHER)
    listed = client.get("/teacher/path-templates").json()
    assert [row["id"] for row in listed["shared"]] == [template["id"]] and listed["mine"] == []
    # A preset can be applied or copied, never edited, shared or deleted by others.
    for call in (lambda: client.put(f"/teacher/path-templates/{template['id']}",
                                    json={"revision": shared.json()["revision"], "title": "Hijack"}),
                 lambda: client.post(f"/teacher/path-templates/{template['id']}/share",
                                     json={"revision": shared.json()["revision"], "shared": False}),
                 lambda: client.delete(f"/teacher/path-templates/{template['id']}")):
        assert call().status_code == 404
    copy = client.post(f"/teacher/path-templates/{template['id']}/copy")
    assert copy.status_code == 201 and copy.json()["is_owner"] and not copy.json()["shared"]
    assert len(copy.json()["steps"]) == 5
    assert apply(client, template, data["foreign"]).status_code == 201


def test_apply_makes_pending_draft_invisible_to_students_and_publish_creates_objects(api):
    client, db, identity, data = api
    template = create(client, data["goal"])
    before = counts(db)
    response = apply(client, template, data["group"])
    assert response.status_code == 201, response.text
    path = response.json()[0]
    assert path["template_id"] == template["id"] and path["status"] == "draft"
    assert [s["step_type"] for s in path["steps"]] == ["tool", "pending", "pending", "pending", "pending"]
    assert path["steps"][1]["pending_config"]["kind"] == "questionnaire_administration"
    assert counts(db) == before
    as_user(identity, "alice")
    assert client.get("/user/paths").json() == []
    as_user(identity, TEACHER)
    published = client.post(f"/teacher/paths/{path['id']}/publish")
    assert published.status_code == 200, published.text
    steps = published.json()["steps"]
    assert [s["step_type"] for s in steps] == ["tool", "questionnaire_administration", "guided_results_chat",
                                               "assignment", "forum"]
    assert all(s["pending_config"] is None for s in steps)
    assert steps[2]["results_step_id"] == steps[1]["id"]
    plan = db.get(models.AdministrationPlan, steps[1]["administration_plan_id"])
    assert plan.group_id == data["group"].id and plan.title == "Start" and plan.locale == "it"
    assignment = db.get(models.TeacherAssignment, steps[3]["assignment_id"])
    assert assignment.group_id == data["group"].id and assignment.instructions == "Write your plan"
    assert db.query(models.AssignmentRecipient).filter_by(assignment_id=assignment.id).count() == 1
    topic = db.get(models.ForumTopic, steps[4]["topic_id"])
    assert topic.status == "published" and topic.author_username == "teacher"
    as_user(identity, "alice")
    assert [p["id"] for p in client.get("/user/paths").json()] == [path["id"]]


def test_blocked_publication_creates_nothing_and_keeps_steps_pending(api):
    client, db, _identity, data = api
    template = create(client, data["goal"])
    # A group that is not a class has no institute: the questionnaire cannot be prepared.
    path = apply(client, template, data["tutors"]).json()[0]
    before = counts(db)
    blocked = client.post(f"/teacher/paths/{path['id']}/publish")
    assert blocked.status_code == 409
    problems = blocked.json()["detail"]["problems"]
    assert {p["position"]: p["reason"] for p in problems}[2] == "class_institution_required"
    assert {p["position"]: p["reason"] for p in problems}[3] == "results_step_unavailable"
    assert counts(db) == before
    again = client.get(f"/teacher/paths/{path['id']}").json()
    assert again["status"] == "draft" and [s["step_type"] for s in again["steps"]][1:] == ["pending"] * 4


def test_applied_path_is_a_copy_and_pending_steps_survive_saves(api):
    client, _db, _identity, data = api
    template = create(client, data["goal"])
    path = apply(client, template, data["group"]).json()[0]
    edited = client.put(f"/teacher/path-templates/{template['id']}", json={
        "revision": template["revision"], "title": "Renamed", "steps": full_steps(data["goal"])[:1]})
    assert edited.status_code == 200
    stale = client.put(f"/teacher/path-templates/{template['id']}", json={
        "revision": template["revision"], "title": "Stale", "steps": []})
    assert stale.status_code == 409
    current = client.get(f"/teacher/paths/{path['id']}").json()
    assert current["title"] == "Start of year" and len(current["steps"]) == 5
    # The editor sends pending steps back by id; a reorder keeps them pending.
    body = [{"step_type": "tool", "tool_key": "tavolo", "id": current["steps"][0]["id"]}] + [
        {"step_type": "pending", "id": s["id"]} for s in current["steps"][1:]]
    saved = client.put(f"/teacher/paths/{path['id']}", json={
        "revision": current["revision"], "title": current["title"], "mode": "recommended", "steps": body})
    assert saved.status_code == 200, saved.text
    assert [s["step_type"] for s in saved.json()["steps"]] == ["tool"] + ["pending"] * 4
    # A deep dive cannot move before its questionnaire, nor point at another path.
    swapped = body[:1] + [body[2], body[1]] + body[3:]
    assert client.put(f"/teacher/paths/{path['id']}", json={
        "revision": saved.json()["revision"], "title": "x", "mode": "recommended", "steps": swapped}).status_code == 422
    other = client.post(f"/teacher/groups/{data['group'].id}/paths", json={"title": "Other"}).json()
    assert client.put(f"/teacher/paths/{other['id']}", json={
        "revision": other["revision"], "title": "Other", "mode": "recommended",
        "steps": [{"step_type": "pending", "id": body[1]["id"]}]}).status_code == 422


def test_save_as_template_round_trip_and_class_only_goal(api):
    client, db, _identity, data = api
    template = create(client, data["goal"])
    path = apply(client, template, data["group"]).json()[0]
    assert client.post(f"/teacher/paths/{path['id']}/publish").status_code == 200
    saved = client.post(f"/teacher/paths/{path['id']}/save-as-template")
    assert saved.status_code == 201, saved.text
    steps = saved.json()["steps"]
    assert [s["step_type"] for s in steps] == [s["step_type"] for s in template["steps"]]
    assert steps[1]["instrument_code"] == "QSA" and steps[2]["results_position"] == 2
    assert steps[3]["goal_id"] == data["goal"].id and steps[4]["topic_title"] == "How did it go?"
    # Pending drafts can be saved as templates too.
    draft = apply(client, template, data["group"]).json()[0]
    assert client.post(f"/teacher/paths/{draft['id']}/save-as-template").status_code == 201
    # A goal that belongs to one class cannot travel into a template.
    assert client.post("/teacher/path-templates", json={"title": "x", "steps": [
        {"step_type": "assignment", "goal_id": data["class_goal"].id}]}).status_code == 422
    plain = client.post(f"/teacher/groups/{data['group'].id}/paths", json={"title": "Class goal"}).json()
    created = client.post("/teacher/assignments", json=dict(source_kind="goal", source_id=data["class_goal"].id,
                                                             group_id=data["group"].id, request_id="request-172-class"))
    assert created.status_code == 201, created.text
    assert client.put(f"/teacher/paths/{plain['id']}", json={
        "revision": plain["revision"], "title": "Class goal", "mode": "recommended",
        "steps": [{"step_type": "assignment", "assignment_id": created.json()["id"]}]}).status_code == 200
    refused = client.post(f"/teacher/paths/{plain['id']}/save-as-template")
    assert refused.status_code == 409 and refused.json()["detail"]["code"] == "template_goal_unavailable"
    # Forum text never leaves the forum: a discussion not born from a template is refused.
    topic = models.ForumTopic(group_id=data["group"].id, title="Teacher topic", body="Teacher body",
                              status="published", author_username="teacher", author_display_name="Teacher One")
    db.add(topic)
    db.commit()
    forum_path = client.post(f"/teacher/groups/{data['group'].id}/paths", json={"title": "Forum"}).json()
    assert client.put(f"/teacher/paths/{forum_path['id']}", json={
        "revision": forum_path["revision"], "title": "Forum", "mode": "recommended",
        "steps": [{"step_type": "forum", "topic_id": topic.id}]}).status_code == 200
    refused = client.post(f"/teacher/paths/{forum_path['id']}/save-as-template")
    assert refused.status_code == 409 and refused.json()["detail"]["code"] == "template_forum_unavailable"


def test_apply_checks_class_tools_groups_and_template_validation(api):
    client, db, _identity, data = api
    template = create(client, data["goal"])
    db.add(models.ClassSettings(group_id=data["group"].id, disabled_tool_keys=["tavolo"], updated_by="teacher"))
    db.commit()
    blocked = apply(client, template, data["group"], data["tutors"])
    assert blocked.status_code == 409 and blocked.json()["detail"]["code"] == "template_tool_disabled_for_class"
    assert db.query(models.ClassPath).count() == 0
    # Classes or groups the teacher cannot see are refused without leaking them.
    assert apply(client, template, data["foreign"]).status_code == 403
    for steps in ([{"step_type": "guided_results_chat", "results_position": 1}],
                  [{"step_type": "tool", "tool_key": "notebook"}],
                  [{"step_type": "questionnaire_administration", "instrument_code": "SAVICKAS"}]):
        assert client.post("/teacher/path-templates", json={"title": "x", "steps": steps}).status_code == 422


def test_deleting_a_template_keeps_applied_paths(api):
    client, db, _identity, data = api
    template = create(client, data["goal"])
    path = apply(client, template, data["group"]).json()[0]
    assert client.delete(f"/teacher/path-templates/{template['id']}").status_code == 200
    current = client.get(f"/teacher/paths/{path['id']}").json()
    assert current["template_id"] is None and len(current["steps"]) == 5
    assert all(s["template_step_id"] is None for s in current["steps"])
    assert client.post(f"/teacher/paths/{path['id']}/publish").status_code == 200


def edit(client, template, steps, **extra):
    current = client.get(f"/teacher/path-templates/{template['id']}").json()
    response = client.put(f"/teacher/path-templates/{template['id']}", json={
        "revision": current["revision"], "title": current["title"], "steps": steps, **extra})
    assert response.status_code == 200, response.text
    return response.json()


def kept(template, index, **changes):
    """A template step sent back by id, so applied paths keep their link to it."""
    step = {key: value for key, value in template["steps"][index].items()
            if key not in {"position", "goal_title"} and value is not None}
    return {**step, **changes}


def update(client, path_id, template):
    path = client.get(f"/teacher/paths/{path_id}").json()
    return client.post(f"/teacher/paths/{path_id}/template-update",
                       json={"revision": path["revision"], "template_revision": template["revision"]})


def test_update_from_template_rewrites_an_untouched_draft(api):
    client, db, _identity, data = api
    template = create(client, data["goal"])
    path = apply(client, template, data["group"]).json()[0]
    assert client.get(f"/teacher/paths/{path['id']}/template-update").json()["changes"] == []
    template = edit(client, template, [
        kept(template, 0, title="Warm up again"),
        kept(template, 1),
        {"step_type": "tool", "tool_key": "timeline", "title": "New"},
        kept(template, 2, results_position=2),
        kept(template, 4, topic_body="Share two things"),
    ])
    preview = client.get(f"/teacher/paths/{path['id']}/template-update").json()
    assert preview["template_revision"] == template["revision"] and preview["path_template_revision"] == 1
    assert sorted((c["change"], c["step_type"], c["status"]) for c in preview["changes"]) == [
        ("added", "tool", "apply"), ("changed", "forum", "apply"), ("changed", "tool", "apply"),
        ("removed", "assignment", "apply")]
    before = counts(db)
    response = update(client, path["id"], template)
    assert response.status_code == 200, response.text
    assert response.json()["skipped"] == []
    updated = response.json()["path"]
    assert updated["template_revision"] == template["revision"] and updated["status"] == "draft"
    assert [(s["step_type"], s["tool_key"], s["title"]) for s in updated["steps"]] == [
        ("tool", "tavolo", "Warm up again"), ("pending", None, None), ("tool", "timeline", "New"),
        ("pending", None, None), ("pending", None, None)]
    assert updated["steps"][3]["pending_config"] == {"kind": "guided_results_chat",
                                                     "results_step_id": updated["steps"][1]["id"]}
    assert updated["steps"][4]["pending_config"]["body"] == "Share two things"
    assert counts(db) == before
    assert client.get(f"/teacher/paths/{path['id']}/template-update").json()["changes"] == []
    assert client.post(f"/teacher/paths/{path['id']}/publish").status_code == 200
    assert db.get(models.ForumTopic, client.get(f"/teacher/paths/{path['id']}").json()["steps"][4]["topic_id"]).body == "Share two things"


def test_update_from_template_spares_started_steps_and_created_objects(api):
    client, db, _identity, data = api
    template = create(client, data["goal"])
    path = apply(client, template, data["group"]).json()[0]
    published = client.post(f"/teacher/paths/{path['id']}/publish").json()
    # Alice has begun the first step.
    db.add(models.ClassPathProgress(step_id=published["steps"][0]["id"], username="alice", state="done",
                                    source="student", actor_username="alice"))
    db.commit()
    template = edit(client, template, [
        kept(template, 0, title="Renamed tool"), kept(template, 1), kept(template, 2), kept(template, 3),
        kept(template, 4, topic_title="New question"),
        {"step_type": "tool", "tool_key": "timeline"},
        {"step_type": "forum", "topic_title": "Closing", "topic_body": "One last word"},
    ])
    statuses = {(c["change"], c["step_type"]): c["status"]
                for c in client.get(f"/teacher/paths/{path['id']}/template-update").json()["changes"]}
    assert statuses == {("changed", "tool"): "started", ("changed", "forum"): "created",
                        ("added", "tool"): "apply", ("added", "forum"): "apply"}
    topics = db.query(models.ForumTopic).count()
    response = update(client, path["id"], template)
    assert response.status_code == 200, response.text
    assert sorted(c["status"] for c in response.json()["skipped"]) == ["created", "started"]
    steps = response.json()["path"]["steps"]
    assert steps[0]["title"] == "Warm up" and steps[4]["topic_id"] == published["steps"][4]["topic_id"]
    # New steps of a published path go live at once, their class objects included.
    assert [s["step_type"] for s in steps[5:]] == ["tool", "forum"]
    assert all(s["active_from"] for s in steps) and db.query(models.ForumTopic).count() == topics + 1
    # Skipped differences stay visible until the teacher handles them.
    assert len(client.get(f"/teacher/paths/{path['id']}/template-update").json()["changes"]) == 2


def test_blocked_or_stale_update_changes_nothing(api):
    client, db, _identity, data = api
    template = client.post("/teacher/path-templates", json={
        "title": "Tools", "steps": [{"step_type": "tool", "tool_key": "tavolo"}]}).json()
    path = apply(client, template, data["tutors"]).json()[0]
    assert client.post(f"/teacher/paths/{path['id']}/publish").status_code == 200
    stale = template
    template = edit(client, template, [kept(template, 0), {
        "step_type": "questionnaire_administration", "instrument_code": "QSA", "locale": "it"}])
    assert update(client, path["id"], stale).status_code == 409
    # The group has no institute: the questionnaire cannot be created, so nothing changes.
    before = counts(db)
    blocked = update(client, path["id"], template)
    assert blocked.status_code == 409 and blocked.json()["detail"]["code"] == "path_publication_blocked"
    current = client.get(f"/teacher/paths/{path['id']}").json()
    assert len(current["steps"]) == 1 and current["template_revision"] == 1 and counts(db) == before
    plain = client.post(f"/teacher/groups/{data['group'].id}/paths", json={"title": "Plain"}).json()
    assert client.get(f"/teacher/paths/{plain['id']}/template-update").status_code == 404
