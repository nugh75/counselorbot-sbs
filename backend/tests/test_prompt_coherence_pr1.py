"""Prompt coherence, PR 1 (#748): one schema per surface, no dead prompts.

Factory texts changed here are also written to the database, overwriting saved
versions once (owner decision 5.1 of the prompt coherence audit).
"""
from backend import models, skills_seed
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
