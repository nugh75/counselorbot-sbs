"""Fornitore di identita' locale e sessioni `cb_session` (ADR-0002 §3, F1-06).

Attivo solo con ``AUTH_PROVIDER=local`` (app docente, profilo teacher-pc).
Il cookie porta un token opaco di 32 byte; il database ne conserva solo lo
SHA-256. Ogni richiesta rilegge la sessione (nessuna cache): una revoca vale
subito. Il guscio ottiene un link monouso da ``/internal/local-auth/teacher-link``
e la pagina lo riscatta con ``POST /local-auth/redeem``.

Una sessione ``teacher`` vale solo con origine ``local`` firmata dal frontend
(ADR-0002 §2.7, fail-closed): dal tunnel e' anonima.
"""
import hashlib
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from . import database, models
from .request_origin import request_origin

COOKIE_NAME = "cb_session"
TEACHER_LINK_TTL_SECONDS = 60
SESSION_TTL = {"teacher": timedelta(days=30), "student": timedelta(days=180)}
LAST_SEEN_INTERVAL = timedelta(hours=1)
TEACHER_USERNAME = "docente"
TEACHER_GROUPS = ["docenti", "admins"]

# Link monouso del docente: hash -> scadenza (time.monotonic). In memoria, come
# i contatori di ADR-0002 §4.3: un solo worker, si azzerano al riavvio.
_teacher_links = {}
_teacher_links_lock = threading.Lock()


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _now() -> datetime:
    # UTC naive: colonne DateTime semplici, uguali su Postgres e SQLite.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _open_session():
    return database.SessionLocal()


def issue_teacher_link() -> str:
    token = secrets.token_urlsafe(32)
    now = time.monotonic()
    with _teacher_links_lock:
        for key in [key for key, expires in _teacher_links.items() if expires <= now]:
            del _teacher_links[key]
        _teacher_links[_hash(token)] = now + TEACHER_LINK_TTL_SECONDS
    return token


def consume_teacher_link(token: str) -> bool:
    with _teacher_links_lock:
        expires = _teacher_links.pop(_hash(token), None)
    return expires is not None and expires > time.monotonic()


def create_session(db: Session, username: str, kind: str, device_label: Optional[str] = None) -> str:
    token = secrets.token_urlsafe(32)
    now = _now()
    db.add(models.LocalSession(
        token_hash=_hash(token),
        username=username,
        kind=kind,
        device_label=device_label,
        created_at=now,
        last_seen_at=now,
        expires_at=now + SESSION_TTL[kind],
    ))
    db.commit()
    return token


def set_session_cookie(response: Response, token: str, kind: str, is_local: bool) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=int(SESSION_TTL[kind].total_seconds()),
        path="/",
        httponly=True,
        samesite="lax",
        # Origine local = http://127.0.0.1; il tunnel e' sempre https.
        secure=not is_local,
    )


def _identity(row: models.LocalSession, student: Optional[models.LocalStudent] = None) -> dict:
    if row.kind == "teacher":
        return {
            "email": "",
            "username": TEACHER_USERNAME,
            "name": "Docente",
            "groups": list(TEACHER_GROUPS),
            "is_admin": True,
            "is_researcher": False,
            "authenticated": True,
        }
    return {
        "email": "",
        "username": row.username,
        "name": student.pseudonym,
        "groups": ["studenti"],
        "is_admin": False,
        "is_researcher": False,
        "authenticated": True,
    }


def identity_from_request(request: Request) -> Optional[dict]:
    """Identita' della sessione `cb_session` valida, o None (anonimo)."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    is_local = request_origin(request.headers).is_local
    now = _now()
    with _open_session() as db:
        row = db.query(models.LocalSession).filter(models.LocalSession.token_hash == _hash(token)).first()
        if row is None or row.revoked_at is not None or row.expires_at <= now:
            return None
        if row.kind == "teacher" and not is_local:
            return None
        student = None
        if row.kind == "student":
            # In attesa di approvazione (ADR-0002 §4.2) l'identita' esiste ma resta anonima.
            student = db.query(models.LocalStudent).filter(models.LocalStudent.username == row.username).first()
            if student is None or student.status != "active":
                return None
        if now - row.last_seen_at >= LAST_SEEN_INTERVAL:
            row.last_seen_at = now
            row.expires_at = now + SESSION_TTL[row.kind]
            db.commit()
        return _identity(row, student)


def _require_local_provider():
    from .auth import local_provider_enabled

    if not local_provider_enabled():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")


router = APIRouter(prefix="/local-auth", tags=["local-auth"], dependencies=[Depends(_require_local_provider)])
internal_router = APIRouter(prefix="/internal/local-auth", tags=["internal"],
                            dependencies=[Depends(_require_local_provider)])


@internal_router.post("/teacher-link")
def teacher_link():
    """Il guscio apre `/accesso-locale#t=<token>`: il token vale 60 s, una volta."""
    return {"token": issue_teacher_link(), "expires_in": TEACHER_LINK_TTL_SECONDS}


class RedeemRequest(BaseModel):
    token: str


@router.post("/redeem", status_code=status.HTTP_204_NO_CONTENT)
def redeem(payload: RedeemRequest, request: Request, db: Session = Depends(database.get_db)):
    origin = request_origin(request.headers)
    # Una sessione docente dal tunnel sarebbe comunque anonima: il link non si consuma.
    if not origin.is_local or not consume_teacher_link(payload.token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_or_expired_token")
    token = create_session(db, TEACHER_USERNAME, "teacher")
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    set_session_cookie(response, token, "teacher", origin.is_local)
    return response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, db: Session = Depends(database.get_db)):
    """Revoca la sessione corrente (ADR-0002 §4.2); senza sessione valida non fa nulla."""
    token = request.cookies.get(COOKIE_NAME)
    if token:
        row = db.query(models.LocalSession).filter(models.LocalSession.token_hash == _hash(token)).first()
        if row is not None and row.revoked_at is None:
            row.revoked_at = _now()
            db.commit()
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(COOKIE_NAME, path="/")
    return response
