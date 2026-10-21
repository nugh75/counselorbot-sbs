"""Obiettivo paths: ONE focus, an early draft and stages that close on evidence.

Envelope and contract tests without a model: they check what the model receives
and how the essential path advances, not the quality of a live reply. Synthetic
before/after examples and their limits are recorded in the handoff.
"""
import hashlib
import json
import re
from pathlib import Path

import pytest

from backend import models, prompt_config, prompt_factory_alignment, prompt_revisions
from backend.ai_service import AIService
from backend.api_models import ChatRequest
from backend.chat_logic import _ESSENTIAL_PATH_DESCRIPTIONS
from backend.chat_preparation import prepare_chat_turn
from backend.prompt_contract import OBJECTIVE_FOCUS_SENTINEL, objective_focus_stage, turn_contract
from backend.qsa_essential import (
    OBBDOCENZA_PHASES, OBBSTUDIO_PHASES, QSA_PHASES, advances_on_signal, directive,
)
from backend.tests.artifact_database import artifact_session

STUDIO = prompt_config.DEFAULT_OBIETTIVO_STUDIO_GUIDED_STEPS
DOCENZA = prompt_config.DEFAULT_OBIETTIVO_DOCENZA_GUIDED_STEPS
ALL_STEPS = [*STUDIO, *DOCENZA]
STEPS = {step["id"]: step for step in ALL_STEPS}
TEACHER = {"username": "goal-focus-teacher", "groups": ["docenti"], "is_admin": False,
           "is_researcher": False, "authenticated": True}
STUDENT = {"username": "goal-focus-student", "groups": ["studenti"], "is_admin": False,
           "is_researcher": False, "authenticated": True}
INTRO_SYSTEMS = {
    "OBIETTIVO_STUDIO": prompt_config.DEFAULT_SYSTEM_PROMPT_OBBSTUDIO_INTRO,
    "OBIETTIVO_DOCENZA": prompt_config.DEFAULT_SYSTEM_PROMPT_OBBDOCENZA_INTRO,
}
PLACEHOLDER = re.compile(r"\{[a-z_]+\}")


@pytest.fixture(scope="module")
def runtime():
    with artifact_session() as db:
        db.add_all(models.GuidedStep(**step) for step in ALL_STEPS)
        own = models.StudentGroup(code="GR-FOC001", name="2B", owner_username=TEACHER["username"],
                                  description="Laboratorio sui grafici temperatura-tempo", is_active=True)
        foreign = models.StudentGroup(code="GR-FOC002", name="5Z", owner_username="altro",
                                      description="CLASSE_ESTRANEA", is_active=True)
        db.add_all([own, foreign])
        db.flush()
        ai = AIService(db)
        ai.config.update(active_provider="ollama", model_name="test-local")
        yield db, ai, own, foreign


@pytest.fixture(autouse=True)
def forbid_generation(monkeypatch):
    monkeypatch.setattr(AIService, "get_response", lambda *args, **kwargs: pytest.fail(
        "Contract tests must never generate a model response"))


def prepare(runtime, phase, *, qtype=None, message="", entry=True, essential=False, identity=STUDENT,
            history=False, session_id="synthetic-goal-focus", **extra):
    db, ai, _, _ = runtime
    qtype = qtype or STEPS[phase]["questionnaire_type"]
    mode = "obiettivo-interview" if essential else (STEPS[phase]["system_prompt_mode"] if entry else "generic")
    request = ChatRequest(questionnaire_type=qtype, phase=phase, mode=mode, use_phase_prompt=entry,
                          message=message, language="it", guided_path="essential" if essential else "complete",
                          **extra)
    return prepare_chat_turn(db, ai, request, session_id, identity, include_retrieval=False,
                             include_history=history, create_anonymous_code=False)


# --- Bug f8e237bd: one coherent welcome, no unresolved placeholder -----------------

@pytest.mark.parametrize("qtype", sorted(INTRO_SYSTEMS))
def test_welcome_system_and_step_share_one_mandate_without_placeholders(qtype):
    system = INTRO_SYSTEMS[qtype]
    step = next(s for s in ALL_STEPS if s["questionnaire_type"] == qtype and s["id"].endswith("-intro"))["prompt"]
    assert not PLACEHOLDER.findall(system) and not PLACEHOLDER.findall(step)
    assert "ask about the objective" not in system
    # Welcome and agreement are one turn: confirming is the one question allowed.
    assert "the request to confirm the way of working is the only question" in system
    assert "confirm this way of working with the button below" in step
    assert "five steps" in system and "five steps" in step
    assert "7 steps" not in system + step
    outcome = "their students to learn" if qtype == "OBIETTIVO_DOCENZA" else "they would like to learn"
    assert outcome in system and outcome in step


