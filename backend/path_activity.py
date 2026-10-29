"""One student-facing state and navigation contract for operational activities."""
from datetime import datetime, timezone
from uuid import uuid4
from urllib.parse import urlencode

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from . import models
from .path_step_types import administration_evidence, deep_dive_evidence, is_guided_chat_key


def activity_kind(db, step):
    if step.step_type == "guided_results_chat":
        return "analysis"
    if step.step_type == "questionnaire_administration":
        return "questionnaire"
    if step.step_type == "guided_chat" or (step.step_type == "tool" and is_guided_chat_key(db, step.tool_key)):
        return "chat"
    return step.step_type


def activity_href(step):
    return f"/profilo/piani-operativi/{step.path_id}/{step.id}"


def remember_saved_chat_attempt(db, identity, snapshot):
    """Keep an explicit legacy plan binding when its completed pause is deleted."""
    from .routes.class_paths import require_step_launch
    data = snapshot.data or {}
    if not data.get("path_id") or not data.get("path_step_id"):
        return
    if db.query(models.ClassPathActivityAttempt.id).filter_by(session_id=snapshot.session_id).first():
        return
    try:
        _, step, descriptor = require_step_launch(db, identity, data["path_id"], data["path_step_id"])
    except HTTPException:
        # Discarding one's own saved pause remains possible after leaving a class.
        return
    if activity_kind(db, step) != "chat" or snapshot.questionnaire_type != descriptor["instrument_code"]:
        return
    result = db.query(models.QuestionnaireResult).filter_by(session_id=snapshot.session_id,
                username=identity["username"], questionnaire_type=snapshot.questionnaire_type).first()
    if not result:
        return
    db.add(models.ClassPathActivityAttempt(step_id=step.id, username=identity["username"],
           session_id=snapshot.session_id, started_at=snapshot.created_at or datetime.now(timezone.utc)))


def _completed_chat(db, username, session_id, instrument):
    return bool(db.query(models.Log.id).filter_by(
        username=username, session_id=session_id, questionnaire_type=instrument, action="guided_chat_completed").first())


def activity_attempts(db, step, username):
    """Adapt immutable historical bindings without assigning by instrument name."""
    kind = activity_kind(db, step)
    if kind not in ("chat", "analysis", "questionnaire"):
        return []
    found = {}
    base = activity_href(step)

    def add(sid, at, completed, *, draft=None, revision=0, result=None):
        from .questionnaire_entry import result_payload
        frozen = db.query(models.FrozenSession).filter_by(username=username, session_id=sid).first()
        has_turns = bool(db.query(models.Log.id).filter_by(username=username, session_id=sid).first())
        found[sid] = {
            "session_id": sid, "started_at": at.isoformat() if at else None,
            "state": "completed" if completed else "in_progress",
            "resumable": not completed and (kind == "questionnaire" or bool(frozen) or not has_turns),
            "href": f"{base}?{urlencode({'attempt': sid})}" + ("&review=1" if completed else ""),
            "draft": draft, "revision": revision,
            "result_id": result.id if result else None,
            "result": result_payload(result) if result else None,
        }

    if kind == "analysis":
        for binding in db.query(models.ClassPathDeepDiveSession).filter_by(step_id=step.id, username=username):
            result = db.get(models.QuestionnaireResult, binding.result_id)
            if result:
                add(binding.session_id, binding.started_at,
                    bool(deep_dive_evidence(db, step, username, session_id=binding.session_id)), result=result)
    elif kind == "questionnaire":
        for evidence in administration_evidence(db, step, username):
            result = db.get(models.QuestionnaireResult, evidence["result_id"])
            if result:
                add(result.session_id, result.submitted_at, True, result=result)
    else:
        # Compatibility: only explicit plan origin can associate an older chat.
        for frozen in db.query(models.FrozenSession).filter_by(username=username):
            data = frozen.data or {}
            if (data.get("path_id") == step.path_id and data.get("path_step_id") == step.id
                    and frozen.questionnaire_type == step.tool_key and not data.get("practice_notebook_id")):
                add(frozen.session_id, frozen.created_at, _completed_chat(db, username, frozen.session_id, step.tool_key))

    for row in db.query(models.ClassPathActivityAttempt).filter_by(step_id=step.id, username=username):
        previous = found.get(row.session_id)
        completed = previous and previous["state"] == "completed"
        if kind == "chat":
            completed = _completed_chat(db, username, row.session_id, step.tool_key)
        add(row.session_id, row.started_at, bool(completed), draft=row.draft, revision=row.revision)
        if previous:
            found[row.session_id]["result_id"] = previous["result_id"]
            found[row.session_id]["result"] = previous["result"]
    return sorted(found.values(), key=lambda row: (row["started_at"] or "", row["session_id"]), reverse=True)


