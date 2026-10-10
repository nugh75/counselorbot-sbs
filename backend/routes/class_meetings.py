"""Class and group meetings (#175) and individual meetings with bookable slots (#176).

The teacher plans them and, for now, manages everything, including meetings
held by an institute referent or an external expert (invited by the teacher
outside the platform). Students book a slot and mark their own attendance.
"""
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..class_meetings import active_bookings, attendance, book_slot, meeting_summary, my_booking, slots
from ..goals import membership_ids
from .groups import _require_visible_group, _username

router = APIRouter()
get_db = database.get_db


class MeetingWrite(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=3000)
    kind: Literal["group", "individual"] = "group"
    starts_at: Optional[AwareDatetime] = None
    duration_minutes: Optional[int] = Field(default=None, ge=5, le=600)
    mode: Literal["in_person", "online"]
    place: Optional[str] = Field(default=None, max_length=300)
    link: Optional[str] = Field(default=None, max_length=500, pattern=r"^https?://\S+$")
    host_kind: Literal["teacher", "referent", "expert"] = "teacher"
    referral_id: Optional[int] = Field(default=None, gt=0)
    host_name: Optional[str] = Field(default=None, max_length=200)
    host_role: Optional[str] = Field(default=None, max_length=200)
    show_on_timeline: bool = True

    @model_validator(mode="after")
    def consistent(self):
        # In person needs a place, online needs a link; the other one is dropped.
        if self.mode == "in_person":
            if not self.place:
                raise ValueError("meeting_place_required")
            self.link = None
        else:
            if not self.link:
                raise ValueError("meeting_link_required")
            self.place = None
        # A group meeting has one date; an individual one gets its dates from slots.
        if self.kind == "group":
            if self.starts_at is None:
                raise ValueError("meeting_date_required")
        else:
            self.starts_at = None
        if self.host_kind == "referent" and self.referral_id is None:
            raise ValueError("meeting_referent_required")
        if self.host_kind == "expert" and not self.host_name:
            raise ValueError("meeting_expert_required")
        if self.host_kind != "referent":
            self.referral_id = None
        if self.host_kind == "teacher":
            self.host_name = self.host_role = None
        return self


class MeetingUpdate(MeetingWrite):
    revision: int = Field(ge=1, strict=True)


class RevisionOnly(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=1, strict=True)


class SlotWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    starts_at: AwareDatetime
    duration_minutes: Optional[int] = Field(default=None, ge=5, le=600)


class SlotUpdate(SlotWrite):
    revision: int = Field(ge=1, strict=True)


