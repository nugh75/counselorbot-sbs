"""Sincronizzazione degli amministratori CounselorBot come contatti ricercatori.

Gli admin del servizio sono definiti nella access matrix di ai4auth (gruppo
globale `admins` + permesso per-servizio `counselorbot-sbs-admin`). ai4auth
espone `GET /api/admin/service-users?host=...` (protetto da X-Admin-Token) che
restituisce gli utenti autorizzati per un hostname con i gruppi EFFETTIVI
(inclusi quelli derivati dalla matrice). Qui li mappiamo su righe
`research_contacts` con `source='admin-sync'`.

Idempotente, best-effort: se ai4auth non e' raggiungibile la sync fallisce in
silenzio. Non tocca mai i contatti `source='manual'`.
"""
from __future__ import annotations

import logging
import os
import secrets
import string
import threading

import httpx
from sqlalchemy.orm import Session

from . import models, database
from .auth import ADMIN_GROUPS

logger = logging.getLogger(__name__)

SOURCE = "admin-sync"
_CODE_ALPHABET = string.ascii_uppercase + string.digits


def _disabled() -> bool:
    return os.environ.get("ADMIN_SYNC_DISABLED", "").lower() in ("1", "true", "yes")


def _base_url() -> str:
    verify = os.environ.get("AI4AUTH_VERIFY_URL", "http://ai4auth:9091/api/verify")
    return verify.split("/api/")[0].rstrip("/")


def _service_host() -> str:
    return os.environ.get("AI4AUTH_PUBLIC_HOST", "counselorbot-sbs.ai4educ.org")


def _generate_code(db: Session) -> str:
    while True:
        code = "RC-" + "".join(secrets.choice(_CODE_ALPHABET) for _ in range(6))
        if not db.query(models.ResearchContact).filter(models.ResearchContact.code == code).first():
            return code


def _is_admin(groups) -> bool:
    return bool(ADMIN_GROUPS & {str(g) for g in (groups or [])})


def fetch_service_admins() -> list[dict]:
    """Chiama ai4auth e ritorna solo gli utenti con gruppi effettivi da admin."""
    token = os.environ.get("AI4AUTH_ADMIN_TOKEN", "")
    if not token:
        logger.warning("Admin sync skipped: AI4AUTH_ADMIN_TOKEN non configurato")
        return []
    url = f"{_base_url()}/api/admin/service-users"
    resp = httpx.get(
        url,
        params={"host": _service_host()},
        headers={"X-Admin-Token": token},
        timeout=httpx.Timeout(20.0, connect=4.0),
    )
    resp.raise_for_status()
    users = resp.json().get("users", [])
    return [u for u in users if _is_admin(u.get("groups"))]


def sync_admins_sync(db: Session) -> None:
    """Upsert dei contatti admin + deattivazione di quelli che non sono piu' admin. Best-effort."""
    try:
        admins = fetch_service_admins()
    except Exception as e:  # noqa: BLE001
        logger.warning("Admin sync fetch failed: %s", e)
        return

    seen: set[str] = set()
    for u in admins:
        username = (u.get("username") or "").strip()
        if not username:
            continue
        seen.add(username)
        name = (u.get("displayname") or username).strip()
        email = (u.get("email") or None)
        existing = (
            db.query(models.ResearchContact)
            .filter(models.ResearchContact.source == SOURCE, models.ResearchContact.ext_username == username)
            .first()
        )
        if existing:
            # aggiorna solo i campi anagrafici di base e riattiva; lascia intatti
            # gli arricchimenti manuali (phone/institution/notes/role).
            existing.name = name
            existing.email = email
            existing.is_active = True
        else:
            db.add(models.ResearchContact(
                code=_generate_code(db),
                name=name,
                email=email,
                role="Amministratore CounselorBot",
                notes="Sincronizzato automaticamente da ai4educ Console (admin del servizio).",
                is_active=True,
                source=SOURCE,
                ext_username=username,
            ))

    # Deattiva (non eliminare) i contatti sincronizzati che non sono piu' admin.
    stale = (
        db.query(models.ResearchContact)
        .filter(models.ResearchContact.source == SOURCE, models.ResearchContact.is_active == True)  # noqa: E712
        .all()
    )
    for c in stale:
        if c.ext_username not in seen:
            c.is_active = False

    db.commit()
    logger.info("Admin sync done: %d admin(s) attivi", len(seen))


def sync_admins_async() -> None:
    """Esegue la sync in un thread con sessione DB propria (non blocca lo startup)."""
    if _disabled():
        return

    def _run() -> None:
        try:
            db = database.SessionLocal()
            try:
                sync_admins_sync(db)
            finally:
                db.close()
        except Exception as e:  # noqa: BLE001
            logger.warning("Admin sync thread failed: %s", e)

    threading.Thread(target=_run, daemon=True).start()
