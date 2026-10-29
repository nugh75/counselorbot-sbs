"""Consiglio orientativo: documento interno della classe per studente.

Synthetic Postgres/SQLite via artifact_session. Solo la docenza con visibilità
sulla classe legge e salva; ogni altro docente o studente fuori classe resta
fuori. La bozza assistita è una proposta che non si salva da sola; il testo
salvato cresce di revisione e porta il timbro chi/quando.
"""
from unittest.mock import Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, database, models, orientation_recommendation
from backend.routes import orientation_recommendation as routes
from backend.tests.artifact_database import artifact_session

TEACHER = dict(username="teacher", name="Teacher One", authenticated=True, is_admin=False, groups=["docenti"])
NOT_TEACHER = dict(username="studente", name="Sudente Uno", authenticated=True, is_admin=False, groups=["studenti"])


def who(name, groups=("docenti",)):
    return dict(username=name, name=name, authenticated=True, is_admin=False, groups=list(groups))


@pytest.fixture
def api(monkeypatch):
    with artifact_session() as db:
        group = models.StudentGroup(name="Synthetic 3B", code="SYN-ORT-3B", owner_username="teacher")
        other = models.StudentGroup(name="Other class", code="SYN-ORT-OT", owner_username="colleague")
        db.add_all([group, other])
        db.flush()
        plan = models.AdministrationPlan(code="SYN-ORT-PLAN", title="Classe", instrument_code="QSAr", group_id=group.id)
        other_plan = models.AdministrationPlan(code="SYN-ORT-OTHER", title="Altra classe", instrument_code="QSA", group_id=other.id)
        db.add_all([plan, other_plan])
        db.flush()
        db.add_all([
            models.GroupMembership(group_id=group.id, username="alice"),
            models.GroupMembership(group_id=group.id, username="bob"),
            models.GroupMembership(group_id=other.id, username="carol"),
            models.QuestionnaireResult(session_id="s-alice", questionnaire_type="QSAr", username="alice",
                                       scores={"C1": 7}, administration_plan_id=plan.id),
            models.Log(session_id="s-alice", action="questionnaire_pdf_summary",
                       details={"summary": "Interesse per le scienze e buona organizzazione dello studio."}),
            models.QuestionnaireResult(session_id="s-private", questionnaire_type="PRIVATE_OTHER_CLASS", username="alice",
                                       scores={"private": 99}, administration_plan_id=other_plan.id),
            models.Log(session_id="s-private", action="questionnaire_pdf_summary",
                       details={"summary": "PRIVATE_OTHER_CLASS_SUMMARY"}),
            models.LearnerProfileRevision(username="alice", data={"goal": "PRIVATE_NOTEBOOK_MARKER"}, source="manual"),
        ])
        db.commit()
        identity = dict(TEACHER)
        app = FastAPI()
        app.include_router(routes.router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_plan_manager] = lambda: identity
        ai = Mock()
        ai.return_value.get_response.return_value = "Bozza proposta: metodo di studio regolare, forza nell'organizzazione."
        monkeypatch.setattr(orientation_recommendation, "AIService", ai)
        with TestClient(app) as client:
            yield client, db, identity, ai, group, other


def as_user(identity, user):
    identity.clear()
    identity.update(user)


def test_list_returns_every_member_with_empty_state(api):
    client, _db, identity, _ai, group, _other = api
    rows = client.get(f"/teacher/groups/{group.id}/orientation-recommendations").json()
    assert [row["username"] for row in rows] == ["alice", "bob"]
    assert rows[0]["display_name"] == "alice"
    assert rows[0]["status"] is None and rows[0]["revision"] == 0


def test_read_of_a_missing_document_answers_an_empty_draft(api):
    client, _db, identity, _ai, group, _other = api
    body = client.get(f"/teacher/groups/{group.id}/orientation-recommendations/alice").json()
    assert body["content"] == "" and body["status"] is None and body["revision"] == 0
    assert body["group_name"] == group.name
    # Non uno studente della classe: 404, mai 200.
    assert client.get(f"/teacher/groups/{group.id}/orientation-recommendations/carol").status_code == 404


def test_first_save_creates_the_document_and_grows_the_revision(api):
    client, db, identity, _ai, group, _other = api
    created = client.put(f"/teacher/groups/{group.id}/orientation-recommendations/alice", json={
        "content": "Attitudine operativa buona, lavorare sull'organizzazione.",
        "revision": 0, "ai_draft_used": True,
    })
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["revision"] == 1 and body["status"] == "draft"
    assert body["ai_draft_used"] is True and body["created_by"] == "teacher"
    assert body["group_name"] == group.name and body["display_name"] == "alice" and body["is_member"] is True
    rows = db.query(models.OrientationRecommendation).filter_by(group_id=group.id).all()
    assert len(rows) == 1 and rows[0].username == "alice"
    saved = client.get(f"/teacher/groups/{group.id}/orientation-recommendations/alice").json()
    assert saved["content"].startswith("Attitudine") and saved["revision"] == 1
    listed = client.get(f"/teacher/groups/{group.id}/orientation-recommendations").json()
    alice = next(row for row in listed if row["username"] == "alice")
    assert alice["content"] == "" and alice["status"] == "draft"


