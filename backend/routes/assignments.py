"""Published catalog entries assigned to a group or an individual member."""
import hashlib
import json
from datetime import date, datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..goals import Strict, membership_ids
from .groups import _require_visible_group, _visible_group_query

router = APIRouter()


class AttachmentWrite(Strict):
    source_kind: Literal['strategy', 'reading']
    source_id: int = Field(gt=0)


class AssignmentWrite(Strict):
    # A published catalog goal is always the anchor; strategies and readings can
    # only travel with it as optional attachments.
    source_kind: Literal['goal'] = 'goal'
    source_id: int = Field(gt=0)
    attachments: list[AttachmentWrite] = Field(default_factory=list, max_length=20)
    group_id: int = Field(gt=0)
    recipient_username: str | None = Field(default=None, min_length=1, max_length=200)
    instructions: str = Field(default='', max_length=3000)
    language: Literal['it', 'en', 'es', 'fr', 'de', 'sv'] = 'it'
    request_id: str = Field(pattern=r'^[a-zA-Z0-9_-]{8,64}$')
    intent: Literal['proposal', 'requested'] = 'proposal'
    due_date: date | None = None
    response_prompt: str = Field(default='', max_length=1500)


def _localized(row, field, language):
    values = getattr(row, field + '_i18n', None) or {}
    for candidate in dict.fromkeys([language, 'it', 'en', 'es', 'fr', 'de', 'sv']):
        value = values.get(candidate) or getattr(row, f'{field}_{candidate}', None)
        if value:
            return value
    return ''


def _goal_snapshot(db, payload):
    row = db.get(models.GoalCatalogEntry, payload.source_id)
    if row is None or row.status != 'published' or row.group_id not in (None, payload.group_id):
        raise HTTPException(404, 'Published content unavailable for this group')
    data = row.data
    return dict(title=data['title'], description=data.get('description', ''),
                details='\n\n'.join(filter(None, [data.get('criteria'), data.get('suggestions')])),
                language=data.get('language', 'it'), version=row.version, kind='goal')


def _attachment_snapshot(db, attachment, language):
    """Minimal public fields only: an invalid attachment returns a safe 404."""
    if attachment.source_kind == 'strategy':
        row = db.get(models.CertifiedStrategy, attachment.source_id)
        if row is None or row.status != 'certified' or not row.is_active:
            raise HTTPException(404, 'Attachment unavailable')
        return dict(kind='strategy', source_id=row.id, title=_localized(row, 'name', language) or row.slug)
    row = db.get(models.CertifiedReading, attachment.source_id)
    if row is None or row.status != 'certified' or not row.is_active:
        raise HTTPException(404, 'Attachment unavailable')
    return dict(kind='reading', source_id=row.id, title=row.title)


def _snapshot(db, payload):
    """Only server-owned public fields are delivered; later catalog edits cannot rewrite them."""
    goal = _goal_snapshot(db, payload)
    goal['attachments'] = [_attachment_snapshot(db, item, payload.language) for item in payload.attachments]
    return goal


def _record(row, recipient_count=None, settings=None):
    data = {key: getattr(row, key) for key in ('id', 'author_username', 'author_name', 'group_id',
            'group_name', 'source_kind', 'source_id', 'snapshot', 'attachments', 'instructions', 'created_at', 'revoked_at')}
    data['attachments'] = row.attachments or []
    # The recipient list / individual target is available only to the sender.
    if recipient_count is not None:
        data.update(recipient_username=row.recipient_username, recipient_count=recipient_count)
    data.update(intent=settings.intent if settings else 'proposal',
                due_date=settings.due_date if settings else None,
                response_prompt=settings.response_prompt if settings else '')
    return data


def _managed_group(db, user, group_id):
    group = _require_visible_group(db, user, group_id)
    if not group.is_active:
        raise HTTPException(404, 'Group unavailable')
    return group


def _recipient_count(db, row):
    if row.recipient_username is None:
        return db.query(models.GroupMembership).filter_by(group_id=row.group_id).count()
    return db.query(models.AssignmentRecipient).filter_by(assignment_id=row.id).count()


@router.get('/teacher/assignment-targets')
def targets(db: Session = Depends(database.get_db), user=Depends(auth.get_current_plan_manager)):
    groups = _visible_group_query(db, user).filter(models.StudentGroup.is_active.is_(True)).order_by(models.StudentGroup.name).all()
    ids = [group.id for group in groups]
    members = db.query(models.GroupMembership).filter(models.GroupMembership.group_id.in_(ids)).all()
    names = dict(db.query(models.UserDisplayName.username, models.UserDisplayName.display_name).filter(
        models.UserDisplayName.username.in_({m.username for m in members})).all())
    return [dict(id=g.id, name=g.name, participants=[dict(username=name, name=names.get(name) or name)
            for name in sorted({m.username for m in members if m.group_id == g.id})]) for g in groups]


