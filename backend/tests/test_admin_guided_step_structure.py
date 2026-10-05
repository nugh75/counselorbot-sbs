"""Struttura degli step dalla mappa dei prompt: aggiunta, ordine, uso, eliminazione.

La mappa usa le API CRUD esistenti di `guided_steps` (POST, PATCH reorder,
DELETE) e un elenco con conteggi in sola lettura dell'uso degli studenti
(`GET /admin/guided-steps/{id}/usage`), mostrato prima di eliminare.
Gli step di prova vivono in uno strumento fittizio e vengono rimossi.

DB Postgres DEDICATO ai test (`counselorbot_test`), come gli altri.
"""
from backend import auth, chat_logic, models, prompt_revisions
from backend.tests.test_admin_prompt_map import _TestSession, _client, _map

INSTRUMENT = "PMTEST"


def _create(client, step_id, sort_order, prompt="Istruzione di prova"):
    response = client.post("/admin/guided-steps", json={
        "id": step_id, "sort_order": sort_order, "label": step_id.upper(), "prompt": prompt,
        "system_prompt_mode": "generic", "color_theme": "blue", "questionnaire_type": INSTRUMENT,
    })
    assert response.status_code == 200, response.text
    return response.json()


def _cleanup():
    db = _TestSession()
    try:
        ids = [row.id for row in db.query(models.GuidedStep).filter(models.GuidedStep.questionnaire_type == INSTRUMENT)]
        db.query(models.GuidedStep).filter(models.GuidedStep.questionnaire_type == INSTRUMENT).delete()
        db.query(models.Log).filter(models.Log.questionnaire_type == INSTRUMENT).delete()
        db.query(models.Log).filter(models.Log.session_id.like("pmtest-%")).delete(synchronize_session=False)
        db.query(models.GuidedStepQuestion).filter(models.GuidedStepQuestion.questionnaire_type == INSTRUMENT).delete()
        db.query(models.Config).filter(models.Config.key.like(f"%_{INSTRUMENT}_%")).delete(synchronize_session=False)
        db.query(models.PromptRevision).filter(
            models.PromptRevision.target_key.like("pmtest-%") | models.PromptRevision.target_key.like(f"%_{INSTRUMENT}_%")
        ).delete(synchronize_session=False)
        db.commit()
        return ids
    finally:
        db.close()


def _step_ids(client):
    return [step["id"] for step in _map(client, INSTRUMENT)["levels"]["steps"] if not step["fixed"]]


def test_usage_counts_student_sessions_and_messages_of_the_step_only():
    _cleanup()
    client = _client()
    try:
        _create(client, "pmtest-a", 1)
        _create(client, "pmtest-b", 2)
        db = _TestSession()
        try:
            def log(session_id, phase, instrument=INSTRUMENT):
                db.add(models.Log(session_id=session_id, action="chat_message", questionnaire_type=instrument, phase=phase, details={}))
            for _ in range(3):
                log("pmtest-s1", "pmtest-a")
            log("pmtest-s2", "pmtest-a")
            log("pmtest-s3", "pmtest-b")
            # Stesso id di fase in un altro strumento: non conta.
            log("pmtest-s4", "pmtest-a", instrument="QSA")
            for order in range(2):
                db.add(models.GuidedStepQuestion(questionnaire_type=INSTRUMENT, step_id="pmtest-a", language="it",
                                                 text=f"Domanda {order}", sort_order=order))
            db.commit()
        finally:
            db.close()

        response = client.get("/admin/guided-steps/pmtest-a/usage")
        assert response.status_code == 200, response.text
        assert response.json() == {
            "step_id": "pmtest-a", "questionnaire_type": INSTRUMENT,
            "sessions": 2, "messages": 4, "suggested_questions": 2,
            "session_details": [{"session_id": "pmtest-s1", "messages": 3}, {"session_id": "pmtest-s2", "messages": 1}],
        }
        assert client.get("/admin/guided-steps/pmtest-b/usage").json()["sessions"] == 1
        assert client.get("/admin/guided-steps/nope-missing/usage").status_code == 404
    finally:
        _cleanup()


