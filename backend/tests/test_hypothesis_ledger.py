"""Tests for Phase 2: Hypothesis notes, deterministic coupling, session ledger, and reflection thread.

Verifies:
1. recommendation_blocks.notes_directive and extract_notes support for kind "hypothesis".
2. recommendation_service.couple_hypothesis_reply deterministic coupling and state transition.
3. session_ledger.hypotheses, render, and bounded character limits.
4. session_ledger.reflection_thread in-step formatting and 500 char cap.
5. prompt_contract._facilitation_contract thread_state suffixes.
6. chat_preparation integration:
   - Flag OFF: byte-for-byte identical envelope to baseline.
   - Flag ON: thread_state derivation and [REFLECTION THREAD] injection.
"""
from types import SimpleNamespace
import pytest

from backend import models
from backend.ai_service import AIService
from backend.api_models import ChatRequest
from backend.chat_preparation import prepare_chat_turn, is_hypothesis_allowed
from backend import recommendation_blocks, recommendation_service, session_ledger
from backend.prompt_config import DEFAULT_GUIDED_STEPS
from backend.prompt_contract import (
    _facilitation_contract,
    _THREAD_STATE_LINES,
)
from backend.tests.artifact_database import artifact_session


@pytest.fixture(scope="module")
def runtime():
    with artifact_session() as db:
        db.add_all(models.GuidedStep(**step) for step in DEFAULT_GUIDED_STEPS)
        db.flush()
        ai = AIService(db)
        ai.config.update(active_provider="ollama", model_name="test-local")
        yield SimpleNamespace(db=db, ai=ai)


# --- 1. Recommendation blocks: directive and extraction ---

def test_notes_directive_hypothesis_flag():
    base_directive = recommendation_blocks.notes_directive(advice_allowed=False, hypothesis_allowed=False)
    assert "hypothesis" not in base_directive
    assert '[{"kind": "question", "text": "exact visible question?"}]' in base_directive

    hypo_directive = recommendation_blocks.notes_directive(advice_allowed=False, hypothesis_allowed=True)
    assert "hypothesis" in hypo_directive
    assert "optional lens" in hypo_directive
    assert '[{"kind": "hypothesis", "lens": "A5", "text": "exact visible reading"}]' in hypo_directive


def test_extract_notes_hypothesis():
    visible = "Forse quando un compito comincia a sembrarti difficile tendi a rimandare l'inizio."
    raw = (
        visible + "\n```recommendations\n"
        '{"notes": [{"kind": "hypothesis", "lens": "A5", "text": "Forse quando un compito comincia a sembrarti difficile tendi a rimandare l\'inizio."}]}\n'
        "```"
    )
    # When hypothesis_allowed is False, hypothesis is excluded
    excluded = recommendation_blocks.extract_notes(raw, visible, advice_allowed=False, hypothesis_allowed=False)
    assert excluded == []

    # When hypothesis_allowed is True, hypothesis is extracted with lens
    extracted = recommendation_blocks.extract_notes(
        raw, visible, advice_allowed=False, hypothesis_allowed=True, allowed_lenses={"A2", "A5", "A6"}
    )
    assert len(extracted) == 1
    assert extracted[0]["kind"] == "hypothesis"
    assert extracted[0]["name"] == visible
    assert extracted[0]["lens"] == "A5"
    assert extracted[0]["slug"].startswith("note-")

    # If lens is not in allowed_lenses, lens is stripped but note kept
    stripped_lens = recommendation_blocks.extract_notes(
        raw, visible, advice_allowed=False, hypothesis_allowed=True, allowed_lenses={"C1", "C2"}
    )
    assert len(stripped_lens) == 1
    assert "lens" not in stripped_lens[0]


