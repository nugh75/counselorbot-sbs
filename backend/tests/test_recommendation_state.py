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


def _question(db, slug='note-q', turn=1, step_id='affective', step_order=2):
    service.record(
        db, session_id='fixture', username='alice', recommendation_type='advice',
        payloads=[{'slug': slug, 'name': 'Che cosa cambieresti?', 'kind': 'question',
                   'step_id': step_id, 'step_order': step_order}],
        turn_index=turn,
    )


def _advice_item(db, slug='note-q'):
    entries = service.list_for_session(db, session_id='fixture', username='alice')['advice']
    return next(item for item in entries if item['slug'] == slug)


def test_only_a_question_can_be_retired(db):
    _question(db)
    service.set_state(db, session_id='fixture', username='alice',
                      recommendation_type='advice', slug='note-q', status='stale')
    item = _advice_item(db)
    assert item['status'] == 'stale'
    assert item['step_id'] == 'affective' and item['step_order'] == 2
    with pytest.raises(ValueError):
        service.set_state(db, session_id='fixture', username='alice',
                          recommendation_type='strategy', slug='active', status='stale')


def test_who_closed_the_question_is_recorded_and_cleared_on_reopen(db):
    _question(db)
    service.set_state(db, session_id='fixture', username='alice', recommendation_type='advice',
                      slug='note-q', status='closed', closed_by='conversation')
    assert _advice_item(db)['closed_by'] == 'conversation'
    # Riaperta dallo studente: chi l'aveva chiusa non conta piu', e la domanda
    # e' sottratta alla regola di decadenza.
    service.set_state(db, session_id='fixture', username='alice', recommendation_type='advice',
                      slug='note-q', status='proposed', revived=True)
    item = _advice_item(db)
    assert item['status'] == 'proposed' and item['closed_by'] is None and item['revived'] is True


def test_an_unknown_closer_is_refused(db):
    _question(db)
    with pytest.raises(ValueError):
        service.set_state(db, session_id='fixture', username='alice', recommendation_type='advice',
                          slug='note-q', status='closed', closed_by='counselor')


def test_the_students_own_close_is_attributed_to_the_student(db):
    _question(db)
    result = asyncio.run(update_session_recommendation(
        session_id='fixture', recommendation_type='advice', slug='note-q',
        update=RecommendationStateUpdate(status='closed'), db=db, identity={'username': 'alice'},
    ))
    item = next(entry for entry in result['advice'] if entry['slug'] == 'note-q')
    assert item['status'] == 'closed' and item['closed_by'] == 'student'
    result = asyncio.run(update_session_recommendation(
        session_id='fixture', recommendation_type='advice', slug='note-q',
        update=RecommendationStateUpdate(status='proposed'), db=db, identity={'username': 'alice'},
    ))
    item = next(entry for entry in result['advice'] if entry['slug'] == 'note-q')
    assert item['closed_by'] is None and item['revived'] is True


def test_state_survives_the_same_question_declared_again(db):
    _question(db)
    service.set_state(db, session_id='fixture', username='alice', recommendation_type='advice',
                      slug='note-q', status='closed', closed_by='conversation')
    _question(db, turn=5, step_id='cognitive', step_order=1)
    item = _advice_item(db)
    # Lo stato e' dello studente e resta; la fase e' del turno e si aggiorna.
    assert item['status'] == 'closed' and item['closed_by'] == 'conversation'
    assert item['step_id'] == 'cognitive' and item['step_order'] == 1
