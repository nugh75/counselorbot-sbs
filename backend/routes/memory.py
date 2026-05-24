"""Endpoint di debug/reset della memoria conversazionale."""
import logging

from fastapi import APIRouter

from ..memory_service import session_memory

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/memory/status/{session_id}")
async def memory_status(session_id: str):
    """Restituisce la dimensione della memoria Markdown per la sessione."""
    memory = session_memory.get_summary(session_id)
    return {
        "session_id": session_id,
        "memory_chars": len(memory),
        "memory_blocks": len(memory.split("\n\n")) if memory else 0,
        "preview": memory[:200] if memory else "",
    }


@router.delete("/memory/{session_id}")
async def memory_reset(session_id: str):
    """Resetta manualmente la memoria conversazionale per la sessione."""
    session_memory.clear(session_id)
    logger.info(f"Session {session_id}: memoria resettata via API")
    return {"status": "cleared", "session_id": session_id}
