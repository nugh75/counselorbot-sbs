"""pQBL login, owner checks and the streamed upload (#998) on the Postgres test DB."""
import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, class_access, database, file_lock, models
from backend.routes import pqbl
from backend.tests.test_class_access import ANONYMOUS, STUDENT, TEACHER, db  # noqa: F401

OTHER = {**STUDENT, "username": "bruno"}
ADMIN = {"username": "root", "groups": ["admin"], "is_admin": True, "is_researcher": False, "authenticated": True}
PDF = ("doc.pdf", b"%PDF-1.4 owned", "application/pdf")


def _client(db, identity):
    app = FastAPI()
    app.include_router(pqbl.router)
    app.add_exception_handler(class_access.ToolAccessDenied, class_access.tool_access_denied_handler)
    app.dependency_overrides[database.get_db] = lambda: db
    for dependency in (auth.get_identity_view_as, auth.get_identity):
        app.dependency_overrides[dependency] = lambda: identity
    return TestClient(app)


@pytest.fixture(autouse=True)
def storage(tmp_path, monkeypatch):
    monkeypatch.setattr(pqbl, "PQBL_STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr(pqbl, "_generate_all_chunks", lambda document_id: None)
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("COUNSELORBOT_PROFILE", raising=False)
    return tmp_path


@pytest.fixture
def owned(db):  # noqa: F811
    """A ready document of anna with one question and one learning session."""
    db.add(models.PqblDocument(id="doc-anna", username="anna", text_hash="h", status="ready", chunks_total=1))
    question = models.PqblQuestion(document_id="doc-anna", skill="s", position=0, question_text="Q?", options=[
        {"key": "A", "text": "yes", "correct": True, "feedback": "ok"},
        {"key": "B", "text": "no", "correct": False, "feedback": "ko"},
    ])
    db.add(question)
    db.add(models.PqblSession(id="ses-anna", document_id="doc-anna", username="anna", mode="learning"))
    db.add(models.PqblSession(id="fin-anna", document_id="doc-anna", username="anna", mode="final_test"))
    db.commit()
    return question.id


def _routes(question_id):
    return [
        ("post", "/pqbl/upload", {"files": {"file": PDF}}),
        ("get", "/pqbl/documents/doc-anna", {}),
        ("post", "/pqbl/sessions", {"json": {"document_id": "doc-anna", "mode": "learning"}}),
        ("get", "/pqbl/sessions/ses-anna/questions", {}),
        ("post", "/pqbl/sessions/ses-anna/answer", {"json": {"question_id": question_id, "option_key": "A"}}),
        ("post", "/pqbl/sessions/fin-anna/final-test", {"json": {"answers": {}}}),
        ("get", "/pqbl/sessions/ses-anna/summary", {}),
    ]


def test_every_route_requires_login(db, owned):  # noqa: F811
    with _client(db, ANONYMOUS) as client:
        for method, url, kwargs in _routes(owned):
            assert getattr(client, method)(url, **kwargs).status_code == 401, url


def test_owner_reads_and_writes(db, owned):  # noqa: F811
    with _client(db, STUDENT) as client:
        for method, url, kwargs in _routes(owned)[1:]:
            response = getattr(client, method)(url, **kwargs)
            assert response.status_code == 200, (url, response.text)


@pytest.mark.parametrize("identity", [OTHER, TEACHER])
def test_other_users_get_404(db, owned, identity):  # noqa: F811
    with _client(db, identity) as client:
        for method, url, kwargs in _routes(owned)[1:]:
            assert getattr(client, method)(url, **kwargs).status_code == 404, url


def test_admin_reads_but_cannot_write(db, owned):  # noqa: F811
    with _client(db, ADMIN) as client:
        assert client.get("/pqbl/documents/doc-anna").status_code == 200
        assert client.get("/pqbl/sessions/ses-anna/questions").status_code == 200
        assert client.get("/pqbl/sessions/ses-anna/summary").status_code == 200
        assert client.post("/pqbl/sessions/ses-anna/answer",
                           json={"question_id": owned, "option_key": "A"}).status_code == 404
        assert client.post("/pqbl/sessions", json={"document_id": "doc-anna"}).status_code == 404


def test_admin_on_server_needs_break_glass(db, owned, monkeypatch):  # noqa: F811
    monkeypatch.setenv("ENVIRONMENT", "production")
    with _client(db, ADMIN) as client:
        assert client.get("/pqbl/documents/doc-anna").status_code == 404


def test_upload_is_owned_and_not_reused_across_users(db, storage):  # noqa: F811
    with _client(db, STUDENT) as client:
        first = client.post("/pqbl/upload", files={"file": PDF}).json()
    assert first["reused"] is False
    doc = db.get(models.PqblDocument, first["document_id"])
    assert doc.username == "anna"
    with open(doc.file_path, "rb") as f:
        assert f.read() == PDF[1]
    doc.status = "ready"
    db.commit()
    with _client(db, STUDENT) as client:
        assert client.post("/pqbl/upload", files={"file": PDF}).json()["reused"] is True
    with _client(db, OTHER) as client:
        other = client.post("/pqbl/upload", files={"file": PDF}).json()
    assert other["reused"] is False and other["document_id"] != first["document_id"]


def test_oversized_upload_is_rejected_and_removed(db, storage, monkeypatch):  # noqa: F811
    monkeypatch.setattr(pqbl, "MAX_UPLOAD_BYTES", 8)
    monkeypatch.setattr(pqbl, "UPLOAD_CHUNK_BYTES", 4)
    with _client(db, STUDENT) as client:
        response = client.post("/pqbl/upload", files={"file": PDF})
    assert response.status_code == 413, response.text
    assert not [name for name in os.listdir(storage) if name.endswith(".pdf")]
    assert db.query(models.PqblDocument).count() == 0


def test_second_concurrent_upload_gets_429(db, storage):  # noqa: F811
    with open(pqbl._upload_lock_path("anna"), "a+b") as held:
        assert file_lock.lock(held, blocking=False)
        with _client(db, STUDENT) as client:
            assert client.post("/pqbl/upload", files={"file": PDF}).status_code == 429
        with _client(db, OTHER) as client:
            assert client.post("/pqbl/upload", files={"file": PDF}).status_code == 200
    with _client(db, STUDENT) as client:
        assert client.post("/pqbl/upload", files={"file": PDF}).status_code == 200
