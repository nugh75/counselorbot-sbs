"""Strumento pQBL da PDF (pure Question-Based Learning, Jemstedt & Bälter 2025).

Lo studente carica un PDF; il testo viene suddiviso in chunk (capitoli/sezioni)
e l'AI genera 4 MCQ per chunk. Il PRIMO chunk viene generato subito (1 chiamata
LLM → pochi secondi); il resto in background mentre lo studente risponde già
alle prime domande (streaming). La sessione di apprendimento permette tentativi
multipli con feedback immediato; il test finale opzionale ripropone una domanda
per skill con risposta unica e feedback solo alla fine.

Endpoint:
- POST /pqbl/upload                      → upload PDF + generazione primo chunk
- GET  /pqbl/documents/{document_id}     → stato + domande disponibili
- POST /pqbl/sessions                    → crea sessione (learning | final_test)
- GET  /pqbl/sessions/{sid}/questions    → domande SENZA flag correct/feedback
- POST /pqbl/sessions/{sid}/answer       → verifica server-side, ritorna feedback
- POST /pqbl/sessions/{sid}/final-test   → submit unico del test finale
- GET  /pqbl/sessions/{sid}/summary      → metriche (primo tentativo, per skill, tempo)
"""
import hashlib
import logging
import math
import os
import random
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..ai_service import AIService, AIError
from ..api_models import PqblAnswerRequest, PqblFinalTestRequest, PqblQuestionUpdate, PqblSessionCreate
from ..pqbl_generator import (
    ALLOWED_SESSION_SIZES,
    PAGES_PER_SEGMENT,
    QUESTIONS_PER_CHUNK,
    pdf_total_pages,
    extract_pdf_text_range,
    generate_batch_for_chunk,
    split_text_into_chunks,
    detect_language,
)
from ..prompt_config import (
    DEFAULT_PQBL_ONBOARDING_TEXT,
    DEFAULT_PQBL_QUESTION_GENERATION_PROMPT,
)
from ..guided_text_i18n import resolve_text

router = APIRouter()
get_db = database.get_db
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
if not logger.handlers:
    logger.addHandler(logging.StreamHandler())
    logger.propagate = False

MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB
INACTIVITY_CAP_SECONDS = 300
# Cartella dove salvare i PDF durante la generazione (pulita dopo).
PQBL_STORAGE_DIR = os.environ.get("PQBL_STORAGE_DIR", "/tmp/pqbl_pdfs")


def _config_value(db: Session, key: str, default: str) -> str:
    row = db.query(models.Config).filter(models.Config.key == key).first()
    value = (row.value or "").strip() if row else ""
    return value or default


# ---------------------------------------------------------------------------
# Upload + generazione chunk-by-chunk (streaming)
# ---------------------------------------------------------------------------
# Provider richiesto per document_id (passato dall'upload al background task).
_PENDING_PROVIDERS: dict = {}
# Lingua scelta dall'utente (UI) per ciascun upload: le domande vengono
# generate in questa lingua, indipendentemente dalla lingua del PDF.
_PENDING_LANGUAGES: dict = {}


def _append_questions(db: Session, document_id: str, batch: list[dict], start_position: int) -> int:
    """Salva un batch di domande nel DB. Ritorna il numero salvato."""
    for i, q in enumerate(batch):
        db.add(models.PqblQuestion(
            document_id=document_id,
            skill=q.get("skill") or "",
            position=start_position + i,
            question_text=q.get("question") or "",
            options=q.get("options") or [],
        ))
    db.flush()
    return len(batch)


