import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from backend import auth, database, models
from backend.routes.visual_tools import router
from backend.tests.artifact_database import artifact_session
from backend.tests.test_visual_tools import workspace
from backend.visual_tools import SaveWorkspace, save_workspace
from backend.visual_personal import PersonalTransfer, transfer_to_personal


@pytest.fixture
def db():
    with artifact_session() as session:
        session.add(models.QuestionnaireResult(session_id='visual-a', username='alice', questionnaire_type='QSA'))
        session.add(models.LearnerProfileRevision(username='alice', source='manual', data={'notes': 'Originale', 'goal': 'Obiettivo', 'age': '22'}))
        session.add_all([models.StudentBooklet(username=user, questionnaire_type=kind, data={'title': title, 'student_notes': 'Nota libretto'}) for user, kind, title in [('alice', 'QSA', 'Mio'), ('bob', 'QSA', 'Altrui'), ('alice', 'ZTPI', 'Altro strumento')]])
        session.commit()
        save_workspace(session, 'visual-a', 'alice', SaveWorkspace(revision=0, workspace=workspace()))
        yield session


def request(db, **changes):
    from backend.visual_tools import load_workspace
    return PersonalTransfer(**({'revision': load_workspace(db, 'visual-a', 'alice')['revision'], 'entry': 'cards:card1', 'destination': 'notebook', 'field': 'notes', 'expected_text': 'Originale', 'text': 'Preferisco esempi', **changes}))


def test_context_read_only_and_owned_endpoints(db):
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[database.get_db] = lambda: db
    identity = {'username': 'alice'}
    app.dependency_overrides[auth.get_identity_view_as] = lambda: identity
    with TestClient(app) as client:
        path = '/session/visual-a/visual-tools/personal'
        result = client.get(path).json()
        assert [row['title'] for row in result['booklets']] == ['Mio']
        assert result['notebook']['notes'] == 'Originale'
        assert 'age' not in result['notebook']
        assert db.query(models.LearnerProfileRevision).count() == 1
        for admin in [False, True]:
            identity.update(username='bob', is_admin=admin)
            assert client.get(path).status_code == 403
            assert client.post(path, json=request(db).model_dump()).status_code == 403


def test_notebook_append_preserves_other_data_and_retry_is_idempotent(db):
    update = request(db)
    result = transfer_to_personal(db, 'visual-a', 'alice', update)
    assert result['status'] == 'saved'
    assert result['context']['notebook']['notes'].startswith('Originale\n\nPreferisco esempi\n(Tools')
    rows = db.query(models.LearnerProfileRevision).order_by(models.LearnerProfileRevision.id).all()
    assert len(rows) == 2 and rows[-1].data['age'] == '22' and rows[-1].data['goal'] == 'Obiettivo'
    assert rows[0].data['notes'] == 'Originale'
    assert transfer_to_personal(db, 'visual-a', 'alice', update)['status'] == 'duplicate'
    assert db.query(models.LearnerProfileRevision).count() == 2


@pytest.mark.parametrize('changes,status,detail', [
    ({'expected_text': 'Obsoleto'}, 409, 'personal_conflict'),
    ({'revision': 0}, 409, 'personal_conflict'),
    ({'entry': 'cards:missing'}, 422, 'personal_invalid'),
    ({'field': 'age'}, 422, 'personal_invalid'),
    ({'text': 'x' * 600}, 422, 'personal_limit'),
])
def test_rejects_stale_invalid_and_overlong_without_writes(db, changes, status, detail):
    with pytest.raises(HTTPException) as caught:
        transfer_to_personal(db, 'visual-a', 'alice', request(db, **changes))
    assert (caught.value.status_code, caught.value.detail) == (status, detail)
    assert db.query(models.LearnerProfileRevision).count() == 1


def test_new_booklet_retry_and_existing_sheet_preserve_notes(db):
    update = request(db, destination='booklet', field='student_notes', expected_text='')
    first = transfer_to_personal(db, 'visual-a', 'alice', update)
    retry = transfer_to_personal(db, 'visual-a', 'alice', update)
    assert retry['status'] == 'duplicate' and retry['booklet_id'] == first['booklet_id']
    assert db.query(models.StudentBooklet).count() == 4
    existing = db.query(models.StudentBooklet).filter_by(username='alice', questionnaire_type='QSA').order_by(models.StudentBooklet.id).first()
    result = transfer_to_personal(db, 'visual-a', 'alice', request(db, destination='booklet', booklet_id=existing.id, field='student_notes', expected_text='Nota libretto'))
    assert result['status'] == 'saved'
    assert existing.data['student_notes'].startswith('Nota libretto\n\nPreferisco esempi')
    assert existing.data['title'] == 'Mio'
    for other in db.query(models.StudentBooklet).filter(models.StudentBooklet.id != existing.id, models.StudentBooklet.id != first['booklet_id']):
        with pytest.raises(HTTPException) as caught:
            transfer_to_personal(db, 'visual-a', 'alice', request(db, destination='booklet', booklet_id=other.id, field='student_notes'))
        assert caught.value.status_code == 404
    with pytest.raises(HTTPException) as caught:
        transfer_to_personal(db, 'visual-a', 'alice', request(db, destination='booklet', field='student_notes', expected_text='', text='x' * 2000))
    assert caught.value.detail == 'personal_limit'


def test_expected_text_preserves_whitespace_in_existing_annotations(db):
    row = db.query(models.LearnerProfileRevision).first()
    row.data = {**row.data, 'notes': ' Originale  '}
    db.commit()
    result = transfer_to_personal(db, 'visual-a', 'alice', request(db, expected_text=' Originale  '))
    assert result['context']['notebook']['notes'].startswith(' Originale  \n\n')
