"""Logica di chat e helper puri estratti da main.py.

Nessun endpoint qui: solo funzioni di supporto (risoluzione prompt,
sanitizzazione QSA/ZTPI, contesto recuperato, ecc.) e le costanti correlate.
Importato dai router in backend/routes/."""
import json
import re
import logging
import asyncio
import uuid
from typing import List, Optional

from fastapi import HTTPException

from . import models
from . import database
from .anonymous_codes import code_for_identity
from .ai_service import AIService
from .memory_service import session_memory
from .strategy_memory import APPROVED_STRATEGIES_CONFIG_KEY, shared_response_memory, strategy_memory
from .certified_strategy_service import certified_strategy_memory
from .rag_index import site_rag_index, counselorbot_rag_index, questionari_rag_index, build_context as rag_build_context
from .api_models import ChatRequest
from .prompt_config import (
    DEFAULT_SYSTEM_PROMPT_GENERIC,
    DEFAULT_GUIDED_STEPS,
    DEFAULT_QSAR_GUIDED_STEPS,
    DEFAULT_ZTPI_GUIDED_STEPS,
    DEFAULT_SAVICKAS_GUIDED_STEPS,
    DEFAULT_QPCS_GUIDED_STEPS,
    DEFAULT_QPCC_GUIDED_STEPS,
    DEFAULT_QAP_GUIDED_STEPS,
    GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS,
    MODE_TO_SYSTEM_PROMPT_KEY,
    SYSTEM_PROMPT_DEFAULTS,
)

logger = logging.getLogger(__name__)


async def _memory_cleanup_loop(interval_seconds: int = 600):
    """Background task: pulisce sessioni scadute ogni 10 minuti."""
    while True:
        await asyncio.sleep(interval_seconds)
        removed = session_memory.cleanup_expired()
        if removed:
            logger.info(f"Memory cleanup: rimosse {removed} sessioni scadute")


def _get_int_config(db, key: str, default: int) -> int:
    """Legge una config intera dalla tabella configs (fallback a default)."""
    try:
        row = db.query(models.Config).filter(models.Config.key == key).first()
        if row and row.value not in (None, ""):
            return int(row.value)
    except (ValueError, TypeError):
        pass
    return default


def full_prompt_logging_enabled(db, default: bool = True) -> bool:
    """True se i log devono salvare il prompt finale completo + envelope messaggi.

    Controllato dalla config DB `log_full_prompt` (default attiva). Letto per-richiesta
    dalla sessione disponibile a ogni punto di log, quindi editabile live in admin
    senza wiring di startup/global (a differenza di `log_pii_redact`)."""
    try:
        row = db.query(models.Config).filter(models.Config.key == "log_full_prompt").first()
        if row and row.value not in (None, ""):
            return str(row.value).strip().lower() not in ("0", "false", "no", "off")
    except Exception:
        pass
    return default


def build_log_envelope(system_prompt_final: str, full_message: str, history) -> dict:
    """Envelope da persistere nei log: stessa forma del prompt-audit dry-run
    (`{system_prompt_final, full_message, history}`), così audit e produzione sono
    confrontabili. La redazione PII e' applicata a parte (`pii.redact_envelope`)."""
    return {
        "system_prompt_final": system_prompt_final,
        "full_message": full_message,
        "history": list(history or []),
    }


def conversation_id_for(session_id: Optional[str], requested: Optional[str] = None) -> str:
    """Stable id used to group all log rows for one chat conversation."""
    # ponytail: generate new UUID if requested is empty to keep conversation_id unique from session_id
    candidate = (requested or "").strip()
    return candidate or str(uuid.uuid4())


def log_error(db, session_id: str, error: str, *, identity: Optional[dict] = None,
              action: str = "chat_error", questionnaire_type: Optional[str] = None,
              mode: Optional[str] = None, phase: Optional[str] = None,
              conversation_id: Optional[str] = None) -> None:
    """Scrive un record di log per un errore di chat. Best-effort: non propaga
    eccezioni (un fallimento di logging non deve peggiorare l'errore originale)."""
    try:
        ident = identity or {}
        resolved_conversation_id = conversation_id_for(session_id, conversation_id)
        db.add(models.Log(
            session_id=session_id,
            conversation_id=resolved_conversation_id,
            action=action,
            username=ident.get("username") or None,
            email=ident.get("email") or None,
            anonymous_research_code=code_for_identity(db, ident),
            questionnaire_type=questionnaire_type,
            mode=mode,
            phase=phase,
            details={"error": str(error)[:1000], "conversation_id": resolved_conversation_id},
        ))
        db.commit()
    except Exception as e:  # pragma: no cover - difensivo
        logger.warning(f"Scrittura log di errore fallita: {e}")
        try:
            db.rollback()
        except Exception:
            pass


async def _log_retention_loop(interval_seconds: int = 3600):
    """Background task: cancella i log più vecchi di `log_retention_days` (default 90).

    Rispetta GDPR (diritto alla limitazione di conservazione) in un contesto di
    counseling con studenti. Il job gira ogni ora; se la config è 0 o negativa,
    la retention è disattivata (nessuna cancellazione).
    """
    from sqlalchemy import text as sa_text
    from .database import SessionLocal as _SessionLocal
    while True:
        await asyncio.sleep(interval_seconds)
        db = _SessionLocal()
        try:
            days = _get_int_config(db, "log_retention_days", 90)
            if days <= 0:
                continue
            dialect = database.engine.dialect.name
            if dialect == "postgresql":
                stmt = sa_text(
                    "DELETE FROM logs WHERE timestamp < now() - (:days || ' days')::interval"
                )
                result = db.execute(stmt, {"days": days})
            else:
                # SQLite fallback (local-dev): timestamp senza timezone.
                import datetime as _dt
                cutoff = _dt.datetime.utcnow() - _dt.timedelta(days=days)
                stmt = sa_text("DELETE FROM logs WHERE timestamp < :cutoff")
                result = db.execute(stmt, {"cutoff": cutoff})
            db.commit()
            deleted = getattr(result, "rowcount", 0) or 0
            if deleted:
                logger.info(f"Log retention: cancellati {deleted} record > {days}gg")
        except Exception as e:
            logger.warning(f"Log retention loop fallito: {e}")
            db.rollback()
        finally:
            db.close()


def _ensure_questionnaire_guided_steps(db, questionnaire_type: str) -> None:
    """Ensure default guided steps exist for the requested questionnaire."""
    defaults_by_type = {
        "QSA": DEFAULT_GUIDED_STEPS,
        "QSAr": DEFAULT_QSAR_GUIDED_STEPS,
        "ZTPI": DEFAULT_ZTPI_GUIDED_STEPS,
        "SAVICKAS": DEFAULT_SAVICKAS_GUIDED_STEPS,
        "QPCS": DEFAULT_QPCS_GUIDED_STEPS,
        "QPCC": DEFAULT_QPCC_GUIDED_STEPS,
        "QAP": DEFAULT_QAP_GUIDED_STEPS,
    }

    if questionnaire_type not in defaults_by_type:
        return

    defaults = defaults_by_type[questionnaire_type]

    existing_ids = {
        row.id
        for row in (
            db.query(models.GuidedStep.id)
            .filter(models.GuidedStep.questionnaire_type == questionnaire_type)
            .all()
        )
    }

    changed = False
    for step_def in defaults:
        if step_def["id"] in existing_ids:
            continue
        payload = dict(step_def)
        payload["questionnaire_type"] = questionnaire_type
        db.add(models.GuidedStep(**payload))
        changed = True

    if changed:
        db.commit()


def _clamp_max_tokens(value: Optional[int], default: Optional[int] = None) -> Optional[int]:
    if value is None:
        return default
    return max(128, min(int(value), 8192))


# Lingue supportate per la risposta dell'AI (codice -> nome inglese, nome nativo)
SUPPORTED_AI_LANGUAGES = {
    "it": ("Italian", "italiano"),
    "en": ("English", "English"),
    "es": ("Spanish", "español"),
    "fr": ("French", "français"),
    "de": ("German", "Deutsch"),
    "sv": ("Swedish", "svenska"),
}


def _get_language_mappings(db=None) -> dict:
    """Legge le mappature placeholder lingua dal DB se disponibili, altrimenti
    restituisce il dict hardcoded SUPPORTED_AI_LANGUAGES.
    Il valore salvato è un JSON con chiave=lang_code, valore=[nome_inglese, nome_nativo]."""
    if db is None:
        return dict(SUPPORTED_AI_LANGUAGES)
    row = db.query(models.Config).filter(models.Config.key == "placeholder_language_mappings").first()
    if not row or not (row.value or "").strip():
        return dict(SUPPORTED_AI_LANGUAGES)
    try:
        parsed = json.loads(row.value.strip())
        if isinstance(parsed, dict):
            return {k: tuple(v) for k, v in parsed.items()}
    except (ValueError, TypeError):
        pass
    return dict(SUPPORTED_AI_LANGUAGES)


