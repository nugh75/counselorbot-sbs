"""P11: at-rest encryption of stored content (docs/privacy/02-progettazione.md §4.2, §9, TEST_DB=postgres|sqlite)."""
import json

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend import models
from backend.memory_service import SessionMemory
from backend.privacy import PrivacyError, crypto, field_crypto, keys
from backend.tests.artifact_database import artifact_session

NOTE = "Giulia ha paura delle interrogazioni di matematica"
EMAIL = "Giulia.Rossi@example.com"


@pytest.fixture
def db(monkeypatch):
    monkeypatch.setenv("PRIVACY_KEK", keys.generate_kek())
    monkeypatch.setenv("PRIVACY_DB_ENCRYPTION", "on")
    with artifact_session() as session:
        field_crypto.configure(lambda: Session(bind=session.get_bind(), join_transaction_mode="create_savepoint"))
        field_crypto.ensure_keys()
        yield session
    field_crypto.configure()


def _raw(db, sql):
    return db.execute(text(sql)).scalar()


def test_text_column_is_stored_sealed_and_read_back_in_clear(db):
    db.add(models.TeacherNote(username="s1", author_username="t1", text=NOTE))
    db.commit()
    stored = _raw(db, "SELECT text FROM teacher_notes")
    key_id = crypto.key_id_of(stored)
    assert stored.startswith(f"v1.{key_id}.") and key_id.startswith("content-") and NOTE not in stored
    assert db.query(models.TeacherNote).one().text == NOTE


@pytest.mark.parametrize("model, column, kwargs", [
    (models.IdeaReference, "text", dict(username="s1", session_id="x", filename="a.txt", kind="txt")),
    (models.LearnerProfileReflection, "note", dict(username="s1")),
])
def test_other_sensitive_columns_are_sealed(db, model, column, kwargs):
    db.add(model(**{column: NOTE}, **kwargs))
    db.commit()
    stored = _raw(db, f"SELECT {column} FROM {model.__tablename__}")
    assert stored.startswith("v1.") and NOTE not in stored
    assert getattr(db.query(model).one(), column) == NOTE


def test_value_moved_to_another_column_does_not_open(db):
    sealed = field_crypto.seal_text("teacher_notes", "text", NOTE)
    with pytest.raises(PrivacyError):
        field_crypto.open_text("idea_references", "text", sealed)


def test_records_stored_in_clear_stay_readable(db, monkeypatch):
    monkeypatch.setenv("PRIVACY_DB_ENCRYPTION", "off")
    db.add(models.TeacherNote(username="s1", author_username="t1", text=NOTE))
    db.add(models.Log(action="chat_message", details={"user_input": NOTE, "mode": "guided"}))
    db.commit()
    assert _raw(db, "SELECT text FROM teacher_notes") == NOTE
    monkeypatch.setenv("PRIVACY_DB_ENCRYPTION", "on")
    assert db.query(models.TeacherNote).one().text == NOTE
    assert db.query(models.Log).one().details == {"user_input": NOTE, "mode": "guided"}


def test_text_that_only_looks_like_a_version_is_not_a_token(db):
    for value in ("v1.2 release notes", "v1.0", "v2.k.AAAA"):
        assert field_crypto.open_text("teacher_notes", "text", value) == value


def test_switch_off_writes_in_clear(db, monkeypatch):
    monkeypatch.setenv("PRIVACY_DB_ENCRYPTION", "")
    db.add(models.TeacherNote(username="s1", author_username="t1", text=NOTE))
    db.commit()
    assert _raw(db, "SELECT text FROM teacher_notes") == NOTE


def test_log_details_seal_only_content_keys(db):
    details = {"user_input": NOTE, "bot_response": "Proviamo insieme", "envelope": {"system": "prompt"},
               "mode": "guided", "credential_source": "system", "cost_usd": 0.5}
    db.add(models.Log(action="chat_message", details=details))
    db.commit()
    stored = _raw(db, "SELECT details FROM logs")
    stored = json.loads(stored) if isinstance(stored, str) else stored
    for key in ("user_input", "bot_response", "envelope"):
        assert stored[key].startswith("v1.")
    assert NOTE not in json.dumps(stored) and "prompt" not in json.dumps(stored)
    assert (stored["mode"], stored["credential_source"], stored["cost_usd"]) == ("guided", "system", 0.5)
    assert db.query(models.Log).one().details == details
    # Plain keys stay usable in JSON-path filters.
    assert db.query(models.Log).filter(models.Log.details["credential_source"].as_string() == "system").count() == 1


def test_log_email_is_sealed_and_searched_by_blind_index(db):
    db.add(models.Log(action="chat_message", email=EMAIL, details={}))
    db.add(models.Log(action="chat_message", email="altro@example.com", details={}))
    db.commit()
    stored = _raw(db, "SELECT email FROM logs WHERE id = 1")
    assert stored.startswith("v1.") and EMAIL.lower() not in stored.lower()
    index = field_crypto.blind_index("logs.email", " giulia.rossi@EXAMPLE.com ")
    found = db.query(models.Log).filter(models.Log.email_idx == index).one()
    assert found.email == EMAIL
    assert index != field_crypto.blind_index("logs.username", EMAIL)
    assert EMAIL.lower() not in _raw(db, "SELECT email_idx FROM logs WHERE id = 1").lower()


def test_session_memory_file_is_sealed_and_legacy_files_still_read(db, tmp_path):
    memory = SessionMemory(memory_dir=tmp_path)
    memory.record_interaction("s1", user_message="Voglio migliorare in matematica",
                              transcript_user=NOTE, bot_response="Proviamo insieme")
    raw = (tmp_path / "s1.md").read_text()
    assert raw.startswith("v1.content-") and NOTE not in raw and "\n" not in raw.strip()
    assert memory.get_transcript("s1")[0] == {"role": "user", "content": NOTE}
    (tmp_path / "old.md").write_text(field_crypto.open_text("session_memory", "file", raw, "s1"))
    assert memory.get_transcript("old")[0]["content"] == NOTE
    # A sealed file renamed to another session does not open.
    (tmp_path / "s2.md").write_text(raw)
    with pytest.raises(PrivacyError):
        memory.get_transcript("s2")


def test_sealed_value_without_its_key_fails_closed(db, monkeypatch):
    db.add(models.TeacherNote(username="s1", author_username="t1", text=NOTE))
    db.commit()
    db.expire_all()
    monkeypatch.setenv("PRIVACY_KEK", keys.generate_kek())
    field_crypto.configure(lambda: Session(bind=db.get_bind(), join_transaction_mode="create_savepoint"))
    with pytest.raises(PrivacyError):
        db.query(models.TeacherNote).one()
