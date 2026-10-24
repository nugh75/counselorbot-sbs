"""Abbinamento degli studenti all'app docente (ADR-0002 §4, F1-13).

Attivo solo con ``AUTH_PROVIDER=local``. Il docente genera un codice di classe
(chiave di 32 byte nel frammento del link ``/unisciti#k=``, nel database solo lo
SHA-256); lo studente lo usa con uno pseudonimo e riceve una sessione
``student`` e un codice personale di 12 caratteri base32, mostrato una volta,
per rientrare da un altro dispositivo. Nessuna risposta distingue classe
inesistente, codice scaduto o revocato, ne' rivela gli pseudonimi presenti.

Limiti (§4.3) in memoria, come i link del docente: un solo worker, si azzerano
al riavvio.
"""
import hashlib
import json
import os
import re
import secrets
import threading
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import auth, database, local_auth, models
from .db_compat import xact_lock
from .request_origin import request_origin

CODE_TTL = timedelta(days=7)
BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
PERSONAL_CODE_LENGTH = 12  # 60 bit
USERNAME_LENGTH = 10
PSEUDONYM_MAX = 40
DEVICE_LABEL_MAX = 80
KEY_MAX = 128
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _random_base32(length: int) -> str:
    return "".join(secrets.choice(BASE32) for _ in range(length))


def normalize_personal_code(value: str) -> str:
    """Maiuscole, senza spazi e trattini: il codice si puo' copiare a gruppi."""
    return re.sub(r"[\s-]", "", value).upper()


class RateLimiter:
    """Finestre di 60 s per IP e per classe, blocco dell'IP dopo errori consecutivi (§4.3)."""

    WINDOW = 60.0
    IP_LIMIT = 10
    CLASS_LIMIT = 60
    LOCK_AFTER = 10
    LOCK_SECONDS = 15 * 60
    _MAX_KEYS = 4096

    def __init__(self):
        self._lock = threading.Lock()
        self.reset()

    def reset(self):
        with self._lock:
            self._attempts = {}
            self._failures = {}
            self._locked_until = {}

    def _take(self, key, limit: int, now: float) -> Optional[int]:
        if len(self._attempts) > self._MAX_KEYS:
            for stale in [k for k, q in self._attempts.items() if not q or q[-1] <= now - self.WINDOW]:
                del self._attempts[stale]
        window = self._attempts.setdefault(key, deque())
        while window and window[0] <= now - self.WINDOW:
            window.popleft()
        if len(window) >= limit:
            return max(1, int(window[0] + self.WINDOW - now) + 1)
        window.append(now)
        return None

    def check_ip(self, ip: str) -> Optional[int]:
        """Secondi di attesa, o None se il tentativo e' ammesso (e contato)."""
        now = time.monotonic()
        with self._lock:
            locked = self._locked_until.get(ip)
            if locked is not None:
                if locked > now:
                    return max(1, int(locked - now) + 1)
                del self._locked_until[ip]
            return self._take(("ip", ip), self.IP_LIMIT, now)

    def check_class(self, group_id: int) -> Optional[int]:
        with self._lock:
            return self._take(("class", group_id), self.CLASS_LIMIT, time.monotonic())

    def failure(self, ip: str) -> None:
        with self._lock:
            count = self._failures.get(ip, 0) + 1
            if count >= self.LOCK_AFTER:
                self._locked_until[ip] = time.monotonic() + self.LOCK_SECONDS
                count = 0
            self._failures[ip] = count

    def success(self, ip: str) -> None:
        with self._lock:
            self._failures.pop(ip, None)


limiter = RateLimiter()


def _rate_limited(retry_after: int) -> HTTPException:
    return HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="rate_limited",
                         headers={"Retry-After": str(retry_after)})


def _client_ip(request: Request) -> str:
    # Solo l'IP firmato dal frontend (§2.7); senza firma tutti condividono un contatore.
    return request_origin(request.headers).client_ip or "unknown"


