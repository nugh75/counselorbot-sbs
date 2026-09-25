"""Migrazione una tantum del libretto nelle nuove sedi (spec § 8)."""
from backend import models
from backend.booklet_migration import MIGRATION_ACTION, migrate_booklets
from backend.personal_timeline import ensure_personal_timeline
from backend.tests.artifact_database import artifact_session
from backend.visual_tools import load_workspace


def booklet(db, **data):
    qtype = data.pop('questionnaire_type', 'QSA'); session_id = data.pop('session_id', None)
    row = models.StudentBooklet(username='alice', questionnaire_type=qtype, session_id=session_id, data=data)
    db.add(row); db.commit(); return row


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


def test_booklet_timeline_events_are_renamed_without_booklet_link():
    with artifact_session() as db:
        result(db)
        row = booklet(db, session_id='s1', bio_context='Laboratorio di fisica',
                      bio_discovery='Imparare facendo', bio_keywords='esperimenti')
        ensure_personal_timeline(db, 'alice')
        sync_booklet_biography(db, row)
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


from backend.booklet_timeline import sync_booklet_biography


def test_migration_is_idempotent():
    with artifact_session() as db:
        result(db)
        booklet(db, session_id='s1', objective='Leggere più veloce')
        migrate_booklets(db, 'alice'); migrate_booklets(db, 'alice')
        assert db.query(models.PersonalGoal).count() == 1
        assert db.query(models.Log).filter_by(username='alice', action=MIGRATION_ACTION).count() == 1
