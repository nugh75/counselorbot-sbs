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
READING_FIELDS = ('note',)
READING_MAX_CHARS = 2000


class PersonalTransfer(StrictModel):
    revision: int = Field(ge=0)
    entry: str = Field(min_length=1, max_length=100)
    destination: Literal['notebook', 'reading']
    field: str = Field(min_length=1, max_length=40)
    expected_text: Annotated[str, StringConstraints(strip_whitespace=False)] = Field(default='', max_length=2000)
    text: str = Field(min_length=1, max_length=2000)
    language: str = Field(default='it', max_length=10)


def personal_context(db: Session, session_id: str, username: str, language: str = 'it') -> dict:
    from .routes.survey import INSTRUMENT_TYPES

    questionnaire = session_questionnaire(db, session_id)
    if not questionnaire:
        log = db.query(models.Log).filter_by(session_id=session_id, username=username, action='chat_message').order_by(models.Log.id.desc()).first()
        questionnaire = log.questionnaire_type if log else None
    if questionnaire not in INSTRUMENT_TYPES:
        questionnaire = None
    notebook = _latest_revision(db, username)
    labels = LABELS.get(language[:2], LABELS['en'])
    # «La mia lettura» appartiene alla compilazione di questa sessione: senza compilazione non c'è.
    result = db.query(models.QuestionnaireResult).filter_by(session_id=session_id, username=username).first()
    reading = db.query(models.ResultReading).filter_by(session_id=session_id, username=username).first() if result else None
    return {
        'questionnaire_type': questionnaire,
        'limits': {'notebook': schemas.LEARNER_PROFILE_MAX_FIELD_CHARS, 'reading': READING_MAX_CHARS},
        'sources': {kind: f'{labels[0]} · {labels[index]}' for kind, index in [('actions', 1), ('cards', 6), ('comparison', 11)]},
        'notebook': {key: (notebook.data or {}).get(key, '') if notebook else '' for key in NOTEBOOK_FIELDS},
        'reading': {'session_id': session_id, 'note': reading.note if reading else ''} if result else None,
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
    fields = NOTEBOOK_FIELDS if update.destination == 'notebook' else READING_FIELDS
    if update.field not in fields:
        raise HTTPException(422, 'personal_invalid')
    context = personal_context(db, session_id, username, update.language)
    block = f"{update.text}\n({context['sources'][kind]})"
    if update.destination == 'notebook':
        row = _latest_revision(db, username)
        data = dict(row.data or {}) if row else {}
        limit = schemas.LEARNER_PROFILE_MAX_FIELD_CHARS
    else:
        if context['reading'] is None:
            raise HTTPException(422, 'personal_invalid')
        row = db.query(models.ResultReading).filter_by(session_id=session_id, username=username).with_for_update().first()
        data = {'note': row.note if row else ''}
        limit = READING_MAX_CHARS
    previous = str(data.get(update.field) or '')
    if block in previous:
        return {'status': 'duplicate', 'context': context}
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
        row.note = value
    else:
        result = db.query(models.QuestionnaireResult).filter_by(session_id=session_id, username=username).first()
        db.add(models.ResultReading(username=username, session_id=session_id, questionnaire_type=result.questionnaire_type, note=value))
    db.commit()
    return {'status': 'saved', 'context': personal_context(db, session_id, username, update.language)}
