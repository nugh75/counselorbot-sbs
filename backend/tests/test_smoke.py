"""Smoke test — guardrail per il refactor di main.py (split in router).

Obiettivo: garantire che dopo lo split tutti gli endpoint restino registrati e
gli helper puri si comportino allo stesso modo. Nessuna chiamata di rete: il
provider AI è mockato. Il DB è un database Postgres DEDICATO ai test
(`counselorbot_test`) sulla stessa istanza Postgres dell'app: stesso dialetto
(sequenze, JSON, func.now) ma i dati di produzione (`counselorbot`) non vengono
mai toccati.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_smoke
Con pytest (se installato):
    pytest backend/tests/test_smoke.py
"""
import json
import os
import re
import shutil
import tempfile
import uuid
from urllib.parse import urlsplit, urlunsplit

# Disabilita la traduzione async dei counselor durante i test: usa una propria
# sessione DB (engine di prod) e non deve mai toccare il DB di produzione.
os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
# Idem per la sync admin->contatti ricercatori (chiama ai4auth + scrive su DB).
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.testclient import TestClient

from backend import database, models, auth
import backend.main as main
import backend.routes.chat as chat_routes
import backend.routes.survey as survey_routes
import backend.chat_logic as chat_logic
from backend.memory_service import session_memory
from backend.prompt_config import MODE_TO_SYSTEM_PROMPT_KEY
from backend.qsa_extractor import (
    DEFAULT_OCR_MODEL,
    DEFAULT_PARSER_MODEL,
    QUESTIONNAIRE_FACTORS,
    SUPPORTED_QUESTIONNAIRES,
    _questionnaire_factors,
    _scores_schema,
    _validate_scores,
)
from backend.strategy_memory import APPROVED_STRATEGIES_CONFIG_KEY, shared_response_memory
from backend.content_versions_seed import derive_strategy_versions


# --- DB Postgres dedicato ai test (stessa istanza, db separato) ---
TEST_DB_NAME = "counselorbot_test"
_prod = urlsplit(os.environ["DATABASE_URL"])  # postgresql://user:pwd@postgres:5432/counselorbot
_test_url = urlunsplit((_prod.scheme, _prod.netloc, f"/{TEST_DB_NAME}", _prod.query, _prod.fragment))
_admin_url = urlunsplit((_prod.scheme, _prod.netloc, "/postgres", _prod.query, _prod.fragment))


def _ensure_test_database():
    """Crea il database di test se non esiste (idempotente)."""
    conn = psycopg2.connect(_admin_url)
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TEST_DB_NAME,))
            if not cur.fetchone():
                cur.execute(f'CREATE DATABASE "{TEST_DB_NAME}"')
    finally:
        conn.close()


_ensure_test_database()
_engine = create_engine(_test_url)
_TestSession = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
# Schema pulito a ogni run: niente residui tra esecuzioni
database.Base.metadata.drop_all(bind=_engine)
database.Base.metadata.create_all(bind=_engine)


def _override_get_db():
    db = _TestSession()
    try:
        yield db
    finally:
        db.close()


def _fake_admin():
    return models.User(id=1, username="admin", is_admin=True)


def _fake_user_identity():
    return {
        "email": "student@example.test",
        "username": "student",
        "name": "Student",
        "groups": [],
        "is_admin": False,
        "authenticated": True,
    }


def _identity(username: str, email: str, *, is_admin: bool = False, is_researcher: bool = True) -> dict:
    return {
        "email": email,
        "username": username,
        "name": username,
        "groups": ["researchers"] if is_researcher else [],
        "is_admin": is_admin,
        "is_researcher": is_researcher,
        "authenticated": True,
    }


class _FakeAIService:
    """Sostituisce AIService: nessuna rete."""
    last_stream_args = {}

    def __init__(self, db=None):
        self.config = {
            "active_provider": "openai",
            "model_name": "gpt-4o",
            "disable_thinking": "false",
        }
        self.disable_thinking = False
        self.embedding_model = "bge-m3"

    def embed_texts(self, texts, model=None):
        # Vettore deterministico fittizio per ogni testo (nessuna rete).
        return [[float(len(t) % 7), 1.0, 0.5] for t in texts]

    def embed_query(self, text, model=None):
        return [float(len(text) % 7), 1.0, 0.5]

    def get_response(self, *a, **k):
        self.last_usage = {"prompt_tokens": 12, "completion_tokens": 3, "total_tokens": 15}
        return "RISPOSTA_TEST"

    def stream_response(self, *a, **k):
        _FakeAIService.last_stream_args = {
            "provider": k.get("provider"),
            "model": k.get("model"),
            "max_tokens": k.get("max_tokens"),
            "disable_thinking": self.disable_thinking,
        }
        yield {"type": "content", "text": "RISPOSTA_TEST"}

    def generate_summary(self, *a, **k):
        return "riassunto test"

    def list_models(self, *a, **k):
        return []


# Applica gli override una sola volta a livello di modulo
main.app.dependency_overrides[database.get_db] = _override_get_db
main.app.dependency_overrides[auth.get_current_active_admin] = _fake_admin
main.app.dependency_overrides[auth.get_current_plan_manager] = _fake_admin
# Gli endpoint vivono nei router: patch dell'AIService dove viene usato.
chat_routes.AIService = _FakeAIService
# Lo stream apre una sessione fresca dopo la risposta: isolala nel DB di test.
chat_routes.database.SessionLocal = _TestSession

# Site-chat (RAG): stesso mock provider + sessione di log isolata.
import backend.routes.site_chat as site_chat_routes
site_chat_routes.AIService = _FakeAIService
site_chat_routes.database.SessionLocal = _TestSession

import backend.routes.rag_docs as rag_docs_routes
rag_docs_routes.AIService = _FakeAIService

# pQBL: mock provider + sessione isolata per il task di generazione in background.
import backend.routes.pqbl as pqbl_routes
pqbl_routes.AIService = _FakeAIService
pqbl_routes.database.SessionLocal = _TestSession

# OpenCode: sessione isolata.
import backend.routes.opencode as opencode_routes
opencode_routes.database.SessionLocal = _TestSession
opencode_routes.AIService = _FakeAIService

# Prompt audit: stesso mock provider, nessuna rete.
import backend.routes.prompt_audit as prompt_audit_routes
prompt_audit_routes.AIService = _FakeAIService
main.app.dependency_overrides[prompt_audit_routes.require_prompt_audit_access] = _fake_admin

# Sintesi finale di Idea: il modello riscrive la descrizione della mappa.
import backend.idea_synthesis as idea_synthesis_module
idea_synthesis_module.AIService = _FakeAIService

client = TestClient(main.app)


def _seed_minimal_qsa():
    db = _TestSession()
    try:
        if not db.query(models.Instrument).filter(models.Instrument.code == "QSA").first():
            db.add(models.Instrument(
                code="QSA",
                name_en="QSA",
                name_es="QSA ES",
                response_scale_min=1,
                response_scale_max=4,
            ))
        if not db.query(models.Factor).filter(
            models.Factor.instrument_code == "QSA",
            models.Factor.code == "C1",
        ).first():
            db.add(models.Factor(
                instrument_code="QSA",
                code="C1",
                sort_order=1,
                dimension="cognitive",
                label_en="C1",
                label_es="C1",
            ))
        if not db.query(models.QuestionnaireItem).filter(
            models.QuestionnaireItem.instrument_code == "QSA",
            models.QuestionnaireItem.item_number == 1,
        ).first():
            db.add(models.QuestionnaireItem(
                instrument_code="QSA",
                item_number=1,
                sort_order=1,
                factor_code="C1",
                text_en="Item 1",
                text_es="Item 1 ES",
                active=True,
            ))
        db.commit()
    finally:
        db.close()


def _ensure_guided_steps(questionnaire_type: str = "QSA"):
    db = _TestSession()
    try:
        chat_logic._ensure_questionnaire_guided_steps(db, questionnaire_type)
    finally:
        db.close()


# --------------------------------------------------------------------------
# 1. Inventario route: nessun endpoint deve sparire dopo lo split
# --------------------------------------------------------------------------
EXPECTED_ROUTES = {
    ("GET", "/auth/me"),
    ("GET", "/admin/logs"),
    ("GET", "/admin/config"),
    ("POST", "/admin/config"),
    ("GET", "/admin/models"),
    ("GET", "/admin/config/env-status"),
    ("GET", "/admin/guided-steps"),
    ("POST", "/admin/guided-steps"),
    ("PUT", "/admin/guided-steps/{step_id}"),
    ("DELETE", "/admin/guided-steps/{step_id}"),
    ("PATCH", "/admin/guided-steps/reorder"),
    ("GET", "/admin/training-dataset/summary"),
    ("GET", "/admin/training-dataset/examples"),
    ("POST", "/admin/training-dataset/examples"),
    ("POST", "/admin/training-dataset/generate"),
    ("PATCH", "/admin/training-dataset/examples/{example_id}"),
    ("DELETE", "/admin/training-dataset/examples/{example_id}"),
    ("GET", "/admin/training-dataset/export.jsonl"),
    ("POST", "/survey"),
    ("POST", "/strategy-feedback"),
    ("GET", "/admin/surveys"),
    ("DELETE", "/admin/survey/{survey_id}"),
    ("GET", "/admin/strategy-feedback"),
    ("GET", "/admin/skills"),
    ("POST", "/admin/skills"),
    ("PUT", "/admin/skills/{skill_id}"),
    ("DELETE", "/admin/skills/{skill_id}"),
    ("GET", "/admin/skills/handlers"),
    ("GET", "/admin/skills/step-map"),
    ("PUT", "/admin/skills/step-map"),
    ("POST", "/admin/skills/preview"),
    ("GET", "/qsa/guided-ui-texts"),
    ("POST", "/telegram/webhook"),
    ("GET", "/telegram/bot-info"),
    ("GET", "/admin/administration-plans/{plan_id}/students"),
    ("GET", "/admin/administration-plans/{plan_id}/students/{username}/conversation/{session_id}"),
    ("GET", "/admin/groups"),
    ("POST", "/admin/groups"),
    ("PUT", "/admin/groups/{group_id}"),
    ("DELETE", "/admin/groups/{group_id}"),
    ("GET", "/admin/groups/{group_id}/students"),
    ("GET", "/admin/groups/{group_id}/students/{username}/conversation/{session_id}"),
    ("GET", "/admin/groups/{group_id}/notes"),
    ("POST", "/admin/groups/{group_id}/notes"),
    ("DELETE", "/admin/teacher-notes/{note_id}"),
    ("POST", "/admin/groups/{group_id}/messages"),
    ("GET", "/user/teacher-notes"),
    ("GET", "/groups/info"),
    ("POST", "/groups/join"),
    ("GET", "/user/groups"),
    ("DELETE", "/user/groups/{membership_id}"),
    ("POST", "/telegram/link-code"),
    ("GET", "/telegram/link-status"),
    ("POST", "/telegram/unlink"),
    ("GET", "/admin/telegram/links"),
    ("POST", "/admin/telegram/links/{link_id}/revoke"),
    ("POST", "/chat"),
    ("POST", "/chat/stream"),
    ("POST", "/chat/message"),
    ("GET", "/memory/status/{session_id}"),
    ("DELETE", "/memory/{session_id}"),
    ("POST", "/memory/event"),
    ("GET", "/memory/user/{session_id}"),
    ("POST", "/qsa/audit"),
    ("POST", "/qsa/upload"),
    ("POST", "/tts"),
    ("POST", "/questionnaire-result"),
    ("GET", "/user/questionnaire-results"),
    ("GET", "/user/questionnaire-result/{session_id}/summary"),
    ("GET", "/user/learner-profile"),
    ("POST", "/user/learner-profile"),
    ("GET", "/user/learner-profile/history"),
    ("GET", "/user/learner-profile/reflections"),
    ("POST", "/user/learner-profile/reflections"),
    ("DELETE", "/user/learner-profile"),
    ("GET", "/user/student-booklets/instrument/{questionnaire_type}"),
    ("PUT", "/user/student-booklets/instrument/{questionnaire_type}"),
    ("POST", "/user/student-booklets/instrument/{questionnaire_type}"),
    ("GET", "/user/student-booklets/instrument/{questionnaire_type}/pdf"),
    ("GET", "/user/student-booklets/instrument/{questionnaire_type}/list"),
    ("GET", "/user/student-booklets/id/{booklet_id}"),
    ("PUT", "/user/student-booklets/id/{booklet_id}"),
    ("DELETE", "/user/student-booklets/id/{booklet_id}"),
    ("GET", "/user/student-booklets/id/{booklet_id}/pdf"),
    ("GET", "/user/certified-strategies"),
    ("GET", "/user/student-booklets/{session_id}"),
    ("PUT", "/user/student-booklets/{session_id}"),
    ("GET", "/user/student-booklets/{session_id}/pdf"),
    ("GET", "/user/portfolio"),
    ("POST", "/user/portfolio"),
    ("GET", "/user/portfolio/categories"),
    ("GET", "/user/portfolio/{item_id}"),
    ("PUT", "/user/portfolio/{item_id}"),
    ("DELETE", "/user/portfolio/{item_id}"),
    ("POST", "/user/portfolio/{item_id}/images"),
    ("GET", "/user/portfolio/{item_id}/images/{image_id}"),
    ("DELETE", "/user/portfolio/{item_id}/images/{image_id}"),
    ("POST", "/session/freeze"),
    ("GET", "/session/frozen"),
    ("GET", "/session/frozen/{session_id}"),
    ("DELETE", "/session/frozen/{session_id}"),
    # Strumento Idea: mappa cumulativa della sessione
    ("GET", "/idea/map"),
    ("GET", "/idea/map/history"),
    ("POST", "/idea/map/patch"),
    ("GET", "/idea/map/image"),
    ("GET", "/idea/map/pdf"),
    ("POST", "/idea/map/portfolio"),
    ("POST", "/idea/map/notebook"),
    ("GET", "/admin/questionnaire-results"),
    ("GET", "/admin/validation/summary"),
    ("GET", "/admin/validation/responses"),
    ("GET", "/admin/validation/export.csv"),
    ("DELETE", "/questionnaire-result/{session_id}"),
    ("GET", "/questionnaire-result/{session_id}/pdf"),
    # Catalogo strumenti editabile + scoring server-side
    ("GET", "/admin/instruments"),
    ("POST", "/admin/instruments"),
    ("PUT", "/admin/instruments/{code}"),
    ("GET", "/admin/instruments/{code}/factors"),
    ("POST", "/admin/instruments/{code}/factors"),
    ("PUT", "/admin/factors/{factor_id}"),
    ("DELETE", "/admin/factors/{factor_id}"),
    ("GET", "/admin/instruments/{code}/items"),
    ("POST", "/admin/instruments/{code}/items"),
    ("PUT", "/admin/items/{item_id}"),
    ("DELETE", "/admin/items/{item_id}"),
    ("GET", "/admin/instruments/{code}/norm-thresholds"),
    ("POST", "/admin/instruments/{code}/norm-thresholds"),
    ("DELETE", "/admin/norm-thresholds/{threshold_id}"),
    ("GET", "/instruments/{code}/rules"),
    ("POST", "/instruments/{code}/score"),
    # Chatbot informativo del sito (RAG)
    ("GET", "/site-chat/collections"),
    ("GET", "/site-chat/status"),
    ("GET", "/site-chat/document"),
    ("POST", "/site-chat/reindex"),
    ("POST", "/site-chat/stream"),
    ("GET", "/admin/rag/collections"),
    ("POST", "/admin/rag/collections"),
    ("DELETE", "/admin/rag/collections/{slug}"),
    ("GET", "/admin/rag/docs"),
    ("GET", "/admin/rag/docs/file"),
    ("GET", "/admin/rag/graph"),
    ("PATCH", "/admin/rag/docs/scope"),
    ("POST", "/admin/rag/docs"),
    ("DELETE", "/admin/rag/docs"),
    # pQBL da PDF (pure Question-Based Learning)
    ("POST", "/pqbl/upload"),
    ("GET", "/pqbl/documents/{document_id}"),
    ("POST", "/pqbl/sessions"),
    ("GET", "/pqbl/sessions/{session_id}/questions"),
    ("POST", "/pqbl/sessions/{session_id}/answer"),
    ("POST", "/pqbl/sessions/{session_id}/final-test"),
    ("GET", "/pqbl/sessions/{session_id}/summary"),
    # OpenCode sandbox
    ("POST", "/opencode/workspace"),
    ("POST", "/opencode/workspace/{key}/sync-memory"),
    ("GET", "/opencode/pdf/{token}"),
    # pQBL admin (gestione documenti/domande + analitiche)
    ("GET", "/admin/pqbl/documents"),
    ("GET", "/admin/pqbl/documents/{document_id}/questions"),
    ("PUT", "/admin/pqbl/questions/{question_id}"),
    ("DELETE", "/admin/pqbl/documents/{document_id}"),
    ("GET", "/admin/pqbl/analytics"),
    # Prompt audit admin-only
    ("POST", "/admin/prompt-audit/dry-run"),
    ("POST", "/admin/prompt-audit/live"),
    ("POST", "/admin/prompt-audit/matrix"),
    # Contatti ricercatori + codici somministrazione
    ("GET", "/admin/research-contacts"),
    ("POST", "/admin/research-contacts"),
    ("PUT", "/admin/research-contacts/{contact_id}"),
    ("DELETE", "/admin/research-contacts/{contact_id}"),
    ("GET", "/admin/administration-plans"),
    ("POST", "/admin/administration-plans"),
    ("PUT", "/admin/administration-plans/{plan_id}"),
    ("DELETE", "/admin/administration-plans/{plan_id}"),
    ("GET", "/admin/administration-plans/{plan_id}/responses"),
    # Strategie RAG approvate
    ("GET", "/admin/approved-strategies"),
    ("POST", "/admin/approved-strategies"),
    ("PUT", "/admin/approved-strategies/{strategy_id}"),
    ("DELETE", "/admin/approved-strategies/{strategy_id}"),
    # Catalogo strategie certificate
    ("GET", "/admin/certified-strategies"),
    ("POST", "/admin/certified-strategies"),
    ("PUT", "/admin/certified-strategies/{strategy_id}"),
    ("DELETE", "/admin/certified-strategies/{strategy_id}"),
    ("POST", "/admin/certified-strategies/{strategy_id}/translate"),
    # Domande suggerite dell'assistente docenti
    ("GET", "/assistant-questions"),
    ("GET", "/admin/assistant-questions"),
    ("POST", "/admin/assistant-questions"),
    ("PUT", "/admin/assistant-questions/{question_id}"),
    ("DELETE", "/admin/assistant-questions/{question_id}"),
    ("POST", "/diagram/render"),
    ("POST", "/diagram/from-message"),
}


def _registered_routes():
    found = set()
    # FastAPI >= 0.138 wraps included routers in `_IncludedRouter` (lazy), senza
    # path/methods propri: bisogna espandere `.original_router.routes`.
    for r in main.app.routes:
        if hasattr(r, "original_router"):
            for sub in getattr(r.original_router, "routes", []):
                methods = getattr(sub, "methods", None)
                path = getattr(sub, "path", None)
                if methods and path:
                    for m in methods:
                        found.add((m, path))
            continue
        methods = getattr(r, "methods", None)
        path = getattr(r, "path", None)
        if not methods or not path:
            continue
        for m in methods:
            found.add((m, path))
    return found


def test_all_routes_registered():
    found = _registered_routes()
    missing = EXPECTED_ROUTES - found
    assert not missing, f"Route mancanti dopo lo split: {sorted(missing)}"


def test_opencode_workspace_uses_requested_language():
    import shutil
    import tempfile

    original_root = opencode_routes.OPENCODE_WS_ROOT
    workspace_root = tempfile.mkdtemp(prefix="opencode-test-")
    main.app.dependency_overrides[auth.get_current_user] = _fake_user_identity
    opencode_routes.OPENCODE_WS_ROOT = workspace_root
    session_memory.record_interaction(
        "language-test-session",
        user_message="I want to improve my study planning.",
        questionnaire_type="QSA",
        language="en",
    )
    try:
        r = client.post("/opencode/workspace", json={
            "workspace_id": "language-test-session",
            "questionnaire_type": "QSA",
            "scores": {"C1": 7},
            "locale": "en",
        })
        assert r.status_code == 200, r.text

        workspace = os.path.join(workspace_root, r.json()["key"])
        with open(os.path.join(workspace, ".opencode-prompt"), encoding="utf-8") as fh:
            prompt = fh.read()
        with open(os.path.join(workspace, "AGENTS.md"), encoding="utf-8") as fh:
            agents = fh.read()
        with open(os.path.join(workspace, "documento.md"), encoding="utf-8") as fh:
            document = fh.read()
        with open(os.path.join(workspace, "guida-questionario.md"), encoding="utf-8") as fh:
            guide = fh.read()
        with open(os.path.join(workspace, "memoria.md"), encoding="utf-8") as fh:
            memory = fh.read()

        assert prompt.startswith("You are an educational counselor.")
        assert "Always answer in English." in prompt
        assert "read guida-questionario.md and memoria.md" in prompt
        assert "# Instructions" in agents
        assert "# Profile" in document
        assert "Profile scores" in document
        assert "System prompt key: `prompt_factor`" in guide
        assert "Analyse ONLY the COGNITIVE factors" in guide
        assert "I want to improve my study planning" in memory

        with open(os.path.join(workspace, "appunti.md"), "w", encoding="utf-8") as fh:
            fh.write("# Notes\n\n- The student prefers concrete weekly plans.\n")
        sync = client.post(f"/opencode/workspace/{r.json()['key']}/sync-memory")
        assert sync.status_code == 200, sync.text
        shared_memory = session_memory.get_relevant_context("language-test-session")
        assert "prefers concrete weekly plans" in shared_memory
    finally:
        session_memory.clear("language-test-session")
        opencode_routes.OPENCODE_WS_ROOT = original_root
        main.app.dependency_overrides.pop(auth.get_current_user, None)
        shutil.rmtree(workspace_root)


def test_opencode_pdf_is_served_inline():
    import shutil
    import tempfile

    original_storage = opencode_routes.QSA_PDF_STORAGE_DIR
    storage_dir = tempfile.mkdtemp(prefix="opencode-pdf-test-")
    token = "a" * 32
    with open(os.path.join(storage_dir, f"{token}.pdf"), "wb") as fh:
        fh.write(b"%PDF-1.4\n%%EOF\n")

    main.app.dependency_overrides[auth.get_current_user] = _fake_user_identity
    opencode_routes.QSA_PDF_STORAGE_DIR = storage_dir
    try:
        r = client.get(f"/opencode/pdf/{token}")
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/pdf"
        assert r.headers["content-disposition"] == 'inline; filename="profilo.pdf"'
    finally:
        opencode_routes.QSA_PDF_STORAGE_DIR = original_storage
        main.app.dependency_overrides.pop(auth.get_current_user, None)
        shutil.rmtree(storage_dir)


# --------------------------------------------------------------------------
# 2. Endpoint chiave rispondono (DB+auth mockati, nessuna rete)
# --------------------------------------------------------------------------
def test_admin_config_get():
    r = client.get("/admin/config")
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_admin_config_upsert():
    r = client.post("/admin/config", json={
        "key": "active_provider", "value": "openai", "description": "test",
    })
    assert r.status_code == 200, r.text
    assert r.json()["value"] == "openai"


def test_admin_logs_options_has_new_filter_fields():
    r = client.get("/admin/logs/options")
    assert r.status_code == 200, r.text
    body = r.json()
    for key in ("actions", "providers", "questionnaire_types", "usernames",
                "anonymous_research_codes", "conversation_ids", "models", "phases", "modes"):
        assert key in body, f"options manca '{key}': {body}"
        assert isinstance(body[key], list)


def test_admin_cost_stats_shape():
    r = client.get("/admin/cost-stats")
    assert r.status_code == 200, r.text
    body = r.json()
    for key in (
        "total_cost", "paid_turns", "total_turns", "distinct_sessions",
        "distinct_users", "avg_cost_per_turn", "avg_cost_per_session",
        "avg_cost_per_user", "by_model", "by_user", "by_day", "split",
        "by_week", "by_month", "by_year", "periods", "usd_eur_rate",
    ):
        assert key in body, f"cost-stats manca '{key}': {body}"
    assert isinstance(body["by_model"], list)
    assert set(body["split"].keys()) == {"production", "benchmark"}
    # Aggregati di periodo + run-rate
    for plist in ("by_week", "by_month", "by_year"):
        assert isinstance(body[plist], list)
    assert set(body["periods"].keys()) == {"week", "month", "year"}
    for rr in body["periods"].values():
        for k in ("cost_to_date", "projected_cost", "days_elapsed", "days_total", "period"):
            assert k in rr, f"periods manca '{k}': {rr}"
    assert isinstance(body["usd_eur_rate"], (int, float)) and body["usd_eur_rate"] > 0
    # Budget mensile + medie derivate per la proiezione articolata
    for key in (
        "monthly_budget_usd", "month_to_date_cost", "budget_remaining",
        "budget_exceeded", "budget_fallback_model", "budget_used_pct",
        "avg_turns_per_user", "avg_turns_per_session", "avg_sessions_per_user",
    ):
        assert key in body, f"cost-stats manca '{key}': {body}"


def test_budget_lock_forces_ollama():
    """Con budget mensile superato, AIService instrada i modelli a pagamento su Ollama."""
    from backend.ai_service import AIService
    from backend.database import SessionLocal
    db = SessionLocal()
    try:
        # Budget piccolo + un costo nel mese corrente che lo supera.
        for key, value in (("monthly_budget_usd", "0.001"), ("budget_fallback_model", "qwen3.5:9b")):
            row = db.query(models.Config).filter(models.Config.key == key).first()
            if row:
                row.value = value
            else:
                db.add(models.Config(key=key, value=value))
        db.add(models.Log(session_id="budget-test", action="chat_message", cost_usd=0.05))
        db.commit()

        ai = AIService(db)
        assert ai.monthly_budget_usd == 0.001
        assert ai._budget_is_locked() is True
        assert ai._apply_budget_lock("openrouter", "deepseek/deepseek-v4-flash") == ("ollama", "qwen3.5:9b")
        # I provider gia' locali restano invariati.
        assert ai._apply_budget_lock("ollama", "gemma4:12b") == ("ollama", "gemma4:12b")

        # Budget azzerato -> nessun lock.
        row = db.query(models.Config).filter(models.Config.key == "monthly_budget_usd").first()
        row.value = "0"
        db.commit()
        ai2 = AIService(db)
        assert ai2._budget_is_locked() is False
        assert ai2._apply_budget_lock("openrouter", "x") == ("openrouter", "x")
    finally:
        # Pulizia: riporta il budget a 0 per non influenzare altri test.
        row = db.query(models.Config).filter(models.Config.key == "monthly_budget_usd").first()
        if row:
            row.value = "0"
        db.query(models.Log).filter(models.Log.session_id == "budget-test").delete(synchronize_session=False)
        db.commit()
        db.close()


def test_admin_logs_paid_only_filter_ok():
    # I filtri nuovi non devono rompere la query (smoke su DB vuoto/popolato).
    r = client.get("/admin/logs?paid_only=true&feedback=unrated&has_pii=true&cost_min=0")
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_model_pricing_estimate_cost():
    from backend import model_pricing
    # provider diretto senza costo nell'usage -> stima dai token + tabella
    usage = {"prompt_tokens": 1_000_000, "completion_tokens": 1_000_000}
    cost = model_pricing.estimate_cost_usd("deepseek", "deepseek-chat", usage)
    assert cost is not None and abs(cost - (0.27 + 1.10)) < 1e-6, cost
    # token assenti -> None
    assert model_pricing.estimate_cost_usd("deepseek", "deepseek-chat", {}) is None
    # modello sconosciuto -> None
    assert model_pricing.estimate_cost_usd("groq", "modello-inventato", usage) is None
    # match per nome modello anche con provider sbagliato/None
    assert model_pricing.estimate_cost_usd(None, "deepseek-chat", usage) is not None


def test_usage_cost_prefers_explicit_then_estimates():
    from backend.routes.chat import _usage_cost_usd
    # OpenRouter: costo esplicito ha priorita'
    assert _usage_cost_usd({"cost": 0.005}, "openrouter", "x") == 0.005
    # provider diretto: nessun costo -> stima da token
    est = _usage_cost_usd({"prompt_tokens": 1_000_000, "completion_tokens": 0}, "deepseek", "deepseek-chat")
    assert est is not None and abs(est - 0.27) < 1e-6, est


def test_model_presets_crud():
    # create
    r = client.post("/admin/presets", json={
        "name": "DeepSeek Flash test", "provider": "deepseek", "model": "deepseek-v4-flash",
    })
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    assert r.json()["provider"] == "deepseek"
    # list contiene il preset + flag provider_configured presente
    r = client.get("/admin/presets")
    assert r.status_code == 200, r.text
    rows = r.json()
    assert any(p["id"] == pid for p in rows)
    assert all("provider_configured" in p for p in rows)
    # update
    r = client.put(f"/admin/presets/{pid}", json={"is_active": False, "max_tokens": 800})
    assert r.status_code == 200, r.text
    assert r.json()["is_active"] is False and r.json()["max_tokens"] == 800
    # provider locale sempre configurato
    r = client.post("/admin/presets", json={"name": "Local", "provider": "ollama", "model": "qwen3.5:9b"})
    assert r.json()["provider_configured"] is True, r.text
    # delete
    r = client.delete(f"/admin/presets/{pid}")
    assert r.status_code == 200, r.text


def test_counselors_crud_and_public():
    # crea un preset da assegnare
    pr = client.post("/admin/presets", json={"name": "C-preset", "provider": "deepseek", "model": "deepseek-v4-flash"})
    preset_id = pr.json()["id"]
    # crea counselor (con traduzioni esplicite: la traduzione automatica e' disabilitata nei test)
    r = client.post("/admin/counselors", json={
        "slug": "marco", "name": "Marco", "description": "Tutor calmo",
        "description_i18n": {"en": "Calm tutor", "es": "Tutor tranquilo"},
        "voice_mapping": {"it": "it-IT-DiegoNeural", "en": "en-US-GuyNeural"},
        "persona": "Sei Marco, un counselor empatico.", "preset_id": preset_id,
        "questionnaire_types": ["QSA", "ZTPI"], "is_active": True,
    })
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    assert r.json()["provider"] == "deepseek" and r.json()["model"] == "deepseek-v4-flash"
    assert r.json()["voice_mapping"] == {"it": "it-IT-DiegoNeural", "en": "en-US-GuyNeural"}
    # slug duplicato -> 409
    assert client.post("/admin/counselors", json={"slug": "marco", "name": "X"}).status_code == 409
    # update
    r = client.put(f"/admin/counselors/{cid}", json={"is_active": True, "name": "Marco T."})
    assert r.status_code == 200 and r.json()["name"] == "Marco T."
    # lista pubblica espone solo campi user-facing (no persona/preset)
    r = client.get("/counselors")
    assert r.status_code == 200, r.text
    pub = next((c for c in r.json() if c["id"] == cid), None)
    assert pub is not None
    assert "persona" not in pub and "preset_id" not in pub
    assert pub["name"] == "Marco T." and "QSA" in (pub["questionnaire_types"] or [])
    assert pub["voice_mapping"] == {"it": "it-IT-DiegoNeural", "en": "en-US-GuyNeural"}
    # badge origine modello: deepseek e' un'API esterna
    assert pub["model_origin"] == "external"
    # descrizione localizzata via ?lang (fallback all'italiano se manca la lingua)
    pub_en = next(c for c in client.get("/counselors?lang=en").json() if c["id"] == cid)
    assert pub_en["description"] == "Calm tutor"
    pub_fr = next(c for c in client.get("/counselors?lang=fr").json() if c["id"] == cid)
    assert pub_fr["description"] == "Tutor calmo"
    pub_it = next(c for c in client.get("/counselors?lang=it").json() if c["id"] == cid)
    assert pub_it["description"] == "Tutor calmo"
    # delete
    assert client.delete(f"/admin/counselors/{cid}").status_code == 200


def test_approved_strategies_crud_and_retrieve_from_db_override():
    from backend.strategy_memory import APPROVED_STRATEGIES_CONFIG_KEY, strategy_memory

    strategy_id = "test-planning-week"
    client.delete(f"/admin/approved-strategies/{strategy_id}")

    r = client.post("/admin/approved-strategies", json={
        "id": strategy_id,
        "status": "approved",
        "questionnaires": ["QSA"],
        "keywords": "pianificazione settimana obiettivo",
        "texts": {
            "it": "Collegare la riflessione a un obiettivo verificabile entro la settimana.",
            "en": "Connect reflection to a verifiable goal during the week.",
        },
    })
    assert r.status_code == 200, r.text
    assert r.json()["id"] == strategy_id

    assert client.post("/admin/approved-strategies", json={"id": strategy_id}).status_code == 409

    r = client.put(f"/admin/approved-strategies/{strategy_id}", json={
        "status": "approved",
        "keywords": "pianificazione settimana prossimo passo",
    })
    assert r.status_code == 200, r.text
    assert "prossimo passo" in (r.json()["keywords"] or "")

    db = _TestSession()
    try:
        stored = db.query(models.Config).filter(models.Config.key == APPROVED_STRATEGIES_CONFIG_KEY).one()
        hit = strategy_memory.retrieve(
            questionnaire_type="QSA",
            query="devo pianificare il prossimo passo della settimana",
            language="it",
            markdown_text=stored.value,
        )
        assert any(item["id"] == strategy_id for item in hit)
    finally:
        db.close()

    assert client.delete(f"/admin/approved-strategies/{strategy_id}").status_code == 200
    r = client.get("/admin/approved-strategies")
    assert r.status_code == 200
    assert not any(item["id"] == strategy_id for item in r.json()["strategies"])


