"""Lettura di un campo multilingue durante la convivenza JSON / colonne vecchie.

Le tabelle degli strumenti e delle strategie certificate nascono con una colonna
per lingua (`text_it`, `text_en`, ...). Passano a un JSON `{lingua: testo}`, ma
le colonne vecchie restano per una release: un rollback del codice non deve
perdere testi. Qui c'e' l'unico punto che sa di questa convivenza.
"""
from __future__ import annotations

from typing import Any, Optional

# Le sole lingue che hanno mai avuto una colonna dedicata.
LEGACY_LOCALES = ("it", "en", "es", "sv")


def _clean(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def localized(row: Any, field: str, locale: str) -> Optional[str]:
    """Il testo di `field` in `locale`, o None. Nessun ripiego su altre lingue.

    Il ripiego di lingua e' una decisione di prodotto, non di lettura: chi legge
    decide se mostrare nulla o chiedere altro. Qui si risponde solo alla domanda
    posta.
    """
    data = getattr(row, f"{field}_i18n", None)
    if isinstance(data, dict):
        value = _clean(data.get(locale))
        if value:
            return value
    if locale in LEGACY_LOCALES:
        return _clean(getattr(row, f"{field}_{locale}", None))
    return None


def merged_i18n(row: Any, field: str) -> dict[str, str]:
    """Vista unica delle lingue disponibili: colonne vecchie piu' JSON, JSON vince."""
    out: dict[str, str] = {}
    for locale in LEGACY_LOCALES:
        value = _clean(getattr(row, f"{field}_{locale}", None))
        if value:
            out[locale] = value
    data = getattr(row, f"{field}_i18n", None)
    if isinstance(data, dict):
        for locale, value in data.items():
            cleaned = _clean(value)
            if cleaned:
                out[locale] = cleaned
    return out


def locales_with_text(row: Any, field: str) -> set[str]:
    return set(merged_i18n(row, field).keys())
