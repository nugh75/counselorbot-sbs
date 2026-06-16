#!/usr/bin/env python3
r"""QSA Ollama Benchmark — test di performance e affidabilità dei modelli Ollama
sull'interazione completa CounselorBot QSA (Questionario sui processi di Apprendimento).

Scopo: simulare l'interazione completa CounselorBot QSA:
  - 8 passi dell'analisi guidata (fattori cognitivi, affettivi, 6 second-level)
  - 3 domande di follow-up (fase Q&A)
  - Test di concorrenza

Metriche: TTFT, token/s, qualità risposta (copertura fattori, formato codici,
           rispetto regole fattori invertiti, nessun saluto, lingua).

Utilizzo:
  python -m backend.tests.test_ollama_qsa_benchmark

Variabili d'ambiente:
  OLLAMA_URL       default http://localhost:11434
  CONCURRENT_USERS default 3          (simula N studenti contemporanei)
  MODELS           default auto       (virgola-separati, es "gemma4:12b,qwen3.5:9b")
  LANGUAGE         default it
  MIN_WORDS        default 30         (soglia per considerare una risposta valida)
  OUTPUT           default ""         (salva report markdown su file se specificato)
  MAX_PARAMS_B     default 15         (filtra modelli con parametri <= 15B)
"""

import asyncio
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

try:
    import httpx
