"""Class and group meetings (#175): the teacher plans them, students mark attendance."""
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..class_meetings import attendance, meeting_summary
from ..goals import membership_ids
from .groups import _require_visible_group, _username

router = APIRouter()
get_db = database.get_db


class MeetingWrite(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=3000)
    starts_at: AwareDatetime
    duration_minutes: Optional[int] = Field(default=None, ge=5, le=600)
    mode: Literal["in_person", "online"]
    place: Optional[str] = Field(default=None, max_length=300)
    link: Optional[str] = Field(default=None, max_length=500, pattern=r"^https?://\S+$")

    @model_validator(mode="after")
    def where(self):
        # In person needs a place, online needs a link; the other one is dropped.
        if self.mode == "in_person":
            if not self.place:
                raise ValueError("meeting_place_required")
            self.link = None
        else:
            if not self.link:
                raise ValueError("meeting_link_required")
            self.place = None
        return self


class MeetingUpdate(MeetingWrite):
    revision: int = Field(ge=1, strict=True)


class MeetingCancel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=1, strict=True)


def _teacher_meeting(db: Session, identity, meeting_id: int) -> models.ClassMeeting:
    row = db.query(models.ClassMeeting).filter_by(id=meeting_id).populate_existing().with_for_update().first()
    # One answer for missing meetings and meetings of classes the teacher cannot see.
    if row is None:
        raise HTTPException(404, "meeting_not_found")
    try:
        _require_visible_group(db, identity, row.group_id)
    except HTTPException:
        raise HTTPException(404, "meeting_not_found") from None
    return row


def _teacher_record(db: Session, row: models.ClassMeeting) -> dict:
    return {**meeting_summary(row), "organizer_username": row.organizer_username,
            "manager_username": row.manager_username,
            "attendance_count": db.query(models.ClassMeetingAttendance).filter_by(meeting_id=row.id).count()}


def _apply(row: models.ClassMeeting, payload: MeetingWrite) -> None:
    row.title, row.starts_at, row.duration_minutes = payload.title, payload.starts_at, payload.duration_minutes
    row.description = (payload.description or "").strip() or None
    row.mode, row.place, row.link = payload.mode, payload.place, payload.link


@router.get("/teacher/groups/{group_id}/meetings")
def list_meetings(group_id: int, identity=Depends(auth.get_current_plan_manager), db: Session = Depends(get_db)):
    _require_visible_group(db, identity, group_id)
    rows = (db.query(models.ClassMeeting).filter_by(group_id=group_id)
            .order_by(models.ClassMeeting.starts_at.desc(), models.ClassMeeting.id.desc()).all())
    return [_teacher_record(db, row) for row in rows]


@router.post("/teacher/groups/{group_id}/meetings", status_code=201)
def create_meeting(group_id: int, payload: MeetingWrite, identity=Depends(auth.get_current_plan_manager),
                   db: Session = Depends(get_db)):
    group = _require_visible_group(db, identity, group_id)
    if not group.is_active:
        raise HTTPException(409, "meeting_class_inactive")
    username = _username(identity) or ""
    # Today the teacher both organises and manages; the fields stay apart for a future role.
    row = models.ClassMeeting(group_id=group.id, organizer_username=username, manager_username=username,
                              status="scheduled", revision=1)
    _apply(row, payload)
    db.add(row)
    db.commit()
    return _teacher_record(db, row)


@router.put("/teacher/meetings/{meeting_id}")
def update_meeting(meeting_id: int, payload: MeetingUpdate, identity=Depends(auth.get_current_plan_manager),
                   db: Session = Depends(get_db)):
    row = _teacher_meeting(db, identity, meeting_id)
    if payload.revision != row.revision:
        raise HTTPException(409, "meeting_revision_conflict")
    if row.status == "cancelled":
        raise HTTPException(409, "meeting_cancelled")
    # A date change keeps the attendance already marked: the meeting is the same.
    _apply(row, payload)
    row.revision += 1
    db.commit()
    return _teacher_record(db, row)


@router.post("/teacher/meetings/{meeting_id}/cancel")
def cancel_meeting(meeting_id: int, payload: MeetingCancel, identity=Depends(auth.get_current_plan_manager),
                   db: Session = Depends(get_db)):
    row = _teacher_meeting(db, identity, meeting_id)
    if payload.revision != row.revision:
        raise HTTPException(409, "meeting_revision_conflict")
    if row.status != "cancelled":
        row.status, row.cancelled_at = "cancelled", datetime.now(timezone.utc)
        row.revision += 1
    db.commit()
    return _teacher_record(db, row)


def _student_meeting(db: Session, identity, meeting_id: int) -> models.ClassMeeting:
    row = db.query(models.ClassMeeting).filter(
        models.ClassMeeting.id == meeting_id,
        models.ClassMeeting.group_id.in_(membership_ids(db, _username(identity) or "")),
    ).first()
    # Non-members and missing meetings get the same answer: no existence oracle.
    if row is None:
        raise HTTPException(403, "meeting_unavailable")
    return row


def _student_record(db: Session, row: models.ClassMeeting, username: str, names: dict) -> dict:
    mark = attendance(db, row.id, username)
    started = row.starts_at <= datetime.now(timezone.utc)
    return {**meeting_summary(row), "group_name": names.get(row.group_id, ""), "attended": mark is not None,
            "attended_at": mark.marked_at.isoformat() if mark else None,
            "can_mark": row.status == "scheduled" and started}


@router.get("/user/meetings")
def my_meetings(identity=Depends(auth.get_current_user), db: Session = Depends(get_db)):
    username = _username(identity) or ""
    rows = (db.query(models.ClassMeeting)
            .filter(models.ClassMeeting.group_id.in_(membership_ids(db, username)))
            .order_by(models.ClassMeeting.starts_at, models.ClassMeeting.id).all())
    names = dict(db.query(models.StudentGroup.id, models.StudentGroup.name)
                 .filter(models.StudentGroup.id.in_({row.group_id for row in rows}))) if rows else {}
    return [_student_record(db, row, username, names) for row in rows]


@router.post("/user/meetings/{meeting_id}/attendance")
def mark_attendance(meeting_id: int, identity=Depends(auth.get_current_user), db: Session = Depends(get_db)):
    row = _student_meeting(db, identity, meeting_id)
    username = _username(identity) or ""
    if row.status == "cancelled":
        raise HTTPException(409, "meeting_cancelled")
    if row.starts_at > datetime.now(timezone.utc):
        raise HTTPException(409, "meeting_not_started")
    if attendance(db, row.id, username) is None:
        db.add(models.ClassMeetingAttendance(meeting_id=row.id, username=username))
        db.commit()
    return {"attended": True}


@router.delete("/user/meetings/{meeting_id}/attendance")
def unmark_attendance(meeting_id: int, identity=Depends(auth.get_current_user), db: Session = Depends(get_db)):
    row = _student_meeting(db, identity, meeting_id)
    db.query(models.ClassMeetingAttendance).filter_by(meeting_id=row.id, username=_username(identity) or "").delete()
    db.commit()
    return {"attended": False}
