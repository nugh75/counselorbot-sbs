"""
SessionMemory - memoria conversazionale deterministica su file Markdown.

Non usa il modello per generare riassunti. Mantiene un piccolo file .md per
session_id con stato, punteggi e pochi fatti rilevanti estratti con regole.
"""

from __future__ import annotations

import os
import re
import threading
import time
from pathlib import Path
from typing import Dict, List


DEFAULT_TTL_SECONDS = 7200
MAX_MEMORY_CHARS = 4000
MAX_INJECTED_MEMORY_CHARS = 1800
MAX_FACTS = 20
MAX_GOALS = 10
MAX_PREFERENCES = 10
MAX_EPISODES = 16


def _default_memory_dir() -> Path:
    return Path(os.environ.get("SESSION_MEMORY_DIR", "session_memory"))


class SessionMemory:
    """Thread-safe Markdown-backed session memory."""

    def __init__(self, ttl_seconds: int = DEFAULT_TTL_SECONDS, memory_dir: Path | None = None) -> None:
        self._lock = threading.Lock()
        self._ttl = ttl_seconds
        self._memory_dir = memory_dir or _default_memory_dir()
        self._memory_dir.mkdir(parents=True, exist_ok=True)

    # --- Public API compatible con il vecchio servizio ---

    def get_summary(self, session_id: str, include_scores: bool = True) -> str:
        """Restituisce il contesto Markdown della sessione."""
        with self._lock:
            text = self._read(session_id)
            if not text:
                return ""
            self._touch(session_id)
            if not include_scores:
                text = self._strip_section(text, "Punteggi")
            return text[:MAX_MEMORY_CHARS]

    def get_relevant_context(
        self,
        session_id: str,
        query: str = "",
        include_scores: bool = True,
        max_chars: int = MAX_INJECTED_MEMORY_CHARS,
    ) -> str:
        """Restituisce solo lo stato essenziale e gli episodi pertinenti alla richiesta."""
        with self._lock:
            text = self._read(session_id)
            if not text:
                return ""
            self._touch(session_id)
            data = self._parse(text)
            episodes = self._retrieve_episodes(data["episodes"], query, limit=4)
            parts = [
                "## Stato sessione",
                f"- Questionario: {data['questionnaire'] or '-'}",
                f"- Lingua: {data['language'] or '-'}",
                f"- Step corrente: {data['current_step'] or '-'}",
                f"- Step completati: {', '.join(data['completed_steps']) if data['completed_steps'] else '-'}",
            ]
            if include_scores and data["scores"]:
                parts.extend(["", "## Punteggi", str(data["scores"])])
            if data["goals"]:
                parts.extend(["", "## Obiettivi dichiarati", self._render_list(data["goals"][-3:])])
            if data["preferences"]:
                parts.extend(["", "## Preferenze dichiarate", self._render_list(data["preferences"][-3:])])
            if episodes:
                parts.extend(["", "## Ricordi pertinenti dell'utente", self._render_list(episodes)])
            if data["last_suggestion"] and (not query or episodes):
                parts.extend(["", "## Suggerimento precedente", str(data["last_suggestion"])[:350]])
            return "\n".join(parts)[:max_chars]

    def set_summary(self, session_id: str, new_summary: str) -> None:
        """Compatibilità legacy: salva testo grezzo come memoria importata."""
        if not new_summary or not new_summary.strip():
            return
        with self._lock:
            data = self._parse(self._read(session_id))
            data["facts"] = self._merge_unique(data["facts"], [f"Memoria precedente: {new_summary.strip()[:800]}"], MAX_FACTS)
            self._write(session_id, self._render(data))

    def clear(self, session_id: str) -> None:
        """Cancella la memoria della sessione."""
        with self._lock:
            path = self._path(session_id)
            if path.exists():
                path.unlink()

    def cleanup_expired(self) -> int:
        """Rimuove file memoria scaduti."""
        now = time.time()
        removed = 0
        with self._lock:
            for path in self._memory_dir.glob("*.md"):
                try:
                    if (now - path.stat().st_mtime) <= self._ttl:
                        continue
                    path.unlink()
                    removed += 1
                except OSError:
                    continue
        return removed

    def update_context(
        self,
        session_id: str,
        *,
        questionnaire_type: str = "",
        scores_context: str = "",
        language: str = "",
        phase: str = "",
        step_label: str = "",
        reset: bool = False,
    ) -> None:
        """Aggiorna stato e punteggi della sessione prima/dopo una chiamata."""
        with self._lock:
            if reset:
                path = self._path(session_id)
                if path.exists():
                    path.unlink()

            data = self._parse(self._read(session_id))
            if questionnaire_type:
                data["questionnaire"] = questionnaire_type
            if language:
                data["language"] = language
            if phase:
                data["current_step"] = step_label or phase
            if scores_context and not data["scores"]:
                data["scores"] = scores_context.strip()
            self._write(session_id, self._render(data))

    def record_interaction(
        self,
        session_id: str,
        *,
        user_message: str = "",
        bot_response: str = "",
        phase: str = "",
        step_label: str = "",
        scores_context: str = "",
        questionnaire_type: str = "",
        language: str = "",
        completed_step: bool = False,
    ) -> None:
        """Aggiorna memoria con stato, ultimo tema e pochi fatti estratti dall'utente."""
        with self._lock:
            data = self._parse(self._read(session_id))

            if questionnaire_type:
                data["questionnaire"] = questionnaire_type
            if language:
                data["language"] = language
            if scores_context and not data["scores"]:
                data["scores"] = scores_context.strip()
            if phase:
                data["current_step"] = step_label or phase
                if completed_step:
                    data["completed_steps"] = self._merge_unique(
                        data["completed_steps"], [step_label or phase], 40
                    )
            elif step_label:
                data["current_step"] = step_label
                if completed_step:
                    data["completed_steps"] = self._merge_unique(data["completed_steps"], [step_label], 40)

            user_text = self._clean_text(user_message)
            if user_text:
                data["last_topic"] = user_text[:300]
                data["episodes"] = self._merge_unique(data["episodes"], [user_text[:300]], MAX_EPISODES)
                facts, goals, preferences = self._extract_user_memory(user_text)
                data["facts"] = self._merge_unique(data["facts"], facts, MAX_FACTS)
                data["goals"] = self._merge_unique(data["goals"], goals, MAX_GOALS)
                data["preferences"] = self._merge_unique(data["preferences"], preferences, MAX_PREFERENCES)

            suggestion = self._extract_last_suggestion(bot_response)
            if suggestion:
                data["last_suggestion"] = suggestion

            self._write(session_id, self._render(data))

    # --- Parsing/rendering Markdown ---

    def _empty(self) -> Dict[str, object]:
        return {
            "questionnaire": "",
            "language": "",
            "current_step": "",
            "completed_steps": [],
            "scores": "",
            "facts": [],
            "goals": [],
            "preferences": [],
            "episodes": [],
            "last_topic": "",
            "last_suggestion": "",
        }

    def _parse(self, text: str) -> Dict[str, object]:
        data = self._empty()
        if not text:
            return data

        data["questionnaire"] = self._field(text, "Questionario")
        data["language"] = self._field(text, "Lingua")
        data["current_step"] = self._field(text, "Step corrente")
        completed = self._field(text, "Step completati")
        data["completed_steps"] = [s.strip() for s in completed.split(",") if s.strip()]
        data["scores"] = self._section(text, "Punteggi").replace("```text", "").replace("```", "").strip()
        data["facts"] = self._list_section(text, "Fatti rilevanti detti dall'utente")
        data["goals"] = self._list_section(text, "Obiettivi")
        data["preferences"] = self._list_section(text, "Preferenze")
        data["episodes"] = self._list_section(text, "Episodi utente")
        data["last_topic"] = self._section(text, "Ultimo tema discusso").strip()
        data["last_suggestion"] = self._section(text, "Ultimo suggerimento dato").strip()
        return data

    def _render(self, data: Dict[str, object]) -> str:
        completed = ", ".join(data["completed_steps"]) if data["completed_steps"] else "-"
        scores = str(data["scores"] or "").strip()
        parts = [
            "# Memoria sessione",
            "",
            "## Contesto",
            f"- Questionario: {data['questionnaire'] or '-'}",
            f"- Lingua: {data['language'] or '-'}",
            f"- Step corrente: {data['current_step'] or '-'}",
            f"- Step completati: {completed}",
            "",
            "## Punteggi",
            "```text",
            scores or "-",
            "```",
            "",
            "## Fatti rilevanti detti dall'utente",
            self._render_list(data["facts"]),
            "",
            "## Obiettivi",
            self._render_list(data["goals"]),
            "",
            "## Preferenze",
            self._render_list(data["preferences"]),
            "",
            "## Episodi utente",
            self._render_list(data["episodes"]),
            "",
            "## Ultimo tema discusso",
            str(data["last_topic"] or "-").strip(),
            "",
            "## Ultimo suggerimento dato",
            str(data["last_suggestion"] or "-").strip(),
            "",
        ]
        rendered = "\n".join(parts)
        return rendered[:MAX_MEMORY_CHARS]

    def _render_list(self, values: object) -> str:
        items = [str(v).strip() for v in (values or []) if str(v).strip()]
        return "\n".join(f"- {item}" for item in items) if items else "-"

    # --- Extraction heuristics ---

    def _extract_user_memory(self, user_text: str) -> tuple[List[str], List[str], List[str]]:
        sentences = [s.strip() for s in re.split(r"[\n.!?;]+", user_text) if 8 <= len(s.strip()) <= 260]
        facts: List[str] = []
        goals: List[str] = []
        preferences: List[str] = []

        for sentence in sentences[:6]:
            low = sentence.lower()
            normalized = sentence[0].upper() + sentence[1:] if sentence else sentence

            if re.search(r"\b(voglio|vorrei|devo|dovrei|obiettivo|migliorare|preparare|superare|riuscire a)\b", low):
                goals.append(normalized)
            if re.search(r"\b(preferisco|preferirei|mi trovo meglio|mi piace|non mi piace|consigli pratici|esempi concreti)\b", low):
                preferences.append(normalized)
            if re.search(
                r"\b(ho difficolt|faccio fatica|mi distraggo|non riesco|mi sento|sono ansios|studio|esame|interrogazione|matematica|universit|scuola)\b",
                low,
            ):
                facts.append(normalized)

        return facts[:3], goals[:3], preferences[:3]

    def _extract_last_suggestion(self, bot_response: str) -> str:
        text = self._clean_text(bot_response)
        if not text:
            return ""
        text = re.sub(r"\s+", " ", text)
        return text[:600]

    def _retrieve_episodes(self, episodes: object, query: str, limit: int) -> List[str]:
        items = [str(value).strip() for value in (episodes or []) if str(value).strip()]
        if not items:
            return []
        query_terms = self._terms(query)
        if not query_terms:
            return items[-min(2, limit):]
        scored = []
        for index, item in enumerate(items):
            overlap = len(query_terms & self._terms(item))
            if overlap:
                scored.append((overlap, index, item))
        if not scored:
            return items[-1:]
        scored.sort(key=lambda row: (row[0], row[1]), reverse=True)
        return [item for _, _, item in sorted(scored[:limit], key=lambda row: row[1])]

    def _terms(self, text: str) -> set[str]:
        stopwords = {
            "anche", "come", "della", "delle", "degli", "questo", "questa", "sono", "vorrei",
            "with", "that", "this", "from", "have", "quiero", "para", "avec", "dans",
            "dies", "eine", "jag", "och", "att",
        }
        words = re.findall(r"[^\W\d_]{3,}", (text or "").casefold(), flags=re.UNICODE)
        return {word for word in words if word not in stopwords}

    # --- Utilities ---

    def _path(self, session_id: str) -> Path:
        safe = re.sub(r"[^A-Za-z0-9_.-]", "_", session_id or "unknown")[:120]
        return self._memory_dir / f"{safe}.md"

    def _read(self, session_id: str) -> str:
        path = self._path(session_id)
        if not path.exists():
            return ""
        try:
            return path.read_text(encoding="utf-8")
        except OSError:
            return ""

    def _write(self, session_id: str, text: str) -> None:
        self._memory_dir.mkdir(parents=True, exist_ok=True)
        self._path(session_id).write_text(text, encoding="utf-8")

    def _touch(self, session_id: str) -> None:
        try:
            self._path(session_id).touch(exist_ok=True)
        except OSError:
            pass

    def _field(self, text: str, label: str) -> str:
        match = re.search(rf"^- {re.escape(label)}:\s*(.*)$", text, flags=re.MULTILINE)
        value = match.group(1).strip() if match else ""
        return "" if value == "-" else value

    def _section(self, text: str, title: str) -> str:
        match = re.search(rf"## {re.escape(title)}\n(.*?)(?=\n## |\Z)", text, flags=re.DOTALL)
        value = match.group(1).strip() if match else ""
        return "" if value == "-" else value

    def _list_section(self, text: str, title: str) -> List[str]:
        section = self._section(text, title)
        return [line[2:].strip() for line in section.splitlines() if line.startswith("- ") and line[2:].strip() != "-"]

    def _strip_section(self, text: str, title: str) -> str:
        return re.sub(rf"\n## {re.escape(title)}\n.*?(?=\n## |\Z)", "", text, flags=re.DOTALL).strip()

    def _merge_unique(self, existing: object, new_items: List[str], limit: int) -> List[str]:
        merged: List[str] = []
        seen = set()
        for item in list(existing or []) + new_items:
            cleaned = self._clean_text(str(item))
            key = cleaned.lower()
            if not cleaned or key in seen:
                continue
            seen.add(key)
            merged.append(cleaned)
        return merged[-limit:]

    def _clean_text(self, text: str) -> str:
        text = re.sub(r"\[\[AVANZA_STEP\]\]", "", text or "")
        text = re.sub(r"[#*_`>\[\]]", "", text)
        return re.sub(r"\s+", " ", text).strip()


session_memory = SessionMemory()
