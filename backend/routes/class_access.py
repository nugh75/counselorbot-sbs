"""Resolved class access for the current user (plan §5.1, #89)."""
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import auth, class_access, database

router = APIRouter()


@router.get("/user/access")
async def get_user_access(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    return class_access.resolve_access(db, current_user)


class ClassViewSave(BaseModel):
    view: int | Literal["all", "classes"]


@router.put("/user/access/view")
async def save_class_view(
    payload: ClassViewSave,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    """Store the student's active view (#146): class view, one class, or full view."""
    class_access.save_view(db, current_user, payload.view)
    return class_access.resolve_access(db, current_user)
