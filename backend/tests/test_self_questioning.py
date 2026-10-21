"""Questionnaire runtime envelopes and session evidence, without a model or external data.

These tests check delivery of the dialogue contract, not a model's compliance.
Qualitative dialogue simulations and their limits are recorded in the handoff.
"""
from types import SimpleNamespace

import pytest

from backend import models, schemas
from backend.ai_service import AIService
from backend.api_models import ChatRequest
from backend.chat_preparation import prepare_chat_turn
from backend.journey_context import SYNTHESIS_STEPS, journey_context, session_evidence
from backend.model_context import DEFAULT_CONTEXT_LEVELS, fit_context
from backend.prompt_audit import build_prompt_audit
from backend.prompt_config import (
    DEFAULT_GUIDED_STEPS, DEFAULT_QSAR_GUIDED_STEPS, DEFAULT_ZTPI_GUIDED_STEPS,
    DEFAULT_QPCS_GUIDED_STEPS, DEFAULT_QPCC_GUIDED_STEPS, DEFAULT_QAP_GUIDED_STEPS,
    DEFAULT_SAVICKAS_GUIDED_STEPS, WELCOME_PHASE_IDS,
)
from backend.prompt_contract import QUESTIONNAIRE_DIALOGUES, turn_contract
from backend.prompt_variants import variant_key
from backend.questionnaire_description import SENTINEL as DESCRIPTION_SENTINEL
from backend.tests.artifact_database import artifact_session


ALL_STEPS = [step for path in (
    DEFAULT_GUIDED_STEPS, DEFAULT_QSAR_GUIDED_STEPS, DEFAULT_ZTPI_GUIDED_STEPS,
    DEFAULT_QPCS_GUIDED_STEPS, DEFAULT_QPCC_GUIDED_STEPS, DEFAULT_QAP_GUIDED_STEPS,
    DEFAULT_SAVICKAS_GUIDED_STEPS,
) for step in path]
AREAS = [step for step in DEFAULT_QPCS_GUIDED_STEPS if step["sort_order"] in range(2, 7)]
AREA_STEPS = [step for step in ALL_STEPS
              if step["id"] not in WELCOME_PHASE_IDS | SYNTHESIS_STEPS | {"savickas-patto"}
              and step["system_prompt_mode"] in {
                  "second-level", "qsar-second-level", "ztpi-factor", "qpcs-analysis",
                  "qpcc-interview", "qap-interview", "savickas-interview",
                  "factor", "qsar-factor", "qpcs-factor", "qpcc-factor", "qap-factor",
              }]
IDENTITY = {"username": "self-questioning-fixture"}
SESSION = "synthetic-self-questioning"
SCORES_BY_TYPE = {
    "QSA": " ".join([*(f"C{i}" for i in range(1, 8)), *(f"A{i}" for i in range(1, 8))]),
    "QSAr": "C1r C2r C3r C4r A1r A2r A3r A4r", "ZTPI": "T1 T2 T3 T4 T5",
    "QPCS": "S1 S2 S3 S4 S5", "QPCC": "A1 A2 A3 V1 V2 C1 C2 M1 M2 M3",
    "QAP": "AD1 AD2 AD3 AD4", "SAVICKAS": "",
}
SCORES_BY_TYPE = {key: "\n".join(f"{code}: 5/9" for code in value.split())
                  for key, value in SCORES_BY_TYPE.items()}


@pytest.fixture(scope="module")
def runtime():
    with artifact_session() as db:
        db.add_all(models.GuidedStep(**step) for step in ALL_STEPS)
        # Exercise existing admin text too: the contract must not depend on reseeding.
        db.add(models.Config(key="prompt_qpcs_analysis", value="Stored interview: mini-summary and [[AVANZA_STEP]]."))
        # test_self_questioning exercises the legacy self-questioning contract baseline when the flag is off
        db.add(models.Config(key="facilitation_contract_enabled", value="false"))
        db.flush()
        ai = AIService(db)
        ai.config.update(active_provider="ollama", model_name="test-local")
        for level in ("ristretto", "minimo"):
            ai.config[variant_key("prompt_qpcs_analysis", level)] = f"Stored {level} interview."
        yield db, ai


