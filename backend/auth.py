"""
Autenticazione tramite ai4auth (forward-auth).

L'autenticazione vera e propria avviene al bordo: nginx esegue
`auth_request` verso ai4auth e, se la sessione è valida, inietta nella
richiesta gli header `Remote-User`, `Remote-Email`, `Remote-Groups`.
Qui ci limitiamo a leggere quegli header e a derivare il ruolo admin
dall'appartenenza a un gruppo (default: `admins`).
"""
import os
import secrets
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, status

# Gruppo ai4auth che abilita la dashboard admin
ADMIN_GROUP = os.environ.get("ADMIN_GROUP", "admins")
FORWARD_AUTH_SHARED_SECRET = os.environ.get("FORWARD_AUTH_SHARED_SECRET", "")

# Mantenuto solo per il bootstrap dell'utente admin locale (seed) — non usato
# per il login, che passa interamente da ai4auth.
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def _parse_groups(raw: str):
    return [g.strip() for g in (raw or "").split(",") if g.strip()]


def get_identity(request: Request) -> dict:
    """Identità derivata dagli header forward-auth iniettati da nginx."""
    supplied_secret = request.headers.get("X-Forwarded-Auth-Secret", "")
    trusted = bool(FORWARD_AUTH_SHARED_SECRET) and secrets.compare_digest(
        supplied_secret, FORWARD_AUTH_SHARED_SECRET
    )
    if not trusted:
        return {
            "email": "",
            "username": "",
            "name": "",
            "groups": [],
            "is_admin": False,
            "authenticated": False,
        }
    email = request.headers.get("Remote-Email", "") or ""
    username = request.headers.get("Remote-User", "") or ""
    name = request.headers.get("Remote-Name", "") or ""
    groups = _parse_groups(request.headers.get("Remote-Groups", ""))
    return {
        "email": email,
        "username": username or email,
        "name": name,
        "groups": groups,
        "is_admin": ADMIN_GROUP in groups,
        "authenticated": bool(username or email),
    }


async def get_current_user(identity: dict = Depends(get_identity)) -> dict:
    if not identity["authenticated"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Non autenticato",
        )
    return identity


async def get_current_active_admin(identity: dict = Depends(get_current_user)) -> dict:
    if not identity["is_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accesso riservato agli amministratori",
        )
    return identity
