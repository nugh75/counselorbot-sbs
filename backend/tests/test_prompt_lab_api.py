"""Lab API and production-write boundary, on independent in-memory databases."""
import copy

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from backend import auth, database, models
from backend.prompt_lab import storage, snapshots, approval
from backend.prompt_lab.contracts import build_manifest
from backend.routes import prompt_experiments as routes


@pytest.fixture
def context(monkeypatch):
    monkeypatch.setattr(snapshots, 'freeze_models', lambda snapshot: dict(snapshot, model_digests={'local:1': 'digest'}))
    def engine():
        return create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    prod_engine, lab_engine = engine(), engine()
    models.Base.metadata.create_all(prod_engine)
    storage.Base.metadata.create_all(lab_engine)
    factory = sessionmaker(bind=lab_engine, expire_on_commit=False)
    monkeypatch.setattr(storage, 'session_factory', lambda: factory)
    with Session(prod_engine, expire_on_commit=False) as prod, factory() as lab:
        prod.add(models.GuidedStep(id='intro', sort_order=0, label='Introduzione', prompt='Introduce the profile.', system_prompt_mode='qsa-intro', questionnaire_type='QSA'))
        prod.add_all(models.ModelPreset(id=i, name=f'Local {i}', provider='ollama', model=f'local:{i}', is_active=True, disable_thinking=True) for i in range(1, 5))
        prod.commit()
        app = FastAPI()
        app.include_router(routes.router)
        app.dependency_overrides[auth.get_current_active_admin] = lambda: {'username': 'reviewer', 'is_admin': True}
        app.dependency_overrides[database.get_db] = lambda: prod
        app.dependency_overrides[routes.lab_db] = lambda: lab
        with TestClient(app) as client:
            yield client, prod, lab, app
    prod_engine.dispose()
    lab_engine.dispose()


def payload(purpose='verification'):
    return {'title': 'Una domanda', 'purpose': purpose, 'target_key': 'intro',
            'goals': [{'text': 'Una domanda focalizzata', 'criterion': 'Non più di una domanda.'}],
            'languages': ['it'], 'designer_preset_id': 1, 'judge_preset_id': 2,
            'proposer_preset_id': 3 if purpose == 'improvement' else None,
            'tested_preset_ids': [3, 4], 'max_calls': 240, 'max_minutes': 60}


def cases():
    return [{'id': f'{split}{i}', 'group_id': f'{split}{i}', 'split': split,
             'language': 'it', 'message': f'Caso {split} {i}: vorrei organizzarmi.',
             'history': [], 'expected': 'Una domanda focalizzata.'}
            for split in ('validation', 'final') for i in range(2)]


def create(client, purpose='verification'):
    response = client.post('/admin/prompt-experiments', json=payload(purpose))
    assert response.status_code == 200, response.text
    return response.json()['id']


def test_creation_freezes_roles_goals_and_leaves_live_prompt_untouched(context):
    client, prod, lab, _ = context
    experiment_id = create(client)
    report = client.get('/admin/prompt-experiments/' + experiment_id).json()
    assert [p['id'] for p in report['snapshot']['presets']['tested']] == [3, 4]
    assert report['snapshot']['presets']['judge']['id'] == 2
    assert report['payload']['goals'] == payload()['goals']
    prod.get(models.ModelPreset, 3).model = 'changed:latest'
    prod.commit()
    assert lab.get(storage.LabExperiment, experiment_id).snapshot['presets']['tested'][0]['model'] == 'local:3'
    assert prod.get(models.GuidedStep, 'intro').prompt == 'Introduce the profile.'
    assert prod.query(models.PromptRevision).count() == 0


def test_missing_goal_external_preset_and_missing_test_models_are_rejected(context):
    client, prod, _, _ = context
    for key, value in [('goals', []), ('tested_preset_ids', []), ('max_calls', 241)]:
        data = payload(); data[key] = value
        assert client.post('/admin/prompt-experiments', json=data).status_code == 422
    prod.get(models.ModelPreset, 2).provider = 'openrouter'; prod.commit()
    assert client.post('/admin/prompt-experiments', json=payload()).status_code == 422


