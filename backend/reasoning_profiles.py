"""Architettura dinamica del budget di reasoning, per-modello.

Problema: i modelli "reasoning" (qwen3, deepseek reasoner, gemini 2.5/3 thinking,
claude thinking, o-series, ...) consumano il budget di output sul ragionamento.
Con un `max_tokens` piccolo la risposta visibile torna VUOTA e la chat mostra
"Non sono riuscito a completare questo passaggio per un problema temporaneo".

Soluzione: un registro che classifica il modello (per famiglia, cross-provider)
e calcola un piano (`ReasoningPlan`) con:
  - se il reasoning va attivato,
  - un budget di ragionamento BOUNDED (cap, dove il provider lo supporta),
  - un `max_tokens` totale = budget ragionamento + headroom riservato alla
    risposta, così la risposta ha sempre spazio dopo il ragionamento.

Modulo puro (niente rete, niente DB): testabile in isolamento. La traduzione
del piano nei parametri specifici del provider (gemini thinking_budget,
openrouter reasoning.max_tokens, anthropic budget_tokens, ollama think) vive in
`ai_service.py`.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class ReasoningProfile:
    """Caratteristiche di reasoning di una famiglia di modelli."""
    family: str
    is_reasoning: bool        # il modello ragiona di default
    can_disable: bool         # il reasoning si puo' spegnere via API/prompt
    reasoning_budget: int     # token di ragionamento concessi quando attivo
    answer_headroom: int      # token riservati alla risposta oltre al ragionamento


@dataclass(frozen=True)
class ReasoningPlan:
    """Piano risolto per una singola chiamata (provider+modello)."""
    enabled: bool                      # attivare il reasoning per questa chiamata
    reasoning_budget: Optional[int]    # cap sui token di ragionamento (None = nessun cap esplicito)
    max_tokens: Optional[int]          # budget di output totale da inviare al provider


# Headroom prudente per un modello reasoning SCONOSCIUTO (non in tabella) quando
# il thinking e' attivo: meglio concedere spazio che rischiare risposta vuota.
LEGACY_REASONING_BUDGET = 6000
# Token minimi riservati alla risposta visibile quando il modello e' sconosciuto.
DEFAULT_ANSWER_HEADROOM = 1500

# Piano neutro: reasoning spento, nessun gonfiaggio. Usato come default sicuro
# quando nessun piano e' stato risolto (es. riassunti, chiamate dirette).
DISABLED_PLAN = ReasoningPlan(enabled=False, reasoning_budget=0, max_tokens=None)


# Tabella pattern -> profilo. Il PRIMO match vince: i pattern reasoning vanno
# prima dei pattern "non reasoning" che potrebbero sovrapporsi per substring.
# Il match e' case-insensitive su una porzione dell'id modello (cross-provider:
# es. "deepseek-v4-flash", "deepseek/deepseek-r1", "qwen3.5:9b").
_PATTERNS: list[tuple[re.Pattern, ReasoningProfile]] = [
    # --- Modelli ESPLICITAMENTE non-reasoning (match prioritario per evitare
    #     falsi positivi dei substring piu' generici sotto). ---
    (re.compile(r"gemini-2\.0|gemini-1\.5|gemini-flash-lite"),
     ReasoningProfile("gemini-classic", False, True, 0, DEFAULT_ANSWER_HEADROOM)),
    # Gemma 4: reasoning attivabile (Ollama `think`) per il «sto pensando» didattico.
    # Ollama NON separa i token thinking/risposta (un solo `num_predict`): il pensiero
    # nativo di Gemma e' verboso, quindi serve un answer_headroom ampio per garantire
    # sempre spazio alla risposta visibile ed evitare output vuoti. Devono precedere la
    # riga generica `gemma` non-reasoning (gemma4 e' un sottoinsieme: primo match vince).
    # Il 12B ragiona MOLTO di piu' dell'e4b (osservato ~3-4k token di pensiero): totale
    # ~6000 per non far mai starvare la risposta. Pattern 12b PRIMA del gemma4 generico.
    (re.compile(r"gemma-?4.*12b"),
     ReasoningProfile("gemma4-12b-thinking", True, True, 2000, 4000)),
    (re.compile(r"gemma-?4"),
     ReasoningProfile("gemma4-thinking", True, True, 1500, 2000)),
    (re.compile(r"gemma|mistral-small|mistral-large|mistral-7|mistral-medium|mixtral|ministral"),
     ReasoningProfile("non-reasoning", False, True, 0, DEFAULT_ANSWER_HEADROOM)),
    (re.compile(r"llama|gpt-4o|gpt-4\.1|gpt-3\.5|phi-3|phi-4|command-r|nova-(micro|lite|pro)"),
     ReasoningProfile("non-reasoning", False, True, 0, DEFAULT_ANSWER_HEADROOM)),

    # --- Reasoner forti: ragionamenti lunghi, budget generoso. ---
    (re.compile(r"deepseek.*(r1|reasoner|v4|v3\.1|v3\.2)|deepseek-r"),
     ReasoningProfile("deepseek-reasoner", True, True, 6000, 2000)),
    (re.compile(r"\bo[134]\b|o1-|o3-|o4-|gpt-5|gpt5"),
     ReasoningProfile("openai-o", True, True, 8000, 2000)),
    (re.compile(r"qwen-?3|qwq|qwen.*think"),
     ReasoningProfile("qwen3", True, True, 5000, 1800)),
    (re.compile(r"gemini-2\.5|gemini-3|gemini.*think"),
     ReasoningProfile("gemini-thinking", True, True, 6000, 2000)),
    (re.compile(r"claude.*(thinking|3[\.-]7|sonnet-4|opus-4|haiku-4|sonnet-?4|4[\.-]5)"),
     ReasoningProfile("claude-thinking", True, True, 6000, 2000)),
    (re.compile(r"magistral"),
     ReasoningProfile("magistral", True, True, 5000, 1800)),
    (re.compile(r"ling-?2|inclusionai|ring-"),
     ReasoningProfile("ling", True, True, 4000, 1600)),
    (re.compile(r"glm-4\.6|glm-z1|glm-zero|minimax-m|kimi-k2-think|hunyuan-t|grok-3-mini|grok-4"),
     ReasoningProfile("misc-reasoner", True, True, 5000, 1800)),
]


def classify(model: Optional[str]) -> Optional[ReasoningProfile]:
    """Profilo del modello, o None se sconosciuto.

    `None` non significa "non ragiona": significa "non lo so". Il chiamante
    (`resolve_plan`) tratta lo sconosciuto in modo prudente concedendo headroom
    quando il thinking e' attivo, per non incorrere in risposte vuote.
    """
    name = (model or "").strip().lower()
    if not name:
        return None
    for pattern, profile in _PATTERNS:
        if pattern.search(name):
            return profile
    return None


def is_reasoning_model(model: Optional[str]) -> bool:
    """True solo per i modelli NOTI come reasoning. Sconosciuti -> False."""
    profile = classify(model)
    return bool(profile and profile.is_reasoning)


def resolve_plan(
    model: Optional[str],
    *,
    disable_thinking: bool,
    requested_max_tokens: Optional[int] = None,
    fallback_max_tokens: Optional[int] = None,
    budget_override: Optional[int] = None,
) -> ReasoningPlan:
    """Calcola il piano di reasoning per (modello, flag, budget richiesti).

    - `disable_thinking` True  -> reasoning spento, nessun gonfiaggio del budget.
    - modello NOTO non-reasoning -> reasoning spento, budget richiesto invariato.
    - modello reasoning (noto) o sconosciuto + thinking attivo -> reasoning
      attivo con budget bounded + headroom per la risposta.
    - `budget_override` (es. dal preset admin) ha precedenza sul default famiglia.
    """
    requested = requested_max_tokens if requested_max_tokens is not None else fallback_max_tokens
    profile = classify(model)

    # Reasoning disattivato esplicitamente: passa il budget richiesto cosi' com'e'.
    if disable_thinking:
        return ReasoningPlan(enabled=False, reasoning_budget=0, max_tokens=requested)

    # Modello noto e non-reasoning: nessun gonfiaggio, nessun budget.
    if profile is not None and not profile.is_reasoning:
        return ReasoningPlan(enabled=False, reasoning_budget=None, max_tokens=requested)

    # Reasoning attivo: famiglia nota reasoning, oppure modello sconosciuto (prudenza).
    if profile is not None:
        budget = profile.reasoning_budget
        answer = profile.answer_headroom
    else:
        budget = LEGACY_REASONING_BUDGET
        answer = DEFAULT_ANSWER_HEADROOM

    if budget_override and budget_override > 0:
        budget = int(budget_override)

    total = budget + answer
    if requested:
        total = max(int(requested), total)
    return ReasoningPlan(enabled=True, reasoning_budget=budget, max_tokens=total)
