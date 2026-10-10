"""Class forum HTTP boundary. Forum content stays outside every AI pipeline."""
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert

from .. import auth, database, models
from ..class_access import class_tool_enabled, forum_option, require_class_tool
from ..forum_schemas import ForumHide, ForumMuteCreate, ForumPostCreate, ForumPostUpdate, ForumTopicCreate
from ..group_visibility import _visible_group_query

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
    visible = not deleted and (moderator or not hidden) and (
        row.status == "published" or moderator or row.author_username == username)
    result = {
        "id": row.id, "author_display_name": row.author_display_name,
        "body": row.body if visible else None,
        "hidden": hidden, "deleted": deleted,
        "hidden_reason": row.hidden_reason if moderator and hidden and not deleted else None,
        "own": username is not None and row.author_username == username,
        "created_at": row.created_at, "edited_at": row.edited_at, "status": row.status,
    }
    if moderator:
        result["author_username"] = row.author_username
    return result


def _step_targets(db: Session, group_id: int):
    return db.query(models.ClassPathStep, models.ClassPath).join(
        models.ClassPath, models.ClassPath.id == models.ClassPathStep.path_id,
    ).filter(models.ClassPath.group_id == group_id)


def _assignment_targets(db: Session, group_id: int):
    # Class-wide assignments only: every member reads the discussion, so a
    # link to an individual assignment would disclose who received it.
    return db.query(models.TeacherAssignment).filter(
        models.TeacherAssignment.group_id == group_id, models.TeacherAssignment.recipient_username.is_(None),
    )


def _open_steps(query):
    return query.filter(models.ClassPath.status == "published", models.ClassPathStep.removed_at.is_(None))


def _open_assignments(query):
    return query.filter(models.TeacherAssignment.revoked_at.is_(None))


def _target(kind: str, row, path=None):
    if kind == "path_step":
        return {"kind": kind, "id": row.id, "title": row.title, "tool_key": row.tool_key, "path_title": path.title}
    return {"kind": kind, "id": row.id, "title": (row.snapshot or {}).get("title"), "tool_key": None, "path_title": None}


def _link(db: Session, topic):
    """Resolved on read: archived paths, removed steps and revoked assignments become unavailable."""
    if topic.link_kind is None:
        return None
    if topic.link_kind == "path_step":
        found = _step_targets(db, topic.group_id).filter(models.ClassPathStep.id == topic.link_id).first()
        if found:
            step, path = found
            return {**_target("path_step", step, path), "available": path.status == "published" and step.removed_at is None}
    else:
        row = _assignment_targets(db, topic.group_id).filter(models.TeacherAssignment.id == topic.link_id).first()
        if row:
            return {**_target("assignment", row), "available": row.revoked_at is None}
    return {"kind": topic.link_kind, "id": topic.link_id, "available": False, "title": None, "tool_key": None, "path_title": None}


def _topic(db: Session, row, moderator=False, username=None):
    # Pending topics (#104) stay private to their author and moderators.
    visible = moderator or (not row.hidden_at and (row.status == "published" or row.author_username == username))
    return {
        **_post(row, moderator, username), "group_id": row.group_id,
        "title": row.title if visible else None,
        "link": _link(db, row) if visible else None,
        "pinned": row.pinned, "locked": row.locked, "last_post_at": row.last_post_at,
        "replies_count": db.query(models.ForumPost).filter(
            models.ForumPost.topic_id == row.id, models.ForumPost.status == "published",
        ).count(),
    }


def _get_topic(db: Session, topic_id: int):
    topic = db.get(models.ForumTopic, topic_id, populate_existing=True)
    if not topic or topic.status not in {"published", "pending"}:
        raise HTTPException(403, "forum_access_denied")
    return topic


def _get_post(db: Session, post_id: int):
    post = db.get(models.ForumPost, post_id, populate_existing=True)
    if not post or post.status not in {"published", "pending"}:
        raise HTTPException(403, "forum_access_denied")
    return post, _get_topic(db, post.topic_id)


def _visible_status(model, staff, username):
    if staff:
        return model.status.in_(["published", "pending"])
    return or_(model.status == "published", (model.status == "pending") & (model.author_username == username))


def _active_mutes(db, group_id, username=None):
    query = db.query(models.ForumMute).filter(
        models.ForumMute.group_id == group_id, models.ForumMute.lifted_at.is_(None),
        or_(models.ForumMute.until.is_(None), models.ForumMute.until > func.statement_timestamp()))
    return query.filter(models.ForumMute.username == username) if username is not None else query


