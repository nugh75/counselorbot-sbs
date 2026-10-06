"""Test per C4: Sandbox Collaudo Admin (anteprima effimera, nessun log/statistica salvata)."""
from unittest.mock import patch
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import auth, database, models
from backend.api_models import ChatRequest
from backend.dynamic_registry import set_session_factory
from backend.routes import chat


@pytest.fixture
def db_session():
    """In-memory SQLite isolato."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    database.Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    set_session_factory(session_factory)
    with session_factory() as db:
        # Crea uno strumento in bozza (is_active=False)
        db.add(models.Instrument(
            code="BOZZA_SANDBOX",
            name_it="Strumento in Bozza",
            is_active=False,
            tool_category="guided",
        ))
        db.add(models.GuidedStep(
            id="bozza-step-1",
            sort_order=1,
            label="Passo 1 Bozza",
            prompt="Prompt di collaudo",
            system_prompt_mode="generic",
            color_theme="blue",
            questionnaire_type="BOZZA_SANDBOX",
        ))
        db.commit()
        yield db
    set_session_factory(None)
    engine.dispose()


@pytest.fixture
def make_client(db_session):
    def _create(is_admin: bool = False, username: str = "utente.test"):
        app = FastAPI()
        app.include_router(chat.router)

        identity = {
            "username": username,
            "groups": ["amministratori" if is_admin else "studenti"],
            "authenticated": True,
            "is_admin": is_admin,
            "is_researcher": False,
        }

        def override_db():
            yield db_session

        app.dependency_overrides[database.get_db] = override_db
        app.dependency_overrides[database.get_personal_ai_db] = override_db
        app.dependency_overrides[auth.get_identity_view_as] = lambda: identity
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        app.dependency_overrides[auth.get_current_active_admin] = lambda: identity if is_admin else None

        return TestClient(app)

    return _create


def test_non_admin_cannot_use_preview(make_client):
    """Utente non-admin che passa preview=True riceve 403 Forbidden."""
    client = make_client(is_admin=False)
    req = {
        "message": "Ciao",
        "questionnaire_type": "BOZZA_SANDBOX",
        "phase": "bozza-step-1",
        "preview": True,
        "session_id": "test-sess-non-admin",
    }
    r = client.post("/chat", json=req)
    assert r.status_code == 403
    assert "amministratori" in r.text

    r_stream = client.post("/chat/stream", json=req)
    assert r_stream.status_code == 403
    assert "amministratori" in r_stream.text


def test_admin_sandbox_ephemeral_no_logs(make_client, db_session):
    """Admin con preview=True testa chat anche su strumento is_active=False senza salvare log né response memory."""
    client = make_client(is_admin=True)

    with patch("backend.ai_service.AIService.get_response", return_value="Risposta simulata dal counselor in sandbox"):
        r = client.post("/chat", json={
            "message": "Messaggio di prova admin",
            "questionnaire_type": "BOZZA_SANDBOX",
            "phase": "bozza-step-1",
            "preview": True,
            "session_id": "sandbox-bozza-12345",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["response"] == "Risposta simulata dal counselor in sandbox"
        assert data["response_id"] is None

        # Verifica che NESSUN log sia stato inserito nel database per questa sessione
        logs = db_session.query(models.Log).filter(models.Log.session_id == "sandbox-bozza-12345").all()
        assert len(logs) == 0

        # Verifica che non ci siano response candidate per il riuso tra studenti
        candidates = db_session.query(models.SharedChatResponse).filter(
            models.SharedChatResponse.questionnaire_type == "BOZZA_SANDBOX"
        ).all()
        assert len(candidates) == 0


def test_admin_sandbox_stream_ephemeral(make_client, db_session):
    """Admin con preview=True su /chat/stream non scrive record in models.Log."""
    client = make_client(is_admin=True)

    def mock_stream(*args, **kwargs):
        yield {"type": "delta", "text": "Risposta "}
        yield {"type": "delta", "text": "streaming "}
        yield {"type": "delta", "text": "sandbox"}

    with patch("backend.ai_service.AIService.stream_response", side_effect=mock_stream):
        r = client.post("/chat/stream", json={
            "message": "Messaggio stream admin",
            "questionnaire_type": "BOZZA_SANDBOX",
            "phase": "bozza-step-1",
            "preview": True,
            "session_id": "sandbox-bozza-stream-1",
        })
        assert r.status_code == 200, r.text
        assert "sandbox" in r.text

        # Nessun log inserito
        logs = db_session.query(models.Log).filter(models.Log.session_id == "sandbox-bozza-stream-1").all()
        assert len(logs) == 0
