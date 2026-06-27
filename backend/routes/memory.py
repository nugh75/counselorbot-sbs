"""Endpoint di debug/reset della memoria conversazionale."""
import logging

from fastapi import APIRouter, Depends, HTTPException

from .. import auth
from ..api_models import MemoryEventRequest
from ..memory_service import session_memory

router = APIRouter()
logger = logging.getLogger(__name__)

MEMORY_QUESTIONNAIRE_TYPES = {"QSA", "QSAr", "ZTPI", "SAVICKAS", "QPCS", "QPCC", "QAP"}


@router.get("/memory/status/{session_id}")
async def memory_status(session_id: str, current_user: dict = Depends(auth.get_current_active_admin)):
    """Restituisce la memoria solo agli amministratori autorizzati."""
    memory = session_memory.get_summary(session_id)
    return {
        "session_id": session_id,
        "memory_chars": len(memory),
        "memory_blocks": len(memory.split("\n\n")) if memory else 0,
        "preview": memory[:200] if memory else "",
    }


@router.delete("/memory/{session_id}")
async def memory_reset(session_id: str, current_user: dict = Depends(auth.get_current_active_admin)):
    """Resetta manualmente la memoria conversazionale, solo da amministrazione."""
    session_memory.clear(session_id)
    logger.info(f"Session {session_id}: memoria resettata via API")
    return {"status": "cleared", "session_id": session_id}


@router.post("/memory/event")
async def memory_event(request: MemoryEventRequest):
    """Registra transizioni UI senza rendere leggibile la memoria allo studente."""
    if request.questionnaire_type not in MEMORY_QUESTIONNAIRE_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported questionnaire_type")
    if not request.phase.strip():
        raise HTTPException(status_code=400, detail="phase is required")

    session_memory.record_interaction(
        request.session_id,
        questionnaire_type=request.questionnaire_type,
        language=request.language or "",
        phase=request.phase,
        step_label=request.step_label or request.phase,
        user_message=request.user_message,
        completed_step=request.completed_step,
    )
    return {"status": "recorded"}


@router.get("/memory/user/{session_id}")
async def get_user_session_memory(session_id: str):
    """Restituisce lo stato essenziale necessario a ripristinare la sessione guidata."""
    return {"session_id": session_id, **session_memory.get_progress(session_id)}
