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


# Profili di prova impersonabili (allowlist). Solo un admin reale puo' agire
# come uno di questi e nessun altro username e' impersonabile, quindi non si
# possono leggere/scrivere dati di utenti reali. I dati creati durante le prove
# restano in DB sotto questi username. Speculare a VIEW_AS_ACCOUNTS nel frontend.
VIEW_AS_DEMO_ACCOUNTS = {
    "studente.demo": {"is_researcher": False, "groups": ["studenti"]},
    "studente.demo2": {"is_researcher": False, "groups": ["studenti"]},
    "studente.demo3": {"is_researcher": False, "groups": ["studenti"]},
    "ricercatore.demo": {"is_researcher": True, "groups": ["researchers"]},
    "docente.demo": {"is_researcher": False, "groups": ["docenti"]},
}


def _impersonated_demo_identity(username: str) -> dict:
    cfg = VIEW_AS_DEMO_ACCOUNTS[username]
    return {
        "email": f"{username}@anteprima.local",
        "username": username,
        "name": username,
        "groups": list(cfg["groups"]),
        "is_admin": False,
        "is_researcher": cfg["is_researcher"],
        "authenticated": True,
    }


def _apply_view_as(identity: dict, request: Request) -> dict:
    """Se l'utente reale e' admin e indica un profilo di prova valido (header
    X-View-As o query param view_as), restituisce l'identita' impersonata.
    Altrimenti l'identita' invariata. Da usare ovunque serva che le prove (dati
    e interazioni) vengano attribuite al profilo di prova, non all'admin."""
    if identity.get("is_admin"):
        view_as = request.headers.get("X-View-As") or request.query_params.get("view_as")
        if view_as and view_as in VIEW_AS_DEMO_ACCOUNTS:
            return _impersonated_demo_identity(view_as)
    return identity


async def get_identity_view_as(request: Request) -> dict:
    """Come get_identity ma applica l'anteprima profilo di prova. Usata dagli
    endpoint a identita' opzionale (chat) cosi' le interazioni di prova si
    salvano sotto il profilo di prova. /auth/me resta su get_identity (reale)."""
    return _apply_view_as(await get_identity(request), request)


async def get_current_user(request: Request, identity: dict = Depends(get_identity)) -> dict:
    if not identity["authenticated"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Non autenticato",
        )
    return _apply_view_as(identity, request)


async def get_current_active_admin(identity: dict = Depends(get_current_user)) -> dict:
    if not identity["is_admin"] and not identity.get("is_researcher"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accesso riservato ad amministratori e ricercatori",
        )
    return identity
