"""Endpoint di chat e QSA: /chat, /chat/stream, /chat/message,
/qsa/guided-ui-texts, /qsa/audit, /qsa/upload, /tts."""
import io
import json
import logging
import os
import shutil
import subprocess
import sys
import uuid

import edge_tts
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import database, models
from ..ai_service import AIService, AIError
from ..api_models import ChatRequest, QsaAuditRequest, TTSRequest
from ..memory_service import session_memory
from ..prompt_config import (
    DEFAULT_SYSTEM_PROMPT_GENERIC,
    DEFAULT_GUIDED_TEXT_QSAR_QUESTIONS_INTRO,
    DEFAULT_GUIDED_TEXT_QSAR_CONCLUSION,
    DEFAULT_GUIDED_TEXT_ZTPI_QUESTIONS_INTRO,
    DEFAULT_GUIDED_TEXT_ZTPI_CONCLUSION,
    DEFAULT_GUIDED_TEXT_SAVICKAS_QUESTIONS_INTRO,
    DEFAULT_GUIDED_TEXT_SAVICKAS_CONCLUSION,
    GUIDED_PUBLIC_UI_CONFIG_DEFINITIONS,
    MODE_TO_SYSTEM_PROMPT_KEY,
    SYSTEM_PROMPT_DEFAULTS,
)
from ..chat_logic import (
    _annotate_qsa_factor_codes,
    _apply_language_directive,
    _apply_qsa_factor_directive,
    _apply_thinking_token_headroom,
    _clamp_max_tokens,
    _ensure_questionnaire_guided_steps,
    _is_strategy_questionnaire,
    _resolve_system_prompt,
    _resolve_user_message_for_chat,
    _retrieved_context,
    _sanitize_ztpi_step_label,
    _sanitize_ztpi_user_text,
    _should_sanitize_ztpi_text,
    _student_visible_response,
    _update_markdown_memory_background,
    strip_markdown,
)

router = APIRouter()
get_db = database.get_db
logger = logging.getLogger(__name__)


@router.get("/qsa/guided-ui-texts")
async def get_guided_ui_texts(questionnaire_type: str = "QSA", db: Session = Depends(get_db)):
    """Public endpoint with guided-chat UI texts/labels and step definitions.

    Pass ?questionnaire_type=QSAr, ZTPI or SAVICKAS for dedicated guided paths.
    """
    ai_service = AIService(db)
    _ensure_questionnaire_guided_steps(db, questionnaire_type)

    result: dict = {}
    # Static config texts (questions labels, conclusion label, static messages)
    for ui_def in GUIDED_PUBLIC_UI_CONFIG_DEFINITIONS:
        result[ui_def["key"]] = ai_service.config.get(ui_def["key"], ui_def["default"])

    # Dynamic steps filtered by questionnaire_type
    steps = (
        db.query(models.GuidedStep)
        .filter(models.GuidedStep.questionnaire_type == questionnaire_type)
        .order_by(models.GuidedStep.sort_order)
        .all()
    )
    result["guided_steps"] = [
        {
            "id": s.id,
            "sort_order": s.sort_order,
            "label": _sanitize_ztpi_step_label(s.label) if questionnaire_type == "ZTPI" else s.label,
            "system_prompt_mode": s.system_prompt_mode,
            "color_theme": s.color_theme,
        }
        for s in steps
    ]

    # Override questions/conclusion texts for ZTPI
    if questionnaire_type == "QSAr":
        result["label_guided_questions"] = "8. Domande e Approfondimenti"
        result["text_guided_questions_phase_banner"] = "--- Fase 8: Domande e Approfondimenti ---"
        result["text_guided_questions_intro"] = ai_service.config.get(
            "text_qsar_questions_intro", DEFAULT_GUIDED_TEXT_QSAR_QUESTIONS_INTRO
        )
        result["text_guided_conclusion"] = ai_service.config.get(
            "text_qsar_conclusion", DEFAULT_GUIDED_TEXT_QSAR_CONCLUSION
        )
    elif questionnaire_type == "ZTPI":
        result["text_guided_questions_intro"] = _sanitize_ztpi_user_text(
            ai_service.config.get(
                "text_ztpi_questions_intro", DEFAULT_GUIDED_TEXT_ZTPI_QUESTIONS_INTRO
            )
        )
        result["text_guided_conclusion"] = _sanitize_ztpi_user_text(
            ai_service.config.get(
                "text_ztpi_conclusion", DEFAULT_GUIDED_TEXT_ZTPI_CONCLUSION
            )
        )
    elif questionnaire_type == "SAVICKAS":
        result["label_guided_questions"] = "7. Domande e Approfondimenti"
        result["text_guided_questions_phase_banner"] = "--- Fase 7: Domande e Approfondimenti ---"
        result["text_guided_questions_intro"] = ai_service.config.get(
            "text_savickas_questions_intro", DEFAULT_GUIDED_TEXT_SAVICKAS_QUESTIONS_INTRO
        )
        result["text_guided_conclusion"] = ai_service.config.get(
            "text_savickas_conclusion", DEFAULT_GUIDED_TEXT_SAVICKAS_CONCLUSION
        )

    return result


