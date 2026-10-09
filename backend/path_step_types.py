"""Shared typed-step builder/availability/launch/completion boundary.

TF3 registers tool and Italian administration; TF4 adds in-app administrations
in other served locales; TF5 adds the optional guided deep dive on the result of
an earlier administration step; TF6 adds whole-class goal assignments, completed
by the student's explicit current submission; TF7 adds exact class discussions,
completed by the student's published reply, read through `forum_completion` as
identifiers, status and timestamps only. Later slices extend these branches
together with their strict input target and database constraint.
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session
from . import models, administration_context, forum_completion, scoring_service
from .class_access import class_enables
from .class_path_completion import GUIDED_CHAT_COMPLETED, has_automatic_evidence

ADMINISTRATION_QUESTIONNAIRES = frozenset({"QSA", "QSAr", "ZTPI", "QPCS", "QPCC", "QAP"})
EXTERNAL_IT_HREF = "https://www.competenzestrategiche.it/"


def delivery_unavailable(db: Session, plan) -> str | None:
    """Italian plans are external; other locales run in app only where served."""
    if plan.instrument_code not in ADMINISTRATION_QUESTIONNAIRES:
        return "administration_delivery_unavailable"
    if plan.delivery_mode == "external_it" and plan.locale == "it":
        return None
    if plan.delivery_mode == "in_app" and plan.locale != "it":
        # Never fall back to another locale: the exact plan locale must be served.
        if scoring_service.locale_available(db, plan.instrument_code, plan.locale):
            return None
        return "administration_locale_unavailable"
    return "administration_delivery_unavailable"


def administration_target(
    db: Session, group_id: int, plan_id: int, *, for_update=False
):
    plan_query = db.query(models.AdministrationPlan).filter_by(id=plan_id)
    if for_update:
        plan_query = plan_query.populate_existing().with_for_update()
    plan = plan_query.first()
    group = db.get(models.StudentGroup, group_id)
    if not plan or plan.group_id != group_id:
        raise HTTPException(422, "administration_class_mismatch")
    if (
        not group
        or not group.is_active
        or not group.institution_id
        or group.institution_id != plan.institution_id
    ):
        raise HTTPException(409, "administration_institution_mismatch")
    if reason := delivery_unavailable(db, plan):
        raise HTTPException(422, reason)
    if plan.status not in {"planned", "active"}:
        raise HTTPException(409, "administration_inactive")
    institution = administration_context.require_institution_backed(db, plan)
    instrument = (
        db.query(models.Instrument).filter_by(code=plan.instrument_code).first()
    )
    if (
        not instrument
        or not instrument.is_active
        or instrument.target_audience != "student"
    ):
        raise HTTPException(409, "tool_unavailable")
    if not class_enables(db.get(models.ClassSettings, group_id), plan.instrument_code):
        raise HTTPException(409, "tool_disabled_for_class")
    return plan, institution


ASSIGNMENT_TOOL_KEY = "assignments"


def assignment_target(db: Session, group_id: int, assignment_id: int, *, for_update=False):
    """Path v1 accepts only live whole-class goal assignments of the same class."""
    query = db.query(models.TeacherAssignment).filter_by(id=assignment_id)
    if for_update:
        query = query.populate_existing().with_for_update()
    assignment = query.first()
    if not assignment or assignment.group_id != group_id:
        raise HTTPException(422, "assignment_class_mismatch")
    if assignment.recipient_username is not None:
        raise HTTPException(422, "assignment_targeted")
    if assignment.source_kind != "goal":
        raise HTTPException(422, "assignment_not_goal")
    if assignment.revoked_at is not None:
        raise HTTPException(409, "assignment_revoked")
    group = db.get(models.StudentGroup, group_id)
    if not group or not group.is_active:
        raise HTTPException(409, "assignment_class_inactive")
    return assignment


def assignment_href(assignment_id):
    # The standalone assignment page opens this hash: one workflow, one submission.
    return f"/profilo/assegnazioni#assignment-{assignment_id}"


FORUM_TOOL_KEY = "forum"


def forum_target(db: Session, group_id: int, topic_id: int, *, for_update=False):
    """A published, visible discussion of this class, with the class forum on.

    The class's own forum setting decides, as on the forum routes: neither
    another class nor the student's tool view can open it.
    """
    row = forum_completion.topic(db, topic_id, for_update=for_update)
    if not row or row.group_id != group_id:
        raise HTTPException(422, "forum_topic_class_mismatch")
    if row.status != "published" or row.hidden_at is not None:
        raise HTTPException(409, "forum_topic_unavailable")
    group = db.get(models.StudentGroup, group_id)
    if not group or not group.is_active:
        raise HTTPException(409, "forum_class_inactive")
    if not class_enables(db.get(models.ClassSettings, group_id), FORUM_TOOL_KEY):
        raise HTTPException(409, "forum_disabled_for_class")
    return row


def forum_href(group_id, topic_id):
    return f"/profilo/classi/{group_id}/forum?topic={topic_id}"


def validate_step_input(db, path, value):
    from .routes.class_paths import get_class_enabled_tool_keys

    if value.step_type == "tool":
        if value.tool_key not in get_class_enabled_tool_keys(db, path.group_id):
            raise HTTPException(
                422, f"Tool '{value.tool_key}' is not enabled for this class"
            )
    elif value.step_type == "questionnaire_administration":
        administration_target(db, path.group_id, value.administration_plan_id)
    elif value.step_type == "assignment":
        # Lock the row so a concurrent revocation is seen before this save commits.
        assignment_target(db, path.group_id, value.assignment_id, for_update=True)
    elif value.step_type == "forum":
        # Lock the discussion so a concurrent hide is seen before this save commits.
        forum_target(db, path.group_id, value.topic_id, for_update=True)


def validate_composition(db, path, steps):
    """A deep dive follows its saved administration step of this path, once;
    an assignment or a discussion is a target of at most one step of the path."""
    positions = {value.id: index for index, value in enumerate(steps) if value.id}
    assignments = [value.assignment_id for value in steps if value.step_type == "assignment"]
    if len(assignments) != len(set(assignments)):
        raise HTTPException(422, "duplicate_assignment_step")
    topics = [value.topic_id for value in steps if value.step_type == "forum"]
    if len(topics) != len(set(topics)):
        raise HTTPException(422, "duplicate_forum_step")
    linked = set()
    for index, value in enumerate(steps):
        if value.step_type != "guided_results_chat":
            continue
        if value.results_step_id in linked:
            raise HTTPException(422, "duplicate_results_chat")
        linked.add(value.results_step_id)
        stored = (
            db.query(models.ClassPathStep)
            .filter_by(id=value.results_step_id, path_id=path.id)
            .first()
        )
        if not stored or stored.step_type != "questionnaire_administration":
            raise HTTPException(422, "results_step_invalid")
        if value.results_step_id not in positions:
            raise HTTPException(409, "results_step_referenced")
        position = positions[value.results_step_id]
        if steps[position].step_type != "questionnaire_administration":
            raise HTTPException(422, "results_step_invalid")
        if position > index:
            raise HTTPException(422, "results_step_order")


def target_identity(value):
    target = {
        "tool": "tool_key",
        "questionnaire_administration": "administration_plan_id",
        "guided_results_chat": "results_step_id",
        "assignment": "assignment_id",
        "forum": "topic_id",
    }[value.step_type]
    return value.step_type, getattr(value, target)


def apply_step_target(step, value):
    if step.active_from is not None and target_identity(step) != target_identity(value):
        raise HTTPException(409, "activated_step_target_immutable")
    step.step_type = value.step_type
    step.tool_key = value.tool_key if value.step_type == "tool" else None
    step.administration_plan_id = (
        value.administration_plan_id
        if value.step_type == "questionnaire_administration"
        else None
    )
    step.results_step_id = (
        value.results_step_id if value.step_type == "guided_results_chat" else None
    )
    step.assignment_id = value.assignment_id if value.step_type == "assignment" else None
    step.topic_id = value.topic_id if value.step_type == "forum" else None


def results_step(db, step):
    """The deep dive's administration step while it is still active in its path."""
    source = db.get(models.ClassPathStep, step.results_step_id)
    if (
        source
        and source.path_id == step.path_id
        and source.removed_at is None
        and source.step_type == "questionnaire_administration"
    ):
        return source
    return None


