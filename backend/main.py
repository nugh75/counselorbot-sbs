from dotenv import load_dotenv
load_dotenv()

from contextlib import asynccontextmanager
from fastapi import BackgroundTasks, FastAPI, Depends, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import re

from . import models, schemas, auth, database
from .prompt_config import (
    ALL_CONFIG_TEXT_DEFINITIONS,
    DEFAULT_SYSTEM_PROMPT_GENERIC,
    DEFAULT_SYSTEM_PROMPT_ZTPI_FACTOR,
    DEFAULT_SYSTEM_PROMPT_ZTPI_BTP,
    DEFAULT_SYSTEM_PROMPT_SAVICKAS_INTERVIEW,
    DEFAULT_SYSTEM_PROMPT_SAVICKAS_SUMMARY,
    DEFAULT_GUIDED_STEPS,
    DEFAULT_ZTPI_GUIDED_STEPS,
    DEFAULT_SAVICKAS_GUIDED_STEPS,
    DEFAULT_GUIDED_TEXT_ZTPI_QUESTIONS_INTRO,
    DEFAULT_GUIDED_TEXT_ZTPI_CONCLUSION,
    DEFAULT_GUIDED_TEXT_SAVICKAS_QUESTIONS_INTRO,
    DEFAULT_GUIDED_TEXT_SAVICKAS_CONCLUSION,
    GUIDED_PUBLIC_UI_CONFIG_DEFINITIONS,
    GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS,
    MODE_TO_SYSTEM_PROMPT_KEY,
    SYSTEM_PROMPT_DEFAULTS,
)