@router.post("/chat")
async def chat(request: ChatRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    session_id = request.session_id or str(uuid.uuid4())

    # 1. Retrieve Configuration and System Prompt based on Mode
    ai_service = AIService(db)
    max_tokens = _apply_thinking_token_headroom(_clamp_max_tokens(request.max_tokens), ai_service)

    prompt_key, system_prompt = _resolve_system_prompt(ai_service, request.mode, request.phase, db)
    system_prompt = _apply_language_directive(system_prompt, request.language)
    effective_message, phase_prompt_key = _resolve_user_message_for_chat(ai_service, request, db)

    # 1b. Reset memoria se inizia una nuova analisi guidata (primo step)
    is_first_step = False
    step_label = ""
    questionnaire_type = request.questionnaire_type or ""
    if request.use_phase_prompt and request.phase:
        step = db.query(models.GuidedStep).filter(models.GuidedStep.id == request.phase).first()
        if step:
            step_label = step.label
            questionnaire_type = step.questionnaire_type
            first_step = (
                db.query(models.GuidedStep)
                .filter(models.GuidedStep.questionnaire_type == step.questionnaire_type)
                .order_by(models.GuidedStep.sort_order)
                .first()
            )
            if first_step and step.id == first_step.id:
                is_first_step = True
                session_memory.clear(session_id)
                logger.info(f"Session {session_id}: memoria resettata (nuova analisi guidata)")
    elif request.phase:
        step = db.query(models.GuidedStep).filter(models.GuidedStep.id == request.phase).first()
        if step:
            step_label = step.label
            questionnaire_type = step.questionnaire_type

    system_prompt = _apply_qsa_factor_directive(system_prompt, questionnaire_type, request.language)
    model_scores_context = (
        _annotate_qsa_factor_codes(request.scores_context, request.language, questionnaire_type=questionnaire_type)
        if _is_strategy_questionnaire(questionnaire_type) else request.scores_context
    )
    model_message = (
        _annotate_qsa_factor_codes(effective_message, request.language, questionnaire_type=questionnaire_type)
        if _is_strategy_questionnaire(questionnaire_type) else effective_message
    )

    session_memory.update_context(
        session_id,
        questionnaire_type=questionnaire_type,
        scores_context=model_scores_context,
        language=request.language or "",
        phase=request.phase or "",
        step_label=step_label,
    )

    # 2. Build the full message including student's QSA profile
    if model_scores_context:
        full_message = f"{model_scores_context}\n\nDOMANDA DELLO STUDENTE:\n{model_message}"
    else:
        full_message = model_message

    # 3. Recupera solo la memoria pertinente e le strategie collettive approvate.
    retrieval_query = f"{step_label} {model_message} {model_scores_context}".strip()
    conversation_summary, strategy_ids = _retrieved_context(
        session_id, request, questionnaire_type, retrieval_query
    )
    if _should_sanitize_ztpi_text(request.mode, request.phase):
        conversation_summary = _sanitize_ztpi_user_text(conversation_summary)

    # 4. Get AI Response (con contesto conversazionale)
    try:
        response_content = ai_service.get_response(
            full_message, system_prompt, request.mode,
            conversation_summary=conversation_summary,
            max_tokens=max_tokens,
        )
    except AIError as e:
        logger.error(f"Errore AI chat session {session_id}: {e}")
        raise HTTPException(status_code=502, detail=str(e))
    if _should_sanitize_ztpi_text(request.mode, request.phase):
        response_content = _sanitize_ztpi_user_text(response_content)
    elif _is_strategy_questionnaire(questionnaire_type):
        response_content = _annotate_qsa_factor_codes(
            response_content, request.language, questionnaire_type=questionnaire_type
        )

    if _should_sanitize_ztpi_text(request.mode, request.phase):
        step_label = _sanitize_ztpi_step_label(step_label)

    # Deterministic local write: complete it before the client can advance phase.
    _update_markdown_memory_background(
        session_id, request.memory_message if request.memory_message is not None else request.message, response_content,
        step_label, is_first_step, conversation_summary, request.phase or "", model_scores_context,
        questionnaire_type, request.language or "", False,
    )

    # 6. Log Interaction
    log_entry = models.Log(
        session_id=session_id,
        action="chat_message",
        details={
            "mode": request.mode,
            "phase": request.phase,
            "user_input": request.message,
            "effective_user_input": effective_message,
            "bot_response": response_content,
            "system_prompt_key": prompt_key,
            "guided_phase_prompt_key": phase_prompt_key,
            "provider": ai_service.config.get('active_provider', 'unknown'),
            "model": ai_service.config.get('model_name', 'unknown'),
            "questionnaire_type": questionnaire_type,
            "conversation_summary_length": len(conversation_summary),
        }
    )
    db.add(log_entry)
    db.commit()

    return {"response": response_content, "session_id": session_id, "strategy_ids": strategy_ids}


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Variante streaming di /chat (Server-Sent Events).
    Eventi: {"delta": "..."} per ogni pezzo, poi {"done": true, "response": <full>, "session_id": ...}.
    Il logging e l'aggiornamento della memoria Markdown avvengono al termine dello stream.
    NB: la sessione `db` viene chiusa al ritorno della funzione (prima che il
    generatore venga consumato), perciò l'AIService carica la config subito e
    il logging usa una sessione fresca.
    """
    import json as _json

    session_id = request.session_id or str(uuid.uuid4())

    # Preparazione (usa la db della richiesta, ancora aperta qui)
    ai_service = AIService(db)
    max_tokens = _apply_thinking_token_headroom(_clamp_max_tokens(request.max_tokens), ai_service)
    prompt_key, system_prompt = _resolve_system_prompt(ai_service, request.mode, request.phase, db)
    system_prompt = _apply_language_directive(system_prompt, request.language)
    effective_message, phase_prompt_key = _resolve_user_message_for_chat(ai_service, request, db)

    is_first_step = False
    step_label = ""
    questionnaire_type = request.questionnaire_type or ""
    if request.use_phase_prompt and request.phase:
        step = db.query(models.GuidedStep).filter(models.GuidedStep.id == request.phase).first()
        if step:
            step_label = step.label
            questionnaire_type = step.questionnaire_type
            first_step = (
                db.query(models.GuidedStep)
                .filter(models.GuidedStep.questionnaire_type == step.questionnaire_type)
                .order_by(models.GuidedStep.sort_order)
                .first()
            )
            if first_step and step.id == first_step.id:
                is_first_step = True
                session_memory.clear(session_id)
                logger.info(f"Session {session_id}: memoria resettata (nuova analisi guidata, stream)")
    elif request.phase:
        step = db.query(models.GuidedStep).filter(models.GuidedStep.id == request.phase).first()
        if step:
            step_label = step.label
            questionnaire_type = step.questionnaire_type

    system_prompt = _apply_qsa_factor_directive(system_prompt, questionnaire_type, request.language)
    model_scores_context = (
        _annotate_qsa_factor_codes(request.scores_context, request.language, questionnaire_type=questionnaire_type)
        if _is_strategy_questionnaire(questionnaire_type) else request.scores_context
    )
    model_message = (
        _annotate_qsa_factor_codes(effective_message, request.language, questionnaire_type=questionnaire_type)
        if _is_strategy_questionnaire(questionnaire_type) else effective_message
    )

    if model_scores_context:
        full_message = f"{model_scores_context}\n\nDOMANDA DELLO STUDENTE:\n{model_message}"
    else:
        full_message = model_message

    session_memory.update_context(
        session_id,
        questionnaire_type=questionnaire_type,
        scores_context=model_scores_context,
        language=request.language or "",
        phase=request.phase or "",
        step_label=step_label,
    )

    retrieval_query = f"{step_label} {model_message} {model_scores_context}".strip()
    conversation_summary, strategy_ids = _retrieved_context(
        session_id, request, questionnaire_type, retrieval_query
    )
    sanitize = _should_sanitize_ztpi_text(request.mode, request.phase)
    if sanitize:
        conversation_summary = _sanitize_ztpi_user_text(conversation_summary)

    if sanitize:
        step_label = _sanitize_ztpi_step_label(step_label)

    provider = ai_service.config.get('active_provider', 'unknown')
    model = ai_service.config.get('model_name', 'unknown')

    def _log_stream(response_content: str):
        log_db = database.SessionLocal()
        try:
            log_db.add(models.Log(
                session_id=session_id,
                action="chat_message",
                details={
                    "mode": request.mode,
                    "phase": request.phase,
                    "user_input": request.message,
                    "effective_user_input": effective_message,
                    "bot_response": response_content,
                    "system_prompt_key": prompt_key,
                    "guided_phase_prompt_key": phase_prompt_key,
                    "provider": provider,
                    "model": model,
                    "questionnaire_type": questionnaire_type,
                    "conversation_summary_length": len(conversation_summary),
                    "streamed": True,
                },
            ))
            log_db.commit()
        except Exception as e:
            logger.error(f"Errore log stream session {session_id}: {e}")
        finally:
            log_db.close()

    def event_gen():
        chunks = []
        try:
            for item in ai_service.stream_response(
                full_message, system_prompt, request.mode,
                conversation_summary=conversation_summary,
                max_tokens=max_tokens,
            ):
                text = item.get("text") if isinstance(item, dict) else item
                if not text:
                    continue
                # Reasoning / thinking: streammato a parte, NON entra nella risposta finale.
                if isinstance(item, dict) and item.get("type") == "reasoning":
                    yield f"data: {_json.dumps({'reasoning': text})}\n\n"
                    continue
                chunks.append(text)
                raw_response = "".join(chunks)
                display_response = _student_visible_response(
                    raw_response, questionnaire_type, request.language, sanitize
                )
                yield f"data: {_json.dumps({'delta': text, 'display': display_response})}\n\n"

            response_content = _student_visible_response(
                "".join(chunks), questionnaire_type, request.language, sanitize
            )

            # Complete the local memory write before the frontend records a phase transition.
            _update_markdown_memory_background(
                session_id,
                request.memory_message if request.memory_message is not None else request.message,
                response_content,
                step_label,
                is_first_step,
                conversation_summary,
                request.phase or "",
                model_scores_context,
                questionnaire_type,
                request.language or "",
                False,
            )

            _log_stream(response_content)

            yield f"data: {_json.dumps({'done': True, 'response': response_content, 'session_id': session_id, 'strategy_ids': strategy_ids})}\n\n"
        except Exception as e:
            logger.error(f"Errore stream chat session {session_id}: {e}")
            yield f"data: {_json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # disabilita il buffering di nginx
            "Connection": "keep-alive",
        },
    )


@router.post("/chat/message")
async def chat_message(
    message: str,
    session_id: str,
    mode: str,
    background_tasks: BackgroundTasks,
    questionnaire_type: str = "",
    language: str = "",
    db: Session = Depends(get_db),
):
    # 1. Retrieve Configuration and System Prompt based on Mode
    ai_service = AIService(db)

    prompt_key = MODE_TO_SYSTEM_PROMPT_KEY.get(mode, "prompt_generic")
    system_prompt = ai_service.config.get(
        prompt_key,
        SYSTEM_PROMPT_DEFAULTS.get(prompt_key, DEFAULT_SYSTEM_PROMPT_GENERIC),
    )
    system_prompt = _apply_language_directive(system_prompt, language)

    session_memory.update_context(
        session_id,
        questionnaire_type=questionnaire_type,
        language=language,
    )

    # 2. Recupera una porzione compatta e pertinente della memoria Markdown.
    conversation_summary = session_memory.get_relevant_context(session_id, query=message)
    if _should_sanitize_ztpi_text(mode, None):
        conversation_summary = _sanitize_ztpi_user_text(conversation_summary)

    # 3. Get AI Response (con contesto conversazionale)
    response_content = ai_service.get_response(
        message, system_prompt, mode,
        conversation_summary=conversation_summary
    )
    if _should_sanitize_ztpi_text(mode, None):
        response_content = _sanitize_ztpi_user_text(response_content)

    # 4. Aggiorna memoria Markdown prima di restituire la risposta.
    _update_markdown_memory_background(
        session_id, message, response_content, "", False, conversation_summary,
        "", "", questionnaire_type, language, False,
    )

    # 5. Log Interaction
    log_entry = models.Log(
        session_id=session_id,
        action="chat_message",
        details={
            "mode": mode,
            "user_input": message,
            "bot_response": response_content,
            "provider": ai_service.config.get('active_provider', 'unknown'),
            "model": ai_service.config.get('model_name', 'unknown'),
            "questionnaire_type": questionnaire_type,
            "conversation_summary_length": len(conversation_summary),
        }
    )
    db.add(log_entry)
    db.commit()

    return {"response": response_content}


@router.post("/qsa/audit")
async def audit_qsa(request: QsaAuditRequest, db: Session = Depends(get_db)):
    # Log completion for QSA-family profile analyses.
    log_entry = models.Log(
        session_id=request.session_id,
        action="qsa_completed",
        details={"questionnaire_type": request.questionnaire_type, "scores": request.scores}
    )
    db.add(log_entry)
    db.commit()
    return {"status": "ok"}


@router.post("/qsa/upload")
async def upload_qsa_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    # 1. Save file temporarily
    temp_dir = ".tmp"
    os.makedirs(temp_dir, exist_ok=True)
    temp_file_path = os.path.join(temp_dir, f"upload_{uuid.uuid4()}_{file.filename}")

    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        # 2. Call execution script
        script_path = "execution/extract_qsa_vision.py"

        if not os.path.exists(script_path):
             raise HTTPException(status_code=500, detail="Extraction script not found")

        result = subprocess.run(
            [sys.executable, script_path, temp_file_path],
            capture_output=True,
            text=True
        )

        if result.returncode != 0:
             print(f"Script Error: {result.stderr}")
             raise HTTPException(status_code=500, detail="Failed to process image")

        # 3. Parse result
        try:
            extraction_data = json.loads(result.stdout)
            if "error" in extraction_data:
                 raise HTTPException(status_code=400, detail=extraction_data["error"])
            return extraction_data
        except json.JSONDecodeError:
             print(f"JSON Error: {result.stdout}")
             raise HTTPException(status_code=500, detail="Invalid response from AI extractor")

    finally:
        # 4. Clean up
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)


@router.post("/tts")
async def text_to_speech(request: TTSRequest):
    try:
        clean_text = strip_markdown(request.text)

        if len(clean_text) > 5000:
            clean_text = clean_text[:5000] + "... Testo troncato."

        communicate = edge_tts.Communicate(clean_text, request.voice)

        audio_bytes = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_bytes.write(chunk["data"])

        audio_bytes.seek(0)

        return StreamingResponse(
            audio_bytes,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=speech.mp3"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS Error: {str(e)}")
