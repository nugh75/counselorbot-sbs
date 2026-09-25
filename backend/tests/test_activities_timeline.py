"""Activities carry optional dates; the personal timeline keeps only past milestones and institution events."""
import pytest
from pydantic import ValidationError
from backend import models
from backend.visual_tools import Action, PersonalWorkspace, SavePersonalWorkspace, Workspace, load_workspace, save_workspace
from backend.tests.artifact_database import artifact_session


def test_action_dates_follow_event_rules():
    assert Action(id='a1', title='Studio', date_mode='point', start_date='2026-10-01').start_date == '2026-10-01'
    assert Action(id='a2', title='Corso', date_mode='period', start_date='2026-10-01', end_date='2026-10-20').end_date == '2026-10-20'
    assert Action(id='a3', title='Senza data').date_mode is None
    for bad in (dict(date_mode='point'), dict(start_date='2026-10-01'), dict(date_mode='period', start_date='2026-10-20', end_date='2026-10-01'), dict(date_mode='point', start_date='2026-02-30')):
        with pytest.raises(ValidationError):
            Action(id='x', title='x', **bad)
    assert Workspace(actions=[{'id': 'a', 'title': 'chat', 'date_mode': 'point', 'start_date': '2026-10-01'}]).actions[0].start_date == '2026-10-01'


def test_personal_workspace_rejects_personal_future_milestones():
    with artifact_session() as db:
        state = load_workspace(db, None, 'alice')
        work = state['workspace']
        work['timeline']['title'] = 'Il mio percorso'
        work['timeline']['events'] = [dict(id='f1', title='Laurea', period='2027', tense='future')]
        with pytest.raises(Exception) as raised:
            save_workspace(db, None, 'alice', SavePersonalWorkspace(revision=state['revision'], workspace=PersonalWorkspace.model_validate(work)))
        assert getattr(raised.value, 'status_code', None) == 422
        work['timeline']['events'] = [dict(id='p1', title='Diploma', period='2024', tense='past')]
        saved = save_workspace(db, None, 'alice', SavePersonalWorkspace(revision=state['revision'], workspace=PersonalWorkspace.model_validate(work)))
        assert [e['id'] for e in saved['workspace']['timeline']['events']] == ['p1']


def test_session_workspace_still_accepts_future_events():
    with artifact_session() as db:
        ws = Workspace.model_validate({'timeline': {'title': 'Piano personale', 'events': [dict(id='f1', title='Piano', period='2027', tense='future')]}})
        from backend.visual_tools import SaveWorkspace
        saved = save_workspace(db, 'session-1', 'alice', SaveWorkspace(revision=0, workspace=ws))
        assert saved['workspace']['timeline']['events'][0]['tense'] == 'future'
