"""Bussola: catalogo chiuso, sessioni private e salvataggio esplicito."""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import auth, database, models, orientation
from backend.ai_service import AIError
from backend.orientation import _clean_state, analyze_turn, generate_opening
from backend.routes import orientation as orientation_routes


_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_Session = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
for table in (
    models.ModelPreset.__table__,
    models.Counselor.__table__,
    models.QuestionnaireResult.__table__,
    models.LearnerProfileRevision.__table__,
    models.OrientationSession.__table__,
    models.StudentBooklet.__table__,
):
    table.create(bind=_engine, checkfirst=True)

_identity = {
    "username": "orientation.student",
    "email": "orientation.student@example.test",
    "groups": [],
    "is_admin": False,
    "is_researcher": False,
    "authenticated": True,
}


def _get_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()


def _get_identity():
    return dict(_identity)


class _FakeAIService:
    calls = []

    def __init__(self, db=None):
        self.config = {}
        self.disable_thinking = False
        self.reasoning_budget_override = None

    def get_response(self, *args, **kwargs):
        type(self).calls.append((args, kwargs))
        mode = args[2]
        message = args[0].lower()
        if mode == "orientation-opening":
            return "Sono la Bussola. Quale situazione concreta vuoi mettere a fuoco oggi?"
        if mode == "orientation-state":
            if "chi ha progettato" in message or "quali strumenti" in message:
                return '{"state_action": "hold", "recommendations": [], "notebook_draft": {}}'
            return """{
          "state_action": "replace",
          "recommendations": [
            {"id": "QSA", "reason": "Per osservare come organizzi lo studio."},
            {"id": "UNKNOWN", "reason": "Non appartiene al catalogo."},
            {"id": "IDEA", "reason": "Per mettere a fuoco il prossimo passo."}
          ],
          "notebook_draft": {
            "goal": "Voglio organizzare meglio il mio studio.",
            "private_fact": "Questo campo non deve passare."
          }
        }"""
        if "chi ha progettato" in message:
            return "Il QSA è stato progettato da Michele Pellerey."
        if "quali strumenti" in message:
            return "QSA e QSAr esplorano lo studio; SAVICKAS, IDEA e pQBL offrono percorsi diversi. Il Taccuino raccoglie solo ciò che emerge su di te."
        return "Hai descritto un obiettivo di studio concreto. Prima di indicare uno strumento, qual è l’ostacolo che incontri più spesso?"


orientation.AIService = _FakeAIService

app = FastAPI()
app.include_router(orientation_routes.router)
app.dependency_overrides[database.get_db] = _get_db
app.dependency_overrides[auth.get_current_user] = _get_identity
client = TestClient(app)


def _reset(username: str) -> None:
    db = _Session()
    try:
        db.query(models.OrientationSession).filter(models.OrientationSession.username == username).delete()
        db.query(models.LearnerProfileRevision).filter(models.LearnerProfileRevision.username == username).delete()
        db.query(models.QuestionnaireResult).filter(models.QuestionnaireResult.username == username).delete()
        db.query(models.StudentBooklet).filter(models.StudentBooklet.username == username).delete()
        db.commit()
    finally:
        db.close()


def test_opening_question_is_generated_by_the_selected_model():
    db = _Session()
    try:
        _FakeAIService.calls = []
        opening = generate_opening(db, "it")
    finally:
        db.close()

    assert opening == "Sono la Bussola. Quale situazione concreta vuoi mettere a fuoco oggi?"
    args, kwargs = _FakeAIService.calls[-1]
    assert args[2] == "orientation-opening"
    assert "Write the opening" in args[1]
    assert "no domain is known" in args[1]
    assert kwargs["json_mode"] is False


def test_factual_tool_question_is_answered_by_the_model_and_does_not_change_state():
    db = _Session()
    try:
        analysis = analyze_turn(
            db,
            "Chi ha progettato il QSA?",
            "it",
            current_recommendations=[{"id": "QSA", "reason": "Coerente con il bisogno emerso."}],
            current_notebook={"goal": "Organizzare meglio lo studio."},
        )
    finally:
        db.close()

    assert analysis.reply == "Il QSA è stato progettato da Michele Pellerey."
    assert analysis.state_action == "hold"
    assert analysis.recommendations == []
    assert analysis.notebook_draft == {}


