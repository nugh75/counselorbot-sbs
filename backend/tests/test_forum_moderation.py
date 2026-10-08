"""Forum moderation (F2, #103): hide/restore, lock, pin, author edit/delete, append-only log."""
import pytest

from backend import models
from backend.routes import forum
from backend.tests.test_forum import forum_api, open_topic  # noqa: F401 (shared fixture)

ROLES = {
    "owner": {"groups": ["docenti"]},
    "co-teacher": {"groups": ["docenti"]},
    "admin": {"groups": [], "is_admin": True},
    "student": {"groups": ["studenti"]},
    "non-member": {"groups": ["studenti"]},
    "other-teacher": {"groups": ["docenti"]},
}


def act_as(identity, actor):
    role = ROLES[actor]
    identity.update(username=actor, name=f"{actor} name", groups=role["groups"],
                    is_admin=role.get("is_admin", False), is_researcher=False)


def student_reply(client, identity, topic_id, body="Student reply"):
    previous = dict(identity)
    act_as(identity, "student")
    response = client.post(f"/forum/topics/{topic_id}/posts", json={"body": body})
    assert response.status_code == 201, response.text
    identity.clear()
    identity.update(previous)
    return response.json()


def log_rows(db):
    return db.query(models.ForumModerationLog).order_by(models.ForumModerationLog.id).all()


@pytest.mark.parametrize("actor,allowed", [
    ("owner", True), ("co-teacher", True), ("admin", True),
    ("student", False), ("non-member", False), ("other-teacher", False),
])
def test_moderation_actions_by_role(forum_api, actor, allowed):
    client, db, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    post = student_reply(client, identity, topic["id"])
    act_as(identity, actor)
    calls = [
        ("post", f"/teacher/forum/topics/{topic['id']}/pin", None),
        ("post", f"/teacher/forum/topics/{topic['id']}/unpin", None),
        ("post", f"/teacher/forum/topics/{topic['id']}/lock", None),
        ("post", f"/teacher/forum/topics/{topic['id']}/unlock", None),
        ("post", f"/teacher/forum/posts/{post['id']}/hide", {"reason": "Off topic"}),
        ("post", f"/teacher/forum/posts/{post['id']}/restore", None),
        ("post", f"/teacher/forum/topics/{topic['id']}/hide", {"reason": "Wrong class"}),
        ("post", f"/teacher/forum/topics/{topic['id']}/restore", None),
    ]
    for _, path, payload in calls:
        response = client.post(path, json=payload) if payload else client.post(path)
        assert response.status_code == (200 if allowed else 403), (path, response.text)
    log = client.get(f"/teacher/groups/{group_id}/forum/log")
    assert log.status_code == (200 if allowed else 403)
    if allowed:
        assert [entry["action"] for entry in reversed(log.json()["entries"])] == [
            "pin", "unpin", "lock", "unlock", "hide", "restore", "hide", "restore"]
        assert log.json()["entries"][0]["actor_username"] == actor
    else:
        assert log_rows(db) == []


def test_hidden_post_is_a_placeholder_for_students_and_visible_to_moderators(forum_api):
    client, _, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    post = student_reply(client, identity, topic["id"], "Rude reply")
    response = client.post(f"/teacher/forum/posts/{post['id']}/hide", json={"reason": "off topic"})
    assert response.status_code == 200
    assert response.json()["body"] == "Rude reply"
    assert response.json()["hidden_reason"] == "off topic"
    teacher_view = client.get(f"/forum/topics/{topic['id']}").json()
    assert teacher_view["can_moderate"] is True
    assert teacher_view["posts"][0] | {"body": "Rude reply", "hidden": True, "hidden_reason": "off topic"} == teacher_view["posts"][0]
    act_as(identity, "student")
    student_view = client.get(f"/forum/topics/{topic['id']}").json()
    assert student_view["can_moderate"] is False
    assert student_view["posts"][0]["body"] is None
    assert student_view["posts"][0]["hidden"] is True
    assert student_view["posts"][0]["hidden_reason"] is None
    act_as(identity, "owner")
    assert client.post(f"/teacher/forum/posts/{post['id']}/restore").status_code == 200
    act_as(identity, "student")
    restored = client.get(f"/forum/topics/{topic['id']}").json()["posts"][0]
    assert (restored["body"], restored["hidden"], restored["hidden_reason"]) == ("Rude reply", False, None)


