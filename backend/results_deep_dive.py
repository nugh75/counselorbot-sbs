"""Bind a server-issued guided session to the result of an earlier administration.

The deep dive reuses the administration step's own completion evidence: the
first qualifying result is the bound one. Starting again returns the same
session (resume/retry), and only that session's final guided-turn marker
completes the step (`path_step_types.deep_dive_evidence`).
"""

import uuid
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from . import models
from .path_step_types import administration_evidence, results_step
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


def start_results_deep_dive(db, identity, path_id, step_id):
    from .routes.class_paths import require_step_launch

    # The path row lock serializes concurrent starts of the same student.
    _, step, _ = require_step_launch(db, identity, path_id, step_id, for_update=True)
    if step.step_type != "guided_results_chat":
        raise HTTPException(422, "results_chat_step_required")
    username = identity["username"]
    source = results_step(db, step)
    bound = next(administration_evidence(db, source, username), None) if source else None
    if bound is None:
        raise HTTPException(409, "results_step_incomplete")
    result = db.get(models.QuestionnaireResult, bound["result_id"])
    binding = (
        db.query(models.ClassPathDeepDiveSession)
        .filter_by(step_id=step.id, username=username, result_id=result.id)
        .first()
    )
    if binding:
        return payload(binding, result, step)
    binding = models.ClassPathDeepDiveSession(
        step_id=step.id,
        username=username,
        result_id=result.id,
        # Server-issued: no earlier chat turn or final marker can share it.
        session_id=str(uuid.uuid4()),
        started_at=datetime.now(timezone.utc),
    )
    try:
        db.add(binding)
        db.commit()
    except IntegrityError:
        db.rollback()
        binding = (
            db.query(models.ClassPathDeepDiveSession)
            .filter_by(step_id=step.id, username=username, result_id=result.id)
            .one()
        )
    except Exception:
        db.rollback()
        raise
    return payload(binding, result, step)