def _generate_all_chunks(document_id: str):
    """Background task: processa il PDF per segmenti di pagine.

    Ogni segmento di PAGES_PER_SEGMENT pagine genera 4 MCQ.
    Dopo il primo segmento segna status='ready'. I successivi
    vengono appesi in background. Il PDF temporaneo viene rimosso
    al termine.
    """
    db = database.SessionLocal()
    try:
        doc = db.query(models.PqblDocument).filter(models.PqblDocument.id == document_id).first()
        if not doc or not doc.file_path:
            logger.error(f"pQBL: documento {document_id} senza file_path")
            return

        file_path = doc.file_path
        if not os.path.exists(file_path):
            logger.error(f"pQBL: file PDF non trovato: {file_path}")
            doc.status = "error"
            doc.error_detail = "File PDF non trovato sul server."
            db.commit()
            return

        provider = _PENDING_PROVIDERS.pop(document_id, None)
        user_language = _PENDING_LANGUAGES.pop(document_id, None)
        total_pages = pdf_total_pages(file_path)
        n_segments = math.ceil(total_pages / PAGES_PER_SEGMENT)
        doc.chunks_total = n_segments

        # Lingua delle domande: quella scelta dall'utente nella UI; il
        # rilevamento dal testo del PDF è solo un ripiego.
        if user_language:
            doc.language = user_language
            logger.info(f"pQBL: lingua utente per {document_id}: {doc.language}")
        else:
            try:
                first_segment_text = extract_pdf_text_range(file_path, 0, min(PAGES_PER_SEGMENT, total_pages))
                doc.language = detect_language(first_segment_text)
                logger.info(f"pQBL: lingua rilevata per {document_id}: {doc.language}")
            except Exception as lang_err:
                logger.warning(f"pQBL: rilevamento lingua fallito per {document_id}, uso default {doc.language}: {lang_err}")

        logger.info(
            f"pQBL: {total_pages} pagine → {n_segments} segmenti "
            f"(provider={provider or 'default'}, lingua={doc.language})"
        )
        db.commit()

        ai = AIService(db)
        dedicated_model = (ai.config.get("pqbl_model") or "").strip()
        if dedicated_model:
            ai.config["model_name"] = dedicated_model
        if provider:
            ai.config["active_provider"] = provider

        question_prompt = _config_value(db, "pqbl_question_generation_prompt", DEFAULT_PQBL_QUESTION_GENERATION_PROMPT)
        last_position = 0

        for seg_idx in range(n_segments):
            if last_position >= doc.size:
                logger.info(f"pQBL: raggiunto il limite di domande richieste ({doc.size}) per {document_id}")
                doc.chunks_total = doc.chunks_done
                db.commit()
                break

            start_page = seg_idx * PAGES_PER_SEGMENT
            end_page = min(start_page + PAGES_PER_SEGMENT, total_pages)

            try:
                logger.info(f"pQBL: estrazione pagine {start_page + 1}-{end_page} (segmento {seg_idx + 1}/{n_segments})")
                text = extract_pdf_text_range(file_path, start_page, end_page)
                chunk_texts = split_text_into_chunks(text)
                
                # Calcola quanti chunk ci servono al massimo per raggiungere la dimensione richiesta
                remaining_needed = doc.size - last_position
                from backend.pqbl_generator import QUESTIONS_PER_CHUNK
                max_chunks_needed = math.ceil(remaining_needed / QUESTIONS_PER_CHUNK)
                chunk_texts_to_process = chunk_texts[:max(max_chunks_needed, 1)]
                
                # Esegui le chiamate all'AI in parallelo usando un ThreadPoolExecutor
                from concurrent.futures import ThreadPoolExecutor
                
                def worker(c_idx, c_text):
                    batch = generate_batch_for_chunk(
                        ai, c_text, seg_idx * 100 + c_idx, doc.language,
                        question_prompt, provider=provider,
                    )
                    return c_idx, batch
                
                logger.info(f"pQBL: elaborazione in parallelo di {len(chunk_texts_to_process)} chunk...")
                with ThreadPoolExecutor(max_workers=min(len(chunk_texts_to_process), 5)) as executor:
                    futures = [
                        executor.submit(worker, chunk_idx, chunk_text)
                        for chunk_idx, chunk_text in enumerate(chunk_texts_to_process)
                    ]
                    # Tolleranza ai guasti per chunk: un chunk fallito non butta
                    # via il segmento; salviamo le domande dei chunk riusciti.
                    results = []
                    chunk_errors = []
                    for f in futures:
                        try:
                            results.append(f.result())
                        except (AIError, ValueError) as chunk_err:
                            chunk_errors.append(str(chunk_err))
                            logger.warning(f"pQBL: chunk fallito nel segmento {seg_idx + 1}: {chunk_err}")
                if not results:
                    raise ValueError(
                        f"Tutti i {len(chunk_texts_to_process)} chunk del segmento sono falliti: "
                        f"{chunk_errors[0] if chunk_errors else 'nessun dettaglio'}"
                    )
                if chunk_errors:
                    logger.warning(
                        f"pQBL: segmento {seg_idx + 1}: {len(chunk_errors)} chunk su "
                        f"{len(chunk_texts_to_process)} falliti, continuo con i rimanenti"
                    )

                # Ordiniamo per indice per mantenere la sequenza del PDF
                results.sort(key=lambda x: x[0])
                
                # Salviamo i risultati nel database
                for chunk_idx, batch in results:
                    remaining = doc.size - last_position
                    if remaining <= 0:
                        logger.info(f"pQBL: raggiunto il limite di domande richieste ({doc.size}) prima del chunk {chunk_idx}")
                        break
                    if len(batch) > remaining:
                        logger.info(f"pQBL: taglio del batch da {len(batch)} a {remaining} domande per rispettare il limite richiesto ({doc.size})")
                        batch = batch[:remaining]
                    n = _append_questions(db, document_id, batch, last_position)
                    last_position += n
                    logger.info(f"pQBL: segmento {seg_idx + 1}/{n_segments}: +{n} domande (tot={last_position})")
                    db.commit()

                doc.chunks_done = seg_idx + 1
                if doc.status != "ready" and last_position > 0:
                    doc.status = "ready"
                    logger.info(
                        f"pQBL: prime domande pronte ({last_position}), "
                        f"status='ready', background continua per {n_segments - seg_idx - 1} segmenti"
                    )
                db.commit()
            except (AIError, ValueError) as e:
                logger.warning(f"pQBL: segmento {seg_idx + 1}/{n_segments} fallito: {e}")
                doc.error_detail = (
                    f"Segmento {seg_idx + 1} su {n_segments} fallito: {e}. "
                    "Le domande già generate sono disponibili."
                )
                doc.chunks_done = seg_idx + 1
                db.commit()

        if last_position == 0:
            doc.status = "error"
            logger.error(f"pQBL: nessuna domanda generata per {document_id}")
            db.commit()
            return

        logger.info(
            f"pQBL: generazione completata per {document_id} "
            f"({n_segments} segmenti, {total_pages} pagine, {last_position} domande)"
        )
    except Exception as e:
        logger.error(f"pQBL: errore inatteso {document_id}: {e}", exc_info=True)
        try:
            doc = db.query(models.PqblDocument).filter(models.PqblDocument.id == document_id).first()
            if doc:
                doc.status = "error"
                doc.error_detail = f"Errore inatteso durante la generazione: {e}"
                db.commit()
        except Exception as db_err:
            logger.error(f"pQBL: errore nell'aggiornare lo stato di errore inatteso per {document_id}: {db_err}")
    finally:
        # Pulisce il PDF temporaneo
        try:
            doc = db.query(models.PqblDocument).filter(models.PqblDocument.id == document_id).first()
            if doc and doc.file_path and os.path.exists(doc.file_path):
                os.remove(doc.file_path)
                logger.info(f"pQBL: file temporaneo rimosso: {doc.file_path}")
                doc.file_path = None
                db.commit()
        except Exception as e:
            logger.warning(f"pQBL: cleanup file fallito per {document_id}: {e}")
        db.close()


