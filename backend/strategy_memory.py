"""Knowledge base collettiva delle strategie, separata dalla memoria utente."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Dict, List


DEFAULT_PATH = Path("knowledge/approved_strategies.md")
MAX_STRATEGY_CONTEXT_CHARS = 1000


class StrategyMemory:
    """Legge strategie editorialmente approvate da un file Markdown versionabile."""

    def __init__(self, path: Path | None = None) -> None:
        self._path = path or Path(os.environ.get("STRATEGY_MEMORY_FILE", str(DEFAULT_PATH)))

    def retrieve(
        self,
        questionnaire_type: str,
        phase: str = "",
        query: str = "",
        language: str = "it",
        limit: int = 2,
    ) -> List[Dict[str, str]]:
        candidates = []
        query_terms = self._terms(f"{phase} {query}")
        questionnaire = (questionnaire_type or "").upper()
        for strategy in self._load():
            if strategy.get("status", "").lower() != "approved":
                continue
            accepted = {item.upper() for item in self._csv(strategy.get("questionnaires", ""))}
            if accepted and questionnaire and questionnaire not in accepted:
                continue
            keywords = self._terms(strategy.get("keywords", ""))
            overlap = len(keywords & query_terms)
            if query_terms and keywords and not overlap:
                continue
            strategy["_score"] = str(overlap)
            candidates.append(strategy)
        candidates.sort(key=lambda item: int(item.get("_score", "0")), reverse=True)
        result = []
        for strategy in candidates[:limit]:
            text = strategy.get(f"text.{language}") or strategy.get("text.it") or ""
            if text:
                result.append({"id": strategy["id"], "text": text})
        return result

    def render_context(self, strategies: List[Dict[str, str]]) -> str:
        if not strategies:
            return ""
        lines = [
            "## Strategie di supporto approvate",
            "Usale solo se pertinenti e adattale alla situazione; non citarne l'identificatore.",
        ]
        lines.extend(f"- [{entry['id']}] {entry['text']}" for entry in strategies)
        return "\n".join(lines)[:MAX_STRATEGY_CONTEXT_CHARS]

    def approved_ids(self) -> set[str]:
        return {
            strategy["id"]
            for strategy in self._load()
            if strategy.get("status", "").lower() == "approved"
        }

    def _load(self) -> List[Dict[str, str]]:
        try:
            text = self._path.read_text(encoding="utf-8")
        except OSError:
            return []
        records = []
        for block in re.split(r"(?=^##\s+)", text, flags=re.MULTILINE):
            heading = re.match(r"^##\s+([A-Za-z0-9_.-]+)\s*$", block, flags=re.MULTILINE)
            if not heading:
                continue
            record: Dict[str, str] = {"id": heading.group(1)}
            for key, value in re.findall(r"^-\s+([A-Za-z0-9_.-]+):\s*(.+?)\s*$", block, flags=re.MULTILINE):
                record[key] = value.strip()
            records.append(record)
        return records

    def _csv(self, value: str) -> List[str]:
        return [item.strip() for item in value.split(",") if item.strip()]

    def _terms(self, text: str) -> set[str]:
        return set(re.findall(r"[A-Za-zÀ-ÿ0-9]{2,}", (text or "").casefold()))


strategy_memory = StrategyMemory()
