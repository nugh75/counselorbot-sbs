"""Teachers offer their API-backed counselors to the students of their classes.

A teacher ticks one flag on their "APIs and ChatGPT" page. Every counselor they bound
to one of their API connections then answers their students through that connection;
students never see the key. ChatGPT subscriptions are never offered.
"""
from datetime import UTC, datetime, timezone

from sqlalchemy import func, or_

from . import models, personal_api

SWITCH_KEY = "class_api_sharing_enabled"
SHARE_ERROR = "personalAPI.errors.classShare"


def switch_on(db) -> bool:
    row = db.query(models.Config).filter_by(key=SWITCH_KEY).first()
    return bool(row and row.value == "true")


def enabled(db) -> bool:
    """Offering needs both the personal API feature and its own administrator switch."""
    return personal_api.feature_enabled(db) and switch_on(db)


def set_switch(db, value: bool):
    row = db.query(models.Config).filter_by(key=SWITCH_KEY).first()
    if row is None:
        row = models.Config(key=SWITCH_KEY, description="Teachers may offer their API-backed counselors to their classes")
        db.add(row)
    row.value = "true" if value else "false"
    db.commit()


def _teachers_of(db, student):
    """Owners and co-teachers of the student's active classes."""
    groups = [gid for (gid,) in db.query(models.GroupMembership.group_id)
              .join(models.StudentGroup, models.StudentGroup.id == models.GroupMembership.group_id)
              .filter(models.GroupMembership.username == student, models.StudentGroup.is_active.is_(True))]
    if not groups:
        return set()
    owners = {u for (u,) in db.query(models.StudentGroup.owner_username).filter(models.StudentGroup.id.in_(groups))}
    shared = {u for (u,) in db.query(models.GroupShare.shared_with_username).filter(models.GroupShare.group_id.in_(groups))}
    return {u for u in owners | shared if u and u != student}


def offers(db, student):
    """{counselor_id: (teacher, connection_id, reasoning)} offered to this student.

    A counselor offered by two teachers with different connections is ambiguous
    and left to the institution.
    """
    from .auth import VIEW_AS_DEMO_ACCOUNTS
    if not student or student in VIEW_AS_DEMO_ACCOUNTS or not enabled(db):
        return {}
    with db.no_autoflush:
        teachers = _teachers_of(db, student)
        if not teachers:
            return {}
        rows = (db.query(models.PersonalCounselorConnection)
                .join(models.PersonalAIRouting, models.PersonalAIRouting.username == models.PersonalCounselorConnection.username)
                .join(models.PersonalAPIConnection, models.PersonalAPIConnection.id == models.PersonalCounselorConnection.connection_id)
                .filter(models.PersonalCounselorConnection.username.in_(teachers),
                        models.PersonalAIRouting.share_with_classes.is_(True)).all())
    found, conflicts = {}, set()
    for row in rows:
        previous = found.get(row.counselor_id)
        if previous and previous[1] != row.connection_id:
            conflicts.add(row.counselor_id)
        found[row.counselor_id] = (row.username, row.connection_id, row.reasoning)
    return {cid: offer for cid, offer in found.items() if cid not in conflicts}


def offered_private_counselors(db, student):
    """Teachers' own counselors that become visible to this student."""
    ids = list(offers(db, student))
    if not ids:
        return []
    owners = {teacher for teacher, _, _ in offers(db, student).values()}
    return [cid for (cid,) in db.query(models.Counselor.id).filter(
        models.Counselor.id.in_(ids), models.Counselor.owner_username.in_(owners))]


def record_error(db, teacher, code):
    """Remember the last failure for the teacher, outside the caller's transaction."""
    from .chatgpt_connections import credential_session
    with credential_session(db) as private:
        private.query(models.PersonalAIRouting).filter_by(username=teacher).update({"share_last_error": code[:64]})
        private.commit()


def month_usage(db, teacher):
    """Requests and recorded cost of this month made by students through the teacher's counselors."""
    start = datetime.now(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    count, cost = (db.query(func.count(models.Log.id), func.coalesce(func.sum(models.Log.cost_usd), 0.0))
                   .filter(models.Log.timestamp >= start,
                           models.Log.details["shared_owner"].as_string() == teacher).one())
    return {"requests": int(count or 0), "cost_usd": round(float(cost or 0.0), 4)}
