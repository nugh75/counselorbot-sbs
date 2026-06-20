"""CRUD dei model preset (provider + modello + parametri riusabili).

Un preset e' usato dal benchmark (cosa confrontare) e dai counselor (quale
modello risponde). L'endpoint marca `provider_configured` per ogni preset: i
provider locali (ollama/llamacpp) sono sempre disponibili; gli altri lo sono
solo se hanno una chiave API configurata (DB o env).
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, auth, database
from ..ai_service import AIService

router = APIRouter()
get_db = database.get_db

_LOCAL_PROVIDERS = {"ollama", "llamacpp"}


def _provider_configured(config: dict, provider: str) -> bool:
    """True se il provider e' utilizzabile: locale, oppure con chiave attiva."""
    if provider in _LOCAL_PROVIDERS:
        return True
    return bool((config.get(f"api_key_{provider}") or "").strip())


def _serialize(preset: models.ModelPreset, config: dict) -> schemas.ModelPresetResponse:
    data = schemas.ModelPresetResponse.model_validate(preset)
    data.provider_configured = _provider_configured(config, preset.provider)
    return data


@router.get("/admin/presets", response_model=List[schemas.ModelPresetResponse])
async def list_presets(
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    config = AIService(db).config
    presets = db.query(models.ModelPreset).order_by(models.ModelPreset.id.asc()).all()
    return [_serialize(p, config) for p in presets]


@router.post("/admin/presets", response_model=schemas.ModelPresetResponse)
async def create_preset(
    payload: schemas.ModelPresetCreate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    if not payload.name.strip() or not payload.provider.strip() or not payload.model.strip():
        raise HTTPException(status_code=400, detail="name, provider e model sono obbligatori")
    preset = models.ModelPreset(
        name=payload.name.strip(),
        provider=payload.provider.strip(),
        model=payload.model.strip(),
        temperature=payload.temperature,
        max_tokens=payload.max_tokens,
        disable_thinking=payload.disable_thinking,
        reasoning_budget=payload.reasoning_budget,
        notes=payload.notes,
        is_active=payload.is_active,
    )
    db.add(preset)
    db.commit()
    db.refresh(preset)
    return _serialize(preset, AIService(db).config)


@router.put("/admin/presets/{preset_id}", response_model=schemas.ModelPresetResponse)
async def update_preset(
    preset_id: int,
    payload: schemas.ModelPresetUpdate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    preset = db.query(models.ModelPreset).filter(models.ModelPreset.id == preset_id).first()
    if not preset:
        raise HTTPException(status_code=404, detail="Preset non trovato")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field in ("name", "provider", "model") and isinstance(value, str):
            value = value.strip()
            if not value:
                raise HTTPException(status_code=400, detail=f"{field} non puo' essere vuoto")
        setattr(preset, field, value)
    db.commit()
    db.refresh(preset)
    return _serialize(preset, AIService(db).config)


@router.delete("/admin/presets/{preset_id}")
async def delete_preset(
    preset_id: int,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    preset = db.query(models.ModelPreset).filter(models.ModelPreset.id == preset_id).first()
    if not preset:
        raise HTTPException(status_code=404, detail="Preset non trovato")
    db.delete(preset)
    db.commit()
    return {"ok": True, "deleted": preset_id}
