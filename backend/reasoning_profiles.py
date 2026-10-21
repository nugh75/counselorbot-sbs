"""Architettura dinamica del budget di reasoning, per-modello.

Problema: i modelli "reasoning" (qwen3, deepseek reasoner, gemini 2.5/3 thinking,
claude thinking, o-series, ...) consumano il budget di output sul ragionamento.
Con un `max_tokens` piccolo la risposta visibile torna VUOTA e la chat mostra
"Non sono riuscito a completare questo passaggio per un problema temporaneo".

Soluzione: un registro che classifica il modello (per famiglia, cross-provider)
e calcola un piano (`ReasoningPlan`) con:
  - se il reasoning va attivato,
  - una riserva di ragionamento (cap solo dove il provider lo supporta),
  - un `max_tokens` totale = riserva + headroom della risposta, adattato
    all'effort e ai limiti noti. La riserva locale dei reasoner adattivi non
    garantisce la ripartizione effettiva dei token del provider.

Modulo puro (niente rete, niente DB): testabile in isolamento. La traduzione
del piano nei parametri specifici del provider (gemini thinking_budget,
openrouter reasoning.max_tokens, anthropic budget_tokens, ollama think) vive in
`ai_service.py`.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, replace
from typing import Optional

from .openrouter_capabilities import capability_for as _openrouter_capability


@dataclass(frozen=True)
class ReasoningProfile:
    """Caratteristiche di reasoning di una famiglia di modelli."""
    family: str
    is_reasoning: bool        # il modello ragiona di default
    can_disable: bool         # il reasoning si puo' spegnere via API/prompt
    reasoning_budget: int     # token di ragionamento concessi quando attivo
    answer_headroom: int      # token riservati alla risposta oltre al ragionamento
    # Alcuni modelli emettono un canale interno ANCHE con il pensiero spento: se
    # il cap arriva prima che il canale visibile si chiuda, la risposta torna
    # vuota. Minimo di output da garantire in quel caso. 0 = nessun minimo.
    no_think_floor: int = 0


@dataclass(frozen=True)
class ReasoningPlan:
    """Piano risolto per una singola chiamata (provider+modello)."""
    enabled: bool                      # attivare il reasoning per questa chiamata
    reasoning_budget: Optional[int]    # riserva locale di token per il ragionamento
    max_tokens: Optional[int]          # budget di output totale da inviare al provider
    effort: Optional[str] = None       # effort applicato al provider (None = default provider)
    requested_effort: Optional[str] = None
    effort_honored: bool = True        # False se il modello impone un effort diverso
    requested_response_tokens: Optional[int] = None
    response_headroom_tokens: Optional[int] = None
    required_output_tokens: Optional[int] = None
    max_completion_tokens: Optional[int] = None
    context_tokens: Optional[int] = None
    reasoning_control: str = "legacy"
    warnings: tuple[str, ...] = ()


def plan_details(plan) -> dict:
    """One serializable budget contract for preview and generation logs."""
    if not isinstance(plan, ReasoningPlan):
        return {}
    return {
        **asdict(plan),
        "reasoning_reserve_tokens": plan.reasoning_budget,
        "total_output_tokens": plan.max_tokens,
        "reasoning_reserve_is_local": plan.reasoning_control == "effort",
    }


def _output_plan(plan: ReasoningPlan, requested, answer, model, capability) -> ReasoningPlan:
    """Size output once; effort reserves are heuristics, never upstream caps.

    OpenRouter documents approximate reasoning shares for effort. Retain the
    family/preset reserve when larger. Gemini 4 Argon's documented 32K minimum
    is a *total*, so neither reserve nor answer is added to it a second time.
    """
    reserve = plan.reasoning_budget or 0
    total = plan.max_tokens
    control = "disabled" if not plan.enabled else "legacy"
    if plan.enabled and capability is not None:
        if capability.supported_efforts and plan.effort:
            control = "effort"
            # Integer ratios avoid rounding 0.95 into an extra token.
            ratios = {"minimal": (1, 9), "low": (1, 4), "medium": (1, 1),
                      "high": (4, 1), "xhigh": (19, 1), "max": (19, 1)}
            numerator, denominator = ratios.get(plan.effort, (1, 1))
            reserve = max(reserve, (answer * numerator + denominator - 1) // denominator)
            total = answer + reserve
            if re.fullmatch(r"google/gemini-4-argon(?::[^/]+)?", (model or "").strip().lower()):
                total = max(total, 32768)
                reserve = total - answer
        elif capability.supports_max_tokens:
            control = "token_budget"
    cap = capability.max_completion_tokens if capability is not None else None
    warnings = []
    if control == "effort":
        warnings.append("adaptive_reasoning_reserve_not_guaranteed")
    if cap is not None and total is not None and total > cap:
        warnings.append("output_capacity_exceeded")
    return replace(
        plan, reasoning_budget=reserve, max_tokens=min(total, cap) if total is not None and cap is not None else total,
        requested_response_tokens=requested, response_headroom_tokens=answer,
        required_output_tokens=total, max_completion_tokens=cap,
        context_tokens=capability.context_length if capability is not None else None,
        reasoning_control=control, warnings=tuple(warnings),
    )


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
    (re.compile(r"\bo[134]\b|o1-|o3-|o4-|gpt-5|gpt5|gpt-6|gpt-?6\.1"),
     ReasoningProfile("openai-o", True, True, 8000, 2000)),
    # qwen3 emette il canale <think> anche con il pensiero spento (per questo
    # esiste `_ThinkSplitter` lato ai_service): senza un minimo di output il cap
    # arriva prima che il canale visibile si apra e la risposta torna vuota,
    # esattamente come su muse-glimmer. Vale per il preset "no reasoning" e per
    # il modello globale di default, entrambi qwen3.8.
    (re.compile(r"qwen-?3|qwq|qwen.*think"),
     ReasoningProfile("qwen3", True, True, 5000, 1800, no_think_floor=1800)),
    # muse-glimmer (Ollama): ragiona di default e Ollama separa `thinking` da
    # `content`; `think: false` lo spegne. Misurato ~1200 caratteri di pensiero
    # su una domanda banale, quindi con num_predict basso la risposta visibile
    # esce vuota: serve un budget esplicito.
    (re.compile(r"muse-?glimmer|glimmer"),
     ReasoningProfile("muse-glimmer", True, True, 4000, 1800, no_think_floor=1800)),
    (re.compile(r"gemini-2\.5|gemini-3|gemini-4|gemini.*think"),
     ReasoningProfile("gemini-thinking", True, True, 6000, 2000)),
    (re.compile(r"claude.*(thinking|3[\.-]7|sonnet-4|opus-4|haiku-4|sonnet-?4|4[\.-]5|5[\.-]5|sonnet-5|haiku-5|opus-5|fable-5)"),
     ReasoningProfile("claude-thinking", True, True, 6000, 2000)),
    (re.compile(r"magistral"),
     ReasoningProfile("magistral", True, True, 5000, 1800)),
    (re.compile(r"ling-?2|inclusionai|ring-"),
     ReasoningProfile("ling", True, True, 4000, 1600)),
    (re.compile(r"glm-4\.6|glm-z1|glm-zero|minimax-m|kimi-k2-think|hunyuan-t|grok-3-mini|grok-4"),
     ReasoningProfile("misc-reasoner", True, True, 5000, 1800)),
]


# Modelli OpenRouter noti per imporre il reasoning (OpenRouter restituisce 400
# se si invia reasoning.enabled=False). Il set viene popolato dinamicamente se
# OpenRouter segnala che un modello richiede reasoning obbligatorio.
OPENROUTER_MANDATORY_REASONING_MODELS: set[str] = {
    "anthropic/claude-sonnet-5.5",
    "anthropic/claude-sonnet-5.5:batch",
    "anthropic/claude-opus-5.5",
    "anthropic/claude-opus-5.5:batch",
    "anthropic/claude-fable-5.1",
    "anthropic/claude-fable-5.1:batch",
    "google/gemini-3.8-flash",
    "google/gemini-3.8-flash:batch",
    "google/gemini-4-argon",
    "google/gemini-4-argon:batch",
    "openai/o1",
    "openai/o1-preview",
    "openai/o1-mini",
    "openai/o3",
    "openai/o3-mini",
    "openai/gpt-6.1-sol-pro",
    "openai/gpt-6.1-sol-pro:batch",
    "openai/gpt-6.1-sol",
    "openai/gpt-6.1-sol:batch",
    "deepseek/deepseek-r1",
    "deepseek/deepseek-r1:free",
    "deepseek/deepseek-r1-distill-llama-70b",
    "deepseek/deepseek-r1-distill-qwen-32b",
    "deepseek/deepseek-r1-distill-qwen-14b",
    "deepseek/deepseek-r1-distill-llama-8b",
}


def is_openrouter_mandatory_reasoning(model: Optional[str]) -> bool:
    """True per i modelli OpenRouter che non accettano reasoning disattivato."""
    if not isinstance(model, str) or not model.strip():
        return False
    m = model.strip().lower()
    if m in OPENROUTER_MANDATORY_REASONING_MODELS:
        return True
    return any(m.startswith(f"{known}:") for known in OPENROUTER_MANDATORY_REASONING_MODELS)


def mark_openrouter_mandatory_reasoning(model: Optional[str]) -> None:
    """Registra un modello che OpenRouter ha appena segnalato come obbligatorio."""
    if isinstance(model, str) and model.strip():
        OPENROUTER_MANDATORY_REASONING_MODELS.add(model.strip().lower())


def is_mandatory_reasoning(model: Optional[str], provider: Optional[str] = None) -> bool:
    """True quando il modello non permette di spegnere il ragionamento.

    La capacità è per modello *e* provider: lo stesso id può essere
    obbligatorio su OpenRouter e regolabile altrove. Il profilo di famiglia
    resta la fonte per i modelli che dichiarano ``can_disable=False``.
    """
    profile = classify(model)
    if profile is not None and not profile.can_disable:
        return True
    if (provider or "").strip().lower() == "openrouter":
        capability = _openrouter_capability(model)
        if capability is not None:
            return capability.mandatory
        return is_openrouter_mandatory_reasoning(model)
    return False


# --- Scelta dello studente sullo spazio di ragionamento -------------------
# Tre etichette, come la lunghezza della risposta. "standard" non impone nulla:
# vale il default della famiglia (o il budget del preset del counselor), cosi'
# chi non tocca il selettore vede il comportamento di sempre.
DEEP_REASONING_BUDGET = 8000

REASONING_EFFORTS = ("off", "standard", "deep")

# Valori accettati dal campo `reasoning_effort` dei preset. Sono deliberatamente
# provider-neutral: OpenRouter li inoltra come `reasoning.effort`, mentre gli
# altri provider li traducono in un budget (Anthropic/Gemini) o in
# `reasoning_effort` (OpenAI).
REASONING_EFFORT_VALUES = ("minimal", "low", "medium", "high", "xhigh", "max")

_EFFORT_ORDER = {"minimal": 0, "low": 1, "medium": 2, "high": 3, "xhigh": 4, "max": 5}
EFFORT_BUDGETS = {
    "minimal": 1024,
    "low": 2500,
    "medium": 5000,
    "high": 8000,
    "xhigh": 12000,
    "max": 16000,
}


def _effort_rank(effort: str) -> int:
    return _EFFORT_ORDER.get(effort, 2)


def _positive_efforts(allowed: tuple[str, ...]) -> list[str]:
    return [effort for effort in allowed if effort in _EFFORT_ORDER]


def _lowest_effort(allowed: tuple[str, ...]) -> Optional[str]:
    positives = _positive_efforts(allowed)
    return min(positives, key=_effort_rank) if positives else None


def _deep_effort(allowed: tuple[str, ...]) -> Optional[str]:
    positives = _positive_efforts(allowed)
    for candidate in ("high", "xhigh", "max", "medium", "low", "minimal"):
        if candidate in positives:
            return candidate
    return None


def _closest_effort(effort: str, allowed: tuple[str, ...]) -> Optional[str]:
    positives = _positive_efforts(allowed)
    if not positives:
        return None
    if effort in positives:
        return effort
    target = _effort_rank(effort)
    return min(positives, key=lambda candidate: (abs(_effort_rank(candidate) - target), _effort_rank(candidate)))


def effort_overrides(effort: Optional[str]) -> tuple[Optional[bool], Optional[int]]:
    """(disable_thinking, budget_override) per la scelta dello studente.

    `(None, None)` significa "nessun override": decide chi decideva prima.
    """
    if effort == "off":
        return True, None
    if effort == "deep":
        return False, DEEP_REASONING_BUDGET
    return None, None


def classify(model: Optional[str]) -> Optional[ReasoningProfile]:
    """Profilo del modello, o None se sconosciuto.

    `None` non significa "non ragiona": significa "non lo so". Il chiamante
    (`resolve_plan`) tratta lo sconosciuto in modo prudente concedendo headroom
    quando il thinking e' attivo, per non incorrere in risposte vuote.
    """
    if not isinstance(model, str):
        return None
    name = model.strip().lower()
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


def supports_reasoning(model: Optional[str], provider: Optional[str] = None) -> bool:
    """False solo per i modelli NOTI come non-reasoning.

    Per OpenRouter il catalogo ha l'ultima parola: può dichiarare reasoning
    anche su un id che la tabella di famiglia classificava diversamente.
    Lo sconosciuto torna True, come in `resolve_plan`: meglio offrire la leva
    dove forse non serve che nasconderla dove servirebbe.
    """
    if (provider or "").strip().lower() == "openrouter":
        capability = _openrouter_capability(model)
        if capability is not None:
            return capability.supports_reasoning
    profile = classify(model)
    return profile is None or profile.is_reasoning


def resolve_plan(
    model: Optional[str],
    *,
    disable_thinking: bool,
    requested_max_tokens: Optional[int] = None,
    fallback_max_tokens: Optional[int] = None,
    budget_override: Optional[int] = None,
    requested_effort: Optional[str] = None,
    provider: Optional[str] = None,
) -> ReasoningPlan:
    """Calcola il piano di reasoning per (modello, flag, budget richiesti).

    - `disable_thinking` True  -> reasoning spento, nessun gonfiaggio del budget.
    - modello NOTO non-reasoning -> reasoning spento, budget richiesto invariato.
    - modello reasoning (noto) o sconosciuto + thinking attivo -> reasoning
      attivo con budget bounded + headroom per la risposta.
    - `budget_override` (es. dal preset admin) ha precedenza sul default famiglia.
    - `requested_effort` (preset o scelta studente) viene normalizzato sulle
      capacità del modello; se il modello impone reasoning, "off" non viene
      presentato come onorato.
    """
    requested = requested_max_tokens if requested_max_tokens is not None else fallback_max_tokens
    profile = classify(model)
    capability = _openrouter_capability(model) if (provider or "").strip().lower() == "openrouter" else None
    allowed = capability.supported_efforts if capability is not None else ()
    if capability is not None:
        mandatory = bool(capability.mandatory)
    elif (provider or "").strip().lower() == "openrouter":
        mandatory = is_openrouter_mandatory_reasoning(model)
    else:
        mandatory = bool(profile is not None and not profile.can_disable)
    requested_effort = requested_effort.strip().lower() if isinstance(requested_effort, str) and requested_effort.strip() else None

    def disabled_plan(*, effort: Optional[str] = "none", honored: bool = True) -> ReasoningPlan:
        total = requested
        if requested and profile is not None and profile.no_think_floor:
            total = max(int(requested), profile.no_think_floor)
        return _output_plan(ReasoningPlan(
            enabled=False,
            reasoning_budget=0,
            max_tokens=total,
            effort=effort,
            requested_effort=requested_effort,
            effort_honored=honored,
        ), requested, total or 0, model, capability)

    # Modello noto e non-reasoning: nessun gonfiaggio, nessun budget. Il
    # catalogo OpenRouter, quando presente, può smentire la tabella di famiglia.
    if capability is None and profile is not None and not profile.is_reasoning:
        return disabled_plan()
    if capability is not None and not capability.supports_reasoning:
        return disabled_plan()

    # Reasoning disattivato esplicitamente (preset, step o scelta "Nessuno").
    # Se il modello lo impone, si usa il livello minimo disponibile e lo si
    # dichiara non onorato: non si invia una disattivazione che il provider
    # rifiuterebbe con un 400.
    if disable_thinking or requested_effort in ("off", "none"):
        if mandatory:
            effort = _lowest_effort(allowed) or "minimal"
            budget = int(budget_override) if budget_override and budget_override > 0 else EFFORT_BUDGETS.get(
                effort, LEGACY_REASONING_BUDGET
            )
            answer = profile.answer_headroom if profile is not None else DEFAULT_ANSWER_HEADROOM
            total = budget + max(answer, int(requested) if requested else 0)
            return _output_plan(ReasoningPlan(
                enabled=True,
                reasoning_budget=budget,
                max_tokens=total,
                effort=effort,
                requested_effort=requested_effort,
                effort_honored=False,
            ), requested, max(answer, int(requested) if requested else 0), model, capability)
        return disabled_plan()

    # Effort richiesto: la scelta esplicita "deep" vale high; "standard" lascia
    # il default del catalogo; un valore di preset viene usato così com'è.
    if requested_effort == "deep":
        effort = _deep_effort(allowed) or "high"
    elif requested_effort in (None, "standard"):
        effort = capability.default_effort if capability is not None else None
    else:
        effort = requested_effort

    honored = True
    if capability is not None and allowed:
        if effort and effort not in allowed:
            clamped = _closest_effort(effort, allowed)
            honored = clamped == effort
            effort = clamped
        if effort == "none" and not mandatory:
            return disabled_plan(honored=honored)

    if effort == "none":
        return disabled_plan()

    if effort is None and capability is not None and not capability.supports_reasoning:
        return disabled_plan()

    # Reasoning attivo: famiglia nota reasoning, oppure modello sconosciuto (prudenza).
    if profile is not None:
        budget = profile.reasoning_budget
        answer = profile.answer_headroom
    else:
        budget = LEGACY_REASONING_BUDGET
        answer = DEFAULT_ANSWER_HEADROOM

    if effort in EFFORT_BUDGETS:
        budget = EFFORT_BUDGETS[effort]

    if budget_override and budget_override > 0:
        budget = int(budget_override)

    total = budget + max(answer, int(requested) if requested else 0)
    return _output_plan(ReasoningPlan(
        enabled=True,
        reasoning_budget=budget,
        max_tokens=total,
        effort=effort,
        requested_effort=requested_effort,
        effort_honored=honored,
    ), requested, max(answer, int(requested) if requested else 0), model, capability)
