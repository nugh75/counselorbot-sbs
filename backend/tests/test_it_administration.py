"""Italian typed administration APIs on synthetic PostgreSQL only."""

import os
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend import auth, database, models
from backend.routes import class_paths, administration_plans
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def api():
    assert os.environ["DATABASE_URL"] == "postgresql://c5_test@127.0.0.1:18650/counselorbot_test"
    with artifact_session() as db:
        school = models.Institution(
            slug="synthetic-it",
            name="Synthetic institute",
            kind="school",
            institution_code="SYN-150",
            hashed_password=models.get_password_hash("Invented-150"),
        )
        db.add(school)
        db.flush()
        group = models.StudentGroup(
            code="SYN-CLASS-150",
            name="Synthetic class",
            owner_username="teacher",
            institution_id=school.id,
        )
        db.add(group)
        db.flush()
        db.add_all(
            [
                models.InstitutionTeacher(
                    institution_id=school.id,
                    username="teacher",
                    is_active=True,
                    created_by="teacher",
                    updated_by="teacher",
                ),
                models.GroupMembership(group_id=group.id, username="student"),
                models.Instrument(
                    code="QSA",
                    name_en="Learning strategies",
                    tool_category="assessment",
                    is_active=True,
                ),
                models.Factor(code="C1", instrument_code="QSA"),
                models.Factor(code="C2", instrument_code="QSA"),
            ]
        )
        db.commit()
        identity = {
            "username": "teacher",
            "groups": ["docenti"],
            "authenticated": True,
            "is_admin": False,
        }
        app = FastAPI()
        app.include_router(class_paths.router)
        app.include_router(administration_plans.router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        with TestClient(app) as client:
            yield client, db, group, identity


def create_plan(client, group):
    response = client.post(
        f"/teacher/groups/{group.id}/administrations",
        json={
            "title": "Italian questionnaire",
            "instrument_code": "QSA",
            "locale": "it",
            "status": "active",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_class_and_research_share_one_plan(api):
    client, db, group, identity = api
    plan = create_plan(client, group)
    assert plan["institution_id"] == group.institution_id
    assert plan["group_id"] == group.id
    assert plan["delivery_mode"] == "external_it"
    research = client.get("/admin/administration-plans").json()
    assert [row["id"] for row in research] == [plan["id"]]
    assert (
        client.get(f"/teacher/groups/{group.id}/administrations").json()[0]["id"]
        == plan["id"]
    )
    identity.update(username="stranger")
    assert client.get(f"/teacher/groups/{group.id}/administrations").status_code == 403


def typed_path(client, group):
    plan = create_plan(client, group)
    path = client.post(
        f"/teacher/groups/{group.id}/paths", json={"title": "Italian path"}
    ).json()
    response = client.put(
        f"/teacher/paths/{path['id']}",
        json={
            "revision": path["revision"],
            "title": path["title"],
            "steps": [
                {
                    "step_type": "questionnaire_administration",
                    "administration_plan_id": plan["id"],
                }
            ],
        },
    )
    assert response.status_code == 200, response.text
    path = response.json()
    response = client.post(f"/teacher/paths/{path['id']}/publish")
    assert response.status_code == 200, response.text
    return plan, response.json()


def test_typed_step_launch_keeps_progress_undone(api):
    client, db, group, identity = api
    plan, path = typed_path(client, group)
    step = path["steps"][0]
    assert step["step_type"] == "questionnaire_administration"
    assert step["tool_key"] is None
    assert step["active_from"] is not None
    identity.update(username="student", groups=[])
    response = client.post(f"/user/paths/{path['id']}/steps/{step['id']}/launch")
    assert response.status_code == 200, response.text
    launch = response.json()
    assert launch["administration_plan_id"] == plan["id"]
    assert launch["external_href"] == "https://www.competenzestrategiche.it/"
    assert launch["institution"]["institution_code"] == "SYN-150"
    assert "password" not in str(launch)
    assert client.get("/user/paths").json()[0]["done"] == 0
    assert (
        client.post(f"/user/paths/{path['id']}/steps/{step['id']}/done").status_code
        == 422
    )


def test_manual_entry_acknowledges_result_entry_and_evidence_atomically(api):
    client, db, group, identity = api
    plan, path = typed_path(client, group)
    step = path["steps"][0]
    identity.update(username="student", groups=[])
    grant = client.post(
        f"/user/administrations/{plan['id']}/verify-institution",
        json={"institution_code": "SYN-150", "password": "Invented-150"},
    ).json()["grant"]
    url = f"/user/paths/{path['id']}/steps/{step['id']}/guided-entry"
    payload = {
        "session_id": "guided-150",
        "request_id": "entry-150",
        "scores": {"C1": 5, "C2": 7},
        "institution_grant": grant,
    }
    response = client.post(url, json=payload)
    assert response.status_code == 200, response.text
    ack = response.json()
    assert ack["result"]["source"] == "in-app"
    assert ack["result"]["capture_method"] == "manual_scores"
    assert ack["result"]["source_system"] == "competenzestrategiche.it"
    assert ack["guided_entry_id"] > 0 and ack["evidence_id"] > 0
    assert client.post(url, json=payload).json() == ack
    progress = client.get("/user/paths").json()[0]
    assert progress["done"] == 1
    assert progress["steps"][0]["completion_kind"] == "guided_entry"
    changed = {**payload, "scores": {"C1": 2, "C2": 7}}
    assert client.post(url, json=changed).status_code == 409
    assert db.query(models.QuestionnaireResult).count() == 1


@pytest.mark.parametrize(
    "change",
    [
        {"scores": {"C1": 0, "C2": 7}},
        {"scores": {"C1": True, "C2": 7}},
        {"scores": {"C1": 5}},
        {"source": "imported"},
        {"result_id": 9999},
        {"institution_grant": "forged"},
    ],
)
def test_invalid_entry_writes_nothing(api, change):
    client, db, group, identity = api
    plan, path = typed_path(client, group)
    step = path["steps"][0]
    identity.update(username="student", groups=[])
    grant = client.post(
        f"/user/administrations/{plan['id']}/verify-institution",
        json={"institution_code": "SYN-150", "password": "Invented-150"},
    ).json()["grant"]
    response = client.post(
        f"/user/paths/{path['id']}/steps/{step['id']}/guided-entry",
        json={
            "session_id": "negative",
            "request_id": "negative",
            "scores": {"C1": 5, "C2": 7},
            "institution_grant": grant,
            **change,
        },
    )
    assert response.status_code in {403, 422}
    assert db.query(models.QuestionnaireResult).count() == 0
    assert db.query(models.QuestionnaireGuidedEntry).count() == 0
    assert client.get("/user/paths").json()[0]["done"] == 0


def test_activated_target_is_immutable_but_reorder_preserves_id(api):
    client, db, group, identity = api
    plan, path = typed_path(client, group)
    step = path["steps"][0]
    changed = client.put(
        f"/teacher/paths/{path['id']}",
        json={
            "revision": path["revision"],
            "title": path["title"],
            "steps": [{"id": step["id"], "tool_key": "QSA"}],
        },
    )
    assert changed.status_code == 409
    response = client.put(
        f"/teacher/paths/{path['id']}",
        json={
            "revision": path["revision"],
            "title": path["title"],
            "steps": [
                {"tool_key": "timeline"},
                {
                    "id": step["id"],
                    "step_type": "questionnaire_administration",
                    "administration_plan_id": plan["id"],
                },
            ],
        },
    )
    assert response.status_code == 200, response.text
    kept = response.json()["steps"][1]
    assert (kept["id"], kept["active_from"]) == (step["id"], step["active_from"])
    assert (
        client.put(
            f"/admin/administration-plans/{plan['id']}",
            json={"revision": plan["revision"], "locale": "en"},
        ).status_code
        == 409
    )


@pytest.mark.parametrize(
    "case",
    [
        "confirmed",
        "preview",
        "wrong-student",
        "wrong-plan",
        "before-activation",
        "invalidated",
        "source-only",
        "deleted-result",
        "failed-commit",
    ],
)
def test_confirmed_import_contract_requires_exact_committed_binding_without_chat(
    api, case
):
    from datetime import datetime, timezone, timedelta

    client, db, group, identity = api
    plan, path = typed_path(client, group)
    step = path["steps"][0]
    now = datetime.now(timezone.utc)
    result = models.QuestionnaireResult(
        session_id="import-history-150",
        username="student",
        questionnaire_type="QSA",
        administration_plan_id=plan["id"],
        scores={"C1": 5, "C2": 7},
        source="imported",
        capture_method="csv_import",
        source_system="competenzestrategiche.it",
        locale="it",
        submitted_at=now - timedelta(days=90),
    )
    db.add(result)
    db.flush()
    if case not in {"source-only", "preview"}:
        confirmation = models.QuestionnaireImportConfirmation(
            result_id=result.id,
            administration_plan_id=plan["id"],
            username="other" if case == "wrong-student" else "student",
            batch_id="synthetic-committed-batch",
            confirmed_by="teacher",
            confirmed_at=now - timedelta(days=1)
            if case == "before-activation"
            else now,
            invalidated_at=now if case == "invalidated" else None,
        )
        db.add(confirmation)
        db.flush()
        db.add(
            models.ClassPathStepEvidence(
                step_id=step["id"],
                username="student",
                kind="confirmed_import",
                result_id=result.id,
                import_confirmation_id=confirmation.id,
                recorded_at=now,
            )
        )
    if case == "wrong-plan":
        other = models.AdministrationPlan(
            code="AP-OTHER", title="Other", instrument_code="QSA", locale="it"
        )
        db.add(other)
        db.flush()
        result.administration_plan_id = other.id
    if case == "failed-commit":
        db.rollback()
    else:
        db.commit()
    if case == "deleted-result":
        db.delete(result)
        db.commit()
    identity.update(username="student", groups=[])
    row = client.get("/user/paths").json()[0]
    assert row["done"] == (1 if case == "confirmed" else 0)
    if case == "confirmed":
        assert row["steps"][0]["completion_kind"] == "confirmed_import"
    assert db.query(models.QuestionnaireGuidedEntry).count() == 0
    assert db.query(models.Log).count() == 0


def test_failed_commit_rolls_back_all_entry_rows_and_retry_succeeds(api, monkeypatch):
    client, db, group, identity = api
    plan, path = typed_path(client, group)
    step = path["steps"][0]
    identity.update(username="student", groups=[])
    grant = client.post(
        f"/user/administrations/{plan['id']}/verify-institution",
        json={"institution_code": "SYN-150", "password": "Invented-150"},
    ).json()["grant"]
    payload = {
        "session_id": "retry-session",
        "request_id": "retry-request",
        "scores": {"C1": 5, "C2": 7},
        "institution_grant": grant,
    }
    commit = db.commit

    def failure():
        raise RuntimeError("Synthetic commit failure")

    monkeypatch.setattr(db, "commit", failure)
    with pytest.raises(RuntimeError, match="Synthetic commit failure"):
        client.post(
            f"/user/paths/{path['id']}/steps/{step['id']}/guided-entry", json=payload
        )
    assert db.query(models.QuestionnaireResult).count() == 0
    assert db.query(models.QuestionnaireGuidedEntry).count() == 0
    assert db.query(models.ClassPathStepEvidence).count() == 0
    monkeypatch.setattr(db, "commit", commit)
    assert (
        client.post(
            f"/user/paths/{path['id']}/steps/{step['id']}/guided-entry", json=payload
        ).status_code
        == 200
    )


def test_strict_launch_and_write_do_not_bypass_predecessor(api):
    client, db, group, identity = api
    plan = create_plan(client, group)
    path = client.post(
        f"/teacher/groups/{group.id}/paths", json={"title": "Strict", "mode": "strict"}
    ).json()
    path = client.put(
        f"/teacher/paths/{path['id']}",
        json={
            "revision": 1,
            "title": "Strict",
            "mode": "strict",
            "steps": [
                {"tool_key": "timeline"},
                {
                    "step_type": "questionnaire_administration",
                    "administration_plan_id": plan["id"],
                },
            ],
        },
    ).json()
    path = client.post(f"/teacher/paths/{path['id']}/publish").json()
    step = path["steps"][1]
    identity.update(username="student", groups=[])
    assert (
        client.post(f"/user/paths/{path['id']}/steps/{step['id']}/launch").status_code
        == 409
    )
    response = client.post(
        f"/user/paths/{path['id']}/steps/{step['id']}/guided-entry",
        json={
            "session_id": "locked",
            "request_id": "locked",
            "scores": {"C1": 5, "C2": 7},
            "institution_grant": "unused",
        },
    )
    assert response.status_code == 409
    assert db.query(models.QuestionnaireResult).count() == 0


def test_class_and_research_edits_share_revision_without_granting_research_reads(api):
    client, db, group, identity = api
    plan = create_plan(client, group)
    db.add(
        models.GroupShare(
            group_id=group.id,
            shared_with_username="co-teacher",
            granted_by_username="teacher",
        )
    )
    db.commit()
    identity.update(username="co-teacher")
    response = client.put(
        f"/teacher/administrations/{plan['id']}",
        json={"revision": 1, "title": "Class edited"},
    )
    assert response.status_code == 200, response.text
    assert client.get("/admin/administration-plans").json() == []
    identity.update(username="teacher")
    assert (
        client.get("/admin/administration-plans").json()[0]["title"] == "Class edited"
    )
    assert (
        client.put(
            f"/admin/administration-plans/{plan['id']}",
            json={"revision": 1, "title": "Stale"},
        ).status_code
        == 409
    )


def test_restoring_a_never_activated_step_on_a_published_path_activates_it(api):
    client, db, group, identity = api
    plan = create_plan(client, group)
    path = client.post(
        f"/teacher/groups/{group.id}/paths", json={"title": "Italian path"}
    ).json()
    typed = {
        "step_type": "questionnaire_administration",
        "administration_plan_id": plan["id"],
    }

    def save(steps):
        current = client.get(f"/teacher/paths/{path['id']}").json()
        response = client.put(
            f"/teacher/paths/{path['id']}",
            json={"revision": current["revision"], "title": path["title"], "steps": steps},
        )
        assert response.status_code == 200, response.text
        return response.json()

    step = save([typed])["steps"][0]
    assert step["active_from"] is None
    save([{"tool_key": "timeline"}])
    assert client.post(f"/teacher/paths/{path['id']}/publish").status_code == 200
    restored = save([{"id": step["id"], **typed}])["steps"][0]
    assert restored["id"] == step["id"]
    assert restored["active_from"] is not None


@pytest.mark.parametrize(
    "invalid",
    [
        "other-student",
        "other-plan",
        "practice-request",
        "direct-result",
        "disabled",
        "removed",
        "archived",
    ],
)
def test_only_current_exact_student_target_can_enter_or_complete(api, invalid):
    client, db, group, identity = api
    plan, path = typed_path(client, group)
    step = path["steps"][0]
    identity.update(username="student", groups=[])
    grant = client.post(
        f"/user/administrations/{plan['id']}/verify-institution",
        json={"institution_code": "SYN-150", "password": "Invented-150"},
    ).json()["grant"]
    result = models.QuestionnaireResult(
        session_id="previous-result",
        username="other" if invalid == "other-student" else "student",
        questionnaire_type="QSA",
        scores={"C1": 5, "C2": 7},
        administration_plan_id=plan["id"],
        locale="it",
    )
    db.add(result)
    db.flush()
    if invalid == "other-plan":
        other = models.AdministrationPlan(
            code="AP-OTHER", title="Other", instrument_code="QSA", locale="it"
        )
        db.add(other)
        db.flush()
        result.administration_plan_id = other.id
    if invalid == "disabled":
        db.add(
            models.ClassSettings(
                group_id=group.id, disabled_tool_keys=["QSA"], updated_by="teacher"
            )
        )
    if invalid == "removed":
        db.get(models.ClassPathStep, step["id"]).removed_at = __import__(
            "datetime"
        ).datetime.now(__import__("datetime").timezone.utc)
    if invalid == "archived":
        db.get(models.AdministrationPlan, plan["id"]).status = "archived"
    db.commit()
    assert client.get("/user/paths").json()[0]["done"] == 0
    if invalid == "direct-result":
        return
    payload = {
        "session_id": "entry-target",
        "request_id": "entry-target",
        "result_id": result.id,
        "institution_grant": grant,
    }
    if invalid == "practice-request":
        payload["notebook_context"] = "practice"
    response = client.post(
        f"/user/paths/{path['id']}/steps/{step['id']}/guided-entry", json=payload
    )
    assert response.status_code in {403, 404, 409, 422}, response.text
    assert db.query(models.QuestionnaireGuidedEntry).count() == 0
    assert db.query(models.ClassPathStepEvidence).count() == 0


def test_typed_builder_rejects_unsupported_and_cross_class_targets(api):
    client, db, group, identity = api
    plan = create_plan(client, group)
    path = client.post(
        f"/teacher/groups/{group.id}/paths", json={"title": "Validation"}
    ).json()
    url = f"/teacher/paths/{path['id']}"
    for step in [
        {"step_type": "forum", "topic_id": 1},
        {"tool_key": "QSA", "administration_plan_id": plan["id"]},
        {
            "step_type": "questionnaire_administration",
            "administration_plan_id": plan["id"],
            "tool_key": "QSA",
        },
    ]:
        assert (
            client.put(
                url, json={"revision": 1, "title": "Validation", "steps": [step]}
            ).status_code
            == 422
        )
    other = models.StudentGroup(
        code="SYN-OTHER",
        name="Synthetic other",
        owner_username="teacher",
        institution_id=group.institution_id,
    )
    db.add(other)
    db.flush()
    db.get(models.AdministrationPlan, plan["id"]).group_id = other.id
    db.commit()
    assert (
        client.put(
            url,
            json={
                "revision": 1,
                "title": "Validation",
                "steps": [
                    {
                        "step_type": "questionnaire_administration",
                        "administration_plan_id": plan["id"],
                    }
                ],
            },
        ).status_code
        == 422
    )
    assert client.get(url).json()["steps"] == []