@router.post("/pqbl/upload")
async def upload_pqbl_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    size: int = Form(10),
    provider: str = Form(""),
    language: str = Form(""),
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity),
):
    if size not in ALLOWED_SESSION_SIZES:
        raise HTTPException(status_code=400, detail=f"Numero domande non valido: scegli tra {ALLOWED_SESSION_SIZES}.")
    suffix = os.path.splitext(file.filename or "")[1].lower()
    if suffix != ".pdf":
        raise HTTPException(status_code=400, detail="Formato non supportato. Carica un PDF.")

    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()
    if not contents:
        raise HTTPException(status_code=400, detail="Il file è vuoto.")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Il file supera la dimensione massima di 10 MB.")

    provider_val = provider.strip() or None
    language_val = language.strip().lower() if language.strip().lower() in ("it", "en") else None
    file_hash = hashlib.sha256(contents).hexdigest()

    # Riuso: stesso file + stesso provider + stessa lingua già generato.
    reuse_filters = [
        models.PqblDocument.text_hash == file_hash,
        models.PqblDocument.provider == provider_val,
        models.PqblDocument.status == "ready",
    ]
    if language_val:
        reuse_filters.append(models.PqblDocument.language == language_val)
    existing = (
        db.query(models.PqblDocument)
        .filter(*reuse_filters)
        .order_by(models.PqblDocument.created_at.desc())
        .first()
    )
    if existing:
        logger.info(f"pQBL: riuso del bank esistente {existing.id} per lo stesso file")
        return {"document_id": existing.id, "status": "ready", "reused": True}

    # Salva il PDF su disco per la generazione in background (nessuna
    # estrazione testo qui: tutto viene fatto in _generate_all_chunks).
    os.makedirs(PQBL_STORAGE_DIR, exist_ok=True)
    file_path = os.path.join(PQBL_STORAGE_DIR, f"{uuid.uuid4().hex}.pdf")
    with open(file_path, "wb") as f:
        f.write(contents)

    doc = models.PqblDocument(
        id=str(uuid.uuid4()),
        username=identity.get("username") or None,
        filename=file.filename,
        text_hash=file_hash,
        language="it",
        size=size,
        status="processing",
        provider=provider_val,
        file_path=file_path,
        chunks_total=0,
        chunks_done=0,
    )
    db.add(doc)
    db.add(models.Log(
        session_id=doc.id,
        action="pqbl_upload",
        details={
            "filename": file.filename, "size": size, "provider": provider_val,
            "language": language_val,
        },
    ))
    db.commit()
    logger.info(f"pQBL: upload completato per {doc.id} (PDF salvato)")

    _PENDING_PROVIDERS[doc.id] = provider_val
    _PENDING_LANGUAGES[doc.id] = language_val
    background_tasks.add_task(_generate_all_chunks, doc.id)

    return {"document_id": doc.id, "status": "processing", "reused": False}


