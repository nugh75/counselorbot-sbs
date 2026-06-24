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

from .memory_embeddings import memory_embedder


DEFAULT_TTL_SECONDS = 7200
MAX_MEMORY_CHARS = 4000
MAX_INJECTED_MEMORY_CHARS = 1800
MAX_SCORES_CHARS = 1500
MAX_FACTS = 20
MAX_GOALS = 10
MAX_PREFERENCES = 10
MAX_EPISODES = 16
MAX_EXTERNAL_NOTES_CHARS = 1200


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
            return self._cut_at_line(text, MAX_MEMORY_CHARS)

    def get_scores(self, session_id: str) -> str:
        """Punteggi del profilo persistiti per la sessione (stringa grezza).

        Servono a iniettare i punteggi come riferimento permanente nel system
        prompt a ogni turno, anche nei follow-up dove il frontend non rimanda
        `scores_context`."""
        with self._lock:
            text = self._read(session_id)
            if not text:
                return ""
            self._touch(session_id)
        return str(self._parse(text).get("scores") or "")

    def get_relevant_context(
        self,
        session_id: str,
        query: str = "",
        include_scores: bool = True,
        max_chars: int = MAX_INJECTED_MEMORY_CHARS,
        ai_service=None,
    ) -> str:
        """Restituisce solo lo stato essenziale e gli episodi pertinenti alla richiesta."""
        with self._lock:
            text = self._read(session_id)
            if not text:
                return ""
            self._touch(session_id)
        # Parsing e retrieval fuori dal lock: l'eventuale chiamata di embedding
        # non deve serializzare le altre sessioni.
        data = self._parse(text)
        episodes = self._retrieve_episodes(data["episodes"], query, limit=4, ai_service=ai_service)
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
        if data["external_notes"]:
            parts.extend(["", "## Note condivise da OpenCode", str(data["external_notes"])])
        if episodes:
            parts.extend(["", "## Ricordi pertinenti dell'utente", self._render_list(episodes)])
        if data["last_suggestion"] and (not query or episodes):
            parts.extend(["", "## Suggerimento precedente", str(data["last_suggestion"])[:350]])
        return self._cut_at_line("\n".join(parts), max_chars)

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

    def sync_external_notes(self, session_id: str, notes: str) -> None:
        """Sincronizza le note persistenti prodotte da un'esperienza esterna."""
        cleaned = self._clean_multiline_text(notes)[:MAX_EXTERNAL_NOTES_CHARS]
        with self._lock:
            data = self._parse(self._read(session_id))
            data["external_notes"] = cleaned
            self._write(session_id, self._render(data))

    def get_progress(self, session_id: str) -> Dict[str, object]:
        """Restituisce lo stato necessario a ripristinare la UI guidata."""
        with self._lock:
            text = self._read(session_id)
            if not text:
                return {
                    "questionnaire": "",
                    "current_phase": "",
                    "completed_phases": [],
                }
            self._touch(session_id)
            data = self._parse(text)
            return {
                "questionnaire": data["questionnaire"],
                "current_phase": data["current_phase"],
                "completed_phases": data["completed_phases"],
            }

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
                data["current_phase"] = phase
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
                data["current_phase"] = phase
                data["current_step"] = step_label or phase
                if completed_step:
                    data["completed_phases"] = self._merge_unique(
                        data["completed_phases"], [phase], 40
                    )
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
                facts, goals, preferences = self._extract_user_memory(user_text, str(data["language"] or ""))
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
            "current_phase": "",
            "current_step": "",
            "completed_phases": [],
            "completed_steps": [],
            "scores": "",
            "facts": [],
            "goals": [],
            "preferences": [],
            "external_notes": "",
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
        data["current_phase"] = self._field(text, "Fase corrente")
        data["current_step"] = self._field(text, "Step corrente")
        completed_phases = self._field(text, "Fasi completate")
        data["completed_phases"] = [s.strip() for s in completed_phases.split(",") if s.strip()]
        completed = self._field(text, "Step completati")
        data["completed_steps"] = [s.strip() for s in completed.split(",") if s.strip()]
        data["scores"] = self._section(text, "Punteggi").replace("```text", "").replace("```", "").strip()
        data["facts"] = self._list_section(text, "Fatti rilevanti detti dall'utente")
        data["goals"] = self._list_section(text, "Obiettivi")
        data["preferences"] = self._list_section(text, "Preferenze")
        data["external_notes"] = self._section(text, "Note condivise da OpenCode").strip()
        data["episodes"] = self._list_section(text, "Episodi utente")
        data["last_topic"] = self._section(text, "Ultimo tema discusso").strip()
        data["last_suggestion"] = self._section(text, "Ultimo suggerimento dato").strip()
        return data

    def _render(self, data: Dict[str, object]) -> str:
        rendered = self._render_full(data)
        if len(rendered) <= MAX_MEMORY_CHARS:
            return rendered
        # Oltre il limite: scarta gli elementi più vecchi dalle liste più lunghe,
        # mai un taglio a metà sezione (romperebbe il parse successivo).
        trimmed = dict(data)
        for key in ("episodes", "facts", "preferences", "goals"):
            trimmed[key] = list(trimmed.get(key) or [])
        while len(rendered) > MAX_MEMORY_CHARS:
            key = max(("episodes", "facts", "preferences", "goals"), key=lambda k: len(trimmed[k]))
            if trimmed[key]:
                trimmed[key].pop(0)
            elif trimmed.get("scores"):
                trimmed["scores"] = ""
            elif trimmed.get("external_notes"):
                current = str(trimmed["external_notes"])
                trimmed["external_notes"] = current[:600] if len(current) > 600 else ""
            else:
                return self._cut_at_line(rendered, MAX_MEMORY_CHARS)
            rendered = self._render_full(trimmed)
        return rendered

    def _render_full(self, data: Dict[str, object]) -> str:
        completed_phases = ", ".join(data["completed_phases"]) if data["completed_phases"] else "-"
        completed = ", ".join(data["completed_steps"]) if data["completed_steps"] else "-"
        scores = self._cut_at_line(str(data["scores"] or "").strip(), MAX_SCORES_CHARS)
        parts = [
            "# Memoria sessione",
            "",
            "## Contesto",
            f"- Questionario: {data['questionnaire'] or '-'}",
            f"- Lingua: {data['language'] or '-'}",
            f"- Fase corrente: {data['current_phase'] or '-'}",
            f"- Step corrente: {data['current_step'] or '-'}",
            f"- Fasi completate: {completed_phases}",
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
            "## Note condivise da OpenCode",
            str(data["external_notes"] or "-").strip(),
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
        return "\n".join(parts)

    def _render_list(self, values: object) -> str:
        items = [str(v).strip() for v in (values or []) if str(v).strip()]
        return "\n".join(f"- {item}" for item in items) if items else "-"

    # --- Extraction heuristics ---

    # Pattern per lingua (it/en/es/fr/de/sv, allineate a frontend i18n.ts).
    # Ogni voce è un frammento regex già ancorato dove serve: `\b` finale solo
    # per parole complete, prefissi nudi per coprire flessioni e accenti
    # ("difficolt" → difficoltà/difficolta, "ansios" → ansioso/ansiosa).
    _EXTRACTION_PATTERNS: Dict[str, Dict[str, List[str]]] = {
        "goals": {
            "it": [r"voglio\b", r"vorrei\b", r"devo\b", r"dovrei\b", r"obiettiv", r"migliorare\b", r"preparar", r"superare\b", r"riuscire a\b"],
            "en": [r"i want\b", r"i'd like\b", r"i would like\b", r"i need to\b", r"i have to\b", r"i should\b", r"my goal", r"improve\b", r"improving\b", r"prepare for\b", r"pass the\b", r"manage to\b", r"aim to\b"],
            "es": [r"quiero\b", r"querr[íi]a\b", r"me gustar[íi]a\b", r"tengo que\b", r"debo\b", r"deber[íi]a\b", r"objetivo", r"mejorar\b", r"preparar", r"aprobar\b", r"lograr\b", r"conseguir\b"],
            "fr": [r"je veux\b", r"je voudrais\b", r"j'aimerais\b", r"je dois\b", r"je devrais\b", r"objectif", r"am[ée]liorer\b", r"pr[ée]parer\b", r"r[ée]ussir\b", r"parvenir [àa]\b"],
            "de": [r"ich will\b", r"ich m[öo]chte\b", r"ich muss\b", r"ich sollte\b", r"\bziel\b", r"verbessern\b", r"vorbereiten\b", r"bestehen\b", r"schaffen\b"],
            "sv": [r"jag vill\b", r"jag skulle vilja\b", r"jag m[åa]ste\b", r"jag borde\b", r"\bm[åa]l\b", r"f[öo]rb[äa]ttra\b", r"f[öo]rbereda\b", r"klara\b"],
        },
        "preferences": {
            "it": [r"preferisco\b", r"preferirei\b", r"mi trovo meglio\b", r"mi piace\b", r"non mi piace\b", r"consigli pratici\b", r"esempi concreti\b"],
            "en": [r"i prefer\b", r"i'd prefer\b", r"i like\b", r"i don't like\b", r"i dislike\b", r"works better for me\b", r"practical tips\b", r"concrete examples\b"],
            "es": [r"prefiero\b", r"preferir[íi]a\b", r"me gusta\b", r"no me gusta\b", r"me funciona mejor\b", r"consejos pr[áa]cticos\b", r"ejemplos concretos\b"],
            "fr": [r"je pr[ée]f[èe]re\b", r"je pr[ée]f[ée]rerais\b", r"j'aime\b", r"je n'aime pas\b", r"[çc]a marche mieux\b", r"conseils pratiques\b", r"exemples concrets\b"],
            "de": [r"ich bevorzuge\b", r"ich mag\b", r"ich mag nicht\b", r"mir gef[äa]llt\b", r"funktioniert besser\b", r"praktische tipps\b", r"konkrete beispiele\b"],
            "sv": [r"jag f[öo]redrar\b", r"jag gillar\b", r"jag gillar inte\b", r"fungerar b[äa]ttre\b", r"praktiska tips\b", r"konkreta exempel\b"],
        },
        "facts": {
            "it": [r"ho difficolt", r"faccio fatica\b", r"mi distraggo\b", r"non riesco\b", r"mi sento\b", r"sono ansios", r"studio\b", r"studiare\b", r"esam[ei]\b", r"interrogazion", r"matematica\b", r"universit", r"scuola\b"],
            "en": [r"i struggle\b", r"i have trouble\b", r"i have difficulty\b", r"hard for me\b", r"i get distracted\b", r"i can'?t\b", r"i cannot\b", r"i feel\b", r"i'?m anxious\b", r"i am anxious\b", r"\bstudy", r"\bstudying\b", r"\bexams?\b", r"\btests?\b", r"\bmaths?\b", r"university\b", r"college\b", r"school\b"],
            "es": [r"me cuesta\b", r"tengo dificultad", r"me distraigo\b", r"no puedo\b", r"no consigo\b", r"me siento\b", r"estoy ansios", r"estudi", r"\bex[áa]men", r"matem[áa]ticas\b", r"universidad\b", r"escuela\b", r"instituto\b"],
            "fr": [r"j'ai du mal\b", r"j'ai des difficult[ée]s\b", r"je me distrais\b", r"je n'arrive pas\b", r"je me sens\b", r"je suis anxieu", r"[ée]tudi", r"\bexamen", r"contr[ôo]le\b", r"math[ée]matiques\b", r"universit[ée]\b", r"[ée]cole\b", r"lyc[ée]e\b"],
            "de": [r"f[äa]llt mir schwer\b", r"ich habe schwierigkeiten\b", r"ich werde abgelenkt\b", r"lasse mich ablenken\b", r"ich kann nicht\b", r"ich f[üu]hle mich\b", r"ich bin [äa]ngstlich\b", r"nerv[öo]s\b", r"\blernen\b", r"studium\b", r"pr[üu]fung", r"klausur", r"\bmathe\b", r"universit[äa]t\b", r"schule\b"],
            "sv": [r"jag har sv[åa]rt\b", r"sv[åa]rt f[öo]r mig\b", r"jag blir distraherad\b", r"jag kan inte\b", r"jag k[äa]nner mig\b", r"jag [äa]r orolig\b", r"nerv[öo]s\b", r"plugga\b", r"studera\b", r"tentamen\b", r"\bprov\b", r"\bmatte\b", r"universitet\b", r"skola", r"skolan\b"],
        },
    }

    _compiled_extraction: Dict[str, tuple] = {}

    @classmethod
    def _extraction_regexes(cls, language: str) -> tuple:
        """Regex compilate (goals, preferences, facts) per la lingua; lingua
        sconosciuta o vuota → unione di tutte (non si perde nulla)."""
        lang = (language or "").strip().lower()[:2]
        if lang not in cls._EXTRACTION_PATTERNS["goals"]:
            lang = "*"
        cached = cls._compiled_extraction.get(lang)
        if cached:
            return cached
        compiled = []
        for category in ("goals", "preferences", "facts"):
            table = cls._EXTRACTION_PATTERNS[category]
            parts = table[lang] if lang != "*" else [p for items in table.values() for p in items]
            compiled.append(re.compile(r"\b(?:" + "|".join(parts) + r")", flags=re.UNICODE))
        cls._compiled_extraction[lang] = tuple(compiled)
        return cls._compiled_extraction[lang]

    def _extract_user_memory(self, user_text: str, language: str = "") -> tuple[List[str], List[str], List[str]]:
        sentences = [s.strip() for s in re.split(r"[\n.!?;]+", user_text) if 8 <= len(s.strip()) <= 260]
        facts: List[str] = []
        goals: List[str] = []
        preferences: List[str] = []
        goal_re, pref_re, fact_re = self._extraction_regexes(language)

        for sentence in sentences[:6]:
            low = sentence.lower()
            normalized = sentence[0].upper() + sentence[1:] if sentence else sentence

            if goal_re.search(low):
                goals.append(normalized)
            if pref_re.search(low):
                preferences.append(normalized)
            if fact_re.search(low):
                facts.append(normalized)

        return facts[:3], goals[:3], preferences[:3]

    def _extract_last_suggestion(self, bot_response: str) -> str:
        text = self._clean_text(bot_response)
        if not text:
            return ""
        text = re.sub(r"\s+", " ", text)
        return text[:600]

    def _retrieve_episodes(self, episodes: object, query: str, limit: int, ai_service=None) -> List[str]:
        items = [str(value).strip() for value in (episodes or []) if str(value).strip()]
        if not items:
            return []
        query_terms = self._terms(query)
        if not query_terms:
            return items[-min(2, limit):]
        # Ranking semantico (bge-m3 via Ollama) quando disponibile; None = fallback keyword.
        ranked = memory_embedder.rank(ai_service, query, items, limit=limit)
        if ranked is not None:
            if not ranked:
                return items[-1:]
            return [items[index] for index in sorted(ranked)]
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

    def _cut_at_line(self, text: str, limit: int) -> str:
        if len(text) <= limit:
            return text
        cut = text[:limit]
        return cut.rsplit("\n", 1)[0] if "\n" in cut else cut

    def _clean_text(self, text: str) -> str:
        text = re.sub(r"\[\[AVANZA_STEP\]\]", "", text or "")
        text = text.replace("’", "'")  # apostrofo tipografico → ASCII (le regex usano ')
        text = re.sub(r"[#*_`>\[\]]", "", text)
        return re.sub(r"\s+", " ", text).strip()

    def _clean_multiline_text(self, text: str) -> str:
        lines = []
        for line in (text or "").splitlines():
            cleaned = re.sub(r"\[\[AVANZA_STEP\]\]", "", line)
            cleaned = re.sub(r"[`>\[\]]", "", cleaned).strip()
            if cleaned:
                lines.append(cleaned)
        return "\n".join(lines)


session_memory = SessionMemory()
