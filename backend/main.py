from dotenv import load_dotenv
load_dotenv()

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models, auth, database
from .prompt_config import (
    ALL_CONFIG_TEXT_DEFINITIONS,
    DEFAULT_SYSTEM_PROMPT_ZTPI_FACTOR,
    DEFAULT_SYSTEM_PROMPT_ZTPI_BTP,
    DEFAULT_SYSTEM_PROMPT_SAVICKAS_INTERVIEW,
    DEFAULT_SYSTEM_PROMPT_SAVICKAS_SUMMARY,
    DEFAULT_GUIDED_STEPS,
    DEFAULT_QSAR_GUIDED_STEPS,
    DEFAULT_ZTPI_GUIDED_STEPS,
    DEFAULT_SAVICKAS_GUIDED_STEPS,
    DEFAULT_QPCS_GUIDED_STEPS,
    DEFAULT_QPCC_GUIDED_STEPS,
    DEFAULT_QAP_GUIDED_STEPS,
)

# Logica/helper estratti (vedi chat_logic.py); router in routes/.
from .chat_logic import _memory_cleanup_loop
from .routes import admin as admin_routes
from .routes import survey as survey_routes
from .routes import chat as chat_routes
from .routes import memory as memory_routes

# Re-export per retro-compatibilità (es. smoke test che importa da backend.main)
from .ai_service import AIService, AIError  # noqa: F401
from .chat_logic import (  # noqa: F401
    _is_qsa,
    _is_strategy_questionnaire,
    _clamp_max_tokens,
    _should_sanitize_ztpi_text,
    strip_markdown,
)

logger = logging.getLogger(__name__)

# Create Database Tables
models.Base.metadata.create_all(bind=database.engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Precarica il modello Ollama in memoria all'avvio (evita cold start)
    from .database import SessionLocal as _SessionLocal
    from .ai_service import AIService as _AIService

    # Seeding/migrazioni idempotenti + background task pulizia memoria
    _seed_and_migrate()
    asyncio.create_task(_memory_cleanup_loop())

    async def _preload():
        try:
            db = _SessionLocal()
            svc = _AIService(db)
            if svc.config.get('active_provider') == 'ollama' and svc.ollama_preload_enabled:
                await asyncio.get_event_loop().run_in_executor(
                    None, svc.preload_ollama_model
                )
        except Exception as e:
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


def _seed_and_migrate():
    """Seeding idempotente di config/guided-step + migrazioni raw-SQL.
    Invocato da `lifespan` all'avvio (sostituisce i vecchi @app.on_event)."""
    from sqlalchemy import text as sa_text

    # Advisory lock dedicato: con piu' worker uvicorn solo uno semina alla volta;
    # i perdenti attendono, poi trovano tutto gia' seminato (nessuna INSERT) ed
    # evitano UniqueViolation sulle commit idempotenti. Tenuto su una connessione
    # separata aperta per tutta la funzione.
    lock_conn = database.engine.connect()
    lock_conn.exec_driver_sql("SELECT pg_advisory_lock(91234)")

    db = database.SessionLocal()
    try:
        # Raw SQL migration: add questionnaire_type column if not present (idempotent)
        try:
            with database.engine.connect() as conn:
                conn.execute(sa_text(
                    "ALTER TABLE guided_steps ADD COLUMN questionnaire_type VARCHAR NOT NULL DEFAULT 'QSA'"
                ))
                conn.commit()
        except Exception as e:
            logger.debug(f"guided_steps migration skipped/failed: {e}")

        try:
            with database.engine.connect() as conn:
                conn.execute(sa_text(
                    "ALTER TABLE questionnaire_results ADD COLUMN username VARCHAR"
                ))
                conn.commit()
        except Exception as e:
            logger.debug(f"questionnaire_results migration skipped/failed: {e}")

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

        # Seed QSAr guided steps if none exist for QSAr
        qsar_count = db.query(models.GuidedStep).filter(
            models.GuidedStep.questionnaire_type == "QSAr"
        ).count()
        if qsar_count == 0:
            for step_def in DEFAULT_QSAR_GUIDED_STEPS:
                db.add(models.GuidedStep(**step_def))
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

        # Seed agent-led questionnaires (QPCS, QPCC, QAP) if none exist
        for qtype, qsteps in (
            ("QPCS", DEFAULT_QPCS_GUIDED_STEPS),
            ("QPCC", DEFAULT_QPCC_GUIDED_STEPS),
            ("QAP", DEFAULT_QAP_GUIDED_STEPS),
        ):
            if db.query(models.GuidedStep).filter(models.GuidedStep.questionnaire_type == qtype).count() == 0:
                for step_def in qsteps:
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
        try:
            lock_conn.exec_driver_sql("SELECT pg_advisory_unlock(91234)")
        finally:
            lock_conn.close()


# --- Registrazione router ---
app.include_router(admin_routes.router)
app.include_router(survey_routes.router)
app.include_router(chat_routes.router)
app.include_router(memory_routes.router)
