"""Bussola: catalogo chiuso, sessioni private e salvataggio esplicito."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import auth, database, models, orientation
from backend.orientation import _clean_analysis, fallback_analysis
from backend.routes import orientation as orientation_routes


_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_Session = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
for table in (
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
    def __init__(self, db=None):
        pass

    def get_response(self, *args, **kwargs):
        return """{
          "reply": "Hai descritto un obiettivo di studio concreto.",
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


def test_fallback_is_localized_and_ranks_learning_intent():
    analysis = fallback_analysis("Voglio studiare con più concentrazione", "it")
    assert analysis.recommendations[0]["id"] == "QSA"
    assert "detailed exploration" not in analysis.recommendations[0]["reason"]
    assert analysis.notebook_draft == {"goal": "Voglio studiare con più concentrazione"}


def test_model_output_is_filtered_through_closed_contract():
    fallback = fallback_analysis("una scelta per il mio futuro", "it")
    cleaned = _clean_analysis(
        {
            "reply": "Riflessione",
            "recommendations": [
                {"id": "QAP", "reason": "Scelte future"},
                {"id": "QAP", "reason": "Duplicato"},
                {"id": "NOT_REAL", "reason": "Fuori catalogo"},
                {"id": "IDEA", "reason": "Mettere a fuoco"},
            ],
            "notebook_draft": {"goal": "Scegliere", "diagnosis": "vietata"},
        },
        fallback,
    )
    assert [row["id"] for row in cleaned.recommendations] == ["QAP", "IDEA"]
    assert cleaned.notebook_draft == {"goal": "Scegliere"}


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
