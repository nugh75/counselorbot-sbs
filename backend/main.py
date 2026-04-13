from dotenv import load_dotenv
load_dotenv()

from contextlib import asynccontextmanager
from fastapi import BackgroundTasks, FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from datetime import timedelta
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
            if svc.config.get('active_provider') == 'ollama':
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

@app.post("/token", response_model=schemas.Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me", response_model=schemas.User)
async def read_users_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user

@app.post("/register", response_model=schemas.User)
async def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = auth.get_password_hash(user.password)
    db_user = models.User(username=user.username, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

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

# --- Chat / QSA Endpoints ---

from .ai_service import AIService
from .memory_service import session_memory
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
    phase: Optional[str] = None
    use_phase_prompt: bool = False


_GUIDED_NO_GREETING_SUFFIX = (
    " Sei in una sequenza di analisi strutturata già avviata: NON usare saluti iniziali "
    "(es. 'Ciao!', 'Ottima idea', 'Benvenuto'). Inizia direttamente con l'analisi richiesta."
)

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

def _generate_summary_background(
    session_id: str, effective_message: str, response_content: str,
    step_label: str, is_first_step: bool,
):
    """Background task: genera riassunto e aggiorna la memoria (usa propria sessione DB)."""
    if is_first_step:
        # Il primo step non ha contesto precedente, skip summary
        return
    db = database.SessionLocal()
    try:
        ai_service = AIService(db)
        summary_chunk = ai_service.generate_summary(effective_message, response_content, step_label=step_label)
        session_memory.append_summary(session_id, summary_chunk)
        logger.info(f"Session {session_id}: riassunto aggiornato ({len(session_memory.get_summary(session_id))} chars)")
    except Exception as e:
        logger.error(f"Errore generazione riassunto per session {session_id}: {e}")
    finally:
        db.close()


@app.post("/chat")
async def chat(request: ChatRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    session_id = request.session_id or str(uuid.uuid4())

    # 1. Retrieve Configuration and System Prompt based on Mode
    ai_service = AIService(db)

    prompt_key, system_prompt = _resolve_system_prompt(ai_service, request.mode, request.phase, db)
    effective_message, phase_prompt_key = _resolve_user_message_for_chat(ai_service, request, db)

    # 1b. Reset memoria se inizia una nuova analisi guidata (primo step)
    is_first_step = False
    if request.use_phase_prompt and request.phase:
        step = db.query(models.GuidedStep).filter(models.GuidedStep.id == request.phase).first()
        if step:
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

    # 2. Build the full message including student's QSA profile
    if request.scores_context:
        full_message = f"{request.scores_context}\n\nDOMANDA DELLO STUDENTE:\n{effective_message}"
    else:
        full_message = effective_message

    # 3. Recupera il riassunto conversazionale accumulato
    conversation_summary = session_memory.get_summary(session_id)
    if _should_sanitize_ztpi_text(request.mode, request.phase):
        conversation_summary = _sanitize_ztpi_user_text(conversation_summary)

    # 4. Get AI Response (con contesto conversazionale)
    response_content = ai_service.get_response(
        full_message, system_prompt, request.mode,
        conversation_summary=conversation_summary
    )
    if _should_sanitize_ztpi_text(request.mode, request.phase):
        response_content = _sanitize_ztpi_user_text(response_content)

    # 5. Genera riassunto in BACKGROUND (non blocca la risposta)
    step_label = ""
    if request.phase:
        step = db.query(models.GuidedStep).filter(models.GuidedStep.id == request.phase).first()
        step_label = step.label if step else request.phase
    if _should_sanitize_ztpi_text(request.mode, request.phase):
        step_label = _sanitize_ztpi_step_label(step_label)

    background_tasks.add_task(
        _generate_summary_background,
        session_id, effective_message, response_content,
        step_label, is_first_step,
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

    return {"response": response_content, "session_id": session_id}

@app.post("/chat/message")
async def chat_message(message: str, session_id: str, mode: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    # 1. Retrieve Configuration and System Prompt based on Mode
    ai_service = AIService(db)

    prompt_key = MODE_TO_SYSTEM_PROMPT_KEY.get(mode, "prompt_generic")
    system_prompt = ai_service.config.get(
        prompt_key,
        SYSTEM_PROMPT_DEFAULTS.get(prompt_key, DEFAULT_SYSTEM_PROMPT_GENERIC),
    )

    # 2. Recupera il riassunto conversazionale accumulato
    conversation_summary = session_memory.get_summary(session_id)
    if _should_sanitize_ztpi_text(mode, None):
        conversation_summary = _sanitize_ztpi_user_text(conversation_summary)

    # 3. Get AI Response (con contesto conversazionale)
    response_content = ai_service.get_response(
        message, system_prompt, mode,
        conversation_summary=conversation_summary
    )
    if _should_sanitize_ztpi_text(mode, None):
        response_content = _sanitize_ztpi_user_text(response_content)

    # 4. Genera riassunto in BACKGROUND
    background_tasks.add_task(
        _generate_summary_background,
        session_id, message, response_content, "", False,
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