@pytest.mark.parametrize("phase", ["obbstudio-intro", "obbdocenza-intro"])
def test_welcome_envelope_carries_no_contradiction(runtime, phase):
    prepared = prepare(runtime, phase, identity=TEACHER if "docenza" in phase else STUDENT)
    final = prepared.system_prompt_final
    assert "{who}" not in final and "{outcome}" not in final and "{objective}" not in final
    assert "ask about the objective" not in final
    assert OBJECTIVE_FOCUS_SENTINEL not in final


# --- Runtime contract on the complete path -------------------------------------------

@pytest.mark.parametrize("step", ALL_STEPS, ids=lambda step: step["id"])
def test_focus_contract_reaches_every_working_step_and_never_self_questioning(runtime, step):
    identity = TEACHER if step["questionnaire_type"] == "OBIETTIVO_DOCENZA" else STUDENT
    for entry in (True, False):
        prepared = prepare(runtime, step["id"], entry=entry, identity=identity,
                           message="" if entry else "Vorrei lavorare sui grafici.")
        contract = prepared.components["turn_contract"]
        assert "[SELF-QUESTIONING]" not in prepared.system_prompt_final
        stage = objective_focus_stage(step["id"])
        assert (OBJECTIVE_FOCUS_SENTINEL in contract) == (stage is not None)
        if stage in ("definition", "design"):
            assert "Never ask the person to formulate questions about themselves" in contract
        if stage == "definition":
            assert "Focus on ONE precise thing" in contract
            assert "offer ONE editable draft" in contract
            assert "never go through them one by one" in contract
            assert "propose a narrower first result for the person to confirm; do not impose" in contract
            assert "continue with points still open" in contract
            assert "never ask again for something already said" in contract
        if stage == "synthesis":
            assert "[GOAL DRAFT]" in contract and "State ONE objective" in contract


def test_stages_follow_the_existing_order_and_skip_welcome_and_agreement():
    expected = {"intro": None, "partenza": "definition", "livello": "definition",
                "piano": "design", "verifica": "design", "final": "synthesis"}
    for prefix, steps in (("obbstudio", STUDIO), ("obbdocenza", DOCENZA)):
        assert [step["id"] for step in sorted(steps, key=lambda s: s["sort_order"])] == [
            f"{prefix}-{suffix}" for suffix in expected]
        for suffix, stage in expected.items():
            assert objective_focus_stage(f"{prefix}-{suffix}") == stage
        # Retired steps kept by an administrator still get their stage.
        assert objective_focus_stage(f"{prefix}-patto") is None
        assert objective_focus_stage(f"{prefix}-smart") == "definition"
        assert objective_focus_stage(f"{prefix}-sfida") == "definition"
    for phase in ("questions", "conclusion", None, "qpcs-sintesi", "evstudio-final", "qsa-essential-focus"):
        assert objective_focus_stage(phase) is None


def test_teaching_and_learning_variants_keep_their_own_design():
    teaching = turn_contract(language="it", questionnaire_type="OBIETTIVO_DOCENZA", phase="obbdocenza-piano",
                             advice_allowed=False, objective_stage="design")
    learning = turn_contract(language="it", questionnaire_type="OBIETTIVO_STUDIO", phase="obbstudio-piano",
                             advice_allowed=False, objective_stage="design")
    assert "Start from the expected proof and align activities and assessment" in teaching
    assert "one if-then plan" in learning and "align activities" not in learning
    definition = turn_contract(language="it", questionnaire_type="OBIETTIVO_DOCENZA",
                               phase="obbdocenza-partenza", advice_allowed=False, objective_stage="definition")
    assert "'Doing a lesson on X' describes the teacher's activity" in definition
    assert "for this class or group" in definition
    assert "not evidence of difficulty or performance" in definition
    assert "Do not invent percentages, deadlines, needs, difficulties" in definition
    for other in ("QSA", "IDEA", "EVENTO_STUDIO"):
        assert OBJECTIVE_FOCUS_SENTINEL not in turn_contract(
            language="it", questionnaire_type=other, phase="obbstudio-partenza",
            advice_allowed=False, objective_stage="definition")


def test_factory_steps_check_gaps_instead_of_interrogating():
    for steps in (STUDIO, DOCENZA):
        by_suffix = {step["id"].split("-", 1)[1]: step["prompt"] for step in steps}
        assert "ONE precise thing" in by_suffix["partenza"] and "draft" in by_suffix["partenza"]
        assert "keep the others aside" in by_suffix["partenza"]
        # Bloom, SMART and challenge are silent checks of one step.
        assert "never go through them one by one" in by_suffix["livello"]
        assert "Never name these tools" in by_suffix["livello"]
        assert "it must be the level of that verb" in by_suffix["livello"]
        assert "Keep it fixed" in by_suffix["piano"]
        assert "Never invent percentages or dates" in by_suffix["verifica"]
        for suffix, prompt in by_suffix.items():
            assert not PLACEHOLDER.findall(prompt), suffix
            if suffix in ("partenza", "livello", "piano", "verifica"):
                assert "only [[AVANZA_STEP]]" in prompt and "ask whether to go on" in prompt, suffix
                assert "say in one short sentence" in prompt, suffix
            if suffix == "final":
                assert "do not use the step marker" in prompt and "no reflective questions" in prompt
    assert "the proof will ask" in STEPS["obbdocenza-piano"]["prompt"]


