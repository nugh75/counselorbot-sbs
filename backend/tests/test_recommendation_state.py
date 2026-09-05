import asyncio

import pytest
from backend.tests.artifact_database import artifact_session
from backend import recommendation_service as service
from backend.routes.chat import update_session_recommendation, RecommendationStateUpdate
from fastapi import HTTPException


@pytest.fixture
def db():
    with artifact_session() as session:
        service.record(session, session_id='fixture', username='alice', recommendation_type='strategy', payloads=[{'slug':'active','name':'Recupero attivo','description':'Chiudi il libro.','matched_on':['C1']}])
        yield session


def test_choice_and_feedback_survive_catalog_refresh(db):
    service.set_state(db, session_id='fixture', username='alice', recommendation_type='strategy', slug='active', status='tried', helpful=True)
    service.record(db, session_id='fixture', username='alice', recommendation_type='strategy', payloads=[{'slug':'active','name':'Nome aggiornato'}], turn_index=3)
    item = service.list_for_session(db, session_id='fixture', username='alice')['strategy'][0]
    assert item['status']=='tried' and item['helpful'] is True and item['matched_on']==['C1']
    assert item['name']=='Nome aggiornato'


def test_patch_cannot_touch_another_users_recommendation(db):
    args=dict(session_id='fixture', recommendation_type='strategy', slug='active', update=RecommendationStateUpdate(status='selected'), db=db)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(update_session_recommendation(**args, identity={'username':'bob'}))
    assert exc.value.status_code == 404
    assert service.list_for_session(db, session_id='fixture', username='alice')['strategy'][0]['status']=='proposed'
    result=asyncio.run(update_session_recommendation(**args, identity={'username':'alice'}))
    assert result['strategy'][0]['status']=='selected'


def test_archive_is_recoverable_and_feedback_can_be_cleared(db):
    args=dict(session_id='fixture', username='alice', recommendation_type='strategy', slug='active')
    service.set_state(db, **args, status='dismissed', helpful=False)
    assert 'active' in service.slugs_shown(db, session_id='fixture', username='alice', recommendation_type='strategy')
    service.set_state(db, **args, status='proposed', helpful=None)
    item=service.list_for_session(db, session_id='fixture', username='alice')['strategy'][0]
    assert item['status']=='proposed' and item['helpful'] is None


def test_followup_gets_only_selected_or_explicitly_reopened_material(db, monkeypatch):
    monkeypatch.setattr(service, '_relocalize_strategies', lambda *args:None)
    args=dict(session_id='fixture', username='alice', language='it')
    assert service.conversation_context(db, **args, message='Altro argomento') == ''
    context=service.conversation_context(db, **args, message='Riprendiamo Recupero attivo')
    assert 'Chiudi il libro.' in context
    service.set_state(db, session_id='fixture', username='alice', recommendation_type='strategy', slug='active', status='selected')
    assert 'Recupero attivo' in service.conversation_context(db, **args, message='Come proseguo?')