def test_platform_question_is_generated_by_the_model_without_creating_notebook_content():
    db = _Session()
    try:
        analysis = analyze_turn(db, "Mi spieghi quali strumenti ci sono in CounselorBot?", "it")
    finally:
        db.close()

    assert "QSA e QSAr" in analysis.reply
    assert "Taccuino" in analysis.reply
    assert analysis.state_action == "hold"
    assert analysis.recommendations == []
    assert analysis.notebook_draft == {}


def test_orientation_uses_the_selected_counselor_for_reply_and_llm_state_extraction():
    db = _Session()
    try:
        preset = models.ModelPreset(
            name="Orientation test",
            provider="ollama",
            model="test-model",
            disable_thinking=True,
            reasoning_budget=321,
        )
        db.add(preset)
        db.flush()
        counselor = models.Counselor(
            slug="orientation-test",
            name="Ada",
            persona="Speak with calm precision.",
            preset_id=preset.id,
            language=["*"],
            is_active=True,
        )
        db.add(counselor)
        db.commit()
        db.refresh(counselor)

        _FakeAIService.calls = []
        analyze_turn(db, "Voglio organizzare meglio lo studio", "it", counselor_id=counselor.id)
        reply_args, reply_kwargs = _FakeAIService.calls[-2]
        state_args, state_kwargs = _FakeAIService.calls[-1]
    finally:
        db.close()

    assert "natural conversational reply" in reply_args[1]
    assert "formulaic empathy" in reply_args[1]
    assert "display pQBL" in reply_args[1]
    assert "Taccuino, Libretto, Portfolio" in reply_args[1]
    assert "diagnostic language" in reply_args[1]
    assert "informational turns" in reply_args[1]
    assert '"what can I do here?"' in reply_args[1]
    assert "Speak with calm precision." in reply_args[1]
    assert reply_kwargs["provider"] == "ollama"
    assert reply_kwargs["model"] == "test-model"
    assert reply_kwargs["json_mode"] is False
    assert "state_action" in state_args[1]
    assert state_kwargs["json_mode"] is True


def test_invalid_state_output_keeps_the_llm_reply_without_local_ranking_or_copied_goal():
    class _PlainService(_FakeAIService):
        def get_response(self, *args, **kwargs):
            type(self).calls.append((args, kwargs))
            if args[2] == "orientation-state":
                return "not valid json"
            return "Il QSA osserva come studi e ti restituisce un profilo utile per capire da dove partire."

    orientation.AIService = _PlainService
    db = _Session()
    try:
        _PlainService.calls = []
        analysis = analyze_turn(db, "Voglio organizzare meglio lo studio", "it")
        calls = list(_PlainService.calls)
    finally:
        orientation.AIService = _FakeAIService
        db.close()

    assert analysis.reply.startswith("Il QSA osserva come studi")
    assert analysis.state_action == "hold"
    assert analysis.recommendations == []
    assert analysis.notebook_draft == {}
    assert calls[0][1]["model"] == "qwen3.8:latest"
    assert calls[0][1]["json_mode"] is False
    assert calls[1][1]["json_mode"] is True


def test_model_output_is_filtered_through_closed_contract():
    cleaned = _clean_state(
        {
            "state_action": "replace",
            "recommendations": [
                {"id": "QAP", "reason": "Scelte future"},
                {"id": "QAP", "reason": "Duplicato"},
                {"id": "NOT_REAL", "reason": "Fuori catalogo"},
                {"id": "IDEA", "reason": "Mettere a fuoco"},
            ],
            "notebook_draft": {"goal": "Scegliere", "diagnosis": "vietata"},
        }
    )
    assert cleaned.state_action == "replace"
    assert [row["id"] for row in cleaned.recommendations] == ["QAP", "IDEA"]
    assert cleaned.notebook_draft == {"goal": "Scegliere"}


