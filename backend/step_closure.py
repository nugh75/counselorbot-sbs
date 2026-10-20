"""Remind the counselor to offer a direction choice after several exchanges.

The threshold is an orientation reminder, never consent to advance. Legacy
marker helpers remain available, but chat routes must not use them to override
a person's pending choice or chosen exploration (#410 supersedes forced closure).
"""
from __future__ import annotations

import os

from sqlalchemy.orm import Session

from . import control_markers, models
from .chat_logic import _is_intro_step_mode
from .idea_map import IDEA_INSTRUMENT
from .journey_context import SYNTHESIS_STEPS
from .obiettivo_layout import active_guided_steps
from .prompt_config import WELCOME_PHASE_IDS
from .qsa_essential import is_essential_summary

DEFAULT_STEP_SAFETY_THRESHOLD = 5


def step_choice_context(db, step, phase, questionnaire_type, session_id) -> str:
    if not is_step_closure_eligible(db, step, phase, questionnaire_type):
        return ""
    exchanges = count_step_assistant_exchanges(db, session_id, phase)
    threshold = max(1, get_step_safety_threshold(db))
    # A repeated reminder on every later turn would itself turn the dialogue
    # into a menu. Revisit direction periodically, leaving chosen depth room.
    if (exchanges + 1) % threshold:
        return ""
    return (
        "[STEP DIRECTION CHOICE]\nSeveral exchanges have occurred in this step. "
        "Briefly return what has emerged and offer ONE choice to keep exploring or resume "
        "the path, unless the person has just made that choice: then honour it. "
        "The exchange count never supplies consent or requires closure. "
        "Emit no advance marker while awaiting the choice or exploring the chosen topic."
    )


def get_step_safety_threshold(db: Session | None = None) -> int:
    """Read the safety exchange threshold from config, environment, or default (5)."""
    if db is not None:
        try:
            cfg = db.query(models.Config).filter(models.Config.key == "step_safety_threshold").first()
            if cfg and cfg.value:
                return int(cfg.value.strip())
        except Exception:
            pass
    env_val = os.environ.get("STEP_SAFETY_THRESHOLD")
    if env_val:
        try:
            return int(env_val.strip())
        except ValueError:
            pass
    return DEFAULT_STEP_SAFETY_THRESHOLD


def is_step_closure_eligible(
    db: Session | None,
    step: models.GuidedStep | None,
    phase: str | None,
    questionnaire_type: str | None,
) -> bool:
    """Return True if the step is an intermediate guided step eligible for safety closure.

    Excludes:
    - Free chat (no phase)
    - IDEA instrument (no linear step advance)
    - Introduction steps (WELCOME_PHASE_IDS, sort_order < 0, intro modes)
    - Final synthesis or farewell steps with no next step (SYNTHESIS_STEPS, summary modes, or last active step)
    """
    if not phase:
        return False

    if step is None and db is not None:
        try:
            step = db.query(models.GuidedStep).filter(models.GuidedStep.id == phase).first()
        except Exception:
            pass

    qtype = (questionnaire_type or (step.questionnaire_type if step else "") or "").upper()
    if qtype == IDEA_INSTRUMENT.upper():
        return False

    # Intro steps
    if phase in WELCOME_PHASE_IDS or phase.endswith("-intro") or phase.endswith("-welcome"):
        return False
    if step:
        mode = step.system_prompt_mode or ""
        if (
            mode == "intro"
            or _is_intro_step_mode(mode)
            or (step.sort_order is not None and step.sort_order < 0)
        ):
            return False

    # Synthesis / farewell / conclusion steps
    if (
        phase in SYNTHESIS_STEPS
        or is_essential_summary(phase)
        or phase.endswith("-final")
        or phase.endswith("-sintesi")
        or phase.endswith("-synthesis")
        or phase.endswith("-farewell")
        or phase == "conclusion"
    ):
        return False
    if step:
        mode = step.system_prompt_mode or ""
        if mode.endswith("-summary") or mode.endswith("-synthesis") or mode == "farewell":
            return False

    # Check if there is a next step in the questionnaire's active steps
    if db is not None and (step or questionnaire_type):
        effective_qtype = step.questionnaire_type if step else questionnaire_type
        if effective_qtype:
            try:
                active = active_guided_steps(
                    db,
                    db.query(models.GuidedStep)
                    .filter(models.GuidedStep.questionnaire_type == effective_qtype)
                    .order_by(models.GuidedStep.sort_order)
                    .all(),
                )
                if active:
                    # If current phase is the last active step, no next step exists
                    if active[-1].id == phase:
                        return False
                    if step and step.sort_order is not None and active[-1].sort_order <= step.sort_order:
                        return False
            except Exception:
                pass

    return True


def count_step_assistant_exchanges(
    db: Session | None,
    session_id: str | None,
    phase: str | None,
) -> int:
    """Return the number of assistant messages logged for this session and phase."""
    if not db or not session_id or not phase:
        return 0
    try:
        return (
            db.query(models.Log)
            .filter(
                models.Log.session_id == session_id,
                models.Log.action == "chat_message",
                models.Log.phase == phase,
                models.Log.details["exploration"].as_string().is_(None),
            )
            .count()
        )
    except Exception:
        return 0


def should_force_step_closure(
    current_exchange_count: int,
    is_eligible: bool,
    threshold: int = DEFAULT_STEP_SAFETY_THRESHOLD,
) -> bool:
    """Return True if the step is eligible and current exchanges reached the safety threshold."""
    if not is_eligible:
        return False
    return current_exchange_count >= threshold


def ensure_step_closure(text: str, should_advance: bool) -> str:
    """Ensure the [[AVANZA_STEP]] marker is present in text if should_advance is True.

    If should_advance is False, returns text unchanged.
    If should_advance is True and the marker is already present, does not duplicate it.
    """
    if not should_advance:
        return text

    _, signals = control_markers.extract(text)
    if control_markers.ADVANCE_STEP in signals:
        return text

    raw = (text or "").rstrip()
    if not raw:
        return control_markers.ADVANCE_MARKER
    return f"{raw}\n\n{control_markers.ADVANCE_MARKER}"
