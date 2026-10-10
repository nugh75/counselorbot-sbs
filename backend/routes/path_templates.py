"""Path templates (#172): private to their author until shared as presets for every teacher."""
from datetime import datetime, timezone
from typing import Annotated, Literal, Optional, Union

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..path_step_types import ADMINISTRATION_QUESTIONNAIRES
from ..path_templates import (apply_template, from_class_path, replace_template_steps, step_config,
                              template_goal_available, template_steps, template_tool_available)
from .class_paths import _require_visible_group, _require_visible_path, _serialize_path
from .groups import _username

router = APIRouter()
get_db = database.get_db

Languages = Literal["it", "en", "es", "fr", "de", "sv"]


class TemplateStepFields(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    id: Optional[int] = Field(default=None, gt=0)
    title: Optional[str] = Field(default=None, max_length=200)
    instructions: Optional[str] = Field(default=None, max_length=3000)


class TemplateToolStep(TemplateStepFields):
    step_type: Literal["tool"]
    tool_key: str = Field(min_length=1, max_length=80)


class TemplateQuestionnaireStep(TemplateStepFields):
    step_type: Literal["questionnaire_administration"]
    instrument_code: Literal[tuple(sorted(ADMINISTRATION_QUESTIONNAIRES))]
    locale: Languages = "it"
    plan_title: str = Field(default="", max_length=200)


class TemplateResultsChatStep(TemplateStepFields):
    step_type: Literal["guided_results_chat"]
    results_position: int = Field(ge=1)


class TemplateAttachment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_kind: Literal["strategy", "reading"]
    source_id: int = Field(gt=0)


class TemplateAssignmentStep(TemplateStepFields):
    step_type: Literal["assignment"]
    goal_id: int = Field(gt=0)
    attachments: list[TemplateAttachment] = Field(default_factory=list, max_length=20)
    assignment_instructions: str = Field(default="", max_length=3000)
    intent: Literal["proposal", "requested"] = "proposal"
    response_prompt: str = Field(default="", max_length=1500)
    language: Languages = "it"


class TemplateForumStep(TemplateStepFields):
    step_type: Literal["forum"]
    topic_title: str = Field(min_length=1, max_length=160)
    topic_body: str = Field(min_length=1, max_length=4000)


TemplateStep = Annotated[
    Union[TemplateToolStep, TemplateQuestionnaireStep, TemplateResultsChatStep, TemplateAssignmentStep, TemplateForumStep],
    Field(discriminator="step_type"),
]


class TemplateWrite(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=3000)
    mode: Literal["recommended", "strict"] = "recommended"
    steps: list[TemplateStep] = Field(default_factory=list, max_length=100)


class TemplateUpdate(TemplateWrite):
    revision: int = Field(ge=1, strict=True)


class TemplateShare(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=1, strict=True)
    shared: bool


class TemplateApply(BaseModel):
    model_config = ConfigDict(extra="forbid")
    group_ids: list[Annotated[int, Field(gt=0)]] = Field(min_length=1, max_length=50)


def _visible(db: Session, identity):
    username = _username(identity) or ""
    return db.query(models.PathTemplate).filter(or_(
        models.PathTemplate.owner_username == username, models.PathTemplate.shared_at.isnot(None)))


def _require_template(db: Session, identity, template_id: int, *, owner=False, for_update=False) -> models.PathTemplate:
    query = _visible(db, identity).filter(models.PathTemplate.id == template_id)
    if for_update:
        query = query.populate_existing().with_for_update()
    row = query.first()
    # One answer for missing and invisible templates: no existence oracle.
    if row is None or (owner and row.owner_username != _username(identity)):
        raise HTTPException(404, "template_not_found")
    return row


def _step(db: Session, row: models.PathTemplateStep) -> dict:
    config = row.config or {}
    data = {"id": row.id, "position": row.position, "step_type": row.step_type,
            "title": row.title, "instructions": row.instructions}
    if row.step_type == "tool":
        data["tool_key"] = config.get("tool_key")
    elif row.step_type == "questionnaire_administration":
        data.update(instrument_code=config.get("instrument_code"), locale=config.get("locale"),
                    plan_title=config.get("plan_title") or "")
    elif row.step_type == "guided_results_chat":
        data["results_position"] = config.get("results_position")
    elif row.step_type == "assignment":
        goal = db.get(models.GoalCatalogEntry, config.get("goal_id"))
        data.update(goal_id=config.get("goal_id"), goal_title=(goal.data or {}).get("title") if goal else None,
                    attachments=config.get("attachments") or [], assignment_instructions=config.get("instructions") or "",
                    intent=config.get("intent") or "proposal", response_prompt=config.get("response_prompt") or "",
                    language=config.get("language") or "it")
    elif row.step_type == "forum":
        data.update(topic_title=config.get("title"), topic_body=config.get("body"))
    return data


def _serialize(db: Session, row: models.PathTemplate, identity) -> dict:
    owner_name = db.query(models.UserDisplayName.display_name).filter_by(username=row.owner_username).scalar()
    return {"id": row.id, "title": row.title, "description": row.description, "mode": row.mode,
            "owner_username": row.owner_username, "owner_name": owner_name or row.owner_username,
            "is_owner": row.owner_username == _username(identity), "shared": row.shared_at is not None,
            "shared_at": row.shared_at.isoformat() if row.shared_at else None, "revision": row.revision,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            "steps": [_step(db, step) for step in template_steps(db, row.id)]}


def _create(db: Session, identity, payload: TemplateWrite | dict, values: list[dict]) -> models.PathTemplate:
    data = payload if isinstance(payload, dict) else payload.model_dump(include={"title", "description", "mode"})
    row = models.PathTemplate(owner_username=_username(identity) or "", title=data["title"],
                              description=(data.get("description") or "").strip() or None,
                              mode=data["mode"], revision=1)
    db.add(row)
    db.flush()
    replace_template_steps(db, row, values)
    return row


@router.get("/teacher/path-templates")
def list_templates(identity=Depends(auth.get_current_plan_manager), db: Session = Depends(get_db)):
    username = _username(identity)
    rows = _visible(db, identity).order_by(models.PathTemplate.title, models.PathTemplate.id).all()
    return {"mine": [_serialize(db, row, identity) for row in rows if row.owner_username == username],
            "shared": [_serialize(db, row, identity) for row in rows if row.owner_username != username]}


@router.post("/teacher/path-templates", status_code=201)
def create_template(payload: TemplateWrite, identity=Depends(auth.get_current_plan_manager),
                    db: Session = Depends(get_db)):
    row = _create(db, identity, payload, step_config(db, payload.steps))
    db.commit()
    return _serialize(db, row, identity)


@router.get("/teacher/path-templates/{template_id}")
def get_template(template_id: int, identity=Depends(auth.get_current_plan_manager), db: Session = Depends(get_db)):
    return _serialize(db, _require_template(db, identity, template_id), identity)


@router.put("/teacher/path-templates/{template_id}")
def update_template(template_id: int, payload: TemplateUpdate, identity=Depends(auth.get_current_plan_manager),
                    db: Session = Depends(get_db)):
    row = _require_template(db, identity, template_id, owner=True, for_update=True)
    if payload.revision != row.revision:
        raise HTTPException(409, "template_revision_conflict")
    values = step_config(db, payload.steps)
    row.title, row.mode = payload.title, payload.mode
    row.description = (payload.description or "").strip() or None
    replace_template_steps(db, row, values)
    row.revision += 1
    db.commit()
    return _serialize(db, row, identity)


@router.post("/teacher/path-templates/{template_id}/share")
def share_template(template_id: int, payload: TemplateShare, identity=Depends(auth.get_current_plan_manager),
                   db: Session = Depends(get_db)):
    row = _require_template(db, identity, template_id, owner=True, for_update=True)
    if payload.revision != row.revision:
        raise HTTPException(409, "template_revision_conflict")
    # Shared presets are immediately available to every teacher (no admin review).
    row.shared_at = (row.shared_at or datetime.now(timezone.utc)) if payload.shared else None
    row.revision += 1
    db.commit()
    return _serialize(db, row, identity)


@router.delete("/teacher/path-templates/{template_id}")
def delete_template(template_id: int, identity=Depends(auth.get_current_plan_manager), db: Session = Depends(get_db)):
    row = _require_template(db, identity, template_id, owner=True, for_update=True)
    # Applied paths are copies: they stay, only their origin link becomes empty.
    step_ids = [step.id for step in template_steps(db, row.id)]
    if step_ids:
        db.query(models.ClassPathStep).filter(models.ClassPathStep.template_step_id.in_(step_ids)).update(
            {"template_step_id": None}, synchronize_session=False)
    db.query(models.ClassPath).filter_by(template_id=row.id).update({"template_id": None}, synchronize_session=False)
    db.delete(row)
    db.commit()
    return {"ok": True, "deleted": template_id}


@router.post("/teacher/path-templates/{template_id}/copy", status_code=201)
def copy_template(template_id: int, identity=Depends(auth.get_current_plan_manager), db: Session = Depends(get_db)):
    source = _require_template(db, identity, template_id)
    values = [{"id": None, "step_type": step.step_type, "tool_key": (step.config or {}).get("tool_key"),
               "config": {k: v for k, v in (step.config or {}).items() if k != "tool_key"},
               "title": step.title, "instructions": step.instructions} for step in template_steps(db, source.id)]
    row = _create(db, identity, {"title": source.title, "description": source.description, "mode": source.mode}, values)
    db.commit()
    return _serialize(db, row, identity)


@router.post("/teacher/paths/{path_id}/save-as-template", status_code=201)
def save_as_template(path_id: int, identity=Depends(auth.get_current_plan_manager), db: Session = Depends(get_db)):
    path = _require_visible_path(db, identity, path_id)
    values = from_class_path(db, path)
    for position, value in enumerate(values, start=1):
        # A template serves any class: class-only goals and retired tools cannot travel.
        if value["step_type"] == "tool" and not template_tool_available(db, value["tool_key"]):
            raise HTTPException(409, {"code": "template_tool_unavailable", "position": position})
        if value["step_type"] == "assignment" and not template_goal_available(db, value["config"]["goal_id"]):
            raise HTTPException(409, {"code": "template_goal_unavailable", "position": position})
    row = _create(db, identity, {"title": path.title, "description": path.description, "mode": path.mode}, values)
    db.commit()
    return _serialize(db, row, identity)


@router.post("/teacher/path-templates/{template_id}/apply", status_code=201)
def apply(template_id: int, payload: TemplateApply, identity=Depends(auth.get_current_plan_manager),
          db: Session = Depends(get_db)):
    template = _require_template(db, identity, template_id)
    groups = [_require_visible_group(db, identity, group_id, for_update=True)
              for group_id in dict.fromkeys(payload.group_ids)]
    paths = [apply_template(db, template, group, _username(identity) or "") for group in groups]
    db.commit()
    return [_serialize_path(db, path) for path in paths]
