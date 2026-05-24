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
from .ai_service import AIService
from .memory_service import session_memory
from .strategy_memory import strategy_memory
from .api_models import ChatRequest
from .prompt_config import (
    DEFAULT_SYSTEM_PROMPT_GENERIC,
    DEFAULT_GUIDED_STEPS,
    DEFAULT_QSAR_GUIDED_STEPS,
    DEFAULT_ZTPI_GUIDED_STEPS,
    DEFAULT_SAVICKAS_GUIDED_STEPS,
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


def _ensure_questionnaire_guided_steps(db, questionnaire_type: str) -> None:
    """Ensure default guided steps exist for the requested questionnaire."""
    defaults_by_type = {
        "QSA": DEFAULT_GUIDED_STEPS,
        "QSAr": DEFAULT_QSAR_GUIDED_STEPS,
        "ZTPI": DEFAULT_ZTPI_GUIDED_STEPS,
        "SAVICKAS": DEFAULT_SAVICKAS_GUIDED_STEPS,
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


# Con il thinking attivo il reasoning consuma il budget di output: serve headroom
# extra perche' la risposta vera abbia spazio dopo il ragionamento.
# I modelli reasoning (es. qwen3) producono ragionamenti lunghi: budget generoso.
_THINKING_MIN_OUTPUT_TOKENS = 6000


def _apply_thinking_token_headroom(max_tokens: Optional[int], ai_service: "AIService") -> Optional[int]:
    if ai_service.disable_thinking:
        return max_tokens
    if max_tokens is None:
        return _THINKING_MIN_OUTPUT_TOKENS
    return max(max_tokens, _THINKING_MIN_OUTPUT_TOKENS)


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
    'it' (o lingua sconosciuta) = nessuna modifica: i prompt base sono in italiano."""
    if not language or language == "it" or language not in SUPPORTED_AI_LANGUAGES:
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
    return annotated


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
    return (
        f"{system_prompt}\n\n"
        "[FACTOR LABELS] In ogni risposta rivolta allo studente, non scrivere mai "
        f"una sigla di fattore {instrument} isolata. Ogni sigla deve essere immediatamente "
        "accompagnata dal nome esteso, nella forma `C2 (Autoregolazione)`. "
        f"Riferimento obbligatorio: {examples}.\n\n"
        "[FATTORI INVERTITI] Scala 1-9. Per la maggioranza dei fattori vale: "
        "1-3 = Area di crescita, 4-6 = Adeguato, 7-9 = Forza. "
        f"MA i seguenti fattori sono INVERTITI: {inverted}. "
        "Per QUESTI fattori la lettura si ribalta: 1-3 = Forza, 4-6 = Normale, "
        "7-9 = Area di crescita (punteggio alto = problema da migliorare, NON un punto di forza). "
        "Regola assoluta: non leggere mai 'alto = forza' in modo automatico; "
        "applica sempre l'inversione ai fattori elencati. "
        f"Applica questa regola esclusivamente ai fattori inversi di {instrument} elencati sopra."
    )


def _student_visible_response(
    text: str,
    questionnaire_type: str,
    language: Optional[str],
    sanitize_ztpi: bool,
) -> str:
    if sanitize_ztpi:
        return _sanitize_ztpi_user_text(text)
    if _is_strategy_questionnaire(questionnaire_type):
        return _annotate_qsa_factor_codes(text, language, progressive=True, questionnaire_type=questionnaire_type)
    return text


_GUIDED_NO_GREETING_SUFFIX = " NON iniziare con saluti. Vai direttamente all'analisi."

# Modalità discorsive: domande di approfondimento dello studente dentro uno step.
# Devono usare il prompt mode-based anche se `phase` punta a uno step di analisi.
_CONVERSATIONAL_MODES = {"factor-qa", "qsar-factor-qa"}

_ZTPI_FACTOR_NAME_BY_CODE = {
    "T1": "Passato Negativo",
    "T2": "Passato Positivo",
    "T3": "Presente Edonistico",
    "T4": "Presente Fatalistico",
    "T5": "Futuro",
}


def _sanitize_ztpi_user_text(text: str) -> str:
    """Rende il testo utente ZTPI privo di sigle tecniche."""
    if not text:
        return text

    cleaned = text

    # Prima elimina forme duplicate tipo "T3 (Presente Edonistico)".
    for code, name in _ZTPI_FACTOR_NAME_BY_CODE.items():
        cleaned = re.sub(
            rf"\b{code}\s*\(\s*{re.escape(name)}\s*\)",
            name,
            cleaned,
            flags=re.IGNORECASE,
        )

    # Sostituisce i codici fattore con il nome completo.
    for code, name in _ZTPI_FACTOR_NAME_BY_CODE.items():
        cleaned = re.sub(rf"\b{code}\b", name, cleaned)

    # Sostituisce sigle tecniche residue con formulazioni estese.
    cleaned = re.sub(
        r"\bZimbardo Time Perspective Inventory\s*\(\s*ZTPI\s*\)",
        "prospettiva temporale di Zimbardo",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\bProfilo Temporale Bilanciato\s*\(\s*PTB\s*\)",
        "profilo temporale equilibrato",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\bprofilo temporale bilanciato\b", "profilo temporale equilibrato", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bPTB\b", "profilo temporale equilibrato", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bDBTP-r?\b", "distanza dal profilo temporale equilibrato", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bZTPI\b", "prospettiva temporale", cleaned, flags=re.IGNORECASE)

    # Normalizza eventuali ripetizioni create dalle sostituzioni.
    for name in _ZTPI_FACTOR_NAME_BY_CODE.values():
        cleaned = re.sub(
            rf"{re.escape(name)}\s*\(\s*{re.escape(name)}\s*\)",
            name,
            cleaned,
            flags=re.IGNORECASE,
        )

    cleaned = re.sub(r"(profilo temporale equilibrato)\s*\([^)]*\)", r"\1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\(\s*profilo temporale equilibrato\s*\)", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    cleaned = re.sub(r"\s+([,.;:])", r"\1", cleaned)
    return cleaned.strip()


def _sanitize_ztpi_step_label(label: str) -> str:
    """Pulisce le etichette step ZTPI rimuovendo prefissi con codici tecnici."""
    if not label:
        return label
    cleaned = re.sub(r"\bT[1-5]\b\s*-\s*", "", label)
    cleaned = re.sub(r"\bprofilo temporale bilanciato\b", "Profilo Temporale Equilibrato", cleaned, flags=re.IGNORECASE)
    cleaned = _sanitize_ztpi_user_text(cleaned)
    cleaned = re.sub(r"\bprofilo temporale equilibrato\b", "Profilo Temporale Equilibrato", cleaned, flags=re.IGNORECASE)
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


def _retrieved_context(
    session_id: str,
    request: ChatRequest,
    questionnaire_type: str,
    query: str,
) -> tuple[str, List[str]]:
    # Follow-up discorsivo: NON re-iniettare i punteggi completi dalla memoria,
    # altrimenti il modello ri-analizza tutto il profilo (tabella + altri fattori).
    # Il chiarimento deve commentare solo quanto già emerso nella conversazione.
    include_scores = not bool(request.scores_context) and request.mode not in _CONVERSATIONAL_MODES
    memory = session_memory.get_relevant_context(
        session_id,
        query=query,
        include_scores=include_scores,
    )
    strategies = strategy_memory.retrieve(
        questionnaire_type=questionnaire_type,
        phase=request.phase or "",
        query=query,
        language=request.language or "it",
    )
    strategy_context = strategy_memory.render_context(strategies)
    sections = [section for section in (memory, strategy_context) if section]
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
