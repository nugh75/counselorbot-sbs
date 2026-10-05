import copy
import json

import pytest

from backend.model_context import (
    DEFAULT_CONTEXT_LEVELS, ContextCapacityError, context_profile, estimate_tokens,
    fit_context, validate_routing_config,
)
from backend.tests.test_prompt_routing import ai


def envelope():
    fragments = {
        "persona": "A thoughtful counselor.", "profile": "[PROFILE]\nA complete profile paragraph.",
        "knowledge": "[KNOWLEDGE]\n[SOURCE 1] One\nFirst paragraph.\n\nSecond paragraph.\n\n---\n\n[SOURCE 2] Two\nOther evidence.",
        "meta": "[META SYSTEM PROMPT]\nOptional theory.", "directives": "[LANGUAGE] Italian.\n[REGISTER] Informal.",
    }
    base = "Normal long section.\n" + fragments["directives"]
    system = "\n\n".join([base, *[fragments[k] for k in ("persona", "profile", "knowledge", "meta")], "[TURN CONTRACT]\nDo not invent evidence."])
    return system, {"system": system, "base": base, "short": "Short section.\n" + fragments["directives"], "fragments": fragments}


def test_unassigned_models_preserve_current_behavior():
    system, data = envelope()
    profile = context_profile({}, "openai", "some-small-name")
    assert "limits" not in profile and profile["context_tokens"] is None
    fitted, current, history, report = fit_context(system, "Keep this input", [], profile, 100, context_data=data)
    assert fitted == system and current == "Keep this input" and history == []
    assert sum(report["blocks"].values()) == report["input_tokens"]


def test_named_levels_are_data_and_exact_model_assignments():
    levels = {"custom": {**DEFAULT_CONTEXT_LEVELS["minimo"], "label": "Small local"}}
    cfg = {"model_context_levels": json.dumps(levels), "model_context_profiles": '{"ollama/tiny":{"level":"custom"}}'}
    validate_routing_config("model_context_levels", cfg["model_context_levels"])
    assert context_profile(cfg, "ollama", "tiny")["limits"]["label"] == "Small local"
    assert "limits" not in context_profile(cfg, "ollama", "tiny:latest")
    with pytest.raises(ContextCapacityError):
        context_profile({**cfg, "model_context_levels": '{"other":{}}'}, "ollama", "tiny")


def test_short_keeps_dynamic_directives_and_contracts():
    system, data = envelope()
    fitted, message, _, report = fit_context(system, "Original input", [], {"limits": DEFAULT_CONTEXT_LEVELS["ristretto"]}, 100, context_data=data)
    assert "Short section." in fitted and "Normal long section." not in fitted
    assert data["fragments"]["directives"] in fitted
    assert "[TURN CONTRACT]\nDo not invent evidence." in fitted
    assert "Optional theory." not in fitted
    assert message == "Original input" and report["prompt_variant"] == "short"
    assert sum(report["blocks"].values()) == report["input_tokens"]


@pytest.mark.parametrize("short", ["", None])
def test_missing_short_falls_back_without_rewriting_normal(short):
    system, data = envelope(); data["short"] = short
    fitted, _, _, report = fit_context(system, "input", [], {"limits": DEFAULT_CONTEXT_LEVELS["ristretto"]}, 100, context_data=data)
    assert "Normal long section." in fitted and report["prompt_variant"] == "normal"


def test_zero_limits_remove_only_optional_blocks_and_keep_current_input():
    system, data = envelope()
    limits = {**DEFAULT_CONTEXT_LEVELS["minimo"], "profile_tokens": 0, "knowledge_tokens": 0, "persona_tokens": 0, "history_turns": 0}
    fitted, message, history, report = fit_context(system, "All current scores must stay", [{"role":"user","content":"old"}], {"limits": limits}, 100, context_data=data)
    assert "[PROFILE]" not in fitted and "[KNOWLEDGE]" not in fitted and "thoughtful" not in fitted
    assert "[LANGUAGE]" in fitted and "[TURN CONTRACT]" in fitted
    assert message == "All current scores must stay" and history == []
    assert report["history_messages_dropped"] == 1


def test_top_n_retains_whole_rag_source_including_multiple_paragraphs():
    system, data = envelope()
    fitted, _, _, _ = fit_context(system, "input", [], {"limits": DEFAULT_CONTEXT_LEVELS["minimo"]}, 100, context_data=data)
    assert "[SOURCE 1]" in fitted and "Second paragraph." in fitted and "[SOURCE 2]" not in fitted


def test_top_n_retains_catalog_frame_and_one_whole_record():
    system, data = envelope()
    original = data["fragments"]["knowledge"]
    catalog = "[KNOWLEDGE]\n[CERTIFIED_READINGS]\nUse only these works.\n- Book A\n    Citation A\n- Book B\n    Citation B"
    system = system.replace(original, catalog); data["system"] = system; data["fragments"]["knowledge"] = catalog
    fitted, _, _, _ = fit_context(system, "input", [], {"limits": DEFAULT_CONTEXT_LEVELS["minimo"]}, 100, context_data=data)
    assert "Use only these works." in fitted and "Citation A" in fitted and "Book B" not in fitted


