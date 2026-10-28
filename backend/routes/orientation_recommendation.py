"""Consiglio orientativo: documento interno della classe per studente.

Solo i docenti autorizzati della classe (proprietario, co-docenti e amministratori,
come la visibilità dei gruppi) leggono, scrivono ed esportano il documento. La
bozza assistita è una proposta del modello: entra nel documento solo con il
salvataggio esplicito. Mai visibile allo studente o al link del consiglio.
"""
from datetime import UTC, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import auth, database, models, orientation_recommendation, pdf_generator
from ..group_visibility import _username
from .groups import _require_visible_group

router = APIRouter()
get_db = database.get_db

MAX_CONTENT_CHARS = 20000
VALID_STATUSES = ("draft", "final")


def _display_names(db: Session, usernames: List[str]) -> dict:
    rows = (
        db.query(models.UserDisplayName.username, models.UserDisplayName.display_name)
        .filter(models.UserDisplayName.username.in_(usernames))
        .all()
    ) if usernames else []
    return dict(rows)


def _serialize(row: models.OrientationRecommendation) -> dict:
    return {
        "group_id": row.group_id,
        "username": row.username,
        "content": row.content,
        "status": row.status,
        "ai_draft_used": bool(row.ai_draft_used),
        "revision": row.revision,
        "created_by": row.created_by,
        "updated_by": row.updated_by,
        "final_at": row.final_at.isoformat() if row.final_at else None,
        "final_by": row.final_by,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _serialize_summary(row: models.OrientationRecommendation) -> dict:
    # L'elenco porta stato e revisione, non il testo: una scheda non valida
    # non deve scaricare tutti i documenti della classe.
    return _serialize(row) | {"content": ""}


def _members(db: Session, group_id: int) -> list:
    return [
        username
        for (username,) in db.query(models.GroupMembership.username)
        .filter(models.GroupMembership.group_id == group_id)
        .distinct()
    ]


def _find_member_row(db: Session, group_id: int, username: str) -> models.OrientationRecommendation | None:
    """La riga del documento, se esiste; il membro deve esistere comunque."""
    member = (
        db.query(models.GroupMembership.username)
        .filter(models.GroupMembership.group_id == group_id, models.GroupMembership.username == username)
        .first()
    )
    if member is None:
        raise HTTPException(status_code=404, detail="orientation_student_not_found")
    return (
        db.query(models.OrientationRecommendation)
        .filter(
            models.OrientationRecommendation.group_id == group_id,
            models.OrientationRecommendation.username == username,
        )
        .first()
    )


def _load(db: Session, identity, group_id: int, username: str) -> tuple:
    group = _require_visible_group(db, identity, group_id)
    row = _find_member_row(db, group_id, username)
    if row is None:
        raise HTTPException(status_code=404, detail="orientation_not_found")
    return group, row


class RecommendationUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=MAX_CONTENT_CHARS)
    status: Optional[str] = None
    revision: int = Field(default=0, ge=0)
    ai_draft_used: Optional[bool] = None


@router.get("/teacher/groups/{group_id}/orientation-recommendations")
async def list_recommendations(group_id: int, current_user=Depends(auth.get_current_plan_manager),
                               db: Session = Depends(get_db)):
    _require_visible_group(db, current_user, group_id)
    members = _members(db, group_id)
    names = _display_names(db, members)
    rows = (
        db.query(models.OrientationRecommendation)
        .filter(models.OrientationRecommendation.group_id == group_id)
        .all()
    )
    by_username = {row.username: _serialize_summary(row) for row in rows}
    # Unione di iscritti e righe: una riga orfana non sparisce dal tab del docente.
    usernames = sorted(set(members) | set(by_username),
                       key=lambda user: (names.get(user) or user).lower())
    return [
        {
            "username": username,
            "display_name": names.get(username) or username,
            **(by_username.get(username) or {"status": None, "revision": 0, "ai_draft_used": False}),
        }
        for username in usernames
    ]


