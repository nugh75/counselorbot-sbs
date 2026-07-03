"""Endpoint Telegram: webhook pubblico del bot + gestione link account.

Il webhook e' l'unica route pubblica (protetta dal secret token Telegram);
`/telegram/link-code`, `/telegram/link-status` e `/telegram/unlink` richiedono
l'utente autenticato via ai4auth; le route admin richiedono il gruppo admin.
"""
import asyncio
import logging
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import auth, database, models, telegram_bot, telegram_state

router = APIRouter()
get_db = database.get_db
logger = logging.getLogger(__name__)


@router.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    if not telegram_bot.bot_enabled():
        raise HTTPException(status_code=403, detail="Telegram bot disabled")
    secret = telegram_bot.webhook_secret()
    supplied = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not secret or not secrets.compare_digest(supplied, secret):
        raise HTTPException(status_code=403, detail="Invalid secret token")
    try:
        update = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload")
    if isinstance(update, dict):
        # Risposta immediata a Telegram; il lavoro AI prosegue fuori dal request.
        asyncio.get_running_loop().create_task(telegram_state.process_update(update))
    return {"ok": True}


@router.get("/telegram/bot-info")
async def telegram_bot_info():
    """Username del bot per costruire i deep link t.me (vuoto se bot spento)."""
    enabled = telegram_bot.bot_enabled()
    username = await telegram_bot.get_bot_username() if enabled else ""
    return {"enabled": enabled, "bot_username": username}


@router.post("/telegram/link-code")
async def create_telegram_link_code(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Genera il codice temporaneo da inviare al bot con /link CODICE."""
    code = telegram_state.create_link_code(db, current_user["username"])
    return {"code": code, "expires_in_minutes": telegram_state.LINK_CODE_TTL_MINUTES}


@router.get("/telegram/link-status")
async def telegram_link_status(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    link = (
        db.query(models.TelegramAccountLink)
        .filter(
            models.TelegramAccountLink.username == current_user["username"],
            models.TelegramAccountLink.revoked_at.is_(None),
        )
        .first()
    )
    return {
        "linked": bool(link),
        "telegram_username": link.telegram_username if link else None,
        "linked_at": link.linked_at.isoformat() if link and link.linked_at else None,
    }


@router.post("/telegram/unlink")
async def telegram_unlink(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Revoca dal web il collegamento Telegram dell'utente autenticato."""
    links = (
        db.query(models.TelegramAccountLink)
        .filter(
            models.TelegramAccountLink.username == current_user["username"],
            models.TelegramAccountLink.revoked_at.is_(None),
        )
        .all()
    )
    for link in links:
        link.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return {"revoked": len(links)}


@router.get("/admin/telegram/links")
async def admin_telegram_links(
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Elenco collegamenti (attivi e revocati) + metriche minime."""
    links = db.query(models.TelegramAccountLink).order_by(models.TelegramAccountLink.linked_at.desc()).all()
    active_flows = (
        db.query(models.TelegramConversationState)
        .filter(models.TelegramConversationState.state != "idle")
        .count()
    )
    return {
        "active_flows": active_flows,
        "links": [
            {
                "id": link.id,
                "username": link.username,
                "telegram_username": link.telegram_username,
                "linked_at": link.linked_at.isoformat() if link.linked_at else None,
                "revoked_at": link.revoked_at.isoformat() if link.revoked_at else None,
            }
            for link in links
        ],
    }


@router.post("/admin/telegram/links/{link_id}/revoke")
async def admin_revoke_telegram_link(
    link_id: int,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    link = db.query(models.TelegramAccountLink).filter(models.TelegramAccountLink.id == link_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    link.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "revoked"}
