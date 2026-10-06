"""Taccuini studente di prova del docente: crea, elenca, modifica, archivia.

Studenti immaginari con cui il docente si allena nelle chat guidate (vedi
`practice_notebooks.py` per l'uso nel contesto). Ruolo: docenti, ricercatori,
admin (come il taccuino docente). Ogni taccuino e' visibile solo al suo
proprietario: un id altrui risponde 404, come uno inesistente. Nessun limite
al numero di taccuini.
"""

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import auth, models, schemas
from ..database import get_db
from ..teacher_context import visible_group_for_teacher

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


def _visible_group_ids(db: Session, username: str, group_ids: List[int]) -> List[int]:
    """Solo classi attive del docente o condivise con lui; le altre si scartano."""
    return [group_id for group_id in group_ids if visible_group_for_teacher(db, username, group_id) is not None]


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
        group_ids=_visible_group_ids(db, current_user["username"], payload.group_ids),
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
    """Nome, campi, classi e archiviazione; i campi omessi restano invariati."""
    notebook = _owned(db, current_user["username"], notebook_id)
    if payload.title is not None:
        if not payload.title:
            raise HTTPException(status_code=422, detail="title is required")
        notebook.title = payload.title
    if payload.data is not None:
        notebook.data = payload.data
    if payload.group_ids is not None:
        notebook.group_ids = _visible_group_ids(db, current_user["username"], payload.group_ids)
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
    db.query(models.TeacherPracticeResult).filter(
        models.TeacherPracticeResult.notebook_id == notebook.id,
    ).delete(synchronize_session=False)
    db.delete(notebook)
    db.commit()
    return {"deleted": notebook_id}


# --- Repertorio di prove: profili di questionario dello studente simulato ---

@router.get("/teacher/practice-notebooks/{notebook_id}/results", response_model=List[schemas.PracticeResultResponse])
async def list_practice_results(
    notebook_id: int,
    questionnaire_type: Optional[str] = None,
    current_user: dict = Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Profili del taccuino, dal piu' recente; filtrabili per strumento."""
    notebook = _owned(db, current_user["username"], notebook_id)
    query = db.query(models.TeacherPracticeResult).filter(models.TeacherPracticeResult.notebook_id == notebook.id)
    if questionnaire_type:
        query = query.filter(models.TeacherPracticeResult.questionnaire_type == questionnaire_type)
    return query.order_by(models.TeacherPracticeResult.created_at.desc(), models.TeacherPracticeResult.id.desc()).all()


@router.post("/teacher/practice-notebooks/{notebook_id}/results", response_model=schemas.PracticeResultResponse, status_code=201)
async def create_practice_result(
    notebook_id: int,
    payload: schemas.PracticeResultCreate,
    current_user: dict = Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Nuovo profilo: a mano, generato o dalla chat in prova (con la sua sessione).

    Un secondo invio con la stessa sessione restituisce il profilo gia' salvato."""
    notebook = _owned(db, current_user["username"], notebook_id)
    if payload.session_id:
        existing = db.query(models.TeacherPracticeResult).filter(
            models.TeacherPracticeResult.notebook_id == notebook.id,
            models.TeacherPracticeResult.session_id == payload.session_id,
        ).first()
        if existing is not None:
            return existing
    result = models.TeacherPracticeResult(
        notebook_id=notebook.id, owner_username=notebook.owner_username,
        questionnaire_type=payload.questionnaire_type, scores=payload.scores,
        session_id=payload.session_id or str(uuid.uuid4()), source=payload.source,
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return result


@router.delete("/teacher/practice-notebooks/{notebook_id}/results/{result_id}")
async def delete_practice_result(
    notebook_id: int,
    result_id: int,
    current_user: dict = Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    notebook = _owned(db, current_user["username"], notebook_id)
    result = db.query(models.TeacherPracticeResult).filter(
        models.TeacherPracticeResult.id == result_id,
        models.TeacherPracticeResult.notebook_id == notebook.id,
    ).first()
    if result is None:
        raise HTTPException(status_code=404, detail="Practice result not found")
    db.delete(result)
    db.commit()
    return {"deleted": result_id}
