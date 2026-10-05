"""Taccuini studente di prova del docente.

Casi:
- API /teacher/practice-notebooks: gate ruolo, proprieta' (altrui = 404),
  creazione senza limite, modifica, archiviazione/ripristino, eliminazione.
- Envelope della chat guidata: con notebook_context="practice" entra un blocco
  [SIMULATION] separato e il [PROFILE] dello studente simulato, mai i dati del
  docente; ruolo e proprieta' riverificati a ogni turno; tutti gli strumenti.
- Bussola: stesso blocco e nessun dato del docente in prova.
- Sessione congelata: la scelta del taccuino di prova sopravvive al resume.
"""
import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "postgresql://counselorbot_user:counselorbot@postgres:5432/counselorbot")

from backend import auth, models, orientation
from backend.api_models import ChatRequest
from backend.chat_logic import build_context_envelope
from backend.memory_service import session_memory
from backend.practice_notebooks import SIMULATION_NOTICES, simulation_notice
from backend.routes import frozen_sessions, practice_notebooks
from backend.routes import orientation as orientation_routes
from backend.tests.artifact_database import artifact_session

TEACHER = {"username": "t1", "groups": ["docenti"], "is_admin": False, "is_researcher": False, "authenticated": True}
STUDENT = {"username": "s1", "groups": ["studenti"], "is_admin": False, "is_researcher": False, "authenticated": True}

ALL_INSTRUMENTS = [
    "QSA", "QSAr", "ZTPI", "SAVICKAS", "QPCS", "QPCC", "QAP", "EVENTO_STUDIO",
    "EVENTO_PROFESSIONALE", "OBIETTIVO_STUDIO", "OBIETTIVO_DOCENZA", "IDEA",
]


class _StubAI:
    def __init__(self):
        self.config = {}
        self.disable_thinking = False
        self.embedding_model = "bge-m3"

    def get_response(self, *a, **k):
        return "RISPOSTA_TEST"

    def stream_response(self, *a, **k):
        yield {"type": "content", "text": "RISPOSTA_TEST"}


def _app(db, identity, *routers):
    app = FastAPI()
    for router in routers:
        app.include_router(router)
    app.dependency_overrides[auth.get_current_user] = lambda: identity
    from backend.database import get_db, get_personal_ai_db
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_personal_ai_db] = lambda: db
    return TestClient(app)


def _envelope(db, request, identity, questionnaire_type, components=None):
    session_id = f"practice-{questionnaire_type}-{identity.get('username')}-{request.practice_notebook_id}"
    session_memory.clear(session_id)
    system_final, _, _ = build_context_envelope(
        db, _StubAI(), request, session_id, identity,
        c_persona="", system_prompt="SYS",
        step_label="Step 1", questionnaire_type=questionnaire_type,
        effective_message="step", model_scores_context="",
        message_scores_context="", knowledge_context="KNOWLEDGE_BLOCK",
        components=components,
    )
    session_memory.clear(session_id)
    return system_final


def _seed_teacher(db):
    """Il docente ha anche dati propri: nessuno deve entrare in prova."""
    db.add(models.LearnerProfileRevision(username="t1", data={"goal": "Obiettivo REALE del docente"}, source="manual"))
    db.add(models.TeacherProfileRevision(username="t1", data={"subjects": "Chimica"}, source="manual"))
    practice = models.TeacherPracticeNotebook(
        owner_username="t1", title="Giulia",
        data={"school_class": "3ª liceo", "main_difficulty": "Ansia da verifica"},
    )
    db.add(practice)
    db.commit()
    return practice


# --- API --------------------------------------------------------------------

def test_api_requires_plan_manager_role():
    with artifact_session() as db:
        client = _app(db, STUDENT, practice_notebooks.router)
        assert client.get("/teacher/practice-notebooks").status_code == 403
        assert client.post("/teacher/practice-notebooks", json={"title": "X"}).status_code == 403


