"""Activities carry optional dates; the personal timeline keeps only past milestones and institution events."""
import pytest
from pydantic import ValidationError
from backend import models
from backend.personal_timeline import IMPORT_ACTION, MIGRATION_ACTION, ensure_personal_timeline
from backend.visual_tools import (Action, PERSONAL_ACTION, PersonalWorkspace, SavePersonalWorkspace, Workspace,
                                   load_workspace, save_workspace)
from backend.tests.artifact_database import artifact_session


def seed_personal_workspace(db, username, workspace):
    # A pre-imported legacy marker makes ensure_personal_timeline skip straight to migration.
    db.add(models.Log(username=username, session_id=None, action=PERSONAL_ACTION, details={'workspace': workspace}))
    db.add(models.Log(username=username, session_id=None, action=IMPORT_ACTION, details={'source_revisions': []}))
    db.commit()


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


def legacy_workspace(events, actions=None):
    return {'actions': actions or [], 'timeline': {'title': 'Il mio percorso', 'events': events}}


def test_migrate_isolated_future_event_becomes_activity():
    with artifact_session() as db:
        seed_personal_workspace(db, 'alice', legacy_workspace([
            dict(id='iso-future', title='Colloquio', period='2027', tense='future',
                 date_mode='point', start_date='2027-01-15', planned='Portare il CV'),
        ]))
        ensure_personal_timeline(db, 'alice')
        work = load_workspace(db, None, 'alice')['workspace']
        assert work['timeline']['events'] == []
        assert len(work['actions']) == 1
        action = work['actions'][0]
        assert action['id'] == 'm-iso-future'
        assert action['date_mode'] == 'point' and action['start_date'] == '2027-01-15'
        assert action['detail'] == 'Portare il CV'
        assert action['stage'] == 'todo'


def test_migrate_future_event_merges_into_linked_activity():
    with artifact_session() as db:
        seed_personal_workspace(db, 'alice', legacy_workspace(
            [dict(id='linked-future', title='Corso', period='2027', tense='future',
                  date_mode='point', start_date='2027-02-20', planned='Extra info', action_ids=['a1'])],
            actions=[dict(id='a1', title='Attività esistente', detail='Nota originale', stage='doing')]))
        ensure_personal_timeline(db, 'alice')
        work = load_workspace(db, None, 'alice')['workspace']
        assert work['timeline']['events'] == []
        assert len(work['actions']) == 1
        action = work['actions'][0]
        assert action['id'] == 'a1'
        assert action['date_mode'] == 'point' and action['start_date'] == '2027-02-20'
        assert action['detail'] == 'Nota originale\n\nExtra info'
        assert action['stage'] == 'doing'


def test_migrate_appends_portfolio_and_personal_links_as_trace():
    with artifact_session() as db:
        item = models.PortfolioItem(username='alice', title='Lavoro salvato', images=[])
        db.add(item); db.flush()
        missing_id = item.id + 999
        seed_personal_workspace(db, 'alice', legacy_workspace([
            dict(id='iso-future', title='Colloquio', period='2027', tense='future',
                 date_mode='point', start_date='2027-01-15', planned='Portare il CV',
                 personal_links=['booklet', 'notebook'], symbol='change',
                 portfolio=[dict(id=item.id), dict(id=missing_id)]),
        ]))
        ensure_personal_timeline(db, 'alice')
        work = load_workspace(db, None, 'alice')['workspace']
        assert work['timeline']['events'] == []
        action = work['actions'][0]
        assert action['detail'] == (
            f'Portare il CV\n\nPortfolio: Lavoro salvato, #{missing_id}\nCollegamenti: Taccuino, Libretto')


def test_migrate_truncates_detail_but_keeps_trace():
    with artifact_session() as db:
        item = models.PortfolioItem(username='alice', title='Titolo lungo di lavoro', images=[])
        db.add(item); db.flush()
        seed_personal_workspace(db, 'alice', legacy_workspace([
            dict(id='iso-future', title='Colloquio', period='2027', tense='future',
                 date_mode='point', start_date='2027-01-15', planned='x' * 1000,
                 portfolio=[dict(id=item.id)]),
        ]))
        ensure_personal_timeline(db, 'alice')
        work = load_workspace(db, None, 'alice')['workspace']
        action = work['actions'][0]
        trace = '\n\nPortfolio: Titolo lungo di lavoro'
        assert len(action['detail']) == 1000
        assert action['detail'].endswith(trace)


