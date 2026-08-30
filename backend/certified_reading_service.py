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
from .memory_embeddings import memory_embedder
from .reading_audience import audience_allows

MAX_READING_CONTEXT_CHARS = 1600

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

        ranked = self._rank([row for row, _ in eligible], query, language, ai_service, limit)
        matched_by_id = {row.id: matched for row, matched in eligible}
        return [self._render_entry(row, matched_by_id.get(row.id, set()), language) for row in ranked]

    # --- helpers ---
    def _rank(self, rows, query, language, ai_service, limit):
        documents = [
            f"{row.title} {' '.join(row.themes or [])} "
            f"{self._i18n(row.summary_i18n, language)} {self._i18n(row.why_i18n, language)}"
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

    def _render_entry(self, row: models.CertifiedReading, matched_themes: set[str], language: str) -> dict:
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
            "summary": self._i18n(row.summary_i18n, language),
            "why": self._i18n(row.why_i18n, language),
            "languages": list(row.available_languages or []),
            "where": row.where_to_find or "",
            "audience": list(row.audience or []),
            "warning": (row.content_warning or "") if row.is_sensitive else "",
        }

    def render_context(self, entries: list[dict], language: str = "it") -> str:
        if not entries:
            return ""
        lines = [
            "[CERTIFIED_READINGS]",
            "Catalogo approvato: sono le uniche opere che puoi consigliare come lettura, "
            "film o materiale. Cita al massimo due voci, con titolo e autore esatti come "
            "scritti qui, e di' in una frase che cosa aiutano a capire. Se una voce porta "
            "un'avvertenza, riportala. Non aggiungere titoli che non compaiano in questo elenco.",
        ]
        for entry in entries:
            head = f"- [{entry['kind_label']}] {entry['title']}"
            if entry["creators"]:
                head += f" — {entry['creators']}"
            if entry["year"]:
                head += f" ({entry['year']})"
            lines.append(head)
            if entry["why"]:
                lines.append(f"    Perche': {entry['why']}")
            elif entry["summary"]:
                lines.append(f"    Aiuta a capire: {entry['summary']}")
            if entry["languages"]:
                lines.append(f"    Disponibile in: {', '.join(entry['languages'])}")
            if entry["where"]:
                lines.append(f"    Dove si trova: {entry['where']}")
            if entry["warning"]:
                lines.append(f"    Avvertenza da riportare: {entry['warning']}")
        return "\n".join(lines)[:MAX_READING_CONTEXT_CHARS]

    def _i18n(self, data, language: str) -> str:
        if not isinstance(data, dict):
            return ""
        return (data.get(language) or data.get("en") or data.get("it") or "").strip()

    def _terms(self, text: str) -> set[str]:
        return set(re.findall(r"[A-Za-zÀ-ÿ0-9]{3,}", (text or "").casefold()))


certified_reading_memory = CertifiedReadingMemory()
