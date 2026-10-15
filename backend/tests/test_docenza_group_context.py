"""Contesto classe della chat OBIETTIVO_DOCENZA: selezione, sessione, confini.

Contratto (vedi docs/operations/docenza-group-context.md):
- group_ids viaggia a ogni turno e viene salvato nello snapshot congelato
  della sessione; alla ripresa torna quello della sessione, mai la preferenza
  del browser o di un'altra chat.
- Ogni turno riverifica l'accesso: solo classi attive proprie o condivise
  (anche per l'amministratore), revoca e disattivazione escono subito.
- Le classi entrano solo con il taccuino docente (default della docenza);
  student/none/practice e il componente "profile" spento le escludono.
- L'elenco selezionabile per la chat (`/admin/groups?own=true`) coincide con
  le classi che il builder accetta, senza allargare permessi.
- Le note individuali (TeacherNote) non entrano mai.
"""
import os

from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "postgresql://counselorbot_user:counselorbot@postgres:5432/counselorbot")

from backend import auth, models
from backend.api_models import ChatRequest
from backend.chat_logic import build_context_envelope
from backend.memory_service import session_memory
from backend.routes import frozen_sessions, groups
from backend.teacher_context import teacher_groups_context
from backend.tests.artifact_database import artifact_session

TEACHER = {"username": "t1", "groups": ["docenti"], "is_admin": False, "is_researcher": False, "authenticated": True}
ADMIN = {"username": "adm", "groups": [], "is_admin": True, "is_researcher": False, "authenticated": True}


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
    from backend.database import get_db
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def _envelope(db, identity, *, group_ids=None, notebook_context=None, practice_notebook_id=None,
              questionnaire_type="OBIETTIVO_DOCENZA", component_flags=None):
    request = ChatRequest(
        message=" turno ", questionnaire_type=questionnaire_type, language="it",
        group_ids=group_ids, notebook_context=notebook_context, practice_notebook_id=practice_notebook_id,
    )
    session_id = f"docenza-groups-{identity['username']}-{notebook_context}"
    session_memory.clear(session_id)
    system_final, _, _ = build_context_envelope(
        db, _StubAI(), request, session_id, identity,
        c_persona="", system_prompt="SYS",
        step_label="Step 1", questionnaire_type=questionnaire_type,
        effective_message="step", model_scores_context="",
        message_scores_context="", knowledge_context="",
        component_flags=component_flags,
    )
    session_memory.clear(session_id)
    return system_final


def _classes(db, username="t1"):
    """Classe propria, condivisa, estranea, propria disattivata."""
    own = models.StudentGroup(code="GR-DGC001", name="3B", owner_username=username,
                              description="Laboratorio sui grafici PROPRIA", is_active=True)
    shared = models.StudentGroup(code="GR-DGC002", name="4A", owner_username="other",
                                 description="Classe CONDIVISA", is_active=True)
    foreign = models.StudentGroup(code="GR-DGC003", name="5C", owner_username="other",
                                  description="Classe ESTRANEA", is_active=True)
    inactive = models.StudentGroup(code="GR-DGC004", name="1D", owner_username=username,
                                   description="Classe DISATTIVATA", is_active=False)
    db.add_all([own, shared, foreign, inactive])
    db.commit()
    db.add(models.GroupShare(group_id=shared.id, shared_with_username=username.lower(), granted_by_username="other"))
    db.commit()
    return own, shared, foreign, inactive


# --- Snapshot della sessione ------------------------------------------------

def test_frozen_session_keeps_its_own_class_selection():
    with artifact_session() as db:
        client = _app(db, TEACHER, frozen_sessions.router)
        base = {"questionnaire_type": "OBIETTIVO_DOCENZA", "messages": [], "current_phase": "obiettivo-docenza-partenza"}
        assert client.post("/session/freeze", json={**base, "session_id": "doc-a", "group_ids": [3, 3, "x", -1, 5]}).status_code == 200
        assert client.post("/session/freeze", json={**base, "session_id": "doc-b", "group_ids": [7]}).status_code == 200
        assert client.post("/session/freeze", json={**base, "session_id": "doc-c"}).status_code == 200
        # Puliti (interi positivi, senza doppioni) e separati per sessione.
        assert client.get("/session/frozen/doc-a").json()["group_ids"] == [3, 5]
        assert client.get("/session/frozen/doc-b").json()["group_ids"] == [7]
        # Nessuna selezione salvata: lista vuota, non la selezione di un'altra chat.
        assert client.get("/session/frozen/doc-c").json()["group_ids"] == []
        # Una selezione svuotata resta vuota alla ripresa.
        assert client.post("/session/freeze", json={**base, "session_id": "doc-a", "group_ids": []}).status_code == 200
        assert client.get("/session/frozen/doc-a").json()["group_ids"] == []


def test_snapshot_written_before_this_field_resumes_without_classes():
    with artifact_session() as db:
        db.add(models.FrozenSession(username="t1", session_id="doc-old", questionnaire_type="OBIETTIVO_DOCENZA",
                                    data={"messages": [], "current_phase": "obiettivo-docenza-partenza"}))
        db.commit()
        client = _app(db, TEACHER, frozen_sessions.router)
        assert client.get("/session/frozen/doc-old").json()["group_ids"] == []


