"""Prompt coherence, PR 1 (#748): one schema per surface, no dead prompts.

Factory texts changed here are also written to the database, overwriting saved
versions once (owner decision 5.1 of the prompt coherence audit).
"""
from backend import models, prompt_config, prompt_revisions, skills_seed
from backend.prompt_factory_alignment import apply_plan, factory_catalog, make_plan
from backend.tests.artifact_database import artifact_session


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


def test_changed_factory_text_overwrites_a_personalised_row_once():
    configs, _ = factory_catalog()
    key = 'prompt_qsar_second_level'
    with artifact_session() as db:
        db.add(models.Config(key=key, value='Admin text proposing guidance in English.'))
        prompt_revisions.record(db, 'config', key, 'Admin text proposing guidance in English.', prompt_revisions.ORIGIN_ADMIN)
        db.commit()
        plan = make_plan(db)
        assert [change['key'] for change in plan['changes']] == [key]
        apply_plan(db, plan, author='alignment', origin=prompt_revisions.ORIGIN_MIGRATION)
        assert db.query(models.Config).filter_by(key=key).one().value == configs[key]
        # A later admin edit is the admin's again: no second overwrite.
        row = db.query(models.Config).filter_by(key=key).one()
        row.value = 'A later admin edit.'
        prompt_revisions.record(db, 'config', key, row.value, prompt_revisions.ORIGIN_ADMIN)
        db.commit()
        assert make_plan(db)['changes'] == []
        assert make_plan(db)['preserved'] == [{'scope': 'config', 'key': key, 'reason': 'personalised'}]
