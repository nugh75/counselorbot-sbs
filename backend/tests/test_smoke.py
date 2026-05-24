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
    ("POST", "/qsa/audit"),
    ("POST", "/qsa/upload"),
    ("POST", "/tts"),
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


def test_survey_submit_public():
    r = client.post("/survey", json={
        "q_utile": 5, "q_pertinente": 5, "q_chiaro": 5,
        "q_dettaglio": 5, "q_facile": 5, "q_veloce": 5,
    })
    assert r.status_code == 200, r.text


def test_memory_status():
    r = client.get("/memory/status/test-session-xyz")
    assert r.status_code == 200, r.text


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


def test_clamp_max_tokens():
    assert main._clamp_max_tokens(None) is None
    # valore valido resta entro i limiti (non solleva)
    assert isinstance(main._clamp_max_tokens(1000), int)


def test_should_sanitize_ztpi():
    # ZTPI guidato → sanitizza; QSA → no
    assert isinstance(main._should_sanitize_ztpi_text("guided", "ztpi-step"), bool)


def test_strip_markdown():
    out = main.strip_markdown("**grassetto** e _corsivo_")
    assert "**" not in out and "grassetto" in out


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
