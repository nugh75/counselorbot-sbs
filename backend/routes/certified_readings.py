"""Catalogo delle letture certificate: CRUD admin, verifica e certificazione.

Le voci nascono in bozza. Entrano nella chat dello studente solo quando un admin
le porta a `certified`, e la certificazione e' bloccata finche' mancano i dati
minimi: un tema del vocabolario, il motivo della raccomandazione e, per il
materiale sensibile, l'avvertenza da riportare.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas
from ..reading_themes import READING_THEMES
from ..reading_verification import verify_reading
from .. import web_lookup
from ..content_versions_seed import derive_reading_versions

router = APIRouter()
get_db = database.get_db

VALID_KINDS = {"essay", "fiction", "film", "documentary", "series", "article", "podcast", "video"}
VALID_STATUS = {"draft", "certified"}


def _fetch(db: Session, reading_id: int) -> models.CertifiedReading:
    row = db.query(models.CertifiedReading).filter(models.CertifiedReading.id == reading_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Lettura non trovata")
    return row


def _validate(row: models.CertifiedReading) -> None:
    if (row.kind or "") not in VALID_KINDS:
        raise HTTPException(status_code=400, detail=f"Tipo non valido: usa uno fra {sorted(VALID_KINDS)}")
    unknown = [t for t in (row.themes or []) if t not in READING_THEMES]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Temi fuori vocabolario: {unknown}")
    if (row.status or "") not in VALID_STATUS:
        raise HTTPException(status_code=400, detail="Stato non valido: draft o certified")


def _guard_certification(row: models.CertifiedReading) -> None:
    """Una voce certificata deve poter essere consegnata a uno studente."""
    if row.status != "certified":
        return
    if not (row.themes or row.factor_codes):
        raise HTTPException(status_code=400, detail="Serve almeno un tema o un codice fattore: senza, la voce non verrebbe mai proposta")
    why = row.why_i18n or {}
    if not any((why.get(lang) or "").strip() for lang in ("it", "en")):
        raise HTTPException(status_code=400, detail="Serve il motivo della raccomandazione in italiano o inglese")
    if row.is_sensitive and not (row.content_warning or "").strip():
        raise HTTPException(status_code=400, detail="Materiale sensibile senza avvertenza: aggiungi content_warning")
    synopsis = row.synopsis_i18n or {}
    if any((text or "").strip() for text in synopsis.values()):
        # Una sinossi arriva da qualche parte: senza URL nessuno puo' risalire a
        # quale fonte l'ha scritta ne' quando e' stata presa.
        if not str((row.synopsis_source or {}).get("url") or "").strip():
            raise HTTPException(status_code=400, detail="Sinossi senza provenienza: aggiungi synopsis_source.url")


@router.get("/admin/certified-readings", response_model=List[schemas.CertifiedReadingResponse])
async def list_certified_readings(
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.CertifiedReading)
        .order_by(models.CertifiedReading.sort_order.asc(), models.CertifiedReading.id.asc())
        .all()
    )


@router.get("/admin/reading-themes")
async def list_reading_themes(
    current_user: models.User = Depends(auth.get_current_active_admin),
):
    """Vocabolario controllato dei temi, per popolare il pannello."""
    return [
        {"code": code, "label": theme["label"], "factors": theme["factors"]}
        for code, theme in READING_THEMES.items()
    ]


@router.post("/admin/certified-readings", response_model=schemas.CertifiedReadingResponse)
async def create_certified_reading(
    payload: schemas.CertifiedReadingCreate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    slug = (payload.slug or "").strip()
    if not slug:
        raise HTTPException(status_code=400, detail="slug obbligatorio")
    if db.query(models.CertifiedReading).filter(models.CertifiedReading.slug == slug).first():
        raise HTTPException(status_code=409, detail="slug gia' presente")
    row = models.CertifiedReading(**payload.model_dump())
    row.slug = slug
    _validate(row)
    _guard_certification(row)
    db.add(row)
    db.commit()
    db.refresh(row)
    derive_reading_versions(db)
    return row


@router.put("/admin/certified-readings/{reading_id}", response_model=schemas.CertifiedReadingResponse)
async def update_certified_reading(
    reading_id: int,
    payload: schemas.CertifiedReadingUpdate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    row = _fetch(db, reading_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    _validate(row)
    _guard_certification(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/admin/certified-readings/{reading_id}/verify", response_model=schemas.CertifiedReadingResponse)
async def verify_certified_reading(
    reading_id: int,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Controlla titolo, anno e autori su OpenAlex e salva l'esito.

    Non cambia lo stato: la certificazione resta una decisione dell'admin.
    """
    row = _fetch(db, reading_id)
    row.verification = verify_reading({
        "title": row.title, "original_title": row.original_title, "kind": row.kind,
        "year": row.year, "creators": row.creators or [], "identifiers": row.identifiers or {},
    })
    db.commit()
    db.refresh(row)
    return row


@router.post("/admin/certified-readings/{reading_id}/synopsis-draft")
async def draft_certified_reading_synopsis(
    reading_id: int,
    lang: str = "it",
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Propone una sinossi presa da una fonte pubblica, senza salvarla.

    La scrittura resta un gesto dell'admin: la bozza torna al pannello con la
    sua provenienza, e da li' viene corretta e approvata.
    """
    row = _fetch(db, reading_id)
    result = web_lookup.synopsis_for({
        "title": row.title, "original_title": row.original_title,
        "kind": row.kind, "creators": row.creators or [],
    }, lang=lang)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Nessuna fonte affidabile ha una voce per questo titolo: scrivi la sinossi a mano",
        )
    return result.as_dict()


@router.delete("/admin/certified-readings/{reading_id}")
async def delete_certified_reading(
    reading_id: int,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    row = _fetch(db, reading_id)
    db.delete(row)
    db.commit()
    return {"ok": True, "deleted": reading_id}
