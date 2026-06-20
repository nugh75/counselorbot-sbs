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
    'en' (o lingua sconosciuta/assente) = nessuna modifica: i prompt base sono in inglese.
    Per ogni altra lingua supportata (incluso 'it') viene aggiunta la direttiva [LANGUAGE]
    che forza l'intera risposta in quella lingua, a prescindere dalla lingua delle istruzioni."""
    if not language or language == "en" or language not in SUPPORTED_AI_LANGUAGES:
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
    inverted = ", ".join(
        f"{code} ({names[code]})" for code in inverted_codes if code in names
    )
    # Label di interpretazione nella lingua dello studente: il modello le riusa
    # tali e quali nella tabella, quindi non devono restare in inglese.
    lbl = _qsa_assessment_labels(language)
    return (
        f"{system_prompt}\n\n"
        "[FACTOR LABELS] In every reply addressed to the student, never write "
        f"an isolated {instrument} factor code. Each code must be immediately "
        "accompanied by its full name, in the form `C2 (Self-regulation)`. "
        f"Mandatory reference: {examples}.\n\n"
        "[INVERTED FACTORS] Scale 1-9. Use EXACTLY these assessment labels "
        "(already in the student's language) in the interpretation column, never their English form: "
        f"1-3 = {lbl['growth']}, 4-6 = {lbl['adequate']}, 7-9 = {lbl['strength']}. "
        f"BUT the following factors are INVERTED: {inverted}. "
        f"For THESE factors the reading flips: 1-3 = {lbl['strength']}, 4-6 = {lbl['normal']}, "
        f"7-9 = {lbl['growth']} (a high score = a problem to work on, NOT a strength). "
        "Absolute rule: never read 'high = strength' automatically; "
        "always apply the inversion to the listed factors. "
        f"Apply this rule exclusively to the inverted {instrument} factors listed above."
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
):
    """Compat legacy: aggiorna la memoria Markdown senza chiamare il modello."""
    try:
        session_memory.record_interaction(
            session_id,
            user_message=effective_message,
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
    username: str = "",
) -> tuple[str, List[str]]:
    # Follow-up discorsivo: NON re-iniettare i punteggi completi dalla memoria,
    # altrimenti il modello ri-analizza tutto il profilo (tabella + altri fattori).
    # Il chiarimento deve commentare solo quanto già emerso nella conversazione.
    include_scores = not bool(request.scores_context) and request.mode not in _CONVERSATIONAL_MODES
    memory = session_memory.get_relevant_context(
        session_id,
        query=query,
        include_scores=include_scores,
        ai_service=ai_service,
    )
    strategies = strategy_memory.retrieve(
        questionnaire_type=questionnaire_type,
        phase=request.phase or "",
        query=query,
        language=request.language or "it",
        ai_service=ai_service,
    )
    strategy_context = strategy_memory.render_context(strategies)
    learned_responses = shared_response_memory.retrieve(
        db,
        questionnaire_type=questionnaire_type,
        phase=request.phase or "",
        query=query,
        language=request.language or "it",
    )
    learned_context = shared_response_memory.render_context(learned_responses)
    profile_context = _learner_profile_context(db, username)
    sections = [section for section in (profile_context, memory, strategy_context, learned_context) if section]
    return "\n\n".join(sections), [strategy["id"] for strategy in strategies]


def strip_markdown(text: str) -> str:
    """Remove markdown formatting for cleaner TTS"""
    text = re.sub(r'#{1,6}\s*', '', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
    text = re.sub(r'\*([^*]+)\*', r'\1', text)
    text = re.sub(r'---+', '', text)
    text = re.sub(r'^[\-\*]\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()
