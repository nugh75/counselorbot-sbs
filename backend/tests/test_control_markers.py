"""Control markers never reach the person, in any chat present or future.

The guard enumerates every registered chat type (tool catalog, factory guided
paths, instruments registered in the database, free chat) instead of a
hand-written list: a new chat type is covered the day it is registered.
"""
import json
import re
from io import BytesIO
from pathlib import Path

import pytest
from pypdf import PdfReader

from backend import control_markers, dynamic_registry, models, orientation, prompt_factory_alignment
from backend.pdf_generator import generate_questionnaire_pdf
from backend.routes import survey
from backend.tests.test_smoke import _FakeAIService, _fake_user_identity, _TestSession, auth, client, main

MARKER_TEXT = re.compile(r"AVANZA", re.IGNORECASE)
REPLY = "Ecco la bozza: l'obiettivo è “preciso”.\n\n[[AVANZA_STEP]]"


def registered_chat_types() -> list[str]:
    _, steps = prompt_factory_alignment.factory_catalog()
    with _TestSession() as db:
        dynamic = dynamic_registry.get_registered_instrument_codes(db)
    types = set(orientation.TOOL_IDS) | {step["questionnaire_type"] for step in steps.values()} | set(dynamic)
    return sorted(types) + [""]


# --- Registry and filter ------------------------------------------------------------------

@pytest.mark.parametrize("raw, visible", [
    ("Testo.\n\n[[AVANZA_STEP]]", "Testo."),
    ("[[AVANZA_STEP]]", ""),
    ("Prima [[ avanza_step ]] dopo", "Prima  dopo"),
    ("Escaped [[AVANZA\\_STEP]]", "Escaped"),
    ("Nessun segnale [[Wiki]] resta", "Nessun segnale [[Wiki]] resta"),
])
def test_extract_returns_visible_text_and_signals(raw, visible):
    text, signals = control_markers.extract(raw)
    assert text == visible
    assert signals == (["AVANZA_STEP"] if "vanza" in raw.lower() else [])


def test_streaming_display_hides_a_marker_still_arriving():
    for partial in ("Testo [", "Testo [[", "Testo [[AVAN", "Testo [[AVANZA_STEP]"):
        assert control_markers.strip_for_display(partial) == "Testo"
    assert control_markers.strip_for_display("Testo fermo ") == "Testo fermo "


def test_frontend_registry_matches_backend_registry():
    source = (Path(__file__).resolve().parents[2] / "frontend/src/lib/control-markers.ts")
    if not source.exists():
        pytest.skip("frontend sources not mounted")
    match = re.search(r"CONTROL_MARKERS = \[([^\]]*)\]", source.read_text(encoding="utf-8"))
    assert match, "frontend registry not found"
    assert tuple(re.findall(r"'([A-Z_]+)'", match.group(1))) == control_markers.CONTROL_MARKERS


# --- Guard: every registered chat type, both routes, history and export ----------------------

@pytest.mark.parametrize("qtype", registered_chat_types())
@pytest.mark.parametrize("stream", [False, True])
def test_no_chat_type_shows_a_control_marker(monkeypatch, qtype, stream):
    sid = f"marker-guard-{qtype or 'free'}-{'stream' if stream else 'sync'}"

    def output(*args, **kwargs):
        for char in REPLY:
            yield {"type": "content", "text": char}

    import backend.routes.chat as chat_routes
    monkeypatch.setattr(chat_routes, "AIService", _FakeAIService)
    monkeypatch.setattr(_FakeAIService, "stream_response", output)
    monkeypatch.setattr(_FakeAIService, "get_response", lambda *args, **kwargs: REPLY)
    main.app.dependency_overrides[auth.get_identity_view_as] = _fake_user_identity
    try:
        response = client.post("/chat/stream" if stream else "/chat", json={
            "session_id": sid, "message": "Vorrei andare avanti", "mode": "generic",
            "questionnaire_type": qtype or None, "language": "it",
        })
        assert response.status_code == 200, response.text
        if stream:
            events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
            for event in events:
                for key in ("display", "delta", "response"):
                    assert not MARKER_TEXT.search(event.get(key) or ""), (qtype, key, event)
            body = next(event for event in events if event.get("done"))
        else:
            body = response.json()
        assert not MARKER_TEXT.search(body["response"])
        assert body["control_signals"] == ["AVANZA_STEP"]

        with _TestSession() as db:
            logs = db.query(models.Log).filter_by(session_id=sid, action="chat_message").all()
            assert logs, qtype
            assert all(not MARKER_TEXT.search((log.details or {}).get("bot_response") or "") for log in logs)
            # A log written before the shared filter still reads clean everywhere.
            db.add(models.Log(action="chat_message", session_id=sid, questionnaire_type=qtype or None,
                              details={"bot_response": "[[AVANZA_STEP]]", "user_input": "ok"}))
            db.add(models.Log(action="chat_message", session_id=sid, questionnaire_type=qtype or None,
                              details={"bot_response": "Vecchia risposta.\n[[AVANZA_STEP]]"}))
            db.commit()
            history = survey._session_conversation_messages(db, sid)
            assert history and all(not MARKER_TEXT.search(item["text"]) for item in history)
            assert all(item["text"].strip() for item in history)
            pdf = generate_questionnaire_pdf(
                questionnaire_type=qtype or "CHAT", scores=None, session_id=sid, language="it",
                messages=history + [{"role": "counselor", "text": "Grezzo [[AVANZA_STEP]]"}],
                summary_text="Sintesi [[AVANZA_STEP]]",
            )
            text = "".join(page.extract_text() for page in PdfReader(BytesIO(pdf.read())).pages)
            assert not MARKER_TEXT.search(text), qtype
    finally:
        main.app.dependency_overrides.pop(auth.get_identity_view_as, None)
        with _TestSession() as db:
            db.query(models.Log).filter_by(session_id=sid).delete()
            db.commit()


def test_a_reply_made_only_of_the_marker_is_complete_without_visible_text(monkeypatch):
    sid = "marker-only-stream"

    def output(*args, **kwargs):
        yield {"type": "content", "text": "[[AVANZA_STEP]]"}

    import backend.routes.chat as chat_routes
    monkeypatch.setattr(chat_routes, "AIService", _FakeAIService)
    monkeypatch.setattr(_FakeAIService, "stream_response", output)
    monkeypatch.setattr(_FakeAIService, "get_response", lambda *args, **kwargs: pytest.fail("no retry"))
    main.app.dependency_overrides[auth.get_identity_view_as] = _fake_user_identity
    try:
        response = client.post("/chat/stream", json={
            "session_id": sid, "message": "andiamo avanti", "mode": "generic",
            "questionnaire_type": "SAVICKAS", "language": "it",
        })
        events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
        assert not any(event.get("error") for event in events)
        done = next(event for event in events if event.get("done"))
        assert done["response"] == "" and done["control_signals"] == ["AVANZA_STEP"]
    finally:
        main.app.dependency_overrides.pop(auth.get_identity_view_as, None)
        with _TestSession() as db:
            db.query(models.Log).filter_by(session_id=sid).delete()
            db.commit()
