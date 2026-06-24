"""Counselor: persone di counseling configurabili.

Admin: CRUD completo su /admin/counselors (nome, descrizione, persona, modello
via preset, questionari gestiti). Pubblico: GET /counselors espone solo i campi
user-facing dei counselor attivi (per il selettore lato studente).
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, auth, database

router = APIRouter()
get_db = database.get_db


def _preset_map(db: Session) -> dict:
    return {p.id: p for p in db.query(models.ModelPreset).all()}


def _serialize(counselor: models.Counselor, presets: dict) -> schemas.CounselorResponse:
    data = schemas.CounselorResponse.model_validate(counselor)
    preset = presets.get(counselor.preset_id) if counselor.preset_id else None
    if preset:
        data.provider = preset.provider
        data.model = preset.model
    return data


# --- Pubblico (lato utente) ------------------------------------------------
@router.get("/counselors", response_model=List[schemas.CounselorPublic])
async def list_public_counselors(db: Session = Depends(get_db)):
    rows = (
        db.query(models.Counselor)
        .order_by(models.Counselor.sort_order.asc(), models.Counselor.id.asc())
        .all()
    )
    return rows


# --- Admin -----------------------------------------------------------------
@router.get("/admin/counselors", response_model=List[schemas.CounselorResponse])
async def list_counselors(
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    presets = _preset_map(db)
    rows = (
        db.query(models.Counselor)
        .order_by(models.Counselor.sort_order.asc(), models.Counselor.id.asc())
        .all()
    )
    return [_serialize(r, presets) for r in rows]


@router.post("/admin/counselors", response_model=schemas.CounselorResponse)
async def create_counselor(
    payload: schemas.CounselorCreate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    slug = (payload.slug or "").strip()
    name = (payload.name or "").strip()
    if not slug or not name:
        raise HTTPException(status_code=400, detail="slug e name sono obbligatori")
    if db.query(models.Counselor).filter(models.Counselor.slug == slug).first():
        raise HTTPException(status_code=409, detail="slug gia' esistente")
    counselor = models.Counselor(
        slug=slug,
        name=name,
        description=payload.description,
        persona=payload.persona,
        avatar=payload.avatar,
        preset_id=payload.preset_id,
        questionnaire_types=payload.questionnaire_types,
        language=payload.language or "it",
        sort_order=payload.sort_order or 0,
        is_active=payload.is_active,
    )
    db.add(counselor)
    db.commit()
    db.refresh(counselor)
    return _serialize(counselor, _preset_map(db))


@router.put("/admin/counselors/{counselor_id}", response_model=schemas.CounselorResponse)
async def update_counselor(
    counselor_id: int,
    payload: schemas.CounselorUpdate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    counselor = db.query(models.Counselor).filter(models.Counselor.id == counselor_id).first()
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor non trovato")
    updates = payload.model_dump(exclude_unset=True)
    if "slug" in updates:
        new_slug = (updates["slug"] or "").strip()
        if not new_slug:
            raise HTTPException(status_code=400, detail="slug non puo' essere vuoto")
        clash = (
            db.query(models.Counselor)
            .filter(models.Counselor.slug == new_slug, models.Counselor.id != counselor_id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=409, detail="slug gia' esistente")
        updates["slug"] = new_slug
    for field, value in updates.items():
        setattr(counselor, field, value)
    db.commit()
    db.refresh(counselor)
    return _serialize(counselor, _preset_map(db))


@router.delete("/admin/counselors/{counselor_id}")
async def delete_counselor(
    counselor_id: int,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    counselor = db.query(models.Counselor).filter(models.Counselor.id == counselor_id).first()
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor non trovato")
    db.delete(counselor)
    db.commit()
    return {"ok": True, "deleted": counselor_id}
