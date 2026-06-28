"""Portfolio dello studente: lavori/elaborati con metadati e immagini.

CRUD per le voci (titolo, descrizione, categoria, data, link) + upload/serve/
delete delle immagini su disco (PORTFOLIO_STORAGE_DIR). Le voci sono per-utente
(ownership su `username`) e vengono iniettate nel contesto dell'assistente.
"""
import os
import uuid

from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, or_, nullslast
from sqlalchemy.orm import Session

from .. import models, schemas, auth, database

router = APIRouter()
get_db = database.get_db

PORTFOLIO_STORAGE_DIR = os.getenv("PORTFOLIO_STORAGE_DIR", "/app/uploads/portfolio")
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def _owned_item(db: Session, item_id: int, current_user: dict) -> models.PortfolioItem:
    item = db.query(models.PortfolioItem).filter(models.PortfolioItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Lavoro non trovato")
    if not current_user.get("is_admin") and item.username != current_user.get("username"):
        raise HTTPException(status_code=403, detail="Azione non consentita")
    return item


def _to_response(item: models.PortfolioItem) -> schemas.PortfolioItemResponse:
    images = [
        schemas.PortfolioImage(id=str(img.get("id")), filename=img.get("filename"))
        for img in (item.images or [])
        if isinstance(img, dict) and img.get("id")
    ]
    return schemas.PortfolioItemResponse(
        id=item.id,
        title=item.title,
        description=item.description,
        category=item.category,
        item_date=item.item_date,
        link=item.link,
        images=images,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.get("/user/portfolio", response_model=List[schemas.PortfolioItemResponse])
async def list_portfolio_items(
    q: Optional[str] = Query(None, description="Ricerca su titolo, descrizione, categoria"),
    category: Optional[str] = Query(None, description="Filtra per categoria"),
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Elenca i lavori dello studente, con ricerca e filtro per categoria."""
    query = db.query(models.PortfolioItem).filter(
        models.PortfolioItem.username == current_user["username"]
    )
    if category:
        query = query.filter(models.PortfolioItem.category == category.strip())
    term = (q or "").strip()
    if term:
        like = f"%{term}%"
        query = query.filter(or_(
            models.PortfolioItem.title.ilike(like),
            models.PortfolioItem.description.ilike(like),
            models.PortfolioItem.category.ilike(like),
        ))
    items = query.order_by(
        nullslast(models.PortfolioItem.item_date.desc()),
        models.PortfolioItem.created_at.desc(),
        models.PortfolioItem.id.desc(),
    ).all()
    return [_to_response(item) for item in items]


@router.get("/user/portfolio/categories", response_model=List[str])
async def list_portfolio_categories(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Categorie distinte usate dallo studente (per il filtro)."""
    rows = (
        db.query(models.PortfolioItem.category)
        .filter(
            models.PortfolioItem.username == current_user["username"],
            models.PortfolioItem.category.isnot(None),
            func.length(func.trim(models.PortfolioItem.category)) > 0,
        )
        .distinct()
        .all()
    )
    return sorted({row[0].strip() for row in rows if row[0] and row[0].strip()})


@router.post("/user/portfolio", response_model=schemas.PortfolioItemResponse)
async def create_portfolio_item(
    payload: schemas.PortfolioItemCreate,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Crea un nuovo lavoro nel portfolio."""
    item = models.PortfolioItem(
        username=current_user["username"],
        title=payload.title,
        description=payload.description,
        category=payload.category,
        item_date=payload.item_date,
        link=payload.link,
        images=[],
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_response(item)


@router.get("/user/portfolio/{item_id}", response_model=schemas.PortfolioItemResponse)
async def get_portfolio_item(
    item_id: int,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    return _to_response(_owned_item(db, item_id, current_user))


@router.put("/user/portfolio/{item_id}", response_model=schemas.PortfolioItemResponse)
async def update_portfolio_item(
    item_id: int,
    payload: schemas.PortfolioItemUpdate,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Aggiorna i campi forniti del lavoro (gli altri restano invariati)."""
    item = _owned_item(db, item_id, current_user)
    updates = payload.model_dump(exclude_unset=True)
    if "title" in updates and not (updates["title"] or "").strip():
        raise HTTPException(status_code=400, detail="Il titolo non puo' essere vuoto")
    for field, value in updates.items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return _to_response(item)


@router.delete("/user/portfolio/{item_id}")
async def delete_portfolio_item(
    item_id: int,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Elimina un lavoro e i file immagine collegati."""
    item = _owned_item(db, item_id, current_user)
    for img in (item.images or []):
        path = img.get("path") if isinstance(img, dict) else None
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass
    db.delete(item)
    db.commit()
    return {"ok": True, "deleted": item_id}


@router.post("/user/portfolio/{item_id}/images", response_model=schemas.PortfolioItemResponse)
async def upload_portfolio_image(
    item_id: int,
    file: UploadFile = File(...),
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Carica un'immagine e la allega al lavoro."""
    item = _owned_item(db, item_id, current_user)
    content_type = (file.content_type or "").lower()
    ext = ALLOWED_IMAGE_TYPES.get(content_type)
    if not ext:
        raise HTTPException(status_code=400, detail="Formato non supportato. Usa JPG, PNG, WEBP o GIF.")
    contents = await file.read(MAX_IMAGE_BYTES + 1)
    await file.close()
    if not contents:
        raise HTTPException(status_code=400, detail="Il file e' vuoto.")
    if len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="L'immagine supera i 10 MB.")

    user_dir = os.path.join(PORTFOLIO_STORAGE_DIR, str(current_user["username"]))
    os.makedirs(user_dir, exist_ok=True)
    image_id = uuid.uuid4().hex
    path = os.path.join(user_dir, f"{image_id}{ext}")
    with open(path, "wb") as fh:
        fh.write(contents)

    images = list(item.images or [])
    images.append({
        "id": image_id,
        "filename": file.filename,
        "content_type": content_type,
        "path": path,
    })
    item.images = images
    db.commit()
    db.refresh(item)
    return _to_response(item)


@router.get("/user/portfolio/{item_id}/images/{image_id}")
async def get_portfolio_image(
    item_id: int,
    image_id: str,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Serve i byte dell'immagine allegata (con controllo di proprieta')."""
    item = _owned_item(db, item_id, current_user)
    image = next((img for img in (item.images or []) if isinstance(img, dict) and img.get("id") == image_id), None)
    if not image or not image.get("path") or not os.path.exists(image["path"]):
        raise HTTPException(status_code=404, detail="Immagine non trovata")
    with open(image["path"], "rb") as fh:
        data = fh.read()
    return Response(content=data, media_type=image.get("content_type") or "application/octet-stream")


@router.delete("/user/portfolio/{item_id}/images/{image_id}", response_model=schemas.PortfolioItemResponse)
async def delete_portfolio_image(
    item_id: int,
    image_id: str,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Rimuove un'immagine dal lavoro e cancella il file."""
    item = _owned_item(db, item_id, current_user)
    images = list(item.images or [])
    target = next((img for img in images if isinstance(img, dict) and img.get("id") == image_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Immagine non trovata")
    path = target.get("path")
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass
    item.images = [img for img in images if not (isinstance(img, dict) and img.get("id") == image_id)]
    db.commit()
    db.refresh(item)
    return _to_response(item)
