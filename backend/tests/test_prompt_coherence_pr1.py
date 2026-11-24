"""Prompt coherence, PR 1 (#748): one schema per surface, no dead prompts.

Factory texts changed here are also written to the database, overwriting saved
versions once (owner decision 5.1 of the prompt coherence audit).
"""
from importlib import import_module
from pathlib import Path

from sqlalchemy import text

from backend import ai_service, models, pqbl_generator, prompt_config, prompt_revisions, skills_seed
from backend.prompt_factory_alignment import apply_plan, factory_catalog, make_plan
from backend.tests.artifact_database import artifact_session

ROOT = Path(__file__).resolve().parents[2]


# A05: IDEA patches use source/target everywhere.
def test_idea_skill_uses_the_contract_edge_keys():
    text_ = skills_seed.IDEA_FOCUS_INSTRUCTIONS_EN
    assert '"add_edges":[{"source":"t1","target":"idea","kind":"weakens"}]' in text_
    assert '"from"' not in text_ and '"to"' not in text_


def test_idea_edge_policy_overwrites_the_stored_skill_once():
    with artifact_session() as db:
        skill = models.Skill(slug='idea-focus', name='Idea', instructions_i18n={'en': 'Admin "from":"t1","to":"idea"'},
                             max_chars=3200, is_active=False, status='draft')
        db.add(skill)
        db.commit()
        assert skills_seed.apply_idea_edge_keys_policy(db) is True
        db.refresh(skill)
        assert skill.instructions_i18n == {'en': skills_seed.IDEA_FOCUS_INSTRUCTIONS_EN}
        assert skill.is_active is False and skill.status == 'draft'
        skill.instructions_i18n = {'en': 'Admin edit after the alignment'}
        db.commit()
        assert skills_seed.apply_idea_edge_keys_policy(db) is False
        db.refresh(skill)
        assert skill.instructions_i18n == {'en': 'Admin edit after the alignment'}


# C08: the Tavolo ignores `factor`, so its icon rule never asks for it.
def test_tavolo_icon_rule_has_no_factor_field():
    from backend.diagram_icon_catalog import ICON_SELECTION_PROMPT, TAVOLO_ICON_SELECTION_PROMPT
    from backend.routes.tavolo import _compose_system_prompt

    assert 'set factor to INSTRUMENT:CODE' in ICON_SELECTION_PROMPT
    composed = _compose_system_prompt(None)
    assert TAVOLO_ICON_SELECTION_PROMPT in composed
    assert 'factor' not in composed and 'INSTRUMENT:CODE' not in composed
    assert 'Icon meanings:' in composed


# B01 + D04: QSAr second level follows the language directive and knows single-factor steps.
def test_qsar_second_level_has_no_fixed_language_and_a_single_factor_exception():
    prompt = prompt_config.DEFAULT_SYSTEM_PROMPT_QSAR_SECOND_LEVEL
    assert 'in English' not in prompt
    assert 'single-factor steps skip this requirement' in prompt_config.DEFAULT_FACTOR_INTERPLAY_QSAR
    assert prompt_config.DEFAULT_FACTOR_INTERPLAY_QSAR in prompt


def test_changed_factory_text_preserves_personalised_row_unless_explicitly_selected():
    from backend.prompt_factory_alignment import apply_review, review_hash
    configs, _ = factory_catalog()
    key = 'prompt_qsar_second_level'
    with artifact_session() as db:
        db.add(models.Config(key=key, value='Admin text proposing guidance in English.'))
        prompt_revisions.record(db, 'config', key, 'Admin text proposing guidance in English.', prompt_revisions.ORIGIN_ADMIN)
        db.commit()
        plan = make_plan(db)
        assert plan['changes'] == []
        assert len(plan['preserved']) == 1
        preserved = plan['preserved'][0]
        assert preserved['scope'] == 'config' and preserved['key'] == key
        assert preserved['reason'] == 'personalised' and preserved['status'] == 'customised'
        assert preserved['before'] == 'Admin text proposing guidance in English.'
        assert preserved['after'] == configs[key]
        # Default alignment leaves the customised prompt untouched.
        result = apply_review(db, review_hash(plan), author='alignment')
        assert result['updated'] == 0
        assert db.query(models.Config).filter_by(key=key).one().value == 'Admin text proposing guidance in English.'
        # Explicit selection aligns it and keeps the custom text restorable in history.
        result = apply_review(db, review_hash(plan), author='alignment', selected=[{'scope': 'config', 'key': key}])
        assert result['updated'] == 1
        assert db.query(models.Config).filter_by(key=key).one().value == configs[key]
        revs = prompt_revisions.history(db, scope='config', target_key=key)
        assert [r.value for r in revs[:2]] == [configs[key], 'Admin text proposing guidance in English.']


# D01, D02, D03, D06: unused prompts are gone, with their admin controls and DB keys.
def test_pqbl_skill_extraction_prompt_is_removed_with_control_and_db_key():
    configs, _ = factory_catalog()
    assert 'pqbl_skill_extraction_prompt' not in configs
    assert not (ROOT / 'backend/prompts/default_pqbl_skill_extraction_prompt.md').exists()
    assert 'pqbl_skill_extraction_prompt' not in (ROOT / 'frontend/src/components/admin/PqblAdminPanel.tsx').read_text()
    assert 'pqbl_skill_extraction_prompt' not in (ROOT / 'frontend/src/lib/i18n-admin.ts').read_text()
    migration = import_module('backend.migrations.20261031_drop_dead_prompts')
    with artifact_session() as db:
        db.add(models.Config(key='pqbl_skill_extraction_prompt', value='Old prompt'))
        db.add(models.Config(key='pqbl_question_generation_prompt', value='Live prompt'))
        db.commit()
        migration.drop_dead_prompt_keys(db.connection())
        migration.drop_dead_prompt_keys(db.connection())
        db.expire_all()
        keys = {row[0] for row in db.execute(text("SELECT key FROM configs"))}
        assert 'pqbl_skill_extraction_prompt' not in keys
        assert 'pqbl_question_generation_prompt' in keys


def test_pqbl_unused_chunk_template_is_removed():
    assert not hasattr(pqbl_generator, '_CHUNK_PROMPT_TEMPLATE')


def test_unused_italian_rolling_summary_is_removed():
    assert not hasattr(ai_service, 'SUMMARY_SYSTEM_PROMPT')
    assert not hasattr(ai_service.AIService, 'generate_summary')


def test_unused_pellerey_selfcontrol_meta_is_removed():
    assert not hasattr(prompt_config, 'PELLEREY_SELFCONTROL')
    assert not (ROOT / 'backend/prompts/pellerey_selfcontrol.md').exists()
    assert prompt_config.PELLEREY_SELF_REGULATION_CYCLE
