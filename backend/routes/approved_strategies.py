"""CRUD admin per le strategie RAG approvate.

Le strategie restano nello stesso formato Markdown usato da `StrategyMemory`, ma
l'override modificato dall'interfaccia viene salvato in `configs` per non
dipendere dalla scrivibilita' del filesystem del container.
"""
import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas
from ..strategy_memory import APPROVED_STRATEGIES_CONFIG_KEY, strategy_memory

router = APIRouter()
get_db = database.get_db

_ID_RE = re.compile(r"^[A-Za-z0-9_.-]+$")
_TEXT_KEY_RE = re.compile(r"^[A-Za-z0-9_-]+$")
_STATUSES = {"approved", "draft"}
_LANG_ORDER = ("it", "en", "es", "fr", "de", "sv")


def _stored_markdown(db: Session) -> tuple[str, str]:
    config = db.query(models.Config).filter(models.Config.key == APPROVED_STRATEGIES_CONFIG_KEY).first()
    if config:
        return config.value or "", "db"
    return strategy_memory.read_markdown(), "file"


def _records(db: Session) -> tuple[list[dict[str, str]], str]:
    markdown, source = _stored_markdown(db)
    return strategy_memory.parse_markdown(markdown), source


def _response(record: dict[str, str]) -> schemas.ApprovedStrategyBase:
    texts = {
        key.removeprefix("text."): value
        for key, value in record.items()
        if key.startswith("text.") and value
    }
    questionnaires = [item.strip() for item in (record.get("questionnaires") or "").split(",") if item.strip()]
    return schemas.ApprovedStrategyBase(
        id=record.get("id", ""),
        status=record.get("status") or "draft",
        questionnaires=questionnaires,
        keywords=record.get("keywords") or None,
        texts=texts,
    )


def _record(payload: schemas.ApprovedStrategyBase | schemas.ApprovedStrategyUpdate, fallback_id: str | None = None) -> dict[str, str]:
    data = payload.model_dump(exclude_unset=True)
    strategy_id = str(data.get("id") or fallback_id or "").strip()
    if not strategy_id or not _ID_RE.match(strategy_id):
        raise HTTPException(status_code=400, detail="id non valido")

    status = str(data.get("status") or "draft").strip().lower()
    if status not in _STATUSES:
        raise HTTPException(status_code=400, detail="status non valido")

    record: dict[str, str] = {"id": strategy_id, "status": status}
    questionnaires = [
        str(item).strip().upper()
        for item in (data.get("questionnaires") or [])
        if str(item).strip()
    ]
    if questionnaires:
        record["questionnaires"] = ", ".join(dict.fromkeys(questionnaires))
    keywords = str(data.get("keywords") or "").replace("\n", " ").strip()
    if keywords:
        record["keywords"] = keywords

    texts = data.get("texts") or {}
    for lang in sorted(texts.keys(), key=lambda item: (_LANG_ORDER.index(item) if item in _LANG_ORDER else len(_LANG_ORDER), item)):
        if not _TEXT_KEY_RE.match(lang):
            raise HTTPException(status_code=400, detail=f"lingua non valida: {lang}")
        text = str(texts.get(lang) or "").replace("\n", " ").strip()
        if text:
            record[f"text.{lang}"] = text
    return record


def _save_records(db: Session, records: List[dict[str, str]]) -> None:
    markdown = strategy_memory.render_markdown(records)
    config = db.query(models.Config).filter(models.Config.key == APPROVED_STRATEGIES_CONFIG_KEY).first()
    if config:
        config.value = markdown
        config.description = "Override admin delle strategie RAG approvate."
    else:
        db.add(models.Config(
            key=APPROVED_STRATEGIES_CONFIG_KEY,
            value=markdown,
            description="Override admin delle strategie RAG approvate.",
        ))
    db.commit()


@router.get("/admin/approved-strategies", response_model=schemas.ApprovedStrategiesList)
async def list_approved_strategies(
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    records, source = _records(db)
    return schemas.ApprovedStrategiesList(source=source, strategies=[_response(record) for record in records])


@router.post("/admin/approved-strategies", response_model=schemas.ApprovedStrategyBase)
async def create_approved_strategy(
    payload: schemas.ApprovedStrategyCreate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    records, _source = _records(db)
    record = _record(payload)
    if any(item.get("id") == record["id"] for item in records):
        raise HTTPException(status_code=409, detail="id gia' esistente")
    records.append(record)
    _save_records(db, records)
    return _response(record)


@router.put("/admin/approved-strategies/{strategy_id}", response_model=schemas.ApprovedStrategyBase)
async def update_approved_strategy(
    strategy_id: str,
    payload: schemas.ApprovedStrategyUpdate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    records, _source = _records(db)
    idx = next((i for i, item in enumerate(records) if item.get("id") == strategy_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Strategia non trovata")
    merged = _response(records[idx]).model_dump()
    merged.update(payload.model_dump(exclude_unset=True))
    record = _record(schemas.ApprovedStrategyBase(**merged), fallback_id=strategy_id)
    if record["id"] != strategy_id and any(item.get("id") == record["id"] for item in records):
        raise HTTPException(status_code=409, detail="id gia' esistente")
    records[idx] = record
    _save_records(db, records)
    return _response(record)


@router.delete("/admin/approved-strategies/{strategy_id}")
async def delete_approved_strategy(
    strategy_id: str,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    records, _source = _records(db)
    kept = [item for item in records if item.get("id") != strategy_id]
    if len(kept) == len(records):
        raise HTTPException(status_code=404, detail="Strategia non trovata")
    _save_records(db, kept)
    return {"ok": True, "deleted": strategy_id}
