"""Recupero delle letture certificate pertinenti a un turno di chat.

Gemello di `certified_strategy_service`, con una differenza sostanziale nel
gating: una strategia entra quando i suoi codici fattore sono salienti, una
lettura entra quando il suo TEMA e' pertinente. I codici fattore restano un
canale secondario, per le voci che ne dichiarano.

Regole non negoziabili implementate qui:
  - una voce senza temi e senza fattori non entra mai (niente jolly);
  - una voce marcata sensibile non raggiunge mai lo studente per default: serve
    che l'admin accenda `readings_allow_sensitive`, e anche allora entra solo se
    e' lo studente ad aver nominato quel tema, portando con se' l'avvertenza;
  - la lingua in cui l'opera esiste viene dichiarata, non nascosta;
  - una voce con un pubblico dichiarato non raggiunge una fascia diversa; quando
    la fascia non e' ricavabile il filtro non scatta, e la direttiva chiede al
    modello di domandarlo prima di proporre.
"""
from __future__ import annotations

import re
from typing import Iterable

from sqlalchemy.orm import Session

from . import models
from .content_version_service import served_locale
from .memory_embeddings import memory_embedder
from .reading_audience import audience_allows
from .reading_frame import frame

MAX_READING_CONTEXT_CHARS = 2000
# La sinossi dice di cosa parla l'opera. Entra corta: il blocco deve restare
# leggibile accanto a "perche'" e all'avvertenza.
MAX_SYNOPSIS_CHARS = 220

KIND_LABELS = {
    "essay": {"it": "saggio", "en": "essay"},
    "fiction": {"it": "romanzo", "en": "novel"},
    "film": {"it": "film", "en": "film"},
    "documentary": {"it": "documentario", "en": "documentary"},
    "series": {"it": "serie", "en": "series"},
    "article": {"it": "articolo", "en": "article"},
    "podcast": {"it": "podcast", "en": "podcast"},
    "video": {"it": "video", "en": "video"},
}


