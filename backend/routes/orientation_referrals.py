"""Catalogo dei referenti e degli eventi: CRUD admin e directory dello studente.

Le voci nascono in bozza. Entrano nella chat e nella pagina dello studente solo
quando un admin le porta a `certified`, e la certificazione e' bloccata finche'
mancano i dati minimi: un bisogno del vocabolario, il motivo per cui rivolgersi
a quella figura e un canale per raggiungerla.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas
from ..orientation_referral_service import orientation_referral_memory
from ..reading_audience import resolve_audience_band
from ..referral_needs import REFERRAL_NEEDS
from ..referral_scope import institution_for, institution_ids_for

router = APIRouter()
get_db = database.get_db

VALID_STATUS = {"draft", "certified"}
VALID_EVENT_KINDS = {"open-day", "workshop", "sportello", "fiera", "scadenza", "webinar"}
# Quel che la directory mostra: non e' un turno di chat, non c'e' un budget di
# prompt da rispettare, ma un elenco infinito non e' una pagina leggibile.
DIRECTORY_LIMIT = 50


def _check_needs(row) -> None:
    if not (row.needs or []):
        raise HTTPException(
            status_code=400,
            detail="Serve almeno un bisogno: senza, la voce non verrebbe mai proposta",
        )
    unknown = [n for n in row.needs if n not in REFERRAL_NEEDS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Bisogni fuori vocabolario: {unknown}")


def _has_text(data) -> bool:
    return isinstance(data, dict) and any((v or "").strip() for v in data.values())


def _guard_referral(row: models.OrientationReferral) -> None:
    """Una figura certificata deve poter essere consegnata a uno studente."""
    if row.status != "certified":
        return
    _check_needs(row)
    if not _has_text(row.role_label_i18n):
        raise HTTPException(status_code=400, detail="Serve il ruolo in almeno una lingua")
    if not _has_text(row.what_for_i18n):
        raise HTTPException(
            status_code=400,
            detail="Serve dire cosa lo studente puo' chiedere a questa figura",
        )
    channel = row.contact_channel if isinstance(row.contact_channel, dict) else {}
    if not any(str(channel.get(k) or "").strip() for k in ("email", "page_url", "location", "hours")):
        raise HTTPException(
            status_code=400,
            detail="Serve un contatto istituzionale: email d'ufficio, pagina, stanza o orari",
        )


def _guard_event(row: models.OrientationEvent) -> None:
    if row.status != "certified":
        return
    _check_needs(row)
    if not _has_text(row.title_i18n):
        raise HTTPException(status_code=400, detail="Serve il titolo in almeno una lingua")
    if not (row.page_url or "").strip():
        raise HTTPException(status_code=400, detail="Evento senza page_url: aggiungi la pagina dell'istituto")
    if row.ends_at is None:
        raise HTTPException(status_code=400, detail="Serve la data di fine: e' cio' che fa scadere l'evento")
    if row.starts_at is not None and row.ends_at < row.starts_at:
        raise HTTPException(status_code=400, detail="L'evento non puo' finire prima di iniziare")


def warn_off_domain_email(row: models.OrientationReferral, institution) -> str:
    """Avviso, non blocco: un servizio consorziato fra scuole ha per forza
    un'email fuori dal dominio dell'istituto, e un guard duro lo rifiuterebbe.
    Torna la stringa vuota quando non c'e' nulla da segnalare."""
    channel = row.contact_channel if isinstance(row.contact_channel, dict) else {}
    email = str(channel.get("email") or "").strip().lower()
    site = str(getattr(institution, "website_url", "") or "").strip().lower()
    if "@" not in email or not site:
        return ""
    host = site.split("//")[-1].split("/")[0].removeprefix("www.")
    domain = email.rsplit("@", 1)[-1]
    if host and domain and not (domain.endswith(host) or host.endswith(domain)):
        return f"L'email {email} non e' sul dominio dell'istituto ({host}): controlla che sia un recapito d'ufficio."
    return ""


def _validate_common(row, kinds: set[str] | None = None) -> None:
    if (row.status or "") not in VALID_STATUS:
        raise HTTPException(status_code=400, detail="Stato non valido: draft o certified")
    if kinds is not None and (row.kind or "") not in kinds:
        raise HTTPException(status_code=400, detail=f"Tipo non valido: usa uno fra {sorted(kinds)}")


@router.get("/admin/referral-needs")
async def list_referral_needs(
    current_user: dict = Depends(auth.get_current_active_admin),
):
    """Vocabolario dei bisogni, per popolare il pannello."""
    return [{"code": code, "label": need["label"]} for code, need in REFERRAL_NEEDS.items()]


# --- figure ------------------------------------------------------------------

@router.get("/admin/orientation-referrals")
async def list_referrals(
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Le figure piu' l'avviso editoriale sul recapito, che non blocca nulla."""
    rows = (
        db.query(models.OrientationReferral)
        .order_by(models.OrientationReferral.sort_order.asc(), models.OrientationReferral.id.asc())
        .all()
    )
    institutions = {i.id: i for i in db.query(models.Institution).all()}
    out = []
    for row in rows:
        item = schemas.OrientationReferralResponse.model_validate(row).model_dump()
        item["warning"] = warn_off_domain_email(row, institutions.get(row.institution_id))
        out.append(item)
    return out


