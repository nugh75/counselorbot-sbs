"""Quali istituti valgono per questo studente.

Il taccuino vince perche' e' la persona a dichiararlo, e uno studente puo'
appartenere a una classe creata da un ricercatore esterno che non e' la sua
scuola. La classe e' il fallback perche' copre chi il taccuino non lo apre mai.

La sentinella `NOT_LISTED` viene salvata perche' l'interfaccia non richieda la
scelta a ogni apertura del taccuino, ma qui e' **ignorata**: non trovare il
proprio istituto in elenco non significa che la propria classe non lo sappia.

Le righe nazionali (`institution_id IS NULL`) non compaiono qui: valgono
sempre, e ad aggiungerle e' il servizio di retrieval.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from . import models

# Valore salvato dal taccuino quando lo studente sceglie «non trovo il mio
# istituto». Non e' uno slug: nessun istituto puo' chiamarsi cosi'.
NOT_LISTED = "__not_listed__"


def _declared_slug(db: Session, username: str) -> str:
    revision = (
        db.query(models.LearnerProfileRevision)
        .filter(models.LearnerProfileRevision.username == username)
        .order_by(models.LearnerProfileRevision.id.desc())
        .first()
    )
    if revision is None or not isinstance(revision.data, dict):
        return ""
    slug = str(revision.data.get("institution_slug") or "").strip()
    return "" if slug == NOT_LISTED else slug


def _from_classes(db: Session, username: str) -> list[int]:
    rows = (
        db.query(models.StudentGroup.institution_id)
        .join(models.GroupMembership, models.GroupMembership.group_id == models.StudentGroup.id)
        .filter(
            models.GroupMembership.username == username,
            models.StudentGroup.is_active.is_(True),
            models.StudentGroup.institution_id.isnot(None),
        )
        .all()
    )
    seen: list[int] = []
    for (institution_id,) in rows:
        if institution_id not in seen:
            seen.append(institution_id)
    return seen


def _active(db: Session, ids: list[int]) -> list[int]:
    if not ids:
        return []
    live = {
        row.id for row in
        db.query(models.Institution.id)
        .filter(models.Institution.id.in_(ids), models.Institution.is_active.is_(True))
        .all()
    }
    return [i for i in ids if i in live]


def institution_ids_for(db: Session, username: str) -> list[int]:
    """Istituti dello studente: taccuino, altrimenti classi. Solo quelli attivi."""
    owner = (username or "").strip()
    if db is None or not owner:
        return []

    slug = _declared_slug(db, owner)
    if slug:
        row = (
            db.query(models.Institution)
            .filter(models.Institution.slug == slug, models.Institution.is_active.is_(True))
            .first()
        )
        if row is not None:
            return [row.id]
        # Istituto dichiarato ma disattivato o sparito: vale come non
        # dichiarato, e il fallback riprende da capo.

    return _active(db, _from_classes(db, owner))


def institution_for(db: Session, username: str) -> models.Institution | None:
    """Il primo istituto risolto, per l'intestazione della directory."""
    ids = institution_ids_for(db, username)
    if not ids:
        return None
    return db.query(models.Institution).filter(models.Institution.id == ids[0]).first()
