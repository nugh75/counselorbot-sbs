"""Whole-journey coverage, exact provenance, revocation and teacher validation."""
import json
from datetime import datetime, timezone

import pytest

from backend import class_noticing, models, orientation_advice, student_noticing, teacher_noticing
from backend.noticing_sources import collect_sources
from backend.tests.test_teacher_class_compilations import class_results_api  # noqa: F401


@pytest.fixture
def model(monkeypatch):
    calls = []

    def answer(self, prompt, system, *args, **kwargs):
        calls.append((system, prompt))
        if system == student_noticing.SYSTEM:
            sources = json.loads(prompt.split('\n', 1)[1])
            return json.dumps({'items': [
                {'kind': 'resource', 'text': f"Riprendere {source['kind']}",
                 'evidence': [{'source': source['id'], 'quote': source['text'][:50]}]}
                for source in sources
            ]})
        if system == orientation_advice.SYSTEM:
            items = json.loads(prompt.split('\n', 1)[1])
            return json.dumps({'paragraphs': [{'text': 'Testo da rivedere con lo studente.', 'item_ids': [items[0]['id']]}]})
        # Grouping must cite actual opaque ids, not an invented student.
        ids = [line.split(']')[0][1:] for line in prompt.splitlines() if line.startswith('[')]
        return json.dumps({'themes': [{'title': 'Risorse', 'item_ids': ids, 'suggestion': 'Discuterne insieme'}], 'suggestions': []})
    monkeypatch.setattr(teacher_noticing.AIService, '__init__', lambda *a, **kw: None)
    monkeypatch.setattr(teacher_noticing.AIService, 'get_response', answer)
    return calls


def analyse(client, url):
    state = client.get(url).json()
    for chunk in state['pending_chunks']:
        response = client.post(url + ('&' if '?' in url else '?') + 'chunk=' + chunk)
        assert response.status_code == 200, response.text
    return client.get(url).json()


@pytest.fixture
def journey(class_results_api):
    client, db, identity, (owned, shared, private, empty) = class_results_api
    who = 'student.no-results'
    now = datetime.now(timezone.utc)
    db.add_all([
        models.LearnerProfileRevision(username=who, data={'strengths': 'Mi piace costruire oggetti'}, source='manual'),
        models.LearnerProfileRevision(username='outsider', data={'notes': 'SEGRETO ESTRANEO'}, source='manual'),
        models.Log(username=who, session_id='idea-no-result', questionnaire_type='IDEA', action='chat_message', details={'user_input': 'Vorrei progettare un laboratorio', 'bot_response': 'PAROLE DEL MODELLO'}),
        models.Log(username=who, session_id='idea-no-result', questionnaire_type='IDEA', action='opencode_chat', details={'user_input': 'PROMPT AUTOMATICO', 'seed': True}),
        models.PortfolioItem(username=who, title='Progetto laboratorio', description='Un lavoro di gruppo', images=[{'filename': 'lavoro.png', 'content_type': 'image/png', 'path': '/SECRETPATH'}]),
        models.Log(username=who, action='visual_workspace', session_id='work', details={'workspace': {'actions': [{'id': 'a', 'title': 'Azione da eliminare'}], 'cards': []}}),
        models.Log(username=who, action='visual_workspace', session_id='work', details={'workspace': {'actions': [{'id': 'a', 'title': 'Preparare il progetto', 'reflection': 'Ho chiesto aiuto'}], 'cards': [{'id': 'c', 'text': 'Interesse per il disegno', 'bucket': 'unsorted'}], 'comparison': {'options': [{'id': 'o', 'title': 'Laboratorio'}], 'reason': 'Mi interessa'}, 'timeline': {'events': [{'id': 'e', 'title': 'Esperienza di laboratorio'}]}}}),
        models.PersonalGoal(username=who, title='Progettare', motivation='Imparare a fare insieme'),
        models.PersonalStrategy(username=who, text='Dividere il lavoro in passi'),
        models.Log(username=who, action='personal_flashcards', details={'workspace': {'decks': [{'id': 'd', 'title': 'Ripasso', 'cards': [{'id': 'c', 'front': 'Domanda', 'back': 'Risposta'}]}]}}),
        models.TeacherNote(username=who, group_id=owned, author_username='owner', text='Osservazione del docente'),
        models.TeacherNote(username=who, group_id=private, author_username='unrelated', text='NOTA ALTRA CLASSE'),
        models.ClassMeeting(group_id=owned, title='Laboratorio orientativo', mode='in_person', starts_at=now, organizer_username='owner', manager_username='owner'),
        models.ClassMeeting(group_id=owned, title='INCONTRO PRIVATO ALTRUI', kind='individual', mode='in_person', starts_at=now, organizer_username='owner', manager_username='owner'),
        models.OrientationSession(username=who, session_id='compass', messages=[{'role': 'user', 'content': 'Da dove posso iniziare?'}, {'role': 'assistant', 'content': 'NON ATTRIBUIRE QUESTA FRASE'}]),
        models.ResultReading(username=who, session_id='r', questionnaire_type='QSA', strengths=['Organizzazione'], growth_areas=[], note='La mia lettura'),
    ])
    topic = models.ForumTopic(group_id=owned, title='Discussione', body='ARGOMENTO DEL COMPAGNO', author_username='other', author_display_name='Other')
    db.add(topic); db.flush()
    db.add_all([
        models.ForumPost(topic_id=topic.id, author_username=who, author_display_name='Student', body='Il laboratorio mi interessa'),
        models.ForumPost(topic_id=topic.id, author_username=who, author_display_name='Student', body='MESSAGGIO NASCOSTO', hidden_at=now),
        models.ForumPost(topic_id=topic.id, author_username=who, author_display_name='Student', body='MESSAGGIO IN ATTESA', status='pending'),
        models.ForumPost(topic_id=topic.id, author_username='other', author_display_name='Other', body='PAROLE DEL COMPAGNO'),
    ])
    goal = db.query(models.PersonalGoal).filter_by(username=who).one()
    db.add(models.GoalReview(goal_id=goal.id, outcome='partial', learned='Organizzare il gruppo'))
    db.commit()
    return client, db, identity, owned, who