def _forum_state(db, identity, group_id, staff):
    settings = db.get(models.ClassSettings, group_id)
    mute = None if staff else _active_mutes(db, group_id, identity["username"]).first()
    return {"forum_enabled": class_tool_enabled(db, identity, group_id, "forum"),
            "premoderated": forum_option(settings, "premoderation")[0],
            "mute": {"until": mute.until} if mute else None}


def _student_write(db, identity, group_id, staff):
    require_class_tool(db, identity, group_id, "forum")
    if not staff and _active_mutes(db, group_id, identity["username"]).first():
        raise HTTPException(403, "forum_muted")
    return "pending" if not staff and forum_option(db.get(models.ClassSettings, group_id), "premoderation")[0] else "published"


def _check_pending_visibility(topic, staff, username):
    if topic.status == "pending" and not staff and topic.author_username != username:
        raise HTTPException(403, "forum_access_denied")


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
        models.ForumTopic.group_id == group_id, _visible_status(models.ForumTopic, False, identity["username"]),
    ).order_by(models.ForumTopic.pinned.desc(), models.ForumTopic.last_post_at.desc(), models.ForumTopic.id.desc()).offset(offset).limit(limit + 1).all()
    selected = rows[:limit]
    unread_map = _unread_counts_for_topics(db, [r.id for r in selected], identity["username"], staff)
    topic_dicts = []
    for row in selected:
        item = _topic(db, row, staff, identity["username"])
        item["unread_count"] = unread_map.get(row.id, 0)
        topic_dicts.append(item)
    state = _forum_state(db, identity, group_id, staff)
    can_open = staff or forum_option(db.get(models.ClassSettings, group_id), "students_can_open")[0]
    return {"group": {"id": group.id, "name": group.name, "is_active": group.is_active}, **state,
            "can_open_topic": bool(can_open and group.is_active and state["forum_enabled"] and not state["mute"]), "can_moderate": staff,
            "pending_count": _pending_count(db, group_id) if staff else 0,
            "topics": topic_dicts, "has_more": len(rows) > limit}


