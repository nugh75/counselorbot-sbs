"""Teachers' personal API connections shared with a class (#201)."""
from datetime import datetime, timezone

from sqlalchemy import func

from . import models, personal_api

SWITCH_KEY = "class_api_sharing_enabled"
SHARE_ERROR = "personalAPI.errors.classShare"


def switch_on(db) -> bool:
    row = db.query(models.Config).filter_by(key=SWITCH_KEY).first()
    return bool(row and row.value == "true")


def enabled(db) -> bool:
    """Sharing needs both the personal API feature and its own administrator switch."""
    return personal_api.feature_enabled(db) and switch_on(db)


def set_switch(db, value: bool):
    row = db.query(models.Config).filter_by(key=SWITCH_KEY).first()
    if row is None:
        row = models.Config(key=SWITCH_KEY, description="Teachers may share a personal API connection with a class")
        db.add(row)
    row.value = "true" if value else "false"
    db.commit()


def share_for_student(db, username):
    """The share that answers for this student, or None.

    Only active classes count. When the student's classes share different
    connections the choice is ambiguous and the institution answers instead.
    """
    if not username or not enabled(db):
        return None
    from .auth import VIEW_AS_DEMO_ACCOUNTS
    if username in VIEW_AS_DEMO_ACCOUNTS:
        return None
    with db.no_autoflush:
        rows = (db.query(models.ClassAPIShare, models.GroupMembership.created_at)
                .join(models.GroupMembership, models.GroupMembership.group_id == models.ClassAPIShare.group_id)
                .join(models.StudentGroup, models.StudentGroup.id == models.ClassAPIShare.group_id)
                .filter(models.GroupMembership.username == username, models.StudentGroup.is_active.is_(True))
                .order_by(models.GroupMembership.created_at.desc()).all())
    if len({share.connection_id for share, _ in rows}) != 1:
        return None
    return rows[0][0]


def record_error(db, group_id, code):
    """Remember the last failure for the teacher, outside the caller's transaction."""
    from .chatgpt_connections import credential_session
    with credential_session(db) as private:
        private.query(models.ClassAPIShare).filter_by(group_id=group_id).update({"last_error": code[:64]})
        private.commit()


def month_usage(db, group_id):
    """Requests and recorded cost of this month through the class share."""
    start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    count, cost = (db.query(func.count(models.Log.id), func.coalesce(func.sum(models.Log.cost_usd), 0.0))
                   .filter(models.Log.timestamp >= start,
                           models.Log.details["shared_group_id"].as_string() == str(group_id)).one())
    return {"requests": int(count or 0), "cost_usd": round(float(cost or 0.0), 4)}