def test_all_sources_include_student_without_questionnaires(journey, model):
    client, db, _, group_id, who = journey
    group = db.get(models.StudentGroup, group_id)
    sources = collect_sources(db, group, who)
    assert {s['kind'] for s in sources} >= {'chat', 'notebook', 'portfolio', 'action', 'card', 'comparison', 'timeline', 'goal', 'review', 'strategy', 'teacher_note', 'meeting', 'forum', 'reading', 'flashcard'}
    text = json.dumps(sources)
    for excluded in ('SEGRETO ESTRANEO', 'PAROLE DEL MODELLO', 'NON ATTRIBUIRE QUESTA FRASE', 'ARGOMENTO DEL COMPAGNO', 'PAROLE DEL COMPAGNO', 'MESSAGGIO NASCOSTO', 'MESSAGGIO IN ATTESA', 'NOTA ALTRA CLASSE', 'SECRETPATH', 'Azione da eliminare', 'INCONTRO PRIVATO ALTRUI', 'PROMPT AUTOMATICO'):
        assert excluded not in text
    meeting = next(s for s in sources if s['kind'] == 'meeting')
    assert '"attendance_recorded": false' in meeting['text'] and meeting['author'] == 'record'
    url = f'/admin/groups/{group_id}/students/{who}/noticing'
    assert client.get(url).json()['status'] == 'missing' and model == []
    state = analyse(client, url)
    assert state['status'] == 'ready' and state['items'] and not state['pending_chunks']
    assert all(e['author'] in ('student', 'record', 'teacher', 'saved_work') for i in state['items'] for e in i['evidence'])
    count = len(model)
    assert client.get(url).json() == state and len(model) == count


def test_complete_text_is_batched_without_losing_beginning_or_end(journey, model):
    client, db, _, group_id, who = journey
    row = db.query(models.LearnerProfileRevision).filter_by(username=who).one()
    row.data = {'notes': 'INIZIO ' + 'prova ' * 7000 + ' FINE'}; db.commit()
    url = f'/admin/groups/{group_id}/students/{who}/noticing'
    state = analyse(client, url)
    prompts = ''.join(prompt for system, prompt in model if system == student_noticing.SYSTEM)
    assert state['total_chunks'] > 1 and 'INIZIO ' in prompts and ' FINE' in prompts
    assert 'INIZIO ' in prompts and len(prompts) > 42000