@router.post("/groups/{group_id}/forum/topics", status_code=201)
def create_topic(group_id: int, payload: ForumTopicCreate,
                 identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    group, staff = _access(db, identity, group_id, write=True)
    status = _student_write(db, identity, group_id, staff)
    if not staff and not forum_option(db.get(models.ClassSettings, group_id), "students_can_open")[0]:
        raise HTTPException(403, "forum_topic_staff_only")
    if payload.link_kind is not None:
        # Only teachers link discussions (plan decision 19), to current targets of this
        # class; this keeps holding once students may open discussions (#104).
        if not staff:
            raise HTTPException(403, "forum_moderator_only")
        if payload.link_kind == "path_step":
            target = _open_steps(_step_targets(db, group_id)).filter(models.ClassPathStep.id == payload.link_id)
        else:
            target = _open_assignments(_assignment_targets(db, group_id)).filter(models.TeacherAssignment.id == payload.link_id)
        if target.first() is None:
            raise HTTPException(422, "forum_link_invalid")
    now = _rate_limit(db, group_id, identity["username"])
    row = models.ForumTopic(group_id=group.id, title=payload.title, body=payload.body, status=status,
                            link_kind=payload.link_kind, link_id=payload.link_id,
                            created_at=now, last_post_at=now,
                            author_username=identity["username"], author_display_name=identity.get("name") or identity["username"])
    db.add(row)
    db.commit()
    db.refresh(row)
    return _topic(db, row, staff, identity["username"])


def create_path_topic(db: Session, group_id: int, identity: dict, title: str, body: str) -> int:
    """Publication of a path applied from a template: the teacher's own discussion (#172).

    Write-only seam: the title and body come from the template, never from forum rows."""
    now = db.scalar(func.statement_timestamp())
    row = models.ForumTopic(group_id=group_id, title=title, body=body, status="published",
                            created_at=now, last_post_at=now, author_username=identity["username"],
                            author_display_name=identity.get("name") or identity["username"])
    db.add(row)
    db.flush()
    return row.id


@router.get("/groups/{group_id}/forum/link-targets")
def link_targets(group_id: int, identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    _, staff = _access(db, identity, group_id)
    if not staff:
        raise HTTPException(403, "forum_moderator_only")
    steps = _open_steps(_step_targets(db, group_id)).order_by(
        models.ClassPath.id, models.ClassPathStep.position, models.ClassPathStep.id).all()
    assignments = _open_assignments(_assignment_targets(db, group_id)).order_by(models.TeacherAssignment.id.desc()).all()
    return {"targets": [_target("path_step", step, path) for step, path in steps]
            + [_target("assignment", row) for row in assignments]}


@router.get("/user/forum/links")
def user_forum_links(identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    # Current memberships and class staff only: the resource views must never
    # expose a discussion the viewer cannot read.
    memberships = db.query(models.GroupMembership.group_id).filter(models.GroupMembership.username == identity["username"])
    visible = models.ForumTopic.group_id.in_(memberships)
    if identity.get("is_admin") or auth.is_teacher(identity.get("groups")) or identity.get("is_researcher"):
        staff_groups = _visible_group_query(db, identity).with_entities(models.StudentGroup.id)
        visible = or_(visible, models.ForumTopic.group_id.in_(staff_groups))
    rows = db.query(models.ForumTopic).filter(
        visible, models.ForumTopic.status == "published",
        models.ForumTopic.hidden_at.is_(None), models.ForumTopic.link_kind.isnot(None),
    ).order_by(models.ForumTopic.id.desc()).all()
    return {"links": [{"kind": row.link_kind, "id": row.link_id, "topic_id": row.id, "group_id": row.group_id} for row in rows]}


@router.get("/forum/topics/{topic_id}")
def topic_detail(topic_id: int, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
                 identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    topic = _get_topic(db, topic_id)
    group, staff = _access(db, identity, topic.group_id)
    _check_pending_visibility(topic, staff, identity["username"])
    posts = db.query(models.ForumPost).filter(
        models.ForumPost.topic_id == topic_id, _visible_status(models.ForumPost, staff, identity["username"]),
    ).order_by(models.ForumPost.id).offset(offset).limit(limit + 1).all()
    username = identity["username"]
    state = _forum_state(db, identity, topic.group_id, staff)
    return {"topic": _topic(db, topic, staff, username), "posts": [_post(row, staff, username) for row in posts[:limit]],
            "has_more": len(posts) > limit, "can_moderate": staff, **state,
            "can_reply": bool(group.is_active and topic.status == "published" and not topic.locked and not topic.hidden_at
                              and state["forum_enabled"] and not state["mute"])}


@router.post("/forum/topics/{topic_id}/posts", status_code=201)
def create_post(topic_id: int, payload: ForumPostCreate,
                identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    topic = _get_topic(db, topic_id)
    _, staff = _access(db, identity, topic.group_id, write=True)
    status = _student_write(db, identity, topic.group_id, staff)
    # Refresh after the class lock: concurrent moderation can close the topic.
    db.refresh(topic)
    if topic.locked or topic.hidden_at or topic.status != "published":
        raise HTTPException(403, "forum_topic_closed")
    now = _rate_limit(db, topic.group_id, identity["username"])
    row = models.ForumPost(topic_id=topic.id, body=payload.body, status=status, author_username=identity["username"],
                           created_at=now,
                           author_display_name=identity.get("name") or identity["username"])
    if status == "published":
        topic.last_post_at = now
    db.add(row)
    db.commit()
    db.refresh(row)
    return _post(row, staff, identity["username"])


@router.post("/forum/topics/{topic_id}/read")
def mark_read(topic_id: int, identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    topic = _get_topic(db, topic_id)
    _, staff = _access(db, identity, topic.group_id)
    _check_pending_visibility(topic, staff, identity["username"])
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
    status = _student_write(db, identity, topic.group_id, staff)
    if post.hidden_at is not None:
        raise HTTPException(409, "forum_post_hidden")
    if topic.locked or topic.hidden_at:
        raise HTTPException(403, "forum_topic_closed")
    post.body = payload.body
    post.status = status
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


def _moderation_target(db: Session, identity: dict, kind: str, target_id: int, *, pending=False):
    if kind == "topics":
        target = topic = _get_topic(db, target_id)
    else:
        target, topic = _get_post(db, target_id)
    _, staff = _access(db, identity, topic.group_id, write=True)
    if not staff:
        raise HTTPException(403, "forum_moderator_only")
    # Refresh after the class lock so concurrent moderators see each other.
    db.refresh(target)
    if not pending and target.status != "published":
        raise HTTPException(409, "forum_pending")
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


def _pending_queries(db, group_id):
    topics = db.query(models.ForumTopic).filter(models.ForumTopic.group_id == group_id,
        models.ForumTopic.status == "pending", models.ForumTopic.hidden_at.is_(None))
    posts = db.query(models.ForumPost).join(models.ForumTopic).filter(models.ForumTopic.group_id == group_id,
        models.ForumTopic.status == "published", models.ForumTopic.hidden_at.is_(None),
        models.ForumPost.status == "pending", models.ForumPost.hidden_at.is_(None), models.ForumPost.deleted_at.is_(None))
    return topics, posts


def _pending_count(db, group_id):
    topics, posts = _pending_queries(db, group_id)
    return topics.count() + posts.count()


@router.get("/teacher/groups/{group_id}/forum/pending")
def pending_messages(group_id: int, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
                     identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    _, staff = _access(db, identity, group_id)
    if not staff:
        raise HTTPException(403, "forum_moderator_only")
    topic_query, post_query = _pending_queries(db, group_id)
    topics = topic_query.order_by(models.ForumTopic.id).offset(offset).limit(limit + 1).all()
    posts = post_query.order_by(models.ForumPost.id).offset(offset).limit(limit + 1).all()
    return {"topics": [_topic(db, row, True, identity["username"]) for row in topics[:limit]],
            "posts": [{**_post(row, True, identity["username"]), "topic_id": row.topic_id,
                       "topic_title": db.get(models.ForumTopic, row.topic_id).title} for row in posts[:limit]],
            "has_more": len(topics) > limit or len(posts) > limit}


def _pending_target(db, identity, kind, target_id):
    target, topic = _moderation_target(db, identity, kind, target_id, pending=True)
    if target.status != "pending" or target.hidden_at is not None:
        raise HTTPException(409, "forum_not_pending")
    if kind == "posts" and (topic.status != "published" or topic.hidden_at is not None):
        raise HTTPException(409, "forum_topic_closed")
    return target, topic


@router.post("/teacher/forum/{kind}/{target_id}/approve")
def approve(kind: Literal["topics", "posts"], target_id: int,
            identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    target, topic = _pending_target(db, identity, kind, target_id)
    target.status = "published"
    topic.last_post_at = _log(db, identity, topic.group_id, "approve", kind[:-1], target.id)
    return _moderated(db, identity, kind, target)


@router.post("/teacher/forum/{kind}/{target_id}/reject")
def reject(kind: Literal["topics", "posts"], target_id: int, payload: ForumHide,
           identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    target, topic = _pending_target(db, identity, kind, target_id)
    target.hidden_at = _log(db, identity, topic.group_id, "reject", kind[:-1], target.id, payload.reason)
    target.hidden_by, target.hidden_reason = identity["username"], payload.reason
    return _moderated(db, identity, kind, target)


def _mute(row):
    return {"id": row.id, "username": row.username, "reason": row.reason, "until": row.until,
            "muted_by": row.muted_by, "created_at": row.created_at, "lifted_at": row.lifted_at}


@router.get("/teacher/groups/{group_id}/forum/mutes")
def list_mutes(group_id: int, identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    _, staff = _access(db, identity, group_id)
    if not staff:
        raise HTTPException(403, "forum_moderator_only")
    return {"mutes": [_mute(row) for row in _active_mutes(db, group_id).order_by(models.ForumMute.id).all()]}


@router.post("/teacher/groups/{group_id}/forum/mutes", status_code=201)
def create_mute(group_id: int, payload: ForumMuteCreate,
                identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    group, staff = _access(db, identity, group_id, write=True)
    if not staff:
        raise HTTPException(403, "forum_moderator_only")
    member = db.query(models.GroupMembership.id).filter(models.GroupMembership.group_id == group_id,
        models.GroupMembership.username == payload.username).first()
    shared = db.query(models.GroupShare.id).filter(models.GroupShare.group_id == group_id,
        models.GroupShare.shared_with_username == payload.username.lower()).first()
    if not member or payload.username == group.owner_username or shared:
        raise HTTPException(422, "forum_mute_student_only")
    if _active_mutes(db, group_id, payload.username).first():
        raise HTTPException(409, "forum_already_muted")
    row = models.ForumMute(group_id=group_id, username=payload.username, muted_by=identity["username"],
                           reason=payload.reason, until=payload.until)
    db.add(row)
    db.flush()
    _log(db, identity, group_id, "mute", "user", row.id, payload.reason)
    db.commit()
    db.refresh(row)
    return _mute(row)


@router.delete("/teacher/groups/{group_id}/forum/mutes/{mute_id}")
def lift_mute(group_id: int, mute_id: int,
              identity=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    _, staff = _access(db, identity, group_id, write=True)
    if not staff:
        raise HTTPException(403, "forum_moderator_only")
    row = db.get(models.ForumMute, mute_id, populate_existing=True)
    if not row or row.group_id != group_id:
        raise HTTPException(403, "forum_access_denied")
    if row.lifted_at is not None:
        raise HTTPException(409, "forum_not_muted")
    row.lifted_at = _log(db, identity, group_id, "unmute", "user", row.id)
    db.commit()
    db.refresh(row)
    return _mute(row)