def step_descriptor(db, path, step):
    from .routes.class_paths import (
        is_auto_detect_tool,
        is_tool_available_for_class,
        get_tool_start_href,
    )

    if step.step_type == "tool":
        available = is_tool_available_for_class(db, path.group_id, step.tool_key)
        return {
            "available": available,
            "availability_reason": None if available else "tool_unavailable",
            "auto_detect": is_auto_detect_tool(db, step.tool_key),
            "target_summary": None,
            "start_href": get_tool_start_href(step.tool_key),
            "instrument_code": step.tool_key,
        }
    if step.step_type == "assignment":
        return assignment_descriptor(db, path, step)
    if step.step_type == "forum":
        return forum_descriptor(db, path, step)
    deep_dive = step.step_type == "guided_results_chat"
    source = results_step(db, step) if deep_dive else step
    try:
        if source is None:
            raise HTTPException(409, "results_step_unavailable")
        plan, institute = administration_target(
            db, path.group_id, source.administration_plan_id
        )
    except HTTPException as error:
        return {
            "available": False,
            "availability_reason": error.detail,
            "auto_detect": True,
            "target_summary": None,
            "start_href": None,
            "instrument_code": None,
        }
    return {
        "available": True,
        "availability_reason": None,
        "auto_detect": True,
        "instrument_code": plan.instrument_code,
        "start_href": f"/profilo/percorsi/{path.id}/{step.id}"
        + ("/approfondimento" if deep_dive else ""),
        "target_summary": {
            "id": plan.id,
            "code": plan.code,
            "title": plan.title,
            "instrument_code": plan.instrument_code,
            "locale": plan.locale,
            "institution_name": institute.name,
            "delivery_mode": plan.delivery_mode,
            **({"results_step_id": source.id} if deep_dive else {}),
        },
    }