@router.post("/admin/orientation-referrals", response_model=schemas.OrientationReferralResponse)
async def create_referral(
    payload: schemas.OrientationReferralCreate,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    slug = (payload.slug or "").strip()
    if not slug:
        raise HTTPException(status_code=400, detail="slug obbligatorio")
    if db.query(models.OrientationReferral).filter(models.OrientationReferral.slug == slug).first():
        raise HTTPException(status_code=409, detail="slug gia' presente")
    row = models.OrientationReferral(**payload.model_dump())
    row.slug = slug
    _validate_common(row)
    _guard_referral(row)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/admin/orientation-referrals/{referral_id}", response_model=schemas.OrientationReferralResponse)
async def update_referral(
    referral_id: int,
    payload: schemas.OrientationReferralUpdate,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    row = db.query(models.OrientationReferral).filter(models.OrientationReferral.id == referral_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Referente non trovato")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    _validate_common(row)
    _guard_referral(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/admin/orientation-referrals/{referral_id}")
async def delete_referral(
    referral_id: int,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    row = db.query(models.OrientationReferral).filter(models.OrientationReferral.id == referral_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Referente non trovato")
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": referral_id}


# --- eventi ------------------------------------------------------------------

@router.get("/admin/orientation-events", response_model=List[schemas.OrientationEventResponse])
async def list_events(
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.OrientationEvent)
        .order_by(models.OrientationEvent.starts_at.asc(), models.OrientationEvent.id.asc())
        .all()
    )


@router.post("/admin/orientation-events", response_model=schemas.OrientationEventResponse)
async def create_event(
    payload: schemas.OrientationEventCreate,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    slug = (payload.slug or "").strip()
    if not slug:
        raise HTTPException(status_code=400, detail="slug obbligatorio")
    if db.query(models.OrientationEvent).filter(models.OrientationEvent.slug == slug).first():
        raise HTTPException(status_code=409, detail="slug gia' presente")
    row = models.OrientationEvent(**payload.model_dump())
    row.slug = slug
    _validate_common(row, VALID_EVENT_KINDS)
    _guard_event(row)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/admin/orientation-events/{event_id}", response_model=schemas.OrientationEventResponse)
async def update_event(
    event_id: int,
    payload: schemas.OrientationEventUpdate,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    row = db.query(models.OrientationEvent).filter(models.OrientationEvent.id == event_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Evento non trovato")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    _validate_common(row, VALID_EVENT_KINDS)
    _guard_event(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/admin/orientation-events/{event_id}")
async def delete_event(
    event_id: int,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    row = db.query(models.OrientationEvent).filter(models.OrientationEvent.id == event_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Evento non trovato")
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": event_id}
