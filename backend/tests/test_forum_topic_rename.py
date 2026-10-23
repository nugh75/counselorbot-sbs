"""Discussion title edit: the author or a class moderator fixes a wrong title."""
import pytest

from backend import models
from backend.tests.test_forum import forum_api, open_topic  # noqa: F401 (shared fixture)
from backend.tests.test_forum_moderation import act_as, log_rows
from backend.tests.test_forum_options import save_settings


def student_topic(client, identity, group_id, **options):
    save_settings(client, group_id, students_can_open=True, **options)
    act_as(identity, "student")
    response = client.post(f"/groups/{group_id}/forum/topics", json={"title": "Wrnog title", "body": "Body"})
    assert response.status_code == 201, response.text
    return response.json()


def test_author_renames_own_discussion_and_it_shows_as_edited(forum_api):
    client, db, group_id, identity = forum_api
    topic = student_topic(client, identity, group_id)
    renamed = client.patch(f"/forum/topics/{topic['id']}", json={"title": "  Right title  "})
    assert renamed.status_code == 200, renamed.text
    assert (renamed.json()["title"], renamed.json()["body"]) == ("Right title", "Body")
    assert renamed.json()["edited_at"] is not None and renamed.json()["status"] == "published"
    act_as(identity, "owner")
    listing = client.get(f"/groups/{group_id}/forum/topics").json()
    assert listing["topics"][0]["title"] == "Right title"
    assert {row.action for row in log_rows(db)} == {"settings_change"}


@pytest.mark.parametrize("actor", ["owner", "co-teacher", "admin"])
def test_class_moderators_rename_any_discussion(forum_api, actor):
    client, _, group_id, identity = forum_api
    topic = student_topic(client, identity, group_id)
    act_as(identity, actor)
    renamed = client.patch(f"/forum/topics/{topic['id']}", json={"title": "Moderated title"})
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["title"] == "Moderated title"


@pytest.mark.parametrize("actor", ["other-student", "non-member", "other-teacher"])
def test_nobody_else_renames_a_discussion(forum_api, actor):
    client, db, group_id, identity = forum_api
    topic = student_topic(client, identity, group_id)
    if actor == "other-student":
        db.add(models.GroupMembership(group_id=group_id, username=actor))
        db.commit()
        identity.update(username=actor, groups=["studenti"], is_admin=False)
    else:
        act_as(identity, actor)
    assert client.patch(f"/forum/topics/{topic['id']}", json={"title": "Hijacked"}).status_code == 403
    act_as(identity, "owner")
    assert client.get(f"/forum/topics/{topic['id']}").json()["topic"]["title"] == "Wrnog title"


@pytest.mark.parametrize("payload", [{"title": " "}, {"title": "T" * 161}, {"title": "Bad\x00title"},
                                     {"title": "Bell\x07"}, {"title": 5}, {}, {"title": "Ok", "pinned": True}])
def test_rename_input_limits_match_creation(forum_api, payload):
    client, _, group_id, identity = forum_api
    topic = student_topic(client, identity, group_id)
    assert client.patch(f"/forum/topics/{topic['id']}", json=payload).status_code == 422


def test_author_rename_respects_closure_hiding_archive_and_premoderation(forum_api):
    client, db, group_id, identity = forum_api
    topic = student_topic(client, identity, group_id)
    act_as(identity, "owner")
    assert client.post(f"/teacher/forum/topics/{topic['id']}/lock").status_code == 200
    act_as(identity, "student")
    assert client.patch(f"/forum/topics/{topic['id']}", json={"title": "Locked"}).status_code == 403
    act_as(identity, "owner")
    # Moderators keep their tools on closed discussions.
    assert client.patch(f"/forum/topics/{topic['id']}", json={"title": "Fixed by teacher"}).status_code == 200
    assert client.post(f"/teacher/forum/topics/{topic['id']}/unlock").status_code == 200
    assert client.post(f"/teacher/forum/topics/{topic['id']}/hide", json={"reason": "x"}).status_code == 200
    act_as(identity, "student")
    assert client.patch(f"/forum/topics/{topic['id']}", json={"title": "Sneaky"}).status_code == 409
    act_as(identity, "owner")
    assert client.post(f"/teacher/forum/topics/{topic['id']}/restore").status_code == 200
    save_settings(client, group_id, premoderation=True)
    act_as(identity, "student")
    pending = client.patch(f"/forum/topics/{topic['id']}", json={"title": "Needs approval"})
    assert pending.status_code == 200 and pending.json()["status"] == "pending"
    db.get(models.StudentGroup, group_id).is_active = False
    db.commit()
    assert client.patch(f"/forum/topics/{topic['id']}", json={"title": "Archived"}).status_code == 403
