"""Knowledge base collettiva delle strategie, separata dalla memoria utente."""

from __future__ import annotations

import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List

from sqlalchemy.orm import Session

from . import models
from .memory_embeddings import memory_embedder


DEFAULT_PATH = Path("knowledge/approved_strategies.md")
APPROVED_STRATEGIES_CONFIG_KEY = "approved_strategies_markdown"
MAX_STRATEGY_CONTEXT_CHARS = 1000
MAX_SHARED_RESPONSE_CHARS = 1200
STRATEGY_FILE_HEADER = """# Strategie condivise

Questo archivio contiene interventi generici candidati all'uso collettivo.
Il backend inietta nel contesto solo voci con `status: approved`. I feedback
sono raccolti separatamente e non inseriscono testi personali in questo file.
"""


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
        ai_service=None,
        markdown_text: str | None = None,
    ) -> List[Dict[str, str]]:
        query_terms = self._terms(f"{phase} {query}")
        questionnaire = (questionnaire_type or "").upper()
        eligible = []
        for strategy in self.list_records(markdown_text):
            if strategy.get("status", "").lower() != "approved":
                continue
            accepted = {item.upper() for item in self._csv(strategy.get("questionnaires", ""))}
            if accepted and questionnaire and questionnaire not in accepted:
                continue
            eligible.append(strategy)

        selected = None
        if query_terms:
            # Ranking semantico su keyword + testo della strategia; None = fallback keyword.
            documents = [
                f"{strategy.get('keywords', '')} "
                f"{strategy.get(f'text.{language}') or strategy.get('text.it') or ''}".strip()
                for strategy in eligible
            ]
            ranked = memory_embedder.rank(ai_service, f"{phase} {query}".strip(), documents, limit=limit)
            if ranked is not None:
                selected = [eligible[index] for index in ranked]

        if selected is None:
            candidates = []
            for strategy in eligible:
                keywords = self._terms(strategy.get("keywords", ""))
                overlap = len(keywords & query_terms)
                if query_terms and keywords and not overlap:
                    continue
                strategy["_score"] = str(overlap)
                candidates.append(strategy)
            candidates.sort(key=lambda item: int(item.get("_score", "0")), reverse=True)
            selected = candidates[:limit]

        result = []
        for strategy in selected:
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

    def approved_ids(self, markdown_text: str | None = None) -> set[str]:
        return {
            strategy["id"]
            for strategy in self.list_records(markdown_text)
            if strategy.get("status", "").lower() == "approved"
        }

    def list_records(self, markdown_text: str | None = None) -> List[Dict[str, str]]:
        if markdown_text is not None:
            return self.parse_markdown(markdown_text)
        try:
            text = self._path.read_text(encoding="utf-8")
        except OSError:
            return []
        return self.parse_markdown(text)

    def read_markdown(self) -> str:
        try:
            return self._path.read_text(encoding="utf-8")
        except OSError:
            return STRATEGY_FILE_HEADER

    def parse_markdown(self, text: str) -> List[Dict[str, str]]:
        records = []
        for block in re.split(r"(?=^##\s+)", text or "", flags=re.MULTILINE):
            heading = re.match(r"^##\s+([A-Za-z0-9_.-]+)\s*$", block, flags=re.MULTILINE)
            if not heading:
                continue
            record: Dict[str, str] = {"id": heading.group(1)}
            for key, value in re.findall(r"^-\s+([A-Za-z0-9_.-]+):\s*(.+?)\s*$", block, flags=re.MULTILINE):
                record[key] = value.strip()
            records.append(record)
        return records

    def render_markdown(self, records: List[Dict[str, str]]) -> str:
        blocks = [STRATEGY_FILE_HEADER.rstrip()]
        for record in records:
            strategy_id = str(record.get("id") or "").strip()
            if not strategy_id:
                continue
            lines = [f"## {strategy_id}"]
            for key in sorted(k for k in record.keys() if k != "id"):
                value = str(record.get(key) or "").replace("\n", " ").strip()
                if value:
                    lines.append(f"- {key}: {value}")
            blocks.append("\n".join(lines))
        return "\n\n".join(blocks).rstrip() + "\n"

    def _load(self) -> List[Dict[str, str]]:
        return self.list_records()

    def _csv(self, value: str) -> List[str]:
        return [item.strip() for item in value.split(",") if item.strip()]

    def _terms(self, text: str) -> set[str]:
        return set(re.findall(r"[A-Za-zÀ-ÿ0-9]{2,}", (text or "").casefold()))


strategy_memory = StrategyMemory()


class SharedResponseMemory:
    """Memoria anonima delle risposte AI valutate utili dagli studenti."""

    def create_candidate(
        self,
        db: Session,
        response_text: str,
        questionnaire_type: str,
        phase: str = "",
        language: str = "it",
    ) -> str | None:
        questionnaire = (questionnaire_type or "").upper()
        text = (response_text or "").replace("[[AVANZA_STEP]]", "").strip()
        text = re.sub(
            r"\b\d+(?:[.,]\d+)?\s*/\s*(?:4|5|9)\b",
            "[punteggio omesso]",
            text,
        )
        if not questionnaire or not text:
            return None
        stale_cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        db.query(models.SharedChatResponse).filter(
            models.SharedChatResponse.helpful.is_(None),
            models.SharedChatResponse.created_at < stale_cutoff,
        ).delete(synchronize_session=False)
        response_id = str(uuid.uuid4())
        db.add(models.SharedChatResponse(
            id=response_id,
            questionnaire_type=questionnaire,
            phase=phase or "",
            language=language or "it",
            response_text=text[:8000],
        ))
        return response_id

    def rate(self, db: Session, response_id: str, helpful: bool) -> bool:
        response = db.query(models.SharedChatResponse).filter(
            models.SharedChatResponse.id == response_id
        ).first()
        if not response:
            return False
        if response.helpful is None:
            response.helpful = helpful
            response.rated_at = datetime.now(timezone.utc)
        return True

    def retrieve(
        self,
        db: Session,
        questionnaire_type: str,
        phase: str = "",
        query: str = "",
        language: str = "it",
        limit: int = 1,
    ) -> List[Dict[str, str]]:
        questionnaire = (questionnaire_type or "").upper()
        if not questionnaire:
            return []
        rows_query = db.query(models.SharedChatResponse).filter(
            models.SharedChatResponse.questionnaire_type == questionnaire,
            models.SharedChatResponse.language == (language or "it"),
            models.SharedChatResponse.helpful.is_(True),
        )
        if phase:
            rows_query = rows_query.filter(models.SharedChatResponse.phase == phase)
        rows = rows_query.order_by(models.SharedChatResponse.created_at.desc()).limit(30).all()
        terms = self._terms(query)
        ranked = sorted(
            rows,
            key=lambda row: len(self._terms(row.response_text) & terms),
            reverse=True,
        )
        return [{"id": row.id, "text": row.response_text} for row in ranked[:limit]]

    def render_context(self, responses: List[Dict[str, str]]) -> str:
        if not responses:
            return ""
        lines = [
            "## Risposte precedenti valutate utili",
            "Usale solo come riferimento per la qualita della risposta. "
            "Non copiare punteggi, dati individuali o conclusioni riferite ad altri studenti.",
        ]
        lines.extend(f"- {entry['text']}" for entry in responses)
        return "\n".join(lines)[:MAX_SHARED_RESPONSE_CHARS]

    def _terms(self, text: str) -> set[str]:
        return set(re.findall(r"[A-Za-zÀ-ÿ0-9]{2,}", (text or "").casefold()))


shared_response_memory = SharedResponseMemory()
