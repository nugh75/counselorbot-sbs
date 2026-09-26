"""Scelta del taccuino nel contesto della chat guidata (notebook_context).

Il docente sceglie dal popover Opzioni quale taccuino passa al contesto
(studente, docente, nessuno) per ogni strumento. Il server:
- applica i default storicizzati (docenza -> taccuino docente, resto -> studente);
- onora la richiesta SOLO per chi ha davvero il ruolo docente;
- svuota il blocco [PROFILE] con "nessuno", restando un envelope valido;
- non fa uscire le classi dalla chat docenza.
"""
import os

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql://counselorbot_user:counselorbot@postgres:5432/counselorbot")

from backend import models
from backend.api_models import ChatRequest
from backend.chat_logic import build_context_envelope
from backend.memory_service import session_memory
from backend.tests.artifact_database import artifact_session


class _StubAI:
    def __init__(self):
        self.config = {}
        self.disable_thinking = False
        self.embedding_model = "bge-m3"

    def get_response(self, *a, **k):
        return "RISPOSTA_TEST"

    def stream_response(self, *a, **k):
        yield {"type": "content", "text": "RISPOSTA_TEST"}


def _envelope(db, request, identity, questionnaire_type):
    session_id = f"nb-{questionnaire_type}-{identity.get('username', 'anon')}-{request.notebook_context}"
    session_memory.clear(session_id)
    system_final, _, _ = build_context_envelope(
        db, _StubAI(), request, session_id, identity,
        c_persona="", system_prompt="SYS",
        step_label="Step 1", questionnaire_type=questionnaire_type,
        effective_message="step", model_scores_context="",
        message_scores_context="", knowledge_context="KNOWLEDGE_BLOCK",
    )
    session_memory.clear(session_id)
    return system_final


TEACHER_IDENTITY = {"username": "t1", "groups": ["docenti"], "is_admin": False, "is_researcher": False}
STUDENT_IDENTITY = {"username": "t1", "groups": ["studenti"], "is_admin": False, "is_researcher": False}


def test_defaults_unchanged_for_every_non_docenza_instrument():
    """13 strumenti senza regole speciali: taccuino studente, come prima."""
    instruments = [
        "QSA", "QSAr", "ZTPI", "SAVICKAS", "QPCS", "QPCC", "QAP",
        "EVENTO_STUDIO", "EVENTO_PROFESSIONALE", "OBIETTIVO_STUDIO", "IDEA",
    ]
    with artifact_session() as db:
        db.add(models.LearnerProfileRevision(username='t1', data={'goal': 'Imparo da studente'}, source='manual'))
        db.commit()
        for instrument in instruments:
            request = ChatRequest(message=" turno ", questionnaire_type=instrument, language="it")
            system = _envelope(db, request, TEACHER_IDENTITY, instrument)
            assert 'Imparo da studente' in system, instrument
            assert 'Taccuino del docente' not in system, instrument


def test_teacher_request_only_honored_for_teacher_role():
    """La richiesta 'teacher' vale solo per i docenti; uno studente resta sul suo taccuino."""
    with artifact_session() as db:
        db.add(models.TeacherProfileRevision(username='t1', data={'subjects': 'Chimica'}, source='manual'))
        db.add(models.LearnerProfileRevision(username='t1', data={'goal': 'Imparo da studente'}, source='manual'))
        db.commit()
        request = ChatRequest(
            message=" turno ", questionnaire_type="OBIETTIVO_STUDIO",
            language="it", notebook_context="teacher",
        )
        system = _envelope(db, request, TEACHER_IDENTITY, "OBIETTIVO_STUDIO")
        assert 'Chimica' in system                      # taccuino docente onorato
        assert 'Imparo da studente' not in system       # taccuino studente fuori
        # Stessa richiesta da un gruppo non docente: default studente.
        system_student = _envelope(db, request, STUDENT_IDENTITY, "OBIETTIVO_STUDIO")
        assert 'Chimica' not in system_student
        assert 'Imparo da studente' in system_student
        # Valore ignoto (bypassando la validazione del client): default.
        junk = ChatRequest.model_construct(
            message=" turno ", questionnaire_type="QSA", language="it",
            notebook_context="pluto", group_ids=None,
        )
        system_junk = _envelope(db, junk, TEACHER_IDENTITY, "QSA")
        assert 'Imparo da studente' in system_junk