except ImportError:
    print("Serve httpx: pip install httpx", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Configurazione da ambiente
# ---------------------------------------------------------------------------
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
CONCURRENT_USERS = int(os.environ.get("CONCURRENT_USERS", "3"))
LANGUAGE = os.environ.get("LANGUAGE", "it")
MIN_WORDS = int(os.environ.get("MIN_WORDS", "30"))
OUTPUT_FILE = os.environ.get("OUTPUT", "")
_MODELS_OVERRIDE = os.environ.get("MODELS", "")
MAX_PARAMS_B = float(os.environ.get("MAX_PARAMS_B", "15"))

# Abilita warmup (default True: carica modello in GPU prima dei test)
WARMUP = os.environ.get("WARMUP", "1").lower() in ("1", "true", "yes")

# Lingue supportate
LANG_MAP: dict[str, tuple[str, str]] = {
    "it": ("Italian", "italiano"),
    "en": ("English", "English"),
    "es": ("Spanish", "español"),
    "fr": ("French", "français"),
    "de": ("German", "Deutsch"),
    "sv": ("Swedish", "svenska"),
}

# Nomi fattori QSA (italiano)
QSA_FACTOR_IT: dict[str, str] = {
    "C1": "Strategie elaborative", "C2": "Autoregolazione", "C3": "Disorientamento",
    "C4": "Disponibilità alla collaborazione", "C5": "Organizzatori semantici",
    "C6": "Difficoltà di concentrazione", "C7": "Autointerrogazione",
    "A1": "Ansietà di base", "A2": "Volizione",
    "A3": "Attribuzione a cause controllabili", "A4": "Attribuzione a cause incontrollabili",
    "A5": "Mancanza di perseveranza", "A6": "Percezione di competenza",
    "A7": "Interferenze emotive",
}

# Nomi fattori in inglese
QSA_FACTOR_EN: dict[str, str] = {
    "C1": "Elaborative strategies", "C2": "Self-regulation", "C3": "Disorientation",
    "C4": "Willingness to collaborate", "C5": "Semantic organisers",
    "C6": "Concentration difficulties", "C7": "Self-questioning",
    "A1": "Baseline anxiety", "A2": "Volition",
    "A3": "Attribution to controllable causes", "A4": "Attribution to uncontrollable causes",
    "A5": "Lack of perseverance", "A6": "Perceived competence",
    "A7": "Emotional interference",
}

QSA_INVERTED = ("C3", "C6", "A1", "A4", "A5", "A7")

# Profilo QSA simulato (punteggi stanine 1-9)
QSA_PROFILE: dict[str, int] = {
    "C1": 7, "C2": 5, "C3": 3, "C4": 6, "C5": 4, "C6": 7, "C7": 5,
    "A1": 8, "A2": 6, "A3": 5, "A4": 8, "A5": 6, "A6": 3, "A7": 7,
}

# ---------------------------------------------------------------------------
# Prompt di sistema (rispecchiano prompt_config.py + chat_logic.py directives)
# ---------------------------------------------------------------------------
SYSTEM_PROMPT_FACTOR = (
    "You are CounselorBot, a QSA expert. Analyse the results factor by factor "
    "(cognitive and affective), use a clear and professional tone, avoid diagnoses, "
    "and give useful, concrete observations in English. "
    "You are inside an already-started structured analysis sequence: do NOT use opening greetings "
    "(e.g. 'Hi!', 'Great idea', 'Welcome'). Start directly with the requested analysis."
)

SYSTEM_PROMPT_SECOND_LEVEL = (
    "You are CounselorBot, a QSA expert. Provide second-level analysis of the "
    "macro-dimensions of the study method, relating the factors to one another and "
    "proposing practical guidance in English. "
    "You are inside an already-started structured analysis sequence: do NOT use opening greetings "
    "(e.g. 'Hi!', 'Great idea', 'Welcome'). Start directly with the requested analysis."
)

SYSTEM_PROMPT_FACTOR_QA = (
    "You are CounselorBot, a QSA expert, in the follow-up phase of an analysis step "
    "already completed. The student asks you a clarifying question. "
    "Your task is to COMMENT on and EXPAND ONLY what has already emerged in the "
    "current conversation: it is a comment on what was already said, not a new analysis. "
    "Reply in a FOCUSED, conversational and concise way, in English. Binding rules: "
    "(1) do NOT produce tables unless the student explicitly requests them; "
    "(2) answer ONLY the question asked, referring solely to the factors already discussed "
    "and relevant to the question; "
    "(3) do NOT re-list or re-analyse all the factors of the profile; "
    "(4) do NOT introduce factors, scores, data or topics not yet covered; "
    "(5) no opening greetings, go straight to the answer. "
    "Clear and professional tone, with practical, targeted suggestions."
)

SYSTEM_PROMPT_GENERIC = (
    "You are CounselorBot, an assistant expert in analysing the Learning Strategies "
    "Questionnaire (QSA). Always reply in English, clearly, professionally and "
    "oriented towards practical suggestions."
)

# ---------------------------------------------------------------------------
# Direttive CounselorBot (chat_logic.py _apply_qsa_factor_directive)
# ---------------------------------------------------------------------------

def factor_labels_directive(lang: str) -> str:
    """Riproduce la direttiva [FACTOR LABELS] + [INVERTED FACTORS] di chat_logic.py."""
    names = QSA_FACTOR_IT if lang == "it" else QSA_FACTOR_EN
    inverted_codes = QSA_INVERTED
    examples = ", ".join(f"{code} ({name})" for code, name in names.items())
    inverted = ", ".join(
        f"{code} ({names[code]})" for code in inverted_codes if code in names
    )
    return (
        "\n\n[FACTOR LABELS] In every reply addressed to the student, never write "
        "an isolated QSA factor code. Each code must be immediately "
        "accompanied by its full name, in the form `C2 (Self-regulation)`. "
        f"Mandatory reference: {examples}.\n\n"
        "[INVERTED FACTORS] Scale 1-9. For most factors: "
        "1-3 = Area for growth, 4-6 = Adequate, 7-9 = Strength. "
        f"BUT the following factors are INVERTED: {inverted}. "
        "For THESE factors the reading flips: 1-3 = Strength, 4-6 = Normal, "
        "7-9 = Area for growth (a high score = a problem to work on, NOT a strength). "
        "Absolute rule: never read 'high = strength' automatically; "
        "always apply the inversion to the listed factors. "
        "Apply this rule exclusively to the inverted QSA factors listed above."
    )

# ---------------------------------------------------------------------------
# Passi guidati QSA (rispecchiano prompt_config.py DEFAULT_GUIDED_STEPS)
# ---------------------------------------------------------------------------
QSA_STEPS: list[dict[str, str]] = [
    {"id": "cognitive", "label": "1. Fattori Cognitivi", "mode": "factor",
     "prompt": "Analyse ONLY the COGNITIVE factors (C1-C7) of my QSA profile. For each, give the score, interpretation and a short comment.",
     "factors": "C1,C2,C3,C4,C5,C6,C7"},
    {"id": "affective", "label": "2. Fattori Affettivi", "mode": "factor",
     "prompt": "Analyse ONLY the AFFECTIVE factors (A1-A7) of my QSA profile. For each, give the score, interpretation and a short comment.",
     "factors": "A1,A2,A3,A4,A5,A6,A7"},
    {"id": "sl-elaboration", "label": "3.1 Elaborazione e Org.", "mode": "second-level",
     "prompt": "Second-Level Analysis - Part 1: ELABORATION AND ORGANISATION. Analyse together the factors: C1 (Elaborative strategies), C5 (Semantic organisers), C7 (Self-questioning). Assess how the student processes and structures information.",
     "factors": "C1,C5,C7"},
    {"id": "sl-selfcontrol", "label": "3.2 Autocontrollo", "mode": "second-level",
     "prompt": "Second-Level Analysis - Part 2: SELF-CONTROL AND CONCENTRATION. Analyse together the factors: C2 (Self-regulation), C3 (Disorientation), C6 (Concentration difficulties). Assess the ability to manage the study process.",
     "factors": "C2,C3,C6"},
    {"id": "sl-motivation", "label": "3.3 Motivazione", "mode": "second-level",
     "prompt": "Second-Level Analysis - Part 3: MOTIVATION AND WILL. Analyse together the factors: A2 (Volition), A5 (Lack of perseverance), A6 (Perceived competence). Assess motivational drive and self-confidence.",
     "factors": "A2,A5,A6"},
    {"id": "sl-emotions", "label": "3.4 Gestione Emotiva", "mode": "second-level",
     "prompt": "Second-Level Analysis - Part 4: EMOTIONAL MANAGEMENT. Analyse together the factors: A1 (Baseline anxiety), A7 (Emotional interference). Assess the ability to manage stress and negative emotions.",
     "factors": "A1,A7"},
    {"id": "sl-attribution", "label": "3.5 Stile Attributivo", "mode": "second-level",
     "prompt": "Second-Level Analysis - Part 5: ATTRIBUTIONAL STYLE. Analyse together the factors: A3 (Attribution to controllable causes), A4 (Attribution to uncontrollable causes). Assess how the student interprets successes and failures.",
     "factors": "A3,A4"},
    {"id": "sl-social", "label": "3.6 Dimensione Sociale", "mode": "second-level",
     "prompt": "Second-Level Analysis - Part 6: SOCIAL DIMENSION. Analyse factor C4 (Willingness to collaborate). Assess the inclination towards group work.",
     "factors": "C4"},
]

# ---------------------------------------------------------------------------
# Domande follow-up (fase Q&A)
# ---------------------------------------------------------------------------
FOLLOWUP_QUESTIONS: list[dict[str, str]] = [
    {"id": "fup-deepening", "label": "Q&A - Approfondimento C2",
     "prompt": "Puoi approfondire il fattore C2 (Autoregolazione)? Ho difficoltà a mantenere un piano di studio. Quali strategie pratiche mi consigli?",
     "mode": "factor-qa", "factors": "C2"},
    {"id": "fup-anxiety", "label": "Q&A - Gestione ansia",
     "prompt": "L'ansia (A1) mi blocca spesso durante gli esami. Cosa posso fare per gestirla meglio, considerando anche le interferenze emotive (A7)?",
     "mode": "factor-qa", "factors": "A1,A7"},
    {"id": "fup-motivation", "label": "Q&A - Motivazione",
     "prompt": "Come posso migliorare la mia motivazione allo studio? Vedo che A2 (Volizione) è nella media ma A6 (Percezione di competenza) è bassa.",
     "mode": "factor-qa", "factors": "A2,A6"},
]

# ---------------------------------------------------------------------------
# Struct risultati
# ---------------------------------------------------------------------------

@dataclass
class StepResult:
    step_id: str
    step_label: str
    step_type: str               # "guided" o "followup"
    ttft_ms: float
    total_duration_ms: float
    eval_count: int
    prompt_eval_count: int
    tokens_per_second: float
    output_text: str
    error: Optional[str]
    raw_metrics: dict[str, Any] = field(default_factory=dict)
    quality: dict[str, float] = field(default_factory=dict)

    @property
    def valid(self) -> bool:
        return self.error is None and self.quality.get("overall", 0) > 0


@dataclass
class ConcurrencyResult:
    n_users: int
    step_id: str
    total_wall_ms: float
    avg_latency_ms: float
    p50_ms: float
    p95_ms: float
    p99_ms: float
    errors: int
    total_requests: int


@dataclass
class ModelResults:
    model: str
    steps: list[StepResult] = field(default_factory=list)
    concurrency: Optional[ConcurrencyResult] = None

    @property
    def _valid_steps(self) -> list[StepResult]:
        return [s for s in self.steps if s.valid]

    @property
    def avg_ttft(self) -> float:
        v = self._valid_steps
        return sum(s.ttft_ms for s in v) / len(v) if v else 0.0

    @property
    def avg_tps(self) -> float:
        v = self._valid_steps
        return sum(s.tokens_per_second for s in v) / len(v) if v else 0.0

    @property
    def avg_quality(self) -> float:
        v = self._valid_steps
        return sum(s.quality.get("overall", 0) for s in v) / len(v) if v else 0.0

    @property
    def reliability(self) -> float:
        if not self.steps:
            return 0.0
        return len(self._valid_steps) / len(self.steps) * 100

    @property
    def avg_duration_ms(self) -> float:
        v = self._valid_steps
        return sum(s.total_duration_ms for s in v) / len(v) if v else 0.0


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _factor_names(lang: str) -> dict[str, str]:
    return QSA_FACTOR_IT if lang == "it" else QSA_FACTOR_EN


def qsa_scores_context(profile: dict[str, int], lang: str = "it") -> str:
    names = _factor_names(lang)
    lines = ["QSA Profile scores (stanine 1-9):"]
    for code in ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "A1", "A2", "A3", "A4", "A5", "A6", "A7"]:
        score = profile.get(code, 5)
        name = names.get(code, code)
        if code in QSA_INVERTED:
            if score <= 3:
                direction = "strength"
            elif score >= 7:
                direction = "growth area"
            else:
                direction = "average"
        else:
            if score >= 7:
                direction = "strength"
            elif score <= 3:
                direction = "growth area"
            else:
                direction = "average"
        lines.append(f"  {code} ({name}): {score}/9 - {direction}")
    return "\n".join(lines)


