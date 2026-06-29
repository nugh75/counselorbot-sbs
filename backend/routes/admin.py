"""Endpoint admin + identità utente (/auth/me, /admin/*)."""
import io
import json
import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy import cast, func, or_, text as sa_text
from sqlalchemy.types import Text
from sqlalchemy.orm import Session

from .. import models, schemas, auth, database, pii
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

_KNOWN_LOG_PROVIDERS = {
    "openai",
    "anthropic",
    "gemini",
    "mistral",
    "openrouter",
    "ollama",
    "llamacpp",
    "opencode",
    "unknown",
}


@router.get("/auth/me")
async def read_me(request: Request):
    """Identità dell'utente corrente verificata tramite ai4auth."""
    return await auth.get_identity(request)


# --- Admin Config Endpoints ---


def _to_float(value, field: str) -> Optional[float]:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail=f"{field} non valido (numero atteso)")


def _multi_values(value: Optional[str]) -> List[str]:
    """Spezza un filtro multi-valore (CSV) in lista deduplicata, ordine preservato.

    Permette alla UI di mandare piu' username / codici anonimi separati da virgola
    (multiscelta) mantenendo retro-compatibile il valore singolo.
    """
    if not value:
        return []
    seen: dict = {}
    for part in value.split(","):
        cleaned = part.strip()
        if cleaned and cleaned not in seen:
            seen[cleaned] = None
    return list(seen.keys())


def _apply_log_filters(
    q,
    *,
    session_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    action: Optional[str] = None,
    provider: Optional[str] = None,
    questionnaire_type: Optional[str] = None,
    username: Optional[str] = None,
    anonymous_research_code: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    search: Optional[str] = None,
    model: Optional[str] = None,
    paid_only: Optional[bool] = None,
    cost_min: Optional[str] = None,
    cost_max: Optional[str] = None,
    feedback: Optional[str] = None,
    phase: Optional[str] = None,
    mode: Optional[str] = None,
    has_pii: Optional[bool] = None,
):
    """Applica i filtri comuni a una query su models.Log. Muta e ritorna `q`."""
    if session_id:
        q = q.filter(models.Log.session_id == session_id)
    if conversation_id:
        details_text = cast(models.Log.details, Text)
        q = q.filter(or_(
            models.Log.conversation_id == conversation_id,
            models.Log.session_id == conversation_id,
            details_text.ilike(f'%\"conversation_id\"%{conversation_id}%'),
        ))
    if action:
        q = q.filter(models.Log.action == action)
    if provider:
        q = q.filter(or_(
            models.Log.provider == provider,
            cast(models.Log.details, Text).ilike(f'%\"provider\"%{provider}%'),
        ))
    if questionnaire_type:
        q = q.filter(or_(
            models.Log.questionnaire_type == questionnaire_type,
            cast(models.Log.details, Text).ilike(f'%\"questionnaire_type\"%{questionnaire_type}%'),
        ))
    usernames = _multi_values(username)
    if usernames:
        q = q.filter(models.Log.username.in_(usernames))
    anon_codes = _multi_values(anonymous_research_code)
    if anon_codes:
        q = q.filter(models.Log.anonymous_research_code.in_(anon_codes))
    if model:
        q = q.filter(or_(
            models.Log.model_name == model,
            cast(models.Log.details, Text).ilike(f'%\"model\"%{model}%'),
        ))
    if phase:
        q = q.filter(models.Log.phase == phase)
    if mode:
        q = q.filter(models.Log.mode == mode)
    if paid_only:
        q = q.filter(models.Log.cost_usd.isnot(None), models.Log.cost_usd > 0)
    cmin = _to_float(cost_min, "cost_min")
    if cmin is not None:
        q = q.filter(models.Log.cost_usd >= cmin)
    cmax = _to_float(cost_max, "cost_max")
    if cmax is not None:
        q = q.filter(models.Log.cost_usd <= cmax)
    if has_pii:
        txt = cast(models.Log.details, Text)
        q = q.filter(or_(txt.ilike("%[email]%"), txt.ilike("%[telefono]%"), txt.ilike("%[cf]%")))
    if feedback in ("helpful", "not_helpful", "unrated"):
        # Sottoquery sui response_id valorizzati in shared_chat_responses, per
        # evitare join che duplicherebbero le righe o confliggerebbero con il
        # join feedback gia' presente in logs_stats.
        rated_ids = q.session.query(models.SharedChatResponse.id).filter(
            models.SharedChatResponse.helpful.isnot(None)
        )
        if feedback == "unrated":
            q = q.filter(or_(
                models.Log.response_id.is_(None),
                models.Log.response_id.notin_(rated_ids),
            ))
        else:
            want = feedback == "helpful"
            wanted_ids = q.session.query(models.SharedChatResponse.id).filter(
                models.SharedChatResponse.helpful.is_(want)
            )
            q = q.filter(models.Log.response_id.in_(wanted_ids))
    if from_date:
        try:
            q = q.filter(models.Log.timestamp >= datetime.fromisoformat(from_date))
        except ValueError:
            raise HTTPException(status_code=400, detail="from_date non valido (usa ISO 8601)")
    if to_date:
        try:
            q = q.filter(models.Log.timestamp <= datetime.fromisoformat(to_date))
        except ValueError:
            raise HTTPException(status_code=400, detail="to_date non valido (usa ISO 8601)")
    if search:
        # Ricerca case-insensitive nel JSON details (CAST details AS TEXT).
        # SQLite: details e' gia' TEXT; Postgres: e' JSON, serve il cast.
        like = f"%{search.lower()}%"
        q = q.filter(cast(models.Log.details, Text).ilike(like))
    return q


