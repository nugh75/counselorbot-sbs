"""Contatti dei ricercatori e codici per la somministrazione dei questionari."""

import re
import secrets
import string
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas

router = APIRouter()
get_db = database.get_db

CODE_RE = re.compile(r"^[A-Z0-9][A-Z0-9-]{2,31}$")
CODE_ALPHABET = string.ascii_uppercase + string.digits


def _clean(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = value.strip()
    return text or None


def _normalize_code(value: str) -> str:
    code = re.sub(r"\s+", "-", value.strip().upper())
    if not CODE_RE.fullmatch(code):
        raise HTTPException(
            status_code=400,
            detail="Codice non valido: usa 3-32 caratteri maiuscoli, numeri o trattini",
        )
    return code


def _generate_code(db: Session) -> str:
    for _ in range(20):
        suffix = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        code = f"RC-{suffix}"
        exists = db.query(models.ResearchContact).filter(models.ResearchContact.code == code).first()
        if not exists:
            return code
    raise HTTPException(status_code=500, detail="Impossibile generare un codice univoco")


def _build_contact(payload: schemas.ResearchContactCreate, db: Session) -> models.ResearchContact:
    name = _clean(payload.name)
    if not name:
        raise HTTPException(status_code=400, detail="Nome obbligatorio")
    code = _normalize_code(payload.code) if payload.code else _generate_code(db)
    if db.query(models.ResearchContact).filter(models.ResearchContact.code == code).first():
        raise HTTPException(status_code=409, detail="Codice gia' esistente")
    return models.ResearchContact(
        code=code,
        name=name,
        email=_clean(payload.email),
        phone=_clean(payload.phone),
        institution=_clean(payload.institution),
        role=_clean(payload.role),
        notes=_clean(payload.notes),
        is_active=payload.is_active,
    )


@router.get("/admin/research-contacts", response_model=List[schemas.ResearchContactResponse])
async def list_research_contacts(
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.ResearchContact)
        .order_by(models.ResearchContact.is_active.desc(), models.ResearchContact.name.asc())
        .all()
    )


@router.post("/admin/research-contacts", response_model=schemas.ResearchContactResponse)
async def create_research_contact(
    payload: schemas.ResearchContactCreate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    contact = _build_contact(payload, db)
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.put("/admin/research-contacts/{contact_id}", response_model=schemas.ResearchContactResponse)
async def update_research_contact(
    contact_id: int,
    payload: schemas.ResearchContactUpdate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    contact = db.query(models.ResearchContact).filter(models.ResearchContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contatto ricercatore non trovato")

    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates:
        name = _clean(updates["name"])
        if not name:
            raise HTTPException(status_code=400, detail="Nome obbligatorio")
        updates["name"] = name
    if "code" in updates:
        code = _normalize_code(updates["code"] or "")
        clash = (
            db.query(models.ResearchContact)
            .filter(models.ResearchContact.code == code, models.ResearchContact.id != contact_id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=409, detail="Codice gia' esistente")
        updates["code"] = code

    for field in ("email", "phone", "institution", "role", "notes"):
        if field in updates:
            updates[field] = _clean(updates[field])

    for field, value in updates.items():
        setattr(contact, field, value)
    db.commit()
    db.refresh(contact)
    return contact


@router.delete("/admin/research-contacts/{contact_id}")
async def delete_research_contact(
    contact_id: int,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    contact = db.query(models.ResearchContact).filter(models.ResearchContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contatto ricercatore non trovato")
    db.delete(contact)
    db.commit()
    return {"ok": True, "deleted": contact_id}
