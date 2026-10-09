"""Classi/gruppi di studenti: entita' autonoma del docente.

La classe esiste a prescindere dalle somministrazioni; lo studente entra con il
link di invito (web /gruppo?g=CODICE o deep link Telegram) oppure inserendo il
codice classe dal profilo. Un piano di somministrazione puo' agganciare la
classe (AdministrationPlan.group_id): i risultati degli studenti della classe
vengono taggati automaticamente col piano dello strumento corrispondente.
Note e messaggi del docente vivono qui, sulla classe.
"""
import re
import secrets
import string
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy import or_

from .. import auth, database, models, schemas
from ..reading_audience import AUDIENCE_BANDS
from ..user_names import store_user_display_name
from ..class_tools import ALWAYS_ON, tool_catalog

router = APIRouter()
get_db = database.get_db

GROUP_CODE_RE = re.compile(r"^GR-[A-Z0-9][A-Z0-9-]{2,28}$")
CODE_ALPHABET = string.ascii_uppercase + string.digits


def _username(identity) -> Optional[str]:
    value = (identity.get("username") if isinstance(identity, dict) else getattr(identity, "username", "")) or ""
    return str(value).strip() or None


def _is_admin(identity) -> bool:
    return bool(identity.get("is_admin") if isinstance(identity, dict) else getattr(identity, "is_admin", False))


def _generate_code(db: Session) -> str:
    for _ in range(20):
        suffix = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        code = f"GR-{suffix}"
        if not db.query(models.StudentGroup).filter(models.StudentGroup.code == code).first():
            return code
    raise HTTPException(status_code=500, detail="Impossibile generare un codice classe univoco")


def _visible_group_query(db: Session, identity):
    query = db.query(models.StudentGroup)
    if _is_admin(identity):
        return query
    username = _username(identity)
    # Proprietario o condivisa (shared_with_username e' salvato lowercase)
    shared_ids = db.query(models.GroupShare.group_id).filter(
        models.GroupShare.shared_with_username == (username or "").lower()
    )
    return query.filter(
        or_(
            models.StudentGroup.owner_username == username,
            models.StudentGroup.id.in_(shared_ids),
        )
    )