def test_api_crud_archive_and_no_count_limit():
    with artifact_session() as db:
        client = _app(db, TEACHER, practice_notebooks.router)
        created = client.post("/teacher/practice-notebooks", json={
            "title": "  Giulia  ",
            "data": {"school_class": " 3ª ", "main_difficulty": "Ansia", "unknown": "scartato", "notes": "   "},
        })
        assert created.status_code == 201
        body = created.json()
        assert body["title"] == "Giulia"
        assert body["data"] == {"school_class": "3ª", "main_difficulty": "Ansia"}
        # Nessun limite prefissato al numero di taccuini.
        for index in range(30):
            assert client.post("/teacher/practice-notebooks", json={"title": f"S{index}"}).status_code == 201
        assert len(client.get("/teacher/practice-notebooks").json()) == 31

        notebook_id = body["id"]
        updated = client.put(f"/teacher/practice-notebooks/{notebook_id}", json={"title": "Giulia B.", "data": {"strengths": "Curiosa"}}).json()
        assert updated["title"] == "Giulia B." and updated["data"] == {"strengths": "Curiosa"}

        archived = client.put(f"/teacher/practice-notebooks/{notebook_id}", json={"archived": True}).json()
        assert archived["archived_at"] is not None
        assert notebook_id not in [row["id"] for row in client.get("/teacher/practice-notebooks").json()]
        assert notebook_id in [row["id"] for row in client.get("/teacher/practice-notebooks?include_archived=true").json()]
        restored = client.put(f"/teacher/practice-notebooks/{notebook_id}", json={"archived": False}).json()
        assert restored["archived_at"] is None

        assert client.post("/teacher/practice-notebooks", json={"title": "   "}).status_code == 422
        assert client.put(f"/teacher/practice-notebooks/{notebook_id}", json={"title": ""}).status_code == 422
        assert client.delete(f"/teacher/practice-notebooks/{notebook_id}").json() == {"deleted": notebook_id}
        assert client.delete(f"/teacher/practice-notebooks/{notebook_id}").status_code == 404


def test_api_hides_other_teachers_notebooks():
    with artifact_session() as db:
        other = models.TeacherPracticeNotebook(owner_username="t2", title="Di un altro", data={})
        db.add(other)
        db.commit()
        client = _app(db, TEACHER, practice_notebooks.router)
        assert client.get("/teacher/practice-notebooks").json() == []
        assert client.put(f"/teacher/practice-notebooks/{other.id}", json={"title": "Mio"}).status_code == 404
        assert client.delete(f"/teacher/practice-notebooks/{other.id}").status_code == 404
        db.refresh(other)
        assert other.title == "Di un altro"


# --- Envelope della chat guidata -------------------------------------------

def test_practice_notebook_enters_with_structured_simulation_block():
    with artifact_session() as db:
        practice = _seed_teacher(db)
        request = ChatRequest(
            message=" turno ", questionnaire_type="QSA", language="it",
            notebook_context="practice", practice_notebook_id=practice.id,
        )
        components = {}
        system = _envelope(db, request, TEACHER, "QSA", components)
        assert "[SIMULATION]\n" + SIMULATION_NOTICES["it"] in system
        assert "[PROFILE]\n## Taccuino studente di prova (simulato): «Giulia»" in system
        assert system.index("[SIMULATION]") < system.index("[PROFILE]")
        assert "Ansia da verifica" in system and "3ª liceo" in system
        # Mai i dati del docente al posto dello studente simulato.
        assert "Obiettivo REALE del docente" not in system
        assert "Chimica" not in system
        # Blocco separato dal profilo: i livelli di contesto che riducono
        # [PROFILE] non possono tagliare l'avviso.
        assert components["simulation"] == SIMULATION_NOTICES["it"]
        assert "SIMULAZIONE" not in components["profile"]


def test_simulation_notice_follows_interface_language():
    with artifact_session() as db:
        practice = _seed_teacher(db)
        for lang in ("en", "es", "fr", "de", "sv"):
            request = ChatRequest(
                message=" turno ", questionnaire_type="QSA", language=lang,
                notebook_context="practice", practice_notebook_id=practice.id,
            )
            assert "[SIMULATION]\n" + SIMULATION_NOTICES[lang] in _envelope(db, request, TEACHER, "QSA")


