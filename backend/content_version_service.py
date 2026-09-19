"""Registro degli stati di certificazione per (contenuto, lingua)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from . import models
from .content_versions import (
    APP_LOCALES,
    CATALOG_CONTENT_TYPES,
    ContentVersionError,
    assert_transition,
    is_served,
    statuses_for,
)
from .i18n_fields import merged_i18n


def publish_catalog_source(db: Session, content_type: str, content, approved_by: str) -> None:
    """Pubblicare una bozza rende disponibile anche la lingua sorgente.

    Le altre traduzioni mantengono il proprio stato: la pubblicazione di una
    voce non approva automaticamente testi generati in altre lingue.
    """
    if content_type not in CATALOG_CONTENT_TYPES:
        raise ContentVersionError("Pubblicazione riservata ai cataloghi didattici")
    fields = ("name", "description", "recommended_when") if content_type == "certified_strategy" else ("why", "summary", "synopsis")
    texts = [merged_i18n(content, field) for field in fields]
    required = [values for values in texts if any(str(value or "").strip() for value in values.values())]
    if not required:
        return
    source_locale = next((locale for locale in APP_LOCALES if all(
        str(values.get(locale) or "").strip() for values in required
    )), None)
    if source_locale:
        upsert_version(db, content_type, content.slug, source_locale,
                       status="certified", source="editor", approved_by=approved_by)


def _validate(content_type: str, locale: str, status: Optional[str] = None) -> None:
    ladder = statuses_for(content_type)  # solleva se il tipo e' sconosciuto
    if locale not in APP_LOCALES:
        raise ContentVersionError(f"Lingua fuori dall'app: {locale}")
    if status is not None and status not in ladder:
        raise ContentVersionError(f"Stato {status} non previsto per {content_type}")


def get_version(db: Session, content_type: str, content_key: str, locale: str):
    return (
        db.query(models.ContentLanguageVersion)
        .filter(
            models.ContentLanguageVersion.content_type == content_type,
            models.ContentLanguageVersion.content_key == content_key,
            models.ContentLanguageVersion.locale == locale,
        )
        .first()
    )


def upsert_version(
    db: Session,
    content_type: str,
    content_key: str,
    locale: str,
    *,
    status: str,
    source: Optional[str] = None,
    version_label: Optional[str] = None,
    notes: Optional[str] = None,
    approved_by: Optional[str] = None,
) -> models.ContentLanguageVersion:
    """Crea o aggiorna la riga. I campi lasciati a None non vengono azzerati."""
    _validate(content_type, locale, status)
    row = get_version(db, content_type, content_key, locale)
    if row is None:
        row = models.ContentLanguageVersion(
            content_type=content_type, content_key=content_key, locale=locale
        )
        db.add(row)
    row.status = status
    if source is not None:
        row.source = source
    if version_label is not None:
        row.version_label = version_label
    if notes is not None:
        row.notes = notes
    if approved_by is not None:
        row.approved_by = approved_by
        row.approved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return row


def promote(
    db: Session,
    version: models.ContentLanguageVersion,
    target_status: str,
    approved_by: str,
) -> models.ContentLanguageVersion:
    """Transizione di stato tracciata. Rifiuta i salti non previsti."""
    assert_transition(version.content_type, version.status, target_status)
    version.status = target_status
    version.approved_by = approved_by
    version.approved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(version)
    return version


def status_map(db: Session, content_type: str, content_key: str) -> dict[str, str]:
    rows = (
        db.query(models.ContentLanguageVersion)
        .filter(
            models.ContentLanguageVersion.content_type == content_type,
            models.ContentLanguageVersion.content_key == content_key,
        )
        .all()
    )
    return {r.locale: r.status for r in rows}


def served_locales(db: Session, content_type: str, content_key: str) -> list[str]:
    """Le lingue in cui questo contenuto puo' essere mostrato, in ordine d'app."""
    statuses = status_map(db, content_type, content_key)
    return [loc for loc in APP_LOCALES if is_served(content_type, statuses.get(loc, ""))]


def served_locale(
    db: Session,
    content_type: str,
    content_key: str,
    requested: str,
    fallbacks: tuple[str, ...] = (),
) -> Optional[str]:
    """Prima lingua certificata fra quella richiesta e i ripieghi espliciti."""
    statuses = status_map(db, content_type, content_key)
    for locale in dict.fromkeys((requested, *fallbacks)):
        if locale in APP_LOCALES and is_served(content_type, statuses.get(locale, "")):
            return locale
    return None
