"""Piani di somministrazione dei questionari sperimentali."""

import re
import secrets
import string
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import administration_context, auth, database, models, schemas, scoring_service
from ..reading_audience import AUDIENCE_BANDS
from ..user_names import store_user_display_name

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


def _valid_level(value) -> str | None:
    """Fascia dei partecipanti: filtra le letture certificate per eta'."""
    level = (value or "").strip() or None
    if level and level not in AUDIENCE_BANDS:
        raise HTTPException(status_code=400, detail=f"Fascia non valida: usa una fra {list(AUDIENCE_BANDS)}")
    return level


def _reject_legacy_credentials(payload) -> None:
    """Plans reference the institute; they never own a second set of credentials."""
    if payload.institution_code is not None or payload.institution_password is not None:
        raise HTTPException(status_code=422, detail="administration_credentials_moved_to_institution")


def _active_member(db: Session, identity, institution_id: int) -> bool:
    username = _username(identity)
    return bool(username) and db.query(models.InstitutionTeacher).filter_by(
        institution_id=institution_id, username=username, is_active=True).first() is not None


def _validate_institution_link(db: Session, identity, institution_id: Optional[int]) -> Optional[int]:
    """Administrators may link any active institute; others need active membership."""
    if institution_id is None:
        return None
    institution = db.get(models.Institution, institution_id)
    if institution is None:
        raise HTTPException(status_code=422, detail="institution_not_found")
    if not _is_admin(identity) and not _active_member(db, identity, institution_id):
        raise HTTPException(status_code=403, detail="institution_link_forbidden")
    if not institution.is_active:
        raise HTTPException(status_code=409, detail="institution_inactive")
    return institution.id


def _require_class_agreement(db: Session, group_id: Optional[int], institution_id: Optional[int]) -> None:
    group = db.get(models.StudentGroup, group_id) if group_id else None
    if group is not None and group.institution_id is not None and group.institution_id != institution_id:
        raise HTTPException(status_code=422, detail="administration_institution_mismatch")


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


def _group_name(db: Session, group_id: Optional[int]) -> Optional[str]:
    if not group_id:
        return None
    group = db.query(models.StudentGroup).filter(models.StudentGroup.id == group_id).first()
    return group.name if group else None


def _validate_group_attach(db: Session, identity, group_id: Optional[int]) -> Optional[int]:
    """Un non-admin puo' agganciare al piano solo le PROPRIE classi o quelle condivise."""
    if not group_id:
        return None
    group = db.query(models.StudentGroup).filter(models.StudentGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=400, detail="Classe non trovata")
    if not _is_admin(identity):
        username = _username(identity)
        if group.owner_username == username:
            return group.id
        share = db.query(models.GroupShare).filter(
            models.GroupShare.group_id == group.id,
            models.GroupShare.shared_with_username == (username or "").lower(),
        ).first()
        if not share:
            raise HTTPException(status_code=403, detail="Puoi agganciare solo le tue classi o quelle condivise con te")
    return group.id


