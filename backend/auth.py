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

# Gruppi ai4auth che abilitano la dashboard admin (lista separata da virgole).
# `admins` (superadmin globale) e' sempre incluso; aggiungi gruppi per-servizio
# via env ADMIN_GROUPS, es. "admins,counselorbot-sbs-admin".
# Retrocompatibile con la vecchia env single-group ADMIN_GROUP.
_admin_groups_env = os.environ.get("ADMIN_GROUPS") or os.environ.get("ADMIN_GROUP", "admins")
ADMIN_GROUPS = {g.strip() for g in _admin_groups_env.split(",") if g.strip()}
ADMIN_GROUPS.add("admins")
RESEARCH_GROUP_MARKERS = ("ricerc", "research", "researcher")
FORWARD_AUTH_SHARED_SECRET = os.environ.get("FORWARD_AUTH_SHARED_SECRET", "")
AI4AUTH_VERIFY_URL = os.environ.get(
    "AI4AUTH_VERIFY_URL", "https://auth.ai4educ.org/api/verify"
).strip()
# Hostname pubblico del servizio: ai4auth autorizza per-hostname tramite la
# access matrix, quindi la verifica diretta del cookie deve presentarsi con
# l'host pubblico (non "ai4auth:9091", che non ha entry in matrice).
AI4AUTH_PUBLIC_HOST = os.environ.get("AI4AUTH_PUBLIC_HOST", "").strip()

# Mantenuto solo per il bootstrap dell'utente admin locale (seed) — non usato
# per il login, che passa interamente da ai4auth.
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def _parse_groups(raw: str):
    return [g.strip() for g in (raw or "").split(",") if g.strip()]


def _is_researcher(groups) -> bool:
    lowered = [str(g).lower() for g in groups or []]
    return any(marker in group for group in lowered for marker in RESEARCH_GROUP_MARKERS)


def _anonymous_identity() -> dict:
    return {
        "email": "",
        "username": "",
        "name": "",
        "groups": [],
        "is_admin": False,
        "is_researcher": False,
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
        "is_admin": bool(ADMIN_GROUPS & set(groups)),
        "is_researcher": _is_researcher(groups),
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

    public_host = (
        AI4AUTH_PUBLIC_HOST
        or request.headers.get("X-Forwarded-Host", "").split(",")[0].strip()
        or request.headers.get("Host", "")
    )
    verify_headers = {"Cookie": cookie}
    if public_host:
        verify_headers["Host"] = public_host
        verify_headers["X-Original-URL"] = f"https://{public_host}{request.url.path}"

    try:
        async with httpx.AsyncClient(timeout=4.0, follow_redirects=False) as client:
            response = await client.get(AI4AUTH_VERIFY_URL, headers=verify_headers)
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
    if not identity["is_admin"] and not identity.get("is_researcher"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accesso riservato ad amministratori e ricercatori",
        )
    return identity
