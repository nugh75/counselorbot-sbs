"""Forum discussions linked to a class path step or an assignment (F5, #106)."""
from datetime import datetime, timezone

import pytest

from backend import models
from backend.tests.test_forum import forum_api, open_topic  # noqa: F401 - shared fixture

NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)


def make_step(db, group_id, *, status="published", title="Step title", removed=False, path_title="Start of year"):
    path = models.ClassPath(group_id=group_id, title=path_title, mode="recommended", status=status,
                            published_at=NOW if status != "draft" else None, created_by="owner")
    db.add(path)
    db.flush()
    step = models.ClassPathStep(path_id=path.id, position=1, tool_key="QSA", title=title,
                                removed_at=NOW if removed else None)
    db.add(step)
    db.commit()
    return path, step


def make_assignment(db, group_id, *, recipient=None, revoked=False, title="Read chapter 2", request="req-0001"):
    row = models.TeacherAssignment(
        author_username="owner", author_name="Teacher", group_id=group_id, group_name="Synthetic class",
        recipient_username=recipient, source_kind="reading", source_id=1,
        snapshot={"title": title, "description": "", "details": ""}, request_id=request, request_hash="h",
        revoked_at=NOW if revoked else None)
    db.add(row)
    db.commit()
    return row


def other_class(db, code="GR-C22OTHER"):
    group = models.StudentGroup(code=code, name="Other class", owner_username="owner")
    db.add(group)
    db.commit()
    return group


def open_linked(client, group_id, kind, target_id):
    return client.post(f"/groups/{group_id}/forum/topics",
                       json={"title": "Linked", "body": "Text", "link_kind": kind, "link_id": target_id})


def as_student(identity, username="student"):
    identity.update(username=username, name=username, groups=["studenti"], is_admin=False, is_researcher=False)


def test_topic_linked_to_published_path_step_shows_the_link(forum_api):
    client, db, group_id, _ = forum_api
    path, step = make_step(db, group_id)
    response = open_linked(client, group_id, "path_step", step.id)
    assert response.status_code == 201, response.text
    expected = {"kind": "path_step", "id": step.id, "available": True, "title": "Step title",
                "tool_key": "QSA", "path_title": "Start of year"}
    assert response.json()["link"] == expected
    topic_id = response.json()["id"]
    assert client.get(f"/forum/topics/{topic_id}").json()["topic"]["link"] == expected
    assert client.get(f"/groups/{group_id}/forum/topics").json()["topics"][0]["link"] == expected


def test_topic_linked_to_class_assignment_shows_the_link(forum_api):
    client, db, group_id, _ = forum_api
    assignment = make_assignment(db, group_id)
    response = open_linked(client, group_id, "assignment", assignment.id)
    assert response.status_code == 201, response.text
    assert response.json()["link"] == {"kind": "assignment", "id": assignment.id, "available": True,
                                       "title": "Read chapter 2", "tool_key": None, "path_title": None}


def test_topic_without_link_serializes_null(forum_api):
    client, _, group_id, _ = forum_api
    assert open_topic(client, group_id)["link"] is None


@pytest.mark.parametrize("case", [
    "other-class-step", "draft-path", "archived-path", "removed-step", "missing-step",
    "other-class-assignment", "revoked-assignment", "individual-assignment", "missing-assignment",
])
def test_link_target_must_be_current_and_in_the_same_class(forum_api, case):
    client, db, group_id, _ = forum_api
    other = other_class(db)
    if case.endswith("step") or case.endswith("path"):
        kind = "path_step"
        if case == "missing-step":
            target = 999999
        else:
            _, step = make_step(db, other.id if case == "other-class-step" else group_id,
                                status={"draft-path": "draft", "archived-path": "archived"}.get(case, "published"),
                                removed=case == "removed-step")
            target = step.id
    else:
        kind = "assignment"
        if case == "missing-assignment":
            target = 999999
        else:
            target = make_assignment(db, other.id if case == "other-class-assignment" else group_id,
                                     revoked=case == "revoked-assignment",
                                     recipient="student" if case == "individual-assignment" else None).id
    response = open_linked(client, group_id, kind, target)
    assert response.status_code == 422, response.text
    assert response.json()["detail"] == "forum_link_invalid"
    assert db.query(models.ForumTopic).count() == 0


@pytest.mark.parametrize("extra", [
    {"link_kind": "path_step"}, {"link_id": 1}, {"link_kind": "goal", "link_id": 1},
    {"link_kind": "assignment", "link_id": 0}, {"link_kind": "assignment", "link_id": "1"},
])
def test_link_fields_come_in_pairs_with_known_kinds(forum_api, extra):
    client, _, group_id, _ = forum_api
    response = client.post(f"/groups/{group_id}/forum/topics", json={"title": "T", "body": "B", **extra})
    assert response.status_code == 422