def _serialize_plan(db: Session, plan: models.AdministrationPlan) -> dict:
    institution = db.get(models.Institution, plan.institution_id) if plan.institution_id else None
    reconciling = plan.institution_link_state == "needs_reconciliation"
    return {
        "id": plan.id,
        "code": plan.code,
        "title": plan.title,
        "instrument_code": plan.instrument_code,
        "group_id": plan.group_id,
        "group_name": _group_name(db, plan.group_id),
        "locale": plan.locale,
        "delivery_mode": plan.delivery_mode,
        "school_level": plan.school_level,
        "scheduled_at": plan.scheduled_at,
        "location": plan.location,
        "notes": plan.notes,
        "status": plan.status,
        "institution_id": plan.institution_id,
        "institution_name": institution.name if institution else None,
        # Canonical code from the institute; the legacy plan copy is shown only for reconciliation.
        "institution_code": institution.institution_code if institution else None,
        "institution_credentials_configured": administration_context.credentials_configured(institution),
        "institution_link_state": plan.institution_link_state,
        "reconciliation_reason": plan.reconciliation_reason,
        "legacy_institution_code": plan.institution_code if reconciling else None,
        "revision": plan.revision,
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
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    plans = (
        _visible_plan_query(db, current_user)
        .order_by(models.AdministrationPlan.scheduled_at.desc().nullslast(), models.AdministrationPlan.created_at.desc())
        .all()
    )
    return [_serialize_plan(db, plan) for plan in plans]


@router.get("/admin/administration-plans/institution-options")
async def list_plan_institution_options(
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Institutes the actor may link: all active ones for administrators, memberships otherwise."""
    query = db.query(models.Institution).filter(models.Institution.is_active.is_(True))
    if not _is_admin(current_user):
        query = query.join(models.InstitutionTeacher, models.InstitutionTeacher.institution_id == models.Institution.id
                           ).filter(models.InstitutionTeacher.username == (_username(current_user) or ""),
                                    models.InstitutionTeacher.is_active.is_(True))
    return [
        {"id": row.id, "name": row.name, "institution_code": row.institution_code,
         "credentials_configured": row.credentials_configured}
        for row in query.order_by(models.Institution.name, models.Institution.id).all()
    ]


@router.post("/user/administrations/{plan_id}/verify-institution")
async def verify_administration_institution(
    plan_id: int,
    request: Request,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Check transient code/password against the plan's institute and issue a scoped grant.

    The body is parsed by hand so validation errors never echo the password.
    """
    username = _username(current_user)
    if not username:
        raise HTTPException(status_code=401, detail="authentication_required")
    plan = db.get(models.AdministrationPlan, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="administration_not_found")
    try:
        payload = await request.json()
    except ValueError:
        payload = None
    if not isinstance(payload, dict):
        payload = {}
    return administration_context.issue_grant(
        db, username, plan, payload.get("institution_code"), payload.get("password"))


@router.post("/admin/administration-plans", response_model=schemas.AdministrationPlanResponse)
async def create_administration_plan(
    payload: schemas.AdministrationPlanCreate,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    plan = _build_plan(db, payload, current_user)
    db.commit()
    db.refresh(plan)
    return _serialize_plan(db, plan)


def _build_plan(db: Session, payload: schemas.AdministrationPlanCreate, current_user) -> models.AdministrationPlan:
    title = _clean(payload.title)
    if not title:
        raise HTTPException(status_code=400, detail="Titolo piano obbligatorio")
    code = _normalize_code(payload.code) if payload.code else _generate_code(db)
    if db.query(models.AdministrationPlan).filter(models.AdministrationPlan.code == code).first():
        raise HTTPException(status_code=409, detail="Codice piano gia' esistente")

    _reject_legacy_credentials(payload)
    institution_id = _validate_institution_link(db, current_user, payload.institution_id)
    group_id = _validate_group_attach(db, current_user, payload.group_id)
    _require_class_agreement(db, group_id, institution_id)
    store_user_display_name(db, current_user)
    plan = models.AdministrationPlan(
        code=code,
        title=title,
        instrument_code=(payload.instrument_code or "QSA").strip() or "QSA",
        group_id=group_id,
        locale=_normalize_locale(payload.locale),
        delivery_mode="external_it" if _normalize_locale(payload.locale) == "it" else "in_app",
        school_level=_valid_level(payload.school_level),
        scheduled_at=payload.scheduled_at,
        location=_clean(payload.location),
        notes=_clean(payload.notes),
        status=_normalize_status(payload.status),
        institution_id=institution_id,
        institution_link_state="linked" if institution_id else "unlinked",
        revision=1,
        created_by_username=_username(current_user),
    )
    db.add(plan)
    db.flush()
    _replace_researchers(db, plan.id, payload.researchers)
    return plan


def build_class_administration(db: Session, current_user, group: models.StudentGroup, *,
                               title: str, instrument_code: str, locale: str) -> models.AdministrationPlan:
    """Path publication creates the class administration inside its own transaction."""
    if group.institution_id is None:
        raise HTTPException(status_code=409, detail="class_institution_required")
    _require_class_locale(db, instrument_code, locale)
    payload = schemas.AdministrationPlanCreate(title=title, instrument_code=instrument_code, locale=locale,
                                               group_id=group.id, institution_id=group.institution_id)
    return _build_plan(db, payload, current_user)


@router.put("/admin/administration-plans/{plan_id}", response_model=schemas.AdministrationPlanResponse)
async def update_administration_plan(
    plan_id: int,
    payload: schemas.AdministrationPlanUpdate,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    _require_visible_plan(db, current_user, plan_id)
    return await _update_plan_after_access(plan_id, payload, current_user, db)


async def _update_plan_after_access(plan_id, payload, current_user, db):
    _reject_legacy_credentials(payload)
    plan = (db.query(models.AdministrationPlan).filter(models.AdministrationPlan.id == plan_id)
            .populate_existing().with_for_update().one())
    if plan.revision != payload.revision:
        raise HTTPException(status_code=409, detail="administration_revision_conflict")
    updates = payload.model_dump(exclude_unset=True, exclude={"revision", "institution_code", "institution_password"})
    linked_step = db.query(models.ClassPathStep.id).filter(
        models.ClassPathStep.administration_plan_id == plan.id,
        models.ClassPathStep.active_from.is_not(None)).first()
    if linked_step and any(key in updates and updates[key] != getattr(plan, key)
                           for key in ("instrument_code", "locale", "group_id", "institution_id")):
        raise HTTPException(409, "activated_administration_target_immutable")
    if "title" in updates:
        title = _clean(updates["title"])
        if not title:
            raise HTTPException(status_code=400, detail="Titolo piano obbligatorio")
        plan.title = title
    if "instrument_code" in updates:
        plan.instrument_code = _clean(updates["instrument_code"]) or "QSA"
    if "group_id" in updates:
        plan.group_id = _validate_group_attach(db, current_user, updates["group_id"])
    if "locale" in updates:
        plan.locale = _normalize_locale(updates["locale"])
        plan.delivery_mode = "external_it" if plan.locale == "it" else "in_app"
    if "school_level" in updates:
        plan.school_level = _valid_level(updates["school_level"])
    if "scheduled_at" in updates:
        plan.scheduled_at = updates["scheduled_at"]
    if "location" in updates:
        plan.location = _clean(updates["location"])
    if "notes" in updates:
        plan.notes = _clean(updates["notes"])
    if "status" in updates:
        plan.status = _normalize_status(updates["status"])
    if "institution_id" in updates:
        # Unchanged links do not re-check membership, so co-editors keep editing other fields;
        # confirming a legacy candidate during reconciliation always does.
        if updates["institution_id"] != plan.institution_id or plan.institution_link_state == "needs_reconciliation":
            plan.institution_id = _validate_institution_link(db, current_user, updates["institution_id"])
        # An explicit institute choice (or explicit no-institute) resolves legacy reconciliation.
        plan.institution_link_state = "linked" if plan.institution_id else "unlinked"
        plan.reconciliation_reason = None
        plan.institution_code = None
        plan.institution_password = None
    if "group_id" in updates or "institution_id" in updates:
        _require_class_agreement(db, plan.group_id, plan.institution_id)
    if payload.researchers is not None:
        _replace_researchers(db, plan.id, payload.researchers)

    plan.revision += 1
    db.commit()
    db.refresh(plan)
    return _serialize_plan(db, plan)


@router.delete("/admin/administration-plans/{plan_id}")
async def delete_administration_plan(
    plan_id: int,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    plan = _require_visible_plan(db, current_user, plan_id)
    # Non-admin (docenti/ricercatori): elimina solo chi ha creato il piano.
    if not _is_admin(current_user) and plan.created_by_username != _username(current_user):
        raise HTTPException(status_code=403, detail="Solo il creatore del piano puo' eliminarlo")
    if db.query(models.ClassPathStep.id).filter_by(administration_plan_id=plan.id).first():
        raise HTTPException(409, "administration_referenced_by_path")
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
    current_user=Depends(auth.get_current_plan_manager),
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

# --- Studenti del piano (risultati + transcript). Note/messaggi: routes/groups.py --

@router.get("/admin/administration-plans/{plan_id}/students")
async def get_administration_plan_students(
    plan_id: int,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Studenti del piano: membri della classe agganciata + chi ha risultati taggati,
    con risultati, learner model e link Telegram."""
    from .learner_profile import _latest_revision

    plan = _require_visible_plan(db, current_user, plan_id)
    results = (
        db.query(models.QuestionnaireResult)
        .filter(models.QuestionnaireResult.administration_plan_id == plan.id)
        .order_by(models.QuestionnaireResult.submitted_at.desc())
        .all()
    )
    by_student: dict[str, list[models.QuestionnaireResult]] = {}
    for result in results:
        if result.username:
            by_student.setdefault(result.username, []).append(result)
    if plan.group_id:
        members = (
            db.query(models.GroupMembership)
            .filter(models.GroupMembership.group_id == plan.group_id)
            .all()
        )
        for member in members:
            by_student.setdefault(member.username, [])

    students = []
    for username, rows in sorted(by_student.items()):
        telegram_link = (
            db.query(models.TelegramAccountLink)
            .filter(
                models.TelegramAccountLink.username == username,
                models.TelegramAccountLink.revoked_at.is_(None),
            )
            .first()
        )
        profile = _latest_revision(db, username)
        students.append({
            "username": username,
            "telegram_linked": bool(telegram_link),
            "learner_profile": profile.data if profile else None,
            "results": [
                {
                    "id": row.id,
                    "session_id": row.session_id,
                    "questionnaire_type": row.questionnaire_type,
                    "scores": row.scores,
                    "submitted_at": row.submitted_at.isoformat() if row.submitted_at else None,
                }
                for row in rows
            ],
        })
    return {"plan_id": plan.id, "students": students}


@router.get("/admin/administration-plans/{plan_id}/students/{username}/conversation/{session_id}")
async def get_plan_student_conversation(
    plan_id: int,
    username: str,
    session_id: str,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Transcript di una sessione di uno studente del piano (informativa in pagina gruppo)."""
    from .survey import _session_conversation_messages

    plan = _require_visible_plan(db, current_user, plan_id)
    result = (
        db.query(models.QuestionnaireResult)
        .filter(
            models.QuestionnaireResult.administration_plan_id == plan.id,
            models.QuestionnaireResult.username == username,
            models.QuestionnaireResult.session_id == session_id,
        )
        .first()
    )
    if not result:
        raise HTTPException(status_code=404, detail="Sessione non trovata in questo piano")
    return _session_conversation_messages(db, session_id)


def _require_class_locale(db: Session, instrument_code: Optional[str], locale: Optional[str]) -> None:
    """Class administrations outside Italian run in app: only served locales are offered."""
    code = (instrument_code or "QSA").strip() or "QSA"
    normalized = _normalize_locale(locale)
    if normalized != "it" and not scoring_service.locale_available(db, code, normalized):
        raise HTTPException(status_code=422, detail="administration_locale_unavailable")


@router.get("/teacher/groups/{group_id}/administrations")
async def list_class_administrations(group_id: int, current_user=Depends(auth.get_current_plan_manager),
                                     db: Session = Depends(get_db)):
    from .class_paths import _require_visible_group
    _require_visible_group(db, current_user, group_id)
    return [_serialize_plan(db, row) for row in db.query(models.AdministrationPlan).filter_by(group_id=group_id)
            .order_by(models.AdministrationPlan.id.desc()).all()]


@router.post("/teacher/groups/{group_id}/administrations", response_model=schemas.AdministrationPlanResponse)
async def create_class_administration(group_id: int, payload: schemas.AdministrationPlanCreate,
                                      current_user=Depends(auth.get_current_plan_manager), db: Session = Depends(get_db)):
    from .class_paths import _require_visible_group
    group = _require_visible_group(db, current_user, group_id, for_update=True)
    if group.institution_id is None:
        raise HTTPException(status_code=409, detail="class_institution_required")
    if ((payload.group_id is not None and payload.group_id != group.id)
            or (payload.institution_id is not None and payload.institution_id != group.institution_id)):
        raise HTTPException(status_code=422, detail="administration_class_context_mismatch")
    _require_class_locale(db, payload.instrument_code, payload.locale)
    bound = payload.model_copy(update={"group_id":group.id, "institution_id":group.institution_id})
    return await create_administration_plan(bound, current_user, db)


@router.get("/teacher/administrations/{plan_id}", response_model=schemas.AdministrationPlanResponse)
async def get_teacher_administration(plan_id: int, current_user=Depends(auth.get_current_plan_manager),
                                     db: Session = Depends(get_db)):
    from .class_paths import _require_visible_group
    plan = db.get(models.AdministrationPlan, plan_id)
    if not plan or not plan.group_id:
        raise HTTPException(status_code=404, detail="administration_not_found")
    _require_visible_group(db, current_user, plan.group_id)
    return _serialize_plan(db, plan)


@router.put("/teacher/administrations/{plan_id}", response_model=schemas.AdministrationPlanResponse)
async def update_teacher_administration(plan_id: int, payload: schemas.AdministrationPlanUpdate,
                                        current_user=Depends(auth.get_current_plan_manager), db: Session=Depends(get_db)):
    plan = db.get(models.AdministrationPlan, plan_id)
    if not plan or not plan.group_id:
        raise HTTPException(404, "administration_not_found")
    from .class_paths import _require_visible_group
    _require_visible_group(db, current_user, plan.group_id)
    if payload.locale is not None or payload.instrument_code is not None:
        _require_class_locale(db, payload.instrument_code or plan.instrument_code, payload.locale or plan.locale)
    # Reuse the canonical editor after class-scoped authorization, without widening research reads.
    return await _update_plan_after_access(plan_id, payload, current_user, db)