async def _json_object(request: Request) -> dict:
    try:
        body = json.loads(await request.body())
    except (ValueError, UnicodeDecodeError):
        body = None
    if not isinstance(body, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_payload")
    return body


def _clean_text(value, max_length: int, required: bool) -> Optional[str]:
    if value is None and not required:
        return None
    if not isinstance(value, str) or _CONTROL.search(value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_payload")
    cleaned = " ".join(value.split())
    if len(cleaned) > max_length or (required and not cleaned):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_payload")
    return cleaned or None


def _assign_pseudonym(db: Session, group_id: int, wanted: str) -> str:
    """Mai «nome gia' usato»: un suffisso numerico rende lo pseudonimo unico nella classe."""
    taken = {name.lower() for (name,) in db.query(models.LocalStudent.pseudonym)
             .filter(models.LocalStudent.group_id == group_id)}
    candidate, n = wanted, 1
    while candidate.lower() in taken:
        n += 1
        candidate = f"{wanted} {n}"
    return candidate


def _new_username(db: Session) -> str:
    while True:
        username = "s-" + _random_base32(USERNAME_LENGTH).lower()
        exists = db.query(models.LocalStudent.id).filter(models.LocalStudent.username == username).first()
        if exists is None:
            return username


def _new_personal_code(db: Session) -> str:
    while True:
        code = _random_base32(PERSONAL_CODE_LENGTH)
        exists = db.query(models.LocalStudent.id).filter(
            models.LocalStudent.personal_code_hash == _hash(code)).first()
        if exists is None:
            return code


def _valid_code(code: Optional[models.ClassPairingCode], now: datetime) -> bool:
    return (code is not None and code.revoked_at is None and code.expires_at > now
            and (code.max_uses is None or code.uses < code.max_uses))


def _session_response(body: dict, status_code: int, db: Session, username: str,
                      device_label: Optional[str], is_local: bool) -> JSONResponse:
    token = local_auth.create_session(db, username, "student", device_label)
    response = JSONResponse(body, status_code=status_code)
    local_auth.set_session_cookie(response, token, "student", is_local)
    return response


async def _require_teacher(request: Request, identity: dict = Depends(auth.get_identity)) -> dict:
    # Sessione docente solo da origine local (§3.3); dal tunnel e' gia' anonima.
    if not request_origin(request.headers).is_local or not identity.get("is_admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
    return identity


router = APIRouter(prefix="/local-auth", tags=["local-auth"], dependencies=[Depends(local_auth._require_local_provider)])


@router.post("/pair", status_code=status.HTTP_201_CREATED)
async def pair(request: Request, db: Session = Depends(database.get_db)):
    ip = _client_ip(request)
    retry = limiter.check_ip(ip)
    if retry is not None:
        raise _rate_limited(retry)
    body = await _json_object(request)
    key = _clean_text(body.get("key"), KEY_MAX, required=True)
    pseudonym = _clean_text(body.get("pseudonym"), PSEUDONYM_MAX, required=True)
    device_label = _clean_text(body.get("device_label"), DEVICE_LABEL_MAX, required=False)

    now = _now()
    code = db.query(models.ClassPairingCode).filter(models.ClassPairingCode.key_hash == _hash(key)).first()
    group = db.get(models.StudentGroup, code.group_id) if code is not None else None
    if not _valid_code(code, now) or group is None or not group.is_active:
        limiter.failure(ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_or_expired_code")
    retry = limiter.check_class(code.group_id)
    if retry is not None:
        raise _rate_limited(retry)

    # Pseudonimi e usi sotto lock di classe: due abbinamenti contemporanei non
    # prendono lo stesso nome ne' superano max_uses.
    xact_lock(db, "local-pairing", code.group_id)
    db.refresh(code)
    if not _valid_code(code, now):
        db.rollback()
        limiter.failure(ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_or_expired_code")
    code.uses += 1
    personal_code = _new_personal_code(db)
    pending = bool(code.requires_approval)
    student = models.LocalStudent(
        username=_new_username(db),
        pseudonym=_assign_pseudonym(db, code.group_id, pseudonym),
        group_id=code.group_id,
        personal_code_hash=_hash(personal_code),
        status="pending" if pending else "active",
        created_at=now,
        approved_at=None if pending else now,
    )
    db.add(student)
    db.add(models.GroupMembership(group_id=code.group_id, username=student.username, joined_via="pairing"))
    db.flush()
    limiter.success(ip)
    body = {
        "username": student.username,
        "pseudonym": student.pseudonym,
        "group_id": student.group_id,
        "status": student.status,
        "personal_code": personal_code,
    }
    # create_session fa il commit di studente, iscrizione, uso e sessione insieme.
    return _session_response(body, status.HTTP_201_CREATED, db, student.username, device_label,
                             request_origin(request.headers).is_local)


@router.post("/recover")
async def recover(request: Request, db: Session = Depends(database.get_db)):
    ip = _client_ip(request)
    retry = limiter.check_ip(ip)
    if retry is not None:
        raise _rate_limited(retry)
    body = await _json_object(request)
    personal_code = _clean_text(body.get("personal_code"), 64, required=True)
    device_label = _clean_text(body.get("device_label"), DEVICE_LABEL_MAX, required=False)

    student = db.query(models.LocalStudent).filter(
        models.LocalStudent.personal_code_hash == _hash(normalize_personal_code(personal_code))).first()
    if student is None:
        limiter.failure(ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_code")
    retry = limiter.check_class(student.group_id)
    if retry is not None:
        raise _rate_limited(retry)
    limiter.success(ip)
    return _session_response({"username": student.username, "pseudonym": student.pseudonym},
                             status.HTTP_200_OK, db, student.username, device_label,
                             request_origin(request.headers).is_local)


@router.get("/devices")
def devices(_teacher: dict = Depends(_require_teacher), db: Session = Depends(database.get_db)):
    """Sessioni studente attive e in attesa, raggruppate per classe."""
    now_naive = local_auth._now()
    rows = (
        db.query(models.LocalSession, models.LocalStudent, models.StudentGroup)
        .join(models.LocalStudent, models.LocalStudent.username == models.LocalSession.username)
        .join(models.StudentGroup, models.StudentGroup.id == models.LocalStudent.group_id)
        .filter(models.LocalSession.kind == "student", models.LocalSession.revoked_at.is_(None),
                models.LocalSession.expires_at > now_naive)
        .order_by(models.StudentGroup.name, func.lower(models.LocalStudent.pseudonym), models.LocalSession.id)
        .all()
    )
    classes = {}
    for session, student, group in rows:
        entry = classes.setdefault(group.id, {"group_id": group.id, "group_name": group.name, "devices": []})
        entry["devices"].append({
            "id": session.id,
            "username": student.username,
            "pseudonym": student.pseudonym,
            "device_label": session.device_label,
            "status": student.status,
            "created_at": session.created_at.replace(tzinfo=timezone.utc).isoformat(),
            "last_seen_at": session.last_seen_at.replace(tzinfo=timezone.utc).isoformat(),
        })
    return {"classes": list(classes.values())}


def _student_session(db: Session, session_id: int):
    row = (
        db.query(models.LocalSession, models.LocalStudent)
        .join(models.LocalStudent, models.LocalStudent.username == models.LocalSession.username)
        .filter(models.LocalSession.id == session_id, models.LocalSession.kind == "student",
                models.LocalSession.revoked_at.is_(None))
        .first()
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    return row


@router.post("/devices/{session_id}/approve", status_code=status.HTTP_204_NO_CONTENT)
def approve_device(session_id: int, _teacher: dict = Depends(_require_teacher),
                   db: Session = Depends(database.get_db)):
    """Approva lo studente del dispositivo: da quel momento tutte le sue sessioni valgono."""
    _session, student = _student_session(db, session_id)
    if student.status != "active":
        student.status = "active"
        student.approved_at = _now()
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/devices/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_device(session_id: int, _teacher: dict = Depends(_require_teacher),
                  db: Session = Depends(database.get_db)):
    session, _student = _student_session(db, session_id)
    session.revoked_at = local_auth._now()
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/students/{username}/personal-code")
def regenerate_personal_code(username: str, _teacher: dict = Depends(_require_teacher),
                             db: Session = Depends(database.get_db)):
    """Il vecchio codice smette di valere; le sessioni aperte restano."""
    student = db.query(models.LocalStudent).filter(models.LocalStudent.username == username).first()
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    personal_code = _new_personal_code(db)
    student.personal_code_hash = _hash(personal_code)
    db.commit()
    return {"personal_code": personal_code}


class PairingCodeRequest(BaseModel):
    requires_approval: bool = False
    max_uses: Optional[int] = Field(default=None, ge=1)


@router.post("/classes/{group_id}/pairing-code")
def new_pairing_code(group_id: int, payload: Optional[PairingCodeRequest] = None,
                     _teacher: dict = Depends(_require_teacher), db: Session = Depends(database.get_db)):
    """Nuovo codice di classe: revoca i precedenti, chi e' gia' abbinato resta dentro."""
    payload = payload or PairingCodeRequest()
    if db.get(models.StudentGroup, group_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    now = _now()
    db.query(models.ClassPairingCode).filter(
        models.ClassPairingCode.group_id == group_id, models.ClassPairingCode.revoked_at.is_(None)
    ).update({models.ClassPairingCode.revoked_at: now}, synchronize_session=False)
    key = secrets.token_urlsafe(32)
    code = models.ClassPairingCode(
        group_id=group_id,
        key_hash=_hash(key),
        created_at=now,
        expires_at=now + CODE_TTL,
        uses=0,
        max_uses=payload.max_uses,
        requires_approval=payload.requires_approval,
    )
    db.add(code)
    db.commit()
    # La chiave sta nel frammento: non arriva nei log di Cloudflare, Next o backend.
    public_origin = os.environ.get("COUNSELORBOT_PUBLIC_ORIGIN", "").rstrip("/")
    return {"link": f"{public_origin}/unisciti#k={key}", "expires_at": code.expires_at.isoformat()}
