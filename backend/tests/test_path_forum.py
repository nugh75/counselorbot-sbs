"""Exact-discussion forum steps in class paths (TF7, #154).

Synthetic PostgreSQL only, in a rolled-back schema. The step names one
published discussion of its own class; it is done once the student's own reply
there is published, after the step's activation, and neither hidden nor
deleted. Path code reads forum identifiers, status and timestamps only.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event

from backend import auth, database, models
from backend.routes import class_paths
from backend.routes.forum import router as forum_router
from backend.tests.artifact_database import artifact_session

TEACHER = dict(username="teacher", name="Teacher One", authenticated=True, is_admin=False, groups=["docenti"])
MARKER = "FORUM_PRIVATE_TF7_"


@pytest.fixture
def api():
    with artifact_session() as db:
        group = models.StudentGroup(name="Synthetic class", code="SYN-154", owner_username="teacher")
        other = models.StudentGroup(name="Other class", code="SYN-154-OTHER", owner_username="teacher")
        db.add_all([group, other])
        db.flush()
        db.add_all([
            models.GroupMembership(group_id=group.id, username="alice"),
            models.GroupMembership(group_id=group.id, username="bob"),
            models.GroupMembership(group_id=other.id, username="eve"),
        ])
        db.commit()
        identity = dict(TEACHER)
        app = FastAPI()
        for router in (class_paths.router, forum_router):
            app.include_router(router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_identity] = lambda: dict(identity)
        with TestClient(app) as client:
            yield client, db, identity, group, other


def as_user(identity, username, groups=None):
    identity.clear()
    identity.update(TEACHER if username == "teacher" else
                    dict(username=username, name=username, authenticated=True, is_admin=False, groups=groups or []))


def topic(client, group, title="Discussion"):
    response = client.post(f"/groups/{group.id}/forum/topics",
                           json={"title": f"{MARKER}{title}", "body": f"{MARKER}topic body"})
    assert response.status_code == 201, response.text
    return response.json()


def reply(client, topic_row, body="reply"):
    response = client.post(f"/forum/topics/{topic_row['id']}/posts", json={"body": f"{MARKER}{body}"})
    assert response.status_code == 201, response.text
    return response.json()


def forum_step(topic_row, step_id=None):
    row = {"step_type": "forum", "topic_id": topic_row["id"]}
    return {**row, "id": step_id} if step_id else row


def save(client, path, steps, mode=None):
    return client.put(f"/teacher/paths/{path['id']}", json={
        "revision": path["revision"], "title": path["title"], "mode": mode or path["mode"], "steps": steps})


def new_path(client, group, steps, *, mode="recommended", publish=True):
    path = client.post(f"/teacher/groups/{group.id}/paths", json={"title": "Forum", "mode": mode}).json()
    response = save(client, path, steps, mode=mode)
    assert response.status_code == 200, response.text
    path = response.json()
    if publish:
        response = client.post(f"/teacher/paths/{path['id']}/publish")
        assert response.status_code == 200, response.text
        path = response.json()
    return path


def student_step(client, index=0):
    return client.get("/user/paths").json()[0]["steps"][index]


def teacher_cell(client, path, username="alice", index=0):
    progress = client.get(f"/teacher/paths/{path['id']}/progress").json()
    return next(row for row in progress["students"] if row["username"] == username)["cells"][index]


def moderate(client, kind, target_id, action, reason=None):
    payload = {"reason": reason} if reason else None
    response = client.post(f"/teacher/forum/{kind}/{target_id}/{action}", json=payload)
    assert response.status_code == 200, response.text


def settings(db, group, **values):
    row = db.get(models.ClassSettings, group.id) or models.ClassSettings(group_id=group.id, updated_by="teacher")
    for key, value in values.items():
        setattr(row, key, value)
    db.add(row)
    db.commit()


def test_published_reply_in_the_exact_discussion_completes_the_step(api):
    client, db, identity, group, _other = api
    discussion = topic(client, group)
    path = new_path(client, group, [forum_step(discussion)])
    step = path["steps"][0]
    assert step["step_type"] == "forum" and step["topic_id"] == discussion["id"]
    assert step["tool_key"] is None and step["auto_detect"] is True and step["can_self_mark"] is False
    assert step["target_summary"] == {"id": discussion["id"], "group_id": group.id, "locked": False}
    href = f"/profilo/classi/{group.id}/forum?topic={discussion['id']}"
    as_user(identity, "alice")
    row = student_step(client)
    assert row["state"] == "not_done" and row["start_href"] == href
    assert row["forum_state"] == {"pending": False, "hidden": False, "locked": False, "muted": False}
    launch = client.post(f"/user/paths/{path['id']}/steps/{step['id']}/launch")
    assert launch.status_code == 200, launch.text
    assert launch.json() == {"step_type": "forum", "path_id": path["id"], "step_id": step["id"],
                             "topic_id": discussion["id"], "group_id": group.id, "start_href": href}
    # Opening or reading the discussion is not evidence.
    assert client.post(f"/forum/topics/{discussion['id']}/read").status_code == 200
    assert student_step(client)["state"] == "not_done"
    reply(client, discussion)
    row = student_step(client)
    assert row["state"] == "done" and row["source"] == "automatic"
    assert row["completion_kind"] == "forum_reply" and row["completion_at"]
    paths = client.get("/user/paths").text
    as_user(identity, "teacher")
    progress = client.get(f"/teacher/paths/{path['id']}/progress").text
    builder = client.get(f"/teacher/paths/{path['id']}").text
    # Path responses carry identifiers and completion metadata, never forum text.
    assert MARKER not in paths + progress + builder
    assert teacher_cell(client, path)["completion_kind"] == "forum_reply"
    assert teacher_cell(client, path, "bob")["state"] == "not_done"


def test_targets_must_be_published_discussions_of_the_same_class(api):
    client, db, identity, group, other = api
    foreign = topic(client, other, "foreign")
    hidden = topic(client, group, "hidden")
    moderate(client, "topics", hidden["id"], "hide", "Synthetic reason")
    pending = models.ForumTopic(group_id=group.id, title="Pending", body="Pending", author_username="alice",
                                author_display_name="alice", status="pending")
    db.add(pending)
    db.commit()
    path = client.post(f"/teacher/groups/{group.id}/paths", json={"title": "Rejected"}).json()
    expected = {
        foreign["id"]: (422, "forum_topic_class_mismatch"),
        999999: (422, "forum_topic_class_mismatch"),
        hidden["id"]: (409, "forum_topic_unavailable"),
        pending.id: (409, "forum_topic_unavailable"),
    }
    for topic_id, (status, detail) in expected.items():
        response = save(client, path, [{"step_type": "forum", "topic_id": topic_id}])
        assert (response.status_code, response.json()["detail"]) == (status, detail)
    good = topic(client, group, "good")
    response = save(client, path, [forum_step(good), forum_step(good)])
    assert (response.status_code, response.json()["detail"]) == (422, "duplicate_forum_step")
    settings(db, group, disabled_tool_keys=["forum"])
    response = save(client, path, [forum_step(good)])
    assert (response.status_code, response.json()["detail"]) == (409, "forum_disabled_for_class")
    response = save(client, path, [{"step_type": "forum", "topic_id": good["id"], "tool_key": "forum"}])
    assert response.status_code == 422
    # A rejected save writes nothing.
    current = client.get(f"/teacher/paths/{path['id']}").json()
    assert current["revision"] == path["revision"] and current["steps"] == []


def test_only_the_students_own_reply_in_that_thread_after_activation_counts(api):
    client, db, identity, group, _other = api
    discussion = topic(client, group)
    elsewhere = topic(client, group, "elsewhere")
    path = new_path(client, group, [forum_step(discussion)], publish=False)
    as_user(identity, "alice")
    reply(client, discussion, "before activation")
    reply(client, elsewhere, "another thread")
    as_user(identity, "bob")
    reply(client, discussion, "someone else")
    as_user(identity, "teacher")
    reply(client, discussion, "teacher")
    response = client.post(f"/teacher/paths/{path['id']}/publish")
    assert response.status_code == 200, response.text
    as_user(identity, "alice")
    assert student_step(client)["state"] == "not_done"
    reply(client, discussion, "after activation")
    assert student_step(client)["state"] == "done"
    as_user(identity, "teacher")
    assert teacher_cell(client, path, "bob")["state"] == "not_done"


def test_pending_approval_hide_restore_and_delete(api):
    client, db, identity, group, _other = api
    settings(db, group, forum_premoderation=True)
    discussion = topic(client, group)
    path = new_path(client, group, [forum_step(discussion)])
    as_user(identity, "alice")
    post = reply(client, discussion)
    assert post["status"] == "pending"
    row = student_step(client)
    assert row["state"] == "not_done" and row["forum_state"]["pending"] is True
    as_user(identity, "teacher")
    moderate(client, "posts", post["id"], "approve")
    as_user(identity, "alice")
    row = student_step(client)
    assert row["state"] == "done" and row["forum_state"]["pending"] is False
    as_user(identity, "teacher")
    moderate(client, "posts", post["id"], "hide", "Synthetic reason")
    as_user(identity, "alice")
    row = student_step(client)
    assert row["state"] == "not_done" and row["forum_state"]["hidden"] is True
    as_user(identity, "teacher")
    moderate(client, "posts", post["id"], "restore")
    as_user(identity, "alice")
    assert student_step(client)["state"] == "done"
    assert client.delete(f"/forum/posts/{post['id']}").status_code == 200
    row = student_step(client)
    assert row["state"] == "not_done" and row["forum_state"]["hidden"] is False
    # An author edit under premoderation returns the reply to pending.
    second = reply(client, discussion, "second")
    as_user(identity, "teacher")
    moderate(client, "posts", second["id"], "approve")
    as_user(identity, "alice")
    assert student_step(client)["state"] == "done"
    assert client.patch(f"/forum/posts/{second['id']}", json={"body": f"{MARKER}edited"}).status_code == 200
    assert student_step(client)["state"] == "not_done"
    as_user(identity, "teacher")
    moderate(client, "posts", second["id"], "reject", "Synthetic reason")
    as_user(identity, "alice")
    assert student_step(client)["forum_state"]["hidden"] is True


def test_a_second_qualifying_reply_keeps_the_step_done(api):
    client, db, identity, group, _other = api
    discussion = topic(client, group)
    path = new_path(client, group, [forum_step(discussion)])
    as_user(identity, "alice")
    first = reply(client, discussion, "first")
    second = reply(client, discussion, "second")
    first_at = student_step(client)["completion_at"]
    as_user(identity, "teacher")
    moderate(client, "posts", first["id"], "hide", "Synthetic reason")
    as_user(identity, "alice")
    row = student_step(client)
    assert row["state"] == "done" and row["completion_at"] != first_at
    assert client.delete(f"/forum/posts/{second['id']}").status_code == 200
    assert student_step(client)["state"] == "not_done"


def test_locked_discussion_keeps_evidence_and_muted_student_is_told(api):
    client, db, identity, group, _other = api
    discussion = topic(client, group)
    path = new_path(client, group, [forum_step(discussion)])
    as_user(identity, "alice")
    reply(client, discussion)
    as_user(identity, "teacher")
    response = client.post(f"/teacher/forum/topics/{discussion['id']}/lock")
    assert response.status_code == 200, response.text
    as_user(identity, "alice")
    row = student_step(client)
    assert row["state"] == "done" and row["forum_state"]["locked"] is True
    as_user(identity, "bob")
    row = student_step(client)
    assert row["state"] == "not_done" and row["forum_state"]["locked"] is True
    assert client.post(f"/forum/topics/{discussion['id']}/posts", json={"body": "late"}).status_code == 403
    as_user(identity, "teacher")
    assert client.get(f"/teacher/paths/{path['id']}").json()["steps"][0]["target_summary"]["locked"] is True
    assert client.post(f"/teacher/forum/topics/{discussion['id']}/unlock").status_code == 200
    response = client.post(f"/teacher/groups/{group.id}/forum/mutes",
                           json={"username": "bob", "reason": "Synthetic reason"})
    assert response.status_code == 201, response.text
    as_user(identity, "bob")
    row = student_step(client)
    assert row["forum_state"] == {"pending": False, "hidden": False, "locked": False, "muted": True}
    assert client.post(f"/forum/topics/{discussion['id']}/posts", json={"body": "muted"}).status_code == 403
    as_user(identity, "teacher")
    mute_id = response.json()["id"]
    assert client.delete(f"/teacher/groups/{group.id}/forum/mutes/{mute_id}").status_code == 200
    as_user(identity, "bob")
    assert student_step(client)["forum_state"]["muted"] is False
    reply(client, discussion)
    assert student_step(client)["state"] == "done"


def test_hidden_discussion_makes_the_step_unavailable_until_restored(api):
    client, db, identity, group, _other = api
    discussion = topic(client, group)
    path = new_path(client, group, [forum_step(discussion), {"step_type": "tool", "tool_key": "timeline"}])
    step_id = path["steps"][0]["id"]
    as_user(identity, "alice")
    reply(client, discussion)
    as_user(identity, "teacher")
    moderate(client, "topics", discussion["id"], "hide", "Synthetic reason")
    step = client.get(f"/teacher/paths/{path['id']}").json()["steps"][0]
    assert step["availability_reason"] == "forum_topic_unavailable" and step["target_summary"] is None
    assert teacher_cell(client, path)["state"] == "unavailable"
    response = client.put(f"/teacher/paths/{path['id']}/steps/{step_id}/progress/alice", json={"state": "done"})
    assert response.status_code == 422
    assert client.post(f"/teacher/paths/{path['id']}/publish").status_code == 409
    as_user(identity, "alice")
    row = client.get("/user/paths").json()[0]
    assert row["steps"][0]["state"] == "unavailable" and row["total"] == 1
    assert row["steps"][0]["start_href"] is None and row["steps"][0]["forum_state"] is None
    assert client.post(f"/user/paths/{path['id']}/steps/{step_id}/launch").status_code == 409
    as_user(identity, "teacher")
    moderate(client, "topics", discussion["id"], "restore")
    assert teacher_cell(client, path)["state"] == "done"


def test_class_archive_and_restore(api):
    client, db, identity, group, _other = api
    discussion = topic(client, group)
    path = new_path(client, group, [forum_step(discussion)])
    as_user(identity, "alice")
    reply(client, discussion)
    group.is_active = False
    db.commit()
    assert client.get("/user/paths").json() == []
    assert client.post(f"/forum/topics/{discussion['id']}/posts", json={"body": "archived"}).status_code == 403
    as_user(identity, "teacher")
    step = client.get(f"/teacher/paths/{path['id']}").json()["steps"][0]
    assert step["availability_reason"] == "forum_class_inactive"
    assert teacher_cell(client, path)["state"] == "unavailable"
    group.is_active = True
    db.commit()
    assert teacher_cell(client, path)["state"] == "done"


def test_class_forum_setting_binds_whatever_the_tool_view(api):
    client, db, identity, group, other = api
    discussion = topic(client, group)
    path = new_path(client, group, [forum_step(discussion)])
    step_id = path["steps"][0]["id"]
    db.add(models.GroupMembership(group_id=other.id, username="alice"))
    settings(db, other, disabled_tool_keys=["forum"])
    db.add(models.AccountPreferences(username="alice", class_view=str(other.id)))
    db.commit()
    as_user(identity, "alice")
    # Viewing another class whose forum is off does not close this class's forum step.
    assert student_step(client)["state"] == "not_done"
    assert client.post(f"/user/paths/{path['id']}/steps/{step_id}/launch").status_code == 200
    settings(db, group, disabled_tool_keys=["forum"])
    db.get(models.AccountPreferences, "alice").class_view = "all"
    db.commit()
    # The full tool view never reopens a forum its own class switched off.
    row = student_step(client)
    assert row["state"] == "unavailable" and row["availability_reason"] == "forum_disabled_for_class"
    assert client.post(f"/user/paths/{path['id']}/steps/{step_id}/launch").status_code == 409


def test_unauthorized_contexts(api):
    client, db, identity, group, other = api
    discussion = topic(client, group)
    path = new_path(client, group, [forum_step(discussion)])
    step_id = path["steps"][0]["id"]
    as_user(identity, "eve")
    assert client.post(f"/user/paths/{path['id']}/steps/{step_id}/launch").status_code == 403
    assert client.post(f"/forum/topics/{discussion['id']}/posts", json={"body": "intruder"}).status_code == 403
    as_user(identity, "stranger", ["docenti"])
    response = client.put(f"/teacher/paths/{path['id']}", json={
        "revision": path["revision"], "title": "x", "steps": [forum_step(discussion)]})
    assert response.status_code == 403
    # A forum step never accepts a student self-mark.
    as_user(identity, "alice")
    assert client.post(f"/user/paths/{path['id']}/steps/{step_id}/done").status_code == 422


def test_strict_order_target_immutability_and_membership(api):
    client, db, identity, group, _other = api
    discussion = topic(client, group)
    second = topic(client, group, "second")
    path = new_path(client, group, [{"step_type": "tool", "tool_key": "timeline"}, forum_step(discussion)],
                    mode="strict")
    tool, step = path["steps"]
    as_user(identity, "alice")
    reply(client, discussion)
    assert [row["state"] for row in client.get("/user/paths").json()[0]["steps"]] == ["not_done", "locked"]
    assert client.post(f"/user/paths/{path['id']}/steps/{step['id']}/launch").status_code == 409
    assert client.post(f"/user/paths/{path['id']}/steps/{tool['id']}/done").status_code == 200
    assert [row["state"] for row in client.get("/user/paths").json()[0]["steps"]] == ["done", "done"]
    as_user(identity, "teacher")
    response = save(client, path, [{"step_type": "tool", "tool_key": "timeline", "id": tool["id"]},
                                   forum_step(second, step["id"])])
    assert (response.status_code, response.json()["detail"]) == (409, "activated_step_target_immutable")
    db.query(models.GroupMembership).filter_by(group_id=group.id, username="alice").delete()
    db.commit()
    from backend.path_step_types import completion_evidence
    row = db.get(models.ClassPathStep, step["id"])
    assert completion_evidence(db, db.get(models.ClassPath, path["id"]), row, "alice") is None


def test_late_added_step_uses_its_own_activation(api):
    client, db, identity, group, _other = api
    discussion = topic(client, group)
    path = new_path(client, group, [{"step_type": "tool", "tool_key": "timeline"}])
    as_user(identity, "alice")
    post = reply(client, discussion)
    row = db.get(models.ForumPost, post["id"])
    row.created_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    db.commit()
    as_user(identity, "teacher")
    tool = path["steps"][0]
    response = save(client, path, [{"step_type": "tool", "tool_key": "timeline", "id": tool["id"]},
                                   forum_step(discussion)])
    assert response.status_code == 200, response.text
    as_user(identity, "alice")
    assert student_step(client, 1)["state"] == "not_done"
    reply(client, discussion, "later")
    assert student_step(client, 1)["state"] == "done"


def test_path_reads_never_select_forum_text_columns(api):
    client, db, identity, group, _other = api
    discussion = topic(client, group)
    path = new_path(client, group, [forum_step(discussion)])
    as_user(identity, "alice")
    reply(client, discussion)
    statements = []
    connection = db.get_bind()

    def record(_conn, _cursor, statement, *_args):
        statements.append(statement.lower())

    event.listen(connection, "before_cursor_execute", record)
    try:
        assert student_step(client)["state"] == "done"
        assert client.post(f"/user/paths/{path['id']}/steps/{path['steps'][0]['id']}/launch").status_code == 200
        as_user(identity, "teacher")
        client.get(f"/teacher/paths/{path['id']}/progress")
        client.get(f"/teacher/paths/{path['id']}")
    finally:
        event.remove(connection, "before_cursor_execute", record)
    forum_reads = [sql for sql in statements if "forum_" in sql]
    assert forum_reads, "the resolver reads forum metadata"
    for column in ("body", "title", "hidden_reason", "author_display_name", "reason"):
        assert not any(f".{column}" in sql for sql in forum_reads), column
    assert not any("forum_reads" in sql or "forum_moderation_log" in sql for sql in forum_reads)
