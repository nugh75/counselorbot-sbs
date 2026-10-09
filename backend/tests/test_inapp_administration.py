"""In-app (non-Italian) typed administrations on synthetic PostgreSQL only (#151)."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from backend import auth, content_version_service, database, models
from backend.routes import survey
from backend.tests.test_it_administration import api  # noqa: F401  (shared fixture)

ANSWERS = {"1": 4, "2": 4, "3": 1, "4": 2}


@pytest.fixture
def inapp(api):  # noqa: F811
    client, db, group, identity = api
    db.add_all(
        [
            models.QuestionnaireItem(instrument_code="QSA", item_number=number, factor_code=factor,
                                     text_en=f"Synthetic item {number}")
            for number, factor in ((1, "C1"), (2, "C1"), (3, "C2"), (4, "C2"))
        ]
    )
    for locale in ("it", "en"):
        content_version_service.upsert_version(db, "instrument", "QSA", locale, status="pilot")
    for locale in ("es", "fr", "de", "sv"):
        content_version_service.upsert_version(db, "instrument", "QSA", locale, status="draft")
    db.commit()
    client.app.include_router(survey.router)
    client.app.dependency_overrides[auth.get_identity_view_as] = lambda: identity
    return client, db, group, identity


def create_plan(client, group, locale="en"):
    return client.post(
        f"/teacher/groups/{group.id}/administrations",
        json={"title": "In-app questionnaire", "instrument_code": "QSA", "locale": locale, "status": "active"},
    )


def published_path(client, group, mode="recommended"):
    response = create_plan(client, group)
    assert response.status_code == 200, response.text
    plan = response.json()
    path = client.post(f"/teacher/groups/{group.id}/paths", json={"title": "In-app path", "mode": mode}).json()
    response = client.put(
        f"/teacher/paths/{path['id']}",
        json={"revision": path["revision"], "title": path["title"], "mode": mode,
              "steps": [{"step_type": "questionnaire_administration", "administration_plan_id": plan["id"]}]},
    )
    assert response.status_code == 200, response.text
    response = client.post(f"/teacher/paths/{path['id']}/publish")
    assert response.status_code == 200, response.text
    path = response.json()
    return plan, path, path["steps"][0]


def student_grant(client, identity, plan):
    identity.update(username="student", groups=[])
    response = client.post(f"/user/administrations/{plan['id']}/verify-institution",
                           json={"institution_code": "SYN-150", "password": "Invented-150"})
    assert response.status_code == 200, response.text
    return response.json()["grant"]


def score(client, path, step, grant, session="inapp-session", answers=ANSWERS):
    return client.post(f"/user/paths/{path['id']}/steps/{step['id']}/score",
                       json={"session_id": session, "answers": answers, "institution_grant": grant})


def enter(client, path, step, grant, result_id, session="inapp-session", request="inapp-request"):
    return client.post(f"/user/paths/{path['id']}/steps/{step['id']}/guided-entry",
                       json={"session_id": session, "request_id": request, "result_id": result_id,
                             "institution_grant": grant})


def test_only_available_locales_create_in_app_administrations(inapp):
    client, db, group, identity = inapp
    created = create_plan(client, group, "en")
    assert created.status_code == 200, created.text
    assert created.json()["delivery_mode"] == "in_app"
    refused = create_plan(client, group, "fr")
    assert refused.status_code == 422
    assert refused.json()["detail"] == "administration_locale_unavailable"
    assert db.query(models.AdministrationPlan).count() == 1


def test_launch_describes_in_app_runner_without_external_link(inapp):
    client, db, group, identity = inapp
    plan, path, step = published_path(client, group)
    assert step["target_summary"]["delivery_mode"] == "in_app"
    identity.update(username="student", groups=[])
    launch = client.post(f"/user/paths/{path['id']}/steps/{step['id']}/launch")
    assert launch.status_code == 200, launch.text
    body = launch.json()
    assert (body["delivery_mode"], body["locale"], body["external_href"]) == ("in_app", "en", None)
    assert "password" not in str(body)


def test_runner_result_alone_stays_undone_then_guided_entry_completes_without_duplicates(inapp):
    client, db, group, identity = inapp
    plan, path, step = published_path(client, group)
    grant = student_grant(client, identity, plan)
    response = score(client, path, step, grant)
    assert response.status_code == 200, response.text
    saved = response.json()
    result = saved["result"]
    assert result["scores"] == {"C1": 9, "C2": 2}
    assert (result["source"], result["capture_method"], result["source_system"], result["locale"]) == (
        "in-app", "item_runner", "counselorbot", "en")
    assert result["administration_plan_id"] == plan["id"]
    assert saved["profile"]["locale"] == "en"
    assert client.get("/user/paths").json()[0]["done"] == 0
    # Retrying the same submission returns the same row instead of a duplicate.
    assert score(client, path, step, grant).json()["result"]["id"] == result["id"]
    assert score(client, path, step, grant, answers={**ANSWERS, "1": 1}).status_code == 409
    ack = enter(client, path, step, grant, result["id"])
    assert ack.status_code == 200, ack.text
    assert ack.json()["session_id"] == result["session_id"]
    assert ack.json()["result"]["id"] == result["id"]
    assert enter(client, path, step, grant, result["id"]).json() == ack.json()
    progress = client.get("/user/paths").json()[0]
    assert progress["done"] == 1
    assert progress["steps"][0]["completion_kind"] == "guided_entry"
    assert db.query(models.QuestionnaireResult).count() == 1
    assert db.query(models.QuestionnaireGuidedEntry).count() == 1
    history = client.get("/user/questionnaire-results").json()
    assert [(row["source"], row["capture_method"]) for row in history] == [("in-app", "item_runner")]
    identity.update(username="teacher", groups=["docenti"])
    research = client.get("/admin/administration-plans").json()[0]
    assert research["responses_count"] == 1
    assert "grant" not in str(research) and "Invented-150" not in str(research)


def test_in_app_plan_refuses_retyped_scores(inapp):
    client, db, group, identity = inapp
    plan, path, step = published_path(client, group)
    grant = student_grant(client, identity, plan)
    response = client.post(f"/user/paths/{path['id']}/steps/{step['id']}/guided-entry",
                           json={"session_id": "typed", "request_id": "typed", "scores": {"C1": 5, "C2": 7},
                                 "institution_grant": grant})
    assert response.status_code == 422
    assert response.json()["detail"] == "administration_result_required"
    assert db.query(models.QuestionnaireResult).count() == 0


def test_runner_session_cannot_be_borrowed_by_another_session(inapp):
    client, db, group, identity = inapp
    plan, path, step = published_path(client, group)
    grant = student_grant(client, identity, plan)
    result = score(client, path, step, grant).json()["result"]
    db.add(models.Log(session_id="inapp-session", username="student", action="chat_message"))
    db.commit()
    # Once chat has started elsewhere the runner session is no longer a fresh guided session.
    assert enter(client, path, step, grant, result["id"]).status_code == 409
    assert db.query(models.QuestionnaireGuidedEntry).count() == 0


@pytest.mark.parametrize("case", ["no-grant", "forged-grant", "non-member", "foreign-session", "missing-answer",
                                  "locale-withdrawn", "forged-origin"])
def test_invalid_runner_submissions_write_nothing(inapp, case):
    client, db, group, identity = inapp
    plan, path, step = published_path(client, group)
    grant = student_grant(client, identity, plan)
    payload = {"session_id": "inapp-session", "answers": ANSWERS, "institution_grant": grant}
    if case == "no-grant":
        payload.pop("institution_grant")
    if case == "forged-grant":
        payload["institution_grant"] = "forged"
    if case == "non-member":
        identity.update(username="outsider")
    if case == "foreign-session":
        db.add(models.QuestionnaireResult(session_id="inapp-session", username="other", questionnaire_type="QSA"))
        db.commit()
    if case == "missing-answer":
        payload["answers"] = {"1": 4}
    if case == "locale-withdrawn":
        content_version_service.upsert_version(db, "instrument", "QSA", "en", status="draft")
        db.commit()
    if case == "forged-origin":
        payload.update(source="imported", capture_method="csv_import")
    before = db.query(models.QuestionnaireResult).count()
    response = client.post(f"/user/paths/{path['id']}/steps/{step['id']}/score", json=payload)
    assert response.status_code in {403, 409, 422}, response.text
    if case == "locale-withdrawn":
        assert response.json()["detail"] == "administration_locale_unavailable"
    assert db.query(models.QuestionnaireResult).count() == before
    assert db.query(models.ValidationResponse).count() == 0


def test_strict_order_blocks_runner_before_predecessor(inapp):
    client, db, group, identity = inapp
    response = create_plan(client, group)
    plan = response.json()
    path = client.post(f"/teacher/groups/{group.id}/paths", json={"title": "Strict", "mode": "strict"}).json()
    path = client.put(f"/teacher/paths/{path['id']}", json={
        "revision": 1, "title": "Strict", "mode": "strict",
        "steps": [{"tool_key": "timeline"},
                  {"step_type": "questionnaire_administration", "administration_plan_id": plan["id"]}]}).json()
    path = client.post(f"/teacher/paths/{path['id']}/publish").json()
    grant = student_grant(client, identity, plan)
    assert score(client, path, path["steps"][1], grant).status_code == 409
    assert db.query(models.QuestionnaireResult).count() == 0


def test_confirmed_import_completes_in_app_step_without_chat_but_source_label_alone_does_not(inapp):
    client, db, group, identity = inapp
    plan, path, step = published_path(client, group)
    now = datetime.now(timezone.utc)

    def imported(session):
        row = models.QuestionnaireResult(
            session_id=session, username="student", questionnaire_type="QSA", administration_plan_id=plan["id"],
            scores={"C1": 5, "C2": 7}, source="imported", capture_method="csv_import",
            source_system="counselorbot", locale="en", submitted_at=now - timedelta(days=30))
        db.add(row)
        db.flush()
        return row

    imported("label-only")
    db.commit()
    identity.update(username="student", groups=[])
    assert client.get("/user/paths").json()[0]["done"] == 0
    result = imported("confirmed")
    confirmation = models.QuestionnaireImportConfirmation(
        result_id=result.id, administration_plan_id=plan["id"], username="student",
        batch_id="synthetic-batch", confirmed_by="teacher", confirmed_at=now)
    db.add(confirmation)
    db.flush()
    db.add(models.ClassPathStepEvidence(step_id=step["id"], username="student", kind="confirmed_import",
                                        result_id=result.id, import_confirmation_id=confirmation.id,
                                        recorded_at=now))
    db.commit()
    row = client.get("/user/paths").json()[0]
    assert row["done"] == 1
    assert row["steps"][0]["completion_kind"] == "confirmed_import"
    assert db.query(models.QuestionnaireGuidedEntry).count() == 0
    assert db.query(models.Log).count() == 0


def test_standalone_runner_records_provenance_and_rejects_forged_origin(inapp):
    client, db, group, identity = inapp
    identity.update(username="student", groups=[])
    response = client.post("/instruments/QSA/score", json={"session_id": "standalone", "locale": "en",
                                                           "answers": ANSWERS})
    assert response.status_code == 200, response.text
    row = db.query(models.QuestionnaireResult).filter_by(session_id="standalone").one()
    assert (row.source, row.capture_method, row.source_system, row.locale, row.administration_plan_id) == (
        "in-app", "item_runner", "counselorbot", "en", None)
    # A standalone runner submission is not an administration-step completion.
    assert db.query(models.ClassPathStepEvidence).count() == 0
    forged = client.post("/instruments/QSA/score", json={"session_id": "forged", "locale": "en",
                                                         "answers": ANSWERS, "source": "imported"})
    assert forged.status_code == 422
    forged = client.post("/questionnaire-result", json={"session_id": "forged", "questionnaire_type": "QSA",
                                                        "scores": {"C1": 5}, "source": "imported",
                                                        "capture_method": "csv_import"})
    assert forged.status_code == 422
    manual = client.post("/questionnaire-result", json={"session_id": "manual", "questionnaire_type": "QSA",
                                                        "scores": {"C1": 5, "C2": 6}})
    assert manual.status_code == 200, manual.text
    assert (manual.json()["source"], manual.json()["capture_method"]) == ("in-app", "manual_scores")
    assert db.query(models.QuestionnaireResult).filter_by(session_id="forged").count() == 0


def test_old_results_keep_unknown_capture_method(inapp):
    client, db, group, identity = inapp
    db.add(models.QuestionnaireResult(session_id="legacy", username="student", questionnaire_type="QSA",
                                      scores={"C1": 5, "C2": 6}))
    db.commit()
    identity.update(username="student", groups=[])
    row = client.get("/user/questionnaire-results").json()[0]
    assert (row["source"], row["capture_method"], row["source_system"], row["locale"]) == (
        "in-app", "legacy_unknown", None, None)
