"""Canonical QPCC contracts, guided turns, safe factory update and history isolation."""
import json
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend import models, schemas, prompt_config, prompt_revisions, scoring_service
from backend.ai_service import AIService
from backend.api_models import ChatRequest
from backend.chat_logic import _phase_factor_codes, competence_factor_names, _apply_competence_step_profile_directive
from backend.chat_preparation import prepare_chat_turn
from backend.qpcc import CODES, FACTORS, INVERTED, STEP_CODES, names, score_context
from backend.qpcc_alignment import make_plan, apply_plan
from backend.qsa_extractor import QUESTIONNAIRE_FACTORS, _scores_schema, _validate_scores
from backend.questionnaire_catalog import INSTRUMENT_CATALOG_DEFAULTS
from backend.tests.artifact_database import artifact_session

LEGACY = json.loads(Path(__file__).resolve().parents[1].joinpath('qpcc_factory_legacy.json').read_text())
SCORES = {code: 5 for code in CODES}


def seed_legacy(db):
    for key, value in LEGACY['configs'].items():
        db.add(models.Config(key=key, value=value))
    for step in LEGACY['steps'].values():
        db.add(models.GuidedStep(**step))
    db.add(models.QuestionnaireItem(instrument_code='QPCC', item_number=1, factor_code='K1', text_en='Replacement item', active=True))
    db.add(models.QuestionnaireResult(session_id='old', questionnaire_type='QPCC', scores={'K1': 8, 'K2': 7}, username='fixture'))
    db.add(models.QuestionnaireResult(session_id='unrelated', questionnaire_type='QSA', scores={'C1': 6}, username='fixture'))
    db.add(models.OrientationToolBrief(tool_id='QPCC', brief=LEGACY['brief'], is_active=True))
    for lang in ('it','en','es','fr','de','sv'):
        old = LEGACY['questions_it']['qpcc-controllo'] if lang == 'it' else LEGACY['questions_i18n']['qpcc-controllo'][lang]
        for i, question in enumerate(old):
            db.add(models.GuidedStepQuestion(questionnaire_type='QPCC', step_id='qpcc-controllo', language=lang, text=question, sort_order=i))
    db.commit()


def test_schema_counts_names_dimensions_items_and_extraction_are_aligned():
    assert CODES == ('A1','A2','A3','V1','V2','C1','C2','M1','M2','M3')
    assert {f['dimension'] for f in FACTORS} == set('AVCM')
    assert {f['code'] for f in FACTORS if f['orientation'] == 'difficulty'} == INVERTED
    assert next(f['orientation'] for f in FACTORS if f['code'] == 'M2') == 'neutral'
    spec = INSTRUMENT_CATALOG_DEFAULTS['QPCC']
    assert tuple(f['code'] for f in spec['factors']) == CODES and spec['items'] == []
    root = Path(__file__).resolve().parents[2]
    catalog_path = root / 'questionari/item_catalog/qpcc.json'
    if catalog_path.exists():
        catalog = json.loads(catalog_path.read_text())
        assert catalog['n_items'] == len(catalog['items']) == 63
        assert catalog['factors'] == FACTORS
        assert all(item['factor'] is None and not item['text']['it'] for item in catalog['items'])
        assert catalog['report_scale'] == {'type':'stanine','min':1,'max':9}
    frontend_schema = root / 'frontend/src/lib/qpcc-schema.json'
    if frontend_schema.exists():
        assert json.loads(frontend_schema.read_text()) == FACTORS
    assert QUESTIONNAIRE_FACTORS['QPCC'] == CODES
    assert _scores_schema(CODES)['required'] == list(CODES)
    assert _validate_scores(SCORES, CODES) == SCORES
    with pytest.raises(ValueError):
        _validate_scores({'K1':5}, CODES)


@pytest.mark.parametrize('scores', [{'K1':5}, {}, {**SCORES,'K1':5}, {k:v for k,v in SCORES.items() if k!='A3'}, {**SCORES,'A1':True}, {**SCORES,'M2':9.1}, {**SCORES,'V1':0}, {**SCORES,'C2':10}, {**SCORES,'M1':float('inf')}, {**SCORES,'M1':float('nan')}])
def test_new_result_and_practice_contract_reject_legacy_or_invalid_scores(scores):
    for cls in (schemas.QuestionnaireResultCreate, schemas.PracticeResultCreate):
        with pytest.raises(ValidationError):
            cls(session_id='new', questionnaire_type='QPCC', scores=scores)


