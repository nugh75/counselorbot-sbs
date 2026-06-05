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
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from starlette.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..ai_service import AIService, AIError
from ..api_models import SiteChatRequest
from ..chat_logic import _clamp_max_tokens
from ..memory_service import session_memory
from ..strategy_memory import shared_response_memory
from ..prompt_config import (
    SITE_CHAT_MODE_TO_PROMPT_KEY,
    DEFAULT_SYSTEM_PROMPT_SITE_STUDENTE,
    DEFAULT_SYSTEM_PROMPT_SITE_DOCENTE,
    DEFAULT_SITE_CHAT_PLATFORM_CONTEXT,
    DEFAULT_SITE_CHAT_KNOWLEDGE_CARD,
)
from ..rag_index import site_rag_index, build_context, get_document_preview, DEFAULT_TOP_K

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

# Etichetta interna per separare i like del site-chat nella memoria condivisa
# e nella vista admin (riusa il sistema feedback degli altri strumenti).
_SITE_QTYPE = "SITE"

# Le fonti sono mostrate come chip nel frontend: rimuovi i marcatori "[FONTE n]"
# / "(FONTE n)" che il modello a volte lascia inline nonostante il prompt.
_FONTE_RE = re.compile(
    r"\s*[\(\[]\s*font[ei]\s*\d+(?:\s*[;,e]+\s*(?:font[ei]\s*)?\d+)*\s*[\)\]]",
    re.IGNORECASE,
)


def _strip_fonte_tokens(text: str) -> str:
    if not text:
        return text
    t = _FONTE_RE.sub("", text)
    t = re.sub(r"\s*,(\s*,)+", ",", t)            # virgole multiple residue
    t = re.sub(r"\s+([,.;:!?])", r"\1", t)        # spazio prima della punteggiatura
    t = re.sub(r"([,;:])\s*([.!?])", r"\2", t)    # ", ." -> "."
    t = re.sub(r"[ \t]{2,}", " ", t)
    return t


def _resolve_site_prompt(ai_service: AIService, audience: str) -> str:
    audience = audience if audience in SITE_CHAT_MODE_TO_PROMPT_KEY else "studente"
    key = SITE_CHAT_MODE_TO_PROMPT_KEY[audience]
    prompt = ai_service.config.get(key, _AUDIENCE_DEFAULT_PROMPT[audience])
    # Verità di base + scheda strumenti canonica, in testa al prompt (indipendenti dal RAG).
    ctx = ai_service.config.get("site_chat_platform_context", DEFAULT_SITE_CHAT_PLATFORM_CONTEXT)
    card = ai_service.config.get("site_chat_knowledge_card", DEFAULT_SITE_CHAT_KNOWLEDGE_CARD)
    preamble = "\n\n".join(p.strip() for p in (ctx, card) if p and p.strip())
    if preamble:
        prompt = f"{preamble}\n\n{prompt}"
    return prompt


def _top_k(ai_service: AIService) -> int:
    try:
        return max(1, min(int(ai_service.config.get("site_chat_top_k", DEFAULT_TOP_K)), 20))
    except (TypeError, ValueError):
        return DEFAULT_TOP_K


def _retrieval_params(ai_service: AIService):
    """Legge pesi categoria/pubblico, cap per sorgente e soglia dalla config DB."""
    cfg = ai_service.config

    def _parse(key, default):
        try:
            val = _json.loads(cfg.get(key) or "")
            return val if isinstance(val, dict) else default
        except (TypeError, ValueError):
            return default

    try:
        max_per_source = max(1, int(cfg.get("site_chat_max_per_source", 3)))
    except (TypeError, ValueError):
        max_per_source = 3
    try:
        min_score = float(cfg.get("site_chat_min_score", 0.2))
    except (TypeError, ValueError):
        min_score = 0.2
    return _parse("site_chat_category_weights", {}), _parse("site_chat_audience_weights", {}), max_per_source, min_score


@router.get("/site-chat/status")
async def site_chat_status(db: Session = Depends(get_db)):
    """Stato dell'indice RAG (pubblico, sola lettura). Carica da disco se questo
    worker non ha ancora l'indice in memoria (senza ricostruire)."""
    if not site_rag_index._loaded:
        site_rag_index._load_from_disk()
    return site_rag_index.stats()


