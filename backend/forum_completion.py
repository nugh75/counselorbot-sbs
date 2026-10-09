"""Forum metadata reader for class-path forum steps (TF7, #154).

The only module outside the forum boundary allowed to query forum tables, and
only for identifiers, authors, status and timestamps: it never loads a whole
forum row, so titles, bodies, names and moderation reasons are never fetched.
Its single consumer is `path_step_types`; the privacy gate in
`tests/test_forum_privacy.py` enforces the column list and the consumer.
"""
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from . import models


def topic(db: Session, topic_id: int, *, for_update=False):
    """(id, group_id, status, hidden_at, locked) of one discussion, or None."""
    query = db.query(
        models.ForumTopic.id, models.ForumTopic.group_id, models.ForumTopic.status,
        models.ForumTopic.hidden_at, models.ForumTopic.locked,
    ).filter(models.ForumTopic.id == topic_id)
    if for_update:
        query = query.with_for_update()
    return query.first()


def _own_replies(db: Session, topic_id: int, username: str, since):
    return db.query(models.ForumPost.id).filter(
        models.ForumPost.topic_id == topic_id, models.ForumPost.author_username == username,
        models.ForumPost.deleted_at.is_(None), models.ForumPost.created_at >= since,
    )


def first_published_reply_at(db: Session, topic_id: int, username: str, since):
    """When the student's earliest qualifying reply there was written, or None.

    Published (pending moderation never counts), neither hidden nor deleted,
    written at or after the step's activation.
    """
    return _own_replies(db, topic_id, username, since).filter(
        models.ForumPost.status == "published", models.ForumPost.hidden_at.is_(None),
    ).with_entities(models.ForumPost.created_at).order_by(
        models.ForumPost.created_at, models.ForumPost.id).limit(1).scalar()


def student_state(db: Session, group_id: int, topic_id: int, username: str, since) -> dict:
    """What the student can do now in that discussion, as booleans only."""
    row = topic(db, topic_id)
    replies = _own_replies(db, topic_id, username, since)
    muted = db.query(models.ForumMute.id).filter(
        models.ForumMute.group_id == group_id, models.ForumMute.username == username,
        models.ForumMute.lifted_at.is_(None),
        or_(models.ForumMute.until.is_(None), models.ForumMute.until > func.statement_timestamp()),
    ).first() is not None
    return {
        "pending": replies.filter(models.ForumPost.status == "pending",
                                  models.ForumPost.hidden_at.is_(None)).first() is not None,
        "hidden": replies.filter(models.ForumPost.hidden_at.isnot(None)).first() is not None,
        "locked": bool(row and row.locked),
        "muted": muted,
    }
