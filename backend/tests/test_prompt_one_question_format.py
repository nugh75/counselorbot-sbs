"""Domande e formato delle risposte (#750, audit A01, A03, A04, A09, A10).

Una sola domanda per risposta, anche all'apertura della fase finale; le sintesi
possono chiudere con una domanda; il formato scelto in chat vale sopra la prosa
di default; le tabelle dei profili restano a quattro colonne; un'area QPCS si
apre con una definizione breve.
"""
from pathlib import Path

from backend import prompt_config
from backend.chat_preferences import apply_response_format
from backend.prompt_contract import (
    _facilitation_contract,
    _objective_focus_contract,
    _self_questioning_contract,
    turn_contract,
)
from backend.prompt_factory_alignment import FORCED_FACTORY_KEYS
from backend.qsa_essential import OBBDOCENZA_PHASES, OBBSTUDIO_PHASES, QSA_PHASES, directive

ROOT = Path(__file__).resolve().parents[2]
PROMPTS = ROOT / "backend" / "prompts"
NO_QUESTION = ("Ask no further question", "Do not ask another question", "no reflective questions")


def _contract(**kwargs):
    return turn_contract(language="it", questionnaire_type="QSA", phase="cognitive", **kwargs)


def test_the_final_phase_opens_with_one_question():
    source = (ROOT / "frontend/src/components/qsa/GuidedChatInterface.tsx").read_text(encoding="utf-8")
    assert "exactly three open reflective questions" not in source
    assert "ask the student ONE open reflective question" in source


def test_an_offered_action_takes_the_single_question():
    assert "the one question is about that action" in _contract(advice_allowed=True)
    assert "the one question is about that action" not in _contract(advice_allowed=False)


def test_the_chosen_format_wins_over_the_prose_default():
    texts = (
        _contract(advice_allowed=False),
        _facilitation_contract("area"),
        _self_questioning_contract("area"),
        _objective_focus_contract("OBIETTIVO_STUDIO", "definition"),
    )
    for text in texts:
        assert "Never use bullet points" not in text
        assert "[VISIBLE RESPONSE FORMAT]" in text
        assert "the IDEA final plan stays numbered" in text


def test_profile_tables_keep_four_columns():
    table = apply_response_format("base", "table")
    assert "at most three short columns" in table
    assert "factor profile tables keep their four columns" in table


def test_syntheses_may_end_with_one_question():
    texts = {
        "obiettivo summary": prompt_config.DEFAULT_SYSTEM_PROMPT_OBIETTIVO_SUMMARY,
        "final studio": (PROMPTS / "obiettivo_step_final_studio.md").read_text(encoding="utf-8"),
        "final docenza": (PROMPTS / "obiettivo_step_final_docenza.md").read_text(encoding="utf-8"),
        "objective contract": _objective_focus_contract("OBIETTIVO_STUDIO", "synthesis", entry=True),
        **{phases[-1]: directive(phases[-1], entry=True) for phases in (QSA_PHASES, OBBSTUDIO_PHASES, OBBDOCENZA_PHASES)},
    }
    for name, text in texts.items():
        assert not any(rule in text for rule in NO_QUESTION), name
        assert "at most ONE open question" in text, name


def test_a_qpcs_area_opens_with_a_short_definition():
    analysis = prompt_config.DEFAULT_SYSTEM_PROMPT_QPCS_ANALYSIS
    assert "briefly explain what the area means" not in analysis
    assert "define the area in one or two sentences" in analysis
    assert "short definition of one or two sentences" in _contract(advice_allowed=False)


def test_rewritten_factory_texts_are_forced():
    assert {"prompt_obiettivo_summary", "prompt_qpcs_analysis"} <= FORCED_FACTORY_KEYS["config"]
    assert {"obbstudio-final", "obbdocenza-final"} <= FORCED_FACTORY_KEYS["guided_step"]