_QSA_FACTOR_NAMES = {
    "it": {
        "C1": "Strategie elaborative", "C2": "Autoregolazione", "C3": "Disorientamento",
        "C4": "Disponibilità alla collaborazione", "C5": "Uso di organizzatori semantici",
        "C6": "Difficoltà di concentrazione", "C7": "Autointerrogazione",
        "A1": "Ansietà di base", "A2": "Volizione",
        "A3": "Attribuzione a cause controllabili", "A4": "Attribuzione a cause incontrollabili",
        "A5": "Mancanza di perseveranza", "A6": "Percezione di competenza",
        "A7": "Interferenze emotive",
    },
    "en": {
        "C1": "Elaborative strategies", "C2": "Self-regulation", "C3": "Disorientation",
        "C4": "Willingness to collaborate", "C5": "Use of semantic organisers",
        "C6": "Concentration difficulties", "C7": "Self-questioning",
        "A1": "Baseline anxiety", "A2": "Volition",
        "A3": "Attribution to controllable causes", "A4": "Attribution to uncontrollable causes",
        "A5": "Lack of perseverance", "A6": "Perceived competence",
        "A7": "Emotional interference",
    },
    "es": {
        "C1": "Estrategias elaborativas", "C2": "Autorregulación", "C3": "Desorientación",
        "C4": "Disposición a colaborar", "C5": "Uso de organizadores semánticos",
        "C6": "Dificultades de concentración", "C7": "Autointerrogación",
        "A1": "Ansiedad de base", "A2": "Volición",
        "A3": "Atribución a causas controlables", "A4": "Atribución a causas incontrolables",
        "A5": "Falta de perseverancia", "A6": "Percepción de competencia",
        "A7": "Interferencias emocionales",
    },
    "fr": {
        "C1": "Stratégies d'élaboration", "C2": "Autorégulation", "C3": "Désorientation",
        "C4": "Disposition à collaborer", "C5": "Usage d'organisateurs sémantiques",
        "C6": "Difficultés de concentration", "C7": "Auto-questionnement",
        "A1": "Anxiété de base", "A2": "Volition",
        "A3": "Attribution à des causes contrôlables", "A4": "Attribution à des causes incontrôlables",
        "A5": "Manque de persévérance", "A6": "Perception de compétence",
        "A7": "Interférences émotionnelles",
    },
    "de": {
        "C1": "Elaborationsstrategien", "C2": "Selbstregulation", "C3": "Desorientierung",
        "C4": "Kooperationsbereitschaft", "C5": "Verwendung semantischer Organisatoren",
        "C6": "Konzentrationsschwierigkeiten", "C7": "Selbstbefragung",
        "A1": "Grundangst", "A2": "Volition",
        "A3": "Attribution auf kontrollierbare Ursachen", "A4": "Attribution auf unkontrollierbare Ursachen",
        "A5": "Mangelnde Ausdauer", "A6": "Kompetenzwahrnehmung",
        "A7": "Emotionale Interferenzen",
    },
    "sv": {
        "C1": "Bearbetningsstrategier", "C2": "Självreglering", "C3": "Desorientering",
        "C4": "Samarbetsvilja", "C5": "Användning av semantiska organisatörer",
        "C6": "Koncentrationssvårigheter", "C7": "Självfrågande",
        "A1": "Grundångest", "A2": "Vilja",
        "A3": "Attribution till kontrollerbara orsaker", "A4": "Attribution till okontrollerbara orsaker",
        "A5": "Brist på uthållighet", "A6": "Upplevd kompetens",
        "A7": "Emotionella störningar",
    },
}

_QSAR_FACTOR_NAMES = {
    "it": {
        "C1r": "Strategie elaborative per comprendere e ricordare",
        "C2r": "Strategie autoregolative",
        "C3r": "Strategie grafiche e organizzatori semantici",
        "C4r": "Carenza nel controllo dell'attenzione",
        "A1r": "Ansietà e controllo delle emozioni",
        "A2r": "Volizione",
        "A3r": "Attribuzioni causali",
        "A4r": "Percezione di competenza",
    },
    "en": {
        "C1r": "Elaborative strategies for understanding and remembering",
        "C2r": "Self-regulated strategies",
        "C3r": "Graphic strategies and semantic organisers",
        "C4r": "Lack of attention control",
        "A1r": "Anxiety and emotional control",
        "A2r": "Volition",
        "A3r": "Causal attributions",
        "A4r": "Perceived competence",
    },
    "es": {
        "C1r": "Estrategias elaborativas para comprender y recordar",
        "C2r": "Estrategias autorregulativas",
        "C3r": "Estrategias gráficas y organizadores semánticos",
        "C4r": "Falta de control de la atención",
        "A1r": "Ansiedad y control de las emociones",
        "A2r": "Volición",
        "A3r": "Atribuciones causales",
        "A4r": "Percepción de competencia",
    },
    "fr": {
        "C1r": "Stratégies élaboratives pour comprendre et mémoriser",
        "C2r": "Stratégies autorégulées",
        "C3r": "Stratégies graphiques et organisateurs sémantiques",
        "C4r": "Manque de contrôle de l'attention",
        "A1r": "Anxiété et contrôle des émotions",
        "A2r": "Volition",
        "A3r": "Attributions causales",
        "A4r": "Perception de compétence",
    },
    "de": {
        "C1r": "Elaborative Strategien zum Verstehen und Erinnern",
        "C2r": "Selbstregulative Strategien",
        "C3r": "Grafische Strategien und semantische Organisatoren",
        "C4r": "Mangelnde Aufmerksamkeitssteuerung",
        "A1r": "Angst und Emotionskontrolle",
        "A2r": "Volition",
        "A3r": "Kausale Attributionen",
        "A4r": "Kompetenzwahrnehmung",
    },
    "sv": {
        "C1r": "Bearbetningsstrategier för förståelse och minne",
        "C2r": "Självreglerande strategier",
        "C3r": "Grafiska strategier och semantiska organisatörer",
        "C4r": "Bristande kontroll över uppmärksamheten",
        "A1r": "Ångest och kontroll av känslor",
        "A2r": "Vilja",
        "A3r": "Orsaksförklaringar",
        "A4r": "Upplevd kompetens",
    },
}


_QSA_FACTOR_NAME_ALIASES = {
    "it": {
        "C4": ("disponibilità a collaborare",),
    },
}


# Fattori QSA invertiti: punteggio basso (1-3) = Forza, alto (7-9) = Area di crescita.
# Allineato a frontend questionnaires.ts -> QUESTIONNAIRES.QSA.invertedFactors.
_QSA_INVERTED_CODES = ("C3", "C6", "A1", "A4", "A5", "A7")
_QSAR_INVERTED_CODES = ("C4r", "A1r")


def _apply_global_directives(system_prompt: str, language: Optional[str], db=None) -> str:
    """Applica in un unico blocco le tre direttive globali: lingua, registro e
    thinking. Legge i testi dalle config del DB se presenti; altrimenti usa i
    default hardcoded."""
    if db is None:
        db_local = database.SessionLocal()
        try:
            return _apply_global_directives(system_prompt, language, db_local)
        finally:
            db_local.close()

    def _read(key: str, fallback: str) -> str:
        row = db.query(models.Config).filter(models.Config.key == key).first()
        if row and (row.value or "").strip():
            return row.value.strip()
        return fallback

    lang_directive = _read("directive_language", "")
    register_directive = _read("directive_register", "")
    thinking_directive = _read("directive_thinking", "")

    mappings = _get_language_mappings(db)

    # Fallback ai default hardcoded per chi non ha ancora salvato nulla
    if not lang_directive:
        if language and language in mappings:
            eng, native = mappings[language]
            lang_directive = (
                f"[LANGUAGE] You MUST write your ENTIRE response in {eng} ({native}), "
                f"regardless of the language of the instructions or scores above. "
                f"Translate any fixed phrases, headings and labels into {eng} as well. "
                f"Also produce your internal reasoning/thinking in {eng} ({native}). "
                f"Do NOT mix languages."
            )
        else:
            lang_directive = ""
    else:
        # Replace placeholders with actual language names
        if language and language in mappings:
            eng, native = mappings[language]
            lang_directive = lang_directive.replace("{lang}", eng).replace("{lang_native}", native)

    if not register_directive:
        register_directive = (
            "[REGISTER] Always address the student informally, using the informal "
            "second-person form of the chosen language (Italian 'tu' not 'Lei', "
            "Spanish 'tú', German and Swedish 'du', French 'tu'). Keep this informal "
            "register consistent across the ENTIRE conversation, including follow-up "
            "answers and summaries. Never switch to the formal form."
        )

    if not thinking_directive:
        thinking_directive = (
            "[THINKING] If you reason before answering, put ALL of your reasoning inside "
            "ONE single block at the very beginning, wrapped exactly in <think> and "
            "</think> tags, and keep it concise (a few short lines). After </think>, write "
            "the student-facing answer directly: it must NOT contain your plan, your "
            "checklist, phrases like 'Attivazione interna', 'Devo', 'Ho i punteggi', nor "
            "any meta-commentary about what you are doing. Never start the visible answer "
            "with a preparatory checklist such as 'Devo analizzare', 'Identificare il filo "
            "rosso', 'Strutturare i contenuti' or 'Proporre azioni concrete'. Never expose "
            "reasoning outside the <think> block."
        )

    parts = [system_prompt]
    if lang_directive:
        parts.append("\n\n" + lang_directive)
    if register_directive:
        parts.append("\n\n" + register_directive)
    if thinking_directive:
        parts.append("\n\n" + thinking_directive)
    return "".join(parts)


def _apply_language_directive(system_prompt: str, language: Optional[str], db=None) -> str:
    """Aggiunge in coda al system prompt l'istruzione di rispondere nella lingua scelta.
    Per ogni lingua supportata viene aggiunta la direttiva [LANGUAGE] che forza
    l'intera risposta in quella lingua, a prescindere dalla lingua delle istruzioni."""
    mappings = _get_language_mappings(db)
    if not language or language not in mappings:
        return system_prompt
    eng, native = mappings[language]
    return (
        f"{system_prompt}\n\n"
        f"[LANGUAGE] You MUST write your ENTIRE response in {eng} ({native}), "
        f"regardless of the language of the instructions or scores above. "
        f"Translate any fixed phrases, headings and labels into {eng} as well. "
        f"Also produce your internal reasoning/thinking in {eng} ({native}). "
        f"Do NOT mix languages."
    )


def _apply_register_directive(system_prompt: str, language: Optional[str]) -> str:
    """Forza un registro informale e coerente (dare del 'tu') in tutta la chat,
    a prescindere da quale prompt di step/follow-up è attivo. Risolve la deriva
    tu→lei tra l'analisi (che dà del tu) e le domande di approfondimento o i
    riassunti (i cui prompt spesso non specificano il registro)."""
    return (
        f"{system_prompt}\n\n"
        "[REGISTER] Always address the student informally, using the informal "
        "second-person form of the chosen language (Italian 'tu' not 'Lei', "
        "Spanish 'tú', German and Swedish 'du', French 'tu'). Keep this informal "
        "register consistent across the ENTIRE conversation, including follow-up "
        "answers and summaries. Never switch to the formal form."
    )