@pytest.mark.parametrize("change", ["archive-path", "remove-step", "revoke-assignment", "delete-path"])
def test_archived_or_revoked_targets_render_unavailable(forum_api, change):
    client, db, group_id, _ = forum_api
    if change == "revoke-assignment":
        target = make_assignment(db, group_id)
        topic = open_linked(client, group_id, "assignment", target.id).json()
        target.revoked_at = NOW
    else:
        path, target = make_step(db, group_id)
        topic = open_linked(client, group_id, "path_step", target.id).json()
        if change == "archive-path":
            path.status, path.archived_at = "archived", NOW
        elif change == "remove-step":
            target.removed_at = NOW
        else:
            db.delete(path)
    db.commit()
    as_student(forum_api[3])
    link = client.get(f"/forum/topics/{topic['id']}").json()["topic"]["link"]
    assert link["available"] is False
    assert link["kind"] == topic["link"]["kind"] and link["id"] == topic["link"]["id"]
    if change == "delete-path":
        assert link["title"] is None
    else:
        assert link["title"] == topic["link"]["title"]


def test_hidden_topic_link_is_visible_to_moderators_only(forum_api):
    client, db, group_id, identity = forum_api
    _, step = make_step(db, group_id)
    topic = open_linked(client, group_id, "path_step", step.id).json()
    assert client.post(f"/teacher/forum/topics/{topic['id']}/hide", json={"reason": "Off topic"}).status_code == 200
    assert client.get(f"/forum/topics/{topic['id']}").json()["topic"]["link"]["id"] == step.id
    as_student(identity)
    assert client.get(f"/forum/topics/{topic['id']}").json()["topic"]["link"] is None
    assert client.get("/user/forum/links").json() == {"links": []}


def test_link_targets_list_only_valid_targets_for_staff(forum_api):
    client, db, group_id, identity = forum_api
    other = other_class(db)
    _, step = make_step(db, group_id, title=None)
    make_step(db, group_id, status="draft")
    make_step(db, group_id, status="archived")
    make_step(db, group_id, removed=True)
    make_step(db, other.id)
    assignment = make_assignment(db, group_id)
    make_assignment(db, group_id, revoked=True, request="req-0002")
    make_assignment(db, group_id, recipient="student", request="req-0003")
    make_assignment(db, other.id, request="req-0004")
    response = client.get(f"/groups/{group_id}/forum/link-targets")
    assert response.status_code == 200, response.text
    assert response.json() == {"targets": [
        {"kind": "path_step", "id": step.id, "title": None, "tool_key": "QSA", "path_title": "Start of year"},
        {"kind": "assignment", "id": assignment.id, "title": "Read chapter 2", "tool_key": None, "path_title": None},
    ]}
    as_student(identity)
    assert client.get(f"/groups/{group_id}/forum/link-targets").status_code == 403
    as_student(identity, "non-member")
    assert client.get(f"/groups/{group_id}/forum/link-targets").status_code == 403


def test_user_links_are_visible_only_to_current_class_members(forum_api):
    client, db, group_id, identity = forum_api
    _, step = make_step(db, group_id)
    assignment = make_assignment(db, group_id)
    step_topic = open_linked(client, group_id, "path_step", step.id).json()
    assignment_topic = open_linked(client, group_id, "assignment", assignment.id).json()
    open_topic(client, group_id)
    other = other_class(db)
    _, foreign_step = make_step(db, other.id)
    open_linked(client, other.id, "path_step", foreign_step.id)

    as_student(identity)
    assert client.get("/user/forum/links").json() == {"links": [
        {"kind": "assignment", "id": assignment.id, "topic_id": assignment_topic["id"], "group_id": group_id},
        {"kind": "path_step", "id": step.id, "topic_id": step_topic["id"], "group_id": group_id},
    ]}
    as_student(identity, "non-member")
    assert client.get("/user/forum/links").json() == {"links": []}
    as_student(identity)
    membership = client.get("/user/groups").json()[0]["membership_id"]
    assert client.delete(f"/user/groups/{membership}").status_code == 200
    assert client.get("/user/forum/links").json() == {"links": []}


@pytest.mark.parametrize("actor,allowed", [("owner", True), ("co-teacher", True), ("admin", True),
                                          ("student", True), ("other-teacher", False), ("non-member", False)])
def test_link_index_and_linked_topic_share_the_class_access_boundary(forum_api, actor, allowed):
    client, db, group_id, identity = forum_api
    _, step = make_step(db, group_id)
    topic = open_linked(client, group_id, "path_step", step.id).json()
    identity.update(username=actor, groups=["docenti"] if actor in {"owner", "co-teacher", "other-teacher"} else ["studenti"],
                    is_admin=actor == "admin")
    links = client.get("/user/forum/links")
    assert links.status_code == 200
    assert links.json() == {"links": [{"kind": "path_step", "id": step.id, "topic_id": topic["id"], "group_id": group_id}] if allowed else []}
    assert client.get(f"/forum/topics/{topic['id']}").status_code == (200 if allowed else 403)
    if actor not in {"owner", "co-teacher", "admin"}:
        assert open_linked(client, group_id, "path_step", step.id).status_code == 403
