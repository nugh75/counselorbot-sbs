"""Contenuti dei percorsi allineati tra prompt e schede (#751, audit di coerenza, sezione 4)."""
import json
import os
from pathlib import Path
from types import SimpleNamespace

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import pytest

from backend import models, prompt_config, qpcc
from backend.content_versions import APP_LOCALES
from backend.cross_synthesis import MIN_INSTRUMENTS, SCORED_INSTRUMENTS
from backend.prompt_updates import digest
from backend.tests.artifact_database import artifact_session

LEGACY = json.loads((Path(__file__).parents[1] / "prompt_factory_legacy.json").read_text())
TRANSLATIONS = json.loads((Path(__file__).parents[1] / "translations_seed.json").read_text())


def _config_default(key):
    return next(i["default"] for i in prompt_config.ALL_CONFIG_TEXT_DEFINITIONS if i["key"] == key)


# --- B07: il numero degli ambiti esce dalla domanda suggerita ---------------

def test_strategic_competence_question_does_not_count_the_areas():
    from backend.assistant_questions_seed import DEFAULT_ASSISTANT_QUESTIONS
    texts = [*DEFAULT_ASSISTANT_QUESTIONS["fw_teoria"],
             *(q for qs in TRANSLATIONS["assistant_questions"]["fw_teoria"].values() for q in qs)]
    for word in ("otto", "eight", "ocho", "huit", "acht", "åtta", "sette", "seven"):
        assert not any(f" {word} " in f" {text.lower()} " for text in texts), word


def test_seed_rewrites_the_stored_question_with_the_count():
    from backend.assistant_questions_seed import DEFAULT_ASSISTANT_QUESTIONS, seed_assistant_questions
    with artifact_session() as db:
        db.add(models.AssistantQuestion(topic="fw_teoria", language="it", sort_order=19, is_active=True,
                                        text="Quali sono gli otto ambiti di competenza strategica?"))
        db.add(models.AssistantQuestion(topic="fw_teoria", language="en", sort_order=19, is_active=True,
                                        text="What are the eight areas of strategic competence?"))
        db.flush()
        seed_assistant_questions(db, models)
        rows = [(r.language, r.text) for r in db.query(models.AssistantQuestion).filter_by(topic="fw_teoria")]
    texts = set(rows)
    assert ("it", "Quali sono gli otto ambiti di competenza strategica?") not in texts
    assert ("en", "What are the eight areas of strategic competence?") not in texts
    assert ("it", DEFAULT_ASSISTANT_QUESTIONS["fw_teoria"][-1]) in texts
    assert ("en", TRANSLATIONS["assistant_questions"]["fw_teoria"]["en"][-1]) in texts
    assert len(rows) == len(texts) and len([t for t in rows if t[0] == "it"]) == 20


# --- B04: il ripiego Savickas non impone un piano 7/30/90 -------------------

def test_savickas_frontend_fallback_keeps_only_agreed_timeframes():
    source = (Path(__file__).parents[2] / "frontend/src/components/qsa/GuidedChatInterface.tsx").read_text()
    assert "7/30/90" not in source
    final = source[source.index("id: 'savickas-final'"):]
    final = final[:final.index("},")]
    assert "concordat" in final


# --- B06: la bozza di Obiettivo docenza descrive attivita', prova e criterio -

def test_goal_draft_describes_class_activities_for_teachers():
    from backend.prompt_contract import turn_contract
    common = dict(language="it", phase="final", advice_allowed=False, synthesis=True)
    studio = turn_contract(questionnaire_type="OBIETTIVO_STUDIO", **common)
    docenza = turn_contract(questionnaire_type="OBIETTIVO_DOCENZA", **common)
    assert "the first steps and the if-then plan" in studio
    assert "if-then" not in docenza and "first steps" not in docenza
    assert "activities" in docenza and "proof" in docenza and "criterion" in docenza


# --- A06: i fattori del passo QPCC li dichiara solo il codice ---------------

@pytest.mark.parametrize("key", ["prompt_qpcc_interview", "prompt_qpcc_summary"])
def test_static_qpcc_prompts_do_not_declare_the_current_factors(key):
    text = _config_default(key)
    assert "Current step factors" not in text
    assert "[CANONICAL QPCC CONTRACT]" not in text


def test_qpcc_step_declares_only_its_own_factors():
    composed = _config_default("prompt_qpcc_interview") + "\n\n" + qpcc.directive("qpcc-comunicazione")
    assert composed.count("Current step factors") == 1
    assert "Current step factors: A1." in composed


# --- B05, B08: la scheda QPCC della Bussola descrive soltanto ---------------

