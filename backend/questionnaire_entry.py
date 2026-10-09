"""Atomic guided score entry with scoped, immutable retry acknowledgements."""

from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import or_
from . import models, administration_context, scoring_service
from .path_step_types import valid_scores, administration_target


def result_payload(result):
    return {
        "id": result.id,
        "session_id": result.session_id,
        "scores": result.scores,
        "questionnaire_type": result.questionnaire_type,
        "administration_plan_id": result.administration_plan_id,
        "source": result.source,
        "capture_method": result.capture_method,
        "source_system": result.source_system,
        "locale": result.locale,
    }


def acknowledgement(db, entry):
    result = db.get(models.QuestionnaireResult, entry.result_id)
    evidence = (
        db.query(models.ClassPathStepEvidence).filter_by(guided_entry_id=entry.id).one()
    )
    return {
        "result": result_payload(result),
        "guided_entry_id": entry.id,
        "evidence_id": evidence.id,
        "session_id": entry.session_id,
        "accepted_at": entry.accepted_at.isoformat(),
    }


def accept_guided_entry(db, identity, path_id, step_id, payload):
    from .routes.class_paths import require_step_launch

    path, step, descriptor = require_step_launch(
        db, identity, path_id, step_id, for_update=True
    )
    if step.step_type != "questionnaire_administration":
        raise HTTPException(422, "administration_step_required")
    username = identity["username"]
    plan, _ = administration_target(
        db, path.group_id, step.administration_plan_id, for_update=True
    )
    administration_context.require_result_context(
        db, plan.id, username, payload.institution_grant, plan.instrument_code
    )
    # In-app plans accept only the runner's saved result: scores are never retyped.
    if plan.delivery_mode == "in_app" and payload.result_id is None:
        raise HTTPException(422, "administration_result_required")
    entry = (
        db.query(models.QuestionnaireGuidedEntry)
        .filter(
            models.QuestionnaireGuidedEntry.username == username,
            or_(
                models.QuestionnaireGuidedEntry.request_id == payload.request_id,
                models.QuestionnaireGuidedEntry.session_id == payload.session_id,
            ),
        )
        .first()
    )
    if entry:
        result = db.get(models.QuestionnaireResult, entry.result_id)
        if (
            entry.step_id != step.id
            or entry.session_id != payload.session_id
            or entry.request_id != payload.request_id
            or (payload.result_id is not None and result.id != payload.result_id)
            or (payload.scores is not None and payload.scores != result.scores)
        ):
            raise HTTPException(409, "guided_entry_retry_conflict")
        return acknowledgement(db, entry)
    # Never attach a teacher's practice result or another user's existing session.
    # The selected result's own session may open guided chat while still unused.
    other_results = db.query(models.QuestionnaireResult.id).filter_by(
        session_id=payload.session_id
    )
    if payload.result_id is not None:
        other_results = other_results.filter(
            models.QuestionnaireResult.id != payload.result_id
        )
    if (
        db.query(models.Log.id).filter_by(session_id=payload.session_id).first()
        or other_results.first()
    ):
        raise HTTPException(409, "guided_entry_session_exists")
    if payload.result_id is not None:
        result = db.get(models.QuestionnaireResult, payload.result_id)
        if (
            not result
            or result.username != username
            or result.administration_plan_id != plan.id
            or result.questionnaire_type != plan.instrument_code
            or result.locale != plan.locale
            or (plan.delivery_mode == "in_app" and result.capture_method != "item_runner")
        ):
            raise HTTPException(422, "guided_entry_result_mismatch")
        if payload.scores is not None and payload.scores != result.scores:
            raise HTTPException(409, "guided_entry_scores_conflict")
        scores = result.scores
    else:
        scores = payload.scores
        result = None
    if not valid_scores(db, plan.instrument_code, scores):
        raise HTTPException(422, "questionnaire_scores_invalid")
    try:
        if result is None:
            result = models.QuestionnaireResult(
                session_id=payload.session_id,
                username=username,
                questionnaire_type=plan.instrument_code,
                administration_plan_id=plan.id,
                scores=scores,
                locale=plan.locale,
                source="in-app",
                capture_method="manual_scores",
                source_system="competenzestrategiche.it",
            )
            db.add(result)
            db.flush()
        entry = models.QuestionnaireGuidedEntry(
            result_id=result.id,
            username=username,
            session_id=payload.session_id,
            request_id=payload.request_id,
            step_id=step.id,
            accepted_at=datetime.now(timezone.utc),
        )
        db.add(entry)
        db.flush()
        evidence = models.ClassPathStepEvidence(
            step_id=step.id,
            username=username,
            kind="guided_entry",
            result_id=result.id,
            guided_entry_id=entry.id,
            recorded_at=entry.accepted_at,
        )
        db.add(evidence)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return acknowledgement(db, entry)


def score_in_app_step(db, identity, path_id, step_id, payload):
    """Score the exact plan locale and save one in-app result; no completion yet.

    The session ID is the scoped retry key: the same student, plan and scores
    return the saved row, anything else on that session is a conflict.
    """
    from .routes.class_paths import require_step_launch

    path, step, _ = require_step_launch(db, identity, path_id, step_id, for_update=True)
    if step.step_type != "questionnaire_administration":
        raise HTTPException(422, "administration_step_required")
    username = identity["username"]
    plan, _ = administration_target(
        db, path.group_id, step.administration_plan_id, for_update=True
    )
    if plan.delivery_mode != "in_app":
        raise HTTPException(422, "administration_in_app_required")
    administration_context.require_result_context(
        db, plan.id, username, payload.institution_grant, plan.instrument_code
    )
    existing = (
        db.query(models.QuestionnaireResult)
        .filter_by(session_id=payload.session_id)
        .all()
    )
    try:
        profile = scoring_service.compute_profile(
            db, plan.instrument_code, plan.locale, payload.answers
        )
    except scoring_service.LocaleUnavailable:
        raise HTTPException(422, "administration_locale_unavailable")
    except scoring_service.ScoringError:
        raise HTTPException(422, "questionnaire_answers_invalid")
    scores = scoring_service.mapped_stanine_scores(profile)
    if not valid_scores(db, plan.instrument_code, scores):
        raise HTTPException(422, "questionnaire_scores_invalid")
    if existing:
        result = existing[0]
        if (
            len(existing) != 1
            or result.username != username
            or result.administration_plan_id != plan.id
            or result.capture_method != "item_runner"
            or result.scores != scores
        ):
            raise HTTPException(409, "administration_result_conflict")
        return {"result": result_payload(result), "profile": profile}
    if db.query(models.Log.id).filter_by(session_id=payload.session_id).first():
        raise HTTPException(409, "administration_result_conflict")
    try:
        result = models.QuestionnaireResult(
            session_id=payload.session_id,
            username=username,
            questionnaire_type=plan.instrument_code,
            administration_plan_id=plan.id,
            scores=scores,
            locale=plan.locale,
            source="in-app",
            capture_method="item_runner",
            source_system="counselorbot",
        )
        db.add(result)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"result": result_payload(result), "profile": profile}
