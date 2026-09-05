"""Persist message diagrams with the session, independently of browser snapshots."""
import json
import hashlib

from fastapi import HTTPException
from sqlalchemy.orm import Session

from . import models, pii
from .diagram_render import DiagramSpec, parse_spec, DiagramSpecError

ACTION = "message_diagram"


def session_questionnaire(db: Session, session_id: str | None) -> str | None:
    """Read only after session ownership has been checked by the caller."""
    if not session_id:
        return None
    result = db.query(models.QuestionnaireResult.questionnaire_type).filter(
        models.QuestionnaireResult.session_id == session_id,
    ).first()
    if not result:
        result = db.query(models.FrozenSession.questionnaire_type).filter(
            models.FrozenSession.session_id == session_id,
        ).first()
    return result[0] if result else None


def session_owner(db: Session, session_id: str, identity: dict) -> str:
    username = identity.get("username") or ""
    if not username:
        raise HTTPException(401, "Authentication required")
    result = db.query(models.QuestionnaireResult).filter(
        models.QuestionnaireResult.session_id == session_id,
    ).first()
    if result:
        if result.username != username and not identity.get("is_admin"):
            raise HTTPException(403, "Session belongs to another user")
        return result.username or username
    frozen = db.query(models.FrozenSession).filter(
        models.FrozenSession.session_id == session_id,
        models.FrozenSession.username == username,
    ).first()
    chat = db.query(models.Log.id).filter(
        models.Log.session_id == session_id, models.Log.username == username,
        models.Log.action == "chat_message",
    ).first() if not frozen else None
    if not frozen and not chat:
        raise HTTPException(404, "Session not found")
    return username


def save_diagram(db: Session, *, session_id: str, username: str,
                 source_text: str, instruction: str, spec: DiagramSpec) -> None:
    # Append revisions: a failed generation never overwrites a valid diagram.
    db.add(models.Log(
        action=ACTION, session_id=session_id, username=username,
        details={"source_text": pii.redact(source_text.strip()),
                 "source_key": hashlib.sha256(source_text.strip().encode()).hexdigest(),
                 "instruction": pii.redact(instruction),
                 "spec": json.loads(pii.redact(json.dumps(spec.model_dump(by_alias=True, exclude_none=True))))},
    ))
    db.commit()


def list_diagrams(db: Session, session_id: str, username: str | None = None) -> list[dict]:
    questionnaire_type = session_questionnaire(db, session_id)
    query = db.query(models.Log).filter(
        models.Log.action == ACTION, models.Log.session_id == session_id,
    )
    if username is not None:
        query = query.filter(models.Log.username == username)
    latest = {}
    for row in query.order_by(models.Log.id.asc()).all():
        details = row.details or {}
        source = details.get("source_text")
        if not isinstance(source, str) or not source.strip():
            continue
        try:
            spec = parse_spec(details.get("spec") or {}, questionnaire_type=questionnaire_type)
        except DiagramSpecError:
            continue
        key = details.get("source_key") or hashlib.sha256(source.strip().encode()).hexdigest()
        latest[key] = {
            "source_key": key,
            "source_text": source.strip(), "instruction": details.get("instruction", ""),
            "spec": spec.model_dump(by_alias=True, exclude_none=True),
        }
    return list(latest.values())


def attach_message_diagrams(db: Session, session_id: str, messages: list[dict]) -> list[dict]:
    diagrams = {item["source_text"]: item["spec"] for item in list_diagrams(db, session_id)}
    result = []
    for message in messages:
        text = message.get("text") or ""
        spec = diagrams.get(text.strip()) if message.get("role") == "counselor" else None
        result.append({**message, "text": text + "\n\n```diagram\n" + json.dumps(spec, ensure_ascii=False) + "\n```"} if spec else dict(message))
    return result