class CertifiedReadingMemory:
    def retrieve(
        self,
        db: Session,
        *,
        themes: Iterable[str] = (),
        explicit_themes: Iterable[str] = (),
        factor_codes: Iterable[str] = (),
        questionnaire_type: str = "",
        language: str = "it",
        query: str = "",
        limit: int = 2,
        ai_service=None,
        allow_sensitive: bool = False,
        audience_band: str | None = None,
    ) -> list[dict]:
        wanted = {str(t) for t in themes}
        explicit = {str(t) for t in explicit_themes}
        wanted |= explicit
        salient = {str(c).upper() for c in factor_codes}
        if not wanted and not salient:
            return []

        rows = (
            db.query(models.CertifiedReading)
            .filter(models.CertifiedReading.status == "certified",
                    models.CertifiedReading.is_active.is_(True))
            .order_by(models.CertifiedReading.sort_order.asc(), models.CertifiedReading.id.asc())
            .all()
        )
        questionnaire = (questionnaire_type or "").upper()
        eligible = []
        for row in rows:
            row_themes = {str(t) for t in (row.themes or [])}
            row_codes = {str(c).upper() for c in (row.factor_codes or [])}
            if not row_themes and not row_codes:
                continue  # una voce che entra ovunque non e' una raccomandazione
            scope = {s.upper() for s in (row.questionnaire_types or [])}
            if scope and questionnaire and questionnaire not in scope:
                continue
            matched_themes = row_themes & wanted
            if not matched_themes and not (row_codes & salient):
                continue
            if not audience_allows(row.audience, audience_band):
                continue
            if row.is_sensitive and not (allow_sensitive and (row_themes & explicit)):
                # Doppia condizione: l'admin deve averlo abilitato E il tema deve
                # essere stato nominato dallo studente. Nominare un tema vicino
                # non basta ad aprire materiale che tocca autolesionismo o morte.
                continue
            eligible.append((row, matched_themes))
        if not eligible:
            return []

        ranked = self._rank(db, [row for row, _ in eligible], query, language, ai_service, limit)
        matched_by_id = {row.id: matched for row, matched in eligible}
        return [self._render_entry(db, row, matched_by_id.get(row.id, set()), language) for row in ranked]

    # --- helpers ---
    def _rank(self, db: Session, rows, query, language, ai_service, limit):
        documents = [
            f"{row.title} {' '.join(row.themes or [])} "
            f"{self._i18n(db, row, row.summary_i18n, language)} "
            f"{self._i18n(db, row, row.why_i18n, language)}"
            for row in rows
        ]
        selected = None
        if query.strip():
            order = memory_embedder.rank(ai_service, query, documents, limit=len(rows))
            if order is not None:
                selected = [rows[i] for i in order]
        if selected is None:
            terms = self._terms(query)
            selected = sorted(
                rows,
                key=lambda row: len(self._terms(f"{row.title} {' '.join(row.themes or [])}") & terms),
                reverse=True,
            )
        # A parita' di pertinenza vince l'opera disponibile nella lingua del turno.
        selected.sort(key=lambda row: 0 if language in (row.available_languages or []) else 1)
        return selected[:max(0, limit)]

    def _render_entry(
        self, db: Session, row: models.CertifiedReading,
        matched_themes: set[str], language: str,
    ) -> dict:
        kind = (row.kind or "essay").lower()
        creators = ", ".join(row.creators or [])
        return {
            "id": row.slug,
            "kind": kind,
            "kind_label": KIND_LABELS.get(kind, {}).get(language) or KIND_LABELS.get(kind, {}).get("en", kind),
            "title": row.title,
            "creators": creators,
            "year": row.year,
            "publisher": row.publisher or "",
            "themes": sorted(matched_themes) or list(row.themes or []),
            "summary": self._i18n(db, row, row.summary_i18n, language),
            "why": self._i18n(db, row, row.why_i18n, language),
            "synopsis": self._clip(
                self._i18n(db, row, row.synopsis_i18n, language), MAX_SYNOPSIS_CHARS
            ),
            "languages": list(row.available_languages or []),
            "where": row.where_to_find or "",
            "audience": list(row.audience or []),
            "warning": (row.content_warning or "") if row.is_sensitive else "",
        }

    def render_context(self, entries: list[dict], language: str = "it") -> str:
        """Blocco per il prompt, nella lingua del turno.

        Il tag `[CERTIFIED_READINGS]` resta invariato: e' un marcatore per il
        motore, non una frase. Tutto il resto — direttiva d'uso ed etichette —
        segue la lingua, altrimenti un turno inglese riceve un testo inglese
        dentro una cornice italiana."""
        if not entries:
            return ""
        label = frame(language)
        lines = ["[CERTIFIED_READINGS]", label["intro"]]
        for entry in entries:
            head = f"- [{entry['kind_label']}] {entry['title']}"
            if entry["creators"]:
                head += f" — {entry['creators']}"
            if entry["year"]:
                head += f" ({entry['year']})"
            lines.append(head)
            if entry.get("synopsis"):
                lines.append(f"    {label['synopsis']}: {entry['synopsis']}")
            if entry["why"]:
                lines.append(f"    {label['why']}: {entry['why']}")
            elif entry["summary"]:
                lines.append(f"    {label['summary']}: {entry['summary']}")
            if entry["languages"]:
                lines.append(f"    {label['languages']}: {', '.join(entry['languages'])}")
            if entry["where"]:
                lines.append(f"    {label['where']}: {entry['where']}")
            if entry["warning"]:
                lines.append(f"    {label['warning']}: {entry['warning']}")
        return "\n".join(lines)[:MAX_READING_CONTEXT_CHARS]

    def _clip(self, text: str, limit: int) -> str:
        """Taglia sull'ultimo spazio utile, per non troncare a meta' parola."""
        text = (text or "").strip()
        if len(text) <= limit:
            return text
        cut = text[:limit].rsplit(" ", 1)[0].rstrip(" ,;:")
        return f"{cut}..."

    def _i18n(self, db: Session, row: models.CertifiedReading, data, language: str) -> str:
        if not isinstance(data, dict):
            return ""
        locale = served_locale(
            db, "certified_reading", row.slug, language or "it", fallbacks=("en", "it")
        )
        return (data.get(locale) or "").strip() if locale else ""

    def _terms(self, text: str) -> set[str]:
        return set(re.findall(r"[A-Za-zÀ-ÿ0-9]{3,}", (text or "").casefold()))


certified_reading_memory = CertifiedReadingMemory()
