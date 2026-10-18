"""Tests for server-side step closure at safety threshold (~5 exchanges).

Verifies:
(a) Initial turns (< 4 exchanges) do not inject the marker if not present.
(b) Reaching the safety threshold (4-5 exchanges in step) injects [[AVANZA_STEP]] if missing.
(c) If the model emits [[AVANZA_STEP]] before the threshold, it is not duplicated.
(d) Final synthesis, farewell, or intro steps do not get an undue marker.
"""
from __future__ import annotations

import json
import re
from typing import Generator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from backend import auth, control_markers, database, models, step_closure
from backend.ai_service import AIService
from backend.memory_service import session_memory
from backend.routes import chat as chat_routes


# --- Unit Tests: ensure_step_closure ---

def test_ensure_step_closure_no_advance():
    text = "Continuiamo a esplorare questo aspetto."
    result = step_closure.ensure_step_closure(text, should_advance=False)
    assert result == text
    assert "[[AVANZA_STEP]]" not in result


def test_ensure_step_closure_appends_marker_when_missing():
    text = "Abbiamo approfondito abbastanza questa dimensione."
    result = step_closure.ensure_step_closure(text, should_advance=True)
    assert result == "Abbiamo approfondito abbastanza questa dimensione.\n\n[[AVANZA_STEP]]"


def test_ensure_step_closure_not_duplicated_when_already_present():
    text = "Sintesi dell'area.\n\n[[AVANZA_STEP]]"
    result = step_closure.ensure_step_closure(text, should_advance=True)
    assert result == text
    assert result.count("[[AVANZA_STEP]]") == 1


def test_ensure_step_closure_not_duplicated_case_insensitive_or_escaped():
    text = "Sintesi dell'area.\n\n[[ avanza_step ]]"
    result = step_closure.ensure_step_closure(text, should_advance=True)
    assert result == text
    assert "[[AVANZA_STEP]]" not in result or result.count("[[") == 1


def test_ensure_step_closure_empty_text():
    result = step_closure.ensure_step_closure("", should_advance=True)
    assert result == "[[AVANZA_STEP]]"


# --- Unit Tests: is_step_closure_eligible ---

def test_eligibility_free_chat_and_idea():
    assert not step_closure.is_step_closure_eligible(None, None, phase=None, questionnaire_type=None)
    assert not step_closure.is_step_closure_eligible(None, None, phase="", questionnaire_type="SAVICKAS")
    assert not step_closure.is_step_closure_eligible(None, None, phase="idea-branch", questionnaire_type="IDEA")


def test_eligibility_intro_steps():
    assert not step_closure.is_step_closure_eligible(None, None, phase="savickas-intro", questionnaire_type="SAVICKAS")
    assert not step_closure.is_step_closure_eligible(None, None, phase="intro", questionnaire_type="QSA")
    assert not step_closure.is_step_closure_eligible(None, None, phase="qpcc-intro", questionnaire_type="QPCC")
    assert not step_closure.is_step_closure_eligible(None, None, phase="qsar-intro", questionnaire_type="QSAR")
    assert not step_closure.is_step_closure_eligible(None, None, phase="custom-welcome", questionnaire_type="CUSTOM")

    step = models.GuidedStep(id="custom-intro", label="Intro", prompt="p", system_prompt_mode="intro", sort_order=0)
    assert not step_closure.is_step_closure_eligible(None, step, phase="custom-intro", questionnaire_type="CUSTOM")

    negative_step = models.GuidedStep(id="pre-intro", label="Pre", prompt="p", system_prompt_mode="generic", sort_order=-1)
    assert not step_closure.is_step_closure_eligible(None, negative_step, phase="pre-intro", questionnaire_type="CUSTOM")


