"""Logica di chat e helper puri estratti da main.py.

Nessun endpoint qui: solo funzioni di supporto (risoluzione prompt,
sanitizzazione QSA/ZTPI, contesto recuperato, ecc.) e le costanti correlate.
Importato dai router in backend/routes/."""
import re
import logging
import asyncio
from typing import List, Optional

from fastapi import HTTPException

from . import models
from . import database
from .anonymous_codes import code_for_identity
from .ai_service import AIService
from .memory_service import session_memory
from .strategy_memory import shared_response_memory, strategy_memory
from .certified_strategy_service import certified_strategy_memory
from .rag_index import site_rag_index, build_context as rag_build_context
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


def log_error(db, session_id: str, error: str, *, identity: Optional[dict] = None,
              action: str = "chat_error", questionnaire_type: Optional[str] = None,
              mode: Optional[str] = None, phase: Optional[str] = None) -> None:
    """Scrive un record di log per un errore di chat. Best-effort: non propaga
    eccezioni (un fallimento di logging non deve peggiorare l'errore originale)."""
    try:
        ident = identity or {}
        db.add(models.Log(
            session_id=session_id,
            action=action,
            username=ident.get("username") or None,
            email=ident.get("email") or None,
            anonymous_research_code=code_for_identity(db, ident),
            questionnaire_type=questionnaire_type,
            mode=mode,
            phase=phase,
            details={"error": str(error)[:1000]},
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

_QSA_FACTOR_NAMES = {
    "it": {
        "C1": "Strategie elaborative", "C2": "Autoregolazione", "C3": "Disorientamento",
        "C4": "Disponibilità alla collaborazione", "C5": "Organizzatori semantici",
        "C6": "Difficoltà di concentrazione", "C7": "Autointerrogazione",
        "A1": "Ansietà di base", "A2": "Volizione",
        "A3": "Attribuzione a cause controllabili", "A4": "Attribuzione a cause incontrollabili",
        "A5": "Mancanza di perseveranza", "A6": "Percezione di competenza",
        "A7": "Interferenze emotive",
    },
    "en": {
        "C1": "Elaborative strategies", "C2": "Self-regulation", "C3": "Disorientation",
        "C4": "Willingness to collaborate", "C5": "Semantic organisers",
        "C6": "Concentration difficulties", "C7": "Self-questioning",
        "A1": "Baseline anxiety", "A2": "Volition",
        "A3": "Attribution to controllable causes", "A4": "Attribution to uncontrollable causes",
        "A5": "Lack of perseverance", "A6": "Perceived competence",
        "A7": "Emotional interference",
    },
    "es": {
        "C1": "Estrategias elaborativas", "C2": "Autorregulación", "C3": "Desorientación",
        "C4": "Disposición a colaborar", "C5": "Organizadores semánticos",
        "C6": "Dificultades de concentración", "C7": "Autointerrogación",
        "A1": "Ansiedad de base", "A2": "Volición",
        "A3": "Atribución a causas controlables", "A4": "Atribución a causas incontrolables",
        "A5": "Falta de perseverancia", "A6": "Percepción de competencia",
        "A7": "Interferencias emocionales",
    },
    "fr": {
        "C1": "Stratégies d'élaboration", "C2": "Autorégulation", "C3": "Désorientation",
        "C4": "Disposition à collaborer", "C5": "Organisateurs sémantiques",
        "C6": "Difficultés de concentration", "C7": "Auto-questionnement",
        "A1": "Anxiété de base", "A2": "Volition",
        "A3": "Attribution à des causes contrôlables", "A4": "Attribution à des causes incontrôlables",
        "A5": "Manque de persévérance", "A6": "Perception de compétence",
        "A7": "Interférences émotionnelles",
    },
    "de": {
        "C1": "Elaborationsstrategien", "C2": "Selbstregulation", "C3": "Desorientierung",
        "C4": "Kooperationsbereitschaft", "C5": "Semantische Organisatoren",
        "C6": "Konzentrationsschwierigkeiten", "C7": "Selbstbefragung",
        "A1": "Grundangst", "A2": "Volition",
        "A3": "Attribution auf kontrollierbare Ursachen", "A4": "Attribution auf unkontrollierbare Ursachen",
        "A5": "Mangelnde Ausdauer", "A6": "Kompetenzwahrnehmung",
        "A7": "Emotionale Interferenzen",
    },
    "sv": {
        "C1": "Bearbetningsstrategier", "C2": "Självreglering", "C3": "Desorientering",
        "C4": "Samarbetsvilja", "C5": "Semantiska organisatörer",
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


# Fattori QSA invertiti: punteggio basso (1-3) = Forza, alto (7-9) = Area di crescita.
# Allineato a frontend questionnaires.ts -> QUESTIONNAIRES.QSA.invertedFactors.
_QSA_INVERTED_CODES = ("C3", "C6", "A1", "A4", "A5", "A7")
_QSAR_INVERTED_CODES = ("C4r", "A1r")


def _apply_language_directive(system_prompt: str, language: Optional[str]) -> str:
    """Aggiunge in coda al system prompt l'istruzione di rispondere nella lingua scelta.
    Per ogni lingua supportata viene aggiunta la direttiva [LANGUAGE] che forza
    l'intera risposta in quella lingua, a prescindere dalla lingua delle istruzioni."""
    if not language or language not in SUPPORTED_AI_LANGUAGES:
        return system_prompt
    eng, native = SUPPORTED_AI_LANGUAGES[language]
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


# Etichetta del blocco punteggi di riferimento, per lingua dello studente.
_SCORES_REFERENCE_LABELS = {
    "it": "PROFILO DELLO STUDENTE (punteggi di riferimento, validi per tutta la sessione)",
    "en": "STUDENT PROFILE (reference scores, valid for the whole session)",
    "es": "PERFIL DEL ESTUDIANTE (puntuaciones de referencia, válidas durante toda la sesión)",
    "fr": "PROFIL DE L'ÉTUDIANT (scores de référence, valables pendant toute la session)",
    "de": "PROFIL DES STUDIERENDEN (Referenzwerte, für die gesamte Sitzung gültig)",
    "sv": "STUDENTENS PROFIL (referenspoäng, giltiga under hela sessionen)",
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


def _is_qsa(questionnaire_type: Optional[str]) -> bool:
    return (questionnaire_type or "").upper() == "QSA"


def _is_strategy_questionnaire(questionnaire_type: Optional[str]) -> bool:
    return (questionnaire_type or "").upper() in {"QSA", "QSAR"}


def _qsa_factor_names(language: Optional[str], questionnaire_type: str = "QSA") -> dict[str, str]:
    dictionary = _QSAR_FACTOR_NAMES if (questionnaire_type or "").upper() == "QSAR" else _QSA_FACTOR_NAMES
    return dictionary.get(language or "it", dictionary["it"])


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


def _localize_assessment_labels(text: str, language: Optional[str]) -> str:
    """Rete di sicurezza: se il modello scrive comunque 'Area for growth/improvement'
    in inglese (frase distintiva, non confondibile con prosa), la riporta nella
    lingua dello studente. 'Strength'/'Normal' NON vengono toccati per non
    corrompere il testo libero."""
    if not text or not language or language == "en":
        return text
    growth = _qsa_assessment_labels(language)["growth"]
    return re.sub(r"\bareas?\s+for\s+(?:growth|improvement)\b", growth, text, flags=re.IGNORECASE)


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
        annotated = re.sub(rf"\b{code}\b(?!\s*\()", f"{code} ({name})", annotated)
    return _localize_assessment_labels(annotated, language)


def _apply_qsa_factor_directive(system_prompt: str, questionnaire_type: str, language: Optional[str]) -> str:
    if not _is_strategy_questionnaire(questionnaire_type):
        return system_prompt
    instrument = "QSAr" if (questionnaire_type or "").upper() == "QSAR" else "QSA"
    names = _qsa_factor_names(language, questionnaire_type)
    inverted_codes = _QSAR_INVERTED_CODES if instrument == "QSAr" else _QSA_INVERTED_CODES
    examples = ", ".join(f"{code} ({name})" for code, name in names.items())
    # Label di interpretazione nella lingua dello studente: il modello le riusa
    # tali e quali nella tabella, quindi non devono restare in inglese.
    lbl = _qsa_assessment_labels(language)
    # Inversione pre-risolta per fattore: ogni riga porta gia le bande corrette,
    # cosi un modello piccolo non deve piu decidere se un codice e invertito (era
    # la causa di errori tipo A5=9 letto come "Forza"). Legge la riga e basta.
    direct_bands = f"1-3 = {lbl['growth']} · 4-6 = {lbl['adequate']} · 7-9 = {lbl['strength']}"
    inverted_bands = f"1-3 = {lbl['strength']} · 4-6 = {lbl['normal']} · 7-9 = {lbl['growth']}"
    rows = [
        f"- {code} ({name}): {inverted_bands if code in inverted_codes else direct_bands}"
        for code, name in names.items()
    ]
    interpretation_table = "\n".join(rows)
    return (
        f"{system_prompt}\n\n"
        "[FACTOR LABELS] In every reply addressed to the student, never write "
        f"an isolated {instrument} factor code. Each code must be immediately "
        "accompanied by its full name, in the form `C2 (Self-regulation)`. "
        f"Mandatory reference: {examples}.\n\n"
        "[INTERPRETATION TABLE] Scale 1-9. Assign each factor the label of its "
        "score band by reading ITS OWN row below; the labels are already in the "
        "student's language. The inversion is already resolved per factor: do NOT "
        "decide the inversion yourself, just read the row.\n"
        f"{interpretation_table}\n"
        "For some factors a high score is an area to work on, not a strength: "
        "always use the band shown in the factor's own row; never read "
        "'high = strength' automatically."
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


def _retrieved_context(
    db,
    session_id: str,
    request: ChatRequest,
    questionnaire_type: str,
    query: str,
    ai_service=None,
) -> tuple[str, List[str]]:
    """Fonti KNOWLEDGE per l'envelope: grafo competenzestrategiche + strategie
    approvate + certificate per-fattore + risposte votate.

    I dati studente (profilo dichiarato, punteggi, stato sessione, goals/...
    episodi) NON vivono più qui: sono assemblati in `build_context_envelope`
    nei blocchi [STUDENT] e [PROFILE] del system prompt."""
    strategies = strategy_memory.retrieve(
        questionnaire_type=questionnaire_type,
        phase=request.phase or "",
        query=query,
        language=request.language or "it",
        ai_service=ai_service,
    )
    strategy_context = strategy_memory.render_context(strategies)
    certified = certified_strategy_memory.retrieve(
        db,
        questionnaire_type=questionnaire_type,
        scores_context=request.scores_context or "",
        query=query,
        language=request.language or "it",
        ai_service=ai_service,
    )
    certified_context = certified_strategy_memory.render_context(certified, request.language or "it")
    learned_responses = shared_response_memory.retrieve(
        db,
        questionnaire_type=questionnaire_type,
        phase=request.phase or "",
        query=query,
        language=request.language or "it",
    )
    learned_context = shared_response_memory.render_context(learned_responses)

    # Grafo di conoscenza competenzestrategiche (l'unica collezione con grafo
    # graphify): retrieval ibrido con espansione via grafo, riuso di
    # SiteRagIndex.search. Tollerante: se Ollama/embedding non disponibili il
    # counselor continua senza questa fonte (non degrada l'esperienza).
    graph_context = ""
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

    sections = [
        section
        for section in (graph_context, strategy_context, certified_context, learned_context)
        if section
    ]
    return "\n\n".join(sections), [strategy["id"] for strategy in strategies]


def build_context_envelope(
    db,
    ai_service,
    request: ChatRequest,
    session_id: str,
    identity: dict,
    *,
    c_persona: str,
    system_prompt: str,
    step_label: str,
    questionnaire_type: str,
    effective_message: str,
    model_scores_context: str,
    message_scores_context: str,
    knowledge_context: str,
    include_history: bool = True,
    include_session_memory: bool = True,
    create_anonymous_code: bool = True,
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
    parts_system = [system_prompt] if system_prompt else []

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
    if student_lines:
        parts_system.append("[STUDENT]\n" + "\n".join(student_lines))

    # --- [PROFILE] modello discente (auto-dichiarato) + PUNTEGGI (riferimento) ---
    profile_context = _learner_profile_context(db, identity.get("username", "") if identity else "")
    # Punteggi: nel turno di analisi arrivano nel messaggio utente, nei follow-up
    # si recuperano da quelli persistiti e si scope-ano alla sezione corrente.
    persisted_scores = "" if model_scores_context or not include_session_memory else session_memory.get_scores(session_id)
    if persisted_scores:
        scoped_scores = _scope_scores_to_codes(persisted_scores, _phase_factor_codes(db, request.phase))
        if scoped_scores:
            system_prompt_scores = _apply_scores_reference("", scoped_scores, language)
        else:
            system_prompt_scores = ""
    else:
        system_prompt_scores = ""
    profile_block = "\n\n".join(s for s in (profile_context, system_prompt_scores) if s)
    if profile_block:
        parts_system.append("[PROFILE]\n" + profile_block)

    # --- [KNOWLEDGE] grafo + strategie + certificate + votate (da _retrieved_context) ---
    if knowledge_context:
        parts_system.append("[KNOWLEDGE]\n" + knowledge_context)

    system_prompt_final = "\n\n".join(parts_system)
    if c_persona:
        system_prompt_final = f"{c_persona.strip()}\n\n{system_prompt_final}"

    # --- MESSAGES: history verbatim + user corrente (scores scope-ati + msg) ---
    history = session_memory.get_transcript(session_id) if include_history and include_session_memory else []
    if message_scores_context:
        full_message = f"{message_scores_context}\n\nDOMANDA DELLO STUDENTE:\n{effective_message}"
    else:
        full_message = effective_message

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
