"""Independent DB-owned texts for all three levels, through the real APIs."""
import json
from types import SimpleNamespace

import pytest

from backend import chat_logic, models, schemas
from backend.api_models import ChatRequest
from backend.chat_preparation import prepare_chat_turn
from backend.model_context import DEFAULT_CONTEXT_LEVELS, fit_context
from backend.prompt_variants import level_config, variant_key, variant_text
from backend.prompt_lab.snapshots import static_data
from backend.prompt_audit import build_prompt_audit
from backend.tests.test_context_levels_api import db, client
from backend.tests.test_admin_prompt_map import _entries, _map


def prepare(db, *, instrument='QSA', follow_up=False, include_step=True):
    step = db.query(models.GuidedStep).filter_by(questionnaire_type=instrument).order_by(models.GuidedStep.sort_order).first()
    ai = SimpleNamespace(config={row.key: row.value for row in db.query(models.Config).all()})
    counselor = db.query(models.Counselor).filter_by(name='Variant fixture').first()
    req = ChatRequest(message='Student message MUST remain verbatim.' if follow_up else '',
        questionnaire_type=instrument, phase=step.id, mode=step.system_prompt_mode,
        language='it', use_phase_prompt=not follow_up, counselor_id=counselor.id if counselor else None)
    turn = prepare_chat_turn(db, ai, req, 'variant-fixture', {},
        c_persona=counselor.persona if counselor else '', counselor_name=counselor.name if counselor else None,
        include_retrieval=False, include_history=False, create_anonymous_code=False,
        component_overrides={'step_prompt': include_step}, journey_override='Synthetic evidence only.')
    return turn, ai.context_data


def fitted(turn, data, level, **limits):
    return fit_context(turn.system_prompt_final, turn.full_message, turn.history,
        {'level': level, 'limits': {**DEFAULT_CONTEXT_LEVELS[level], **limits}}, turn.max_tokens, context_data=data)


def save(client, key, value):
    response = client.post('/admin/config', json={'key': key, 'value': value, 'description': 'Synthetic variant'})
    assert response.status_code == 200


@pytest.mark.parametrize('instrument', ['QSA', 'IDEA'])
def test_each_model_prompt_exposes_two_independent_db_editors(db, client, instrument):
    entries = [entry for _, entry in _entries(_map(client, instrument)) if entry['destination'] == 'model' and entry['kind'] != 'counselor_persona']
    assert entries and all(set(entry['variants']) == {'ristretto', 'minimo'} for entry in entries)
    assert not any(entry['key'].endswith('__short') for entry in entries)
    for entry in entries:
        for level, variant in entry['variants'].items():
            assert variant['used_by'] == entry['used_by']
            assert variant['key'] == variant_key(entry['key'], level)
            assert variant['editor']['path'] == '/admin/config'
            save(client, variant['key'], level + ' synthetic ' + entry['key'])
            assert db.get(models.Config, variant['key']).value.startswith(level)
            assert db.query(models.PromptRevision).filter_by(scope='config', target_key=variant['key'], origin='admin').count() == 1
    reread = {entry['key']: entry for _, entry in _entries(_map(client, instrument))}
    for entry in entries:
        assert reread[entry['key']]['variants']['minimo']['value'].startswith('minimo')
        assert reread[entry['key']]['value'] == entry['value']