def test_invalid_or_empty_model_recommendations_cannot_trigger_a_deterministic_default():
    cleaned = _clean_state({"state_action": "replace", "recommendations": [{"id": "UNKNOWN"}]})
    assert cleaned.state_action == "hold"
    assert cleaned.recommendations == []
    assert cleaned.notebook_draft == {}


def test_unavailable_reply_model_raises_instead_of_using_predefined_content():
    class _UnavailableService(_FakeAIService):
        def get_response(self, *args, **kwargs):
            raise AIError("model unavailable")

    orientation.AIService = _UnavailableService
    db = _Session()
    try:
        with pytest.raises(AIError, match="model unavailable"):
            analyze_turn(db, "Chi ha progettato il QSA?", "it")
    finally:
        orientation.AIService = _FakeAIService
        db.close()


def test_new_student_stays_gated_until_one_orientation_is_completed():
    username = "orientation.new"
    _identity["username"] = username
    _reset(username)

    initial = client.get("/orientation/status").json()
    assert initial["eligible"] is True
    assert initial["required"] is True
    assert initial["completed"] is False

    started = client.post("/orientation/sessions", json={"language": "it"}).json()
    pending = client.get("/orientation/status").json()
    assert pending["required"] is True
    assert pending["in_progress_session_id"] == started["session_id"]

    client.post(
        f"/orientation/sessions/{started['session_id']}/message",
        json={"message": "Voglio organizzare meglio lo studio", "language": "it"},
    )
    client.post(
        f"/orientation/sessions/{started['session_id']}/notebook-review",
        json={"data": {"goal": "Organizzare meglio lo studio."}},
    )
    assert client.get("/orientation/status").json()["required"] is True


def test_first_orientation_requires_review_and_remains_reopenable():
    username = "orientation.student"
    _identity["username"] = username
    _reset(username)

    db = _Session()
    try:
        db.add(models.LearnerProfileRevision(
            username=username,
            data={"context": "Frequento il quarto anno."},
            source="manual",
        ))
        db.commit()
    finally:
        db.close()

    # Un utente con attività preesistente è esente dalla prima Bussola, ma può
    # comunque aprirla volontariamente.
    status = client.get("/orientation/status")
    assert status.status_code == 200
    assert status.json()["legacy_exempt"] is True
    assert status.json()["required"] is False

    started = client.post("/orientation/sessions", json={"language": "it"})
    assert started.status_code == 200
    session_id = started.json()["session_id"]
    assert started.json()["messages"][0]["role"] == "assistant"
    assert client.get("/orientation/status").json()["required"] is False

    turn = client.post(
        f"/orientation/sessions/{session_id}/message",
        json={"message": "Voglio organizzare meglio lo studio", "language": "it"},
    )
    assert turn.status_code == 200
    assert [row["id"] for row in turn.json()["recommendations"]] == ["QSA", "IDEA"]
    assert turn.json()["notebook_draft"] == {"goal": "Voglio organizzare meglio il mio studio."}

    help_turn = client.post(
        f"/orientation/sessions/{session_id}/message",
        json={"message": "Mi spieghi quali strumenti ci sono in CounselorBot?", "language": "it"},
    )
    assert help_turn.status_code == 200
    assert "QSA e QSAr" in help_turn.json()["messages"][-1]["content"]
    assert [row["id"] for row in help_turn.json()["recommendations"]] == ["QSA", "IDEA"]
    assert help_turn.json()["notebook_draft"] == {"goal": "Voglio organizzare meglio il mio studio."}

    blocked = client.post(f"/orientation/sessions/{session_id}/complete")
    assert blocked.status_code == 409

    reviewed = client.post(
        f"/orientation/sessions/{session_id}/notebook-review",
        json={"data": {"goal": "Organizzare lo studio con un metodo sostenibile."}},
    )
    assert reviewed.status_code == 200
    assert reviewed.json()["notebook_reviewed"] is True
    assert reviewed.json()["notebook_revision_id"] is not None
    assert client.get("/orientation/status").json()["required"] is False

    db = _Session()
    try:
        latest = (
            db.query(models.LearnerProfileRevision)
            .filter(models.LearnerProfileRevision.username == username)
            .order_by(models.LearnerProfileRevision.id.desc())
            .first()
        )
        assert latest.source == "orientation"
        assert latest.session_id == session_id
        assert latest.data == {
            "context": "Frequento il quarto anno.",
            "goal": "Organizzare lo studio con un metodo sostenibile.",
        }
    finally:
        db.close()

    completed = client.post(f"/orientation/sessions/{session_id}/complete")
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"

    status = client.get("/orientation/status").json()
    assert status["completed"] is True
    assert status["required"] is False

    reopened = client.get(f"/orientation/sessions/{session_id}")
    assert reopened.status_code == 200
    assert reopened.json()["messages"] == completed.json()["messages"]

    new_session = client.post(
        "/orientation/sessions",
        json={"language": "it", "new_session": True},
    )
    assert new_session.status_code == 200
    assert new_session.json()["session_id"] != session_id
    assert client.get("/orientation/status").json()["required"] is False