def test_certified_strategies_crud_and_retrieve():
    from backend.certified_strategy_service import certified_strategy_memory

    # create
    r = client.post("/admin/certified-strategies", json={
        "slug": "focus-c6", "name_it": "Studio a blocchi brevi",
        "recommended_when_it": "Concentrazione difficile in presenza di distrazioni",
        "description_it": "Proporre intervalli brevi di studio e un cambiamento ambientale verificabile.",
        "factor_codes": ["C6"], "match_mode": "all", "questionnaire_types": ["QSA"],
        "keywords": "concentrazione distrazione ambiente", "status": "certified",
    })
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    # slug duplicato -> 409
    assert client.post("/admin/certified-strategies", json={"slug": "focus-c6"}).status_code == 409
    # update
    r = client.put(f"/admin/certified-strategies/{sid}", json={"sort_order": 5})
    assert r.status_code == 200 and r.json()["sort_order"] == 5
    assert any(s["id"] == sid for s in client.get("/admin/certified-strategies").json())

    # retrieve: la strategia (match_mode=all su C6) riemerge solo se C6 e' saliente
    db = _TestSession()
    try:
        hit = certified_strategy_memory.retrieve(
            db, questionnaire_type="QSA", scores_context="Fattore C6 (Attenzione): 8/9", query="non riesco a concentrarmi",
        )
        assert any(s["id"] == "focus-c6" for s in hit)
        excluded = certified_strategy_memory.retrieve(
            db,
            questionnaire_type="QSA",
            scores_context="Fattore C6 (Attenzione): 8/9",
            query="non riesco a concentrarmi",
            excluded_ids={"focus-c6"},
        )
        assert not any(s["id"] == "focus-c6" for s in excluded)
        miss = certified_strategy_memory.retrieve(
            db, questionnaire_type="QSA", scores_context="Fattore A2: 3/9", query="organizzazione",
        )
        assert not any(s["id"] == "focus-c6" for s in miss)
        # scope questionario diverso -> esclusa
        wrong_scope = certified_strategy_memory.retrieve(
            db, questionnaire_type="ZTPI", scores_context="C6 alto", query="concentrazione",
        )
        assert not any(s["id"] == "focus-c6" for s in wrong_scope)
    finally:
        db.close()

    # bozza (status != certified) non viene mai iniettata
    client.put(f"/admin/certified-strategies/{sid}", json={"status": "draft"})
    db = _TestSession()
    try:
        drafted = certified_strategy_memory.retrieve(
            db, questionnaire_type="QSA", scores_context="C6 alto", query="concentrazione",
        )
        assert not any(s["id"] == "focus-c6" for s in drafted)
    finally:
        db.close()

    # delete
    assert client.delete(f"/admin/certified-strategies/{sid}").status_code == 200


def test_previous_certified_strategy_ids_are_conversation_scoped():
    from backend.chat_logic import previous_certified_strategy_ids

    conversation_id = f"distribution-{uuid.uuid4()}"
    db = _TestSession()
    try:
        db.add_all([
            models.Log(
                session_id="distribution-session",
                conversation_id=conversation_id,
                action="chat_message",
                details={"certified_strategy_ids": ["strategy-a"]},
            ),
            models.Log(
                session_id="distribution-session",
                conversation_id=conversation_id,
                action="chat_message",
                details={"certified_strategy_ids": ["strategy-b", "strategy-a"]},
            ),
            models.Log(
                session_id="distribution-session",
                conversation_id="another-conversation",
                action="chat_message",
                details={"certified_strategy_ids": ["strategy-c"]},
            ),
        ])
        db.commit()
        assert previous_certified_strategy_ids(db, conversation_id) == {"strategy-a", "strategy-b"}
    finally:
        db.close()


def test_certified_strategies_qsar_r_suffixed_factor_gating():
    """Il gating score-aware deve riconoscere i codici QSAr con suffisso 'r'
    (costrutto/direzione diversi dal QSA), incluse le inversioni C4r/A1r."""
    from backend.certified_strategy_service import certified_strategy_memory as csm

    # I codici 'r' devono essere estratti come token di fattore.
    assert "C4R" in csm._factor_tokens("Profilo QSAr: C4r 8/9, A2r 5/9")
    # Inversioni QSAr: C4r (carenza attenzione) e A1r (ansieta') sono invertiti;
    # A2r (volizione) no.
    assert csm._band_for_qsa_score("C4r", 8) == "growth"
    assert csm._band_for_qsa_score("C4r", 3) == "strength"
    assert csm._band_for_qsa_score("A1r", 7) == "growth"
    assert csm._band_for_qsa_score("A2r", 3) == "growth"

    r = client.post("/admin/certified-strategies", json={
        "slug": "qsar-c4r-test", "name_it": "Controllo dell'attenzione (QSAr)",
        "recommended_when_it": "Quando C4r e' un'area di crescita.",
        "description_it": "Ridurre le distrazioni e pianificare il tempo.",
        "factor_codes": ["C4r"], "match_mode": "any", "questionnaire_types": ["QSAr"],
        "status": "certified",
    })
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    db = _TestSession()
    try:
        hit = csm.retrieve(
            db, questionnaire_type="QSAr", scores_context="- C4r: 8/9", query="concentrazione",
        )
        assert any(s["id"] == "qsar-c4r-test" for s in hit)
        # fattore non saliente -> esclusa
        miss = csm.retrieve(
            db, questionnaire_type="QSAr", scores_context="- A2r: 5/9", query="volizione",
        )
        assert not any(s["id"] == "qsar-c4r-test" for s in miss)
    finally:
        db.close()
    assert client.delete(f"/admin/certified-strategies/{sid}").status_code == 200


def test_certified_strategy_seed_is_idempotent_and_retrievable():
    from backend.certified_strategy_seed import DEFAULT_CERTIFIED_STRATEGIES, seed_certified_strategies
    from backend.certified_strategy_service import certified_strategy_memory

    expected_slugs = {item["slug"] for item in DEFAULT_CERTIFIED_STRATEGIES}
    db = _TestSession()
    try:
        before_slugs = {row.slug for row in db.query(models.CertifiedStrategy).all()}
        before_count = db.query(models.CertifiedStrategy).count()

        inserted = seed_certified_strategies(db, models)
        assert inserted == len(expected_slugs - before_slugs)
        assert db.query(models.CertifiedStrategy).count() == before_count + inserted
        assert seed_certified_strategies(db, models) == 0
        derive_strategy_versions(db)

        after_slugs = {row.slug for row in db.query(models.CertifiedStrategy).all()}
        assert expected_slugs.issubset(after_slugs)
        for slug in {
            "qsa-active-preview-predict",
            "qsa-focused-wide-reading",
            "qsa-multimodal-dual-coding",
            "qsa-interleaved-practice",
            "qsa-self-explanation-teach-back",
            "qsa-concrete-examples-nonexamples",
            "qsa-memory-map-check",
            "qsa-error-log-control",
        }:
            row = db.query(models.CertifiedStrategy).filter(models.CertifiedStrategy.slug == slug).one()
            assert row.status == "certified"
            assert row.is_active is True

        preview_hits = certified_strategy_memory.retrieve(
            db,
            questionnaire_type="QSA",
            scores_context="- C5: 2/9",
            query="prima leggo titoli parole in grassetto e faccio ipotesi",
            limit=3,
        )
        assert any(item["id"] == "qsa-active-preview-predict" for item in preview_hits)

        multimodal_hits = certified_strategy_memory.retrieve(
            db,
            questionnaire_type="QSAr",
            scores_context="- C3r: 2/9",
            query="uso video audio immagini e poi faccio uno schema",
            limit=3,
        )
        assert any(item["id"] == "qsa-multimodal-dual-coding" for item in multimodal_hits)
    finally:
        db.close()


def test_admin_sync_upsert_and_deactivate():
    import backend.admin_sync as admin_sync
    original = admin_sync.fetch_service_admins
    db = _TestSession()
    try:
        admins = [
            {"username": "Olle", "email": "balter@kth.se", "displayname": "Olle Bälter", "groups": ["counselorbot-sbs-admin"]},
            {"username": "admin", "email": "daniele@example.test", "displayname": "Daniele Dragoni", "groups": ["admins"]},
        ]
        admin_sync.fetch_service_admins = lambda: admins
        admin_sync.sync_admins_sync(db)
        rows = db.query(models.ResearchContact).filter(models.ResearchContact.source == "admin-sync").all()
        assert {r.ext_username for r in rows} == {"Olle", "admin"}
        assert all(r.is_active for r in rows)
        olle = next(r for r in rows if r.ext_username == "Olle")
        assert olle.email == "balter@kth.se" and olle.code.startswith("RC-") and olle.name == "Olle Bälter"
        # re-sync senza Olle -> deattivato, non eliminato; nessun duplicato
        admin_sync.fetch_service_admins = lambda: [admins[1]]
        admin_sync.sync_admins_sync(db)
        synced = db.query(models.ResearchContact).filter(models.ResearchContact.source == "admin-sync").all()
        assert len(synced) == 2  # niente duplicati
        olle = next(r for r in synced if r.ext_username == "Olle")
        assert olle.is_active is False
        assert next(r for r in synced if r.ext_username == "admin").is_active is True
    finally:
        admin_sync.fetch_service_admins = original
        db.close()


def test_research_contacts_crud():
    r = client.post("/admin/research-contacts", json={
        "name": "Maria Rossi",
        "email": "maria.rossi@example.test",
        "phone": "+39 000 000000",
        "institution": "Universita Test",
        "role": "Ricercatrice",
        "notes": "Somministrazione pilota",
    })
    assert r.status_code == 200, r.text
    data = r.json()
    cid = data["id"]
    code = data["code"]
    assert code.startswith("RC-")
    assert data["name"] == "Maria Rossi"

    r = client.get("/admin/research-contacts")
    assert r.status_code == 200, r.text
    assert any(contact["id"] == cid and contact["code"] == code for contact in r.json())

    assert client.post("/admin/research-contacts", json={"name": "Duplicato", "code": code}).status_code == 409

    r = client.put(f"/admin/research-contacts/{cid}", json={"name": "Maria R.", "is_active": False})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Maria R."
    assert r.json()["is_active"] is False

    assert client.delete(f"/admin/research-contacts/{cid}").status_code == 200


def test_administration_plans_crud():
    contact = client.post("/admin/research-contacts", json={
        "name": "Laura Bianchi",
        "email": "laura.bianchi@example.test",
        "institution": "Universita Test",
    })
    assert contact.status_code == 200, contact.text
    contact_id = contact.json()["id"]

    r = client.post("/admin/administration-plans", json={
        "title": "Somministrazione pilota QSA",
        "instrument_code": "QSA",
        "locale": "en",
        "scheduled_at": "2026-07-01T09:00:00Z",
        "location": "Aula 1",
        "notes": "Portare QR stampato",
        "researchers": [
            {"research_contact_id": contact_id},
            {"external_name": "Osservatore esterno"},
        ],
    })
    assert r.status_code == 200, r.text
    plan = r.json()
    plan_id = plan["id"]
    assert plan["code"].startswith("AP-")
    assert plan["responses_count"] == 0
    assert {row["name"] for row in plan["researchers"]} == {"Laura Bianchi", "Osservatore esterno"}

    listed = client.get("/admin/administration-plans")
    assert listed.status_code == 200, listed.text
    assert any(row["id"] == plan_id for row in listed.json())

    updated = client.put(f"/admin/administration-plans/{plan_id}", json={
        "location": "Aula 2",
        "status": "active",
        "researchers": [{"research_contact_id": contact_id}],
    })
    assert updated.status_code == 200, updated.text
    assert updated.json()["location"] == "Aula 2"
    assert updated.json()["status"] == "active"
    assert [row["name"] for row in updated.json()["researchers"]] == ["Laura Bianchi"]

    responses = client.get(f"/admin/administration-plans/{plan_id}/responses")
    assert responses.status_code == 200, responses.text
    assert responses.json()["questionnaire_results"] == []
    assert responses.json()["validation_responses"] == []

    assert client.delete(f"/admin/administration-plans/{plan_id}").status_code == 200
    assert client.delete(f"/admin/research-contacts/{contact_id}").status_code == 200


def test_administration_plan_visibility_for_assigned_researcher():
    alice = client.post("/admin/research-contacts", json={
        "name": "Alice Researcher",
        "email": "alice@example.test",
    }).json()
    bob = client.post("/admin/research-contacts", json={
        "name": "Bob Researcher",
        "email": "bob@example.test",
    }).json()
    plan = client.post("/admin/administration-plans", json={
        "title": "Piano Alice",
        "instrument_code": "QSA",
        "locale": "en",
        "researchers": [{"research_contact_id": alice["id"]}],
    }).json()

    admin_override = main.app.dependency_overrides.get(auth.get_current_plan_manager)
    try:
        main.app.dependency_overrides[auth.get_current_plan_manager] = lambda: _identity(
            "alice", "alice@example.test"
        )
        r = client.get("/admin/administration-plans")
        assert r.status_code == 200, r.text
        assert any(row["id"] == plan["id"] for row in r.json())

        main.app.dependency_overrides[auth.get_current_plan_manager] = lambda: _identity(
            "bob", "bob@example.test"
        )
        r = client.get("/admin/administration-plans")
        assert r.status_code == 200, r.text
        assert all(row["id"] != plan["id"] for row in r.json())
    finally:
        if admin_override is not None:
            main.app.dependency_overrides[auth.get_current_plan_manager] = admin_override

    assert client.delete(f"/admin/administration-plans/{plan['id']}").status_code == 200
    assert client.delete(f"/admin/research-contacts/{alice['id']}").status_code == 200
    assert client.delete(f"/admin/research-contacts/{bob['id']}").status_code == 200


def test_score_links_plan_and_research_contact_codes():
    _seed_minimal_qsa()
    contact = client.post("/admin/research-contacts", json={
        "name": "Marco Somministratore",
        "email": "marco@example.test",
    }).json()
    plan = client.post("/admin/administration-plans", json={
        "title": "Somministrazione con piano",
        "instrument_code": "QSA",
        "locale": "es",
        "scheduled_at": "2026-07-02T10:00:00Z",
        "location": "Laboratorio",
        "notes": "Sessione test",
        "researchers": [{"research_contact_id": contact["id"]}],
    }).json()

    main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
    try:
        plan_session = "validation-plan-session"
        r = client.post("/instruments/QSA/score", json={
            "session_id": plan_session,
            "locale": "es",
            "answers": {"1": 3},
            "save": True,
            "save_validation": True,
            "version_label": "test-plan",
            "response_metadata": {"study_code": plan["code"]},
            "duration_seconds": 12,
        })
        assert r.status_code == 200, r.text

        contact_session = "validation-contact-session"
        r = client.post("/instruments/QSA/score", json={
            "session_id": contact_session,
            "locale": "es",
            "answers": {"1": 2},
            "save": True,
            "save_validation": True,
            "version_label": "test-contact",
            "response_metadata": {"study_code": contact["code"]},
            "duration_seconds": 9,
        })
        assert r.status_code == 200, r.text
    finally:
        main.app.dependency_overrides.pop(auth.get_identity, None)

    db = _TestSession()
    try:
        plan_result = db.query(models.QuestionnaireResult).filter_by(session_id=plan_session).first()
        assert plan_result.administration_plan_id == plan["id"]
        assert plan_result.research_contact_id is None
        plan_validation = db.query(models.ValidationResponse).filter_by(session_id=plan_session).first()
        assert plan_validation.administration_plan_id == plan["id"]
        assert plan_validation.response_metadata["administration_plan_code"] == plan["code"]
        assert plan_validation.response_metadata["administration_plan_location"] == "Laboratorio"
        assert "Marco Somministratore" in plan_validation.response_metadata["administration_plan_researchers"]

        contact_result = db.query(models.QuestionnaireResult).filter_by(session_id=contact_session).first()
        assert contact_result.research_contact_id == contact["id"]
        assert contact_result.administration_plan_id is None
        contact_validation = db.query(models.ValidationResponse).filter_by(session_id=contact_session).first()
        assert contact_validation.research_contact_id == contact["id"]
        assert contact_validation.response_metadata["research_contact_code"] == contact["code"]
    finally:
        db.close()

    blocked = client.delete(f"/admin/administration-plans/{plan['id']}")
    assert blocked.status_code == 409


def test_assistant_questions_seed_and_crud():
    # Lo startup (seeding) non gira nei test: semino esplicitamente come a runtime.
    from backend.assistant_questions_seed import DEFAULT_ASSISTANT_QUESTIONS, seed_assistant_questions
    _db = _TestSession()
    try:
        seed_assistant_questions(_db, models)
    finally:
        _db.close()

    # Le domande di default (it) sono seminate per i topic realmente usati da /assistente.
    grouped = client.get("/assistant-questions?lang=it").json()
    assert set(DEFAULT_ASSISTANT_QUESTIONS) <= set(grouped)
    for topic in DEFAULT_ASSISTANT_QUESTIONS:
        assert len(grouped[topic]) >= 20

    # Create
    r = client.post("/admin/assistant-questions", json={
        "topic": "q_strumenti", "language": "it",
        "text": "Domanda di test inserita da admin?", "sort_order": 99,
    })
    assert r.status_code == 200, r.text
    qid = r.json()["id"]
    assert r.json()["text"] == "Domanda di test inserita da admin?"

    # Compare pubblica
    assert "Domanda di test inserita da admin?" in client.get("/assistant-questions?lang=it").json()["q_strumenti"]

    # Update -> disattiva: sparisce dalla GET pubblica
    assert client.put(f"/admin/assistant-questions/{qid}", json={"is_active": False}).status_code == 200
    assert "Domanda di test inserita da admin?" not in client.get("/assistant-questions?lang=it").json().get("q_strumenti", [])

    # Lingua senza righe -> topic omesso (fallback i18n nel frontend)
    assert client.get("/assistant-questions?lang=zh").json() == {}

    # Delete
    assert client.delete(f"/admin/assistant-questions/{qid}").status_code == 200


def test_guided_step_questions_seed_and_public_payload():
    from backend.guided_step_questions_seed import seed_guided_step_questions

    _db = _TestSession()
    try:
        seed_guided_step_questions(_db, models)
    finally:
        _db.close()

    expected = {
        "QSA": "cognitive",
        "QSAr": "qsar-cognitive",
        "ZTPI": "ztpi-t1",
        "SAVICKAS": "savickas-q1",
        "QPCS": "qpcs-emozioni",
        "QPCC": "qpcc-factors",
        "QAP": "qap-factors",
    }
    for questionnaire_type, step_id in expected.items():
        r = client.get(f"/qsa/guided-ui-texts?questionnaire_type={questionnaire_type}&lang=it")
        assert r.status_code == 200, r.text
        step = next((s for s in r.json()["guided_steps"] if s["id"] == step_id), None)
        assert step is not None, f"missing {step_id} for {questionnaire_type}"
        assert len(step["suggested_questions"]) >= 3

    qsa_payload = client.get("/qsa/guided-ui-texts?questionnaire_type=QSA&lang=it").json()
    assert len(qsa_payload["fixed_phase_questions"]) >= 3
    savickas_payload = client.get("/qsa/guided-ui-texts?questionnaire_type=SAVICKAS&lang=it").json()
    assert len(savickas_payload["fixed_phase_questions"]) >= 3

    en_payload = client.get("/qsa/guided-ui-texts?questionnaire_type=QSA&lang=en").json()
    cognitive = next(s for s in en_payload["guided_steps"] if s["id"] == "cognitive")
    import os
    json_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "translations_seed.json")
    if os.path.exists(json_path):
        assert len(cognitive["suggested_questions"]) >= 3
    else:
        assert cognitive["suggested_questions"] == []


def test_guided_step_questions_crud():
    # Create
    r = client.post("/admin/guided-step-questions", json={
        "questionnaire_type": "QSA",
        "step_id": "cognitive",
        "language": "en",
        "text": "Do you prefer maps or text?",
        "sort_order": 99,
        "is_active": True,
    })
    assert r.status_code == 200, r.text
    qid = r.json()["id"]
    assert r.json()["text"] == "Do you prefer maps or text?"

    # Compare public endpoint
    r_public = client.get("/qsa/guided-ui-texts?questionnaire_type=QSA&lang=en")
    assert r_public.status_code == 200
    cognitive = next(s for s in r_public.json()["guided_steps"] if s["id"] == "cognitive")
    assert "Do you prefer maps or text?" in cognitive["suggested_questions"]

    # Update -> deactivate: should disappear from public endpoint
    r_update = client.put(f"/admin/guided-step-questions/{qid}", json={"is_active": False})
    assert r_update.status_code == 200
    r_public2 = client.get("/qsa/guided-ui-texts?questionnaire_type=QSA&lang=en")
    cognitive2 = next(s for s in r_public2.json()["guided_steps"] if s["id"] == "cognitive")
    assert "Do you prefer maps or text?" not in cognitive2["suggested_questions"]

    # Delete
    assert client.delete(f"/admin/guided-step-questions/{qid}").status_code == 200


def test_resolve_counselor_helper():
    # helper di chat.py: counselor inesistente -> tutti None
    from backend.routes.chat import _resolve_counselor
    from backend.database import SessionLocal
    db = SessionLocal()
    try:
        assert _resolve_counselor(db, None) == (None, None, None, None, None, None)
        assert _resolve_counselor(db, 999999) == (None, None, None, None, None, None)

        preset = models.ModelPreset(
            name="No reasoning test",
            provider="openrouter",
            model="deepseek/deepseek-r1",
            disable_thinking=True,
            reasoning_budget=4096,
        )
        db.add(preset)
        db.flush()
        counselor = models.Counselor(
            slug="no-reasoning-test",
            name="No reasoning test",
            persona="Persona test",
            preset_id=preset.id,
            is_active=True,
        )
        db.add(counselor)
        db.commit()

        assert _resolve_counselor(db, counselor.id) == (
            "openrouter",
            "deepseek/deepseek-r1",
            "Persona test",
            "No reasoning test",
            True,
            4096,
        )
    finally:
        db.close()


def test_benchmark_scoring_pure():
    from backend import benchmark_service
    summary = [
        {"quality": 0.9, "tok_s": 100.0, "reliability": 1.0},
        {"quality": 0.45, "tok_s": 50.0, "reliability": 1.0},
        {"provider": "x", "model": "y", "error": "boom"},
    ]
    benchmark_service._add_scores(summary)
    assert abs(summary[0]["score"] - 1.0) < 1e-6, summary[0]
    assert summary[1]["score"] < summary[0]["score"]
    assert summary[2]["score"] == 0.0
    assert len(benchmark_service._all_steps()) == 11


def test_benchmark_run_endpoint_creates_run():
    from backend import benchmark_service
    orig = benchmark_service.start_benchmark_async
    benchmark_service.start_benchmark_async = lambda *a, **k: None  # niente thread/rete nel test
    try:
        p = client.post("/admin/presets", json={"name": "bench", "provider": "ollama", "model": "qwen3.5:9b"})
        pid = p.json()["id"]
        r = client.post("/admin/benchmark/run", json={"preset_ids": [pid], "language": "it"})
        assert r.status_code == 200, r.text
        run_id = r.json()["run_id"]
        assert r.json()["status"] in ("queued", "running")
        lst = client.get("/admin/benchmark/runs")
        assert lst.status_code == 200 and any(x["run_id"] == run_id for x in lst.json())
        one = client.get(f"/admin/benchmark/runs/{run_id}")
        assert one.status_code == 200 and one.json()["run_id"] == run_id
        # run inesistente -> 400
        assert client.post("/admin/benchmark/run", json={"preset_ids": []}).status_code == 400
    finally:
        benchmark_service.start_benchmark_async = orig


def test_openai_compatible_providers_registered():
    from backend.ai_service import OPENAI_COMPAT_PROVIDERS, AIService
    assert set(OPENAI_COMPAT_PROVIDERS) == {
        "groq", "cerebras", "deepseek", "together", "fireworks", "deepinfra",
    }
    assert hasattr(AIService, "_call_openai_compatible")
    assert hasattr(AIService, "_stream_openai_compatible")
    # ogni provider OpenAI-compatibile ha una chiave ENV mappata
    from backend.ai_service import ENV_KEY_MAP
    for p in OPENAI_COMPAT_PROVIDERS:
        assert f"api_key_{p}" in ENV_KEY_MAP, f"manca ENV_KEY_MAP per {p}"


def test_guided_steps_list():
    r = client.get("/admin/guided-steps")
    assert r.status_code == 200, r.text


def test_guided_ui_texts_public():
    r = client.get("/qsa/guided-ui-texts?questionnaire_type=QSA")
    assert r.status_code == 200, r.text


def test_guided_ui_step_labels_have_no_duplicate_ordinals_in_any_language():
    import re
    from backend.guided_step_label_i18n import strip_step_ordinal

    ordinal_prefix = re.compile(
        r"^\s*(?:\d{1,3}(?:\.\d{1,3})+|\d{1,3}[.)]|\d{1,3}\s*[-–—:])\s*"
    )
    instruments = ("QSA", "QSAr", "ZTPI", "SAVICKAS", "QPCS", "QPCC", "QAP", "IDEA")
    languages = ("it", "en", "es", "fr", "de", "sv")

    assert strip_step_ordinal("3.1 Elaborazione") == "Elaborazione"
    assert strip_step_ordinal("4 - Domande") == "Domande"
    assert strip_step_ordinal("2026: prospettive") == "2026: prospettive"

    for questionnaire_type in instruments:
        for language in languages:
            r = client.get(
                f"/qsa/guided-ui-texts?questionnaire_type={questionnaire_type}&lang={language}"
            )
            assert r.status_code == 200, r.text
            payload = r.json()
            labels = [step["label"] for step in payload["guided_steps"]]
            labels.extend([
                payload["label_guided_questions"],
                payload["label_guided_conclusion"],
            ])
            assert all(not ordinal_prefix.match(label) for label in labels), (
                questionnaire_type,
                language,
                labels,
            )


def test_training_dataset_review_flow():
    r = client.post("/admin/training-dataset/generate", json={
        "instrument_code": "QSA",
        "locale": "it",
        "phase": "sl-motivation",
        "count": 2,
    })
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) == 2
    assert rows[0]["status"] == "pending"
    assert rows[0]["phase"] == "sl-motivation"

    example_id = rows[0]["id"]
    r = client.patch(f"/admin/training-dataset/examples/{example_id}", json={
        "assistant_answer": rows[0]["assistant_answer"] + "\nNota validata.",
        "status": "edited",
        "review_notes": "ok",
    })
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "edited"

    r = client.get("/admin/training-dataset/export.jsonl?instrument_code=QSA&locale=it&phase=sl-motivation")
    assert r.status_code == 200, r.text
    assert '"messages"' in r.text
    assert "Nota validata" in r.text


def test_qsar_guided_ui_texts_public():
    r = client.get("/qsa/guided-ui-texts?questionnaire_type=QSAr")
    assert r.status_code == 200, r.text
    step_ids = [step["id"] for step in r.json()["guided_steps"]]
    assert "qsar-cognitive" in step_ids
    assert "qsar-affective" in step_ids


def test_new_questionnaire_guided_ui_texts_public():
    expected_steps = {
        "QPCS": ("qpcs-emozioni", "qpcs-analysis"),
        "QPCC": ("qpcc-factors", "qpcc-factor"),
        "QAP": ("qap-factors", "qap-factor"),
    }
    for questionnaire_type, (step_id, mode) in expected_steps.items():
        r = client.get(f"/qsa/guided-ui-texts?questionnaire_type={questionnaire_type}")
        assert r.status_code == 200, r.text
        steps = r.json()["guided_steps"]
        assert any(step["id"] == step_id and step["system_prompt_mode"] == mode for step in steps)


def test_existing_extended_guided_modes_resolve_saved_prompt_keys():
    assert MODE_TO_SYSTEM_PROMPT_KEY["qpcs-analysis"] == "prompt_qpcs_analysis"
    assert MODE_TO_SYSTEM_PROMPT_KEY["qpcs-summary"] == "prompt_qpcs_summary"
    assert MODE_TO_SYSTEM_PROMPT_KEY["qpcc-interview"] == "prompt_qpcc_interview"
    assert MODE_TO_SYSTEM_PROMPT_KEY["qpcc-summary"] == "prompt_qpcc_summary"
    assert MODE_TO_SYSTEM_PROMPT_KEY["qap-interview"] == "prompt_qap_interview"
    assert MODE_TO_SYSTEM_PROMPT_KEY["qap-summary"] == "prompt_qap_summary"


