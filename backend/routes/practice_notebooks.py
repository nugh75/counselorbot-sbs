"""Taccuini studente di prova del docente: crea, elenca, modifica, archivia.

Studenti immaginari con cui il docente si allena nelle chat guidate (vedi
`practice_notebooks.py` per l'uso nel contesto). Ruolo: docenti, ricercatori,
admin (come il taccuino docente). Ogni taccuino e' visibile solo al suo
proprietario: un id altrui risponde 404, come uno inesistente. Nessun limite
al numero di taccuini.
"""

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import auth, models, schemas
from ..database import get_db

router = APIRouter()


def _owned(db: Session, username: str, notebook_id: int) -> models.TeacherPracticeNotebook:
    notebook = (
        db.query(models.TeacherPracticeNotebook)
        .filter(
            models.TeacherPracticeNotebook.id == notebook_id,
            models.TeacherPracticeNotebook.owner_username == username,
        )
        .first()
    )
    if notebook is None:
        raise HTTPException(status_code=404, detail="Practice notebook not found")
    return notebook


@router.get("/teacher/practice-notebooks", response_model=List[schemas.PracticeNotebookResponse])
async def list_practice_notebooks(
    include_archived: bool = False,
    current_user: dict = Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Taccuini di prova del docente, dal piu' recente; archiviati a richiesta."""
    query = db.query(models.TeacherPracticeNotebook).filter(
        models.TeacherPracticeNotebook.owner_username == current_user["username"],
    )
    if not include_archived:
        query = query.filter(models.TeacherPracticeNotebook.archived_at.is_(None))
    return query.order_by(
        models.TeacherPracticeNotebook.created_at.desc(), models.TeacherPracticeNotebook.id.desc(),
    ).all()


@router.post("/teacher/practice-notebooks", response_model=schemas.PracticeNotebookResponse, status_code=201)
async def create_practice_notebook(
    payload: schemas.PracticeNotebookCreate,
    current_user: dict = Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    if not payload.title:
        raise HTTPException(status_code=422, detail="title is required")
    notebook = models.TeacherPracticeNotebook(
        owner_username=current_user["username"], title=payload.title, data=payload.data,
    )
    db.add(notebook)
    db.commit()
    db.refresh(notebook)
    return notebook


@router.put("/teacher/practice-notebooks/{notebook_id}", response_model=schemas.PracticeNotebookResponse)
async def update_practice_notebook(
    notebook_id: int,
    payload: schemas.PracticeNotebookUpdate,
    current_user: dict = Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Nome, campi e archiviazione; i campi omessi restano invariati."""
    notebook = _owned(db, current_user["username"], notebook_id)
    if payload.title is not None:
        if not payload.title:
            raise HTTPException(status_code=422, detail="title is required")
        notebook.title = payload.title
    if payload.data is not None:
        notebook.data = payload.data
    if payload.archived is not None:
        if payload.archived and notebook.archived_at is None:
            notebook.archived_at = datetime.now(timezone.utc)
        elif not payload.archived:
            notebook.archived_at = None
    db.commit()
    db.refresh(notebook)
    return notebook


@router.delete("/teacher/practice-notebooks/{notebook_id}")
async def delete_practice_notebook(
    notebook_id: int,
    current_user: dict = Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    notebook = _owned(db, current_user["username"], notebook_id)
    db.delete(notebook)
    db.commit()
    return {"deleted": notebook_id}