def test_session_keeps_the_counselor_chosen_before_the_conversation():
    username = "orientation.with-counselor"
    _identity["username"] = username
    _reset(username)
    db = _Session()
    try:
        counselor = models.Counselor(
            slug="session-counselor",
            name="Clio",
            language=["*"],
            is_active=True,
        )
        db.add(counselor)
        db.commit()
        db.refresh(counselor)
        counselor_id = counselor.id
    finally:
        db.close()

    started = client.post(
        "/orientation/sessions",
        json={"language": "it", "new_session": True, "counselor_id": counselor_id},
    )
    assert started.status_code == 200
    assert started.json()["counselor_id"] == counselor_id
    assert started.json()["messages"][0]["content"] == "Sono la Bussola. Quale situazione concreta vuoi mettere a fuoco oggi?"
    assert "Clio" in _FakeAIService.calls[-1][0][1]


def test_existing_session_adopts_the_counselor_without_losing_history():
    username = "orientation.adopt-counselor"
    _identity["username"] = username
    _reset(username)

    # Sessione aperta prima della scelta (vecchio flusso), con un turno già scritto.
    started = client.post("/orientation/sessions", json={"language": "it"})
    assert started.status_code == 200
    assert started.json()["counselor_id"] is None
    session_id = started.json()["session_id"]
    client.post(
        f"/orientation/sessions/{session_id}/message",
        json={"message": "Voglio organizzare meglio lo studio", "language": "it"},
    )

    db = _Session()
    try:
        counselor = models.Counselor(
            slug="adopt-counselor",
            name="Giulio",
            language=["*"],
            is_active=True,
        )
        db.add(counselor)
        db.commit()
        db.refresh(counselor)
        counselor_id = counselor.id
    finally:
        db.close()

    resumed = client.post(
        "/orientation/sessions",
        json={"language": "it", "new_session": False, "counselor_id": counselor_id},
    )
    assert resumed.status_code == 200
    assert resumed.json()["session_id"] == session_id
    assert resumed.json()["counselor_id"] == counselor_id
    messages = resumed.json()["messages"]
    assert any(row["content"] == "Voglio organizzare meglio lo studio" for row in messages)

    _FakeAIService.calls = []
    turn = client.post(
        f"/orientation/sessions/{session_id}/message",
        json={"message": "Vorrei concentrarmi di più", "language": "it"},
    )
    assert turn.status_code == 200
    assert turn.json()["counselor_id"] == counselor_id
    assert len(_FakeAIService.calls) == 2
    assert "Giulio" in _FakeAIService.calls[0][0][1]


def test_orientation_sessions_are_private():
    owner = "orientation.owner"
    intruder = "orientation.intruder"
    _identity["username"] = owner
    _reset(owner)
    _reset(intruder)
    session_id = client.post(
        "/orientation/sessions",
        json={"language": "it", "new_session": True},
    ).json()["session_id"]

    _identity["username"] = intruder
    assert client.get(f"/orientation/sessions/{session_id}").status_code == 404
    assert client.post(
        f"/orientation/sessions/{session_id}/message",
        json={"message": "Provo ad accedere", "language": "it"},
    ).status_code == 404