def language_directive(language: str) -> str:
    if not language or language == "en":
        return ""
    eng, native = LANG_MAP.get(language, ("Italian", "italiano"))
    return (
        f"\n\n[LANGUAGE] You MUST write your ENTIRE response in {eng} ({native}), "
        f"regardless of the language of the instructions or scores above. "
        f"Translate any fixed phrases, headings and labels into {eng} as well. "
        f"Do NOT mix languages."
    )


def build_messages(step: dict[str, str], profile: dict[str, int], lang: str) -> tuple[str, str]:
    if step.get("mode") == "factor":
        system = SYSTEM_PROMPT_FACTOR
    elif step.get("mode") == "second-level":
        system = SYSTEM_PROMPT_SECOND_LEVEL
    elif step.get("mode") == "factor-qa":
        system = SYSTEM_PROMPT_FACTOR_QA
    else:
        system = SYSTEM_PROMPT_GENERIC
    system += language_directive(lang)
    system += factor_labels_directive(lang)
    scores = qsa_scores_context(profile, lang)
    user_message = f"{scores}\n\nDOMANDA DELLO STUDENTE:\n{step['prompt']}"
    return system, user_message


_GREETINGS_EN = r"^(Hi[!.]*|Hello[!.]*|Hey[!.]*|Welcome[!.]*|Great[!.]*)"
_GREETINGS_IT = r"^(Ciao[!.]*|Salve[!.]*|Buongiorno[!.]*|Buonasera[!.]*|Benvenuto[!.]*|Benvenut[ao][!.]*)"
_ITALIAN_CHARS = re.compile(r"[àèéìòù]")

# Parole indicative per interpretazione corretta dei punteggi
_POSITIVE_WORDS = {
    "it": {"punto di forza", "forza", "forte", "buono", "efficace", "positivo", "competente",
           "capace", "adeguato", "beneficio", "risorsa", "vantaggio", "abilità"},
    "en": {"strength", "strong", "good", "effective", "positive", "capable", "skilled",
           "competent", "well", "benefit", "resource", "advantage", "ability"},
}
_NEGATIVE_WORDS = {
    "it": {"area di miglioramento", "da migliorare", "migliorare", "difficoltà", "criticità",
           "problematico", "attenzione", "carenza", "debolezza", "lacuna", "ostacolo",
           "sfida", "può migliorare", "bisogno di", "limitazione"},
    "en": {"area for growth", "growth area", "improvement", "challenge", "difficulty",
           "problem", "weakness", "struggle", "needs work", "caution", "gap",
           "obstacle", "limitation", "can improve", "need to work"},
}
_REFUSAL_PHRASES = [
    "i don't have access", "i don't have the scores", "i cannot see",
    "i'm unable to analyze", "i cannot access", "non ho accesso ai punteggi",
    "non ho i punteggi", "non posso vedere", "non ho accesso",
]
_PRACTICAL_ADVICE_WORDS = {
    "it": {"consiglio", "prova a", "suggerisco", "potresti", "puoi", "esercizio",
           "strategia", "pratica", "azione", "prova", "fai", "provare", "cerca di",
           "ti suggerisco", "ti consiglio", "utilizza", "usa"},
    "en": {"try", "suggest", "practice", "strategy", "exercise", "action",
           "you can", "you could", "recommend", "advice", "use", "start by",
           "consider", "attempt", "implement", "adopt"},
}
_CONNECTION_WORDS = {
    "it": {"insieme", "relazione", "collegamento", "correlato", "interazione",
           "connesso", "influenza", "impatto", "combina", "combinazione"},
    "en": {"together", "relationship", "connection", "correlated", "interaction",
           "linked", "influences", "impact", "combines", "combination"},
}


