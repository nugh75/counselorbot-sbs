"""Known factors keep their symbols when models omit icons or choose arbitrary ones."""
import asyncio
import hashlib
import json

import pytest

from backend import models, skills_seed
from backend.diagram_blocks import extract
from backend.diagram_icon_catalog import DIAGRAM_ICONS
from backend.diagram_render import parse_spec, render
from backend.diagram_symbols import FACTORS, FACTOR_SYMBOLS, resolve_symbol
from backend.message_diagrams import list_diagrams
from backend.pdf_generator import FACTOR_TRANS
from backend.questionnaire_catalog import INSTRUMENT_CATALOG_DEFAULTS
from backend.routes import diagram
from backend.tests.artifact_database import artifact_session


def spec_for(label, **node):
    return {'type': 'flow', 'title': 'Fattori in relazione',
            'nodes': [{'id': 'a', 'label': label, **node}, {'id': 'b', 'label': 'Passo successivo'}],
            'edges': [{'from': 'a', 'to': 'b'}]}


def test_dictionary_covers_all_41_catalogue_factors_with_existing_translations():
    expected = {f'{instrument.upper()}:{factor["code"].upper()}'
                for instrument, entry in INSTRUMENT_CATALOG_DEFAULTS.items() for factor in entry['factors']}
    assert len(FACTOR_SYMBOLS) == len(FACTORS) == 41
    assert set(FACTORS) == expected
    for key, entry in FACTORS.items():
        code = next(code for code in FACTOR_TRANS['it'] if code.upper() == key.split(':')[1])
        assert entry['icon'] in DIAGRAM_ICONS
        assert entry['labels'] == {lang: values[code][0] for lang, values in FACTOR_TRANS.items()}


@pytest.mark.parametrize('entry', FACTOR_SYMBOLS, ids=lambda entry: entry['id'])
def test_each_factor_overrides_arbitrary_model_icons_and_resolves_in_six_languages(entry):
    instrument = entry['id'].split(':')[0]
    for label in entry['labels'].values():
        spec = parse_spec(spec_for(label, icon='brain'), questionnaire_type=instrument)
        assert spec.nodes[0].factor == entry['id']
        assert spec.nodes[0].icon == entry['icon']
        assert spec.nodes[0].label == label
    tagged = parse_spec(spec_for('Descrizione in parole proprie', factor=entry['id'].lower(), icon=None))
    assert tagged.nodes[0].icon == entry['icon']


@pytest.mark.parametrize('label', ['Percezione di competenza (A6)', 'Bassa percezione di competenza',
                                  'Low perceived competence', 'Percezione di competenza: 3/9'])
def test_factor_level_does_not_change_its_symbol_or_text(label):
    spec = parse_spec(spec_for(label), questionnaire_type='QSA')
    assert spec.nodes[0].icon == 'individual'
    assert spec.nodes[0].label == label


@pytest.mark.parametrize('label', ['Ansietà e Interferenze (A1/A7)', 'A6', 'Percezione di competenza (A3)',
                                  'L’ansia non causa la stanchezza', 'Obiettivo non ancora raggiunto'])
def test_ambiguous_or_sentence_level_labels_are_not_reduced_to_keywords(label):
    assert resolve_symbol(label) == (None, None, False)


def test_invalid_metadata_and_idea_maps_keep_existing_behaviour():
    spec = parse_spec(spec_for('Concetto nuovo', factor='../../secret', icon='idea'))
    assert spec.nodes[0].factor is None and spec.nodes[0].icon == 'idea'
    idea = parse_spec({**spec_for('Percezione di competenza', role='assumption'), 'type': 'mindmap'})
    assert idea.nodes[0].icon == 'brain'
    assert resolve_symbol('A6', questionnaire_type='QSA') == ('QSA:A6', 'individual', True)
    assert resolve_symbol('A6', questionnaire_type='QAP') == (None, None, False)


def test_known_nonfactor_terms_fill_missing_icons_but_keep_explicit_choices():
    assert parse_spec(spec_for('Analisi post-valutazione')).nodes[0].icon == 'review'
    assert parse_spec(spec_for('Oscillazione attributiva')).nodes[0].icon == 'change'
    assert parse_spec(spec_for('Aut oe fficacia')).nodes[0].icon is None
    assert parse_spec(spec_for('Aut oe fficacia', icon='idea')).nodes[0].icon == 'idea'
    assert parse_spec(spec_for('Analisi post-valutazione', icon='search')).nodes[0].icon == 'search'


