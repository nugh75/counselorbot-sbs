"""Migrazione una tantum del libretto nelle nuove sedi (spec § 8)."""
from backend import booklet_migration, models
from backend.booklet_migration import MIGRATION_ACTION, migrate_all_booklets, migrate_booklets
from backend.personal_timeline import ensure_personal_timeline
from backend.tests.artifact_database import artifact_session
from backend.visual_tools import SavePersonalWorkspace, load_workspace, save_workspace


def booklet(db, **data):
    qtype = data.pop('questionnaire_type', 'QSA'); session_id = data.pop('session_id', None)
    row = models.StudentBooklet(username='alice', questionnaire_type=qtype, session_id=session_id, data=data)
    db.add(row); db.commit(); return row


def legacy_biography_event(db, row, title):
    """Tappa come la scriveva la sincronizzazione del libretto, rimossa con il libretto."""
    state = load_workspace(db, None, 'alice')
    work = state['workspace']
    work['timeline']['events'].append(dict(id=f'booklet-{row.id}-0123456789abcdef', title=title, period='—',
                                           tense='past', personal_links=['booklet']))
    work['timeline']['title'] = 'Timeline'
    save_workspace(db, None, 'alice', SavePersonalWorkspace(revision=state['revision'], workspace=work))


def result(db, session_id='s1', qtype='QSA'):
    db.add(models.QuestionnaireResult(session_id=session_id, username='alice', questionnaire_type=qtype, scores={}))
    db.commit()


def test_reading_goal_method_and_review():
    with artifact_session() as db:
        result(db)
        booklet(db, session_id='s1', strength=['C1'], growth_area=['C3'], motivation='Voglio stare calmo',
                objective='Gestire l’ansia agli orali', strategy='- Respiro prima di parlare\n- Simulazioni',
                period_end='2026-11-30', commitment='enough', final_satisfaction='much', discovery='Posso farcela')
        counts = migrate_booklets(db, 'alice')
        reading = db.query(models.ResultReading).one()
        assert reading.strengths == ['C1'] and reading.growth_areas == ['C3'] and 'Posso farcela' in reading.note
        goal = db.query(models.PersonalGoal).one()
        assert goal.title == 'Gestire l’ansia agli orali' and goal.review_date == '2026-11-30'
        assert [s.text for s in db.query(models.PersonalStrategy).order_by(models.PersonalStrategy.id)] == ['Respiro prima di parlare', 'Simulazioni']
        assert len(goal.method) == 2 and all(m['kind'] == 'own' for m in goal.method)
        link = db.query(models.GoalResourceLink).one()
        assert (link.kind, link.target_id, link.role) == ('reading', 's1', 'origin')
        review = db.query(models.GoalReview).one()
        assert (review.commitment, review.satisfaction, review.outcome) == ('enough', 'much', 'partial')
        assert counts['goals'] == 1


def test_booklet_without_result_goes_to_notebook():
    with artifact_session() as db:
        booklet(db, questionnaire_type='IDEA', strength=['Curiosità'], discovery='Mi piace progettare')
        migrate_booklets(db, 'alice')
        notebook = db.query(models.LearnerProfileRevision).filter_by(username='alice').order_by(models.LearnerProfileRevision.id.desc()).first()
        assert notebook.source == 'migration' and 'Dal libretto (IDEA' in notebook.data['notes']
        assert db.query(models.ResultReading).count() == 0


def test_event_booklet_becomes_past_milestone():
    with artifact_session() as db:
        booklet(db, questionnaire_type='EVENTO_STUDIO', title='Esame di chimica', event_role='protagonist',
                strength=['Schema'], growth_area=['Ansia'], discovery='Ripetere a voce aiuta')
        migrate_booklets(db, 'alice')
        events = load_workspace(db, None, 'alice')['workspace']['timeline']['events']
        event = next(e for e in events if e['title'] == 'Esame di chimica')
        assert event['tense'] == 'past' and event['review']['worked'] == ['Schema'] and event['review']['role'] == 'protagonist'


def test_event_booklet_with_its_synced_milestone_keeps_one_milestone_and_the_old_keys():
    # Chiavi reali della vecchia scheda evento; salvarla creava già una tappa booklet-{id}-….
    with artifact_session() as db:
        row = booklet(db, questionnaire_type='EVENTO_STUDIO', title='Esame di chimica', bio_date='2026-03-12',
                      event_role='observer', bio_context='Laboratorio', strength=['Schema'], growth_area=['Ansia'],
                      discovery='Ripetere a voce aiuta', objective='Cinque minuti di domande', strategy='Giovedì')
        ensure_personal_timeline(db, 'alice')
        legacy_biography_event(db, row, 'Laboratorio')
        migrate_booklets(db, 'alice')
        events = load_workspace(db, None, 'alice')['workspace']['timeline']['events']
        assert len(events) == 1
        review = events[0]['review']
        assert review['try_next'] == 'Cinque minuti di domande' and review['how_when'] == 'Giovedì'
        assert review['reading'] == 'Laboratorio\n\nRipetere a voce aiuta' and review['role'] == 'observer'


