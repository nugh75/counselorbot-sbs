"""Tests for Metacognitive Facilitation contract in prompt_contract.py.

Verifies:
1. Feature flag default: facilitation_contract_enabled is False, producing byte-for-byte identical output to existing baseline.
2. Feature flag enabled: turn_contract injects [FACILITATION] instead of [SELF-QUESTIONING].
3. Pedagogical invariants:
   - Metacognitive questioning on choices, actions, and consequences.
   - Elimination of ceremonial pleasantries ('Grazie per aver condiviso', 'Capisco', 'Certo.').
   - Elimination of situational anecdotes / temporal fragmentation ('qual è il momento in cui', 'momento recente').
   - Flexible depth based on 3 understanding conditions, not a rigid turn count.
   - Two-level value-check (continuous internal check, explicit check only at key junctures).
   - Never forcing insight: readings as open hypotheses the student can confirm, correct, or reject.
4. Runtime integration with prepare_chat_turn across questionnaire stages.
"""
from types import SimpleNamespace
import pytest

from backend import models
from backend.ai_service import AIService
from backend.api_models import ChatRequest
from backend.chat_preparation import prepare_chat_turn
from backend.prompt_config import (
    DEFAULT_GUIDED_STEPS, DEFAULT_QSAR_GUIDED_STEPS, DEFAULT_ZTPI_GUIDED_STEPS,
    DEFAULT_QPCS_GUIDED_STEPS, DEFAULT_QPCC_GUIDED_STEPS, DEFAULT_QAP_GUIDED_STEPS,
    DEFAULT_SAVICKAS_GUIDED_STEPS,
)
from backend.prompt_contract import (
    FACILITATION_SENTINEL,
    SELF_QUESTIONING_SENTINEL,
    QUESTIONNAIRE_DIALOGUES,
    turn_contract,
    _facilitation_contract,
)
from backend.tests.artifact_database import artifact_session


ALL_STEPS = [step for path in (
    DEFAULT_GUIDED_STEPS, DEFAULT_QSAR_GUIDED_STEPS, DEFAULT_ZTPI_GUIDED_STEPS,
    DEFAULT_QPCS_GUIDED_STEPS, DEFAULT_QPCC_GUIDED_STEPS, DEFAULT_QAP_GUIDED_STEPS,
    DEFAULT_SAVICKAS_GUIDED_STEPS,
) for step in path]


@pytest.fixture(scope="module")
def runtime():
    with artifact_session() as db:
        db.add_all(models.GuidedStep(**step) for step in ALL_STEPS)
        db.flush()
        ai = AIService(db)
        ai.config.update(active_provider="ollama", model_name="test-local")
        yield SimpleNamespace(db=db, ai=ai)


def test_flag_off_preserves_byte_identical_baseline():
    """When facilitation_contract_enabled is False, output is identical to default."""
    for qtype in QUESTIONNAIRE_DIALOGUES:
        for stage in ("area", "profile", "synthesis", "follow-up"):
            default_out = turn_contract(
                language="it", questionnaire_type=qtype, phase="test-phase",
                advice_allowed=False, reflection_stage=stage,
            )
            explicit_off = turn_contract(
                language="it", questionnaire_type=qtype, phase="test-phase",
                advice_allowed=False, reflection_stage=stage,
                facilitation_contract_enabled=False,
            )
            assert default_out == explicit_off
            assert SELF_QUESTIONING_SENTINEL in default_out
            assert FACILITATION_SENTINEL not in default_out


def test_flag_on_activates_facilitation_sentinel():
    """When facilitation_contract_enabled is True, [FACILITATION] is injected instead of [SELF-QUESTIONING]."""
    for qtype in QUESTIONNAIRE_DIALOGUES:
        for stage in ("area", "profile", "synthesis", "follow-up"):
            facilitated = turn_contract(
                language="it", questionnaire_type=qtype, phase="test-phase",
                advice_allowed=False, reflection_stage=stage,
                facilitation_contract_enabled=True,
            )
            assert FACILITATION_SENTINEL in facilitated
            assert SELF_QUESTIONING_SENTINEL not in facilitated