def test_cases_must_be_reviewed_and_group_leakage_is_rejected(context):
    client, _, _, _ = context
    identifier = create(client)
    url = '/admin/prompt-experiments/' + identifier
    data = cases(); data[2]['group_id'] = data[0]['group_id']
    assert client.put(url + '/cases', json={'cases': data}).status_code == 422
    assert client.put(url + '/cases', json={'cases': cases()}).status_code == 200
    assert client.post(url + '/run', json={'cases_reviewed': False}).status_code == 422
    assert client.post(url + '/run', json={'cases_reviewed': True}).status_code == 200
    assert client.post(url + '/run', json={'cases_reviewed': True}).status_code == 409
    assert client.post(url + '/cancel').json()['cancel_requested'] is True
    assert client.get(url).json()['runs'][0]['state'] == 'cancelled'


def test_synthetic_verification_cannot_be_activated_even_with_forged_eligibility(context):
    client, prod, lab, _ = context
    identifier = create(client)
    row = lab.get(storage.LabExperiment, identifier)
    row.candidates = [{'id': 'candidate1', 'text': 'Ask one question.'}]
    row.summary = {'eligibility': 'eligible', 'selected_candidate_id': 'candidate1'}
    row.state = 'completed'
    run = storage.LabRun(experiment_id=identifier, kind='evaluate', state='completed', manifest=build_manifest(payload=row.payload, snapshot=row.snapshot, cases=[]))
    lab.add(run); lab.commit()
    report = client.get('/admin/prompt-experiments/' + identifier).json()
    response = client.post('/admin/prompt-experiments/' + identifier + '/decision', json={'action': 'accept', 'candidate_id': 'candidate1', 'note': 'Reviewed', 'expected_hash': report['manifest_hash']})
    assert response.status_code == 409
    assert prod.query(models.PromptExperimentDecision).count() == 0
    assert prod.get(models.GuidedStep, 'intro').prompt == row.snapshot['baseline']


def test_acceptance_receipt_idempotency_conflict_and_restore_preserve_later_edits(context):
    client, prod, lab, _ = context
    identifier = create(client, 'improvement')
    row = lab.get(storage.LabExperiment, identifier)
    row.candidates = [{'id': 'candidate1', 'text': 'Ask one question.'}]
    row.summary = {'eligibility': 'eligible', 'selected_candidate_id': 'candidate1'}
    kwargs = dict(action='accept', candidate_id='candidate1', manifest_hash='a'*64, note='Reviewed', author='reviewer', blockers=[])
    receipt = approval.decide(prod, row, **kwargs)
    assert approval.decide(prod, row, **kwargs).id == receipt.id
    assert prod.query(models.PromptExperimentDecision).count() == 1
    assert prod.query(models.PromptRevision).count() == 2
    assert prod.query(models.PromptRevision).order_by(models.PromptRevision.id.desc()).first().origin == 'admin'
    with pytest.raises(ValueError):
        approval.decide(prod, row, **{**kwargs, 'action': 'reject'})
    prod.get(models.GuidedStep, 'intro').prompt = 'Edited after acceptance'; prod.commit()
    with pytest.raises(ValueError, match='modificato'):
        approval.restore(prod, identifier, manifest_hash='a'*64, note='Restore', author='reviewer')
    assert prod.get(models.GuidedStep, 'intro').prompt == 'Edited after acceptance'


def test_stale_dependencies_block_approval_before_any_revision_is_written(context):
    client, prod, lab, _ = context
    identifier = create(client, 'improvement')
    row = lab.get(storage.LabExperiment, identifier)
    row.candidates = [{'id': 'c', 'text': 'Ask one question.'}]
    row.summary = {'selected_candidate_id': 'c'}
    prod.get(models.ModelPreset, 1).temperature = 0.5; prod.commit()
    with pytest.raises(ValueError, match='configurazione'):
        approval.decide(prod, row, action='accept', candidate_id='c', manifest_hash='a'*64, note='Review', author='reviewer', blockers=[])
    assert prod.query(models.PromptRevision).count() == 0


