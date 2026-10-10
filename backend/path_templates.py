"""Path templates (#172): abstract steps, application to classes or groups and
creation of the class objects when an applied path is published.

A template never names class objects. Applying it copies its steps into a draft
class path: tool steps are copied as they are, while questionnaires, assignments,
discussions and deep dives become `pending` steps that keep the template config.
Publication creates every described object in the same transaction, so students
see nothing of a path until it goes live, and a blocked publication leaves no
administration, assignment or discussion behind.
"""
from fastapi import HTTPException
from sqlalchemy.orm import Session

from . import models
from .class_tools import ALWAYS_ON, PERSONAL_TOOL_KEYS

TEMPLATE_STEP_TYPES = ("tool", "questionnaire_administration", "guided_results_chat", "assignment", "forum")


def template_tool_available(db: Session, tool_key: str) -> bool:
    """Without a class: personal tools and active student instruments."""
    if tool_key in PERSONAL_TOOL_KEYS:
        return True
    if tool_key in ALWAYS_ON:
        return False
    instrument = db.query(models.Instrument).filter_by(code=tool_key).first()
    return bool(instrument and instrument.is_active and instrument.target_audience == "student")


def template_goal_available(db: Session, goal_id: int) -> bool:
    # A template serves any class: only goals of the common catalog qualify.
    row = db.get(models.GoalCatalogEntry, goal_id)
    return bool(row and row.status == "published" and row.group_id is None)


def step_config(db: Session, steps) -> list[dict]:
    """Validate abstract template steps and return their stored form."""
    stored = []
    for index, value in enumerate(steps):
        if value.step_type == "tool":
            if not template_tool_available(db, value.tool_key):
                raise HTTPException(422, "template_tool_unavailable")
            config = {}
        elif value.step_type == "questionnaire_administration":
            config = {"instrument_code": value.instrument_code, "locale": value.locale, "plan_title": value.plan_title}
        elif value.step_type == "guided_results_chat":
            source = value.results_position - 1
            if source >= index or steps[source].step_type != "questionnaire_administration":
                raise HTTPException(422, "results_step_order")
            if any(other.step_type == "guided_results_chat" and other.results_position == value.results_position
                   for other in steps[:index]):
                raise HTTPException(422, "duplicate_results_chat")
            config = {"results_position": value.results_position}
        elif value.step_type == "assignment":
            if not template_goal_available(db, value.goal_id):
                raise HTTPException(422, "template_goal_unavailable")
            config = {"goal_id": value.goal_id, "attachments": [item.model_dump() for item in value.attachments],
                      "instructions": value.assignment_instructions, "intent": value.intent,
                      "response_prompt": value.response_prompt, "language": value.language}
        else:
            config = {"title": value.topic_title, "body": value.topic_body}
        stored.append({"id": value.id, "step_type": value.step_type, "tool_key": getattr(value, "tool_key", None),
                       "config": config, "title": (value.title or "").strip() or None,
                       "instructions": (value.instructions or "").strip() or None})
    return stored


def template_steps(db: Session, template_id: int) -> list[models.PathTemplateStep]:
    return (db.query(models.PathTemplateStep).filter_by(template_id=template_id)
            .order_by(models.PathTemplateStep.position, models.PathTemplateStep.id).all())


def replace_template_steps(db: Session, template: models.PathTemplate, values: list[dict]) -> None:
    """Keep step ids the client sends back, so applied paths keep their origin step."""
    existing = {row.id: row for row in template_steps(db, template.id)}
    kept = set()
    for position, value in enumerate(values, start=1):
        row = existing.get(value["id"]) if value["id"] else None
        if value["id"] and row is None:
            raise HTTPException(422, "template_step_mismatch")
        if row is None:
            row = models.PathTemplateStep(template_id=template.id)
            db.add(row)
        else:
            kept.add(row.id)
        row.position, row.step_type, row.title, row.instructions = position, value["step_type"], value["title"], value["instructions"]
        row.config = {**value["config"], **({"tool_key": value["tool_key"]} if value["step_type"] == "tool" else {})}
    for step_id, row in existing.items():
        if step_id not in kept:
            # Applied paths keep their copies; their origin link becomes empty.
            db.query(models.ClassPathStep).filter_by(template_step_id=step_id).update({"template_step_id": None})
            db.delete(row)
    db.flush()


