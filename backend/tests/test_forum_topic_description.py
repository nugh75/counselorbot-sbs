"""Discussion description edit: the opening text follows the title edit rules."""
import pytest

from backend import models
from backend.tests.test_forum import forum_api, open_topic  # noqa: F401 (shared fixture)
from backend.tests.test_forum_moderation import act_as
from backend.tests.test_forum_options import save_settings
from backend.tests.test_forum_topic_rename import student_topic


def test_author_edits_own_description_and_title_together(forum_api):
    client, _, group_id, identity = forum_api
    topic = student_topic(client, identity, group_id)
    edited = client.patch(f"/forum/topics/{topic['id']}", json={"body": "  Better body  "})
    assert edited.status_code == 200, edited.text
    assert (edited.json()["title"], edited.json()["body"]) == ("Wrnog title", "Better body")
    assert edited.json()["edited_at"] is not None and edited.json()["status"] == "published"
    both = client.patch(f"/forum/topics/{topic['id']}", json={"title": "Right title", "body": "Final body"})
    assert (both.json()["title"], both.json()["body"]) == ("Right title", "Final body")
    act_as(identity, "owner")
    assert client.get(f"/forum/topics/{topic['id']}").json()["topic"]["body"] == "Final body"


@pytest.mark.parametrize("actor", ["owner", "co-teacher", "admin"])
def test_class_moderators_edit_any_description(forum_api, actor):
    client, _, group_id, identity = forum_api
    topic = student_topic(client, identity, group_id)
    act_as(identity, actor)
    edited = client.patch(f"/forum/topics/{topic['id']}", json={"body": "Moderated body"})
    assert edited.status_code == 200, edited.text
    assert edited.json()["body"] == "Moderated body"


@pytest.mark.parametrize("actor", ["other-student", "non-member", "other-teacher"])
def test_nobody_else_edits_a_description(forum_api, actor):
    client, db, group_id, identity = forum_api
    topic = student_topic(client, identity, group_id)
    if actor == "other-student":
        db.add(models.GroupMembership(group_id=group_id, username=actor))
        db.commit()
        identity.update(username=actor, groups=["studenti"], is_admin=False)
    else:
        act_as(identity, actor)
    assert client.patch(f"/forum/topics/{topic['id']}", json={"body": "Hijacked"}).status_code == 403
    act_as(identity, "owner")
    assert client.get(f"/forum/topics/{topic['id']}").json()["topic"]["body"] == "Body"


@pytest.mark.parametrize("payload", [{"body": " "}, {"body": "B" * 4001}, {"body": "Bad\x00body"},
                                     {"body": "Bell\x07"}, {"body": 5}, {"body": None}, {"title": None},
                                     {"body": "Ok", "link_id": 1}])
def test_description_input_limits_match_creation(forum_api, payload):
    client, _, group_id, identity = forum_api
    topic = student_topic(client, identity, group_id)
    assert client.patch(f"/forum/topics/{topic['id']}", json=payload).status_code == 422


def test_author_description_edit_respects_closure_hiding_and_premoderation(forum_api):
    client, db, group_id, identity = forum_api
    topic = student_topic(client, identity, group_id)
    act_as(identity, "owner")
    assert client.post(f"/teacher/forum/topics/{topic['id']}/lock").status_code == 200
    act_as(identity, "student")
    assert client.patch(f"/forum/topics/{topic['id']}", json={"body": "Locked"}).status_code == 403
    act_as(identity, "owner")
    assert client.patch(f"/forum/topics/{topic['id']}", json={"body": "Fixed by teacher"}).status_code == 200
    assert client.post(f"/teacher/forum/topics/{topic['id']}/unlock").status_code == 200
    assert client.post(f"/teacher/forum/topics/{topic['id']}/hide", json={"reason": "x"}).status_code == 200
    act_as(identity, "student")
    assert client.patch(f"/forum/topics/{topic['id']}", json={"body": "Sneaky"}).status_code == 409
    act_as(identity, "owner")
    assert client.post(f"/teacher/forum/topics/{topic['id']}/restore").status_code == 200
    save_settings(client, group_id, premoderation=True)
    act_as(identity, "student")
    pending = client.patch(f"/forum/topics/{topic['id']}", json={"body": "Needs approval"})
    assert pending.status_code == 200 and pending.json()["status"] == "pending"


def test_reply_edit_still_targets_only_the_reply(forum_api):
    client, _, group_id, identity = forum_api
    topic = student_topic(client, identity, group_id)
    reply = client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Reply"}).json()
    assert client.patch(f"/forum/posts/{reply['id']}", json={"body": "Reply fixed"}).status_code == 200
    detail = client.get(f"/forum/topics/{topic['id']}").json()
    assert detail["topic"]["body"] == "Body" and detail["posts"][0]["body"] == "Reply fixed"
