"""Resolved class access for the current user (plan §5.1, #89)."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import auth, class_access, database

router = APIRouter()


@router.get("/user/access")
async def get_user_access(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(database.get_db),
):
    return class_access.resolve_access(db, current_user)