def assignment_descriptor(db, path, step):
    try:
        assignment = assignment_target(db, path.group_id, step.assignment_id)
    except HTTPException as error:
        return {
            "available": False,
            "availability_reason": error.detail,
            "auto_detect": True,
            "target_summary": None,
            "start_href": None,
            "instrument_code": ASSIGNMENT_TOOL_KEY,
        }
    settings = db.get(models.AssignmentLearningSettings, assignment.id)
    # Delivered snapshot only: later catalog edits or deletions never rewrite it.
    return {
        "available": True,
        "availability_reason": None,
        "auto_detect": True,
        "instrument_code": ASSIGNMENT_TOOL_KEY,
        "start_href": assignment_href(assignment.id),
        "target_summary": {
            "id": assignment.id,
            "title": assignment.snapshot.get("title", ""),
            "attachments": [
                {"kind": item.get("kind"), "title": item.get("title", "")}
                for item in assignment.attachments or []
            ],
            "intent": settings.intent if settings else "proposal",
            "due_date": settings.due_date.isoformat() if settings and settings.due_date else None,
        },
    }


def assignment_evidence(db, path, step, username):
    """The student's current explicit submission, made after the step's activation."""
    if step.active_from is None:
        return None
    try:
        assignment = assignment_target(db, path.group_id, step.assignment_id)
    except HTTPException:
        return None
    if not db.query(models.GroupMembership.id).filter_by(
        group_id=assignment.group_id, username=username
    ).first():
        return None
    work = (
        db.query(models.AssignmentWork)
        .filter_by(assignment_id=assignment.id, username=username)
        .first()
    )
    # Planning, private reflections and teacher feedback alone never count.
    if (
        work
        and work.submission is not None
        and work.submitted_at is not None
        and work.submitted_at >= step.active_from
    ):
        return {"kind": "assignment_submission", "at": work.submitted_at}
    return None


def forum_descriptor(db, path, step):
    try:
        row = forum_target(db, path.group_id, step.topic_id)
    except HTTPException as error:
        return {
            "available": False,
            "availability_reason": error.detail,
            "auto_detect": True,
            "target_summary": None,
            "start_href": None,
            "instrument_code": FORUM_TOOL_KEY,
        }
    # Identifiers and lock state only: the title and every message stay in the forum.
    return {
        "available": True,
        "availability_reason": None,
        "auto_detect": True,
        "instrument_code": FORUM_TOOL_KEY,
        "start_href": forum_href(path.group_id, row.id),
        "target_summary": {"id": row.id, "group_id": path.group_id, "locked": bool(row.locked)},
    }