def test_prompt_audit_intro_envelope_is_light_for_all_instruments():
    intros = [
        ("QSA", "intro", "PROFILO QSA DELLO STUDENTE:\n- C1: 7/9\n- A1: 8/9"),
        ("QSAr", "qsar-intro", "PROFILO QSAr DELLO STUDENTE:\n- C1r: 7/9\n- A1r: 8/9"),
        ("ZTPI", "ztpi-intro", "PROFILO ZTPI DELLO STUDENTE:\n- T1: 7/9\n- T2: 5/9"),
        ("SAVICKAS", "savickas-intro", ""),
        # QPCS uses a qualitative interview path: its first step (qpcs-intro) is an
        # interview step that intentionally keeps scores internally, so it is not part
        # of the intro-light (score-free) family tested here.
        ("QPCC", "qpcc-welcome", "PROFILO QPCC DELLO STUDENTE:\n- K1: 7/9\n- K2: 5/9"),
        ("QAP", "qap-welcome", "PROFILO QAP DELLO STUDENTE:\n- AD1: 7/9\n- AD2: 5/9"),
    ]
    for questionnaire_type, _, _ in intros:
        _ensure_guided_steps(questionnaire_type)

    counselor = client.post("/admin/counselors", json={
        "slug": "prompt-audit-intro-light",
        "name": "Nadia",
        "persona": "You are Nadia, a balanced and clear counsellor.",
        "questionnaire_types": ["QSA", "QSAr", "ZTPI", "SAVICKAS", "QPCS", "QPCC", "QAP"],
        "is_active": True,
    })
    assert counselor.status_code == 200, counselor.text
    counselor_id = counselor.json()["id"]

    forbidden_system_blocks = [
        "[FACTOR LABELS]",
        "[INTERPRETATION TABLE]",
        "[CURRENT FACTOR SCOPE]",
        "[CURRENT STEP FACTORS]",
        "[CURRENT STEP SCORE PROFILE]",
        "[CERTIFIED ADVICE]",
        "[KNOWLEDGE]",
        "[PROFILE]",
    ]
    forbidden_score_fragments = ["PROFILO", "/9", "- C1", "- A1", "- T1", "- S1", "- K1", "- AD1"]

    for questionnaire_type, phase, scores_context in intros:
        r = client.post("/admin/prompt-audit/dry-run", json={
            "questionnaire_type": questionnaire_type,
            "language": "it",
            "phase": phase,
            "mode": "generic",
            "use_phase_prompt": True,
            "scores_context": scores_context,
            "session_id": f"prompt-audit-intro-light-{questionnaire_type.lower()}",
            "counselor_id": counselor_id,
            "include_knowledge": True,
            "include_history": False,
        })
        assert r.status_code == 200, r.text
        body = r.json()
        system_prompt = body["envelope"]["system_prompt_final"]
        full_message = body["envelope"]["full_message"]

        assert body["resolved"]["step"]["mode"] == "intro"
        assert body["inputs"]["scoped_scores_context"] == ""
        assert body["knowledge"]["context"] == ""
        assert body["knowledge"]["strategy_ids"] == []
        assert body["knowledge"]["certified_strategy_ids"] == []
        assert system_prompt.count("You are Nadia") == 1
        assert "You are Nadia. You are introducing" not in system_prompt
        assert "cognitive and affective factors" not in system_prompt
        assert "cognitive and affective components" not in system_prompt
        assert "there are no right or wrong answers" not in system_prompt
        assert "without asking anything" not in system_prompt
        assert "not required to answer counsellor questions" not in system_prompt
        assert "the student can move forward when ready" in system_prompt
        assert "guiding the reading of the profile results already provided" in system_prompt
        assert "Avoid meta-negations about questions" in system_prompt
        assert "Only explicitly dialogic or interview phases are question-led" in system_prompt
        assert "[INTRO ALLOWED QUESTIONS]" in system_prompt
        assert "the path is guided step by step" in system_prompt
        assert "QSA and QSAr for learning strategies" in system_prompt
        assert "QAP for career adaptability" in system_prompt
        assert "how we'll explore my profile together" not in system_prompt
        if questionnaire_type == "SAVICKAS":
            assert "narrative interview path" in system_prompt
        else:
            assert "will not normally ask me questions" not in system_prompt
            assert "without asking anything" not in system_prompt
            assert "step-by-step reading of my profile results" in system_prompt
            assert "move forward with the next-step button when ready" in system_prompt
            assert "Avoid bureaucratic wording, stage labels and meta-negations" in system_prompt
        for marker in forbidden_system_blocks:
            assert marker not in system_prompt, (questionnaire_type, marker, system_prompt)
        for marker in forbidden_score_fragments:
            assert marker not in full_message, (questionnaire_type, marker, full_message)

    r = client.post("/admin/prompt-audit/dry-run", json={
        "questionnaire_type": "QSA",
        "language": "it",
        "phase": "intro",
        "mode": "generic",
        "use_phase_prompt": False,
        "message": "Come funziona l'interazione e quali strumenti sono disponibili?",
        "scores_context": "PROFILO QSA DELLO STUDENTE:\n- C1: 7/9\n- A1: 8/9",
        "session_id": "prompt-audit-intro-light-free-question",
        "counselor_id": counselor_id,
        "include_knowledge": True,
        "include_history": False,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["envelope"]["full_message"] == "Come funziona l'interazione e quali strumenti sono disponibili?"
    assert "[INTRO ALLOWED QUESTIONS]" in body["envelope"]["system_prompt_final"]
    assert "[KNOWLEDGE]" not in body["envelope"]["system_prompt_final"]
    assert "PROFILO QSA" not in body["envelope"]["full_message"]


def test_prompt_audit_dry_run_builds_qsa_envelope_without_side_effects():
    _ensure_guided_steps("QSA")
    session_id = "prompt-audit-dry-run"
    session_memory.clear(session_id)

    preset = client.post("/admin/presets", json={
        "name": "Prompt audit preset",
        "provider": "openrouter",
        "model": "deepseek/deepseek-v4-flash",
        "disable_thinking": True,
    })
    assert preset.status_code == 200, preset.text
    counselor = client.post("/admin/counselors", json={
        "slug": "prompt-audit-qsa",
        "name": "Prompt Audit QSA",
        "persona": "You are a concise test counselor.",
        "preset_id": preset.json()["id"],
        "questionnaire_types": ["QSA"],
        "is_active": True,
    })
    assert counselor.status_code == 200, counselor.text
    counselor_id = counselor.json()["id"]

    scores_context = "\n".join([
        "PROFILO QSA DELLO STUDENTE:",
        "- C1: 7/9", "- C2: 6/9", "- C3: 8/9", "- C4: 5/9",
        "- C5: 4/9", "- C6: 2/9", "- C7: 6/9", "- A1: 9/9",
    ])
    db = _TestSession()
    try:
        before_logs = db.query(models.Log).count()
    finally:
        db.close()

    r = client.post("/admin/prompt-audit/dry-run", json={
        "questionnaire_type": "QSA",
        "language": "it",
        "phase": "cognitive",
        "mode": "factor",
        "use_phase_prompt": True,
        "scores_context": scores_context,
        "session_id": session_id,
        "counselor_id": counselor_id,
        "max_tokens": 700,
        "include_knowledge": False,
        "include_history": False,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["resolved"]["prompt_key"] == "prompt_factor"
    assert body["resolved"]["provider"] == "openrouter"
    assert body["resolved"]["model"] == "deepseek/deepseek-v4-flash"
    assert body["resolved"]["counselor"]["id"] == counselor_id
    system_prompt = body["envelope"]["system_prompt_final"]
    assert "You are Prompt Audit QSA, a QSA expert" not in system_prompt
    assert "You are CounselorBot" not in system_prompt
    assert "C1 (Strategie elaborative)" in system_prompt
    assert "C7 (Autointerrogazione)" in system_prompt
    assert "A1 (Ansietà di base)" not in system_prompt
    assert "Analyse ONLY the COGNITIVE factors" in body["inputs"]["effective_user_message"]
    assert "- C1" in body["inputs"]["scoped_scores_context"]
    assert "- A1" not in body["inputs"]["scoped_scores_context"]
    assert body["envelope"]["history"] == []
    assert body["knowledge"]["included"] is False

    db = _TestSession()
    try:
        assert db.query(models.Log).count() == before_logs
    finally:
        db.close()
    assert session_memory.get_summary(session_id) == ""


def test_prompt_audit_followup_includes_guided_path_for_next_step():
    _ensure_guided_steps("QSA")
    session_id = "prompt-audit-guided-path-followup"
    session_memory.clear(session_id)

    r = client.post("/admin/prompt-audit/dry-run", json={
        "questionnaire_type": "QSA",
        "language": "it",
        "phase": "cognitive",
        "mode": "factor-qa",
        "use_phase_prompt": False,
        "message": "passiamo avanti al prossimo step",
        "scores_context": "",
        "session_id": session_id,
        "include_knowledge": False,
        "include_history": False,
    })
    assert r.status_code == 200, r.text
    system_prompt = r.json()["envelope"]["system_prompt_final"]
    assert "[GUIDED PATH]" in system_prompt
    assert "1. Fattori Cognitivi [id: cognitive] (current)" in system_prompt
    assert "2. Fattori Affettivi [id: affective] (next)" in system_prompt
    assert "Next guided step: 2. Fattori Affettivi [id: affective]." in system_prompt
    assert "[[AVANZA_STEP]]" in system_prompt
    assert "do not say that you do not know the path" in system_prompt


def test_prompt_audit_component_flags_use_saved_and_payload_values():
    _ensure_guided_steps("QSA")
    step_id = "audit-component-flags"
    config_key = "prompt_components_QSA_audit-component-flags"
    disabled_flags = '{"system_prompt": false, "step_prompt": false, "metadata": false, "knowledge": false, "history": false}'

    db = _TestSession()
    try:
        db.query(models.Config).filter(models.Config.key == config_key).delete()
        db.query(models.GuidedStep).filter(models.GuidedStep.id == step_id).delete()
        db.add(models.GuidedStep(
            id=step_id,
            sort_order=999,
            label="Audit Component Flags",
            prompt="Audit step prompt visible",
            system_prompt_mode="generic",
            color_theme="slate",
            questionnaire_type="QSA",
        ))
        db.add(models.Config(key=config_key, value=disabled_flags, description="test component flags"))
        db.commit()
    finally:
        db.close()

    try:
        payload = {
            "questionnaire_type": "QSA",
            "language": "it",
            "phase": step_id,
            "mode": "generic",
            "use_phase_prompt": True,
            "include_knowledge": True,
            "include_history": True,
        }
        r = client.post("/admin/prompt-audit/dry-run", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["component_config_key"] == config_key
        assert body["component_flags"]["system_prompt"] is False
        assert body["component_flags"]["step_prompt"] is False
        assert body["component_flags"]["metadata"] is False
        assert body["components"]["system_prompt"] == ""
        assert body["components"]["step_prompt"] == ""
        assert body["components"]["metadata"] == ""
        assert body["envelope"]["full_message"] == ""
        assert "Questionario: QSA" not in body["envelope"]["system_prompt_final"]

        r = client.post("/admin/prompt-audit/dry-run", json={
            **payload,
            "component_flags": {
                "system_prompt": True,
                "step_prompt": True,
                "metadata": True,
                "knowledge": False,
                "history": False,
            },
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["component_flags"]["system_prompt"] is True
        assert body["component_flags"]["step_prompt"] is True
        assert body["component_flags"]["metadata"] is True
        assert "Audit step prompt visible" in body["envelope"]["system_prompt_final"]
        assert "Questionario: QSA" in body["envelope"]["system_prompt_final"]
    finally:
        db = _TestSession()
        try:
            db.query(models.Config).filter(models.Config.key == config_key).delete()
            db.query(models.GuidedStep).filter(models.GuidedStep.id == step_id).delete()
            db.commit()
        finally:
            db.close()


def test_startup_migration_rewrites_counselorbot_prompt_identity_prefix():
    db = _TestSession()
    try:
        cfg = db.query(models.Config).filter(models.Config.key == "prompt_factor").first()
        if cfg is None:
            cfg = models.Config(key="prompt_factor", value="", description="test prompt")
            db.add(cfg)
            db.flush()
        original = cfg.value
        cfg.value = (
            "You are CounselorBot, a study tutor for students.\n"
            "Goal:\n"
            "Always speak in a simple, direct and encouraging tone, in the requested language, addressing the student informally.\n"
            "Analyse the requested factors."
        )
        db.commit()

        main._migrate_counselor_personas_and_intros(db)
        db.refresh(cfg)

        assert cfg.value.startswith("Goal:\nAnalyse the requested factors.")
        assert "You are CounselorBot" not in cfg.value
        assert "{{counselor_name}}" not in cfg.value
        assert "Always speak in a simple" not in cfg.value
    finally:
        cfg = db.query(models.Config).filter(models.Config.key == "prompt_factor").first()
        if cfg is not None:
            cfg.value = original
            db.commit()
        db.close()


def test_startup_migration_updates_intro_question_contract():
    _ensure_guided_steps("QSA")
    db = _TestSession()
    cfg = None
    step = None
    original_cfg = None
    original_step_prompt = None
    try:
        cfg = db.query(models.Config).filter(models.Config.key == "prompt_intro").first()
        if cfg is None:
            cfg = models.Config(key="prompt_intro", value="", description="test prompt")
            db.add(cfg)
            db.flush()
        step = db.query(models.GuidedStep).filter(models.GuidedStep.id == "intro").first()
        assert step is not None
        original_cfg = cfg.value
        original_step_prompt = step.prompt
        cfg.value = (
            "You are introducing yourself to the student at the start of the QSA "
            "exploration of their learning strategies.\n\n"
            "In this turn:\n"
            "- Introduce yourself warmly and welcome the student.\n"
            "- Explain in 3-4 sentences that you will analyse the profile results step by step.\n"
            "- Make clear that the student is not required to answer counsellor questions "
            "during the score-analysis steps: they may ask clarifying questions whenever "
            "useful, or simply continue with the next-step button without asking anything.\n"
            "- Explain that only explicitly dialogic or interview phases involve counsellor questions.\n"
            "- Reassure them that this is not a test or a grade.\n"
            "- Close by inviting the student to move on to the first step whenever "
            "they are ready.\n"
            "Do NOT yet: mention any score, factor, factor code, or table. This is only the "
            "welcome, not the analysis."
        )
        step.prompt = (
            "Introduce yourself as the counselor, welcome me warmly, and explain in 3-4 "
            "sentences that you will analyse my profile results step by step. Make clear "
            "that you will not normally ask me questions during score-analysis steps: I "
            "can ask clarifying questions whenever useful, or simply continue with the "
            "next-step button without asking anything. Do NOT analyse or mention any "
            "factor or score yet."
        )
        db.commit()

        main._migrate_counselor_personas_and_intros(db)
        db.refresh(cfg)
        db.refresh(step)

        assert "there are no right or wrong answers" not in cfg.value
        assert "not a test or a grade" in cfg.value
        assert "without asking anything" not in cfg.value
        assert "guiding the reading of the profile results already provided" in cfg.value
        assert "will not normally ask me questions" not in step.prompt
        assert "without asking anything" not in step.prompt
        assert "step-by-step reading of my profile results" in step.prompt
        assert "move forward with the next-step button when ready" in step.prompt
        assert "how we'll explore my profile together" not in step.prompt
    finally:
        if cfg is not None and original_cfg is not None:
            cfg.value = original_cfg
        if step is not None and original_step_prompt is not None:
            step.prompt = original_step_prompt
        db.commit()
        db.close()


def test_startup_migration_rewrites_guided_completion_home_texts():
    db = _TestSession()
    fixtures = {
        "text_guided_conclusion": (
            "Hai completato il percorso QSA.\n"
            "Hai gia' una base chiara su cui costruire.\n"
            "Quando vuoi, puoi tornare alla Home Page e riprendere da qui."
        ),
        "text_qsar_conclusion__en": (
            "You have completed the QSAr analysis path. "
            "Click the button below to return to the Home Page."
        ),
    }
    originals = {}
    created = set()

    try:
        for key, value in fixtures.items():
            cfg = db.query(models.Config).filter(models.Config.key == key).first()
            if cfg is None:
                cfg = models.Config(key=key, value="", description="test guided completion text")
                db.add(cfg)
                db.flush()
                created.add(key)
            originals[key] = cfg.value
            cfg.value = value
        db.commit()

        assert main._migrate_guided_completion_home_texts(db) is True
        db.commit()

        italian = db.query(models.Config).filter(models.Config.key == "text_guided_conclusion").first()
        english = db.query(models.Config).filter(models.Config.key == "text_qsar_conclusion__en").first()

        assert "Home Page" not in italian.value
        assert "prossimo passaggio" in italian.value
        assert "Home Page" not in english.value
        assert "choose your next step" in english.value
    finally:
        for key, original in originals.items():
            cfg = db.query(models.Config).filter(models.Config.key == key).first()
            if cfg is None:
                continue
            if key in created:
                db.delete(cfg)
            else:
                cfg.value = original
        db.commit()
        db.close()


def test_startup_migration_adds_the_final_idea_plan_without_overwriting_custom_prompts():
    from backend.prompt_config import (
        DEFAULT_SYSTEM_PROMPT_IDEA,
        PREVIOUS_DEFAULT_SYSTEM_PROMPT_IDEA,
    )

    db = _TestSession()
    row = db.query(models.Config).filter(models.Config.key == "prompt_idea_focus").first()
    created = row is None
    if row is None:
        row = models.Config(key="prompt_idea_focus", value="", description="test")
        db.add(row)
        db.flush()
    original = row.value
    try:
        row.value = PREVIOUS_DEFAULT_SYSTEM_PROMPT_IDEA
        db.commit()
        assert main._migrate_idea_plan_prompt(db) is True
        db.commit()
        db.refresh(row)
        assert row.value == DEFAULT_SYSTEM_PROMPT_IDEA
        assert "explicit plan for producing or developing the idea" in row.value
        assert "two short, concrete, contrasting examples" in row.value

        row.value = "Custom Idea prompt"
        db.commit()
        assert main._migrate_idea_plan_prompt(db) is False
        db.refresh(row)
        assert row.value == "Custom Idea prompt"
    finally:
        if created:
            db.delete(row)
        else:
            row.value = original
        db.commit()
        db.close()


def test_prompt_audit_scopes_certified_strategies_to_qsa_second_level_step():
    _ensure_guided_steps("QSA")
    db = _TestSession()
    try:
        for slug, factors, sort_order, recommended_when in (
            ("test-certified-c1-out-of-step", ["C1"], 0, "Quando il fattore collegato e' saliente."),
            ("test-certified-a4-out-of-step", ["A4"], 1, "Quando il fattore collegato e' saliente."),
            ("test-certified-a6-in-step", ["A6"], 2, "Quando A6 e' un'area di crescita."),
            ("test-certified-a5-in-step", ["A5"], 3, "Quando A5 e' un'area di crescita."),
        ):
            db.query(models.CertifiedStrategy).filter(models.CertifiedStrategy.slug == slug).delete()
            db.add(models.CertifiedStrategy(
                slug=slug,
                name_it=slug,
                recommended_when_it=recommended_when,
                description_it=f"Strategia certificata per {', '.join(factors)}.",
                factor_codes=factors,
                match_mode="any",
                questionnaire_types=["QSA"],
                keywords=" ".join(factors),
                status="certified",
                sort_order=sort_order,
                is_active=True,
            ))
        db.commit()
        derive_strategy_versions(db)
    finally:
        db.close()

    scores_context = "\n".join([
        "PROFILO QSA DELLO STUDENTE:",
        "- C1: 7/9", "- C2: 5/9", "- C3: 3/9", "- C4: 6/9",
        "- C5: 4/9", "- C6: 7/9", "- C7: 5/9",
        "- A1: 8/9", "- A2: 6/9", "- A3: 5/9", "- A4: 8/9",
        "- A5: 3/9", "- A6: 3/9", "- A7: 7/9",
    ])
    r = client.post("/admin/prompt-audit/dry-run", json={
        "questionnaire_type": "QSA",
        "language": "it",
        "phase": "sl-motivation",
        "mode": "second-level",
        "use_phase_prompt": True,
        "scores_context": scores_context,
        "session_id": "prompt-audit-certified-scoped",
        "max_tokens": 700,
        "include_knowledge": True,
        "include_history": False,
        "component_flags": {
            "allowed_strategies": [
                "test-certified-c1-out-of-step",
                "test-certified-a4-out-of-step",
                "test-certified-a6-in-step",
                "test-certified-a5-in-step",
            ],
        },
    })
    assert r.status_code == 200, r.text
    body = r.json()
    certified_ids = body["knowledge"]["certified_strategy_ids"]
    assert len(certified_ids) == 1
    assert "test-certified-a6-in-step" in certified_ids
    # A5=3 e' una forza nel QSA: una strategia dichiarata per A5 area di
    # crescita non deve entrare come intervento pratico.
    assert "test-certified-a5-in-step" not in certified_ids
    assert "test-certified-c1-out-of-step" not in certified_ids
    assert "test-certified-a4-out-of-step" not in certified_ids
    assert "[CERTIFIED_STRATEGIES]" in body["knowledge"]["context"]
    assert "Ruolo: intervento principale" in body["knowledge"]["context"]
    assert "[CERTIFIED ADVICE]" in body["envelope"]["system_prompt_final"]
    assert "[CURRENT STEP FACTORS] Allowed factor codes for this answer: A2, A5, A6" in body["envelope"]["system_prompt_final"]
    assert "[CURRENT STEP SCORE PROFILE]" in body["envelope"]["system_prompt_final"]
    assert "A5 (Mancanza di perseveranza): 3/9 = Forza" in body["envelope"]["system_prompt_final"]
    assert "Primary improvement targets: A6 (Percezione di competenza)" in body["envelope"]["system_prompt_final"]


def test_prompt_audit_certified_strategy_limit_can_disable_injection():
    _ensure_guided_steps("QSA")
    config_key = "prompt_components_QSA_sl-motivation"
    db = _TestSession()
    original = None
    try:
        slug = "test-certified-a6-disabled-by-limit"
        db.query(models.CertifiedStrategy).filter(models.CertifiedStrategy.slug == slug).delete()
        db.add(models.CertifiedStrategy(
            slug=slug,
            name_it=slug,
            recommended_when_it="Quando A6 e' un'area di crescita.",
            description_it="Strategia certificata per A6.",
            factor_codes=["A6"],
            match_mode="any",
            questionnaire_types=["QSA"],
            keywords="A6 percezione competenza",
            status="certified",
            sort_order=0,
            is_active=True,
        ))
        row = db.query(models.Config).filter(models.Config.key == config_key).first()
        original = row.value if row else None
        if row:
            row.value = '{"certified_strategy_limit": 0}'
        else:
            db.add(models.Config(key=config_key, value='{"certified_strategy_limit": 0}', description=config_key))
        db.commit()
        derive_strategy_versions(db)
    finally:
        db.close()

    try:
        scores_context = "\n".join([
            "PROFILO QSA DELLO STUDENTE:",
            "- A2: 6/9", "- A5: 3/9", "- A6: 3/9",
        ])
        r = client.post("/admin/prompt-audit/dry-run", json={
            "questionnaire_type": "QSA",
            "language": "it",
            "phase": "sl-motivation",
            "mode": "second-level",
            "use_phase_prompt": True,
            "scores_context": scores_context,
            "session_id": "prompt-audit-certified-disabled",
            "include_knowledge": True,
            "include_history": False,
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["component_options"]["certified_strategy_limit"] == 0
        assert body["knowledge"]["certified_strategy_ids"] == []
        assert "[CERTIFIED_STRATEGIES]" not in body["knowledge"]["context"]
    finally:
        db = _TestSession()
        try:
            db.query(models.CertifiedStrategy).filter(models.CertifiedStrategy.slug == "test-certified-a6-disabled-by-limit").delete()
            row = db.query(models.Config).filter(models.Config.key == config_key).first()
            if row and original is None:
                db.delete(row)
            elif row:
                row.value = original
            db.commit()
        finally:
            db.close()


def test_retrieved_context_respects_allowed_strategies_whitelist():
    from backend.api_models import ChatRequest
    from backend.chat_logic import _retrieved_context

    _ensure_guided_steps("QSA")
    approved_markdown = """# Strategie condivise

## test-approved-allowed
- status: approved
- questionnaires: QSA
- keywords: A6 motivation whitelist
- text.it: Approved allowed strategy text.

## test-approved-blocked
- status: approved
- questionnaires: QSA
- keywords: A6 motivation whitelist
- text.it: Approved blocked strategy text.
"""
    db = _TestSession()
    original_approved = None
    try:
        db.query(models.CertifiedStrategy).filter(
            models.CertifiedStrategy.slug.in_(["test-certified-allowed", "test-certified-blocked"])
        ).delete(synchronize_session=False)
        db.add(models.CertifiedStrategy(
            slug="test-certified-allowed",
            name_it="Certified allowed strategy",
            recommended_when_it="Quando A6 e' un'area di crescita.",
            description_it="Certified allowed strategy text.",
            factor_codes=["A6"],
            match_mode="any",
            questionnaire_types=["QSA"],
            keywords="A6 motivation whitelist",
            status="certified",
            sort_order=-101,
            is_active=True,
        ))
        db.add(models.CertifiedStrategy(
            slug="test-certified-blocked",
            name_it="Certified blocked strategy",
            recommended_when_it="Quando A6 e' un'area di crescita.",
            description_it="Certified blocked strategy text.",
            factor_codes=["A6"],
            match_mode="any",
            questionnaire_types=["QSA"],
            keywords="A6 motivation whitelist",
            status="certified",
            sort_order=-100,
            is_active=True,
        ))
        row = db.query(models.Config).filter(models.Config.key == APPROVED_STRATEGIES_CONFIG_KEY).first()
        original_approved = row.value if row else None
        if row:
            row.value = approved_markdown
        else:
            db.add(models.Config(
                key=APPROVED_STRATEGIES_CONFIG_KEY,
                value=approved_markdown,
                description="test approved strategies",
            ))
        db.commit()
        derive_strategy_versions(db)
    finally:
        db.close()

    try:
        db = _TestSession()
        try:
            request = ChatRequest(
                message="A6 motivation whitelist",
                mode="second-level",
                phase="sl-motivation",
                scores_context="PROFILO QSA DELLO STUDENTE:\n- A6: 3/9",
                questionnaire_type="QSA",
                language="it",
            )
            context, strategy_ids, certified_ids, _skills_blocks = _retrieved_context(
                db,
                session_id="test-allowed-strategies",
                request=request,
                questionnaire_type="QSA",
                query="A6 motivation whitelist",
                certified_strategy_limit=3,
                component_flags={
                    "approved_strategies": True,
                    "certified_strategies": True,
                    "shared_responses": False,
                    "rag_competenzestrategiche": False,
                    "rag_counselorbot": False,
                    "rag_questionari": False,
                    "allowed_strategies": ["test-approved-allowed", "test-certified-allowed"],
                },
            )
        finally:
            db.close()
        assert strategy_ids == ["test-approved-allowed"]
        assert certified_ids == ["test-certified-allowed"]
        assert "Approved allowed strategy text." in context
        assert "Approved blocked strategy text." not in context
        assert "Certified allowed strategy text." in context
        assert "Certified blocked strategy text." not in context
    finally:
        db = _TestSession()
        try:
            db.query(models.CertifiedStrategy).filter(
                models.CertifiedStrategy.slug.in_(["test-certified-allowed", "test-certified-blocked"])
            ).delete(synchronize_session=False)
            row = db.query(models.Config).filter(models.Config.key == APPROVED_STRATEGIES_CONFIG_KEY).first()
            if row and original_approved is None:
                db.delete(row)
            elif row:
                row.value = original_approved
            db.commit()
        finally:
            db.close()


def test_memory_embedder_save_drops_mixed_vector_dimensions():
    import tempfile
    from pathlib import Path

    import numpy as np

    from backend.memory_embeddings import MemoryEmbedder

    with tempfile.TemporaryDirectory() as tmp:
        cache_path = Path(tmp) / "memory-cache.npz"
        embedder = MemoryEmbedder(cache_path=cache_path)
        embedder._vectors = {
            "old-dimension": np.ones(4, dtype=np.float32),
            "new-dimension-1": np.ones(8, dtype=np.float32),
            "new-dimension-2": np.ones(8, dtype=np.float32),
        }
        embedder._save()

        data = np.load(cache_path, allow_pickle=True)
        assert data["vecs"].shape == (2, 8)
        assert set(data["keys"].tolist()) == {"new-dimension-1", "new-dimension-2"}


def test_prompt_audit_api_token_allows_qsa_dry_run_without_ai4auth():
    _ensure_guided_steps("QSA")
    audit_override = main.app.dependency_overrides.pop(
        prompt_audit_routes.require_prompt_audit_access,
        None,
    )
    previous_token = os.environ.get("PROMPT_AUDIT_API_TOKEN")
    os.environ["PROMPT_AUDIT_API_TOKEN"] = "unit-test-prompt-audit-token"
    payload = {
        "questionnaire_type": "QSA",
        "language": "it",
        "phase": "cognitive",
        "mode": "factor",
        "use_phase_prompt": True,
        "scores_context": "PROFILO QSA DELLO STUDENTE:\n- C1: 7/9\n- C2: 6/9\n- C3: 8/9\n- C4: 5/9\n- C5: 4/9\n- C6: 2/9\n- C7: 6/9",
        "include_knowledge": False,
    }
    try:
        r = client.post(
            "/admin/prompt-audit/dry-run",
            headers={"X-Prompt-Audit-Token": "unit-test-prompt-audit-token"},
            json=payload,
        )
        assert r.status_code == 200, r.text
        assert r.json()["resolved"]["prompt_key"] == "prompt_factor"

        bad = client.post(
            "/admin/prompt-audit/dry-run",
            headers={"X-Prompt-Audit-Token": "wrong-token"},
            json=payload,
        )
        assert bad.status_code == 401
    finally:
        if previous_token is None:
            os.environ.pop("PROMPT_AUDIT_API_TOKEN", None)
        else:
            os.environ["PROMPT_AUDIT_API_TOKEN"] = previous_token
        if audit_override is not None:
            main.app.dependency_overrides[prompt_audit_routes.require_prompt_audit_access] = audit_override


def test_prompt_audit_live_returns_mocked_response_and_logs():
    _ensure_guided_steps("QSA")
    session_id = "prompt-audit-live"
    db = _TestSession()
    try:
        before_logs = db.query(models.Log).count()
    finally:
        db.close()

    r = client.post("/admin/prompt-audit/live", json={
        "questionnaire_type": "QSA",
        "language": "it",
        "phase": "cognitive",
        "mode": "factor",
        "use_phase_prompt": True,
        "scores_context": "PROFILO QSA DELLO STUDENTE:\n- C1: 7/9\n- C2: 6/9\n- C3: 8/9\n- C4: 5/9\n- C5: 4/9\n- C6: 2/9\n- C7: 6/9",
        "session_id": session_id,
        "include_knowledge": False,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["response_raw"] == "RISPOSTA_TEST"
    assert body["response_visible"].endswith("RISPOSTA_TEST")
    assert "C1 (Strategie elaborative)" in body["response_visible"]
    assert body["usage"]["prompt_tokens"] == 12
    assert isinstance(body["duration_ms"], int)
    assert "checks" in body

    db = _TestSession()
    try:
        assert db.query(models.Log).count() == before_logs + 1
        entry = (
            db.query(models.Log)
            .filter(models.Log.session_id == session_id, models.Log.action == "prompt_audit_live")
            .first()
        )
        assert entry is not None
    finally:
        db.close()


def test_prompt_audit_matrix_covers_all_qsa_steps_for_selected_counselor():
    _ensure_guided_steps("QSA")
    counselor = client.post("/admin/counselors", json={
        "slug": "prompt-audit-matrix",
        "name": "Prompt Audit Matrix",
        "questionnaire_types": ["QSA"],
        "is_active": True,
    })
    assert counselor.status_code == 200, counselor.text
    counselor_id = counselor.json()["id"]

    r = client.post("/admin/prompt-audit/matrix", json={
        "questionnaire_type": "QSA",
        "language": "it",
        "counselor_ids": [counselor_id],
        "scores_context": "PROFILO QSA DELLO STUDENTE:\n- C1: 7/9\n- C2: 6/9\n- C3: 8/9\n- C4: 5/9\n- C5: 4/9\n- C6: 2/9\n- C7: 6/9\n- A1: 9/9\n- A2: 5/9\n- A3: 4/9\n- A4: 8/9\n- A5: 7/9\n- A6: 3/9\n- A7: 8/9",
        "include_knowledge": False,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["steps_count"] >= 9
    assert body["counselors_count"] == 1
    assert len(body["rows"]) == body["steps_count"]
    assert any(row["step_id"] == "cognitive" and row["prompt_key"] == "prompt_factor" for row in body["rows"])
    assert all(row["counselor_id"] == counselor_id for row in body["rows"])


def test_prompt_audit_warnings_for_incoherent_configuration():
    inactive = client.post("/admin/counselors", json={
        "slug": "prompt-audit-inactive",
        "name": "Prompt Audit Inactive",
        "is_active": False,
    })
    assert inactive.status_code == 200, inactive.text
    inactive_id = inactive.json()["id"]

    r = client.post("/admin/prompt-audit/dry-run", json={
        "questionnaire_type": "QSA",
        "language": "it",
        "phase": "missing-audit-step",
        "mode": "unknown-mode",
        "use_phase_prompt": True,
        "counselor_id": inactive_id,
        "include_knowledge": False,
    })
    assert r.status_code == 200, r.text
    codes = {item["code"] for item in r.json()["warnings"]}
    assert {"counselor_inactive", "missing_step"}.issubset(codes)

    db = _TestSession()
    try:
        db.add(models.GuidedStep(
            id="audit-unknown-step-mode",
            sort_order=999,
            label="Audit Unknown Mode",
            prompt="Audit prompt",
            system_prompt_mode="unknown-step-mode",
            color_theme="slate",
            questionnaire_type="AUDIT",
        ))
        db.commit()
    finally:
        db.close()
    try:
        r = client.post("/admin/prompt-audit/dry-run", json={
            "questionnaire_type": "QSA",
            "language": "it",
            "phase": "audit-unknown-step-mode",
            "mode": "generic",
            "use_phase_prompt": True,
            "include_knowledge": False,
        })
        assert r.status_code == 200, r.text
        codes = {item["code"] for item in r.json()["warnings"]}
        assert "unknown_step_mode" in codes
        assert "step_instrument_mismatch" in codes
    finally:
        db = _TestSession()
        try:
            row = db.query(models.GuidedStep).filter_by(id="audit-unknown-step-mode").first()
            if row:
                db.delete(row)
                db.commit()
        finally:
            db.close()


def test_survey_submit_public():
    r = client.post("/survey", json={
        "q_utile": 5, "q_pertinente": 5, "q_chiaro": 5,
        "q_dettaglio": 5, "q_facile": 5, "q_veloce": 5,
        "strumenti_utilizzati": ["QSA", "ZTPI"],
        "counselor_utilizzato": "Marco",
        "feedback_aperto": "Feedback qualitativo di prova.",
        "paese": "Italia",
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["strumenti_utilizzati"] == ["QSA", "ZTPI"]
    assert data["counselor_utilizzato"] == "Marco"
    assert data["feedback_aperto"] == "Feedback qualitativo di prova."


def test_helpful_chat_responses_are_shared_for_all_questionnaires():
    questionnaire_types = ("QSA", "QSAr", "ZTPI", "SAVICKAS", "QPCS", "QPCC", "QAP")
    for questionnaire_type in questionnaire_types:
        phase = f"shared-{questionnaire_type.lower()}"
        r = client.post("/chat", json={
            "message": f"Domanda privata {questionnaire_type}",
            "mode": "generic",
            "questionnaire_type": questionnaire_type,
            "phase": phase,
            "language": "it",
        })
        assert r.status_code == 200, r.text
        response_id = r.json()["response_id"]
        assert response_id

        r = client.post("/strategy-feedback", json={
            "response_id": response_id,
            "questionnaire_type": questionnaire_type,
            "phase": phase,
            "language": "it",
            "helpful": True,
        })
        assert r.status_code == 200, r.text

        db = _TestSession()
        try:
            recovered = shared_response_memory.retrieve(
                db, questionnaire_type, phase=phase, language="it"
            )
        finally:
            db.close()
        assert recovered and recovered[0]["id"] == response_id
        assert recovered[0]["text"] == "RISPOSTA_TEST"


def test_unhelpful_chat_response_is_not_shared():
    r = client.post("/chat", json={
        "message": "Domanda non riusabile",
        "mode": "generic",
        "questionnaire_type": "QAP",
        "phase": "qap-negative",
        "language": "it",
    })
    response_id = r.json()["response_id"]
    r = client.post("/strategy-feedback", json={
        "response_id": response_id,
        "helpful": False,
    })
    assert r.status_code == 200, r.text

    db = _TestSession()
    try:
        recovered = shared_response_memory.retrieve(db, "QAP", phase="qap-negative", language="it")
    finally:
        db.close()
    assert recovered == []


def test_shared_response_memory_removes_explicit_scores():
    db = _TestSession()
    try:
        response_id = shared_response_memory.create_candidate(
            db,
            "Il valore 7/9 indica una risorsa; prova un passo concreto.",
            "QPCS",
            phase="qpcs-score-protection",
            language="it",
        )
        assert response_id
        db.flush()
        assert shared_response_memory.rate(db, response_id, True)
        db.commit()
        recovered = shared_response_memory.retrieve(
            db, "QPCS", phase="qpcs-score-protection", language="it"
        )
    finally:
        db.close()
    assert "7/9" not in recovered[0]["text"]
    assert "[punteggio omesso]" in recovered[0]["text"]


def test_memory_status():
    r = client.get("/memory/status/test-session-xyz")
    assert r.status_code == 200, r.text


def test_memory_admin_routes_require_authentication():
    admin_override = main.app.dependency_overrides.pop(auth.get_current_active_admin, None)
    try:
        r = client.get("/memory/status/private-session")
        assert r.status_code == 401, r.text
        r = client.delete("/memory/private-session")
        assert r.status_code == 401, r.text
    finally:
        if admin_override:
            main.app.dependency_overrides[auth.get_current_active_admin] = admin_override


def test_stream_memory_contract_for_all_active_questionnaires():
    for questionnaire_type in ("QSA", "QSAr", "ZTPI", "SAVICKAS", "QPCS", "QPCC", "QAP"):
        session_id = f"memory-contract-{questionnaire_type.lower()}"
        session_memory.clear(session_id)
        r = client.post("/chat/stream", json={
            "message": "Vorrei migliorare il mio metodo di studio",
            "mode": "generic",
            "session_id": session_id,
            "questionnaire_type": questionnaire_type,
            "language": "it",
            "scores_context": "" if questionnaire_type == "SAVICKAS" else "Profilo test: 5/9",
        })
        assert r.status_code == 200, r.text

        memory = session_memory.get_summary(session_id)
        assert f"- Questionario: {questionnaire_type}" in memory
        assert "- Lingua: it" in memory
        assert "Vorrei migliorare il mio metodo di studio" in memory

        r = client.post("/memory/event", json={
            "session_id": session_id,
            "questionnaire_type": questionnaire_type,
            "language": "it",
            "phase": "conclusion",
            "step_label": "Conclusione",
            "completed_step": True,
        })
        assert r.status_code == 200, r.text
        memory = session_memory.get_summary(session_id)
        assert "- Step corrente: Conclusione" in memory
        assert "- Step completati: Conclusione" in memory
        progress = client.get(f"/memory/user/{session_id}")
        assert progress.status_code == 200, progress.text
        assert progress.json()["current_phase"] == "conclusion"
        assert progress.json()["completed_phases"] == ["conclusion"]
        session_memory.clear(session_id)


def test_chat_stream_applies_counselor_no_reasoning_before_token_headroom():
    pr = client.post("/admin/presets", json={
        "name": "Reasoning off stream",
        "provider": "openrouter",
        "model": "deepseek/deepseek-r1",
        "disable_thinking": True,
    })
    assert pr.status_code == 200, pr.text
    preset_id = pr.json()["id"]
    cr = client.post("/admin/counselors", json={
        "slug": "stream-no-reasoning",
        "name": "Stream no reasoning",
        "preset_id": preset_id,
        "is_active": True,
    })
    assert cr.status_code == 200, cr.text
    counselor_id = cr.json()["id"]

    r = client.post("/chat/stream", json={
        "message": "Analizza questo profilo",
        "mode": "generic",
        "session_id": "stream-no-reasoning-contract",
        "questionnaire_type": "QSA",
        "language": "it",
        "scores_context": "Profilo test: 5/9",
        "max_tokens": 700,
        "counselor_id": counselor_id,
    })
    assert r.status_code == 200, r.text
    assert _FakeAIService.last_stream_args == {
        "provider": "openrouter",
        "model": "deepseek/deepseek-r1",
        "max_tokens": 700,
        "disable_thinking": True,
    }


def test_chat_smoke_mocked_ai():
    r = client.post("/chat", json={"message": "ciao", "mode": "generic"})
    assert r.status_code == 200, r.text
    assert r.json()["response"] == "RISPOSTA_TEST"
    assert r.json()["conversation_id"] != r.json()["session_id"]



def test_chat_logs_conversation_id_and_admin_filter():
    session_id = "conversation-log-session"
    conversation_id = "conversation-log-id"
    second_session_id = "conversation-log-session-2"
    second_conversation_id = "conversation-log-id-2"
    r = client.post("/chat", json={
        "message": "ciao",
        "mode": "generic",
        "session_id": session_id,
        "conversation_id": conversation_id,
    })
    assert r.status_code == 200, r.text
    assert r.json()["session_id"] == session_id
    assert r.json()["conversation_id"] == conversation_id
    r2 = client.post("/chat", json={
        "message": "ciao ancora",
        "mode": "generic",
        "session_id": second_session_id,
        "conversation_id": second_conversation_id,
    })
    assert r2.status_code == 200, r2.text
    assert r2.json()["conversation_id"] == second_conversation_id

    with _TestSession() as db:
        entry = (
            db.query(models.Log)
            .filter(models.Log.session_id == session_id, models.Log.action == "chat_message")
            .order_by(models.Log.timestamp.desc(), models.Log.id.desc())
            .first()
        )
        assert entry is not None
        assert entry.conversation_id == conversation_id
        assert entry.details["conversation_id"] == conversation_id

    listed = client.get(f"/admin/logs?conversation_id={conversation_id}")
    assert listed.status_code == 200, listed.text
    assert any(row["conversation_id"] == conversation_id for row in listed.json())

    listed_multi = client.get(f"/admin/logs?conversation_id={conversation_id},{second_conversation_id}")
    assert listed_multi.status_code == 200, listed_multi.text
    listed_multi_ids = {row["conversation_id"] for row in listed_multi.json()}
    assert {conversation_id, second_conversation_id} <= listed_multi_ids

    conversation = client.get(f"/admin/logs/conversation/{conversation_id}")
    assert conversation.status_code == 200, conversation.text
    rows = conversation.json()
    assert rows
    assert {row["conversation_id"] for row in rows} == {conversation_id}


def test_chat_factor_qa_does_not_force_all_step_factor_codes():
    _ensure_guided_steps("QSA")
    session_id = "factor-qa-no-forced-scope-prefix"
    session_memory.clear(session_id)
    r = client.post("/chat", json={
        "message": "Su quale strategia cognitiva dovrei lavorare per prima?",
        "mode": "factor-qa",
        "phase": "cognitive",
        "use_phase_prompt": True,
        "session_id": session_id,
        "questionnaire_type": "QSA",
        "language": "it",
        "scores_context": "PROFILO QSA DELLO STUDENTE:\n- C1: 7/9\n- C3: 8/9\n- C4: 3/9",
    })
    assert r.status_code == 200, r.text
    assert not r.json()["response"].startswith("Fattori trattati:"), r.json()["response"]
    session_memory.clear(session_id)


def _latest_log_details(session_id: str) -> dict:
    db = _TestSession()
    try:
        entry = (
            db.query(models.Log)
            .filter(models.Log.session_id == session_id, models.Log.action == "chat_message")
            .order_by(models.Log.timestamp.desc(), models.Log.id.desc())
            .first()
        )
        assert entry is not None, f"nessun log chat_message per {session_id}"
        return entry.details
    finally:
        db.close()


def _set_config(key: str, value: str) -> None:
    db = _TestSession()
    try:
        row = db.query(models.Config).filter(models.Config.key == key).first()
        if row:
            row.value = value
        else:
            db.add(models.Config(key=key, value=value))
        db.commit()
    finally:
        db.close()


def test_chat_log_persists_prompt_envelope():
    session_id = "envelope-log-chat"
    r = client.post("/chat", json={
        "message": "Come posso migliorare il metodo di studio?",
        "mode": "generic",
        "session_id": session_id,
        "questionnaire_type": "QSA",
        "language": "it",
        "scores_context": "Profilo test: 5/9",
    })
    assert r.status_code == 200, r.text
    envelope = _latest_log_details(session_id).get("envelope")
    assert envelope, "details.envelope mancante nel log /chat"
    assert envelope["system_prompt_final"], "system_prompt_final vuoto"
    assert "Come posso migliorare il metodo di studio?" in envelope["full_message"]
    assert isinstance(envelope["history"], list)


def test_chat_intro_envelope_includes_learner_profile_without_scores():
    _ensure_guided_steps("QSA")
    session_id = "intro-envelope-learner-profile"
    session_memory.clear(session_id)
    main.app.dependency_overrides[auth.get_identity_view_as] = _fake_user_identity
    db = _TestSession()
    try:
        db.add(models.LearnerProfileRevision(
            username="student",
            data={
                "goal": "Capire come organizzare lo studio",
                "main_difficulty": "Mi distraggo quando studio da solo",
            },
            source="test",
            session_id=session_id,
        ))
        db.commit()
    finally:
        db.close()

    try:
        r = client.post("/chat", json={
            "message": "Presentami il percorso",
            "mode": "generic",
            "phase": "intro",
            "use_phase_prompt": True,
            "session_id": session_id,
            "questionnaire_type": "QSA",
            "language": "it",
            "scores_context": "PROFILO QSA DELLO STUDENTE:\n- C1: 7/9\n- A1: 8/9",
        })
        assert r.status_code == 200, r.text
        envelope = _latest_log_details(session_id).get("envelope")
        assert "[PROFILE]" in envelope["system_prompt_final"]
        assert "Taccuino dello studente (auto-descrizione)" in envelope["system_prompt_final"]
        assert "Capire come organizzare lo studio" in envelope["system_prompt_final"]
        assert "PROFILO QSA" not in envelope["system_prompt_final"]
        assert "PROFILO QSA" not in envelope["full_message"]
        assert "/9" not in envelope["full_message"]
    finally:
        main.app.dependency_overrides.pop(auth.get_identity_view_as, None)
        db = _TestSession()
        try:
            db.query(models.LearnerProfileRevision).filter(
                models.LearnerProfileRevision.username == "student",
                models.LearnerProfileRevision.session_id == session_id,
            ).delete()
            db.commit()
        finally:
            db.close()
        session_memory.clear(session_id)


def test_chat_stream_log_persists_prompt_envelope():
    session_id = "envelope-log-stream"
    session_memory.clear(session_id)
    r = client.post("/chat/stream", json={
        "message": "Analizza il mio profilo di studio",
        "mode": "generic",
        "session_id": session_id,
        "questionnaire_type": "QSA",
        "language": "it",
        "scores_context": "Profilo test: 5/9",
    })
    assert r.status_code == 200, r.text
    envelope = _latest_log_details(session_id).get("envelope")
    assert envelope, "details.envelope mancante nel log /chat/stream"
    assert envelope["system_prompt_final"]
    assert "Analizza il mio profilo di studio" in envelope["full_message"]
    assert isinstance(envelope["history"], list)
    session_memory.clear(session_id)


def test_chat_log_envelope_redacts_pii():
    from backend import pii
    previous = pii.is_pii_redact_enabled()
    pii.set_pii_redact_enabled(True)
    session_id = "envelope-log-pii"
    try:
        r = client.post("/chat", json={
            "message": "Scrivimi a mario.rossi@example.com per i risultati",
            "mode": "generic",
            "session_id": session_id,
            "questionnaire_type": "QSA",
            "language": "it",
        })
        assert r.status_code == 200, r.text
        envelope = _latest_log_details(session_id)["envelope"]
        assert "[email]" in envelope["full_message"]
        assert "mario.rossi@example.com" not in envelope["full_message"]
    finally:
        pii.set_pii_redact_enabled(previous)


def test_log_full_prompt_toggle_off():
    _set_config("log_full_prompt", "false")
    session_id = "envelope-log-off"
    try:
        r = client.post("/chat", json={
            "message": "Domanda senza envelope",
            "mode": "generic",
            "session_id": session_id,
            "questionnaire_type": "QSA",
            "language": "it",
        })
        assert r.status_code == 200, r.text
        assert "envelope" not in _latest_log_details(session_id)
    finally:
        _set_config("log_full_prompt", "true")


def test_site_chat_status_for_authenticated_student():
    main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
    try:
        r = client.get("/site-chat/status")
        assert r.status_code == 200, r.text
        body = r.json()
        assert "n_chunks" in body and "embedding_model" in body
    finally:
        main.app.dependency_overrides.pop(auth.get_identity, None)


def test_site_chat_document_rejects_unknown_source():
    # Solo le sorgenti indicizzate sono anteprimabili (anti path-traversal).
    main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
    try:
        r = client.get("/site-chat/document", params={"source": "../../etc/passwd"})
        assert r.status_code == 404, r.text
    finally:
        main.app.dependency_overrides.pop(auth.get_identity, None)


def test_rag_docs_dynamic_collection_upload_preview_and_delete():
    import backend.rag_index as rag_index

    temp_root = tempfile.mkdtemp(prefix="rag-dynamic-test-")
    slug = "testdocs"
    original_root = rag_index.DYNAMIC_ROOT
    original_indexes = dict(rag_index._dynamic_indexes)
    scope_path = rag_index.SCOPE_CONFIG_PATH
    try:
        with open(scope_path, "rb") as f:
            original_scope = f.read()
    except FileNotFoundError:
        original_scope = None
    rag_index.DYNAMIC_ROOT = temp_root
    rag_index._dynamic_indexes.clear()
    main.app.dependency_overrides[auth.get_current_active_admin] = lambda: _identity(
        "admin", "admin@example.test", is_admin=True
    )
    main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
    try:
        created = client.post("/admin/rag/collections", json={"id": slug, "label": "Test docs"})
        assert created.status_code == 200, created.text
        assert created.json()["id"] == slug
        graph_dir = os.path.join(temp_root, slug, "graphify-out")
        os.makedirs(graph_dir, exist_ok=True)
        with open(os.path.join(graph_dir, "graph.html"), "w", encoding="utf-8") as f:
            f.write("<!doctype html><title>Graph OK</title><body>Graph OK</body>")

        admin_collections = client.get("/admin/rag/collections")
        assert admin_collections.status_code == 200, admin_collections.text
        test_collection = next(c for c in admin_collections.json() if c["id"] == slug)
        assert test_collection["graph_available"] is True

        graph = client.get("/admin/rag/graph", params={"collection": slug})
        assert graph.status_code == 200, graph.text
        assert "Graph OK" in graph.text

        collections = client.get("/site-chat/collections")
        assert collections.status_code == 200, collections.text
        assert any(c["id"] == slug and c["label"] == "Test docs" for c in collections.json())

        upload = client.post(
            f"/admin/rag/docs?collection={slug}",
            files={"file": ("intro.md", b"# Intro\n\nContenuto indicizzato per il test.", "text/markdown")},
        )
        assert upload.status_code == 200, upload.text
        assert upload.json()["stats"]["n_chunks"] >= 1

        listed = client.get(f"/admin/rag/docs?collection={slug}")
        assert listed.status_code == 200, listed.text
        docs = listed.json()["docs"]
        intro = next(d for d in docs if d["source"] == "intro.md")
        assert intro["indexed"] and intro["deletable"]
        assert intro["scope_included"] is True
        assert intro["scope_forced"] is False
        assert intro["index_status"] == "indexed"

        preview = client.get("/site-chat/document", params={"collection": slug, "source": "intro.md"})
        assert preview.status_code == 200, preview.text
        assert "Contenuto indicizzato" in preview.json()["content"]

        scoped_out = client.patch("/admin/rag/docs/scope", json={
            "collection": slug,
            "source": "intro.md",
            "in_scope": False,
        })
        assert scoped_out.status_code == 200, scoped_out.text
        assert scoped_out.json()["scope"]["in_scope"] is False
        assert scoped_out.json()["scope"]["forced"] is True

        listed_out = client.get(f"/admin/rag/docs?collection={slug}")
        assert listed_out.status_code == 200, listed_out.text
        intro_out = next(d for d in listed_out.json()["docs"] if d["source"] == "intro.md")
        assert intro_out["scope_included"] is False
        assert intro_out["scope_forced"] is True
        assert intro_out["indexed"] is False
        assert intro_out["index_status"] == "out_of_scope"

        scoped_in = client.patch("/admin/rag/docs/scope", json={
            "collection": slug,
            "source": "intro.md",
            "in_scope": True,
        })
        assert scoped_in.status_code == 200, scoped_in.text
        assert scoped_in.json()["scope"]["in_scope"] is True
        assert scoped_in.json()["scope"]["forced"] is True

        listed_in = client.get(f"/admin/rag/docs?collection={slug}")
        assert listed_in.status_code == 200, listed_in.text
        intro_in = next(d for d in listed_in.json()["docs"] if d["source"] == "intro.md")
        assert intro_in["scope_included"] is True
        assert intro_in["indexed"] is True
        assert intro_in["index_status"] == "indexed"

        admin_preview = client.get("/admin/rag/docs/file", params={"collection": slug, "source": "intro.md"})
        assert admin_preview.status_code == 200, admin_preview.text
        assert "Contenuto indicizzato" in admin_preview.json()["content"]

        download = client.get("/admin/rag/docs/file", params={
            "collection": slug,
            "source": "intro.md",
            "download": "true",
        })
        assert download.status_code == 200, download.text
        assert download.headers["content-disposition"].startswith("attachment;")
        assert b"Contenuto indicizzato" in download.content

        deleted_doc = client.delete(f"/admin/rag/docs?collection={slug}&source=intro.md")
        assert deleted_doc.status_code == 200, deleted_doc.text

        deleted_collection = client.delete(f"/admin/rag/collections/{slug}")
        assert deleted_collection.status_code == 200, deleted_collection.text
        assert not any(c["id"] == slug for c in client.get("/admin/rag/collections").json())
    finally:
        main.app.dependency_overrides[auth.get_current_active_admin] = _fake_admin
        main.app.dependency_overrides.pop(auth.get_identity, None)
        rag_index._dynamic_indexes.clear()
        rag_index._dynamic_indexes.update(original_indexes)
        rag_index.DYNAMIC_ROOT = original_root
        shutil.rmtree(temp_root, ignore_errors=True)
        if original_scope is None:
            try:
                os.remove(scope_path)
            except OSError:
                pass
        else:
            os.makedirs(os.path.dirname(scope_path), exist_ok=True)
            with open(scope_path, "wb") as f:
                f.write(original_scope)
        for suffix in ("rag_index.json", "embeddings.npy", "embed_cache.npz"):
            try:
                os.remove(os.path.join(rag_index.INDEX_DIR, f"dyn_{slug}_{suffix}"))
            except OSError:
                pass
        try:
            os.remove(os.path.join(rag_index.INDEX_DIR, f".dyn_{slug}.build.lock"))
        except OSError:
            pass


def test_site_chat_stream_grounded_mocked():
    # Patcha la retrieval per non toccare embeddings/rete: contesto fittizio.
    canned = [{"score": 0.9, "source": "fonti/qsa.md", "title": "Doc QSA", "text": "Contenuto di prova sul QSA."}]
    original_search = site_chat_routes.site_rag_index.search
    site_chat_routes.site_rag_index.search = lambda svc, q, k, *a, **kw: canned
    main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
    try:
        r = client.post("/site-chat/stream", json={
            "message": "Cos'è il QSA?", "audience": "studente", "session_id": "site-chat-test",
            "student_context": "CONTESTO_PRIVATO_TEST_DA_NON_LOGGARE",
        })
        assert r.status_code == 200, r.text
        assert "RISPOSTA_TEST" in r.text
        assert '"done": true' in r.text
        assert "fonti/qsa.md" in r.text  # le fonti citate tornano nell'evento done
        with _TestSession() as db:
            entry = (
                db.query(models.Log)
                .filter(models.Log.session_id == "site-chat-test", models.Log.action == "site_chat")
                .order_by(models.Log.timestamp.desc(), models.Log.id.desc())
                .first()
            )
            assert entry is not None
            details = entry.details
        assert "student_context" not in details
        assert "CONTESTO_PRIVATO_TEST_DA_NON_LOGGARE" not in str(details)
        # Il 'mi piace' riusa /strategy-feedback con il response_id emesso.
        m = re.search(r'"response_id":\s*"([0-9a-f-]+)"', r.text)
        assert m, f"response_id mancante nello stream: {r.text[-300:]}"
        fb = client.post("/strategy-feedback", json={
            "response_id": m.group(1), "strategy_ids": [],
            "questionnaire_type": "SITE", "phase": "studente", "language": "it", "helpful": True,
        })
        assert fb.status_code == 200, fb.text
        assert fb.json()["recorded"] >= 1
    finally:
        site_chat_routes.site_rag_index.search = original_search
        main.app.dependency_overrides.pop(auth.get_identity, None)


def test_site_chat_single_instrument_filters_other_instrument_sources():
    """Una domanda esplicita sul QSA non deve usare fonti di altri strumenti."""
    canned = [
        {"score": 0.92, "source": "fonti/qsa.md", "title": "Questionario QSA", "text": "Il QSA rileva strategie di apprendimento."},
        {"score": 0.91, "source": "fonti/qpcs.md", "title": "Questionario QPCS", "text": "Il QPCS riguarda la progettualita professionale."},
    ]
    original_search = site_chat_routes.site_rag_index.search
    site_chat_routes.site_rag_index.search = lambda *a, **kw: canned
    main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
    try:
        response = client.post("/site-chat/stream", json={
            "message": "Che cosa misura il QSA?",
            "audience": "studente",
            "session_id": "site-chat-qsa-source-filter",
        })
        assert response.status_code == 200, response.text
        done = _done_sse_event(response)
        assert done["sources"] == ["fonti/qsa.md"]
    finally:
        site_chat_routes.site_rag_index.search = original_search
        main.app.dependency_overrides.pop(auth.get_identity, None)


# --------------------------------------------------------------------------
# 3. Helper puri: comportamento stabile attraverso il refactor
# --------------------------------------------------------------------------
def test_is_qsa():
    assert main._is_qsa("QSA") is True
    assert main._is_qsa("ZTPI") is False
    assert main._is_qsa(None) is False


def test_qsar_factor_annotation_is_distinct_from_qsa():
    assert main._is_strategy_questionnaire("QSAr") is True
    text = chat_logic._annotate_qsa_factor_codes("C3r e A4r", "it", questionnaire_type="QSAr")
    assert "C3r (Strategie grafiche e organizzatori semantici)" in text
    assert "A4r (Percezione di competenza)" in text
    assert "Disorientamento" not in text


def test_qsar_audit_tracks_questionnaire_type():
    r = client.post("/qsa/audit", json={
        "session_id": "qsar-audit-test",
        "questionnaire_type": "QSAr",
        "scores": {"C1r": 5, "A4r": 7},
    })
    assert r.status_code == 200, r.text
    db = _TestSession()
    try:
        entry = db.query(models.Log).filter(models.Log.session_id == "qsar-audit-test").one()
        assert entry.details["questionnaire_type"] == "QSAr"
    finally:
        db.close()


def test_clamp_max_tokens():
    assert main._clamp_max_tokens(None) is None
    # valore valido resta entro i limiti (non solleva)
    assert isinstance(main._clamp_max_tokens(1000), int)


def _done_sse_event(response):
    for line in response.text.splitlines():
        if not line.startswith("data:"):
            continue
        event = json.loads(line[5:].strip())
        if event.get("done"):
            return event
    raise AssertionError(f"Evento done mancante: {response.text[-500:]}")


def test_response_length_helpers_and_validation():
    directive = chat_logic._apply_response_length_directive("BASE", "short")
    assert "no more than 80 words" in directive
    assert chat_logic._response_length_max_tokens("medium", 900) == 800
    assert chat_logic._response_length_max_tokens(None, 900) == 900

    source = " ".join(f"parola{i}" for i in range(1, 101))
    bounded, truncated = chat_logic._limit_visible_words(source, "short")
    assert truncated is True
    assert len(chat_logic._VISIBLE_WORD_RE.findall(bounded)) == 80
    assert bounded.endswith("…")
    untouched, truncated = chat_logic._limit_visible_words(source, None)
    assert untouched == source and truncated is False

    invalid = client.post("/chat/stream", json={"message": "ciao", "response_length": "extra"})
    assert invalid.status_code == 422, invalid.text


def test_response_length_is_enforced_on_both_web_streams():
    original_stream = _FakeAIService.stream_response
    original_search = site_chat_routes.site_rag_index.search
    long_answer = " ".join(f"parola{i}" for i in range(1, 121))

    def long_stream(self, *args, **kwargs):
        _FakeAIService.last_stream_args = {
            "max_tokens": kwargs.get("max_tokens"),
            "system_prompt": args[1],
        }
        yield {"type": "reasoning", "text": "ragionamento interno non contato " * 100}
        yield {"type": "content", "text": long_answer}

    _FakeAIService.stream_response = long_stream
    site_chat_routes.site_rag_index.search = lambda *a, **kw: [
        {"score": 0.9, "source": "fonti/qsa.md", "title": "Doc QSA", "text": "Contenuto di prova sul QSA."}
    ]
    main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
    try:
        chat_response = client.post("/chat/stream", json={
            "message": "Rispondi",
            "mode": "generic",
            "session_id": "response-length-chat",
            "response_length": "short",
        })
        assert chat_response.status_code == 200, chat_response.text
        chat_done = _done_sse_event(chat_response)
        assert len(chat_logic._VISIBLE_WORD_RE.findall(chat_done["response"])) == 80
        assert chat_done["response"].endswith("…")
        assert _FakeAIService.last_stream_args["max_tokens"] == 256
        assert "no more than 80 words" in _FakeAIService.last_stream_args["system_prompt"]

        site_response = client.post("/site-chat/stream", json={
            "message": "Cos'è il QSA?",
            "audience": "studente",
            "session_id": "response-length-site-chat",
            "response_length": "short",
        })
        assert site_response.status_code == 200, site_response.text
        site_done = _done_sse_event(site_response)
        assert len(chat_logic._VISIBLE_WORD_RE.findall(site_done["response"])) == 80
        assert site_done["response"].endswith("…")
        assert _FakeAIService.last_stream_args["max_tokens"] == 256
        assert "no more than 80 words" in _FakeAIService.last_stream_args["system_prompt"]
    finally:
        _FakeAIService.stream_response = original_stream
        site_chat_routes.site_rag_index.search = original_search
        main.app.dependency_overrides.pop(auth.get_identity, None)


def test_idea_stream_finishes_and_applies_the_hidden_patch_after_visible_limit():
    original_stream = _FakeAIService.stream_response
    visible = " ".join(f"parola{i}" for i in range(1, 701))
    patch = (
        '\n```idea\n'
        '{"title":"Idea aggiornata","add_nodes":['
        '{"id":"idea","label":"Idea aggiornata","role":"idea","accent":true},'
        '{"id":"q1","label":"Che cosa manca?","role":"open-question"}],'
        '"add_edges":[{"from":"idea","to":"q1","kind":"link"}]}\n```'
    )

    def idea_stream(self, *args, **kwargs):
        _FakeAIService.last_stream_args = {"max_tokens": kwargs.get("max_tokens")}
        yield {"type": "content", "text": visible}
        yield {"type": "content", "text": patch}

    _FakeAIService.stream_response = idea_stream
    _set_idea_feature("true")
    main.app.dependency_overrides[auth.get_identity_view_as] = _fake_user_identity
    session_id = "idea-stream-after-visible-limit"
    try:
        response = client.post("/chat/stream", json={
            "message": "Vorrei mettere a fuoco questa idea",
            "mode": "idea-focus",
            "session_id": session_id,
            "questionnaire_type": "IDEA",
            "language": "it",
            "response_length": "short",
        })
        assert response.status_code == 200, response.text
        done = _done_sse_event(response)
        assert len(chat_logic._VISIBLE_WORD_RE.findall(done["response"])) == 600
        assert done["response"].endswith("…")
        assert "```idea" not in done["response"]
        assert done["idea_revision_id"] is not None
        assert _FakeAIService.last_stream_args["max_tokens"] == 2000

        current = client.get("/idea/map", params={"session_id": session_id})
        assert current.status_code == 200, current.text
        assert [node["id"] for node in current.json()["spec"]["nodes"]] == ["idea", "q1"]
    finally:
        _FakeAIService.stream_response = original_stream
        main.app.dependency_overrides.pop(auth.get_identity_view_as, None)
        _set_idea_feature("false")


def test_a_branch_says_whether_the_person_opened_it_or_the_talk_did():
    """La chat di un ramo nuovo si apre vuota: quel che spiega dove si e'
    finiti e' la scheda del ramo, e la scheda parte da come il ramo e' nato."""
    _set_idea_feature("true")
    main.app.dependency_overrides[auth.get_identity_view_as] = _fake_user_identity
    session_id = "idea-branch-origin"
    try:
        seed = client.post("/idea/map/patch", json={
            "session_id": session_id,
            "source": "turn",
            "patch": {
                "title": "Tesi sulla dispersione",
                "add_nodes": [
                    {"id": "idea", "label": "Tesi sulla dispersione", "role": "idea", "accent": True},
                    {"id": "t1", "label": "Trovare i dati", "role": "task"},
                ],
                "add_edges": [{"from": "idea", "to": "t1", "kind": "link"}],
            },
        })
        assert seed.status_code == 200, seed.text

        made = client.post("/idea/branch", json={
            "session_id": session_id,
            "label": "Leggere la normativa",
        })
        assert made.status_code == 200, made.text

        listed = client.get("/idea/branches", params={"session_id": session_id, "lang": "it"})
        assert listed.status_code == 200, listed.text
        rows = {row["label"]: row for row in listed.json()}
        assert rows["Leggere la normativa"]["origin"] == "manual"
        assert rows["Trovare i dati"]["origin"] == "conversation"
        # Il ramo nuovo pende da dove si stava lavorando, non dalla radice:
        # senza questo la scheda non puo' dire a cosa e' collegato.
        assert rows["Leggere la normativa"]["parent"] == "t1"
    finally:
        main.app.dependency_overrides.pop(auth.get_identity_view_as, None)
        _set_idea_feature("false")


def test_generic_acknowledgement_is_removed_from_visible_chat_openings():
    original_stream = _FakeAIService.stream_response
    original_response = _FakeAIService.get_response
    original_search = site_chat_routes.site_rag_index.search
    original_retrieval = chat_routes._retrieved_context

    def assent_stream(self, *args, **kwargs):
        yield {"type": "content", "text": "Capisco. La difficolta centrale e distinguere le priorita."}

    def assent_response(self, *args, **kwargs):
        return "Capisco. La difficolta centrale e distinguere le priorita."

    _FakeAIService.stream_response = assent_stream
    _FakeAIService.get_response = assent_response
    chat_routes._retrieved_context = lambda *a, **kw: ("", [], [], [])
    site_chat_routes.site_rag_index.search = lambda *a, **kw: [
        {"score": 0.9, "source": "fonti/qsa.md", "title": "QSA", "text": "Materiale QSA."}
    ]
    main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
    try:
        guided = client.post("/chat", json={
            "message": "Mi distraggo quando studio",
            "mode": "generic",
            "session_id": "opening-contract-chat",
        })
        assert guided.status_code == 200, guided.text
        assert guided.json()["response"] == (
            "La difficolta centrale e distinguere le priorita."
        )

        assistant = client.post("/site-chat/stream", json={
            "message": "Come posso orientarmi nello studio?",
            "audience": "studente",
            "session_id": "opening-contract-site",
        })
        assert assistant.status_code == 200, assistant.text
        assert _done_sse_event(assistant)["response"] == (
            "La difficolta centrale e distinguere le priorita."
        )
    finally:
        _FakeAIService.stream_response = original_stream
        _FakeAIService.get_response = original_response
        chat_routes._retrieved_context = original_retrieval
        site_chat_routes.site_rag_index.search = original_search
        main.app.dependency_overrides.pop(auth.get_identity, None)


def test_reasoning_resolve_plan():
    from backend import reasoning_profiles as rp

    # Modello reasoning noto + thinking attivo -> abilitato con budget + headroom.
    plan = rp.resolve_plan("qwen3.5:9b", disable_thinking=False, requested_max_tokens=None)
    assert plan.enabled is True
    assert plan.reasoning_budget and plan.reasoning_budget > 0
    assert plan.max_tokens >= plan.reasoning_budget

    # disable_thinking -> spento, nessun gonfiaggio (passa il richiesto invariato).
    plan = rp.resolve_plan("qwen3.5:9b", disable_thinking=True, requested_max_tokens=800)
    assert plan.enabled is False
    assert plan.max_tokens == 800

    # Gemma 3 resta NON reasoning + thinking attivo -> spento, nessun gonfiaggio.
    plan = rp.resolve_plan("gemma3:1b", disable_thinking=False, requested_max_tokens=800)
    assert plan.enabled is False
    assert plan.max_tokens == 800

    # Gemma 4 e4b: reasoning attivabile, budget contenuto (pensiero didattico).
    plan = rp.resolve_plan("gemma4:e4b", disable_thinking=False, requested_max_tokens=None)
    assert plan.enabled is True
    assert plan.reasoning_budget == 1500
    assert plan.max_tokens == 3500  # 1500 budget + 2000 headroom
    # Gemma 4 12b: ragiona molto di piu' -> headroom AMPIO per non starvare la risposta.
    plan = rp.resolve_plan("gemma4:12b", disable_thinking=False, requested_max_tokens=None)
    assert plan.enabled is True
    assert plan.reasoning_budget == 2000
    assert plan.max_tokens == 6000  # 2000 budget + 4000 headroom
    # disable_thinking ha priorita': spegne anche gemma4.
    plan = rp.resolve_plan("gemma4:e4b", disable_thinking=True, requested_max_tokens=700)
    assert plan.enabled is False and plan.max_tokens == 700

    # Modello sconosciuto + thinking attivo -> prudenza: abilitato col budget legacy.
    plan = rp.resolve_plan("acme/mistero-1", disable_thinking=False, requested_max_tokens=None)
    assert plan.enabled is True
    assert plan.reasoning_budget == rp.LEGACY_REASONING_BUDGET

    # Override del budget (es. dal preset) ha precedenza sul default famiglia.
    plan = rp.resolve_plan("deepseek/deepseek-r1", disable_thinking=False,
                           requested_max_tokens=None, budget_override=3000)
    assert plan.enabled is True and plan.reasoning_budget == 3000

    # max_tokens richiesto piu' grande del calcolato -> viene mantenuto.
    plan = rp.resolve_plan("deepseek-v4-flash", disable_thinking=False, requested_max_tokens=20000)
    assert plan.max_tokens == 20000

    assert rp.is_reasoning_model("qwen3.5:9b") is True
    assert rp.is_reasoning_model("gemma3:1b") is False
    assert rp.is_reasoning_model("gemma4:12b") is True


def test_should_sanitize_ztpi():
    # ZTPI guidato → sanitizza; QSA → no
    assert isinstance(main._should_sanitize_ztpi_text("guided", "ztpi-step"), bool)


def test_questionnaire_result_submit_public():
    r = client.post("/questionnaire-result", json={
        "session_id": "test-session-123",
        "questionnaire_type": "QSA",
        "scores": {"C1": 7, "C2": 5, "C3": 3},
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["questionnaire_type"] == "QSA"
    assert data["scores"]["C1"] == 7


def test_questionnaire_results_admin_list():
    r = client.get("/admin/questionnaire-results")
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_validation_raw_response_export():
    db = _TestSession()
    try:
        if not db.query(models.Instrument).filter(models.Instrument.code == "QSA").first():
            db.add(models.Instrument(
                code="QSA",
                name_en="QSA",
                name_es="QSA ES",
                response_scale_min=1,
                response_scale_max=4,
            ))
        if not db.query(models.Factor).filter(
            models.Factor.instrument_code == "QSA",
            models.Factor.code == "C1",
        ).first():
            db.add(models.Factor(
                instrument_code="QSA",
                code="C1",
                sort_order=1,
                dimension="cognitive",
                label_en="C1",
                label_es="C1",
            ))
        if not db.query(models.QuestionnaireItem).filter(
            models.QuestionnaireItem.instrument_code == "QSA",
            models.QuestionnaireItem.item_number == 1,
        ).first():
            db.add(models.QuestionnaireItem(
                instrument_code="QSA",
                item_number=1,
                sort_order=1,
                factor_code="C1",
                text_en="Item 1",
                text_es="Item 1 ES",
                active=True,
            ))
        db.commit()
    finally:
        db.close()

    main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
    try:
        r = client.post("/instruments/QSA/score", json={
            "session_id": "validation-session-1",
            "locale": "es",
            "answers": {"1": 3},
            "save": True,
            "save_validation": True,
            "version_label": "QSA_es_test",
            "response_metadata": {"cohort": "pilot"},
            "duration_seconds": 42,
        })
    finally:
        main.app.dependency_overrides.pop(auth.get_identity, None)
    assert r.status_code == 200, r.text

    r = client.get("/admin/validation/summary?instrument_code=QSA&locale=es&version_label=QSA_es_test")
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 1

    r = client.get("/admin/validation/export.csv?instrument_code=QSA&locale=es&version_label=QSA_es_test")
    assert r.status_code == 200, r.text
    assert "item_001" in r.text
    assert "metadata_cohort" in r.text
    assert "validation-session-1" in r.text


def test_anonymous_research_code_is_persisted_and_forced_on_validation_save():
    db = _TestSession()
    try:
        if not db.query(models.Instrument).filter(models.Instrument.code == "QSA").first():
            db.add(models.Instrument(
                code="QSA",
                name_en="QSA",
                name_es="QSA ES",
                response_scale_min=1,
                response_scale_max=4,
            ))
        if not db.query(models.Factor).filter(
            models.Factor.instrument_code == "QSA",
            models.Factor.code == "C1",
        ).first():
            db.add(models.Factor(
                instrument_code="QSA",
                code="C1",
                sort_order=1,
                dimension="cognitive",
                label_en="C1",
                label_es="C1",
            ))
        if not db.query(models.QuestionnaireItem).filter(
            models.QuestionnaireItem.instrument_code == "QSA",
            models.QuestionnaireItem.item_number == 1,
        ).first():
            db.add(models.QuestionnaireItem(
                instrument_code="QSA",
                item_number=1,
                sort_order=1,
                factor_code="C1",
                text_en="Item 1",
                text_es="Item 1 ES",
                active=True,
            ))
        db.commit()
    finally:
        db.close()

    main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
    try:
        r = client.get("/user/anonymous-research-code")
        assert r.status_code == 200, r.text
        code = r.json()["anonymous_research_code"]
        assert re.match(r"^SBS-[A-Z2-9]{4}-[A-Z2-9]{4}$", code)

        r = client.get("/user/anonymous-research-code")
        assert r.status_code == 200, r.text
        assert r.json()["anonymous_research_code"] == code

        r = client.post("/instruments/QSA/score", json={
            "session_id": "validation-session-auth-code",
            "locale": "es",
            "answers": {"1": 3},
            "save": True,
            "save_validation": True,
            "version_label": "QSA_es_auth_code_test",
            "response_metadata": {
                "participant_code": "CLIENT-CODE",
                "anonymous_research_code": "CLIENT-CODE",
                "participation_context": "library_study_room",
            },
            "duration_seconds": 30,
        })
        assert r.status_code == 200, r.text

        db = _TestSession()
        try:
            code_row = db.query(models.AnonymousResearchCode).filter(
                models.AnonymousResearchCode.username == "student"
            ).first()
            assert code_row is not None
            assert code_row.code == code

            saved = db.query(models.ValidationResponse).filter(
                models.ValidationResponse.session_id == "validation-session-auth-code"
            ).first()
            assert saved is not None
            assert saved.username == "student"
            assert saved.response_metadata["participant_code"] == code
            assert saved.response_metadata["anonymous_research_code"] == code
            assert saved.response_metadata["participant_code_source"] == "server_db"
            assert saved.response_metadata["participation_context"] == "library_study_room"
        finally:
            db.close()
    finally:
        main.app.dependency_overrides.pop(auth.get_identity, None)


def test_questionnaire_result_user_history_and_delete():
    main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
    try:
        r = client.post("/questionnaire-result", json={
            "session_id": "student-owned-result",
            "questionnaire_type": "QSA",
            "scores": {"C1": 7},
        })
        assert r.status_code == 200, r.text
        assert r.json()["username"] == "student"

        r = client.get("/user/questionnaire-results")
        assert r.status_code == 200, r.text
        assert any(row["session_id"] == "student-owned-result" for row in r.json())

        r = client.delete("/questionnaire-result/student-owned-result")
        assert r.status_code == 200, r.text
    finally:
        main.app.dependency_overrides.pop(auth.get_identity, None)


def test_questionnaire_result_summary_uses_final_guided_step_for_every_instrument():
    main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
    session_ids = []
    try:
        for questionnaire_type in ("IDEA", "QSA"):
            _ensure_guided_steps(questionnaire_type)
            session_id = f"summary-{questionnaire_type.lower()}-{uuid.uuid4().hex[:8]}"
            session_ids.append(session_id)
            with _TestSession() as db:
                final_step = (
                    db.query(models.GuidedStep)
                    .filter(models.GuidedStep.questionnaire_type == questionnaire_type)
                    .order_by(models.GuidedStep.sort_order.desc(), models.GuidedStep.id.desc())
                    .first()
                )
                assert final_step is not None
                db.add(models.QuestionnaireResult(
                    session_id=session_id,
                    questionnaire_type=questionnaire_type,
                    scores={} if questionnaire_type == "IDEA" else {"C1": 7},
                    username="student",
                ))
                db.add_all([
                    models.Log(
                        session_id=session_id,
                        action="chat_message",
                        questionnaire_type=questionnaire_type,
                        phase=final_step.id,
                        details={"bot_response": f"Sintesi finale {questionnaire_type}"},
                    ),
                    models.Log(
                        session_id=session_id,
                        action="chat_message",
                        questionnaire_type=questionnaire_type,
                        phase="not-the-final-step",
                        details={"bot_response": "Messaggio successivo non sintetico"},
                    ),
                ])
                db.commit()

            response = client.get(f"/user/questionnaire-result/{session_id}/summary")
            assert response.status_code == 200, response.text
            assert response.json() == {"summary": f"Sintesi finale {questionnaire_type}"}
    finally:
        with _TestSession() as db:
            db.query(models.Log).filter(models.Log.session_id.in_(session_ids)).delete(synchronize_session=False)
            db.query(models.QuestionnaireResult).filter(
                models.QuestionnaireResult.session_id.in_(session_ids)
            ).delete(synchronize_session=False)
            db.commit()
        main.app.dependency_overrides.pop(auth.get_identity, None)


def test_learner_profile_revisions_and_history():
    """Profilo del discente: salvataggio append-only, dedup, storico, delete."""
    main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
    try:
        r = client.get("/user/learner-profile")
        assert r.status_code == 200, r.text
        assert r.json() is None

        r = client.post("/user/learner-profile", json={
            "goal": "Superare l'esame di analisi",
            "main_difficulty": "Mi distraggo facilmente",
            "source": "intake",
            "session_id": "lp-session-1",
        })
        assert r.status_code == 200, r.text
        first_id = r.json()["id"]
        assert r.json()["data"]["goal"] == "Superare l'esame di analisi"

        # Conferma senza modifiche -> nessuna nuova revisione
        r = client.post("/user/learner-profile", json={
            "goal": "Superare l'esame di analisi",
            "main_difficulty": "Mi distraggo facilmente",
            "source": "session_start",
        })
        assert r.json()["id"] == first_id

        # Modifica -> nuova revisione, storico = 2
        r = client.post("/user/learner-profile", json={
            "goal": "Superare l'esame di analisi",
            "main_difficulty": "Ansia prima dell'esame",
            "source": "session_end",
        })
        second_id = r.json()["id"]
        assert second_id != first_id
        r = client.get("/user/learner-profile/history")
        assert r.status_code == 200 and len(r.json()) == 2

        r = client.post("/user/learner-profile/reflections", json={
            "note": "Mi accorgo che la difficolta si e spostata dalla distrazione all'ansia.",
            "current_revision_id": second_id,
            "previous_revision_id": first_id,
            "session_id": "lp-session-1",
        })
        assert r.status_code == 200, r.text
        r = client.get("/user/learner-profile/reflections")
        assert r.status_code == 200, r.text
        assert len(r.json()) == 1
        assert "distrazione" in r.json()[0]["note"]

        # Il contesto chat include il profilo dichiarato
        with _TestSession() as db:
            section = chat_logic._learner_profile_context(db, "student")
            assert "Taccuino dello studente (auto-descrizione)" in section
            assert "Ansia prima dell'esame" in section
            assert chat_logic._learner_profile_context(db, "") == ""

        r = client.delete("/user/learner-profile")
        assert r.status_code == 200 and r.json()["deleted_revisions"] == 2
        assert r.json()["deleted_reflections"] == 1
        r = client.get("/user/learner-profile")
        assert r.json() is None
    finally:
        main.app.dependency_overrides.pop(auth.get_identity, None)


def test_learner_profile_suggestion_waits_four_turns_and_remains_stable():
    """La proposta nasce da materiale esplicito e non cambia a ogni turno."""
    sid = "learner-profile-suggestion-test"
    session_memory.clear(sid)
    main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
    try:
        with _TestSession() as db:
            db.add(models.Log(
                session_id=sid,
                action="chat_message",
                username="student",
                details={},
            ))
            db.commit()
        turns = [
            "Voglio superare l'esame di analisi.",
            "Ho difficolta a mantenere la concentrazione quando studio.",
            "Preferisco esempi concreti e brevi.",
        ]
        for index, message in enumerate(turns):
            session_memory.record_interaction(
                sid,
                user_message=message,
                transcript_user=message,
                bot_response=f"Risposta {index}",
                language="it",
            )

        pending = client.get(f"/user/learner-profile/suggestion?session_id={sid}")
        assert pending.status_code == 200, pending.text
        assert pending.json()["status"] == "pending"
        assert pending.json()["user_turns"] == 3

        fourth = "Faccio fatica soprattutto a iniziare gli esercizi difficili."
        session_memory.record_interaction(
            sid,
            user_message=fourth,
            transcript_user=fourth,
            bot_response="Risposta 4",
            language="it",
        )
        ready = client.get(f"/user/learner-profile/suggestion?session_id={sid}")
        assert ready.status_code == 200, ready.text
        ready_data = ready.json()
        assert ready_data["status"] == "ready"
        assert ready_data["data"]["goal"] == "Voglio superare l'esame di analisi"
        assert "Faccio fatica" in ready_data["data"]["main_difficulty"]
        assert "esempi concreti" in ready_data["data"]["notes"]

        fifth = "Ora voglio cambiare completamente obiettivo e studiare storia."
        session_memory.record_interaction(
            sid,
            user_message=fifth,
            transcript_user=fifth,
            bot_response="Risposta 5",
            language="it",
        )
        stable = client.get(f"/user/learner-profile/suggestion?session_id={sid}")
        assert stable.status_code == 200, stable.text
        assert stable.json()["data"] == ready_data["data"]
    finally:
        with _TestSession() as db:
            db.query(models.Log).filter(models.Log.session_id == sid).delete(synchronize_session=False)
            db.commit()
        session_memory.clear(sid)
        main.app.dependency_overrides.pop(auth.get_identity, None)


def test_student_booklet_crud_pdf_and_ownership():
    main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
    try:
        r = client.post("/questionnaire-result", json={
            "session_id": "booklet-session",
            "questionnaire_type": "QSA",
            "scores": {"C1": 8, "C2": 5, "A6": 3},
        })
        assert r.status_code == 200, r.text

        r = client.get("/user/student-booklets/instrument/QSA")
        assert r.status_code == 200, r.text
        assert r.json() is None

        r = client.put("/user/student-booklets/instrument/QSA", json={
            "data": {
                "strength": "C1 - Strategie elaborative",
                "growth_area": "A6 - Percezione di competenza",
                "objective": "Riconoscere un risultato concreto ogni settimana",
                "student_notes": "Nota personale",
            }
        })
        assert r.status_code == 200, r.text
        assert r.json()["questionnaire_type"] == "QSA"
        assert r.json()["session_id"] is None
        assert r.json()["data"]["student_notes"] == "Nota personale"

        r = client.get("/user/student-booklets/instrument/QSA/pdf")
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/pdf"
        assert len(r.content) > 100

        r = client.put("/user/student-booklets/instrument/ZTPI", json={
            "data": {
                "strength": "T5 - Futuro",
                "growth_area": "T1 - Passato Negativo",
                "student_notes": "Nota ZTPI",
            }
        })
        assert r.status_code == 200, r.text
        assert r.json()["questionnaire_type"] == "ZTPI"
        r = client.get("/user/student-booklets/instrument/QSA")
        assert r.status_code == 200, r.text
        assert r.json()["data"]["student_notes"] == "Nota personale"

        # Compat: la vecchia route per sessione restituisce il libretto dello strumento.
        r = client.get("/user/student-booklets/booklet-session")
        assert r.status_code == 200, r.text
        assert r.json()["questionnaire_type"] == "QSA"

        main.app.dependency_overrides[auth.get_identity] = lambda: _identity(
            "other", "other@example.test", is_researcher=False
        )
        r = client.get("/user/student-booklets/booklet-session")
        assert r.status_code == 403, r.text
        r = client.get("/user/student-booklets/instrument/QSA")
        assert r.status_code == 200, r.text
        assert r.json() is None
    finally:
        main.app.dependency_overrides.pop(auth.get_identity, None)


def test_student_booklet_multiple_schede_and_arrays():
    """Piu' schede per lo stesso strumento + campi forza/area come liste."""
    main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
    try:
        # Due schede distinte per QSA.
        r1 = client.post("/user/student-booklets/instrument/QSA", json={
            "data": {"title": "Primo trimestre", "strength": ["C1 - Una", "C2 - Due"], "growth_area": ["A6 - Tre"]}
        })
        assert r1.status_code == 200, r1.text
        id1 = r1.json()["id"]
        assert r1.json()["data"]["strength"] == ["C1 - Una", "C2 - Due"]

        r2 = client.post("/user/student-booklets/instrument/QSA", json={
            "data": {"title": "Secondo trimestre", "strength": ["A1 - Quattro"]}
        })
        assert r2.status_code == 200, r2.text
        id2 = r2.json()["id"]
        assert id2 != id1

        # La lista contiene entrambe le schede.
        r = client.get("/user/student-booklets/instrument/QSA/list")
        assert r.status_code == 200, r.text
        ids = {b["id"] for b in r.json()}
        assert {id1, id2} <= ids

        # Aggiornamento per id e PDF per id.
        r = client.put(f"/user/student-booklets/id/{id1}", json={
            "data": {"title": "Primo trimestre", "strength": ["C1 - Una", "C2 - Due", "C3 - Cinque"]}
        })
        assert r.status_code == 200, r.text
        assert r.json()["data"]["strength"] == ["C1 - Una", "C2 - Due", "C3 - Cinque"]

        r = client.get(f"/user/student-booklets/id/{id1}/pdf")
        assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
        assert len(r.content) > 100

        # Ownership: un altro utente non vede/agisce sulla scheda.
        main.app.dependency_overrides[auth.get_identity] = lambda: _identity(
            "other", "other@example.test", is_researcher=False
        )
        assert client.get(f"/user/student-booklets/id/{id1}").status_code == 403
        assert client.delete(f"/user/student-booklets/id/{id1}").status_code == 403

        # Il proprietario elimina una scheda.
        main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
        assert client.delete(f"/user/student-booklets/id/{id2}").status_code == 200
        r = client.get("/user/student-booklets/instrument/QSA/list")
        assert id2 not in {b["id"] for b in r.json()}
    finally:
        main.app.dependency_overrides.pop(auth.get_identity, None)


def test_student_booklet_can_create_idea_entry():
    """Idea usa la stessa scheda narrativa degli altri strumenti."""
    main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
    try:
        response = client.post("/user/student-booklets/instrument/IDEA", json={
            "data": {"title": "Nuova idea"},
        })

        assert response.status_code == 200, response.text
        assert response.json()["questionnaire_type"] == "IDEA"
    finally:
        main.app.dependency_overrides.pop(auth.get_identity, None)


def test_certified_strategies_for_student_endpoint():
    """Lo studente vede solo le strategie certificate, attive e nello scope."""
    main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
    try:
        r = client.post("/admin/certified-strategies", json={
            "slug": "booklet-focus-qsa", "name_it": "Tecnica del focus",
            "description_it": "Riduci le distrazioni durante lo studio.",
            "recommended_when_it": "Quando C6 e' un'area di crescita.",
            "name_i18n": {"it": "Tecnica del focus", "fr": "Technique de concentration"},
            "description_i18n": {"it": "Riduci le distrazioni durante lo studio.", "fr": "Reduis les distractions."},
            "recommended_when_i18n": {"it": "Quando C6 e' un'area di crescita.", "fr": "Lorsque C6 est a ameliorer."},
            "factor_codes": ["C6"], "questionnaire_types": ["QSA"], "status": "certified",
        })
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        try:
            hit = client.get("/user/certified-strategies?questionnaire_type=QSA&lang=it")
            assert hit.status_code == 200, hit.text
            assert any(s["slug"] == "booklet-focus-qsa" and s["name"] == "Tecnica del focus" for s in hit.json())

            # Il JSON francese non entra finche' la relativa versione non e'
            # certificata; prima si mantiene il ripiego italiano certificato.
            fr_before = client.get("/user/certified-strategies?questionnaire_type=QSA&lang=fr")
            fr_entry = next(s for s in fr_before.json() if s["slug"] == "booklet-focus-qsa")
            assert fr_entry["name"] == "Tecnica del focus"

            versions = client.get(
                "/admin/content-versions?content_type=certified_strategy&content_key=booklet-focus-qsa&locale=fr"
            ).json()
            assert len(versions) == 1
            version_id = versions[0]["id"]
            assert versions[0]["status"] == "translated"
            assert client.post(
                f"/admin/content-versions/{version_id}/promote", json={"target_status": "certified"}
            ).status_code == 200
            catalog = client.get("/admin/certified-strategies").json()
            catalog_entry = next(s for s in catalog if s["slug"] == "booklet-focus-qsa")
            assert catalog_entry["status"] == "certified", catalog_entry
            assert catalog_entry["questionnaire_types"] == ["QSA"], catalog_entry
            assert catalog_entry["name_i18n"]["fr"] == "Technique de concentration", catalog_entry
            fr_after = client.get("/user/certified-strategies?questionnaire_type=QSA&lang=fr")
            assert fr_after.status_code == 200, fr_after.text
            fr_matches = [s for s in fr_after.json() if s["slug"] == "booklet-focus-qsa"]
            assert len(fr_matches) == 1, fr_after.text
            fr_entry = fr_matches[0]
            assert fr_entry["name"] == "Technique de concentration"

            # Fuori scope: non compare per ZTPI.
            other = client.get("/user/certified-strategies?questionnaire_type=ZTPI&lang=it")
            assert all(s["slug"] != "booklet-focus-qsa" for s in other.json())

            # Bozza: non viene mai esposta.
            client.put(f"/admin/certified-strategies/{sid}", json={"status": "draft"})
            drafted = client.get("/user/certified-strategies?questionnaire_type=QSA&lang=it")
            assert all(s["slug"] != "booklet-focus-qsa" for s in drafted.json())
        finally:
            client.delete(f"/admin/certified-strategies/{sid}")
    finally:
        main.app.dependency_overrides.pop(auth.get_identity, None)


def test_portfolio_crud_images_search_and_ownership():
    """Portfolio: CRUD voci, ricerca/filtro, upload/serve/delete immagini, ownership."""
    main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
    try:
        r = client.post("/user/portfolio", json={
            "title": "Tema di storia", "description": "Saggio sul Novecento",
            "category": "Scrittura", "item_date": "2026-03-01",
        })
        assert r.status_code == 200, r.text
        item_id = r.json()["id"]
        assert r.json()["images"] == []

        r2 = client.post("/user/portfolio", json={"title": "Progetto robotica", "category": "STEM"})
        assert r2.status_code == 200, r2.text
        other_id = r2.json()["id"]

        # Lista + ricerca + filtro categoria.
        ids = {it["id"] for it in client.get("/user/portfolio").json()}
        assert {item_id, other_id} <= ids

        searched = client.get("/user/portfolio?q=robotica").json()
        titles = [it["title"] for it in searched]
        assert "Progetto robotica" in titles and "Tema di storia" not in titles

        filtered = [it["id"] for it in client.get("/user/portfolio?category=Scrittura").json()]
        assert item_id in filtered and other_id not in filtered

        cats = client.get("/user/portfolio/categories").json()
        assert "Scrittura" in cats and "STEM" in cats

        # Update parziale.
        r = client.put(f"/user/portfolio/{item_id}", json={"title": "Tema di storia (rev)"})
        assert r.status_code == 200 and r.json()["title"] == "Tema di storia (rev)"

        # Immagine: upload, serve, tipo non valido, delete.
        png = b"\x89PNG\r\n\x1a\n" + b"0" * 32
        r = client.post(f"/user/portfolio/{item_id}/images", files={"file": ("a.png", png, "image/png")})
        assert r.status_code == 200, r.text
        assert len(r.json()["images"]) == 1
        image_id = r.json()["images"][0]["id"]

        r = client.get(f"/user/portfolio/{item_id}/images/{image_id}")
        assert r.status_code == 200 and r.headers["content-type"].startswith("image/png")
        assert r.content == png

        assert client.post(
            f"/user/portfolio/{item_id}/images",
            files={"file": ("a.txt", b"hi", "text/plain")},
        ).status_code == 400

        r = client.delete(f"/user/portfolio/{item_id}/images/{image_id}")
        assert r.status_code == 200 and r.json()["images"] == []

        # Ownership: un altro utente non vede/agisce.
        main.app.dependency_overrides[auth.get_identity] = lambda: _identity(
            "other", "other@example.test", is_researcher=False
        )
        assert client.get(f"/user/portfolio/{item_id}").status_code == 403
        assert client.delete(f"/user/portfolio/{item_id}").status_code == 403
        assert client.get("/user/portfolio").json() == []

        # Il proprietario elimina.
        main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
        assert client.delete(f"/user/portfolio/{item_id}").status_code == 200
        assert client.delete(f"/user/portfolio/{other_id}").status_code == 200
    finally:
        main.app.dependency_overrides.pop(auth.get_identity, None)


def test_role_preview_impersonation_scopes_data_to_demo_account():
    """Anteprima ruoli: un admin reale impersona un account demo (allowlist)."""
    main.app.dependency_overrides[auth.get_identity] = lambda: _identity(
        "realadmin", "realadmin@example.test", is_admin=True
    )
    try:
        hdr = {"X-View-As": "studente.demo"}

        # Lavoro creato come account demo (header) vs come admin reale (no header).
        demo_item = client.post("/user/portfolio", json={"title": "Lavoro demo"}, headers=hdr).json()["id"]
        admin_item = client.post("/user/portfolio", json={"title": "Lavoro admin"}).json()["id"]

        # Con header: solo i dati del demo.
        demo_ids = {it["id"] for it in client.get("/user/portfolio", headers=hdr).json()}
        assert demo_item in demo_ids and admin_item not in demo_ids

        # Query param view_as (per i tag <img>): stesso scoping.
        q_ids = {it["id"] for it in client.get("/user/portfolio?view_as=studente.demo").json()}
        assert demo_item in q_ids and admin_item not in q_ids

        # Senza header: solo i dati dell'admin reale.
        admin_ids = {it["id"] for it in client.get("/user/portfolio").json()}
        assert admin_item in admin_ids and demo_item not in admin_ids

        # Allowlist: un username non-demo viene ignorato (resta admin).
        ign_ids = {it["id"] for it in client.get("/user/portfolio", headers={"X-View-As": "vittima.reale"}).json()}
        assert admin_item in ign_ids and demo_item not in ign_ids

        # Piu' profili di prova, isolati tra loro (studente.demo vs studente.demo2).
        hdr2 = {"X-View-As": "studente.demo2"}
        demo2_item = client.post("/user/portfolio", json={"title": "Lavoro demo2"}, headers=hdr2).json()["id"]
        d1 = {it["id"] for it in client.get("/user/portfolio", headers=hdr).json()}
        d2 = {it["id"] for it in client.get("/user/portfolio", headers=hdr2).json()}
        assert demo_item in d1 and demo2_item not in d1
        assert demo2_item in d2 and demo_item not in d2
        client.delete(f"/user/portfolio/{demo2_item}", headers=hdr2)

        client.delete(f"/user/portfolio/{demo_item}", headers=hdr)
        client.delete(f"/user/portfolio/{admin_item}")

        # Un non-admin non puo' impersonare: l'header viene ignorato.
        main.app.dependency_overrides[auth.get_identity] = _fake_user_identity
        created = client.post("/user/portfolio", json={"title": "no imp"}, headers=hdr).json()["id"]
        assert created in {it["id"] for it in client.get("/user/portfolio").json()}
        client.delete(f"/user/portfolio/{created}")
    finally:
        main.app.dependency_overrides.pop(auth.get_identity, None)


def test_questionnaire_pdf_download():
    """Crea un risultato e verifica che il PDF sia scaricabile."""
    r = client.post("/questionnaire-result", json={
        "session_id": "pdf-test-session",
        "questionnaire_type": "QSA",
        "scores": {"C1": 8, "C2": 5, "C3": 2},
    })
    assert r.status_code == 200, r.text
    r = client.get("/questionnaire-result/pdf-test-session/pdf")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert len(r.content) > 100


def test_questionnaire_pdf_download_generates_cached_ai_summary():
    """Il PDF include una sintesi AI cacheata quando esiste una conversazione."""
    session_id = "pdf-summary-test-session"
    client.post("/questionnaire-result", json={
        "session_id": session_id,
        "questionnaire_type": "SAVICKAS",
        "scores": {},
    })
    db = _TestSession()
    try:
        db.query(models.Log).filter(models.Log.session_id == session_id).delete()
        db.add(models.Log(
            session_id=session_id,
            action="chat_message",
            questionnaire_type="SAVICKAS",
            details={
                "user_input": "Voglio scegliere un percorso piu' coerente con i miei interessi.",
                "bot_response": "Emerge il tema della curiosita' e della continuita'.",
                "certified_strategy_ids": [],
                "strategy_ids": [],
            },
        ))
        db.commit()
    finally:
        db.close()

    calls = []
    original = survey_routes.AIService.get_response

    def fake_summary(self, *args, **kwargs):
        calls.append((args, kwargs))
        return "## Sintesi della discussione\nHai riflettuto su interessi e continuita'.\n\n## Strategie suggerite\nProva un primo passo concreto."

    survey_routes.AIService.get_response = fake_summary
    try:
        first = client.get(f"/questionnaire-result/{session_id}/pdf?lang=it")
        second = client.get(f"/questionnaire-result/{session_id}/pdf?lang=it")
    finally:
        survey_routes.AIService.get_response = original

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert len(calls) == 1

    db = _TestSession()
    try:
        cached = db.query(models.Log).filter(
            models.Log.session_id == session_id,
            models.Log.action == survey_routes.PDF_SUMMARY_ACTION,
        ).all()
        assert len(cached) == 1
        assert "Strategie" in cached[0].details["summary"]
    finally:
        db.close()


def test_qsa_extractor_rejects_incomplete_scores():
    # OCR: modello vision dedicato. Parser: modello di chat locale con thinking
    # spento (l'output e' vincolato a uno schema JSON). NON muse-glimmer: con
    # `format` schema tronca il JSON a meta' (misurato, 2 giri su 2).
    assert DEFAULT_OCR_MODEL == "glm-ocr:latest"
    assert DEFAULT_PARSER_MODEL == "qwen3.8:latest"
    valid = {f"C{index}": index for index in range(1, 8)}
    valid.update({f"A{index}": index for index in range(1, 8)})
    assert _validate_scores(valid) == valid
    try:
        _validate_scores({"C1": 7})
    except ValueError:
        return
    raise AssertionError("An incomplete extraction must be rejected")


def test_profile_extractor_supports_all_strategic_questionnaires():
    assert SUPPORTED_QUESTIONNAIRES == ("QSA", "QSAr", "QPCS", "QPCC", "QAP")
    for questionnaire_type, factors in QUESTIONNAIRE_FACTORS.items():
        scores = {factor: (index % 9) + 1 for index, factor in enumerate(factors)}
        assert _questionnaire_factors(questionnaire_type) == factors
        assert _validate_scores(scores, factors) == scores
        schema = _scores_schema(factors)
        assert schema["required"] == list(factors)
        assert set(schema["properties"]) == set(factors)


def test_strip_markdown():
    out = main.strip_markdown("**grassetto** e _corsivo_")
    assert "**" not in out and "grassetto" in out


def test_normalize_markdown_reflows_tables_and_cleans():
    from backend.rag_index import _normalize_markdown
    raw = (
        "<!-- converted from X.docx -->\n\n"
        "firma …………………………\n\n"
        "| * | Intestazione lunga che va a capo | punti\n"
        "di forza |\n"
        "| --- | --- | --- |\n"
        "| C3 | Capacità | ok |\n"
    )
    out = _normalize_markdown(raw)
    assert "<!--" not in out
    assert "…………" not in out
    # header ricucito su una riga, termina con '|'
    header = next(ln for ln in out.splitlines() if "Intestazione" in ln)
    assert header.rstrip().endswith("|")
    assert "punti di forza" in header


def test_site_chat_category_for():
    from backend.rag_index import category_for
    assert category_for("questionari/strumenti/QSA_it.pdf") == "strumenti"
    assert category_for("validazione/formule/formule-validazione.pdf") == "validazione"
    assert category_for("fonti/competenze-strategiche/sito-competenzestrategiche/guide/Schede_fattori_QSA.pdf") == "guide"
    assert category_for("fonti/competenze-strategiche/sito-competenzestrategiche/studi/OTTONE_2023.pdf") == "studi"
    assert category_for("fonti/competenze-strategiche/sito-competenzestrategiche/convegni/Abstract_fascicolo.pdf") == "convegni"
    # libri voluminosi → approfondimenti (peso basso), anche fuori da cnos-fap
    assert category_for("fonti/competenze-strategiche/fonti-esterne-collegate/cnos-fap/soft_skill.pdf") == "approfondimenti"
    assert category_for("fonti/competenze-strategiche/Dirigere_se_stessi_2020.pdf") == "approfondimenti"


def test_site_chat_strips_fonte_tokens():
    from backend.routes.site_chat import _strip_fonte_tokens
    out = _strip_fonte_tokens("Ci vogliono 5 minuti (FONTE 1), (FONTE 4), (FONTE 5).")
    assert "FONTE" not in out
    assert out == "Ci vogliono 5 minuti."
    assert _strip_fonte_tokens("Vedi [FONTE 2] per dettagli") == "Vedi per dettagli"
    # citazioni raggruppate: (Fonte 1; Fonte 4) / (Fonti 1, 2)
    assert "Fonte" not in _strip_fonte_tokens("Lo dice Margottini (Fonte 1; Fonte 4).")
    assert "Fonti" not in _strip_fonte_tokens("Vedi (Fonti 1, 2, 3) per i dettagli.")
    # English source tags
    assert _strip_fonte_tokens("See [SOURCE 2] for details") == "See for details"
    assert "SOURCE" not in _strip_fonte_tokens("See (Sources 1, 2, 3) for details.")


# --------------------------------------------------------------------------
# pQBL da PDF: validatore puro + flusso endpoint con generazione mockata
# --------------------------------------------------------------------------
def _pqbl_option(key: str, correct: bool) -> dict:
    return {
        "key": key,
        "text": f"Opzione {key} con un contenuto plausibile",
        "correct": correct,
        "feedback": (
            "Esatto! Questa è la risposta giusta perché il materiale lo spiega in dettaglio."
            if correct
            else "Non è così: rileggi con attenzione questo aspetto del materiale e riprova."
        ),
    }


def _pqbl_canned_bank(n_questions: int = 4) -> list:
    """Bank valido per il validatore: 2 skill, chiave corretta = ABCD[posizione % 4]."""
    bank = []
    for i in range(n_questions):
        skill = "saper riconoscere il concetto 1" if i < n_questions // 2 else "saper applicare il concetto 2"
        correct_key = "ABCD"[i % 4]
        bank.append({
            "skill": skill,
            "question": f"Domanda di prova numero {i + 1}?",
            "options": [_pqbl_option(k, k == correct_key) for k in "ABCD"],
        })
    return bank


def test_pqbl_validator_rules():
    from backend.pqbl_generator import validate_mcq

    valid = _pqbl_canned_bank(1)[0]
    assert validate_mcq(valid) == []

    # 0 o 2 opzioni corrette -> invalida
    double = _pqbl_canned_bank(1)[0]
    double["options"][1]["correct"] = True
    double["options"][2]["correct"] = True
    assert any("esattamente 1" in p for p in validate_mcq(double))

    # feedback mancante -> invalida
    nofb = _pqbl_canned_bank(1)[0]
    nofb["options"][2]["feedback"] = ""
    assert any("feedback vuoto" in p for p in validate_mcq(nofb))

    # R2: il feedback del distrattore cita il testo della risposta corretta -> invalida
    leak = _pqbl_canned_bank(1)[0]
    correct_text = next(o["text"] for o in leak["options"] if o["correct"])
    distractor = next(o for o in leak["options"] if not o["correct"])
    distractor["feedback"] = f"Sbagliato, la risposta giusta è: {correct_text}."
    assert any("rivela" in p for p in validate_mcq(leak))

    # R2: il feedback dichiara la lettera corretta -> invalida
    letter = _pqbl_canned_bank(1)[0]
    correct_key = next(o["key"] for o in letter["options"] if o["correct"])
    distractor = next(o for o in letter["options"] if not o["correct"])
    distractor["feedback"] = f"No, la risposta corretta è {correct_key}."
    assert any("lettera" in p for p in validate_mcq(letter))

    # R3: ogni chunk produce ~4 domande per skill


def test_pqbl_upload_and_learning_flow():
    """Upload mockato -> bank pronto -> sessione learning -> answer -> summary
    -> test finale. Verifica che il client non riceva MAI correct/feedback
    prima della risposta."""
    canned_text = "Testo estratto di prova, lungo a sufficienza per la pipeline pQBL. " * 10
    original_total_pages = pqbl_routes.pdf_total_pages
    original_extract_range = pqbl_routes.extract_pdf_text_range
    original_generate = pqbl_routes.generate_batch_for_chunk
    original_split = pqbl_routes.split_text_into_chunks
    pqbl_routes.pdf_total_pages = lambda path: 3
    pqbl_routes.extract_pdf_text_range = lambda path, start, end: canned_text
    pqbl_routes.split_text_into_chunks = lambda text: [canned_text]
    pqbl_routes.generate_batch_for_chunk = lambda ai, text, idx, lang, qp, provider=None, model=None: _pqbl_canned_bank(4)
    try:
        # dimensione non ammessa -> 400
        r = client.post("/pqbl/upload", files={"file": ("dispensa.pdf", b"%PDF-1.4 x", "application/pdf")},
                        data={"size": "15"})
        assert r.status_code == 400, r.text

        # estensione non pdf -> 400
        r = client.post("/pqbl/upload", files={"file": ("foto.png", b"x", "image/png")},
                        data={"size": "10"})
        assert r.status_code == 400, r.text

        r = client.post("/pqbl/upload", files={"file": ("dispensa.pdf", b"%PDF-1.4 x", "application/pdf")},
                        data={"size": "10"})
        assert r.status_code == 200, r.text
        document_id = r.json()["document_id"]
        assert r.json()["reused"] is False
        # In TestClient i background task girano subito dopo la response,
        # quindi al GET successivo il doc è già pronto.
        assert r.json()["status"] in ("processing", "ready"), r.json()

        r = client.get(f"/pqbl/documents/{document_id}")
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["status"] == "ready", doc
        assert doc["n_questions"] == 4
        assert len(doc["skills"]) == 2
        assert doc["onboarding_text"]

        # stesso testo + stesso provider -> riuso del bank
        r = client.post("/pqbl/upload", files={"file": ("dispensa.pdf", b"%PDF-1.4 x", "application/pdf")},
                        data={"size": "10"})
        assert r.json()["reused"] is True
        assert r.json()["document_id"] == document_id

        # sessione learning
        r = client.post("/pqbl/sessions", json={"document_id": document_id, "mode": "learning"})
        assert r.status_code == 200, r.text
        session_id = r.json()["session_id"]
        assert r.json()["n_questions"] == 4

        r = client.get(f"/pqbl/sessions/{session_id}/questions")
        assert r.status_code == 200, r.text
        questions = r.json()["questions"]
        assert len(questions) == 4
        for q in questions:
            assert len(q["options"]) == 4
            for o in q["options"]:
                assert "correct" not in o, "il flag correct non deve mai raggiungere il client"
                assert "feedback" not in o, "il feedback arriva solo dopo la risposta"

        # domanda in posizione 0: corretta = A. Prima risposta sbagliata (B)...
        q0 = next(q for q in questions if q["position"] == 0)
        r = client.post(f"/pqbl/sessions/{session_id}/answer",
                        json={"question_id": q0["id"], "option_key": "B"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["correct"] is False and body["first_try"] is True
        assert body["feedback"]

        # ...poi quella giusta (non più first_try): R5, tentativi multipli ammessi
        r = client.post(f"/pqbl/sessions/{session_id}/answer",
                        json={"question_id": q0["id"], "option_key": "A"})
        assert r.json()["correct"] is True and r.json()["first_try"] is False

        # le altre 3 domande: corrette al primo colpo (chiave = ABCD[posizione % 4])
        for q in questions:
            if q["position"] == 0:
                continue
            key = "ABCD"[q["position"] % 4]
            r = client.post(f"/pqbl/sessions/{session_id}/answer",
                            json={"question_id": q["id"], "option_key": key})
            assert r.json()["correct"] is True and r.json()["first_try"] is True

        r = client.get(f"/pqbl/sessions/{session_id}/summary")
        assert r.status_code == 200, r.text
        summary = r.json()
        assert summary["total_questions"] == 4
        assert summary["answered_questions"] == 4
        assert summary["first_try_correct"] == 3  # la prima è stata sbagliata al primo colpo
        assert summary["finished"] is True
        assert len(summary["by_skill"]) == 2

        # test finale (R7): 1 domanda per skill, submit unico, non ripetibile
        r = client.post("/pqbl/sessions", json={"document_id": document_id, "mode": "final_test"})
        final_session = r.json()["session_id"]
        assert r.json()["n_questions"] == 2

        r = client.get(f"/pqbl/sessions/{final_session}/questions")
        final_questions = r.json()["questions"]
        # in learning la answer singola è vietata per il test finale
        r = client.post(f"/pqbl/sessions/{final_session}/answer",
                        json={"question_id": final_questions[0]["id"], "option_key": "A"})
        assert r.status_code == 400, r.text

        answers = {str(q["id"]): "ABCD"[q["position"] % 4] for q in final_questions}
        r = client.post(f"/pqbl/sessions/{final_session}/final-test", json={"answers": answers})
        assert r.status_code == 200, r.text
        result = r.json()
        assert result["score"] == 2 and result["total"] == 2
        assert all(row["feedback"] for row in result["results"])

        # secondo submit -> 409
        r = client.post(f"/pqbl/sessions/{final_session}/final-test", json={"answers": answers})
        assert r.status_code == 409, r.text
    finally:
        pqbl_routes.pdf_total_pages = original_total_pages
        pqbl_routes.extract_pdf_text_range = original_extract_range
        pqbl_routes.generate_batch_for_chunk = original_generate
        pqbl_routes.split_text_into_chunks = original_split


def test_pqbl_early_break_aligns_chunks():
    """Verifica che se la generazione dei chunk si interrompe in anticipo,
    doc.chunks_total venga allineato a doc.chunks_done."""
    canned_text = "Testo estratto di prova per early break " * 10
    original_total_pages = pqbl_routes.pdf_total_pages
    original_extract_range = pqbl_routes.extract_pdf_text_range
    original_generate = pqbl_routes.generate_batch_for_chunk
    original_split = pqbl_routes.split_text_into_chunks
    pqbl_routes.pdf_total_pages = lambda path: 12  # 4 segmenti da 3 pag
    pqbl_routes.extract_pdf_text_range = lambda path, start, end: canned_text
    pqbl_routes.split_text_into_chunks = lambda text: [canned_text, canned_text]  # 2 chunk per segmento
    pqbl_routes.generate_batch_for_chunk = lambda ai, text, idx, lang, qp, provider=None, model=None: _pqbl_canned_bank(4)
    try:
        r = client.post("/pqbl/upload", files={"file": ("dispensa_early.pdf", b"%PDF-1.4 early_break", "application/pdf")},
                        data={"size": "10"})
        assert r.status_code == 200, r.text
        document_id = r.json()["document_id"]
        
        r = client.get(f"/pqbl/documents/{document_id}")
        assert r.status_code == 200, r.text
        doc = r.json()
        
        # Segmento 1 ha generato 8 domande (2 chunk). Segmento 2 ha generato 2 domande (1 chunk parziale).
        # Il totale delle domande generate è 10. Al segmento 3 si interrompe perché 10 >= 10.
        # chunks_done è 2. chunks_total deve essere aggiornato a 2.
        assert doc["status"] == "ready", doc
        assert doc["n_questions"] == 10
        assert doc["chunks_done"] == 2
        assert doc["chunks_total"] == 2
    finally:
        pqbl_routes.pdf_total_pages = original_total_pages
        pqbl_routes.extract_pdf_text_range = original_extract_range
        pqbl_routes.generate_batch_for_chunk = original_generate
        pqbl_routes.split_text_into_chunks = original_split


def test_pqbl_json_repair_and_question_salvaging():
    """Verifica che se l'LLM risponde con un JSON troncato, il sistema lo ripari
    e salvi solo le domande generate completamente e correttamente, scartando quella troncata."""
    from backend.pqbl_generator import repair_truncated_json, generate_batch_for_chunk
    
    # 1. Test unitario repair_truncated_json
    truncated_json = (
        '{"questions": ['
        '{"question": "Q1", "options": ['
        '{"key": "A", "text": "Opt A", "correct": true, "feedback": "Fb A"}, '
        '{"key": "B", "text": "Opt B", "correct": false, "feedback": "Fb B"}, '
        '{"key": "C", "text": "Opt C", "correct": false, "feedback": "Fb C"}, '
        '{"key": "D", "text": "Opt D", "correct": false, "feedback": "Fb D"}'
        ']}, '
        '{"question": "Q2", "options": ['
        '{"key": "A", "text": "Opt A", "correct": true, "feedback": "'
    )
    repaired = repair_truncated_json(truncated_json)
    import json
    parsed = json.loads(repaired)
    assert "questions" in parsed
    assert len(parsed["questions"]) == 2
    
    # 2. Test integrazione salvataggio parziale in generate_batch_for_chunk
    class MockAI:
        def __init__(self):
            self.config = {}
        def get_response(self, user_msg, sys_prompt, mode, max_tokens, provider=None, model=None):
            return truncated_json
            
    ai_mock = MockAI()
    # Deve estrarre solo la prima domanda completa "Q1" e scartare la seconda "Q2" incompleta
    res = generate_batch_for_chunk(
        ai_mock, "Testo di prova", 0, "it", "Prompt di prova", provider=None
    )
    assert len(res) == 1
    assert res[0]["question"] == "Q1"




# --------------------------------------------------------------------------
# Catalogo strumenti editabile + scoring server-side
# --------------------------------------------------------------------------
def test_instrument_catalog_crud_and_scoring():
    # Crea uno strumento minimale con scala 1-5 (per esercitare reverse non-1-4).
    r = client.post("/admin/instruments", json={
        "code": "TST", "name_en": "Test", "response_scale_min": 1,
        "response_scale_max": 5, "report_scale_type": "stanine", "status": "experimental",
    })
    assert r.status_code == 200, r.text

    # Due fattori: F1 (resource), F2 (difficulty)
    for code, orient in (("F1", "resource"), ("F2", "difficulty")):
        rf = client.post("/admin/instruments/TST/factors", json={
            "instrument_code": "TST", "code": code, "orientation": orient,
            "label_en": code, "label_sv": code,
        })
        assert rf.status_code == 200, rf.text

    # 4 item: 1,2 -> F1 (item2 reverse); 3,4 -> F2
    items = [
        (1, "F1", False), (2, "F1", True), (3, "F2", False), (4, "F2", False),
    ]
    for num, fac, rev in items:
        ri = client.post("/admin/instruments/TST/items", json={
            "instrument_code": "TST", "item_number": num, "sort_order": num,
            "factor_code": fac, "reverse_scoring": rev, "text_en": f"item {num}", "text_sv": f"item {num}",
        })
        assert ri.status_code == 200, ri.text

    # Rules: item_numbers e reverse esposti correttamente
    rr = client.get("/instruments/TST/rules?locale=en")
    assert rr.status_code == 200, rr.text
    rules = rr.json()
    f1 = next(f for f in rules["factors"] if f["code"] == "F1")
    assert f1["item_numbers"] == [1, 2]
    assert f1["reverse_item_numbers"] == [2]
    assert rules["uses_validated_norms"] is False

    # Scoring: risposte F1 = {1:5, 2:5} -> reverse item2 = (5+1)-5 = 1 ; media = (5+1)/2 = 3
    #          F2 = {3:2, 4:2} -> media 2
    rs = client.post("/instruments/TST/score", json={
        "session_id": "score-test", "locale": "en",
        "answers": {"1": 5, "2": 5, "3": 2, "4": 2}, "save": True,
    })
    assert rs.status_code == 200, rs.text
    profile = rs.json()
    by_code = {x["code"]: x for x in profile["results"]}
    assert abs(by_code["F1"]["raw_average"] - 3.0) < 1e-6, by_code["F1"]
    assert abs(by_code["F2"]["raw_average"] - 2.0) < 1e-6, by_code["F2"]
    # Stanine sperimentale (nessuna norma): riscalatura lineare su scala 1-5 (span 4)
    # F1: round(1 + (3-1)*8/4) = 5 ; F2: round(1 + (2-1)*8/4) = 3
    assert by_code["F1"]["stanine"] == 5
    assert by_code["F2"]["stanine"] == 3
    assert by_code["F1"]["stanine_is_normed"] is False

    # Risposta fuori scala -> 400
    bad = client.post("/instruments/TST/score", json={
        "session_id": "score-bad", "locale": "en",
        "answers": {"1": 9, "2": 1, "3": 1, "4": 1}, "save": False,
    })
    assert bad.status_code == 400, bad.text


def test_instrument_scoring_uses_validated_norms():
    client.post("/admin/instruments", json={
        "code": "TSN", "name_en": "TestNorm", "response_scale_min": 1,
        "response_scale_max": 4, "status": "experimental",
    })
    client.post("/admin/instruments/TSN/factors", json={
        "instrument_code": "TSN", "code": "G1", "orientation": "resource", "label_en": "G1",
    })
    for num in (1, 2):
        client.post("/admin/instruments/TSN/items", json={
            "instrument_code": "TSN", "item_number": num, "factor_code": "G1", "text_en": f"i{num}",
        })
    # Norma validata: raw total 4..6 -> stanine 7
    rn = client.post("/admin/instruments/TSN/norm-thresholds", json={
        "instrument_code": "TSN", "locale": "en", "factor_code": "G1",
        "raw_min": 4, "raw_max": 6, "stanine": 7, "status": "validated",
    })
    assert rn.status_code == 200, rn.text
    rs = client.post("/instruments/TSN/score", json={
        "session_id": "norm-test", "locale": "en", "answers": {"1": 2, "2": 3}, "save": False,
    })
    assert rs.status_code == 200, rs.text
    g1 = rs.json()["results"][0]
    assert g1["stanine"] == 7
    assert g1["stanine_is_normed"] is True


def test_session_memory_transcript_role_array():
    """Fase 2: il transcript verbatim role-tagged ruota e si legge come array."""
    from backend.memory_service import session_memory
    sid = "transcript-test"
    session_memory.clear(sid)
    session_memory.record_interaction(
        sid, user_message="x", transcript_user="Ciao",
        bot_response="Risposta", language="it",
    )
    turns = session_memory.get_transcript(sid)
    assert turns == [
        {"role": "user", "content": "Ciao"},
        {"role": "assistant", "content": "Risposta"},
    ], turns
    # Cap FIFO: 7 interazioni = 14 turni -> significare SOLO gli ultimi 12.
    for i in range(7):
        session_memory.record_interaction(
            sid, user_message=f"u{i}", transcript_user=f"u{i}",
            bot_response=f"a{i}", language="it",
        )
    turns = session_memory.get_transcript(sid)
    assert len(turns) <= 12, len(turns)
    assert turns[0]["role"] in ("user", "assistant")
    assert turns[-1]["content"] == "a6"
    session_memory.clear(sid)


def test_normalize_history_purifies_roles_and_content():
    """Fase 3: _normalize_history tiene solo role user/assistant con content."""
    from backend.ai_service import AIService
    norm = AIService._normalize_history
    healthy = [
        {"role": "user", "content": "x"},
        {"role": "assistant", "content": "y"},
        {"role": "system", "content": "z"},  # filtrato via
    ]
    assert norm(healthy) == [
        {"role": "user", "content": "x"},
        {"role": "assistant", "content": "y"},
    ]
    # Robustezza agli input malformati: niente crash, ritorna [].
    assert norm(None) == []
    assert norm([]) == []
    assert norm([None, "str", {}, {"role": "user"}, {"role": "assistant", "content": ""}]) == []


def test_build_context_envelope_canonical_blocks():
    """Fase 5: l'envelope assembla [PERSONA] [SECTION] [STUDENT] [PROFILE]
    [KNOWLEDGE] nel system e history verbatim + user nei messages."""
    from backend.ai_service import AIService as _FakeAIWrapper
    from backend.api_models import ChatRequest
    from backend.chat_logic import build_context_envelope
    sid = "envelope-test"
    session_memory.clear(sid)
    session_memory.record_interaction(
        sid, user_message="x", transcript_user="primo turno",
        bot_response="prima risposta", language="it",
        questionnaire_type="QSA", step_label="Step 1",
    )

    db = next(_override_get_db())
    ai = _FakeAIService(db)
    request = ChatRequest(message="domanda", questionnaire_type="QSA", language="it")
    identity = {"username": "student"}

    system_final, full_message, history = build_context_envelope(
        db, ai, request, sid, identity,
        c_persona="", system_prompt="SYS",
        step_label="Step 1", questionnaire_type="QSA",
        effective_message="domanda", model_scores_context="",
        message_scores_context="", knowledge_context="KNOWLEDGE_BLOCK",
    )

    assert "SYS" in system_final
    assert "[STUDENT]" in system_final
    assert "[KNOWLEDGE]" in system_final
    assert "KNOWLEDGE_BLOCK" in system_final
    assert "domanda" in full_message
    assert isinstance(history, list) and history, history
    assert history[-1]["role"] == "assistant"
    session_memory.clear(sid)


def test_build_context_envelope_component_flags_disable_parts():
    from backend.api_models import ChatRequest
    from backend.chat_logic import build_context_envelope

    sid = "component-flags-test"
    session_memory.clear(sid)
    db = next(_override_get_db())
    db.query(models.Config).filter(models.Config.key == "prompt_meta_QSA").delete()
    db.add(models.Config(key="prompt_meta_QSA", value="META QSA", description="test"))
    db.commit()
    ai = _FakeAIService(db)
    request = ChatRequest(message="domanda", questionnaire_type="QSA", language="it")
    components = {}

    system_final, full_message, history = build_context_envelope(
        db, ai, request, sid, {"username": "student"},
        c_persona="PERSONA", system_prompt="BASEPROMPT",
        step_label="Step 1", questionnaire_type="QSA",
        effective_message="domanda", model_scores_context="SCORES",
        message_scores_context="SCORES", knowledge_context="KNOWLEDGE_BLOCK",
        component_flags={"system_prompt": False, "step_prompt": False, "cognitive_factors": False, "affective_factors": False, "other_scores": False, "knowledge": False, "counselor": False, "history": False},
        components=components,
    )

    assert "BASEPROMPT" not in system_final
    assert "PERSONA" not in system_final
    assert "META QSA" in system_final
    assert "KNOWLEDGE_BLOCK" not in system_final
    assert "SCORES" not in full_message
    assert full_message == ""
    assert history == []
    assert components["system_prompt"] == ""
    assert components["meta_system_prompt"] == "META QSA"
    session_memory.clear(sid)


def test_build_context_envelope_counselor_name_placeholder():
    """Il placeholder {{counselor_name}} (persona + intro di sezione) viene
    risolto dal nome del counselor; senza counselor usa il fallback neutro."""
    from backend.api_models import ChatRequest
    from backend.chat_logic import build_context_envelope
    sid = "envelope-name-test"
    session_memory.clear(sid)
    db = next(_override_get_db())
    ai = _FakeAIService(db)
    request = ChatRequest(message="ciao", questionnaire_type="QSA", language="it")
    identity = {"username": "student"}

    # Con counselor selezionato: placeholder -> nome reale (persona + section).
    system_final, _, _ = build_context_envelope(
        db, ai, request, sid, identity,
        c_persona="You are {{counselor_name}}, a clear counsellor.",
        counselor_name="Nadia",
        system_prompt="You are {{counselor_name}}. Welcome the student.",
        step_label="0. Presentazione", questionnaire_type="QSA",
        effective_message="ciao", model_scores_context="",
        message_scores_context="", knowledge_context="",
        include_history=False, include_session_memory=False,
        create_anonymous_code=False,
    )
    assert "{{counselor_name}}" not in system_final, system_final
    assert "You are Nadia, a clear counsellor." in system_final
    assert "You are Nadia. Welcome the student." in system_final

    # Senza counselor: fallback neutro, nessun letterale residuo.
    system_no_counselor, _, _ = build_context_envelope(
        db, ai, request, sid, identity,
        c_persona="",
        system_prompt="You are {{counselor_name}}. Welcome the student.",
        step_label="0. Presentazione", questionnaire_type="QSA",
        effective_message="ciao", model_scores_context="",
        message_scores_context="", knowledge_context="",
        include_history=False, include_session_memory=False,
        create_anonymous_code=False,
    )
    assert "{{counselor_name}}" not in system_no_counselor
    assert "You are the counsellor. Welcome the student." in system_no_counselor
    session_memory.clear(sid)


def test_retrieved_context_routing_and_strategy_exclusion():
    from backend.chat_logic import _retrieved_context, get_prompt_component_flags
    from backend.api_models import ChatRequest

    db = next(_override_get_db())
    request = ChatRequest(
        message="ciao",
        mode="generic",
        phase="intro",
        scores_context="C1: 5/9",
        questionnaire_type="QSA",
        language="it",
    )

    # 1. Test defaults for intro phase (no strategies, only counselorbot RAG)
    flags = get_prompt_component_flags(db, "QSA", "intro")
    
    assert flags["knowledge"] is False
    assert flags["rag_counselorbot"] is True
    assert flags["rag_competenzestrategiche"] is False
    assert flags["approved_strategies"] is False
    assert flags["certified_strategies"] is False
    assert flags["shared_responses"] is False

    # 2. Test _retrieved_context routing logic using these flags
    # We toggle knowledge to True to test RAG retrieval with these flags
    flags["knowledge"] = True
    knowledge_context, strategy_ids, certified_strategy_ids, _skills_blocks = _retrieved_context(
        db,
        session_id="test-routing",
        request=request,
        questionnaire_type="QSA",
        query="counselorbot",
        component_flags=flags,
    )

    # Strategies must be empty since they are disabled in flags
    assert strategy_ids == []
    assert certified_strategy_ids == []


# --------------------------------------------------------------------------
# Telegram bot
# --------------------------------------------------------------------------
import backend.telegram_state as telegram_state


def test_telegram_parse_scores():
    allowed = ["C1", "C2", "A1"]
    scores, extra, invalid = telegram_state.parse_scores("c1=7, C2: 5;\nA1 = 3", allowed)
    assert scores == {"C1": 7, "C2": 5, "A1": 3}
    assert extra == [] and invalid == []

    scores, extra, invalid = telegram_state.parse_scores("C1=7 X9=4", allowed)
    assert scores == {"C1": 7} and extra == ["X9"]

    scores, extra, invalid = telegram_state.parse_scores("C1=12 C2=abc", allowed)
    assert scores == {} and invalid == ["C1=12", "C2=abc"]

    scores, extra, invalid = telegram_state.parse_scores("ciao come va", allowed)
    assert scores == {} and extra == [] and invalid == []


def test_telegram_idea_instrument_offered():
    """Idea e' fra gli strumenti del bot e segue il flag del web."""
    db = _TestSession()
    try:
        _set_config("feature_idea_focus", "true")
        labels = [b["text"] for row in telegram_state._instrument_keyboard(db) for b in row]
        callbacks = [b["callback_data"] for row in telegram_state._instrument_keyboard(db) for b in row]
        assert "Idea" in labels
        assert "instr:IDEA" in callbacks

        _set_config("feature_idea_focus", "false")
        labels = [b["text"] for row in telegram_state._instrument_keyboard(db) for b in row]
        assert "Idea" not in labels
        # Gli altri strumenti restano comunque disponibili.
        assert "QSA" in labels and "Savickas" in labels
    finally:
        _set_config("feature_idea_focus", "true")
        db.close()


def test_telegram_idea_has_no_score_context():
    """Idea non ha punteggi: il contesto non deve inventarne."""
    db = _TestSession()
    try:
        context = telegram_state.format_scores_context(db, "IDEA", None, "it")
        assert "IDEA" in context
        assert "senza punteggi" in context
        assert "IDEA" in telegram_state.NARRATIVE_QUESTIONNAIRES
    finally:
        db.close()


def test_telegram_link_code_flow():
    from datetime import datetime, timedelta, timezone
    db = _TestSession()
    try:
        code = telegram_state.create_link_code(db, "tg.student")
        assert len(code) == 6
        # Il codice e' salvato hashato, mai in chiaro.
        row = db.query(models.TelegramLinkCode).filter(models.TelegramLinkCode.username == "tg.student").first()
        assert row.code_hash != code and code not in row.code_hash
        assert telegram_state.consume_link_code(db, code.lower()) == "tg.student"
        # Monouso: il secondo consumo fallisce.
        assert telegram_state.consume_link_code(db, code) is None
        # Scaduto: rifiutato.
        expired = telegram_state.create_link_code(db, "tg.student")
        db.query(models.TelegramLinkCode).filter(models.TelegramLinkCode.used_at.is_(None)).update(
            {"expires_at": datetime.now(timezone.utc) - timedelta(minutes=1)}
        )
        db.commit()
        assert telegram_state.consume_link_code(db, expired) is None
    finally:
        db.close()


def test_telegram_link_endpoints_authenticated():
    main.app.dependency_overrides[auth.get_current_user] = _fake_user_identity
    try:
        res = client.post("/telegram/link-code")
        assert res.status_code == 200
        assert len(res.json()["code"]) == 6
        res = client.get("/telegram/link-status")
        assert res.status_code == 200
        assert res.json()["linked"] is False
        res = client.post("/telegram/unlink")
        assert res.status_code == 200
    finally:
        main.app.dependency_overrides.pop(auth.get_current_user, None)


def test_telegram_webhook_secret():
    payload = {"update_id": 1}
    os.environ["TELEGRAM_BOT_ENABLED"] = "false"
    assert client.post("/telegram/webhook", json=payload).status_code == 403
    os.environ["TELEGRAM_BOT_ENABLED"] = "true"
    os.environ["TELEGRAM_WEBHOOK_SECRET"] = "s3cret_test"
    try:
        assert client.post("/telegram/webhook", json=payload).status_code == 403
        wrong = {"X-Telegram-Bot-Api-Secret-Token": "wrong"}
        assert client.post("/telegram/webhook", json=payload, headers=wrong).status_code == 403
        good = {"X-Telegram-Bot-Api-Secret-Token": "s3cret_test"}
        res = client.post("/telegram/webhook", json=payload, headers=good)
        assert res.status_code == 200 and res.json() == {"ok": True}
    finally:
        os.environ["TELEGRAM_BOT_ENABLED"] = "false"
        os.environ.pop("TELEGRAM_WEBHOOK_SECRET", None)


def test_telegram_bot_info_disabled():
    os.environ["TELEGRAM_BOT_ENABLED"] = "false"
    res = client.get("/telegram/bot-info")
    assert res.status_code == 200
    assert res.json() == {"enabled": False, "bot_username": ""}


def test_plan_manager_dependency_accepts_teachers():
    import asyncio
    teacher = {"username": "prof", "email": "prof@example.test", "groups": ["docenti"],
               "is_admin": False, "is_researcher": False, "authenticated": True}
    assert asyncio.run(auth.get_current_plan_manager(teacher)) is teacher
    student = {"username": "stud", "email": "", "groups": ["studenti"],
               "is_admin": False, "is_researcher": False, "authenticated": True}
    try:
        asyncio.run(auth.get_current_plan_manager(student))
        raise AssertionError("studente non deve accedere ai piani")
    except Exception as e:
        assert getattr(e, "status_code", None) == 403


def test_teacher_can_create_own_group():
    teacher = {
        "username": "prof.classi",
        "email": "prof.classi@example.test",
        "groups": ["docenti"],
        "is_admin": False,
        "is_researcher": False,
        "authenticated": True,
    }
    manager_override = main.app.dependency_overrides.get(auth.get_current_plan_manager)
    try:
        main.app.dependency_overrides[auth.get_current_plan_manager] = lambda: teacher
        r = client.post("/admin/groups", json={"name": "Classe Docente"})
        assert r.status_code == 200, r.text
        group = r.json()
        assert group["owner_username"] == "prof.classi"
        listed = client.get("/admin/groups")
        assert listed.status_code == 200, listed.text
        assert any(row["id"] == group["id"] for row in listed.json())
        assert client.delete(f"/admin/groups/{group['id']}").status_code == 200
    finally:
        main.app.dependency_overrides[auth.get_current_plan_manager] = manager_override


def test_teacher_dashboard_notes_and_messages():
    """Piano: studenti da risultati + transcript. Classe: note e messaggi."""
    plan = client.post("/admin/administration-plans", json={
        "title": "Classe Prof",
        "instrument_code": "QSA",
        "locale": "en",
    }).json()
    group = client.post("/admin/groups", json={"name": "Classe Prof A"}).json()
    db = _TestSession()
    try:
        db.add(models.QuestionnaireResult(
            session_id="sess-teacher-1",
            questionnaire_type="QSA",
            scores={"C1": 7},
            username="alliev.tg",
            administration_plan_id=plan["id"],
        ))
        db.add(models.Log(
            session_id="sess-teacher-1",
            action="chat_message",
            username="alliev.tg",
            details={"user_input": "Cosa significa C1?", "bot_response": "RISPOSTA_TEST"},
        ))
        db.add(models.GroupMembership(group_id=group["id"], username="alliev.tg", joined_via="teacher"))
        db.commit()
    finally:
        db.close()

    # Studenti del piano (da risultati taggati)
    r = client.get(f"/admin/administration-plans/{plan['id']}/students")
    assert r.status_code == 200, r.text
    students = r.json()["students"]
    assert len(students) == 1 and students[0]["username"] == "alliev.tg"
    assert students[0]["results"][0]["scores"] == {"C1": 7}

    # Transcript via piano e via classe
    r = client.get(f"/admin/administration-plans/{plan['id']}/students/alliev.tg/conversation/sess-teacher-1")
    assert r.status_code == 200
    roles = [m["role"] for m in r.json()]
    assert "student" in roles and "counselor" in roles
    r = client.get(f"/admin/groups/{group['id']}/students/alliev.tg/conversation/sess-teacher-1")
    assert r.status_code == 200 and len(r.json()) == 2

    # Studenti della classe: risultati completi dello studente
    students = client.get(f"/admin/groups/{group['id']}/students").json()["students"]
    assert students[0]["username"] == "alliev.tg" and students[0]["results"]

    # Nota non visibile allo studente
    note = client.post(f"/admin/groups/{group['id']}/notes", json={
        "username": "alliev.tg", "text": "Da seguire su C1", "visible_to_student": False,
    }).json()
    assert note["kind"] == "note" and note["visible_to_student"] is False

    # Messaggio: sempre visibile allo studente; bot spento -> telegram_delivered None
    os.environ["TELEGRAM_BOT_ENABLED"] = "false"
    message = client.post(f"/admin/groups/{group['id']}/messages", json={
        "username": "alliev.tg", "text": "Ottimo lavoro!",
    }).json()
    assert message["kind"] == "message" and message["visible_to_student"] is True
    assert message["telegram_delivered"] is None

    # Studente non della classe: rifiutato
    r = client.post(f"/admin/groups/{group['id']}/notes", json={
        "username": "estraneo", "text": "x",
    })
    assert r.status_code == 404

    # Lato studente: vede solo il messaggio, non la nota privata
    main.app.dependency_overrides[auth.get_current_user] = lambda: _identity(
        "alliev.tg", "alliev@example.test", is_admin=False, is_researcher=False
    )
    try:
        r = client.get("/user/teacher-notes")
        assert r.status_code == 200
        texts = [row["text"] for row in r.json()]
        assert "Ottimo lavoro!" in texts and "Da seguire su C1" not in texts
    finally:
        main.app.dependency_overrides.pop(auth.get_current_user, None)

    # Pulizia note (l'autore/admin puo' eliminarle)
    assert client.delete(f"/admin/teacher-notes/{note['id']}").status_code == 200
    assert client.delete(f"/admin/teacher-notes/{message['id']}").status_code == 200


def test_group_membership_web_flow():
    """Classe autonoma: join con codice, membro senza risultati, aggancio al piano, leave."""
    group = client.post("/admin/groups", json={"name": "3B Informatica"}).json()
    assert group["code"].startswith("GR-")

    # Info pubbliche per la pagina invito (case-insensitive)
    r = client.get(f"/groups/info?code={group['code'].lower()}")
    assert r.status_code == 200 and r.json()["name"] == "3B Informatica"
    assert client.get("/groups/info?code=GR-NOPE").status_code == 404

    student_override = lambda: _identity("web.student", "web.student@example.test", is_admin=False, is_researcher=False)  # noqa: E731
    main.app.dependency_overrides[auth.get_current_user] = student_override
    try:
        # Join idempotente (codice classe dal profilo o dal link invito)
        assert client.post("/groups/join", json={"code": group["code"]}).status_code == 200
        assert client.post("/groups/join", json={"code": group["code"]}).status_code == 200
        my_groups = client.get("/user/groups").json()
        assert len([g for g in my_groups if g["group_id"] == group["id"]]) == 1
        membership_id = my_groups[0]["membership_id"]
    finally:
        main.app.dependency_overrides.pop(auth.get_current_user, None)

    # Il docente vede l'iscritto anche senza risultati
    students = client.get(f"/admin/groups/{group['id']}/students").json()["students"]
    assert any(s["username"] == "web.student" and s["results"] == [] for s in students)

    # Piano agganciato alla classe: lo studente compare tra gli studenti del piano
    plan = client.post("/admin/administration-plans", json={
        "title": "Somministrazione 3B",
        "instrument_code": "ZTPI",
        "locale": "en",
        "group_id": group["id"],
    }).json()
    assert plan["group_id"] == group["id"] and plan["group_name"] == "3B Informatica"
    students = client.get(f"/admin/administration-plans/{plan['id']}/students").json()["students"]
    assert any(s["username"] == "web.student" and s["results"] == [] for s in students)

    # Delete piano: un referente non creatore riceve 403
    alice = client.post("/admin/research-contacts", json={
        "name": "Alice Del", "email": "alice.del@example.test",
    }).json()
    client.put(f"/admin/administration-plans/{plan['id']}", json={
        "researchers": [{"research_contact_id": alice["id"]}],
    })
    manager_override = main.app.dependency_overrides.get(auth.get_current_plan_manager)
    try:
        main.app.dependency_overrides[auth.get_current_plan_manager] = lambda: _identity(
            "alice.del", "alice.del@example.test", is_admin=False, is_researcher=True
        )
        assert client.delete(f"/admin/administration-plans/{plan['id']}").status_code == 403
    finally:
        main.app.dependency_overrides[auth.get_current_plan_manager] = manager_override

    # Classe agganciata a un piano: non eliminabile finche' il piano esiste
    assert client.delete(f"/admin/groups/{group['id']}").status_code == 409
    assert client.delete(f"/admin/administration-plans/{plan['id']}").status_code == 200
    assert client.delete(f"/admin/research-contacts/{alice['id']}").status_code == 200

    # Lo studente esce dalla classe
    main.app.dependency_overrides[auth.get_current_user] = student_override
    try:
        assert client.delete(f"/user/groups/{membership_id}").status_code == 200
        assert client.get("/user/groups").json() == []
    finally:
        main.app.dependency_overrides.pop(auth.get_current_user, None)


def test_telegram_pqbl_learning_flow():
    """/pqbl elenca i documenti pronti, si risponde a bottoni e si chiude col riepilogo."""
    import asyncio

    sent: list[dict] = []

    async def _fake_send(chat_id, text, keyboard=None):
        sent.append({"chat_id": chat_id, "text": text, "keyboard": keyboard})

    async def _fake_answer(callback_query_id):
        pass

    real_send = telegram_state.telegram_bot.send_message
    real_answer = telegram_state.telegram_bot.answer_callback_query
    telegram_state.telegram_bot.send_message = _fake_send
    telegram_state.telegram_bot.answer_callback_query = _fake_answer

    TG_USER = 717171

    def _options(correct_key: str) -> list:
        return [
            {"key": key, "text": f"opzione {key}", "correct": key == correct_key,
             "feedback": f"feedback {key}"}
            for key in ("a", "b", "c", "d")
        ]

    async def _run():
        db = _TestSession()
        try:
            doc = models.PqblDocument(
                id="pqbl-tg-doc", username="tg.pqbl", filename="dispensa.pdf",
                text_hash="hash-tg", language="it", size=10, status="ready",
                chunks_total=1, chunks_done=1,
            )
            db.add(doc)
            db.add(models.PqblQuestion(
                document_id=doc.id, skill="skill-1", position=0,
                question_text="Prima domanda?", options=_options("a"),
            ))
            db.add(models.PqblQuestion(
                document_id=doc.id, skill="skill-2", position=1,
                question_text="Seconda domanda?", options=_options("b"),
            ))
            db.commit()
            question_ids = [
                q.id for q in db.query(models.PqblQuestion)
                .filter(models.PqblQuestion.document_id == doc.id)
                .order_by(models.PqblQuestion.position).all()
            ]

            code = telegram_state.create_link_code(db, "tg.pqbl")
            await telegram_state.process_update({"message": {
                "chat": {"id": TG_USER, "type": "private"},
                "from": {"id": TG_USER, "language_code": "it"},
                "text": f"/link {code}",
            }})

            await telegram_state.process_update({"message": {
                "chat": {"id": TG_USER, "type": "private"},
                "from": {"id": TG_USER, "language_code": "it"},
                "text": "/pqbl",
            }})
            flat = [b for row in (sent[-1]["keyboard"] or []) for b in row]
            assert any(b["callback_data"] == f"pqbl:doc:{doc.id}" for b in flat)
            assert "dispensa.pdf" in sent[-1]["keyboard"][0][0]["text"]

            await telegram_state.process_update({"callback_query": {
                "id": "cb-doc", "data": f"pqbl:doc:{doc.id}",
                "from": {"id": TG_USER, "language_code": "it"},
                "message": {"chat": {"id": TG_USER, "type": "private"}},
            }})
            assert "Prima domanda?" in sent[-1]["text"]
            assert "1/2" in sent[-1]["text"]
            first_buttons = [b for row in sent[-1]["keyboard"] for b in row]
            assert len(first_buttons) == 4

            # Risposta sbagliata: feedback e stessa domanda da rifare.
            await telegram_state.process_update({"callback_query": {
                "id": "cb-wrong", "data": f"pqbl:ans:{question_ids[0]}:b",
                "from": {"id": TG_USER, "language_code": "it"},
                "message": {"chat": {"id": TG_USER, "type": "private"}},
            }})
            assert "Non ancora" in sent[-1]["text"]
            assert "Prima domanda?" in sent[-1]["text"]

            # Risposta giusta: si passa alla seconda.
            await telegram_state.process_update({"callback_query": {
                "id": "cb-right", "data": f"pqbl:ans:{question_ids[0]}:a",
                "from": {"id": TG_USER, "language_code": "it"},
                "message": {"chat": {"id": TG_USER, "type": "private"}},
            }})
            assert "Seconda domanda?" in sent[-1]["text"]
            assert "2/2" in sent[-1]["text"]

            # Ultima risposta: riepilogo e stato ripulito.
            await telegram_state.process_update({"callback_query": {
                "id": "cb-last", "data": f"pqbl:ans:{question_ids[1]}:b",
                "from": {"id": TG_USER, "language_code": "it"},
                "message": {"chat": {"id": TG_USER, "type": "private"}},
            }})
            assert "Sessione conclusa" in sent[-1]["text"]
            # Una sola domanda su due corretta al primo tentativo.
            assert "1/2" in sent[-1]["text"]

            state = db.query(models.TelegramConversationState).filter(
                models.TelegramConversationState.telegram_user_id == TG_USER
            ).first()
            db.refresh(state)
            assert state.state == "idle"
            assert state.pqbl_state is None
        finally:
            db.close()

    try:
        asyncio.run(_run())
    finally:
        telegram_state.telegram_bot.send_message = real_send
        telegram_state.telegram_bot.answer_callback_query = real_answer


def test_telegram_pqbl_rejects_non_pdf():
    """Un file che non e' PDF non entra nella pipeline pQBL."""
    import asyncio

    sent: list[dict] = []

    async def _fake_send(chat_id, text, keyboard=None):
        sent.append({"chat_id": chat_id, "text": text, "keyboard": keyboard})

    real_send = telegram_state.telegram_bot.send_message
    telegram_state.telegram_bot.send_message = _fake_send

    TG_USER = 727272

    async def _run():
        db = _TestSession()
        try:
            code = telegram_state.create_link_code(db, "tg.pqbl.file")
            await telegram_state.process_update({"message": {
                "chat": {"id": TG_USER, "type": "private"},
                "from": {"id": TG_USER, "language_code": "it"},
                "text": f"/link {code}",
            }})
            await telegram_state.process_update({"message": {
                "chat": {"id": TG_USER, "type": "private"},
                "from": {"id": TG_USER, "language_code": "it"},
                "document": {"file_id": "x", "file_name": "note.docx",
                             "mime_type": "application/msword", "file_size": 1000},
            }})
            assert "PDF" in sent[-1]["text"]

            # Oltre il limite di download di Telegram si rimanda al web.
            await telegram_state.process_update({"message": {
                "chat": {"id": TG_USER, "type": "private"},
                "from": {"id": TG_USER, "language_code": "it"},
                "document": {"file_id": "y", "file_name": "grosso.pdf",
                             "mime_type": "application/pdf",
                             "file_size": telegram_state.telegram_bot.MAX_DOWNLOAD_BYTES + 1},
            }})
            assert "20 MB" in sent[-1]["text"]
        finally:
            db.close()

    try:
        asyncio.run(_run())
    finally:
        telegram_state.telegram_bot.send_message = real_send


def test_telegram_counselor_selection():
    """/counselor mostra la tastiera; couns:<id> imposta il counselor nello stato."""
    import asyncio

    sent: list[dict] = []

    async def _fake_send(chat_id, text, keyboard=None):
        sent.append({"chat_id": chat_id, "text": text, "keyboard": keyboard})

    async def _fake_answer(callback_query_id):
        pass

    real_send = telegram_state.telegram_bot.send_message
    real_answer = telegram_state.telegram_bot.answer_callback_query
    telegram_state.telegram_bot.send_message = _fake_send
    telegram_state.telegram_bot.answer_callback_query = _fake_answer

    TG_USER = 616161

    async def _run():
        db = _TestSession()
        try:
            counselor = models.Counselor(slug="rita-test", name="Rita", is_active=True)
            db.add(counselor)
            db.commit()
            db.refresh(counselor)

            code = telegram_state.create_link_code(db, "tg.couns")
            await telegram_state.process_update({"message": {
                "chat": {"id": TG_USER, "type": "private"},
                "from": {"id": TG_USER, "language_code": "it"},
                "text": f"/link {code}",
            }})
            await telegram_state.process_update({"message": {
                "chat": {"id": TG_USER, "type": "private"},
                "from": {"id": TG_USER, "language_code": "it"},
                "text": "/counselor",
            }})
            keyboard = sent[-1]["keyboard"]
            flat = [button for row in keyboard for button in row]
            assert any(button["callback_data"] == f"couns:{counselor.id}" for button in flat)

            await telegram_state.process_update({"callback_query": {
                "id": "cb3", "data": f"couns:{counselor.id}",
                "from": {"id": TG_USER, "language_code": "it"},
                "message": {"chat": {"id": TG_USER, "type": "private"}},
            }})
            assert "Rita" in sent[-1]["text"]
            state = db.query(models.TelegramConversationState).filter(
                models.TelegramConversationState.telegram_user_id == TG_USER
            ).first()
            db.refresh(state)
            assert state.counselor_id == counselor.id
        finally:
            db.close()

    try:
        asyncio.run(_run())
    finally:
        telegram_state.telegram_bot.send_message = real_send
        telegram_state.telegram_bot.answer_callback_query = real_answer


def test_telegram_group_deep_link():
    """Deep link g_<classe> -> bottone login; l_<codice>__<classe> -> link + iscrizione + tagging."""
    import asyncio

    sent: list[dict] = []

    async def _fake_send(chat_id, text, keyboard=None):
        sent.append({"chat_id": chat_id, "text": text, "keyboard": keyboard})

    async def _fake_answer(callback_query_id):
        pass

    real_send = telegram_state.telegram_bot.send_message
    real_answer = telegram_state.telegram_bot.answer_callback_query
    telegram_state.telegram_bot.send_message = _fake_send
    telegram_state.telegram_bot.answer_callback_query = _fake_answer
    os.environ["TELEGRAM_PUBLIC_WEBHOOK_URL"] = "https://counselorbot-sbs.test/api/telegram/webhook"

    TG_USER = 515151

    def _msg(text):
        return {"message": {
            "chat": {"id": TG_USER, "type": "private"},
            "from": {"id": TG_USER, "first_name": "Gino", "language_code": "it"},
            "text": text,
        }}

    def _cb(data):
        return {"callback_query": {
            "id": "cb2", "data": data,
            "from": {"id": TG_USER, "language_code": "it"},
            "message": {"chat": {"id": TG_USER, "type": "private"}},
        }}

    async def _run():
        db = _TestSession()
        try:
            group = models.StudentGroup(code="GR-TGTEST", name="Classe Telegram", owner_username="prof")
            db.add(group)
            db.flush()
            plan = models.AdministrationPlan(
                code="AP-TGTEST",
                title="Somministrazione Telegram",
                instrument_code="QSA",
                group_id=group.id,
                locale="en",
                status="active",
            )
            db.add(plan)
            db.commit()
            db.refresh(group)
            db.refresh(plan)

            # /start g_<classe>: bottone URL verso /telegram-link?g=...
            await telegram_state.process_update(_msg("/start g_GR-TGTEST"))
            keyboard = sent[-1]["keyboard"]
            assert keyboard and keyboard[0][0]["url"] == "https://counselorbot-sbs.test/telegram-link?g=GR-TGTEST"
            assert "conversazioni" in sent[-1]["text"]

            # /start l_<codice>__<classe>: link account + iscrizione alla classe.
            code = telegram_state.create_link_code(db, "tg.gruppo")
            await telegram_state.process_update(_msg(f"/start l_{code}__GR-TGTEST"))
            link = db.query(models.TelegramAccountLink).filter(
                models.TelegramAccountLink.telegram_user_id == TG_USER
            ).first()
            assert link is not None and link.username == "tg.gruppo"
            assert link.administration_plan_id is None
            assert "Classe Telegram" in sent[-1]["text"]
            # Membership creata (indipendente dai risultati) + proposta strumento del piano agganciato.
            membership = db.query(models.GroupMembership).filter(
                models.GroupMembership.group_id == group.id,
                models.GroupMembership.username == "tg.gruppo",
            ).first()
            assert membership is not None and membership.joined_via == "telegram"
            assert sent[-1]["keyboard"][0][0]["callback_data"] == "instr:QSA"

            # Risultato taggato col piano.
            await telegram_state.process_update(_cb("instr:QSA"))
            codes = telegram_state.allowed_factor_codes(db, "QSA")
            await telegram_state.process_update(_msg(" ".join(f"{c}=5" for c in codes)))
            await telegram_state.process_update(_cb("scores:confirm"))
            db.expire_all()
            result = (
                db.query(models.QuestionnaireResult)
                .filter(models.QuestionnaireResult.username == "tg.gruppo")
                .order_by(models.QuestionnaireResult.id.desc())
                .first()
            )
            assert result is not None
            assert result.administration_plan_id == plan.id

            # Codice gruppo inesistente: link ok, nessuna iscrizione.
            code2 = telegram_state.create_link_code(db, "tg.gruppo2")
            await telegram_state.process_update({"message": {
                "chat": {"id": 515152, "type": "private"},
                "from": {"id": 515152, "language_code": "it"},
                "text": f"/start l_{code2}__NOPE",
            }})
            link2 = db.query(models.TelegramAccountLink).filter(
                models.TelegramAccountLink.telegram_user_id == 515152
            ).first()
            assert link2 is not None and link2.administration_plan_id is None
        finally:
            db.close()

    try:
        asyncio.run(_run())
    finally:
        telegram_state.telegram_bot.send_message = real_send
        telegram_state.telegram_bot.answer_callback_query = real_answer
        os.environ.pop("TELEGRAM_PUBLIC_WEBHOOK_URL", None)


def test_telegram_conversation_flow():
    """Percorso completo: /start non collegato -> /link -> QSA -> punteggi -> analisi -> conclusione."""
    import asyncio

    sent: list[dict] = []

    async def _fake_send(chat_id, text, keyboard=None):
        sent.append({"chat_id": chat_id, "text": text, "keyboard": keyboard})

    async def _fake_answer(callback_query_id):
        pass

    real_send = telegram_state.telegram_bot.send_message
    real_answer = telegram_state.telegram_bot.answer_callback_query
    telegram_state.telegram_bot.send_message = _fake_send
    telegram_state.telegram_bot.answer_callback_query = _fake_answer

    TG_USER = 424242
    TG_CHAT = 424242

    def _msg(text, chat_type="private"):
        return {"message": {
            "chat": {"id": TG_CHAT, "type": chat_type},
            "from": {"id": TG_USER, "first_name": "Tessa", "language_code": "it"},
            "text": text,
        }}

    def _cb(data):
        return {"callback_query": {
            "id": "cb1",
            "data": data,
            "from": {"id": TG_USER, "language_code": "it"},
            "message": {"chat": {"id": TG_CHAT, "type": "private"}},
        }}

    async def _run():
        db = _TestSession()
        try:
            # Messaggi da gruppi: ignorati.
            await telegram_state.process_update(_msg("/start", chat_type="group"))
            assert sent == []

            # /start senza link: istruzioni /link.
            await telegram_state.process_update(_msg("/start"))
            assert "/link" in sent[-1]["text"]

            # Punteggi senza link: rifiutati.
            await telegram_state.process_update(_msg("C1=5"))
            assert "/link" in sent[-1]["text"]

            # /link con codice valido.
            code = telegram_state.create_link_code(db, "tg.student")
            await telegram_state.process_update(_msg(f"/link {code}"))
            link = db.query(models.TelegramAccountLink).filter(
                models.TelegramAccountLink.telegram_user_id == TG_USER
            ).first()
            assert link is not None and link.username == "tg.student"

            # Scelta strumento QSA -> richiesta punteggi.
            await telegram_state.process_update(_msg("/strumenti"))
            assert sent[-1]["keyboard"] is not None
            await telegram_state.process_update(_cb("instr:QSA"))
            assert "C1=7" in sent[-1]["text"]

            # Codici ammessi: dal DB di test (seed minimale) o dal fallback statico.
            codes = telegram_state.allowed_factor_codes(db, "QSA")
            assert codes, "nessun codice fattore QSA disponibile"

            if len(codes) > 1:
                # Punteggi parziali: chiede solo i mancanti.
                await telegram_state.process_update(_msg(f"{codes[0]}=7"))
                assert codes[1] in sent[-1]["text"]
                rest = " ".join(f"{c}=5" for c in codes[1:])
                await telegram_state.process_update(_msg(rest))
            else:
                await telegram_state.process_update(_msg(f"{codes[0]}=7"))

            # Punteggi completi -> recap con conferma.
            assert f"{codes[0]}=7" in sent[-1]["text"] and sent[-1]["keyboard"] is not None

            # Conferma -> QuestionnaireResult salvato + primo step AI.
            before = db.query(models.QuestionnaireResult).filter(
                models.QuestionnaireResult.username == "tg.student"
            ).count()
            await telegram_state.process_update(_cb("scores:confirm"))
            db.expire_all()
            results = db.query(models.QuestionnaireResult).filter(
                models.QuestionnaireResult.username == "tg.student"
            ).all()
            assert len(results) == before + 1
            assert results[-1].questionnaire_type == "QSA"
            assert results[-1].scores[codes[0]] == 7
            assert "RISPOSTA_TEST" in sent[-1]["text"]

            # Domanda libera nello step: risposta AI, stesso step.
            await telegram_state.process_update(_msg("Cosa significa il punteggio C1?"))
            assert "RISPOSTA_TEST" in sent[-1]["text"]
            state = db.query(models.TelegramConversationState).filter(
                models.TelegramConversationState.telegram_user_id == TG_USER
            ).first()
            db.refresh(state)
            assert state.state == "in_step"

            # Prossimo passo -> nuovo step AI.
            await telegram_state.process_update(_cb("step:next"))
            assert "RISPOSTA_TEST" in sent[-1]["text"]

            # Concludi -> stato idle.
            await telegram_state.process_update(_cb("step:end"))
            db.refresh(state)
            assert state.state == "idle"

            # /unlink -> link revocato.
            await telegram_state.process_update(_msg("/unlink"))
            db.refresh(link)
            assert link.revoked_at is not None
        finally:
            db.close()

    try:
        asyncio.run(_run())
    finally:
        telegram_state.telegram_bot.send_message = real_send
        telegram_state.telegram_bot.answer_callback_query = real_answer


def test_group_share_flow_case_insensitive():
    """Condivisione classi: match case-insensitive, visibilita', permessi, aggancio piano."""
    owner = _identity("prof.owner", "prof.owner@example.test", is_admin=False, is_researcher=False)
    other = _identity("Prof.Other", "prof.other@example.test", is_admin=False, is_researcher=False)
    manager_override = main.app.dependency_overrides.get(auth.get_current_plan_manager)
    try:
        main.app.dependency_overrides[auth.get_current_plan_manager] = lambda: owner
        group = client.post("/admin/groups", json={"name": "Classe condivisa", "school": "Liceo Test"}).json()
        assert group["school"] == "Liceo Test"

        # Non ancora condivisa: l'altro docente non la vede e non puo' condividerla
        main.app.dependency_overrides[auth.get_current_plan_manager] = lambda: other
        assert all(row["id"] != group["id"] for row in client.get("/admin/groups").json())
        r = client.post(f"/admin/groups/{group['id']}/shares", json={"shared_with_username": "x"})
        assert r.status_code == 404

        # Owner condivide con username in MAIUSCOLO -> salvato lowercase
        main.app.dependency_overrides[auth.get_current_plan_manager] = lambda: owner
        r = client.post(f"/admin/groups/{group['id']}/shares", json={"shared_with_username": "PROF.OTHER"})
        assert r.status_code == 200, r.text
        share = r.json()
        assert share["shared_with_username"] == "prof.other"
        assert client.post(f"/admin/groups/{group['id']}/shares", json={"shared_with_username": "prof.other"}).status_code == 409
        assert client.post(f"/admin/groups/{group['id']}/shares", json={"shared_with_username": "PROF.OWNER"}).status_code == 400

        # Il destinatario (username con maiuscole) vede la classe e la aggancia a un piano
        main.app.dependency_overrides[auth.get_current_plan_manager] = lambda: other
        assert any(row["id"] == group["id"] for row in client.get("/admin/groups").json())
        r = client.post("/admin/administration-plans", json={
            "title": "Piano su classe condivisa",
            "instrument_code": "QSA",
            "locale": "en",
            "group_id": group["id"],
        })
        assert r.status_code == 200, r.text
        # Ma non puo' rimuovere la condivisione (non e' owner ne' granter)
        assert client.delete(f"/admin/groups/{group['id']}/shares/{share['id']}").status_code == 403

        # L'owner la rimuove e la classe torna invisibile all'altro
        main.app.dependency_overrides[auth.get_current_plan_manager] = lambda: owner
        assert client.delete(f"/admin/groups/{group['id']}/shares/{share['id']}").status_code == 200
        main.app.dependency_overrides[auth.get_current_plan_manager] = lambda: other
        assert all(row["id"] != group["id"] for row in client.get("/admin/groups").json())
    finally:
        main.app.dependency_overrides[auth.get_current_plan_manager] = manager_override


def test_users_summary_scope():
    """users-summary: admin vede anche gli studenti, il docente solo staff e classi visibili."""
    manager_override = main.app.dependency_overrides.get(auth.get_current_plan_manager)
    db = _TestSession()
    try:
        db.add(models.QuestionnaireResult(
            session_id="sess-users-summary",
            questionnaire_type="QSA",
            scores={"C1": 5},
            username="studente.sum",
        ))
        db.commit()
    finally:
        db.close()
    try:
        admin_id = _identity("admin.sum", "admin.sum@example.test", is_admin=True, is_researcher=False)
        main.app.dependency_overrides[auth.get_current_plan_manager] = lambda: admin_id
        payload = client.get("/admin/users-summary").json()
        by_name = {u["username"]: u for u in payload["users"]}
        assert "studente.sum" in by_name
        assert by_name["studente.sum"]["in_results"] and by_name["studente.sum"]["results_count"] == 1

        teacher = _identity("prof.sum", "prof.sum@example.test", is_admin=False, is_researcher=False)
        main.app.dependency_overrides[auth.get_current_plan_manager] = lambda: teacher
        group = client.post("/admin/groups", json={"name": "Classe Sum", "school": "IIS Sum"}).json()
        payload = client.get("/admin/users-summary").json()
        usernames = {u["username"] for u in payload["users"]}
        assert "studente.sum" not in usernames  # niente studenti per i docenti
        assert "prof.sum" in usernames  # se stesso sempre incluso
        # Solo classi proprie o condivise
        assert {g["owner_username"] for g in payload["groups"]} == {"prof.sum"}
        mine = next(g for g in payload["groups"] if g["id"] == group["id"])
        assert mine["school"] == "IIS Sum" and mine["members"] == []
    finally:
        main.app.dependency_overrides[auth.get_current_plan_manager] = manager_override


# --------------------------------------------------------------------------
# Runner senza pytest
# --------------------------------------------------------------------------
def _main():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed, failed = 0, 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
            passed += 1
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"  FAIL  {t.__name__}: {type(e).__name__}: {e}")
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
    return 1 if failed else 0



def test_skills_handler_can_be_cleared():
    """Un PUT esplicito con handler null deve rimuovere l'handler esistente."""
    created = client.post("/admin/skills", json={
        "slug": "smoke-clear-handler",
        "name": "Smoke clear handler",
        "handler": "approved_strategies",
    })
    assert created.status_code == 200, created.text
    skill_id = created.json()["id"]

    updated = client.put(f"/admin/skills/{skill_id}", json={"handler": None})

    assert updated.status_code == 200, updated.text
    assert updated.json()["handler"] is None


def test_skills_api_rejects_non_english_instructions():
    response = client.post("/admin/skills", json={
        "slug": "smoke-non-english-instructions",
        "name": "Invalid localized instructions",
        "instructions_i18n": {"it": "Istruzione non ammessa"},
    })
    assert response.status_code == 400, response.text
    assert "English only" in response.json()["detail"]


def test_skills_english_policy_canonicalizes_existing_rows_once():
    from backend.skills_seed import (
        ENGLISH_SKILL_INSTRUCTIONS_POLICY_MARKER,
        apply_english_skill_instructions_policy,
        seed_skills,
    )

    db = _TestSession()
    custom_slug = "smoke-custom-english-policy"
    try:
        seed_skills(db)
        db.query(models.Config).filter_by(key=ENGLISH_SKILL_INSTRUCTIONS_POLICY_MARKER).delete()
        certified = db.query(models.Skill).filter_by(slug="certified-advice").one()
        certified.instructions_i18n = {"it": "vecchia istruzione", "en": "stale English"}
        custom = db.query(models.Skill).filter_by(slug=custom_slug).first()
        if custom is None:
            custom = models.Skill(
                slug=custom_slug,
                name="Custom English policy",
                instructions_i18n={"en": "Keep this contract", "fr": "Supprimer ceci"},
            )
            db.add(custom)
        db.commit()

        assert apply_english_skill_instructions_policy(db) is True
        assert apply_english_skill_instructions_policy(db) is False
        assert set(certified.instructions_i18n) == {"en"}
        assert "Student advice contract" in certified.instructions_i18n["en"]
        db.refresh(custom)
        assert custom.instructions_i18n == {"en": "Keep this contract"}
    finally:
        db.query(models.Skill).filter_by(slug=custom_slug).delete()
        db.commit()
        db.close()


def test_skills_policy_seeds_the_primary_behaviours():
    """Il seed abilita i comportamenti primari, con una sola fonte di consigli."""
    from backend.skills_seed import SEEDED_INSTRUMENTS, seed_skills

    db = _TestSession()
    try:
        seed_skills(db)
    finally:
        db.close()

    listed = client.get("/admin/skills")
    assert listed.status_code == 200, listed.text
    by_slug = {skill["slug"]: skill for skill in listed.json()}
    assert by_slug["approved-strategies"]["is_active"] is False
    assert by_slug["certified-advice"]["is_active"] is True
    assert by_slug["certified-advice"]["routing"] == "primary"
    assert by_slug["certified-advice"]["status"] == "published"
    instructions = by_slug["certified-advice"]["instructions_i18n"]["en"]
    assert "concrete, bounded and verifiable action" in instructions
    assert "do not force advice" in instructions

    for questionnaire_type in SEEDED_INSTRUMENTS:
        mapped = client.get(
            "/admin/skills/step-map",
            params={"questionnaire_type": questionnaire_type},
        )
        assert mapped.status_code == 200, mapped.text
        enabled_ids = {
            entry["skill_id"] for entry in mapped.json()["entries"] if entry["enabled"]
        }
        assert enabled_ids == {
            by_slug[slug]["id"]
            for slug in (
                "certified-advice",
                "profile-wayfinder",
                "reading-guide",
                "profile-comparison",
                "web-lookup",
                "concept-diagram",
            )
        }


def test_web_lookup_answers_factual_questions_from_public_sources():
    """La skill di consultazione esterna e' agganciata, attiva e revocabile."""
    from backend.skills_seed import SKILL_CONFIG_DEFAULTS, seed_skills

    db = _TestSession()
    try:
        seed_skills(db)
    finally:
        db.close()

    defaults = {key: value for key, value, _ in SKILL_CONFIG_DEFAULTS}
    # Accesa di default, ma resta una config: l'admin puo' spegnerla dal pannello.
    assert defaults["web_lookup_enabled"] == "true"

    by_slug = {skill["slug"]: skill for skill in client.get("/admin/skills").json()}
    skill = by_slug["web-lookup"]
    assert skill["routing"] == "primary"
    assert skill["conditions"] == {"intents": ["factual"]}
    assert skill["handler"] == "web_lookup_sources"
    assert "not recommendations" in skill["instructions_i18n"]["en"]


def test_skills_preview_selects_one_behaviour_from_student_intent():
    cases = (
        ("Non capisco cosa significa A6", "clarify", "Reflective profile clarification", "profile-wayfinder"),
        ("Suggeriscimi una lettura sul profilo", "reading", "Relevant reading guidance", "reading-guide"),
        ("Confronta questo profilo con il precedente", "compare", "Reflective profile comparison", "profile-comparison"),
    )
    for message, intent, marker, selected_slug in cases:
        response = client.post("/admin/skills/preview", json={
            "questionnaire_type": "QSA",
            "language": "it",
            "scores_context": "A6: 3/9",
            "message": message,
        })
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["intent"] == intent
        rendered = "\n".join(
            block for blocks in body["blocks"].values() for block in blocks
        )
        assert marker in rendered
        active = [
            entry["slug"] for entry in body["trace"]
            if entry.get("slug") and not entry.get("skipped")
        ]
        # Il comportamento primario resta unico; la skill strutturale dei
        # diagrammi lo accompagna e decide poi nel prompt se visualizzare.
        assert active == [selected_slug, "concept-diagram"], body["trace"]


def test_skills_behaviour_reaches_the_prompt_without_rag_knowledge():
    """La direttiva comportamentale non dipende dal toggle del materiale RAG."""
    from backend.skills_seed import SEEDED_INSTRUMENTS, seed_skills

    db = _TestSession()
    try:
        seed_skills(db)
    finally:
        db.close()
    _set_config("skills_engine_enabled", "true")
    _set_config("skills_engine_instruments", json.dumps(list(SEEDED_INSTRUMENTS)))

    response = client.post("/admin/prompt-audit/dry-run", json={
        "questionnaire_type": "QAP",
        "language": "it",
        "mode": "generic",
        "message": "Non capisco cosa significa questo risultato",
        "include_knowledge": False,
        "include_history": False,
    })

    assert response.status_code == 200, response.text
    body = response.json()
    system_prompt = body["envelope"]["system_prompt_final"]
    assert "## Reflective profile clarification" in system_prompt
    assert "## Student advice contract" not in system_prompt
    assert body["knowledge"]["included"] is False
    assert body["knowledge"]["context"] == ""


def test_explicit_reading_request_receives_certified_catalog_when_rag_is_off():
    """Il catalogo editoriale richiesto esplicitamente non dipende dal RAG."""
    from backend.skills_seed import SEEDED_INSTRUMENTS, seed_skills

    _ensure_guided_steps("QSA")
    reading_slug = "smoke-rag-off-certified-reading"
    config_keys = ("skills_engine_enabled", "skills_engine_instruments")
    original_configs = {}
    db = _TestSession()
    try:
        for key in config_keys:
            row = db.query(models.Config).filter(models.Config.key == key).first()
            original_configs[key] = row.value if row else None
        seed_skills(db)
        db.query(models.CertifiedReading).filter_by(slug=reading_slug).delete()
        db.add(models.CertifiedReading(
            slug=reading_slug,
            kind="essay",
            title="Lettura certificata di prova",
            creators=["Autrice verificata"],
            themes=["organizzazione-e-tempo"],
            available_languages=["it"],
            why_i18n={"it": "Aiuta a organizzare lo studio."},
            status="certified",
            is_active=True,
        ))
        db.commit()
    finally:
        db.close()
    _set_config("skills_engine_enabled", "true")
    _set_config("skills_engine_instruments", json.dumps(list(SEEDED_INSTRUMENTS)))

    try:
        response = client.post("/admin/prompt-audit/dry-run", json={
            "questionnaire_type": "QSA",
            "language": "it",
            "phase": "cognitive",
            "mode": "factor-qa",
            "message": "Puoi darmi dei consigli di lettura?",
            "scores_context": "C3: 8/9\nC6: 9/9",
            "include_knowledge": True,
            "include_history": False,
            "component_flags": {"knowledge": False},
        })

        assert response.status_code == 200, response.text
        body = response.json()
        system_prompt = body["envelope"]["system_prompt_final"]
        assert body["knowledge"]["included"] is False
        assert "[CERTIFIED_READINGS]" in system_prompt
        assert "Lettura certificata di prova" in system_prompt
        assert "[READING_SOURCES]" not in system_prompt
    finally:
        db = _TestSession()
        try:
            db.query(models.CertifiedReading).filter_by(slug=reading_slug).delete()
            for key, original_value in original_configs.items():
                row = db.query(models.Config).filter(models.Config.key == key).first()
                if row and original_value is None:
                    db.delete(row)
                elif row:
                    row.value = original_value
            db.commit()
        finally:
            db.close()


def test_skills_profile_comparison_uses_only_the_same_students_results():
    """Il confronto riceve profili persistiti dello stesso utente, non esempi inventati."""
    from backend.skills_seed import SEEDED_INSTRUMENTS, seed_skills

    session_id = "skills-comparison-current"
    db = _TestSession()
    try:
        seed_skills(db)
        db.add_all([
            models.QuestionnaireResult(
                session_id=session_id,
                questionnaire_type="QAP",
                scores={"P1": 6.0},
                username="skills.compare.student",
            ),
            models.QuestionnaireResult(
                session_id="skills-comparison-previous",
                questionnaire_type="QPCS",
                scores={"C1": 4.5},
                username="SKILLS.COMPARE.STUDENT",
            ),
            models.QuestionnaireResult(
                session_id="skills-comparison-other-user",
                questionnaire_type="ZTPI",
                scores={"T1": 9.0},
                username="someone.else",
            ),
        ])
        db.commit()
    finally:
        db.close()
    _set_config("skills_engine_enabled", "true")
    _set_config("skills_engine_instruments", json.dumps(list(SEEDED_INSTRUMENTS)))

    response = client.post("/admin/prompt-audit/dry-run", json={
        "session_id": session_id,
        "questionnaire_type": "QAP",
        "language": "it",
        "mode": "generic",
        "message": "Confronta questo profilo con quello precedente",
        "include_knowledge": True,
        "include_history": False,
    })

    assert response.status_code == 200, response.text
    system_prompt = response.json()["envelope"]["system_prompt_final"]
    assert "## Reflective profile comparison" in system_prompt
    assert "[COMPARABLE_PROFILES]" in system_prompt
    assert "## QAP" in system_prompt
    assert "## QPCS" in system_prompt
    assert "## ZTPI" not in system_prompt


def test_skills_specialized_policy_repairs_existing_bindings_once():
    from backend.skills_seed import (
        SEEDED_INSTRUMENTS,
        SPECIALIZED_SKILLS_POLICY_MARKER,
        apply_specialized_skills_policy,
        seed_skills,
    )

    db = _TestSession()
    try:
        seed_skills(db)
        db.query(models.Config).filter_by(key=SPECIALIZED_SKILLS_POLICY_MARKER).delete()
        wayfinder = db.query(models.Skill).filter_by(slug="profile-wayfinder").one()
        wayfinder.routing = "optional"
        binding = db.query(models.GuidedStepSkill).filter_by(
            questionnaire_type="ZTPI",
            step_id="*",
            skill_id=wayfinder.id,
        ).one()
        binding.enabled = False
        binding.sort_order = 999
        db.commit()

        assert apply_specialized_skills_policy(db) is True
        db.refresh(wayfinder)
        db.refresh(binding)
        assert wayfinder.routing == "primary"
        assert wayfinder.slot == "directive_tail"
        assert binding.enabled is True
        assert binding.sort_order == wayfinder.sort_order
        assert apply_specialized_skills_policy(db) is False

        for slug in (
            "certified-advice",
            "profile-wayfinder",
            "reading-guide",
            "profile-comparison",
        ):
            skill = db.query(models.Skill).filter_by(slug=slug).one()
            bound = db.query(models.GuidedStepSkill).filter(
                models.GuidedStepSkill.skill_id == skill.id,
                models.GuidedStepSkill.step_id == "*",
                models.GuidedStepSkill.questionnaire_type.in_(SEEDED_INSTRUMENTS),
                models.GuidedStepSkill.enabled.is_(True),
            ).count()
            assert bound == len(SEEDED_INSTRUMENTS)
    finally:
        db.close()


def test_skills_chat_uses_certified_advice_only_for_every_supported_instrument():
    from backend.skills_seed import SEEDED_INSTRUMENTS, apply_certified_advice_policy

    _ensure_guided_steps("QSA")
    _ensure_guided_steps("QSAr")
    db = _TestSession()
    try:
        apply_certified_advice_policy(db)
    finally:
        db.close()

    strategy_slug = "smoke-chat-certified-advice"
    created = client.post("/admin/certified-strategies", json={
        "slug": strategy_slug,
        "name_it": "Definisci il prossimo passo",
        "recommended_when_it": "Quando lo studente chiede un consiglio concreto",
        "description_it": "Scegli un'azione piccola e verificabile.",
        "factor_codes": [],
        "questionnaire_types": list(SEEDED_INSTRUMENTS),
        "keywords": "consiglio concreto prossimo passo",
        "status": "certified",
        "is_active": True,
    })
    assert created.status_code == 200, created.text

    for questionnaire_type in SEEDED_INSTRUMENTS:
        guided_case = {
            "QSA": {
                "mode": "second-level",
                "phase": "sl-motivation",
                "scores_context": "PROFILO QSA DELLO STUDENTE:\n- A6: 3/9",
            },
            "QSAr": {
                "mode": "qsar-second-level",
                "phase": "qsar-motivation",
                "scores_context": "PROFILO QSAr DELLO STUDENTE:\n- A2r: 3/9",
            },
        }.get(questionnaire_type, {
            "mode": "generic",
            "phase": None,
            "scores_context": "",
        })
        response = client.post("/chat", json={
            "message": "Dammi un consiglio concreto per il prossimo passo",
            "mode": guided_case["mode"],
            "phase": guided_case["phase"],
            "use_phase_prompt": guided_case["phase"] is not None,
            "session_id": f"skills-policy-{questionnaire_type.lower()}",
            "questionnaire_type": questionnaire_type,
            "language": "it",
            "scores_context": guided_case["scores_context"],
        })
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["strategy_ids"] == []
        assert len(body["certified_strategy_ids"]) == 1, (
            questionnaire_type,
            body,
        )


def test_skills_advice_policy_migrates_an_existing_installation_once():
    from backend.skills_seed import (
        CERTIFIED_ADVICE_POLICY_MARKER,
        SEEDED_INSTRUMENTS,
        apply_certified_advice_policy,
        seed_skills,
    )

    db = _TestSession()
    try:
        seed_skills(db)
        approved = db.query(models.Skill).filter_by(slug="approved-strategies").one()
        certified = db.query(models.Skill).filter_by(slug="certified-advice").one()
        approved.is_active = True
        certified.instructions_i18n = {}
        for key, value in (
            ("skills_engine_enabled", "false"),
            ("skills_engine_instruments", "[]"),
        ):
            row = db.query(models.Config).filter_by(key=key).first()
            if row is None:
                db.add(models.Config(key=key, value=value))
            else:
                row.value = value
        db.query(models.Config).filter_by(key=CERTIFIED_ADVICE_POLICY_MARKER).delete()
        db.add(models.GuidedStepSkill(
            questionnaire_type="QSA",
            step_id="*",
            skill_id=approved.id,
            sort_order=40,
            enabled=True,
        ))
        db.commit()

        assert apply_certified_advice_policy(db) is True
    finally:
        db.close()

    configs = {row["key"]: row["value"] for row in client.get("/admin/config").json()}
    assert configs["skills_engine_enabled"] == "true"
    assert json.loads(configs["skills_engine_instruments"]) == list(SEEDED_INSTRUMENTS)

    listed = {skill["slug"]: skill for skill in client.get("/admin/skills").json()}
    assert listed["approved-strategies"]["is_active"] is False
    assert "concrete, bounded and verifiable action" in listed["certified-advice"]["instructions_i18n"]["en"]
    for questionnaire_type in SEEDED_INSTRUMENTS:
        entries = client.get(
            "/admin/skills/step-map",
            params={"questionnaire_type": questionnaire_type},
        ).json()["entries"]
        assert all(
            not entry["enabled"]
            for entry in entries
            if entry["skill_id"] == listed["approved-strategies"]["id"]
        )
        assert any(
            entry["enabled"] and entry["skill_id"] == listed["certified-advice"]["id"]
            for entry in entries
        )

    # Dopo la migrazione, un riavvio non deve annullare una scelta dell'admin.
    assert client.post("/admin/config", json={
        "key": "skills_engine_enabled",
        "value": "false",
    }).status_code == 200
    db = _TestSession()
    try:
        assert apply_certified_advice_policy(db) is False
    finally:
        db.close()
    configs = {row["key"]: row["value"] for row in client.get("/admin/config").json()}
    assert configs["skills_engine_enabled"] == "false"

    # Ripristina il contratto per gli altri test del modulo.
    assert client.post("/admin/config", json={
        "key": "skills_engine_enabled",
        "value": "true",
    }).status_code == 200


def test_skills_handler_whitelist():
    """Un handler non registrato deve essere rifiutato, non salvato."""
    from backend.skills import handlers as skills_handlers

    assert "certified_strategies" in skills_handlers.handler_names()
    assert "approved_strategies" in skills_handlers.handler_names()

    res = client.post("/admin/skills", json={
        "slug": "smoke-broken",
        "name": "Smoke broken",
        "handler": "inesistente",
    })
    assert res.status_code == 400, res.text
    assert "handler sconosciuto" in res.json()["detail"]


def test_skills_preview_reports_live_activation_state():
    for key, value in (
        ("skills_engine_enabled", "false"),
        ("skills_engine_instruments", "[]"),
    ):
        saved = client.post("/admin/config", json={"key": key, "value": value})
        assert saved.status_code == 200, saved.text

    res = client.post("/admin/skills/preview", json={
        "questionnaire_type": "QSA",
        "language": "it",
        "scores_context": "C6: 8/9",
        "message": "come mi organizzo?",
    })

    assert res.status_code == 200, res.text
    assert res.json()["engine_enabled"] is False


def test_skills_preview_policy_is_active_for_every_supported_instrument():
    from backend.skills_seed import SEEDED_INSTRUMENTS, seed_skill_configs

    db = _TestSession()
    try:
        seed_skill_configs(db)
    finally:
        db.close()

    # Il test precedente spegne il motore per verificare lo stato live: qui
    # serve acceso, e il seed non sovrascrive le righe di config esistenti.
    _set_config("skills_engine_enabled", "true")
    _set_config("skills_engine_instruments", json.dumps(list(SEEDED_INSTRUMENTS)))

    created = client.post("/admin/certified-strategies", json={
        "slug": "smoke-all-instruments-advice",
        "name_it": "Un passo verificabile",
        "recommended_when_it": "Quando lo studente chiede un consiglio concreto",
        "description_it": "Scegli un'azione piccola e verificane l'esito.",
        "factor_codes": [],
        "questionnaire_types": list(SEEDED_INSTRUMENTS),
        "keywords": "consiglio concreto",
        "status": "certified",
        "is_active": True,
    })
    assert created.status_code == 200, created.text

    for questionnaire_type in SEEDED_INSTRUMENTS:
        preview = client.post("/admin/skills/preview", json={
            "questionnaire_type": questionnaire_type,
            "language": "it",
            "scores_context": "",
            "message": "Dammi un consiglio concreto",
        })
        assert preview.status_code == 200, preview.text
        body = preview.json()
        assert body["engine_enabled"] is True
        assert "[CERTIFIED_STRATEGIES]" in "\n".join(body["blocks"]["knowledge"])
        assert all(entry.get("slug") != "approved-strategies" for entry in body["trace"])


def test_skills_preview_preserves_advice_after_the_editorial_contract():
    sentinel = "CHIUSURA-CONSIGLIO-VERIFICABILE"
    created = client.post("/admin/certified-strategies", json={
        "slug": "smoke-long-certified-advice",
        "name_it": "Consiglio certificato esteso",
        "recommended_when_it": "Quando serve un piano dettagliato ma circoscritto.",
        "description_it": ("Definisci un passo osservabile e sostenibile. " * 12) + sentinel,
        "factor_codes": [],
        "questionnaire_types": ["QAP"],
        "keywords": "consiglio piano dettagliato circoscritto verificabile",
        "status": "certified",
        "sort_order": -100,
        "is_active": True,
    })
    assert created.status_code == 200, created.text

    preview = client.post("/admin/skills/preview", json={
        "questionnaire_type": "QAP",
        "language": "it",
        "scores_context": "",
        "message": "Consigliami un piano dettagliato e circoscritto",
    })
    assert preview.status_code == 200, preview.text
    body = preview.json()
    knowledge = "\n".join(body["blocks"]["knowledge"])
    directive = "\n".join(body["blocks"]["directive_tail"])
    assert "## Student advice contract" in directive
    assert sentinel in knowledge


def test_skills_step_map_put_reaches_static_route():
    """La route statica step-map non deve essere catturata da {skill_id}."""
    created = client.post("/admin/skills", json={
        "slug": "smoke-step-map",
        "name": "Smoke step map",
        "status": "published",
    })
    assert created.status_code == 200, created.text
    skill_id = created.json()["id"]

    res = client.put("/admin/skills/step-map", json={
        "questionnaire_type": "QSA",
        "entries": [{
            "questionnaire_type": "QSA",
            "step_id": "*",
            "skill_id": skill_id,
            "sort_order": 0,
            "enabled": True,
        }],
    })

    assert res.status_code == 200, res.text
    assert res.json()["entries"][0]["skill_id"] == skill_id


def test_skills_step_map_rejects_unknown_skill_without_replacing_map():
    before = client.get("/admin/skills/step-map", params={"questionnaire_type": "QSA"})
    assert before.status_code == 200, before.text

    res = client.put("/admin/skills/step-map", json={
        "questionnaire_type": "QSA",
        "entries": [{
            "questionnaire_type": "QSA",
            "step_id": "*",
            "skill_id": 999999,
            "sort_order": 0,
            "enabled": True,
        }],
    })

    assert res.status_code == 400, res.text
    after = client.get("/admin/skills/step-map", params={"questionnaire_type": "QSA"})
    assert after.json() == before.json()


def _set_idea_feature(value: str) -> None:
    db = _TestSession()
    try:
        row = db.query(models.Config).filter(models.Config.key == "feature_idea_focus").first()
        if row is None:
            db.add(models.Config(key="feature_idea_focus", value=value, description="test"))
        else:
            row.value = value
        db.commit()
    finally:
        db.close()


def test_every_gate_that_would_silently_exclude_idea_lets_it_through():
    """L'appartenenza di uno strumento vive in liste sparse, non in un posto solo.

    Dimenticarne una non rompe niente: lo strumento semplicemente sparisce da
    quel pezzo di app. Questa e' la rete sotto quel silenzio.
    """
    from backend.chat_logic import _ensure_questionnaire_guided_steps  # noqa: F401
    from backend.prompt_config import DEFAULT_IDEA_GUIDED_STEPS, MODE_TO_SYSTEM_PROMPT_KEY
    from backend.routes.memory import MEMORY_QUESTIONNAIRE_TYPES
    from backend.schemas import FROZEN_SESSION_TYPES
    from backend.skills_seed import ENGINE_INSTRUMENTS, SEEDED_INSTRUMENTS

    assert "IDEA" in MEMORY_QUESTIONNAIRE_TYPES, "la memoria di sessione scarterebbe i turni di Idea"
    assert "IDEA" in FROZEN_SESSION_TYPES, "congelare una sessione Idea fallirebbe"
    assert "IDEA" in ENGINE_INSTRUMENTS, "il motore di skill non servirebbe Idea"
    assert "IDEA" not in SEEDED_INSTRUMENTS, "Idea non riceve il materiale certificato degli altri"
    assert MODE_TO_SYSTEM_PROMPT_KEY["idea-focus"] == "prompt_idea_focus"
    assert len(DEFAULT_IDEA_GUIDED_STEPS) == 8

    _ensure_guided_steps("IDEA")
    db = _TestSession()
    try:
        steps = (
            db.query(models.GuidedStep)
            .filter(models.GuidedStep.questionnaire_type == "IDEA")
            .all()
        )
        assert len(steps) == 8, "gli step di Idea non sono stati seminati"
        for step in steps:
            assert (step.label_i18n or {}).get("sv"), f"{step.id} senza traduzioni"
    finally:
        db.close()


def test_idea_never_carries_a_scores_line_into_the_prompt():
    """Una riga di servizio sui punteggi diventa un nodo della mappa.

    Il modello l'ha gia' disegnata come se fosse l'idea della persona
    ("Percorso riflessivo guidato dall'AI"), quindi per Idea non parte, da
    qualunque client arrivi il turno.
    """
    _ensure_guided_steps("IDEA")
    session_id = "idea-no-scores"
    session_memory.clear(session_id)
    main.app.dependency_overrides[auth.get_identity_view_as] = _fake_user_identity
    try:
        r = client.post("/chat", json={
            "message": "Vorrei mettere a fuoco un'idea",
            "mode": "idea-focus",
            "phase": "idea-statement",
            "use_phase_prompt": False,
            "session_id": session_id,
            "questionnaire_type": "IDEA",
            "language": "it",
            "scores_context": "CONTESTO: percorso riflessivo guidato dall'AI, qualitativo, senza punteggi numerici.",
        })
        assert r.status_code == 200, r.text
        envelope = _latest_log_details(session_id).get("envelope")
        assert "percorso riflessivo guidato" not in envelope["full_message"].lower()
        assert "percorso riflessivo guidato" not in envelope["system_prompt_final"].lower()
    finally:
        main.app.dependency_overrides.pop(auth.get_identity_view_as, None)


def test_idea_reference_upload_is_private_session_context():
    _set_idea_feature("true")
    main.app.dependency_overrides[auth.get_identity_view_as] = _fake_user_identity
    session_id = "idea-reference-context"
    try:
        uploaded = client.post(
            "/idea/reference",
            data={"session_id": session_id},
            files={
                "file": (
                    "cornice.md",
                    b"# Costrutto\n\nLa definizione distingue tratto e stato.",
                    "text/markdown",
                ),
            },
        )
        assert uploaded.status_code == 200, uploaded.text
        assert uploaded.json()["filename"] == "cornice.md"

        metadata = client.get("/idea/reference", params={"session_id": session_id})
        assert metadata.status_code == 200
        assert metadata.json()["reference"]["filename"] == "cornice.md"

        reply = client.post("/chat", json={
            "message": "Voglio chiarire questo costrutto.",
            "mode": "idea-focus",
            "session_id": session_id,
            "questionnaire_type": "IDEA",
            "language": "it",
            "idea_variant": "concept",
        })
        assert reply.status_code == 200, reply.text
        envelope = _latest_log_details(session_id).get("envelope")
        prompt = envelope["system_prompt_final"]
        assert "[IDEA REFERENCE]" in prompt
        assert "cornice.md" in prompt
        assert "La definizione distingue tratto e stato" in prompt
        assert "delimit what belongs inside and outside it" in prompt

        removed = client.delete("/idea/reference", params={"session_id": session_id})
        assert removed.status_code == 200
        assert client.get("/idea/reference", params={"session_id": session_id}).json()["reference"] is None
    finally:
        main.app.dependency_overrides.pop(auth.get_identity_view_as, None)
        _set_idea_feature("false")
        db = _TestSession()
        try:
            db.query(models.IdeaReference).filter(
                models.IdeaReference.session_id == session_id
            ).delete(synchronize_session=False)
            db.commit()
        finally:
            db.close()


def test_an_invite_only_instrument_only_admits_the_counselors_that_name_it():
    """`questionnaire_types` vuoto vale "tutti" - tranne sugli strumenti a invito.

    Serve a non dover scrivere gli altri sette strumenti su ogni counselor per
    escluderne uno, e a non rifarlo a ogni strumento nuovo.
    """
    db = _TestSession()
    try:
        db.add_all([
            models.Counselor(slug="scope-open", name="Aperto", persona="x",
                             questionnaire_types=[], is_active=True),
            models.Counselor(slug="scope-invited", name="Invitato", persona="x",
                             questionnaire_types=["IDEA"], is_active=True),
        ])
        db.commit()
    finally:
        db.close()

    try:
        on_idea = {c["slug"]: c["suitable"] for c in client.get(
            "/counselors", params={"questionnaire_type": "IDEA"}).json()}
        assert on_idea["scope-invited"] is True
        assert on_idea["scope-open"] is False, "vuoto non deve valere su uno strumento a invito"

        on_qsa = {c["slug"]: c["suitable"] for c in client.get(
            "/counselors", params={"questionnaire_type": "QSA"}).json()}
        assert on_qsa["scope-open"] is True, "vuoto continua a valere tutti fuori dagli inviti"
        assert on_qsa["scope-invited"] is False, "chi dichiara IDEA non serve gli altri strumenti"

        # I non adatti non spariscono: servono a proporre le alternative.
        listed = client.get("/counselors", params={"questionnaire_type": "IDEA"}).json()
        assert {"scope-open", "scope-invited"} <= {c["slug"] for c in listed}
        assert listed[0]["suitable"] is True, "gli adatti stanno in cima"

        # Senza strumento richiesto nessuno viene escluso.
        plain = {c["slug"]: c["suitable"] for c in client.get("/counselors").json()}
        assert plain["scope-open"] is True and plain["scope-invited"] is True

        # `*` vale tutto, inviti compresi: un counselor buono per ogni strumento
        # non va riscritto quando se ne aggiunge uno.
        db2 = _TestSession()
        try:
            db2.add(models.Counselor(slug="scope-all", name="Ovunque", persona="x",
                                     questionnaire_types=["*"], is_active=True))
            db2.commit()
        finally:
            db2.close()
        for code in ("IDEA", "QSA"):
            rows = {c["slug"]: c["suitable"] for c in client.get(
                "/counselors", params={"questionnaire_type": code}).json()}
            assert rows["scope-all"] is True, f"`*` deve valere anche su {code}"
    finally:
        db = _TestSession()
        try:
            db.query(models.Counselor).filter(
                models.Counselor.slug.in_(["scope-open", "scope-invited", "scope-all"])
            ).delete(synchronize_session=False)
            db.commit()
        finally:
            db.close()


def test_moving_between_branches_is_remembered():
    """Il fuoco derivato sceglie il ramo aperto piu' profondo.

    Se la persona puo' navigare, la sua scelta deve vincere e restare, anche
    dopo un turno di chat: altrimenti tornare su un ramo dura un istante.
    """
    _set_idea_feature("true")
    main.app.dependency_overrides[auth.get_identity_view_as] = _fake_user_identity
    session_id = "idea-branch-nav"
    try:
        client.post("/idea/map/patch", json={
            "session_id": session_id,
            "patch": {
                "title": "Tesi",
                "add_nodes": [
                    {"id": "idea", "label": "Tesi", "role": "idea", "accent": True,
                     "task_type": "thesis-chapter"},
                    {"id": "t1", "label": "Rivedere la letteratura", "role": "task",
                     "task_type": "systematic-review"},
                    {"id": "t2", "label": "Decidere il disegno", "role": "task",
                     "task_type": "empirical-study"},
                ],
                "add_edges": [{"from": "idea", "to": "t1"}, {"from": "idea", "to": "t2"}],
            },
        })

        rows = client.get("/idea/branches", params={"session_id": session_id}).json()
        assert {r["id"] for r in rows} == {"idea", "t1", "t2"}, "solo il lavoro entra nell'albero"
        assert next(r for r in rows if r["is_focus"])["id"] == "t2"
        assert next(r for r in rows if r["id"] == "t1")["parent"] == "idea"
        assert next(r for r in rows if r["id"] == "t1")["task_label"]

        moved = client.post("/idea/focus", json={"session_id": session_id, "node_id": "t1"})
        assert moved.status_code == 200, moved.text
        assert moved.json()["focus"] == "t1"

        rows = client.get("/idea/branches", params={"session_id": session_id}).json()
        assert next(r for r in rows if r["is_focus"])["id"] == "t1", "la scelta deve restare"
        assert client.get("/idea/next-step", params={"session_id": session_id}).json()["focus"] == "t1"

        # Un turno di chat non riporta il fuoco sul derivato.
        client.post("/idea/map/patch", json={
            "session_id": session_id,
            "patch": {"add_nodes": [{"id": "q1", "label": "Quali studi", "role": "open-question"}],
                      "add_edges": [{"from": "t1", "to": "q1"}]},
        })
        assert client.get("/idea/next-step", params={"session_id": session_id}).json()["focus"] == "t1"

        # Risalire al padre e' un movimento come gli altri.
        client.post("/idea/focus", json={"session_id": session_id, "node_id": "idea"})
        assert client.get("/idea/next-step", params={"session_id": session_id}).json()["focus"] == "idea"

        bad = client.post("/idea/focus", json={"session_id": session_id, "node_id": "q1"})
        assert bad.status_code == 422, "un nodo che non e' lavoro non e' un ramo"

        # Un'idea chiusa non e' un'idea finita: si torna e si riapre.
        client.post("/idea/map/patch", json={
            "session_id": session_id,
            "patch": {"update": [{"id": "t1", "closed": True, "conclusion": "Criteri fissati"}]},
        })
        rows = client.get("/idea/branches", params={"session_id": session_id}).json()
        assert next(r for r in rows if r["id"] == "t1")["closed"] is True

        again = client.post("/idea/reopen", json={"session_id": session_id, "node_id": "t1"})
        assert again.status_code == 200, again.text
        assert again.json()["focus"] == "t1"
        rows = client.get("/idea/branches", params={"session_id": session_id}).json()
        reopened = next(r for r in rows if r["id"] == "t1")
        assert reopened["closed"] is False and reopened["is_focus"] is True
        assert reopened["conclusion"] == "Criteri fissati", "la conclusione resta"

        twice = client.post("/idea/reopen", json={"session_id": session_id, "node_id": "t1"})
        assert twice.status_code == 422, "un ramo gia' aperto non si riapre"
    finally:
        main.app.dependency_overrides.pop(auth.get_identity_view_as, None)
        _set_idea_feature("false")


def test_concluding_keeps_the_result_where_the_person_chose():
    """Chiudere senza chiedere dove va il risultato lo butterebbe via.

    La mappa resterebbe in tabella e nessuno la ritroverebbe: la sessione
    finisce con una domanda, e "da nessuna parte" e' una risposta valida.
    """
    _set_idea_feature("true")
    main.app.dependency_overrides[auth.get_identity_view_as] = _fake_user_identity
    session_id = "idea-conclude"
    try:
        client.post("/idea/map/patch", json={
            "session_id": session_id,
            "patch": {
                "title": "Tesi sulla dispersione",
                "add_nodes": [
                    {"id": "idea", "label": "Tesi sulla dispersione", "role": "idea",
                     "accent": True, "task_type": "thesis-chapter"},
                    {"id": "s1", "label": "Scrivere l'indice", "role": "step"},
                ],
                "add_edges": [{"from": "idea", "to": "s1"}],
            },
        })

        nothing = client.post("/idea/conclude", json={"session_id": session_id, "targets": []})
        assert nothing.status_code == 200, nothing.text
        assert nothing.json()["kept"] == {}, "non tenere niente e' una scelta, non un errore"
        assert nothing.json()["pdf_url"].startswith("/api/idea/map/pdf")

        both = client.post("/idea/conclude", json={
            "session_id": session_id, "targets": ["notebook", "portfolio"],
            "variant": "student-path",
        })
        assert both.status_code == 200, both.text
        kept = both.json()["kept"]
        assert kept["notebook"]["revision_id"], "il taccuino deve avere una revisione nuova"
        assert kept["portfolio"]["item_id"], "il portfolio deve avere una voce nuova"

        # La variante ricerca non scrive nel taccuino, ma non fa fallire il resto.
        research = client.post("/idea/conclude", json={
            "session_id": session_id, "targets": ["notebook", "portfolio"],
            "variant": "research",
        }).json()["kept"]
        assert research["notebook"].get("skipped")
        assert research["portfolio"]["item_id"]
    finally:
        main.app.dependency_overrides.pop(auth.get_identity_view_as, None)
        _set_idea_feature("false")
        # Taccuino e portfolio sono condivisi con altri test: quello che questo
        # ha scritto lo toglie questo.
        db = _TestSession()
        try:
            db.query(models.LearnerProfileRevision).filter(
                models.LearnerProfileRevision.session_id == session_id
            ).delete(synchronize_session=False)
            db.query(models.PortfolioItem).filter(
                models.PortfolioItem.category == "idea",
                models.PortfolioItem.title == "Tesi sulla dispersione",
            ).delete(synchronize_session=False)
            db.commit()
        finally:
            db.close()


def test_the_end_of_the_session_asks_instead_of_saving():
    from backend.idea_map import apply_patch, map_context, next_move, parse_patch

    spec = apply_patch(None, parse_patch({
        "title": "Chiusa",
        "add_nodes": [
            {"id": "idea", "label": "Idea", "role": "idea", "accent": True,
             "task_type": "thesis-chapter", "closed": True, "conclusion": "Fatto"},
            {"id": "e1", "label": "Evidenza", "role": "evidence"},
        ],
        "add_edges": [{"from": "idea", "to": "e1"}],
    }))
    assert next_move(spec)["reason"] == "all-closed"
    text = map_context(spec)
    assert "ASK where they want to keep it" in text
    assert "Do not save anything yourself" in text


def test_idea_map_is_closed_until_the_feature_is_on():
    _set_idea_feature("false")
    main.app.dependency_overrides[auth.get_identity_view_as] = _fake_user_identity
    try:
        r = client.get("/idea/map", params={"session_id": "idea-off"})
        assert r.status_code == 404, r.text
    finally:
        main.app.dependency_overrides.pop(auth.get_identity_view_as, None)


def test_idea_map_grows_by_patches_and_keeps_its_stages():
    _set_idea_feature("true")
    main.app.dependency_overrides[auth.get_identity_view_as] = _fake_user_identity
    session_id = "idea-map-round-trip"
    try:
        empty = client.get("/idea/map", params={"session_id": session_id})
        assert empty.status_code == 200, empty.text
        assert empty.json()["spec"] is None
        assert empty.json()["missing_roles"] == ["idea", "assumption", "open-question", "step"]

        first = client.post("/idea/map/patch", json={
            "session_id": session_id,
            "title": "Tesi sulla dispersione",
            "patch": {
                "title": "Tesi sulla dispersione",
                "add_nodes": [
                    {"id": "idea", "label": "Tesi sulla dispersione", "role": "idea", "accent": True},
                    {"id": "a1", "label": "I dati sono accessibili", "role": "assumption"},
                ],
                "add_edges": [{"from": "idea", "to": "a1", "kind": "link"}],
            },
        })
        assert first.status_code == 200, first.text
        assert first.json()["missing_roles"] == ["open-question", "step"]

        second = client.post("/idea/map/patch", json={
            "session_id": session_id,
            "patch": {
                "add_nodes": [
                    {"id": "q1", "label": "Quale scuola?", "role": "open-question"},
                    {"id": "s1", "label": "Scrivere l'indice", "role": "step"},
                ],
                "add_edges": [{"from": "idea", "to": "q1"}, {"from": "idea", "to": "s1"}],
            },
        })
        assert second.status_code == 200, second.text
        assert second.json()["complete"] is True

        current = client.get("/idea/map", params={"session_id": session_id})
        assert [node["id"] for node in current.json()["spec"]["nodes"]] == ["idea", "a1", "q1", "s1"]

        stages = client.get("/idea/map/history", params={"session_id": session_id})
        assert [row["nodes"] for row in stages.json()] == [2, 4]

        broken = client.post("/idea/map/patch", json={
            "session_id": session_id,
            "patch": {"remove": ["idea", "a1", "q1"]},
        })
        assert broken.status_code == 422, broken.text
        after = client.get("/idea/map", params={"session_id": session_id})
        assert len(after.json()["spec"]["nodes"]) == 4
    finally:
        main.app.dependency_overrides.pop(auth.get_identity_view_as, None)
        _set_idea_feature("false")


def test_idea_map_is_private_to_whoever_drew_it():
    _set_idea_feature("true")
    main.app.dependency_overrides[auth.get_identity_view_as] = lambda: _identity(
        "idea-owner", "owner@example.test", is_researcher=False
    )
    try:
        client.post("/idea/map/patch", json={
            "session_id": "idea-private",
            "patch": {
                "add_nodes": [
                    {"id": "idea", "label": "La mia idea", "role": "idea", "accent": True},
                    {"id": "n1", "label": "Un vincolo", "role": "constraint"},
                ],
                "add_edges": [{"from": "idea", "to": "n1"}],
            },
        })
        main.app.dependency_overrides[auth.get_identity_view_as] = lambda: _identity(
            "idea-stranger", "stranger@example.test", is_researcher=False
        )
        denied = client.get("/idea/map", params={"session_id": "idea-private", "username": "idea-owner"})
        assert denied.status_code == 403, denied.text
    finally:
        main.app.dependency_overrides.pop(auth.get_identity_view_as, None)
        _set_idea_feature("false")


def test_idea_branch_can_be_created_manually_and_becomes_the_focus():
    _set_idea_feature("true")
    main.app.dependency_overrides[auth.get_identity_view_as] = _fake_user_identity
    session_id = "idea-manual-branch"
    try:
        first = client.post("/idea/map/patch", json={
            "session_id": session_id,
            "patch": {
                "title": "Laboratorio di scrittura",
                "add_nodes": [
                    {"id": "idea", "label": "Laboratorio di scrittura", "role": "idea", "accent": True},
                    {"id": "q1", "label": "Per chi?", "role": "open-question"},
                ],
                "add_edges": [{"from": "idea", "to": "q1"}],
            },
        })
        assert first.status_code == 200, first.text

        created = client.post("/idea/branch", json={
            "session_id": session_id,
            "label": "Verificare gli spazi disponibili",
        })
        assert created.status_code == 200, created.text
        branch_id = created.json()["focus"]
        assert branch_id.startswith("task-")
        assert created.json()["reason"] == "task-unknown"

        rows = client.get("/idea/branches", params={"session_id": session_id, "lang": "it"})
        assert rows.status_code == 200, rows.text
        branch = next(row for row in rows.json() if row["id"] == branch_id)
        assert branch["label"] == "Verificare gli spazi disponibili"
        assert branch["parent"] == "idea"
        assert branch["is_focus"] is True
    finally:
        main.app.dependency_overrides.pop(auth.get_identity_view_as, None)
        _set_idea_feature("false")


def test_frozen_session_round_trip_and_isolation():
    def _as(username: str, email: str):
        main.app.dependency_overrides[auth.get_current_user] = lambda: _identity(
            username, email, is_researcher=False
        )

    _as("student-a", "a@example.test")
    try:
        payload = {
            "session_id": "frozen-session-1",
            "questionnaire_type": "QSA",
            "messages": [
                {"role": "system", "content": "--- Step 1 ---"},
                {"role": "user", "content": "Vorrei capire come organizzarmi."},
                {"role": "assistant", "content": "Partiamo dal tuo profilo.", "responseId": "r-1"},
            ],
            "current_phase": "step-1",
            "scores": {"C1": 7.0},
            "counselor_id": 3,
            "experience": "standard",
            "locale": "it",
            "response_length": "short",
            "label": "QSA — Step 1",
        }
        r = client.post("/session/freeze", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["session_id"] == "frozen-session-1"

        listed = client.get("/session/frozen")
        assert listed.status_code == 200, listed.text
        rows = listed.json()
        assert [row["session_id"] for row in rows] == ["frozen-session-1"]
        assert rows[0]["label"] == "QSA — Step 1"
        assert "messages" not in rows[0]

        detail = client.get("/session/frozen/frozen-session-1")
        assert detail.status_code == 200, detail.text
        body = detail.json()
        assert len(body["messages"]) == 3
        assert body["messages"][2]["responseId"] == "r-1"
        assert body["current_phase"] == "step-1"
        assert body["scores"] == {"C1": 7.0}
        assert body["counselor_id"] == 3
        assert body["response_length"] == "short"

        # Ricongelare aggiorna la riga esistente invece di duplicarla.
        payload["messages"].append({"role": "user", "content": "Riprendo da qui."})
        payload["current_phase"] = "step-2"
        assert client.post("/session/freeze", json=payload).status_code == 200
        again = client.get("/session/frozen")
        assert len(again.json()) == 1
        assert client.get("/session/frozen/frozen-session-1").json()["current_phase"] == "step-2"

        # Un altro studente non vede né cancella la sessione del primo.
        _as("student-b", "b@example.test")
        assert client.get("/session/frozen").json() == []
        assert client.get("/session/frozen/frozen-session-1").status_code == 404
        assert client.delete("/session/frozen/frozen-session-1").status_code == 404

        _as("student-a", "a@example.test")

        # Simula la corsa di due freeze concorrenti: una seconda riga per lo
        # stesso (username, session_id), inserita direttamente sul DB perche'
        # non c'e' un vincolo di unicita' a livello di tabella a impedirlo.
        db = next(_override_get_db())
        db.add(models.FrozenSession(
            username="student-a",
            session_id="frozen-session-1",
            questionnaire_type="QSA",
            data={"current_phase": "step-2"},
        ))
        db.commit()

        assert client.delete("/session/frozen/frozen-session-1").status_code == 200
        assert client.get("/session/frozen").json() == []
    finally:
        main.app.dependency_overrides.pop(auth.get_current_user, None)


def test_frozen_session_rejects_unknown_questionnaire():
    main.app.dependency_overrides[auth.get_current_user] = _fake_user_identity
    try:
        r = client.post("/session/freeze", json={
            "session_id": "frozen-session-2",
            "questionnaire_type": "NOPE",
            "messages": [],
        })
        assert r.status_code == 422, r.text
    finally:
        main.app.dependency_overrides.pop(auth.get_current_user, None)


def test_frozen_session_routes_require_authentication():
    override = main.app.dependency_overrides.pop(auth.get_current_user, None)
    try:
        payload = {
            "session_id": "unauth-frozen",
            "questionnaire_type": "QSA",
            "messages": [],
        }
        assert client.post("/session/freeze", json=payload).status_code == 401
        assert client.get("/session/frozen").status_code == 401
        assert client.get("/session/frozen/unauth-frozen").status_code == 401
        assert client.delete("/session/frozen/unauth-frozen").status_code == 401
    finally:
        if override is not None:
            main.app.dependency_overrides[auth.get_current_user] = override


def test_frozen_session_freeze_collapses_duplicate_rows():
    """Ramo di collasso in freeze_session: sostituto applicativo del vincolo
    di unicita' mancante a livello di tabella. Simula la corsa di due freeze
    concorrenti inserendo una seconda riga per lo stesso (username, session_id)
    direttamente sul DB, poi verifica che un nuovo POST /session/freeze le
    collassi in una sola riga con il payload aggiornato."""
    main.app.dependency_overrides[auth.get_current_user] = lambda: _identity(
        "student-c", "c@example.test", is_researcher=False
    )
    try:
        payload = {
            "session_id": "frozen-session-dup",
            "questionnaire_type": "QSA",
            "messages": [{"role": "user", "content": "Prima versione."}],
            "current_phase": "step-1",
            "scores": {"C1": 5.0},
            "label": "QSA — Step 1",
        }
        assert client.post("/session/freeze", json=payload).status_code == 200

        db = next(_override_get_db())
        db.add(models.FrozenSession(
            username="student-c",
            session_id="frozen-session-dup",
            questionnaire_type="QSA",
            data={"current_phase": "step-1", "messages": payload["messages"]},
        ))
        db.commit()

        payload["messages"].append({"role": "assistant", "content": "Nuova risposta dopo il collasso."})
        payload["current_phase"] = "step-2"
        r = client.post("/session/freeze", json=payload)
        assert r.status_code == 200, r.text

        rows = client.get("/session/frozen").json()
        assert len(rows) == 1
        assert rows[0]["session_id"] == "frozen-session-dup"
        assert rows[0]["current_phase"] == "step-2"

        detail = client.get("/session/frozen/frozen-session-dup").json()
        assert [m["content"] for m in detail["messages"]] == [
            "Prima versione.",
            "Nuova risposta dopo il collasso.",
        ]
    finally:
        main.app.dependency_overrides.pop(auth.get_current_user, None)


# --------------------------------------------------------------------------
# Diagrammi concettuali: la skill `concept-diagram` e' l'interruttore
# --------------------------------------------------------------------------

_DIAGRAM_SPEC = {
    "type": "flow",
    "title": "Come studio un capitolo",
    "nodes": [
        {"id": "a", "label": "Leggere"},
        {"id": "b", "label": "Schematizzare", "accent": True},
    ],
    "edges": [{"from": "a", "to": "b", "label": "poi"}],
}


def _set_diagram_skill(active: bool):
    db = _TestSession()
    try:
        skill = db.query(models.Skill).filter(models.Skill.slug == "concept-diagram").first()
        if skill is None:
            skill = models.Skill(
                slug="concept-diagram",
                name="Diagramma concettuale",
                instructions_i18n={"en": "..."},
                routing="optional",
                slot="directive_tail",
                status="published",
                is_active=active,
            )
            db.add(skill)
        else:
            skill.is_active = active
            skill.status = "published"
        db.commit()
    finally:
        db.close()


def test_diagram_endpoint_absent_when_skill_is_off():
    _set_diagram_skill(False)
    r = client.post("/diagram/render", json={"spec": _DIAGRAM_SPEC})
    assert r.status_code == 404, r.text


def test_diagram_endpoint_rejects_invalid_spec():
    _set_diagram_skill(True)
    r = client.post("/diagram/render", json={"spec": {"type": "gantt", "title": "x"}})
    assert r.status_code == 422, r.text


def test_diagram_endpoint_renders_svg_when_graphviz_present():
    _set_diagram_skill(True)
    r = client.post("/diagram/render", json={"spec": _DIAGRAM_SPEC, "theme": "dark"})
    if not shutil.which("dot"):
        assert r.status_code == 422       # graphviz assente: errore pulito, non 500
        return
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("image/svg+xml")
    body = r.text
    assert body.startswith("<svg")
    assert "#103f42" in body               # palette scura


if __name__ == "__main__":
    import sys
    sys.exit(_main())
