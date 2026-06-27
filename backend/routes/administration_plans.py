"""Piani di somministrazione dei questionari sperimentali."""

import re
import secrets
import string
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas

router = APIRouter()
get_db = database.get_db

CODE_RE = re.compile(r"^AP-[A-Z0-9][A-Z0-9-]{2,28}$")
CODE_ALPHABET = string.ascii_uppercase + string.digits
PLAN_STATUSES = {"planned", "active", "completed", "archived"}


def _identity_get(identity, key: str, default=None):
    if isinstance(identity, dict):
        return identity.get(key, default)
    return getattr(identity, key, default)


def _is_admin(identity) -> bool:
    return bool(_identity_get(identity, "is_admin", False))


def _username(identity) -> Optional[str]:
    value = _identity_get(identity, "username") or ""
    return str(value).strip() or None


def _email(identity) -> Optional[str]:
    value = _identity_get(identity, "email") or ""
    return str(value).strip() or None


def _clean(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _normalize_locale(value: Optional[str]) -> str:
    locale = (value or "en").strip().lower()
    return locale or "en"


def _normalize_status(value: Optional[str]) -> str:
    status = (value or "planned").strip().lower()
    if status not in PLAN_STATUSES:
        raise HTTPException(status_code=400, detail="Stato piano non valido")
    return status


def _normalize_code(value: str) -> str:
    code = re.sub(r"\s+", "-", value.strip().upper())
    if not CODE_RE.fullmatch(code):
        raise HTTPException(
            status_code=400,
            detail="Codice piano non valido: usa formato AP-XXXXXX",
        )
    return code


def _generate_code(db: Session) -> str:
    for _ in range(20):
        suffix = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        code = f"AP-{suffix}"
        exists = db.query(models.AdministrationPlan).filter(models.AdministrationPlan.code == code).first()
        if not exists:
            return code
    raise HTTPException(status_code=500, detail="Impossibile generare un codice piano univoco")


def _matching_contact_ids(db: Session, identity) -> list[int]:
    username = _username(identity)
    email = _email(identity)
    filters = []
    if username:
        filters.append(func.lower(models.ResearchContact.ext_username) == username.lower())
    if email:
        filters.append(func.lower(models.ResearchContact.email) == email.lower())
    if not filters:
        return []
    return [
        row.id
        for row in db.query(models.ResearchContact.id).filter(or_(*filters)).all()
    ]


def _visible_plan_query(db: Session, identity):
    query = db.query(models.AdministrationPlan)
    if _is_admin(identity):
        return query

    contact_ids = _matching_contact_ids(db, identity)
    username = _username(identity)
    clauses = []
    if contact_ids:
        plan_ids = (
            db.query(models.AdministrationPlanResearcher.plan_id)
            .filter(models.AdministrationPlanResearcher.research_contact_id.in_(contact_ids))
        )
        clauses.append(models.AdministrationPlan.id.in_(plan_ids))
    if username:
        clauses.append(models.AdministrationPlan.created_by_username == username)
    if not clauses:
        return query.filter(models.AdministrationPlan.id == -1)
    return query.filter(or_(*clauses))


def _require_visible_plan(db: Session, identity, plan_id: int) -> models.AdministrationPlan:
    plan = _visible_plan_query(db, identity).filter(models.AdministrationPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Piano di somministrazione non trovato")
    return plan


def _responses_count(db: Session, plan_id: int) -> int:
    sessions = {
        row.session_id
        for row in db.query(models.QuestionnaireResult.session_id)
        .filter(models.QuestionnaireResult.administration_plan_id == plan_id)
        .all()
    }
    sessions.update({
        row.session_id
        for row in db.query(models.ValidationResponse.session_id)
        .filter(models.ValidationResponse.administration_plan_id == plan_id)
        .all()
    })
    return len(sessions)


def _serialize_researchers(db: Session, plan_id: int) -> list[dict]:
    links = (
        db.query(models.AdministrationPlanResearcher)
        .filter(models.AdministrationPlanResearcher.plan_id == plan_id)
        .order_by(models.AdministrationPlanResearcher.id.asc())
        .all()
    )
    contacts = {
        contact.id: contact
        for contact in db.query(models.ResearchContact)
        .filter(models.ResearchContact.id.in_([link.research_contact_id for link in links if link.research_contact_id]))
        .all()
    } if links else {}

    rows: list[dict] = []
    for link in links:
        contact = contacts.get(link.research_contact_id) if link.research_contact_id else None
        name = contact.name if contact else (link.external_name or "")
        rows.append({
            "id": link.id,
            "research_contact_id": link.research_contact_id,
            "external_name": link.external_name,
            "name": name,
            "email": contact.email if contact else None,
            "institution": contact.institution if contact else None,
        })
    return rows


def _serialize_plan(db: Session, plan: models.AdministrationPlan) -> dict:
    return {
        "id": plan.id,
        "code": plan.code,
        "title": plan.title,
        "instrument_code": plan.instrument_code,
        "locale": plan.locale,
        "scheduled_at": plan.scheduled_at,
        "location": plan.location,
        "notes": plan.notes,
        "status": plan.status,
        "created_by_username": plan.created_by_username,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
        "researchers": _serialize_researchers(db, plan.id),
        "responses_count": _responses_count(db, plan.id),
    }


def _replace_researchers(
    db: Session,
    plan_id: int,
    researchers: list[schemas.AdministrationPlanResearcherInput],
) -> None:
    db.query(models.AdministrationPlanResearcher).filter(
        models.AdministrationPlanResearcher.plan_id == plan_id
    ).delete()

    seen_contact_ids: set[int] = set()
    seen_external_names: set[str] = set()
    for item in researchers or []:
        contact_id = item.research_contact_id
        external_name = _clean(item.external_name)
        if contact_id:
            if contact_id in seen_contact_ids:
                continue
            contact = db.query(models.ResearchContact).filter(models.ResearchContact.id == contact_id).first()
            if not contact:
                raise HTTPException(status_code=400, detail=f"Contatto ricercatore non trovato: {contact_id}")
            seen_contact_ids.add(contact_id)
            db.add(models.AdministrationPlanResearcher(
                plan_id=plan_id,
                research_contact_id=contact_id,
            ))
        elif external_name:
            normalized_name = external_name.lower()
            if normalized_name in seen_external_names:
                continue
            seen_external_names.add(normalized_name)
            db.add(models.AdministrationPlanResearcher(
                plan_id=plan_id,
                external_name=external_name,
            ))


@router.get("/admin/administration-plans", response_model=List[schemas.AdministrationPlanResponse])
async def list_administration_plans(
    current_user=Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    plans = (
        _visible_plan_query(db, current_user)
        .order_by(models.AdministrationPlan.scheduled_at.desc().nullslast(), models.AdministrationPlan.created_at.desc())
        .all()
    )
    return [_serialize_plan(db, plan) for plan in plans]


@router.post("/admin/administration-plans", response_model=schemas.AdministrationPlanResponse)
async def create_administration_plan(
    payload: schemas.AdministrationPlanCreate,
    current_user=Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    title = _clean(payload.title)
    if not title:
        raise HTTPException(status_code=400, detail="Titolo piano obbligatorio")
    code = _normalize_code(payload.code) if payload.code else _generate_code(db)
    if db.query(models.AdministrationPlan).filter(models.AdministrationPlan.code == code).first():
        raise HTTPException(status_code=409, detail="Codice piano gia' esistente")

    plan = models.AdministrationPlan(
        code=code,
        title=title,
        instrument_code=(payload.instrument_code or "QSA").strip() or "QSA",
        locale=_normalize_locale(payload.locale),
        scheduled_at=payload.scheduled_at,
        location=_clean(payload.location),
        notes=_clean(payload.notes),
        status=_normalize_status(payload.status),
        created_by_username=_username(current_user),
    )
    db.add(plan)
    db.flush()
    _replace_researchers(db, plan.id, payload.researchers)
    db.commit()
    db.refresh(plan)
    return _serialize_plan(db, plan)


@router.put("/admin/administration-plans/{plan_id}", response_model=schemas.AdministrationPlanResponse)
async def update_administration_plan(
    plan_id: int,
    payload: schemas.AdministrationPlanUpdate,
    current_user=Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    plan = _require_visible_plan(db, current_user, plan_id)
    updates = payload.model_dump(exclude_unset=True)
    if "title" in updates:
        title = _clean(updates["title"])
        if not title:
            raise HTTPException(status_code=400, detail="Titolo piano obbligatorio")
        plan.title = title
    if "instrument_code" in updates:
        plan.instrument_code = _clean(updates["instrument_code"]) or "QSA"
    if "locale" in updates:
        plan.locale = _normalize_locale(updates["locale"])
    if "scheduled_at" in updates:
        plan.scheduled_at = updates["scheduled_at"]
    if "location" in updates:
        plan.location = _clean(updates["location"])
    if "notes" in updates:
        plan.notes = _clean(updates["notes"])
    if "status" in updates:
        plan.status = _normalize_status(updates["status"])
    if payload.researchers is not None:
        _replace_researchers(db, plan.id, payload.researchers)

    db.commit()
    db.refresh(plan)
    return _serialize_plan(db, plan)


@router.delete("/admin/administration-plans/{plan_id}")
async def delete_administration_plan(
    plan_id: int,
    current_user=Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    plan = _require_visible_plan(db, current_user, plan_id)
    if _responses_count(db, plan.id):
        raise HTTPException(
            status_code=409,
            detail="Il piano ha risposte collegate: archiviarlo invece di eliminarlo",
        )
    db.query(models.AdministrationPlanResearcher).filter(
        models.AdministrationPlanResearcher.plan_id == plan.id
    ).delete()
    db.delete(plan)
    db.commit()
    return {"ok": True, "deleted": plan_id}


@router.get(
    "/admin/administration-plans/{plan_id}/responses",
    response_model=schemas.AdministrationPlanResponsesResponse,
)
async def get_administration_plan_responses(
    plan_id: int,
    current_user=Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    plan = _require_visible_plan(db, current_user, plan_id)
    questionnaire_results = (
        db.query(models.QuestionnaireResult)
        .filter(models.QuestionnaireResult.administration_plan_id == plan.id)
        .order_by(models.QuestionnaireResult.submitted_at.desc())
        .all()
    )
    validation_responses = (
        db.query(models.ValidationResponse)
        .filter(models.ValidationResponse.administration_plan_id == plan.id)
        .order_by(models.ValidationResponse.submitted_at.desc())
        .all()
    )
    return {
        "plan": _serialize_plan(db, plan),
        "questionnaire_results": questionnaire_results,
        "validation_responses": validation_responses,
    }