@router.get("/site-chat/document")
async def site_chat_document(source: str = Query(...)):
    """Anteprima di un documento citato (pubblico, sola lettura).

    Consente solo le sorgenti effettivamente indicizzate (no path arbitrari).
    Restituisce il PDF originale (application/pdf) o il markdown convertito (JSON).
    """
    valid_sources = {c["source"] for c in site_rag_index.chunks}
    if source not in valid_sources:
        raise HTTPException(status_code=404, detail="Documento non disponibile")
    preview = get_document_preview(source)
    if not preview:
        raise HTTPException(status_code=404, detail="Anteprima non disponibile per questo documento")
    if preview[0] == "pdf":
        return FileResponse(preview[1], media_type="application/pdf", filename=source.split("/")[-1])
    _, text, title = preview
    return {"type": "markdown", "source": source, "title": title, "content": text}


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

    # Memoria conversazionale (continuità tra domande): stato + episodi pertinenti.
    # File-based, stesso store degli altri strumenti. Vuoto alla prima domanda.
    prior_memory = session_memory.get_relevant_context(
        session_id, query=question, include_scores=False
    )

    cat_weights, aud_weights, max_per_source, min_score = _retrieval_params(ai_service)

    # Retrieval (embeddings/IO bloccanti) fuori dall'event loop.
    try:
        results = await run_in_threadpool(
            site_rag_index.search, ai_service, question, top_k,
            request.audience, cat_weights, aud_weights, max_per_source, min_score,
        )
    except AIError as e:
        logger.error("Site-chat retrieval AIError: %s", e)
        results = None
        retrieval_error = str(e)
    else:
        retrieval_error = None

    def _log_and_persist(answer: str, sources: list[str]) -> str | None:
        """Logga l'interazione, aggiorna la memoria conversazionale e crea il
        candidato per il 'mi piace'. Ritorna response_id (per l'evento done)."""
        log_db = database.SessionLocal()
        response_id = None
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
            response_id = shared_response_memory.create_candidate(
                log_db, answer, _SITE_QTYPE, phase=request.audience, language="it",
            )
            log_db.commit()
        except Exception as e:
            logger.error("Site-chat log fallito: %s", e)
            log_db.rollback()
            response_id = None
        finally:
            log_db.close()
        # Memoria conversazionale (su disco, indipendente dal DB).
        try:
            session_memory.record_interaction(
                session_id,
                user_message=question,
                bot_response=answer,
                questionnaire_type=_SITE_QTYPE,
                phase=request.audience,
                language="it",
            )
        except Exception as e:
            logger.error("Site-chat memoria fallita: %s", e)
        return response_id

    def event_gen():
        # Errore di retrieval (es. modello embedding non disponibile)
        if retrieval_error is not None:
            yield f"data: {_json.dumps({'error': retrieval_error})}\n\n"
            return
        # Nessun materiale indicizzato (stato di errore infra): non persiste.
        if not results:
            yield f"data: {_json.dumps({'delta': _NO_MATERIAL_MESSAGE, 'display': _NO_MATERIAL_MESSAGE})}\n\n"
            yield f"data: {_json.dumps({'done': True, 'response': _NO_MATERIAL_MESSAGE, 'session_id': session_id, 'sources': []})}\n\n"
            return

        context, sources = build_context(results)
        memory_block = (
            f"CONVERSAZIONE PRECEDENTE (solo per continuità, NON è una fonte):\n{prior_memory}\n\n---\n\n"
            if prior_memory else ""
        )
        full_message = (
            f"{memory_block}"
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
                yield f"data: {_json.dumps({'delta': text, 'display': _strip_fonte_tokens(''.join(chunks))})}\n\n"

            answer = _strip_fonte_tokens("".join(chunks))
            response_id = _log_and_persist(answer, sources)
            yield f"data: {_json.dumps({'done': True, 'response': answer, 'session_id': session_id, 'sources': sources, 'response_id': response_id})}\n\n"
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
