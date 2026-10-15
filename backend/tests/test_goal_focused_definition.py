"""Obiettivo paths: ONE focus, an early draft and stages that close on evidence.

Envelope and contract tests without a model: they check what the model receives
and how the essential path advances, not the quality of a live reply. Synthetic
before/after examples and their limits are recorded in the handoff.
"""
import re

import pytest

from backend import models, prompt_config
from backend.ai_service import AIService
from backend.api_models import ChatRequest
from backend.chat_preparation import prepare_chat_turn
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
        db.flush()
        ai = AIService(db)
        ai.config.update(active_provider="ollama", model_name="test-local")
        yield db, ai


@pytest.fixture(autouse=True)
def forbid_generation(monkeypatch):
    monkeypatch.setattr(AIService, "get_response", lambda *args, **kwargs: pytest.fail(
        "Contract tests must never generate a model response"))


def prepare(runtime, phase, *, identity=STUDENT):
    db, ai = runtime
    step = STEPS[phase]
    request = ChatRequest(questionnaire_type=step["questionnaire_type"], phase=phase,
                          mode=step["system_prompt_mode"], use_phase_prompt=True, message="", language="it")
    return prepare_chat_turn(db, ai, request, "synthetic-goal-focus", identity, include_retrieval=False,
                             include_history=False, create_anonymous_code=False)


# --- Bug f8e237bd: one coherent welcome, no unresolved placeholder -----------------

@pytest.mark.parametrize("qtype", sorted(INTRO_SYSTEMS))
def test_welcome_system_and_step_share_one_mandate_without_placeholders(qtype):
    system = INTRO_SYSTEMS[qtype]
    step = next(s for s in ALL_STEPS if s["questionnaire_type"] == qtype and s["id"].endswith("-intro"))["prompt"]
    assert not PLACEHOLDER.findall(system) and not PLACEHOLDER.findall(step)
    assert "ask about the objective" not in system
    # The step's single invitation is the one question the system allows.
    assert "the optional invitation above is the only question" in system
    assert "invite them, without insisting" in step
    outcome = "their students to learn" if qtype == "OBIETTIVO_DOCENZA" else "they would like to learn"
    assert outcome in system and outcome in step


@pytest.mark.parametrize("phase", ["obbstudio-intro", "obbdocenza-intro"])
def test_welcome_envelope_carries_no_contradiction(runtime, phase):
    prepared = prepare(runtime, phase, identity=TEACHER if "docenza" in phase else STUDENT)
    final = prepared.system_prompt_final
    assert "{who}" not in final and "{outcome}" not in final and "{objective}" not in final
    assert "ask about the objective" not in final