def _interpretation_accuracy(clean: str, step: dict, lang: str) -> float:
    names = _factor_names(lang)
    factor_list = [f.strip() for f in step.get("factors", "").split(",") if f.strip()]
    if not factor_list:
        factor_list = list(QSA_PROFILE.keys())

    positives = _POSITIVE_WORDS.get(lang, _POSITIVE_WORDS["en"])
    negatives = _NEGATIVE_WORDS.get(lang, _NEGATIVE_WORDS["en"])
    correct = 0
    total = 0

    for code in factor_list:
        score = QSA_PROFILE.get(code)
        if score is None:
            continue
        name = names.get(code, "")
        if not name or name.lower() not in clean.lower():
            continue
        total += 1
        is_inverted = code in QSA_INVERTED

        sentence_pattern = rf"[^.!?]*{re.escape(name)}[^.!?]*[.!?]"
        sentences = re.findall(sentence_pattern, clean, re.IGNORECASE)

        found_positive = any(re.search(rf"\b{re.escape(p)}\b", s, re.IGNORECASE)
                             for s in sentences for p in positives)
        found_negative = any(re.search(rf"\b{re.escape(n)}\b", s, re.IGNORECASE)
                             for s in sentences for n in negatives)

        if is_inverted:
            if score >= 7 and found_negative:
                correct += 1
            elif score <= 3 and found_positive:
                correct += 1
            elif 4 <= score <= 6:
                correct += 1
            elif not found_positive and not found_negative:
                correct += 0.5
        else:
            if score >= 7 and found_positive:
                correct += 1
            elif score <= 3 and found_negative:
                correct += 1
            elif 4 <= score <= 6:
                correct += 1
            elif not found_positive and not found_negative:
                correct += 0.5

    return correct / total if total else 1.0


def _practical_advice_score(clean: str, lang: str) -> float:
    words = _PRACTICAL_ADVICE_WORDS.get(lang, _PRACTICAL_ADVICE_WORDS["en"])
    count = sum(1 for w in words if re.search(rf"\b{re.escape(w)}\b", clean, re.IGNORECASE))
    return min(count / 3, 1.0)


def _no_refusal(clean: str) -> float:
    for phrase in _REFUSAL_PHRASES:
        if phrase in clean.lower():
            return 0.0
    return 1.0


def _structure_score(clean: str, step_type: str, word_count: int) -> float:
    has_paragraphs = 1.0 if "\n\n" in clean or clean.count("\n") > 2 else 0.0
    has_bullets = 1.0 if re.search(r"^[\s]*[-*]\s", clean, re.MULTILINE) else 0.0
    has_headers = 1.0 if re.search(r"^#{1,3}\s", clean, re.MULTILINE) else 0.0
    score = has_paragraphs * 0.4 + has_bullets * 0.3 + has_headers * 0.3
    if step_type == "followup":
        concise = 1.0 if word_count < 200 else max(0, 1.0 - (word_count - 200) / 400)
        score = score * 0.5 + concise * 0.5
    return score


def _connection_analysis(clean: str, mode: str, lang: str) -> float:
    if mode != "second-level":
        return 1.0
    words = _CONNECTION_WORDS.get(lang, _CONNECTION_WORDS["en"])
    count = sum(1 for w in words if re.search(rf"\b{re.escape(w)}\b", clean, re.IGNORECASE))
    return min(count / 2, 1.0)


def assess_quality(text: str, step: dict[str, str], lang: str) -> dict[str, float]:
    clean = text.strip()
    word_count = len(clean.split())
    mode = step.get("mode", "")
    step_type = "followup" if mode == "factor-qa" else "guided"

    # --- Copertura fattori ---
    factor_list = [f.strip() for f in step.get("factors", "").split(",") if f.strip()]
    if factor_list:
        factor_coverage = 0.0
        for f in factor_list:
            name = _factor_names(lang).get(f, "")
            pattern = rf"\b{re.escape(f)}\b\s*\([^)]*{re.escape(name)}[^)]*\)"
            if re.search(pattern, clean) or (name and name.lower() in clean.lower()):
                factor_coverage += 1.0
        factor_coverage = factor_coverage / len(factor_list) if factor_list else 0.0
    else:
        factor_coverage = 1.0

    # --- Formato codici: nessun codice isolato ---
    code_format_ok = 1.0
    names = _factor_names(lang)
    for code in names:
        if code in clean:
            name = names[code]
            pattern = rf"\b{re.escape(code)}\b\s*\(\s*{re.escape(name)}\s*\)"
            if not re.search(pattern, clean):
                code_format_ok = 0.0
                break

    # --- Accuratezza interpretazione per punteggio ---
    interpretation_accuracy = _interpretation_accuracy(clean, step, lang)

    # --- Consigli pratici ---
    practical_advice = _practical_advice_score(clean, lang)

    # --- No refusal ---
    no_refusal = _no_refusal(clean)

    # --- Menzione punteggi ---
    score_mentions = 1.0 if re.search(r"\d+\s*/\s*9|punteggio|score|stanine|punto|punti", clean, re.IGNORECASE) else 0.0

    # --- Nessun saluto ---
    first_80 = clean[:80].strip()
    no_greeting = 1.0
    if re.match(_GREETINGS_EN, first_80, re.IGNORECASE):
        no_greeting = 0.0
    elif re.match(_GREETINGS_IT, first_80, re.IGNORECASE):
        no_greeting = 0.0

    # --- Sostanziosità ---
    substantive = min(word_count / MIN_WORDS, 1.0)

    # --- Struttura ---
    structure = _structure_score(clean, step_type, word_count)

    # --- Connessione fattori (second-level) ---
    connection = _connection_analysis(clean, mode, lang)

    # --- Conformità linguistica ---
    if lang == "it":
        italian_hits = len(_ITALIAN_CHARS.findall(clean))
        italian_compliance = min(italian_hits / max(word_count * 0.02, 1), 1.0)
    else:
        italian_compliance = 1.0

    # --- HTML ---
    has_html = 0.0 if re.search(r"<[^>]+>", clean) else 1.0

    overall = (
        factor_coverage * 0.20
        + interpretation_accuracy * 0.20
        + code_format_ok * 0.10
        + practical_advice * 0.12
        + score_mentions * 0.08
        + no_refusal * 0.05
        + connection * 0.05
        + no_greeting * 0.05
        + substantive * 0.05
        + structure * 0.05
        + italian_compliance * 0.03
        + has_html * 0.02
    )

    return {
        "factor_coverage": round(factor_coverage, 3),
        "code_format_ok": code_format_ok,
        "interpretation_accuracy": round(interpretation_accuracy, 3),
        "practical_advice": round(practical_advice, 3),
        "score_mentions": score_mentions,
        "no_refusal": no_refusal,
        "connection_analysis": round(connection, 3),
        "no_greeting": no_greeting,
        "substantive": round(substantive, 3),
        "structure": round(structure, 3),
        "italian_compliance": round(italian_compliance, 3),
        "has_html": has_html,
        "overall": round(overall, 3),
    }


def _fmt_ms(ms: float) -> str:
    if ms < 1000:
        return f"{ms:.0f} ms"
    return f"{ms / 1000:.1f} s"


