"""HTTP regressions for table management, model selection and contextual help."""
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import auth, models
from backend.routes import tavolo


@pytest.fixture
def table_api(tmp_path, monkeypatch):
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    for model in (models.Config, models.ModelPreset, models.Counselor, models.Tavolo, models.TavoloRevision):
        model.__table__.create(engine)
    Session = sessionmaker(bind=engine)
    with Session() as db:
        db.add(models.Config(key='feature_tavolo', value='true'))
        db.commit()
    def session():
        with Session() as db:
            yield db
    identity = {'username': 'table-owner'}
    app = FastAPI()
    app.include_router(tavolo.router)
    app.dependency_overrides[tavolo.get_db] = session
    app.dependency_overrides[auth.get_identity_view_as] = lambda: identity
    monkeypatch.setattr(tavolo, 'TAVOLO_STORAGE_DIR', str(tmp_path))
    with TestClient(app) as client:
        yield client, Session, identity
    engine.dispose()


def create(client):
    response = client.post('/tavolo', json={})
    assert response.status_code == 200
    return response.json()


def test_rename_preserves_graph_and_delete_removes_revisions_and_capture(table_api):
    client, Session, _ = table_api
    view = create(client)
    path = f"/tavolo/{view['id']}"
    assert client.post(path + '/save', json={'title': 'First'}).status_code == 200
    response = client.patch(path, json={'title': '  New title  '})
    assert response.status_code == 200
    assert response.json()['title'] == 'New title'
    assert response.json()['graph'] == view['graph']
    assert response.json()['index'] == view['index']
    assert client.get('/tavolo').json()[0]['title'] == 'New title'
    assert client.patch(path, json={'title': '   '}).status_code == 422
    assert client.patch(path, json={'title': 'x' * 81}).status_code == 422
    assert client.post(path + '/capture', files={'file': ('map.png', b'\x89PNG\r\n\x1a\npayload', 'image/png')}).status_code == 200
    with Session() as db:
        from pathlib import Path
        capture = Path(db.get(models.Tavolo, view['id']).capture_path)
        assert capture.exists()
    assert client.delete(path).status_code == 200
    assert not capture.exists()
    assert client.get(path).status_code == 404
    assert client.get('/tavolo').json() == []
    with Session() as db:
        assert db.query(models.TavoloRevision).count() == 0


def test_other_people_cannot_rename_delete_or_ask_about_a_table(table_api):
    client, _, identity = table_api
    view = create(client)
    path = f"/tavolo/{view['id']}"
    identity['username'] = 'someone-else'
    assert client.patch(path, json={'title': 'Hijacked'}).status_code == 403
    assert client.delete(path).status_code == 403
    assert client.post(path + '/help', json={'question': 'What is here?'}).status_code == 403
    identity['username'] = 'table-owner'
    assert client.get(path).json()['title'] is None


def test_latest_edit_is_in_saved_rendition_and_stale_edits_are_rejected(table_api):
    client, _, _ = table_api
    view = create(client)
    path = f"/tavolo/{view['id']}"
    graph = {'title': '', 'nodes': [{'id': 'a', 'label': 'The last words'}], 'edges': []}
    edit = client.put(path, json={'graph': graph, 'base_index': 0})
    assert edit.status_code == 200
    assert client.put(path, json={'graph': graph, 'base_index': 0}).status_code == 409
    saved = client.post(path + '/save', json={'title': 'Work', 'lang': 'en'}).json()
    assert 'The last words' in saved['rendition']
    assert saved['index'] == 1