def from_class_path(db: Session, path: models.ClassPath) -> list[dict]:
    """Abstract steps of an existing class path, for «Save as template»."""
    from .routes.class_paths import _active_steps
    steps = _active_steps(db, path.id)
    position = {step.id: index for index, step in enumerate(steps, start=1)}
    values = []
    for step in steps:
        kind, config = step.step_type, dict(step.pending_config or {})
        if kind == "pending":
            kind = config.pop("kind")
            if kind == "guided_results_chat":
                config = {"results_position": position.get(config.get("results_step_id"))}
        elif kind == "questionnaire_administration":
            plan = db.get(models.AdministrationPlan, step.administration_plan_id)
            config = {"instrument_code": plan.instrument_code, "locale": plan.locale, "plan_title": plan.title}
        elif kind == "guided_results_chat":
            config = {"results_position": position.get(step.results_step_id)}
        elif kind == "assignment":
            row = db.get(models.TeacherAssignment, step.assignment_id)
            settings = db.get(models.AssignmentLearningSettings, row.id)
            config = {"goal_id": row.source_id,
                      "attachments": [{"source_kind": item["kind"], "source_id": item["source_id"]} for item in row.attachments or []],
                      "instructions": row.instructions or "", "intent": settings.intent if settings else "proposal",
                      "response_prompt": settings.response_prompt if settings else "",
                      "language": (row.snapshot or {}).get("language") or "it"}
        elif kind == "forum":
            # Forum text never leaves the forum: reuse the origin template's text, if any.
            origin = db.get(models.PathTemplateStep, step.template_step_id) if step.template_step_id else None
            if origin is None or origin.step_type != "forum":
                raise HTTPException(409, {"code": "template_forum_unavailable", "position": position[step.id]})
            config = {"title": origin.config["title"], "body": origin.config["body"]}
        elif kind == "tool":
            config = {"tool_key": step.tool_key}
        if kind == "guided_results_chat" and not config["results_position"]:
            raise HTTPException(409, "results_step_unavailable")
        values.append({"id": None, "step_type": kind, "tool_key": step.tool_key if kind == "tool" else None,
                       "config": {k: v for k, v in config.items() if k != "tool_key"},
                       "title": step.title, "instructions": step.instructions})
    return values


def apply_template(db: Session, template: models.PathTemplate, group: models.StudentGroup, username: str) -> models.ClassPath:
    """A draft copy for one class or group; class objects wait for publication."""
    from .routes.class_paths import get_class_enabled_tool_keys
    rows = template_steps(db, template.id)
    enabled = get_class_enabled_tool_keys(db, group.id)
    disabled = [row.position for row in rows if row.step_type == "tool" and row.config.get("tool_key") not in enabled]
    if disabled:
        raise HTTPException(409, {"code": "template_tool_disabled_for_class", "group_id": group.id, "positions": disabled})
    path = models.ClassPath(group_id=group.id, title=template.title, description=template.description,
                            mode=template.mode, status="draft", created_by=username, revision=1,
                            template_id=template.id, template_revision=template.revision)
    db.add(path)
    db.flush()
    created = {}
    for row in rows:
        config = dict(row.config or {})
        step = models.ClassPathStep(path_id=path.id, position=row.position, title=row.title,
                                    instructions=row.instructions, template_step_id=row.id)
        if row.step_type == "tool":
            step.step_type, step.tool_key = "tool", config["tool_key"]
        else:
            if row.step_type == "guided_results_chat":
                config = {"results_step_id": created[config["results_position"]].id}
            step.step_type, step.pending_config = "pending", {"kind": row.step_type, **config}
        db.add(step)
        db.flush()
        created[row.position] = step
    return path


def materialize_pending(db: Session, path: models.ClassPath, steps: list[models.ClassPathStep], identity) -> list[dict]:
    """Create the class objects of pending steps; returns the steps that could not be prepared."""
    from .routes.administration_plans import build_class_administration
    from .routes.assignments import build_path_assignment
    from .routes.forum import create_path_topic
    group = db.get(models.StudentGroup, path.group_id)
    problems = []
    for step in steps:
        if step.step_type != "pending":
            continue
        config = step.pending_config or {}
        kind = config.get("kind")
        try:
            if kind == "questionnaire_administration":
                plan = build_class_administration(
                    db, identity, group, title=config.get("plan_title") or path.title,
                    instrument_code=config["instrument_code"], locale=config["locale"])
                step.administration_plan_id = plan.id
            elif kind == "guided_results_chat":
                source = db.get(models.ClassPathStep, config.get("results_step_id"))
                if (not source or source.path_id != path.id or source.removed_at is not None
                        or source.step_type != "questionnaire_administration"):
                    raise HTTPException(409, "results_step_unavailable")
                step.results_step_id = source.id
            elif kind == "assignment":
                step.assignment_id = build_path_assignment(db, identity, group, config).id
            elif kind == "forum":
                step.topic_id = create_path_topic(db, group.id, identity, config["title"], config["body"])
            else:
                raise HTTPException(422, "pending_step_invalid")
        except HTTPException as error:
            detail = error.detail if isinstance(error.detail, str) else "pending_step_invalid"
            problems.append({"step_id": step.id, "position": step.position, "step_type": kind, "reason": detail})
            continue
        step.step_type, step.pending_config = kind, None
        db.flush()
    return problems
