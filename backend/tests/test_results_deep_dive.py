"""Optional guided deep dive bound to a preceding administration (TF5, #152).

Synthetic PostgreSQL only: the shared TF3 fixture plus two invented QSA guided
steps. Chat turns use patched AI calls; no provider or network is reached.
"""

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend import auth, class_access, database, models
from backend.ai_service import AIError
from backend.routes import chat
from backend.dynamic_registry import set_session_factory
from backend.tests.test_it_administration import api, create_plan  # noqa: F401

STUDENT = {
    "username": "student",
    "groups": [],
    "authenticated": True,
    "is_admin": False,
    "is_researcher": False,
}


def guided_steps(db):
    db.add_all(
        [
            models.GuidedStep(
                id="qsa-open",
                sort_order=1,
                label="Open",
                prompt="Open",
                system_prompt_mode="generic",
                questionnaire_type="QSA",
            ),
            models.GuidedStep(
                id="qsa-close",
                sort_order=2,
                label="Close",
                prompt="Close",
                system_prompt_mode="generic",
                questionnaire_type="QSA",
            ),
        ]
    )
    db.commit()


def save(client, path, steps, **extra):
    return client.put(
        f"/teacher/paths/{path['id']}",
        json={
            "revision": path["revision"],
            "title": path["title"],
            "mode": extra.get("mode", path.get("mode", "recommended")),
            "steps": steps,
        },
    )


def admin_input(plan, step_id=None):
    row = {"step_type": "questionnaire_administration", "administration_plan_id": plan["id"]}
    return {**row, "id": step_id} if step_id else row


def deep_dive_path(client, group, *, mode="recommended", publish=True):
    plan = create_plan(client, group)
    path = client.post(
        f"/teacher/groups/{group.id}/paths", json={"title": "Deep dive", "mode": mode}
    ).json()
    response = save(client, path, [admin_input(plan)], mode=mode)
    assert response.status_code == 200, response.text
    path = response.json()
    administration = path["steps"][0]
    response = save(
        client,
        path,
        [
            admin_input(plan, administration["id"]),
            {"step_type": "guided_results_chat", "results_step_id": administration["id"]},
        ],
        mode=mode,
    )
    assert response.status_code == 200, response.text
    path = response.json()
    if publish:
        response = client.post(f"/teacher/paths/{path['id']}/publish")
        assert response.status_code == 200, response.text
        path = response.json()
    return plan, path


