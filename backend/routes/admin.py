"""Endpoint admin + identità utente (/auth/me, /admin/*)."""
import os
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models, schemas, auth, database
from ..ai_service import AIService

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
