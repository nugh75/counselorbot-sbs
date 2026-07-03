"""Nomi visualizzati degli utenti staff (da header ai4auth Remote-Name/Email).

Upsert idempotente: chiamato quando l'utente crea piani/classi o apre il
riepilogo utenti. Unica implementazione condivisa tra i router.
"""
from sqlalchemy.orm import Session

from . import models


def _get(identity, key):
    return identity.get(key) if isinstance(identity, dict) else getattr(identity, key, None)


def store_user_display_name(db: Session, identity) -> None:
    """Salva/aggiorna il nome visualizzato per l'utente autenticato (flush, no commit)."""
    username = str(_get(identity, "username") or "").strip()
    if not username:
        return
    display_name = str(_get(identity, "name") or "").strip() or username
    email = str(_get(identity, "email") or "").strip()
    existing = db.query(models.UserDisplayName).filter(models.UserDisplayName.username == username).first()
    if existing:
        if existing.display_name != display_name or existing.email != email:
            existing.display_name = display_name
            existing.email = email
    else:
        db.add(models.UserDisplayName(username=username, display_name=display_name, email=email))
    db.flush()