def student_activity(db, path, step, username, descriptor, *, include_data=False):
    kind = activity_kind(db, step)
    attempts = activity_attempts(db, step, username)
    current = attempts[0] if attempts else None
    if not include_data:
        attempts = [{key: value for key, value in item.items() if key not in ("draft", "result")} for item in attempts]
        current = attempts[0] if attempts else None
    base = activity_href(step)
    if kind in ("chat", "analysis", "questionnaire"):
        label = "resume" if current and current["state"] == "in_progress" else "review" if current else "start"
        primary = {"label": label, "href": current["href"] if current else base}
        repeat = {"label": "newCompilation" if kind == "questionnaire" else "anotherAttempt", "href": f"{base}?attempt=new"} if current else None
    else:
        primary = {"label": "openDiscussion" if kind == "forum" else "open", "href": descriptor["start_href"]} if descriptor["start_href"] else None
        repeat = None
        if kind == "assignment":
            work = db.query(models.AssignmentWork).filter_by(assignment_id=step.assignment_id, username=username).first()
            if work:
                primary["label"] = "review" if work.submission else "resume"
                if work.submission:
                    repeat = {"label": "anotherAttempt", "href": descriptor["start_href"].replace("#", "?attempt=new#", 1)}
    choices = []
    if kind == "analysis" and step.tool_key and not current:
        from .path_step_types import personal_result_qualifies
        choices = [{"id": result.id, "submitted_at": result.submitted_at.isoformat(), "locale": result.locale}
                   for result in db.query(models.QuestionnaireResult).filter_by(username=username, questionnaire_type=step.tool_key)
                   .order_by(models.QuestionnaireResult.submitted_at.desc())
                   if personal_result_qualifies(db, step, username, result)]
    return {"kind": kind, "instrument_code": descriptor["instrument_code"], "current": current,
            "attempts": attempts, "primary": primary, "repeat": repeat, "choices": choices}


def start_attempt(db, identity, path_id, step_id, attempt_id=None, *, new_attempt=False):
    from .routes.class_paths import require_step_launch
    _, step, descriptor = require_step_launch(db, identity, path_id, step_id, for_update=True)
    kind = activity_kind(db, step)
    if kind not in ("chat", "questionnaire"):
        raise HTTPException(422, "activity_attempt_not_supported")
    username = identity["username"]
    sid = str(attempt_id or uuid4())
    existing = db.query(models.ClassPathActivityAttempt).filter_by(session_id=sid).first()
    if existing:
        if existing.username != username or existing.step_id != step.id:
            raise HTTPException(409, "activity_attempt_conflict")
        return next(row for row in activity_attempts(db, step, username) if row["session_id"] == sid)
    if not new_attempt:
        previous = activity_attempts(db, step, username)
        if previous:
            return previous[0]
    # A client UUID cannot claim a different activity's transcript or result.
    if any(db.query(model.id).filter_by(session_id=sid).first() for model in (
            models.QuestionnaireResult, models.ClassPathDeepDiveSession, models.FrozenSession, models.Log)):
        raise HTTPException(409, "activity_attempt_conflict")
    row = models.ClassPathActivityAttempt(step_id=step.id, username=username, session_id=sid,
                                         started_at=datetime.now(timezone.utc), draft={})
    db.add(row)
    if kind == "chat":
        db.add(models.QuestionnaireResult(session_id=sid, username=username,
               questionnaire_type=descriptor["instrument_code"], scores={}, locale=identity.get("locale", "it")))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(models.ClassPathActivityAttempt).filter_by(session_id=sid).first()
        if not existing or existing.username != username or existing.step_id != step.id:
            raise HTTPException(409, "activity_attempt_conflict")
    return next(item for item in activity_attempts(db, step, username) if item["session_id"] == sid)


def save_draft(db, identity, path_id, step_id, session_id, revision, data):
    from .routes.class_paths import require_step_launch
    _, step, _ = require_step_launch(db, identity, path_id, step_id, for_update=True)
    if activity_kind(db, step) != "questionnaire":
        raise HTTPException(422, "questionnaire_step_required")
    row = db.query(models.ClassPathActivityAttempt).filter_by(
        session_id=session_id, step_id=step.id, username=identity["username"]).first()
    if not row:
        raise HTTPException(404, "activity_attempt_not_found")
    attempt = next(item for item in activity_attempts(db, step, identity["username"]) if item["session_id"] == session_id)
    if attempt["state"] == "completed":
        raise HTTPException(409, "activity_attempt_completed")
    if row.revision == revision + 1 and row.draft == data:
        return {"revision": row.revision}  # A response lost after a committed save.
    updated = db.query(models.ClassPathActivityAttempt).filter_by(id=row.id, revision=revision).update(
        {"draft": data, "revision": revision + 1}, synchronize_session=False)
    if not updated:
        raise HTTPException(409, "activity_draft_conflict")
    db.commit()
    return {"revision": revision + 1}
