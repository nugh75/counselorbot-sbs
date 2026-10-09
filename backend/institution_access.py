"""Verified teacher membership, separate from student directory preferences."""
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from . import auth, models


async def require_institution_admin(identity: dict = Depends(auth.get_current_user)) -> dict:
    # The generic active-admin dependency also admits researchers. Grants do not.
    if not identity.get("is_admin"):
        raise HTTPException(status_code=403, detail="Associazioni riservate all'amministratore")
    return identity


def require_teacher(identity: dict) -> str:
    if not auth.is_teacher(identity.get("groups")):
        raise HTTPException(status_code=403, detail="Accesso riservato ai docenti")
    username = str(identity.get("username") or "").strip()
    if not username:
        raise HTTPException(status_code=403, detail="Account docente non identificato")
    return username


def teacher_institutions(db: Session, identity: dict):
    username = require_teacher(identity)
    return (
        db.query(models.Institution)
        .join(models.InstitutionTeacher, models.InstitutionTeacher.institution_id == models.Institution.id)
        .filter(models.InstitutionTeacher.username == username,
                models.InstitutionTeacher.is_active.is_(True),
                models.Institution.is_active.is_(True))
        .order_by(models.Institution.name, models.Institution.id)
    )


def require_institution_teacher(db: Session, identity: dict, institution_id: int, *, lock: bool = False):
    query = teacher_institutions(db, identity).filter(models.Institution.id == institution_id)
    if lock:
        query = query.populate_existing().with_for_update(of=(models.Institution, models.InstitutionTeacher))
    institution = query.first()
    if institution is None:
        raise HTTPException(status_code=403, detail="Docente non abilitato per questo istituto")
    return institution