# ---------------------------------------------------------------------------
# Stima parametri da dimensione GB (arrotondata)
# ---------------------------------------------------------------------------

# Mappa manuale per modelli noti con nome non standard
_KNOWN_MODEL_PARAMS: dict[str, float] = {
    "qwen3.5:latest": 9.0,
    "qwen3.5:9b": 9.0,
    "qwen3.6:latest": 32.0,
    "deepseek-r1:latest": 8.0,
    "deepseek-r1:8b": 8.0,
}

def _estimate_params(name: str, size_gb: float) -> float:
    """Stima parametri in miliardi da nome modello e dimensione GB."""
    if name in _KNOWN_MODEL_PARAMS:
        return _KNOWN_MODEL_PARAMS[name]
    m = re.search(r'[:\-](\d+\.?\d*)b', name)
    if m:
        return float(m.group(1))
    m = re.search(r'(?:^|[:\-])(\d+\.?\d*)b', name)
    if m:
        return float(m.group(1))
    q4_b = size_gb / 0.5
    fp16_b = size_gb / 2.0
    return min(q4_b, fp16_b)


# ---------------------------------------------------------------------------
# API Ollama
# ---------------------------------------------------------------------------

async def list_ollama_models(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    resp = await client.get(f"{OLLAMA_URL}/api/tags", timeout=10)
    resp.raise_for_status()
    data = resp.json()
    models = data.get("models", [])
    result = []
    for m in models:
        name = m.get("name", "")
        size = m.get("size", 0)
        modified = m.get("modified_at", "")
        size_gb = size / (1024 ** 3) if size else 0
        params_b = _estimate_params(name, size_gb)
        result.append({
            "name": name,
            "size_gb": round(size_gb, 1),
            "params_b": round(params_b, 1),
            "modified": modified[:10],
        })
    return result


async def call_ollama(
    client: httpx.AsyncClient,
    model: str,
    system_prompt: str,
    user_message: str,
    step: dict[str, str],
    timeout_s: int = 300,
) -> StepResult:
    step_id = step["id"]
    step_label = step["label"]
    step_type = "followup" if step.get("mode") == "factor-qa" else "guided"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "stream": True,
        "keep_alive": "5m",
        "options": {
            "num_ctx": 8192,
            "num_predict": 2048,
        },
    }

    chunks: list[str] = []
    first_token = False
    ttft_ms = 0.0
    start = time.monotonic()
    eval_count = 0
    prompt_eval_count = 0
    raw_metrics: dict[str, Any] = {}
    error: Optional[str] = None

    try:
        async with client.stream(
            "POST", f"{OLLAMA_URL}/api/chat", json=payload, timeout=httpx.Timeout(timeout_s)
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if event.get("error"):
                    error = event["error"]
                    break
                msg = event.get("message", {})
                content = msg.get("content", "")
                if content:
                    chunks.append(content)
                    if not first_token:
                        ttft_ms = (time.monotonic() - start) * 1000
                        first_token = True
                if event.get("done"):
                    raw_metrics = event
                    eval_count = event.get("eval_count", 0)
                    prompt_eval_count = event.get("prompt_eval_count", 0)
    except Exception as e:
        error = str(e)

    total_ms = (time.monotonic() - start) * 1000
    output_text = "".join(chunks)

    if eval_count == 0 and output_text:
        eval_count = max(1, len(output_text.split()))
    if not first_token and output_text and not error:
        ttft_ms = total_ms

    tps = eval_count / max((total_ms - ttft_ms if total_ms > ttft_ms else total_ms) / 1000, 0.05) if eval_count else 0.0
    if not first_token and not error:
        ttft_ms = total_ms

    quality = assess_quality(output_text, step, LANGUAGE)

    return StepResult(
        step_id=step_id,
        step_label=step_label,
        step_type=step_type,
        ttft_ms=round(ttft_ms, 1),
        total_duration_ms=round(total_ms, 1),
        eval_count=eval_count,
        prompt_eval_count=prompt_eval_count,
        tokens_per_second=round(tps, 1),
        output_text=output_text,
        error=error,
        raw_metrics=raw_metrics,
        quality=quality,
    )


async def concurrency_test(
    client: httpx.AsyncClient,
    model: str,
    n_users: int,
    step: dict[str, str],
    profile: dict[str, int],
    lang: str,
) -> ConcurrencyResult:
    system, user_msg = build_messages(step, profile, lang)
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg},
        ],
        "stream": False,
        "keep_alive": "5m",
        "options": {"num_ctx": 8192, "num_predict": 512},
    }

    latencies: list[float] = []
    errors = 0

    async def _single() -> float:
        nonlocal errors
        t0 = time.monotonic()
        try:
            r = await client.post(
                f"{OLLAMA_URL}/api/chat", json=payload,
                timeout=httpx.Timeout(300),
            )
            r.raise_for_status()
        except Exception:
            errors += 1
        return (time.monotonic() - t0) * 1000

    start = time.monotonic()
    tasks = [_single() for _ in range(n_users)]
    for coro in asyncio.as_completed(tasks):
        lat = await coro
        latencies.append(lat)
    total_wall = (time.monotonic() - start) * 1000

    latencies.sort()
    n = len(latencies)
    avg = sum(latencies) / n if n else 0.0
    p50 = latencies[int(n * 0.50)] if n else 0.0
    p95 = latencies[int(n * 0.95)] if n else 0.0
    p99 = latencies[int(n * 0.99)] if n else 0.0

    return ConcurrencyResult(
        n_users=n_users,
        step_id=step["id"],
        total_wall_ms=round(total_wall, 1),
        avg_latency_ms=round(avg, 1),
        p50_ms=round(p50, 1),
        p95_ms=round(p95, 1),
        p99_ms=round(p99, 1),
        errors=errors,
        total_requests=n_users,
    )


# ---------------------------------------------------------------------------
# Report console
# ---------------------------------------------------------------------------

def _bar(val: float, width: int = 20) -> str:
    filled = max(0, min(width, int(val * width)))
    return "█" * filled + "░" * (width - filled)


def _quality_label(score: float) -> str:
    if score >= 0.80:
        return "OTTIMO"
    if score >= 0.60:
        return "BUONO"
    if score >= 0.40:
        return "SUFF."
    return "SCARSO"


def _speed_label(ttft_ms: float) -> str:
    if ttft_ms < 500:
        return "Veloce"
    if ttft_ms < 2000:
        return "Medio"
    if ttft_ms < 5000:
        return "Lento"
    return "Molto lento"


