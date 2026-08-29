"""Skill della chat: CRUD admin, mappa step, preview.

La preview e' lo strumento diagnostico principale: mostra quali skill si
attivano per uno step, con che testo, e il motivo di ogni esclusione (condizioni
non soddisfatte, componente spenta, budget esaurito, scelta del router).
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas
from ..skills import engine as skills_engine
from ..skills import handlers as skills_handlers

router = APIRouter()
get_db = database.get_db

_ALLOWED_ROUTING = {"always", "support", "primary", "optional"}
_ALLOWED_SLOTS = {"section", "knowledge", "directive_tail"}
_ALLOWED_STATUS = {"draft", "published"}


def _validate(payload_dict: dict) -> None:
    routing = payload_dict.get("routing")
    if routing is not None and routing not in _ALLOWED_ROUTING:
        raise HTTPException(status_code=400, detail=f"routing non valido: {routing}")
    slot = payload_dict.get("slot")
    if slot is not None and slot not in _ALLOWED_SLOTS:
        raise HTTPException(status_code=400, detail=f"slot non valido: {slot}")
    status = payload_dict.get("status")
    if status is not None and status not in _ALLOWED_STATUS:
        raise HTTPException(status_code=400, detail=f"status non valido: {status}")
    handler = payload_dict.get("handler")
    if handler and handler not in skills_handlers.handler_names():
        raise HTTPException(status_code=400, detail=f"handler sconosciuto: {handler}")


@router.get("/admin/skills", response_model=List[schemas.SkillResponse])
async def list_skills(
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.Skill)
        .order_by(models.Skill.sort_order.asc(), models.Skill.id.asc())
        .all()
    )


@router.get("/admin/skills/handlers")
async def list_handlers(
    current_user: models.User = Depends(auth.get_current_active_admin),
):
    return {"handlers": skills_handlers.handler_names()}


@router.post("/admin/skills", response_model=schemas.SkillResponse)
async def create_skill(
    payload: schemas.SkillCreate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    data = payload.model_dump()
    slug = (data.get("slug") or "").strip()
    if not slug:
        raise HTTPException(status_code=400, detail="slug obbligatorio")
    if db.query(models.Skill).filter(models.Skill.slug == slug).first():
        raise HTTPException(status_code=409, detail="slug gia' esistente")
    _validate(data)
    data["slug"] = slug
    skill = models.Skill(**data)
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill


@router.get("/admin/skills/step-map", response_model=schemas.StepSkillMap)
async def get_step_map(
    questionnaire_type: str,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(models.GuidedStepSkill)
        .filter(models.GuidedStepSkill.questionnaire_type == questionnaire_type)
        .order_by(models.GuidedStepSkill.sort_order.asc(), models.GuidedStepSkill.id.asc())
        .all()
    )
    return schemas.StepSkillMap(
        questionnaire_type=questionnaire_type,
        entries=[
            schemas.StepSkillEntry(
                questionnaire_type=row.questionnaire_type,
                step_id=row.step_id,
                skill_id=row.skill_id,
                sort_order=row.sort_order,
                enabled=row.enabled,
                override_params=row.override_params,
            )
            for row in rows
        ],
    )


@router.put("/admin/skills/step-map", response_model=schemas.StepSkillMap)
async def put_step_map(
    payload: schemas.StepSkillMap,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    questionnaire_type = payload.questionnaire_type
    skill_ids = {entry.skill_id for entry in payload.entries}
    known_skill_ids = {
        row[0]
        for row in db.query(models.Skill.id).filter(models.Skill.id.in_(skill_ids)).all()
    } if skill_ids else set()
    unknown_skill_ids = sorted(skill_ids - known_skill_ids)
    if unknown_skill_ids:
        raise HTTPException(
            status_code=400,
            detail=f"skill inesistenti: {', '.join(str(skill_id) for skill_id in unknown_skill_ids)}",
        )
    db.query(models.GuidedStepSkill).filter(
        models.GuidedStepSkill.questionnaire_type == questionnaire_type
    ).delete()
    for entry in payload.entries:
        db.add(models.GuidedStepSkill(
            questionnaire_type=questionnaire_type,
            step_id=entry.step_id,
            skill_id=entry.skill_id,
            sort_order=entry.sort_order,
            enabled=entry.enabled,
            override_params=entry.override_params,
        ))
    db.commit()
    return await get_step_map(questionnaire_type, current_user, db)


@router.put("/admin/skills/{skill_id}", response_model=schemas.SkillResponse)
async def update_skill(
    skill_id: int,
    payload: schemas.SkillUpdate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    skill = db.query(models.Skill).filter(models.Skill.id == skill_id).first()
    if skill is None:
        raise HTTPException(status_code=404, detail="skill non trovata")
    data = payload.model_dump(exclude_unset=True)
    nullable_fields = {"description", "instructions_i18n", "conditions", "handler", "handler_params"}
    invalid_nulls = sorted(key for key, value in data.items() if value is None and key not in nullable_fields)
    if invalid_nulls:
        raise HTTPException(status_code=400, detail=f"campi non annullabili: {', '.join(invalid_nulls)}")
    _validate(data)
    for key, value in data.items():
        setattr(skill, key, value)
    db.commit()
    db.refresh(skill)
    return skill


@router.delete("/admin/skills/{skill_id}")
async def delete_skill(
    skill_id: int,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    skill = db.query(models.Skill).filter(models.Skill.id == skill_id).first()
    if skill is None:
        raise HTTPException(status_code=404, detail="skill non trovata")
    bound = db.query(models.GuidedStepSkill).filter(models.GuidedStepSkill.skill_id == skill_id).count()
    if bound:
        raise HTTPException(status_code=409, detail=f"skill agganciata a {bound} step: sganciala prima")
    db.delete(skill)
    db.commit()
    return {"status": "deleted"}


@router.post("/admin/skills/preview", response_model=schemas.SkillPreviewResponse)
async def preview_skills(
    payload: schemas.SkillPreviewRequest,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    from ..ai_service import AIService

    step = (
        db.query(models.GuidedStep).filter(models.GuidedStep.id == payload.step_id).first()
        if payload.step_id
        else None
    )
    ctx = skills_engine.build_context(
        db,
        AIService(db),
        questionnaire_type=payload.questionnaire_type,
        step_id=payload.step_id,
        step_mode=step.system_prompt_mode if step else None,
        language=payload.language,
        query=payload.message,
        step_query=" ".join(
            part for part in (step.label if step else "", step.prompt if step else "", payload.message, payload.scores_context) if part
        ),
        message=payload.message,
        scores_context=payload.scores_context,
        component_flags={},
        handler_options={},
    )
    result = skills_engine.run_skills(ctx)
    return schemas.SkillPreviewResponse(
        engine_enabled=skills_engine.enabled(db, payload.questionnaire_type),
        intent=ctx.intent,
        blocks=result.blocks,
        ids=result.ids,
        trace=result.trace,
    )
