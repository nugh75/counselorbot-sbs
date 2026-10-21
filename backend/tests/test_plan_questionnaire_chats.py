"""#249: plan composition before compilations; exact personal-result sessions."""
import uuid
from datetime import datetime, timedelta, timezone
from importlib import import_module

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from backend import models
from backend.tests.test_it_administration import api as administration_api, create_plan
from backend.tests.test_results_deep_dive import STUDENT, admin_input, enter_scores, marker, save


# Re-export the shared PostgreSQL fixture for these API tests.
api = administration_api

def empty_path(client, group, **extra):
    return client.post(f"/teacher/groups/{group.id}/paths", json={"title": "Analyze QSA", **extra}).json()


def personal_path(client, group):
    response = save(client, empty_path(client, group), [{"step_type": "guided_results_chat", "tool_key": "QSA"}])
    assert response.status_code == 200, response.text
    path = response.json()
    response = client.post(f"/teacher/paths/{path['id']}/publish")
    assert response.status_code == 200, response.text
    return response.json()


def result(db, **extra):
    row = models.QuestionnaireResult(username="student", session_id=str(uuid.uuid4()),
        questionnaire_type="QSA", scores={"C1": 5, "C2": 7}, locale=None,
        submitted_at=datetime.now(timezone.utc) - timedelta(days=60))
    for key, value in extra.items():
        setattr(row, key, value)
    db.add(row)
    db.commit()
    return row


def endpoint(path):
    return f"/user/paths/{path['id']}/steps/{path['steps'][-1]['id']}/deep-dive"


def test_questionnaire_and_analysis_save_once_without_compilations(api):
    client, db, group, identity = api
    plan = create_plan(client, group)
    response = save(client, empty_path(client, group), [admin_input(plan),
        {"step_type": "guided_results_chat", "results_from": 0}])
    assert response.status_code == 200, response.text
    path = response.json()
    assert path["steps"][1]["results_step_id"] == path["steps"][0]["id"]
    assert db.query(models.QuestionnaireResult).count() == 0
    assert client.post(f"/teacher/paths/{path['id']}/publish").status_code == 200
    identity.update(STUDENT)
    options = client.get(endpoint(path)).json()
    assert options["ready"] is False and options["personal"] is False
    assert options["source_href"].endswith(f"/{path['steps'][0]['id']}")
    assert client.post(endpoint(path)).json()["detail"] == "results_step_incomplete"
    enter_scores(client, plan, path)
    started = client.post(endpoint(path))
    assert started.status_code == 200, started.text


@pytest.mark.parametrize("steps", [
    [{"step_type": "guided_results_chat", "results_from": 0}],
    [{"step_type": "tool", "tool_key": "timeline"}, {"step_type": "guided_results_chat", "results_from": 0}],
    [{"step_type": "guided_results_chat", "results_from": 9}],
    [{"step_type": "guided_results_chat", "tool_key": "QSA", "results_from": 0}],
    [{"step_type": "guided_results_chat"}],
    [{"step_type": "guided_results_chat", "tool_key": "SAVICKAS"}],
])
def test_bad_sources_leave_no_steps(api, steps):
    client, db, group, _identity = api
    path = empty_path(client, group)
    response = save(client, path, steps)
    assert response.status_code == 422, response.text
    assert db.query(models.ClassPathStep).filter_by(path_id=path["id"]).count() == 0
    assert db.get(models.ClassPath, path["id"]).revision == path["revision"]


def test_duplicate_new_references_are_atomic(api):
    client, db, group, _identity = api
    plan = create_plan(client, group)
    path = empty_path(client, group)
    response = save(client, path, [admin_input(plan)] + [
        {"step_type": "guided_results_chat", "results_from": 0}] * 2)
    assert response.status_code == 422 and response.json()["detail"] == "duplicate_results_chat"
    assert db.query(models.ClassPathStep).filter_by(path_id=path["id"]).count() == 0


def test_personal_analysis_publishes_without_result_or_institute(api):
    client, db, group, identity = api
    group.institution_id = None
    db.commit()
    path = personal_path(client, group)
    step = path["steps"][0]
    assert step["results_step_id"] is None and step["tool_key"] == "QSA"
    assert step["target_summary"]["source"] == "personal"
    assert db.query(models.AdministrationPlan).count() == 0
    identity.update(STUDENT)
    options = client.get(endpoint(path)).json()
    assert options == {"personal": True, "ready": False, "source_href": "/?start=QSA", "results": [], "session": None}
    assert client.post(endpoint(path)).json()["detail"] == "results_selection_required"


