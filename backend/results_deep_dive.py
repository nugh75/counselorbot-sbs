"""Bind questionnaire analysis to one result and a server-issued session (#249).

Plan sources keep their exact administration evidence. Personal sources require
an explicit selection from the student's valid compilations. Retry and resume
never silently switch the selected result or reuse an earlier chat's completion.
"""
import uuid
from datetime import UTC, datetime, timezone

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from . import models
from .path_step_types import (
    administration_evidence,
    deep_dive_evidence,
    personal_result_qualifies,
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
    evidence = next(administration_evidence(db, source, username), None) if source else None
    return db.get(models.QuestionnaireResult, evidence["result_id"]) if evidence else None


def existing_binding(db, step, username, result=None):
    query = db.query(models.ClassPathDeepDiveSession).filter_by(step_id=step.id, username=username)
    if not step.tool_key:
        if result is None:
            return None
        query = query.filter_by(result_id=result.id)
    return query.order_by(models.ClassPathDeepDiveSession.id).first()


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
    return {
        "personal": bool(step.tool_key),
        "results": candidates,
        "session": payload(binding, result, step) if binding and result else None,
        "completed": bool(binding and result and deep_dive_evidence(db, step, username)),
        "ready": bool(result) if not step.tool_key else bool(candidates),
        "source_href": step_descriptor(db, path, source)["start_href"] if source else f"/?start={step.tool_key}",
    }


def start_results_deep_dive(db, identity, path_id, step_id, result_id=None):
    from .routes.class_paths import require_step_launch

    # Serialize starts (including a racing different selection) under the path lock.
    _, step, _ = require_step_launch(db, identity, path_id, step_id, for_update=True)
    if step.step_type != "guided_results_chat":
        raise HTTPException(422, "results_chat_step_required")
    username = identity["username"]
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
    if binding:
        return payload(binding, result, step)
    binding = models.ClassPathDeepDiveSession(
        step_id=step.id, username=username, result_id=result.id,
        session_id=str(uuid.uuid4()), started_at=datetime.now(UTC),
    )
    try:
        db.add(binding)
        db.commit()
    except IntegrityError:
        db.rollback()
        binding = (db.query(models.ClassPathDeepDiveSession)
                   .filter_by(step_id=step.id, username=username, result_id=result.id).one())
    except Exception:
        db.rollback()
        raise
    return payload(binding, result, step)
