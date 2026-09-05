import asyncio
from io import BytesIO

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pypdf import PdfReader
from backend.tests.artifact_database import artifact_session

from backend import models
from backend.routes import survey
from backend.pdf_generator import generate_questionnaire_pdf


@pytest.fixture
def db():
    with artifact_session() as session:
        yield session


@pytest.fixture
def result(db):
    row = models.QuestionnaireResult(session_id='summary-fixture', username='alice', questionnaire_type='QSA', scores={'C1': 7})
    db.add(row)
    db.commit()
    return row


def test_whole_conversation_and_final_decision_reach_summary(monkeypatch, db, result):
    prompts = []
    class FakeAI:
        def __init__(self, db): pass
        def get_response(self, prompt, *args, **kwargs):
            prompts.append(prompt)
            return 'DECISIONE_FINALE: scelgo una sola azione.' if 'DECISIONE_FINALE' in prompt else 'Note iniziali.'
    monkeypatch.setattr(survey, 'AIService', FakeAI)
    messages = [{'role':'student','text':'Tema iniziale. ' * 2500}, {'role':'student','text':'DECISIONE_FINALE: scelgo una sola azione.'}]
    chunks = survey._summary_chunks(messages, 'it')
    assert all(len(chunk) <= 12000 for chunk in chunks)
    text, status = survey.canonical_summary(db, result=result, scores=result.scores, messages=messages, recommendations={}, lang='it')
    assert status == 'ready' and 'DECISIONE_FINALE' in text
    assert 'DECISIONE_FINALE' in prompts[-1]
    assert len(prompts) > 1
    before = len(prompts)
    again, _ = survey.canonical_summary(db, result=result, scores=result.scores, messages=messages, recommendations={}, lang='it')
    assert again == text and len(prompts) == before


def test_fingerprint_changes_for_same_turn_count_content_and_choices():
    args = dict(messages=[{'role':'student','text':'Prima scelta'}], scores={'C1':7}, recommendations={}, lang='it')
    original = survey._summary_fingerprint(**args)
    assert survey._summary_fingerprint(**{**args, 'messages':[{'role':'student','text':'Scelta corretta'}]}) != original
    assert survey._summary_fingerprint(**{**args, 'recommendations':{'reading':[{'slug':'book','status':'selected'}]}}) != original


def test_current_final_step_is_reused_only_in_its_language(monkeypatch, db, result):
    db.add(models.GuidedStep(id='sl-synthesis', questionnaire_type='QSA', sort_order=1, label='Sintesi', prompt='Summarize the session.', system_prompt_mode='qsa-summary'))
    row = models.Log(action='chat_message', session_id=result.session_id, phase='sl-synthesis', details={'language':'it','bot_response':'Sintesi concordata'})
    db.add(row); db.commit()
    monkeypatch.setattr(survey, '_generate_summary', lambda *args, **kwargs: 'Sintesi aggiornata')
    args = dict(result=result, scores={}, messages=[{'role':'counselor','text':'Sintesi concordata'}], recommendations={}, lang='it')
    assert survey.canonical_summary(db, **args)[0] == 'Sintesi concordata'
    assert survey.canonical_summary(db, **{**args, 'lang':'en'})[0] == 'Sintesi aggiornata'
    db.add(models.Log(action='chat_message', session_id=result.session_id, details={'user_input':'Ho cambiato idea.'})); db.commit()
    args['messages'].append({'role':'student','text':'Ho cambiato idea.'})
    assert survey.canonical_summary(db, **args)[0] == 'Sintesi aggiornata'


def test_model_failure_is_explicit_and_not_cached(monkeypatch, db, result):
    monkeypatch.setattr(survey, '_generate_summary', lambda *args, **kwargs: None)
    assert survey.canonical_summary(db, result=result, scores={}, messages=[{'text':'Parliamo'}], recommendations={}, lang='it') == (None, 'unavailable')
    assert db.query(models.Log).filter(models.Log.action == survey.PDF_SUMMARY_ACTION).count() == 0


