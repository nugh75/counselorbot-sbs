"""Catalogo strategie di apprendimento certificate: CRUD admin.

Tabella DB strutturata (nome, fattori collegati, quando raccomandarla), distinta
dalla knowledge base file-based. Le voci `certified` attive vengono iniettate nel
contesto della chat dello studente da `certified_strategy_service`. L'endpoint
`/translate` riempie en/es/sv da IT via Ollama (best-effort, poi revisionabili).
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas, auth, database
from ..certified_translation import translate_strategies
from ..content_versions_seed import derive_strategy_versions

router = APIRouter()
get_db = database.get_db

@router.get("/admin/certified-strategies", response_model=List[schemas.CertifiedStrategyResponse])
async def list_certified_strategies(
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.CertifiedStrategy)
        .order_by(models.CertifiedStrategy.sort_order.asc(), models.CertifiedStrategy.id.asc())
        .all()
    )


@router.post("/admin/certified-strategies", response_model=schemas.CertifiedStrategyResponse)
async def create_certified_strategy(
    payload: schemas.CertifiedStrategyCreate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    slug = (payload.slug or "").strip()
    if not slug:
        raise HTTPException(status_code=400, detail="slug obbligatorio")
    if db.query(models.CertifiedStrategy).filter(models.CertifiedStrategy.slug == slug).first():
        raise HTTPException(status_code=409, detail="slug gia' esistente")
    data = payload.model_dump()
    data["slug"] = slug
    strategy = models.CertifiedStrategy(**data)
    db.add(strategy)
    db.commit()
    db.refresh(strategy)
    derive_strategy_versions(db)
    return strategy


@router.put("/admin/certified-strategies/{strategy_id}", response_model=schemas.CertifiedStrategyResponse)
async def update_certified_strategy(
    strategy_id: int,
    payload: schemas.CertifiedStrategyUpdate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    strategy = db.query(models.CertifiedStrategy).filter(models.CertifiedStrategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategia non trovata")
    updates = payload.model_dump(exclude_unset=True)
    if "slug" in updates:
        new_slug = (updates["slug"] or "").strip()
        if not new_slug:
            raise HTTPException(status_code=400, detail="slug non puo' essere vuoto")
        clash = (
            db.query(models.CertifiedStrategy)
            .filter(models.CertifiedStrategy.slug == new_slug, models.CertifiedStrategy.id != strategy_id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=409, detail="slug gia' esistente")
        updates["slug"] = new_slug
    for field, value in updates.items():
        setattr(strategy, field, value)
    db.commit()
    db.refresh(strategy)
    return strategy


@router.delete("/admin/certified-strategies/{strategy_id}")
async def delete_certified_strategy(
    strategy_id: int,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    strategy = db.query(models.CertifiedStrategy).filter(models.CertifiedStrategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategia non trovata")
    db.delete(strategy)
    db.commit()
    return {"ok": True, "deleted": strategy_id}


@router.post(
    "/admin/certified-strategies/{strategy_id}/translate",
    response_model=schemas.CertifiedStrategyResponse,
)
async def translate_certified_strategy(
    strategy_id: int,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Riempie le cinque lingue da IT nel JSON; l'admin poi certifica per lingua."""
    strategy = db.query(models.CertifiedStrategy).filter(models.CertifiedStrategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategia non trovata")
    try:
        translated = translate_strategies(db, content_key=strategy.slug)
    except Exception as e:  # noqa: BLE001 - best-effort, Ollama puo' non essere raggiungibile
        raise HTTPException(status_code=502, detail=f"Traduzione non disponibile: {e}")
    if not translated and not any(
        (getattr(strategy, f"{field}_it", None) or "").strip()
        for field in ("name", "recommended_when", "description")
    ):
        raise HTTPException(status_code=400, detail="Nessun testo italiano da tradurre")
    db.refresh(strategy)
    return strategy
