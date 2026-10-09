"""Compass and Assistant class access through their HTTP interfaces (#92)."""
import json
from unittest.mock import Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend import auth, class_access, database, models, orientation
from backend.routes import orientation as compass, site_chat
from backend.tests.artifact_database import artifact_session

STUDENT = {"username": "compass.student", "groups": ["studenti"], "authenticated": True,
           "is_admin": False, "is_researcher": False}


@pytest.fixture
def fixture(monkeypatch):
    with artifact_session() as db:
        db.add_all([models.Instrument(code=code, is_active=True, target_audience="student",
                                      tool_category="assessment" if code in orientation.TOOL_GROUPS[0][1] else "guided")
                    for code in orientation.TOOL_IDS if code != "pqbl"])
        group = models.StudentGroup(code="GR-C19", name="Synthetic class", owner_username="teacher", is_active=True)
        db.add(group)
        db.flush()
        settings = models.ClassSettings(group_id=group.id, disabled_tool_keys=[], updated_by="teacher")
        db.add_all([settings, models.GroupMembership(group_id=group.id, username=STUDENT["username"])])
        db.commit()
        app = FastAPI()
        app.include_router(compass.router)
        app.include_router(site_chat.router)
        app.add_exception_handler(class_access.ToolAccessDenied, class_access.tool_access_denied_handler)
        identity = dict(STUDENT)
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        app.dependency_overrides[database.get_personal_ai_db] = lambda: db
        ai = Mock()
        ai.return_value.config = {}
        ai.return_value.get_response.return_value = json.dumps({"reply": "Choose a learning tool.", "recommendations": []})
        monkeypatch.setattr(orientation, "AIService", ai)
        monkeypatch.setattr(site_chat, "AIService", ai)
        monkeypatch.setattr(site_chat, "get_index", Mock(return_value=Mock(search=Mock(return_value=[]))))
        monkeypatch.setattr(site_chat, "read_platform_guide", lambda: None)
        with TestClient(app) as client:
            yield client, db, settings, identity, ai


def disable(db, settings, *keys):
    settings.disabled_tool_keys = list(keys)
    db.commit()


def test_disabled_compass_blocks_new_sessions_and_messages_but_keeps_existing_reads(fixture):
    client, db, settings, _, ai = fixture
    original = client.post('/orientation/sessions', json={"language": "en"})
    assert original.status_code == 200
    session = original.json()
    disable(db, settings, 'bussola')
    for path, payload in [('/orientation/sessions', {}),
                          ('/orientation/sessions', {"new_session": True}),
                          (f'/orientation/sessions/{session["session_id"]}/message', {"message": "Help me study"})]:
        response = client.post(path, json=payload)
        assert response.status_code == 403
        assert response.json() == {"detail": "tool_disabled_for_class", "tool": "bussola"}
    assert client.get(f'/orientation/sessions/{session["session_id"]}').json() == session
    ai.assert_not_called()


def test_disabled_assistant_returns_http_403_before_retrieval_or_model(fixture):
    client, db, settings, _, ai = fixture
    disable(db, settings, 'assistant')
    response = client.post('/site-chat/stream', json={"message": "Where is my notebook?", "collection": "counselorbot"})
    assert response.status_code == 403
    assert response.json() == {"detail": "tool_disabled_for_class", "tool": "assistant"}
    ai.assert_not_called()


def test_disabled_compass_bypasses_new_student_orientation_gate(fixture):
    client, db, settings, _, _ = fixture
    assert client.get('/orientation/status').json()['required'] is True
    disable(db, settings, 'bussola')
    status = client.get('/orientation/status').json()
    assert status['eligible'] is True
    assert status['required'] is False
    assert status['completed'] is False
    assert status['legacy_exempt'] is False


@pytest.mark.parametrize('path', ['json', 'text', 'offline'])
def test_recommendations_only_include_enabled_tools_in_every_response_path(fixture, path):
    client, db, settings, _, ai = fixture
    disable(db, settings, 'QSA', 'QAP', 'IDEA')
    session = client.post('/orientation/sessions', json={"language": "en"}).json()
    if path == 'json':
        ai.return_value.get_response.return_value = json.dumps({
            "reply": "Explore your learning strategies.", "recommendations": [
                {"id": "QSA", "reason": "Disabled"}, {"id": "QAP", "reason": "Disabled"},
                {"id": "IDEA", "reason": "Disabled"}, {"id": "QSAr", "reason": "Enabled"}]})
    elif path == 'text':
        ai.return_value.get_response.return_value = 'QSA, QAP and IDEA are unavailable. Try QSAr.'
    else:
        ai.return_value.get_response.side_effect = orientation.AIError('Synthetic provider unavailable')
    response = client.post(f'/orientation/sessions/{session["session_id"]}/message',
                           json={"message": "I want to study and plan my career project", "language": "en"})
    assert response.status_code == 200
    assert [r['id'] for r in response.json()['recommendations']] == ['QSAr']


