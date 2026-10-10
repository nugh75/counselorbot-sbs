"""Automatic completion of class path steps (plan §4.2, #98).

Completion is computed on read, never stored, from evidence the student created
after the path's `published_at`. The only new write is the
`guided_chat_completed` marker, recorded when a chat turn on an instrument's
last guided step completes.
"""
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models
from .class_tools import GUIDED_PATH_KEYS
from .diagram_render import DiagramSpecError, parse_spec
from .idea_map import IDEA_INSTRUMENT, resolve_focus

GUIDED_CHAT_COMPLETED = "guided_chat_completed"
PQBL_SESSION_COMPLETED = "pqbl_session_completed"


def _last_guided_step_id(db: Session, questionnaire_type: str) -> str | None:
    row = (
        db.query(models.GuidedStep.id)
        .filter(models.GuidedStep.questionnaire_type == questionnaire_type)
        .order_by(models.GuidedStep.sort_order.desc(), models.GuidedStep.id.desc())
        .first()
    )
    return row[0] if row else None


def record_guided_chat_completion(db: Session, *, session_id: str, username: str | None,
                                  phase: str | None) -> bool:
    """Add the marker when `phase` is its instrument's last guided step.

    Idempotent per (session, instrument, user): a resumed session or a second
    turn on the last step writes nothing. The caller commits.
    """
    if not username or not phase or not session_id:
        return False
    step = db.get(models.GuidedStep, phase)
    if step is None or _last_guided_step_id(db, step.questionnaire_type) != step.id:
        return False
    exists = (
        db.query(models.Log.id)
        .filter(
            models.Log.action == GUIDED_CHAT_COMPLETED,
            models.Log.session_id == session_id,
            models.Log.username == username,
            models.Log.questionnaire_type == step.questionnaire_type,
        )
        .first()
    )
    if exists:
        return False
    db.add(models.Log(
        session_id=session_id,
        action=GUIDED_CHAT_COMPLETED,
        # Turn time, not transaction start: deep dives compare it with their binding.
        timestamp=datetime.now(timezone.utc),
        username=username,
        questionnaire_type=step.questionnaire_type,
        phase=step.id,
    ))
    return True


def _idea_map_is_focused(spec_raw, focus_id: str | None) -> bool:
    """A map counts when it has a branch to work on (`idea_map.resolve_focus`)."""
    try:
        spec = parse_spec(spec_raw)
    except DiagramSpecError:
        return False
    return resolve_focus(spec, focus_id) is not None


def _exists(query) -> bool:
    return query.first() is not None


def has_automatic_evidence(db: Session, tool_key: str, username: str, since: datetime | None) -> bool:
    """True when the student produced the tool's evidence at or after `since`."""
    if not username or since is None:
        return False
    key = (tool_key or "").strip()
    lower = key.lower()

    if lower == "bussola":
        return _exists(db.query(models.OrientationSession.session_id).filter(
            models.OrientationSession.username == username,
            models.OrientationSession.completed_at >= since,
        ))
    if lower == "tavolo":
        return _exists(db.query(models.Tavolo.id).filter(
            models.Tavolo.username == username,
            models.Tavolo.saved_at >= since,
        ))
    if lower == "goals":
        return _exists(db.query(models.PersonalGoal.id).filter(
            models.PersonalGoal.username == username,
            models.PersonalGoal.created_at >= since,
        ))
    if lower == "pqbl":
        return _exists(db.query(models.Log.id).filter(
            models.Log.action == PQBL_SESSION_COMPLETED,
            models.Log.username == username,
            models.Log.timestamp >= since,
        ))

    instrument = (
        db.query(models.Instrument)
        .filter(func.lower(models.Instrument.code) == lower)
        .first()
    )
    # A built-in guided path has no instrument row: its guided chat marker is the evidence.
    if instrument is None and key.upper() not in GUIDED_PATH_KEYS:
        return False
    code = instrument.code if instrument is not None else key.upper()
    if code.upper() == IDEA_INSTRUMENT:
        revisions = (
            db.query(models.IdeaMapRevision.spec, models.IdeaMapRevision.focus_id)
            .filter(
                models.IdeaMapRevision.username == username,
                models.IdeaMapRevision.created_at >= since,
            )
            .order_by(models.IdeaMapRevision.id.desc())
        )
        return any(_idea_map_is_focused(spec, focus_id) for spec, focus_id in revisions)
    if instrument is not None and instrument.tool_category == "assessment":
        return _exists(db.query(models.QuestionnaireResult.id).filter(
            models.QuestionnaireResult.username == username,
            models.QuestionnaireResult.questionnaire_type == code,
            models.QuestionnaireResult.submitted_at >= since,
        ))
    return _exists(db.query(models.Log.id).filter(
        models.Log.action == GUIDED_CHAT_COMPLETED,
        models.Log.username == username,
        models.Log.questionnaire_type == code,
        models.Log.timestamp >= since,
    ))