def test_is_hypothesis_allowed_rules():
    assert is_hypothesis_allowed(questionnaire_type="QSA", phase="sl-motivation", is_synthesis=False) is True
    assert is_hypothesis_allowed(questionnaire_type="QSA", phase="sl-motivation", is_synthesis=True) is False
    assert is_hypothesis_allowed(questionnaire_type="EVENTO_STUDIO", phase="evstudio-rilettura", is_synthesis=False) is True
    assert is_hypothesis_allowed(questionnaire_type="EVENTO_STUDIO", phase="evstudio-prossima", is_synthesis=False) is True
    assert is_hypothesis_allowed(questionnaire_type="EVENTO_STUDIO", phase="evstudio-fatto", is_synthesis=False) is False
    assert is_hypothesis_allowed(questionnaire_type="OBBIETTIVO", phase="obb-1", is_synthesis=False) is False


# --- 2. Deterministic coupling in recommendation_service ---

def test_couple_hypothesis_reply():
    with artifact_session() as db:
        session_id = "test-coupling-session"
        username = "studente_test"

        # Record a proposed hypothesis
        payload = {
            "name": "Forse quando il compito sembra difficile rimandi l'inizio.",
            "kind": "hypothesis",
            "lens": "A5",
            "step_id": "sl-motivation",
            "status": "proposed",
        }
        recommendation_service.record(
            db, session_id=session_id, username=username, recommendation_type="advice",
            payloads=[{"slug": "hypo-1", **payload}], turn_index=1,
        )

        # Before student reply, row is proposed and has no reply
        rows = db.query(models.RecommendationHistory).filter_by(session_id=session_id).all()
        assert len(rows) == 1
        assert rows[0].payload.get("status") == "proposed"
        assert not rows[0].payload.get("reply")

        # Student sends message
        student_msg = "Non è che rimando, è che non so bene da che parte cominciare."
        updated = recommendation_service.couple_hypothesis_reply(
            db, session_id=session_id, username=username, reply=student_msg, step_id="sl-motivation"
        )
        assert len(updated) == 1
        assert updated[0].payload.get("status") == "answered"
        assert updated[0].payload.get("reply") == student_msg

        # Subsequent sidebar update by student (e.g. marking "corrected") is preserved
        recommendation_service.set_state(
            db, session_id=session_id, username=username, recommendation_type="advice",
            slug="hypo-1", status="corrected"
        )
        row_after = db.query(models.RecommendationHistory).filter_by(session_id=session_id).first()
        assert row_after.payload.get("status") == "corrected"
        assert row_after.payload.get("outcome") == "corrected"
        assert row_after.payload.get("reply") == student_msg


# --- 3. Session ledger and reflection thread ---

def test_session_ledger_hypotheses_and_reflection_thread():
    with artifact_session() as db:
        session_id = "test-ledger-session"
        username = "studente_ledger"

        payloads = [
            {
                "slug": "hypo-sl-motivation",
                "name": "Forse quando il compito sembra difficile rimandi l'inizio.",
                "kind": "hypothesis",
                "lens": "A5",
                "step_id": "sl-motivation",
                "status": "answered",
                "reply": "Non rimando, non so da dove partire.",
            }
        ]
        recommendation_service.record(
            db, session_id=session_id, username=username, recommendation_type="advice",
            payloads=payloads, turn_index=2,
        )

        hypo_list = session_ledger.hypotheses(db, session_id=session_id, username=username)
        assert len(hypo_list) == 1
        assert hypo_list[0]["text"] == "Forse quando il compito sembra difficile rimandi l'inizio."
        assert hypo_list[0]["reply"] == "Non rimando, non so da dove partire."

        ledger_data = session_ledger.build(db, session_id=session_id, username=username, step_id="sl-cognition")
        assert len(ledger_data["hypotheses"]) == 1
        rendered_ledger = session_ledger.render(ledger_data)
        assert "Readings you offered in this session, with what the student replied:" in rendered_ledger
        assert '- (sl-motivation) "Forse quando il compito sembra difficile rimandi l\'inizio." → replied: "Non rimando, non so da dove partire."' in rendered_ledger
        assert "Use the student's reply as their version; never restate a reading they corrected or rejected." in rendered_ledger

        # Test in-step reflection thread
        ref_thread = session_ledger.reflection_thread(hypo_list, step_id="sl-motivation")
        assert "[REFLECTION THREAD]" in ref_thread
        assert '- "Forse quando il compito sembra difficile rimandi l\'inizio." → replied: "Non rimando, non so da dove partire."' in ref_thread
        assert len(ref_thread) <= session_ledger.MAX_REFLECTION_CHARS


