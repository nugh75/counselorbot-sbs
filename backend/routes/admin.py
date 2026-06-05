"""Endpoint admin + identità utente (/auth/me, /admin/*)."""
import os
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .. import models, schemas, auth, database
from ..ai_service import AIService
from ..training_dataset import (
    APPROVED_EXPORT_STATUSES,
    VALID_REVIEW_STATUSES,
    build_training_jsonl,
    generate_qsa_examples,
    training_query,
    training_summary,
)

router = APIRouter()
get_db = database.get_db


@router.get("/auth/me")
async def read_me(request: Request):
    """Identità dell'utente corrente verificata tramite ai4auth."""
    return await auth.get_identity(request)


# --- Admin Config Endpoints ---

@router.get("/admin/logs", response_model=List[schemas.LogResponse])
async def read_logs(skip: int = 0, limit: int = 100, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    logs = db.query(models.Log).order_by(models.Log.timestamp.desc()).offset(skip).limit(limit).all()
    return logs


@router.get("/admin/config", response_model=List[schemas.ConfigResponse])
async def read_config(current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    configs = db.query(models.Config).all()
    return configs


@router.post("/admin/config", response_model=schemas.ConfigResponse)
async def create_or_update_config(config: schemas.ConfigCreate, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    db_config = db.query(models.Config).filter(models.Config.key == config.key).first()
    if db_config:
        db_config.value = config.value
        db_config.description = config.description
    else:
        db_config = models.Config(key=config.key, value=config.value, description=config.description)
        db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return db_config


@router.get("/admin/models")
async def list_provider_models(provider: str = None, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    """Modelli realmente serviti dal provider (live). Vuoto se non interrogabile/irraggiungibile."""
    svc = AIService(db)
    return {"provider": provider or svc.config.get('active_provider', 'openai'),
            "models": svc.list_models(provider)}


@router.get("/admin/config/env-status")
async def get_env_override_status(current_user: models.User = Depends(auth.get_current_active_admin)):
    """Restituisce quali chiavi config sono sovrascritte da variabili d'ambiente."""
    from ..ai_service import ENV_KEY_MAP
    return {
        db_key: any(bool(os.environ.get(v)) for v in env_vars)
        for db_key, env_vars in ENV_KEY_MAP.items()
    }


# --- Admin Guided Steps CRUD ---

@router.get("/admin/guided-steps", response_model=List[schemas.GuidedStepResponse])
async def admin_list_guided_steps(current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    return db.query(models.GuidedStep).order_by(models.GuidedStep.sort_order).all()


@router.post("/admin/guided-steps", response_model=schemas.GuidedStepResponse)
async def admin_create_guided_step(step: schemas.GuidedStepCreate, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    existing = db.query(models.GuidedStep).filter(models.GuidedStep.id == step.id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Step with id '{step.id}' already exists")
    db_step = models.GuidedStep(**step.model_dump())
    db.add(db_step)
    db.commit()
    db.refresh(db_step)
    return db_step


@router.put("/admin/guided-steps/{step_id}", response_model=schemas.GuidedStepResponse)
async def admin_update_guided_step(step_id: str, update: schemas.GuidedStepUpdate, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    db_step = db.query(models.GuidedStep).filter(models.GuidedStep.id == step_id).first()
    if not db_step:
        raise HTTPException(status_code=404, detail="Step not found")
    update_data = update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_step, field, value)
    db.commit()
    db.refresh(db_step)
    return db_step


@router.delete("/admin/guided-steps/{step_id}")
async def admin_delete_guided_step(step_id: str, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    db_step = db.query(models.GuidedStep).filter(models.GuidedStep.id == step_id).first()
    if not db_step:
        raise HTTPException(status_code=404, detail="Step not found")
    db.delete(db_step)
    db.commit()
    return {"status": "success", "message": f"Step '{step_id}' deleted"}


@router.patch("/admin/guided-steps/reorder")
async def admin_reorder_guided_steps(items: List[schemas.ReorderItem], current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    for item in items:
        db_step = db.query(models.GuidedStep).filter(models.GuidedStep.id == item.id).first()
        if db_step:
            db_step.sort_order = item.sort_order
    db.commit()
    return {"status": "success"}


# --- Admin Training Dataset Review ---

@router.get("/admin/training-dataset/summary", response_model=schemas.TrainingSummaryResponse)
async def admin_training_summary(
    instrument_code: Optional[str] = Query(None),
    locale: Optional[str] = Query(None),
    phase: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    return training_summary(db, instrument_code, locale, phase, status)


@router.get("/admin/training-dataset/examples", response_model=List[schemas.TrainingExampleResponse])
async def admin_training_examples(
    instrument_code: Optional[str] = Query(None),
    locale: Optional[str] = Query(None),
    phase: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 50,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    return (
        training_query(db, instrument_code, locale, phase, status)
        .order_by(models.TrainingExample.created_at.desc(), models.TrainingExample.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.post("/admin/training-dataset/examples", response_model=schemas.TrainingExampleResponse)
async def admin_create_training_example(
    example: schemas.TrainingExampleCreate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    data = example.model_dump()
    if data.get("status") not in VALID_REVIEW_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid training example status")
    db_obj = models.TrainingExample(**data)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


@router.post("/admin/training-dataset/generate", response_model=List[schemas.TrainingExampleResponse])
async def admin_generate_training_examples(
    payload: schemas.TrainingGenerateRequest,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    if payload.instrument_code != "QSA":
        raise HTTPException(status_code=400, detail="Only QSA synthetic generation is available")
    return generate_qsa_examples(db, payload.locale, payload.phase, payload.count)


@router.patch("/admin/training-dataset/examples/{example_id}", response_model=schemas.TrainingExampleResponse)
async def admin_update_training_example(
    example_id: int,
    update: schemas.TrainingExampleUpdate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    db_obj = db.query(models.TrainingExample).filter(models.TrainingExample.id == example_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Training example not found")
    data = update.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in VALID_REVIEW_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid training example status")
    for field, value in data.items():
        setattr(db_obj, field, value)
    db.commit()
    db.refresh(db_obj)
    return db_obj


@router.delete("/admin/training-dataset/examples/{example_id}")
async def admin_delete_training_example(
    example_id: int,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    db_obj = db.query(models.TrainingExample).filter(models.TrainingExample.id == example_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Training example not found")
    db.delete(db_obj)
    db.commit()
    return {"status": "success"}


@router.get("/admin/training-dataset/export.jsonl")
async def admin_export_training_jsonl(
    instrument_code: Optional[str] = Query(None),
    locale: Optional[str] = Query(None),
    phase: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    if status:
        statuses = {status}
    else:
        statuses = APPROVED_EXPORT_STATUSES
    rows = (
        training_query(db, instrument_code, locale, phase)
        .filter(models.TrainingExample.status.in_(statuses))
        .order_by(models.TrainingExample.created_at.asc(), models.TrainingExample.id.asc())
        .all()
    )
    jsonl_text = build_training_jsonl(rows)
    suffix = "-".join(part for part in [instrument_code, locale, phase, status] if part)
    filename = f"training-dataset{('-' + suffix) if suffix else ''}.jsonl"
    return Response(
        content=jsonl_text,
        media_type="application/x-ndjson; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --- Admin Instruments / Factors / Items CRUD (catalogo editabile) ---

@router.get("/admin/instruments", response_model=List[schemas.InstrumentResponse])
async def admin_list_instruments(current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    return db.query(models.Instrument).order_by(models.Instrument.code).all()


@router.post("/admin/instruments", response_model=schemas.InstrumentResponse)
async def admin_create_instrument(instrument: schemas.InstrumentCreate, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    if db.query(models.Instrument).filter(models.Instrument.code == instrument.code).first():
        raise HTTPException(status_code=400, detail=f"Instrument '{instrument.code}' already exists")
    db_obj = models.Instrument(**instrument.model_dump())
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


@router.put("/admin/instruments/{code}", response_model=schemas.InstrumentResponse)
async def admin_update_instrument(code: str, update: schemas.InstrumentUpdate, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    db_obj = db.query(models.Instrument).filter(models.Instrument.code == code).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Instrument not found")
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(db_obj, field, value)
    db.commit()
    db.refresh(db_obj)
    return db_obj


@router.get("/admin/instruments/{code}/factors", response_model=List[schemas.FactorResponse])
async def admin_list_factors(code: str, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    return db.query(models.Factor).filter(models.Factor.instrument_code == code).order_by(models.Factor.sort_order).all()


@router.post("/admin/instruments/{code}/factors", response_model=schemas.FactorResponse)
async def admin_create_factor(code: str, factor: schemas.FactorCreate, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    data = factor.model_dump()
    data["instrument_code"] = code
    db_obj = models.Factor(**data)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


@router.put("/admin/factors/{factor_id}", response_model=schemas.FactorResponse)
async def admin_update_factor(factor_id: int, update: schemas.FactorUpdate, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    db_obj = db.query(models.Factor).filter(models.Factor.id == factor_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Factor not found")
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(db_obj, field, value)
    db.commit()
    db.refresh(db_obj)
    return db_obj


@router.delete("/admin/factors/{factor_id}")
async def admin_delete_factor(factor_id: int, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    db_obj = db.query(models.Factor).filter(models.Factor.id == factor_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Factor not found")
    db.delete(db_obj)
    db.commit()
    return {"status": "success"}


@router.get("/admin/instruments/{code}/items", response_model=List[schemas.ItemResponse])
async def admin_list_items(code: str, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    return db.query(models.QuestionnaireItem).filter(models.QuestionnaireItem.instrument_code == code).order_by(models.QuestionnaireItem.sort_order).all()


@router.post("/admin/instruments/{code}/items", response_model=schemas.ItemResponse)
async def admin_create_item(code: str, item: schemas.ItemCreate, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    data = item.model_dump()
    data["instrument_code"] = code
    db_obj = models.QuestionnaireItem(**data)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


@router.put("/admin/items/{item_id}", response_model=schemas.ItemResponse)
async def admin_update_item(item_id: int, update: schemas.ItemUpdate, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    db_obj = db.query(models.QuestionnaireItem).filter(models.QuestionnaireItem.id == item_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Item not found")
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(db_obj, field, value)
    db.commit()
    db.refresh(db_obj)
    return db_obj


@router.delete("/admin/items/{item_id}")
async def admin_delete_item(item_id: int, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    db_obj = db.query(models.QuestionnaireItem).filter(models.QuestionnaireItem.id == item_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(db_obj)
    db.commit()
    return {"status": "success"}


@router.get("/admin/instruments/{code}/norm-thresholds", response_model=List[schemas.NormThresholdResponse])
async def admin_list_norm_thresholds(code: str, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    return db.query(models.NormThreshold).filter(models.NormThreshold.instrument_code == code).all()


@router.post("/admin/instruments/{code}/norm-thresholds", response_model=schemas.NormThresholdResponse)
async def admin_create_norm_threshold(code: str, threshold: schemas.NormThresholdCreate, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    data = threshold.model_dump()
    data["instrument_code"] = code
    db_obj = models.NormThreshold(**data)
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


@router.delete("/admin/norm-thresholds/{threshold_id}")
async def admin_delete_norm_threshold(threshold_id: int, current_user: models.User = Depends(auth.get_current_active_admin), db: Session = Depends(get_db)):
    db_obj = db.query(models.NormThreshold).filter(models.NormThreshold.id == threshold_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Norm threshold not found")
    db.delete(db_obj)
    db.commit()
    return {"status": "success"}
