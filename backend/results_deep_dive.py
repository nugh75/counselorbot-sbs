"""Bind questionnaire analysis to one result and a server-issued session (#249).

Plan sources keep their exact administration evidence. Personal sources require
an explicit selection from the student's valid compilations. Retry and resume
never silently switch the selected result or reuse an earlier chat's completion.
"""
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from . import models
from .path_step_types import (
    administration_evidence,
    deep_dive_evidence,
    personal_result_qualifies,
    valid_scores,
    results_step,
    step_descriptor,
)
from .questionnaire_entry import result_payload


def payload(binding, result, step):
    return {
        "path_id": step.path_id,
        "step_id": step.id,
        "results_step_id": step.results_step_id,
        "session_id": binding.session_id,
        "started_at": binding.started_at.isoformat(),
        "result": result_payload(result),
    }


def bound_result(db, step, username):
    source = results_step(db, step)
    # A new compilation should feed the next analysis, not the oldest result.
    evidence = list(administration_evidence(db, source, username)) if source else []
    evidence = evidence[-1] if evidence else None
    return db.get(models.QuestionnaireResult, evidence["result_id"]) if evidence else None


def existing_binding(db, step, username, result=None):
    query = db.query(models.ClassPathDeepDiveSession).filter_by(step_id=step.id, username=username)
    if not step.tool_key:
        if result is None:
            return None
        query = query.filter_by(result_id=result.id)
    for binding in query.order_by(models.ClassPathDeepDiveSession.id.desc()):
        bound = db.get(models.QuestionnaireResult, binding.result_id)
        # Obsolete QPCC profiles remain historical records; a new canonical
        # compilation can start its own analysis without replacing that history.
        if bound and bound.questionnaire_type == "QPCC" and not valid_scores(db, "QPCC", bound.scores):
            continue
        return binding
    return None


def deep_dive_options(db, identity, path_id, step_id):
    from .routes.class_paths import require_step_launch

    path, step, _ = require_step_launch(db, identity, path_id, step_id)
    if step.step_type != "guided_results_chat":
        raise HTTPException(422, "results_chat_step_required")
    username = identity["username"]
    result = None if step.tool_key else bound_result(db, step, username)
    binding = existing_binding(db, step, username, result)
    if binding and step.tool_key:
        result = db.get(models.QuestionnaireResult, binding.result_id)
        if not personal_result_qualifies(db, step, username, result):
            raise HTTPException(409, "results_chat_result_invalid")
    candidates = []
    if step.tool_key:
        rows = (db.query(models.QuestionnaireResult)
                .filter_by(username=username, questionnaire_type=step.tool_key)
                .order_by(models.QuestionnaireResult.submitted_at.desc(), models.QuestionnaireResult.id.desc()))
        candidates = [{"id": row.id, "submitted_at": row.submitted_at.isoformat(), "locale": row.locale or ""}
                      for row in rows if personal_result_qualifies(db, step, username, row)]
    source = results_step(db, step)
    attempts = []
    for previous in db.query(models.ClassPathDeepDiveSession).filter_by(step_id=step.id, username=username).order_by(models.ClassPathDeepDiveSession.id.desc()):
        previous_result = db.get(models.QuestionnaireResult, previous.result_id)
        if previous_result:
            attempts.append({**payload(previous, previous_result, step),
                             "completed": bool(deep_dive_evidence(db, step, username, session_id=previous.session_id)),
                             "resumable": bool(db.query(models.FrozenSession.id).filter_by(username=username, session_id=previous.session_id).first()),
                             "has_turns": bool(db.query(models.Log.id).filter_by(username=username, session_id=previous.session_id).first())})
    legacy_profile = False
    for previous in db.query(models.ClassPathDeepDiveSession).filter_by(step_id=step.id, username=username):
        previous_result = db.get(models.QuestionnaireResult, previous.result_id)
        if previous_result and previous_result.questionnaire_type == "QPCC" and not valid_scores(db, "QPCC", previous_result.scores):
            legacy_profile = True
            break
    return {
        "legacy_profile": legacy_profile and not binding,
        "personal": bool(step.tool_key),
        "results": candidates,
        "session": payload(binding, result, step) if binding and result else None,
        "attempts": attempts,
        "completed": bool(binding and result and deep_dive_evidence(db, step, username, session_id=binding.session_id)),
        "ready": bool(result) if not step.tool_key else bool(candidates),
        "source_href": step_descriptor(db, path, source)["start_href"] if source else f"/?start={step.tool_key}",
    }


def start_results_deep_dive(db, identity, path_id, step_id, result_id=None, attempt_id=None):
    from .routes.class_paths import require_step_launch

    # Serialize starts (including a racing different selection) under the path lock.
    _, step, _ = require_step_launch(db, identity, path_id, step_id, for_update=True)
    if step.step_type != "guided_results_chat":
        raise HTTPException(422, "results_chat_step_required")
    username = identity["username"]
    if attempt_id:
        replay = db.query(models.ClassPathDeepDiveSession).filter_by(session_id=attempt_id).first()
        if replay:
            if replay.step_id != step.id or replay.username != username or (result_id is not None and result_id != replay.result_id):
                raise HTTPException(409, "results_chat_attempt_conflict")
            return payload(replay, db.get(models.QuestionnaireResult, replay.result_id), step)
    result = None if step.tool_key else bound_result(db, step, username)
    binding = existing_binding(db, step, username, result)
    if step.tool_key:
        if binding:
            if result_id is not None and result_id != binding.result_id:
                raise HTTPException(409, "results_chat_result_conflict")
            result = db.get(models.QuestionnaireResult, binding.result_id)
        elif result_id is None:
            raise HTTPException(409, "results_selection_required")
        else:
            result = db.get(models.QuestionnaireResult, result_id)
        if not personal_result_qualifies(db, step, username, result):
            raise HTTPException(422, "results_chat_result_invalid")
    elif result_id is not None:
        # A plan source cannot be replaced with a personal or different result.
        raise HTTPException(422, "results_chat_result_invalid")
    if result is None:
        raise HTTPException(409, "results_step_incomplete")
    if binding and not attempt_id:
        return payload(binding, result, step)
    binding = models.ClassPathDeepDiveSession(
        step_id=step.id, username=username, result_id=result.id,
        session_id=attempt_id or str(uuid.uuid4()), started_at=datetime.now(UTC),
    )
    try:
        db.add(binding)
        db.commit()
    except IntegrityError:
        db.rollback()
        binding = (db.query(models.ClassPathDeepDiveSession)
                   .filter_by(session_id=attempt_id).first()) if attempt_id else existing_binding(db, step, username, result)
        if not binding or binding.step_id != step.id or binding.username != username or binding.result_id != result.id:
            raise HTTPException(409, "results_chat_attempt_conflict")
    except Exception:
        db.rollback()
        raise
    return payload(binding, result, step)
