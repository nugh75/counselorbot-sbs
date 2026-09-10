"""Frozen, synthetic step-entry inputs. Never replay by writing live prompt rows."""
from __future__ import annotations

import hashlib
import json
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from .. import models
from ..api_models import ChatRequest
from ..chat_preparation import prepare_chat_turn
from ..prompt_config import ALL_CONFIG_TEXT_DEFINITIONS

LANGUAGES = ('it', 'en', 'es', 'fr', 'de', 'sv')
PRESET_FIELDS = ('id', 'name', 'provider', 'model', 'temperature', 'max_tokens', 'disable_thinking', 'reasoning_budget')
CONFIG_EXTRA = {'feature_idea_focus', 'orientation_tool_briefs', 'active_provider', 'model_name', 'ai_fallback_targets'}
CONFIG_PREFIXES = ('prompt_component_', 'prompt_meta_', 'prompt_placeholder_')


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def values(row, fields=None):
    return {key: getattr(row, key) for key in (fields or [col.name for col in row.__table__.columns])}


def static_data(db):
    keys = {item['key'] for item in ALL_CONFIG_TEXT_DEFINITIONS} | CONFIG_EXTRA
    configs = {row.key: row.value for row in db.query(models.Config).order_by(models.Config.key)
               if row.key in keys or row.key.split('__', 1)[0] in keys or row.key.startswith(CONFIG_PREFIXES)}
    return {
        'code_hash': digest({name: hashlib.sha256((Path(__file__).parents[1] / name).read_bytes()).hexdigest()
                             for name in ('chat_preparation.py', 'chat_logic.py', 'prompt_contract.py', 'prompt_config.py', 'prompt_lab/snapshots.py', 'prompt_lab/worker.py', 'prompt_lab/evaluation.py', 'prompt_lab/contracts.py', 'prompt_lab/local_models.py', 'recommendation_blocks.py')}),
        'configs': configs,
        'steps': [values(row) for row in db.query(models.GuidedStep).filter_by(questionnaire_type='QSA').order_by(models.GuidedStep.id)],
        'factors': [values(row) for row in db.query(models.Factor).filter_by(instrument_code='QSA').order_by(models.Factor.id)],
        'counselors': [values(row, ('id', 'name', 'persona', 'preset_id', 'questionnaire_types', 'language'))
                       for row in db.query(models.Counselor).filter_by(is_active=True).order_by(models.Counselor.id)
                       if not row.questionnaire_types or 'QSA' in row.questionnaire_types],
        'presets': [values(row, PRESET_FIELDS) for row in db.query(models.ModelPreset).filter_by(is_active=True).order_by(models.ModelPreset.id)],
    }


def build_snapshot(db, payload):
    data = static_data(db)
    step = next((s for s in data['steps'] if s['id'] == payload['target_key']), None)
    if not step or step['system_prompt_mode'].endswith('summary'):
        raise ValueError('Scegli uno step QSA non di sintesi.')
    by_id = {p['id']: p for p in data['presets']}
    def preset(key):
        value = by_id.get(key)
        if not value or value['provider'] != 'ollama':
            raise ValueError('Il pilota richiede preset Ollama locali attivi.')
        return value
    roles = {'designer': preset(payload['designer_preset_id']), 'judge': preset(payload['judge_preset_id']),
             'proposer': preset(payload['proposer_preset_id']) if payload.get('proposer_preset_id') else None,
             'tested': [preset(i) for i in payload['tested_preset_ids']]}
    return {'kind': 'synthetic_step_entry', 'baseline': step['prompt'], 'target_key': step['id'],
            'source_hash': digest(data), 'render_data': data, 'presets': roles,
            'limits': ['Casi sintetici di ingresso nello step; nessuna conversazione reale importata.',
                       'Retrieval, skill dinamiche, Taccuino e memoria personale non sono riprodotti.']}


@contextmanager
def isolated_database(data):
    engine = create_engine('sqlite://')
    try:
        models.Base.metadata.create_all(engine)
        with Session(engine) as db:
            db.add_all(models.Config(key=k, value=v) for k, v in data['configs'].items())
            db.add_all(models.GuidedStep(**s) for s in data['steps'])
            db.add_all(models.Factor(**f) for f in data['factors'])
            db.commit()
            yield db
    finally:
        engine.dispose()


def render(snapshot, case, prompt):
    """Shared preparation, local clone only; history is explicitly synthetic evidence."""
    data = snapshot['render_data']
    if case['language'] not in LANGUAGES:
        raise ValueError('Lingua non supportata.')
    with isolated_database(data) as db:
        step = db.get(models.GuidedStep, snapshot['target_key'])
        if step is None:
            raise ValueError('Step assente nello snapshot.')
        step.prompt = prompt
        db.flush()
        # use_phase_prompt loads the actual component, rather than replacing final strings.
        req = ChatRequest(message='', phase=step.id, mode=step.system_prompt_mode,
                          questionnaire_type='QSA', language=case['language'], use_phase_prompt=True,
                          scores_context='\n'.join(f'{f["code"]}: 5/9' for f in data['factors']),
                          response_length='medium')
        ai = SimpleNamespace(config=dict(data['configs']))
        prepared = prepare_chat_turn(db, ai, req, 'prompt-lab-synthetic', {'username': ''},
                                     include_retrieval=False, include_history=False,
                                     create_anonymous_code=False, allow_generation=False,
                                     retrieval_context={'knowledge_context': '', 'skills_blocks': {}})
        history = [dict(item) for item in case.get('history', [])]
        if case.get('message', '').strip():
            history.append({'role': 'user', 'content': case['message']})
        return {'system_prompt_final': prepared.system_prompt_final,
                'full_message': prepared.full_message, 'history': history, 'profile_context': req.scores_context}


def coverage_blockers(snapshot, payload):
    """Fail closed: synthetic entry tests cannot certify dynamic production contexts."""
    blockers = []
    if snapshot.get('kind') == 'synthetic_step_entry':
        blockers.append('La copertura del pilota è sintetica: mancano prove rappresentative di persona, skill e contesto reale del target.')
    missing_languages = set(LANGUAGES) - set(payload.get('languages', []))
    if missing_languages:
        blockers.append('Lingue non verificate: ' + ', '.join(sorted(missing_languages)))
    return blockers


def freeze_models(snapshot):
    from .local_models import LocalModels
    tags = LocalModels(timeout=5).digests()
    roles = snapshot['presets']
    selected = [roles['designer'], roles['judge'], *roles['tested']]
    if roles.get('proposer'):
        selected.append(roles['proposer'])
    frozen = {}
    for preset in selected:
        name = preset['model']
        resolved = name if name in tags else name + ':latest'
        if not tags.get(resolved):
            raise ValueError('Modello locale non disponibile: ' + name)
        frozen[resolved] = tags[resolved]
    snapshot['model_digests'] = frozen
    return snapshot


def visible_response(snapshot, case, response):
    from .. import recommendation_blocks
    from ..chat_logic import _student_visible_response, _requires_complete_factor_output, _phase_factor_codes
    cleaned, _ = recommendation_blocks.extract(response)
    with isolated_database(snapshot['render_data']) as db:
        step = db.get(models.GuidedStep, snapshot['target_key'])
        codes = _phase_factor_codes(db, step.id) if _requires_complete_factor_output(step.system_prompt_mode) else None
        return _student_visible_response(cleaned, 'QSA', case['language'], False, required_codes=codes)