def test_contract_survives_admin_owned_step_text_without_rewriting_it(runtime):
    db, ai, _, _ = runtime
    custom = "Stored custom start: test every SMART letter one by one. [[AVANZA_STEP]]"
    row = db.query(models.GuidedStep).filter_by(id="obbstudio-partenza").one()
    original = row.prompt
    row.prompt = custom
    db.flush()
    try:
        prepared = prepare(runtime, "obbstudio-partenza")
        assert custom in prepared.system_prompt_final
        contract = prepared.components["turn_contract"]
        assert prepared.system_prompt_final.index(custom) < prepared.system_prompt_final.index(contract)
        assert "apply it only to what is actually missing" in contract
        assert db.query(models.GuidedStep).filter_by(id="obbstudio-partenza").one().prompt == custom
    finally:
        row.prompt = original
        db.flush()


# --- Group context and known data ------------------------------------------------------

def test_docenza_reuses_the_authorised_class_and_never_a_foreign_one(runtime):
    _, _, own, foreign = runtime
    prepared = prepare(runtime, "obbdocenza-partenza", identity=TEACHER, entry=False,
                       message="Vorrei migliorare lettura dei grafici, collaborazione e relazione finale.",
                       group_ids=[own.id, foreign.id])
    final = prepared.system_prompt_final
    assert "Laboratorio sui grafici temperatura-tempo" in final
    assert "CLASSE_ESTRANEA" not in final
    contract = prepared.components["turn_contract"]
    assert "Reuse what the person, the notebook, the class context and earlier turns already gave" in contract
    assert "Vorrei migliorare lettura dei grafici, collaborazione e relazione finale." in prepared.full_message


def test_student_notebook_keeps_classes_out_of_the_teacher_chat(runtime):
    _, _, own, _ = runtime
    prepared = prepare(runtime, "obbdocenza-partenza", identity=TEACHER, group_ids=[own.id],
                       notebook_context="student")
    assert "Laboratorio sui grafici temperatura-tempo" not in prepared.system_prompt_final
    assert OBJECTIVE_FOCUS_SENTINEL in prepared.components["turn_contract"]


def test_corrections_and_earlier_turns_travel_with_the_turn(runtime, monkeypatch, tmp_path):
    from backend import chat_logic, chat_preparation
    from backend.memory_service import SessionMemory

    memory = SessionMemory(memory_dir=tmp_path)
    monkeypatch.setattr(chat_logic, "session_memory", memory)
    monkeypatch.setattr(chat_preparation, "session_memory", memory)
    session_id = "synthetic-goal-correction"
    # Synthetic inputs, not generated or rated model answers.
    turns = [
        ("Vorrei che la 2B leggesse meglio i grafici.",
         "Bozza: ogni alunno della 2B descrive l'andamento di un grafico temperatura-tempo. Lavorano da soli?"),
        ("No, correggo: in coppia, con una scheda guida.",
         "Bozza aggiornata: in coppia, con una scheda guida, descrivono l'andamento giustificandolo con i dati."),
    ]
    for user, bot in turns:
        memory.record_interaction(session_id, user_message=user, transcript_user=user, bot_response=bot,
                                  phase="obbdocenza-essential-focus", questionnaire_type="OBIETTIVO_DOCENZA")
    prepared = prepare(runtime, "obbdocenza-essential-focus", qtype="OBIETTIVO_DOCENZA", essential=True,
                       entry=False, history=True, identity=TEACHER, session_id=session_id,
                       message="Va bene così.")
    assert prepared.history == [message for user, bot in turns for message in (
        {"role": "user", "content": user}, {"role": "assistant", "content": bot})]
    assert "a later correction replaces the earlier version" in prepared.components["turn_contract"]


# --- Essential path: three short stages closed by the marker -----------------------------