def test_simulation_notice_has_every_supported_language():
    assert set(SIMULATION_NOTICES) == {"it", "en", "es", "fr", "de", "sv"}
    for text in SIMULATION_NOTICES.values():
        assert "[PROFILE]" in text
    assert simulation_notice("pt") == SIMULATION_NOTICES["it"]
    assert simulation_notice("en-GB") == SIMULATION_NOTICES["en"]


def test_practice_works_in_every_guided_instrument():
    with artifact_session() as db:
        practice = _seed_teacher(db)
        for instrument in ALL_INSTRUMENTS:
            request = ChatRequest(
                message=" turno ", questionnaire_type=instrument, language="it",
                notebook_context="practice", practice_notebook_id=practice.id,
            )
            system = _envelope(db, request, TEACHER, instrument)
            assert "[SIMULATION]" in system, instrument
            assert "Ansia da verifica" in system, instrument
            assert "Obiettivo REALE del docente" not in system, instrument
            assert "Chimica" not in system, instrument


def test_student_cannot_pull_a_practice_notebook_into_their_chat():
    """Ruolo riverificato: uno studente resta sul suo taccuino reale."""
    with artifact_session() as db:
        practice = _seed_teacher(db)
        db.add(models.LearnerProfileRevision(username="s1", data={"goal": "Obiettivo dello studente vero"}, source="manual"))
        db.commit()
        request = ChatRequest(
            message=" turno ", questionnaire_type="QSA", language="it",
            notebook_context="practice", practice_notebook_id=practice.id,
        )
        system = _envelope(db, request, {**STUDENT}, "QSA")
        assert "[SIMULATION]" not in system
        assert "Ansia da verifica" not in system
        assert "Obiettivo dello studente vero" in system


def test_unresolvable_practice_request_never_falls_back_to_real_data():
    """Altrui, archiviato o eliminato: profilo vuoto, nessun avviso."""
    with artifact_session() as db:
        practice = _seed_teacher(db)
        foreign = models.TeacherPracticeNotebook(owner_username="t2", title="Altro", data={"notes": "ALTRUI"})
        db.add(foreign)
        db.commit()
        for notebook_id in (foreign.id, 999999, None):
            request = ChatRequest(
                message=" turno ", questionnaire_type="QSA", language="it",
                notebook_context="practice", practice_notebook_id=notebook_id,
            )
            system = _envelope(db, request, TEACHER, "QSA")
            assert "[SIMULATION]" not in system
            assert "ALTRUI" not in system
            assert "Obiettivo REALE del docente" not in system
            assert "KNOWLEDGE_BLOCK" in system
        from datetime import datetime, timezone
        practice.archived_at = datetime.now(timezone.utc)
        db.commit()
        request = ChatRequest(
            message=" turno ", questionnaire_type="QSA", language="it",
            notebook_context="practice", practice_notebook_id=practice.id,
        )
        system = _envelope(db, request, TEACHER, "QSA")
        assert "[SIMULATION]" not in system and "Ansia da verifica" not in system
        assert "Obiettivo REALE del docente" not in system


def test_existing_choices_unchanged_by_practice_notebooks():
    with artifact_session() as db:
        practice = _seed_teacher(db)
        for choice, expected, absent in (
            ("student", "Obiettivo REALE del docente", "Ansia da verifica"),
            ("teacher", "Chimica", "Ansia da verifica"),
        ):
            request = ChatRequest(
                message=" turno ", questionnaire_type="QSA", language="it",
                notebook_context=choice, practice_notebook_id=practice.id,
            )
            system = _envelope(db, request, TEACHER, "QSA")
            assert expected in system and absent not in system
            assert "[SIMULATION]" not in system


# --- Bussola ----------------------------------------------------------------

