"""Explicit transfers of student-authored visual work to personal annotations."""
import hashlib
from typing import Annotated, Literal

from fastapi import HTTPException
from pydantic import Field, StringConstraints
from sqlalchemy import text
from sqlalchemy.orm import Session

from . import models, schemas
from .message_diagrams import session_questionnaire
from .routes.learner_profile import _latest_revision
from .visual_tools import LABELS, StrictModel, load_workspace

NOTEBOOK_FIELDS = ('context', 'goal', 'main_difficulty', 'strengths', 'weaknesses', 'notes')
BOOKLET_FIELDS = ('motivation', 'objective', 'strategy', 'difficulties',
                  'improvements', 'discovery', 'bio_context', 'bio_discovery',
                  'bio_keywords', 'student_notes', 'final_observations')


class PersonalTransfer(StrictModel):
    revision: int = Field(ge=0)
    entry: str = Field(min_length=1, max_length=100)
    destination: Literal['notebook', 'booklet']
    booklet_id: int | None = Field(default=None, gt=0)
    field: str = Field(min_length=1, max_length=40)
    expected_text: Annotated[str, StringConstraints(strip_whitespace=False)] = Field(default='', max_length=2000)
    text: str = Field(min_length=1, max_length=2000)
    language: str = Field(default='it', max_length=10)


def personal_context(db: Session, session_id: str, username: str, language: str = 'it') -> dict:
    from .routes.survey import STUDENT_BOOKLET_TYPES

    questionnaire = session_questionnaire(db, session_id)
    if not questionnaire:
        log = db.query(models.Log).filter_by(session_id=session_id, username=username, action='chat_message').order_by(models.Log.id.desc()).first()
        questionnaire = log.questionnaire_type if log else None
    if questionnaire not in STUDENT_BOOKLET_TYPES:
        questionnaire = None
    notebook = _latest_revision(db, username)
    labels = LABELS.get(language[:2], LABELS['en'])
    booklets = db.query(models.StudentBooklet).filter_by(username=username, questionnaire_type=questionnaire).order_by(models.StudentBooklet.updated_at.desc(), models.StudentBooklet.id.desc()).all() if questionnaire else []
    return {
        'questionnaire_type': questionnaire,
        'limits': {'notebook': schemas.LEARNER_PROFILE_MAX_FIELD_CHARS, 'booklet': schemas.BOOKLET_MAX_FIELD_CHARS},
        'sources': {kind: f'{labels[0]} · {labels[index]}' for kind, index in [('actions', 1), ('cards', 6), ('comparison', 11)]},
        'notebook': {key: (notebook.data or {}).get(key, '') if notebook else '' for key in NOTEBOOK_FIELDS},
        'booklets': [{'id': row.id, 'title': (row.data or {}).get('title', ''),
                      'data': {key: (row.data or {}).get(key, '') for key in BOOKLET_FIELDS}} for row in booklets],
    }


def transfer_to_personal(db: Session, session_id: str, username: str, update: PersonalTransfer) -> dict:
    if db.get_bind().dialect.name == 'postgresql':
        key = int.from_bytes(hashlib.sha256(f'visual-personal:{username}'.encode()).digest()[:8], 'big', signed=True)
        db.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': key})
    current = load_workspace(db, session_id, username)
    if current['revision'] != update.revision:
        raise HTTPException(409, 'personal_conflict')
    kind, _, entry_id = update.entry.partition(':')
    workspace = current['workspace']
    entries = workspace.get(kind, []) if kind in ('actions', 'cards') else workspace['comparison']['options'] if kind == 'comparison' else []
    entry = next((item for item in entries if item['id'] == entry_id), None)
    if not entry:
        raise HTTPException(422, 'personal_invalid')
    fields = NOTEBOOK_FIELDS if update.destination == 'notebook' else BOOKLET_FIELDS
    if update.field not in fields:
        raise HTTPException(422, 'personal_invalid')
    context = personal_context(db, session_id, username, update.language)
    block = f"{update.text}\n({context['sources'][kind]})"
    if update.destination == 'notebook':
        row = _latest_revision(db, username)
        data = dict(row.data or {}) if row else {}
        limit = schemas.LEARNER_PROFILE_MAX_FIELD_CHARS
    else:
        if not context['questionnaire_type']:
            raise HTTPException(422, 'personal_invalid')
        if not update.booklet_id:
            duplicate = next((item for item in context['booklets'] if block in str(item['data'].get(update.field) or '')), None)
            if duplicate:
                return {'status': 'duplicate', 'booklet_id': duplicate['id'], 'context': context}
        row = db.query(models.StudentBooklet).filter_by(id=update.booklet_id, username=username,
            questionnaire_type=context['questionnaire_type']).with_for_update().first() if update.booklet_id else None
        if update.booklet_id and not row:
            raise HTTPException(404, 'personal_invalid')
        data = dict(row.data or {}) if row else {'title': entry.get('title') or entry.get('text', '')[:160]}
        limit = schemas.BOOKLET_MAX_FIELD_CHARS
    previous = str(data.get(update.field) or '')
    if block in previous:
        return {'status': 'duplicate', 'booklet_id': row.id if row and update.destination == 'booklet' else None, 'context': context}
    if previous != update.expected_text:
        raise HTTPException(409, 'personal_conflict')
    value = '\n\n'.join(part for part in (previous, block) if part)
    if len(value) > limit:
        raise HTTPException(422, 'personal_limit')
    data[update.field] = value
    if update.destination == 'notebook':
        row = models.LearnerProfileRevision(username=username, data=data, source='manual', session_id=session_id)
        db.add(row)
    elif row:
        row.data = data
    else:
        row = models.StudentBooklet(username=username, questionnaire_type=context['questionnaire_type'], data=data)
        db.add(row)
    db.commit()
    return {'status': 'saved', 'booklet_id': row.id if update.destination == 'booklet' else None,
            'context': personal_context(db, session_id, username, update.language)}
