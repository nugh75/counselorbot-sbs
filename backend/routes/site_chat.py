"""Chatbot informativo sul sito competenzestrategiche.it.

RAG locale sui documenti in `docs/` (indice ibrido vettori + grafo graphify),
due modalità di pubblico: docente / studente. Risponde SOLO dai materiali.

Endpoint:
- POST /site-chat/stream   → risposta in streaming (SSE), grounded
- GET  /site-chat/status   → stato dell'indice RAG
- POST /site-chat/reindex  → ricostruzione forzata dell'indice (solo admin)
"""
import json as _json
import logging
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..ai_service import AIService, AIError
from ..api_models import SiteChatRequest
from ..chat_logic import _clamp_max_tokens
from ..prompt_config import (
    SITE_CHAT_MODE_TO_PROMPT_KEY,
    DEFAULT_SYSTEM_PROMPT_SITE_STUDENTE,
    DEFAULT_SYSTEM_PROMPT_SITE_DOCENTE,
)
from ..rag_index import site_rag_index, build_context, DEFAULT_TOP_K

router = APIRouter()
get_db = database.get_db
logger = logging.getLogger(__name__)

_AUDIENCE_DEFAULT_PROMPT = {
    "docente": DEFAULT_SYSTEM_PROMPT_SITE_DOCENTE,
    "studente": DEFAULT_SYSTEM_PROMPT_SITE_STUDENTE,
}

_NO_MATERIAL_MESSAGE = (
    "Al momento non ho materiali del sito da consultare per rispondere. "
    "Riprova più tardi o contatta un amministratore."
)


def _resolve_site_prompt(ai_service: AIService, audience: str) -> str:
    audience = audience if audience in SITE_CHAT_MODE_TO_PROMPT_KEY else "studente"
    key = SITE_CHAT_MODE_TO_PROMPT_KEY[audience]
    return ai_service.config.get(key, _AUDIENCE_DEFAULT_PROMPT[audience])


def _top_k(ai_service: AIService) -> int:
    try:
        return max(1, min(int(ai_service.config.get("site_chat_top_k", DEFAULT_TOP_K)), 20))
    except (TypeError, ValueError):
        return DEFAULT_TOP_K


@router.get("/site-chat/status")
async def site_chat_status(db: Session = Depends(get_db)):
    """Stato dell'indice RAG (pubblico, sola lettura)."""
    return site_rag_index.stats()


@router.post("/site-chat/reindex")
async def site_chat_reindex(
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Ricostruisce l'indice RAG da zero (solo admin)."""
    ai_service = AIService(db)
    await run_in_threadpool(site_rag_index.build, ai_service)
    return {"status": "ok", "stats": site_rag_index.stats()}


@router.post("/site-chat/stream")
async def site_chat_stream(request: SiteChatRequest, db: Session = Depends(get_db)):
    """Risposta in streaming alla domanda sul sito, ancorata ai materiali.

    Eventi SSE: {"delta": "..."} per ogni pezzo, {"reasoning": "..."} per il
    thinking, infine {"done": true, "response": <full>, "session_id": ...,
    "sources": [...]}. Errori: {"error": "..."}.
    """
    session_id = request.session_id or str(uuid.uuid4())
    ai_service = AIService(db)
    system_prompt = _resolve_site_prompt(ai_service, request.audience)
    max_tokens = _clamp_max_tokens(request.max_tokens)
    top_k = _top_k(ai_service)
    question = (request.message or "").strip()
    provider = ai_service.config.get("active_provider", "unknown")
    model = ai_service.config.get("model_name", "unknown")

    # Retrieval (embeddings/IO bloccanti) fuori dall'event loop.
    try:
        results = await run_in_threadpool(site_rag_index.search, ai_service, question, top_k)
    except AIError as e:
        logger.error("Site-chat retrieval AIError: %s", e)
        results = None
        retrieval_error = str(e)
    else:
        retrieval_error = None

    def _log(answer: str, sources: list[str]):
        log_db = database.SessionLocal()
        try:
            log_db.add(models.Log(
                session_id=session_id,
                action="site_chat",
                details={
                    "audience": request.audience,
                    "question": question,
                    "answer": answer,
                    "sources": sources,
                    "provider": provider,
                    "model": model,
                    "n_results": len(results) if results else 0,
                },
            ))
            log_db.commit()
        except Exception as e:
            logger.error("Site-chat log fallito: %s", e)
            log_db.rollback()
        finally:
            log_db.close()

    def event_gen():
        # Errore di retrieval (es. modello embedding non disponibile)
        if retrieval_error is not None:
            yield f"data: {_json.dumps({'error': retrieval_error})}\n\n"
            return
        # Nessun materiale indicizzato
        if not results:
            yield f"data: {_json.dumps({'delta': _NO_MATERIAL_MESSAGE, 'display': _NO_MATERIAL_MESSAGE})}\n\n"
            yield f"data: {_json.dumps({'done': True, 'response': _NO_MATERIAL_MESSAGE, 'session_id': session_id, 'sources': []})}\n\n"
            _log(_NO_MATERIAL_MESSAGE, [])
            return

        context, sources = build_context(results)
        full_message = (
            f"MATERIALI (estratti dai documenti del sito):\n\n{context}\n\n"
            f"---\n\nDOMANDA:\n{question}"
        )

        chunks: list[str] = []
        try:
            for item in ai_service.stream_response(full_message, system_prompt, "site-chat", max_tokens=max_tokens):
                text = item.get("text") if isinstance(item, dict) else item
                if not text:
                    continue
                if isinstance(item, dict) and item.get("type") == "reasoning":
                    yield f"data: {_json.dumps({'reasoning': text})}\n\n"
                    continue
                chunks.append(text)
                yield f"data: {_json.dumps({'delta': text, 'display': ''.join(chunks)})}\n\n"

            answer = "".join(chunks)
            _log(answer, sources)
            yield f"data: {_json.dumps({'done': True, 'response': answer, 'session_id': session_id, 'sources': sources})}\n\n"
        except Exception as e:
            logger.error("Errore site-chat stream %s: %s", session_id, e)
            yield f"data: {_json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
