"""Catalogue compatibility, real exports and non-destructive prompt migration."""
import hashlib
from io import BytesIO
import json
import xml.etree.ElementTree as ET

from PIL import Image
import pytest
from pypdf import PdfReader

from backend import models, skills_seed
from backend.diagram_icon_catalog import DIAGRAM_ICONS, ICON_CATALOG, ICON_SELECTION_PROMPT
from backend.diagram_render import ICON_DIR, parse_spec, render, to_dot
from backend.pdf_generator import generate_questionnaire_pdf
from backend.routes.diagram import SPEC_ONLY_SYSTEM_PROMPT
from backend.skills.engine import truncate
from backend.tests.artifact_database import artifact_session


def test_catalogue_has_100_distinct_meanings_and_preserves_old_ids():
    assert len(DIAGRAM_ICONS) == len(set(DIAGRAM_ICONS)) == 100
    assert {'book', 'brain', 'check', 'clock', 'compass', 'heart', 'idea', 'question', 'shield', 'target'} <= set(DIAGRAM_ICONS)
    assert all(entry['meaning'].strip() for entry in ICON_CATALOG)


@pytest.mark.parametrize('icon', DIAGRAM_ICONS)
def test_every_icon_has_safe_vector_and_both_raster_exports(icon):
    svg = ET.parse(ICON_DIR / f'{icon}.svg').getroot()
    assert svg.attrib['viewBox'] == '0 0 24 24'
    for element in svg.iter():
        assert element.tag.rsplit('}', 1)[-1] not in {'script', 'foreignObject', 'image'}
        assert not any(name.startswith('on') or name.endswith('href') for name in element.attrib)
    for theme in ('light', 'dark'):
        with Image.open(ICON_DIR / f'{icon}-{theme}.png') as image:
            assert image.size == (48, 48)
            assert image.convert('RGBA').getchannel('A').getextrema() == (0, 255)


MIXED = {
    'type': 'flow', 'title': 'Un piano lascia spazio alla verifica',
    'nodes': [
        {'id': 'a', 'label': 'Pianificare la settimana', 'icon': 'calendar'},
        {'id': 'b', 'label': 'Obiettivo non ancora raggiunto', 'icon': None, 'form': 'outcome'},
        {'id': 'c', 'label': 'Rivedere la strategia', 'icon': 'review'},
    ],
    'edges': [{'from': 'a', 'to': 'b'}, {'from': 'b', 'to': 'c'}],
}


@pytest.mark.parametrize('theme', ['light', 'dark'])
def test_mixed_icons_and_text_keep_meaning_in_svg_and_png(theme):
    spec = parse_spec(MIXED)
    assert spec.nodes[1].icon is None
    assert spec.nodes[1].label == MIXED['nodes'][1]['label']
    assert 'shape="ellipse"' in to_dot(spec)
    svg = render(spec, theme=theme, fmt='svg').decode('utf-8')
    assert 'diagram_icons/' not in svg
    assert svg.count('<svg') == 3  # document plus the two embedded icon vectors
    assert 'ancora' in svg
    png = render(spec, theme=theme, fmt='png')
    with Image.open(BytesIO(png)) as image:
        assert image.width > 100 and image.height > 100


def test_mixed_diagram_and_labels_survive_session_pdf():
    text = '```diagram\n' + json.dumps(MIXED) + '\n```'
    pdf = generate_questionnaire_pdf(
        questionnaire_type='QSA', scores={}, session_id='icon-test', language='it',
        messages=[{'role': 'counselor', 'text': text}],
    ).getvalue()
    reader = PdfReader(BytesIO(pdf))
    assert sum(len(page.images) for page in reader.pages) >= 1


def test_both_generation_paths_receive_the_complete_semantic_catalogue():
    instructions = skills_seed.CONCEPT_DIAGRAM_INSTRUCTIONS_EN
    assert ICON_SELECTION_PROMPT in instructions
    assert ICON_SELECTION_PROMPT in SPEC_ONLY_SYSTEM_PROMPT
    seed = next(seed for seed in skills_seed.SKILL_SEEDS if seed['slug'] == 'concept-diagram')
    assert truncate(instructions, seed['max_chars']) == instructions
    assert 'every node in' not in instructions
    assert 'set factor to INSTRUMENT:CODE' in instructions


@pytest.mark.parametrize('custom', [False, True])
def test_migration_preserves_custom_text_and_activation_state(monkeypatch, custom):
    previous = 'Previous stock instructions'
    monkeypatch.setattr(skills_seed, 'PREVIOUS_DIAGRAM_INSTRUCTIONS_SHA256', hashlib.sha256(previous.encode()).hexdigest())
    original = 'Admin instructions with specific examples' if custom else previous
    with artifact_session() as db:
        skill = models.Skill(slug='concept-diagram', name='Diagram', instructions_i18n={'en': original},
                             max_chars=3600, is_active=False, status='draft')
        db.add(skill)
        db.commit()
        assert skills_seed.apply_diagram_semantic_icons_policy(db) is (not custom)
        db.refresh(skill)
        assert skill.instructions_i18n == {'en': original if custom else skills_seed.CONCEPT_DIAGRAM_INSTRUCTIONS_EN}
        assert skill.max_chars == (3600 if custom else 3900)
        assert skill.is_active is False and skill.status == 'draft'
        assert skills_seed.apply_diagram_semantic_icons_policy(db) is False
