"""Autenticazione tramite ai4auth.

Il percorso preferito usa gli header iniettati da un proxy fidato e firmati
con un segreto condiviso. Se il proxy non e' ancora configurato per il
segreto, il backend valida il cookie della richiesta direttamente presso
ai4auth prima di leggere l'identita'.
"""
import os
import secrets
import httpx
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, Request, status

# Gruppo ai4auth che abilita la dashboard admin
ADMIN_GROUP = os.environ.get("ADMIN_GROUP", "admins")
FORWARD_AUTH_SHARED_SECRET = os.environ.get("FORWARD_AUTH_SHARED_SECRET", "")
AI4AUTH_VERIFY_URL = os.environ.get(
    "AI4AUTH_VERIFY_URL", "https://auth.ai4educ.org/api/verify"
).strip()

# Mantenuto solo per il bootstrap dell'utente admin locale (seed) — non usato
# per il login, che passa interamente da ai4auth.
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def _parse_groups(raw: str):
    return [g.strip() for g in (raw or "").split(",") if g.strip()]


def _anonymous_identity() -> dict:
    return {
        "email": "",
        "username": "",
        "name": "",
        "groups": [],
        "is_admin": False,
        "authenticated": False,
    }


def _identity_from_headers(headers) -> dict:
    email = headers.get("Remote-Email", "") or ""
    username = headers.get("Remote-User", "") or ""
    name = headers.get("Remote-Name", "") or ""
    groups = _parse_groups(headers.get("Remote-Groups", ""))
    return {
        "email": email,
        "username": username or email,
        "name": name,
        "groups": groups,
        "is_admin": ADMIN_GROUP in groups,
        "authenticated": bool(username or email),
    }


async def get_identity(request: Request) -> dict:
    """Identita' certificata dal proxy o verificata direttamente con ai4auth."""
    supplied_secret = request.headers.get("X-Forwarded-Auth-Secret", "")
    trusted = bool(FORWARD_AUTH_SHARED_SECRET) and secrets.compare_digest(
        supplied_secret, FORWARD_AUTH_SHARED_SECRET
    )
    if trusted:
        return _identity_from_headers(request.headers)

    cookie = request.headers.get("Cookie", "")
    if not cookie or not AI4AUTH_VERIFY_URL:
        return _anonymous_identity()

    try:
        async with httpx.AsyncClient(timeout=4.0, follow_redirects=False) as client:
            response = await client.get(AI4AUTH_VERIFY_URL, headers={"Cookie": cookie})
        if response.status_code == 200:
            return _identity_from_headers(response.headers)
    except httpx.HTTPError:
        pass

    return _anonymous_identity()


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
