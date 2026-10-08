"""Class forum HTTP boundary. Forum content stays outside every AI pipeline."""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert

from .. import auth, database, models
from ..forum_schemas import ForumPostCreate, ForumTopicCreate
from .groups import _visible_group_query

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


def _post(row):
    # Reserved moderation fields are fail-closed, even before moderation UI ships.
    hidden = row.hidden_at is not None
    deleted = getattr(row, "deleted_at", None) is not None
    return {
        "id": row.id, "author_display_name": row.author_display_name,
        "body": None if hidden or deleted else row.body,
        "hidden": hidden, "deleted": deleted,
        "created_at": row.created_at, "edited_at": row.edited_at,
    }


def _topic(db: Session, row):
    return {
        **_post(row), "group_id": row.group_id,
        "title": None if row.hidden_at else row.title,
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
    selected = rows[:limit]
    unread_map = _unread_counts_for_topics(db, [r.id for r in selected], identity["username"], staff)
    topic_dicts = []
    for row in selected:
        item = _topic(db, row)
        item["unread_count"] = unread_map.get(row.id, 0)
        topic_dicts.append(item)
    return {"group": {"id": group.id, "name": group.name, "is_active": group.is_active},
            "can_open_topic": staff and group.is_active,
            "topics": topic_dicts, "has_more": len(rows) > limit}


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
    return _topic(db, row)


@router.get("/forum/topics/{topic_id}")
def topic_detail(topic_id: int, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
                 identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    topic = _get_topic(db, topic_id)
    group, _ = _access(db, identity, topic.group_id)
    posts = db.query(models.ForumPost).filter(
        models.ForumPost.topic_id == topic_id, models.ForumPost.status == "published",
    ).order_by(models.ForumPost.id).offset(offset).limit(limit + 1).all()
    return {"topic": _topic(db, topic), "posts": [_post(row) for row in posts[:limit]],
            "has_more": len(posts) > limit,
            "can_reply": bool(group.is_active and not topic.locked and not topic.hidden_at)}


@router.post("/forum/topics/{topic_id}/posts", status_code=201)
def create_post(topic_id: int, payload: ForumPostCreate,
                identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    topic = _get_topic(db, topic_id)
    _access(db, identity, topic.group_id, write=True)
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
    return _post(row)


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


def _unread_counts_for_topics(db: Session, topic_ids: list[int], username: str, is_staff: bool) -> dict[int, int]:
    if not topic_ids:
        return {}
    topic_query = (
        db.query(models.ForumTopic.id)
        .outerjoin(
            models.ForumRead,
            (models.ForumRead.topic_id == models.ForumTopic.id) & (models.ForumRead.username == username),
        )
        .filter(
            models.ForumTopic.id.in_(topic_ids),
            models.ForumTopic.author_username != username,
            models.ForumTopic.hidden_at.is_(None),
            or_(models.ForumRead.last_read_at.is_(None), models.ForumTopic.created_at > models.ForumRead.last_read_at),
        )
    )
    if is_staff:
        topic_query = topic_query.filter(models.ForumTopic.status.in_(["published", "pending"]))
    else:
        topic_query = topic_query.filter(models.ForumTopic.status == "published")
    unread_topic_ids = set(row[0] for row in topic_query.all())

    post_query = (
        db.query(models.ForumPost.topic_id, func.count(models.ForumPost.id))
        .join(models.ForumTopic, models.ForumPost.topic_id == models.ForumTopic.id)
        .outerjoin(
            models.ForumRead,
            (models.ForumRead.topic_id == models.ForumTopic.id) & (models.ForumRead.username == username),
        )
        .filter(
            models.ForumTopic.id.in_(topic_ids),
            models.ForumPost.author_username != username,
            models.ForumPost.deleted_at.is_(None),
            models.ForumPost.hidden_at.is_(None),
            models.ForumTopic.hidden_at.is_(None),
            or_(models.ForumRead.last_read_at.is_(None), models.ForumPost.created_at > models.ForumRead.last_read_at),
        )
    )
    if is_staff:
        post_query = post_query.filter(
            models.ForumTopic.status.in_(["published", "pending"]),
            models.ForumPost.status.in_(["published", "pending"]),
        )
    else:
        post_query = post_query.filter(
            models.ForumTopic.status == "published",
            models.ForumPost.status == "published",
        )
    post_counts = dict(post_query.group_by(models.ForumPost.topic_id).all())

    return {
        tid: (1 if tid in unread_topic_ids else 0) + post_counts.get(tid, 0)
        for tid in topic_ids
    }


def _user_forum_unread(db: Session, identity: dict) -> dict:
    username = identity["username"]
    is_teacher_or_researcher = auth.is_teacher(identity.get("groups")) or bool(identity.get("is_researcher")) or bool(identity.get("is_admin"))

    membership_ids = set(
        row[0] for row in db.query(models.GroupMembership.group_id)
        .join(models.StudentGroup, models.GroupMembership.group_id == models.StudentGroup.id)
        .filter(models.GroupMembership.username == username, models.StudentGroup.is_active.is_(True))
        .all()
    )

    staff_group_ids = set()
    if is_teacher_or_researcher:
        # Reuse _visible_group_query for staff classes; admins are scoped to own classes for unread badge
        staff_query = _visible_group_query(db, {**identity, "is_admin": False}).filter(
            models.StudentGroup.is_active.is_(True)
        )
        staff_group_ids = set(row[0] for row in staff_query.with_entities(models.StudentGroup.id).all())

    student_group_ids = membership_ids - staff_group_ids
    all_group_ids = staff_group_ids | student_group_ids
    by_group = {str(gid): 0 for gid in all_group_ids}

    def _accumulate(group_ids: set[int], staff_mode: bool):
        if not group_ids:
            return
        t_query = (
            db.query(models.ForumTopic.group_id, func.count(models.ForumTopic.id))
            .outerjoin(
                models.ForumRead,
                (models.ForumRead.topic_id == models.ForumTopic.id) & (models.ForumRead.username == username),
            )
            .filter(
                models.ForumTopic.group_id.in_(group_ids),
                models.ForumTopic.author_username != username,
                models.ForumTopic.hidden_at.is_(None),
                or_(models.ForumRead.last_read_at.is_(None), models.ForumTopic.created_at > models.ForumRead.last_read_at),
            )
        )
        if staff_mode:
            t_query = t_query.filter(models.ForumTopic.status.in_(["published", "pending"]))
        else:
            t_query = t_query.filter(models.ForumTopic.status == "published")
        for gid, count in t_query.group_by(models.ForumTopic.group_id).all():
            by_group[str(gid)] = by_group.get(str(gid), 0) + count

        p_query = (
            db.query(models.ForumTopic.group_id, func.count(models.ForumPost.id))
            .join(models.ForumTopic, models.ForumPost.topic_id == models.ForumTopic.id)
            .outerjoin(
                models.ForumRead,
                (models.ForumRead.topic_id == models.ForumTopic.id) & (models.ForumRead.username == username),
            )
            .filter(
                models.ForumTopic.group_id.in_(group_ids),
                models.ForumPost.author_username != username,
                models.ForumPost.deleted_at.is_(None),
                models.ForumPost.hidden_at.is_(None),
                models.ForumTopic.hidden_at.is_(None),
                or_(models.ForumRead.last_read_at.is_(None), models.ForumPost.created_at > models.ForumRead.last_read_at),
            )
        )
        if staff_mode:
            p_query = p_query.filter(
                models.ForumTopic.status.in_(["published", "pending"]),
                models.ForumPost.status.in_(["published", "pending"]),
            )
        else:
            p_query = p_query.filter(
                models.ForumTopic.status == "published",
                models.ForumPost.status == "published",
            )
        for gid, count in p_query.group_by(models.ForumTopic.group_id).all():
            by_group[str(gid)] = by_group.get(str(gid), 0) + count

    _accumulate(staff_group_ids, staff_mode=True)
    _accumulate(student_group_ids, staff_mode=False)

    return {"total": sum(by_group.values()), "by_group": by_group}


@router.get("/user/forum/unread")
def user_forum_unread(identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    return _user_forum_unread(db, identity)