def _apply_thinking_directive(system_prompt: str, language: Optional[str] = None) -> str:
    """Confina il ragionamento del modello in un unico blocco `<think>…</think>`.

    Il "pensiero" ha valore didattico (mostrare COME ragiona l'LLM) ma deve restare
    separato dalla risposta: il frontend lo rende in un riquadro «sto pensando».
    Per i modelli con thinking nativo (Ollama `think`) il blocco arriva sul canale
    dedicato; per i modelli che lo inlineano, i tag `<think>` consentono comunque a
    `split_thinking`/`ThinkStreamSplitter` di estrarlo e ripulire il testo visibile.
    Vale per qualunque modello, indipendentemente dal supporto nativo."""
    return (
        f"{system_prompt}\n\n"
        "[THINKING] If you reason before answering, put ALL of your reasoning inside "
        "ONE single block at the very beginning, wrapped exactly in <think> and "
        "</think> tags, and keep it concise (a few short lines). After </think>, write "
        "the student-facing answer directly: it must NOT contain your plan, your "
        "checklist, phrases like 'Attivazione interna', 'Devo', 'Ho i punteggi', nor "
        "any meta-commentary about what you are doing. Never start the visible answer "
        "with a preparatory checklist such as 'Devo analizzare', 'Identificare il filo "
        "rosso', 'Strutturare i contenuti' or 'Proporre azioni concrete'. Never expose "
        "reasoning outside the <think> block."
    )


# --- Separazione del ragionamento dal testo visibile (canale «sto pensando») ---
# Blocchi di pensiero tollerati: <think>, <thinking>, <sto_pensando> (case-insensitive).
_THINK_BLOCK_RE = re.compile(
    r"<\s*(think|thinking|sto_pensando)\s*>(.*?)</\s*\1\s*>",
    re.IGNORECASE | re.DOTALL,
)
_THINK_OPEN_RE = re.compile(
    r"<\s*(?:think|thinking|sto_pensando)\s*>(.*)$",
    re.IGNORECASE | re.DOTALL,
)


def split_thinking(text: str) -> tuple[Optional[str], str]:
    """Estrae i blocchi `<think>…</think>` (fallback per i modelli che inlineano il
    ragionamento nel contenuto invece di usare il canale nativo).

    Ritorna `(reasoning|None, visible)`: `reasoning` e' il testo dei blocchi
    concatenato, `visible` e' il testo ripulito. Gestisce anche un `<think>` aperto e
    non chiuso (output troncato): tutto cio' che segue l'apertura diventa reasoning."""
    if not text:
        return None, text or ""
    reasoning_parts: list[str] = []

    def _collect(match: re.Match) -> str:
        reasoning_parts.append((match.group(2) or "").strip())
        return ""

    visible = _THINK_BLOCK_RE.sub(_collect, text)
    open_match = _THINK_OPEN_RE.search(visible)
    if open_match:
        reasoning_parts.append((open_match.group(1) or "").strip())
        visible = visible[: open_match.start()]
    visible = re.sub(r"\n{3,}", "\n\n", visible).strip()
    reasoning = "\n\n".join(part for part in reasoning_parts if part).strip() or None
    return reasoning, visible


class ThinkStreamSplitter:
    """Separa in streaming i blocchi `<think>…</think>` dal contenuto visibile.

    Robusto ai tag spezzati tra chunk: trattiene in coda solo i caratteri che
    potrebbero essere l'inizio di un tag. `feed(delta)` e `flush()` ritornano una
    lista di dict `{"type": "reasoning"|"content", "text": ...}`."""

    _OPEN = ("<think>", "<thinking>", "<sto_pensando>")
    _CLOSE = ("</think>", "</thinking>", "</sto_pensando>")

    def __init__(self) -> None:
        self._buf = ""
        self._in_think = False

    def _emit(self, text: str) -> Optional[dict]:
        if not text:
            return None
        return {"type": "reasoning" if self._in_think else "content", "text": text}

    def _partial_tail_len(self, tags: tuple[str, ...]) -> int:
        low = self._buf.lower()
        best = 0
        for tag in tags:
            limit = min(len(low), len(tag) - 1)
            for k in range(limit, 0, -1):
                if low[-k:] == tag[:k]:
                    best = max(best, k)
                    break
        return best

    def feed(self, delta: str) -> list[dict]:
        out: list[dict] = []
        self._buf += delta or ""
        while True:
            tags = self._CLOSE if self._in_think else self._OPEN
            low = self._buf.lower()
            idx, taglen = -1, 0
            for tag in tags:
                pos = low.find(tag)
                if pos != -1 and (idx == -1 or pos < idx):
                    idx, taglen = pos, len(tag)
            if idx == -1:
                break
            chunk = self._emit(self._buf[:idx])
            if chunk:
                out.append(chunk)
            self._buf = self._buf[idx + taglen:]
            self._in_think = not self._in_think
        tags = self._CLOSE if self._in_think else self._OPEN
        tail = self._partial_tail_len(tags)
        if tail < len(self._buf):
            safe = self._buf[: len(self._buf) - tail]
            chunk = self._emit(safe)
            if chunk:
                out.append(chunk)
            self._buf = self._buf[len(safe):]
        return out

    def flush(self) -> list[dict]:
        chunk = self._emit(self._buf)
        self._buf = ""
        return [chunk] if chunk else []


# Etichetta del blocco punteggi di riferimento, per lingua dello studente.
_SCORES_REFERENCE_LABELS = {
    "it": "PROFILO DELLO STUDENTE (punteggi di riferimento, validi per tutta la sessione)",
    "en": "STUDENT PROFILE (reference scores, valid for the whole session)",
    "es": "PERFIL DEL ESTUDIANTE (puntuaciones de referencia, válidas durante toda la sesión)",
    "fr": "PROFIL DE L'ÉTUDIANT (scores de référence, valables pendant toute la session)",
    "de": "PROFIL DES STUDIERENDEN (Referenzwerte, für die gesamte Sitzung gültig)",
    "sv": "STUDENTENS PROFIL (referenspoäng, giltiga under hela sessionen)",
}


_FACTOR_SCOPE_PREFIX_LABELS = {
    "it": "Fattori trattati",
    "en": "Factors discussed",
    "es": "Factores tratados",
    "fr": "Facteurs traités",
    "de": "Behandelte Faktoren",
    "sv": "Behandlade faktorer",
}


def _apply_scores_reference(system_prompt: str, scores: str, language: Optional[str]) -> str:
    """Pinna i punteggi del profilo nel system prompt come riferimento permanente.

    Garantisce che il modello abbia SEMPRE i punteggi presenti, anche nei turni
    di follow-up discorsivo (dove il frontend non rimanda `scores_context`),
    senza però indurlo a ri-emettere l'intera tabella a ogni messaggio."""
    scores = (scores or "").strip()
    if not scores:
        return system_prompt
    label = _SCORES_REFERENCE_LABELS.get(language or "it", _SCORES_REFERENCE_LABELS["it"])
    return (
        f"{system_prompt}\n\n"
        f"[STUDENT PROFILE] {label}:\n{scores}\n"
        "Keep these scores in mind throughout the whole conversation and refer to "
        "them when relevant. Do NOT re-list the full table unless the student "
        "explicitly asks again for the complete overview."
    )


# Codici fattore (QSA/QSAr C1, A7, C1r; ZTPI T1-T5) e range tipo "C1-C7".
_FACTOR_CODE_RE = re.compile(r"\b([CA]\d{1,2}r?|T[1-5])\b", re.IGNORECASE)
_FACTOR_RANGE_RE = re.compile(r"\b([CA])(\d)\s*[-–]\s*[CA]?(\d)\b", re.IGNORECASE)


def _phase_factor_codes(db, phase: Optional[str]) -> set[str]:
    """Codici fattore della sezione corrente, ricavati dal prompt dello step guidato.
    Espande i range (es. C1-C7). Set vuoto se sconosciuto → nessuno scoping (fallback)."""
    if not phase:
        return set()
    step = db.query(models.GuidedStep).filter(models.GuidedStep.id == phase).first()
    if not step or not step.prompt:
        return set()
    text = step.prompt
    codes = {m.group(1).upper() for m in _FACTOR_CODE_RE.finditer(text)}
    for m in _FACTOR_RANGE_RE.finditer(text):
        letter, a, b = m.group(1).upper(), int(m.group(2)), int(m.group(3))
        for n in range(min(a, b), max(a, b) + 1):
            codes.add(f"{letter}{n}")
    return codes


def _scope_scores_to_codes(scores: str, codes: set[str]) -> str:
    """Tiene l'header e solo le righe '- <codice> (...)' i cui codici sono nella sezione.
    `codes` vuoto → ritorna i punteggi intatti (fallback: profilo intero)."""
    if not scores or not codes:
        return scores
    out = []
    for line in scores.splitlines():
        m = re.match(r"\s*-\s*([CA]\d{1,2}r?|T[1-5])\b", line, re.IGNORECASE)
        if m:
            if m.group(1).upper() in codes:
                out.append(line)
        else:
            out.append(line)  # header e righe non-fattore restano
    return "\n".join(out)


_QSA_SCORE_RE = re.compile(r"\b([CA]\d{1,2}r?)\b[^\n\r0-9]{0,80}?([1-9])\s*/\s*9\b", re.IGNORECASE)


def _is_qsa(questionnaire_type: Optional[str]) -> bool:
    return (questionnaire_type or "").upper() == "QSA"


def _is_strategy_questionnaire(questionnaire_type: Optional[str]) -> bool:
    return (questionnaire_type or "").upper() in {"QSA", "QSAR"}


def _is_intro_step_mode(system_prompt_mode: Optional[str]) -> bool:
    """True for guided welcome/intro steps.

    Intro turns should stay lightweight: no score table, no factor directives,
    no RAG/strategy context. The counselor persona already supplies identity
    and style; the intro prompt only describes the current turn.
    """
    return (system_prompt_mode or "").strip().lower() == "intro"


def _should_include_step_analysis_context(system_prompt_mode: Optional[str]) -> bool:
    """Whether this guided step should receive analysis-only context."""
    return not _is_intro_step_mode(system_prompt_mode)