class _CapturingAI:
    prompts: list = []

    def __init__(self, db=None, username=None):
        self.config = {}
        self.disable_thinking = False
        self.reasoning_budget_override = None

    def get_response(self, message, system_prompt, *args, **kwargs):
        type(self).prompts.append(system_prompt)
        return '{"reply": "Partiamo.", "state_action": "hold", "recommendations": []}'


def test_bussola_practice_turn_uses_only_the_simulated_student(monkeypatch):
    monkeypatch.setattr(orientation, "AIService", _CapturingAI)
    _CapturingAI.prompts = []
    with artifact_session() as db:
        practice = _seed_teacher(db)
        db.add(models.QuestionnaireResult(session_id="s-teacher", questionnaire_type="QAP", username="t1", scores=None))
        db.commit()
        client = _app(db, TEACHER, orientation_routes.router)
        started = client.post("/orientation/sessions", json={
            "language": "en", "new_session": True,
            "notebook_context": "practice", "practice_notebook_id": practice.id,
        })
        assert started.status_code == 200
        opening_prompt = _CapturingAI.prompts[-1]
        assert "[SIMULATION]\n" + SIMULATION_NOTICES["en"] in opening_prompt
        session_id = started.json()["session_id"]
        reply = client.post(f"/orientation/sessions/{session_id}/message", json={
            "message": "Da dove parto?", "language": "en",
            "notebook_context": "practice", "practice_notebook_id": practice.id,
        })
        assert reply.status_code == 200
        prompt = _CapturingAI.prompts[-1]
        assert "\n[SIMULATION]\n" + SIMULATION_NOTICES["en"] in prompt and "Ansia da verifica" in prompt
        assert "Obiettivo REALE del docente" not in prompt
        assert "THE STUDENT SO FAR" not in prompt     # niente compilazioni del docente
        # Senza scelta di prova la Bussola resta quella di sempre.
        client.post(f"/orientation/sessions/{session_id}/message", json={"message": "E poi?", "language": "en"})
        assert "\n[SIMULATION]\n" not in _CapturingAI.prompts[-1]
        assert SIMULATION_NOTICES["en"] not in _CapturingAI.prompts[-1]
        assert "THE STUDENT SO FAR" in _CapturingAI.prompts[-1]


def test_bussola_ignores_practice_request_from_a_student(monkeypatch):
    monkeypatch.setattr(orientation, "AIService", _CapturingAI)
    _CapturingAI.prompts = []
    with artifact_session() as db:
        practice = _seed_teacher(db)
        client = _app(db, STUDENT, orientation_routes.router)
        started = client.post("/orientation/sessions", json={"language": "it", "new_session": True}).json()
        client.post(f"/orientation/sessions/{started['session_id']}/message", json={
            "message": "Da dove parto?", "language": "it",
            "notebook_context": "practice", "practice_notebook_id": practice.id,
        })
        assert "\n[SIMULATION]\n" not in _CapturingAI.prompts[-1]
        assert SIMULATION_NOTICES["it"] not in _CapturingAI.prompts[-1]
        assert "Ansia da verifica" not in _CapturingAI.prompts[-1]


# --- Sessione congelata -----------------------------------------------------

def test_frozen_session_keeps_the_practice_choice():
    with artifact_session() as db:
        client = _app(db, TEACHER, frozen_sessions.router)
        payload = {
            "session_id": "practice-freeze-1", "questionnaire_type": "QSA", "messages": [],
            "current_phase": "intro", "notebook_context": "practice", "practice_notebook_id": 7,
        }
        assert client.post("/session/freeze", json=payload).status_code == 200
        detail = client.get("/session/frozen/practice-freeze-1").json()
        assert detail["notebook_context"] == "practice"
        assert detail["practice_notebook_id"] == 7


# --- Classi dello studente simulato ----------------------------------------