def _details_dict(details) -> dict:
    if isinstance(details, dict):
        return details
    if isinstance(details, str):
        try:
            parsed = json.loads(details)
            return parsed if isinstance(parsed, dict) else {}
        except (ValueError, TypeError):
            return {}
    return {}


def _text_value(value) -> Optional[str]:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        return value.strip() or None
    return str(value)


def _looks_like_provider(value: Optional[str]) -> bool:
    return bool(value and value.strip().lower() in _KNOWN_LOG_PROVIDERS)


def _normalize_log_metadata(log: models.Log) -> models.Log:
    """Normalizza in risposta i log legacy.

    I vecchi record salvavano provider/model/questionnaire_type solo nel JSON
    details. Inoltre eventuali valori modello finiti per errore in provider non
    devono alimentare la tendina provider.
    """
    details = _details_dict(log.details)
    provider = _text_value(getattr(log, "provider", None))
    model_name = _text_value(getattr(log, "model_name", None))
    details_provider = _text_value(details.get("provider"))
    details_model = _text_value(details.get("model"))

    if not _looks_like_provider(provider):
        if _looks_like_provider(details_provider):
            if provider and not model_name and provider != details_provider:
                setattr(log, "model_name", provider)
            setattr(log, "provider", details_provider)
        else:
            if provider and not model_name:
                setattr(log, "model_name", provider)
            setattr(log, "provider", None)

    if not _text_value(getattr(log, "model_name", None)) and details_model:
        setattr(log, "model_name", details_model)
    if not _text_value(getattr(log, "questionnaire_type", None)):
        setattr(log, "questionnaire_type", _text_value(details.get("questionnaire_type")))
    if not _text_value(getattr(log, "phase", None)):
        setattr(log, "phase", _text_value(details.get("phase")) or _text_value(details.get("audience")))
    if not _text_value(getattr(log, "mode", None)):
        setattr(log, "mode", _text_value(details.get("mode")))
    if not _text_value(getattr(log, "conversation_id", None)):
        setattr(log, "conversation_id", _text_value(details.get("conversation_id")) or _text_value(log.session_id))
    return log


def _normalize_logs_metadata(logs: list[models.Log]) -> list[models.Log]:
    for log in logs:
        _normalize_log_metadata(log)
    return logs


def _attach_log_feedback(db: Session, logs: list[models.Log]) -> list[models.Log]:
    """Aggiunge `helpful` come attributo dinamico sui Log serializzati da Pydantic."""
    response_ids = sorted({log.response_id for log in logs if log.response_id})
    if not response_ids:
        return logs
    rows = (
        db.query(models.SharedChatResponse.id, models.SharedChatResponse.helpful)
        .filter(models.SharedChatResponse.id.in_(response_ids))
        .all()
    )
    helpful_by_id = {rid: helpful for rid, helpful in rows}
    for log in logs:
        setattr(log, "helpful", helpful_by_id.get(log.response_id))
    return logs


def _prepare_log_response(db: Session, logs: list[models.Log]) -> list[models.Log]:
    _attach_log_feedback(db, logs)
    return _normalize_logs_metadata(logs)


def _log_retention_days(db: Session) -> int:
    cfg = db.query(models.Config).filter(models.Config.key == "log_retention_days").first()
    try:
        return int(cfg.value) if cfg and cfg.value not in (None, "") else 90
    except (ValueError, TypeError):
        return 90


def _retention_cutoff(days: int) -> datetime:
    return datetime.utcnow() - timedelta(days=days)


def _count_purgeable_logs(db: Session, days: int) -> int:
    if days <= 0:
        return 0
    dialect = database.engine.dialect.name
    try:
        if dialect == "postgresql":
            return int(db.execute(
                sa_text("SELECT count(*) FROM logs WHERE timestamp < now() - (:days || ' days')::interval"),
                {"days": days},
            ).scalar() or 0)
        return int(db.query(func.count(models.Log.id)).filter(models.Log.timestamp < _retention_cutoff(days)).scalar() or 0)
    except Exception:
        return 0