def test_facilitation_contract_pedagogical_invariants_across_stages():
    """All stages must enforce the core metacognitive facilitation principles."""
    for stage in ("area", "profile", "synthesis", "follow-up"):
        contract = _facilitation_contract(stage)
        assert FACILITATION_SENTINEL in contract
        assert "metacognitive facilitator" in contract.lower()
        assert "interrogate and reinterpret their own experience" in contract.lower()

        # No ceremonial pleasantries, therapeutic clichés or meta-disclaimers
        assert "never use ceremonial pleasantries" in contract.lower()
        assert "grazie per aver condiviso" in contract.lower()
        assert "certo." in contract.lower()
        assert "è un'ipotesi, non una verità" in contract.lower()
        assert "senza giudizio" in contract.lower()
        assert "non è una diagnosi" in contract.lower()
        assert "step 0" in contract.lower()

        # Never force insight
        assert "never force an insight" in contract.lower()
        assert "hypotheses" in contract.lower()

        # Two-level value check
        assert "internal value-check on every turn" in contract.lower()
        assert "explicit check only when proposing a key hypothesis" in contract.lower()

        # Emotion neutrality
        assert "never presume emotional states" in contract.lower()


def test_area_stage_focuses_on_choices_actions_and_consequences_not_anecdotes():
    """Area stage forbids situational chronicles and anchors depth to understanding of action."""
    contract = _facilitation_contract("area")

    # Inquires into actions, choices, consequences
    assert "choices, actions and consequences" in contract.lower()
    assert "che cosa fai di solito" in contract.lower()
    assert "conseguenze" in contract.lower()

    # Rejects temporal/situational fragmentation
    assert "do not ask temporal-situational questions" in contract.lower()
    assert "qual è il momento" in contract.lower()
    assert "momento recente" in contract.lower()

    # 3 understanding conditions for flexible depth
    assert "depth of exploration depends on the understanding reached" in contract.lower()
    assert "(1) when a concrete experience emerges" in contract.lower()
    assert "(2) when the student begins to understand how their choices and actions operate" in contract.lower()
    assert "(3) when enough elements exist for a synthesis" in contract.lower()


def test_profile_stage_treats_reading_as_open_hypothesis():
    """Profile stage presents readings as hypotheses and explores study practices."""
    contract = _facilitation_contract("profile")
    assert "exploratory hypothesis" in contract.lower()
    assert "not a predetermined verdict" in contract.lower()
    assert "choices, or their study practices" in contract.lower()


def test_synthesis_stage_distinguishes_confirmed_corrected_and_rejected_hypotheses():
    """Synthesis stage prioritises student's own words and never turns unaccepted hypotheses into agreements."""
    contract = _facilitation_contract("synthesis")
    assert "student's own words" in contract.lower()
    assert "confirmed, which they corrected, and which they rejected" in contract.lower()
    assert "never present an unconfirmed hypothesis as an agreed conclusion" in contract.lower()


def test_prepare_chat_turn_respects_facilitation_contract_flag(runtime):
    """Integration test: prepare_chat_turn reads facilitation_contract_enabled from configs with default true."""
    req = ChatRequest(
        message="Voglio capire meglio il mio metodo di studio",
        mode="qsa-cognitive",
        phase="cognitive",
        language="it",
        questionnaire_type="QSA",
        scores_context="C1: 5/9\nC2: 6/9",
    )

    # 1. Default (now enabled as true)
    prep_default = prepare_chat_turn(
        runtime.db, runtime.ai, req, "synthetic-session", {"username": "test-user"}
    )
    assert FACILITATION_SENTINEL in prep_default.components["turn_contract"]
    assert SELF_QUESTIONING_SENTINEL not in prep_default.components["turn_contract"]
    assert "metacognitive facilitator" in prep_default.components["turn_contract"].lower()
    assert "choices, actions and consequences" in prep_default.components["turn_contract"].lower()

    # 2. Flag explicitly disabled via config_overrides
    prep_off = prepare_chat_turn(
        runtime.db, runtime.ai, req, "synthetic-session", {"username": "test-user"},
        config_overrides={"facilitation_contract_enabled": "false"},
    )
    assert SELF_QUESTIONING_SENTINEL in prep_off.components["turn_contract"]
    assert FACILITATION_SENTINEL not in prep_off.components["turn_contract"]


def test_journey_context_preserves_hypotheses_rule():
    """journey_context includes the hypothesis preservation directive when preserve_hypotheses is True."""
    from backend.journey_context import journey_context

    captured_prompts = []

    class DummyAI:
        def get_response(self, message, system_prompt, *args, **kwargs):
            captured_prompts.append(system_prompt)
            return "Short note."

    dummy_ai = DummyAI()
    long_messages = [
        {"role": "student", "text": "parole lunghe " * 100},
        {"role": "counselor", "text": "risposte lunghe " * 100},
    ] * 5

    journey_context(long_messages, "it", ai=dummy_ai, max_chars=300, preserve_hypotheses=True)
    assert captured_prompts, "Reduction prompt should have been called"
    assert any("Preserve the counselor's readings and the student's response to each" in p for p in captured_prompts)
    assert any("Never present a rejected reading as agreed." in p for p in captured_prompts)