def test_hidden_topic_hides_title_and_body_from_students_and_blocks_replies(forum_api):
    client, _, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    assert client.post(f"/teacher/forum/topics/{topic['id']}/hide", json={"reason": "Duplicate"}).status_code == 200
    moderator = client.get(f"/forum/topics/{topic['id']}").json()
    assert (moderator["topic"]["title"], moderator["topic"]["hidden_reason"]) == ("Read your QSA", "Duplicate")
    assert moderator["can_reply"] is False
    act_as(identity, "student")
    listing = client.get(f"/groups/{group_id}/forum/topics").json()["topics"][0]
    assert (listing["title"], listing["body"], listing["hidden_reason"]) == (None, None, None)
    detail = client.get(f"/forum/topics/{topic['id']}").json()
    assert detail["topic"]["title"] is None and detail["can_reply"] is False
    assert client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Reply"}).status_code == 403


def test_lock_blocks_replies_and_pin_orders_topics(forum_api):
    client, _, group_id, identity = forum_api
    first = open_topic(client, group_id)
    second = open_topic(client, group_id)
    assert client.post(f"/teacher/forum/topics/{first['id']}/pin").json()["pinned"] is True
    ids = [row["id"] for row in client.get(f"/groups/{group_id}/forum/topics").json()["topics"]]
    assert ids == [first["id"], second["id"]]
    assert client.post(f"/teacher/forum/topics/{second['id']}/lock").json()["locked"] is True
    act_as(identity, "student")
    assert client.get(f"/forum/topics/{second['id']}").json()["can_reply"] is False
    assert client.post(f"/forum/topics/{second['id']}/posts", json={"body": "Reply"}).status_code == 403
    act_as(identity, "owner")
    assert client.post(f"/teacher/forum/topics/{second['id']}/unlock").json()["locked"] is False
    act_as(identity, "student")
    assert client.post(f"/forum/topics/{second['id']}/posts", json={"body": "Reply"}).status_code == 201


@pytest.mark.parametrize("path,payload", [
    ("topics/{topic}/pin", None), ("topics/{topic}/unpin", None),
    ("topics/{topic}/lock", None), ("topics/{topic}/unlock", None),
    ("posts/{post}/hide", {"reason": "Off topic"}), ("posts/{post}/restore", None),
])
def test_noop_transitions_conflict_without_logging(forum_api, path, payload):
    client, db, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    post = student_reply(client, identity, topic["id"])
    url = "/teacher/forum/" + path.format(topic=topic["id"], post=post["id"])
    # Undo actions start in their resulting state; the others reach it once first.
    if path.rsplit("/", 1)[1] not in {"unpin", "unlock", "restore"}:
        assert client.post(url, json=payload).status_code == 200
    before = len(log_rows(db))
    assert client.post(url, json=payload).status_code == 409
    assert len(log_rows(db)) == before


@pytest.mark.parametrize("payload", [None, {}, {"reason": " "}, {"reason": "R" * 501},
                                     {"reason": "Bad\x00reason"}, {"reason": "Fine", "body": "Extra"}])
def test_hide_requires_a_clean_reason(forum_api, payload):
    client, db, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    response = client.post(f"/teacher/forum/topics/{topic['id']}/hide", json=payload)
    assert response.status_code == 422
    assert log_rows(db) == []


def test_unknown_target_kind_and_missing_targets_are_rejected(forum_api):
    client, _, group_id, _ = forum_api
    topic = open_topic(client, group_id)
    assert client.post(f"/teacher/forum/groups/{topic['id']}/hide", json={"reason": "x"}).status_code in {404, 422}
    assert client.post("/teacher/forum/topics/999999/lock").status_code == 403
    assert client.post("/teacher/forum/posts/999999/hide", json={"reason": "x"}).status_code == 403
    # Post-only actions do not exist for posts.
    assert client.post(f"/teacher/forum/posts/{topic['id']}/lock").status_code in {404, 405}