def test_pdf_and_preview_share_inputs_and_ownership(monkeypatch, db, result):
    monkeypatch.setattr(survey, '_summary_inputs', lambda *args: {'result': result, 'scores': {}, 'messages':[{'text':'Ciao'}], 'recommendations':{}, 'lang':'it'})
    monkeypatch.setattr(survey, '_generate_summary', lambda *args, **kwargs: 'La stessa sintesi')
    captured = {}
    def pdf(**kwargs):
        captured.update(kwargs)
        return BytesIO(b'%PDF-fixture')
    monkeypatch.setattr(survey, 'generate_questionnaire_pdf', pdf)
    preview = asyncio.run(survey.get_user_session_summary(result.session_id, lang='it', regenerate=False, current_user={'username':'alice'}, db=db))
    response = asyncio.run(survey.download_questionnaire_pdf(result.session_id, lang='it', mode='brief', current_user={'username':'alice'}, db=db))
    assert preview['summary'] == captured['summary_text'] == 'La stessa sintesi'
    assert response.headers['X-Summary-Status'] == 'ready' and captured['mode'] == 'brief'
    with pytest.raises(survey.HTTPException) as exc:
        asyncio.run(survey.download_questionnaire_pdf(result.session_id, lang='it', mode='full', current_user={'username':'bob'}, db=db))
    assert exc.value.status_code == 403
    app = FastAPI(); app.include_router(survey.router)
    app.dependency_overrides[survey.get_db] = lambda: db
    with TestClient(app) as client:
        assert client.get(f'/questionnaire-result/{result.session_id}/pdf').status_code in (401, 403)


def test_pdf_summary_first_metadata_links_and_brief_contents():
    recs = {'reading':[{'slug':'book','title':'Libro scelto','status':'selected','why':'MOTIVAZIONE','synopsis':'SINOSSI','languages':['it','en'],'warning':'AVVERTENZA','where':'https://example.invalid/libro'}, {'title':'ESCLUSO','status':'dismissed'}], 'strategy':[{'name':'Strategia provata','status':'tried','helpful':True}]}
    def make(mode):
        return PdfReader(generate_questionnaire_pdf('QSA', {'C1':7}, 'fixture', language='it', summary_text='SINTESI CANONICA', recommendations=recs, messages=[{'role':'student','text':'TRASCRIZIONE_COMPLETA'}], mode=mode))
    full = make('full'); brief = make('brief')
    text = '\n'.join(page.extract_text() for page in full.pages)
    short = '\n'.join(page.extract_text() for page in brief.pages)
    assert text.index('SINTESI CANONICA') < text.index('Libro scelto') < text.index('Grafico dei punteggi')
    for marker in ['MOTIVAZIONE','SINOSSI','AVVERTENZA','it, en','Scelta','Provata','Utile']:
        assert marker in text and marker in short
    assert 'ESCLUSO' not in text and 'ESCLUSO' not in short
    assert 'TRASCRIZIONE_COMPLETA' in text and 'TRASCRIZIONE_COMPLETA' not in short
    assert 'Punteggi per fattore' not in short
    assert any(annotation.get_object().get('/A', {}).get('/URI') == 'https://example.invalid/libro' for page in full.pages for annotation in page.get('/Annots', []))


def test_long_card_does_not_overflow_or_lose_content():
    summary = 'Una frase da conservare. ' * 700 + 'ULTIMA_FRASE'
    reader = PdfReader(generate_questionnaire_pdf('QSA', {}, 'fixture', summary_text=summary, mode='brief'))
    assert 1 < len(reader.pages) < 15
    pages = [page.extract_text() for page in reader.pages]
    assert 'ULTIMA_FRASE' in ''.join(pages)
    first = next(page for page in pages if 'Sintesi e consigli' in page)
    assert 'Una frase da conservare' in first
