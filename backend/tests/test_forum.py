"""Forum contracts against isolated PostgreSQL schemas and synthetic identities."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, database, models
from backend.routes import forum, groups
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def forum_api():
    with artifact_session() as db:
        group = models.StudentGroup(code="GR-C4TEST", name="Synthetic class", owner_username="owner")
        db.add(group)
        db.flush()
        db.add_all([
            models.GroupMembership(group_id=group.id, username="student"),
            models.GroupShare(group_id=group.id, shared_with_username="co-teacher", granted_by_username="owner"),
        ])
        db.commit()
        identity = {"username": "owner", "name": "Teacher Snapshot", "groups": ["docenti"],
                    "is_admin": False, "is_researcher": False, "authenticated": True}
        app = FastAPI()
        app.include_router(forum.router)
        app.include_router(groups.router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        with TestClient(app) as client:
            yield client, db, group.id, identity


def open_topic(client, group_id):
    response = client.post(f"/groups/{group_id}/forum/topics", json={"title": "Read your QSA", "body": "**Welcome**"})
    assert response.status_code == 201, response.text
    return response.json()


def test_discussion_and_reply_are_readable_with_identity_snapshots(forum_api):
    client, _, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    identity.update(username="student", name="Student Snapshot", groups=["studenti"])
    reply = client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "My reply"})
    assert reply.status_code == 201
    identity["name"] = "Renamed"
    detail = client.get(f"/forum/topics/{topic['id']}").json()
    assert detail["topic"]["author_display_name"] == "Teacher Snapshot"
    assert detail["posts"][0]["author_display_name"] == "Student Snapshot"
    assert detail["posts"][0]["body"] == "My reply"
    listing = client.get(f"/groups/{group_id}/forum/topics").json()
    assert listing["group"]["name"] == "Synthetic class"
    assert listing["topics"][0]["replies_count"] == 1
    assert listing["can_open_topic"] is False


@pytest.mark.parametrize("actor,read,reply,open_allowed", [
    ("non-member", False, False, False), ("other-teacher", False, False, False),
    ("former-member", False, False, False), ("student", True, True, False),
    ("owner", True, True, True), ("co-teacher", True, True, True), ("admin", True, True, True),
])
def test_permission_matrix(forum_api, actor, read, reply, open_allowed):
    client, db, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    if actor == "former-member":
        db.add(models.GroupMembership(group_id=group_id, username=actor))
        db.commit()
        identity.update(username=actor, groups=["studenti"])
        membership = client.get("/user/groups").json()[0]["membership_id"]
        assert client.delete(f"/user/groups/{membership}").status_code == 200
    identity.update(username=actor, name=actor, is_admin=actor == "admin",
                    groups=["docenti"] if actor in {"owner", "co-teacher", "other-teacher"} else ["studenti"])
    assert client.get(f"/groups/{group_id}/forum/topics").status_code == (200 if read else 403)
    assert client.get(f"/forum/topics/{topic['id']}").status_code == (200 if read else 403)
    assert client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Reply"}).status_code == (201 if reply else 403)
    assert client.post(f"/groups/{group_id}/forum/topics", json={"title": "New", "body": "Text"}).status_code == (201 if open_allowed else 403)


@pytest.mark.parametrize("actor", ["student", "owner", "co-teacher", "admin"])
def test_inactive_class_is_read_only(forum_api, actor):
    client, db, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    db.get(models.StudentGroup, group_id).is_active = False
    db.commit()
    identity.update(username=actor, is_admin=actor == "admin", groups=["docenti"] if actor != "student" else ["studenti"])
    listing = client.get(f"/groups/{group_id}/forum/topics").json()
    assert listing["group"]["is_active"] is False
    assert listing["can_open_topic"] is False
    assert client.get(f"/forum/topics/{topic['id']}").json()["can_reply"] is False
    assert client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Reply"}).status_code == 403
    assert client.post(f"/groups/{group_id}/forum/topics", json={"title": "New", "body": "Text"}).status_code == 403


@pytest.mark.parametrize("payload", [
    {"title": " ", "body": "Text"}, {"title": "T" * 161, "body": "Text"},
    {"title": "Valid", "body": " "}, {"title": "Valid", "body": "B" * 4001},
    {"title": "Valid", "body": "Text", "author_display_name": "Forged"},
    {"title": "Valid", "body": "Text", "attachments": ["file"]},
])
def test_topic_input_limits_and_identity_cannot_be_forged(forum_api, payload):
    client, _, group_id, _ = forum_api
    assert client.post(f"/groups/{group_id}/forum/topics", json=payload).status_code == 422


@pytest.mark.parametrize("payload", [{"body": " "}, {"body": "B" * 4001}, {"body": "Text", "author_username": "owner"}, {"body": 12}])
def test_reply_input_limits(forum_api, payload):
    client, _, group_id, _ = forum_api
    topic = open_topic(client, group_id)
    assert client.post(f"/forum/topics/{topic['id']}/posts", json=payload).status_code == 422


def test_topic_and_replies_share_a_persistent_per_class_rate_limit(forum_api):
    client, db, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    for index in range(9):
        assert client.post(f"/forum/topics/{topic['id']}/posts", json={"body": f"Reply {index}"}).status_code == 201
    limited = client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Over limit"})
    assert limited.status_code == 429
    assert limited.headers["Retry-After"] == "300"
    assert client.post(f"/groups/{group_id}/forum/topics", json={"title": "Over limit", "body": "Text"}).status_code == 429
    identity.update(username="student", groups=["studenti"])
    assert client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Another user"}).status_code == 201
    other = models.StudentGroup(code="GR-C4OTHER", name="Other", owner_username="owner")
    db.add(other)
    db.commit()
    identity.update(username="owner", groups=["docenti"])
    assert client.post(f"/groups/{other.id}/forum/topics", json={"title": "Other class", "body": "Text"}).status_code == 201
    from datetime import datetime, timedelta, timezone
    old = datetime.now(timezone.utc) - timedelta(minutes=6)
    db.query(models.ForumPost).update({models.ForumPost.created_at: old})
    db.query(models.ForumTopic).update({models.ForumTopic.created_at: old})
    db.commit()
    assert client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "After window"}).status_code == 201


def test_read_marker_requires_current_access_and_survives_refresh(forum_api):
    client, db, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    identity.update(username="student", groups=["studenti"])
    path = f"/forum/topics/{topic['id']}/read"
    assert client.post(path).status_code == 200
    assert client.post(path).status_code == 200
    assert db.query(models.ForumRead).filter_by(topic_id=topic["id"], username="student").count() == 1
    identity["username"] = "non-member"
    assert client.post(path).status_code == 403


def test_paginated_reads_preserve_chronological_posts(forum_api):
    client, _, group_id, _ = forum_api
    topic = open_topic(client, group_id)
    for body in ["First", "Second", "Third"]:
        assert client.post(f"/forum/topics/{topic['id']}/posts", json={"body": body}).status_code == 201
    first = client.get(f"/forum/topics/{topic['id']}?limit=2").json()
    second = client.get(f"/forum/topics/{topic['id']}?limit=2&offset=2").json()
    assert [post["body"] for post in first["posts"]] == ["First", "Second"]
    assert first["has_more"] is True
    assert [post["body"] for post in second["posts"]] == ["Third"]
    assert second["has_more"] is False


def test_deleted_class_cascades_forum_data(forum_api):
    client, db, group_id, _ = forum_api
    topic = open_topic(client, group_id)
    assert client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Reply"}).status_code == 201
    assert client.post(f"/forum/topics/{topic['id']}/read").status_code == 200
    assert client.delete(f"/admin/groups/{group_id}").status_code == 200
    assert db.query(models.ForumTopic).count() == db.query(models.ForumPost).count() == db.query(models.ForumRead).count() == 0


def test_existing_reserved_moderation_state_never_leaks_hidden_or_pending_text(forum_api):
    from datetime import datetime, timezone
    client, db, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    for body in ['Hidden body', 'Deleted body', 'Pending body']:
        assert client.post(f"/forum/topics/{topic['id']}/posts", json={'body': body}).status_code == 201
    posts = db.query(models.ForumPost).order_by(models.ForumPost.id).all()
    posts[0].hidden_at = datetime.now(timezone.utc)
    posts[1].deleted_at = datetime.now(timezone.utc)
    posts[2].status = 'pending'
    db.commit()
    identity.update(username='student', groups=['studenti'])
    detail = client.get(f"/forum/topics/{topic['id']}").json()
    assert [post['body'] for post in detail['posts']] == [None, None]
    assert detail['posts'][0]['hidden'] is True
    assert detail['posts'][1]['deleted'] is True
    db.get(models.ForumTopic, topic['id']).locked = True
    db.commit()
    assert client.post(f"/forum/topics/{topic['id']}/posts", json={'body': 'Locked'}).status_code == 403


def test_leaving_preserves_the_author_snapshot_for_current_members(forum_api):
    client, _, group_id, identity = forum_api
    topic = open_topic(client, group_id)
    identity.update(username='student', name='Student at posting', groups=['studenti'])
    assert client.post(f"/forum/topics/{topic['id']}/posts", json={'body': 'Still readable'}).status_code == 201
    membership = client.get('/user/groups').json()[0]['membership_id']
    assert client.delete(f'/user/groups/{membership}').status_code == 200
    assert client.get(f"/forum/topics/{topic['id']}").status_code == 403
    identity.update(username='owner', name='Renamed teacher', groups=['docenti'])
    detail = client.get(f"/forum/topics/{topic['id']}").json()
    assert detail['posts'][0]['body'] == 'Still readable'
    assert detail['posts'][0]['author_display_name'] == 'Student at posting'


def test_rate_limit_is_atomic_across_independent_worker_connections():
    import os
    import uuid
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import Session

    assert database.engine.url.database == 'counselorbot_test'
    url = os.environ['DATABASE_URL']
    schema = 'c4_forum_' + uuid.uuid4().hex
    root = create_engine(url)
    scoped = create_engine(url, connect_args={'options': f'-csearch_path={schema}'})
    try:
        with root.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        models.Base.metadata.create_all(scoped)
        def test_db():
            with Session(scoped) as db:
                yield db
        with Session(scoped) as db:
            group = models.StudentGroup(code='GR-C4RACE', name='Synthetic race', owner_username='owner')
            db.add(group)
            db.commit()
            group_id = group.id
        app = FastAPI()
        app.include_router(forum.router)
        app.dependency_overrides[database.get_db] = test_db
        app.dependency_overrides[auth.get_current_user] = lambda: {'username': 'owner', 'groups': ['docenti'], 'is_admin': False, 'authenticated': True}
        with TestClient(app) as client:
            topic = open_topic(client, group_id)
            for index in range(8):
                assert client.post(f"/forum/topics/{topic['id']}/posts", json={'body': f'Reply {index}'}).status_code == 201
            start = Barrier(2)
            def send(_):
                with TestClient(app) as writer:
                    start.wait(timeout=10)
                    return writer.post(f"/forum/topics/{topic['id']}/posts", json={'body': 'Concurrent reply'}).status_code
            with ThreadPoolExecutor(max_workers=2) as pool:
                assert sorted(pool.map(send, range(2))) == [201, 429]
            assert client.get(f"/forum/topics/{topic['id']}").json()['topic']['replies_count'] == 9
    finally:
        scoped.dispose()
        with root.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        root.dispose()


def test_unread_count_own_posts_excluded_and_mark_read(forum_api):
    client, db, group_id, identity = forum_api
    # Owner opens topic
    topic = open_topic(client, group_id)

    # Student has not read topic: 1 unread
    identity.update(username="student", name="Student", groups=["studenti"])
    unread = client.get("/user/forum/unread").json()
    assert unread["total"] == 1
    assert unread["by_group"][str(group_id)] == 1
    topics = client.get(f"/groups/{group_id}/forum/topics").json()["topics"]
    assert topics[0]["id"] == topic["id"]
    assert topics[0]["unread_count"] == 1

    # Owner wrote the topic: own posts excluded -> 0 unread
    identity.update(username="owner", name="Teacher Snapshot", groups=["docenti"])
    unread_owner = client.get("/user/forum/unread").json()
    assert unread_owner["total"] == 0
    assert unread_owner["by_group"][str(group_id)] == 0
    topics_owner = client.get(f"/groups/{group_id}/forum/topics").json()["topics"]
    assert topics_owner[0]["unread_count"] == 0

    # Student marks topic read
    identity.update(username="student", name="Student", groups=["studenti"])
    read_resp = client.post(f"/forum/topics/{topic['id']}/read")
    assert read_resp.status_code == 200
    unread_after_read = client.get("/user/forum/unread").json()
    assert unread_after_read["total"] == 0
    assert unread_after_read["by_group"][str(group_id)] == 0
    topics_after_read = client.get(f"/groups/{group_id}/forum/topics").json()["topics"]
    assert topics_after_read[0]["unread_count"] == 0

    # Owner adds a reply
    identity.update(username="owner", name="Teacher Snapshot", groups=["docenti"])
    reply = client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Teacher follow-up"})
    assert reply.status_code == 201

    # Student now has 1 unread (the new reply)
    identity.update(username="student", name="Student", groups=["studenti"])
    unread_new_post = client.get("/user/forum/unread").json()
    assert unread_new_post["total"] == 1
    assert unread_new_post["by_group"][str(group_id)] == 1
    topics_new_post = client.get(f"/groups/{group_id}/forum/topics").json()["topics"]
    assert topics_new_post[0]["unread_count"] == 1

    # Student adds a reply: student's own reply must not increment unread count for student
    reply_student = client.post(f"/forum/topics/{topic['id']}/posts", json={"body": "Student response"})
    assert reply_student.status_code == 201
    unread_after_own_reply = client.get("/user/forum/unread").json()
    assert unread_after_own_reply["total"] == 1
    assert unread_after_own_reply["by_group"][str(group_id)] == 1
    topics_after_own_reply = client.get(f"/groups/{group_id}/forum/topics").json()["topics"]
    assert topics_after_own_reply[0]["unread_count"] == 1

    # Student marks read again -> 0 unread
    assert client.post(f"/forum/topics/{topic['id']}/read").status_code == 200
    assert client.get("/user/forum/unread").json()["total"] == 0


def test_unread_count_hidden_and_pending_excluded_for_students(forum_api):
    from datetime import datetime, timezone
    client, db, group_id, identity = forum_api
    topic = open_topic(client, group_id)

    # Student reads the topic
    identity.update(username="student", name="Student", groups=["studenti"])
    assert client.post(f"/forum/topics/{topic['id']}/read").status_code == 200

    # Teacher posts 3 replies
    identity.update(username="owner", name="Teacher Snapshot", groups=["docenti"])
    for body in ["Pending reply", "Hidden reply", "Deleted reply"]:
        assert client.post(f"/forum/topics/{topic['id']}/posts", json={"body": body}).status_code == 201

    posts = db.query(models.ForumPost).filter(models.ForumPost.topic_id == topic["id"]).order_by(models.ForumPost.id).all()
    posts[0].status = "pending"
    posts[1].hidden_at = datetime.now(timezone.utc)
    posts[2].deleted_at = datetime.now(timezone.utc)
    db.commit()

    # For student: pending, hidden, and deleted are all excluded -> 0 unread
    identity.update(username="student", name="Student", groups=["studenti"])
    unread_student = client.get("/user/forum/unread").json()
    assert unread_student["total"] == 0
    assert unread_student["by_group"][str(group_id)] == 0
    topics_student = client.get(f"/groups/{group_id}/forum/topics").json()["topics"]
    assert topics_student[0]["unread_count"] == 0

    # For teacher/staff: pending reply by someone else?
    # Note: posts were authored by "owner". Let's test with a post authored by "student" that is pending:
    posts[0].author_username = "student"
    db.commit()

    identity.update(username="owner", name="Teacher Snapshot", groups=["docenti"])
    unread_owner = client.get("/user/forum/unread").json()
    # Teacher sees student's pending post as unread
    assert unread_owner["total"] == 1
    assert unread_owner["by_group"][str(group_id)] == 1

    # When pending post is approved/published:
    posts[0].status = "published"
    db.commit()

    # Student now sees the published post as unread
    identity.update(username="student", name="Student", groups=["studenti"])
    # But wait, student was author of posts[0], so student's own post is excluded.
    # Let's change author back to "other_student":
    posts[0].author_username = "other_student"
    db.commit()
    unread_student_after_pub = client.get("/user/forum/unread").json()
    assert unread_student_after_pub["total"] == 1
    assert unread_student_after_pub["by_group"][str(group_id)] == 1
    topics_after_pub = client.get(f"/groups/{group_id}/forum/topics").json()["topics"]
    assert topics_after_pub[0]["unread_count"] == 1

    # If the topic itself is hidden:
    db.get(models.ForumTopic, topic["id"]).hidden_at = datetime.now(timezone.utc)
    db.commit()
    # For student, hidden topic is completely excluded:
    unread_hidden_topic = client.get("/user/forum/unread").json()
    assert unread_hidden_topic["total"] == 0
    assert unread_hidden_topic["by_group"][str(group_id)] == 0


def test_unread_count_across_multiple_classes(forum_api):
    client, db, group_id, identity = forum_api
    # Create second class
    other_group = models.StudentGroup(code="GR-C4OTHER", name="Second class", owner_username="owner")
    db.add(other_group)
    db.flush()
    db.add(models.GroupMembership(group_id=other_group.id, username="student"))
    db.commit()

    # Topic in class 1
    topic1 = open_topic(client, group_id)
    # Topic in class 2
    topic2 = client.post(f"/groups/{other_group.id}/forum/topics", json={"title": "Class 2 Topic", "body": "Body 2"}).json()

    # Student checks /user/forum/unread: 1 in class 1 + 1 in class 2 = 2 total
    identity.update(username="student", name="Student", groups=["studenti"])
    unread = client.get("/user/forum/unread").json()
    assert unread["total"] == 2
    assert unread["by_group"][str(group_id)] == 1
    assert unread["by_group"][str(other_group.id)] == 1

    # Read topic 1
    assert client.post(f"/forum/topics/{topic1['id']}/read").status_code == 200
    unread_after = client.get("/user/forum/unread").json()
    assert unread_after["total"] == 1
    assert unread_after["by_group"][str(group_id)] == 0
    assert unread_after["by_group"][str(other_group.id)] == 1

    # Read topic 2
    assert client.post(f"/forum/topics/{topic2['id']}/read").status_code == 200
    unread_all = client.get("/user/forum/unread").json()
    assert unread_all["total"] == 0
    assert unread_all["by_group"][str(group_id)] == 0
    assert unread_all["by_group"][str(other_group.id)] == 0


def test_admin_badge_scoped_to_own_classes_only(forum_api):
    client, db, group_id, identity = forum_api
    # Topic created in group 1 (owned by "owner")
    open_topic(client, group_id)

    # An unrelated admin who has no own classes, shares, or memberships
    identity.update(username="unrelated_admin", name="Unrelated Admin", is_admin=True, groups=["admin"])
    unread = client.get("/user/forum/unread").json()
    assert unread["total"] == 0
    assert unread["by_group"] == {}

    # Admin CAN still access and view topic detail in group 1
    topics = client.get(f"/groups/{group_id}/forum/topics").json()["topics"]
    assert len(topics) == 1

    # When unrelated_admin creates their own class:
    own_group = models.StudentGroup(code="GR-ADMINOWN", name="Admin class", owner_username="unrelated_admin")
    db.add(own_group)
    db.flush()
    # Another user posts in this admin class:
    other_topic = models.ForumTopic(
        group_id=own_group.id, title="Admin Class Topic", body="Hello admin",
        author_username="someone_else", author_display_name="Someone Else",
    )
    db.add(other_topic)
    db.commit()

    # Now admin sees unread count only for their own class:
    admin_unread = client.get("/user/forum/unread").json()
    assert admin_unread["total"] == 1
    assert admin_unread["by_group"] == {str(own_group.id): 1}


def test_archived_classes_excluded_from_unread_badge(forum_api):
    client, db, group_id, identity = forum_api
    open_topic(client, group_id)

    # Student has 1 unread in active class
    identity.update(username="student", name="Student", groups=["studenti"])
    unread_active = client.get("/user/forum/unread").json()
    assert unread_active["total"] == 1
    assert unread_active["by_group"][str(group_id)] == 1

    # Archive the class (is_active = False)
    group = db.get(models.StudentGroup, group_id)
    group.is_active = False
    db.commit()

    # Student now gets 0 total and group is excluded from by_group
    unread_archived_student = client.get("/user/forum/unread").json()
    assert unread_archived_student["total"] == 0
    assert str(group_id) not in unread_archived_student["by_group"]

    # Teacher/owner also gets 0 total and group excluded from by_group
    identity.update(username="owner", name="Owner", is_admin=False, groups=["docenti"])
    unread_archived_teacher = client.get("/user/forum/unread").json()
    assert unread_archived_teacher["total"] == 0
    assert str(group_id) not in unread_archived_teacher["by_group"]