def test_new_step_goes_where_the_reorder_puts_it_and_the_map_follows():
    _cleanup()
    client = _client()
    try:
        _create(client, "pmtest-a", 10)
        _create(client, "pmtest-b", 11)
        _create(client, "pmtest-c", 14)
        assert _step_ids(client) == ["pmtest-a", "pmtest-b", "pmtest-c"]
        # La mappa riusa gli slot esistenti e invia solo chi si sposta, in una richiesta.
        response = client.patch("/admin/guided-steps/reorder", json=[
            {"id": "pmtest-c", "sort_order": 10}, {"id": "pmtest-a", "sort_order": 11}, {"id": "pmtest-b", "sort_order": 14},
        ])
        assert response.status_code == 200, response.text
        assert _step_ids(client) == ["pmtest-c", "pmtest-a", "pmtest-b"]
        # La creazione registra la revisione del prompt, come dalla vista classica.
        db = _TestSession()
        try:
            revisions = db.query(models.PromptRevision).filter(
                models.PromptRevision.scope == prompt_revisions.SCOPE_GUIDED_STEP,
                models.PromptRevision.target_key == "pmtest-a",
            ).count()
        finally:
            db.close()
        assert revisions == 1
    finally:
        _cleanup()


def test_delete_removes_only_the_step_and_keeps_prompts_revisions_and_transcripts():
    _cleanup()
    client = _client()
    try:
        _create(client, "pmtest-a", 1)
        _create(client, "pmtest-b", 2, prompt="Da conservare nello storico")
        components_key = chat_logic.prompt_component_config_key(INSTRUMENT, "pmtest-b")
        saved = client.post("/admin/config", json={"key": components_key, "value": '{"step_prompt": true}'})
        assert saved.status_code == 200, saved.text
        db = _TestSession()
        try:
            db.add(models.Log(session_id="pmtest-s1", action="chat_message", questionnaire_type=INSTRUMENT, phase="pmtest-b", details={}))
            db.add(models.GuidedStepQuestion(questionnaire_type=INSTRUMENT, step_id="pmtest-b", language="it", text="Da conservare", sort_order=0))
            db.commit()
        finally:
            db.close()

        assert client.delete("/admin/guided-steps/pmtest-b").status_code == 200
        assert _step_ids(client) == ["pmtest-a"]
        db = _TestSession()
        try:
            assert db.query(models.Config).filter(models.Config.key == components_key).count() == 1
            assert db.query(models.PromptRevision).filter(
                models.PromptRevision.scope == prompt_revisions.SCOPE_GUIDED_STEP,
                models.PromptRevision.target_key == "pmtest-b",
                models.PromptRevision.value == "Da conservare nello storico",
            ).count() == 1
            assert db.query(models.Log).filter(models.Log.phase == "pmtest-b").count() == 1
            assert db.query(models.GuidedStepQuestion).filter(models.GuidedStepQuestion.step_id == "pmtest-b").count() == 1
        finally:
            db.close()
    finally:
        _cleanup()


def test_usage_without_logs_is_empty_and_student_access_is_denied():
    _cleanup()
    client = _client()
    try:
        _create(client, "pmtest-empty", 1)
        usage = client.get("/admin/guided-steps/pmtest-empty/usage").json()
        assert usage["session_details"] == []
        assert usage["sessions"] == usage["messages"] == usage["suggested_questions"] == 0

        from backend.main import app
        admin_override = app.dependency_overrides.pop(auth.get_current_active_admin)
        app.dependency_overrides[auth.get_current_user] = lambda: {"authenticated": True, "username": "fixture-student", "is_admin": False, "is_researcher": False}
        try:
            assert client.get("/admin/guided-steps/pmtest-empty/usage").status_code == 403
        finally:
            app.dependency_overrides.pop(auth.get_current_user)
            app.dependency_overrides[auth.get_current_active_admin] = admin_override
    finally:
        _cleanup()
