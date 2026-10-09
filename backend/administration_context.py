"""Institution-context contract shared by every questionnaire result writer (#149).

The institute is the only owner of the externally issued code and password
verifier. A local verification grant proves that the authenticated user entered
credentials matching that verifier for one administration plan; it makes no claim
about issuance, validity or completion at competenzestrategiche.it. Grants travel
in request bodies only, never URLs, and only their SHA-256 digest is stored.
"""
import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models

GRANT_TTL = timedelta(minutes=30)
ATTEMPT_WINDOW = timedelta(minutes=15)
MAX_FAILED_ATTEMPTS = 10
CODE_RE = re.compile(r"^[A-Za-z0-9-]{1,50}$")
# Request/metadata keys that must never reach persistent storage.
SECRET_METADATA_KEYS = frozenset({"institution_password", "password", "institution_grant", "grant"})


def normalize_code(value) -> str | None:
    """Trim surrounding whitespace only; comparisons are case-insensitive."""
    if not isinstance(value, str):
        return None
    code = value.strip()
    return code if CODE_RE.fullmatch(code) else None


def valid_password(value) -> bool:
    # Never trim or transform: the password is stored exactly as entered.
    return isinstance(value, str) and value != "" and len(value.encode("utf-8")) <= models.BCRYPT_MAX_BYTES


def credentials_configured(institution: models.Institution | None) -> bool:
    return bool(institution and institution.institution_code and institution.hashed_password)


def strip_secrets(metadata: dict) -> dict:
    return {key: value for key, value in metadata.items() if key not in SECRET_METADATA_KEYS}


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _error(status: int, code: str, **extra):
    return HTTPException(status_code=status, detail={"code": code, **extra})


def require_institution_backed(db: Session, plan: models.AdministrationPlan) -> models.Institution:
    """Plan state checks shared by verification and writers (string detail for the verifier)."""
    if plan.institution_link_state == "needs_reconciliation":
        raise HTTPException(status_code=409, detail="administration_needs_reconciliation")
    if plan.institution_id is None:
        raise HTTPException(status_code=409, detail="administration_not_institution_backed")
    institution = db.get(models.Institution, plan.institution_id)
    if institution is None or not institution.is_active:
        raise HTTPException(status_code=409, detail="institution_inactive")
    if not credentials_configured(institution):
        raise HTTPException(status_code=409, detail="institution_credentials_missing")
    return institution


def issue_grant(db: Session, username: str, plan: models.AdministrationPlan, code, password) -> dict:
    institution = require_institution_backed(db, plan)
    since = datetime.now(timezone.utc) - ATTEMPT_WINDOW
    failures = db.query(models.InstitutionVerificationAttempt).filter(
        models.InstitutionVerificationAttempt.username == username,
        models.InstitutionVerificationAttempt.administration_plan_id == plan.id,
        models.InstitutionVerificationAttempt.created_at >= since,
    ).count()
    if failures >= MAX_FAILED_ATTEMPTS:
        raise HTTPException(status_code=429, detail="institution_verification_throttled")
    normalized = normalize_code(code)
    if (not normalized or normalized.lower() != institution.institution_code.strip().lower()
            or not valid_password(password) or not models.verify_password(password, institution.hashed_password)):
        db.add(models.InstitutionVerificationAttempt(username=username, administration_plan_id=plan.id))
        db.commit()
        raise HTTPException(status_code=403, detail="institution_verification_failed")
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + GRANT_TTL
    db.add(models.InstitutionVerificationGrant(
        token_hash=_digest(token), username=username, administration_plan_id=plan.id,
        institution_id=institution.id, credentials_revision=institution.credentials_revision, expires_at=expires_at,
    ))
    db.commit()
    return {"grant": token, "expires_at": expires_at.isoformat(),
            "institution": {"id": institution.id, "name": institution.name,
                            "institution_code": institution.institution_code}}


def require_result_context(db: Session, plan_id: int | None, username: str | None, grant,
                           instrument_code: str | None = None) -> models.AdministrationPlan | None:
    """Validate a result write's administration context before anything is added.

    Standalone writes (no plan) and explicit no-institute plans keep their existing
    policy. Institute-backed plans need an authenticated user and a live grant bound
    to that user, plan, institute and credential revision. Known but invalid context
    fails explicitly instead of falling back to a standalone result.
    """
    if plan_id is None:
        return None
    plan = db.get(models.AdministrationPlan, plan_id)
    if plan is None:
        raise _error(404, "administration_not_found")
    if plan.institution_link_state == "needs_reconciliation":
        raise _error(409, "administration_needs_reconciliation")
    if plan.institution_id is None:
        return plan
    institution = db.get(models.Institution, plan.institution_id)
    if institution is None or not institution.is_active:
        raise _error(409, "institution_inactive")
    if not credentials_configured(institution):
        raise _error(409, "institution_credentials_missing")
    if not username:
        raise _error(401, "authentication_required")
    if instrument_code and (plan.instrument_code or "").lower() != instrument_code.lower():
        raise _error(422, "administration_instrument_mismatch")
    if not isinstance(grant, str) or not grant:
        raise _error(403, "institution_verification_required", administration_plan_id=plan.id,
                     institution_name=institution.name, institution_code=institution.institution_code)
    row = db.query(models.InstitutionVerificationGrant).filter_by(token_hash=_digest(grant)).first()
    if row is None:
        raise _error(403, "institution_grant_invalid", administration_plan_id=plan.id)
    if (row.username != username or row.administration_plan_id != plan.id or row.institution_id != institution.id
            or row.credentials_revision != institution.credentials_revision):
        raise _error(403, "institution_grant_mismatch", administration_plan_id=plan.id)
    if row.expires_at <= datetime.now(timezone.utc):
        raise _error(403, "institution_grant_expired", administration_plan_id=plan.id)
    return plan


def code_taken(db: Session, code: str, institution_id: int) -> bool:
    return db.query(models.Institution.id).filter(
        func.lower(func.btrim(models.Institution.institution_code)) == code.lower(),
        models.Institution.id != institution_id,
    ).first() is not None