def test_three_levels_select_all_owned_texts_and_preserve_contracts(db, client):
    step = db.query(models.GuidedStep).filter_by(questionnaire_type='QSA').order_by(models.GuidedStep.sort_order).first()
    step.prompt = 'STEP_TOTAL'
    counselor = models.Counselor(slug='variant-fixture', name='Variant fixture', persona='PERSONA_TOTAL', is_active=True)
    db.add(counselor); db.flush()
    keys = {
        chat_logic.guided_step_system_prompt_key(step): 'SYSTEM',
        'directive_affirmative': 'DIRECTIVE',
        chat_logic.prompt_meta_config_key('QSA'): 'META',
        f'guided_step:{step.id}:prompt': 'STEP',
        f'counselor_persona:{counselor.id}': 'PERSONA',
    }
    for key, marker in keys.items():
        if key not in {f'guided_step:{step.id}:prompt', f'counselor_persona:{counselor.id}'}:
            save(client, key, marker + '_TOTAL')
        for level in ('ristretto', 'minimo'):
            save(client, variant_key(key, level), marker + '_' + level.upper())
    turn, data = prepare(db)
    original = turn.system_prompt_final
    for level, suffix in [('totale', 'TOTAL'), ('ristretto', 'RISTRETTO'), ('minimo', 'MINIMO')]:
        system, message, _, report = fitted(turn, data, level, meta=True, persona_tokens=None)
        for marker in keys.values():
            assert marker + '_' + suffix in system
            assert all(marker + '_' + other not in system for other in ('TOTAL', 'RISTRETTO', 'MINIMO') if other != suffix)
        assert '[LANGUAGE]' in system and '[TURN CONTRACT]' in system
        assert sum(report['blocks'].values()) == report['input_tokens']
        assert message == turn.full_message
    assert original == turn.system_prompt_final and data['system'] == original
    persona = _map(client, 'QSA')['levels']['common'][0]['value'][0]
    assert persona['variants']['minimo']['value'] == 'PERSONA_MINIMO'
    # Default context policy can still exclude optional meta, even with a text.
    assert 'META_MINIMO' not in fitted(turn, data, 'minimo')[0]


@pytest.mark.parametrize('instrument', ['QSA', 'QPCS', 'IDEA'])
def test_step_variants_are_used_at_entry_but_never_replace_student_input(db, client, instrument):
    step = db.query(models.GuidedStep).filter_by(questionnaire_type=instrument).order_by(models.GuidedStep.sort_order).first()
    step.prompt = 'Normal owned step.'
    save(client, variant_key(f'guided_step:{step.id}:prompt', 'minimo'), 'MINIMAL_OWNED_STEP')
    turn, data = prepare(db, instrument=instrument)
    system, message, _, _ = fitted(turn, data, 'minimo')
    assert 'MINIMAL_OWNED_STEP' in system and 'Normal owned step.' not in system
    if step.system_prompt_mode.startswith(('qpcs-', 'idea-')):
        assert 'MINIMAL_OWNED_STEP' in message
    turn, data = prepare(db, instrument=instrument, follow_up=True)
    assert fitted(turn, data, 'minimo')[1].endswith('Student message MUST remain verbatim.')
    assert 'MINIMAL_OWNED_STEP' not in fitted(turn, data, 'minimo')[0]
    turn, data = prepare(db, instrument=instrument, include_step=False)
    assert 'MINIMAL_OWNED_STEP' not in fitted(turn, data, 'minimo')[0]


def test_empty_variant_inherits_total_and_legacy_short_is_only_restricted(db, client):
    step = db.query(models.GuidedStep).filter_by(questionnaire_type='QSA').order_by(models.GuidedStep.sort_order).first()
    key = chat_logic.guided_step_system_prompt_key(step)
    save(client, key, 'TOTAL_SYSTEM')
    save(client, key + '__short', 'LEGACY_RESTRICTED')
    turn, data = prepare(db)
    assert 'LEGACY_RESTRICTED' in fitted(turn, data, 'ristretto')[0]
    assert 'TOTAL_SYSTEM' in fitted(turn, data, 'minimo')[0]
    save(client, variant_key(key, 'ristretto'), '')
    turn, data = prepare(db)
    assert 'TOTAL_SYSTEM' in fitted(turn, data, 'ristretto')[0]
    assert 'LEGACY_RESTRICTED' not in fitted(turn, data, 'ristretto')[0]


def test_step_meta_variant_can_override_only_one_level(db, client):
    step = db.query(models.GuidedStep).filter_by(questionnaire_type='QSA').order_by(models.GuidedStep.sort_order).first()
    save(client, chat_logic.prompt_meta_config_key('QSA'), 'INSTRUMENT_META')
    key = variant_key(chat_logic.prompt_meta_config_key('QSA', step.id), 'minimo')
    save(client, key, 'MINIMAL_STEP_META')
    turn, data = prepare(db)
    assert 'MINIMAL_STEP_META' in fitted(turn, data, 'minimo', meta=True)[0]
    assert 'INSTRUMENT_META' in fitted(turn, data, 'ristretto', meta=True)[0]
    entries = [entry for _, entry in _entries(_map(client, 'QSA')) if entry['role'] == 'meta_step']
    assert any(entry['variants']['minimo']['key'] == key for entry in entries)