class BookingMove(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slot_id: int = Field(gt=0)


class BookingWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slot_id: int = Field(gt=0)


def _role_label(row: models.OrientationReferral, lang: str = "it") -> str:
    labels = row.role_label_i18n or {}
    return labels.get(lang) or labels.get("it") or next(iter(labels.values()), "")


def _referents(db: Session, group: models.StudentGroup):
    """Active referents of the class's institute, plus national ones."""
    return (db.query(models.OrientationReferral)
            .filter(models.OrientationReferral.is_active.is_(True),
                    or_(models.OrientationReferral.institution_id.is_(None),
                        models.OrientationReferral.institution_id == group.institution_id))
            .order_by(models.OrientationReferral.sort_order, models.OrientationReferral.id).all())


def _teacher_meeting(db: Session, identity, meeting_id: int, *, for_update=True) -> models.ClassMeeting:
    query = db.query(models.ClassMeeting).filter_by(id=meeting_id)
    if for_update:
        query = query.populate_existing().with_for_update()
    row = query.first()
    # One answer for missing meetings and meetings of classes the teacher cannot see.
    if row is None:
        raise HTTPException(404, "meeting_not_found")
    try:
        _require_visible_group(db, identity, row.group_id)
    except HTTPException:
        raise HTTPException(404, "meeting_not_found") from None
    return row


def _teacher_slot(db: Session, identity, slot_id: int) -> tuple[models.ClassMeeting, models.ClassMeetingSlot]:
    slot = db.query(models.ClassMeetingSlot).filter_by(id=slot_id).populate_existing().with_for_update().first()
    if slot is None:
        raise HTTPException(404, "slot_not_found")
    meeting = _teacher_meeting(db, identity, slot.meeting_id)
    return meeting, slot


def _names(db: Session, usernames) -> dict:
    usernames = set(usernames)
    return dict(db.query(models.UserDisplayName.username, models.UserDisplayName.display_name)
                .filter(models.UserDisplayName.username.in_(usernames))) if usernames else {}


def _teacher_record(db: Session, row: models.ClassMeeting) -> dict:
    data = {**meeting_summary(row), "organizer_username": row.organizer_username,
            "manager_username": row.manager_username, "referral_id": row.referral_id,
            "attendance_count": db.query(models.ClassMeetingAttendance).filter_by(meeting_id=row.id).count()}
    if row.kind == "individual":
        bookings = active_bookings(db, row.id)
        names = _names(db, [booking.username for booking in bookings.values()])
        data["slots"] = [{"id": slot.id, "starts_at": slot.starts_at.isoformat(), "duration_minutes": slot.duration_minutes,
                          "status": slot.status, "revision": slot.revision,
                          "booking": ({"id": bookings[slot.id].id, "username": bookings[slot.id].username,
                                       "name": names.get(bookings[slot.id].username) or bookings[slot.id].username}
                                      if slot.id in bookings else None)}
                         for slot in slots(db, row.id)]
    return data


def _apply(db: Session, group: models.StudentGroup, row: models.ClassMeeting, payload: MeetingWrite) -> None:
    if payload.host_kind == "referent":
        referral = next((item for item in _referents(db, group) if item.id == payload.referral_id), None)
        if referral is None:
            raise HTTPException(422, "meeting_referent_unavailable")
        # The meeting keeps the referent's role and name as they were when planned.
        host_name, host_role = referral.person_name, _role_label(referral)
    else:
        host_name, host_role = payload.host_name, payload.host_role
    row.title, row.starts_at, row.duration_minutes = payload.title, payload.starts_at, payload.duration_minutes
    row.description = (payload.description or "").strip() or None
    row.mode, row.place, row.link = payload.mode, payload.place, payload.link
    row.host_kind, row.referral_id, row.host_name, row.host_role = payload.host_kind, payload.referral_id, host_name, host_role
    row.show_on_timeline = payload.show_on_timeline


@router.get("/teacher/groups/{group_id}/meetings")
def list_meetings(group_id: int, identity=Depends(auth.get_current_plan_manager), db: Session = Depends(get_db)):
    _require_visible_group(db, identity, group_id)
    rows = (db.query(models.ClassMeeting).filter_by(group_id=group_id)
            .order_by(models.ClassMeeting.starts_at.desc().nulls_first(), models.ClassMeeting.id.desc()).all())
    return [_teacher_record(db, row) for row in rows]


@router.get("/teacher/groups/{group_id}/meeting-referents")
def list_referents(group_id: int, identity=Depends(auth.get_current_plan_manager), db: Session = Depends(get_db)):
    group = _require_visible_group(db, identity, group_id)
    return [{"id": row.id, "role": _role_label(row), "role_i18n": row.role_label_i18n or {}, "name": row.person_name}
            for row in _referents(db, group)]


@router.post("/teacher/groups/{group_id}/meetings", status_code=201)
def create_meeting(group_id: int, payload: MeetingWrite, identity=Depends(auth.get_current_plan_manager),
                   db: Session = Depends(get_db)):
    group = _require_visible_group(db, identity, group_id)
    if not group.is_active:
        raise HTTPException(409, "meeting_class_inactive")
    username = _username(identity) or ""
    # Today the teacher both organises and manages; the fields stay apart for a future role.
    row = models.ClassMeeting(group_id=group.id, kind=payload.kind, organizer_username=username,
                              manager_username=username, status="scheduled", revision=1)
    _apply(db, group, row, payload)
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
    if payload.kind != row.kind:
        raise HTTPException(409, "meeting_kind_immutable")
    # A date change keeps the attendance already marked: the meeting is the same.
    _apply(db, db.get(models.StudentGroup, row.group_id), row, payload)
    row.revision += 1
    db.commit()
    return _teacher_record(db, row)


@router.post("/teacher/meetings/{meeting_id}/cancel")
def cancel_meeting(meeting_id: int, payload: RevisionOnly, identity=Depends(auth.get_current_plan_manager),
                   db: Session = Depends(get_db)):
    row = _teacher_meeting(db, identity, meeting_id)
    if payload.revision != row.revision:
        raise HTTPException(409, "meeting_revision_conflict")
    if row.status != "cancelled":
        row.status, row.cancelled_at = "cancelled", datetime.now(timezone.utc)
        row.revision += 1
    db.commit()
    return _teacher_record(db, row)


def _individual(row: models.ClassMeeting) -> None:
    if row.kind != "individual":
        raise HTTPException(409, "meeting_not_individual")
    if row.status == "cancelled":
        raise HTTPException(409, "meeting_cancelled")


@router.post("/teacher/meetings/{meeting_id}/slots", status_code=201)
def add_slot(meeting_id: int, payload: SlotWrite, identity=Depends(auth.get_current_plan_manager),
             db: Session = Depends(get_db)):
    row = _teacher_meeting(db, identity, meeting_id)
    _individual(row)
    db.add(models.ClassMeetingSlot(meeting_id=row.id, starts_at=payload.starts_at,
                                   duration_minutes=payload.duration_minutes, status="open", revision=1))
    db.commit()
    return _teacher_record(db, row)


@router.put("/teacher/slots/{slot_id}")
def move_slot(slot_id: int, payload: SlotUpdate, identity=Depends(auth.get_current_plan_manager),
              db: Session = Depends(get_db)):
    row, slot = _teacher_slot(db, identity, slot_id)
    _individual(row)
    if payload.revision != slot.revision:
        raise HTTPException(409, "slot_revision_conflict")
    if slot.status != "open":
        raise HTTPException(409, "slot_unavailable")
    # The booked student, if any, keeps the slot and sees the new time.
    slot.starts_at, slot.duration_minutes = payload.starts_at, payload.duration_minutes
    slot.revision += 1
    db.commit()
    return _teacher_record(db, row)


@router.post("/teacher/slots/{slot_id}/cancel")
def cancel_slot(slot_id: int, payload: RevisionOnly, identity=Depends(auth.get_current_plan_manager),
                db: Session = Depends(get_db)):
    row, slot = _teacher_slot(db, identity, slot_id)
    if payload.revision != slot.revision:
        raise HTTPException(409, "slot_revision_conflict")
    if slot.status == "open":
        slot.status = "cancelled"
        slot.revision += 1
        # The student sees the cancellation and can book another slot.
        db.query(models.ClassMeetingBooking).filter_by(slot_id=slot.id, status="active").update(
            {"status": "cancelled_by_teacher", "changed_at": datetime.now(timezone.utc)})
    db.commit()
    return _teacher_record(db, row)


def _teacher_booking(db: Session, identity, booking_id: int):
    booking = (db.query(models.ClassMeetingBooking).filter_by(id=booking_id, status="active")
               .populate_existing().with_for_update().first())
    if booking is None:
        raise HTTPException(404, "booking_not_found")
    row = _teacher_meeting(db, identity, booking.meeting_id)
    return row, booking


@router.post("/teacher/bookings/{booking_id}/move")
def move_booking(booking_id: int, payload: BookingMove, identity=Depends(auth.get_current_plan_manager),
                 db: Session = Depends(get_db)):
    row, booking = _teacher_booking(db, identity, booking_id)
    _individual(row)
    if booking.slot_id != payload.slot_id:
        book_slot(db, row, payload.slot_id, booking.username)
    db.commit()
    return _teacher_record(db, row)


@router.post("/teacher/bookings/{booking_id}/cancel")
def cancel_booking(booking_id: int, identity=Depends(auth.get_current_plan_manager), db: Session = Depends(get_db)):
    row, booking = _teacher_booking(db, identity, booking_id)
    booking.status, booking.changed_at = "cancelled_by_teacher", datetime.now(timezone.utc)
    db.commit()
    return _teacher_record(db, row)


def _student_meeting(db: Session, identity, meeting_id: int, *, for_update=False) -> models.ClassMeeting:
    query = db.query(models.ClassMeeting).filter(
        models.ClassMeeting.id == meeting_id,
        models.ClassMeeting.group_id.in_(membership_ids(db, _username(identity) or "")),
    )
    if for_update:
        query = query.populate_existing().with_for_update()
    row = query.first()
    # Non-members and missing meetings get the same answer: no existence oracle.
    if row is None:
        raise HTTPException(403, "meeting_unavailable")
    return row


def _attendable_from(db: Session, row: models.ClassMeeting, username: str):
    """When the student may mark attendance: the meeting's start, or their booked slot's."""
    if row.kind == "group":
        return row.starts_at
    booking = my_booking(db, row.id, username)
    return db.get(models.ClassMeetingSlot, booking.slot_id).starts_at if booking else None


def _student_record(db: Session, row: models.ClassMeeting, username: str, names: dict) -> dict:
    mark = attendance(db, row.id, username)
    start = _attendable_from(db, row, username)
    data = {**meeting_summary(row), "group_name": names.get(row.group_id, ""), "attended": mark is not None,
            "attended_at": mark.marked_at.isoformat() if mark else None,
            "can_mark": row.status == "scheduled" and start is not None and start <= datetime.now(timezone.utc)}
    if row.kind == "individual":
        booking = my_booking(db, row.id, username)
        taken = active_bookings(db, row.id)
        now = datetime.now(timezone.utc)
        # Free future slots and the student's own; who booked the others stays private.
        data["slots"] = [{"id": slot.id, "starts_at": slot.starts_at.isoformat(), "duration_minutes": slot.duration_minutes,
                          "mine": booking is not None and booking.slot_id == slot.id}
                         for slot in slots(db, row.id)
                         if (booking is not None and booking.slot_id == slot.id)
                         or (slot.status == "open" and slot.starts_at > now and slot.id not in taken)]
        latest = (db.query(models.ClassMeetingBooking).filter_by(meeting_id=row.id, username=username)
                  .order_by(models.ClassMeetingBooking.id.desc()).first())
        data["booking_slot_id"] = booking.slot_id if booking else None
        data["booking_cancelled"] = booking is None and latest is not None and latest.status == "cancelled_by_teacher"
    return data


@router.get("/user/meetings")
def my_meetings(identity=Depends(auth.get_current_user), db: Session = Depends(get_db)):
    username = _username(identity) or ""
    rows = (db.query(models.ClassMeeting)
            .filter(models.ClassMeeting.group_id.in_(membership_ids(db, username)))
            .order_by(models.ClassMeeting.starts_at.nulls_first(), models.ClassMeeting.id).all())
    names = dict(db.query(models.StudentGroup.id, models.StudentGroup.name)
                 .filter(models.StudentGroup.id.in_({row.group_id for row in rows}))) if rows else {}
    return [_student_record(db, row, username, names) for row in rows]


@router.post("/user/meetings/{meeting_id}/booking")
def book(meeting_id: int, payload: BookingWrite, identity=Depends(auth.get_current_user), db: Session = Depends(get_db)):
    row = _student_meeting(db, identity, meeting_id)
    booking = book_slot(db, row, payload.slot_id, _username(identity) or "")
    db.commit()
    return {"slot_id": booking.slot_id}


@router.delete("/user/meetings/{meeting_id}/booking")
def unbook(meeting_id: int, identity=Depends(auth.get_current_user), db: Session = Depends(get_db)):
    row = _student_meeting(db, identity, meeting_id)
    db.query(models.ClassMeetingBooking).filter_by(meeting_id=row.id, username=_username(identity) or "",
                                                   status="active").delete()
    db.commit()
    return {"slot_id": None}


@router.post("/user/meetings/{meeting_id}/attendance")
def mark_attendance(meeting_id: int, identity=Depends(auth.get_current_user), db: Session = Depends(get_db)):
    row = _student_meeting(db, identity, meeting_id)
    username = _username(identity) or ""
    if row.status == "cancelled":
        raise HTTPException(409, "meeting_cancelled")
    start = _attendable_from(db, row, username)
    if start is None:
        raise HTTPException(409, "meeting_not_booked")
    if start > datetime.now(timezone.utc):
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