def test_qpcc_compass_brief_is_descriptive():
    from backend.tool_brief_seed import TOOL_BRIEFS
    brief = TOOL_BRIEFS["QPCC"]
    for heading in ("WHAT IT LOOKS AT", "WHAT YOU GET", "WHEN IT IS THE RIGHT MOMENT", "WHAT IT DOES NOT DO"):
        assert heading in brief
    for directive in ("[CANONICAL QPCC CONTRACT]", "Stay with this area", "ONE open question",
                      "explicit acceptance", "Current step factors", "five areas"):
        assert directive not in brief


def test_compass_qpcc_factor_line_lists_factors_without_the_interview_contract():
    from backend.orientation import _factor_line
    line = _factor_line(None, "QPCC")
    assert line.startswith("Factors it reports: ")
    assert all(code in line for code in qpcc.CODES)
    assert "Stay with this area" not in line and "[CANONICAL QPCC CONTRACT]" not in line


def test_seed_aligns_the_three_historical_briefs_and_keeps_the_others():
    from backend.tool_brief_seed import TOOL_BRIEFS, seed_tool_briefs
    stale = {
        "QPCC": "WHAT IT LOOKS AT — Five areas where competences and beliefs about oneself meet.\n"
                "WHAT YOU GET — A profile on the five areas.",
        "OBIETTIVO_STUDIO": "WHAT YOU GET — A guided conversation in seven steps.",
        "OBIETTIVO_DOCENZA": "WHAT YOU GET — A guided conversation in seven steps for a class.",
        "ZTPI": "Admin wording kept as it is.",
    }
    with artifact_session() as db:
        db.add_all(models.OrientationToolBrief(tool_id=k, brief=v, is_active=True) for k, v in stale.items())
        db.flush()
        seed_tool_briefs(db, models)
        stored = {r.tool_id: r.brief for r in db.query(models.OrientationToolBrief)}
        for tool_id in ("QPCC", "OBIETTIVO_STUDIO", "OBIETTIVO_DOCENZA"):
            assert stored[tool_id] == TOOL_BRIEFS[tool_id].strip(), tool_id
        assert stored["ZTPI"] == stale["ZTPI"]
        # A brief the admin rewrites afterwards is kept.
        db.query(models.OrientationToolBrief).filter_by(tool_id="QPCC").update({"brief": "Admin QPCC"})
        seed_tool_briefs(db, models)
        assert db.query(models.OrientationToolBrief).filter_by(tool_id="QPCC").one().brief == "Admin QPCC"


# --- C07: il contesto dell'Assistente nasce dal codice ----------------------

def test_assistant_platform_context_is_generated_from_code():
    from backend.routes.site_chat import _resolve_site_prompt
    prompt = _resolve_site_prompt(SimpleNamespace(config={}), "studente")
    assert "en/es/sv" not in prompt and "are all completed" not in prompt
    assert ", ".join(APP_LOCALES) in prompt
    assert f"at least {MIN_INSTRUMENTS} of {', '.join(SCORED_INSTRUMENTS)}" in prompt
    # Le distinzioni sulle attribuzioni restano nel testo modificabile.
    assert "competenzestrategiche.it" in prompt


def test_stale_stored_platform_context_cannot_contradict_the_code():
    from backend.routes.site_chat import _resolve_site_prompt
    stale = "PLATFORM CONTEXT: Item-level questionnaires are in test mode (en/es/sv)."
    prompt = _resolve_site_prompt(SimpleNamespace(config={"site_chat_platform_context": stale}), "studente")
    assert ", ".join(APP_LOCALES) in prompt
    assert "en/es/sv" not in _config_default("site_chat_platform_context")


# --- Decisione 5.1: i testi di fabbrica cambiati sovrascrivono il database --

CHANGED = ("prompt_qpcc_interview", "prompt_qpcc_summary", "site_chat_platform_context")


@pytest.mark.parametrize("key", CHANGED)
def test_changed_factory_texts_are_forced_and_registered(key):
    from backend.prompt_factory_alignment import FORCED_FACTORY_KEYS
    assert key in FORCED_FACTORY_KEYS["config"]
    assert digest(_config_default(key)) in LEGACY["configs"][key]
    assert len(LEGACY["configs"][key]) >= 2, f"{key}: hash di fabbrica precedente perso"


def test_alignment_overwrites_a_personalised_stale_qpcc_prompt():
    from backend import prompt_factory_alignment
    with artifact_session() as db:
        db.add(models.Config(key="prompt_qpcc_interview",
                             value="ADMIN TEXT. Current step factors: A1, A2, A3, V1, V2, C1, C2, M1, M2, M3."))
        db.flush()
        plan = prompt_factory_alignment.make_plan(db)
        assert "prompt_qpcc_interview" in {c["key"] for c in plan["changes"]}