def enter_scores(client, plan, path, session_id="entry-152"):
    grant = client.post(
        f"/user/administrations/{plan['id']}/verify-institution",
        json={"institution_code": "SYN-150", "password": "Invented-150"},
    ).json()["grant"]
    response = client.post(
        f"/user/paths/{path['id']}/steps/{path['steps'][0]['id']}/guided-entry",
        json={
            "session_id": session_id,
            "request_id": f"{session_id}-request",
            "scores": {"C1": 5, "C2": 7},
            "institution_grant": grant,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def start(client, path):
    return client.post(
        f"/user/paths/{path['id']}/steps/{path['steps'][1]['id']}/deep-dive"
    )


def student_row(client):
    return client.get("/user/paths").json()[0]


def marker(db, session_id, *, username="student", questionnaire_type="QSA", at=None):
    db.add(
        models.Log(
            session_id=session_id,
            action="guided_chat_completed",
            username=username,
            questionnaire_type=questionnaire_type,
            phase="qsa-close",
            timestamp=at or datetime.now(timezone.utc),
        )
    )
    db.commit()


@contextmanager
def chat_client(db, identity):
    app = FastAPI()
    app.include_router(chat.router)
    app.add_exception_handler(
        class_access.ToolAccessDenied, class_access.tool_access_denied_handler
    )

    def override_db():
        yield db

    app.dependency_overrides[database.get_db] = override_db
    app.dependency_overrides[auth.get_identity_view_as] = lambda: identity
    app.dependency_overrides[auth.get_current_user] = lambda: identity

    def fresh_session():
        return Session(bind=db.connection(), join_transaction_mode="create_savepoint")

    set_session_factory(fresh_session)
    try:
        with patch.object(database, "SessionLocal", fresh_session), TestClient(
            app
        ) as client:
            yield client
    finally:
        set_session_factory(None)


def stream_reply(*_args, **_kwargs):
    yield {"type": "delta", "text": "streamed reply"}


def failing_stream(*_args, **_kwargs):
    yield {"type": "delta", "text": "partial"}
    raise AIError("Synthetic provider failure")


def turn(client, route, session_id, phase):
    response = client.post(
        route,
        json={
            "message": "Hi",
            "questionnaire_type": "QSA",
            "session_id": session_id,
            "phase": phase,
        },
    )
    assert response.status_code == 200, response.text
    return response


def test_teacher_may_omit_or_link_the_deep_dive(api):
    client, db, group, identity = api
    plan, path = deep_dive_path(client, group)
    administration, deep_dive = path["steps"]
    assert deep_dive["step_type"] == "guided_results_chat"
    assert deep_dive["results_step_id"] == administration["id"]
    assert deep_dive["tool_key"] is None and deep_dive["administration_plan_id"] is None
    assert deep_dive["target_summary"]["code"] == plan["code"]
    assert deep_dive["active_from"] is not None
    assert deep_dive["can_self_mark"] is False
    # Omission: the administration alone is a complete composition.
    response = save(client, path, [admin_input(plan, administration["id"])])
    assert response.status_code == 200, response.text
    assert [row["step_type"] for row in response.json()["steps"]] == [
        "questionnaire_administration"
    ]


@pytest.mark.parametrize(
    "case, status, detail",
    [
        ("before", 422, "results_step_order"),
        ("tool", 422, "results_step_invalid"),
        ("missing", 422, "results_step_invalid"),
        ("unsaved", 422, "results_step_invalid"),
        ("other-path", 422, "results_step_invalid"),
        ("duplicate", 422, "duplicate_results_chat"),
        ("remove-administration", 409, "results_step_referenced"),
    ],
)
def test_reference_must_be_a_preceding_administration_of_this_path(
    api, case, status, detail
):
    client, db, group, identity = api
    plan, path = deep_dive_path(client, group, publish=False)
    administration, deep_dive = path["steps"]
    keep_admin = admin_input(plan, administration["id"])
    link = {"id": deep_dive["id"], "step_type": "guided_results_chat"}
    timeline = save(
        client,
        path,
        [keep_admin, {**link, "results_step_id": administration["id"]}, {"tool_key": "timeline"}],
    )
    assert timeline.status_code == 200, timeline.text
    timeline = timeline.json()
    tool_step = timeline["steps"][2]
    other = client.post(f"/teacher/groups/{group.id}/paths", json={"title": "Other"}).json()
    other = save(client, other, [admin_input(plan)]).json()
    steps = {
        "before": [{**link, "results_step_id": administration["id"]}, keep_admin],
        "tool": [keep_admin, {"id": tool_step["id"], "tool_key": "timeline"},
                 {**link, "results_step_id": tool_step["id"]}],
        "missing": [keep_admin, {**link, "results_step_id": 999999}],
        "unsaved": [keep_admin, admin_input(plan), {**link, "results_step_id": 999998}],
        "other-path": [keep_admin, {**link, "results_step_id": other["steps"][0]["id"]}],
        "duplicate": [keep_admin, {**link, "results_step_id": administration["id"]},
                      {"step_type": "guided_results_chat", "results_step_id": administration["id"]}],
        "remove-administration": [{**link, "results_step_id": administration["id"]}],
    }[case]
    before = db.query(models.ClassPathStep).count()
    response = save(client, timeline, steps)
    assert (response.status_code, response.json()["detail"]) == (status, detail)
    assert db.query(models.ClassPathStep).count() == before
    db.expire_all()
    assert db.get(models.ClassPathStep, administration["id"]).removed_at is None


def test_activated_reference_is_immutable_but_reorder_keeps_identity(api):
    client, db, group, identity = api
    plan, path = deep_dive_path(client, group)
    administration, deep_dive = path["steps"]
    second = save(
        client,
        path,
        [
            admin_input(plan, administration["id"]),
            {"id": deep_dive["id"], "step_type": "guided_results_chat",
             "results_step_id": administration["id"]},
            {"tool_key": "timeline"},
        ],
    )
    assert second.status_code == 200, second.text
    path = second.json()
    changed = save(
        client,
        path,
        [
            admin_input(plan, administration["id"]),
            {"id": deep_dive["id"], "tool_key": "timeline"},
        ],
    )
    assert (changed.status_code, changed.json()["detail"]) == (
        409,
        "activated_step_target_immutable",
    )
    reordered = save(
        client,
        path,
        [
            {"id": path["steps"][2]["id"], "tool_key": "timeline"},
            admin_input(plan, administration["id"]),
            {"id": deep_dive["id"], "step_type": "guided_results_chat",
             "results_step_id": administration["id"]},
        ],
    )
    assert reordered.status_code == 200, reordered.text
    kept = reordered.json()["steps"][2]
    assert (kept["id"], kept["active_from"]) == (deep_dive["id"], deep_dive["active_from"])


@pytest.mark.parametrize("route", ["/chat", "/chat/stream"])
def test_only_the_final_turn_of_the_bound_session_completes(api, route):
    client, db, group, identity = api
    guided_steps(db)
    plan, path = deep_dive_path(client, group)
    identity.update(STUDENT)
    entry = enter_scores(client, plan, path)
    row = student_row(client)
    assert (row["done"], row["total"]) == (1, 2)
    assert row["steps"][1]["state"] == "not_done"
    launched = client.post(
        f"/user/paths/{path['id']}/steps/{path['steps'][1]['id']}/launch"
    ).json()
    assert launched["start_href"].endswith("/approfondimento")
    response = start(client, path)
    assert response.status_code == 200, response.text
    session = response.json()
    assert session["result"]["id"] == entry["result"]["id"]
    assert session["result"]["scores"] == {"C1": 5, "C2": 7}
    assert session["session_id"] not in {entry["session_id"], "entry-152"}
    with patch.object(chat.AIService, "get_response", return_value="plain reply"), \
            patch.object(chat.AIService, "stream_response", side_effect=stream_reply):
        with chat_client(db, STUDENT) as chat_api:
            turn(chat_api, route, session["session_id"], "qsa-open")
            assert student_row(client)["done"] == 1
            turn(chat_api, route, session["session_id"], "qsa-close")
            turn(chat_api, route, session["session_id"], "qsa-close")
    row = student_row(client)
    assert (row["done"], row["total"]) == (2, 2)
    assert row["steps"][1]["completion_kind"] == "guided_results_chat"
    assert row["steps"][0]["completion_kind"] == "guided_entry"
    assert (
        db.query(models.Log)
        .filter_by(action="guided_chat_completed", session_id=session["session_id"])
        .count()
        == 1
    )
    identity.update(username="teacher", groups=["docenti"])
    progress = client.get(f"/teacher/paths/{path['id']}/progress").json()
    cells = progress["students"][0]["cells"]
    assert [cell["completion_kind"] for cell in cells] == [
        "guided_entry",
        "guided_results_chat",
    ]
    assert progress["steps"][1]["done_count"] == 1


def test_start_is_idempotent_and_resumes_the_same_session(api):
    client, db, group, identity = api
    plan, path = deep_dive_path(client, group)
    identity.update(STUDENT)
    enter_scores(client, plan, path)
    first = start(client, path).json()
    assert start(client, path).json() == first
    assert db.query(models.ClassPathDeepDiveSession).count() == 1
    assert student_row(client)["done"] == 1


@pytest.mark.parametrize(
    "case", ["entry-session", "other-user", "other-instrument", "before-start", "no-binding"]
)
def test_unrelated_sessions_and_old_markers_do_not_complete(api, case):
    client, db, group, identity = api
    plan, path = deep_dive_path(client, group)
    identity.update(STUDENT)
    entry = enter_scores(client, plan, path)
    if case == "no-binding":
        marker(db, "never-bound")
    else:
        session = start(client, path).json()
        bound = session["session_id"]
        if case == "entry-session":
            marker(db, entry["session_id"])
        elif case == "other-user":
            marker(db, bound, username="other")
        elif case == "other-instrument":
            marker(db, bound, questionnaire_type="ZTPI")
        elif case == "before-start":
            marker(db, bound, at=datetime.now(timezone.utc) - timedelta(days=1))
    row = student_row(client)
    assert row["done"] == 1
    assert row["steps"][1]["state"] == "not_done"


def test_failed_stream_records_no_completion_and_retry_completes(api):
    client, db, group, identity = api
    guided_steps(db)
    plan, path = deep_dive_path(client, group)
    identity.update(STUDENT)
    enter_scores(client, plan, path)
    session = start(client, path).json()["session_id"]
    with patch.object(chat.AIService, "stream_response", side_effect=failing_stream):
        with chat_client(db, STUDENT) as chat_api:
            response = turn(chat_api, "/chat/stream", session, "qsa-close")
            assert '"error"' in response.text
    assert student_row(client)["done"] == 1
    with patch.object(chat.AIService, "stream_response", side_effect=stream_reply):
        with chat_client(db, STUDENT) as chat_api:
            turn(chat_api, "/chat/stream", start(client, path).json()["session_id"], "qsa-close")
    assert student_row(client)["done"] == 2


def test_start_requires_the_bound_result_and_class_context(api):
    client, db, group, identity = api
    plan, path = deep_dive_path(client, group)
    identity.update(STUDENT)
    response = start(client, path)
    assert (response.status_code, response.json()["detail"]) == (
        409,
        "results_step_incomplete",
    )
    enter_scores(client, plan, path)
    identity.update(username="outsider")
    assert start(client, path).status_code == 403
    identity.update(username="teacher", groups=["docenti"])
    assert start(client, path).status_code == 403
    assert db.query(models.ClassPathDeepDiveSession).count() == 0


def test_teacher_override_without_result_cannot_launch(api):
    client, db, group, identity = api
    plan, path = deep_dive_path(client, group)
    response = client.put(
        f"/teacher/paths/{path['id']}/steps/{path['steps'][0]['id']}/progress/student",
        json={"state": "done"},
    )
    assert response.status_code == 200, response.text
    identity.update(STUDENT)
    assert student_row(client)["done"] == 1
    response = start(client, path)
    assert (response.status_code, response.json()["detail"]) == (
        409,
        "results_step_incomplete",
    )


def test_strict_order_locks_the_deep_dive_until_the_administration(api):
    client, db, group, identity = api
    plan, path = deep_dive_path(client, group, mode="strict")
    identity.update(STUDENT)
    assert student_row(client)["steps"][1]["state"] == "locked"
    response = start(client, path)
    assert (response.status_code, response.json()["detail"]) == (
        409,
        "class_path_step_locked",
    )
    enter_scores(client, plan, path)
    assert start(client, path).status_code == 200


def test_removing_the_deep_dive_keeps_the_administration_done(api):
    client, db, group, identity = api
    plan, path = deep_dive_path(client, group)
    identity.update(STUDENT)
    enter_scores(client, plan, path)
    marker(db, start(client, path).json()["session_id"])
    assert student_row(client)["done"] == 2
    identity.update(username="teacher", groups=["docenti"])
    response = save(client, path, [admin_input(plan, path["steps"][0]["id"])])
    assert response.status_code == 200, response.text
    identity.update(STUDENT)
    row = student_row(client)
    assert (row["done"], row["total"]) == (1, 1)
    assert row["steps"][0]["completion_kind"] == "guided_entry"
    assert db.query(models.ClassPathStepEvidence).count() == 1


@pytest.mark.parametrize("case", ["deleted-result", "invalidated-entry"])
def test_lost_administration_result_undoes_the_deep_dive(api, case):
    client, db, group, identity = api
    plan, path = deep_dive_path(client, group)
    identity.update(STUDENT)
    entry = enter_scores(client, plan, path)
    marker(db, start(client, path).json()["session_id"])
    assert student_row(client)["done"] == 2
    if case == "deleted-result":
        db.delete(db.get(models.QuestionnaireResult, entry["result"]["id"]))
    else:
        db.get(models.ClassPathStepEvidence, entry["evidence_id"]).invalidated_at = (
            datetime.now(timezone.utc)
        )
    db.commit()
    row = student_row(client)
    assert row["done"] == 0
    assert [step["state"] for step in row["steps"]] == ["not_done", "not_done"]
