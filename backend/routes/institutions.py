"""Anagrafica degli istituti: CRUD admin ed elenco per lo studente.

L'elenco pubblico serve al select del taccuino. Espone solo nome, tipo e le
pagine istituzionali: nulla che riguardi le persone.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas

router = APIRouter()
get_db = database.get_db

VALID_KINDS = {"school", "university"}


def _fetch(db: Session, institution_id: int) -> models.Institution:
    row = db.query(models.Institution).filter(models.Institution.id == institution_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Istituto non trovato")
    return row


def _validate(row: models.Institution) -> None:
    if (row.kind or "") not in VALID_KINDS:
        raise HTTPException(status_code=400, detail="Tipo non valido: school o university")
    if not (row.name or "").strip():
        raise HTTPException(status_code=400, detail="Nome obbligatorio")


@router.get("/institutions", response_model=List[schemas.InstitutionPublic])
async def list_institutions(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Istituti attivi, per il selettore del taccuino."""
    return (
        db.query(models.Institution)
        .filter(models.Institution.is_active.is_(True))
        .order_by(models.Institution.name.asc())
        .all()
    )


@router.get("/admin/institutions", response_model=List[schemas.InstitutionResponse])
async def admin_list_institutions(
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    return db.query(models.Institution).order_by(models.Institution.name.asc()).all()


@router.post("/admin/institutions", response_model=schemas.InstitutionResponse)
async def create_institution(
    payload: schemas.InstitutionCreate,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    slug = (payload.slug or "").strip()
    if not slug:
        raise HTTPException(status_code=400, detail="slug obbligatorio")
    if db.query(models.Institution).filter(models.Institution.slug == slug).first():
        raise HTTPException(status_code=409, detail="slug gia' presente")
    row = models.Institution(**payload.model_dump())
    row.slug = slug
    _validate(row)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/admin/institutions/{institution_id}", response_model=schemas.InstitutionResponse)
async def update_institution(
    institution_id: int,
    payload: schemas.InstitutionUpdate,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    row = _fetch(db, institution_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    _validate(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/admin/institutions/{institution_id}")
async def delete_institution(
    institution_id: int,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Disattiva invece di cancellare: le righe del taccuino citano lo slug,
    e cancellarlo renderebbe illeggibile la storia gia' scritta."""
    row = _fetch(db, institution_id)
    row.is_active = False
    db.commit()
    return {"status": "deactivated", "id": institution_id}
