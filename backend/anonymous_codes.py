"""Codici anonimi persistenti per questionari e log interazione."""
import secrets
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import models

_ANONYMOUS_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def generate_anonymous_research_code() -> str:
    chars = "".join(secrets.choice(_ANONYMOUS_CODE_ALPHABET) for _ in range(8))
    return f"SBS-{chars[:4]}-{chars[4:]}"


def get_or_create_anonymous_research_code(db: Session, username: str) -> str:
    """Recupera o crea su DB il codice anonimo stabile dell'utente."""
    normalized = (username or "").strip().lower()
    if not normalized:
        return ""

    existing = (
        db.query(models.AnonymousResearchCode)
        .filter(models.AnonymousResearchCode.username == normalized)
        .first()
    )
    if existing:
        return existing.code

    for _ in range(12):
        code = generate_anonymous_research_code()
        if db.query(models.AnonymousResearchCode).filter(models.AnonymousResearchCode.code == code).first():
            continue
        row = models.AnonymousResearchCode(username=normalized, code=code)
        db.add(row)
        try:
            db.flush()
            return row.code
        except IntegrityError:
            db.rollback()
            existing = (
                db.query(models.AnonymousResearchCode)
                .filter(models.AnonymousResearchCode.username == normalized)
                .first()
            )
            if existing:
                return existing.code

    raise HTTPException(status_code=500, detail="Unable to create anonymous research code")


def code_for_identity(db: Session, identity: Optional[dict]) -> Optional[str]:
    username = (identity or {}).get("username")
    if not username:
        return None
    return get_or_create_anonymous_research_code(db, username)