def test_changed_deleted_sources_and_invalid_quotes(journey, model):
    client, db, _, group_id, who = journey
    url = f'/admin/groups/{group_id}/students/{who}/noticing'
    state = analyse(client, url)
    source_id = next(e['id'] for i in state['items'] for e in i['evidence'] if e['kind'] == 'notebook')
    db.query(models.LearnerProfileRevision).filter_by(username=who).delete(); db.commit()
    changed = client.get(url).json()
    assert changed['pending_chunks'] and changed['status'] == 'stale'
    assert all(e['id'] != source_id for i in changed['items'] for e in i['evidence'])
    assert client.get(f'/admin/groups/{group_id}/students/{who}/noticing-source', params={'source': source_id}).status_code == 404
    assert client.post(url, params={'chunk': state['items'][0]['id'].split(':')[0]}).status_code == 409
    assert student_noticing.grounded_items([{'kind': 'resource', 'text': 'inventata', 'evidence': [{'source': 'x', 'quote': 'never said'}]}], []) == []


@pytest.mark.parametrize('role,allowed', [('owner', True), ('colleague', False), ('student', False), ('admin', True)])
def test_every_read_and_write_requires_class_and_membership(journey, model, role, allowed):
    client, db, identity, group_id, who = journey
    identity.update(username=role, is_admin=role == 'admin', groups=['studenti' if role == 'student' else 'docenti'])
    base = f'/admin/groups/{group_id}/students/{who}'
    expected = 200 if allowed else 403 if role == 'student' else 404
    assert client.get(base + '/noticing').status_code == expected
    assert client.get(base + '/orientation-advice').status_code == expected
    if allowed:
        db.query(models.GroupMembership).filter_by(group_id=group_id, username=who).delete(); db.commit()
        assert client.get(base + '/noticing').status_code == 404
        assert client.post(base + '/orientation-advice', json={'revision': 0, 'operation': 'generate'}).status_code == 404


def test_advice_version_validation_and_source_changes(journey, model):
    client, db, _, group_id, who = journey
    base = f'/admin/groups/{group_id}/students/{who}'
    url = base + '/orientation-advice'
    assert client.post(url, json={'revision': 0, 'operation': 'generate'}).status_code == 409
    analyse(client, base + '/noticing')
    created = client.post(url, json={'revision': 0, 'operation': 'generate'}).json()
    assert created['state'] == 'draft' and created['text'] == 'Testo da rivedere con lo studente.'
    validated = client.post(url, json={'revision': created['revision'], 'operation': 'validate', 'text': 'Testo rivisto dal docente.'}).json()
    assert validated['state'] == 'validated' and validated['validated_by'] == 'owner' and validated['validated_at']
    assert client.post(url, json={'revision': created['revision'], 'operation': 'save', 'text': 'Vecchia scheda'}).status_code == 409
    edited = client.post(url, json={'revision': validated['revision'], 'operation': 'save', 'text': 'Nuova modifica'}).json()
    assert edited['state'] == 'draft' and edited['validated_by'] is None
    row = db.query(models.LearnerProfileRevision).filter_by(username=who).one(); row.data = {'notes': 'Nuovo interesse'}; db.commit()
    assert client.get(url).json()['stale'] is True
    assert client.post(url, json={'revision': edited['revision'], 'operation': 'validate', 'text': 'Nuova modifica'}).status_code == 409
    saved = client.post(url, json={'revision': edited['revision'], 'operation': 'save', 'text': 'Modifica conservata'}).json()
    assert saved['stale'] is True


def test_class_uses_all_students_and_rejects_partial_analysis(journey, model):
    client, _, _, group_id, who = journey
    url = f'/admin/groups/{group_id}/noticing'
    initial = client.get(url).json()
    assert {s['username'] for s in initial['students']} == {'student.owned', who}
    assert initial['charts']['students_with_sources'] == 2
    assert client.post(url).status_code == 409
    for student in initial['students']:
        analyse(client, f'/admin/groups/{group_id}/students/{student["username"]}/noticing')
    ready = client.post(url).json()
    assert ready['status'] == 'ready' and ready['charts']['kinds']['resource'] == 2
    assert {s['username'] for theme in ready['themes'] for s in theme['students']} == {'student.owned', who}


