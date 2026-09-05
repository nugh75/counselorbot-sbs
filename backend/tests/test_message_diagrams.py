import pytest
import hashlib
from fastapi import HTTPException
from backend.tests.artifact_database import artifact_session

from backend import models, pii
from backend.diagram_render import parse_spec
from backend.message_diagrams import attach_message_diagrams, list_diagrams, save_diagram, session_owner


@pytest.fixture
def db():
    with artifact_session() as session:
        session.add(models.QuestionnaireResult(session_id="session-a", username="alice", questionnaire_type="QSA"))
        session.commit()
        yield session


def diagram(title="Piano"):
    return parse_spec({"type": "flow", "title": title,
                       "nodes": [{"id": "a", "label": "Studiare"}, {"id": "b", "label": "Verificare"}],
                       "edges": [{"from": "a", "to": "b"}]})


def test_diagram_survives_new_session_and_attaches_only_to_its_message(db):
    save_diagram(db, session_id="session-a", username="alice", source_text="Studia e verifica.", instruction="", spec=diagram())
    db.expire_all()
    messages = [{"role": "student", "text": "Studia e verifica."},
                {"role": "counselor", "text": "Studia e verifica."},
                {"role": "counselor", "text": "Un altro messaggio."}]
    attached = attach_message_diagrams(db, "session-a", messages)
    assert "```diagram" in attached[1]["text"]
    assert attached[0] == messages[0] and attached[2] == messages[2]
    assert "```diagram" not in messages[1]["text"]
    assert list_diagrams(db, "different-session") == []


def test_latest_successful_revision_is_restored(db):
    for title in ("Prima versione", "Ultima versione"):
        save_diagram(db, session_id="session-a", username="alice", source_text="Risposta", instruction=title, spec=diagram(title))
    restored = list_diagrams(db, "session-a", "alice")
    assert len(restored) == 1
    assert restored[0]["spec"]["title"] == "Ultima versione"
    assert list_diagrams(db, "session-a", "bob") == []


def test_redacted_storage_still_matches_browser_hash_and_pdf_transcript(db, monkeypatch):
    monkeypatch.setattr(pii, '_pii_redact_enabled', True)
    source = 'Scrivi a prova@example.invalid e verifica.'
    save_diagram(db, session_id='session-a', username='alice', source_text=source,
                 instruction=source, spec=diagram(source))
    saved = list_diagrams(db, 'session-a')[0]
    assert saved['source_key'] == hashlib.sha256(source.encode()).hexdigest()
    assert 'prova@example.invalid' not in str(saved)
    transcript = [{'role':'counselor', 'text':pii.redact(source)}]
    assert '```diagram' in attach_message_diagrams(db, 'session-a', transcript)[0]['text']


def test_other_user_cannot_read_or_generate_for_session(db):
    assert session_owner(db, "session-a", {"username": "alice"}) == "alice"
    with pytest.raises(HTTPException) as exc:
        session_owner(db, "session-a", {"username": "bob"})
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException) as exc:
        session_owner(db, "session-a", {})
    assert exc.value.status_code == 401


def test_frozen_and_active_narrative_sessions_have_an_owner(db):
    db.add(models.FrozenSession(session_id="frozen", username="alice", questionnaire_type="IDEA", data={}))
    db.add(models.Log(action="chat_message", session_id="active", username="alice", details={}))
    db.commit()
    for session_id in ("frozen", "active"):
        assert session_owner(db, session_id, {"username": "alice"}) == "alice"
        with pytest.raises(HTTPException) as exc:
            session_owner(db, session_id, {"username": "bob"})
        assert exc.value.status_code == 404
