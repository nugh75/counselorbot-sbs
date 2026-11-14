"""Class noticing uses all current journey sources, with explicit filters."""
import pytest
from backend import models
from backend.tests.test_teacher_class_compilations import class_results_api  # noqa: F401
from backend.tests.test_student_noticing import model, analyse  # noqa: F401


def test_class_overview_groups_verified_items_with_students(class_results_api, model):
    client, _, _, (owned, *_) = class_results_api
    url = f'/admin/groups/{owned}/noticing?lang=it'
    initial = client.get(url).json()
    assert initial['status'] == 'missing' and model == []
    for student in initial['students']:
        analyse(client, f'/admin/groups/{owned}/students/{student["username"]}/noticing?lang=it')
    ready = client.post(url).json()
    assert ready['status'] == 'ready' and ready['generated_at']
    assert ready['charts']['kinds']['resource'] == 1
    assert ready['themes'][0]['student_count'] == 1
    assert client.get(url).json() == ready


def test_filters_and_staleness(class_results_api, model):
    client, db, _, (owned, *_) = class_results_api
    url = f'/admin/groups/{owned}/noticing'
    for student in client.get(url).json()['students']:
        analyse(client, f'/admin/groups/{owned}/students/{student["username"]}/noticing')
    client.post(url)
    filtered = client.get(url + '?instrument=QSA').json()
    assert filtered['status'] == 'missing'
    assert filtered['instruments'] == ['QSA', 'SAVICKAS']
    assert client.get(url + '?instrument=UNKNOWN').json()['status'] == 'empty'
    assert client.get(url + '?days=0').status_code == 422
    row = db.query(models.Log).filter_by(session_id='owned-qsa', action='chat_message').one()
    row.details = {'user_input': 'Conversazione modificata', 'bot_response': 'x'}; db.commit()
    assert client.get(url).json()['status'] == 'stale'


@pytest.mark.parametrize('role', ['owner', 'colleague', 'unrelated', 'student'])
def test_class_noticing_keeps_class_permissions(class_results_api, model, role):
    client, db, identity, (owned, shared, private, _) = class_results_api
    identity.update(username=role, groups=['studenti' if role == 'student' else 'docenti'])
    visible = {'owner': {owned, shared}, 'colleague': {shared}, 'unrelated': {private}}
    for group_id in (owned, shared):
        expected = 403 if role == 'student' else 200 if group_id in visible.get(role, set()) else 404
        assert client.get(f'/admin/groups/{group_id}/noticing').status_code == expected
        assert client.post(f'/admin/groups/{group_id}/noticing').status_code == (409 if expected == 200 else expected)
