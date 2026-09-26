"""Salva una tappa passata dalla chat (ex «Salva nel libretto» dei percorsi evento)."""
import hashlib
from datetime import date

from fastapi import APIRouter, Depends
from pydantic import Field, field_validator
from sqlalchemy.orm import Session

from .. import auth, database
from ..goals import Strict
from ..personal_timeline import ensure_personal_timeline
from ..visual_tools import EventReview, SavePersonalWorkspace, load_workspace, save_workspace

router = APIRouter()


class MilestoneCreate(Strict):
    request_id: str = Field(pattern=r'^[a-zA-Z0-9_-]{8,64}$')
    title: str = Field(min_length=1, max_length=160)
    date: str | None = None
    period: str = Field(default='', max_length=100)
    review: EventReview
    session_id: str | None = Field(default=None, max_length=100)

    @field_validator('date')
    @classmethod
    def past_date(cls, value):
        if value is not None and date.fromisoformat(value) > date.today():
            raise ValueError('A milestone is in the past')
        return value


@router.post('/user/timeline/milestones', status_code=201)
def create_milestone(payload: MilestoneCreate, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    ensure_personal_timeline(db, user['username'])
    event_id = 'chat-' + hashlib.sha256(f"{user['username']}:{payload.request_id}".encode()).hexdigest()[:24]
    state = load_workspace(db, None, user['username'])
    work = state['workspace']
    if not any(e['id'] == event_id for e in work['timeline']['events']):
        event = dict(id=event_id, title=payload.title, tense='past', symbol='milestone', review=payload.review.model_dump(),
                     period=payload.period or payload.date or date.today().isoformat(),
                     source=f'session:{payload.session_id}' if payload.session_id else '')
        if payload.date:
            event.update(date_mode='point', start_date=payload.date)
        work['timeline']['events'].append(event)
        work['timeline']['title'] = work['timeline']['title'] or 'Timeline'
        save_workspace(db, None, user['username'], SavePersonalWorkspace(revision=state['revision'], workspace=work))
    return {'event_id': event_id}