@pytest.fixture(autouse=True)
def forbid_generation(monkeypatch):
    monkeypatch.setattr(AIService, "get_response", lambda *args, **kwargs: pytest.fail(
        "Contract tests must never generate a model response"))


def prepare(runtime, phase, *, message="", language="it", entry=True, history=False,
            session_id=SESSION):
    db, ai = runtime
    step = next(step for step in ALL_STEPS if step["id"] == phase)
    request = ChatRequest(questionnaire_type=step["questionnaire_type"], phase=phase,
                          mode=step["system_prompt_mode"] if entry else "generic",
                          use_phase_prompt=entry, message=message, language=language,
                          scores_context=SCORES_BY_TYPE[step["questionnaire_type"]])
    return prepare_chat_turn(db, ai, request, session_id, IDENTITY,
                             include_retrieval=False, include_history=history,
                             create_anonymous_code=False)


@pytest.mark.parametrize("language", ["it", "en", "es", "fr", "de", "sv"])
@pytest.mark.parametrize("step", ALL_STEPS, ids=lambda step: step["id"])
def test_contract_reaches_existing_steps_and_all_context_levels(runtime, step, language):
    prepared = prepare(runtime, step["id"], language=language)
    contract = prepared.components["turn_contract"]
    assert ("[SELF-QUESTIONING]" in contract) == (step["id"] not in WELCOME_PHASE_IDS and step["id"] != "savickas-patto")
    assert f"Response language: {language}" in contract
    assert contract in prepared.system_prompt_final
    if step in AREAS:
        assert "Stored interview" in prepared.system_prompt_final
        assert prepared.system_prompt_final.index("Stored interview") < prepared.system_prompt_final.index(contract)
        assert "never make a self-question a prerequisite" in contract
        assert "current step's question limits" in contract
    # The immutable tail must also survive administrator-owned compact variants.
    for level in ("ristretto", "minimo"):
        system = runtime[1].context_data["variants"][level]["system"]
        assert contract in system
        if step in AREAS:
            assert f"Stored {level} interview" in system
        fitted, _, _, _ = fit_context(system, prepared.full_message, [],
                                      {"context_tokens": 16384, "compact": True}, 700)
        assert contract in fitted
        fitted, _, _, _ = fit_context(prepared.system_prompt_final, prepared.full_message, [],
                                      {"level": level, "limits": DEFAULT_CONTEXT_LEVELS[level]}, 700,
                                      context_data=runtime[1].context_data)
        assert contract in fitted


@pytest.mark.parametrize("step", AREA_STEPS, ids=lambda step: step["id"])
@pytest.mark.parametrize("message,rule", [
    ("Alla riunione ho spiegato il progetto; quando mi interrompono perdo il filo, ma riesco a riprenderlo con gli appunti.",
     "A detailed answer can already cover earlier ground"),
    ("A volte.", "a terse answer calls for a light, concrete prompt"),
    ("Non so che domanda farmi.", "first help them identify one thing they would like to understand"),
    ("Ancora non mi viene, mi dai un aiuto?", "Only if further help is needed offer a tentative cue"),
    ("Mi chiedo: cosa mi aiuta a riprendere il filo?", "Take up a spontaneous self-question"),
    ("Preferisco non approfondire, proseguiamo.", "Always allow skipping or continuing"),
])
def test_adaptive_support_also_reaches_in_step_follow_ups(runtime, step, message, rule):
    prepared = prepare(runtime, step["id"], message=message, entry=False)
    assert message in prepared.full_message
    contract = prepared.components["turn_contract"]
    if step["system_prompt_mode"] in {"factor", "qsar-factor", "ztpi-factor", "qpcs-factor", "qpcc-factor", "qap-factor"}:
        # Descriptive follow-ups keep their scope even when the message volunteers
        # personal material; the subsequent area tests retain adaptive self-inquiry.
        assert "[QUESTIONNAIRE DESCRIPTION]" in contract
        assert "Do not turn spontaneous personal material into an interview here" in contract
        assert "without answering any personal or comprehension question" in contract
        assert "Ask a clarification question ONLY when useful" in contract
        return
    assert rule in contract
    assert "Do not request self-questioning on every turn" in contract
    assert "without presuming discoveries, difficulties or a wish to change" in contract
    assert "Vary its wording and focus across topics without fixed templates" in contract


