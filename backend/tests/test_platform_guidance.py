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


def test_live_reference_changes_between_requests_and_is_collection_scoped(tmp_path, monkeypatch):
    from backend.platform_guidance import GUIDE_FILENAME, platform_guidance_context
    monkeypatch.setenv('COUNSELORBOT_DOCS_DIR', str(tmp_path))
    path = tmp_path / GUIDE_FILENAME
    path.write_text('# CounselorBot\nFeature version one')
    service = SimpleNamespace(config={'counselorbot_chat_context': 'Custom behavior preserved'})
    assert 'Feature version one' in _resolve_site_prompt(service, 'studente', 'counselorbot')
    path.write_text('# CounselorBot\nFeature version two')
    for audience in ['studente', 'docente']:
        prompt = _resolve_site_prompt(service, audience, 'counselorbot')
        assert 'Feature version two' in prompt and 'Feature version one' not in prompt
        assert 'Custom behavior preserved' in prompt
    assert 'Feature version two' in platform_guidance_context()
    for collection in ['competenze', 'questionari', 'framework', 'custom']:
        assert 'Feature version two' not in _resolve_site_prompt(service, 'studente', collection)
    path.unlink()
    with pytest.raises(FileNotFoundError):
        _resolve_site_prompt(service, 'studente', 'counselorbot')
    # Other collections do not depend on the CounselorBot documentation mount.
    _resolve_site_prompt(service, 'studente', 'competenze')


def test_reference_personal_routes_are_real_and_cover_the_personal_area():
    import re
    from pathlib import Path
    from backend.platform_guidance import read_platform_guide
    root = Path(__file__).resolve().parents[2]
    reference = read_platform_guide()
    documented = set(re.findall(r'`(/profilo(?:/[a-z-]+)?)`', reference))
    actual = {'/' + str(path.parent.relative_to(root / 'frontend/src/app'))
              for path in (root / 'frontend/src/app/profilo').rglob('page.tsx')}
    assert documented == actual
    assert '/profilo/pqbl' in reference and '/profilo/flashcard' in reference
    assert 'Riprendi un’attività' in reference and 'background' in reference


@pytest.mark.parametrize('collection', ['counselorbot', 'competenze'])
@pytest.mark.parametrize('failure', [False, True])
def test_live_reference_grounds_stream_even_without_embeddings(monkeypatch, collection, failure):
    import asyncio
    from unittest.mock import MagicMock
    from backend.routes import site_chat
    from backend.ai_service import AIError
    from backend.api_models import SiteChatRequest
    from backend.platform_guidance import GUIDE_FILENAME
    ai = SimpleNamespace(config={}, stream_response=MagicMock(return_value=iter(['Apri Area personale.'])))
    search = MagicMock(side_effect=AIError('Embeddings unavailable')) if failure else MagicMock(return_value=[])
    monkeypatch.setattr(site_chat, 'AIService', lambda db: ai)
    monkeypatch.setattr(site_chat, 'get_index', lambda collection: SimpleNamespace(search=search))
    monkeypatch.setattr(site_chat, '_apply_language_directive', lambda text, *a, **kw: text)
    monkeypatch.setattr(site_chat, '_resolve_counselor', lambda *a: (None, None))
    monkeypatch.setattr(site_chat, '_portfolio_context', lambda *a: '')
    monkeypatch.setattr(site_chat, 'log_error', MagicMock())
    memory = MagicMock()
    memory.get_relevant_context.return_value = ''
    monkeypatch.setattr(site_chat, 'session_memory', memory)
    monkeypatch.setattr(site_chat.database, 'SessionLocal', MagicMock())

    async def run():
        response = await site_chat.site_chat_stream(SiteChatRequest(message='Dove sono le Flashcard?',
            collection=collection), current_user={}, db=MagicMock())
        return [json.loads(chunk.removeprefix('data: ').strip()) async for chunk in response.body_iterator]
    output = asyncio.run(run())
    if collection == 'counselorbot':
        assert output[-1]['response'] == 'Apri Area personale.'
        assert GUIDE_FILENAME in output[-1]['sources']
        message, prompt = ai.stream_response.call_args.args[:2]
        assert '/profilo/flashcard' in message and '/profilo/pqbl' in prompt
    else:
        ai.stream_response.assert_not_called()
        assert ('error' in output[-1]) == failure