def test_saved_icon_free_qsa_diagram_is_resolved_on_read_without_rewriting_history():
    raw = spec_for('Attribuzione a cause controllabili (A3)', icon=None)
    raw['nodes'][1] = {'id': 'b', 'label': 'Percezione di competenza (A6)', 'icon': None}
    with artifact_session() as db:
        db.add(models.QuestionnaireResult(session_id='symbols', username='alice', questionnaire_type='QSA'))
        row = models.Log(action='message_diagram', username='alice', session_id='symbols',
                         details={'source_text': 'I fattori sono in relazione.', 'spec': raw})
        db.add(row)
        db.commit()
        restored = list_diagrams(db, 'symbols', 'alice')[0]['spec']
        assert [node['icon'] for node in restored['nodes']] == ['access', 'individual']
        db.refresh(row)
        assert row.details['spec'] == raw
    _, diagrams = extract('```diagram\n' + json.dumps(raw) + '\n```')
    assert [node.icon for node in diagrams[0].nodes] == ['access', 'individual']
    for theme in ('light', 'dark'):
        assert render(diagrams[0], theme=theme, fmt='svg').count(b'<svg') == 3
        assert render(diagrams[0], theme=theme, fmt='png').startswith(b'\x89PNG')


def test_manual_generation_preserves_factor_dictionary_during_fallback_and_repair(monkeypatch):
    calls = []
    raw = spec_for('A6')
    class AI:
        def __init__(self, db):
            self.config = {}
        def call_model(self, **kwargs):
            calls.append(kwargs)
            if len(calls) == 1:
                raise diagram.AIError('primary unavailable')
            return json.dumps({**raw, 'title': 'x' * 81} if len(calls) == 2 else raw)
    monkeypatch.setattr(diagram, 'AIService', AI)
    monkeypatch.setattr(diagram, '_resolve_counselor', lambda db, cid: ('ollama', 'primary', '', '', True, None))
    monkeypatch.setattr(diagram, '_diagram_fallback', lambda db: ('ollama', 'reserve', True, None))
    with artifact_session() as db:
        db.add(models.Skill(slug='concept-diagram', name='Diagram', is_active=True, status='published'))
        db.add(models.QuestionnaireResult(session_id='symbols', username='alice', questionnaire_type='QSA'))
        db.commit()
        request = diagram.FromMessageRequest(text='Percezione di competenza (A6)', counselor_id=1,
                                             spec_only=True, session_id='symbols')
        response = asyncio.run(diagram.diagram_from_message(request, db, {'username': 'alice'}))
        assert json.loads(response.body)['nodes'][0]['icon'] == 'individual'
        assert all('QSA:A6=Perceived competence -> individual' in call['system_prompt'] for call in calls)
        assert [call['model'] for call in calls] == ['primary', 'reserve', 'reserve']


@pytest.mark.parametrize('custom', [False, True])
def test_stock_migration_preserves_custom_text_flags_and_the_full_dictionary(monkeypatch, custom):
    previous = 'previous symbol prompt'
    monkeypatch.setattr(skills_seed, 'PREVIOUS_SEMANTIC_INSTRUCTIONS_SHA256', hashlib.sha256(previous.encode()).hexdigest())
    text = 'admin custom text' if custom else previous
    with artifact_session() as db:
        skill = models.Skill(slug='concept-diagram', name='Diagram', instructions_i18n={'en': text},
                             max_chars=3900, is_active=False, status='draft')
        db.add(skill)
        db.commit()
        assert skills_seed.apply_diagram_factor_symbols_policy(db) is (not custom)
        assert skill.instructions_i18n == {'en': text if custom else skills_seed.CONCEPT_DIAGRAM_INSTRUCTIONS_EN}
        assert skill.is_active is False and skill.status == 'draft'
        if not custom:
            assert skill.max_chars >= len(skills_seed.CONCEPT_DIAGRAM_INSTRUCTIONS_EN)
        assert skills_seed.apply_diagram_factor_symbols_policy(db) is False
