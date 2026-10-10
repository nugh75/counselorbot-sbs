"""Deleting assignments (#188): only while no student has started them.

Synthetic PostgreSQL only. Planning or submitting (any AssignmentWork row) keeps
the assignment: the teacher revokes it instead. An assignment used by a path
step, even a removed one, is kept until the step goes.
"""

from backend import models
# Shared synthetic class, goal and teacher.
from backend.tests.test_path_templates import api, as_user  # noqa: F401


def send(client, data, request_id):
    response = client.post("/teacher/assignments", json=dict(source_id=data["goal"].id, group_id=data["group"].id,
                                                              request_id=request_id))
    assert response.status_code == 201, response.text
    return response.json()


def test_delete_only_while_no_student_has_started(api):  # noqa: F811
    client, db, identity, data = api
    untouched = send(client, data, "request-188-free")
    started = send(client, data, "request-188-work")
    db.add(models.AssignmentWork(assignment_id=started["id"], username="alice", action_id="assignment-x"))
    db.commit()
    listed = {row["id"]: row["delete_blocker"] for row in client.get("/teacher/assignments").json()}
    assert listed == {untouched["id"]: None, started["id"]: "assignment_started"}
    refused = client.post(f"/teacher/assignments/{started['id']}/delete")
    assert refused.status_code == 409 and refused.json()["detail"] == "assignment_started"
    # Another teacher cannot delete it, and the answer is the same as for a missing one.
    as_user(identity, dict(username="colleague", name="Colleague", authenticated=True, is_admin=False, groups=["docenti"]))
    assert client.post(f"/teacher/assignments/{untouched['id']}/delete").status_code == 404
    as_user(identity, dict(username="teacher", name="Teacher One", authenticated=True, is_admin=False, groups=["docenti"]))
    assert client.post(f"/teacher/assignments/{untouched['id']}/delete").json() == {"deleted": untouched["id"]}
    db.expire_all()
    assert db.get(models.TeacherAssignment, untouched["id"]) is None
    assert db.query(models.AssignmentRecipient).filter_by(assignment_id=untouched["id"]).count() == 0
    assert db.get(models.AssignmentLearningSettings, untouched["id"]) is None
    as_user(identity, "alice")
    assert [row["id"] for row in client.get("/user/assignments").json()] == [started["id"]]


def test_assignment_used_by_a_path_step_is_kept(api):  # noqa: F811
    client, _db, _identity, data = api
    assignment = send(client, data, "request-188-path")
    path = client.post(f"/teacher/groups/{data['group'].id}/paths", json={"title": "Plan"}).json()
    saved = client.put(f"/teacher/paths/{path['id']}", json={"revision": path["revision"], "title": "Plan", "mode": "recommended",
                                                             "steps": [{"step_type": "assignment", "assignment_id": assignment["id"]}]})
    assert saved.status_code == 200, saved.text
    # Removing the step still keeps it: removed steps keep their history.
    client.put(f"/teacher/paths/{path['id']}", json={"revision": saved.json()["revision"], "title": "Plan",
                                                     "mode": "recommended", "steps": []})
    refused = client.post(f"/teacher/assignments/{assignment['id']}/delete")
    assert refused.status_code == 409 and refused.json()["detail"] == "assignment_in_path"