# ponytail: advice-gated modes listed once; add here if a new second-level mode appears
_ADVICE_PROMPT_MODES = {"second-level", "qsar-second-level", "generic", "qsar-generic"}


def _step_allows_practical_advice(step_mode: Optional[str]) -> bool:
    """Whether the current step is allowed to emit a practical plan.

    `factor`/`qsar-factor` are interpretive-only by design: the prompt SECTION
    already defers advice. `sl-*` and `generic` produce the practical plan.
    """
    return (step_mode or "").strip().lower() in _ADVICE_PROMPT_MODES


def _qsa_factor_names(language: Optional[str], questionnaire_type: str = "QSA") -> dict[str, str]:
    dictionary = _QSAR_FACTOR_NAMES if (questionnaire_type or "").upper() == "QSAR" else _QSA_FACTOR_NAMES
    return dictionary.get(language or "it", dictionary["it"])


def _qsa_factor_items(
    language: Optional[str],
    questionnaire_type: str = "QSA",
    allowed_codes: Optional[set[str]] = None,
) -> list[tuple[str, str]]:
    names = _qsa_factor_names(language, questionnaire_type)
    if not allowed_codes:
        return list(names.items())
    allowed = {code.upper() for code in allowed_codes}
    scoped = [(code, name) for code, name in names.items() if code.upper() in allowed]
    return scoped or list(names.items())


# Etichette di interpretazione QSA per lingua. Servono nel system prompt: il
# modello le copia testualmente nella colonna "Interpretazione" della tabella,
# quindi devono essere già nella lingua dello studente (altrimenti escono in
# inglese, es. "Area for growth", anche in una sessione italiana).
_QSA_ASSESSMENT_LABELS: dict[str, dict[str, str]] = {
    "en": {"growth": "Area for growth", "adequate": "Adequate", "strength": "Strength", "normal": "Normal"},
    "it": {"growth": "Area di crescita", "adequate": "Adeguato", "strength": "Forza", "normal": "Normale"},
    "es": {"growth": "Área de mejora", "adequate": "Adecuado", "strength": "Fortaleza", "normal": "Normal"},
    "fr": {"growth": "Axe de progression", "adequate": "Adéquat", "strength": "Force", "normal": "Normal"},
    "de": {"growth": "Wachstumsbereich", "adequate": "Angemessen", "strength": "Stärke", "normal": "Normal"},
    "sv": {"growth": "Utvecklingsområde", "adequate": "Tillräcklig", "strength": "Styrka", "normal": "Normal"},
}


def _qsa_assessment_labels(language: Optional[str]) -> dict[str, str]:
    return _QSA_ASSESSMENT_LABELS.get(language or "it", _QSA_ASSESSMENT_LABELS["it"])


def _qsa_band_for_score(code: str, score: int, questionnaire_type: str = "QSA") -> str:
    inverted_codes = _QSAR_INVERTED_CODES if (questionnaire_type or "").upper() == "QSAR" else _QSA_INVERTED_CODES
    if code.upper() in {item.upper() for item in inverted_codes}:
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


def _qsa_step_score_profile(
    scores_context: str,
    questionnaire_type: str,
    language: Optional[str],
    allowed_codes: set[str],
) -> list[dict[str, str]]:
    if not scores_context or not allowed_codes or not _is_strategy_questionnaire(questionnaire_type):
        return []
    labels = _qsa_assessment_labels(language)
    names = _qsa_factor_names(language, questionnaire_type)
    rows = []
    for code, raw_score in _QSA_SCORE_RE.findall(scores_context):
        code_key = next((known for known in names if known.upper() == code.upper()), code.upper())
        if code_key.upper() not in {item.upper() for item in allowed_codes} or code_key not in names:
            continue
        score = int(raw_score)
        band = _qsa_band_for_score(code_key, score, questionnaire_type)
        rows.append({
            "code": code_key,
            "name": names[code_key],
            "score": str(score),
            "band": band,
            "label": labels[band],
        })
    rows.sort(key=lambda item: item["code"])
    return rows


def _localize_assessment_labels(text: str, language: Optional[str]) -> str:
    """Rete di sicurezza: se il modello scrive comunque 'Area for growth/improvement'
    in inglese (frase distintiva, non confondibile con prosa), la riporta nella
    lingua dello studente. 'Strength'/'Normal' NON vengono toccati per non
    corrompere il testo libero."""
    if not text or not language or language == "en":
        return text
    growth = _qsa_assessment_labels(language)["growth"]
    return re.sub(r"\bareas?\s+for\s+(?:growth|improvement)\b", growth, text, flags=re.IGNORECASE)


