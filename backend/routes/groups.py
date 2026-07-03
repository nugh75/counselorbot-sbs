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
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas

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
    return query.filter(models.StudentGroup.owner_username == _username(identity))


def _require_visible_group(db: Session, identity, group_id: int) -> models.StudentGroup:
    group = _visible_group_query(db, identity).filter(models.StudentGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Classe non trovata")
    return group


def _members_count(db: Session, group_id: int) -> int:
    return db.query(models.GroupMembership).filter(models.GroupMembership.group_id == group_id).count()


def _serialize_group(db: Session, group: models.StudentGroup) -> dict:
    return {
        "id": group.id,
        "code": group.code,
        "name": group.name,
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
    group = models.StudentGroup(code=code, name=name, owner_username=_username(current_user) or "")
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