def test_new_canonical_profiles_are_accepted_without_changing_other_instruments():
    assert schemas.QuestionnaireResultCreate(session_id='new', questionnaire_type='QPCC', scores=SCORES).scores == SCORES
    assert schemas.PracticeResultCreate(questionnaire_type='QPCC', scores=SCORES).scores == SCORES
    assert schemas.QuestionnaireResultCreate(session_id='qsa', questionnaire_type='QSA', scores={'C1':3}).scores == {'C1':3}


@pytest.mark.parametrize('lang', ('it','en','es','fr','de','sv'))
def test_guided_runtime_scope_labels_direction_and_final_contract(lang):
    with artifact_session() as db:
        for step in prompt_config.DEFAULT_QPCC_GUIDED_STEPS:
            db.add(models.GuidedStep(**step))
        db.flush()
        ai = AIService(db)
        ai.config.update(active_provider='ollama', model_name='test-local')
        text = '\n'.join(f'- {code} (WRONG QSA LABEL): {9 if code in INVERTED else 2}/9' for code in CODES)
        assert 'WRONG' not in score_context(text,lang)
        assert competence_factor_names(db,'QPCC',lang) == names(lang)
        seen = set()
        for phase, codes in STEP_CODES.items():
            if phase == 'qpcc-factors':
                continue
            assert _phase_factor_codes(db,phase) == set(codes)
            request = ChatRequest(questionnaire_type='QPCC', phase=phase, use_phase_prompt=True, language=lang, scores_context=text)
            turn = prepare_chat_turn(db,ai,request,'fixture',{},include_retrieval=False,include_history=False,create_anonymous_code=False)
            assert '[CANONICAL QPCC CONTRACT]' in turn.system_prompt_final
            assert 'A1/A2/A3 scores reflect more self-reported difficulty' in turn.system_prompt_final
            assert 'M2 describes ego orientation' in turn.system_prompt_final
            assert 'WRONG' not in turn.model_scores_context
            for code in codes:
                assert names(lang)[code] in turn.model_scores_context
                assert f'- {code} (' in turn.message_scores_context
            for code in set(CODES)-set(codes):
                assert f'- {code} (' not in turn.message_scores_context
            if phase != 'qpcc-profilo':
                seen.update(codes)
        assert seen == set(CODES)
        turn = prepare_chat_turn(db,ai,ChatRequest(questionnaire_type='QPCC', phase='qpcc-intro',use_phase_prompt=True,language=lang),'intro',{},include_retrieval=False,include_history=False)
        assert 'explicit acceptance' in turn.system_prompt_final and '20-30' in turn.system_prompt_final
        with pytest.raises(HTTPException) as error:
            prepare_chat_turn(db,ai,ChatRequest(questionnaire_type='QPCC',phase='qpcc-profilo',scores_context='K1: 8/9'),'old',{},include_retrieval=False,include_history=False)
        assert error.value.status_code == 409
        result = _apply_competence_step_profile_directive('', 'QPCC',lang,score_context(text,lang),set(CODES),names(lang))
        assert f'- M2 ({names(lang)["M2"]}): 2/9 = {names(lang)["M2"]}' in result
        # Identical high difficulties and low resources both need work, never strength.
        lines = [line for line in result.splitlines() if line.startswith('- ')]
        assert lines[0].split(' = ')[1] == lines[3].split(' = ')[1]


