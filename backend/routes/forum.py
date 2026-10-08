"""Class forum HTTP boundary. Forum content stays outside every AI pipeline."""
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert

from .. import auth, database, models
from ..forum_schemas import ForumHide, ForumPostCreate, ForumPostUpdate, ForumTopicCreate

router = APIRouter()


def _access(db: Session, identity: dict, group_id: int, *, write=False):
    query = db.query(models.StudentGroup).filter(models.StudentGroup.id == group_id)
    if write:
        query = query.with_for_update()
    group = query.first()
    if not group:
        raise HTTPException(403, "forum_access_denied")
    username = identity["username"]
    staff = bool(identity.get("is_admin")) or (
        (auth.is_teacher(identity.get("groups")) or identity.get("is_researcher")) and (
            group.owner_username == username or db.query(models.GroupShare.id).filter(
                models.GroupShare.group_id == group_id,
                models.GroupShare.shared_with_username == username.lower(),
            ).first() is not None
        )
    )
    member = db.query(models.GroupMembership.id).filter(
        models.GroupMembership.group_id == group_id, models.GroupMembership.username == username,
    ).first() is not None
    if not (staff or member):
        raise HTTPException(403, "forum_access_denied")
    if write and not group.is_active:
        raise HTTPException(403, "forum_archive")
    return group, staff


def _post(row, moderator=False, username=None):
    # Hidden content is visible to moderators only; author deletion is a
    # tombstone for everyone, moderators included.
    hidden = row.hidden_at is not None
    deleted = getattr(row, "deleted_at", None) is not None
    visible = not deleted and (moderator or not hidden)
    return {
        "id": row.id, "author_display_name": row.author_display_name,
        "body": row.body if visible else None,
        "hidden": hidden, "deleted": deleted,
        "hidden_reason": row.hidden_reason if moderator and hidden and not deleted else None,
        "own": username is not None and row.author_username == username,
        "created_at": row.created_at, "edited_at": row.edited_at,
    }


def _topic(db: Session, row, moderator=False, username=None):
    return {
        **_post(row, moderator, username), "group_id": row.group_id,
        "title": row.title if moderator or not row.hidden_at else None,
        "pinned": row.pinned, "locked": row.locked, "last_post_at": row.last_post_at,
        "replies_count": db.query(models.ForumPost).filter(
            models.ForumPost.topic_id == row.id, models.ForumPost.status == "published",
        ).count(),
    }


def _get_topic(db: Session, topic_id: int):
    topic = db.get(models.ForumTopic, topic_id, populate_existing=True)
    if not topic or topic.status != "published":
        raise HTTPException(403, "forum_access_denied")
    return topic


def _get_post(db: Session, post_id: int):
    post = db.get(models.ForumPost, post_id, populate_existing=True)
    if not post or post.status != "published":
        raise HTTPException(403, "forum_access_denied")
    return post, _get_topic(db, post.topic_id)


def _rate_limit(db: Session, group_id: int, username: str):
    # The parent class is already locked: counts and insert are atomic across
    # workers and cover both discussions and replies, without in-memory state.
    now = db.scalar(func.statement_timestamp())
    since = now - timedelta(minutes=5)
    topics = db.query(models.ForumTopic).filter(
        models.ForumTopic.group_id == group_id, models.ForumTopic.author_username == username,
        models.ForumTopic.created_at >= since,
    ).count()
    posts = db.query(models.ForumPost).join(models.ForumTopic).filter(
        models.ForumTopic.group_id == group_id, models.ForumPost.author_username == username,
        models.ForumPost.created_at >= since,
    ).count()
    if topics + posts >= 10:
        raise HTTPException(429, "forum_rate_limit", headers={"Retry-After": "300"})
    return now


