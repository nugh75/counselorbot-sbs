from io import BytesIO

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from pypdf import PdfReader

from backend import auth, database, models
from backend.pdf_generator import generate_questionnaire_pdf
from backend.routes.visual_tools import router
from backend.tests.artifact_database import artifact_session
from backend.visual_tools import SaveWorkspace, Workspace, load_workspace, save_workspace


@pytest.fixture
def db():
    with artifact_session() as session:
        session.add(models.QuestionnaireResult(session_id='visual-a', username='alice', questionnaire_type='QSA'))
        session.commit()
        yield session


def workspace():
    return Workspace.model_validate({
        'actions': [{'id': 'action1', 'title': 'Recupero attivo', 'stage': 'doing', 'reflection': 'Ricordo tre concetti'}],
        'cards': [{'id': 'card1', 'text': 'Preferisco esempi concreti', 'bucket': 'yes'}],
        'comparison': {'options': [{'id': 'a', 'title': 'Corso serale'}, {'id': 'b', 'title': 'Corso diurno'}],
            'criteria': [{'id': 'time', 'label': 'Tempo disponibile'}],
            'cells': [{'option_id': 'a', 'criterion_id': 'time', 'note': 'Compatibile con il lavoro'}],
            'chosen': 'a', 'reason': 'Posso frequentarlo'}})


def test_roundtrip_scope_and_stale_write(db):
    saved = save_workspace(db, 'visual-a', 'alice', SaveWorkspace(revision=0, workspace=workspace()))
    db.expire_all()
    assert load_workspace(db, 'visual-a', 'alice') == saved
    assert load_workspace(db, 'visual-a', 'bob')['revision'] == 0
    assert load_workspace(db, 'another-session', 'alice')['workspace'] == Workspace().model_dump()
    with pytest.raises(HTTPException) as error:
        save_workspace(db, 'visual-a', 'alice', SaveWorkspace(revision=0, workspace=Workspace()))
    assert error.value.status_code == 409
    assert load_workspace(db, 'visual-a', 'alice') == saved
    cleared = save_workspace(db, 'visual-a', 'alice', SaveWorkspace(revision=saved['revision'], workspace=Workspace()))
    assert cleared['workspace'] == Workspace().model_dump()
    assert db.query(models.Log).filter(models.Log.action == 'visual_workspace').count() == 2


@pytest.mark.parametrize('change', [
    {'actions': [{'id': 'a', 'title': ''}]},
    {'cards': [{'id': 'a', 'text': 'x', 'bucket': 'scored'}]},
    {'cards': [{'id': 'a', 'text': 'x'}] * 31},
    {'actions': [{'id': 'a', 'title': 'One'}, {'id': 'a', 'title': 'Two'}]},
    {'comparison': {'chosen': 'missing'}},
    {'comparison': {'cells': [{'option_id': 'missing', 'criterion_id': 'missing', 'note': 'x'}]}},
    {'prompt': 'not a workspace field'},
])
def test_reject_invalid_or_unbounded_work(change):
    with pytest.raises(ValidationError):
        Workspace.model_validate(change)


def test_endpoints_enforce_ownership_and_restore_after_retry(db):
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[database.get_db] = lambda: db
    identity = {'username': 'bob'}
    app.dependency_overrides[auth.get_identity_view_as] = lambda: identity
    with TestClient(app) as client:
        path = '/session/visual-a/visual-tools'
        payload = {'revision': 0, 'workspace': workspace().model_dump()}
        for response in [client.get(path), client.put(path, json=payload), client.get(path + '/pdf')]:
            assert response.status_code == 403
        identity['username'] = 'alice'
        response = client.put(path, json=payload)
        assert response.status_code == 200
        assert client.get(path).json() == response.json()
        assert client.put(path, json=payload).status_code == 409
        pdf = client.get(path + '/pdf?lang=it')
        assert pdf.status_code == 200 and pdf.content.startswith(b'%PDF')
        text = '\n'.join(page.extract_text() for page in PdfReader(BytesIO(pdf.content)).pages)
        assert 'Recupero attivo' in text and 'Corso serale' in text
        assert 'Tools' in text and 'Letture consigliate' not in text
        assert 'Recupero attivo - In corso' in text
        assert db.query(models.RecommendationHistory).count() == 0
        assert db.query(models.Config).count() == 0


@pytest.mark.parametrize('mode', ['brief', 'full'])
def test_final_pdf_contains_saved_choices_in_both_modes(mode):
    pdf = generate_questionnaire_pdf('QSA', {}, 'visual-a', language='it', mode=mode,
        visual_workspace=workspace().model_dump(), summary_text='Una sintesi esistente')
    text = '\n'.join(page.extract_text() for page in PdfReader(pdf).pages)
    for expected in ['Una sintesi esistente', 'Recupero attivo', 'Preferisco esempi concreti', 'Tempo disponibile', 'Posso frequentarlo']:
        assert expected in text


def test_long_visual_notes_paginate_without_losing_the_end():
    work = workspace().model_dump()
    work['actions'] = [{'id': str(i), 'title': f'Attivita {i}', 'detail': 'Una riflessione da conservare. ' * 30} for i in range(12)]
    work['actions'][-1]['reflection'] = 'ULTIMA RIFLESSIONE'
    pdf = generate_questionnaire_pdf('QSA', {}, 'visual-a', language='it', mode='brief', visual_workspace=work)
    pages = PdfReader(pdf).pages
    assert len(pages) > 2
    assert 'ULTIMA RIFLESSIONE' in '\n'.join(page.extract_text() for page in pages)
