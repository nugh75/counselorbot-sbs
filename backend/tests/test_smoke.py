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
import os
import re
from urllib.parse import urlsplit, urlunsplit

import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.testclient import TestClient

from backend import database, models, auth
import backend.main as main
import backend.routes.chat as chat_routes
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
from backend.strategy_memory import shared_response_memory


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


class _FakeAIService:
    """Sostituisce AIService: nessuna rete."""
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
        return "RISPOSTA_TEST"

    def stream_response(self, *a, **k):
        yield {"type": "content", "text": "RISPOSTA_TEST"}

    def generate_summary(self, *a, **k):
        return "riassunto test"

    def list_models(self, *a, **k):
        return []


# Applica gli override una sola volta a livello di modulo
main.app.dependency_overrides[database.get_db] = _override_get_db
main.app.dependency_overrides[auth.get_current_active_admin] = _fake_admin
# Gli endpoint vivono nei router: patch dell'AIService dove viene usato.
chat_routes.AIService = _FakeAIService
# Lo stream apre una sessione fresca dopo la risposta: isolala nel DB di test.
chat_routes.database.SessionLocal = _TestSession

# Site-chat (RAG): stesso mock provider + sessione di log isolata.
import backend.routes.site_chat as site_chat_routes
site_chat_routes.AIService = _FakeAIService
site_chat_routes.database.SessionLocal = _TestSession

# pQBL: mock provider + sessione isolata per il task di generazione in background.
import backend.routes.pqbl as pqbl_routes
pqbl_routes.AIService = _FakeAIService
pqbl_routes.database.SessionLocal = _TestSession

# OpenCode: sessione isolata.
import backend.routes.opencode as opencode_routes
opencode_routes.database.SessionLocal = _TestSession
opencode_routes.AIService = _FakeAIService

client = TestClient(main.app)


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
    ("GET", "/qsa/guided-ui-texts"),
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
    ("GET", "/user/learner-profile"),
    ("POST", "/user/learner-profile"),
    ("GET", "/user/learner-profile/history"),
    ("DELETE", "/user/learner-profile"),
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
    ("GET", "/site-chat/status"),
    ("GET", "/site-chat/document"),
    ("POST", "/site-chat/reindex"),
    ("POST", "/site-chat/stream"),
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
}


def _registered_routes():
    found = set()
    for r in main.app.routes:
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


def test_guided_steps_list():
    r = client.get("/admin/guided-steps")
    assert r.status_code == 200, r.text


def test_guided_ui_texts_public():
    r = client.get("/qsa/guided-ui-texts?questionnaire_type=QSA")
    assert r.status_code == 200, r.text


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
        "QPCS": ("qpcs-factors", "qpcs-factor"),
        "QPCC": ("qpcc-factors", "qpcc-factor"),
        "QAP": ("qap-factors", "qap-factor"),
    }
    for questionnaire_type, (step_id, mode) in expected_steps.items():
        r = client.get(f"/qsa/guided-ui-texts?questionnaire_type={questionnaire_type}")
        assert r.status_code == 200, r.text
        steps = r.json()["guided_steps"]
        assert any(step["id"] == step_id and step["system_prompt_mode"] == mode for step in steps)


def test_existing_extended_guided_modes_resolve_saved_prompt_keys():
    assert MODE_TO_SYSTEM_PROMPT_KEY["qpcs-interview"] == "prompt_qpcs_interview"
    assert MODE_TO_SYSTEM_PROMPT_KEY["qpcs-summary"] == "prompt_qpcs_summary"
    assert MODE_TO_SYSTEM_PROMPT_KEY["qpcc-interview"] == "prompt_qpcc_interview"
    assert MODE_TO_SYSTEM_PROMPT_KEY["qpcc-summary"] == "prompt_qpcc_summary"
    assert MODE_TO_SYSTEM_PROMPT_KEY["qap-interview"] == "prompt_qap_interview"
    assert MODE_TO_SYSTEM_PROMPT_KEY["qap-summary"] == "prompt_qap_summary"


