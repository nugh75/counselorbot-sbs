"""Counselor: persone di counseling configurabili.

Admin: CRUD completo su /admin/counselors (nome, descrizione, persona, modello
via preset, questionari gestiti). Pubblico: GET /counselors espone solo i campi
user-facing dei counselor attivi (per il selettore lato studente).
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas, auth, database
from ..counselor_i18n import localized_description, translate_counselor_async, translate_counselor_sync
from sqlalchemy import cast as sa_cast, String

router = APIRouter()
get_db = database.get_db

# Provider che girano in locale; tutto il resto e' API esterna a pagamento.
_LOCAL_PROVIDERS = {"ollama", "llamacpp"}


def _provider_origin(provider: Optional[str]) -> Optional[str]:
    if not provider:
        return None
    return "local" if provider in _LOCAL_PROVIDERS else "external"


def _active_provider(db: Session) -> Optional[str]:
    row = db.query(models.Config).filter(models.Config.key == "active_provider").first()
    return (row.value if row else None) or "openai"


def _preset_map(db: Session) -> dict:
    return {p.id: p for p in db.query(models.ModelPreset).all()}


def _serialize(counselor: models.Counselor, presets: dict) -> schemas.CounselorResponse:
    data = schemas.CounselorResponse.model_validate(counselor)
    preset = presets.get(counselor.preset_id) if counselor.preset_id else None
    if preset:
        data.provider = preset.provider
        data.model = preset.model
    return data


# --- Pubblico (lato utente) ------------------------------------------------
@router.get("/counselors", response_model=List[schemas.CounselorPublic])
async def list_public_counselors(
    lang: Optional[str] = Query(None),
    language: Optional[str] = Query(None, description="Filtra counselor che supportano questa lingua ('*' = tutte)"),
    db: Session = Depends(get_db),
):
    q = (
        db.query(models.Counselor)
        .filter(models.Counselor.is_active.is_(True))
        .order_by(models.Counselor.sort_order.asc(), models.Counselor.id.asc())
    )
    if language:
        # Filter counselors whose language list contains '*' (all) or the specific code.
        # The language column stores a JSON array as text; we match by string pattern.
        lang_text = sa_cast(models.Counselor.language, String)
        q = q.filter(
            lang_text.like('%"*"%')
            | lang_text.like(f'%"{language}"%')
        )
    rows = q.all()
    presets = _preset_map(db)
    active = _active_provider(db)
    out = []
    for r in rows:
        pub = schemas.CounselorPublic.model_validate(r)
        pub.description = localized_description(r, lang)
        preset = presets.get(r.preset_id) if r.preset_id else None
        provider = preset.provider if preset else active
        pub.model_origin = _provider_origin(provider)
        out.append(pub)
    return out


# --- Admin -----------------------------------------------------------------
@router.get("/admin/counselors", response_model=List[schemas.CounselorResponse])
async def list_counselors(
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    presets = _preset_map(db)
    rows = (
        db.query(models.Counselor)
        .order_by(models.Counselor.sort_order.asc(), models.Counselor.id.asc())
        .all()
    )
    return [_serialize(r, presets) for r in rows]


@router.post("/admin/counselors", response_model=schemas.CounselorResponse)
async def create_counselor(
    payload: schemas.CounselorCreate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    slug = (payload.slug or "").strip()
    name = (payload.name or "").strip()
    if not slug or not name:
        raise HTTPException(status_code=400, detail="slug e name sono obbligatori")
    if db.query(models.Counselor).filter(models.Counselor.slug == slug).first():
        raise HTTPException(status_code=409, detail="slug gia' esistente")
    counselor = models.Counselor(
        slug=slug,
        name=name,
        description=payload.description,
        description_i18n=payload.description_i18n,
        persona=payload.persona,
        avatar=payload.avatar,
        preset_id=payload.preset_id,
        questionnaire_types=payload.questionnaire_types,
        language=payload.language or ["*"],
        sort_order=payload.sort_order or 0,
        is_active=payload.is_active,
        show_in_assistant=payload.show_in_assistant or False,
    )
    db.add(counselor)
    db.commit()
    db.refresh(counselor)
    if (counselor.description or "").strip():
        translate_counselor_async(counselor.id)
    return _serialize(counselor, _preset_map(db))


@router.put("/admin/counselors/{counselor_id}", response_model=schemas.CounselorResponse)
async def update_counselor(
    counselor_id: int,
    payload: schemas.CounselorUpdate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    counselor = db.query(models.Counselor).filter(models.Counselor.id == counselor_id).first()
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor non trovato")
    updates = payload.model_dump(exclude_unset=True)
    if "slug" in updates:
        new_slug = (updates["slug"] or "").strip()
        if not new_slug:
            raise HTTPException(status_code=400, detail="slug non puo' essere vuoto")
        clash = (
            db.query(models.Counselor)
            .filter(models.Counselor.slug == new_slug, models.Counselor.id != counselor_id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=409, detail="slug gia' esistente")
        updates["slug"] = new_slug
    desc_changed = "description" in updates and (updates["description"] or "") != (counselor.description or "")
    for field, value in updates.items():
        setattr(counselor, field, value)
    # se la descrizione cambia e l'admin non ha fornito traduzioni esplicite, rigenerale
    if desc_changed and "description_i18n" not in updates:
        counselor.description_i18n = None
    db.commit()
    db.refresh(counselor)
    if desc_changed and "description_i18n" not in updates and (counselor.description or "").strip():
        translate_counselor_async(counselor.id, force=True)
    return _serialize(counselor, _preset_map(db))


@router.delete("/admin/counselors/{counselor_id}")
async def delete_counselor(
    counselor_id: int,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    counselor = db.query(models.Counselor).filter(models.Counselor.id == counselor_id).first()
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor non trovato")
    db.delete(counselor)
    db.commit()
    return {"ok": True, "deleted": counselor_id}


@router.post("/admin/counselors/{counselor_id}/translate", response_model=schemas.CounselorResponse)
async def translate_counselor(
    counselor_id: int,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    counselor = db.query(models.Counselor).filter(models.Counselor.id == counselor_id).first()
    if not counselor:
        raise HTTPException(status_code=404, detail="Counselor non trovato")
    translate_counselor_sync(db, counselor_id, force=True)
    db.refresh(counselor)
    return _serialize(counselor, _preset_map(db))
