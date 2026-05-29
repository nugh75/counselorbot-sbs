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
from backend.qsa_extractor import _validate_scores
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
    ("GET", "/admin/questionnaire-results"),
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
    valid = {f"C{index}": index for index in range(1, 8)}
    valid.update({f"A{index}": index for index in range(1, 8)})
    assert _validate_scores(valid) == valid
    try:
        _validate_scores({"C1": 7})
    except ValueError:
        return
    raise AssertionError("An incomplete extraction must be rejected")


def test_strip_markdown():
    out = main.strip_markdown("**grassetto** e _corsivo_")
    assert "**" not in out and "grassetto" in out


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
            print(f"  FAIL  {t.__name__}: {type(e).__name__}: {e}")
            failed += 1
    print(f"\n{passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    import sys
    sys.exit(_main())