def _require_visible_group(db: Session, identity, group_id: int) -> models.StudentGroup:
    group = _visible_group_query(db, identity).filter(models.StudentGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Classe non trovata")
    return group


def _members_count(db: Session, group_id: int) -> int:
    return db.query(models.GroupMembership).filter(models.GroupMembership.group_id == group_id).count()



def _valid_level(value) -> str | None:
    """Fascia della classe: serve a filtrare le letture certificate per eta'."""
    level = (value or "").strip() or None
    if level and level not in AUDIENCE_BANDS:
        raise HTTPException(status_code=400, detail=f"Fascia non valida: usa una fra {list(AUDIENCE_BANDS)}")
    return level


def _serialize_group(db: Session, group: models.StudentGroup) -> dict:
    return {
        "id": group.id,
        "code": group.code,
        "name": group.name,
        "school": group.school,
        "school_level": group.school_level,
        "institution_id": group.institution_id,
        "description": group.description,
        "methodologies": group.methodologies,
        "context_visible_to_students": bool(group.context_visible_to_students),
        "owner_username": group.owner_username,
        "is_active": group.is_active,
        "members_count": _members_count(db, group.id),
        "created_at": group.created_at.isoformat() if group.created_at else None,
    }


def _serialize_note(note: models.TeacherNote) -> dict:
    return {
        "id": note.id,
        "group_id": note.group_id,
        "username": note.username,
        "author_username": note.author_username,
        "kind": note.kind,
        "text": note.text,
        "visible_to_student": note.visible_to_student,
        "telegram_delivered": note.telegram_delivered,
        "created_at": note.created_at.isoformat() if note.created_at else None,
    }


def ensure_membership(db: Session, group_id: int, username: str, joined_via: str) -> models.GroupMembership:
    """Iscrizione idempotente di uno studente a una classe."""
    membership = (
        db.query(models.GroupMembership)
        .filter(
            models.GroupMembership.group_id == group_id,
            models.GroupMembership.username == username,
        )
        .first()
    )
    if membership:
        return membership
    membership = models.GroupMembership(group_id=group_id, username=username, joined_via=joined_via)
    db.add(membership)
    return membership


def _require_group_member(db: Session, group: models.StudentGroup, username: str) -> None:
    member = (
        db.query(models.GroupMembership.id)
        .filter(
            models.GroupMembership.group_id == group.id,
            models.GroupMembership.username == username,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Studente non trovato in questa classe")


# --- CRUD classi (docente/ricercatore/admin) ---------------------------------

def _require_settings_group(db: Session, identity, group_id: int, *, for_update=False):
    query = _visible_group_query(db, identity).filter(models.StudentGroup.id == group_id)
    if for_update:
        query = query.with_for_update()
    group = query.first()
    if not group:
        raise HTTPException(status_code=403, detail="Class settings access denied")
    return group


def _serialize_settings(db: Session, group_id: int, settings) -> dict:
    disabled_tools = settings.disabled_tool_keys if settings else []
    disabled_counselors = settings.disabled_counselor_ids if settings else []
    result = {
        "group_id": group_id,
        "revision": settings.revision if settings else 1,
        "disabled_tool_keys": disabled_tools,
        "disabled_counselor_ids": disabled_counselors,
        "default_counselor_id": settings.default_counselor_id if settings else None,
        "tools": tool_catalog(db, disabled_tools),
        "counselors": [{"id": row.id, "name": row.name, "avatar_url": row.avatar_url,
                        "approach_categories": row.approach_categories or [],
                        "admin_enabled": bool(row.is_active),
                        "enabled": bool(row.is_active) and row.id not in disabled_counselors}
                       for row in db.query(models.Counselor).filter(
                           models.Counselor.owner_username.is_(None)
                       ).order_by(models.Counselor.sort_order, models.Counselor.id).all()],
        "forum": {"students_can_open": bool(settings.forum_students_can_open) if settings else False,
                  "premoderation": bool(settings.forum_premoderation) if settings else False},
    }
    latest = {}
    for row in db.query(models.ClassSettingsAuditLog).filter_by(group_id=group_id).order_by(models.ClassSettingsAuditLog.id.desc()):
        if row.action != "unlock":
            latest.setdefault((row.target_kind, row.target_id), row.actor_role == "admin")
    for kind, rows, column, id_key in (
        ("tool", result["tools"], "locked_tool_keys", "key"),
        ("counselor", result["counselors"], "locked_counselor_ids", "id"),
    ):
        locks = (getattr(settings, column) or {}) if settings else {}
        for row in rows:
            target = str(row[id_key])
            lock = locks.get(target)
            row.update(locked=bool(lock), locked_enabled=lock["enabled"] if lock else None,
                       locked_by=lock.get("locked_by") if lock else None,
                       locked_at=lock.get("locked_at") if lock else None,
                       changed_by_admin=latest.get((kind, target), False))
            if lock:
                row["enabled"] = row["admin_enabled"] and lock["enabled"]
    locks = settings.locked_forum_options or {} if settings else {}
    for key in ("students_can_open", "premoderation"):
        result["forum"][f"{key}_locked"] = key in locks
        result["forum"][f"{key}_lock"] = locks.get(key)
        result["forum"][f"{key}_changed_by_admin"] = latest.get(("forum_option", key), False)
    return result


def _audit_setting(db, group_id, identity, action, kind, target, old, new, reason=None):
    db.add(models.ClassSettingsAuditLog(
        group_id=group_id, actor_username=_username(identity),
        actor_display_name=identity.get("name") or _username(identity),
        actor_role="admin" if _is_admin(identity) else "teacher", action=action,
        target_kind=kind, target_id=str(target), old_value=old, new_value=new,
        reason=reason.strip() or None if reason else None,
    ))


def _locked_response(kind, target):
    return JSONResponse(status_code=422, content={"detail": "item_locked_by_admin",
                                                "item_kind": kind, "item_id": str(target)})


def _require_class_admin(identity):
    # The legacy active-admin dependency also admits researchers.
    if not _is_admin(identity):
        raise HTTPException(403, "Class administration requires an administrator")


@router.get("/admin/classes")
async def list_admin_classes(search: str = "", owner: str = "", institution_id: Optional[int] = None,
                             is_active: Optional[bool] = None,
                             current_user=Depends(auth.get_current_user), db: Session = Depends(get_db)):
    _require_class_admin(current_user)
    query = db.query(models.StudentGroup)
    if search.strip():
        needle = "%" + search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        query = query.filter(or_(*(column.ilike(needle, escape="\\") for column in (
            models.StudentGroup.name, models.StudentGroup.code, models.StudentGroup.school))))
    if owner:
        query = query.filter(models.StudentGroup.owner_username == owner)
    if institution_id is not None:
        query = query.filter(models.StudentGroup.institution_id == institution_id)
    if is_active is not None:
        query = query.filter(models.StudentGroup.is_active == is_active)
    groups = query.order_by(models.StudentGroup.name, models.StudentGroup.id).all()
    ids = [group.id for group in groups]
    settings = {row.group_id: row for row in db.query(models.ClassSettings).filter(models.ClassSettings.group_id.in_(ids))}
    names = {row.username: row.display_name for row in db.query(models.UserDisplayName).filter(
        models.UserDisplayName.username.in_([group.owner_username for group in groups]))}
    institutions = {row.id: row.name for row in db.query(models.Institution).filter(
        models.Institution.id.in_([group.institution_id for group in groups if group.institution_id]))}
    shares = {}
    for row in db.query(models.GroupShare).filter(models.GroupShare.group_id.in_(ids)).order_by(models.GroupShare.shared_with_username):
        shares.setdefault(row.group_id, []).append(row.shared_with_username)
    counts = dict(db.query(models.GroupMembership.group_id, func.count(models.GroupMembership.id)).filter(
        models.GroupMembership.group_id.in_(ids)).group_by(models.GroupMembership.group_id).all())
    result = []
    for group in groups:
        row = settings.get(group.id)
        result.append({"id": group.id, "name": group.name, "code": group.code, "school": group.school,
                       "school_level": group.school_level, "institution_id": group.institution_id,
                       "institution_name": institutions.get(group.institution_id),
                       "owner_username": group.owner_username, "owner_display_name": names.get(group.owner_username),
                       "co_teachers": shares.get(group.id, []), "members_count": counts.get(group.id, 0),
                       "is_active": group.is_active, "created_at": group.created_at,
                       "has_custom_settings": bool(row and (row.disabled_tool_keys or row.disabled_counselor_ids
                            or row.default_counselor_id or row.forum_students_can_open or row.forum_premoderation)),
                       "locked_items_count": sum(len(getattr(row, column) or {}) for column in (
                           "locked_tool_keys", "locked_counselor_ids", "locked_forum_options")) if row else 0})
    return result


@router.get("/teacher/groups/{group_id}/settings/audit-log")
async def class_settings_audit_log(group_id: int, current_user=Depends(auth.get_current_plan_manager),
                                  db: Session = Depends(get_db)):
    _require_settings_group(db, current_user, group_id)
    return [{key: getattr(row, key) for key in ("id", "actor_username", "actor_display_name", "actor_role",
             "action", "target_kind", "target_id", "old_value", "new_value", "reason", "created_at")}
            for row in db.query(models.ClassSettingsAuditLog).filter_by(group_id=group_id)
            .order_by(models.ClassSettingsAuditLog.id.desc()).all()]


def _lock_target(db, payload):
    if payload.target_kind == "tool":
        row = next((row for row in tool_catalog(db, []) if row["key"] == payload.target_id and not row["always_on"]), None)
        if row:
            return "locked_tool_keys", "enabled", row["admin_enabled"]
    elif payload.target_kind == "counselor":
        if payload.target_id.isascii() and payload.target_id.isdecimal() and str(int(payload.target_id)) == payload.target_id and 0 < int(payload.target_id) <= 2147483647:
            row = db.query(models.Counselor).filter_by(id=int(payload.target_id), owner_username=None).first()
            if row:
                return "locked_counselor_ids", "enabled", bool(row.is_active)
    elif payload.target_id in {"students_can_open", "premoderation"}:
        return "locked_forum_options", "value", True
    raise HTTPException(422, "Unknown or non-editable lock target")


def _item_state(settings, kind, target):
    if kind == "tool":
        return target not in (settings.disabled_tool_keys or [])
    if kind == "counselor":
        return int(target) not in (settings.disabled_counselor_ids or [])
    return bool(getattr(settings, "forum_" + target))


@router.post("/admin/groups/{group_id}/settings/lock")
async def lock_class_setting(group_id: int, payload: schemas.ClassSettingsLock,
                             current_user=Depends(auth.get_current_user), db: Session = Depends(get_db)):
    _require_class_admin(current_user)
    _require_settings_group(db, current_user, group_id, for_update=True)
    column, value_key, platform_enabled = _lock_target(db, payload)
    if payload.state and not platform_enabled:
        raise HTTPException(422, "cannot_lock_on_platform_disabled")
    settings = db.get(models.ClassSettings, group_id, populate_existing=True)
    if settings is None:
        settings = models.ClassSettings(group_id=group_id, revision=1, updated_by=_username(current_user))
        db.add(settings)
        db.flush()
    locks = dict(getattr(settings, column) or {})
    old = {value_key: _item_state(settings, payload.target_kind, payload.target_id), "locked": payload.target_id in locks}
    now = datetime.now(timezone.utc).isoformat()
    locks[payload.target_id] = {value_key: payload.state, "locked_by": _username(current_user), "locked_at": now}
    setattr(settings, column, locks)
    if payload.target_kind in {"tool", "counselor"}:
        deny_column = "disabled_tool_keys" if payload.target_kind == "tool" else "disabled_counselor_ids"
        target = payload.target_id if payload.target_kind == "tool" else int(payload.target_id)
        disabled = set(getattr(settings, deny_column) or [])
        disabled.discard(target) if payload.state else disabled.add(target)
        setattr(settings, deny_column, sorted(disabled))
        if payload.target_kind == "counselor" and not payload.state and settings.default_counselor_id == target:
            _audit_setting(db, group_id, current_user, "setting_change", "settings_bulk", "default_counselor_id",
                           target, None, payload.reason)
            settings.default_counselor_id = None
    else:
        setattr(settings, "forum_" + payload.target_id, payload.state)
    _audit_setting(db, group_id, current_user, "lock", payload.target_kind, payload.target_id,
                   old, {value_key: payload.state, "locked": True}, payload.reason)
    settings.revision += 1
    settings.updated_by = _username(current_user)
    db.commit()
    return {"status": "locked", "target_kind": payload.target_kind, "target_id": payload.target_id,
            "state": payload.state, "locked_by": _username(current_user), "locked_at": now}


@router.post("/admin/groups/{group_id}/settings/unlock")
async def unlock_class_setting(group_id: int, payload: schemas.ClassSettingsLockTarget,
                               current_user=Depends(auth.get_current_user), db: Session = Depends(get_db)):
    _require_class_admin(current_user)
    _require_settings_group(db, current_user, group_id, for_update=True)
    column, value_key, _ = _lock_target(db, payload)
    settings = db.get(models.ClassSettings, group_id, populate_existing=True)
    locks = dict(getattr(settings, column) or {}) if settings else {}
    if payload.target_id not in locks:
        raise HTTPException(404, "Class settings lock not found")
    old = locks.pop(payload.target_id)
    setattr(settings, column, locks)
    _audit_setting(db, group_id, current_user, "unlock", payload.target_kind, payload.target_id,
                   {value_key: old[value_key], "locked": True}, {value_key: old[value_key], "locked": False}, payload.reason)
    settings.revision += 1
    settings.updated_by = _username(current_user)
    db.commit()
    return {"status": "unlocked", "target_kind": payload.target_kind, "target_id": payload.target_id}


@router.get("/teacher/groups/{group_id}/settings")
async def get_class_settings(
    group_id: int,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    _require_settings_group(db, current_user, group_id)
    return _serialize_settings(db, group_id, db.get(models.ClassSettings, group_id))


@router.put("/teacher/groups/{group_id}/settings")
async def put_class_settings(
    group_id: int,
    payload: schemas.ClassSettingsUpdate,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    # Lock the parent even before the first settings row exists. Concurrent first
    # saves serialize here, so one wins and the other gets the usual 409.
    _require_settings_group(db, current_user, group_id, for_update=True)
    settings = db.get(models.ClassSettings, group_id, populate_existing=True)
    if payload.revision != (settings.revision if settings else 1):
        raise HTTPException(status_code=409, detail="Class settings revision mismatch")
    catalog = tool_catalog(db, [])
    allowed = {row["key"] for row in catalog if not row["always_on"]} - ALWAYS_ON
    if set(payload.disabled_tool_keys) - allowed:
        raise HTTPException(status_code=422, detail="Unknown or always-on tool key")
    institutional = {row.id: row for row in db.query(models.Counselor).filter(
        models.Counselor.owner_username.is_(None)
    ).all()}
    disabled_counselors = payload.disabled_counselor_ids
    if disabled_counselors is None:
        disabled_counselors = settings.disabled_counselor_ids if settings else []
    if set(disabled_counselors) - institutional.keys():
        raise HTTPException(status_code=422, detail="Unknown or private counselor")
    for kind, locks, disabled in (
        ("tool", settings.locked_tool_keys if settings else {}, set(payload.disabled_tool_keys)),
        ("counselor", settings.locked_counselor_ids if settings else {}, {str(id) for id in disabled_counselors}),
    ):
        for target, lock in (locks or {}).items():
            if lock["enabled"] != (target not in disabled):
                return _locked_response(kind, target)
    default_id = (payload.default_counselor_id if "default_counselor_id" in payload.model_fields_set
                  else settings.default_counselor_id if settings else None)
    if default_id is not None and (default_id not in institutional or default_id in disabled_counselors
                                   or not institutional[default_id].is_active):
        raise HTTPException(status_code=422, detail="Default counselor must be enabled and institutional")
    if settings is None:
        settings = models.ClassSettings(group_id=group_id, revision=1, updated_by=_username(current_user))
        db.add(settings)
        db.flush()
    for kind, old_disabled, new_disabled in (
        ("tool", set(settings.disabled_tool_keys or []), set(payload.disabled_tool_keys)),
        ("counselor", set(settings.disabled_counselor_ids or []), set(disabled_counselors)),
    ):
        for target in sorted(old_disabled ^ new_disabled):
            _audit_setting(db, group_id, current_user, "setting_change", kind, target,
                           {"enabled": target not in old_disabled}, {"enabled": target not in new_disabled}, payload.reason)
    if default_id != settings.default_counselor_id:
        _audit_setting(db, group_id, current_user, "setting_change", "settings_bulk", "default_counselor_id",
                       settings.default_counselor_id, default_id, payload.reason)
    settings.disabled_tool_keys = sorted(set(payload.disabled_tool_keys))
    settings.disabled_counselor_ids = sorted(set(disabled_counselors))
    settings.default_counselor_id = default_id
    settings.revision += 1
    settings.updated_by = _username(current_user)
    db.commit()
    db.refresh(settings)
    return _serialize_settings(db, group_id, settings)

@router.get("/admin/groups")
async def list_groups(
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    groups = _visible_group_query(db, current_user).order_by(models.StudentGroup.created_at.desc()).all()
    return [_serialize_group(db, group) for group in groups]


@router.post("/admin/groups")
async def create_group(
    payload: schemas.StudentGroupCreate,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nome classe obbligatorio")
    code = (payload.code or "").strip().upper() or _generate_code(db)
    if not GROUP_CODE_RE.fullmatch(code):
        raise HTTPException(status_code=400, detail="Codice classe non valido: formato GR-XXXXXX")
    if db.query(models.StudentGroup).filter(models.StudentGroup.code == code).first():
        raise HTTPException(status_code=409, detail="Codice classe gia' esistente")
    store_user_display_name(db, current_user)
    school = (payload.school or "").strip() or None
    level = _valid_level(payload.school_level)
    group = models.StudentGroup(code=code, name=name, school=school, school_level=level,
                                institution_id=payload.institution_id,
                                description=(payload.description or "").strip() or None,
                                methodologies=(payload.methodologies or "").strip() or None,
                                context_visible_to_students=bool(payload.context_visible_to_students),
                                owner_username=_username(current_user) or "")
    db.add(group)
    db.commit()
    db.refresh(group)
    return _serialize_group(db, group)


@router.put("/admin/groups/{group_id}")
async def update_group(
    group_id: int,
    payload: schemas.StudentGroupUpdate,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    group = _require_visible_group(db, current_user, group_id)
    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates:
        name = (updates["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Nome classe obbligatorio")
        group.name = name
    if "is_active" in updates:
        group.is_active = bool(updates["is_active"])
    if "school" in updates:
        group.school = (updates["school"] or "").strip() or None
    if "school_level" in updates:
        group.school_level = _valid_level(updates["school_level"])
    if "institution_id" in updates:
        value = updates["institution_id"]
        group.institution_id = int(value) if value else None
    if "description" in updates:
        group.description = (updates["description"] or "").strip() or None
    if "methodologies" in updates:
        group.methodologies = (updates["methodologies"] or "").strip() or None
    if "context_visible_to_students" in updates:
        group.context_visible_to_students = bool(updates["context_visible_to_students"])
    db.commit()
    db.refresh(group)
    return _serialize_group(db, group)


@router.delete("/admin/groups/{group_id}")
async def delete_group(
    group_id: int,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    group = _require_visible_group(db, current_user, group_id)
    if not _is_admin(current_user) and group.owner_username != _username(current_user):
        raise HTTPException(status_code=403, detail="Solo il creatore della classe puo' eliminarla")
    linked_plans = db.query(models.AdministrationPlan).filter(models.AdministrationPlan.group_id == group.id).count()
    if linked_plans:
        raise HTTPException(status_code=409, detail="La classe e' agganciata a piani di somministrazione: disattivarla invece di eliminarla")
    db.query(models.GroupMembership).filter(models.GroupMembership.group_id == group.id).delete()
    db.query(models.TeacherNote).filter(models.TeacherNote.group_id == group.id).delete()
    db.delete(group)
    db.commit()
    return {"ok": True, "deleted": group_id}


# --- Condivisione classe con altri docenti -----------------------------------

@router.get("/admin/groups/{group_id}/shares")
async def list_group_shares(
    group_id: int,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Elenco delle condivisioni di una classe visibile."""
    _require_visible_group(db, current_user, group_id)
    shares = (
        db.query(models.GroupShare)
        .filter(models.GroupShare.group_id == group_id)
        .order_by(models.GroupShare.created_at.asc())
        .all()
    )
    return shares


@router.post("/admin/groups/{group_id}/shares", response_model=schemas.GroupShareResponse)
async def create_group_share(
    group_id: int,
    payload: schemas.GroupShareCreate,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Condividi una classe con un altro utente (docente o admin).
    Solo il proprietario o un admin puo' condividere."""
    group = _require_visible_group(db, current_user, group_id)
    if not _is_admin(current_user) and group.owner_username != _username(current_user):
        raise HTTPException(status_code=403, detail="Solo il proprietario della classe o un admin puo' condividerla")
    shared_with = (payload.shared_with_username or "").strip().lower()
    if not shared_with:
        raise HTTPException(status_code=400, detail="Username destinatario obbligatorio")
    if shared_with == (_username(current_user) or "").lower():
        raise HTTPException(status_code=400, detail="Non puoi condividere la classe con te stesso")
    # Evita duplicati
    existing = (
        db.query(models.GroupShare)
        .filter(
            models.GroupShare.group_id == group.id,
            models.GroupShare.shared_with_username == shared_with,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Classe gia' condivisa con questo utente")
    share = models.GroupShare(
        group_id=group.id,
        shared_with_username=shared_with,
        granted_by_username=_username(current_user) or "",
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return share


@router.delete("/admin/groups/{group_id}/shares/{share_id}")
async def delete_group_share(
    group_id: int,
    share_id: int,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Rimuovi una condivisione. Solo il proprietario o chi ha condiviso o un admin."""
    group = _require_visible_group(db, current_user, group_id)
    share = db.query(models.GroupShare).filter(models.GroupShare.id == share_id, models.GroupShare.group_id == group.id).first()
    if not share:
        raise HTTPException(status_code=404, detail="Condivisione non trovata")
    username = _username(current_user)
    if not _is_admin(current_user) and group.owner_username != username and share.granted_by_username != username:
        raise HTTPException(status_code=403, detail="Solo il proprietario, il condividitore o un admin puo' rimuovere la condivisione")
    db.delete(share)
    db.commit()
    return {"ok": True, "deleted": share_id}


# --- Dashboard classe: studenti, transcript, note, messaggi ------------------

@router.get("/admin/groups/{group_id}/students")
async def get_group_students(
    group_id: int,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Membri della classe con tutti i loro risultati, learner model e link Telegram."""
    from .learner_profile import _latest_revision

    group = _require_visible_group(db, current_user, group_id)
    members = (
        db.query(models.GroupMembership)
        .filter(models.GroupMembership.group_id == group.id)
        .order_by(models.GroupMembership.username)
        .all()
    )
    students = []
    for member in members:
        results = (
            db.query(models.QuestionnaireResult)
            .filter(models.QuestionnaireResult.username == member.username)
            .order_by(models.QuestionnaireResult.submitted_at.desc())
            .all()
        )
        telegram_link = (
            db.query(models.TelegramAccountLink)
            .filter(
                models.TelegramAccountLink.username == member.username,
                models.TelegramAccountLink.revoked_at.is_(None),
            )
            .first()
        )
        profile = _latest_revision(db, member.username)
        students.append({
            "username": member.username,
            "joined_via": member.joined_via,
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
                for row in results
            ],
        })
    return {"group_id": group.id, "students": students}


@router.get("/admin/groups/{group_id}/students/{username}/conversation/{session_id}")
async def get_group_student_conversation(
    group_id: int,
    username: str,
    session_id: str,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Transcript di una sessione di uno studente della classe (informativa nell'invito)."""
    from .survey import _session_conversation_messages

    group = _require_visible_group(db, current_user, group_id)
    _require_group_member(db, group, username)
    result = (
        db.query(models.QuestionnaireResult)
        .filter(
            models.QuestionnaireResult.username == username,
            models.QuestionnaireResult.session_id == session_id,
        )
        .first()
    )
    if not result:
        raise HTTPException(status_code=404, detail="Sessione non trovata per questo studente")
    return _session_conversation_messages(db, session_id)


@router.get("/admin/groups/{group_id}/notes")
async def list_teacher_notes(
    group_id: int,
    username: Optional[str] = None,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    group = _require_visible_group(db, current_user, group_id)
    query = db.query(models.TeacherNote).filter(models.TeacherNote.group_id == group.id)
    if username:
        query = query.filter(models.TeacherNote.username == username)
    notes = query.order_by(models.TeacherNote.created_at.desc()).all()
    return [_serialize_note(note) for note in notes]


@router.post("/admin/groups/{group_id}/notes")
async def create_teacher_note(
    group_id: int,
    payload: schemas.TeacherNoteCreate,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    group = _require_visible_group(db, current_user, group_id)
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Testo nota obbligatorio")
    _require_group_member(db, group, payload.username)
    note = models.TeacherNote(
        group_id=group.id,
        username=payload.username,
        author_username=_username(current_user) or "",
        kind="note",
        text=text,
        visible_to_student=bool(payload.visible_to_student),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return _serialize_note(note)


@router.delete("/admin/teacher-notes/{note_id}")
async def delete_teacher_note(
    note_id: int,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    note = db.query(models.TeacherNote).filter(models.TeacherNote.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Nota non trovata")
    if note.group_id:
        _require_visible_group(db, current_user, note.group_id)
    if not _is_admin(current_user) and note.author_username != _username(current_user):
        raise HTTPException(status_code=403, detail="Solo l'autore o un admin puo' eliminare la nota")
    db.delete(note)
    db.commit()
    return {"ok": True, "deleted": note_id}


@router.post("/admin/groups/{group_id}/messages")
async def send_teacher_message(
    group_id: int,
    payload: schemas.TeacherNoteCreate,
    current_user=Depends(auth.get_current_plan_manager),
    db: Session = Depends(get_db),
):
    """Messaggio docente->studente: sempre visibile nel profilo web dello studente,
    recapitato anche via bot Telegram se lo studente e' collegato."""
    from .. import telegram_bot, telegram_state

    group = _require_visible_group(db, current_user, group_id)
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Testo messaggio obbligatorio")
    _require_group_member(db, group, payload.username)

    note = models.TeacherNote(
        group_id=group.id,
        username=payload.username,
        author_username=_username(current_user) or "",
        kind="message",
        text=text,
        visible_to_student=True,
    )
    db.add(note)

    delivered = None
    link = (
        db.query(models.TelegramAccountLink)
        .filter(
            models.TelegramAccountLink.username == payload.username,
            models.TelegramAccountLink.revoked_at.is_(None),
        )
        .first()
    )
    if link and telegram_bot.bot_enabled():
        state = (
            db.query(models.TelegramConversationState)
            .filter(models.TelegramConversationState.telegram_user_id == link.telegram_user_id)
            .first()
        )
        language = state.language if state else "it"
        header = telegram_state.BOT_TEXTS["teacher_message"].get(language) or telegram_state.BOT_TEXTS["teacher_message"]["en"]
        try:
            await telegram_bot.send_message(link.telegram_chat_id, f"{header}\n{text}")
            delivered = True
        except Exception:
            delivered = False
    note.telegram_delivered = delivered
    db.commit()
    db.refresh(note)
    return _serialize_note(note)


# --- Lato studente ------------------------------------------------------------

@router.get("/groups/info")
async def get_group_info(code: str, db: Session = Depends(get_db)):
    """Info pubbliche minime su una classe (per la pagina di invito)."""
    group = (
        db.query(models.StudentGroup)
        .filter(
            func.upper(models.StudentGroup.code) == code.strip().upper(),
            models.StudentGroup.is_active.is_(True),
        )
        .first()
    )
    if not group:
        raise HTTPException(status_code=404, detail="Classe non trovata")
    return {"code": group.code, "name": group.name}


@router.post("/groups/join")
async def join_group(
    payload: schemas.GroupJoinRequest,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Lo studente autenticato entra nella classe con il codice dell'invito del docente."""
    group = (
        db.query(models.StudentGroup)
        .filter(
            func.upper(models.StudentGroup.code) == payload.code.strip().upper(),
            models.StudentGroup.is_active.is_(True),
        )
        .first()
    )
    if not group:
        raise HTTPException(status_code=404, detail="Classe non trovata")
    ensure_membership(db, group.id, current_user["username"], "web")
    db.commit()
    return {"group_id": group.id, "code": group.code, "name": group.name}


@router.get("/user/groups")
async def get_my_groups(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Classi a cui lo studente autenticato e' iscritto."""
    memberships = (
        db.query(models.GroupMembership)
        .filter(models.GroupMembership.username == current_user["username"])
        .order_by(models.GroupMembership.created_at.desc())
        .all()
    )
    groups = []
    for membership in memberships:
        group = db.query(models.StudentGroup).filter(models.StudentGroup.id == membership.group_id).first()
        if not group:
            continue
        groups.append({
            "membership_id": membership.id,
            "group_id": group.id,
            "code": group.code,
            "name": group.name,
            "joined_via": membership.joined_via,
            "joined_at": membership.created_at.isoformat() if membership.created_at else None,
        })
    return groups


@router.delete("/user/groups/{membership_id}")
async def leave_group(
    membership_id: int,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    membership = (
        db.query(models.GroupMembership)
        .filter(
            models.GroupMembership.id == membership_id,
            models.GroupMembership.username == current_user["username"],
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=404, detail="Iscrizione non trovata")
    db.delete(membership)
    db.commit()
    return {"ok": True, "left": membership_id}


@router.get("/user/teacher-notes")
async def get_my_teacher_notes(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Note e messaggi del docente visibili allo studente autenticato (web-first)."""
    notes = (
        db.query(models.TeacherNote)
        .filter(
            models.TeacherNote.username == current_user["username"],
            models.TeacherNote.visible_to_student.is_(True),
        )
        .order_by(models.TeacherNote.created_at.desc())
        .all()
    )
    return [_serialize_note(note) for note in notes]
