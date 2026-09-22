"""Taccuino del docente, contesto classe e sostituzione nel turno docenza.

Casi:
- API /user/teacher-notebook: gate ruolo, revisioni append-only, deduplica,
  storico, cancellazione.
- teacher_context: blocco taccuino docente, classi scelte (proprietario e
  condiviso, mai estraneo), contesto classe per lo studente solo con il flag
  attivo del docente.
- Envelope: in OBIETTIVO_DOCENZA il blocco [PROFILE] parla del docente e delle
  sue classi, non del taccuino/portfolio/obiettivi studente.
"""
import os

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "postgresql://counselorbot_user:counselorbot@postgres:5432/counselorbot")

from backend import auth, models
from backend.routes import teacher_profile
from backend.teacher_context import (
    class_context_for_student,
    teacher_groups_context,
    teacher_notebook_context,
)
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def notebook_app():
    with artifact_session() as db:
        identity = {"username": "t1", "groups": ["docenti"], "is_admin": False, "is_researcher": False, "authenticated": True}
        app = FastAPI()
        app.include_router(teacher_profile.router)
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        from backend.database import get_db
        app.dependency_overrides[get_db] = lambda: db
        with TestClient(app) as client:
            yield client, db, identity


def test_teacher_notebook_requires_plan_manager_role(notebook_app):
    client, db, identity = notebook_app
    identity["groups"] = ["studenti"]
    assert client.get('/user/teacher-notebook').status_code == 403
    identity["groups"] = ["docenti"]
    assert client.get('/user/teacher-notebook').status_code == 200
    assert client.get('/user/teacher-notebook').json() is None


def test_teacher_notebook_save_history_and_delete(notebook_app):
    client, db, _ = notebook_app
    first = client.post('/user/teacher-notebook', json={'subjects': 'Matematica', 'methodologies': 'Cooperative learning'}).json()
    assert first['data']['subjects'] == 'Matematica'
    # Identico: nessuna seconda revisione.
    client.post('/user/teacher-notebook', json={'subjects': 'Matematica', 'methodologies': 'Cooperative learning'})
    # Cambiamento: nuova revisione, la vecchia resta nello storico.
    client.post('/user/teacher-notebook', json={'subjects': 'Matematica e fisica'})
    history = client.get('/user/teacher-notebook/history').json()
    assert len(history) == 2
    assert history[0]['data']['subjects'] == 'Matematica e fisica'
    # Campi ignoti e lunghi: il taccuino resta conosciuto e limitato.
    assert client.post('/user/teacher-notebook', json={'subjects': 'x' * 700, 'invented': 'y'}).json()['data']['subjects'].endswith('x')
    deleted = client.delete('/user/teacher-notebook').json()
    assert deleted['deleted_revisions'] == 3
    assert client.get('/user/teacher-notebook').json() is None


def test_teacher_groups_context_owner_shared_and_stranger():
    with artifact_session() as db:
        owner = models.StudentGroup(code='GR-OWN000', name='3B', owner_username='t1', description='Classe di chimica', is_active=True)
        shared = models.StudentGroup(code='GR-SHR000', name='4A', owner_username='other', is_active=True)
        stranger = models.StudentGroup(code='GR-STR000', name='5C', owner_username='other', is_active=True)
        db.add_all([owner, shared, stranger])
        db.commit()
        db.add(models.GroupShare(group_id=shared.id, shared_with_username='t1', granted_by_username='other'))
        db.commit()
        block = teacher_groups_context(db, 't1', [owner.id, shared.id, stranger.id])
        assert '3B' in block and 'Classe di chimica' in block
        assert '4A' in block
        assert '5C' not in block
        # Condivisione revocata: la classe esce dal contesto al turno dopo.
        db.query(models.GroupShare).filter(models.GroupShare.shared_with_username == 't1').delete()
        db.commit()
        assert '4A' not in teacher_groups_context(db, 't1', [shared.id])
        # Nessuna selezione: nessun blocco, la chat resta senza contesto classe.
        assert teacher_groups_context(db, 't1', []) == ''
        assert teacher_groups_context(db, 't1', None) == ''