def test_local_and_cloud_models_follow_the_same_configuration_check(table_api, monkeypatch):
    client, _, _ = table_api
    monkeypatch.setattr(tavolo, '_diagram_fallback', lambda db: None)
    for provider in ('ollama', 'openai'):
        monkeypatch.setattr(tavolo, '_resolve_counselor', lambda db, id: (provider, 'model', None, 'Counselor', False, None))
        result = client.get('/tavolo/capabilities?counselor_id=29')
        assert result.status_code == 200
        assert result.json() == {'available': True, 'fallback_origin': None}
    monkeypatch.setattr(tavolo, '_resolve_counselor', lambda db, id: (None,) * 6)
    assert client.get('/tavolo/capabilities?counselor_id=29').json()['available'] is False


def test_a_counselor_without_preset_uses_the_global_model_and_reports_cloud_backup(table_api, monkeypatch):
    client, Session, _ = table_api
    with Session() as db:
        db.add_all([models.Config(key='active_provider', value='ollama'), models.Config(key='model_name', value='local-model')])
        db.commit()
    monkeypatch.setattr(tavolo, '_resolve_counselor', lambda db, id: (None, None, 'persona', 'Omar', False, None))
    monkeypatch.setattr(tavolo, '_diagram_fallback', lambda db: ('openai', 'cloud-model', False, None))
    assert client.get('/tavolo/capabilities?counselor_id=29').json() == {'available': True, 'fallback_origin': 'external'}
    with Session() as db:
        assert tavolo._model_candidates(db, 29)[0][:2] == ('ollama', 'local-model')


def test_help_reads_current_content_and_history_without_modifying_the_map(table_api, monkeypatch):
    client, Session, _ = table_api
    view = create(client)
    path = f"/tavolo/{view['id']}"
    graph = {'title': 'My plan', 'nodes': [
        {'id': 'a', 'label': 'Accepted idea'},
        {'id': 'b', 'label': 'Unaccepted suggestion', 'state': 'pending', 'by': 'model'},
    ], 'edges': []}
    client.put(path, json={'graph': graph, 'base_index': 0})
    calls = []
    class FakeAI:
        def __init__(self, db):
            self.config = {}
        def call_model(self, **kwargs):
            calls.append(kwargs)
            return json.dumps({'reply': 'Choose the next step and explain its link.'})
    monkeypatch.setattr(tavolo, 'AIService', FakeAI)
    monkeypatch.setattr(tavolo, '_resolve_counselor', lambda db, id: ('ollama', f'counselor-{id}', None, 'Omar', False, None))
    monkeypatch.setattr(tavolo, '_diagram_fallback', lambda db: None)
    before = client.get(path).json()
    reply = client.post(path + '/help', json={
        'question': 'How do I connect these ideas?', 'counselor_id': 29, 'lang': 'en',
        'history': [{'question': 'Where do I start?', 'reply': 'Name one idea.'}],
    })
    assert reply.status_code == 200
    assert 'next step' in reply.json()['reply']
    assert calls[0]['model'] == 'counselor-29'
    assert 'Accepted idea' in calls[0]['user_message']
    assert 'Unaccepted suggestion' not in calls[0]['user_message']
    assert 'Where do I start?' in calls[0]['user_message']
    assert 'Language of the table: en' in calls[0]['user_message']
    assert client.get(path).json() == before
    with Session() as db:
        assert db.query(models.TavoloRevision).count() == 2


def test_help_failure_and_feature_disabled_leave_existing_tables_untouched(table_api, monkeypatch):
    client, Session, _ = table_api
    view = create(client)
    path = f"/tavolo/{view['id']}"
    async def unavailable(*args, **kwargs):
        return None, True
    monkeypatch.setattr(tavolo, '_ask_model', unavailable)
    assert client.post(path + '/help', json={'question': 'Help?'}).status_code == 503
    assert client.get(path).json() == view
    with Session() as db:
        db.get(models.Config, 'feature_tavolo').value = 'false'
        db.commit()
    assert client.get('/tavolo/capabilities').status_code == 404
    assert client.patch(path, json={'title': 'Changed'}).status_code == 404
    assert client.delete(path).status_code == 404


if __name__ == '__main__':
    raise SystemExit(pytest.main([__file__, '-q']))
