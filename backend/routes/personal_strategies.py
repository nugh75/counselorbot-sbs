"""«Le mie strategie»: testi dello studente riusabili nel metodo dei suoi obiettivi."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..goals import Strict

router = APIRouter()


class StrategyWrite(Strict):
    text: str = Field(min_length=1, max_length=300)


def used_by(db, username, strategy_id):
    rows = db.query(models.PersonalGoal.id, models.PersonalGoal.method).filter_by(username=username).all()
    return sorted(goal_id for goal_id, method in rows
                  if any(m.get('kind') == 'own' and m.get('id') == strategy_id for m in (method or [])))


def strategy_dict(db, row):
    return dict(id=row.id, text=row.text, used_by=used_by(db, row.username, row.id))


def owned(db, username, strategy_id):
    row = db.query(models.PersonalStrategy).filter_by(id=strategy_id, username=username).first()
    if row is None:
        raise HTTPException(404, 'Strategy unavailable')
    return row


@router.get('/user/strategies')
def list_strategies(db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    rows = db.query(models.PersonalStrategy).filter_by(username=user['username']).order_by(models.PersonalStrategy.id).all()
    return [strategy_dict(db, row) for row in rows]


@router.post('/user/strategies', status_code=201)
def create_strategy(payload: StrategyWrite, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    row = models.PersonalStrategy(username=user['username'], text=payload.text)
    db.add(row); db.commit(); db.refresh(row)
    return strategy_dict(db, row)


@router.patch('/user/strategies/{strategy_id}')
def rename_strategy(strategy_id: int, payload: StrategyWrite, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    row = owned(db, user['username'], strategy_id)
    row.text = payload.text
    db.commit(); db.refresh(row)
    return strategy_dict(db, row)


@router.delete('/user/strategies/{strategy_id}')
def delete_strategy(strategy_id: int, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    row = owned(db, user['username'], strategy_id)
    users = used_by(db, user['username'], strategy_id)
    if users:
        raise HTTPException(409, {'message': 'Strategy in use', 'goal_ids': users})
    db.delete(row); db.commit()
    return {'deleted': True}