def test_inactive_class_allows_log_view_only(forum_api):
    client, db, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    assert client.post(f"/teacher/forum/topics/{topic['id']}/pin").status_code == 200
    db.get(models.StudentGroup, group_id).is_active = False
    db.commit()
    for actor in ["owner", "co-teacher", "admin"]:
        act_as(identity, actor)
        assert client.post(f"/teacher/forum/topics/{topic['id']}/lock").status_code == 403
        assert client.post(f"/teacher/forum/topics/{topic['id']}/hide", json={"reason": "x"}).status_code == 403
        assert client.get(f"/teacher/groups/{group_id}/forum/log").status_code == 200
    act_as(identity, "student")
    assert client.get(f"/teacher/groups/{group_id}/forum/log").status_code == 403
    assert len(log_rows(db)) == 1


def test_log_is_append_only_and_never_stores_message_bodies(forum_api):
    client, db, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    post = student_reply(client, identity, topic["id"], "SECRET_BODY_SENTINEL")
    assert client.post(f"/teacher/forum/posts/{post['id']}/hide", json={"reason": "Spam"}).status_code == 200
    assert client.post(f"/teacher/forum/topics/{topic['id']}/hide", json={"reason": "Closed"}).status_code == 200
    for row in log_rows(db):
        stored = " ".join(str(value) for value in vars(row).values())
        assert "SECRET_BODY_SENTINEL" not in stored and "**Welcome**" not in stored and "Read your QSA" not in stored
    entries = client.get(f"/teacher/groups/{group_id}/forum/log").json()["entries"]
    assert [(entry["target_kind"], entry["reason"]) for entry in entries] == [("topic", "Closed"), ("post", "Spam")]
    assert set(entries[0]) == {"id", "actor_username", "action", "target_kind", "target_id", "reason", "created_at"}
    # No route can rewrite or remove the log.
    log_methods = {method for route in forum.router.routes if "log" in route.path for method in route.methods}
    assert log_methods == {"GET"}
    log_path = f"/teacher/groups/{group_id}/forum/log"
    assert client.delete(log_path).status_code == 405
    assert client.put(log_path, json={}).status_code == 405
    assert client.patch(log_path, json={}).status_code == 405


def test_log_is_scoped_to_its_class_and_paginated(forum_api):
    client, db, group_id, _ = forum_api
    other = models.StudentGroup(code="GR-C5OTHER", name="Other", owner_username="owner")
    db.add(other)
    db.commit()
    topic = open_topic(client, group_id)
    other_topic = open_topic(client, other.id)
    for action in ["pin", "unpin", "pin"]:
        assert client.post(f"/teacher/forum/topics/{topic['id']}/{action}").status_code == 200
    assert client.post(f"/teacher/forum/topics/{other_topic['id']}/lock").status_code == 200
    first = client.get(f"/teacher/groups/{group_id}/forum/log?limit=2").json()
    second = client.get(f"/teacher/groups/{group_id}/forum/log?limit=2&offset=2").json()
    assert [entry["action"] for entry in first["entries"] + second["entries"]] == ["pin", "unpin", "pin"]
    assert (first["has_more"], second["has_more"]) == (True, False)


def test_author_edits_own_reply_and_it_shows_as_edited(forum_api):
    client, _, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    post = student_reply(client, identity, topic["id"], "Typo")
    act_as(identity, "student")
    assert client.get(f"/forum/topics/{topic['id']}").json()["posts"][0]["own"] is True
    edited = client.patch(f"/forum/posts/{post['id']}", json={"body": "Fixed"})
    assert edited.status_code == 200
    assert edited.json()["body"] == "Fixed" and edited.json()["edited_at"] is not None
    act_as(identity, "owner")
    detail = client.get(f"/forum/topics/{topic['id']}").json()["posts"][0]
    assert (detail["body"], detail["own"], detail["edited_at"] is not None) == ("Fixed", False, True)