def test_validated_document_is_not_an_operational_log(journey, model):
    client, db, _, group_id, who = journey
    base = f'/admin/groups/{group_id}/students/{who}'
    analyse(client, base + '/noticing')
    created = client.post(base + '/orientation-advice', json={'revision': 0, 'operation': 'generate'}).json()
    assert db.query(models.Log).filter(models.Log.action.in_([student_noticing.ACTION, orientation_advice.ACTION, class_noticing.CLASS_NOTICING_ACTION])).count() == 0
    assert db.query(models.TeacherNoticingArtifact).filter_by(kind=orientation_advice.ACTION).count() == 1
    db.query(models.Log).delete(); db.commit()
    retained = client.get(base + '/orientation-advice').json()
    assert retained['text'] == created['text'] and retained['stale']


def test_saved_maps_tables_assignments_and_practice_are_real_sources(journey):
    _, db, _, group_id, who = journey
    now = datetime.now(timezone.utc)
    table = models.Tavolo(id='table-owned', username=who, title='Progetto')
    db.add_all([
        table,
        models.TavoloRevision(tavolo_id=table.id, index=1, author='person', kind='edit', graph={
            'title': 'Progetto', 'nodes': [{'id': 'a', 'label': 'Lavoro accettato', 'state': 'live'},
                                        {'id': 'b', 'label': 'PROPOSTA NON ACCETTATA', 'state': 'pending'}], 'edges': []}),
        models.IdeaMapRevision(username=who, session_id='idea-no-result', spec={'idea': 'Disegnare un laboratorio'}),
        models.IdeaReference(username=who, session_id='idea-no-result', filename='riferimento.txt', kind='txt', text='Testo del riferimento'),
        models.PqblSession(id='practice-owned', document_id='doc-owned', username=who, mode='learning'),
        models.QuestionnaireResult(username=who, session_id='result-owned', questionnaire_type='QSA', scores={'C1': 5}),
    ])
    assignment = models.TeacherAssignment(author_username='owner', author_name='Owner', group_id=group_id, group_name='Classe', source_kind='goal', source_id=1, snapshot={}, request_id='assignment-demo', request_hash='synthetic')
    db.add(assignment); db.flush()
    db.add(models.AssignmentWork(assignment_id=assignment.id, username=who, submission={'text': 'Il mio lavoro consegnato'}, submitted_at=now, feedback='Riscontro sul lavoro', feedback_at=now))
    db.commit()
    sources = collect_sources(db, db.get(models.StudentGroup, group_id), who)
    assert {s['kind'] for s in sources} == set(student_noticing.SOURCE_KINDS)
    text = json.dumps(sources)
    assert 'PROPOSTA NON ACCETTATA' not in text
    assert 'Lavoro accettato' in text and 'Il mio lavoro consegnato' in text and 'Testo del riferimento' in text


def test_named_source_reader_cannot_be_imported_by_generic_exporters():
    import ast
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    importers = []
    for path in root.glob('*.py'):
        tree = ast.parse(path.read_text())
        if any(isinstance(node, ast.ImportFrom) and node.module == 'noticing_sources' for node in ast.walk(tree)):
            importers.append(path.name)
    assert importers == ['student_noticing.py']


def test_assistant_context_explains_replies_but_cannot_be_quoted_as_student_words(journey):
    _, db, _, group_id, who = journey
    db.add(models.Log(username=who, session_id='idea-no-result', action='chat_message',
                      questionnaire_type='IDEA', details={'user_input': 'Sì, mi interessa', 'bot_response': 'Altra risposta'}))
    db.commit()
    sources = collect_sources(db, db.get(models.StudentGroup, group_id), who)
    source = next(s for s in sources if s['text'] == 'Sì, mi interessa')
    assert source['context'] == 'PAROLE DEL MODELLO'
    raw = [{'kind': 'resource', 'text': 'Non attribuire il contesto', 'evidence': [{'source': source['id'], 'quote': source['context']}]}]
    assert student_noticing.grounded_items(raw, sources) == []