def test_stale_revision_conflicts_and_is_never_lost(api):
    client, db, identity, _ai, group, _other = api
    first = client.put(f"/teacher/groups/{group.id}/orientation-recommendations/alice", json={
        "content": "Versione prima docente", "revision": 0,
    }).json()
    # Una seconda schede arriva con la revisione di partenza: e' arretrata.
    conflict = client.put(f"/teacher/groups/{group.id}/orientation-recommendations/alice", json={
        "content": "SchedaArrivo arretrata", "revision": 0,
    })
    assert conflict.status_code == 409 and conflict.json()["detail"] == "orientation_conflict"
    ok = client.put(f"/teacher/groups/{group.id}/orientation-recommendations/alice", json={
        "content": "Versione seconda docente", "revision": first["revision"],
    })
    assert ok.json()["revision"] == first["revision"] + 1
    assert ok.json()["content"] == "Versione seconda docente"


def test_new_document_rejects_nonzero_revision(api):
    client, db, _identity, _ai, group, _other = api
    response = client.put(f"/teacher/groups/{group.id}/orientation-recommendations/alice", json={"content": "Testo", "revision": 9})
    assert response.status_code == 409
    assert db.query(models.OrientationRecommendation).filter_by(group_id=group.id).count() == 0


def test_former_member_document_is_read_only_and_exportable(api):
    client, db, _identity, _ai, group, _other = api
    url = f"/teacher/groups/{group.id}/orientation-recommendations/alice"
    assert client.put(url, json={"content": "Documento storico", "revision": 0}).status_code == 200
    db.query(models.GroupMembership).filter_by(group_id=group.id, username="alice").delete()
    db.commit()
    listed = client.get(f"/teacher/groups/{group.id}/orientation-recommendations").json()
    assert next(row for row in listed if row["username"] == "alice")["is_member"] is False
    read = client.get(url)
    assert read.status_code == 200 and read.json()["content"] == "Documento storico" and read.json()["is_member"] is False
    assert client.get(url + "/pdf").status_code == 200
    assert client.put(url, json={"content": "Modifica", "revision": 1}).status_code == 404
    assert client.post(url + "/ai-draft").status_code == 404


def test_status_moves_final_and_back_with_its_stamp(api):
    client, db, identity, _ai, group, _other = api
    client.put(f"/teacher/groups/{group.id}/orientation-recommendations/alice", json={
        "content": "Testo", "revision": 0,
    })
    final = client.put(f"/teacher/groups/{group.id}/orientation-recommendations/alice", json={
        "content": "Testo", "revision": 1, "status": "final",
    }).json()
    assert final["status"] == "final" and final["final_at"] and final["final_by"] == "teacher"
    back = client.put(f"/teacher/groups/{group.id}/orientation-recommendations/alice", json={
        "content": "Testo", "revision": 2, "status": "draft",
    }).json()
    assert back["status"] == "draft" and back["final_at"] is None and back["final_by"] is None
    assert client.put(f"/teacher/groups/{group.id}/orientation-recommendations/alice", json={
        "content": "Testo", "revision": 3, "status": "published",
    }).status_code == 422


def test_visibility_keeps_the_document_outside(api):
    client, _db, identity, _ai, group, _other = api
    as_user(identity, who("colleague"))
    assert client.get(f"/teacher/groups/{group.id}/orientation-recommendations").status_code == 404
    assert client.get(f"/teacher/groups/{group.id}/orientation-recommendations/alice").status_code == 404
    as_user(identity, NOT_TEACHER)
    assert client.get(f"/teacher/groups/{group.id}/orientation-recommendations").status_code == 404


def test_ai_draft_proposes_but_never_saves(api):
    client, db, identity, ai, group, _other = api
    answer = client.post(f"/teacher/groups/{group.id}/orientation-recommendations/alice/ai-draft")
    assert answer.status_code == 200, answer.text
    draft = answer.json()["draft"]
    assert "Bozza proposta" in draft
    assert ai.return_value.get_response.call_count == 1
    context = ai.return_value.privacy_context()
    assert context.principal.username == "teacher" and context.principal.role.value == "teacher"
    assert context.principal.origin == "tunnel" and context.subject == "alice" and context.purpose == "orientation"
    prompt, system = ai.return_value.get_response.call_args[0][:2]
    # Il materiale arriva dalle stesse fonti del pannello del docente.
    assert "RISULTATI QUESTIONARI" in prompt and "QSAr" in prompt
    assert "TACCUINO DELLO STUDENTE" not in prompt and "PRIVATE_NOTEBOOK_MARKER" not in prompt
    assert "PRIVATE_OTHER_CLASS" not in prompt and "private" not in prompt
    assert "PRIVATE_NOTEBOOK_MARKER" not in answer.text and "PRIVATE_OTHER_CLASS" not in answer.text
    assert db.query(models.OrientationRecommendation).filter_by(group_id=group.id).first() is None
    # Nessun testo dal modello: 502, il documento resta intatto.
    ai.return_value.get_response.return_value = ""
    assert client.post(f"/teacher/groups/{group.id}/orientation-recommendations/alice/ai-draft").status_code == 502