def test_scoring_and_public_catalog_block_replacement_administration():
    from backend.routes import survey
    with artifact_session() as db:
        db.add(models.Instrument(code='QPCC',is_active=True,name_en='QPCC',status='experimental'))
        db.add(models.QuestionnaireItem(instrument_code='QPCC',item_number=1,factor_code='K1',text_en='Replacement',active=True))
        db.commit()
        assert not scoring_service.locale_available(db,'QPCC','en')
        with pytest.raises(scoring_service.ScoringError, match='canonical item key'):
            scoring_service.compute_profile(db,'QPCC','en',{1:4})
        import asyncio
        listed = asyncio.run(survey.list_instruments(db, {'is_admin':True}))
        assert listed[0]['available_locales'] == [] and listed[0]['item_count'] == 0
        app = FastAPI(); app.include_router(survey.router)
        app.dependency_overrides[survey.get_db] = lambda: db
        app.dependency_overrides[survey.auth.get_identity_view_as] = lambda: {'is_admin':True,'username':'fixture','authenticated':True}
        with TestClient(app) as client:
            assert client.post('/questionnaire-result',json={'session_id':'bad','questionnaire_type':'QPCC','scores':{'K1':5}}).status_code == 422
            response = client.post('/questionnaire-result',json={'session_id':'canonical','questionnaire_type':'QPCC','scores':SCORES})
            assert response.status_code == 200, response.text
            assert response.json()['scores'] == SCORES
            assert client.get('/instruments/QPCC/rules?locale=en').status_code == 409
            assert client.post('/instruments/QPCC/score',json={'session_id':'blocked','locale':'en','answers':{'1':4}}).status_code == 400


def test_reviewed_migration_preserves_history_customisations_and_rollback():
    with artifact_session() as db:
        seed_legacy(db)
        custom = db.query(models.GuidedStep).filter_by(id='qpcc-controllo').one()
        custom.prompt = 'Administrator custom interview'; db.commit()
        plan = make_plan(db)
        assert 'personalised step:qpcc-controllo' in plan['preserved']
        assert all(c['scope'] not in ('result','validation','log','frozen') for c in plan['changes'])
        assert apply_plan(db,plan) == len(plan['changes'])
        assert db.query(models.QuestionnaireResult).filter_by(session_id='old').one().scores == {'K1':8,'K2':7}
        assert db.query(models.QuestionnaireResult).filter_by(session_id='unrelated').one().scores == {'C1':6}
        assert db.query(models.QuestionnaireItem).one().active is False
        assert custom.prompt == 'Administrator custom interview'
        assert {f.code for f in db.query(models.Factor).all()} == set(CODES)
        assert db.query(models.GuidedStepQuestion).filter_by(language='it').first().text in LEGACY['new_questions']['qpcc-controllo']['it']
        assert make_plan(db)['changes'] == []
        assert apply_plan(db,plan,rollback=True) == len(plan['changes'])
        assert db.query(models.QuestionnaireItem).one().active is True
        assert db.query(models.Factor).count() == 0
        assert db.query(models.Config).filter_by(key='prompt_qpcc_factor').one().value == LEGACY['configs']['prompt_qpcc_factor']


def test_migration_refuses_a_stale_plan_atomically_and_preserves_admin_owned_factory_text():
    with artifact_session() as db:
        seed_legacy(db)
        prompt_revisions.record(db,'config','prompt_qpcc_welcome',LEGACY['configs']['prompt_qpcc_welcome'],prompt_revisions.ORIGIN_ADMIN,author='fixture')
        db.commit()
        plan = make_plan(db)
        assert 'personalised config:prompt_qpcc_welcome' in plan['preserved']
        row = db.query(models.GuidedStep).filter_by(id='qpcc-profilo').one()
        row.prompt = 'Changed after review';db.commit()
        with pytest.raises(ValueError, match='changed since review'):
            apply_plan(db,plan)
        assert db.query(models.Config).filter_by(key='prompt_qpcc_factor').one().value == LEGACY['configs']['prompt_qpcc_factor']
        assert db.query(models.Factor).count() == 0
        assert db.query(models.QuestionnaireItem).one().active is True


def test_telegram_uses_canonical_codes_even_with_stale_catalog():
    from backend.telegram_state import allowed_factor_codes, format_scores_context, parse_scores
    with artifact_session() as db:
        db.add(models.Factor(instrument_code='QPCC',code='K1',label_it='Legacy'));db.flush()
        assert allowed_factor_codes(db,'QPCC') == list(CODES)
        assert names('it')['C2'] in format_scores_context(db,'QPCC',SCORES,'it')
        parsed, extra, invalid = parse_scores(' '.join(f'{c}=5' for c in CODES), list(CODES))
        assert parsed == SCORES and not extra and not invalid


