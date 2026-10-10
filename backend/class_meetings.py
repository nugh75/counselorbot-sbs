"""Class and group meetings (#175): the target of `meeting` path steps.

A meeting belongs to one class or group. Students of that class see it and mark
their own attendance; the attendance is the step's completion evidence.
"""
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
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
            "revision": row.revision, "kind": row.kind, "host_kind": row.host_kind,
            "host_name": row.host_name, "host_role": row.host_role}


def attendance(db: Session, meeting_id: int, username: str) -> models.ClassMeetingAttendance | None:
    return db.query(models.ClassMeetingAttendance).filter_by(meeting_id=meeting_id, username=username).first()


def slots(db: Session, meeting_id: int) -> list[models.ClassMeetingSlot]:
    return (db.query(models.ClassMeetingSlot).filter_by(meeting_id=meeting_id)
            .order_by(models.ClassMeetingSlot.starts_at, models.ClassMeetingSlot.id).all())


def active_bookings(db: Session, meeting_id: int) -> dict[int, models.ClassMeetingBooking]:
    """Active bookings of a meeting, by slot."""
    rows = db.query(models.ClassMeetingBooking).filter_by(meeting_id=meeting_id, status="active").all()
    return {row.slot_id: row for row in rows}


def my_booking(db: Session, meeting_id: int, username: str, *, for_update=False):
    query = db.query(models.ClassMeetingBooking).filter_by(meeting_id=meeting_id, username=username, status="active")
    if for_update:
        query = query.populate_existing().with_for_update()
    return query.first()


def book_slot(db: Session, meeting: models.ClassMeeting, slot_id: int, username: str) -> models.ClassMeetingBooking:
    """Book or change the student's slot; a slot taken meanwhile is refused.

    The slot row is locked first, so concurrent bookings of one slot run one at a
    time; the partial unique indexes stop any booking that slips past the check.
    """
    if meeting.kind != "individual" or meeting.status != "scheduled":
        raise HTTPException(409, "meeting_not_bookable")
    slot = (db.query(models.ClassMeetingSlot).filter_by(id=slot_id, meeting_id=meeting.id)
            .populate_existing().with_for_update().first())
    if slot is None or slot.status != "open" or slot.starts_at <= datetime.now(timezone.utc):
        raise HTTPException(409, "slot_unavailable")
    taken = db.query(models.ClassMeetingBooking).filter_by(slot_id=slot.id, status="active").first()
    if taken is not None and taken.username != username:
        raise HTTPException(409, "slot_taken")
    booking = my_booking(db, meeting.id, username, for_update=True)
    if booking is not None and booking.slot_id == slot.id:
        return booking
    if booking is not None:
        booking.slot_id, booking.changed_at = slot.id, datetime.now(timezone.utc)
    else:
        booking = models.ClassMeetingBooking(meeting_id=meeting.id, slot_id=slot.id, username=username, status="active")
        db.add(booking)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "slot_taken") from None
    return booking