def test_eligibility_synthesis_and_farewell_steps():
    assert not step_closure.is_step_closure_eligible(None, None, phase="savickas-final", questionnaire_type="SAVICKAS")
    assert not step_closure.is_step_closure_eligible(None, None, phase="sl-synthesis", questionnaire_type="QSA")
    assert not step_closure.is_step_closure_eligible(None, None, phase="qpcs-sintesi", questionnaire_type="QPCS")
    assert not step_closure.is_step_closure_eligible(None, None, phase="qpcc-sintesi", questionnaire_type="QPCC")
    assert not step_closure.is_step_closure_eligible(None, None, phase="qap-sintesi", questionnaire_type="QAP")
    assert not step_closure.is_step_closure_eligible(None, None, phase="conclusion", questionnaire_type="QSA")

    summary_step = models.GuidedStep(id="custom-summary", label="Summary", prompt="p", system_prompt_mode="qsa-summary", sort_order=5)
    assert not step_closure.is_step_closure_eligible(None, summary_step, phase="custom-summary", questionnaire_type="CUSTOM")

    farewell_step = models.GuidedStep(id="custom-bye", label="Bye", prompt="p", system_prompt_mode="farewell", sort_order=5)
    assert not step_closure.is_step_closure_eligible(None, farewell_step, phase="custom-bye", questionnaire_type="CUSTOM")


def test_eligibility_intermediate_steps():
    assert step_closure.is_step_closure_eligible(None, None, phase="savickas-q1", questionnaire_type="SAVICKAS")
    assert step_closure.is_step_closure_eligible(None, None, phase="qpcc-area1", questionnaire_type="QPCC")
    assert step_closure.is_step_closure_eligible(None, None, phase="qpcs-area2", questionnaire_type="QPCS")
    assert step_closure.is_step_closure_eligible(None, None, phase="ztpi-pneg", questionnaire_type="ZTPI")
    assert step_closure.is_step_closure_eligible(None, None, phase="qsar-c1", questionnaire_type="QSAR")


# --- Unit Tests: should_force_step_closure ---

def test_should_force_step_closure_initial_turns_do_not_inject():
    # Turns 1, 2, 3 (< 4 scambi) must NOT inject
    for turn in (1, 2, 3):
        assert not step_closure.should_force_step_closure(turn, is_eligible=True, threshold=5)
        assert not step_closure.should_force_step_closure(turn, is_eligible=True, threshold=4)


def test_should_force_step_closure_at_threshold():
    # At default threshold (5)
    assert not step_closure.should_force_step_closure(4, is_eligible=True, threshold=5)
    assert step_closure.should_force_step_closure(5, is_eligible=True, threshold=5)
    assert step_closure.should_force_step_closure(6, is_eligible=True, threshold=5)

    # At threshold 4
    assert step_closure.should_force_step_closure(4, is_eligible=True, threshold=4)


def test_should_force_step_closure_ineligible_never_forces():
    assert not step_closure.should_force_step_closure(5, is_eligible=False, threshold=5)
    assert not step_closure.should_force_step_closure(10, is_eligible=False, threshold=5)


# --- Integration Tests with SQLite, /chat and /chat/stream ---