@pytest.mark.parametrize('path', ['offline', 'json'])
@pytest.mark.parametrize('disabled,expected', [(['QSA', 'QSAr'], ['ZTPI']),
                                              (list(orientation.TOOL_GROUPS[0][1]), [])])
def test_starting_questionnaire_falls_back_or_has_no_card(fixture, disabled, expected, path):
    client, db, settings, _, ai = fixture
    disable(db, settings, *disabled)
    if path == 'offline':
        ai.return_value.get_response.side_effect = orientation.AIError('Synthetic offline response')
    else:
        ai.return_value.get_response.return_value = json.dumps({"reply": "Find your next step.", "recommendations": [{"id": "QSA", "reason": "Disabled"}]})
    session = client.post('/orientation/sessions', json={"language": "en"}).json()
    response = client.post(f'/orientation/sessions/{session["session_id"]}/message',
                           json={"message": "What should I do first?", "language": "en"})
    assert response.status_code == 200
    assert [r['id'] for r in response.json()['recommendations']] == expected
    prompt = ai.return_value.get_response.call_args.args[1]
    assert 'the first recommendation is always QSA' not in prompt
    assert ('use ZTPI' if expected else 'Do not propose a starting-tool card') in prompt


def test_existing_cards_are_pruned_on_resume_and_hold_without_hiding_history(fixture):
    client, db, settings, _, ai = fixture
    row = models.OrientationSession(session_id='old-session', username=STUDENT['username'], language='en',
                                    status='in_progress', messages=[{"role": "assistant", "content": "Saved discussion of QSA"}],
                                    recommendations=[{"id": "QSA", "reason": "Old choice"}, {"id": "ZTPI", "reason": "Allowed"}])
    db.add(row)
    db.commit()
    disable(db, settings, 'QSA')
    historical = client.get('/orientation/sessions/old-session').json()
    assert historical['messages'][0]['content'] == 'Saved discussion of QSA'
    assert len(historical['recommendations']) == 2
    resumed = client.post('/orientation/sessions', json={}).json()
    assert [item['id'] for item in resumed['recommendations']] == ['ZTPI']
    ai.return_value.get_response.return_value = json.dumps({"reply": "Let us reflect.", "state_action": "hold", "recommendations": []})
    held = client.post('/orientation/sessions/old-session/message', json={"message": "Thank you"}).json()
    assert [item['id'] for item in held['recommendations']] == ['ZTPI']


def test_disabled_compass_cannot_complete_an_existing_session(fixture):
    client, db, settings, _, _ = fixture
    db.add(models.OrientationSession(session_id='cannot-complete', username=STUDENT['username'], language='en',
                                    status='in_progress', messages=[], recommendations=[{"id": "QSA", "reason": "Saved"}]))
    db.commit()
    disable(db, settings, 'bussola')
    response = client.post('/orientation/sessions/cannot-complete/complete')
    assert response.status_code == 403
    assert client.get('/orientation/sessions/cannot-complete').json()['status'] == 'in_progress'


@pytest.mark.parametrize('groups', [['docenti'], ['researchers'], ['admins']])
def test_staff_keeps_support_access_despite_class_denials(fixture, groups):
    client, db, settings, identity, ai = fixture
    identity.update(groups=groups, is_admin=groups == ['admins'], is_researcher=groups == ['researchers'])
    disable(db, settings, 'bussola', 'assistant', 'QSA')
    assert client.post('/orientation/sessions', json={}).status_code == 200
    assert client.post('/site-chat/stream', json={"message": "Help"}).status_code == 200
    assert ai.called
    assert client.get('/orientation/status').json()['required'] is False


def test_multiple_class_union_and_inactive_memberships_still_apply(fixture):
    client, db, settings, _, _ = fixture
    disable(db, settings, 'bussola', 'assistant')
    second = models.StudentGroup(code='GR-C19B', name='Second class', owner_username='teacher', is_active=False)
    db.add(second)
    db.flush()
    db.add(models.GroupMembership(group_id=second.id, username=STUDENT['username']))
    db.commit()
    assert client.post('/orientation/sessions', json={}).status_code == 403
    second.is_active = True
    db.commit()
    assert client.post('/orientation/sessions', json={}).status_code == 200
    assert client.post('/site-chat/stream', json={"message": "Help"}).status_code == 200
    assert client.get('/orientation/status').json()['required'] is True