def test_personal_choice_only_lists_own_valid_results_and_keeps_session(api):
    client, db, group, identity = api
    first, second = result(db), result(db)
    result(db, username="outsider")
    result(db, questionnaire_type="QSAr")
    result(db, scores={"C1": 5})
    result(db, scores={"C1": True, "C2": 7})
    path = personal_path(client, group)
    identity.update(STUDENT)
    options = client.get(endpoint(path)).json()
    assert {row["id"] for row in options["results"]} == {first.id, second.id}
    assert all(row["locale"] == "" for row in options["results"])
    assert client.post(endpoint(path)).status_code == 409  # Even two results require an explicit choice.
    started = client.post(endpoint(path), json={"result_id": first.id})
    assert started.status_code == 200, started.text
    session = started.json()
    assert session["result"]["id"] == first.id
    assert client.post(endpoint(path)).json() == session
    assert client.post(endpoint(path), json={"result_id": first.id}).json() == session
    assert client.get(endpoint(path)).json()["session"] == session
    conflict = client.post(endpoint(path), json={"result_id": second.id})
    assert conflict.status_code == 409 and conflict.json()["detail"] == "results_chat_result_conflict"
    assert db.query(models.ClassPathDeepDiveSession).count() == 1
    marker(db, first.session_id)  # Earlier, independent analysis is never this step's evidence.
    assert client.get("/user/paths").json()[0]["done"] == 0
    marker(db, session["session_id"])
    assert client.get("/user/paths").json()[0]["done"] == 1
    first.scores = {"legacy": 5}
    db.commit()
    assert client.get("/user/paths").json()[0]["done"] == 0
    assert client.get(endpoint(path)).status_code == 409
    assert client.post(endpoint(path)).status_code == 422


@pytest.mark.parametrize("variant", ["foreign", "instrument", "scores", "missing"])
def test_personal_choice_rejects_invalid_results_without_binding(api, variant):
    client, db, group, identity = api
    row = result(db, **({"username": "outsider"} if variant == "foreign" else
                       {"questionnaire_type": "QSAr"} if variant == "instrument" else
                       {"scores": {"C1": 10, "C2": 7}} if variant == "scores" else {}))
    path = personal_path(client, group)
    identity.update(STUDENT)
    response = client.post(endpoint(path), json={"result_id": 999999 if variant == "missing" else row.id})
    assert response.status_code == 422, response.text
    assert db.query(models.ClassPathDeepDiveSession).count() == 0


def test_personal_access_and_activated_target_are_checked(api):
    client, db, group, identity = api
    path = personal_path(client, group)
    db.add(models.Instrument(code="QAP", is_active=True, tool_category="assessment"))
    db.commit()
    response = save(client, path, [{"id": path["steps"][0]["id"], "step_type": "guided_results_chat", "tool_key": "QAP"}])
    assert response.status_code == 409
    for username in ("outsider", "teacher"):
        identity.update(STUDENT, username=username)
        assert client.get(endpoint(path)).status_code == 403
        assert client.post(endpoint(path), json={"result_id": 1}).status_code == 403
    identity.update(STUDENT)
    group.is_active = False
    db.commit()
    assert client.get(endpoint(path)).status_code == 403


def test_personal_results_constraint_migration_is_replay_safe(api):
    _client, db, _group, _identity = api
    old = import_module("backend.migrations.20261010_guided_chat_steps")
    migration = import_module("backend.migrations.20261021_personal_results_chats")
    # Reuse the rolled-back test connection: nothing reaches production or another schema.
    from contextlib import contextmanager
    class TestEngine:
        dialect = db.bind.dialect
        @contextmanager
        def begin(self):
            yield db.connection()
    db.execute(text("ALTER TABLE class_path_steps DROP CONSTRAINT class_path_step_target"))
    db.execute(text("ALTER TABLE class_path_steps ADD CONSTRAINT class_path_step_target CHECK (" + old.GUIDED_CHAT_STEP_TARGET_CHECK + ")"))
    plan = create_plan(_client, _group)
    path = empty_path(_client, _group)
    saved = save(_client, path, [admin_input(plan), {"step_type": "guided_results_chat", "results_from": 0}]).json()
    ids_before = [row["id"] for row in saved["steps"]]
    migration.migrate(TestEngine())
    migration.migrate(TestEngine())
    assert [row.id for row in db.query(models.ClassPathStep).filter_by(path_id=path["id"]).order_by(models.ClassPathStep.position)] == ids_before
    definition = db.execute(text("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'class_path_steps'::regclass AND conname = 'class_path_step_target'")).scalar()
    assert "QSAr" in definition
    # Empty or mixed sources must fail in SQL too (NULL must not bypass the check).
    for target in ("NULL,NULL", "'timeline',NULL", f"'QSA',{ids_before[0]}"):
        with pytest.raises(IntegrityError), db.begin_nested():
            db.execute(text("INSERT INTO class_path_steps(path_id,position,step_type,tool_key,results_step_id) "
                            f"VALUES ({path['id']},1,'guided_results_chat',{target})"))


def test_strict_order_also_locks_personal_results(api):
    client, db, group, identity = api
    row = result(db)
    path = empty_path(client, group, mode='strict')
    response = save(client, path, [{'step_type': 'tool', 'tool_key': 'timeline'},
                                 {'step_type': 'guided_results_chat', 'tool_key': 'QSA'}], mode='strict')
    assert response.status_code == 200, response.text
    path = response.json()
    assert client.post(f"/teacher/paths/{path['id']}/publish").status_code == 200
    identity.update(STUDENT)
    for response in (client.get(endpoint(path)), client.post(endpoint(path), json={'result_id': row.id})):
        assert response.status_code == 409 and response.json()['detail'] == 'class_path_step_locked'
    assert db.query(models.ClassPathDeepDiveSession).count() == 0