def test_survey_submit_public():
    r = client.post("/survey", json={
        "q_utile": 5, "q_pertinente": 5, "q_chiaro": 5,
        "q_dettaglio": 5, "q_facile": 5, "q_veloce": 5,
    })
    assert r.status_code == 200, r.text


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


def test_chat_smoke_mocked_ai():
    r = client.post("/chat", json={"message": "ciao", "mode": "generic"})
    assert r.status_code == 200, r.text
    assert r.json()["response"] == "RISPOSTA_TEST"


def test_site_chat_status_public():
    r = client.get("/site-chat/status")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "n_chunks" in body and "embedding_model" in body


def test_site_chat_document_rejects_unknown_source():
    # Solo le sorgenti indicizzate sono anteprimabili (anti path-traversal).
    r = client.get("/site-chat/document", params={"source": "../../etc/passwd"})
    assert r.status_code == 404, r.text


def test_site_chat_stream_grounded_mocked():
    # Patcha la retrieval per non toccare embeddings/rete: contesto fittizio.
    canned = [{"score": 0.9, "source": "fonti/x.md", "title": "Doc X", "text": "Contenuto di prova."}]
    original_search = site_chat_routes.site_rag_index.search
    site_chat_routes.site_rag_index.search = lambda svc, q, k, *a, **kw: canned
    try:
        r = client.post("/site-chat/stream", json={
            "message": "Cos'è il QSA?", "audience": "studente", "session_id": "site-chat-test",
        })
        assert r.status_code == 200, r.text
        assert "RISPOSTA_TEST" in r.text
        assert '"done": true' in r.text
        assert "fonti/x.md" in r.text  # le fonti citate tornano nell'evento done
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
        db.add(models.Instrument(
            code="QSA",
            name_en="QSA",
            name_es="QSA ES",
            response_scale_min=1,
            response_scale_max=4,
        ))
        db.add(models.Factor(
            instrument_code="QSA",
            code="C1",
            sort_order=1,
            dimension="cognitive",
            label_en="C1",
            label_es="C1",
        ))
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
    assert r.status_code == 200, r.text

    r = client.get("/admin/validation/summary?instrument_code=QSA&locale=es&version_label=QSA_es_test")
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 1

    r = client.get("/admin/validation/export.csv?instrument_code=QSA&locale=es&version_label=QSA_es_test")
    assert r.status_code == 200, r.text
    assert "item_001" in r.text
    assert "metadata_cohort" in r.text
    assert "validation-session-1" in r.text


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
        assert r.json()["id"] != first_id
        r = client.get("/user/learner-profile/history")
        assert r.status_code == 200 and len(r.json()) == 2

        # Il contesto chat include il profilo dichiarato
        with _TestSession() as db:
            section = chat_logic._learner_profile_context(db, "student")
            assert "Profilo dichiarato dallo studente" in section
            assert "Ansia prima dell'esame" in section
            assert chat_logic._learner_profile_context(db, "") == ""

        r = client.delete("/user/learner-profile")
        assert r.status_code == 200 and r.json()["deleted_revisions"] == 2
        r = client.get("/user/learner-profile")
        assert r.json() is None
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


def test_qsa_extractor_rejects_incomplete_scores():
    assert DEFAULT_OCR_MODEL == "glm-ocr:latest"
    assert DEFAULT_PARSER_MODEL == "gemma4:e2b"
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
    pqbl_routes.generate_batch_for_chunk = lambda ai, text, idx, lang, qp, provider=None: _pqbl_canned_bank(4)
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
    pqbl_routes.generate_batch_for_chunk = lambda ai, text, idx, lang, qp, provider=None: _pqbl_canned_bank(4)
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
        def get_response(self, user_msg, sys_prompt, mode, max_tokens, provider=None):
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


if __name__ == "__main__":
    import sys
    sys.exit(_main())
