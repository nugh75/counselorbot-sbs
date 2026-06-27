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

_QSA_INVERTED_CODES = {"C3", "C6", "A1", "A4", "A5", "A7"}
# QSAr usa codici con suffisso "r" (costrutto/direzione diversi dal QSA): solo
# C4r (carenza nel controllo dell'attenzione) e A1r (ansieta') sono invertiti.
_QSAR_INVERTED_CODES = {"C4R", "A1R"}

_BAND_LABELS = {
    "it": {
        "growth": "Area di crescita",
        "adequate": "Adeguato",
        "normal": "Normale",
        "strength": "Forza",
    },
    "en": {
        "growth": "Area for growth",
        "adequate": "Adequate",
        "normal": "Normal",
        "strength": "Strength",
    },
}

_TARGET_BAND_PATTERNS = {
    "growth": re.compile(
        r"(area\s+di\s+crescita|area\s+da\s+migliorare|difficolt[aà]|critic|growth|improvement|mejora)",
        re.IGNORECASE,
    ),
    "strength": re.compile(r"(forza|risorsa|strength|fortaleza|st[äa]rke|styrka)", re.IGNORECASE),
    "adequate": re.compile(r"(adeguat|normal|normale|adequate)", re.IGNORECASE),
}

_SCORE_RE = re.compile(r"\b([CA]\d{1,2}[A-Za-z]?)\b[^\n\r0-9]{0,80}?([1-9])\s*/\s*9\b", re.IGNORECASE)


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
        # I punteggi, quando disponibili, rendono il retrieval score-aware: una
        # strategia dichiarata per "area di crescita" non deve essere proposta
        # come intervento se quel fattore e' una forza nel profilo corrente.
        salient = self._factor_tokens(f"{scores_context} {query}")
        score_bands = self._score_bands(questionnaire, scores_context)
        profile_alignment: dict[int, dict[str, str]] = {}
        eligible = []
        for row in rows:
            scope = {item.upper() for item in (row.questionnaire_types or [])}
            if scope and questionnaire and questionnaire not in scope:
                continue
            if not self._factors_satisfied(row, salient):
                continue
            alignment = self._profile_alignment(row, questionnaire, score_bands, language)
            if alignment["role"] == "exclude":
                continue
            profile_alignment[row.id] = alignment
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
                (
                    self._profile_rank(profile_alignment.get(row.id, {}))
                    + len(self._terms(row.keywords or "") & query_terms),
                    row,
                )
                for row in eligible
            ]
            candidates.sort(key=lambda item: item[0], reverse=True)
            selected = [row for _, row in candidates[:limit]]
        else:
            selected.sort(key=lambda row: self._profile_rank(profile_alignment.get(row.id, {})), reverse=True)

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
                    "advice_role": profile_alignment.get(row.id, {}).get("role", "primary"),
                    "profile_note": profile_alignment.get(row.id, {}).get("note", ""),
                }
            )
        return result

    def render_context(self, strategies: List[Dict[str, str]], language: str = "it") -> str:
        if not strategies:
            return ""
        lines = [
            "[CERTIFIED_STRATEGIES]",
            "## Strategie di apprendimento certificate",
            "Fonte autorizzata per consigli pratici, esercizi, piani d'azione e "
            "strategie di studio. Proponi solo queste strategie quando sono "
            "pertinenti; adattale alla situazione e non citarne l'identificatore. "
            "Se una strategia e' indicata come intervento principale, usala come "
            "base del piano pratico; se e' indicata come supporto, usala solo per "
            "valorizzare una risorsa e non trasformarla in problema.",
        ]
        for entry in strategies:
            parts = [f"- {entry['name'] or entry['id']}"]
            if entry.get("advice_role"):
                role = "intervento principale" if entry["advice_role"] == "primary" else "supporto/risorsa"
                parts.append(f"Ruolo: {role}")
            if entry.get("profile_note"):
                parts.append(f"Profilo: {entry['profile_note']}")
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
        # Codici fattore: lettera/e + cifre + suffisso opzionale (C6, A2, T1, AD1,
        # C1r, A4r...). Match come token isolato; upper-case per confronto stabile.
        return {token.upper() for token in re.findall(r"\b[A-Za-z]{1,3}\d{1,2}[A-Za-z]?\b", text or "")}

    def _score_bands(self, questionnaire: str, scores_context: str) -> dict[str, dict[str, str]]:
        if questionnaire not in ("QSA", "QSAR") or not scores_context:
            return {}
        out: dict[str, dict[str, str]] = {}
        for code, raw_score in _SCORE_RE.findall(scores_context):
            code = code.upper()
            score = int(raw_score)
            band = self._band_for_qsa_score(code, score)
            out[code] = {"score": str(score), "band": band, "label_it": _BAND_LABELS["it"][band]}
        return out

    def _band_for_qsa_score(self, code: str, score: int) -> str:
        code_u = code.upper()
        inverted = _QSAR_INVERTED_CODES if code_u.endswith("R") else _QSA_INVERTED_CODES
        if code_u in inverted:
            if score <= 3:
                return "strength"
            if score <= 6:
                return "normal"
            return "growth"
        if score <= 3:
            return "growth"
        if score <= 6:
            return "adequate"
        return "strength"

    def _target_bands(self, row: models.CertifiedStrategy, language: str) -> set[str]:
        text = self._localized(row, "recommended_when", language) or self._localized(row, "recommended_when", "it")
        return {band for band, pattern in _TARGET_BAND_PATTERNS.items() if pattern.search(text or "")}

    def _profile_alignment(
        self,
        row: models.CertifiedStrategy,
        questionnaire: str,
        score_bands: dict[str, dict[str, str]],
        language: str,
    ) -> dict[str, str]:
        codes = [str(code).upper() for code in (row.factor_codes or []) if str(code).strip()]
        if questionnaire not in ("QSA", "QSAR") or not codes or not score_bands:
            return {"role": "primary", "note": ""}

        code_bands = {code: score_bands[code] for code in codes if code in score_bands}
        if not code_bands:
            return {"role": "primary", "note": ""}

        target_bands = self._target_bands(row, language)
        if target_bands and not any(info["band"] in target_bands for info in code_bands.values()):
            return {"role": "exclude", "note": ""}

        growth_codes = [code for code, info in code_bands.items() if info["band"] == "growth"]
        role = "primary" if growth_codes or "growth" in target_bands else "support"
        note = "; ".join(
            f"{code}={info['score']}/9 ({info['label_it']})" for code, info in sorted(code_bands.items())
        )
        if role == "primary" and growth_codes:
            note = f"{note}; target di intervento: {', '.join(sorted(growth_codes))}"
        elif role == "support":
            note = f"{note}; usare solo come risorsa di supporto"
        return {"role": role, "note": note}

    def _profile_rank(self, alignment: dict[str, str]) -> int:
        role = alignment.get("role")
        if role == "primary":
            return 100
        if role == "support":
            return 10
        return 0

    def _localized(self, row: models.CertifiedStrategy, prefix: str, language: str) -> str:
        lang = language or "it"
        value = getattr(row, f"{prefix}_{lang}", None) or getattr(row, f"{prefix}_it", None)
        return (value or "").strip()

    def _terms(self, text: str) -> set[str]:
        return set(re.findall(r"[A-Za-zÀ-ÿ0-9]{2,}", (text or "").casefold()))


certified_strategy_memory = CertifiedStrategyMemory()