def test_author_deletes_own_reply_as_a_tombstone_for_everyone(forum_api):
    client, db, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    post = student_reply(client, identity, topic["id"], "Regret")
    act_as(identity, "student")
    deleted = client.delete(f"/forum/posts/{post['id']}")
    assert deleted.status_code == 200
    assert (deleted.json()["deleted"], deleted.json()["body"]) == (True, None)
    assert client.delete(f"/forum/posts/{post['id']}").status_code == 409
    assert client.patch(f"/forum/posts/{post['id']}", json={"body": "Again"}).status_code == 409
    act_as(identity, "owner")
    detail = client.get(f"/forum/topics/{topic['id']}").json()
    assert (detail["posts"][0]["deleted"], detail["posts"][0]["body"]) == (True, None)
    assert client.post(f"/teacher/forum/posts/{post['id']}/hide", json={"reason": "x"}).status_code == 409
    assert log_rows(db) == []


@pytest.mark.parametrize("actor", ["owner", "co-teacher", "admin", "other-student", "non-member"])
def test_only_the_author_can_edit_or_delete(forum_api, actor):
    client, db, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    post = student_reply(client, identity, topic["id"], "Mine")
    if actor == "other-student":
        db.add(models.GroupMembership(group_id=group_id, username=actor))
        db.commit()
        identity.update(username=actor, groups=["studenti"], is_admin=False)
    else:
        act_as(identity, actor)
    assert client.patch(f"/forum/posts/{post['id']}", json={"body": "Changed"}).status_code == 403
    assert client.delete(f"/forum/posts/{post['id']}").status_code == 403
    act_as(identity, "student")
    assert client.get(f"/forum/topics/{topic['id']}").json()["posts"][0]["body"] == "Mine"


def test_author_edit_and_delete_respect_closure_hiding_archive_and_departure(forum_api):
    client, db, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    hidden = student_reply(client, identity, topic["id"], "Hidden")
    locked = student_reply(client, identity, topic["id"], "In locked topic")
    assert client.post(f"/teacher/forum/posts/{hidden['id']}/hide", json={"reason": "x"}).status_code == 200
    assert client.post(f"/teacher/forum/topics/{topic['id']}/lock").status_code == 200
    act_as(identity, "student")
    # Moderated content cannot be rewritten by its author; deletion stays possible.
    assert client.patch(f"/forum/posts/{hidden['id']}", json={"body": "Sneaky"}).status_code == 409
    assert client.patch(f"/forum/posts/{locked['id']}", json={"body": "Edit"}).status_code == 403
    assert client.delete(f"/forum/posts/{locked['id']}").status_code == 200
    assert client.delete(f"/forum/posts/{hidden['id']}").status_code == 200
    act_as(identity, "owner")
    assert client.post(f"/teacher/forum/topics/{topic['id']}/unlock").status_code == 200
    archived = student_reply(client, identity, topic["id"], "Archived")
    db.get(models.StudentGroup, group_id).is_active = False
    db.commit()
    act_as(identity, "student")
    assert client.patch(f"/forum/posts/{archived['id']}", json={"body": "Edit"}).status_code == 403
    assert client.delete(f"/forum/posts/{archived['id']}").status_code == 403
    db.get(models.StudentGroup, group_id).is_active = True
    db.query(models.GroupMembership).filter_by(group_id=group_id, username="student").delete()
    db.commit()
    assert client.delete(f"/forum/posts/{archived['id']}").status_code == 403


@pytest.mark.parametrize("payload", [{"body": " "}, {"body": "B" * 4001}, {"body": "Bad\x00body"},
                                     {"body": "Bell\x07"}, {"body": "Text", "author_username": "owner"}])
def test_edit_input_limits(forum_api, payload):
    client, _, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    post = student_reply(client, identity, topic["id"])
    act_as(identity, "student")
    assert client.patch(f"/forum/posts/{post['id']}", json=payload).status_code == 422


def test_deleted_class_cascades_its_moderation_log(forum_api):
    client, db, group_id, _ = forum_api
    topic = open_topic(client, group_id)
    assert client.post(f"/teacher/forum/topics/{topic['id']}/lock").status_code == 200
    assert client.delete(f"/admin/groups/{group_id}").status_code == 200
    assert log_rows(db) == []