def print_report(results: list[ModelResults]):
    sep = "─" * 78

    print(f"\n{'=' * 78}")
    print(f"  REPORT BENCHMARK QSA — OLLAMA")
    print(f"  Data: {datetime.now().strftime('%Y-%m-%d %H:%M')}  |  "
          f"Lingua: {LANGUAGE}  |  Soglia qualità: {MIN_WORDS} parole")
    print(f"{'=' * 78}\n")

    for mr in results:
        print(f"📦 Modello: {mr.model}")
        print(f"   Step validi: {len(mr._valid_steps)}/{len(mr.steps)}  "
              f"Affidabilità: {mr.reliability:.0f}%")
        print(f"   Ø TTFT: {_fmt_ms(mr.avg_ttft)}  "
              f"Ø Durata: {_fmt_ms(mr.avg_duration_ms)}  "
              f"Ø Token/s: {mr.avg_tps:.1f}  "
              f"Ø Qualità: {mr.avg_quality:.2f} ({_quality_label(mr.avg_quality)})")
        print(f"   {_bar(mr.avg_quality / 1.0)}  qualità  "
              f"{_bar(min(mr.avg_tps / 80, 1))}  velocità  "
              f"{_bar(mr.reliability / 100)}  affidabilità")
        print()

        hdr = f"  {'Passo':<30} {'TTFT':>10} {'Durata':>10} {'Tok/s':>7} {'Qualità':>8} {'Voto':>10}"
        print(hdr)
        print(f"  {'─' * 75}")
        for s in mr.steps:
            qual = s.quality.get("overall", 0)
            qual_str = f"{qual:.2f}"
            label = _quality_label(qual)
            step_label = s.step_label
            if s.error:
                print(f"  {step_label:<30} {'ERRORE':>10} {s.error[:60]:>37}")
            else:
                print(f"  {step_label:<30} {_fmt_ms(s.ttft_ms):>10} "
                      f"{_fmt_ms(s.total_duration_ms):>10} {s.tokens_per_second:>7.1f} "
                      f"{qual_str:>8} {label:>10}")
        print()

        if mr.concurrency:
            c = mr.concurrency
            print(f"   ⚡ Test concorrenza ({c.n_users} utenti simultanei, passo «{c.step_id}»):")
            print(f"      Parete: {_fmt_ms(c.total_wall_ms)}  "
                  f"Ø Latenza: {_fmt_ms(c.avg_latency_ms)}  "
                  f"P50: {_fmt_ms(c.p50_ms)}  P95: {_fmt_ms(c.p95_ms)}  "
                  f"Errori: {c.errors}/{c.total_requests}")
        print(f"  {sep}\n")

    # Classifica
    print(f"\n{'=' * 78}")
    print(f"  CLASSIFICA MODELLI")
    print(f"{'=' * 78}")
    print(f"  {'Modello':<20} {'Affidab.':>9} {'Ø TTFT':>10} {'Ø Durata':>10} "
          f"{'Ø Tok/s':>8} {'Ø Qualità':>9} {'Voto':>10} {'Velocità':>10}")
    print(f"  {'─' * 76}")

    sorted_results = sorted(results, key=lambda r: (r.reliability, r.avg_quality, -r.avg_tps), reverse=True)
    best_quality = max((r.avg_quality for r in sorted_results), default=1.0)
    best_speed = max((r.avg_tps for r in sorted_results), default=1.0)
    best_reliability = max((r.reliability for r in sorted_results), default=1.0)

    for mr in sorted_results:
        q = mr.avg_quality
        tps = mr.avg_tps
        rel = mr.reliability
        ttft = mr.avg_ttft
        dur = mr.avg_duration_ms
        score = (q / best_quality) * 0.4 + (tps / best_speed) * 0.3 + (rel / best_reliability) * 0.3
        speed = _speed_label(ttft)
        print(f"  {mr.model:<20} {rel:>8.0f}% {_fmt_ms(ttft):>10} {_fmt_ms(dur):>10} "
              f"{tps:>8.1f} {q:>9.2f} {score:>10.3f} {speed:>10}")
    print(f"  {'─' * 76}")
    print(f"  Legenda velocità: TTFT < 500ms = Veloce, < 2s = Medio, < 5s = Lento, >= 5s = Molto lento")
    print(f"  Punteggio composito = qualità×0.4 + velocità×0.3 + affidabilità×0.3")
    print()

    # Raccomandazioni
    print(f"{'=' * 78}")
    print(f"  RACCOMANDAZIONI")
    print(f"{'=' * 78}")
    if sorted_results:
        best_all = sorted_results[0]
        print(f"  Miglior modello complessivo: {best_all.model} "
              f"(score {best_all.avg_quality:.2f} qualità, {best_all.avg_tps:.1f} tok/s, "
              f"{best_all.reliability:.0f}% affidabilità)")

        best_fast = max(sorted_results, key=lambda r: r.avg_tps)
        print(f"  Più veloce: {best_fast.model} ({best_fast.avg_tps:.1f} tok/s, "
              f"TTFT {_fmt_ms(best_fast.avg_ttft)})")

        best_qual = max(sorted_results, key=lambda r: r.avg_quality)
        print(f"  Migliore qualità: {best_qual.model} (score {best_qual.avg_quality:.2f})")

        for mr in sorted_results:
            if mr.reliability < 50:
                print(f"  ⚠️  {mr.model}: affidabilità {mr.reliability:.0f}% — "
                      f"SCONSIGLIATO per uso production")
    print(f"{'=' * 78}\n")


# ---------------------------------------------------------------------------
# Report markdown
# ---------------------------------------------------------------------------

