"""Sessioni guidate congelate.

Lo studente sospende il percorso con un gesto esplicito e lo riprende da
qualsiasi dispositivo. Ownership su `username`, come il portfolio: il solo
`session_id` non basta ad accedere a uno snapshot.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas

router = APIRouter()
get_db = database.get_db


def _summary(row: models.FrozenSession) -> schemas.FrozenSessionSummary:
    data = row.data or {}
    return schemas.FrozenSessionSummary(
        session_id=row.session_id,
        questionnaire_type=row.questionnaire_type,
        label=data.get("label"),
        current_phase=data.get("current_phase") or "",
        experience=data.get("experience"),
        updated_at=row.updated_at,
    )


def _detail(row: models.FrozenSession) -> schemas.FrozenSessionDetail:
    data = row.data or {}
    return schemas.FrozenSessionDetail(
        **_summary(row).model_dump(),
        messages=data.get("messages") or [],
        scores=data.get("scores") or {},
        counselor_id=data.get("counselor_id"),
        locale=data.get("locale"),
        response_length=data.get("response_length"),
    )


def _owned(db: Session, session_id: str, current_user: dict) -> models.FrozenSession:
    row = (
        db.query(models.FrozenSession)
        .filter(
            models.FrozenSession.username == current_user["username"],
            models.FrozenSession.session_id == session_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Sessione congelata non trovata")
    return row


@router.post("/session/freeze", response_model=schemas.FrozenSessionSummary)
async def freeze_session(
    payload: schemas.FrozenSessionCreate,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Congela la sessione: upsert dello snapshot per (username, session_id).

    Non c'e' un vincolo di unicita' a livello di DB (la tabella e' gia' stata
    creata senza), quindi due freeze concorrenti per lo stesso session_id
    possono entrambi non trovare la riga esistente e inserirne una a testa.
    Qui si collassano eventuali righe duplicate sulla prima: la corsa si
    autocorregge al freeze successivo invece di lasciare righe orfane.
    """
    username = current_user["username"]
    data = payload.model_dump(exclude={"session_id", "questionnaire_type"})
    rows = (
        db.query(models.FrozenSession)
        .filter(
            models.FrozenSession.username == username,
            models.FrozenSession.session_id == payload.session_id,
        )
        .all()
    )
    if rows:
        row, extras = rows[0], rows[1:]
        row.questionnaire_type = payload.questionnaire_type
        row.data = data
        for extra in extras:
            db.delete(extra)
    else:
        row = models.FrozenSession(
            username=username,
            session_id=payload.session_id,
            questionnaire_type=payload.questionnaire_type,
            data=data,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return _summary(row)


@router.get("/session/frozen", response_model=List[schemas.FrozenSessionSummary])
async def list_frozen_sessions(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Elenco leggero per l'header: nessun messaggio nel payload."""
    rows = (
        db.query(models.FrozenSession)
        .filter(models.FrozenSession.username == current_user["username"])
        .order_by(models.FrozenSession.updated_at.desc())
        .all()
    )
    return [_summary(row) for row in rows]


@router.get("/session/frozen/{session_id}", response_model=schemas.FrozenSessionDetail)
async def get_frozen_session(
    session_id: str,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    return _detail(_owned(db, session_id, current_user))


@router.delete("/session/frozen/{session_id}")
async def delete_frozen_session(
    session_id: str,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Rimuove lo snapshot: percorso concluso o ripresa scartata.

    Cancella tutte le righe per (username, session_id), non solo la prima:
    se una corsa in freeze_session ha lasciato un duplicato, DELETE non deve
    farlo riapparire in GET /session/frozen.
    """
    rows = (
        db.query(models.FrozenSession)
        .filter(
            models.FrozenSession.username == current_user["username"],
            models.FrozenSession.session_id == session_id,
        )
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Sessione congelata non trovata")
    for row in rows:
        db.delete(row)
    db.commit()
    return {"status": "deleted", "session_id": session_id}