def _groups(db):
    own_shared = models.StudentGroup(code="GR-PRC001", name="3B", owner_username="t1", description="Classe che ama il laboratorio",
                                     context_visible_to_students=True, is_active=True)
    own_private = models.StudentGroup(code="GR-PRC002", name="4A", owner_username="t1", description="Contesto NON condiviso",
                                      context_visible_to_students=False, is_active=True)
    co_taught = models.StudentGroup(code="GR-PRC003", name="5C", owner_username="t2", description="Classe in co-docenza",
                                    context_visible_to_students=True, is_active=True)
    foreign = models.StudentGroup(code="GR-PRC004", name="1Z", owner_username="t9", description="Classe ESTRANEA",
                                  context_visible_to_students=True, is_active=True)
    db.add_all([own_shared, own_private, co_taught, foreign])
    db.commit()
    db.add(models.GroupShare(group_id=co_taught.id, shared_with_username="t1", granted_by_username="t2"))
    db.commit()
    return own_shared, own_private, co_taught, foreign


def test_api_keeps_only_the_teachers_own_or_shared_classes():
    with artifact_session() as db:
        own_shared, own_private, co_taught, foreign = _groups(db)
        client = _app(db, TEACHER, practice_notebooks.router)
        created = client.post("/teacher/practice-notebooks", json={
            "title": "Giulia",
            "group_ids": [own_shared.id, foreign.id, co_taught.id, own_shared.id, 999999, "x"],
        }).json()
        assert created["group_ids"] == [own_shared.id, co_taught.id]
        updated = client.put(f"/teacher/practice-notebooks/{created['id']}", json={"group_ids": [own_private.id]}).json()
        assert updated["group_ids"] == [own_private.id]
        # Omesso: invariato.
        assert client.put(f"/teacher/practice-notebooks/{created['id']}", json={"title": "G."}).json()["group_ids"] == [own_private.id]


def test_practice_class_context_mirrors_what_a_real_student_receives():
    with artifact_session() as db:
        own_shared, own_private, co_taught, foreign = _groups(db)
        practice = _seed_teacher(db)
        practice.group_ids = [own_shared.id, own_private.id, co_taught.id, foreign.id]
        db.commit()
        request = ChatRequest(
            message=" turno ", questionnaire_type="QSA", language="it",
            notebook_context="practice", practice_notebook_id=practice.id,
        )
        system = _envelope(db, request, TEACHER, "QSA")
        assert "[CONTESTO CLASSE]" in system
        assert "Classe che ama il laboratorio" in system          # propria, condivisa con gli studenti
        assert "Classe in co-docenza" in system                   # condivisa con il docente
        assert "Contesto NON condiviso" not in system             # condivisione spenta
        assert "Classe ESTRANEA" not in system                    # mai salvabile, mai nel contesto
        assert system.index("[PROFILE]") < system.index("[CONTESTO CLASSE]")

        # Idea non riceve il contesto classe, come per uno studente vero.
        idea = ChatRequest(
            message=" turno ", questionnaire_type="IDEA", language="it",
            notebook_context="practice", practice_notebook_id=practice.id,
        )
        assert "[CONTESTO CLASSE]" not in _envelope(db, idea, TEACHER, "IDEA")

        # Condivisione revocata o classe disattivata: esce al turno dopo.
        db.query(models.GroupShare).filter(models.GroupShare.group_id == co_taught.id).delete()
        own_shared.is_active = False
        db.commit()
        system = _envelope(db, request, TEACHER, "QSA")
        assert "Classe in co-docenza" not in system
        assert "Classe che ama il laboratorio" not in system
        assert "[CONTESTO CLASSE]" not in system


def test_teacher_student_memberships_never_enter_the_simulation():
    """Le iscrizioni del docente come partecipante restano fuori dalla prova."""
    with artifact_session() as db:
        own_shared, _, _, foreign = _groups(db)
        db.add(models.GroupMembership(group_id=foreign.id, username="t1"))
        db.commit()
        practice = _seed_teacher(db)
        request = ChatRequest(
            message=" turno ", questionnaire_type="QSA", language="it",
            notebook_context="practice", practice_notebook_id=practice.id,
        )
        assert "Classe ESTRANEA" not in _envelope(db, request, TEACHER, "QSA")