def _markdown_report(results: list[ModelResults]) -> str:
    lines = []
    lines.append(f"# Benchmark QSA CounselorBot — Ollama\n")
    lines.append(f"**Data**: {datetime.now().strftime('%Y-%m-%d %H:%M')}  |  "
                 f"**Lingua**: {LANGUAGE}  |  "
                 f"**Soglia qualità**: {MIN_WORDS} parole  |  "
                 f"**Url Ollama**: {OLLAMA_URL}\n")

    # Riepilogo modelli testati
    lines.append("## Modelli testati\n")
    lines.append("| Modello | Stima params | Step | Follow-up | Concorrenza |\n"
                 "|---|---|---|---|---|")
    for mr in results:
        n_guided = len([s for s in mr.steps if s.step_type == "guided" and s.valid])
        n_fup = len([s for s in mr.steps if s.step_type == "followup" and s.valid])
        conc_str = f"{_fmt_ms(mr.concurrency.avg_latency_ms)}" if mr.concurrency else "-"
        lines.append(f"| {mr.model} | {_estimate_params(mr.model, 0):.0f}B | "
                     f"{n_guided}/8 | {n_fup}/{len(FOLLOWUP_QUESTIONS)} | {conc_str} |")

    lines.append("")

    # Classifica
    sorted_results = sorted(results, key=lambda r: (r.reliability, r.avg_quality, -r.avg_tps), reverse=True)
    best_quality = max((r.avg_quality for r in sorted_results), default=1.0)
    best_speed = max((r.avg_tps for r in sorted_results), default=1.0)
    best_reliability = max((r.reliability for r in sorted_results), default=1.0)

    lines.append("## Classifica\n")
    lines.append("| # | Modello | Affidabilità | Ø TTFT | Ø Durata | Ø Tok/s | Ø Qualità | Punteggio | Velocità |\n"
                 "|---|---|---|---|---|---|---|---|---|")

    for i, mr in enumerate(sorted_results, 1):
        q = mr.avg_quality
        tps = mr.avg_tps
        rel = mr.reliability
        ttft = mr.avg_ttft
        dur = mr.avg_duration_ms
        score = (q / best_quality) * 0.4 + (tps / best_speed) * 0.3 + (rel / best_reliability) * 0.3
        speed = _speed_label(ttft)
        lines.append(f"| {i} | {mr.model} | {rel:.0f}% | {_fmt_ms(ttft)} | "
                     f"{_fmt_ms(dur)} | {tps:.1f} | {q:.2f} | {score:.3f} | {speed} |")

    lines.append("")
    lines.append("_Punteggio composito = qualità×0.4 + velocità×0.3 + affidabilità×0.3_\n")

    # Dettaglio per modello
    lines.append("## Dettaglio per modello\n")
    for mr in results:
        lines.append(f"### {mr.model}\n")
        lines.append("| Passo | Tipo | TTFT | Durata | Tok/s | Qualità | Voto |\n"
                     "|---|---|---|---|---|---|---|")
        for s in mr.steps:
            qual = s.quality.get("overall", 0)
            label = _quality_label(qual)
            stype = "Follow-up" if s.step_type == "followup" else "Guidato"
            if s.error:
                lines.append(f"| {s.step_label} | {stype} | ERRORE | {s.error[:40]} | - | - | - |")
            else:
                lines.append(f"| {s.step_label} | {stype} | {_fmt_ms(s.ttft_ms)} | "
                             f"{_fmt_ms(s.total_duration_ms)} | {s.tokens_per_second:.1f} | "
                             f"{qual:.2f} | {label} |")

        if mr.concurrency:
            c = mr.concurrency
            lines.append("")
            lines.append(f"**Test concorrenza**: {c.n_users} utenti simultanei, passo «{c.step_id}»\n")
            lines.append(f"- Parete: {_fmt_ms(c.total_wall_ms)}")
            lines.append(f"- Ø Latenza: {_fmt_ms(c.avg_latency_ms)}")
            lines.append(f"- P50: {_fmt_ms(c.p50_ms)} | P95: {_fmt_ms(c.p95_ms)} | P99: {_fmt_ms(c.p99_ms)}")
            lines.append(f"- Errori: {c.errors}/{c.total_requests}")
        lines.append("")

    # Raccomandazioni
    lines.append("## Raccomandazioni\n")
    if sorted_results:
        best_all = sorted_results[0]
        best_fast = max(sorted_results, key=lambda r: r.avg_tps)
        best_qual = max(sorted_results, key=lambda r: r.avg_quality)

        lines.append(f"- **Miglior modello complessivo**: {best_all.model} "
                     f"(qualità {best_all.avg_quality:.2f}, {best_all.avg_tps:.1f} tok/s, "
                     f"{best_all.reliability:.0f}% affidabilità)")
        lines.append(f"- **Più veloce**: {best_fast.model} ({best_fast.avg_tps:.1f} tok/s, "
                     f"TTFT {_fmt_ms(best_fast.avg_ttft)})")
        lines.append(f"- **Migliore qualità**: {best_qual.model} (score {best_qual.avg_quality:.2f})")

        for mr in sorted_results:
            if mr.reliability < 50:
                lines.append(f"- ⚠️ **{mr.model}**: affidabilità {mr.reliability:.0f}% — SCONSIGLIATO")

    lines.append("")
    lines.append("---")
    lines.append(f"Generato automaticamente da `backend/tests/test_ollama_qsa_benchmark.py`")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