def test_saved_selection_is_reauthorized_on_every_resumed_turn():
    """Gli id salvati non sono un permesso: revoca e disattivazione valgono subito."""
    with artifact_session() as db:
        db.add(models.TeacherProfileRevision(username="t1", data={"subjects": "Matematica"}, source="manual"))
        own, shared, foreign, inactive = _classes(db)
        saved = [own.id, shared.id, foreign.id, inactive.id, 999999]
        system = _envelope(db, TEACHER, group_ids=saved)
        assert "PROPRIA" in system and "CONDIVISA" in system
        assert "ESTRANEA" not in system and "DISATTIVATA" not in system
        db.query(models.GroupShare).filter(models.GroupShare.group_id == shared.id).delete()
        own.is_active = False
        db.commit()
        system = _envelope(db, TEACHER, group_ids=saved)
        assert "CONDIVISA" not in system and "PROPRIA" not in system
        assert "Matematica" in system  # il taccuino docente resta


# --- Taccuino e componente profilo -------------------------------------------

def test_default_and_teacher_notebook_bring_the_classes_other_choices_do_not():
    with artifact_session() as db:
        db.add(models.TeacherProfileRevision(username="t1", data={"subjects": "Matematica"}, source="manual"))
        practice = models.TeacherPracticeNotebook(owner_username="t1", title="Giulia", data={"main_difficulty": "SIMULATA"})
        db.add(practice)
        own, shared, _, _ = _classes(db)
        ids = [own.id, shared.id]
        # Default della docenza = taccuino docente: le classi entrano (anche
        # per chi non sceglie nulla nel popover Opzioni).
        for choice in (None, "teacher"):
            system = _envelope(db, TEACHER, group_ids=ids, notebook_context=choice)
            assert "PROPRIA" in system and "CONDIVISA" in system, choice
        for choice, extra in (("student", {}), ("none", {}), ("practice", {"practice_notebook_id": practice.id})):
            system = _envelope(db, TEACHER, group_ids=ids, notebook_context=choice, **extra)
            assert "PROPRIA" not in system and "CONDIVISA" not in system, choice


def test_profile_component_off_excludes_teacher_notebook_classes_and_practice():
    with artifact_session() as db:
        db.add(models.TeacherProfileRevision(username="t1", data={"subjects": "Matematica"}, source="manual"))
        db.add(models.LearnerProfileRevision(username="t1", data={"goal": "Obiettivo PERSONALE"}, source="manual"))
        practice = models.TeacherPracticeNotebook(owner_username="t1", title="Giulia", data={"main_difficulty": "SIMULATA"})
        db.add(practice)
        own, shared, _, _ = _classes(db)
        off = {"profile": False}
        for choice in (None, "teacher"):
            system = _envelope(db, TEACHER, group_ids=[own.id, shared.id], notebook_context=choice, component_flags=off)
            assert "Matematica" not in system, choice
            assert "PROPRIA" not in system and "CONDIVISA" not in system, choice
            assert "[PROFILE]" not in system, choice
        system = _envelope(db, TEACHER, notebook_context="practice", practice_notebook_id=practice.id,
                           questionnaire_type="QSA", component_flags=off)
        assert "SIMULATA" not in system
        assert "[SIMULATION]" in system  # l'avviso di simulazione resta
        system = _envelope(db, TEACHER, notebook_context="student", questionnaire_type="QSA", component_flags=off)
        assert "Obiettivo PERSONALE" not in system
        # Con il profilo acceso tutto torna come prima.
        system = _envelope(db, TEACHER, group_ids=[own.id], notebook_context="teacher")
        assert "Matematica" in system and "PROPRIA" in system


def test_individual_teacher_notes_never_enter_the_docenza_context():
    with artifact_session() as db:
        own, _, _, _ = _classes(db)
        db.add(models.TeacherNote(group_id=own.id, username="s1", author_username="t1",
                                  kind="note", text="Nota INDIVIDUALE riservata", visible_to_student=False))
        db.commit()
        system = _envelope(db, TEACHER, group_ids=[own.id])
        assert "PROPRIA" in system
        assert "INDIVIDUALE" not in system


# --- Classi selezionabili = classi accettate ---------------------------------

def test_co_teacher_share_matches_regardless_of_username_case():
    """Le condivisioni sono salvate in minuscolo, come le legge l'elenco."""
    with artifact_session() as db:
        own, shared, _, _ = _classes(db, username="T1.Rossi")
        block = teacher_groups_context(db, "T1.Rossi", [own.id, shared.id])
        assert "PROPRIA" in block and "CONDIVISA" in block


def test_admin_chat_list_offers_only_classes_the_context_accepts():
    with artifact_session() as db:
        own, shared, foreign, inactive = _classes(db, username="adm")
        client = _app(db, ADMIN, groups.router)
        # Gestione: l'amministratore continua a vedere tutte le classi.
        everything = {row["id"] for row in client.get("/admin/groups").json()}
        assert {own.id, shared.id, foreign.id, inactive.id} <= everything
        # Chat docenza: solo proprie o condivise, come il builder.
        chat = client.get("/admin/groups", params={"own": "true"}).json()
        assert {row["id"] for row in chat} == {own.id, shared.id, inactive.id}
        active_ids = [row["id"] for row in chat if row["is_active"]]
        block = teacher_groups_context(db, "adm", active_ids)
        assert "PROPRIA" in block and "CONDIVISA" in block
        # Una classe altrui passata a mano resta fuori anche per l'admin.
        assert teacher_groups_context(db, "adm", [foreign.id]) == ""


def test_teacher_list_is_unchanged_by_the_own_filter():
    with artifact_session() as db:
        own, shared, foreign, inactive = _classes(db)
        client = _app(db, TEACHER, groups.router)
        plain = sorted(row["id"] for row in client.get("/admin/groups").json())
        scoped = sorted(row["id"] for row in client.get("/admin/groups", params={"own": "true"}).json())
        assert plain == scoped == sorted([own.id, shared.id, inactive.id])