def test_none_empties_profile_block_but_envelope_stays_valid():
    with artifact_session() as db:
        db.add(models.TeacherProfileRevision(username='t1', data={'subjects': 'Chimica'}, source='manual'))
        db.add(models.LearnerProfileRevision(username='t1', data={'goal': 'Imparo da studente'}, source='manual'))
        db.commit()
        request = ChatRequest(
            message=" turno ", questionnaire_type="EVENTO_STUDIO",
            language="it", notebook_context="none",
        )
        system = _envelope(db, request, TEACHER_IDENTITY, "EVENTO_STUDIO")
        assert 'Imparo da studente' not in system       # taccuino studente fuori
        assert 'Chimica' not in system                  # taccuino docente fuori
        assert 'KNOWLEDGE_BLOCK' in system              # envelope valido


def test_student_choice_restores_student_notebook_on_docenza():
    """Su OBIETTIVO_DOCENZA la scelta esplicita 'student' rovescia il default."""
    with artifact_session() as db:
        db.add(models.TeacherProfileRevision(username='t1', data={'subjects': 'Chimica'}, source='manual'))
        db.add(models.LearnerProfileRevision(username='t1', data={'goal': 'Imparo da studente'}, source='manual'))
        db.commit()
        request = ChatRequest(
            message=" turno ", questionnaire_type="OBIETTIVO_DOCENZA",
            language="it", notebook_context="student",
        )
        system = _envelope(db, request, TEACHER_IDENTITY, "OBIETTIVO_DOCENZA")
        assert 'Imparo da studente' in system
        assert 'Chimica' not in system


def test_classes_stay_inside_docenza_chat():
    """Con taccuino docente su un altro strumento le classi scelte non entrano."""
    with artifact_session() as db:
        db.add(models.TeacherProfileRevision(username='t1', data={'subjects': 'Chimica'}, source='manual'))
        group = models.StudentGroup(code='GR-NBX001', name='3B', owner_username='t1', description='Classe di chimica', is_active=True)
        db.add(group)
        db.commit()
        request = ChatRequest(
            message=" turno ", questionnaire_type="OBIETTIVO_STUDIO",
            language="it", notebook_context="teacher", group_ids=[group.id],
        )
        system = _envelope(db, request, TEACHER_IDENTITY, "OBIETTIVO_STUDIO")
        assert 'Chimica' in system          # il taccuino docente si
        assert '3B' not in system           # le classi no: restano alla docenza


def test_frozen_session_persists_notebook_context():
    """Il freeze salva notebook_context e i valori ignoti diventano None."""
    with artifact_session() as db:
        from fastapi.testclient import TestClient
        from backend import auth, schemas
        from backend.routes import frozen_sessions
        identity = {"username": "t1", "groups": ["docenti"], "is_admin": False, "is_researcher": False, "authenticated": True}
        app = __import__("fastapi").FastAPI()
        app.include_router(frozen_sessions.router)
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        from backend.database import get_db
        app.dependency_overrides[get_db] = lambda: db
        with TestClient(app) as client:
            payload = {
                "session_id": "nb-freeze-1",
                "questionnaire_type": "OBIETTIVO_STUDIO",
                "messages": [],
                "current_phase": "intro",
                "notebook_context": "teacher",
            }
            assert client.post('/session/freeze', json=payload).status_code == 200
            detail = client.get('/session/frozen/nb-freeze-1').json()
            assert detail['notebook_context'] == 'teacher'
            payload['notebook_context'] = 'pluto'
            assert client.post('/session/freeze', json=payload).status_code == 200
            # Il valore ignoto diventa None e con exclude_none esce dalla risposta.
            assert client.get('/session/frozen/nb-freeze-1').json().get('notebook_context') is None