def test_class_context_for_student_needs_membership_and_flag():
    with artifact_session() as db:
        group = models.StudentGroup(code='GR-VIS001', name='3B', owner_username='t1',
                                    description='Programma di chimica organica',
                                    context_visible_to_students=True, is_active=True)
        hidden = models.StudentGroup(code='GR-HID001', name='4A', owner_username='t1',
                                     description='Non condivisa',
                                     context_visible_to_students=False, is_active=True)
        db.add_all([group, hidden])
        db.commit()
        # Senza iscrizione: niente, anche con il flag attivo.
        assert class_context_for_student(db, 's1') == ''
        db.add(models.GroupMembership(group_id=group.id, username='s1'))
        db.commit()
        block = class_context_for_student(db, 's1')
        assert '3B' in block and 'chimica organica' in block
        # Flag spento: la classe non entra.
        db.add(models.GroupMembership(group_id=hidden.id, username='s1'))
        db.commit()
        assert '4A' not in block
        # Le note su singoli studenti non entrano mai nel blocco classe.
        db.add(models.TeacherNote(group_id=group.id, username='s1', author_username='t1',
                                  kind='note', text='Nota privata sulla classe', visible_to_student=False))
        db.commit()
        assert 'Nota privata' not in class_context_for_student(db, 's1')


def test_docenza_envelope_replaces_student_profile():
    """Il turno docenza porta taccuino docente e classi scelte: il taccuino
    studente, il portfolio e gli obiettivi personali non entrano."""
    from backend.ai_service import AIService as _FakeAIWrapper  # noqa: F401  (schema import)
    from backend.api_models import ChatRequest
    from backend.chat_logic import build_context_envelope
    from backend.memory_service import session_memory

    with artifact_session() as db:
        db.add(models.TeacherProfileRevision(username='t1', data={'subjects': 'Chimica'}, source='manual'))
        db.add(models.LearnerProfileRevision(username='t1', data={'goal': 'Imparo da studente'}, source='manual'))
        group = models.StudentGroup(code='GR-ENV001', name='3B', owner_username='t1', description='Classe di chimica', is_active=True)
        db.add(group)
        db.commit()
        session_memory.clear('env-docenza')
        request = ChatRequest(
            message="Voglio un obiettivo per la mia classe",
            questionnaire_type="OBIETTIVO_DOCENZA",
            language="it",
            group_ids=[group.id],
        )
        from backend.ai_service import AIService

        class _StubAI(AIService):
            def __init__(self):
                self.config = {}
                self.disable_thinking = False
                self.embedding_model = "bge-m3"

            def get_response(self, *a, **k):
                return "RISPOSTA_TEST"

            def stream_response(self, *a, **k):
                yield {"type": "content", "text": "RISPOSTA_TEST"}

        system_final, _, _ = build_context_envelope(
            db, _StubAI(), request, 'env-docenza', {"username": "t1"},
            c_persona="", system_prompt="SYS",
            step_label="Step 1", questionnaire_type="OBIETTIVO_DOCENZA",
            effective_message="step", model_scores_context="",
            message_scores_context="", knowledge_context="KNOWLEDGE_BLOCK",
        )
        session_memory.clear('env-docenza')

        assert 'Chimica' in system_final            # taccuino del docente
        assert '3B' in system_final                 # classe scelta
        assert 'Taccuino dello studente' not in system_final
        assert 'Imparo da studente' not in system_final   # taccuino studente fuori
        assert 'Obiettivi personali' not in system_final  # obiettivi personali fuori
        # Un gruppo non suo non entra anche se passato a mano.
        other = models.StudentGroup(code='GR-ENV002', name='Di_altri', owner_username='other', is_active=True)
        db.add(other)
        db.commit()
        request2 = ChatRequest(
            message=" turno ",
            questionnaire_type="OBIETTIVO_DOCENZA",
            language="it",
            group_ids=[other.id],
        )
        session_memory.clear('env-docenza2')
        system2, _, _ = build_context_envelope(
            db, _StubAI(), request2, 'env-docenza2', {"username": "t1"},
            c_persona="", system_prompt="SYS",
            step_label="Step 1", questionnaire_type="OBIETTIVO_DOCENZA",
            effective_message="step", model_scores_context="",
            message_scores_context="", knowledge_context="",
        )
        session_memory.clear('env-docenza2')
        assert 'Di_altri' not in system2
