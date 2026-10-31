"""Registry of every LLM prompt: the single source the prompt health check reads.

Each entry says where a prompt lives (config key, guided step or code), its
factory source, the backend function that reads it (consumer), the surfaces
that send it to the model, its slot in the assembled request and the rules it
imposes. Rules are structured fields, each with the factory sentence that
states it (`evidence`): conflicts are computed from the fields, never by
reading the text, and the evidence shows the two sentences side by side.

`tests/test_prompt_registry.py` fails when a prompt key in config, database
or factory has no entry, when an entry has no consumer, or when a rule's
evidence is no longer in its factory text.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from . import prompt_config
from .prompt_variants import base_key

# --- Surfaces ---------------------------------------------------------------
GUIDED = "guided"          # guided paths (web), step by step
TELEGRAM = "telegram"      # the same pipeline driven from Telegram
FREE_CHAT = "free_chat"    # free conversation on the profile
ASSISTANT = "assistant"    # CounselorBot Assistant (site chat collections)
AUXILIARY = "auxiliary"    # one-shot generators (cross synthesis, pQBL)
SURFACES = (GUIDED, TELEGRAM, FREE_CHAT, ASSISTANT, AUXILIARY)

# --- Assembly order (slots of the request built by chat_preparation) --------
ORDER_SYSTEM = 10      # system prompt resolved from step/mode
ORDER_STEP = 20        # step instructions (internal message)
ORDER_META = 30        # [META SYSTEM PROMPT] theory for instrument/step
ORDER_DIRECTIVE = 40   # global directives
ORDER_CONTEXT = 50     # contexts, variants, knowledge cards
ORDER_CONTRACT = 60    # turn contract
ORDER_FORMAT = 70      # visible format
ORDER_PRIVATE = 80     # private blocks and markers

# --- Rule vocabulary ----------------------------------------------------------
# questions: (min, max) questions per reply.
# format: prose | list | chosen (the option picked in the chat).
# language: selected | an ISO code fixed by the text.
# strategies: none (no new practical action) | certified | certified_or_approved
#             (sources allowed when an action is offered) | proactive (must propose).
# step_marker: required | forbidden ([[AVANZA_STEP]]).
RULE_VALUES = {
    "questions": None,  # tuple validated separately
    "format": {"prose", "list", "chosen"},
    "language": None,   # "selected" or a two-letter code
    "strategies": {"none", "certified", "certified_or_approved", "proactive"},
    "step_marker": {"required", "forbidden"},
}


@dataclass(frozen=True)
class Rule:
    field: str
    value: object
    evidence: str


@dataclass(frozen=True)
class PromptEntry:
    id: str
    kind: str                      # config | guided_step | code
    key: str
    consumer: str                  # "backend.module:function"
    surfaces: tuple
    order: int
    factory: str | None = None     # where the default text lives
    rules: tuple = ()
    placeholders: frozenset = frozenset()
    empty_fallback: bool = False   # an empty stored value falls back to the factory text
    family: bool = False           # entry covers dynamic keys (see `config_entry`)
    marker: str | None = None      # code entries: substring proving presence in a request
    known_refs: frozenset = frozenset()  # codes named on purpose (e.g. "K1-K5 are not QPCC factors")
    label: str = ""


def _q(lo: int, hi: int, evidence: str) -> Rule:
    return Rule("questions", (lo, hi), evidence)


def _r(field_name: str, value, evidence: str) -> Rule:
    return Rule(field_name, value, evidence)


ONE = (1, 1)
AT_MOST_ONE = (0, 1)

_RESOLVE_SYSTEM = "backend.chat_logic:_resolve_system_prompt"
_META = "backend.chat_logic:_instrument_meta_system_prompt"
_DIRECTIVES = "backend.chat_logic:_apply_global_directives"
_STEP = "backend.chat_preparation:prepare_chat_turn"
_SITE = "backend.routes.site_chat:_resolve_site_prompt"
_GUIDED = (GUIDED, TELEGRAM)
_DIRECTIVE_SURFACES = (GUIDED, TELEGRAM, FREE_CHAT)
_LANG = frozenset({"lang", "lang_native"})

_ONE_PER_TURN = "exactly ONE open question per turn on a single aspect, never a list of questions"
_LAST_LINE_MARKER = "on the last line put only [[AVANZA_STEP]]"

# Rules of config prompts, keyed by config key. Evidence is copied verbatim
# from the factory text (prompt_config / backend/prompts).
_CONFIG_RULES: dict[str, tuple] = {
    "prompt_factor": (_r("strategies", "none", "Do not propose advice, exercises, action plans, or strategies in this step"),),
    "prompt_second_level": (_r("strategies", "none", "without practical actions: the Strategies and advice step at the end of the path proposes them"),),
    "prompt_qsar_second_level": (_r("strategies", "none", "without practical actions: the Strategies and advice step at the end of the path proposes them"),),
    "prompt_strategies": (
        _r("strategies", "proactive", "Propose strategies on your own initiative for the factors or areas"),
        _r("strategies", "certified_or_approved", "when no certified strategy fits a factor, you may use an approved support strategy supplied in [KNOWLEDGE]"),
    ),
    "prompt_free_chat_contract": (_q(0, 1, "Ask at most ONE question per reply"),),
    "prompt_factor_qa": (_r("strategies", "certified", "Offer a practical action only if the current turn permits advice and a supplied certified candidate supports it"),),
    "prompt_qsar_factor_qa": (_r("strategies", "certified", "Offer a practical action only if the current turn permits advice and a supplied certified candidate supports it"),),
    "prompt_savickas_interview": (_q(1, 1, "Ask exactly ONE open question per turn on a single aspect, never a list of questions"),),
    "prompt_savickas_summary": (_r("step_marker", "required", "On the last line put only the technical marker [[AVANZA_STEP]]"),),
    "prompt_idea_focus": (
        _q(1, 1, "Ask ONE question per turn, then stop and wait"),
    ),
    "prompt_evento_interview": (_q(1, 1, "Ask exactly ONE open question per turn on a single aspect, never a list of questions, using the person's own words"),),
    "prompt_evento_summary": (_r("step_marker", "required", "On the last line put only the technical marker [[AVANZA_STEP]]"),),
    "prompt_obiettivo_interview": (_q(1, 1, "Ask exactly ONE open question per turn on a single aspect, never a list of questions, only about what is still missing"),),
    "prompt_obiettivo_summary": (_q(0, 1, "End with at most ONE open question, never a list of questions"),),
    "prompt_qpcs_summary": (_r("step_marker", "required", "On the last line put ONLY the technical marker [[AVANZA_STEP]]"),),
    "prompt_qpcc_factor": (_r("strategies", "none", "No practical advice in the profile step"),),
    "prompt_qpcc_summary": (
        _r("strategies", "none", "Add no new practical suggestion: the Strategies and advice step that follows proposes them"),
        _r("step_marker", "required", "ONLY [[AVANZA_STEP]] on the last line"),
    ),
    "prompt_qap_interview": (_q(1, 1, "Stay with each area while the student is developing it: " + _ONE_PER_TURN),),
    "prompt_qpcc_interview": (_q(1, 1, "Stay with each area while the student is developing it: " + _ONE_PER_TURN),),
    "prompt_qap_summary": (
        _r("strategies", "none", "no new practical suggestion: the Strategies and advice step"),
        _r("step_marker", "required", "On the last line put ONLY the technical marker [[AVANZA_STEP]]"),
    ),
    "prompt_meta_QSAR_qsar-synthesis": (_r("strategies", "none", "introduce no new strategy in this synthesis"),),
    "prompt_guided_questions": (_q(1, 1, "asking only one question per reply"),),
    "directive_language": (_r("language", "selected", "You MUST write your student-facing response in {lang}"),),
}

# Rules of factory guided steps (prompt column), keyed by step id.
_STEP_RULES: dict[str, tuple] = {
    "cognitive": (_r("strategies", "none", "Do not give practical advice in this step"),),
    "affective": (_r("strategies", "none", "Do not give practical advice in this step"),),
    **{sid: (_q(1, 1, "Close by asking exactly ONE open question on a single aspect"),) for sid in (
        "sl-elaboration", "sl-selfcontrol", "sl-motivation", "sl-emotions", "sl-attribution", "sl-social",
        "qsar-processing", "qsar-selfcontrol", "qsar-motivation", "qsar-emotions", "qsar-attributions",
    )},
    "sl-synthesis": (_r("strategies", "none", "Do not introduce a new study strategy or a new action"),),
    "qsar-synthesis": (_r("strategies", "none", "Do not introduce a new study strategy or a new action"),),
    "qsar-cognitive": (_r("strategies", "none", "as an open reading of study strategies, without practical advice"),),
    "qsar-affective": (_r("strategies", "none", "as an open reading of study attitudes, without practical advice"),),
    **{sid: (_r("strategies", "proactive", "propose practical strategies, one concrete action for each factor worth working on"),)
       for sid in ("sl-strategies", "qsar-strategies", "ztpi-strategies", "qpcs-strategie", "qpcc-strategie", "qap-strategie")},
    **{sid: (_r("strategies", "none", "and do not add practical advice"),) for sid in ("ztpi-t1", "ztpi-t2", "ztpi-t3", "ztpi-t4", "ztpi-t5")},
    "ztpi-btp": (_r("strategies", "none", "Keep this comparison descriptive, without practical actions"),),
    **{sid: (
        _q(1, 1, "In follow-up turns ask exactly ONE open question on a single aspect, never a list of questions"),
        _r("step_marker", "required", "on the last line put only [[AV"),
    ) for sid in ("savickas-q1", "savickas-q2", "savickas-q3", "savickas-q4", "savickas-q5")},
    **{sid: (_r("step_marker", "required", _LAST_LINE_MARKER),) for sid in (
        "savickas-patto", "evstudio-patto", "evprof-patto",
    )},
    **{sid: (_r("step_marker", "required", "On the last line put only [[AVANZA_STEP]]"),) for sid in (
        "savickas-final", "evstudio-final", "evprof-final", "qpcs-sintesi", "qap-sintesi",
    )},
    **{f"{p}-evento": (_q(1, 1, "Ask exactly ONE open question to start"), _r("step_marker", "required", _LAST_LINE_MARKER))
       for p in ("evstudio", "evprof")},
    **{f"{p}-{s}": (_q(1, 1, "Ask exactly ONE open question on a single aspect"), _r("step_marker", "required", _LAST_LINE_MARKER))
       for p in ("evstudio", "evprof") for s in ("fatto", "funzionato", "criticita", "rilettura", "prossima")},
    **{f"{p}-criticita": (
        _q(1, 1, "Ask exactly ONE open question on a single aspect"),
        _r("step_marker", "required", _LAST_LINE_MARKER),
        _r("strategies", "none", "No advice yet"),
    ) for p in ("evstudio", "evprof")},
    **{f"{p}-partenza": (_q(1, 1, "Then ask exactly ONE open question on a single aspect, never a list of questions"),
                         _r("step_marker", "required", _LAST_LINE_MARKER)) for p in ("obbstudio", "obbdocenza")},
    **{f"{p}-{s}": (_q(1, 1, "Ask exactly ONE open question per turn on a single aspect"),
                    _r("step_marker", "required", _LAST_LINE_MARKER))
       for p in ("obbstudio", "obbdocenza") for s in ("livello", "piano", "verifica")},
    **{f"{p}-final": (_q(0, 1, "End with at most ONE open question, never a list of questions"),
                      _r("step_marker", "forbidden", "do not use the step marker")) for p in ("obbstudio", "obbdocenza")},
    **{sid: (_q(1, 1, "Then open the reflection with exactly ONE open question on a single aspect"),)
       for sid in ("qpcs-emozioni", "qpcs-comunicazione", "qpcs-volizione", "qpcs-apprendimento", "qpcs-fiducia")},
    "qpcs-profilo": (_r("strategies", "none", "Do not give practical advice here"),),
    "qpcs-sintesi": (
        _r("strategies", "none", "Add no new practical suggestion: the Strategies and advice step that follows proposes them"),
        _r("step_marker", "required", "On the last line put only [[AVANZA_STEP]]"),
    ),
    "qpcc-profilo": (_r("strategies", "none", "No practical advice here"),),
    **{sid: (_q(1, 1, "exactly ONE question per turn on what they do"),
             _r("step_marker", "required", "put only [[AVANZA_STEP]] on the last line"))
       for sid in ("qpcc-comunicazione", "qpcc-controllo", "qpcc-volizione", "qpcc-elaborazione", "qpcc-convinzioni")},
    "qpcc-intro": (_r("step_marker", "required", "when confirmed, on the last line put only [[AVANZA_STEP]]"),),
    "qpcc-sintesi": (
        _q(1, 1, "End with one reflection question"),
        _r("strategies", "none", "Add no new practical suggestion: the Strategies and advice step that follows proposes them"),
        _r("step_marker", "required", "[[AVANZA_STEP]] on the last line"),
    ),
    "qap-profilo": (_r("strategies", "none", "Do not give practical advice here"),),
    **{sid: (_q(1, 1, "Ask exactly ONE open question on a single aspect"),
             _r("step_marker", "required", "only [[AVANZA_STEP]]"))
       for sid in ("qap-preoccupazione", "qap-controllo", "qap-curiosita", "qap-fiducia")},
    "qap-intro": (_r("step_marker", "required", "When the confirmation arrives, on the last line put only [[AVANZA_STEP]]"),),
    "qap-sintesi": (
        _r("strategies", "none", "Add no new practical suggestion: the Strategies and advice step that follows proposes them"),
        _r("step_marker", "required", "On the last line put only [[AVANZA_STEP]]"),
    ),
}

# Config keys the factory defines, grouped by consumer.
_SYSTEM_KEYS = (
    "prompt_factor", "prompt_second_level", "prompt_strategies", "prompt_factor_qa", "prompt_generic",
    "prompt_qsar_factor", "prompt_qsar_second_level", "prompt_qsar_factor_qa", "prompt_qsar_generic",
    "prompt_ztpi_factor", "prompt_ztpi_btp", "prompt_savickas_interview", "prompt_savickas_summary",
    "prompt_idea_focus", "prompt_evento_interview", "prompt_evento_summary", "prompt_obiettivo_interview",
    "prompt_obiettivo_summary", "prompt_qpcs_factor", "prompt_qpcs_analysis", "prompt_qpcs_summary",
    "prompt_qpcc_factor", "prompt_qap_factor", "prompt_qpcc_summary", "prompt_qap_interview",
    "prompt_qpcc_interview", "prompt_qap_summary",
    # Fixed phases (GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS): questions and step openings.
    "prompt_guided_questions", "prompt_intro", "prompt_qsar_intro", "prompt_ztpi_intro", "prompt_savickas_intro",
    "prompt_evstudio_intro", "prompt_evprof_intro", "prompt_obbstudio_intro", "prompt_obbdocenza_intro",
    "prompt_qpcs_welcome", "prompt_qpcc_welcome", "prompt_qap_welcome",
)
_SITE_KEYS = (
    "prompt_site_chat_docente", "prompt_site_chat_studente",
    "prompt_counselorbot_chat_docente", "prompt_counselorbot_chat_studente",
    "site_chat_knowledge_card", "site_chat_platform_context", "counselorbot_chat_context",
    "framework_chat_context", "questionari_chat_context",
)


def _factory_name(key: str) -> str:
    return f"prompt_config.ALL_CONFIG_TEXT_DEFINITIONS[{key}]"


# Factor codes a factory text names on purpose, outside its instrument.
_KNOWN_REFS = {"prompt_qpcc_factor": frozenset({"K1", "K5"})}


def _config(key, consumer, surfaces, order, **extra) -> PromptEntry:
    return PromptEntry(
        id=f"config:{key}", kind="config", key=key, consumer=consumer, surfaces=tuple(surfaces),
        order=order, factory=_factory_name(key), rules=_CONFIG_RULES.get(key, ()),
        known_refs=_KNOWN_REFS.get(key, frozenset()), **extra,
    )


def _build_config_entries() -> dict[str, PromptEntry]:
    entries: list[PromptEntry] = []
    for key in _SYSTEM_KEYS:
        entries.append(_config(key, _RESOLVE_SYSTEM, _GUIDED, ORDER_SYSTEM, empty_fallback=True))
    entries.append(_config("prompt_free_chat", _RESOLVE_SYSTEM, (FREE_CHAT,), ORDER_SYSTEM, empty_fallback=True))
    entries.append(_config("prompt_free_chat_contract", "backend.chat_preparation:free_chat_contract",
                           (FREE_CHAT,), ORDER_CONTRACT, empty_fallback=True))
    entries.append(_config("prompt_cross_synthesis", "backend.routes.cross_synthesis:generate_cross_synthesis",
                           (AUXILIARY,), ORDER_SYSTEM, empty_fallback=True))
    entries.append(_config("pqbl_question_generation_prompt", "backend.routes.pqbl:_generate_all_chunks",
                           (AUXILIARY,), ORDER_SYSTEM, empty_fallback=True))
    for variant in ("student_path", "student_open", "research", "concept"):
        entries.append(_config(f"prompt_idea_variant_{variant}", "backend.chat_preparation:_apply_idea_variant_directive",
                               _GUIDED, ORDER_CONTEXT, empty_fallback=True))
    for definition in prompt_config.META_SYSTEM_PROMPT_DEFINITIONS:
        entries.append(_config(definition["key"], _META, _GUIDED, ORDER_META))
    for definition in prompt_config.GLOBAL_DIRECTIVE_DEFINITIONS:
        key = definition["key"]
        entries.append(_config(key, _DIRECTIVES, _DIRECTIVE_SURFACES, ORDER_DIRECTIVE,
                               placeholders=_LANG if key == "directive_language" else frozenset(),
                               empty_fallback=key != "directive_affirmative"))
    for key in _SITE_KEYS:
        entries.append(_config(key, _SITE, (ASSISTANT,), ORDER_SYSTEM if key.startswith("prompt_") else ORDER_CONTEXT))
    return {entry.id: entry for entry in entries}


# Dynamic config families: keys that exist only in the database.
META_STEP_FAMILY = PromptEntry(
    id="config:prompt_meta_<INSTRUMENT>_<step>", kind="config", key="prompt_meta_<INSTRUMENT>_<step>",
    consumer=_META, surfaces=_GUIDED, order=ORDER_META, family=True,
    label="Per-step meta prompt override",
)
META_INSTRUMENT_FAMILY = PromptEntry(
    id="config:prompt_meta_<INSTRUMENT>", kind="config", key="prompt_meta_<INSTRUMENT>",
    consumer=_META, surfaces=_GUIDED, order=ORDER_META, family=True,
    label="Meta prompt of an instrument created in Administration",
)
RAG_CONTEXT_FAMILY = PromptEntry(
    id="config:rag_chat_context_<collection>", kind="config", key="rag_chat_context_<collection>",
    consumer=_SITE, surfaces=(ASSISTANT,), order=ORDER_CONTEXT, family=True,
    label="Context of an Assistant collection",
)
CUSTOM_STEP_FAMILY = PromptEntry(
    id="guided_step:<custom>", kind="guided_step", key="<custom>", consumer=_STEP,
    surfaces=_GUIDED, order=ORDER_STEP, family=True, label="Guided step created in Administration",
)


def _build_step_entries() -> dict[str, PromptEntry]:
    from .prompt_factory_alignment import STEP_LIST_NAMES
    out = {}
    for list_name in STEP_LIST_NAMES:
        for step in getattr(prompt_config, list_name):
            out[f"guided_step:{step['id']}"] = PromptEntry(
                id=f"guided_step:{step['id']}", kind="guided_step", key=step["id"], consumer=_STEP,
                surfaces=_GUIDED, order=ORDER_STEP, factory=f"prompt_config.{list_name}",
                rules=_STEP_RULES.get(step["id"], ()),
            )
    return out


# Prompts built in code that impose rules on every guided turn. `marker`
# identifies the piece inside an assembled request; evidence is a literal
# fragment of the consumer module.
_CODE_ENTRIES = (
    PromptEntry(
        id="code:turn_contract", kind="code", key="turn_contract", consumer="backend.prompt_contract:turn_contract",
        surfaces=_GUIDED, order=ORDER_CONTRACT, marker="[TURN CONTRACT]",
        rules=(
            _q(0, 1, "Ask at most ONE focused question, then wait."),
            _r("strategies", "none", "Introduce no new practical action in this turn."),
            _r("strategies", "certified_or_approved", "Offer new practical actions only from the certified candidates supplied for this turn or, when "),
            _r("step_marker", "forbidden", "Use no [[AVANZA_STEP]] marker or fixed sequence."),
        ),
    ),
    PromptEntry(
        id="code:format_rule", kind="code", key="FORMAT_RULE", consumer="backend.prompt_contract:turn_contract",
        surfaces=_GUIDED, order=ORDER_FORMAT, marker="Write in the format chosen in the chat",
        rules=(_r("format", "chosen", "Write in the format chosen in the chat, given in [VISIBLE RESPONSE FORMAT]"),),
    ),
)


def _build_registry() -> dict[str, PromptEntry]:
    registry = {**_build_config_entries(), **_build_step_entries()}
    for entry in (*_CODE_ENTRIES, META_STEP_FAMILY, META_INSTRUMENT_FAMILY, RAG_CONTEXT_FAMILY, CUSTOM_STEP_FAMILY):
        registry[entry.id] = entry
    return registry


REGISTRY: dict[str, PromptEntry] = _build_registry()

# Keys in the configs table that look like prompts but are not model text.
NOT_PROMPT_PREFIXES = (
    "prompt_components_",   # JSON flags of the request components (admin map)
    "prompt_guidance_",     # administrator notes on a phase, never sent
)
NOT_PROMPT_KEYS = frozenset({"log_full_prompt"})  # logging switch
_META_RE = re.compile(r"^prompt_meta_([A-Z0-9_-]+?)(?:_(.+))?$")


def is_prompt_config_key(key: str) -> bool:
    """True when a configs row holds model instructions that must be registered."""
    if key.startswith(NOT_PROMPT_PREFIXES) or key in NOT_PROMPT_KEYS:
        return False
    if re.search(r"__(?:it|en|es|fr|de|sv)$", key):
        return False  # UI translations
    return (
        key.startswith(("prompt_", "directive_", "rag_chat_context_"))
        or key.endswith(("_prompt", "_chat_context", "_platform_context", "_knowledge_card"))
    )


def config_entry(key: str) -> PromptEntry | None:
    """Registry entry for a configs key, resolving variants and dynamic families."""
    key = base_key(key)
    entry = REGISTRY.get(f"config:{key}")
    if entry is not None:
        return entry
    if key.startswith("rag_chat_context_"):
        return RAG_CONTEXT_FAMILY
    match = _META_RE.match(key)
    if match:
        return META_STEP_FAMILY if match.group(2) else META_INSTRUMENT_FAMILY
    return None


def step_entry(step_id: str) -> PromptEntry:
    return REGISTRY.get(f"guided_step:{step_id}", CUSTOM_STEP_FAMILY)


def factory_text(entry: PromptEntry) -> str | None:
    """Default text of a config or step entry, or None for code and families."""
    if entry.family or entry.kind == "code":
        return None
    if entry.kind == "config":
        return next((d.get("default") or "" for d in prompt_config.ALL_CONFIG_TEXT_DEFINITIONS if d["key"] == entry.key), None)
    from .prompt_factory_alignment import factory_catalog
    step = factory_catalog()[1].get(entry.key)
    return step["prompt"] if step else None