async def main():
    print(f"QSA Ollama Benchmark")
    print(f"   Ollama: {OLLAMA_URL}")
    print(f"   Utenti concorrenti: {CONCURRENT_USERS}")
    print(f"   Lingua: {LANGUAGE}")
    print(f"   Passi guidati: {len(QSA_STEPS)} + Follow-up: {len(FOLLOWUP_QUESTIONS)}")
    print(f"   Filtro max parametri: {MAX_PARAMS_B:.0f}B")
    print()

    async with httpx.AsyncClient() as client:
        print("Elenco modelli Ollama...")
        try:
            models = await list_ollama_models(client)
        except Exception as e:
            print(f"Errore connessione Ollama: {e}")
            sys.exit(1)

        if not models:
            print("Nessun modello trovato in Ollama.")
            sys.exit(1)

        print(f"   Trovati {len(models)} modelli:")
        for m in models:
            print(f"   - {m['name']:30s} {m['size_gb']:.1f} GB  (~{m['params_b']:.0f}B)  ({m['modified']})")
        print()

        # Deduplica: stesso size = stesso modello (tieni il tag più esplicito)
        seen_size: dict[float, dict] = {}
        for m in models:
            s = m["size_gb"]
            if s in seen_size:
                old = seen_size[s]["name"]
                # Tieni il nome con numero di parametri (es. qwen3.5:9b > qwen3.5:latest)
                if re.search(r':\d+\.?\d*b', m["name"]):
                    seen_size[s] = m
            else:
                seen_size[s] = m
        models = list(seen_size.values())
        print(f"   Dopo deduplicazione: {len(models)} modelli unici")
        print()

        # Filtra per MODELS override
        if _MODELS_OVERRIDE:
            selected_names = [x.strip() for x in _MODELS_OVERRIDE.split(",")]
            models = [m for m in models if m["name"] in selected_names]
            if not models:
                print(f"Nessun modello corrisponde a MODELS={_MODELS_OVERRIDE}")
                sys.exit(1)
            print(f"   Selezionati: {', '.join(m['name'] for m in models)}")
            print()
        else:
            # Filtra per parametri <= MAX_PARAMS_B
            before = len(models)
            models = [m for m in models if m["params_b"] <= MAX_PARAMS_B]
            models = [m for m in models if "embed" not in m["name"].lower()]
            models = [m for m in models if "glm-ocr" not in m["name"].lower()]
            models = [m for m in models if "cloud" not in m["name"].lower()]
            excluded = before - len(models)
            if excluded:
                print(f"   Esclusi {excluded} modelli (> {MAX_PARAMS_B:.0f}B o embedding/cloud)")
                print(f"   Modelli da testare: {len(models)}")
                for m in models:
                    print(f"   - {m['name']:30s} ~{m['params_b']:.0f}B ")
                print()

        if not models:
            print("Nessun modello da testare dopo il filtro.")
            sys.exit(1)

        all_results: list[ModelResults] = []

        for mod in models:
            model_name = mod["name"]
            params_b = mod["params_b"]
            print(f"{'═' * 78}")
            print(f"  Test modello: {model_name} (~{params_b:.0f}B)")
            print(f"{'═' * 78}")

            mr = ModelResults(model=model_name)

            # Warmup
            if WARMUP:
                print(f"   Riscaldamento...", end=" ", flush=True)
                try:
                    r = await client.post(f"{OLLAMA_URL}/api/chat", json={
                        "model": model_name,
                        "messages": [
                            {"role": "system", "content": "Rispondi brevemente in italiano: ok o ko."},
                            {"role": "user", "content": "ok"},
                        ],
                        "stream": False,
                        "options": {"num_ctx": 2048, "num_predict": 10},
                        "keep_alive": "5m",
                    }, timeout=30)
                    r.raise_for_status()
                    print("done")
                except Exception as e:
                    print(f"warmup fallito: {e}")
                print()

            # Step guidati
            for i, step in enumerate(QSA_STEPS, 1):
                sys_prompt, user_msg = build_messages(step, QSA_PROFILE, LANGUAGE)
                print(f"   [{i}/{len(QSA_STEPS)}] {step['label']}...", end=" ", flush=True)
                result = await call_ollama(client, model_name, sys_prompt, user_msg, step)
                if result.error:
                    print(f"ERRORE {result.error[:60]}")
                else:
                    qual = result.quality.get("overall", 0)
                    label = _quality_label(qual)
                    print(f"TTFT {_fmt_ms(result.ttft_ms)} | "
                          f"{result.tokens_per_second:.1f} tok/s | "
                          f"qualità {qual:.2f} ({label})")
                mr.steps.append(result)

            print()

            # Follow-up questions
            for i, step in enumerate(FOLLOWUP_QUESTIONS, 1):
                sys_prompt, user_msg = build_messages(step, QSA_PROFILE, LANGUAGE)
                print(f"   [FUP {i}/{len(FOLLOWUP_QUESTIONS)}] {step['label']}...", end=" ", flush=True)
                result = await call_ollama(client, model_name, sys_prompt, user_msg, step)
                if result.error:
                    print(f"ERRORE {result.error[:60]}")
                else:
                    qual = result.quality.get("overall", 0)
                    label = _quality_label(qual)
                    print(f"TTFT {_fmt_ms(result.ttft_ms)} | "
                          f"{result.tokens_per_second:.1f} tok/s | "
                          f"qualità {qual:.2f} ({label})")
                mr.steps.append(result)

            print()

            # Test concorrenza
            if CONCURRENT_USERS > 0:
                conc_step = QSA_STEPS[0]
                print(f"   Test concorrenza: {CONCURRENT_USERS} utenti su {conc_step['label']}...",
                      end=" ", flush=True)
                try:
                    cr = await concurrency_test(
                        client, model_name, CONCURRENT_USERS, conc_step, QSA_PROFILE, LANGUAGE
                    )
                    mr.concurrency = cr
                    print(f"{_fmt_ms(cr.total_wall_ms)} parete | "
                          f"Ø {_fmt_ms(cr.avg_latency_ms)} richiesta | "
                          f"errori {cr.errors}/{cr.total_requests}")
                except Exception as e:
                    print(f"ERRORE {e}")
                print()

            all_results.append(mr)

    # Report
    print("=" * 78)
    print(f"  REPORT FINALE")
    print("=" * 78)
    print_report(all_results)

    # Salva report markdown
    if OUTPUT_FILE:
        md = _markdown_report(all_results)
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            f.write(md)
        print(f"Report markdown salvato in: {OUTPUT_FILE}")

    # Salva JSON raw
    raw_file = OUTPUT_FILE.replace(".md", ".json") if OUTPUT_FILE else ""
    if raw_file:
        raw = []
        for mr in all_results:
            d = {"model": mr.model, "steps": [], "concurrency": None}
            for s in mr.steps:
                d["steps"].append({
                    "step_id": s.step_id,
                    "step_label": s.step_label,
                    "step_type": s.step_type,
                    "ttft_ms": s.ttft_ms,
                    "total_duration_ms": s.total_duration_ms,
                    "eval_count": s.eval_count,
                    "prompt_eval_count": s.prompt_eval_count,
                    "tokens_per_second": s.tokens_per_second,
                    "quality": s.quality,
                    "error": s.error,
                })
            if mr.concurrency:
                c = mr.concurrency
                d["concurrency"] = {
                    "n_users": c.n_users,
                    "step_id": c.step_id,
                    "total_wall_ms": c.total_wall_ms,
                    "avg_latency_ms": c.avg_latency_ms,
                    "p50_ms": c.p50_ms,
                    "p95_ms": c.p95_ms,
                    "p99_ms": c.p99_ms,
                    "errors": c.errors,
                    "total_requests": c.total_requests,
                }
            raw.append(d)
        with open(raw_file, "w", encoding="utf-8") as f:
            json.dump(raw, f, indent=2, ensure_ascii=False)
        print(f"Risultati raw salvati in: {raw_file}")


def _main():
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\nInterrotto dall'utente.")
        sys.exit(1)


if __name__ == "__main__":
    _main()