def test_ai_draft_never_reaches_a_non_member(api):
    client, _db, identity, _ai, group, _other = api
    assert client.post(f"/teacher/groups/{group.id}/orientation-recommendations/carol/ai-draft").status_code == 404


@pytest.mark.parametrize("username", ["alice", "bob"])
def test_ai_draft_reports_insufficient_information_without_descriptive_evidence(api, username):
    client, db, _identity, ai, group, _other = api
    # Alice has raw scores (and private material elsewhere); Bob has no results.
    db.query(models.Log).filter_by(session_id="s-alice").delete()
    db.commit()
    response = client.post(f"/teacher/groups/{group.id}/orientation-recommendations/{username}/ai-draft")
    assert response.status_code == 200, response.text
    draft = response.json()["draft"]
    assert "informazioni disponibili sono insufficienti" in draft
    assert "punti di forza" in draft and "possibili percorsi scolastici" in draft
    assert "interessi" in draft and "osservazioni dei docenti" in draft
    ai.assert_not_called()
    assert db.query(models.OrientationRecommendation).count() == 0


def test_ai_draft_with_evidence_requires_alternatives_linked_to_strengths_and_interests(api):
    client, db, _identity, ai, group, _other = api
    ai.return_value.get_response.return_value = (
        "L'interesse per le scienze potrebbe essere una risorsa nel liceo scientifico, "
        "che approfondisce matematica e scienze. La stessa curiosità potrebbe aiutare "
        "in un istituto tecnico a indirizzo chimico, con attività di laboratorio: "
        "potresti esplorare entrambe le possibilità."
    )
    response = client.post(f"/teacher/groups/{group.id}/orientation-recommendations/alice/ai-draft")
    assert response.status_code == 200, response.text
    assert "liceo scientifico" in response.json()["draft"]
    assert "istituto tecnico" in response.json()["draft"]
    prompt, system = ai.return_value.get_response.call_args[0][:2]
    assert "Interesse per le scienze" in prompt
    assert "Presenta almeno due possibilità alternative" in system
    assert "Per ciascuna spiega cosa si studia e quali punti di forza o interessi" in system
    assert "Non indicare mai una scuola da scegliere né un indirizzo univoco" in system
    assert "anche quando le informazioni sono sufficienti" in system
    assert "senza graduatorie, preferenze" in system
    assert "potresti valutare" in system and "potresti esplorare" in system
    assert "informazioni disponibili sono insufficienti" in system
    assert "Spiega quali elementi mancano e come raccoglierli" in system
    assert "se puoi motivarne una sola, dichiara il limite" in system
    assert "scuola e l'indirizzo consigliati" not in system
    assert db.query(models.OrientationRecommendation).count() == 0


@pytest.mark.parametrize("source", ["feedback", "goal", "progress_only"])
def test_ai_draft_distinguishes_descriptive_evidence_from_progress(api, source):
    client, db, _identity, ai, group, _other = api
    marker = "Interesse documentato per attività di laboratorio"
    assignment = models.TeacherAssignment(
        author_username="teacher", author_name="Teacher One", group_id=group.id,
        group_name=group.name, source_kind="goal", source_id=1,
        snapshot={"title": "Attività di classe"}, instructions="",
        request_id="orientation-evidence", request_hash="orientation-evidence",
    )
    db.add(assignment)
    db.flush()
    db.add(models.AssignmentWork(
        assignment_id=assignment.id, username="bob", submission={"text": "Consegna"},
        feedback=marker if source == "feedback" else "  ",
    ))
    if source == "goal":
        db.add(models.PersonalGoal(username="bob", title=marker, shared_group_id=group.id))
    db.commit()
    response = client.post(f"/teacher/groups/{group.id}/orientation-recommendations/bob/ai-draft")
    assert response.status_code == 200, response.text
    if source == "progress_only":
        assert "informazioni disponibili sono insufficienti" in response.json()["draft"]
        ai.assert_not_called()
    else:
        ai.return_value.get_response.assert_called_once()
        prompt = ai.return_value.get_response.call_args[0][0]
        assert marker in prompt
    assert db.query(models.OrientationRecommendation).count() == 0


def test_pdf_export_needs_a_saved_document(api):
    client, _db, identity, _ai, group, _other = api
    assert client.get(f"/teacher/groups/{group.id}/orientation-recommendations/alice/pdf").status_code == 404
    client.put(f"/teacher/groups/{group.id}/orientation-recommendations/alice", json={
        "content": "Documento da stampare", "revision": 0,
    })
    pdf = client.get(f"/teacher/groups/{group.id}/orientation-recommendations/alice/pdf")
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf"
    assert pdf.content[:4] == b"%PDF"