@router.post('/teacher/assignments', status_code=201)
def assign(payload: AssignmentWrite, db: Session = Depends(database.get_db), user=Depends(auth.get_current_plan_manager)):
    group = _managed_group(db, user, payload.group_id)
    values = payload.model_dump(mode='json')
    # Preserve retries from clients predating the additive learning settings
    # and attachments: a request without them keeps the same hash as before.
    for field, default in [('intent', 'proposal'), ('due_date', None), ('response_prompt', ''), ('attachments', [])]:
        if values[field] == default:
            values.pop(field)
    digest = hashlib.sha256(json.dumps(values, sort_keys=True).encode()).hexdigest()
    # Serialize retries before checking the unique key, including concurrent requests.
    key = int.from_bytes(hashlib.sha256(f"assignment:{user['username']}:{payload.request_id}".encode()).digest()[:8], 'big', signed=True)
    db.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': key})
    existing = db.query(models.TeacherAssignment).filter_by(author_username=user['username'], request_id=payload.request_id).first()
    if existing:
        if existing.request_hash != digest:
            raise HTTPException(409, 'Request changed: use a new request id')
        return _record(existing, _recipient_count(db, existing), db.get(models.AssignmentLearningSettings, existing.id))
    members = db.query(models.GroupMembership.username).filter_by(group_id=group.id)
    if payload.recipient_username is not None:
        members = members.filter_by(username=payload.recipient_username)
    recipients = {name for name, in members.all()}
    if payload.recipient_username is not None and not recipients:
        raise HTTPException(422, 'No eligible recipients in this group')
    snapshot = _snapshot(db, payload)
    row = models.TeacherAssignment(author_username=user['username'], author_name=user.get('name') or user['username'],
        group_id=group.id, group_name=group.name, recipient_username=payload.recipient_username,
        source_kind=payload.source_kind, source_id=payload.source_id, snapshot=snapshot,
        attachments=snapshot['attachments'], instructions=payload.instructions,
        request_id=payload.request_id, request_hash=digest)
    db.add(row); db.flush()
    settings = models.AssignmentLearningSettings(assignment_id=row.id, intent=payload.intent,
        due_date=payload.due_date, response_prompt=payload.response_prompt)
    db.add(settings)
    db.add_all([models.AssignmentRecipient(assignment_id=row.id, username=name) for name in sorted(recipients)])
    db.commit(); db.refresh(row)
    return _record(row, len(recipients), settings)


@router.get('/teacher/groups/{group_id}/path-assignments')
def path_targets(group_id: int, db: Session = Depends(database.get_db), user=Depends(auth.get_current_plan_manager)):
    """Whole-class goal assignments of this class that a path step can reference (TF6)."""
    group = _managed_group(db, user, group_id)
    rows = db.query(models.TeacherAssignment).filter(models.TeacherAssignment.group_id == group.id,
        models.TeacherAssignment.recipient_username.is_(None), models.TeacherAssignment.source_kind == 'goal',
        models.TeacherAssignment.revoked_at.is_(None)).order_by(models.TeacherAssignment.id.desc()).all()
    return [_record(row, _recipient_count(db, row), db.get(models.AssignmentLearningSettings, row.id)) for row in rows]


@router.get('/teacher/assignments')
def sent(db: Session = Depends(database.get_db), user=Depends(auth.get_current_plan_manager)):
    visible = _visible_group_query(db, user).filter(models.StudentGroup.is_active.is_(True)).with_entities(models.StudentGroup.id)
    rows = db.query(models.TeacherAssignment).filter(models.TeacherAssignment.author_username == user['username'],
        models.TeacherAssignment.group_id.in_(visible)).order_by(models.TeacherAssignment.id.desc()).all()
    return [_record(row, _recipient_count(db, row), db.get(models.AssignmentLearningSettings, row.id)) for row in rows]


@router.delete('/teacher/assignments/{assignment_id}')
def revoke(assignment_id: int, db: Session = Depends(database.get_db), user=Depends(auth.get_current_plan_manager)):
    row = db.query(models.TeacherAssignment).filter_by(id=assignment_id, author_username=user['username']).first()
    if row is None:
        raise HTTPException(404, 'Assignment unavailable')
    _managed_group(db, user, row.group_id)
    row.revoked_at = row.revoked_at or datetime.now(timezone.utc)
    db.commit()
    return {'revoked': True}


@router.get('/user/assignments')
def received(db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    individual_delivery = db.query(models.AssignmentRecipient.id).filter(
        models.AssignmentRecipient.assignment_id == models.TeacherAssignment.id,
        models.AssignmentRecipient.username == user['username'],
    ).exists()
    rows = db.query(models.TeacherAssignment).filter(
        or_(models.TeacherAssignment.recipient_username.is_(None), individual_delivery),
        models.TeacherAssignment.revoked_at.is_(None),
        models.TeacherAssignment.group_id.in_(membership_ids(db, user['username'])),
    ).order_by(models.TeacherAssignment.id.desc()).all()
    work = {w.assignment_id: w for w in db.query(models.AssignmentWork).filter_by(username=user['username']).all()}
    return [{**_record(row, settings=db.get(models.AssignmentLearningSettings, row.id)),
             'progress': dict(planned=bool(work.get(row.id) and work[row.id].action_id),
                              shared=bool(work.get(row.id) and work[row.id].submission),
                              feedback_available=bool(work.get(row.id) and work[row.id].submission and work[row.id].feedback))}
            for row in rows]