def _delete_purgeable_logs(db: Session, days: int) -> int:
    if days <= 0:
        return 0
    dialect = database.engine.dialect.name
    if dialect == "postgresql":
        result = db.execute(
            sa_text("DELETE FROM logs WHERE timestamp < now() - (:days || ' days')::interval"),
            {"days": days},
        )
        db.commit()
        return int(getattr(result, "rowcount", 0) or 0)
    deleted = (
        db.query(models.Log)
        .filter(models.Log.timestamp < _retention_cutoff(days))
        .delete(synchronize_session=False)
    )
    db.commit()
    return int(deleted or 0)


@router.get("/admin/logs/options")
async def log_filter_options(
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Valori distinti per le tendine filtro, normalizzati sui log legacy."""
    logs = db.query(models.Log).order_by(models.Log.timestamp.desc()).limit(50000).all()
    _normalize_logs_metadata(logs)
    actions = sorted({log.action for log in logs if log.action})
    providers = sorted({
        log.provider for log in logs
        if _looks_like_provider(_text_value(log.provider))
    })
    questionnaire_types = sorted({
        log.questionnaire_type for log in logs
        if _text_value(log.questionnaire_type)
    })
    usernames = sorted({log.username for log in logs if _text_value(log.username)})
    anonymous_research_codes = sorted({
        _text_value(log.anonymous_research_code) for log in logs
        if _text_value(log.anonymous_research_code)
    })
    conversation_ids = sorted({
        _text_value(log.conversation_id) for log in logs
        if _text_value(log.conversation_id)
    })
    models_list = sorted({_text_value(log.model_name) for log in logs if _text_value(log.model_name)})
    phases = sorted({_text_value(log.phase) for log in logs if _text_value(log.phase)})
    modes = sorted({_text_value(log.mode) for log in logs if _text_value(log.mode)})
    return {
        "actions": actions,
        "providers": providers,
        "questionnaire_types": questionnaire_types,
        "usernames": usernames,
        "anonymous_research_codes": anonymous_research_codes,
        "conversation_ids": conversation_ids,
        "models": models_list,
        "phases": phases,
        "modes": modes,
    }


@router.get("/admin/logs", response_model=List[schemas.LogResponse])
async def read_logs(
    skip: int = 0,
    limit: int = 100,
    session_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    action: Optional[str] = None,
    provider: Optional[str] = None,
    questionnaire_type: Optional[str] = None,
    username: Optional[str] = None,
    anonymous_research_code: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    q: Optional[str] = None,
    model: Optional[str] = None,
    paid_only: bool = False,
    cost_min: Optional[str] = None,
    cost_max: Optional[str] = None,
    feedback: Optional[str] = None,
    phase: Optional[str] = None,
    mode: Optional[str] = None,
    has_pii: bool = False,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Log conversazionali con filtri opzionali (sessione, azione, provider,
    questionario, username, range date, ricerca testuale nel details, modello,
    solo-a-pagamento, range costo, feedback, fase, mode, PII rilevata)."""
    query = db.query(models.Log)
    query = _apply_log_filters(
        query,
        session_id=session_id, conversation_id=conversation_id, action=action, provider=provider,
        questionnaire_type=questionnaire_type, username=username,
        anonymous_research_code=anonymous_research_code,
        from_date=from_date, to_date=to_date, search=q,
        model=model, paid_only=paid_only, cost_min=cost_min, cost_max=cost_max,
        feedback=feedback, phase=phase, mode=mode, has_pii=has_pii,
    )
    logs = query.order_by(models.Log.timestamp.desc()).offset(skip).limit(min(limit, 500)).all()
    return _prepare_log_response(db, logs)


@router.get("/admin/logs/count")
async def count_logs(
    session_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    action: Optional[str] = None,
    provider: Optional[str] = None,
    questionnaire_type: Optional[str] = None,
    username: Optional[str] = None,
    anonymous_research_code: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    q: Optional[str] = None,
    model: Optional[str] = None,
    paid_only: bool = False,
    cost_min: Optional[str] = None,
    cost_max: Optional[str] = None,
    feedback: Optional[str] = None,
    phase: Optional[str] = None,
    mode: Optional[str] = None,
    has_pii: bool = False,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Totale dei log corrispondenti ai filtri (per paginazione lato UI)."""
    query = db.query(func.count(models.Log.id))
    query = _apply_log_filters(
        query,
        session_id=session_id, conversation_id=conversation_id, action=action, provider=provider,
        questionnaire_type=questionnaire_type, username=username,
        anonymous_research_code=anonymous_research_code,
        from_date=from_date, to_date=to_date, search=q,
        model=model, paid_only=paid_only, cost_min=cost_min, cost_max=cost_max,
        feedback=feedback, phase=phase, mode=mode, has_pii=has_pii,
    )
    return {"count": int(query.scalar() or 0)}


@router.get("/admin/logs/session/{session_id}", response_model=List[schemas.LogResponse])
async def read_session_logs(
    session_id: str,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Ricostruisce un'intera conversazione: tutti i turni di una sessione,
    in ordine cronologico."""
    logs = (
        db.query(models.Log)
        .filter(models.Log.session_id == session_id)
        .order_by(models.Log.timestamp.asc())
        .all()
    )
    return _prepare_log_response(db, logs)


@router.get("/admin/logs/conversation/{conversation_id}", response_model=List[schemas.LogResponse])
async def read_conversation_logs(
    conversation_id: str,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Ricostruisce tutti i turni con lo stesso conversation_id.

    Per compatibilita' con i record storici, se conversation_id non e' valorizzato
    usa anche session_id come chiave equivalente.
    """
    logs = (
        db.query(models.Log)
        .filter(or_(
            models.Log.conversation_id == conversation_id,
            models.Log.session_id == conversation_id,
            cast(models.Log.details, Text).ilike(f'%\"conversation_id\"%{conversation_id}%'),
        ))
        .order_by(models.Log.timestamp.asc())
        .all()
    )
    return _prepare_log_response(db, logs)


@router.get("/admin/logs/stats")
async def logs_stats(
    session_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    action: Optional[str] = None,
    provider: Optional[str] = None,
    questionnaire_type: Optional[str] = None,
    username: Optional[str] = None,
    anonymous_research_code: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    q: Optional[str] = None,
    model: Optional[str] = None,
    paid_only: bool = False,
    cost_min: Optional[str] = None,
    cost_max: Optional[str] = None,
    feedback: Optional[str] = None,
    phase: Optional[str] = None,
    mode: Optional[str] = None,
    has_pii: bool = False,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Aggregati sui log: turni totali, sessioni distinte, split per
    action/provider/questionnaire_type, % feedback positivi (join
    shared_chat_responses via response_id)."""
    base = db.query(models.Log)
    base = _apply_log_filters(
        base,
        session_id=session_id, conversation_id=conversation_id, action=action, provider=provider,
        questionnaire_type=questionnaire_type, username=username,
        anonymous_research_code=anonymous_research_code,
        from_date=from_date, to_date=to_date, search=q,
        model=model, paid_only=paid_only, cost_min=cost_min, cost_max=cost_max,
        feedback=feedback, phase=phase, mode=mode, has_pii=has_pii,
    )

    total = base.count()
    distinct_sessions = (
        base.with_entities(models.Log.session_id).distinct().count()
    )
    distinct_conversations = (
        base.with_entities(func.coalesce(models.Log.conversation_id, models.Log.session_id)).distinct().count()
    )

    def _group(field):
        rows = base.with_entities(field, func.count(models.Log.id)).group_by(field).all()
        return {str(k) if k is not None else "(nessuno)": int(v) for k, v in rows}

    by_action = _group(models.Log.action)

    dialect = database.engine.dialect.name
    day_expr = func.date_trunc("day", models.Log.timestamp) if dialect == "postgresql" else func.date(models.Log.timestamp)
    turn_rows = (
        base.with_entities(day_expr.label("day"), func.count(models.Log.id))
        .group_by(day_expr)
        .order_by(day_expr.asc())
        .all()
    )
    turns_by_day = [
        {"date": day.isoformat() if hasattr(day, "isoformat") else str(day), "turns": int(count)}
        for day, count in turn_rows
    ]

    # Feedback: join con shared_chat_responses sui response_id valorizzati.
    feedback = {"rated": 0, "helpful": 0, "not_helpful": 0}
    try:
        rated_rows = (
            base.join(
                models.SharedChatResponse,
                models.Log.response_id == models.SharedChatResponse.id,
            )
            .filter(models.SharedChatResponse.helpful.isnot(None))
            .with_entities(models.SharedChatResponse.helpful)
            .all()
        )
        feedback["rated"] = len(rated_rows)
        feedback["helpful"] = sum(1 for r in rated_rows if r[0] is True)
        feedback["not_helpful"] = sum(1 for r in rated_rows if r[0] is False)
    except Exception:
        pass

    stat_logs = base.order_by(models.Log.timestamp.desc()).limit(50000).all()
    _normalize_logs_metadata(stat_logs)

    def _group_normalized(attr: str):
        out: dict[str, int] = {}
        for log in stat_logs:
            value = _text_value(getattr(log, attr, None)) or "(nessuno)"
            out[value] = out.get(value, 0) + 1
        return out

    by_provider = _group_normalized("provider")
    by_questionnaire = _group_normalized("questionnaire_type")

    positive_pct = round(100.0 * feedback["helpful"] / feedback["rated"], 1) if feedback["rated"] else 0.0

    return {
        "total": int(total),
        "distinct_sessions": int(distinct_sessions),
        "distinct_conversations": int(distinct_conversations),
        "by_action": by_action,
        "by_provider": by_provider,
        "by_questionnaire_type": by_questionnaire,
        "turns_by_day": turns_by_day,
        "feedback": feedback,
        "positive_feedback_pct": positive_pct,
    }


def _usage_tokens(usage) -> tuple[int, int]:
    """Estrae (prompt_tokens, completion_tokens) da un dict usage eterogeneo
    (OpenAI/OpenRouter: prompt/completion_tokens; Anthropic: input/output_tokens)."""
    if not isinstance(usage, dict):
        return 0, 0
    pin = usage.get("prompt_tokens") or usage.get("input_tokens") or 0
    pout = usage.get("completion_tokens") or usage.get("output_tokens") or 0
    try:
        return int(pin or 0), int(pout or 0)
    except (ValueError, TypeError):
        return 0, 0


def _runrate(cost_to_date: float, start: datetime, end: datetime, now: datetime) -> dict:
    """Proiezione lineare del costo di periodo basata sul ritmo finora (run-rate)."""
    elapsed = (now - start).total_seconds()
    total = (end - start).total_seconds()
    projected = cost_to_date / elapsed * total if elapsed > 0 else cost_to_date
    return {
        "cost_to_date": round(cost_to_date, 8),
        "projected_cost": round(projected, 8),
        "days_elapsed": round(elapsed / 86400.0, 2),
        "days_total": round(total / 86400.0, 2),
    }


def _cost_period_aggregate(db: Session, unit: str, filt: dict) -> list[dict]:
    """Somma costo + turni per periodo (week/month/year) via SQL date_trunc.

    Calcolato su tutta la storia (i filtri data sono azzerati dal chiamante),
    rispettando gli altri filtri (provider/modello/questionario/...)."""
    period_col = func.date_trunc(unit, models.Log.timestamp)
    q = db.query(
        period_col.label("period"),
        func.coalesce(func.sum(models.Log.cost_usd), 0.0).label("cost"),
        func.count(models.Log.id).label("turns"),
    )
    q = _apply_log_filters(q, **filt)
    q = q.group_by(period_col).order_by(period_col)

    rows: list[dict] = []
    for period_dt, cost, turns in q.all():
        if period_dt is None:
            continue
        if unit == "week":
            label = period_dt.strftime("%G-W%V")
        elif unit == "month":
            label = period_dt.strftime("%Y-%m")
        else:  # year
            label = period_dt.strftime("%Y")
        rows.append({
            "period": label,
            "start": period_dt.date().isoformat(),
            "cost": round(float(cost or 0.0), 8),
            "turns": int(turns or 0),
        })
    return rows


def _current_period_bounds(now: datetime) -> dict:
    """Inizio/fine (inclusivo→esclusivo) della settimana/mese/anno correnti."""
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = day - timedelta(days=now.isoweekday() - 1)
    month_start = day.replace(day=1)
    if month_start.month == 12:
        month_end = month_start.replace(year=month_start.year + 1, month=1)
    else:
        month_end = month_start.replace(month=month_start.month + 1)
    year_start = day.replace(month=1, day=1)
    year_end = year_start.replace(year=year_start.year + 1)
    return {
        "week": (week_start, week_start + timedelta(days=7), now.strftime("%G-W%V")),
        "month": (month_start, month_end, now.strftime("%Y-%m")),
        "year": (year_start, year_end, now.strftime("%Y")),
    }


def _usd_eur_rate(db: Session) -> float:
    row = db.query(models.Config).filter(models.Config.key == "usd_eur_rate").first()
    try:
        rate = float(row.value) if row and row.value else 0.92
    except (TypeError, ValueError):
        rate = 0.92
    return rate if rate > 0 else 0.92


def _budget_status(db: Session, now: datetime) -> dict:
    """Stato del budget mensile: limite, speso (TUTTI i costi del mese corrente),
    residuo, superamento. month_to_date e' sull'intera storia del mese, senza
    filtri (coerente con l'enforcement in AIService)."""
    def _cfg(key: str, default: str = "") -> str:
        row = db.query(models.Config).filter(models.Config.key == key).first()
        return row.value if row and row.value is not None else default

    try:
        budget = float(_cfg("monthly_budget_usd", "0") or 0)
    except (TypeError, ValueError):
        budget = 0.0
    fallback = (_cfg("budget_fallback_model", "qwen3.5:9b") or "qwen3.5:9b").strip()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    spent = db.query(func.coalesce(func.sum(models.Log.cost_usd), 0.0)).filter(
        models.Log.timestamp >= month_start,
        models.Log.cost_usd.isnot(None),
    ).scalar() or 0.0
    spent = round(float(spent), 8)
    return {
        "monthly_budget_usd": round(budget, 8),
        "budget_fallback_model": fallback,
        "month_to_date_cost": spent,
        "budget_remaining": round(budget - spent, 8) if budget > 0 else 0.0,
        "budget_exceeded": bool(budget > 0 and spent >= budget),
        "budget_used_pct": round(spent / budget * 100, 2) if budget > 0 else 0.0,
    }


@router.get("/admin/cost-stats")
async def cost_stats(
    session_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    action: Optional[str] = None,
    provider: Optional[str] = None,
    questionnaire_type: Optional[str] = None,
    username: Optional[str] = None,
    anonymous_research_code: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    q: Optional[str] = None,
    model: Optional[str] = None,
    paid_only: bool = False,
    cost_min: Optional[str] = None,
    cost_max: Optional[str] = None,
    feedback: Optional[str] = None,
    phase: Optional[str] = None,
    mode: Optional[str] = None,
    has_pii: bool = False,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Statistiche di costo per valutare la sostenibilita': costo totale,
    costo medio per turno/sessione/utente, ripartizione per modello/provider,
    per utente (codice anonimo), trend giornaliero e split benchmark vs
    produzione. Il costo viene dalla colonna logs.cost_usd; i token sono
    best-effort dal campo details.usage."""
    base = db.query(models.Log)
    base = _apply_log_filters(
        base,
        session_id=session_id, conversation_id=conversation_id, action=action, provider=provider,
        questionnaire_type=questionnaire_type, username=username,
        anonymous_research_code=anonymous_research_code,
        from_date=from_date, to_date=to_date, search=q,
        model=model, paid_only=paid_only, cost_min=cost_min, cost_max=cost_max,
        feedback=feedback, phase=phase, mode=mode, has_pii=has_pii,
    )
    logs = base.order_by(models.Log.timestamp.desc()).limit(50000).all()
    _normalize_logs_metadata(logs)

    total_cost = 0.0
    paid_turns = 0
    sessions: set = set()
    paid_sessions: set = set()
    users: set = set()
    paid_users: set = set()
    by_model: dict = {}
    by_user: dict = {}
    by_day: dict = {}
    split = {
        "production": {"cost": 0.0, "turns": 0},
        "benchmark": {"cost": 0.0, "turns": 0},
    }

    for log in logs:
        if log.session_id:
            sessions.add(log.session_id)
        code = _text_value(log.anonymous_research_code)
        if code:
            users.add(code)

        has_cost = log.cost_usd is not None
        c = float(log.cost_usd) if has_cost else 0.0
        if has_cost:
            total_cost += c
            paid_turns += 1
            if log.session_id:
                paid_sessions.add(log.session_id)
            if code:
                paid_users.add(code)

        details = _details_dict(log.details)
        usage = details.get("usage") if isinstance(details.get("usage"), dict) else details
        pin, pout = _usage_tokens(usage)

        m = _text_value(log.model_name) or "(nessuno)"
        bm = by_model.setdefault(m, {
            "model": m, "provider": _text_value(log.provider) or "-",
            "turns": 0, "prompt_tokens": 0, "completion_tokens": 0, "cost": 0.0,
        })
        bm["turns"] += 1
        bm["prompt_tokens"] += pin
        bm["completion_tokens"] += pout
        bm["cost"] += c

        if code:
            bu = by_user.setdefault(code, {
                "anonymous_research_code": code, "turns": 0, "_sessions": set(), "cost": 0.0,
            })
            bu["turns"] += 1
            if log.session_id:
                bu["_sessions"].add(log.session_id)
            bu["cost"] += c

        if log.timestamp:
            d = log.timestamp.date().isoformat()
            bd = by_day.setdefault(d, {"date": d, "cost": 0.0, "turns": 0})
            bd["cost"] += c
            bd["turns"] += 1

        bucket = "benchmark" if (log.action or "").startswith("benchmark") else "production"
        split[bucket]["cost"] += c
        split[bucket]["turns"] += 1

    by_model_list = sorted(by_model.values(), key=lambda r: r["cost"], reverse=True)
    for r in by_model_list:
        r["total_tokens"] = r["prompt_tokens"] + r["completion_tokens"]
        r["avg_cost_per_turn"] = round(r["cost"] / r["turns"], 8) if r["turns"] else 0.0
        r["cost"] = round(r["cost"], 8)

    by_user_list = []
    for r in by_user.values():
        r["sessions"] = len(r.pop("_sessions"))
        r["avg_cost_per_turn"] = round(r["cost"] / r["turns"], 8) if r["turns"] else 0.0
        r["cost"] = round(r["cost"], 8)
        by_user_list.append(r)
    by_user_list.sort(key=lambda r: r["cost"], reverse=True)
    by_user_list = by_user_list[:100]

    by_day_list = sorted(by_day.values(), key=lambda r: r["date"])
    for r in by_day_list:
        r["cost"] = round(r["cost"], 8)
    for b in split.values():
        b["cost"] = round(b["cost"], 8)

    # Aggregati di periodo su TUTTA la storia (filtri data azzerati): totali
    # reali settimana/mese/anno + proiezione run-rate del periodo corrente.
    period_filt = dict(
        session_id=session_id, conversation_id=conversation_id, action=action, provider=provider,
        questionnaire_type=questionnaire_type, username=username,
        anonymous_research_code=anonymous_research_code,
        from_date=None, to_date=None, search=q,
        model=model, paid_only=paid_only, cost_min=cost_min, cost_max=cost_max,
        feedback=feedback, phase=phase, mode=mode, has_pii=has_pii,
    )
    by_week = _cost_period_aggregate(db, "week", period_filt)
    by_month = _cost_period_aggregate(db, "month", period_filt)
    by_year = _cost_period_aggregate(db, "year", period_filt)

    now = datetime.now(timezone.utc)
    bounds = _current_period_bounds(now)
    cost_by_label = {
        "week": {r["period"]: r["cost"] for r in by_week},
        "month": {r["period"]: r["cost"] for r in by_month},
        "year": {r["period"]: r["cost"] for r in by_year},
    }
    periods = {}
    for unit, (start, end, label) in bounds.items():
        cost_to_date = cost_by_label[unit].get(label, 0.0)
        periods[unit] = {**_runrate(cost_to_date, start, end, now), "period": label}

    return {
        "currency": "USD",
        "usd_eur_rate": _usd_eur_rate(db),
        "total_cost": round(total_cost, 8),
        "total_turns": len(logs),
        "paid_turns": paid_turns,
        "distinct_sessions": len(sessions),
        "distinct_users": len(users),
        "avg_cost_per_turn": round(total_cost / paid_turns, 8) if paid_turns else 0.0,
        "avg_cost_per_session": round(total_cost / len(paid_sessions), 8) if paid_sessions else 0.0,
        "avg_cost_per_user": round(total_cost / len(paid_users), 8) if paid_users else 0.0,
        "avg_turns_per_user": round(len(logs) / len(users), 2) if users else 0.0,
        "avg_turns_per_session": round(len(logs) / len(sessions), 2) if sessions else 0.0,
        "avg_sessions_per_user": round(len(sessions) / len(users), 2) if users else 0.0,
        "by_model": by_model_list,
        "by_user": by_user_list,
        "by_day": by_day_list,
        "by_week": by_week,
        "by_month": by_month,
        "by_year": by_year,
        "periods": periods,
        "split": split,
        **_budget_status(db, now),
    }


@router.delete("/admin/logs/session/{session_id}")
async def delete_session_logs(
    session_id: str,
    confirm: bool = Query(False),
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Cancella tutti i log di una sessione (diritto all'oblio GDPR)."""
    count = db.query(func.count(models.Log.id)).filter(models.Log.session_id == session_id).scalar() or 0
    if not confirm:
        return {
            "requires_confirmation": True,
            "matching_logs": int(count),
            "deleted": 0,
            "session_id": session_id,
        }
    deleted = (
        db.query(models.Log)
        .filter(models.Log.session_id == session_id)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": int(deleted or 0), "session_id": session_id}


@router.get("/admin/logs/retention-status")
async def logs_retention_status(
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Stato della conservazione: giorni configurati, totale record, conteggio
    per fascia d'eta' e stima dei record candidati alla purge."""
    days = _log_retention_days(db)

    total = db.query(func.count(models.Log.id)).scalar() or 0
    purgeable = _count_purgeable_logs(db, days)
    now = datetime.utcnow()
    buckets = {
        "0_30_days": int(db.query(func.count(models.Log.id)).filter(models.Log.timestamp >= now - timedelta(days=30)).scalar() or 0),
        "31_90_days": int(db.query(func.count(models.Log.id)).filter(models.Log.timestamp < now - timedelta(days=30), models.Log.timestamp >= now - timedelta(days=90)).scalar() or 0),
        "91_180_days": int(db.query(func.count(models.Log.id)).filter(models.Log.timestamp < now - timedelta(days=90), models.Log.timestamp >= now - timedelta(days=180)).scalar() or 0),
        "over_180_days": int(db.query(func.count(models.Log.id)).filter(models.Log.timestamp < now - timedelta(days=180)).scalar() or 0),
    }
    oldest = db.query(func.min(models.Log.timestamp)).scalar()

    return {
        "retention_days": days,
        "retention_enabled": days > 0,
        "total_logs": int(total),
        "purgeable_logs": purgeable,
        "purge_cutoff": _retention_cutoff(days).isoformat() if days > 0 else None,
        "oldest_log_timestamp": oldest.isoformat() if oldest else None,
        "age_buckets": buckets,
    }


@router.post("/admin/logs/retention-run")
async def run_logs_retention(
    confirm: bool = Query(False),
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Esegue manualmente la retention sui log. Senza confirm ritorna solo il
    numero di record candidati alla cancellazione."""
    days = _log_retention_days(db)
    purgeable = _count_purgeable_logs(db, days)
    if not confirm:
        return {
            "requires_confirmation": True,
            "retention_days": days,
            "purgeable_logs": purgeable,
            "deleted": 0,
        }
    deleted = _delete_purgeable_logs(db, days)
    return {
        "requires_confirmation": False,
        "retention_days": days,
        "purgeable_logs": purgeable,
        "deleted": deleted,
    }


@router.get("/admin/logs/pii-report")
async def logs_pii_report(
    limit: int = Query(10000, ge=1, le=50000),
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Report operativo: scansiona i details dei log e conta possibili PII
    residue, senza restituire i valori rilevati."""
    logs = db.query(models.Log.id, models.Log.details).order_by(models.Log.timestamp.desc()).limit(limit).all()
    by_type = {"email": 0, "telefono": 0, "cf": 0}
    suspect_logs = 0
    for _, details in logs:
        text = json.dumps(details, ensure_ascii=False) if not isinstance(details, str) else details
        found = pii.detect_pii_types(text)
        if found:
            suspect_logs += 1
            for key in found:
                by_type[key] = by_type.get(key, 0) + 1
    cfg = db.query(models.Config).filter(models.Config.key == "log_pii_redact").first()
    redaction_enabled = not (cfg and (cfg.value or "").strip().lower() in ("0", "false", "no", "off"))
    return {
        "redaction_enabled": redaction_enabled,
        "scanned_logs": len(logs),
        "suspect_logs": suspect_logs,
        "by_type": by_type,
    }


@router.get("/admin/logs/export")
async def export_logs(
    format: str = "csv",
    session_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    action: Optional[str] = None,
    provider: Optional[str] = None,
    questionnaire_type: Optional[str] = None,
    username: Optional[str] = None,
    anonymous_research_code: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    q: Optional[str] = None,
    model: Optional[str] = None,
    paid_only: bool = False,
    cost_min: Optional[str] = None,
    cost_max: Optional[str] = None,
    feedback: Optional[str] = None,
    phase: Optional[str] = None,
    mode: Optional[str] = None,
    has_pii: bool = False,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Esporta i log (CSV/JSON) con gli stessi filtri di /admin/logs.
    Rispetta gli stessi filtri di read_logs. I PII sono gia' redatti nel DB."""
    query = db.query(models.Log)
    query = _apply_log_filters(
        query,
        session_id=session_id, conversation_id=conversation_id, action=action, provider=provider,
        questionnaire_type=questionnaire_type, username=username,
        anonymous_research_code=anonymous_research_code,
        from_date=from_date, to_date=to_date, search=q,
        model=model, paid_only=paid_only, cost_min=cost_min, cost_max=cost_max,
        feedback=feedback, phase=phase, mode=mode, has_pii=has_pii,
    )
    logs = query.order_by(models.Log.timestamp.desc()).limit(10000).all()
    _prepare_log_response(db, logs)

    fmt = (format or "csv").lower()
    if fmt == "json":
        payload = [
            {
                "id": log.id,
                "timestamp": log.timestamp.isoformat() if log.timestamp else None,
                "session_id": log.session_id,
                "conversation_id": log.conversation_id,
                "username": log.username,
                "email": log.email,
                "anonymous_research_code": log.anonymous_research_code,
                "action": log.action,
                "provider": log.provider,
                "model_name": log.model_name,
                "questionnaire_type": log.questionnaire_type,
                "phase": log.phase,
                "mode": log.mode,
                "response_id": log.response_id,
                "cost_usd": log.cost_usd,
                "helpful": getattr(log, "helpful", None),
                "details": log.details,
            }
            for log in logs
        ]
        return Response(
            content=json.dumps(payload, ensure_ascii=False, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=logs.json"},
        )

    # CSV default
    import csv as _csv
    output = io.StringIO()
    writer = _csv.writer(output)
    writer.writerow([
        "id", "timestamp", "session_id", "conversation_id", "username", "anonymous_research_code", "action",
        "provider", "model_name", "questionnaire_type", "phase", "mode",
        "response_id", "cost_usd", "helpful", "details",
    ])
    for log in logs:
        writer.writerow([
            log.id,
            log.timestamp.isoformat() if log.timestamp else "",
            log.session_id,
            log.conversation_id or "",
            log.username or "",
            log.anonymous_research_code or "",
            log.action,
            log.provider or "",
            log.model_name or "",
            log.questionnaire_type or "",
            log.phase or "",
            log.mode or "",
            log.response_id or "",
            log.cost_usd if log.cost_usd is not None else "",
            getattr(log, "helpful", ""),
            json.dumps(log.details, ensure_ascii=False),
        ])
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=logs.csv"},
    )


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
    if config.key == "log_pii_redact":
        pii.set_pii_redact_enabled((config.value or "").strip().lower() not in ("0", "false", "no", "off"))
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
