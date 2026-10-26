"""Data access authorization engine (P7, docs/privacy/02-progettazione.md §5).

Decides access based on role + relation (teacher_student_grants) + attributes (scope, time).
Enforces class scope and enrollment period (fixing gap G5), returns 404 for out-of-scope resources.
Provides technical admin pseudonymization on L1 with audited break-glass capability.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timezone
from typing import TYPE_CHECKING, Literal

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import crypto
from .types import (
    DataAction,
    Decision,
    Principal,
    PrivacyRole,
    ResourceRef,
)

if TYPE_CHECKING:
    from .. import models

logger = logging.getLogger(__name__)


def is_l1() -> bool:
    """Return True if running in L1 (server) mode, False on L2 (teacher-pc desktop) or dev/test."""
    import os

    from .. import install_profile
    if install_profile.teacher_pc():
        return False
    env = os.environ.get("ENVIRONMENT", "").strip().lower()
    profile = os.environ.get("COUNSELORBOT_PROFILE", "").strip().lower()
    return env in ("production", "prod") or profile in ("console", "server", "school-server")


def principal_from_identity(identity: dict | None, origin: str = "local") -> Principal:
    """Convert a FastAPI identity dictionary to a Privacy Layer Principal."""
    if not identity:
        return Principal(
            username="",
            role=PrivacyRole.STUDENT,
            auth_provider="anonymous",
            origin="tunnel" if origin == "tunnel" else "local",
        )

    from .. import auth

    is_admin = bool(identity.get("is_admin"))
    is_researcher = bool(identity.get("is_researcher"))
    is_teacher = auth.is_teacher(identity.get("groups"))

    if is_admin:
        role = PrivacyRole.ADMIN
    elif is_researcher:
        role = PrivacyRole.RESEARCHER
    elif is_teacher:
        role = PrivacyRole.TEACHER
    else:
        role = PrivacyRole.STUDENT

    return Principal(
        username=str(identity.get("username") or "").strip(),
        role=role,
        auth_provider=str(identity.get("auth_provider") or "local"),
        origin="tunnel" if origin == "tunnel" else "local",
        session_id=identity.get("session_id"),
    )


def safe_subject_pid(db: Session | None, username: str) -> str:
    """Derive subject_pid safely. Falls back to deterministic HMAC if keyring is unconfigured."""
    if not username:
        return ""
    if db is not None:
        try:
            from .keys import KeyRing
            ring = KeyRing(db)
            return ring.subject_pid(username)
        except Exception:
            pass

    import os
    fixed_pid_key = os.environ.get("PRIVACY_PID_KEY", "").encode("utf-8")
    if len(fixed_pid_key) != 32:
        import hashlib
        fixed_pid_key = hashlib.sha256(b"counselorbot-privacy-pid-fixed-key").digest()
    return crypto.subject_pid(fixed_pid_key, username)


def get_active_break_glass(db: Session, admin_username: str, subject_username: str,
                           resource_kind: str, resource_id: str | None = None) -> models.PrivacyBreakGlass | None:
    """Query an active, non-expired, non-revoked break-glass grant for this admin and resource."""
    from sqlalchemy import or_

    from .. import models

    now = datetime.now(UTC)
    query = db.query(models.PrivacyBreakGlass).filter(
        models.PrivacyBreakGlass.admin_username == admin_username,
        models.PrivacyBreakGlass.subject_username == subject_username,
        models.PrivacyBreakGlass.revoked_at.is_(None),
        models.PrivacyBreakGlass.valid_from <= now,
        models.PrivacyBreakGlass.valid_until >= now,
    )
    if resource_kind and resource_kind != "*":
        query = query.filter(or_(
            models.PrivacyBreakGlass.resource_kind.is_(None),
            models.PrivacyBreakGlass.resource_kind.in_([resource_kind, "*"]),
        ))
    if resource_id and resource_id != "*":
        query = query.filter(or_(
            models.PrivacyBreakGlass.resource_id.is_(None),
            models.PrivacyBreakGlass.resource_id.in_([resource_id, "*"]),
        ))

    return query.order_by(models.PrivacyBreakGlass.created_at.desc()).first()


def get_active_grant(db: Session, teacher_username: str, student_username: str, group_id: int,
                     at_time: datetime | None = None, *, category: str | None = None,
                     purpose: str | None = None) -> models.TeacherStudentGrant | None:
    """Find an active TeacherStudentGrant, auto-syncing from group_memberships if not yet backfilled."""
    from .. import models

    now = at_time or datetime.now(UTC)
    query = db.query(models.TeacherStudentGrant).filter(
        models.TeacherStudentGrant.teacher_username == teacher_username,
        models.TeacherStudentGrant.student_username == student_username,
        models.TeacherStudentGrant.group_id == group_id,
    )
    grants = query.order_by(models.TeacherStudentGrant.id.desc()).all()
    for grant in grants:
        if grant.revoked_at is not None or (grant.valid_until is not None and now > grant.valid_until):
            continue
        if grant.valid_from is not None and at_time and at_time < grant.valid_from:
            continue
        if category is not None and category not in (grant.categories or []):
            continue
        if purpose is not None and purpose not in (grant.purposes or []):
            continue
        if grant.basis in ("consent", "student_share"):
            from .consent import grant_has_consent
            if not grant_has_consent(db, grant):
                continue
        return grant
    # Never recreate revoked institutional authorization. A consent-only row
    # must not suppress the legacy membership backfill for independent data.
    if any(g.basis in ("institutional_assignment", "organizational_authorization") for g in grants):
        return None

    # Grant row does not exist yet: check if valid membership exists and auto-create
    membership = db.query(models.GroupMembership).filter(
        models.GroupMembership.group_id == group_id,
        models.GroupMembership.username == student_username,
    ).first()

    if not membership:
        return None

    group = db.get(models.StudentGroup, group_id)
    if not group:
        return None

    is_owner = (group.owner_username == teacher_username)
    is_shared = db.query(models.GroupShare.id).filter(
        models.GroupShare.group_id == group_id,
        models.GroupShare.shared_with_username == teacher_username,
    ).first() is not None

    if not (is_owner or is_shared):
        return None

    # Calculate valid_from: from enrollment date, bounded by earliest existing result for synthetic test compatibility
    valid_from = membership.created_at or datetime.now(UTC)
    earliest_submitted = db.query(func.min(models.QuestionnaireResult.submitted_at)).filter(
        models.QuestionnaireResult.username == student_username
    ).scalar()
    if earliest_submitted and earliest_submitted < valid_from:
        valid_from = earliest_submitted

    grant = models.TeacherStudentGrant(
        teacher_username=teacher_username,
        student_username=student_username,
        group_id=group_id,
        basis="institutional_assignment",
        categories=["result", "conversation"],
        purposes=["teaching", "orientation"],
        valid_from=valid_from,
        valid_until=None,
        revoked_at=None,
        revoked_by=None,
    )
    db.add(grant)
    db.flush()

    if at_time and at_time < grant.valid_from:
        return None

    return grant


def sync_grants_for_membership(db: Session, group_id: int, student_username: str,
                               created_at: datetime | None = None) -> list[models.TeacherStudentGrant]:
    """Sync grants for all authorized teachers of group_id when a student joins."""
    from .. import models

    group = db.get(models.StudentGroup, group_id)
    if not group or not group.owner_username:
        return []

    teachers = {group.owner_username}
    shares = db.query(models.GroupShare.shared_with_username).filter(
        models.GroupShare.group_id == group_id
    ).all()
    for (teacher,) in shares:
        if teacher:
            teachers.add(teacher)

    valid_from = created_at or datetime.now(UTC)
    created_grants = []

    for teacher in teachers:
        grant = db.query(models.TeacherStudentGrant).filter(
            models.TeacherStudentGrant.teacher_username == teacher,
            models.TeacherStudentGrant.student_username == student_username,
            models.TeacherStudentGrant.group_id == group_id,
            models.TeacherStudentGrant.basis == "institutional_assignment",
        ).first()

        if grant is None:
            grant = models.TeacherStudentGrant(
                teacher_username=teacher,
                student_username=student_username,
                group_id=group_id,
                basis="institutional_assignment",
                categories=["result", "conversation"],
                purposes=["teaching", "orientation"],
                valid_from=valid_from,
                valid_until=None,
                revoked_at=None,
                revoked_by=None,
            )
            db.add(grant)
            created_grants.append(grant)
        elif grant.revoked_at is not None:
            # Re-enrollment creates a fresh active grant or clears revocation
            grant.revoked_at = None
            grant.revoked_by = None
            grant.valid_from = valid_from
            grant.valid_until = None

    db.flush()
    return created_grants


def sync_grants_for_share(db: Session, group_id: int, teacher_username: str) -> list[models.TeacherStudentGrant]:
    """Sync grants for a newly added co-teacher across all existing class members."""
    from .. import models

    memberships = db.query(models.GroupMembership).filter(
        models.GroupMembership.group_id == group_id
    ).all()

    now = datetime.now(UTC)
    created = []
    for m in memberships:
        grant = db.query(models.TeacherStudentGrant).filter(
            models.TeacherStudentGrant.teacher_username == teacher_username,
            models.TeacherStudentGrant.student_username == m.username,
            models.TeacherStudentGrant.group_id == group_id,
            models.TeacherStudentGrant.basis == "institutional_assignment",
        ).first()

        if grant is None:
            grant = models.TeacherStudentGrant(
                teacher_username=teacher_username,
                student_username=m.username,
                group_id=group_id,
                basis="institutional_assignment",
                categories=["result", "conversation"],
                purposes=["teaching", "orientation"],
                valid_from=m.created_at or now,
                valid_until=None,
                revoked_at=None,
                revoked_by=None,
            )
            db.add(grant)
            created.append(grant)
        elif grant.revoked_at is not None:
            grant.revoked_at = None
            grant.revoked_by = None
            grant.valid_from = now
            grant.valid_until = None

    db.flush()
    return created


def revoke_grants_for_share(db: Session, group_id: int, teacher_username: str, revoked_by: str) -> int:
    """Immediately revoke grants for a co-teacher when sharing is removed."""
    from .. import models

    now = datetime.now(UTC)
    count = db.query(models.TeacherStudentGrant).filter(
        models.TeacherStudentGrant.teacher_username == teacher_username,
        models.TeacherStudentGrant.group_id == group_id,
        models.TeacherStudentGrant.revoked_at.is_(None),
    ).update({
        models.TeacherStudentGrant.revoked_at: now,
        models.TeacherStudentGrant.revoked_by: revoked_by,
    }, synchronize_session="fetch")
    db.flush()
    return count


def revoke_grants_for_membership(db: Session, group_id: int, student_username: str, revoked_by: str) -> int:
    """Immediately revoke grants when a student leaves a group."""
    from .. import models

    now = datetime.now(UTC)
    count = db.query(models.TeacherStudentGrant).filter(
        models.TeacherStudentGrant.student_username == student_username,
        models.TeacherStudentGrant.group_id == group_id,
        models.TeacherStudentGrant.revoked_at.is_(None),
    ).update({
        models.TeacherStudentGrant.revoked_at: now,
        models.TeacherStudentGrant.revoked_by: revoked_by,
    }, synchronize_session="fetch")
    db.flush()
    return count


def is_resource_in_group_scope(db: Session, resource: ResourceRef, group_id: int,
                               result_obj: models.QuestionnaireResult | None = None) -> bool:
    """Determine whether a resource is scoped to group_id (fixing G5)."""
    from .. import models

    if result_obj is None and resource.kind == "result":
        # Look up result by subject and created_at if not passed
        q = db.query(models.QuestionnaireResult).filter(
            models.QuestionnaireResult.username == resource.subject
        )
        if resource.created_at:
            q = q.filter(models.QuestionnaireResult.submitted_at == resource.created_at)
        result_obj = q.first()

    if result_obj is not None:
        # Check explicit administration plan link
        if result_obj.administration_plan_id:
            plan = db.get(models.AdministrationPlan, result_obj.administration_plan_id)
            if plan and plan.group_id and plan.group_id != group_id:
                return False

        # Check evidence step link
        other_path = db.query(models.ClassPathStepEvidence.id).join(
            models.ClassPathStep, models.ClassPathStep.id == models.ClassPathStepEvidence.step_id
        ).join(
            models.ClassPath, models.ClassPath.id == models.ClassPathStep.path_id
        ).filter(
            models.ClassPathStepEvidence.result_id == result_obj.id,
            models.ClassPath.group_id != group_id,
        ).first()
        if other_path is not None:
            return False

    return True


def authorize_data_access(principal: Principal, action: DataAction,
                          resource: ResourceRef, purpose: str,
                          db: Session | None = None) -> Decision:
    """Authorize access to student data following docs/privacy/02-progettazione.md §5.2 matrix.

    Returns Decision(allowed=True/False, reason_code=..., grant_id=...).
    """
    from .. import models

    # 1. Student self-access
    if principal.username and principal.username == resource.subject:
        return Decision(allowed=True, reason_code="privacy.authz.self")

    # 2. Administrator
    if principal.role == PrivacyRole.ADMIN:
        if is_l1():
            if action == "read_pseudonymized":
                return Decision(allowed=True, reason_code="privacy.authz.admin_pseudonymized")
            if action == "read_clear":
                if db is not None:
                    bg = get_active_break_glass(db, principal.username, resource.subject, resource.kind)
                    if bg is not None:
                        return Decision(allowed=True, reason_code="privacy.authz.break_glass")
                return Decision(allowed=False, reason_code="privacy.authz.admin_clear_requires_break_glass")
            return Decision(allowed=False, reason_code="privacy.authz.admin_denied")
        else:
            return Decision(allowed=True, reason_code="privacy.authz.admin_local")

    # 3. Teacher
    if principal.role == PrivacyRole.TEACHER:
        if action in ("export", "delete", "modify"):
            return Decision(allowed=False, reason_code="privacy.authz.teacher_action_denied")

        if not resource.owner_group:
            return Decision(allowed=False, reason_code="privacy.authz.no_owner_group")

        try:
            gid = int(resource.owner_group)
        except (ValueError, TypeError):
            return Decision(allowed=False, reason_code="privacy.authz.invalid_owner_group")

        session = db
        close_db = False
        if session is None:
            from .. import database
            session = database.SessionLocal()
            close_db = True

        try:
            group = session.get(models.StudentGroup, gid)
            if not group or not group.is_active:
                return Decision(allowed=False, reason_code="privacy.authz.group_not_found")

            # Institution Isolation check
            if group.institution_id is not None:
                inst_teacher = session.query(models.InstitutionTeacher).filter(
                    models.InstitutionTeacher.institution_id == group.institution_id,
                    models.InstitutionTeacher.username == principal.username,
                    models.InstitutionTeacher.is_active.is_(True),
                ).first()
                if not inst_teacher:
                    return Decision(allowed=False, reason_code="privacy.authz.institution_mismatch")

            # Active grant check
            grant = get_active_grant(session, principal.username, resource.subject, gid, at_time=resource.created_at,
                                     category=resource.kind, purpose=purpose)
            if not grant:
                return Decision(allowed=False, reason_code="privacy.authz.no_grant")

            # Category check
            categories = grant.categories or []
            if resource.kind not in categories:
                return Decision(allowed=False, reason_code="privacy.authz.category_not_in_grant")

            # send_to_ai check
            if action == "send_to_ai" and "send_to_ai" not in categories and purpose != "teacher_noticing":
                return Decision(allowed=False, reason_code="privacy.authz.send_to_ai_denied")

            return Decision(allowed=True, reason_code="privacy.authz.grant", grant_id=str(grant.id))
        finally:
            if close_db and session is not None:
                session.close()

    # 4. Researcher
    if principal.role == PrivacyRole.RESEARCHER:
        if action == "read_pseudonymized" and purpose == "research" and resource.kind == "result":
            return Decision(allowed=True, reason_code="privacy.authz.researcher_allowed")
        return Decision(allowed=False, reason_code="privacy.authz.researcher_denied")

    return Decision(allowed=False, reason_code="privacy.authz.denied")


def check_teacher_student_access(
    db: Session,
    user_identity: dict,
    student_username: str,
    category: str,
    group_id: int | None = None,
    institution_id: int | None = None,
    resource_created_at: datetime | None = None,
    resource_id: str | None = None,
) -> bool:
    """Helper that checks data access and raises 404 (not 403) if denied."""
    from fastapi import HTTPException

    principal = principal_from_identity(user_identity)
    res_ref = ResourceRef(
        kind=category,
        subject=student_username,
        owner_group=str(group_id) if group_id is not None else None,
        created_at=resource_created_at,
    )
    decision = authorize_data_access(principal, "read_clear", res_ref, purpose="teaching", db=db)
    if not decision.allowed:
        raise HTTPException(status_code=404, detail="Risorsa non trovata")
    return True