def test_profile_allows_optional_understanding_without_changing_the_agreement(runtime):
    profile = prepare(runtime, "qpcs-profilo").components["turn_contract"]
    assert "Ask a clarification question ONLY when useful" in profile
    assert "no mandatory closing question" in profile
    agreement = prepare(runtime, "qpcs-intro")
    assert "Do NOT ask them to type a confirmation" in agreement.system_prompt_final
    assert "[SELF-QUESTIONING]" not in agreement.system_prompt_final


def test_synthesis_reads_questions_from_all_five_areas_with_attribution_and_corrections(runtime):
    db, _ = runtime
    own_question = "Cosa mi aiuta a riprendere il filo?"
    corrected = "Come scelgo cosa approfondire?"
    turns = [
        ("Mi chiedo: " + own_question, "Potresti chiederti: come essere più sicuro?"),
        ("A volte. Preferisco non approfondire questa area.", "Proseguiamo."),
        ("Non so che domanda farmi.", "Quale aspetto vorresti capire meglio?"),
        ("Non voglio una domanda qui. Ho collegato due idee nel progetto.", "Va bene."),
        ("Ritiro la domanda sul filo. La mia domanda è: " + corrected, "La teniamo aperta."),
    ]
    for step, (user, bot) in zip(AREAS, turns):
        db.add(models.Log(session_id=SESSION, conversation_id="synthetic-conversation",
                          username=IDENTITY["username"], questionnaire_type="QPCS",
                          action="chat_message", details={"user_input": user, "bot_response": bot, "phase": step["id"]}))
    # Evidence from another person or session must never become this person's story.
    db.add(models.Log(session_id=SESSION, username="another-fixture", action="chat_message",
                      details={"user_input": "FOREIGN_PERSON"}))
    db.add(models.Log(session_id="another-session", username=IDENTITY["username"], action="chat_message",
                      details={"user_input": "FOREIGN_SESSION"}))
    db.flush()
    evidence = session_evidence(db, SESSION, IDENTITY["username"], None)
    assert len(evidence) == 10
    prepared = prepare(runtime, "qpcs-sintesi")
    journey = prepared.components["journey_evidence"]
    for user, bot in turns:
        assert "Student: " + user in journey
        assert "Counselor: " + bot in journey
    assert "FOREIGN_" not in journey
    contract = prepared.components["turn_contract"]
    assert "later corrections taking precedence" in contract
    assert "distinguish them from questions addressed to you and from your own suggestions" in contract
    assert "choose which, if any, to keep exploring" in contract
    assert "without inventing questions or requiring one now" in contract
    assert "plan, decision, change or commitment is optional" in contract
    assert "give priority to the self-questions" in contract
    assert "honour withdrawals" in contract
    assert "do not present a withdrawn question as still open" in contract
    assert "instead of inventing a quotation" in contract


@pytest.mark.parametrize("step", AREAS, ids=lambda step: step["id"])
def test_persistent_difficulty_and_refusal_keep_their_actual_history(runtime, monkeypatch, tmp_path, step):
    from backend import chat_logic, chat_preparation
    from backend.memory_service import SessionMemory

    memory = SessionMemory(memory_dir=tmp_path)
    monkeypatch.setattr(chat_logic, "session_memory", memory)
    monkeypatch.setattr(chat_preparation, "session_memory", memory)
    session_id = "synthetic-difficulty-" + step["id"]
    # These are synthetic inputs, not generated or rated model answers.
    turns = [
        ("Non so che domanda farmi.", "Quale parte vorresti capire meglio?"),
        ("Ancora non mi viene. Mi dai uno spunto?", "Possiamo lasciarla aperta."),
    ]
    for user, bot in turns:
        memory.record_interaction(session_id, user_message=user, transcript_user=user,
                                  bot_response=bot, phase=step["id"], questionnaire_type="QPCS")
    prepared = prepare(runtime, step["id"], entry=False, history=True,
                       message="Preferisco non insistere, passiamo.", session_id=session_id)
    assert prepared.history == [message for user, bot in turns for message in (
        {"role": "user", "content": user}, {"role": "assistant", "content": bot})]
    contract = prepared.components["turn_contract"]
    assert "do not repeat prompts or escalate support without their request" in contract
    assert "Always allow skipping or continuing without a question or explanation" in contract
    assert "If no question remains available, close without adding one" in contract
    assert "presuming emotions or needs" in contract
    assert "Preferisco non insistere, passiamo." in prepared.full_message