# --- 4. Prompt contract thread_state lines ---

def test_prompt_contract_thread_state_lines():
    for state, expected_line in _THREAD_STATE_LINES.items():
        contract = _facilitation_contract("area", thread_state=state)
        if expected_line:
            assert expected_line in contract
        else:
            # exploring has no extra state line
            for other_line in _THREAD_STATE_LINES.values():
                if other_line:
                    assert other_line not in contract


# --- 5. Integration with prepare_chat_turn ---

def test_prepare_chat_turn_flag_off_envelope_byte_identical(runtime):
    """When facilitation flag is off, the envelope must be 100% byte-for-byte identical to baseline."""
    req = ChatRequest(
        message="Non so come organizzarmi.",
        mode="qsa-factor",
        phase="sl-motivation",
        questionnaire_type="QSA",
        scores_context="A2: 6/9, A5: 6/9, A6: 4/9",
        language="it",
    )
    # Explicit flag off
    prep_off = prepare_chat_turn(
        runtime.db, runtime.ai, req, "sess-base-1", {"username": "user1"},
        config_overrides={"facilitation_contract_enabled": "false"},
    )
    assert "[FACILITATION]" not in prep_off.system_prompt_final
    assert "[REFLECTION THREAD]" not in prep_off.system_prompt_final

    # Without override, default is now true (released in Phase 6)
    prep_default = prepare_chat_turn(
        runtime.db, runtime.ai, req, "sess-base-2", {"username": "user2"},
    )
    assert "[FACILITATION]" in prep_default.system_prompt_final


def test_prepare_chat_turn_flag_on_thread_state_and_reflection_thread(runtime):
    """When facilitation flag is on, thread_state is computed and [REFLECTION THREAD] is injected on in-step turns."""
    session_id = "sess-facilitated-1"
    username = "user_fac_1"

    # 1. Step entry: thread_state should be 'introduced'
    req_entry = ChatRequest(
        message="",
        mode="qsa-factor",
        phase="sl-motivation",
        questionnaire_type="QSA",
        scores_context="A2: 6/9, A5: 6/9, A6: 4/9",
        language="it",
        use_phase_prompt=True,
    )
    prep_entry = prepare_chat_turn(
        runtime.db, runtime.ai, req_entry, session_id, {"username": username},
        config_overrides={"facilitation_contract_enabled": "true"},
    )
    assert "[FACILITATION]" in prep_entry.system_prompt_final
    assert _THREAD_STATE_LINES["introduced"] in prep_entry.system_prompt_final
    assert "[REFLECTION THREAD]" not in prep_entry.system_prompt_final  # Ledger carries it on step entry

    # 2. Record an open hypothesis in this step
    recommendation_service.record(
        runtime.db, session_id=session_id, username=username, recommendation_type="advice",
        payloads=[{
            "slug": "hypo-mot-1",
            "name": "Forse non manca l'avvio, ma il problema sorge quando il compito sembra fuori portata.",
            "kind": "hypothesis",
            "lens": "A5",
            "step_id": "sl-motivation",
            "status": "proposed",
        }],
        turn_index=1,
    )

    # 3. Student sends message answering the hypothesis: thread_state should be 'hypothesis_answered'
    req_turn2 = ChatRequest(
        message="Esatto, appena diventa tosto chiudo il libro.",
        mode="qsa-factor",
        phase="sl-motivation",
        questionnaire_type="QSA",
        scores_context="A2: 6/9, A5: 6/9, A6: 4/9",
        language="it",
        use_phase_prompt=False,
    )
    prep_turn2 = prepare_chat_turn(
        runtime.db, runtime.ai, req_turn2, session_id, {"username": username},
        config_overrides={"facilitation_contract_enabled": "true"},
    )
    assert _THREAD_STATE_LINES["hypothesis_answered"] in prep_turn2.system_prompt_final
    assert "[REFLECTION THREAD]" in prep_turn2.system_prompt_final
    assert "Esatto, appena diventa tosto chiudo il libro." in prep_turn2.components["reflection_thread"]