@router.get("/teacher/groups/{group_id}/orientation-recommendations/{username}")
async def get_recommendation(group_id: int, username: str,
                             current_user=Depends(auth.get_current_plan_manager),
                             db: Session = Depends(get_db)):
    group = _require_visible_group(db, current_user, group_id)
    row = _find_member_row(db, group_id, username)
    payload = _serialize(row) if row else {
        "group_id": group_id, "username": username, "content": "", "status": None,
        "ai_draft_used": False, "revision": 0, "updated_by": None, "final_at": None,
        "final_by": None, "created_at": None, "updated_at": None,
    }
    payload["display_name"] = _display_names(db, [username]).get(username) or username
    payload["group_name"] = group.name
    return payload


@router.put("/teacher/groups/{group_id}/orientation-recommendations/{username}")
async def put_recommendation(group_id: int, username: str, payload: RecommendationUpdate,
                             current_user=Depends(auth.get_current_plan_manager),
                             db: Session = Depends(get_db)):
    if payload.status is not None and payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail="orientation_status_invalid")
    username = username.strip()
    _require_visible_group(db, current_user, group_id)
    existing = _find_member_row(db, group_id, username)
    actor = _username(current_user) or ""
    if existing is None:
        row = models.OrientationRecommendation(
            group_id=group_id, username=username, content="", status="draft",
            created_by=actor, updated_by=actor, revision=1,
        )
        db.add(row)
    else:
        # Un solo autore salvato alla volta: le altre schede ricaricano.
        if existing.revision != payload.revision:
            raise HTTPException(status_code=409, detail="orientation_conflict")
        row = existing
        row.revision += 1
    row.content = payload.content
    row.updated_by = actor
    if payload.status is not None:
        row.status = payload.status
    if payload.ai_draft_used is not None:
        row.ai_draft_used = payload.ai_draft_used
    if row.status == "final":
        if row.final_at is None:
            row.final_at = datetime.now(UTC)
        row.final_by = actor
    else:
        row.final_at = None
        row.final_by = None
    db.commit()
    db.refresh(row)
    return _serialize(row)


@router.post("/teacher/groups/{group_id}/orientation-recommendations/{username}/ai-draft")
async def create_ai_draft(group_id: int, username: str,
                          current_user=Depends(auth.get_current_plan_manager),
                          db: Session = Depends(get_db)):
    """Bozza proposta dal modello: non viene mai salvata da sola."""
    group = _require_visible_group(db, current_user, group_id)
    _find_member_row(db, group_id, username.strip())
    display_name = _display_names(db, [username]).get(username) or username
    draft = orientation_recommendation.generate_draft(
        db, group, username.strip(), display_name, _username(current_user) or "")
    if draft is None:
        raise HTTPException(status_code=502, detail="orientation_draft_unavailable")
    return {"draft": draft}


@router.get("/teacher/groups/{group_id}/orientation-recommendations/{username}/pdf")
async def download_recommendation_pdf(group_id: int, username: str,
                                      current_user=Depends(auth.get_current_plan_manager),
                                      db: Session = Depends(get_db)):
    group, row = _load(db, current_user, group_id, username)
    display_name = _display_names(db, [username]).get(username) or username
    if not (row.content or "").strip():
        raise HTTPException(status_code=404, detail="orientation_empty")
    pdf_bytes = pdf_generator.generate_orientation_pdf(
        group_name=group.name,
        student_name=display_name,
        content=row.content,
        status=row.status,
        updated_by=row.updated_by,
        updated_at=row.updated_at,
        final_at=row.final_at,
        lang="it",
    )
    from urllib.parse import quote

    slug = quote(display_name, safe="") if display_name else "consiglio-orientativo"
    return Response(
        content=pdf_bytes.read(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="consiglio-orientativo_{slug}.pdf"'},
    )