def _sanitize_qsa_inverted_wording(text: str, language: Optional[str], questionnaire_type: str = "QSA") -> str:
    """Corregge formulazioni formalmente vere ma pedagogicamente brutte sugli invertiti.

    Esempio: "la mancanza di perseveranza e' una forza" e' tecnicamente una
    lettura di A5 basso, ma suona male allo studente. Meglio esplicitare che e'
    il basso livello del problema a indicare una risorsa.
    """
    if not text or (language or "it") != "it" or not _is_qsa(questionnaire_type):
        return text
    cleaned = text
    cleaned = re.sub(
        r"\b(?:la\s+tua\s+)?mancanza\s+di\s+perseveranza\s+(?:è|e')\s+una\s+forza\b",
        "il basso livello di mancanza di perseveranza indica una buona tenuta",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\bA5\s*\(Mancanza di perseveranza\)\s+(?:è|e')\s+una\s+forza\b",
        "A5 (Mancanza di perseveranza) a basso punteggio indica una buona tenuta",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\b(?:la\s+)?mancanza\s+di\s+perseveranza\s+(?:è|e')\s+bassa\b",
        "il basso livello di mancanza di perseveranza indica una buona tenuta",
        cleaned,
        flags=re.IGNORECASE,
    )
    return cleaned


def _annotate_qsa_factor_codes(
    text: str, language: Optional[str], progressive: bool = False, questionnaire_type: str = "QSA"
) -> str:
    """Impedisce di presentare codici QSA/QSAr privi del relativo nome."""
    if not text:
        return text
    annotated = text
    for code, name in _qsa_factor_names(language, questionnaire_type).items():
        # Canonicalizza anche un nome gia prodotto dal modello.
        annotated = re.sub(rf"\b{code}\b\s*\([^)]*\)", f"{code} ({name})", annotated)
        if progressive:
            # Durante lo stream la parentesi puo essere ancora incompleta:
            # mostriamo subito l'etichetta completa senza esporre una sigla sola.
            annotated = re.sub(rf"\b{code}\b\s*\([^)]*$", f"{code} ({name})", annotated)
        # Codice gia seguito dal proprio nome SENZA parentesi (es. "C1 Strategie
        # elaborative", "A6: Percezione di competenza"): avvolgilo una volta sola,
        # senza ripetere il nome (era la causa di "A6 (...) Percezione di competenza").
        annotated = re.sub(rf"\b{code}\b\s*[:\-–]?\s*{re.escape(name)}", f"{code} ({name})", annotated)
        # Caso in cui il modello stesso ha gia scritto "(name) name": collassa il doppione.
        annotated = re.sub(rf"\({re.escape(name)}\)\s*{re.escape(name)}\b", f"({name})", annotated)
        annotated = re.sub(rf"\b{code}\b(?!\s*\()", f"{code} ({name})", annotated)
        # Se il modello usa solo il nome del fattore senza codice, marca almeno la
        # prima occorrenza. Questo preserva la copertura audit senza trasformare
        # ogni ripetizione del nome in testo pesante.
        if not re.search(rf"\b{code}\b", annotated):
            annotated = re.sub(
                rf"\b{re.escape(name)}\b",
                f"{code} ({name})",
                annotated,
                count=1,
                flags=re.IGNORECASE,
            )
        if not re.search(rf"\b{code}\b", annotated):
            for alias in _QSA_FACTOR_NAME_ALIASES.get(language or "it", {}).get(code, ()):
                updated = re.sub(
                    rf"\b{re.escape(alias)}\b",
                    f"{code} ({name})",
                    annotated,
                    count=1,
                    flags=re.IGNORECASE,
                )
                if updated != annotated:
                    annotated = updated
                    break
    annotated = _localize_assessment_labels(annotated, language)
    return _sanitize_qsa_inverted_wording(annotated, language, questionnaire_type)


def _ensure_required_qsa_factor_codes(
    text: str,
    questionnaire_type: str,
    language: Optional[str],
    required_codes: set[str],
) -> str:
    """Rende espliciti i codici dello step se il modello usa solo parafrasi.

    Non aggiunge interpretazioni o consigli: antepone solo una riga di scope quando
    manca il codice richiesto, così output e audit restano allineati.
    """
    if not text or not required_codes or not _is_strategy_questionnaire(questionnaire_type):
        return text
    names = _qsa_factor_names(language, questionnaire_type)
    missing = [
        code for code in sorted(required_codes)
        if code in names and not re.search(rf"\b{code}\b", text, re.IGNORECASE)
    ]
    if not missing:
        return text
    label = _FACTOR_SCOPE_PREFIX_LABELS.get(language or "it", _FACTOR_SCOPE_PREFIX_LABELS["it"])
    if text.lstrip().lower().startswith(label.lower()):
        return text
    factors = ", ".join(f"{code} ({names[code]})" for code in missing)
    return f"{label}: {factors}\n\n{text}"


def _apply_qsa_factor_directive(
    system_prompt: str,
    questionnaire_type: str,
    language: Optional[str],
    allowed_codes: Optional[set[str]] = None,
) -> str:
    if not _is_strategy_questionnaire(questionnaire_type):
        return system_prompt
    instrument = "QSAr" if (questionnaire_type or "").upper() == "QSAR" else "QSA"
    factor_items = _qsa_factor_items(language, questionnaire_type, allowed_codes)
    inverted_codes = _QSAR_INVERTED_CODES if instrument == "QSAr" else _QSA_INVERTED_CODES
    examples = ", ".join(f"{code} ({name})" for code, name in factor_items)
    # Label di interpretazione nella lingua dello studente: il modello le riusa
    # tali e quali nella tabella, quindi non devono restare in inglese.
    lbl = _qsa_assessment_labels(language)
    # Inversione pre-risolta per fattore: ogni riga porta gia le bande corrette,
    # cosi un modello piccolo non deve piu decidere se un codice e invertito (era
    # la causa di errori tipo A5=9 letto come "Forza"). Legge la riga e basta.
    direct_bands = f"1-3 = {lbl['growth']} · 4-6 = {lbl['adequate']} · 7-9 = {lbl['strength']}"
    inverted_bands = f"1-3 = {lbl['strength']} · 4-6 = {lbl['normal']} · 7-9 = {lbl['growth']}"
    rows = [
        f"- {code} ({name}): {inverted_bands if code.upper() in {item.upper() for item in inverted_codes} else direct_bands}"
        for code, name in factor_items
    ]
    interpretation_table = "\n".join(rows)
    base = (
        f"{system_prompt}\n\n"
        "[FACTOR LABELS] In every reply addressed to the student, never write "
        f"an isolated {instrument} factor code. Each code must be immediately "
        "accompanied by its full name, in the form `C2 (Self-regulation)`. "
        f"Mandatory reference: {examples}.\n\n"
        "[INTERPRETATION TABLE] Scale 1-9. Assign each factor the label of its "
        "score band by reading ITS OWN row below; the labels are already in the "
        "student's language. The inversion is already resolved per factor: do NOT "
        "decide the inversion yourself, just read the row.\n"
        f"{interpretation_table}"
    )
    # ponytail: [CURRENT FACTOR SCOPE] emesso solo nel ramo generico
    # (allowed_codes vuoto), dove [CURRENT STEP FACTORS] non esiste. Quando
    # allowed_codes e' valorizzato, [CURRENT STEP FACTORS] e' l'unica fonte
    # autorevole di scope (P1.1: una sola dichiarazione di scope per turno).
    if not allowed_codes:
        scope_sentence = (
            "The mandatory reference above lists all possible "
            f"{instrument} factors only so you can name them correctly. In the current "
            "answer, discuss ONLY the factor codes present in the student's current "
            "message, score lines or guided-step prompt. Do not introduce other factors "
            "or relationships with other factors just because they appear in the "
            "reference list."
        )
        return f"{base}\n\n[CURRENT FACTOR SCOPE] {scope_sentence}"
    return base


def _requires_complete_factor_output(mode: Optional[str]) -> bool:
    return (mode or "").strip().lower() in {"factor", "qsar-factor"}


def _apply_current_step_factor_scope_directive(system_prompt: str, questionnaire_type: str, allowed_codes: set[str]) -> str:
    if not _is_strategy_questionnaire(questionnaire_type) or not allowed_codes:
        return system_prompt
    allowed = ", ".join(sorted(allowed_codes))
    return (
        f"{system_prompt}\n\n"
        f"[CURRENT STEP FACTORS] Allowed factor codes for this answer: {allowed}. "
        "Do not mention, analyse or use any other QSA/QSAr factor code or factor "
        "name in this answer. If a second-level instruction asks for factor "
        "interplay but this step has only one allowed factor, do not create "
        "interplay with other factors; explain the single factor and give any "
        "practical advice only from certified strategies for that same factor."
    )


def _apply_current_step_score_profile_directive(
    system_prompt: str,
    questionnaire_type: str,
    language: Optional[str],
    scores_context: str,
    allowed_codes: set[str],
    include_advice: bool,
) -> str:
    profile = _qsa_step_score_profile(scores_context, questionnaire_type, language, allowed_codes)
    if not profile:
        return system_prompt

    lines = []
    targets = []
    resources = []
    for item in profile:
        line = f"- {item['code']} ({item['name']}): {item['score']}/9 = {item['label']}"
        lines.append(line)
        if item["band"] == "growth":
            targets.append(f"{item['code']} ({item['name']})")
        elif item["band"] == "strength":
            resources.append(f"{item['code']} ({item['name']})")

    base = (
        f"{system_prompt}\n\n"
        "[CURRENT STEP SCORE PROFILE]\n"
        + "\n".join(lines)
        + "\n"
    )
    if not include_advice:
        # factor/qsar-factor steps: bande risolte bastano per la colonna
        # interpretativa; la coda consiglio contraddirebbe il SECTION "advice
        # deferred".
        return base
    target_text = ", ".join(targets) if targets else "none"
    resource_text = ", ".join(resources) if resources else "none"
    heading_rule = ""
    if (language or "it") == "it":
        heading_rule = (
            " Use Italian headings exactly: 'Azione da fare oggi' and "
            "'Azione da fare questa settimana'; never leave these headings in English."
        )
    # ponytail: nota plain-language invertiti solo se c'e' almeno un invertito
    # nello scope corrente; l'esempio 'lack of perseverance' (A5) solo se A5 e'
    # effettivamente in scope (P1.3: niente testo morto su step senza A5).
    inverted_codes = _QSAR_INVERTED_CODES if (questionnaire_type or "").upper() == "QSAR" else _QSA_INVERTED_CODES
    inverted_in_scope = {c.upper() for c in allowed_codes} & {c.upper() for c in inverted_codes}
    inverted_note = ""
    if inverted_in_scope:
        inverted_note = (
            " For inverted factors, phrase the meaning in plain language: if a low "
            "score is a strength, say that the low level of the difficulty indicates "
            "a resource"
        )
        if "A5" in inverted_in_scope:
            inverted_note += (
                "; do not write awkward phrases such as 'lack of perseverance is a "
                "strength'"
            )
        inverted_note += "."
    return (
        base
        + f"Primary improvement targets: {target_text}. Strength/resource factors: {resource_text}. "
        "Practical advice must focus primarily on improvement targets. Strength/resource factors "
        "may support the plan but must not be described as problems to fix."
        f"{inverted_note}"
        f"{heading_rule}"
    )


def _apply_certified_advice_directive(system_prompt: str, questionnaire_type: str) -> str:
    """Vincola i consigli pratici QSA al catalogo certificato iniettato nel knowledge.

    L'analisi interpretativa puo' usare punteggi e fonti, ma azioni pratiche,
    esercizi e piani devono restare tracciabili alle strategie certificate. Per ora
    il vincolo e' limitato al QSA: QSAr non ha ancora un catalogo certificato
    equivalente e non va degradato implicitamente.
    """
    if not _is_qsa(questionnaire_type):
        return system_prompt
    # ponytail: heading rule 'Azione da fare oggi/questa settimana' gia nella
    # coda di _apply_current_step_score_profile_directive (gated a include_advice);
    # non ripeterla qui (P1.2).
    return (
        f"{system_prompt}\n\n"
        "[CERTIFIED ADVICE] For QSA practical advice, exercises, action plans or "
        "study strategies:\n"
        "- use only the items listed under [CERTIFIED_STRATEGIES] in [KNOWLEDGE];\n"
        "- adapt wording to the student, but do not invent new actions outside that list;\n"
        "- if at least one certified item is listed for the current step, complete the requested practical plan using it;\n"
        "- if no certified item is listed, you may draw the practical step from the approved support strategies in [KNOWLEDGE]; stay interpretive only if neither is available;\n"
        "- do not mention these source rules to the student."
    )


def _student_visible_response(
    text: str,
    questionnaire_type: str,
    language: Optional[str],
    sanitize_ztpi: bool,
) -> str:
    if sanitize_ztpi:
        return _sanitize_ztpi_user_text(text, language)
    if _is_strategy_questionnaire(questionnaire_type):
        return _annotate_qsa_factor_codes(text, language, progressive=True, questionnaire_type=questionnaire_type)
    return text


_GUIDED_NO_GREETING_SUFFIX = " Do NOT start with greetings. Go straight to the analysis."

# Modalità discorsive: domande di approfondimento dello studente dentro uno step.
# Devono usare il prompt mode-based anche se `phase` punta a uno step di analisi.
_CONVERSATIONAL_MODES = {"factor-qa", "qsar-factor-qa"}

# Nomi estesi dei fattori ZTPI per lingua (codice -> nome leggibile).
_ZTPI_FACTOR_NAMES = {
    "it": {
        "T1": "Passato Negativo",
        "T2": "Passato Positivo",
        "T3": "Presente Edonistico",
        "T4": "Presente Fatalistico",
        "T5": "Futuro",
    },
    "en": {
        "T1": "Past Negative",
        "T2": "Past Positive",
        "T3": "Present Hedonistic",
        "T4": "Present Fatalistic",
        "T5": "Future",
    },
}
# Frase estesa che sostituisce le sigle del profilo bilanciato (PTB/BTP), per lingua.
_ZTPI_BALANCED_PHRASE = {
    "it": "profilo temporale equilibrato",
    "en": "balanced time perspective",
}
# Retro-compatibilità: alias usato altrove se serve la mappa italiana.
_ZTPI_FACTOR_NAME_BY_CODE = _ZTPI_FACTOR_NAMES["it"]


def _ztpi_lang(language: Optional[str]) -> str:
    """ZTPI sanitization usa l'italiano solo per 'it'; ogni altra lingua (default
    inglese dopo la traduzione dei prompt) usa la variante inglese."""
    return "it" if (language or "").lower().startswith("it") else "en"


def _sanitize_ztpi_user_text(text: str, language: Optional[str] = None) -> str:
    """Rende il testo ZTPI privo di sigle tecniche (ZTPI, PTB/BTP, DBTP, T1-T5),
    espandendole nei nomi leggibili della lingua di output selezionata."""
    if not text:
        return text

    lang = _ztpi_lang(language)
    names = _ZTPI_FACTOR_NAMES[lang]
    balanced = _ZTPI_BALANCED_PHRASE[lang]
    cleaned = text

    # Prima elimina forme duplicate tipo "T3 (Presente Edonistico)".
    for code, name in names.items():
        cleaned = re.sub(
            rf"\b{code}\s*\(\s*{re.escape(name)}\s*\)",
            name,
            cleaned,
            flags=re.IGNORECASE,
        )

    # Sostituisce i codici fattore con il nome completo.
    for code, name in names.items():
        cleaned = re.sub(rf"\b{code}\b", name, cleaned)

    # Sostituisce sigle tecniche residue con formulazioni estese.
    if lang == "it":
        cleaned = re.sub(
            r"\bZimbardo Time Perspective Inventory\s*\(\s*ZTPI\s*\)",
            "prospettiva temporale di Zimbardo", cleaned, flags=re.IGNORECASE,
        )
        cleaned = re.sub(
            r"\bProfilo Temporale Bilanciato\s*\(\s*(?:PTB|BTP)\s*\)",
            balanced, cleaned, flags=re.IGNORECASE,
        )
        cleaned = re.sub(r"\bprofilo temporale bilanciato\b", balanced, cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\b(?:PTB|BTP)\b", balanced, cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\bDBTP-r?\b", "distanza dal profilo temporale equilibrato", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\bZTPI\b", "prospettiva temporale", cleaned, flags=re.IGNORECASE)
    else:
        cleaned = re.sub(
            r"\bZimbardo Time Perspective Inventory\s*\(\s*ZTPI\s*\)",
            "Zimbardo's time perspective", cleaned, flags=re.IGNORECASE,
        )
        cleaned = re.sub(
            r"\bBalanced Time Perspective\s*\(\s*(?:BTP|PTB)\s*\)",
            balanced, cleaned, flags=re.IGNORECASE,
        )
        cleaned = re.sub(r"\b(?:BTP|PTB)\b", balanced, cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\bDBTP-r?\b", "distance from the balanced time perspective", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\bZTPI\b", "time perspective", cleaned, flags=re.IGNORECASE)

    # Normalizza eventuali ripetizioni create dalle sostituzioni.
    for name in names.values():
        cleaned = re.sub(
            rf"{re.escape(name)}\s*\(\s*{re.escape(name)}\s*\)",
            name,
            cleaned,
            flags=re.IGNORECASE,
        )

    cleaned = re.sub(rf"({re.escape(balanced)})\s*\([^)]*\)", r"\1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(rf"\(\s*{re.escape(balanced)}\s*\)", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    cleaned = re.sub(r"\s+([,.;:])", r"\1", cleaned)
    return cleaned.strip()


def _sanitize_ztpi_step_label(label: str, language: Optional[str] = None) -> str:
    """Pulisce le etichette step ZTPI rimuovendo prefissi con codici tecnici.
    Le etichette nel DB sono in italiano: default 'it'."""
    if not label:
        return label
    lang = _ztpi_lang(language) if language else "it"
    cleaned = re.sub(r"\bT[1-5]\b\s*-\s*", "", label)
    if lang == "it":
        cleaned = re.sub(r"\bprofilo temporale bilanciato\b", "Profilo Temporale Equilibrato", cleaned, flags=re.IGNORECASE)
        cleaned = _sanitize_ztpi_user_text(cleaned, "it")
        cleaned = re.sub(r"\bprofilo temporale equilibrato\b", "Profilo Temporale Equilibrato", cleaned, flags=re.IGNORECASE)
    else:
        cleaned = _sanitize_ztpi_user_text(cleaned, lang)
    return cleaned


def _should_sanitize_ztpi_text(mode: Optional[str], phase: Optional[str]) -> bool:
    if mode in {"ztpi-factor", "ztpi-btp"}:
        return True
    if phase and phase.startswith("ztpi-"):
        return True
    return False


def _resolve_system_prompt(ai_service: AIService, mode: str, phase: Optional[str], db):
    """Resolve system prompt key/value with guided-phase override support."""
    # Questions phase has its own system prompt
    if phase in GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS:
        guided_system = GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS[phase]
        guided_key = guided_system["key"]
        return guided_key, ai_service.config.get(
            guided_key,
            guided_system.get("default", ai_service.config.get("prompt_generic", DEFAULT_SYSTEM_PROMPT_GENERIC)),
        )

    # Follow-up Q&A durante uno step: prompt discorsivo, NON ri-genera l'analisi.
    # Va onorato anche quando `phase` punta a uno step di analisi, altrimenti il
    # ramo sottostante userebbe il prompt di analisi (tabella + tutti i fattori).
    if mode in _CONVERSATIONAL_MODES:
        prompt_key = MODE_TO_SYSTEM_PROMPT_KEY.get(mode, "prompt_generic")
        base_prompt = ai_service.config.get(
            prompt_key, SYSTEM_PROMPT_DEFAULTS.get(prompt_key, DEFAULT_SYSTEM_PROMPT_GENERIC)
        )
        if _GUIDED_NO_GREETING_SUFFIX.strip() not in base_prompt:
            base_prompt = base_prompt + _GUIDED_NO_GREETING_SUFFIX
        return prompt_key, base_prompt

    # For guided analysis steps, look up system_prompt_mode from the step
    if phase:
        step = db.query(models.GuidedStep).filter(models.GuidedStep.id == phase).first()
        if step:
            prompt_key = MODE_TO_SYSTEM_PROMPT_KEY.get(step.system_prompt_mode, "prompt_generic")
            base_prompt = ai_service.config.get(
                prompt_key,
                SYSTEM_PROMPT_DEFAULTS.get(prompt_key, DEFAULT_SYSTEM_PROMPT_GENERIC),
            )
            # Append anti-greeting instruction if not already present (handles existing DB values)
            if _GUIDED_NO_GREETING_SUFFIX.strip() not in base_prompt:
                base_prompt = base_prompt + _GUIDED_NO_GREETING_SUFFIX
            return prompt_key, base_prompt

    # Fallback: mode-based system prompt
    prompt_key = MODE_TO_SYSTEM_PROMPT_KEY.get(mode, "prompt_generic")
    return prompt_key, ai_service.config.get(
        prompt_key,
        SYSTEM_PROMPT_DEFAULTS.get(prompt_key, DEFAULT_SYSTEM_PROMPT_GENERIC),
    )


def _resolve_user_message_for_chat(ai_service: AIService, request: ChatRequest, db):
    """Resolve the effective user message, optionally loading a guided-step prompt from DB."""
    if request.use_phase_prompt:
        if not request.phase:
            raise HTTPException(status_code=400, detail="phase is required when use_phase_prompt=true")

        # Load prompt from guided_steps table
        step = db.query(models.GuidedStep).filter(models.GuidedStep.id == request.phase).first()
        if not step:
            raise HTTPException(status_code=400, detail=f"Unsupported guided phase: {request.phase}")

        return step.prompt, f"guided_step:{step.id}"

    return request.message, None


def _update_markdown_memory_background(
    session_id: str, effective_message: str, response_content: str,
    step_label: str, is_first_step: bool, previous_summary: str = "",
    phase: str = "", scores_context: str = "", questionnaire_type: str = "",
    language: str = "", completed_step: bool = False,
    transcript_user: str | None = None,
):
    """Compat legacy: aggiorna la memoria Markdown senza chiamare il modello."""
    try:
        session_memory.record_interaction(
            session_id,
            user_message=effective_message,
            transcript_user=transcript_user,
            bot_response=response_content,
            phase=phase,
            step_label=step_label,
            scores_context=scores_context,
            questionnaire_type=questionnaire_type,
            language=language,
            completed_step=completed_step,
        )
        logger.info(f"Session {session_id}: memoria Markdown aggiornata")
    except Exception as e:
        logger.error(f"Errore aggiornamento memoria Markdown per session {session_id}: {e}")


MAX_LEARNER_PROFILE_CHARS = 900

_LEARNER_PROFILE_LABELS = {
    "age": "Età",
    "gender": "Genere",
    "school_class": "Classe / contesto",
    "school_year": "Anno / percorso",
    "context": "Contesto di studio",
    "goal": "Obiettivo attuale",
    "main_difficulty": "Difficoltà principale percepita",
    "tried": "Strategie già provate",
    "notes": "Note",
}


def _learner_profile_context(db, username: str) -> str:
    """Sezione 'modello del discente' dall'ultima revisione del profilo auto-dichiarato.

    Va trattata come percezione soggettiva da confrontare con i punteggi,
    mai come verità che li sovrascrive."""
    if not username:
        return ""
    revision = (
        db.query(models.LearnerProfileRevision)
        .filter(models.LearnerProfileRevision.username == username)
        .order_by(models.LearnerProfileRevision.created_at.desc(), models.LearnerProfileRevision.id.desc())
        .first()
    )
    if revision is None or not revision.data:
        return ""
    lines = [
        "## Profilo dichiarato dallo studente",
        "Auto-descrizione dello studente: usala per contestualizzare e, quando utile, "
        "confronta la sua percezione con i punteggi. Non sovrascrive i dati dei questionari.",
    ]
    for key, label in _LEARNER_PROFILE_LABELS.items():
        value = str(revision.data.get(key) or "").strip()
        if value:
            lines.append(f"- {label}: {value}")
    if len(lines) <= 2:
        return ""
    if revision.created_at:
        lines.append(f"- Ultimo aggiornamento: {revision.created_at.date().isoformat()}")
    return "\n".join(lines)[:MAX_LEARNER_PROFILE_CHARS]


MAX_PORTFOLIO_CHARS = 1200


def _portfolio_context(db, username: str) -> str:
    """Sezione 'portfolio' = lavori/elaborati caricati dallo studente.

    Solo metadati testuali (titolo, categoria, data, descrizione); le immagini
    non entrano nel contesto. Usala per contestualizzare, non sono punteggi."""
    if not username:
        return ""
    items = (
        db.query(models.PortfolioItem)
        .filter(models.PortfolioItem.username == username)
        .order_by(models.PortfolioItem.created_at.desc(), models.PortfolioItem.id.desc())
        .limit(20)
        .all()
    )
    if not items:
        return ""
    lines = [
        "## Portfolio dello studente",
        "Lavori ed elaborati caricati dallo studente: usali per contestualizzare la conversazione.",
    ]
    for item in items:
        head = item.title or "Senza titolo"
        meta = []
        if item.category:
            meta.append(item.category)
        if item.item_date:
            meta.append(item.item_date)
        suffix = f" ({', '.join(meta)})" if meta else ""
        line = f"- {head}{suffix}"
        desc = str(item.description or "").strip()
        if desc:
            line += f": {desc}"
        lines.append(line)
    return "\n".join(lines)[:MAX_PORTFOLIO_CHARS]


def _retrieved_context(
    db,
    session_id: str,
    request: ChatRequest,
    questionnaire_type: str,
    query: str,
    ai_service=None,
    certified_strategy_limit: int | None = None,
    component_flags: dict | None = None,
) -> tuple[str, List[str], List[str]]:
    """Fonti KNOWLEDGE per l'envelope: RAG (competenzestrategiche, counselorbot, questionari)
    + strategie approvate + certificate per-fattore + risposte votate.

    I dati studente (profilo dichiarato, punteggi, stato sessione, goals/
    episodi) NON vivono più qui: sono assemblati in `build_context_envelope`
    nei blocchi [STUDENT] e [PROFILE] del system prompt."""
    if component_flags is None:
        component_flags = PROMPT_COMPONENT_DEFAULTS

    strategies = []
    if bool(component_flags.get("approved_strategies", True)):
        strategies_config = db.query(models.Config).filter(models.Config.key == APPROVED_STRATEGIES_CONFIG_KEY).first()
        approved_strategies_markdown = strategies_config.value if strategies_config else None
        strategies = strategy_memory.retrieve(
            questionnaire_type=questionnaire_type,
            phase=request.phase or "",
            query=query,
            language=request.language or "it",
            ai_service=ai_service,
            markdown_text=approved_strategies_markdown,
        )
    strategy_context = strategy_memory.render_context(strategies)

    step = db.query(models.GuidedStep).filter(models.GuidedStep.id == request.phase).first() if request.phase else None
    phase_codes = _phase_factor_codes(db, request.phase)
    certified_scores_context = _scope_scores_to_codes(request.scores_context or "", phase_codes) if phase_codes else (request.scores_context or "")
    certified_phase_query = " ".join(
        part.strip()
        for part in (
            step.label if step else "",
            step.prompt if step else "",
            request.message or "",
            certified_scores_context,
        )
        if part and part.strip()
    )
    step_mode = step.system_prompt_mode if step else request.mode
    certified_limit = _coerce_certified_strategy_limit(
        certified_strategy_limit,
        _default_certified_strategy_limit(step_mode),
    )
    certified = []
    if bool(component_flags.get("certified_strategies", True)) and certified_limit > 0:
        certified = certified_strategy_memory.retrieve(
            db,
            questionnaire_type=questionnaire_type,
            scores_context=certified_scores_context,
            query=certified_phase_query,
            language=request.language or "it",
            limit=certified_limit,
            ai_service=ai_service,
        )
    certified_context = certified_strategy_memory.render_context(certified, request.language or "it")

    learned_responses = []
    if bool(component_flags.get("shared_responses", True)):
        learned_responses = shared_response_memory.retrieve(
            db,
            questionnaire_type=questionnaire_type,
            phase=request.phase or "",
            query=query,
            language=request.language or "it",
        )
    learned_context = shared_response_memory.render_context(learned_responses)

    # RAG: Guide Competenzestrategiche.it
    graph_context = ""
    if bool(component_flags.get("rag_competenzestrategiche", True)):
        try:
            if query:
                rag_results = site_rag_index.search(
                    ai_service, query,
                    top_k=6, audience="studente",
                    max_per_source=2, min_score=0.25,
                )
                if rag_results:
                    graph_context = rag_build_context(rag_results, max_chars=3500)[0]
        except Exception as e:
            logger.warning(f"RAG competenzestrategiche non disponibile: {e}")
            graph_context = ""

    # RAG: Documenti CounselorBot (docs-counselorbot)
    counselorbot_context = ""
    if bool(component_flags.get("rag_counselorbot", False)):
        try:
            if query:
                cb_results = counselorbot_rag_index.search(
                    ai_service, query,
                    top_k=3, audience="studente",
                    max_per_source=2, min_score=0.25,
                )
                if cb_results:
                    counselorbot_context = rag_build_context(cb_results, max_chars=3500)[0]
        except Exception as e:
            logger.warning(f"RAG counselorbot non disponibile: {e}")
            counselorbot_context = ""

    # RAG: Materiali Questionari e strumenti
    questionari_context = ""
    if bool(component_flags.get("rag_questionari", False)):
        try:
            if query:
                q_results = questionari_rag_index.search(
                    ai_service, query,
                    top_k=4, audience="studente",
                    max_per_source=2, min_score=0.25,
                )
                if q_results:
                    questionari_context = rag_build_context(q_results, max_chars=3500)[0]
        except Exception as e:
            logger.warning(f"RAG questionari non disponibile: {e}")
            questionari_context = ""

    sections = [
        section
        for section in (
            graph_context,
            counselorbot_context,
            questionari_context,
            strategy_context,
            certified_context,
            learned_context,
        )
        if section
    ]
    return (
        "\n\n".join(sections),
        [strategy["id"] for strategy in strategies],
        [strategy["id"] for strategy in certified],
    )


PROMPT_COMPONENT_DEFAULTS = {
    "system_prompt": True,
    "step_prompt": True,
    "cognitive_factors": True,
    "affective_factors": True,
    "other_scores": True,
    "knowledge": True,
    "history": True,
    "counselor": True,
    "metadata": True,
    "profile": True,
    "student_booklet": True,
    "rag_counselorbot": False,
    "rag_competenzestrategiche": True,
    "rag_questionari": False,
    "approved_strategies": True,
    "certified_strategies": True,
    "shared_responses": True,
}


def prompt_component_config_key(questionnaire_type: str, step_id: str) -> str:
    q = re.sub(r"[^A-Za-z0-9_-]+", "-", (questionnaire_type or "GENERIC").strip().upper())
    s = re.sub(r"[^A-Za-z0-9_-]+", "-", (step_id or "generic").strip())
    return f"prompt_components_{q}_{s}"


def prompt_meta_config_key(questionnaire_type: str, step_id: str | None = None) -> str:
    q = re.sub(r"[^A-Za-z0-9_-]+", "-", (questionnaire_type or "GENERIC").strip().upper())
    base = f"prompt_meta_{q}"
    if step_id:
        s = re.sub(r"[^A-Za-z0-9_-]+", "-", step_id.strip())
        return f"{base}_{s}"
    return base


def get_prompt_component_flags(db, questionnaire_type: str, step_id: str | None) -> dict:
    flags = dict(PROMPT_COMPONENT_DEFAULTS)
    flags["allowed_strategies"] = None
    try:
        step = db.query(models.GuidedStep).filter(models.GuidedStep.id == step_id).first() if step_id else None
        if step and _is_intro_step_mode(step.system_prompt_mode):
            flags.update({
                "cognitive_factors": False,
                "affective_factors": False,
                "other_scores": False,
                "knowledge": False,
                "rag_counselorbot": True,
                "rag_competenzestrategiche": False,
                "rag_questionari": False,
                "approved_strategies": False,
                "certified_strategies": False,
                "shared_responses": False,
            })
        key = prompt_component_config_key(questionnaire_type, step_id or "generic")
        row = db.query(models.Config).filter(models.Config.key == key).first()
        if row and row.value:
            saved = json.loads(row.value)
            if isinstance(saved, dict):
                if "scores" in saved:
                    flags["cognitive_factors"] = bool(saved["scores"])
                    flags["affective_factors"] = bool(saved["scores"])
                    flags["other_scores"] = bool(saved["scores"])
                for name in PROMPT_COMPONENT_DEFAULTS:
                    if name in saved:
                        flags[name] = bool(saved[name])
                if "allowed_strategies" in saved:
                    val = saved.get("allowed_strategies")
                    if isinstance(val, list):
                        flags["allowed_strategies"] = [str(x) for x in val]
    except Exception:
        pass
    return flags


def _default_certified_strategy_limit(step_mode: str | None) -> int:
    return 3 if step_mode in {"second-level", "qsar-second-level"} else 2


def _coerce_certified_strategy_limit(value, default: int) -> int:
    try:
        limit = int(value)
    except (TypeError, ValueError):
        return default
    return max(0, min(3, limit))


def get_prompt_component_options(db, questionnaire_type: str, step_id: str | None, step_mode: str | None = None) -> dict:
    options = {
        "certified_strategy_limit": _default_certified_strategy_limit(step_mode),
        "allowed_strategies": None,
    }
    try:
        key = prompt_component_config_key(questionnaire_type, step_id or "generic")
        row = db.query(models.Config).filter(models.Config.key == key).first()
        if row and row.value:
            saved = json.loads(row.value)
            if isinstance(saved, dict):
                if "certified_strategy_limit" in saved:
                    options["certified_strategy_limit"] = _coerce_certified_strategy_limit(
                        saved.get("certified_strategy_limit"),
                        options["certified_strategy_limit"],
                    )
                if "allowed_strategies" in saved:
                    val = saved.get("allowed_strategies")
                    if isinstance(val, list):
                        options["allowed_strategies"] = [str(x) for x in val]
    except Exception:
        pass
    return options


def _component_enabled(flags: dict[str, bool] | None, name: str) -> bool:
    if not flags:
        return True
    return bool(flags.get(name, True))


MAX_BOOKLET_CONTEXT_CHARS = 1800
_SCORE_COMPONENT_RE = re.compile(r"\b([A-Z]{1,3}\d{1,2}r?)\b", re.IGNORECASE)


def filter_scores_by_components(scores_context: str, questionnaire_type: str, flags: dict[str, bool] | None) -> str:
    text = scores_context or ""
    if not text:
        return ""
    if not _is_strategy_questionnaire(questionnaire_type):
        return text if _component_enabled(flags, "other_scores") else ""
    allowed: tuple[str, ...] = tuple(
        prefix
        for enabled, prefix in (
            (_component_enabled(flags, "cognitive_factors"), "C"),
            (_component_enabled(flags, "affective_factors"), "A"),
        )
        if enabled
    )
    if not allowed:
        return ""
    lines: list[str] = []
    for line in text.splitlines():
        codes = [code.upper() for code in _SCORE_COMPONENT_RE.findall(line)]
        if not codes:
            if not lines:
                lines.append(line)
            continue
        if any(code.startswith(allowed) for code in codes):
            lines.append(line)
    return "\n".join(lines).strip()


def _scores_enabled(flags: dict[str, bool] | None, questionnaire_type: str) -> bool:
    if _is_strategy_questionnaire(questionnaire_type):
        return _component_enabled(flags, "cognitive_factors") or _component_enabled(flags, "affective_factors")
    return _component_enabled(flags, "other_scores")


def _render_booklet_data(data, prefix: str = "") -> list[str]:
    if isinstance(data, dict):
        lines: list[str] = []
        for key, value in data.items():
            lines.extend(_render_booklet_data(value, f"{prefix}{key}."))
        return lines
    if isinstance(data, list):
        lines: list[str] = []
        for idx, item in enumerate(data, start=1):
            lines.extend(_render_booklet_data(item, f"{prefix}{idx}."))
        return lines
    value = str(data or "").strip()
    return [f"- {prefix[:-1]}: {value}"[:300]] if value else []


def _instrument_meta_system_prompt(db, questionnaire_type: str, step_id: str | None = None) -> str:
    if not questionnaire_type:
        return ""
    try:
        # First try per-step config, fall back to instrument-level
        if step_id:
            step_key = prompt_meta_config_key(questionnaire_type, step_id)
            row = db.query(models.Config).filter(models.Config.key == step_key).first()
            if row and str(row.value or "").strip():
                return str(row.value).strip()
        # Fallback to instrument-level meta prompt
        row = db.query(models.Config).filter(models.Config.key == prompt_meta_config_key(questionnaire_type)).first()
        return str(row.value or "").strip() if row else ""
    except Exception:
        return ""


def _student_booklet_context(db, username: str, questionnaire_type: str, session_id: str) -> str:
    if not username or not questionnaire_type:
        return ""
    q = db.query(models.StudentBooklet).filter(
        models.StudentBooklet.username == username,
        models.StudentBooklet.questionnaire_type == questionnaire_type,
    )
    rows = q.order_by(
        (models.StudentBooklet.session_id == session_id).desc(),
        models.StudentBooklet.updated_at.desc(),
        models.StudentBooklet.id.desc(),
    ).limit(3).all()
    if not rows:
        return ""
    lines = ["## Taccuino dello studente", "Schede più recenti del taccuino/libretto per questo strumento."]
    for row in rows:
        title = str((row.data or {}).get("title") or f"Scheda {row.id}").strip()
        lines.append(f"### {title}")
        lines.extend(_render_booklet_data(row.data or {}))
    return "\n".join(lines)[:MAX_BOOKLET_CONTEXT_CHARS]


def build_context_envelope(
    db,
    ai_service,
    request: ChatRequest,
    session_id: str,
    identity: dict,
    *,
    c_persona: str,
    counselor_name: Optional[str] = None,
    system_prompt: str,
    step_label: str,
    step_id: str | None = None,
    questionnaire_type: str,
    effective_message: str,
    model_scores_context: str,
    message_scores_context: str,
    knowledge_context: str,
    include_history: bool = True,
    include_session_memory: bool = True,
    include_profile: bool = True,
    include_scores_reference: bool = True,
    create_anonymous_code: bool = True,
    component_flags: dict[str, bool] | None = None,
    components: dict | None = None,
) -> tuple[str, str, list]:
    """Assembla l'envelope canonico della chat counselor (Fase 5):
    SYSTEM = [PERSONA] [SECTION] [STUDENT] [PROFILE] [KNOWLEDGE]
    MESSAGES = history (verbatim, Fase 3) + user corrente (scores scope-ati + msg).

    Unifica /chat e /chat/stream in un unico builder d'ordine fisso, valido per
    tutti e 7 gli strumenti. Risolve la sovrapposizione episodes/history/summary:
    la continuity è nella history, KNOWLEDGE è nel system, niente più prepend
    "CONTEXT OF PREVIOUS CONVERSATIONS" sul messaggio utente.

    Ritorna (system_prompt_final, full_message, history)."""
    language = request.language or "it"

    # --- [SECTION] (già risolto e direttivato dal router) ---
    if not _component_enabled(component_flags, "system_prompt"):
        system_prompt = ""
    if not _component_enabled(component_flags, "step_prompt"):
        effective_message = ""
    if not _scores_enabled(component_flags, questionnaire_type):
        message_scores_context = ""
        include_scores_reference = False
    if not _component_enabled(component_flags, "knowledge"):
        knowledge_context = ""
    if not _component_enabled(component_flags, "profile"):
        include_profile = False
    if components is not None:
        components["system_prompt"] = system_prompt
        components["step_prompt"] = effective_message
        components["knowledge"] = knowledge_context

    parts_system = [system_prompt] if system_prompt else []
    meta_system_prompt = _instrument_meta_system_prompt(db, questionnaire_type, step_id)
    if components is not None:
        components["meta_system_prompt"] = meta_system_prompt
    if meta_system_prompt:
        parts_system.append("[META SYSTEM PROMPT]\n" + meta_system_prompt)

    # --- [STUDENT] dati studente da identity + stato sessione distillato ---
    student_lines: list[str] = []
    anon_code = None
    if create_anonymous_code:
        anon_code = code_for_identity(db, identity or {})
    else:
        username = ((identity or {}).get("username") or "").strip().lower()
        if username:
            existing_code = (
                db.query(models.AnonymousResearchCode.code)
                .filter(models.AnonymousResearchCode.username == username)
                .first()
            )
            anon_code = existing_code[0] if existing_code else None
    if anon_code:
        student_lines.append(f"- Codice ricerca anonimo: {anon_code}")
    if language:
        student_lines.append(f"- Lingua: {language}")
    if questionnaire_type:
        student_lines.append(f"- Questionario: {questionnaire_type}")
    if step_label:
        student_lines.append(f"- Step corrente: {step_label}")
    state = session_memory.get_student_state(session_id) if include_session_memory else {}
    if state:
        completed = state.get("completed_steps") or []
        if completed:
            student_lines.append(f"- Step completati: {', '.join(completed)}")
        goals = state.get("goals") or []
        if goals:
            student_lines.append(f"- Obiettivi dichiarati: {'; '.join(goals)}")
        prefs = state.get("preferences") or []
        if prefs:
            student_lines.append(f"- Preferenze: {'; '.join(prefs)}")
        notes = str(state.get("external_notes") or "").strip()
        if notes:
            student_lines.append(f"- Note condivise: {notes}")
    student_block = "\n".join(student_lines)
    if components is not None:
        components["metadata"] = student_block if _component_enabled(component_flags, "metadata") else ""
    if student_block and _component_enabled(component_flags, "metadata"):
        parts_system.append("[STUDENT]\n" + student_block)

    # --- [PROFILE] modello discente (auto-dichiarato) + PUNTEGGI (riferimento) ---
    username_for_context = identity.get("username", "") if identity else ""
    profile_context = _learner_profile_context(db, username_for_context) if include_profile else ""
    portfolio_context = _portfolio_context(db, username_for_context) if include_profile else ""
    # Punteggi: nel turno di analisi arrivano nel messaggio utente, nei follow-up
    # si recuperano da quelli persistiti e si scope-ano alla sezione corrente.
    persisted_scores = (
        ""
        if model_scores_context or not include_session_memory or not include_scores_reference
        else session_memory.get_scores(session_id)
    )
    if persisted_scores:
        scoped_scores = _scope_scores_to_codes(persisted_scores, _phase_factor_codes(db, request.phase))
        if scoped_scores:
            system_prompt_scores = _apply_scores_reference("", scoped_scores, language)
        else:
            system_prompt_scores = ""
    else:
        system_prompt_scores = ""
    profile_block = "\n\n".join(s for s in (profile_context, portfolio_context, system_prompt_scores) if s)
    if components is not None:
        components["profile"] = profile_block
        components["cognitive_factors"] = filter_scores_by_components(message_scores_context, questionnaire_type, {"cognitive_factors": True, "affective_factors": False})
        components["affective_factors"] = filter_scores_by_components(message_scores_context, questionnaire_type, {"cognitive_factors": False, "affective_factors": True})
        components["other_scores"] = "" if _is_strategy_questionnaire(questionnaire_type) else message_scores_context
    if profile_block:
        parts_system.append("[PROFILE]\n" + profile_block)

    booklet_context = _student_booklet_context(db, username_for_context, questionnaire_type, session_id) if _component_enabled(component_flags, "student_booklet") else ""
    if components is not None:
        components["student_booklet"] = booklet_context
    if booklet_context:
        parts_system.append("[BOOKLET]\n" + booklet_context)

    # --- [KNOWLEDGE] grafo + strategie + certificate + votate (da _retrieved_context) ---
    if knowledge_context:
        parts_system.append("[KNOWLEDGE]\n" + knowledge_context)

    system_prompt_final = "\n\n".join(parts_system)
    if components is not None:
        components["counselor"] = (c_persona or "") if _component_enabled(component_flags, "counselor") else ""
    if c_persona and _component_enabled(component_flags, "counselor"):
        system_prompt_final = f"{c_persona.strip()}\n\n{system_prompt_final}"
    # Placeholder nome counselor: risolto dal campo counselors.name, usato sia nella
    # persona sia negli intro di sezione. Fallback neutro quando nessun counselor e'
    # selezionato, cosi' il letterale {{counselor_name}} non raggiunge mai il modello.
    system_prompt_final = system_prompt_final.replace(
        "{{counselor_name}}", (counselor_name or "the counsellor")
    )

    # --- MESSAGES: history verbatim + user corrente (scores scope-ati + msg) ---
    history = session_memory.get_transcript(session_id) if include_history and include_session_memory and _component_enabled(component_flags, "history") else []
    if message_scores_context and effective_message:
        full_message = f"{message_scores_context}\n\nDOMANDA DELLO STUDENTE:\n{effective_message}"
    elif message_scores_context:
        full_message = message_scores_context
    else:
        full_message = effective_message
    if components is not None:
        components["history"] = history

    return system_prompt_final, full_message, history


def strip_markdown(text: str) -> str:
    """Remove markdown formatting for cleaner TTS"""
    text = re.sub(r'#{1,6}\s*', '', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
    text = re.sub(r'\*([^*]+)\*', r'\1', text)
    text = re.sub(r'---+', '', text)
    text = re.sub(r'^[\-\*]\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()
