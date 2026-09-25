"""«La mia lettura» di una compilazione: sostituisce la parte riflessiva del libretto."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import Field
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..goals import Strict

router = APIRouter()


class ReadingWrite(Strict):
    strengths: list[str] = Field(default_factory=list, max_length=12)
    growth_areas: list[str] = Field(default_factory=list, max_length=12)
    note: str = Field(default='', max_length=2000)


def owned_result(db, username, session_id):
    row = db.query(models.QuestionnaireResult).filter_by(session_id=session_id, username=username).first()
    if row is None:
        raise HTTPException(404, 'Result unavailable')
    return row


def origin_goal_ids(db, username, session_id):
    return sorted(i for (i,) in db.query(models.GoalResourceLink.goal_id).join(
        models.PersonalGoal, models.PersonalGoal.id == models.GoalResourceLink.goal_id).filter(
        models.PersonalGoal.username == username, models.GoalResourceLink.kind == 'reading',
        models.GoalResourceLink.target_id == session_id, models.GoalResourceLink.role == 'origin'))


def reading_dict(db, row):
    return dict(session_id=row.session_id, questionnaire_type=row.questionnaire_type, strengths=row.strengths or [],
                growth_areas=row.growth_areas or [], note=row.note, updated_at=row.updated_at,
                goal_ids=origin_goal_ids(db, row.username, row.session_id))


@router.get('/user/readings')
def get_reading(session_id: str = Query(min_length=1), db: Session = Depends(database.get_db),
                user=Depends(auth.get_current_user)):
    row = db.query(models.ResultReading).filter_by(username=user['username'], session_id=session_id).first()
    return reading_dict(db, row) if row else None


@router.put('/user/readings/{session_id}')
def save_reading(session_id: str, payload: ReadingWrite, db: Session = Depends(database.get_db),
                 user=Depends(auth.get_current_user)):
    result = owned_result(db, user['username'], session_id)
    clean = lambda items: [s.strip()[:120] for s in items if s.strip()]
    row = db.query(models.ResultReading).filter_by(
        username=user['username'], session_id=session_id).with_for_update().first()
    if row is None:
        row = models.ResultReading(username=user['username'], session_id=session_id,
                                   questionnaire_type=result.questionnaire_type)
        db.add(row)
    row.strengths, row.growth_areas, row.note = clean(payload.strengths), clean(payload.growth_areas), payload.note
    db.commit(); db.refresh(row)
    return reading_dict(db, row)


@router.delete('/user/readings/{session_id}')
def delete_reading(session_id: str, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    row = db.query(models.ResultReading).filter_by(username=user['username'], session_id=session_id).first()
    if row is None:
        raise HTTPException(404, 'Reading unavailable')
    goals = origin_goal_ids(db, user['username'], session_id)
    if goals:
        raise HTTPException(409, {'message': 'Reading is the origin of goals', 'goal_ids': goals})
    db.delete(row); db.commit()
    return {'deleted': True}