def test_every_endpoint_requires_admin(context):
    client, _, _, app = context
    def denied():
        raise HTTPException(403, 'Admin only')
    app.dependency_overrides[auth.get_current_active_admin] = denied
    for method, path, body in [('GET', '/options', None), ('GET', '', None), ('POST', '', payload()),
                               ('GET', '/missing', None), ('POST', '/missing/prepare', None),
                               ('PUT', '/missing/cases', {'cases': cases()}),
                               ('POST', '/missing/run', {'cases_reviewed': True}), ('POST', '/missing/cancel', None),
                               ('POST', '/missing/decision', {'action': 'reject', 'expected_hash': 'a'*64, 'note': 'no'}),
                               ('POST', '/missing/restore', {'expected_hash': 'a'*64, 'note': 'no'})]:
        assert client.request(method, '/admin/prompt-experiments' + path, json=body).status_code == 403


def test_replay_uses_shared_preparation_and_only_mutates_clone(context):
    client, prod, lab, _ = context
    identifier = create(client)
    snapshot = copy.deepcopy(lab.get(storage.LabExperiment, identifier).snapshot)
    case = cases()[0]
    before = snapshots.render(snapshot, case, snapshot['baseline'])
    after = snapshots.render(snapshot, case, 'Ask one question.')
    assert snapshot['baseline'] in before['system_prompt_final']
    assert 'Ask one question.' in after['system_prompt_final']
    assert before['history'] == after['history']
    assert prod.get(models.GuidedStep, 'intro').prompt == snapshot['baseline']
    assert prod.query(models.Log).count() == 0


def test_approval_binds_the_candidate_text_to_recorded_trials(context, monkeypatch):
    import hashlib
    client, prod, lab, _ = context
    exp_id = create(client, 'improvement')
    exp = lab.get(storage.LabExperiment, exp_id)
    exp.candidates = [{'id':'candidate-1', 'text':'A tested change.'}]
    exp.summary = {'eligibility':'eligible', 'selected_candidate_id':'candidate-1'}
    exp.state = 'completed'
    run = storage.LabRun(experiment_id=exp.id, kind='evaluate', state='completed', manifest=build_manifest(payload=exp.payload, snapshot=exp.snapshot, cases=[]))
    lab.add(run); lab.flush()
    lab.add(storage.LabResult(run_id=run.id, case_id='case', preset_id=3, variant_id='candidate-1', repetition=1,
                              envelope={'candidate_hash':hashlib.sha256(b'A tested change.').hexdigest()}))
    lab.commit()
    monkeypatch.setattr(snapshots, 'coverage_blockers', lambda *_: [])
    assert routes.detail(lab, prod, exp)['approval_blockers'] == []
    exp.candidates = [{'id':'candidate-1', 'text':'A different change.'}]
    lab.commit()
    report = routes.detail(lab, prod, exp)
    assert any('non coincide' in blocker for blocker in report['approval_blockers'])
    response = client.post(f'/admin/prompt-experiments/{exp.id}/decision', json={'action':'accept', 'candidate_id':'candidate-1', 'expected_hash':report['manifest_hash'], 'note':'Review'})
    assert response.status_code == 409
    assert prod.get(models.GuidedStep,'intro').prompt == 'Introduce the profile.'
    assert prod.query(models.PromptExperimentDecision).count() == 0


def test_options_explain_target_and_historical_context_stays_frozen(context):
    client, prod, _, _ = context
    prod.add(models.GuidedStep(id='summary', sort_order=1, label='Sintesi', prompt='Summarize.', system_prompt_mode='qsa-summary', questionnaire_type='QSA'))
    prod.commit()
    targets = client.get('/admin/prompt-experiments/options').json()['targets']
    assert len(targets) == 1
    assert targets[0]['id'] == 'intro'
    assert targets[0]['prompt'] == 'Introduce the profile.'
    assert targets[0]['questionnaire_type'] == 'QSA'
    assert targets[0]['system_prompt_mode'] == 'qsa-intro'
    experiment_id = create(client)
    prod.get(models.GuidedStep, 'intro').label = 'Nuovo titolo'
    prod.get(models.GuidedStep, 'intro').prompt = 'New live text.'
    prod.commit()
    saved = client.get('/admin/prompt-experiments/' + experiment_id).json()
    step = next(s for s in saved['snapshot']['render_data']['steps'] if s['id'] == 'intro')
    assert step['label'] == 'Introduzione'
    assert saved['snapshot']['baseline'] == 'Introduce the profile.'
    assert client.get('/admin/prompt-experiments/options').json()['targets'][0]['prompt'] == 'New live text.'
