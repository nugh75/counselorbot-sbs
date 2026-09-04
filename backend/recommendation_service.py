"""Gestione del log persistente delle raccomandazioni per sidebar.

Vive fuori da skills engine: il motore decide cosa iniettare nel prompt, questo
servizio decide cosa salvare in `RecommendationHistory` e cosa escludere nei
turni successivi. Le raccomandazioni sono separate dal flow chat.

Separa:
  - `record` (scrittura a fine turno dagli ids skills)
  - `slugs_shown` (lettura per excluded_ids nei turni successivi)
  - `list_for_session` (endpoint GET per sidebar)

Il log non viene mai cancellato a fine sessione: la sidebar deve ricomparire
uguale quando una sessione congelata viene ripresa.
"""
from __future__ import annotations

import logging
from typing import Iterable

from sqlalchemy.orm import Session
from . import models

logger = logging.getLogger(__name__)


def record(
    db: Session,
    *,
    session_id: str,
    username: str,
    recommendation_type: str,
    payloads: list[dict],
    turn_index: int | None = None,
) -> list[models.RecommendationHistory]:
    """Salva le raccomandazioni di questo turno; ritorna le righe create.

    Se una raccomandazione con lo stesso slug e' gia' stata mostrata in
    questa sessione, si aggiorna `turn_index` e `payload` con la versione
    piu' recente. Nessuna registrazione e' mai fatta per la stessa
    raccomandazione due volte.
    """
    if not session_id or not username:
        return []
    created: list[models.RecommendationHistory] = []
    try:
        for item in payloads:
            slug = str(item.get("slug") or item.get("id") or "").strip()
            if not slug:
                continue
            row = (
                db.query(models.RecommendationHistory)
                .filter(
                    models.RecommendationHistory.session_id == session_id,
                    models.RecommendationHistory.username == username,
                    models.RecommendationHistory.slug == slug,
                    models.RecommendationHistory.recommendation_type == recommendation_type,
                )
                .first()
            )
            payload = dict(item)
            payload.pop("id", None)
            payload.pop("slug", None)
            if row:
                if turn_index is not None:
                    row.turn_index = turn_index
                row.payload = payload
                db.add(row)
                created.append(row)
                continue
            row = models.RecommendationHistory(
                username=username,
                session_id=session_id,
                recommendation_type=recommendation_type,
                slug=slug,
                turn_index=turn_index,
                payload=payload,
            )
            db.add(row)
            created.append(row)
        db.commit()
        return created
    except Exception as exc:
        logger.warning("Recommendation record failed: %s", exc)
        db.rollback()
        return []


def slugs_shown(
    db: Session,
    *,
    session_id: str,
    username: str,
    recommendation_type: str,
) -> set[str]:
    """Slugs già mostrati in sidebar, per excluded_ids nei turni successivi."""
    if not session_id or not username:
        return set()
    try:
        rows = (
            db.query(models.RecommendationHistory.slug)
            .filter(
                models.RecommendationHistory.session_id == session_id,
                models.RecommendationHistory.username == username,
                models.RecommendationHistory.recommendation_type == recommendation_type,
            )
            .all()
        )
        return {row[0] for row in rows}
    except Exception as exc:
        logger.warning("Recommendation slugs read failed: %s", exc)
        return set()


def list_for_session(
    db: Session,
    *,
    session_id: str,
    username: str,
) -> dict[str, list[dict]]:
    """Raccomandazioni ordinate per turno, deduplicate.

    Il risultato e' un dict con due chiavi ("reading", "strategy"): ogni item
    porta `slug`, `recommendation_type`, `turn_index`, e tutto il payload.
    `username` separa anche session_id omonimi appartenenti a utenti diversi.
    """
    if not session_id or not username:
        return {"reading": [], "strategy": []}
    rows = (
        db.query(models.RecommendationHistory)
        .filter(
            models.RecommendationHistory.session_id == session_id,
            models.RecommendationHistory.username == username,
        )
        .order_by(
            models.RecommendationHistory.turn_index.asc().nulls_last(),
            models.RecommendationHistory.created_at.asc(),
        )
        .all()
    )

    result: dict[str, list[dict]] = {"reading": [], "strategy": []}
    for row in rows:
        item = {
            "slug": row.slug,
            "recommendation_type": row.recommendation_type,
            "turn_index": row.turn_index,
            **(row.payload or {}),
        }
        bucket = row.recommendation_type if row.recommendation_type in result else "reading"
        result[bucket].append(item)
    return result