@router.get("/pqbl/documents/{document_id}")
async def get_pqbl_document(document_id: str, lang: str = "it", db: Session = Depends(get_db)):
    doc = db.query(models.PqblDocument).filter(models.PqblDocument.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato.")
    questions = (
        db.query(models.PqblQuestion)
        .filter(models.PqblQuestion.document_id == document_id)
        .order_by(models.PqblQuestion.position)
        .all()
    )
    skills = []
    for q in questions:
        if q.skill not in skills:
            skills.append(q.skill)
    n_total = doc.chunks_total * QUESTIONS_PER_CHUNK
    return {
        "document_id": doc.id,
        "status": doc.status,
        "error_detail": doc.error_detail if doc.status == "error" else None,
        "filename": doc.filename,
        "language": doc.language,
        "size": doc.size,
        "n_questions": len(questions),
        "n_total": n_total,
        "chunks_total": doc.chunks_total,
        "chunks_done": doc.chunks_done,
        "skills": skills,
        "onboarding_text": resolve_text(
            lambda key, default="": _config_value(db, key, default),
            "pqbl_onboarding_text",
            lang,
            DEFAULT_PQBL_ONBOARDING_TEXT,
        ),
    }


# ---------------------------------------------------------------------------
# Sessioni
# ---------------------------------------------------------------------------
def _session_questions(db: Session, session: models.PqblSession):
    """Domande della sessione: tutte in learning; in final_test la PRIMA domanda
    di ogni skill (articolo R7)."""
    questions = (
        db.query(models.PqblQuestion)
        .filter(models.PqblQuestion.document_id == session.document_id)
        .order_by(models.PqblQuestion.position)
        .all()
    )
    if session.mode != "final_test":
        return questions
    first_by_skill = {}
    for q in questions:
        if q.skill not in first_by_skill:
            first_by_skill[q.skill] = q
    return list(first_by_skill.values())


def _get_session_or_404(db: Session, session_id: str) -> models.PqblSession:
    session = db.query(models.PqblSession).filter(models.PqblSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessione non trovata.")
    return session


@router.post("/pqbl/sessions")
async def create_pqbl_session(
    request: PqblSessionCreate,
    db: Session = Depends(get_db),
    identity: dict = Depends(auth.get_identity),
):
    if request.mode not in ("learning", "final_test"):
        raise HTTPException(status_code=400, detail="Modalità non valida (learning | final_test).")
    doc = db.query(models.PqblDocument).filter(models.PqblDocument.id == request.document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato.")
    if doc.status != "ready":
        raise HTTPException(status_code=409, detail="Il question bank non è ancora pronto.")

    session = models.PqblSession(
        id=str(uuid.uuid4()),
        document_id=doc.id,
        username=identity.get("username") or None,
        mode=request.mode,
    )
    db.add(session)
    db.commit()
    n_questions = len(_session_questions(db, session))
    return {"session_id": session.id, "mode": session.mode, "n_questions": n_questions}


@router.get("/pqbl/sessions/{session_id}/questions")
async def get_pqbl_session_questions(session_id: str, db: Session = Depends(get_db)):
    """Domande SENZA flag `correct` né feedback (anti-cheating: verifica solo
    server-side). Ordine delle opzioni rimescolato a ogni richiesta (R6)."""
    session = _get_session_or_404(db, session_id)
    questions = _session_questions(db, session)
    payload = []
    for q in questions:
        options = [{"key": o.get("key"), "text": o.get("text")} for o in (q.options or [])]
        random.shuffle(options)
        payload.append({
            "id": q.id,
            "skill": q.skill,
            "position": q.position,
            "question": q.question_text,
            "options": options,
        })
    return {"session_id": session.id, "mode": session.mode, "questions": payload}


@router.post("/pqbl/sessions/{session_id}/answer")
async def answer_pqbl_question(
    session_id: str,
    request: PqblAnswerRequest,
    db: Session = Depends(get_db),
):
    session = _get_session_or_404(db, session_id)
    if session.mode != "learning":
        raise HTTPException(status_code=400, detail="Nel test finale usa l'invio unico (/final-test).")

    question = (
        db.query(models.PqblQuestion)
        .filter(
            models.PqblQuestion.id == request.question_id,
            models.PqblQuestion.document_id == session.document_id,
        )
        .first()
    )
    if not question:
        raise HTTPException(status_code=404, detail="Domanda non trovata.")

    option = next(
        (o for o in (question.options or []) if str(o.get("key", "")).upper() == request.option_key.strip().upper()),
        None,
    )
    if not option:
        raise HTTPException(status_code=400, detail="Opzione non valida.")

    prior_attempts = (
        db.query(models.PqblAttempt)
        .filter(
            models.PqblAttempt.session_id == session.id,
            models.PqblAttempt.question_id == question.id,
        )
        .count()
    )
    attempt = models.PqblAttempt(
        session_id=session.id,
        question_id=question.id,
        selected_key=str(option.get("key")),
        correct=bool(option.get("correct")),
        first_try=(prior_attempts == 0),
    )
    db.add(attempt)
    db.commit()

    return {
        "correct": bool(option.get("correct")),
        "feedback": option.get("feedback") or "",
        "first_try": attempt.first_try,
    }


@router.post("/pqbl/sessions/{session_id}/final-test")
async def submit_pqbl_final_test(
    session_id: str,
    request: PqblFinalTestRequest,
    db: Session = Depends(get_db),
):
    """Submit unico del test finale (R7): una risposta per domanda, feedback
    solo dopo l'invio, non ripetibile."""
    session = _get_session_or_404(db, session_id)
    if session.mode != "final_test":
        raise HTTPException(status_code=400, detail="Questa sessione non è un test finale.")
    if session.finished_at is not None:
        raise HTTPException(status_code=409, detail="Il test finale è già stato completato.")

    questions = _session_questions(db, session)
    answers = {str(k): str(v).strip().upper() for k, v in (request.answers or {}).items()}

    results = []
    n_correct = 0
    for q in questions:
        selected_key = answers.get(str(q.id))
        option = None
        if selected_key:
            option = next(
                (o for o in (q.options or []) if str(o.get("key", "")).upper() == selected_key),
                None,
            )
        correct = bool(option.get("correct")) if option else False
        if correct:
            n_correct += 1
        if option:
            db.add(models.PqblAttempt(
                session_id=session.id,
                question_id=q.id,
                selected_key=str(option.get("key")),
                correct=correct,
                first_try=True,
            ))
        results.append({
            "question_id": q.id,
            "skill": q.skill,
            "question": q.question_text,
            "selected_key": option.get("key") if option else None,
            "correct": correct,
            "feedback": (option.get("feedback") or "") if option else "",
        })

    session.finished_at = datetime.now(timezone.utc)
    db.add(models.Log(
        session_id=session.id,
        action="pqbl_final_test_completed",
        details={"document_id": session.document_id, "score": n_correct, "total": len(questions)},
    ))
    db.commit()

    return {
        "session_id": session.id,
        "score": n_correct,
        "total": len(questions),
        "results": results,
    }


@router.get("/pqbl/sessions/{session_id}/summary")
async def get_pqbl_session_summary(session_id: str, db: Session = Depends(get_db)):
    """Metriche della sessione (R8): % corrette al primo tentativo, dettaglio
    per skill, tempo stimato con cap di inattività a 5 minuti."""
    session = _get_session_or_404(db, session_id)
    questions = _session_questions(db, session)
    attempts = (
        db.query(models.PqblAttempt)
        .filter(models.PqblAttempt.session_id == session.id)
        .order_by(models.PqblAttempt.created_at, models.PqblAttempt.id)
        .all()
    )

    first_try_by_question = {}
    answered = set()
    for a in attempts:
        answered.add(a.question_id)
        if a.first_try:
            first_try_by_question[a.question_id] = a.correct

    by_skill = {}
    for q in questions:
        entry = by_skill.setdefault(q.skill, {"skill": q.skill, "total": 0, "answered": 0, "first_try_correct": 0})
        entry["total"] += 1
        if q.id in answered:
            entry["answered"] += 1
        if first_try_by_question.get(q.id):
            entry["first_try_correct"] += 1

    n_first_try_correct = sum(1 for q in questions if first_try_by_question.get(q.id))

    elapsed_seconds = 0
    timestamps = [a.created_at for a in attempts if a.created_at is not None]
    for prev, curr in zip(timestamps, timestamps[1:]):
        gap = (curr - prev).total_seconds()
        elapsed_seconds += min(max(gap, 0), INACTIVITY_CAP_SECONDS)

    total = len(questions)
    all_answered = total > 0 and len(answered) >= total
    if session.mode == "learning" and all_answered and session.finished_at is None:
        session.finished_at = datetime.now(timezone.utc)
        db.add(models.Log(
            session_id=session.id,
            action="pqbl_session_completed",
            details={
                "document_id": session.document_id,
                "first_try_correct": n_first_try_correct,
                "total": total,
            },
        ))
        db.commit()

    return {
        "session_id": session.id,
        "mode": session.mode,
        "total_questions": total,
        "answered_questions": len(answered),
        "first_try_correct": n_first_try_correct,
        "first_try_pct": round(100 * n_first_try_correct / total, 1) if total else 0.0,
        "by_skill": list(by_skill.values()),
        "estimated_seconds": int(elapsed_seconds),
        "total_attempts": len(attempts),
        "finished": session.finished_at is not None,
    }


# ---------------------------------------------------------------------------
# Admin: gestione documenti/domande + analitiche (richiede gruppo admin)
# ---------------------------------------------------------------------------
@router.get("/admin/pqbl/documents")
async def admin_list_pqbl_documents(
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Tutti i documenti pQBL con conteggi (domande, sessioni, tentativi)."""
    docs = db.query(models.PqblDocument).order_by(models.PqblDocument.created_at.desc()).all()

    # Conteggi aggregati in poche query invece di N+1.
    q_counts = dict(
        db.query(models.PqblQuestion.document_id, func.count(models.PqblQuestion.id))
        .group_by(models.PqblQuestion.document_id)
        .all()
    )
    s_counts = dict(
        db.query(models.PqblSession.document_id, func.count(models.PqblSession.id))
        .group_by(models.PqblSession.document_id)
        .all()
    )

    out = []
    for doc in docs:
        out.append({
            "document_id": doc.id,
            "username": doc.username,
            "filename": doc.filename,
            "language": doc.language,
            "size": doc.size,
            "status": doc.status,
            "error_detail": doc.error_detail,
            "provider": doc.provider,
            "chunks_total": doc.chunks_total,
            "chunks_done": doc.chunks_done,
            "n_questions": int(q_counts.get(doc.id, 0)),
            "n_sessions": int(s_counts.get(doc.id, 0)),
            "created_at": doc.created_at.isoformat() if doc.created_at else None,
        })
    return {"documents": out}


@router.get("/admin/pqbl/documents/{document_id}/questions")
async def admin_get_pqbl_questions(
    document_id: str,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Domande complete (incl. flag `correct` e feedback) per review/modifica admin."""
    doc = db.query(models.PqblDocument).filter(models.PqblDocument.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato.")
    questions = (
        db.query(models.PqblQuestion)
        .filter(models.PqblQuestion.document_id == document_id)
        .order_by(models.PqblQuestion.position)
        .all()
    )
    return {
        "document_id": doc.id,
        "filename": doc.filename,
        "status": doc.status,
        "questions": [
            {
                "id": q.id,
                "skill": q.skill,
                "position": q.position,
                "question_text": q.question_text,
                "options": q.options or [],
            }
            for q in questions
        ],
    }


@router.put("/admin/pqbl/questions/{question_id}")
async def admin_update_pqbl_question(
    question_id: int,
    update: PqblQuestionUpdate,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Modifica testo/skill/opzioni di una MCQ. Le opzioni devono avere esattamente
    una risposta corretta (vincolo del metodo: MCQ a risposta singola)."""
    q = db.query(models.PqblQuestion).filter(models.PqblQuestion.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Domanda non trovata.")

    if update.question_text is not None:
        q.question_text = update.question_text
    if update.skill is not None:
        q.skill = update.skill
    if update.options is not None:
        opts = update.options
        if not isinstance(opts, list) or len(opts) < 2:
            raise HTTPException(status_code=400, detail="Servono almeno 2 opzioni.")
        n_correct = sum(1 for o in opts if isinstance(o, dict) and o.get("correct"))
        if n_correct != 1:
            raise HTTPException(status_code=400, detail="Deve esserci esattamente 1 opzione corretta.")
        q.options = [
            {
                "key": o.get("key") or "",
                "text": o.get("text") or "",
                "correct": bool(o.get("correct")),
                "feedback": o.get("feedback") or "",
            }
            for o in opts
        ]

    db.commit()
    db.refresh(q)
    return {
        "id": q.id,
        "skill": q.skill,
        "position": q.position,
        "question_text": q.question_text,
        "options": q.options or [],
    }


@router.delete("/admin/pqbl/documents/{document_id}")
async def admin_delete_pqbl_document(
    document_id: str,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Elimina documento + domande + sessioni + tentativi (no cascade FK: pulizia manuale)."""
    doc = db.query(models.PqblDocument).filter(models.PqblDocument.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato.")

    session_ids = [
        s.id for s in db.query(models.PqblSession.id)
        .filter(models.PqblSession.document_id == document_id).all()
    ]
    if session_ids:
        db.query(models.PqblAttempt).filter(
            models.PqblAttempt.session_id.in_(session_ids)
        ).delete(synchronize_session=False)
    db.query(models.PqblSession).filter(
        models.PqblSession.document_id == document_id
    ).delete(synchronize_session=False)
    db.query(models.PqblQuestion).filter(
        models.PqblQuestion.document_id == document_id
    ).delete(synchronize_session=False)
    db.delete(doc)
    db.commit()
    return {"deleted": document_id}


@router.get("/admin/pqbl/analytics")
async def admin_pqbl_analytics(
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Metriche globali pQBL: totali, % corrette al primo tentativo, dettaglio per skill."""
    n_documents = db.query(func.count(models.PqblDocument.id)).scalar() or 0
    n_questions = db.query(func.count(models.PqblQuestion.id)).scalar() or 0
    n_sessions = db.query(func.count(models.PqblSession.id)).scalar() or 0
    n_finished = db.query(func.count(models.PqblSession.id)).filter(
        models.PqblSession.finished_at.isnot(None)
    ).scalar() or 0
    n_attempts = db.query(func.count(models.PqblAttempt.id)).scalar() or 0

    first_try = db.query(models.PqblAttempt).filter(models.PqblAttempt.first_try.is_(True)).all()
    n_first_try = len(first_try)
    n_first_try_correct = sum(1 for a in first_try if a.correct)

    # Dettaglio per skill: join attempt(first_try) → question.skill.
    skill_by_qid = dict(db.query(models.PqblQuestion.id, models.PqblQuestion.skill).all())
    by_skill: dict = {}
    for a in first_try:
        skill = skill_by_qid.get(a.question_id) or "—"
        entry = by_skill.setdefault(skill, {"skill": skill, "first_try": 0, "first_try_correct": 0})
        entry["first_try"] += 1
        if a.correct:
            entry["first_try_correct"] += 1
    for entry in by_skill.values():
        entry["pct"] = round(100 * entry["first_try_correct"] / entry["first_try"], 1) if entry["first_try"] else 0.0

    return {
        "n_documents": int(n_documents),
        "n_questions": int(n_questions),
        "n_sessions": int(n_sessions),
        "n_sessions_finished": int(n_finished),
        "n_attempts": int(n_attempts),
        "first_try_correct": n_first_try_correct,
        "first_try_total": n_first_try,
        "first_try_pct": round(100 * n_first_try_correct / n_first_try, 1) if n_first_try else 0.0,
        "by_skill": sorted(by_skill.values(), key=lambda e: e["skill"]),
    }
