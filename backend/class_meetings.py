"""Class and group meetings (#175): the target of `meeting` path steps.

A meeting belongs to one class or group. Students of that class see it and mark
their own attendance; the attendance is the step's completion evidence.
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from . import models


def meeting_target(db: Session, group_id: int, meeting_id: int, *, for_update=False) -> models.ClassMeeting:
    """A scheduled meeting of this class or group."""
    query = db.query(models.ClassMeeting).filter_by(id=meeting_id)
    if for_update:
        query = query.populate_existing().with_for_update()
    row = query.first()
    if not row or row.group_id != group_id:
        raise HTTPException(422, "meeting_class_mismatch")
    if row.status == "cancelled":
        raise HTTPException(409, "meeting_cancelled")
    return row


def meeting_summary(row: models.ClassMeeting) -> dict:
    return {"id": row.id, "group_id": row.group_id, "title": row.title, "description": row.description,
            "starts_at": row.starts_at.isoformat() if row.starts_at else None,
            "duration_minutes": row.duration_minutes, "mode": row.mode, "place": row.place, "link": row.link,
            "status": row.status, "cancelled_at": row.cancelled_at.isoformat() if row.cancelled_at else None,
            "revision": row.revision}


def attendance(db: Session, meeting_id: int, username: str) -> models.ClassMeetingAttendance | None:
    return db.query(models.ClassMeetingAttendance).filter_by(meeting_id=meeting_id, username=username).first()
