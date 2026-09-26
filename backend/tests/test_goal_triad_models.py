"""Nuove tabelle e colonne della triade: persistono e rispettano i vincoli."""
import pytest
from sqlalchemy.exc import IntegrityError
from backend import models
from backend.tests.artifact_database import artifact_session


def test_triad_tables_roundtrip():
    with artifact_session() as db:
        goal = models.PersonalGoal(username='alice', title='Parlare in pubblico',
                                   method=[{'kind': 'own', 'id': 1}])
        db.add(goal); db.flush()
        db.add(models.GoalResourceLink(goal_id=goal.id, kind='reading', target_id='s1', role='origin'))
        db.add(models.PersonalStrategy(username='alice', text='Ripeto a voce'))
        db.add(models.GoalReview(goal_id=goal.id, outcome='reached', commitment='enough', satisfaction='much'))
        db.add(models.ResultReading(username='alice', session_id='s1', questionnaire_type='QSA',
                                    strengths=['C1'], growth_areas=['C3'], note='Mi agito'))
        db.commit()
        assert db.query(models.GoalResourceLink).one().role == 'origin'
        assert db.query(models.PersonalGoal).one().method == [{'kind': 'own', 'id': 1}]
        assert db.query(models.GoalReview).one().outcome == 'reached'


def test_link_role_defaults_to_related_and_reading_is_unique_per_session():
    with artifact_session() as db:
        goal = models.PersonalGoal(username='alice', title='x'); db.add(goal); db.flush()
        db.add(models.GoalResourceLink(goal_id=goal.id, kind='card', target_id='c1')); db.commit()
        assert db.query(models.GoalResourceLink).one().role == 'related'
        assert db.query(models.PersonalGoal).one().method == []
        db.add(models.ResultReading(username='alice', session_id='s1', questionnaire_type='QSA'))
        db.add(models.ResultReading(username='alice', session_id='s1', questionnaire_type='QSA'))
        with pytest.raises(IntegrityError):
            db.flush()