def test_frozen_and_comparison_do_not_reuse_old_profiles():
    from backend.routes.frozen_sessions import _detail
    from backend.skills.handlers import load_profile_results
    with artifact_session() as db:
        seed_legacy(db)
        with pytest.raises(HTTPException) as error:
            _detail(models.FrozenSession(session_id='old',username='fixture',questionnaire_type='QPCC',data={'scores':{'K1':8},'current_phase':'qpcc-profilo'}))
        assert error.value.status_code == 409
        entries = load_profile_results(db,'old','fixture','it')
        assert all(entry['questionnaire_type'] != 'QPCC' for entry in entries)


def test_alignment_rejects_a_concurrent_admin_ownership_claim():
    with artifact_session() as db:
        seed_legacy(db)
        plan = make_plan(db)
        prompt_revisions.record(db,'config','prompt_qpcc_factor',LEGACY['configs']['prompt_qpcc_factor'],prompt_revisions.ORIGIN_ADMIN,author='fixture')
        db.commit()
        with pytest.raises(ValueError,match='ownership changed'):
            apply_plan(db,plan)
        assert db.query(models.Factor).count() == 0


def test_qpcc_score_bands_and_opencode_are_scoped_to_the_canonical_instrument():
    from backend.certified_strategy_service import score_bands
    from backend.routes.opencode import _scores_markdown
    text = '\n'.join(f'- {code} ({label}): {9 if code in INVERTED or code == "M2" else 1}/9' for code,label in names('it').items())
    bands = score_bands('QPCC',text)
    assert set(bands) == set(CODES)
    assert bands['A2'] == 'growth' and bands['V1'] == 'growth' and bands['M2'] == 'normal'
    with artifact_session() as db:
        markdown = _scores_markdown(db,'QPCC',SCORES,'it')
        assert 'Competenza comunicativa' in markdown and 'INVERTITO' in markdown
        assert '| M2 | Orientamento all’io | 5/9 | Orientamento all’io |' in markdown
        with pytest.raises(HTTPException) as error:
            _scores_markdown(db,'QPCC',{'K1':5},'it')
        assert error.value.status_code == 422


def test_qpcc_pdf_uses_its_own_names_and_directions_without_qsa_collisions():
    from backend.pdf_generator import generate_questionnaire_pdf
    from pypdf import PdfReader
    profile = dict(SCORES,A1=9,A2=9,A3=9,M2=9)
    output = generate_questionnaire_pdf('QPCC',profile,'fixture',language='it')
    text = '\n'.join(page.extract_text() for page in PdfReader(output).pages)
    assert 'Senso di insicurezza' in text and 'Competenza comunicativa' in text
    assert 'Volizione' not in text and '9/9   [Forza]' not in text
    assert '9/9   [Orientamento' in text


def test_telegram_restarts_an_obsolete_state_before_saving_or_calling_a_model(monkeypatch):
    import asyncio
    from backend import telegram_state
    sent = []
    async def fake_send(chat_id, text, **kwargs):
        sent.append(text)
    monkeypatch.setattr(telegram_state.telegram_bot, 'send_message', fake_send)
    with artifact_session() as db:
        state = models.TelegramConversationState(telegram_user_id=242, telegram_chat_id=242, username='fixture', language='it', state='in_step', questionnaire_type='QPCC', scores={'K1':8})
        db.add(state);db.commit()
        assert not asyncio.run(telegram_state._require_qpcc_scores(db,state))
        assert state.state == 'enter_scores' and state.scores == {}
        assert len(sent) == 2 and 'dieci stanine' in sent[0]
        assert all(code in sent[1] for code in CODES)
        assert db.query(models.QuestionnaireResult).count() == 0


def test_admin_factor_api_excludes_the_archived_synthetic_areas():
    import asyncio
    from backend.routes.admin import admin_list_factors
    with artifact_session() as db:
        db.add(models.Factor(instrument_code='QPCC',code='K1'))
        for index, factor in enumerate(FACTORS):
            db.add(models.Factor(instrument_code='QPCC',code=factor['code'],sort_order=index))
        db.commit()
        assert tuple(row.code for row in asyncio.run(admin_list_factors('QPCC',{},db))) == CODES
        assert db.query(models.Factor).filter_by(code='K1').count() == 1
