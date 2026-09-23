"""Teacher-owned institutional categories, separate from chat retrieval needs."""
import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.sql import func
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..institution_access import require_institution_teacher

router = APIRouter()


class CategoryCommand(BaseModel):
    revision: int = Field(ge=0)
    action: Literal["create", "edit", "archive", "restore", "move_up", "move_down"]
    category_id: Optional[str] = Field(default=None, max_length=36)
    name: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=2000)
    model_config = {"extra": "forbid"}

    @field_validator("name", "description")
    @classmethod
    def trim(cls, value):
        return value.strip()

    @model_validator(mode="after")
    def check_action(self):
        if self.action == "create" and self.category_id:
            raise ValueError("La creazione non accetta una categoria esistente")
        if self.action in {"create", "edit"} and not self.name:
            raise ValueError("Nome obbligatorio")
        if self.action != "create" and not self.category_id:
            raise ValueError("Categoria obbligatoria")
        return self


def _snapshot(db, institution_id):
    collection = db.get(models.InstitutionCategoryCollection, institution_id)
    rows = db.query(models.InstitutionOrientationCategory).filter_by(institution_id=institution_id).order_by(
        models.InstitutionOrientationCategory.is_active.desc(),
        models.InstitutionOrientationCategory.position,
        models.InstitutionOrientationCategory.id,
    ).all()
    return {"revision": collection.revision if collection else 0, "categories": [
        {"id": row.id, "name": row.name, "description": row.description,
         "position": row.position, "is_active": row.is_active,
         "updated_by": row.updated_by, "updated_at": row.updated_at}
        for row in rows
    ]}


@router.get("/teacher/institutions/{institution_id}/orientation-categories")
async def list_categories(institution_id: int, current_user=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    require_institution_teacher(db, current_user, institution_id)
    return _snapshot(db, institution_id)


@router.post("/teacher/institutions/{institution_id}/orientation-categories")
async def change_categories(institution_id: int, payload: CategoryCommand, current_user=Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    require_institution_teacher(db, current_user, institution_id)
    try:
        # One compare-and-swap protects edits AND the order shared by all teachers.
        changed = db.query(models.InstitutionCategoryCollection).filter_by(
            institution_id=institution_id, revision=payload.revision,
        ).update({"revision": payload.revision + 1}, synchronize_session=False)
        if not changed:
            if payload.revision != 0 or db.get(models.InstitutionCategoryCollection, institution_id):
                raise HTTPException(409, detail={"code": "conflict"})
            db.add(models.InstitutionCategoryCollection(institution_id=institution_id, revision=1))
            db.flush()  # Concurrent first creation is rejected by the primary key.

        rows = db.query(models.InstitutionOrientationCategory).filter_by(institution_id=institution_id).order_by(
            models.InstitutionOrientationCategory.position, models.InstitutionOrientationCategory.id,
        ).all()
        active = [row for row in rows if row.is_active]
        target = next((row for row in rows if row.id == payload.category_id), None)
        if payload.action != "create" and target is None:
            raise HTTPException(404, detail={"code": "missing"})
        if payload.action in {"create", "edit"}:
            normalized = payload.name.casefold()
            if any(row.normalized_name == normalized and row is not target for row in rows):
                raise HTTPException(409, detail={"code": "duplicate"})
            if target is not None and not target.is_active:
                raise HTTPException(409, detail={"code": "archived"})
            if payload.action == "create":
                target = models.InstitutionOrientationCategory(id=str(uuid.uuid4()), institution_id=institution_id, is_active=True)
                db.add(target)
                active.append(target)
            target.name = payload.name
            target.normalized_name = normalized
            target.description = payload.description
        elif payload.action == "archive":
            if not target.is_active:
                raise HTTPException(409, detail={"code": "archived"})
            target.is_active = False
            active.remove(target)
        elif payload.action == "restore":
            if target.is_active:
                raise HTTPException(409, detail={"code": "conflict"})
            target.is_active = True
            active.append(target)
        else:
            if not target.is_active:
                raise HTTPException(409, detail={"code": "archived"})
            index = active.index(target)
            destination = index + (-1 if payload.action == "move_up" else 1)
            if not 0 <= destination < len(active):
                raise HTTPException(409, detail={"code": "boundary"})
            active[index], active[destination] = active[destination], active[index]
        actor = current_user["username"].strip()
        target.updated_by = actor
        # Force an audit timestamp even for an edit that preserves the same text.
        target.updated_at = func.now()
        for position, row in enumerate(active):
            if row.position != position:
                row.position = position
                row.updated_by = actor
                row.updated_at = func.now()
        db.commit()
        return _snapshot(db, institution_id)
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, detail={"code": "conflict"})