@router.get("/groups/{group_id}/forum/topics")
def list_topics(group_id: int, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
                identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    group, staff = _access(db, identity, group_id)
    rows = db.query(models.ForumTopic).filter(
        models.ForumTopic.group_id == group_id, models.ForumTopic.status == "published",
    ).order_by(models.ForumTopic.pinned.desc(), models.ForumTopic.last_post_at.desc(), models.ForumTopic.id.desc()).offset(offset).limit(limit + 1).all()
    return {"group": {"id": group.id, "name": group.name, "is_active": group.is_active},
            "can_open_topic": staff and group.is_active, "can_moderate": staff,
            "topics": [_topic(db, row, staff, identity["username"]) for row in rows[:limit]], "has_more": len(rows) > limit}


@router.post("/groups/{group_id}/forum/topics", status_code=201)
def create_topic(group_id: int, payload: ForumTopicCreate,
                 identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    group, staff = _access(db, identity, group_id, write=True)
    if not staff:
        raise HTTPException(403, "forum_topic_staff_only")
    now = _rate_limit(db, group_id, identity["username"])
    row = models.ForumTopic(group_id=group.id, title=payload.title, body=payload.body,
                            created_at=now, last_post_at=now,
                            author_username=identity["username"], author_display_name=identity.get("name") or identity["username"])
    db.add(row)
    db.commit()
    db.refresh(row)
    return _topic(db, row, staff, identity["username"])


@router.get("/forum/topics/{topic_id}")
def topic_detail(topic_id: int, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
                 identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    topic = _get_topic(db, topic_id)
    group, staff = _access(db, identity, topic.group_id)
    posts = db.query(models.ForumPost).filter(
        models.ForumPost.topic_id == topic_id, models.ForumPost.status == "published",
    ).order_by(models.ForumPost.id).offset(offset).limit(limit + 1).all()
    username = identity["username"]
    return {"topic": _topic(db, topic, staff, username), "posts": [_post(row, staff, username) for row in posts[:limit]],
            "has_more": len(posts) > limit, "can_moderate": staff,
            "can_reply": bool(group.is_active and not topic.locked and not topic.hidden_at)}


@router.post("/forum/topics/{topic_id}/posts", status_code=201)
def create_post(topic_id: int, payload: ForumPostCreate,
                identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    topic = _get_topic(db, topic_id)
    _, staff = _access(db, identity, topic.group_id, write=True)
    # Refresh after the class lock: concurrent moderation can close the topic.
    db.refresh(topic)
    if topic.locked or topic.hidden_at or topic.status != "published":
        raise HTTPException(403, "forum_topic_closed")
    now = _rate_limit(db, topic.group_id, identity["username"])
    row = models.ForumPost(topic_id=topic.id, body=payload.body, author_username=identity["username"],
                           created_at=now,
                           author_display_name=identity.get("name") or identity["username"])
    topic.last_post_at = now
    db.add(row)
    db.commit()
    db.refresh(row)
    return _post(row, staff, identity["username"])


@router.post("/forum/topics/{topic_id}/read")
def mark_read(topic_id: int, identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    topic = _get_topic(db, topic_id)
    _access(db, identity, topic.group_id)
    statement = insert(models.ForumRead).values(topic_id=topic_id, username=identity["username"], last_read_at=func.statement_timestamp())
    db.execute(statement.on_conflict_do_update(
        index_elements=["topic_id", "username"], set_={"last_read_at": statement.excluded.last_read_at},
    ))
    db.commit()
    return {"ok": True}


def _author_target(db: Session, identity: dict, post_id: int):
    post, topic = _get_post(db, post_id)
    _, staff = _access(db, identity, topic.group_id, write=True)
    # Refresh after the class lock: concurrent moderation or deletion can race.
    db.refresh(post)
    db.refresh(topic)
    if post.author_username != identity["username"]:
        raise HTTPException(403, "forum_not_author")
    if post.deleted_at is not None:
        raise HTTPException(409, "forum_post_deleted")
    return post, topic, staff


@router.patch("/forum/posts/{post_id}")
def edit_post(post_id: int, payload: ForumPostUpdate,
              identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    post, topic, staff = _author_target(db, identity, post_id)
    if post.hidden_at is not None:
        raise HTTPException(409, "forum_post_hidden")
    if topic.locked or topic.hidden_at:
        raise HTTPException(403, "forum_topic_closed")
    post.body = payload.body
    post.edited_at = db.scalar(func.statement_timestamp())
    db.commit()
    db.refresh(post)
    return _post(post, staff, identity["username"])


@router.delete("/forum/posts/{post_id}")
def delete_post(post_id: int, identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    # The row stays for thread order and the class cascade, but its body is
    # never serialized again, to anyone.
    post, _, staff = _author_target(db, identity, post_id)
    post.deleted_at = db.scalar(func.statement_timestamp())
    db.commit()
    db.refresh(post)
    return _post(post, staff, identity["username"])


def _moderation_target(db: Session, identity: dict, kind: str, target_id: int):
    if kind == "topics":
        target = topic = _get_topic(db, target_id)
    else:
        target, topic = _get_post(db, target_id)
    _, staff = _access(db, identity, topic.group_id, write=True)
    if not staff:
        raise HTTPException(403, "forum_moderator_only")
    # Refresh after the class lock so concurrent moderators see each other.
    db.refresh(target)
    if getattr(target, "deleted_at", None) is not None:
        raise HTTPException(409, "forum_post_deleted")
    return target, topic


def _log(db: Session, identity: dict, group_id: int, action: str, kind: str, target_id: int, reason=None):
    # Ids and the moderator's reason only: message bodies never enter the log.
    now = db.scalar(func.statement_timestamp())
    db.add(models.ForumModerationLog(group_id=group_id, actor_username=identity["username"], action=action,
                                     target_kind=kind, target_id=target_id, reason=reason, created_at=now))
    return now


def _moderated(db: Session, identity: dict, kind: str, target):
    db.commit()
    db.refresh(target)
    username = identity["username"]
    return _topic(db, target, True, username) if kind == "topics" else _post(target, True, username)


@router.post("/teacher/forum/{kind}/{target_id}/hide")
def hide(kind: Literal["topics", "posts"], target_id: int, payload: ForumHide,
         identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    target, topic = _moderation_target(db, identity, kind, target_id)
    if target.hidden_at is not None:
        raise HTTPException(409, "forum_already_hidden")
    target.hidden_at = _log(db, identity, topic.group_id, "hide", kind[:-1], target.id, payload.reason)
    target.hidden_by = identity["username"]
    target.hidden_reason = payload.reason
    return _moderated(db, identity, kind, target)


@router.post("/teacher/forum/{kind}/{target_id}/restore")
def restore(kind: Literal["topics", "posts"], target_id: int,
            identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    target, topic = _moderation_target(db, identity, kind, target_id)
    if target.hidden_at is None:
        raise HTTPException(409, "forum_not_hidden")
    _log(db, identity, topic.group_id, "restore", kind[:-1], target.id)
    target.hidden_at = target.hidden_by = target.hidden_reason = None
    return _moderated(db, identity, kind, target)


def _toggle(field: str, value: bool, action: str):
    def endpoint(topic_id: int, identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
        topic, _ = _moderation_target(db, identity, "topics", topic_id)
        if getattr(topic, field) == value:
            raise HTTPException(409, "forum_state_unchanged")
        setattr(topic, field, value)
        _log(db, identity, topic.group_id, action, "topic", topic.id)
        return _moderated(db, identity, "topics", topic)
    endpoint.__name__ = f"{action}_topic"
    return endpoint


for _action, _field, _value in [("lock", "locked", True), ("unlock", "locked", False),
                                ("pin", "pinned", True), ("unpin", "pinned", False)]:
    router.add_api_route(f"/teacher/forum/topics/{{topic_id}}/{_action}", _toggle(_field, _value, _action), methods=["POST"])


@router.get("/teacher/groups/{group_id}/forum/log")
def moderation_log(group_id: int, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
                   identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    # Readable in archived classes too; there is deliberately no write route.
    _, staff = _access(db, identity, group_id)
    if not staff:
        raise HTTPException(403, "forum_moderator_only")
    rows = db.query(models.ForumModerationLog).filter(models.ForumModerationLog.group_id == group_id).order_by(
        models.ForumModerationLog.id.desc()).offset(offset).limit(limit + 1).all()
    return {"entries": [{"id": row.id, "actor_username": row.actor_username, "action": row.action,
                         "target_kind": row.target_kind, "target_id": row.target_id, "reason": row.reason,
                         "created_at": row.created_at} for row in rows[:limit]],
            "has_more": len(rows) > limit}
