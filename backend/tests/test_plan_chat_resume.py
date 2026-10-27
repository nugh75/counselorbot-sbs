"""Plan chat recovery uses canonical results and preserves historical records."""
from datetime import datetime, timezone
import pytest

from backend import models
from backend.qpcc import CODES
from backend.tests.test_it_administration import api as api, typed_path
from backend.tests.test_results_deep_dive import deep_dive_path


@pytest.mark.parametrize("teacher_learner", [False, True])
def test_resume_list_returns_exact_plan_step_for_owned_current_session(api, teacher_learner):
    import asyncio
    from backend.routes.frozen_sessions import list_frozen_sessions
    client, db, group, identity = api
    plan, path = deep_dive_path(client, group)
    source, analysis = path["steps"]
    identity.update(username="student", groups=["docenti"] if teacher_learner else [])
    grant = client.post(f"/user/administrations/{plan['id']}/verify-institution",
                        json={"institution_code": "SYN-150", "password": "Invented-150"}).json()["grant"]
    entered = client.post(f"/user/paths/{path['id']}/steps/{source['id']}/guided-entry",
                         json={"session_id": "entry-resume", "request_id": "entry-resume",
                               "scores": {"C1": 5, "C2": 7}, "institution_grant": grant})
    assert entered.status_code == 200, entered.text
    started = client.post(f"/user/paths/{path['id']}/steps/{analysis['id']}/deep-dive")
    assert started.status_code == 200, started.text
    analysis_session = started.json()["session_id"]
    db.add_all([models.FrozenSession(username="student", session_id=sid, questionnaire_type="QSA",
                                    data={"current_phase": "qsa-focus", "messages": [{"role": "assistant", "content": "Exact saved reply"}]})
                for sid in ("entry-resume", analysis_session)])
    db.commit()
    rows = {row.session_id: row for row in asyncio.run(list_frozen_sessions(current_user=identity, db=db))}
    base = f"/profilo/piani-operativi/{path['id']}"
    assert rows["entry-resume"].resume_href == f"{base}/{source['id']}?resume=1"
    assert rows[analysis_session].resume_href == f"{base}/{analysis['id']}/approfondimento?resume=1"
    # The same teacher identity can learn in this class, but cannot manage it.
    assert client.get("/user/paths").status_code == 200
    assert client.get(f"/teacher/paths/{path['id']}").status_code in (403, 404)
    membership = db.query(models.GroupMembership).filter_by(group_id=group.id, username="student").one()
    db.delete(membership)
    db.commit()
    assert all(row.resume_href is None for row in asyncio.run(list_frozen_sessions(current_user=identity, db=db)))