@pytest.mark.parametrize("phases", [OBBSTUDIO_PHASES, OBBDOCENZA_PHASES], ids=["studio", "docenza"])
def test_essential_stages_close_on_evidence_not_on_a_count(phases):
    focus, define, plan, summary = phases
    for phase in (focus, define, plan):
        reply = directive(phase)
        assert "Close the stage only when" in reply and "[[AVANZA_STEP]]" in reply
        assert "the person asks to move on (then name the points still open)" in reply
        assert "moves to the next step after each completed reply" not in reply
    assert "Do not emit [[AVANZA_STEP]] in this opening" in directive(focus, entry=True)
    assert "Do not emit [[AVANZA_STEP]] in this opening" in directive(plan, entry=True)
    assert "already well defined, restate it, and put only [[AVANZA_STEP]]" in directive(define, entry=True)
    assert "Do not write the summary" in directive(plan)
    assert "do not emit [[AVANZA_STEP]]" in directive(summary)
    assert "Do not ask another question" in directive(summary, entry=True)
    assert all(advances_on_signal(phase) for phase in phases)


def test_qsa_essential_keeps_three_stages_without_consuming_clarifications():
    for phase in QSA_PHASES:
        assert advances_on_signal(phase)
        assert "moves to the next step after each completed reply" not in directive(phase)
        assert "never close while awaiting a depth choice" in directive(phase)
    assert "Do not emit [[AVANZA_STEP]] in this opening" in directive(QSA_PHASES[0], entry=True)
    assert "Answer requested clarifications about factors and scores without opening personal exploration" in directive(QSA_PHASES[0])
    assert "Exactly three" not in _ESSENTIAL_PATH_DESCRIPTIONS["QSA"]
    for qtype in ("OBIETTIVO_STUDIO", "OBIETTIVO_DOCENZA"):
        assert "not after a fixed number of replies" in _ESSENTIAL_PATH_DESCRIPTIONS[qtype]


@pytest.mark.parametrize("phases,qtype,identity", [
    (OBBSTUDIO_PHASES, "OBIETTIVO_STUDIO", STUDENT), (OBBDOCENZA_PHASES, "OBIETTIVO_DOCENZA", TEACHER),
], ids=["studio", "docenza"])
def test_essential_envelopes_pick_opening_or_reply_task(runtime, phases, qtype, identity):
    for phase in phases:
        opening = prepare(runtime, phase, qtype=qtype, essential=True, entry=True, identity=identity)
        reply = prepare(runtime, phase, qtype=qtype, essential=True, entry=False, identity=identity,
                        message="Mi va bene la bozza.")
        assert directive(phase, entry=True) in opening.system_prompt_final
        assert directive(phase) in reply.system_prompt_final
        assert OBJECTIVE_FOCUS_SENTINEL in reply.components["turn_contract"]
        assert "[SELF-QUESTIONING]" not in reply.system_prompt_final
        assert "Exactly three" not in reply.system_prompt_final
    summary = prepare(runtime, phases[-1], qtype=qtype, essential=True, entry=True, identity=identity)
    assert "[GOAL DRAFT]" in summary.system_prompt_final


# --- Existing installations: explicit, reversible factory alignment ---------------------

def _digest(value):
    return hashlib.sha256((value or "").encode()).hexdigest()


def test_every_obiettivo_factory_text_is_registered_with_its_predecessor():
    legacy = json.loads((Path(prompt_config.__file__).parent / "prompt_factory_legacy.json").read_text())
    configs = {item["key"]: item["default"] for item in prompt_config.ALL_CONFIG_TEXT_DEFINITIONS}
    for key in ("prompt_obiettivo_interview", "prompt_obiettivo_summary",
                "prompt_obbstudio_intro", "prompt_obbdocenza_intro"):
        assert _digest(configs[key]) in legacy["configs"][key], key
        assert len(legacy["configs"][key]) >= 2, f"{key}: previous factory hash lost"
    for step in ALL_STEPS:
        assert _digest(step["prompt"]) in legacy["steps"][step["id"]], step["id"]


def test_alignment_updates_factory_rows_and_preserves_personalised_ones():
    with artifact_session() as db:
        partenza = STEPS["obbdocenza-partenza"]
        smart = STEPS["obbdocenza-livello"]
        db.add(models.GuidedStep(**{**partenza, "prompt": "Older factory partenza."}))
        db.add(models.GuidedStep(**{**smart, "prompt": "Teacher's own SMART step."}))
        db.flush()
        prompt_revisions.record(db, "guided_step", partenza["id"], "Older factory partenza.",
                                prompt_revisions.ORIGIN_SEED)
        prompt_revisions.record(db, "guided_step", smart["id"], "Teacher's own SMART step.",
                                prompt_revisions.ORIGIN_ADMIN)
        db.flush()
        plan = prompt_factory_alignment.make_plan(db)
        changes = {change["key"]: change for change in plan["changes"]}
        preserved = {item["key"]: item["reason"] for item in plan["preserved"]}
        assert changes[partenza["id"]]["after"] == partenza["prompt"]
        assert preserved[smart["id"]] == "personalised"
        # Planning never writes.
        assert db.query(models.GuidedStep).filter_by(id=partenza["id"]).one().prompt == "Older factory partenza."
