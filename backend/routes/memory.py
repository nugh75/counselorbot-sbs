"""Endpoint di debug/reset della memoria conversazionale."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import auth, class_access, database, models
from ..api_models import MemoryEventRequest
from ..dynamic_registry import DynamicInstrumentSet, HISTORIC_INSTRUMENT_CODES
from ..memory_service import session_memory

router = APIRouter()
logger = logging.getLogger(__name__)

MEMORY_QUESTIONNAIRE_TYPES = DynamicInstrumentSet(HISTORIC_INSTRUMENT_CODES)


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


def _require_session_owner(db: Session, session_id: str, username: str) -> None:
    """A session recorded under another username is not the caller's to write.

    A session with no stored owner yet (fresh client id) is started by the caller.
    """
    for model in (models.QuestionnaireResult, models.FrozenSession, models.Log):
        other = db.query(model.id).filter(
            model.session_id == session_id, model.username.isnot(None), model.username != "",
            model.username != username,
        ).first()
        if other:
            raise HTTPException(status_code=403, detail="Session belongs to another user")


@router.post("/memory/event")
async def memory_event(
    request: MemoryEventRequest,
    db: Session = Depends(database.get_db),
    identity: dict = Depends(auth.get_current_user),
):
    """Registra transizioni UI senza rendere leggibile la memoria allo studente."""
    if request.questionnaire_type not in MEMORY_QUESTIONNAIRE_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported questionnaire_type")
    if not request.phase.strip():
        raise HTTPException(status_code=400, detail="phase is required")
    _require_session_owner(db, request.session_id, identity.get("username") or "")
    step = db.query(models.GuidedStep).filter(models.GuidedStep.id == request.phase).first()
    class_access.require_tool(db, identity, request.questionnaire_type)
    if step and step.questionnaire_type != request.questionnaire_type:
        class_access.require_tool(db, identity, step.questionnaire_type)

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