def test_history_limit_retains_whole_recent_exchanges():
    history = [{"role":role,"content":str(n)} for n in range(5) for role in ("user","assistant")]
    _, _, fitted, report = fit_context("instructions", "current", history, {"limits": DEFAULT_CONTEXT_LEVELS["minimo"]}, 100)
    assert fitted == history[-4:] and report["history_messages_dropped"] == 6
    assert len(history) == 10


def test_directive_cap_refuses_truncation():
    system, data = envelope()
    with pytest.raises(ContextCapacityError, match="direttive obbligatorie"):
        fit_context(system, "input", [], {"limits": {**DEFAULT_CONTEXT_LEVELS["totale"], "directives_tokens": 1}}, 100, context_data=data)


def test_context_data_cannot_affect_another_generation():
    _, data = envelope()
    fitted, _, _, report = fit_context("Different short operation", "input", [], {"limits": DEFAULT_CONTEXT_LEVELS["minimo"]}, 100, context_data=data)
    assert fitted == "Different short operation" and report["prompt_variant"] == "normal"


@pytest.mark.parametrize("field,value", [("meta", "false"), ("history_turns", -1), ("profile_tokens", True), ("knowledge_top_n", 1.5)])
def test_invalid_levels_are_rejected(field, value):
    levels = copy.deepcopy(DEFAULT_CONTEXT_LEVELS); levels["totale"][field] = value
    with pytest.raises(ValueError): validate_routing_config("model_context_levels", json.dumps(levels))


def test_utf8_estimate_is_conservative_and_consistent():
    assert estimate_tokens("é🙂") == 10
    assert estimate_tokens("") == 8


@pytest.mark.parametrize("streaming", [False, True])
def test_fallback_refits_original_instead_of_inheriting_primary_reductions(ai, streaming):
    system, data = envelope(); ai.context_data = data
    ai.config['model_context_profiles'] = json.dumps({
        'ollama/local-test': {'level': 'minimo'},
        'openrouter/openrouter/free': {'level': 'totale'},
    })
    seen = []
    def small(message, system, model, **kwargs):
        seen.append(system)
        assert 'Short section.' in system and 'Optional theory.' not in system
        raise TimeoutError('fixture')
    def large(message, system, model, **kwargs):
        seen.append(system)
        assert 'Normal long section.' in system and 'Optional theory.' in system
        return 'response'
    ai._providers['ollama'].update(call=small, stream=None)
    ai._providers['openrouter'].update(call=large, stream=None)
    if streaming:
        assert ''.join(part.get('text', '') for part in ai.stream_response('current', system, 'generic')) == 'response'
    else:
        assert ai.get_response('current', system, 'generic') == 'response'
    assert len(seen) == 2 and ai.last_context_report['level'] == 'totale'


def test_prompt_lab_dispatches_and_records_each_models_fitted_envelope():
    from backend.tests import test_prompt_lab_engine as lab
    from backend.prompt_lab import evaluation, worker

    config = {
        'model_context_levels': {**DEFAULT_CONTEXT_LEVELS,
            'trim': {**DEFAULT_CONTEXT_LEVELS['minimo'], 'history_turns': 0}},
        'model_context_profiles': {
            'ollama/model-11': {'level': 'trim', 'context_tokens': 8192},
            'ollama/model-12': {'level': 'totale', 'context_tokens': 8192}},
    }
    meta = '[META SYSTEM PROMPT]\nOptional theory.'
    def render(snapshot, case, prompt):
        system = prompt + '\n\n' + meta
        return {'system_prompt_final': system, 'full_message': case['message'],
                'history': case['history'], 'context_config': config,
                'context_data': {'system': system, 'fragments': {'meta': meta}}}
    dispatched = []
    class Client(lab.FakeClient):
        def chat(self, preset, system, user, history=(), **kwargs):
            if preset['id'] in (11, 12):
                dispatched.append((preset, system, list(history)))
            return super().chat(preset, system, user, history, **kwargs)
    def responder(index, preset, system, user):
        if evaluation.JUDGE_MARKER in system:
            return lab.calibrated(user) or lab.verdict(True, len(lab.GOALS))
        return 'Una domanda sul caso.'
    with lab.lab() as factory:
        experiment_id, run_id = lab.seed(factory,
            payload=lab.make_payload(purpose='verification', tested=(11, 12)),
            snapshot=lab.make_snapshot(tested=(11, 12), proposer=False),
            cases=lab.make_cases(purpose='verification'))
        state = worker.Worker(session_factory=factory, client=Client(responder), render=render).execute(run_id)
        _, _, results = lab.fetch(factory, experiment_id, run_id)
    assert state == 'completed' and len(dispatched) == len(results) == 8
    for preset, system, history in dispatched:
        assert preset['context_tokens'] == 8192
        assert ('Optional theory.' in system) == (preset['id'] == 12)
        assert bool(history) == (preset['id'] == 12)
    for row in results:
        assert row['envelope']['context_budget']['level'] == ('trim' if row['preset_id'] == 11 else 'totale')
        assert 'context_data' not in row['envelope']