def test_migrate_two_future_events_on_same_activity_conflicting_dates_split():
    with artifact_session() as db:
        seed_personal_workspace(db, 'alice', legacy_workspace(
            [dict(id='first-future', title='Passo 1', period='2027', tense='future',
                  date_mode='point', start_date='2027-01-15', planned='Prima nota',
                  reflection='Prima riflessione', action_ids=['a1']),
             dict(id='second-future', title='Passo 2', period='2027', tense='future',
                  date_mode='point', start_date='2027-02-20', planned='Seconda nota',
                  reflection='Seconda riflessione', action_ids=['a1'])],
            actions=[dict(id='a1', title='Attività condivisa', stage='doing')]))
        ensure_personal_timeline(db, 'alice')
        work = load_workspace(db, None, 'alice')['workspace']
        assert work['timeline']['events'] == []
        assert {a['id'] for a in work['actions']} == {'a1', 'm-second-future'}
        a1 = next(a for a in work['actions'] if a['id'] == 'a1')
        assert a1['date_mode'] == 'point' and a1['start_date'] == '2027-01-15'
        assert a1['detail'] == 'Prima nota'
        assert a1['reflection'] == 'Prima riflessione'
        m2 = next(a for a in work['actions'] if a['id'] == 'm-second-future')
        assert m2['date_mode'] == 'point' and m2['start_date'] == '2027-02-20'
        assert m2['detail'] == 'Seconda nota'
        assert m2['reflection'] == 'Seconda riflessione'


def test_migrate_two_future_events_on_same_activity_matching_dates_merge_and_append():
    with artifact_session() as db:
        seed_personal_workspace(db, 'alice', legacy_workspace(
            [dict(id='first-future', title='Passo 1', period='2027', tense='future',
                  date_mode='point', start_date='2027-01-15', planned='Prima nota',
                  reflection='Prima riflessione', action_ids=['a1']),
             dict(id='second-future', title='Passo 2', period='2027', tense='future',
                  date_mode='point', start_date='2027-01-15', planned='Seconda nota',
                  reflection='Seconda riflessione', action_ids=['a1'])],
            actions=[dict(id='a1', title='Attività condivisa', stage='doing')]))
        ensure_personal_timeline(db, 'alice')
        work = load_workspace(db, None, 'alice')['workspace']
        assert work['timeline']['events'] == []
        assert [a['id'] for a in work['actions']] == ['a1']
        a1 = work['actions'][0]
        assert a1['date_mode'] == 'point' and a1['start_date'] == '2027-01-15'
        assert a1['detail'] == 'Prima nota\n\nSeconda nota'
        assert a1['reflection'] == 'Prima riflessione\n\nSeconda riflessione'


def test_migrate_two_future_events_same_date_reflection_overflow_splits_instead_of_raising():
    # Regression: Action.reflection has max_length=1000; two 600-char reflections
    # merged would exceed it and previously raised an uncaught ValidationError.
    with artifact_session() as db:
        first_reflection = 'a' * 600
        second_reflection = 'b' * 600
        seed_personal_workspace(db, 'alice', legacy_workspace(
            [dict(id='first-future', title='Passo 1', period='2027', tense='future',
                  date_mode='point', start_date='2027-01-15', reflection=first_reflection, action_ids=['a1']),
             dict(id='second-future', title='Passo 2', period='2027', tense='future',
                  date_mode='point', start_date='2027-01-15', reflection=second_reflection, action_ids=['a1'])],
            actions=[dict(id='a1', title='Attività condivisa', stage='doing')]))
        ensure_personal_timeline(db, 'alice')
        work = load_workspace(db, None, 'alice')['workspace']
        assert work['timeline']['events'] == []
        assert {a['id'] for a in work['actions']} == {'a1', 'm-second-future'}
        a1 = next(a for a in work['actions'] if a['id'] == 'a1')
        m2 = next(a for a in work['actions'] if a['id'] == 'm-second-future')
        assert a1['reflection'] == first_reflection
        assert m2['reflection'] == second_reflection


def test_migrate_updates_goal_links_and_removes_duplicates():
    with artifact_session() as db:
        seed_personal_workspace(db, 'alice', legacy_workspace([
            dict(id='iso-future', title='Colloquio', period='2027', tense='future',
                 date_mode='point', start_date='2027-01-15', planned='Portare il CV'),
        ]))
        goal = models.PersonalGoal(username='alice', title='Trovare lavoro')
        other_goal = models.PersonalGoal(username='alice', title='Altro obiettivo')
        db.add_all([goal, other_goal]); db.flush()
        db.add(models.GoalResourceLink(goal_id=goal.id, kind='event', target_id='iso-future'))
        # other_goal already links the resulting activity directly: the event link must be dropped, not duplicated.
        db.add(models.GoalResourceLink(goal_id=other_goal.id, kind='action', target_id='m-iso-future'))
        db.add(models.GoalResourceLink(goal_id=other_goal.id, kind='event', target_id='iso-future'))
        goal_revision, other_revision = goal.revision, other_goal.revision
        db.commit()
        ensure_personal_timeline(db, 'alice')
        db.expire_all()
        links = db.query(models.GoalResourceLink).all()
        assert {(l.goal_id, l.kind, l.target_id) for l in links} == {
            (goal.id, 'action', 'm-iso-future'),
            (other_goal.id, 'action', 'm-iso-future'),
        }
        assert db.get(models.PersonalGoal, goal.id).revision == goal_revision + 1
        assert db.get(models.PersonalGoal, other_goal.id).revision == other_revision + 1