def test_booklet_timeline_events_are_renamed_without_booklet_link():
    with artifact_session() as db:
        result(db)
        row = booklet(db, session_id='s1', bio_context='Laboratorio di fisica',
                      bio_discovery='Imparare facendo', bio_keywords='esperimenti')
        ensure_personal_timeline(db, 'alice')
        legacy_biography_event(db, row, 'Laboratorio di fisica')
        migrate_booklets(db, 'alice')
        events = load_workspace(db, None, 'alice')['workspace']['timeline']['events']
        event = next(e for e in events if e['title'] == 'Laboratorio di fisica')
        assert event['id'].startswith('migrated-')
        assert 'booklet' not in event['personal_links']
        assert event['review']['discovery'] == 'Imparare facendo' and event['review']['keywords'] == 'esperimenti'


def test_legacy_goal_reflections_become_budget_reviews():
    with artifact_session() as db:
        done = models.PersonalGoal(username='alice', title='Fatto', reflection='Ci sono riuscito', status='completed')
        archived = models.PersonalGoal(username='alice', title='Lasciato', reflection='Meglio altro', status='archived')
        active = models.PersonalGoal(username='alice', title='In corso', reflection='Ancora niente', status='active')
        db.add_all([done, archived, active]); db.commit()
        counts = migrate_booklets(db, 'alice')
        reviews = {r.goal_id: r for r in db.query(models.GoalReview)}
        assert reviews[done.id].outcome == 'reached' and reviews[done.id].learned == 'Ci sono riuscito'
        assert reviews[archived.id].outcome == 'abandoned'
        assert active.id not in reviews
        assert counts['reviews'] == 2


def test_booklet_links_become_reading_origin_or_are_dropped():
    with artifact_session() as db:
        result(db)
        row = booklet(db, session_id='s1', strength=['C1'])
        goal = models.PersonalGoal(username='alice', title='Primo')
        other = models.PersonalGoal(username='alice', title='Secondo')
        db.add_all([goal, other]); db.commit()
        db.add_all([
            models.GoalResourceLink(goal_id=goal.id, kind='booklet', target_id=str(row.id)),
            models.GoalResourceLink(goal_id=other.id, kind='booklet', target_id='999'),
        ]); db.commit()
        counts = migrate_booklets(db, 'alice')
        links = {l.goal_id: l for l in db.query(models.GoalResourceLink)}
        assert (links[goal.id].kind, links[goal.id].target_id, links[goal.id].role) == ('reading', 's1', 'origin')
        assert links.get(other.id) is None
        assert counts['readings'] >= 1


def test_migration_is_idempotent():
    with artifact_session() as db:
        result(db)
        booklet(db, session_id='s1', objective='Leggere più veloce')
        migrate_booklets(db, 'alice'); migrate_booklets(db, 'alice')
        assert db.query(models.PersonalGoal).count() == 1
        assert db.query(models.Log).filter_by(username='alice', action=MIGRATION_ACTION).count() == 1


def test_one_failing_user_does_not_stop_the_others(monkeypatch):
    with artifact_session() as db:
        for user in ('alice', 'bob'):
            db.add(models.StudentBooklet(username=user, questionnaire_type='QSA', data={'objective': f'Obiettivo di {user}'}))
        db.commit()
        real = booklet_migration.migrate_booklets

        def flaky(db, username):
            if username == 'alice':
                raise RuntimeError('broken booklet')
            return real(db, username)

        monkeypatch.setattr(booklet_migration, 'migrate_booklets', flaky)
        assert migrate_all_booklets(db) == 1
        assert [g.username for g in db.query(models.PersonalGoal)] == ['bob']
        assert db.get(models.Config, booklet_migration.DONE_CONFIG_KEY) is None


def test_a_complete_run_survives_the_log_purge():
    with artifact_session() as db:
        db.add(models.StudentBooklet(username='alice', questionnaire_type='QSA', data={'objective': 'Leggere di più'}))
        db.commit()
        assert migrate_all_booklets(db) == 1
        assert db.get(models.Config, booklet_migration.DONE_CONFIG_KEY) is not None
        db.query(models.Log).filter_by(action=MIGRATION_ACTION).delete(); db.commit()
        assert migrate_all_booklets(db) == 0
        assert db.query(models.PersonalGoal).count() == 1