def forum_evidence(db, path, step, username):
    """The student's own published reply in that discussion, after activation."""
    if step.active_from is None or not db.query(models.GroupMembership.id).filter_by(
        group_id=path.group_id, username=username
    ).first():
        return None
    try:
        forum_target(db, path.group_id, step.topic_id)
    except HTTPException:
        return None
    at = forum_completion.first_published_reply_at(db, step.topic_id, username, step.active_from)
    return {"kind": "forum_reply", "at": at} if at else None


def forum_student_state(db, path, step, username):
    """Pending, hidden, locked and muted flags behind the student's next action."""
    return forum_completion.student_state(db, path.group_id, step.topic_id, username, step.active_from)


def completion_evidence(db, path, step, username):
    if step.step_type == "tool":
        return (
            {"kind": "tool", "at": None}
            if has_automatic_evidence(db, step.tool_key, username, path.published_at)
            else None
        )
    if step.step_type == "guided_results_chat":
        return deep_dive_evidence(db, step, username)
    if step.step_type == "assignment":
        return assignment_evidence(db, path, step, username)
    if step.step_type == "forum":
        return forum_evidence(db, path, step, username)
    return next(administration_evidence(db, step, username), None)


def deep_dive_evidence(db, step, username):
    """Final guided-turn marker of a session bound to a still-qualifying result."""
    source = results_step(db, step)
    if step.active_from is None or source is None:
        return None
    qualifying = {row["result_id"] for row in administration_evidence(db, source, username)}
    for binding in (
        db.query(models.ClassPathDeepDiveSession)
        .filter_by(step_id=step.id, username=username)
        .order_by(models.ClassPathDeepDiveSession.id)
    ):
        if binding.result_id not in qualifying or binding.started_at < step.active_from:
            continue
        result = db.get(models.QuestionnaireResult, binding.result_id)
        final_turn = (
            db.query(models.Log.timestamp)
            .filter(
                models.Log.action == GUIDED_CHAT_COMPLETED,
                models.Log.session_id == binding.session_id,
                models.Log.username == username,
                models.Log.questionnaire_type == result.questionnaire_type,
                models.Log.timestamp >= binding.started_at,
            )
            .order_by(models.Log.id)
            .first()
        )
        if final_turn:
            return {"kind": "guided_results_chat", "at": final_turn[0], "result_id": result.id}
    return None


def administration_evidence(db, step, username):
    """Yield each valid completion of an administration step, oldest first."""
    if step.active_from is None:
        return
    plan = db.get(models.AdministrationPlan, step.administration_plan_id)
    for evidence in (
        db.query(models.ClassPathStepEvidence)
        .filter_by(step_id=step.id, username=username, invalidated_at=None)
        .order_by(models.ClassPathStepEvidence.id)
    ):
        result = db.get(models.QuestionnaireResult, evidence.result_id)
        if (
            not result
            or not plan
            or result.username != username
            or result.administration_plan_id != plan.id
            or result.questionnaire_type != plan.instrument_code
            or result.locale != plan.locale
        ):
            continue
        if not valid_scores(db, result.questionnaire_type, result.scores):
            continue
        if evidence.kind == "guided_entry":
            entry = db.get(models.QuestionnaireGuidedEntry, evidence.guided_entry_id)
            if (
                entry
                and entry.username == username
                and entry.result_id == result.id
                and entry.step_id == step.id
                and entry.accepted_at >= step.active_from
                and evidence.recorded_at >= step.active_from
            ):
                yield {"kind": "guided_entry", "at": entry.accepted_at, "result_id": result.id}
        elif evidence.kind == "confirmed_import" and result.source == "imported":
            confirmation = db.get(
                models.QuestionnaireImportConfirmation, evidence.import_confirmation_id
            )
            if (
                confirmation
                and not confirmation.invalidated_at
                and confirmation.username == username
                and confirmation.result_id == result.id
                and confirmation.administration_plan_id == plan.id
                and confirmation.batch_id
                and confirmation.confirmed_by
                and confirmation.confirmed_at >= step.active_from
                and evidence.recorded_at >= step.active_from
            ):
                yield {
                    "kind": "confirmed_import",
                    "at": confirmation.confirmed_at,
                    "result_id": result.id,
                }


def valid_scores(db, instrument_code, scores):
    factors = {
        row.code
        for row in db.query(models.Factor).filter_by(instrument_code=instrument_code)
    }
    return (
        bool(factors)
        and isinstance(scores, dict)
        and set(scores) == factors
        and all(type(value) is int and 1 <= value <= 9 for value in scores.values())
    )
