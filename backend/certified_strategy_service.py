"""Catalogo DB-backed delle strategie di apprendimento certificate.

Separato da `strategy_memory` (knowledge base su file Markdown): qui le voci sono
righe `CertifiedStrategy` curate dall'admin, con link a fattori e gating sul
profilo. Solo le strategie `status == "certified"` e `is_active` entrano nel
contesto della chat; il gating `match_mode` (any/all) decide se i `factor_codes`
collegati risultano salienti nel materiale gia' presente nella conversazione
(scores_context + query). Il ranking riusa `memory_embedder` come `StrategyMemory`.
"""
from __future__ import annotations

import re
from typing import Dict, List

from sqlalchemy.orm import Session

from . import models
from .memory_embeddings import memory_embedder

MAX_CERTIFIED_CONTEXT_CHARS = 1400


class CertifiedStrategyMemory:
    """Recupera dal catalogo le strategie certificate pertinenti a un turno di chat."""

    def retrieve(
        self,
        db: Session,
        questionnaire_type: str,
        scores_context: str = "",
        query: str = "",
        language: str = "it",
        limit: int = 2,
        ai_service=None,
    ) -> List[Dict[str, str]]:
        questionnaire = (questionnaire_type or "").upper()
        rows = (
            db.query(models.CertifiedStrategy)
            .filter(
                models.CertifiedStrategy.status == "certified",
                models.CertifiedStrategy.is_active.is_(True),
            )
            .order_by(
                models.CertifiedStrategy.sort_order.asc(),
                models.CertifiedStrategy.id.asc(),
            )
            .all()
        )

        # Fattori salienti = quelli gia' citati nel profilo/conversazione corrente.
        salient = self._factor_tokens(f"{scores_context} {query}")
        eligible = []
        for row in rows:
            scope = {item.upper() for item in (row.questionnaire_types or [])}
            if scope and questionnaire and questionnaire not in scope:
                continue
            if not self._factors_satisfied(row, salient):
                continue
            eligible.append(row)

        selected = None
        query_terms = self._terms(query)
        if query_terms or scores_context:
            documents = [
                f"{row.keywords or ''} "
                f"{self._localized(row, 'name', language)} "
                f"{self._localized(row, 'recommended_when', language)}".strip()
                for row in eligible
            ]
            ranked = memory_embedder.rank(
                ai_service, f"{scores_context} {query}".strip(), documents, limit=limit
            )
            if ranked is not None:
                selected = [eligible[index] for index in ranked]

        if selected is None:
            # Il gating sui fattori e' gia' il filtro di pertinenza: le keyword qui
            # servono solo a ordinare, non a escludere (a differenza di StrategyMemory).
            candidates = [
                (len(self._terms(row.keywords or "") & query_terms), row) for row in eligible
            ]
            candidates.sort(key=lambda item: item[0], reverse=True)
            selected = [row for _, row in candidates[:limit]]

        result = []
        for row in selected:
            name = self._localized(row, "name", language)
            recommended = self._localized(row, "recommended_when", language)
            how = self._localized(row, "description", language)
            if not (name or how or recommended):
                continue
            result.append(
                {
                    "id": row.slug,
                    "name": name,
                    "recommended_when": recommended,
                    "description": how,
                }
            )
        return result

    def render_context(self, strategies: List[Dict[str, str]], language: str = "it") -> str:
        if not strategies:
            return ""
        lines = [
            "## Strategie di apprendimento certificate",
            "Strategie validate, da proporre solo se pertinenti al profilo e alla "
            "conversazione; adattale alla situazione e non citarne l'identificatore.",
        ]
        for entry in strategies:
            parts = [f"- {entry['name'] or entry['id']}"]
            if entry.get("recommended_when"):
                parts.append(f"Quando: {entry['recommended_when']}")
            if entry.get("description"):
                parts.append(f"Come: {entry['description']}")
            lines.append(" — ".join(parts))
        return "\n".join(lines)[:MAX_CERTIFIED_CONTEXT_CHARS]

    # --- helpers ---
    def _factors_satisfied(self, row: models.CertifiedStrategy, salient: set[str]) -> bool:
        codes = {str(code).upper() for code in (row.factor_codes or []) if str(code).strip()}
        if not codes:
            return True
        if (row.match_mode or "any") == "all":
            return codes.issubset(salient)
        return bool(codes & salient)

    def _factor_tokens(self, text: str) -> set[str]:
        # Codici fattore: lettera/e + cifre (C6, A2, T1, AD1...). Match come token isolato.
        return {token.upper() for token in re.findall(r"\b[A-Za-z]{1,3}\d{1,2}\b", text or "")}

    def _localized(self, row: models.CertifiedStrategy, prefix: str, language: str) -> str:
        lang = language or "it"
        value = getattr(row, f"{prefix}_{lang}", None) or getattr(row, f"{prefix}_it", None)
        return (value or "").strip()

    def _terms(self, text: str) -> set[str]:
        return set(re.findall(r"[A-Za-zÀ-ÿ0-9]{2,}", (text or "").casefold()))


certified_strategy_memory = CertifiedStrategyMemory()