@pytest.mark.parametrize("personal", [False, True])
def test_qpcc_legacy_plan_can_collect_canonical_data_and_resume_new_analysis(api, personal):
    client, db, group, identity = api
    plan, path = deep_dive_path(client, group)
    source, analysis = path["steps"]
    db.add(models.Instrument(code="QPCC", name_en="QPCC", is_active=True))
    db.add_all([models.Factor(code=f"K{i}", instrument_code="QPCC") for i in range(1, 6)])
    db.get(models.AdministrationPlan, plan["id"]).instrument_code = "QPCC"
    if personal:
        step = db.get(models.ClassPathStep, analysis["id"])
        step.results_step_id = None
        step.tool_key = "QPCC"
    legacy_scores = {f"K{i}": 5 for i in range(1, 6)}
    result = models.QuestionnaireResult(session_id="legacy-result", username="student", questionnaire_type="QPCC",
                                        administration_plan_id=plan["id"], scores=legacy_scores, locale="it", source="in-app")
    db.add(result); db.flush()
    entry = models.QuestionnaireGuidedEntry(result_id=result.id, username="student", session_id="legacy-result",
                                            request_id="legacy-request", step_id=source["id"], accepted_at=datetime.now(timezone.utc))
    db.add(entry); db.flush()
    db.add(models.ClassPathStepEvidence(step_id=source["id"], username="student", kind="guided_entry",
                                       result_id=result.id, guided_entry_id=entry.id, recorded_at=entry.accepted_at))
    binding = models.ClassPathDeepDiveSession(step_id=analysis["id"], username="student", result_id=result.id,
                                             session_id="legacy-analysis", started_at=entry.accepted_at)
    snapshot = models.FrozenSession(username="student", session_id="legacy-analysis", questionnaire_type="QPCC",
                                    data={"scores": legacy_scores, "current_phase": "qpcc-profilo", "messages": [{"role": "assistant", "content": "Historical conversation"}]})
    db.add_all([binding, snapshot]); db.commit()
    identity.update(username="student", groups=[])
    url = f"/user/paths/{path['id']}/steps/{analysis['id']}/deep-dive"
    options = client.get(url)
    assert options.status_code == 200, options.text
    assert options.json()["legacy_profile"] is True
    assert options.json()["session"] is None and options.json()["ready"] is False
    assert options.json()["source_href"] == ("/?start=QPCC" if personal else f"/profilo/piani-operativi/{path['id']}/{source['id']}")
    launch = client.post(f"/user/paths/{path['id']}/steps/{source['id']}/launch").json()
    assert [row["code"] for row in launch["score_factors"]] == list(CODES)
    assert all(row["label_i18n"]["it"] for row in launch["score_factors"])
    assert launch["latest_entry"] is None
    grant = client.post(f"/user/administrations/{plan['id']}/verify-institution",
                        json={"institution_code": "SYN-150", "password": "Invented-150"}).json()["grant"]
    payload = {"session_id": "canonical-result", "request_id": "canonical-request", "scores": legacy_scores, "institution_grant": grant}
    entry_url = f"/user/paths/{path['id']}/steps/{source['id']}/guided-entry"
    assert client.post(entry_url, json=payload).status_code == 422
    payload["scores"] = {code: 5 for code in CODES}
    ack = client.post(entry_url, json=payload)
    assert ack.status_code == 200, ack.text
    assert client.post(f"/user/paths/{path['id']}/steps/{source['id']}/launch").json()["latest_entry"] == ack.json()
    start_body = {"json": {"result_id": ack.json()["result"]["id"]}} if personal else {}
    started = client.post(url, **start_body)
    assert started.status_code == 200, started.text
    assert started.json()["session_id"] != binding.session_id
    assert client.get(url).json()["session"] == started.json()
    assert client.post(url, **start_body).json() == started.json()
    assert client.get(url).json()["legacy_profile"] is False
    db.refresh(result); db.refresh(snapshot)
    assert result.scores == legacy_scores
    assert snapshot.data["messages"][0]["content"] == "Historical conversation"
    assert db.query(models.ClassPathDeepDiveSession).count() == 2


def test_launch_resumes_only_valid_entries_for_exact_owner_and_step(api):
    client, db, group, identity = api
    plan, path = typed_path(client, group)
    step = path["steps"][0]
    identity.update(username="student", groups=[])
    grant = client.post(f"/user/administrations/{plan['id']}/verify-institution",
                        json={"institution_code": "SYN-150", "password": "Invented-150"}).json()["grant"]
    url = f"/user/paths/{path['id']}/steps/{step['id']}"
    acknowledgements = []
    for name in ["first", "second"]:
        response = client.post(url + "/guided-entry", json={"session_id": name, "request_id": name,
                               "scores": {"C1": 5, "C2": 7}, "institution_grant": grant})
        assert response.status_code == 200, response.text
        acknowledgements.append(response.json())
    assert client.post(url + "/launch").json()["latest_entry"] == acknowledgements[1]
    evidence = db.get(models.ClassPathStepEvidence, acknowledgements[1]["evidence_id"])
    evidence.invalidated_at = datetime.now(timezone.utc); db.commit()
    assert client.post(url + "/launch").json()["latest_entry"] == acknowledgements[0]
    db.add(models.GroupMembership(group_id=group.id, username="other-student")); db.commit()
    identity.update(username="other-student")
    assert client.post(url + "/launch").json()["latest_entry"] is None