@pytest.mark.parametrize("step", [
    next(step for step in ALL_STEPS if step["id"] == phase)
    for phase in ("ztpi-t1", "savickas-q1", "qpcc-controllo", "qap-curiosita")
], ids=lambda step: step["id"])
def test_shared_wording_preserves_instrument_specific_tasks(runtime, step):
    prepared = prepare(runtime, step["id"])
    assert step["prompt"] in prepared.system_prompt_final
    contract = prepared.components["turn_contract"]
    if step["id"] == "ztpi-t1":
        # Since the descriptive-phase boundary, ZTPI's first reading keeps the
        # step instructions but replaces personal questioning with the reading
        # contract; it must not regain a mandatory personal question.
        assert DESCRIPTION_SENTINEL in contract
        assert "phase boundary takes priority" in contract
        assert "no mandatory closing question" in contract
        assert "Personal exploration and practical actions" in contract
        assert "preserve the current step's core questions" not in contract
        assert "use one contextualised question that lets the person choose" not in contract
    else:
        assert "preserve the current step's core questions, order, consent" in contract
        assert "step's question budget" in contract
    # These tools have factor readings or narrative topics, not QPCS's five areas.
    assert "five areas" not in contract and "current profile reading" not in contract


def test_synthesis_evidence_respects_conversation_scope(runtime):
    db, ai = runtime
    for conversation, text in (("chosen", "Mi chiedo: cosa desidero capire?"),
                               ("other", "FOREIGN_CONVERSATION")):
        db.add(models.Log(session_id="synthetic-scoped", conversation_id=conversation,
                          username=IDENTITY["username"], action="chat_message",
                          details={"user_input": text}))
    db.flush()
    request = ChatRequest(questionnaire_type="QPCS", phase="qpcs-sintesi",
                          mode="qpcs-summary", use_phase_prompt=True, conversation_id="chosen")
    prepared = prepare_chat_turn(db, ai, request, "synthetic-scoped", IDENTITY,
                                 include_retrieval=False, include_history=False,
                                 create_anonymous_code=False)
    assert "Mi chiedo: cosa desidero capire?" in prepared.components["journey_evidence"]
    assert "FOREIGN_CONVERSATION" not in prepared.system_prompt_final


def test_long_qpcs_journey_reduction_requests_verbatim_questions_on_every_pass():
    seen = []
    question = "Cosa mi aiuta a riprendere il filo?"

    def reduce(message, system, *args, **kwargs):
        seen.append((message, system))
        return f"Student self-question: {question}" if question in message else "Student declined."

    messages = [
        {"role": "student", "text": "Mi chiedo: " + question},
        {"role": "counselor", "text": "A counselor suggestion. " * 100},
        {"role": "student", "text": "Preferisco proseguire."},
    ]
    context, coverage = journey_context(messages, "it", max_chars=400,
                                         ai=SimpleNamespace(get_response=reduce),
                                         preserve_self_questions=True)
    assert len(seen) > 2
    assert coverage == "complete" and question in context
    for _, system in seen:
        assert "self-questions verbatim" in system
        assert "later corrections and withdrawals" in system
        assert "Do not turn a counselor suggestion into the student's own question" in system
    # Existing behaviour for other instruments remains untouched.
    seen.clear()
    journey_context(messages, "it", max_chars=400, ai=SimpleNamespace(get_response=reduce))
    assert all("self-questions verbatim" not in system for _, system in seen)


@pytest.mark.parametrize("step", [step for step in ALL_STEPS if step["id"] in SYNTHESIS_STEPS],
                         ids=lambda step: step["id"])
def test_questionnaire_synthesis_enables_question_preservation_in_the_real_reduction_path(runtime, monkeypatch, step):
    from backend import chat_preparation
    seen = []
    original = chat_preparation.journey_context

    def capture(*args, **kwargs):
        seen.append(kwargs)
        return original(*args, **kwargs)

    monkeypatch.setattr(chat_preparation, "journey_context", capture)
    prepare(runtime, step["id"])
    assert seen[0]["preserve_self_questions"] is True