# Create Database Tables
models.Base.metadata.create_all(bind=database.engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Precarica il modello Ollama in memoria all'avvio (evita cold start)
    import asyncio
    from .database import SessionLocal as _SessionLocal
    from .ai_service import AIService as _AIService

    async def _preload():
        try:
            db = _SessionLocal()
            svc = _AIService(db)
            if svc.config.get('active_provider') == 'ollama' and svc.ollama_preload_enabled:
                await asyncio.get_event_loop().run_in_executor(
                    None, svc.preload_ollama_model
                )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Preload Ollama fallito: {e}")
        finally:
            db.close()

    asyncio.create_task(_preload())
    yield


app = FastAPI(lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://0.0.0.0:3000",
        "https://counselorbot-sbs.ai4educ.org",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Semantic Dependencies
get_db = database.get_db

@app.on_event("startup")
async def startup_memory_cleanup():
    """Avvia il background task per la pulizia della memoria."""
    asyncio.create_task(_memory_cleanup_loop())

@app.on_event("startup")
def startup_event():
    import logging
    logger = logging.getLogger(__name__)
    from sqlalchemy import text as sa_text

    db = database.SessionLocal()
    try:
        # Raw SQL migration: add questionnaire_type column if not present (idempotent)
        with database.engine.connect() as conn:
            try:
                conn.execute(sa_text(
                    "ALTER TABLE guided_steps ADD COLUMN questionnaire_type VARCHAR NOT NULL DEFAULT 'QSA'"
                ))
                conn.commit()
            except Exception:
                pass  # Column already exists

        # Create initial admin user if not exists
        user = db.query(models.User).filter(models.User.username == "admin").first()
        if not user:
            hashed_password = auth.get_password_hash("admin123")
            db_user = models.User(username="admin", hashed_password=hashed_password, is_admin=True)
            db.add(db_user)
            db.commit()

        # Seed text configs (system prompts + static messages) without overwriting
        existing_configs = {cfg.key: cfg for cfg in db.query(models.Config).all()}
        changed = False
        logger.info(f"Seeding check: {len(ALL_CONFIG_TEXT_DEFINITIONS)} definitions, {len(existing_configs)} existing")
        for text_def in ALL_CONFIG_TEXT_DEFINITIONS:
            existing = existing_configs.get(text_def["key"])
            if existing is None:
                db.add(
                    models.Config(
                        key=text_def["key"],
                        value=text_def["default"],
                        description=text_def["description"],
                    )
                )
                changed = True
                logger.info(f"Seeded new config key: {text_def['key']}")
                continue

            if not (existing.value or "").strip():
                existing.value = text_def["default"]
                changed = True

            if not existing.description:
                existing.description = text_def["description"]
                changed = True

        if changed:
            db.commit()
            logger.info("Config seeding committed")

        # Seed QSA guided steps if none exist for QSA
        qsa_count = db.query(models.GuidedStep).filter(
            models.GuidedStep.questionnaire_type == "QSA"
        ).count()
        if qsa_count == 0:
            for step_def in DEFAULT_GUIDED_STEPS:
                db.add(models.GuidedStep(**{**step_def, "questionnaire_type": "QSA"}))
            db.commit()

        # Seed ZTPI guided steps if none exist for ZTPI
        ztpi_count = db.query(models.GuidedStep).filter(
            models.GuidedStep.questionnaire_type == "ZTPI"
        ).count()
        if ztpi_count == 0:
            for step_def in DEFAULT_ZTPI_GUIDED_STEPS:
                db.add(models.GuidedStep(**step_def))
            db.commit()

        # Seed Savickas guided steps if none exist for SAVICKAS
        savickas_count = db.query(models.GuidedStep).filter(
            models.GuidedStep.questionnaire_type == "SAVICKAS"
        ).count()
        if savickas_count == 0:
            for step_def in DEFAULT_SAVICKAS_GUIDED_STEPS:
                db.add(models.GuidedStep(**step_def))
            db.commit()

        # Upgrade legacy ZTPI prompt ranges if they still match old defaults.
        legacy_changed = False

        cfg_ztpi_factor = db.query(models.Config).filter(models.Config.key == "prompt_ztpi_factor").first()
        if cfg_ztpi_factor:
            factor_value = cfg_ztpi_factor.value or ""
            is_old_factor_prompt = (
                "Per T2, T3, T5: un punteggio alto (7-9) indica Forza" in factor_value
                or "Indicazioni di lettura basate su fonti:" in factor_value and "SOLO interne" not in factor_value
                or (
                    "Usa queste fasce PTB su scala 1-9:" in factor_value
                    and "Indicazioni di lettura basate su fonti:" not in factor_value
                )
            )
            if is_old_factor_prompt:
                cfg_ztpi_factor.value = DEFAULT_SYSTEM_PROMPT_ZTPI_FACTOR
                legacy_changed = True

        cfg_ztpi_btp = db.query(models.Config).filter(models.Config.key == "prompt_ztpi_btp").first()
        if cfg_ztpi_btp:
            btp_value = cfg_ztpi_btp.value or ""
            is_old_btp_prompt = (
                "T1 basso (1-3), T2 alto (7-9), T3 moderato (4-6), T4 basso (1-3), T5 alto (7-9)." in btp_value
                or "Indicazioni di lettura basate su fonti:" in btp_value and "SOLO interne" not in btp_value
                or (
                    "Usa queste fasce operative:" in btp_value
                    and "Indicazioni di lettura basate su fonti:" not in btp_value
                )
            )
            if is_old_btp_prompt:
                cfg_ztpi_btp.value = DEFAULT_SYSTEM_PROMPT_ZTPI_BTP
                legacy_changed = True

        cfg_savickas_interview = db.query(models.Config).filter(models.Config.key == "prompt_savickas_interview").first()
        if cfg_savickas_interview:
            interview_value = cfg_savickas_interview.value or ""
            if "[[AVANZA_STEP]]" not in interview_value:
                cfg_savickas_interview.value = DEFAULT_SYSTEM_PROMPT_SAVICKAS_INTERVIEW
                legacy_changed = True

        cfg_savickas_summary = db.query(models.Config).filter(models.Config.key == "prompt_savickas_summary").first()
        if cfg_savickas_summary:
            summary_value = cfg_savickas_summary.value or ""
            if "[[AVANZA_STEP]]" not in summary_value:
                cfg_savickas_summary.value = DEFAULT_SYSTEM_PROMPT_SAVICKAS_SUMMARY
                legacy_changed = True

        savickas_default_prompts_by_id = {step["id"]: step["prompt"] for step in DEFAULT_SAVICKAS_GUIDED_STEPS}
        savickas_steps = (
            db.query(models.GuidedStep)
            .filter(models.GuidedStep.questionnaire_type == "SAVICKAS")
            .all()
        )
        for step in savickas_steps:
            default_prompt = savickas_default_prompts_by_id.get(step.id)
            if not default_prompt:
                continue
            current_prompt = step.prompt or ""
            if "[[AVANZA_STEP]]" in current_prompt:
                continue
            is_legacy_savickas_prompt = (
                not current_prompt
                or "Avvio percorso Savickas" in current_prompt
                or "Intervista Savickas - domanda" in current_prompt
                or "Sintesi finale intervista Savickas" in current_prompt
            )
            if is_legacy_savickas_prompt:
                step.prompt = default_prompt
                legacy_changed = True

        ztpi_default_prompts_by_id = {step["id"]: step["prompt"] for step in DEFAULT_ZTPI_GUIDED_STEPS}
        legacy_step_snippets = {
            "ztpi-t1": [
                "fattore INVERTITO: punteggio basso (1-3) è una Forza",
                "Usa la fascia PTB su scala 1-9: ideale 2-4, vicino 1-5.",
            ],
            "ztpi-t2": [
                "punteggio alto (7-9) è una Forza, basso (1-3) è Area di crescita",
                "Usa la fascia PTB su scala 1-9: ideale 5-7, vicino 4-8.",
            ],
            "ztpi-t3": [
                "range ottimale moderato (4-6)",
                "Usa la fascia PTB su scala 1-9: ideale 7-8, vicino 6-9.",
            ],
            "ztpi-t4": [
                "fattore INVERTITO: punteggio basso (1-3) è una Forza",
                "Usa la fascia PTB su scala 1-9: ideale 1-3, vicino 1-4.",
            ],
            "ztpi-t5": [
                "punteggio alto (7-9) è una Forza, basso (1-3) è Area di crescita",
                "Usa la fascia PTB su scala 1-9: ideale 5-7, vicino 4-8.",
            ],
            "ztpi-btp": [
                "T1 basso 1-3, T2 alto 7-9, T3 moderato 4-6, T4 basso 1-3, T5 alto 7-9",
                "T1 ideale 2-4, T2 ideale 5-7, T3 ideale 7-8, T4 ideale 1-3, T5 ideale 5-7;",
            ],
        }

        for step_id, legacy_snippets in legacy_step_snippets.items():
            step = db.query(models.GuidedStep).filter(models.GuidedStep.id == step_id).first()
            if not step:
                continue
            step_prompt = step.prompt or ""
            has_new_hidden_rule = "Non esplicitare all'utente formule, conversioni o parametri tecnici." in step_prompt
            has_old_exposed_reading = (
                "Indicazione di lettura da fonte:" in step_prompt
                or "indicazioni di lettura da fonte" in step_prompt
            )
            should_upgrade_step = (
                (any(snippet in step_prompt for snippet in legacy_snippets) or has_old_exposed_reading)
                and not has_new_hidden_rule
            )
            if should_upgrade_step:
                new_prompt = ztpi_default_prompts_by_id.get(step_id)
                if new_prompt and step.prompt != new_prompt:
                    step.prompt = new_prompt
                    legacy_changed = True

        if legacy_changed:
            db.commit()
    finally:
        db.close()

# --- Auth Endpoints ---

# --- Auth ---
# Login locale RIMOSSO: l'autenticazione avviene al bordo tramite ai4auth
# (forward-auth, header Remote-*). Vedi backend/auth.py.

@app.get("/auth/me")
async def read_me(request: Request):
    """Identità dell'utente corrente verificata tramite ai4auth."""
    return await auth.get_identity(request)

# --- Admin Config Endpoints ---

@app.get("/admin/logs", response_model=List[schemas.LogResponse])
async def read_logs(skip: int = 0, limit: int = 100, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    logs = db.query(models.Log).order_by(models.Log.timestamp.desc()).offset(skip).limit(limit).all()
    return logs

@app.get("/admin/config", response_model=List[schemas.ConfigResponse])
async def read_config(current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    configs = db.query(models.Config).all()
    return configs

@app.post("/admin/config", response_model=schemas.ConfigResponse)
async def create_or_update_config(config: schemas.ConfigCreate, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    db_config = db.query(models.Config).filter(models.Config.key == config.key).first()
    if db_config:
        db_config.value = config.value
        db_config.description = config.description
    else:
        db_config = models.Config(key=config.key, value=config.value, description=config.description)
        db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return db_config

@app.get("/admin/models")
async def list_provider_models(provider: str = None, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Modelli realmente serviti dal provider (live). Vuoto se non interrogabile/irraggiungibile."""
    svc = AIService(db)
    return {"provider": provider or svc.config.get('active_provider', 'openai'),
            "models": svc.list_models(provider)}

@app.get("/admin/config/env-status")
async def get_env_override_status(current_user: models.User = Depends(auth.get_current_active_admin)):
    """Restituisce quali chiavi config sono sovrascritte da variabili d'ambiente."""
    import os
    from .ai_service import ENV_KEY_MAP
    return {
        db_key: any(bool(os.environ.get(v)) for v in env_vars)
        for db_key, env_vars in ENV_KEY_MAP.items()
    }

# --- Admin Guided Steps CRUD ---

@app.get("/admin/guided-steps", response_model=List[schemas.GuidedStepResponse])
async def admin_list_guided_steps(current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    return db.query(models.GuidedStep).order_by(models.GuidedStep.sort_order).all()

@app.post("/admin/guided-steps", response_model=schemas.GuidedStepResponse)
async def admin_create_guided_step(step: schemas.GuidedStepCreate, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    existing = db.query(models.GuidedStep).filter(models.GuidedStep.id == step.id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Step with id '{step.id}' already exists")
    db_step = models.GuidedStep(**step.model_dump())
    db.add(db_step)
    db.commit()
    db.refresh(db_step)
    return db_step

@app.put("/admin/guided-steps/{step_id}", response_model=schemas.GuidedStepResponse)
async def admin_update_guided_step(step_id: str, update: schemas.GuidedStepUpdate, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    db_step = db.query(models.GuidedStep).filter(models.GuidedStep.id == step_id).first()
    if not db_step:
        raise HTTPException(status_code=404, detail="Step not found")
    update_data = update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_step, field, value)
    db.commit()
    db.refresh(db_step)
    return db_step

@app.delete("/admin/guided-steps/{step_id}")
async def admin_delete_guided_step(step_id: str, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    db_step = db.query(models.GuidedStep).filter(models.GuidedStep.id == step_id).first()
    if not db_step:
        raise HTTPException(status_code=404, detail="Step not found")
    db.delete(db_step)
    db.commit()
    return {"status": "success", "message": f"Step '{step_id}' deleted"}

@app.patch("/admin/guided-steps/reorder")
async def admin_reorder_guided_steps(items: List[schemas.ReorderItem], current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    for item in items:
        db_step = db.query(models.GuidedStep).filter(models.GuidedStep.id == item.id).first()
        if db_step:
            db_step.sort_order = item.sort_order
    db.commit()
    return {"status": "success"}

# --- Survey Endpoints ---

@app.post("/survey", response_model=schemas.SurveyResponseSchema)
async def submit_survey(survey: schemas.SurveyCreate, db: Session = Depends(get_db)):
    """Submit an anonymous survey response (public endpoint)"""
    db_survey = models.SurveyResponse(**survey.model_dump())
    db.add(db_survey)
    db.commit()
    db.refresh(db_survey)
    return db_survey


@app.post("/strategy-feedback")
async def submit_strategy_feedback(feedback: schemas.StrategyFeedbackCreate, db: Session = Depends(get_db)):
    """Registra un voto anonimo solo per strategie editorialmente approvate."""
    valid_ids = strategy_memory.approved_ids()
    accepted = [strategy_id for strategy_id in feedback.strategy_ids if strategy_id in valid_ids]
    if not accepted:
        raise HTTPException(status_code=400, detail="No approved strategy identifiers supplied")
    for strategy_id in accepted:
        db.add(models.StrategyFeedback(
            strategy_id=strategy_id,
            questionnaire_type=feedback.questionnaire_type,
            phase=feedback.phase,
            language=feedback.language,
            helpful=feedback.helpful,
        ))
    db.commit()
    return {"status": "success", "recorded": len(accepted)}


@app.get("/admin/surveys", response_model=List[schemas.SurveyResponseSchema])
async def get_surveys(skip: int = 0, limit: int = 100, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Get all survey responses (admin only)"""
    surveys = db.query(models.SurveyResponse).order_by(models.SurveyResponse.submitted_at.desc()).offset(skip).limit(limit).all()
    return surveys

@app.delete("/admin/survey/{survey_id}")
async def delete_survey(survey_id: int, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Delete a survey response (admin only)"""
    survey = db.query(models.SurveyResponse).filter(models.SurveyResponse.id == survey_id).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    db.delete(survey)
    db.commit()
    return {"status": "success", "message": "Survey deleted"}


@app.get("/admin/strategy-feedback")
async def strategy_feedback_summary(current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Aggregati anonimi utili alla revisione editoriale delle strategie."""
    totals = {}
    for feedback in db.query(models.StrategyFeedback).all():
        row = totals.setdefault(feedback.strategy_id, {"strategy_id": feedback.strategy_id, "positive": 0, "negative": 0})
        row["positive" if feedback.helpful else "negative"] += 1
    return sorted(totals.values(), key=lambda row: (row["positive"] - row["negative"]), reverse=True)


# --- Chat / QSA Endpoints ---

from .ai_service import AIService
from .memory_service import session_memory
from .strategy_memory import strategy_memory
import uuid
import logging
import asyncio

logger = logging.getLogger(__name__)


async def _memory_cleanup_loop(interval_seconds: int = 600):
    """Background task: pulisce sessioni scadute ogni 10 minuti."""
    while True:
        await asyncio.sleep(interval_seconds)
        removed = session_memory.cleanup_expired()
        if removed:
            logger.info(f"Memory cleanup: rimosse {removed} sessioni scadute")


def _ensure_questionnaire_guided_steps(db: Session, questionnaire_type: str) -> None:
    """Ensure default guided steps exist for the requested questionnaire."""
    defaults_by_type = {
        "QSA": DEFAULT_GUIDED_STEPS,
        "ZTPI": DEFAULT_ZTPI_GUIDED_STEPS,
        "SAVICKAS": DEFAULT_SAVICKAS_GUIDED_STEPS,
    }

    if questionnaire_type not in defaults_by_type:
        return

    defaults = defaults_by_type[questionnaire_type]

    existing_ids = {
        row.id
        for row in (
            db.query(models.GuidedStep.id)
            .filter(models.GuidedStep.questionnaire_type == questionnaire_type)
            .all()
        )
    }

    changed = False
    for step_def in defaults:
        if step_def["id"] in existing_ids:
            continue
        payload = dict(step_def)
        payload["questionnaire_type"] = questionnaire_type
        db.add(models.GuidedStep(**payload))
        changed = True

    if changed:
        db.commit()


@app.get("/qsa/guided-ui-texts")
async def get_guided_ui_texts(questionnaire_type: str = "QSA", db: Session = Depends(get_db)):
    """Public endpoint with guided-chat UI texts/labels and step definitions.

    Pass ?questionnaire_type=ZTPI or SAVICKAS for dedicated guided paths.
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
    if questionnaire_type == "ZTPI":
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


class ChatRequest(schemas.BaseModel):
    message: str = ""
    mode: str = "generic"
    session_id: Optional[str] = None
    scores_context: str = ""  # Formatted QSA scores from frontend
    questionnaire_type: Optional[str] = None
    phase: Optional[str] = None
    use_phase_prompt: bool = False
    language: Optional[str] = None  # 'it' (default), 'en', 'es', 'fr', 'de', 'sv'
    max_tokens: Optional[int] = None
    memory_message: Optional[str] = None  # Solo testo reale dell'utente, senza istruzioni interne


def _clamp_max_tokens(value: Optional[int], default: Optional[int] = None) -> Optional[int]:
    if value is None:
        return default
    return max(128, min(int(value), 8192))


# Con il thinking attivo il reasoning consuma il budget di output: serve headroom
# extra perche' la risposta vera abbia spazio dopo il ragionamento.
# I modelli reasoning (es. qwen3) producono ragionamenti lunghi: budget generoso.
_THINKING_MIN_OUTPUT_TOKENS = 6000


def _apply_thinking_token_headroom(max_tokens: Optional[int], ai_service: "AIService") -> Optional[int]:
    if ai_service.disable_thinking:
        return max_tokens
    if max_tokens is None:
        return _THINKING_MIN_OUTPUT_TOKENS
    return max(max_tokens, _THINKING_MIN_OUTPUT_TOKENS)


# Lingue supportate per la risposta dell'AI (codice -> nome inglese, nome nativo)
SUPPORTED_AI_LANGUAGES = {
    "it": ("Italian", "italiano"),
    "en": ("English", "English"),
    "es": ("Spanish", "español"),
    "fr": ("French", "français"),
    "de": ("German", "Deutsch"),
    "sv": ("Swedish", "svenska"),
}

_QSA_FACTOR_NAMES = {
    "it": {
        "C1": "Strategie elaborative", "C2": "Autoregolazione", "C3": "Disorientamento",
        "C4": "Disponibilità alla collaborazione", "C5": "Organizzatori semantici",
        "C6": "Difficoltà di concentrazione", "C7": "Autointerrogazione",
        "A1": "Ansietà di base", "A2": "Volizione",
        "A3": "Attribuzione a cause controllabili", "A4": "Attribuzione a cause incontrollabili",
        "A5": "Mancanza di perseveranza", "A6": "Percezione di competenza",
        "A7": "Interferenze emotive",
    },
    "en": {
        "C1": "Elaborative strategies", "C2": "Self-regulation", "C3": "Disorientation",
        "C4": "Willingness to collaborate", "C5": "Semantic organisers",
        "C6": "Concentration difficulties", "C7": "Self-questioning",
        "A1": "Baseline anxiety", "A2": "Volition",
        "A3": "Attribution to controllable causes", "A4": "Attribution to uncontrollable causes",
        "A5": "Lack of perseverance", "A6": "Perceived competence",
        "A7": "Emotional interference",
    },
    "es": {
        "C1": "Estrategias elaborativas", "C2": "Autorregulación", "C3": "Desorientación",
        "C4": "Disposición a colaborar", "C5": "Organizadores semánticos",
        "C6": "Dificultades de concentración", "C7": "Autointerrogación",
        "A1": "Ansiedad de base", "A2": "Volición",
        "A3": "Atribución a causas controlables", "A4": "Atribución a causas incontrolables",
        "A5": "Falta de perseverancia", "A6": "Percepción de competencia",
        "A7": "Interferencias emocionales",
    },
    "fr": {
        "C1": "Stratégies d'élaboration", "C2": "Autorégulation", "C3": "Désorientation",
        "C4": "Disposition à collaborer", "C5": "Organisateurs sémantiques",
        "C6": "Difficultés de concentration", "C7": "Auto-questionnement",
        "A1": "Anxiété de base", "A2": "Volition",
        "A3": "Attribution à des causes contrôlables", "A4": "Attribution à des causes incontrôlables",
        "A5": "Manque de persévérance", "A6": "Perception de compétence",
        "A7": "Interférences émotionnelles",
    },
    "de": {
        "C1": "Elaborationsstrategien", "C2": "Selbstregulation", "C3": "Desorientierung",
        "C4": "Kooperationsbereitschaft", "C5": "Semantische Organisatoren",
        "C6": "Konzentrationsschwierigkeiten", "C7": "Selbstbefragung",
        "A1": "Grundangst", "A2": "Volition",
        "A3": "Attribution auf kontrollierbare Ursachen", "A4": "Attribution auf unkontrollierbare Ursachen",
        "A5": "Mangelnde Ausdauer", "A6": "Kompetenzwahrnehmung",
        "A7": "Emotionale Interferenzen",
    },
    "sv": {
        "C1": "Bearbetningsstrategier", "C2": "Självreglering", "C3": "Desorientering",
        "C4": "Samarbetsvilja", "C5": "Semantiska organisatörer",
        "C6": "Koncentrationssvårigheter", "C7": "Självfrågande",
        "A1": "Grundångest", "A2": "Vilja",
        "A3": "Attribution till kontrollerbara orsaker", "A4": "Attribution till okontrollerbara orsaker",
        "A5": "Brist på uthållighet", "A6": "Upplevd kompetens",
        "A7": "Emotionella störningar",
    },
}


# Fattori QSA invertiti: punteggio basso (1-3) = Forza, alto (7-9) = Area di crescita.
# Allineato a frontend questionnaires.ts -> QUESTIONNAIRES.QSA.invertedFactors.
_QSA_INVERTED_CODES = ("C3", "C6", "A1", "A4", "A5", "A7")


def _apply_language_directive(system_prompt: str, language: Optional[str]) -> str:
    """Aggiunge in coda al system prompt l'istruzione di rispondere nella lingua scelta.
    'it' (o lingua sconosciuta) = nessuna modifica: i prompt base sono in italiano."""
    if not language or language == "it" or language not in SUPPORTED_AI_LANGUAGES:
        return system_prompt
    eng, native = SUPPORTED_AI_LANGUAGES[language]
    return (
        f"{system_prompt}\n\n"
        f"[LANGUAGE] You MUST write your ENTIRE response in {eng} ({native}), "
        f"regardless of the language of the instructions or scores above. "
        f"Translate any fixed phrases, headings and labels into {eng} as well. "
        f"Also produce your internal reasoning/thinking in {eng} ({native}). "
        f"Do NOT mix languages."
    )

def _is_qsa(questionnaire_type: Optional[str]) -> bool:
    return (questionnaire_type or "").upper() == "QSA"


def _qsa_factor_names(language: Optional[str]) -> dict[str, str]:
    return _QSA_FACTOR_NAMES.get(language or "it", _QSA_FACTOR_NAMES["it"])


def _annotate_qsa_factor_codes(text: str, language: Optional[str], progressive: bool = False) -> str:
    """Impedisce di presentare codici QSA privi del relativo nome."""
    if not text:
        return text
    annotated = text
    for code, name in _qsa_factor_names(language).items():
        # Canonicalizza anche un nome gia prodotto dal modello.
        annotated = re.sub(rf"\b{code}\b\s*\([^)]*\)", f"{code} ({name})", annotated)
        if progressive:
            # Durante lo stream la parentesi puo essere ancora incompleta:
            # mostriamo subito l'etichetta completa senza esporre una sigla sola.
            annotated = re.sub(rf"\b{code}\b\s*\([^)]*$", f"{code} ({name})", annotated)
        annotated = re.sub(rf"\b{code}\b(?!\s*\()", f"{code} ({name})", annotated)
    return annotated


def _apply_qsa_factor_directive(system_prompt: str, questionnaire_type: str, language: Optional[str]) -> str:
    if not _is_qsa(questionnaire_type):
        return system_prompt
    names = _qsa_factor_names(language)
    examples = ", ".join(f"{code} ({name})" for code, name in names.items())
    inverted = ", ".join(
        f"{code} ({names[code]})" for code in _QSA_INVERTED_CODES if code in names
    )
    return (
        f"{system_prompt}\n\n"
        "[FACTOR LABELS] In ogni risposta rivolta allo studente, non scrivere mai "
        "una sigla di fattore QSA isolata. Ogni sigla deve essere immediatamente "
        "accompagnata dal nome esteso, nella forma `C2 (Autoregolazione)`. "
        f"Riferimento obbligatorio: {examples}.\n\n"
        "[FATTORI INVERTITI] Scala 1-9. Per la maggioranza dei fattori vale: "
        "1-3 = Area di crescita, 4-6 = Adeguato, 7-9 = Forza. "
        f"MA i seguenti fattori sono INVERTITI: {inverted}. "
        "Per QUESTI fattori la lettura si ribalta: 1-3 = Forza, 4-6 = Normale, "
        "7-9 = Area di crescita (punteggio alto = problema da migliorare, NON un punto di forza). "
        "Regola assoluta: non leggere mai 'alto = forza' in modo automatico; "
        "applica sempre l'inversione ai fattori elencati. "
        "Esempio: Disorientamento o Difficoltà di concentrazione a 7-9 è un'Area di crescita, "
        "non un punto di forza."
    )


def _student_visible_response(
    text: str,
    questionnaire_type: str,
    language: Optional[str],
    sanitize_ztpi: bool,
) -> str:
    if sanitize_ztpi:
        return _sanitize_ztpi_user_text(text)
    if _is_qsa(questionnaire_type):
        return _annotate_qsa_factor_codes(text, language, progressive=True)
    return text


_GUIDED_NO_GREETING_SUFFIX = " NON iniziare con saluti. Vai direttamente all'analisi."

# Modalità discorsive: domande di approfondimento dello studente dentro uno step.
# Devono usare il prompt mode-based anche se `phase` punta a uno step di analisi.
_CONVERSATIONAL_MODES = {"factor-qa"}

_ZTPI_FACTOR_NAME_BY_CODE = {
    "T1": "Passato Negativo",
    "T2": "Passato Positivo",
    "T3": "Presente Edonistico",
    "T4": "Presente Fatalistico",
    "T5": "Futuro",
}


def _sanitize_ztpi_user_text(text: str) -> str:
    """Rende il testo utente ZTPI privo di sigle tecniche."""
    if not text:
        return text

    cleaned = text

    # Prima elimina forme duplicate tipo "T3 (Presente Edonistico)".
    for code, name in _ZTPI_FACTOR_NAME_BY_CODE.items():
        cleaned = re.sub(
            rf"\b{code}\s*\(\s*{re.escape(name)}\s*\)",
            name,
            cleaned,
            flags=re.IGNORECASE,
        )

    # Sostituisce i codici fattore con il nome completo.
    for code, name in _ZTPI_FACTOR_NAME_BY_CODE.items():
        cleaned = re.sub(rf"\b{code}\b", name, cleaned)

    # Sostituisce sigle tecniche residue con formulazioni estese.
    cleaned = re.sub(
        r"\bZimbardo Time Perspective Inventory\s*\(\s*ZTPI\s*\)",
        "prospettiva temporale di Zimbardo",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\bProfilo Temporale Bilanciato\s*\(\s*PTB\s*\)",
        "profilo temporale equilibrato",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\bprofilo temporale bilanciato\b", "profilo temporale equilibrato", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bPTB\b", "profilo temporale equilibrato", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bDBTP-r?\b", "distanza dal profilo temporale equilibrato", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bZTPI\b", "prospettiva temporale", cleaned, flags=re.IGNORECASE)

    # Normalizza eventuali ripetizioni create dalle sostituzioni.
    for name in _ZTPI_FACTOR_NAME_BY_CODE.values():
        cleaned = re.sub(
            rf"{re.escape(name)}\s*\(\s*{re.escape(name)}\s*\)",
            name,
            cleaned,
            flags=re.IGNORECASE,
        )

    cleaned = re.sub(r"(profilo temporale equilibrato)\s*\([^)]*\)", r"\1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\(\s*profilo temporale equilibrato\s*\)", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    cleaned = re.sub(r"\s+([,.;:])", r"\1", cleaned)
    return cleaned.strip()


def _sanitize_ztpi_step_label(label: str) -> str:
    """Pulisce le etichette step ZTPI rimuovendo prefissi con codici tecnici."""
    if not label:
        return label
    cleaned = re.sub(r"\bT[1-5]\b\s*-\s*", "", label)
    cleaned = re.sub(r"\bprofilo temporale bilanciato\b", "Profilo Temporale Equilibrato", cleaned, flags=re.IGNORECASE)
    cleaned = _sanitize_ztpi_user_text(cleaned)
    cleaned = re.sub(r"\bprofilo temporale equilibrato\b", "Profilo Temporale Equilibrato", cleaned, flags=re.IGNORECASE)
    return cleaned


def _should_sanitize_ztpi_text(mode: Optional[str], phase: Optional[str]) -> bool:
    if mode in {"ztpi-factor", "ztpi-btp"}:
        return True
    if phase and phase.startswith("ztpi-"):
        return True
    return False


def _resolve_system_prompt(ai_service: AIService, mode: str, phase: Optional[str], db: Session):
    """Resolve system prompt key/value with guided-phase override support."""
    # Questions phase has its own system prompt
    if phase in GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS:
        guided_system = GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS[phase]
        guided_key = guided_system["key"]
        return guided_key, ai_service.config.get(
            guided_key,
            guided_system.get("default", ai_service.config.get("prompt_generic", DEFAULT_SYSTEM_PROMPT_GENERIC)),
        )

    # Follow-up Q&A durante uno step: prompt discorsivo, NON ri-genera l'analisi.
    # Va onorato anche quando `phase` punta a uno step di analisi, altrimenti il
    # ramo sottostante userebbe il prompt di analisi (tabella + tutti i fattori).
    if mode in _CONVERSATIONAL_MODES:
        prompt_key = MODE_TO_SYSTEM_PROMPT_KEY.get(mode, "prompt_generic")
        base_prompt = ai_service.config.get(
            prompt_key, SYSTEM_PROMPT_DEFAULTS.get(prompt_key, DEFAULT_SYSTEM_PROMPT_GENERIC)
        )
        if _GUIDED_NO_GREETING_SUFFIX.strip() not in base_prompt:
            base_prompt = base_prompt + _GUIDED_NO_GREETING_SUFFIX
        return prompt_key, base_prompt

    # For guided analysis steps, look up system_prompt_mode from the step
    if phase:
        step = db.query(models.GuidedStep).filter(models.GuidedStep.id == phase).first()
        if step:
            prompt_key = MODE_TO_SYSTEM_PROMPT_KEY.get(step.system_prompt_mode, "prompt_generic")
            base_prompt = ai_service.config.get(
                prompt_key,
                SYSTEM_PROMPT_DEFAULTS.get(prompt_key, DEFAULT_SYSTEM_PROMPT_GENERIC),
            )
            # Append anti-greeting instruction if not already present (handles existing DB values)
            if _GUIDED_NO_GREETING_SUFFIX.strip() not in base_prompt:
                base_prompt = base_prompt + _GUIDED_NO_GREETING_SUFFIX
            return prompt_key, base_prompt

    # Fallback: mode-based system prompt
    prompt_key = MODE_TO_SYSTEM_PROMPT_KEY.get(mode, "prompt_generic")
    return prompt_key, ai_service.config.get(
        prompt_key,
        SYSTEM_PROMPT_DEFAULTS.get(prompt_key, DEFAULT_SYSTEM_PROMPT_GENERIC),
    )


def _resolve_user_message_for_chat(ai_service: AIService, request: ChatRequest, db: Session):
    """Resolve the effective user message, optionally loading a guided-step prompt from DB."""
    if request.use_phase_prompt:
        if not request.phase:
            raise HTTPException(status_code=400, detail="phase is required when use_phase_prompt=true")

        # Load prompt from guided_steps table
        step = db.query(models.GuidedStep).filter(models.GuidedStep.id == request.phase).first()
        if not step:
            raise HTTPException(status_code=400, detail=f"Unsupported guided phase: {request.phase}")

        return step.prompt, f"guided_step:{step.id}"

    return request.message, None

def _update_markdown_memory_background(
    session_id: str, effective_message: str, response_content: str,
    step_label: str, is_first_step: bool, previous_summary: str = "",
):
    """Compat legacy: aggiorna la memoria Markdown senza chiamare il modello."""
    try:
        session_memory.record_interaction(
            session_id,
            user_message=effective_message,
            bot_response=response_content,
            step_label=step_label,
            completed_step=bool(step_label),
        )
        logger.info(f"Session {session_id}: memoria Markdown aggiornata")
    except Exception as e:
        logger.error(f"Errore aggiornamento memoria Markdown per session {session_id}: {e}")


def _retrieved_context(
    session_id: str,
    request: ChatRequest,
    questionnaire_type: str,
    query: str,
) -> tuple[str, List[str]]:
    # Follow-up discorsivo: NON re-iniettare i punteggi completi dalla memoria,
    # altrimenti il modello ri-analizza tutto il profilo (tabella + altri fattori).
    # Il chiarimento deve commentare solo quanto già emerso nella conversazione.
    include_scores = not bool(request.scores_context) and request.mode not in _CONVERSATIONAL_MODES
    memory = session_memory.get_relevant_context(
        session_id,
        query=query,
        include_scores=include_scores,
    )
    strategies = strategy_memory.retrieve(
        questionnaire_type=questionnaire_type,
        phase=request.phase or "",
        query=query,
        language=request.language or "it",
    )
    strategy_context = strategy_memory.render_context(strategies)
    sections = [section for section in (memory, strategy_context) if section]
    return "\n\n".join(sections), [strategy["id"] for strategy in strategies]


@app.post("/chat")
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
        _annotate_qsa_factor_codes(request.scores_context, request.language)
        if _is_qsa(questionnaire_type) else request.scores_context
    )
    model_message = (
        _annotate_qsa_factor_codes(effective_message, request.language)
        if _is_qsa(questionnaire_type) else effective_message
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
    response_content = ai_service.get_response(
        full_message, system_prompt, request.mode,
        conversation_summary=conversation_summary,
        max_tokens=max_tokens,
    )
    if _should_sanitize_ztpi_text(request.mode, request.phase):
        response_content = _sanitize_ztpi_user_text(response_content)
    elif _is_qsa(questionnaire_type):
        response_content = _annotate_qsa_factor_codes(response_content, request.language)

    if _should_sanitize_ztpi_text(request.mode, request.phase):
        step_label = _sanitize_ztpi_step_label(step_label)

    background_tasks.add_task(
        _update_markdown_memory_background,
        session_id, request.memory_message if request.memory_message is not None else request.message, response_content,
        step_label, is_first_step, conversation_summary,
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
            "conversation_summary_length": len(conversation_summary),
        }
    )
    db.add(log_entry)
    db.commit()

    return {"response": response_content, "session_id": session_id, "strategy_ids": strategy_ids}


@app.post("/chat/stream")
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
    import threading

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
        _annotate_qsa_factor_codes(request.scores_context, request.language)
        if _is_qsa(questionnaire_type) else request.scores_context
    )
    model_message = (
        _annotate_qsa_factor_codes(effective_message, request.language)
        if _is_qsa(questionnaire_type) else effective_message
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

            # Memoria Markdown in un thread separato: nessuna chiamata AI extra.
            threading.Thread(
                target=_update_markdown_memory_background,
                args=(session_id, request.memory_message if request.memory_message is not None else request.message, response_content,
                      step_label, is_first_step, conversation_summary),
                daemon=True,
            ).start()

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

@app.post("/chat/message")
async def chat_message(message: str, session_id: str, mode: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    # 1. Retrieve Configuration and System Prompt based on Mode
    ai_service = AIService(db)

    prompt_key = MODE_TO_SYSTEM_PROMPT_KEY.get(mode, "prompt_generic")
    system_prompt = ai_service.config.get(
        prompt_key,
        SYSTEM_PROMPT_DEFAULTS.get(prompt_key, DEFAULT_SYSTEM_PROMPT_GENERIC),
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

    # 4. Aggiorna memoria Markdown in BACKGROUND (nessuna chiamata AI extra)
    background_tasks.add_task(
        _update_markdown_memory_background,
        session_id, message, response_content, "", False, conversation_summary,
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
            "conversation_summary_length": len(conversation_summary),
        }
    )
    db.add(log_entry)
    db.commit()

    return {"response": response_content}

# --- Memory debug/reset endpoints ---

@app.get("/memory/status/{session_id}")
async def memory_status(session_id: str):
    """Restituisce la dimensione della memoria Markdown per la sessione."""
    memory = session_memory.get_summary(session_id)
    return {
        "session_id": session_id,
        "memory_chars": len(memory),
        "memory_blocks": len(memory.split("\n\n")) if memory else 0,
        "preview": memory[:200] if memory else "",
    }

@app.delete("/memory/{session_id}")
async def memory_reset(session_id: str):
    """Resetta manualmente la memoria conversazionale per la sessione."""
    session_memory.clear(session_id)
    logger.info(f"Session {session_id}: memoria resettata via API")
    return {"status": "cleared", "session_id": session_id}


class QsaAuditRequest(schemas.BaseModel):
    scores: dict
    session_id: str

@app.post("/qsa/audit")
async def audit_qsa(request: QsaAuditRequest, db: Session = Depends(get_db)):
    # Log QSA Completion
    log_entry = models.Log(
        session_id=request.session_id,
        action="qsa_completed",
        details={"scores": request.scores}
    )
    db.add(log_entry)
    db.commit()
    return {"status": "ok"}

# --- Vision / Upload Endpoints ---
from fastapi import UploadFile, File
import shutil
import subprocess
import json
import os
import sys

@app.post("/qsa/upload")
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


# Text-to-Speech Endpoint using edge-tts
import edge_tts
import io
from fastapi.responses import StreamingResponse

class TTSRequest(schemas.BaseModel):
    text: str
    voice: str = "it-IT-IsabellaNeural"  # Italian female voice

def strip_markdown(text: str) -> str:
    """Remove markdown formatting for cleaner TTS"""
    text = re.sub(r'#{1,6}\s*', '', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
    text = re.sub(r'\*([^*]+)\*', r'\1', text)
    text = re.sub(r'---+', '', text)
    text = re.sub(r'^[\-\*]\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

@app.post("/tts")
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
