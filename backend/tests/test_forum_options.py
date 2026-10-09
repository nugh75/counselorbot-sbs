"""Forum options (F3, #104): forum tool key, students-can-open, pre-approval and mutes."""
from datetime import datetime, timedelta, timezone

import pytest

from backend import models
from backend.tests.test_forum import forum_api, open_topic  # noqa: F401 (shared fixture)
from backend.tests.test_forum_moderation import act_as, log_rows


def save_settings(client, group_id, **forum):
    """Owner saves forum options and/or the forum tool key through the settings PUT."""
    path = f"/teacher/groups/{group_id}/settings"
    current = client.get(path).json()
    disabled = forum.pop("disabled_tool_keys", current["disabled_tool_keys"])
    payload = {"revision": current["revision"], "disabled_tool_keys": disabled}
    if forum:
        payload["forum"] = {**{k: current["forum"][k] for k in ("students_can_open", "premoderation")}, **forum}
    response = client.put(path, json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def as_student(identity):
    act_as(identity, "student")


# --- Settings contract -----------------------------------------------------------

def test_settings_put_accepts_forum_options_and_logs_each_change(forum_api):
    client, db, group_id, _ = forum_api
    saved = save_settings(client, group_id, students_can_open=True)
    assert {key: saved["forum"][key] for key in ("students_can_open", "students_can_open_locked",
                                                  "premoderation", "premoderation_locked")} == {
        "students_can_open": True, "students_can_open_locked": False,
        "premoderation": False, "premoderation_locked": False}
    saved = save_settings(client, group_id, premoderation=True)
    assert saved["forum"]["premoderation"] is True
    assert saved["forum"]["students_can_open"] is True
    rows = log_rows(db)
    assert [(row.action, row.target_kind, row.reason) for row in rows] == [
        ("settings_change", "settings", "students_can_open: on"),
        ("settings_change", "settings", "premoderation: on"),
    ]
    assert all(row.actor_username == "owner" for row in rows)


def test_settings_save_without_forum_keeps_options_and_writes_no_log(forum_api):
    client, db, group_id, _ = forum_api
    save_settings(client, group_id, students_can_open=True)
    saved = save_settings(client, group_id, disabled_tool_keys=["tavolo"])
    assert saved["forum"]["students_can_open"] is True
    assert len(log_rows(db)) == 1


@pytest.mark.parametrize("forum", [{"students_can_open": "yes", "premoderation": False},
                                   {"students_can_open": True},
                                   {"students_can_open": True, "premoderation": False, "extra": True}])
def test_settings_put_rejects_malformed_forum_options(forum_api, forum):
    client, _, group_id, _ = forum_api
    assert client.put(f"/teacher/groups/{group_id}/settings", json={
        "revision": 1, "disabled_tool_keys": [], "forum": forum}).status_code == 422


def test_forum_tool_key_is_listed_and_logged_when_switched(forum_api):
    client, db, group_id, _ = forum_api
    tools = {row["key"]: row for row in client.get(f"/teacher/groups/{group_id}/settings").json()["tools"]}
    assert tools["forum"]["category"] == "forum" and tools["forum"]["enabled"] is True
    save_settings(client, group_id, disabled_tool_keys=["forum"])
    save_settings(client, group_id, disabled_tool_keys=[])
    assert [row.reason for row in log_rows(db)] == ["forum: off", "forum: on"]


def test_admin_lock_wins_over_the_teacher_forum_option(forum_api):
    client, db, group_id, identity = forum_api
    save_settings(client, group_id, students_can_open=True)
    act_as(identity, "admin")
    locked = client.post(f"/admin/groups/{group_id}/settings/lock", json={
        "target_kind": "forum_option", "target_id": "students_can_open", "state": False})
    assert locked.status_code == 200, locked.text
    forum = client.get(f"/teacher/groups/{group_id}/settings").json()["forum"]
    assert forum["students_can_open"] is False and forum["students_can_open_locked"] is True
    # S8 model (#109): a teacher save that contradicts the lock is refused.
    act_as(identity, "owner")
    path = f"/teacher/groups/{group_id}/settings"
    current = client.get(path).json()
    denied = client.put(path, json={"revision": current["revision"], "disabled_tool_keys": [],
                                    "forum": {"students_can_open": True, "premoderation": False}})
    assert denied.status_code == 422 and denied.json()["item_id"] == "students_can_open"
    save_settings(client, group_id, students_can_open=False, premoderation=True)
    audit = db.query(models.ClassSettingsAuditLog).filter_by(group_id=group_id, target_kind="forum_option").all()
    assert [(row.action, row.target_id, row.new_value) for row in audit] == [
        ("setting_change", "students_can_open", {"value": True}),
        ("lock", "students_can_open", {"value": False, "locked": True}),
        ("setting_change", "premoderation", {"value": True}),
    ]
    as_student(identity)
    assert client.post(f"/groups/{group_id}/forum/topics", json={"title": "T", "body": "B"}).status_code == 403


# --- Forum tool key (S2 guard) ----------------------------------------------------

def test_disabled_forum_blocks_student_writes_but_keeps_reads(forum_api):
    client, _, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    save_settings(client, group_id, disabled_tool_keys=["forum"], students_can_open=True)
    # Staff are never filtered (decision 5).
    assert client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Teacher"}).status_code == 201
    as_student(identity)
    listing = client.get(f"/groups/{group_id}/forum/topics")
    assert listing.status_code == 200
    assert listing.json()["forum_enabled"] is False and listing.json()["can_open_topic"] is False
    detail = client.get(f"/forum/topics/{topic['id']}").json()
    assert detail["can_reply"] is False and detail["forum_enabled"] is False
    for response in (client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Hi"}),
                     client.post(f"/groups/{group_id}/forum/topics", json={"title": "T", "body": "B"})):
        assert response.status_code == 403
        assert response.json()["detail"] == "tool_disabled_for_class"


def test_forum_switch_is_per_class_not_a_union(forum_api):
    client, db, group_id, identity = forum_api
    other = models.StudentGroup(code="GR-F3OTHER", name="Other class", owner_username="owner")
    db.add(other)
    db.flush()
    db.add(models.GroupMembership(group_id=other.id, username="student"))
    db.commit()
    topic = open_topic(client, group_id)
    save_settings(client, group_id, disabled_tool_keys=["forum"])
    as_student(identity)
    assert client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Hi"}).status_code == 403


# --- Students can open discussions -------------------------------------------------

def test_students_open_discussions_only_when_the_class_allows_it(forum_api):
    client, _, group_id, identity = forum_api
    as_student(identity)
    assert client.get(f"/groups/{group_id}/forum/topics").json()["can_open_topic"] is False
    denied = client.post(f"/groups/{group_id}/forum/topics", json={"title": "T", "body": "B"})
    assert denied.status_code == 403 and denied.json()["detail"] == "forum_topic_staff_only"
    act_as(identity, "owner")
    save_settings(client, group_id, students_can_open=True)
    as_student(identity)
    assert client.get(f"/groups/{group_id}/forum/topics").json()["can_open_topic"] is True
    created = client.post(f"/groups/{group_id}/forum/topics", json={"title": "My question", "body": "Help"})
    assert created.status_code == 201
    assert created.json()["status"] == "published" and created.json()["own"] is True
    act_as(identity, "non-member")
    assert client.post(f"/groups/{group_id}/forum/topics", json={"title": "T", "body": "B"}).status_code == 403


# --- Mutes -------------------------------------------------------------------------

def mute(client, group_id, **payload):
    return client.post(f"/teacher/groups/{group_id}/forum/mutes", json={"username": "student", "reason": "Rude", **payload})


def test_muted_student_gets_403_on_post_topic_and_edit_until_unmuted(forum_api):
    client, db, group_id, identity = forum_api
    save_settings(client, group_id, students_can_open=True)
    topic = open_topic(client, group_id)
    as_student(identity)
    reply = client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Before"}).json()
    act_as(identity, "owner")
    muted = mute(client, group_id)
    assert muted.status_code == 201, muted.text
    assert muted.json() | {"username": "student", "reason": "Rude", "until": None} == muted.json()
    listed = client.get(f"/teacher/groups/{group_id}/forum/mutes").json()["mutes"]
    assert [row["id"] for row in listed] == [muted.json()["id"]]
    as_student(identity)
    for response in (client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Hi"}),
                     client.post(f"/groups/{group_id}/forum/topics", json={"title": "T", "body": "B"}),
                     client.patch(f"/forum/posts/{reply['id']}", json={"body": "Edited"})):
        assert response.status_code == 403 and response.json()["detail"] == "forum_muted"
    # Authors can always delete their own messages.
    assert client.delete(f"/forum/posts/{reply['id']}").status_code == 200
    state = client.get(f"/forum/topics/{topic['id']}").json()
    assert state["can_reply"] is False and state["mute"] == {"until": None}
    assert client.get(f"/groups/{group_id}/forum/topics").json()["mute"] == {"until": None}
    act_as(identity, "owner")
    lifted = client.delete(f"/teacher/groups/{group_id}/forum/mutes/{muted.json()['id']}")
    assert lifted.status_code == 200
    assert client.get(f"/teacher/groups/{group_id}/forum/mutes").json()["mutes"] == []
    assert client.delete(f"/teacher/groups/{group_id}/forum/mutes/{muted.json()['id']}").status_code == 409
    as_student(identity)
    assert client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Back"}).status_code == 201
    assert client.get(f"/forum/topics/{topic['id']}").json()["mute"] is None
    entries = [(row.action, row.target_kind, row.target_id, row.reason) for row in log_rows(db)
               if row.action in {"mute", "unmute"}]
    assert entries == [("mute", "user", muted.json()["id"], "Rude"), ("unmute", "user", muted.json()["id"], None)]


def test_mute_with_end_date_expires(forum_api):
    client, db, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    until = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    muted = mute(client, group_id, until=until)
    assert muted.status_code == 201 and muted.json()["until"] is not None
    as_student(identity)
    assert client.get(f"/forum/topics/{topic['id']}").json()["mute"]["until"] is not None
    assert client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Hi"}).status_code == 403
    db.get(models.ForumMute, muted.json()["id"]).until = datetime.now(timezone.utc) - timedelta(minutes=1)
    db.commit()
    assert client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Hi"}).status_code == 201


@pytest.mark.parametrize("payload,status", [
    ({"username": "non-member"}, 422), ({"username": "co-teacher"}, 422), ({"username": "owner"}, 422),
    ({"until": "2001-01-01T00:00:00Z"}, 422), ({"until": "2099-01-01T00:00:00"}, 422), ({"reason": ""}, 422),
])
def test_mute_validation(forum_api, payload, status):
    client, _, group_id, _ = forum_api
    assert mute(client, group_id, **payload).status_code == status


def test_mute_twice_conflicts_and_only_moderators_mute(forum_api):
    client, db, group_id, identity = forum_api
    assert mute(client, group_id).status_code == 201
    assert mute(client, group_id).status_code == 409
    for actor in ("student", "non-member", "other-teacher"):
        act_as(identity, actor)
        assert client.get(f"/teacher/groups/{group_id}/forum/mutes").status_code == 403
        assert mute(client, group_id).status_code == 403
    db.get(models.StudentGroup, group_id).is_active = False
    db.commit()
    act_as(identity, "owner")
    assert client.delete(f"/teacher/groups/{group_id}/forum/mutes/1").status_code == 403


# --- Pre-approval -------------------------------------------------------------------

def test_premoderated_reply_is_visible_only_to_author_and_moderators_until_approved(forum_api):
    client, db, group_id, identity = forum_api
    db.add(models.GroupMembership(group_id=group_id, username="classmate"))
    db.commit()
    topic = open_topic(client, group_id)
    save_settings(client, group_id, premoderation=True)
    # Moderators' own messages are never held.
    assert client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Teacher"}).json()["status"] == "published"
    as_student(identity)
    detail = client.get(f"/forum/topics/{topic['id']}").json()
    assert detail["premoderated"] is True
    pending = client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Awaiting"})
    assert pending.status_code == 201 and pending.json()["status"] == "pending"
    mine = client.get(f"/forum/topics/{topic['id']}").json()["posts"]
    assert [(row["body"], row["status"]) for row in mine] == [("Teacher", "published"), ("Awaiting", "pending")]
    identity.update(username="classmate")
    assert [row["body"] for row in client.get(f"/forum/topics/{topic['id']}").json()["posts"]] == ["Teacher"]
    assert client.get(f"/groups/{group_id}/forum/topics").json()["topics"][0]["replies_count"] == 1
    act_as(identity, "owner")
    queue = client.get(f"/teacher/groups/{group_id}/forum/pending").json()
    assert [row["id"] for row in queue["posts"]] == [pending.json()["id"]]
    assert queue["posts"][0]["topic_title"] == "Read your QSA" and queue["topics"] == []
    assert client.get(f"/groups/{group_id}/forum/topics").json()["pending_count"] == 1
    approved = client.post(f"/teacher/forum/posts/{pending.json()['id']}/approve")
    assert approved.status_code == 200 and approved.json()["status"] == "published"
    assert client.post(f"/teacher/forum/posts/{pending.json()['id']}/approve").status_code == 409
    identity.update(username="classmate", groups=["studenti"], is_admin=False)
    assert [row["body"] for row in client.get(f"/forum/topics/{topic['id']}").json()["posts"]] == ["Teacher", "Awaiting"]
    assert [row.action for row in log_rows(db)][-1] == "approve"


def test_premoderated_topic_and_rejection(forum_api):
    client, db, group_id, identity = forum_api
    save_settings(client, group_id, students_can_open=True, premoderation=True)
    as_student(identity)
    created = client.post(f"/groups/{group_id}/forum/topics", json={"title": "Question", "body": "Body"}).json()
    assert created["status"] == "pending"
    assert [row["id"] for row in client.get(f"/groups/{group_id}/forum/topics").json()["topics"]] == [created["id"]]
    assert client.post(f"/forum/topics/{created['id']}/posts", json={"body": "x"}).status_code == 403
    act_as(identity, "co-teacher")
    queue = client.get(f"/teacher/groups/{group_id}/forum/pending").json()
    assert [row["id"] for row in queue["topics"]] == [created["id"]]
    assert client.get(f"/groups/{group_id}/forum/topics").json()["topics"] == []
    assert client.post(f"/teacher/forum/topics/{created['id']}/reject", json={}).status_code == 422
    rejected = client.post(f"/teacher/forum/topics/{created['id']}/reject", json={"reason": "Duplicate"})
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "pending" and rejected.json()["hidden_reason"] == "Duplicate"
    assert client.get(f"/teacher/groups/{group_id}/forum/pending").json()["topics"] == []
    assert client.post(f"/teacher/forum/topics/{created['id']}/approve").status_code == 409
    act_as(identity, "student")
    own = client.get(f"/forum/topics/{created['id']}").json()["topic"]
    assert own["status"] == "pending" and own["hidden"] is True and own["body"] is None
    identity.update(username="classmate")
    db.add(models.GroupMembership(group_id=group_id, username="classmate"))
    db.commit()
    assert client.get(f"/forum/topics/{created['id']}").status_code == 403
    assert client.post(f"/forum/topics/{created['id']}/read").status_code == 403
    actions = [(row.action, row.target_kind, row.reason) for row in log_rows(db) if row.action in {"approve", "reject"}]
    assert actions == [("reject", "topic", "Duplicate")]


def test_premoderation_holds_student_edits_of_published_posts_again(forum_api):
    client, _, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    as_student(identity)
    reply = client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Fine"}).json()
    act_as(identity, "owner")
    save_settings(client, group_id, premoderation=True)
    as_student(identity)
    edited = client.patch(f"/forum/posts/{reply['id']}", json={"body": "Changed"})
    assert edited.status_code == 200 and edited.json()["status"] == "pending"
    act_as(identity, "owner")
    assert [row["id"] for row in client.get(f"/teacher/groups/{group_id}/forum/pending").json()["posts"]] == [reply["id"]]


@pytest.mark.parametrize("actor", ["student", "non-member", "other-teacher"])
def test_only_moderators_approve_reject_or_see_the_queue(forum_api, actor):
    client, _, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    save_settings(client, group_id, premoderation=True)
    as_student(identity)
    pending = client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Wait"}).json()
    act_as(identity, actor)
    assert client.get(f"/teacher/groups/{group_id}/forum/pending").status_code == 403
    assert client.post(f"/teacher/forum/posts/{pending['id']}/approve").status_code == 403
    assert client.post(f"/teacher/forum/posts/{pending['id']}/reject", json={"reason": "No"}).status_code == 403


def test_moderators_see_author_usernames_students_do_not(forum_api):
    client, _, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    as_student(identity)
    client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Hi"})
    assert "author_username" not in client.get(f"/forum/topics/{topic['id']}").json()["posts"][0]
    act_as(identity, "owner")
    assert client.get(f"/forum/topics/{topic['id']}").json()["posts"][0]["author_username"] == "student"


def test_disabled_forum_blocks_edit_but_author_can_delete(forum_api):
    client, _, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    as_student(identity)
    post = client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Before"}).json()
    act_as(identity, "owner")
    save_settings(client, group_id, disabled_tool_keys=["forum"])
    as_student(identity)
    assert client.patch(f"/forum/posts/{post['id']}", json={"body": "After"}).json()["detail"] == "tool_disabled_for_class"
    assert client.delete(f"/forum/posts/{post['id']}").status_code == 200


@pytest.mark.parametrize("actor", ["owner", "co-teacher", "admin"])
def test_moderators_can_approve_topics_and_reject_posts_with_a_reason(forum_api, actor):
    client, db, group_id, identity = forum_api
    db.add(models.GroupMembership(group_id=group_id, username="classmate"))
    db.commit()
    save_settings(client, group_id, students_can_open=True, premoderation=True)
    as_student(identity)
    topic = client.post(f"/groups/{group_id}/forum/topics", json={"title": "Held", "body": "Topic"}).json()
    act_as(identity, actor)
    assert client.post(f"/teacher/forum/topics/{topic['id']}/approve").json()["status"] == "published"
    as_student(identity)
    post = client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "PRIVATE_PENDING_BODY"}).json()
    act_as(identity, actor)
    assert client.post(f"/teacher/forum/posts/{post['id']}/reject", json={"reason": "Off topic"}).status_code == 200
    assert client.post(f"/teacher/forum/posts/{post['id']}/restore").status_code == 409
    assert client.post(f"/teacher/forum/posts/{post['id']}/approve").status_code == 409
    assert client.get(f"/teacher/groups/{group_id}/forum/pending").json()["posts"] == []
    assert all("PRIVATE_PENDING_BODY" not in (row.reason or "") for row in log_rows(db))
    identity.update(username="classmate", groups=["studenti"], is_admin=False)
    assert client.get(f"/forum/topics/{topic['id']}").json()["posts"] == []


def test_mute_is_scoped_to_its_class_and_unrelated_mute_ids_are_refused(forum_api):
    client, db, group_id, identity = forum_api
    first = open_topic(client, group_id)
    other = models.StudentGroup(code="GR-F3SCOPE", name="Other", owner_username="owner")
    db.add(other)
    db.flush()
    db.add(models.GroupMembership(group_id=other.id, username="student"))
    db.commit()
    second = open_topic(client, other.id)
    muted = mute(client, group_id).json()
    assert client.delete(f"/teacher/groups/{other.id}/forum/mutes/{muted['id']}").status_code == 403
    as_student(identity)
    assert client.post(f"/forum/topics/{first['id']}/posts", json={"body": "Blocked"}).status_code == 403
    assert client.post(f"/forum/topics/{second['id']}/posts", json={"body": "Allowed"}).status_code == 201