@pytest.fixture
def test_db(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    database.Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    monkeypatch.setattr(database, "SessionLocal", session_factory)
    with session_factory() as db:
        # Seed test guided steps
        steps = [
            models.GuidedStep(id="test-intro", questionnaire_type="TEST_Q", sort_order=-1, label="0. Intro", prompt="Intro", system_prompt_mode="intro"),
            models.GuidedStep(id="test-step1", questionnaire_type="TEST_Q", sort_order=1, label="1. Step One", prompt="Step 1 prompt", system_prompt_mode="interview"),
            models.GuidedStep(id="test-step2", questionnaire_type="TEST_Q", sort_order=2, label="2. Step Two", prompt="Step 2 prompt", system_prompt_mode="interview"),
            models.GuidedStep(id="test-final", questionnaire_type="TEST_Q", sort_order=3, label="3. Final Summary", prompt="Final prompt", system_prompt_mode="summary"),
        ]
        db.add_all(steps)
        db.commit()
        yield db
    engine.dispose()


@pytest.fixture
def client_app(test_db):
    app = FastAPI()
    app.include_router(chat_routes.router)

    def override_db():
        yield test_db

    fake_identity = {
        "username": "studente_test",
        "email": "student@example.com",
        "authenticated": True,
        "is_admin": False,
        "is_researcher": False,
    }

    app.dependency_overrides[database.get_db] = override_db
    app.dependency_overrides[database.get_personal_ai_db] = override_db
    app.dependency_overrides[auth.get_identity_view_as] = lambda: fake_identity
    app.dependency_overrides[auth.get_current_user] = lambda: fake_identity

    test_client = TestClient(app)
    yield test_client
    app.dependency_overrides.clear()


class _MockAIService:
    def __init__(self, db, **kwargs):
        self.config = {"model_name": "test-model", "active_provider": "test-provider"}
        self.last_provider = "test-provider"
        self.last_model = "test-model"
        self.last_usage = {"prompt_tokens": 10, "completion_tokens": 20}
        self.last_attempts = []
        self.last_context_report = None

    def get_response(self, *args, **kwargs):
        return "Risposta ordinaria senza marcatore dall'assistente."

    def stream_response(self, *args, **kwargs):
        yield {"type": "content", "text": "Risposta ordinaria senza marcatore dall'assistente."}


@pytest.mark.parametrize("stream", [False, True])
def test_initial_turns_do_not_force_marker(monkeypatch, test_db, client_app, stream):
    """(a) Turni iniziali (< 4 scambi) non iniettano forzatamente il marcatore se non presente."""
    session_id = f"test-initial-{stream}"
    session_memory.clear(session_id)

    monkeypatch.setattr(chat_routes, "AIService", _MockAIService)

    for turn in range(1, 4):  # Turns 1, 2, 3 (< 4 scambi)
        payload = {
            "session_id": session_id,
            "message": f"Messaggio utente turno {turn}",
            "mode": "generic",
            "phase": "test-step1",
            "questionnaire_type": "TEST_Q",
            "language": "it",
        }
        if stream:
            res = client_app.post("/chat/stream", json=payload)
            assert res.status_code == 200, res.text
            events = [json.loads(line[6:]) for line in res.text.splitlines() if line.startswith("data: ")]
            done = next(e for e in events if e.get("done"))
            control_signals = done.get("control_signals", [])
        else:
            res = client_app.post("/chat", json=payload)
            assert res.status_code == 200, res.text
            data = res.json()
            control_signals = data.get("control_signals", [])

        assert control_signals == [], f"Turno iniziale {turn} non deve iniettare AVANZA_STEP"
        # Progress in session_memory should not show step completed
        progress = session_memory.get_progress(session_id)
        assert "test-step1" not in progress.get("completed_phases", [])

    session_memory.clear(session_id)


@pytest.mark.parametrize("stream", [False, True])
def test_threshold_reached_injects_marker_if_missing(monkeypatch, test_db, client_app, stream):
    """(b) Al raggiungimento della soglia (4-5 scambi nello step) il marcatore [[AVANZA_STEP]] viene aggiunto se mancante."""
    session_id = f"test-threshold-{stream}"
    session_memory.clear(session_id)

    monkeypatch.setattr(chat_routes, "AIService", _MockAIService)

    # Execute 5 turns with threshold = 5
    for turn in range(1, 6):
        payload = {
            "session_id": session_id,
            "message": f"Messaggio utente turno {turn}",
            "mode": "generic",
            "phase": "test-step1",
            "questionnaire_type": "TEST_Q",
            "language": "it",
        }
        if stream:
            res = client_app.post("/chat/stream", json=payload)
            assert res.status_code == 200, res.text
            events = [json.loads(line[6:]) for line in res.text.splitlines() if line.startswith("data: ")]
            done = next(e for e in events if e.get("done"))
            control_signals = done.get("control_signals", [])
            response_text = done.get("response", "")
        else:
            res = client_app.post("/chat", json=payload)
            assert res.status_code == 200, res.text
            data = res.json()
            control_signals = data.get("control_signals", [])
            response_text = data.get("response", "")

        if turn < 5:
            assert control_signals == [], f"Turno {turn} prima della soglia non deve avere AVANZA_STEP"
        else:
            # Turn 5 reached threshold: marker was added, control signal is present!
            assert "AVANZA_STEP" in control_signals, "Al raggiungimento della soglia (5 scambi) AVANZA_STEP deve essere presente"
            # Note: control markers are stripped from visible response so user never reads them
            assert "[[AVANZA_STEP]]" not in response_text
            # session_memory must have recorded the step as completed
            progress = session_memory.get_progress(session_id)
            assert "test-step1" in progress.get("completed_phases", [])

    session_memory.clear(session_id)


@pytest.mark.parametrize("stream", [False, True])
def test_model_emitted_marker_before_threshold_not_duplicated(monkeypatch, test_db, client_app, stream):
    """(c) Se il modello emette già il marcatore prima della soglia, non viene duplicato."""
    session_id = f"test-early-{stream}"
    session_memory.clear(session_id)

    class _EarlyMarkerAIService(_MockAIService):
        def get_response(self, *args, **kwargs):
            return "Mini-sintesi dell'area completata.\n\n[[AVANZA_STEP]]"

        def stream_response(self, *args, **kwargs):
            yield {"type": "content", "text": "Mini-sintesi dell'area completata.\n\n[[AVANZA_STEP]]"}

    monkeypatch.setattr(chat_routes, "AIService", _EarlyMarkerAIService)

    payload = {
        "session_id": session_id,
        "message": "Ho finito di rispondere alla domanda.",
        "mode": "generic",
        "phase": "test-step1",
        "questionnaire_type": "TEST_Q",
        "language": "it",
    }
    if stream:
        res = client_app.post("/chat/stream", json=payload)
        events = [json.loads(line[6:]) for line in res.text.splitlines() if line.startswith("data: ")]
        done = next(e for e in events if e.get("done"))
        control_signals = done.get("control_signals", [])
        response_text = done.get("response", "")
    else:
        res = client_app.post("/chat", json=payload)
        data = res.json()
        control_signals = data.get("control_signals", [])
        response_text = data.get("response", "")

    # Extracted once
    assert control_signals == ["AVANZA_STEP"]
    assert "[[AVANZA_STEP]]" not in response_text
    session_memory.clear(session_id)


@pytest.mark.parametrize("stream", [False, True])
def test_final_synthesis_and_intro_do_not_get_forced_marker(monkeypatch, test_db, client_app, stream):
    """(d) Negli step di sintesi finale o farewell/intro non viene aggiunto marcatore indebito."""
    monkeypatch.setattr(chat_routes, "AIService", _MockAIService)

    # 1. Test in final summary step (test-final)
    session_id_final = f"test-final-summary-{stream}"
    session_memory.clear(session_id_final)

    for turn in range(1, 7):  # Even after 6 turns in summary
        payload = {
            "session_id": session_id_final,
            "message": f"Approfondimento sintesi {turn}",
            "mode": "generic",
            "phase": "test-final",
            "questionnaire_type": "TEST_Q",
            "language": "it",
        }
        if stream:
            res = client_app.post("/chat/stream", json=payload)
            events = [json.loads(line[6:]) for line in res.text.splitlines() if line.startswith("data: ")]
            done = next(e for e in events if e.get("done"))
            control_signals = done.get("control_signals", [])
        else:
            res = client_app.post("/chat", json=payload)
            control_signals = res.json().get("control_signals", [])

        assert control_signals == [], f"Lo step finale non deve ricevere marcatore forzato al turno {turn}"

    session_memory.clear(session_id_final)

    # 2. Test in intro step (test-intro)
    session_id_intro = f"test-intro-{stream}"
    session_memory.clear(session_id_intro)

    for turn in range(1, 6):
        payload = {
            "session_id": session_id_intro,
            "message": f"Messaggio intro {turn}",
            "mode": "generic",
            "phase": "test-intro",
            "questionnaire_type": "TEST_Q",
            "language": "it",
        }
        if stream:
            res = client_app.post("/chat/stream", json=payload)
            events = [json.loads(line[6:]) for line in res.text.splitlines() if line.startswith("data: ")]
            done = next(e for e in events if e.get("done"))
            control_signals = done.get("control_signals", [])
        else:
            res = client_app.post("/chat", json=payload)
            control_signals = res.json().get("control_signals", [])

        assert control_signals == [], f"Lo step di intro non deve ricevere marcatore forzato al turno {turn}"

    session_memory.clear(session_id_intro)
