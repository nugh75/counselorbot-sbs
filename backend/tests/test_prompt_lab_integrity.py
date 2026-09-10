"""Regression evidence for incomplete trials, equal comparisons and model identity."""
from datetime import datetime, timedelta, timezone
import json

import httpx
import pytest

from backend.prompt_lab import evaluation, worker
from backend.prompt_lab.local_models import LocalModels, ModelError
from backend.tests.test_prompt_lab_engine import (
    lab, seed, make_payload, make_snapshot, make_cases, run_worker, fetch,
    improvement_responder, FakeClient, render,
)


def test_budget_preserves_response_without_a_judgment():
    with lab() as factory:
        exp, run = seed(factory, payload=make_payload(max_calls=4), snapshot=make_snapshot(), cases=make_cases())
        client, state = run_worker(factory, run, improvement_responder)
        experiment, job, results = fetch(factory, exp, run)
    assert state == 'budget_exceeded'
    assert len(client.calls) == 4
    assert len(results) == 1
    assert results[0]['response']
    assert results[0]['judgment'] is None
    assert 'incomplete' in results[0]['error']
    assert experiment['summary']['eligibility'] == 'inconclusive'


def test_call_timeout_cannot_extend_remaining_budget():
    now = datetime.now(timezone.utc)
    budget = worker._Budget(max_calls=3, deadline=now + timedelta(seconds=0.5), tick=lambda _: False, now=lambda: now)
    assert budget.before_call() == 0.5


@pytest.mark.parametrize('body', [
    {'message': {'content': 'Testo parziale'}, 'done_reason': 'length'},
    {'message': {'content': 'x' * 20001}, 'done_reason': 'stop'},
])
def test_output_limit_is_failure_instead_of_silent_truncation(body):
    with httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, json=body))) as http:
        with pytest.raises(ModelError, match='output limit'):
            LocalModels(base_url='http://fixture', client=http).chat({'provider': 'ollama', 'model': 'local'}, 'test', '')


def test_missing_model_identity_fails_before_generation():
    with lab() as factory:
        snapshot = make_snapshot()
        snapshot['model_digests'] = {'missing-model': 'different-version'}
        exp, run = seed(factory, payload=make_payload(), snapshot=snapshot, cases=make_cases())
        client, state = run_worker(factory, run, improvement_responder)
        _, job, results = fetch(factory, exp, run)
    assert state == 'failed'
    assert not client.calls and not results
    assert 'model versions' in job['error']


def test_model_change_during_measurement_invalidates_outcome():
    class ChangingClient(FakeClient):
        def digests(self):
            return {'model-11': 'changed' if self.calls else 'deadbeef'}
    with lab() as factory:
        exp, run = seed(factory, payload=make_payload(), snapshot=make_snapshot(), cases=make_cases())
        client = ChangingClient(improvement_responder)
        worker.Worker(session_factory=factory, client=client, render=render).execute(run)
        experiment, _, results = fetch(factory, exp, run)
    assert results
    assert experiment['summary']['eligibility'] == 'inconclusive'


def test_comparison_uses_rates_and_refuses_per_model_regressions():
    rows = [
        dict(preset_id=1, variant_id='baseline', split='validation', passed=2, total=4, errors=0),
        dict(preset_id=1, variant_id='candidate', split='validation', passed=1, total=2, errors=0),
    ]
    assert evaluation.compare(rows, 'validation', 'candidate')[:2] == (True, False)
    rows[1]['passed'] = 2
    assert evaluation.compare(rows, 'validation', 'candidate')[:2] == (True, True)


def test_judge_cannot_coerce_strings_to_pass():
    raw = json.dumps({'goals': [{'ok': 'true'}], 'critical_ok': True})
    assert evaluation.parse_judgment(raw, 1) is None


def test_full_input_is_retained_and_factor_codes_cannot_change():
    envelope = {'system_prompt_final': 'x' * 25000, 'full_message': '', 'history': []}
    assert worker._stored_envelope(envelope)['system_prompt_final'] == envelope['system_prompt_final']
    assert evaluation.check_candidate('Osserva A6 e chiedi un esempio.', 'Osserva A5 e chiedi un esempio.')


def test_identical_messages_cannot_leak_across_independent_splits():
    from backend.prompt_lab.contracts import validate_case_set
    cases = make_cases()
    cases[-1]['message'] = cases[0]['message']
    with pytest.raises(ValueError, match='independent splits'):
        validate_case_set(cases, languages=['it'], purpose='improvement')


def test_a_language_regression_cannot_be_hidden_by_a_gain_elsewhere():
    rows = [dict(preset_id=1, variant_id=variant, language=lang, split='final', passed=passed, total=4, errors=0)
            for variant, lang, passed in [('baseline', 'it', 1), ('candidate', 'it', 4), ('baseline', 'en', 4), ('candidate', 'en', 3)]]
    assert evaluation.compare(rows, 'final', 'candidate')[0] is False


def test_unstable_repetitions_cannot_make_a_candidate_eligible():
    records = [evaluation.Record(case_id='final-one', split='final', preset_id=1, variant_id=variant,
               repetition=repeat, passed=passed, errored=False, goal_ok=(passed,))
               for variant, repeat, passed in [('baseline', 1, False), ('baseline', 2, True), ('candidate', 1, True), ('candidate', 2, True)]]
    outcome = evaluation.decide(purpose='improvement', metrics=evaluation.aggregate(records), goals=[{'text':'Focused reply', 'criterion':'One question'}], records=records, selected='candidate', completed_calls=8)
    assert outcome.eligibility == 'inconclusive'
    assert 'repetitions' in outcome.reason
