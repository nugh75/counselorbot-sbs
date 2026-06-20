from dotenv import load_dotenv
load_dotenv()

import asyncio
import logging
import os
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
    SYSTEM_PROMPT_DEFAULTS,
    GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS,
)
from .questionnaire_catalog import INSTRUMENT_CATALOG_DEFAULTS
from .guided_text_i18n import seed_definitions as guided_text_seed_definitions

# Logica/helper estratti (vedi chat_logic.py); router in routes/.
from .chat_logic import _memory_cleanup_loop, _log_retention_loop
from .routes import admin as admin_routes
from .routes import survey as survey_routes
from .routes import chat as chat_routes
from .routes import memory as memory_routes
from .routes import site_chat as site_chat_routes
from .routes import learner_profile as learner_profile_routes
from .routes import pqbl as pqbl_routes
from .routes import opencode as opencode_routes
from .routes import presets as presets_routes
from .routes import benchmark as benchmark_routes
from .routes import counselors as counselors_routes


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
    asyncio.create_task(_log_retention_loop())
    # Carica il flag di redazione PII dalla config (default attivo).
    try:
        from . import pii as _pii
        from .database import SessionLocal as _cfg_session
        _db = _cfg_session()
        try:
            _row = _db.query(models.Config).filter(models.Config.key == "log_pii_redact").first()
            if _row and (_row.value or "").strip().lower() in ("0", "false", "no", "off"):
                _pii.set_pii_redact_enabled(False)
        finally:
            _db.close()
    except Exception as _e:
        logging.getLogger(__name__).warning(f"Caricamento flag PII fallito (uso default): {_e}")

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

    # Porta i log dei nostri moduli a INFO.
    # Nota: uvicorn configura il root logger a WARNING dopo l'import ma prima
    # del lifespan, quindi i nostri logger.info() non arrivano a schermo.
    # Usiamo un middleware per assicurarci che i nostri logger abbiano un handler
    # dopo che uvicorn ha finito la sua configurazione.

    async def _build_rag():
        # Pre-costruisce l'indice RAG del chatbot del sito (embeddings locali).
        # Non bloccante: se Ollama/embedding non è pronto, la build avverrà alla
        # prima richiesta. La build incrementale salta se il corpus non è cambiato.
        try:
            from .rag_index import site_rag_index
            db = _SessionLocal()
            svc = _AIService(db)
            await asyncio.get_event_loop().run_in_executor(None, site_rag_index.ensure, svc)
        except Exception as e:
            logging.getLogger(__name__).warning(f"Build indice RAG site-chat differita: {e}")
        finally:
            try:
                db.close()
            except Exception:
                pass

    asyncio.create_task(_build_rag())
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
    lock_conn = None
    if database.engine.dialect.name == "postgresql":
        lock_conn = database.engine.connect()
        lock_conn.exec_driver_sql("SELECT pg_advisory_lock(91234)")

    db = database.SessionLocal()
    try:
        # Tabella persistente per i codici anonimi di ricerca, usati negli export
        # per incrociare piu' questionari senza mostrare l'identita' reale.
        try:
            with database.engine.connect() as conn:
                if database.engine.dialect.name == "postgresql":
                    conn.execute(sa_text(
                        """
                        CREATE TABLE IF NOT EXISTS anonymous_research_codes (
                            id SERIAL PRIMARY KEY,
                            username VARCHAR NOT NULL UNIQUE,
                            code VARCHAR NOT NULL UNIQUE,
                            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
                            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
                        )
                        """
                    ))
                else:
                    conn.execute(sa_text(
                        """
                        CREATE TABLE IF NOT EXISTS anonymous_research_codes (
                            id INTEGER PRIMARY KEY,
                            username VARCHAR NOT NULL UNIQUE,
                            code VARCHAR NOT NULL UNIQUE,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    ))
                conn.execute(sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_anonymous_research_codes_username ON anonymous_research_codes (username)"
                ))
                conn.execute(sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_anonymous_research_codes_code ON anonymous_research_codes (code)"
                ))
                conn.commit()
        except Exception as e:
            logger.debug(f"anonymous_research_codes migration skipped/failed: {e}")

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

        for clause in [
            "ADD COLUMN strumenti_utilizzati JSON",
            "ADD COLUMN feedback_aperto TEXT",
        ]:
            try:
                with database.engine.connect() as conn:
                    conn.execute(sa_text(f"ALTER TABLE survey_responses {clause}"))
                    conn.commit()
            except Exception as e:
                logger.debug(f"survey_responses migration skipped/failed ({clause}): {e}")

        for table, columns in {
            "instruments": [
                "ADD COLUMN name_es VARCHAR",
            ],
            "factors": [
                "ADD COLUMN label_es VARCHAR",
                "ADD COLUMN description_es TEXT",
            ],
            "questionnaire_items": [
                "ADD COLUMN text_es TEXT",
            ],
        }.items():
            for clause in columns:
                try:
                    with database.engine.connect() as conn:
                        conn.execute(sa_text(f"ALTER TABLE {table} {clause}"))
                        conn.commit()
                except Exception as e:
                    logger.debug(f"{table} migration skipped/failed ({clause}): {e}")

        # Raw SQL migration: add provider/chunks columns to pqbl_documents (idempotent)
        for clause in [
            "ADD COLUMN provider VARCHAR",
            "ADD COLUMN chunks_total INTEGER NOT NULL DEFAULT 0",
            "ADD COLUMN chunks_done INTEGER NOT NULL DEFAULT 0",
            "ADD COLUMN file_path VARCHAR",
        ]:
            try:
                with database.engine.connect() as conn:
                    conn.execute(sa_text(f"ALTER TABLE pqbl_documents {clause}"))
                    conn.commit()
            except Exception as e:
                logger.debug(f"pqbl_documents migration skipped/failed ({clause}): {e}")

        # Raw SQL migration: add denormalized/indexed columns + identity to logs (idempotent).
        # Permette filtri rapidi e join feedback senza scansionare il JSON details.
        for clause in [
            "ADD COLUMN username VARCHAR",
            "ADD COLUMN email VARCHAR",
            "ADD COLUMN anonymous_research_code VARCHAR",
            "ADD COLUMN provider VARCHAR",
            "ADD COLUMN model_name VARCHAR",
            "ADD COLUMN questionnaire_type VARCHAR",
            "ADD COLUMN phase VARCHAR",
            "ADD COLUMN mode VARCHAR",
            "ADD COLUMN response_id VARCHAR",
            "ADD COLUMN cost_usd DOUBLE PRECISION",
        ]:
            try:
                with database.engine.connect() as conn:
                    conn.execute(sa_text(f"ALTER TABLE logs {clause}"))
                    conn.commit()
            except Exception as e:
                logger.debug(f"logs migration skipped/failed ({clause}): {e}")

        # Indici secondari sulle nuove colonne filtrabili (idempotenti).
        for idx_clause in [
            "CREATE INDEX IF NOT EXISTS ix_logs_username ON logs (username)",
            "CREATE INDEX IF NOT EXISTS ix_logs_anonymous_research_code ON logs (anonymous_research_code)",
            "CREATE INDEX IF NOT EXISTS ix_logs_provider ON logs (provider)",
            "CREATE INDEX IF NOT EXISTS ix_logs_questionnaire_type ON logs (questionnaire_type)",
            "CREATE INDEX IF NOT EXISTS ix_logs_response_id ON logs (response_id)",
        ]:
            try:
                with database.engine.connect() as conn:
                    conn.execute(sa_text(idx_clause))
                    conn.commit()
            except Exception as e:
                logger.debug(f"logs index skipped/failed ({idx_clause}): {e}")

        # Raw SQL migration: override del budget di reasoning per-preset (idempotente).
        for clause in [
            "ADD COLUMN reasoning_budget INTEGER",
        ]:
            try:
                with database.engine.connect() as conn:
                    conn.execute(sa_text(f"ALTER TABLE model_presets {clause}"))
                    conn.commit()
            except Exception as e:
                logger.debug(f"model_presets migration skipped/failed ({clause}): {e}")

        # Create initial admin user if not exists
        user = db.query(models.User).filter(models.User.username == "admin").first()
        if not user:
            hashed_password = auth.get_password_hash("admin123")
            db_user = models.User(username="admin", hashed_password=hashed_password, is_admin=True)
            db.add(db_user)
            db.commit()

        # Config operative per il logging: redazione PII e retention giorni.
        # Valore testuale coerente con il resto della tabella configs.
        for key, default, descr in [
            ("log_pii_redact", "true", "Redazione PII (email/telefono/cf) nei log conversazionali (true/false)."),
            ("log_retention_days", "90", "Giorni di conservazione dei log; 0 disattiva la retention automatica."),
            ("usd_eur_rate", "0.92", "Tasso di cambio USD->EUR per la conversione dei costi nel pannello admin."),
            ("monthly_budget_usd", "0", "Budget mensile in USD; superato il limite si usano solo modelli Ollama locali (0 = nessun limite)."),
            ("budget_fallback_model", "qwen3.5:9b", "Modello Ollama locale usato quando il budget mensile e' superato."),
        ]:
            if not db.query(models.Config).filter(models.Config.key == key).first():
                db.add(models.Config(key=key, value=default, description=descr))
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

        # Seed per-language student-facing texts (suffixed keys, e.g. text_ztpi_conclusion__en).
        # Idempotente: inserisce solo le chiavi mancanti, non sovrascrive le personalizzazioni.
        for text_def in guided_text_seed_definitions():
            if text_def["key"] not in existing_configs:
                db.add(
                    models.Config(
                        key=text_def["key"],
                        value=text_def["default"],
                        description=text_def["description"],
                    )
                )
                changed = True

        if changed:
            db.commit()
            logger.info("Config seeding committed")

        # Sincronizza i segreti da .env nel DB: la variabile d'ambiente resta la
        # fonte di verità a runtime (override in AIService), ma la riga Config
        # viene allineata così l'admin panel non mostra mai valori stantii.
        from .ai_service import ENV_KEY_MAP
        env_synced = False
        for db_key, env_vars in ENV_KEY_MAP.items():
            env_value = next((os.environ.get(v) for v in env_vars if os.environ.get(v)), None)
            if not env_value:
                continue
            row = db.query(models.Config).filter(models.Config.key == db_key).first()
            if row is None:
                db.add(models.Config(key=db_key, value=env_value, description=f"Sincronizzato da .env ({env_vars[0]})"))
                env_synced = True
            elif row.value != env_value:
                row.value = env_value
                env_synced = True
        if env_synced:
            db.commit()
            logger.info("Config sincronizzata con le variabili d'ambiente (.env)")

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

        # One-off: flip the seeded Italian AI-facing prompts to the new English
        # defaults. Idempotente e non distruttivo: sovrascrive solo le righe il cui
        # valore corrente coincide ancora (normalizzato) con il vecchio default
        # italiano, così le personalizzazioni fatte da admin restano intatte.
        # I testi rivolti allo studente (intro/conclusione) e le etichette UI NON
        # sono toccati: restano in italiano nel DB e il frontend serve le altre
        # lingue via i18n. Vedi backend/legacy_italian_prompts.py.
        _migrate_prompts_to_english(db)

        # Seed catalogo strumenti (item + regole di scala) se non già presente.
        # Idempotente per strumento: salta quelli già seminati/editati.
        _seed_instruments_catalog(db)
    finally:
        db.close()
        if lock_conn is not None:
            try:
                lock_conn.exec_driver_sql("SELECT pg_advisory_unlock(91234)")
            finally:
                lock_conn.close()


def _migrate_prompts_to_english(db):
    """Flip the seeded Italian AI-facing prompts (system prompts + guided-step
    prompts) to the current English defaults, without clobbering admin edits.

    A row is overwritten only when its stored value still matches (whitespace-
    normalised) the old Italian snapshot in `legacy_italian_prompts`. Rows that
    differ from both the Italian snapshot and the new English default are treated
    as admin-customised and left untouched (logged so they can be translated by
    hand). Idempotent: after the flip the value equals the English default and no
    longer matches the Italian snapshot."""
    from .legacy_italian_prompts import (
        LEGACY_IT_CONFIG_DEFAULTS,
        LEGACY_IT_STEP_PROMPTS,
        normalize_prompt,
    )

    # New English defaults keyed by config key (all database configuration defaults).
    new_config_defaults = {item["key"]: item["default"] for item in ALL_CONFIG_TEXT_DEFINITIONS}

    # New English step prompts keyed by step id.
    new_step_prompts = {}
    for steps in (
        DEFAULT_GUIDED_STEPS,
        DEFAULT_QSAR_GUIDED_STEPS,
        DEFAULT_ZTPI_GUIDED_STEPS,
        DEFAULT_SAVICKAS_GUIDED_STEPS,
        DEFAULT_QPCS_GUIDED_STEPS,
        DEFAULT_QPCC_GUIDED_STEPS,
        DEFAULT_QAP_GUIDED_STEPS,
    ):
        for s in steps:
            new_step_prompts[s["id"]] = s["prompt"]

    changed = False
    skipped_custom = []

    for key, it_value in LEGACY_IT_CONFIG_DEFAULTS.items():
        new_value = new_config_defaults.get(key)
        if not new_value:
            continue
        cfg = db.query(models.Config).filter(models.Config.key == key).first()
        if cfg is None:
            continue
        current = normalize_prompt(cfg.value)
        if current == normalize_prompt(it_value):
            cfg.value = new_value
            changed = True
        elif current != normalize_prompt(new_value):
            skipped_custom.append(key)

    for step_id, it_prompt in LEGACY_IT_STEP_PROMPTS.items():
        new_prompt = new_step_prompts.get(step_id)
        if not new_prompt:
            continue
        step = db.query(models.GuidedStep).filter(models.GuidedStep.id == step_id).first()
        if step is None:
            continue
        current = normalize_prompt(step.prompt)
        if current == normalize_prompt(it_prompt):
            step.prompt = new_prompt
            changed = True
        elif current != normalize_prompt(new_prompt):
            skipped_custom.append(f"step:{step_id}")

    if changed:
        db.commit()
        logger.info("Prompt EN translation migration applied")
    if skipped_custom:
        logger.info(
            "Prompt EN migration left customised rows untouched (translate by hand if wanted): %s",
            skipped_custom,
        )


def _seed_instruments_catalog(db):
    """Popola instruments/factors/questionnaire_items dallo stato corrente (TS portato).
    Non sovrascrive strumenti già presenti: dopo il primo seed le modifiche sono via admin."""
    seeded = False
    for code, spec in INSTRUMENT_CATALOG_DEFAULTS.items():
        if db.query(models.Instrument).filter(models.Instrument.code == code).first():
            continue
        db.add(models.Instrument(
            code=code,
            name_en=spec.get("name_en"),
            name_sv=spec.get("name_sv"),
            response_scale_min=spec.get("response_scale_min", 1),
            response_scale_max=spec.get("response_scale_max", 4),
            report_scale_type=spec.get("report_scale_type", "stanine"),
            status="experimental",
        ))
        for order, f in enumerate(spec.get("factors", [])):
            db.add(models.Factor(
                instrument_code=code,
                code=f["code"],
                sort_order=order,
                dimension=f.get("dimension"),
                orientation=f.get("orientation", "resource"),
                is_interpretation_inverted=(f.get("orientation") == "difficulty"),
                label_en=f.get("label_en"),
                label_sv=f.get("label_sv"),
            ))
        for order, it in enumerate(spec.get("items", [])):
            db.add(models.QuestionnaireItem(
                instrument_code=code,
                item_number=it["item_number"],
                sort_order=order,
                factor_code=it.get("factor_code"),
                reverse_scoring=bool(it.get("reverse_scoring")),
                text_en=it.get("text_en"),
                text_sv=it.get("text_sv"),
                active=True,
            ))
        seeded = True
        logger.info(f"Seeded instrument catalog: {code}")
    if seeded:
        db.commit()


# --- Registrazione router ---
app.include_router(admin_routes.router)
app.include_router(survey_routes.router)
app.include_router(chat_routes.router)
app.include_router(memory_routes.router)
app.include_router(site_chat_routes.router)
app.include_router(learner_profile_routes.router)
app.include_router(pqbl_routes.router)
app.include_router(opencode_routes.router)
app.include_router(presets_routes.router)
app.include_router(benchmark_routes.router)
app.include_router(counselors_routes.router)