def test_teacher_only_recommendations_stay_available_to_staff(fixture):
    client, db, _, identity, ai = fixture
    identity['groups'] = ['docenti']
    db.query(models.Instrument).filter_by(code='OBIETTIVO_DOCENZA').one().target_audience = 'teacher'
    db.commit()
    ai.return_value.get_response.return_value = json.dumps({"reply": "Set a teaching goal.", "recommendations": [
        {"id": "OBIETTIVO_DOCENZA", "reason": "Your class goal"}]})
    session = client.post('/orientation/sessions', json={}).json()
    reply = client.post(f'/orientation/sessions/{session["session_id"]}/message', json={"message": "A goal for my class"}).json()
    assert [item['id'] for item in reply['recommendations']] == ['OBIETTIVO_DOCENZA']


def test_opening_uses_enabled_catalog_and_platform_disable_wins(fixture):
    client, db, settings, _, ai = fixture
    db.add(models.LearnerProfileRevision(username=STUDENT['username'], source='manual', data={"goal": "Learn better"}))
    db.query(models.Instrument).filter_by(code='QAP').one().is_active = False
    settings.locked_tool_keys = {"QAP": {"enabled": True}}
    disable(db, settings, 'QSA')
    ai.return_value.get_response.return_value = json.dumps({"reply": "Your learning goal.", "recommendations": [
        {"id": "QSA", "reason": "Disabled"}, {"id": "QAP", "reason": "Inactive"}, {"id": "QSAr", "reason": "Enabled"}]})
    reply = client.post('/orientation/sessions', json={"language": "en"})
    assert reply.status_code == 200
    assert [item['id'] for item in reply.json()['recommendations']] == ['QSAr']
    prompt = ai.return_value.get_response.call_args.args[1]
    catalog = prompt.split('closed catalog of tools enabled for this user:')[1].split('This availability list')[0]
    assert '- QSA:' not in catalog and '- QAP:' not in catalog
    assert '- QSAr:' in catalog


def test_session_reads_preserve_owner_boundary_even_when_disabled(fixture):
    client, db, settings, identity, _ = fixture
    saved = client.post('/orientation/sessions', json={}).json()
    disable(db, settings, 'bussola')
    identity['username'] = 'another.student'
    assert client.get(f'/orientation/sessions/{saved["session_id"]}').status_code == 404
    assert client.post(f'/orientation/sessions/{saved["session_id"]}/message', json={"message": "Other user"}).status_code == 404


def test_classless_student_keeps_default_support_access(fixture):
    client, db, settings, _, _ = fixture
    disable(db, settings, 'bussola', 'assistant')
    db.query(models.GroupMembership).filter_by(username=STUDENT['username']).delete()
    db.commit()
    assert client.post('/orientation/sessions', json={}).status_code == 200
    assert client.post('/site-chat/stream', json={"message": "Help"}).status_code == 200


@pytest.mark.parametrize('state', ['hold', 'merge', 'replace', 'clear'])
def test_new_turn_rechecks_class_changes_for_every_card_state(fixture, state):
    client, db, settings, _, ai = fixture
    db.add(models.OrientationSession(session_id='changed-tools', username=STUDENT['username'], language='en', status='in_progress',
                                    messages=[], recommendations=[{"id": "QSA", "reason": "Old"}]))
    db.commit()
    disable(db, settings, 'QSA')
    ai.return_value.get_response.return_value = json.dumps({"reply": "We can reflect.", "state_action": state,
                                                           "recommendations": [{"id": "QSA", "reason": "Disabled"}]})
    reply = client.post('/orientation/sessions/changed-tools/message', json={"message": "Thank you"})
    assert reply.status_code == 200
    assert reply.json()['recommendations'] == []


def test_offline_followup_without_enabled_questionnaires_has_no_starting_card(fixture):
    client, db, settings, _, ai = fixture
    disable(db, settings, *orientation.TOOL_GROUPS[0][1])
    ai.return_value.get_response.side_effect = orientation.AIError('Synthetic offline response')
    session = client.post('/orientation/sessions', json={"language": "en"}).json()
    for message in ['What should I do first?', 'I do not know where to start']:
        reply = client.post(f'/orientation/sessions/{session["session_id"]}/message', json={"message": message, "language": "en"})
        assert reply.status_code == 200
        assert reply.json()['recommendations'] == []
