"""Effective platform guidance, independent of a student's existing personal goals."""
import json
from types import SimpleNamespace

import pytest

from backend import models, orientation, prompt_config
from backend.routes.site_chat import _resolve_site_prompt
from backend.tests.artifact_database import artifact_session


@pytest.mark.parametrize('language', ['it', 'en', 'es', 'fr', 'de', 'sv'])
def test_offline_catalog_includes_both_event_tools(language):
    text = orientation._PLATFORM_HELP[language]
    assert set(orientation.TOOL_IDS) <= set(orientation._tools_named_in(text))
    for tool in ('EVENTO_STUDIO', 'EVENTO_PROFESSIONALE'):
        explanation = orientation.fallback_analysis(tool, language)
        assert explanation.reply
        assert tool in orientation._TOOL_INFO[language]


def test_compass_knows_personal_journey_without_a_personal_goal(monkeypatch):
    prompts = []

    class FakeAI:
        def __init__(self, db):
            self.config = {}

        def get_response(self, message, system_prompt, *args, **kwargs):
            prompts.append(system_prompt)
            return json.dumps({'reply': 'Apri le assegnazioni ricevute nell’Area personale.',
                               'state_action': 'hold', 'recommendations': []})

    monkeypatch.setattr(orientation, 'AIService', FakeAI)
    with artifact_session() as db:
        result = orientation.analyze_turn(db, 'Dove trovo le assegnazioni ricevute?', 'it',
                                          username='guidance-new-student')
        assert db.query(models.PersonalGoal).count() == 0
        assert db.query(models.StudentBooklet).count() == 0
    assert result.state_action == 'hold'
    assert result.recommendations == []
    prompt = prompts[0]
    assert prompt_config.DEFAULT_COUNSELORBOT_CHAT_CONTEXT in prompt
    assert '/profilo/assegnazioni' in prompt
    assert '/profilo/obiettivi' in prompt
    assert 'two guided conversations' not in prompt
    assert 'EVENTO_STUDIO' in prompt and 'EVENTO_PROFESSIONALE' in prompt
    assert 'draft' in prompt and 'explicitly saves' in prompt
    assert 'step 7' in prompt
    for steps in (prompt_config.DEFAULT_EVENTO_STUDIO_GUIDED_STEPS, prompt_config.DEFAULT_EVENTO_PROFESSIONALE_GUIDED_STEPS):
        assert next(step for step in steps if step['system_prompt_mode'] == 'evento-summary')['sort_order'] == 7
    assert 'the first recommendation is always QSA' in prompt


@pytest.mark.parametrize('audience', ['docente', 'studente'])
def test_assistant_resolves_current_db_guidance_and_keeps_collections_separate(audience):
    key = prompt_config.COUNSELORBOT_CHAT_MODE_TO_PROMPT_KEY[audience]
    defaults = {row['key']: row['default'] for row in prompt_config.ALL_CONFIG_TEXT_DEFINITIONS}
    with artifact_session() as db:
        for name in (key, 'counselorbot_chat_context', 'site_chat_knowledge_card'):
            db.add(models.Config(key=name, value=defaults[name]))
        db.flush()
        service = SimpleNamespace(config={row.key: row.value for row in db.query(models.Config).all()})
        prompt = _resolve_site_prompt(service, audience, 'counselorbot')
        assert defaults[key] in prompt
        assert defaults['counselorbot_chat_context'] in prompt
        assert 'EVENTO_STUDIO' in prompt and 'EVENTO_PROFESSIONALE' in prompt
        assert 'six steps' in prompt and 'separate response snapshot' in prompt
        # A customized context still wins over the factory value; no startup overwrite.
        service.config['counselorbot_chat_context'] = 'Reviewed custom platform context'
        assert 'Reviewed custom platform context' in _resolve_site_prompt(service, audience, 'counselorbot')
        assert 'Reviewed custom platform context' not in _resolve_site_prompt(service, audience, 'competenze')