def test_idea_variant_and_prompt_lab_snapshot_include_level_rows(db, client):
    save(client, variant_key('prompt_idea_variant_student_open', 'minimo'), 'MINIMAL_IDEA_VARIANT')
    step = db.query(models.GuidedStep).filter_by(questionnaire_type='QSA').first()
    key = variant_key(f'guided_step:{step.id}:prompt', 'minimo')
    save(client, key, 'SNAPSHOT_MINIMAL_STEP')
    turn, data = prepare(db, instrument='IDEA')
    assert 'MINIMAL_IDEA_VARIANT' in fitted(turn, data, 'minimo')[0]
    assert static_data(db)['configs'][key] == 'SNAPSHOT_MINIMAL_STEP'


def test_explicit_empty_is_not_legacy_fallback_and_custom_levels_have_distinct_keys():
    key = 'prompt_factor'
    assert variant_text({key + '__short': 'old'}, key, 'minimo') == ''
    assert variant_text({key + '__short': 'old', variant_key(key, 'ristretto'): ''}, key, 'ristretto') == ''
    assert variant_key(key, 'A/B') != variant_key(key, 'A B')


def test_custom_keys_keep_double_underscores_and_levels_cannot_collide():
    key = 'prompt_meta_QSA__custom'
    assert level_config({variant_key(key, 'minimo'): 'CUSTOM_MINIMAL'}, 'minimo')[key] == 'CUSTOM_MINIMAL'
    assert variant_key('prompt_a__level_b', 'c') != variant_key('prompt_a', 'b__level_c')
    key = 'prompt_meta_QSA_custom__short'
    assert level_config({variant_key(key, 'minimo'): 'CUSTOM_MINIMAL'}, 'minimo')[key] == 'CUSTOM_MINIMAL'


def test_preview_components_and_messages_show_the_same_selected_level(db, client):
    step = db.query(models.GuidedStep).filter_by(questionnaire_type='QSA').order_by(models.GuidedStep.sort_order).first()
    key = variant_key(f'guided_step:{step.id}:prompt', 'minimo')
    save(client, key, 'MINIMAL_STEP_IN_PREVIEW')
    save(client, variant_key(chat_logic.guided_step_system_prompt_key(step), 'minimo'), 'MINIMAL_SYSTEM_IN_PREVIEW')
    save(client, 'model_context_profiles', json.dumps({'ollama/fixture-small': {'level': 'minimo'}}))
    preset = models.ModelPreset(name='Variant preview', provider='ollama', model='fixture-small', is_active=True, disable_thinking=True)
    db.add(preset); db.flush()
    payload = schemas.PromptAuditRequest(questionnaire_type='QSA', phase=step.id, mode=step.system_prompt_mode,
        use_phase_prompt=True, include_knowledge=False, model_preset_id=preset.id)
    result = build_prompt_audit(db, payload)
    assert result['components']['step_prompt'] == 'MINIMAL_STEP_IN_PREVIEW'
    assert 'MINIMAL_SYSTEM_IN_PREVIEW' in result['components']['system_prompt']
    assert 'MINIMAL_STEP_IN_PREVIEW' in result['envelope']['system_prompt_final']
    assert result['resolved']['context_budget']['prompt_variant'] == 'minimo'
    assert 'instruction_prefix' not in result['components']


@pytest.mark.parametrize('override', ['same', 'different'])
def test_inherited_texts_keep_identical_contracts_with_preview_mode_override(db, override):
    step = db.query(models.GuidedStep).filter_by(questionnaire_type='QSA').order_by(models.GuidedStep.sort_order).first()
    req = ChatRequest(message='', questionnaire_type='QSA', phase=step.id, mode=step.system_prompt_mode, use_phase_prompt=True)
    ai = SimpleNamespace(config={})
    turn = prepare_chat_turn(db, ai, req, 'variant-preview-mode', {}, include_retrieval=False,
        include_history=False, create_anonymous_code=False,
        step_mode_override=step.system_prompt_mode if override == 'same' else 'generic')
    limits = {**DEFAULT_CONTEXT_LEVELS['totale'], 'short_prompt': True}
    selected, message, _, _ = fit_context(turn.system_prompt_final, turn.full_message, [],
        {'level': 'ristretto', 'limits': limits}, turn.max_tokens, context_data=ai.context_data)
    assert selected == turn.system_prompt_final
    assert message == turn.full_message