def test_empty_journey_does_not_create_question_evidence(runtime):
    prepared = prepare(runtime, "qpcs-sintesi", session_id="synthetic-empty-session")
    assert prepared.components["journey_evidence"] == ""
    assert prepared.components["journey_coverage"] == "empty"
    assert "without inventing questions or requiring one now" in prepared.components["turn_contract"]


@pytest.mark.parametrize("step", ALL_STEPS, ids=lambda step: step["id"])
@pytest.mark.parametrize("entry", [True, False])
def test_prompt_audit_and_runtime_share_the_same_contract(runtime, step, entry):
    db, ai = runtime
    prepared = prepare(runtime, step["id"], entry=entry, message="" if entry else "Proseguiamo.")
    audited = build_prompt_audit(db, schemas.PromptAuditRequest(
        questionnaire_type=step["questionnaire_type"], phase=step["id"], session_id="synthetic-audit",
        mode=step["system_prompt_mode"] if entry else "generic", use_phase_prompt=entry,
        message="" if entry else "Proseguiamo.", include_history=False,
        include_knowledge=False, scores_context=SCORES_BY_TYPE[step["questionnaire_type"]],
    ), ai_service_cls=lambda _db: ai)
    assert prepared.components["turn_contract"] in audited["envelope"]["system_prompt_final"]


@pytest.mark.parametrize("qtype", ["IDEA", "EVENTO_STUDIO", "EVENTO_PROFESSIONALE", "OBIETTIVO_STUDIO", "OBIETTIVO_DOCENZA", "OPENCODE"])
def test_other_tools_do_not_receive_the_questionnaire_strategy(qtype):
    for phase in ("qpcs-profilo", "qpcs-comunicazione", "qpcs-sintesi"):
        assert "[SELF-QUESTIONING]" not in turn_contract(
            language="it", questionnaire_type=qtype, phase=phase,
            advice_allowed=False, synthesis=phase == "qpcs-sintesi", reflection_stage="area")


def test_preparation_preserves_all_guided_step_definitions(runtime):
    db, _ = runtime
    assert {step["questionnaire_type"].upper() for step in ALL_STEPS} == QUESTIONNAIRE_DIALOGUES
    for step in ALL_STEPS:
        row = db.query(models.GuidedStep).filter_by(id=step["id"]).one()
        for field in ("prompt", "sort_order", "system_prompt_mode", "label"):
            assert getattr(row, field) == step[field]


@pytest.mark.parametrize("qtype", sorted(QUESTIONNAIRE_DIALOGUES))
def test_free_chat_does_not_gain_guided_questions(qtype):
    assert "[SELF-QUESTIONING]" not in turn_contract(
        language="it", questionnaire_type=qtype, phase=None, advice_allowed=False)


def test_essential_path_keeps_its_fixed_tasks_and_question_free_summary(runtime):
    from backend.qsa_essential import QSA_PHASES, directive
    db, ai = runtime
    for phase in QSA_PHASES:
        request = ChatRequest(questionnaire_type="QSA", phase=phase, guided_path="essential",
                              mode="generic", message="Una risposta sintetica.")
        prepared = prepare_chat_turn(db, ai, request, "synthetic-essential", IDENTITY,
                                     include_retrieval=False, include_history=False)
        assert "[SELF-QUESTIONING]" in prepared.system_prompt_final
        assert directive(phase) in prepared.system_prompt_final
        assert "add no steps or required turns" in prepared.components["turn_contract"].lower()
        if phase == QSA_PHASES[-1]:
            assert "Do not ask another question" in prepared.system_prompt_final
            assert "When the step permits a closing question" in prepared.components["turn_contract"]


@pytest.mark.parametrize("qtype", sorted(QUESTIONNAIRE_DIALOGUES))
def test_fixed_follow_up_phase_uses_optional_question_wording(runtime, qtype):
    db, ai = runtime
    request = ChatRequest(questionnaire_type=qtype, phase="questions", mode="generic",
                          message="Non so cosa vorrei capire meglio.")
    prepared = prepare_chat_turn(db, ai, request, "synthetic-questions", IDENTITY,
                                 include_retrieval=False, include_history=False)
    contract = prepared.components["turn_contract"]
    assert "first help them identify one thing" in contract
    assert "never make a self-question a prerequisite" in contract