def test_migrate_clears_assignment_event_link_and_moves_reflection():
    with artifact_session() as db:
        assignment = models.TeacherAssignment(author_username='teacher', author_name='Teacher', group_id=1,
            group_name='Class A', source_kind='reading', source_id=1, snapshot={'title': 'Lettura'},
            request_id='req-9', request_hash='hash-9')
        db.add(assignment); db.flush()
        action_id, event_id = f'assignment-{assignment.id}', f'assignment-{assignment.id}-event'
        seed_personal_workspace(db, 'alice', legacy_workspace(
            [dict(id=event_id, title='Lettura', period='2027', tense='future',
                  date_mode='point', start_date='2027-03-01', planned='Leggi il capitolo 3', reflection='Mi ha aiutato')],
            actions=[dict(id=action_id, title='Lettura assegnata', stage='todo')]))
        work_row = models.AssignmentWork(assignment_id=assignment.id, username='alice', action_id=action_id, event_id=event_id)
        db.add(work_row); db.commit()
        ensure_personal_timeline(db, 'alice')
        db.expire_all()
        assert db.get(models.AssignmentWork, work_row.id).event_id is None
        work = load_workspace(db, None, 'alice')['workspace']
        action = next(a for a in work['actions'] if a['id'] == action_id)
        assert action['reflection'] == 'Mi ha aiutato'


def test_migrate_assignment_reflection_carryover_clamps_instead_of_raising():
    # Regression: the carryover onto an existing assignment-<id> activity cannot
    # split into a second activity (there is nowhere else for it to go), so an
    # overflow is clamped to 1000 chars ending with an ellipsis instead of raising.
    with artifact_session() as db:
        assignment = models.TeacherAssignment(author_username='teacher', author_name='Teacher', group_id=1,
            group_name='Class A', source_kind='reading', source_id=1, snapshot={'title': 'Lettura'},
            request_id='req-9', request_hash='hash-9')
        db.add(assignment); db.flush()
        action_id, event_id = f'assignment-{assignment.id}', f'assignment-{assignment.id}-event'
        existing_reflection = 'x' * 900
        event_reflection = 'y' * 900
        seed_personal_workspace(db, 'alice', legacy_workspace(
            [dict(id=event_id, title='Lettura', period='2027', tense='future',
                  date_mode='point', start_date='2027-03-01', reflection=event_reflection)],
            actions=[dict(id=action_id, title='Lettura assegnata', stage='todo', reflection=existing_reflection)]))
        work_row = models.AssignmentWork(assignment_id=assignment.id, username='alice', action_id=action_id, event_id=event_id)
        db.add(work_row); db.commit()
        ensure_personal_timeline(db, 'alice')
        db.expire_all()
        assert db.get(models.AssignmentWork, work_row.id).event_id is None
        work = load_workspace(db, None, 'alice')['workspace']
        action = next(a for a in work['actions'] if a['id'] == action_id)
        assert len(action['reflection']) == 1000
        assert action['reflection'].endswith('…')


def test_migrate_leaves_past_and_institution_events_untouched():
    with artifact_session() as db:
        seed_personal_workspace(db, 'alice', legacy_workspace([
            dict(id='past-event', title='Diploma', period='2020', tense='past'),
            dict(id='inst-event', title='Open day', period='2027', tense='future', institution_event='some-slug'),
        ]))
        revision_before = load_workspace(db, None, 'alice')['revision']
        ensure_personal_timeline(db, 'alice')
        state = load_workspace(db, None, 'alice')
        ids = {e['id'] for e in state['workspace']['timeline']['events']}
        assert ids == {'past-event', 'inst-event'}
        assert state['workspace']['actions'] == []
        assert state['revision'] == revision_before


def test_migration_is_idempotent():
    with artifact_session() as db:
        seed_personal_workspace(db, 'alice', legacy_workspace([
            dict(id='iso-future', title='Colloquio', period='2027', tense='future',
                 date_mode='point', start_date='2027-01-15', planned='Portare il CV'),
        ]))
        ensure_personal_timeline(db, 'alice')
        revision_after_first = load_workspace(db, None, 'alice')['revision']
        ensure_personal_timeline(db, 'alice')
        revision_after_second = load_workspace(db, None, 'alice')['revision']
        assert revision_after_first == revision_after_second
        assert db.query(models.Log).filter_by(username='alice', action=MIGRATION_ACTION).count() == 1
