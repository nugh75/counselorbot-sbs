import json
import logging
import os
import re
from datetime import UTC, datetime, timezone
from functools import partial

import anthropic
import httpx
from mistralai.client import Mistral
from openai import OpenAI
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import embedding_service, models, personal_api, vision_service
from .api_secrets import API_KEY_ENV_MAP, config_key, resolve_api_secrets
from .local_llm import (
    LLAMACPP_DEFAULT_URL,
    LLAMACPP_KEY_CONFIG,
    llamacpp_api_key,
    openai_base,
)
from .model_context import (
    ContextCapacityError,
    context_profile,
    fit_context,
    validate_output_capacity,
)
from .openrouter_capabilities import capability_for as openrouter_capability
from .privacy.errors import PrivacyError
from .privacy.gateway import AIGateway, context_for
from .privacy.types import AIRequest, Target
from .reasoning_profiles import (
    DEEP_REASONING_BUDGET,
    DISABLED_PLAN,
    OPENROUTER_MANDATORY_REASONING_MODELS,
    REASONING_EFFORT_VALUES,
    ReasoningPlan,
    is_openrouter_mandatory_reasoning,
    is_reasoning_model,
    mark_openrouter_mandatory_reasoning,
    plan_details,
    resolve_plan,
)

logger = logging.getLogger(__name__)

_JSON_RESPONSE_DIRECTIVE_RE = re.compile(
    r"(?<!not )(?<!never )\b(?:return|respond|answer)\s+"
    r"(?:(?:only|with|a|single|raw|valid|strict)\s+){0,5}json\b",
    re.IGNORECASE,
)


def _requests_json_response(system_prompt: str, user_message: str) -> bool:
    """True solo quando l'intera risposta e' richiesta esplicitamente in JSON.

    La semplice presenza della parola ``JSON`` non basta: una chat puo' contenere
    istruzioni per un blocco JSON incorporato, come i diagrammi concettuali, pur
    dovendo restituire una normale risposta discorsiva.
    """
    return bool(_JSON_RESPONSE_DIRECTIVE_RE.search(f"{system_prompt}\n{user_message}"))


class AIError(Exception):
    """Errore di configurazione o di chiamata al provider AI.
    Sollevato invece di restituire stringhe d'errore come fossero risposte del bot."""
    def __init__(self, message, *, code=None):
        super().__init__(message)
        self.code = code


def generation_details(service) -> dict:
    """Text-free diagnostics, including failed attempts and partial streams."""
    getter = getattr(service, "_plan", None)
    return {
        "provider": getattr(service, "last_provider", None),
        "model": getattr(service, "last_model", None),
        "reasoning_plan": plan_details(getter()) if callable(getter) else {},
        "context_budget": getattr(service, "last_context_report", None),
        "model_attempts": getattr(service, "last_attempts", []),
        "completion": getattr(service, "last_completion", None),
    }


# Prompt usato per aggiornare il riassunto rotante della sessione
SUMMARY_SYSTEM_PROMPT = (
    "You are an assistant that maintains a rolling summary of the counseling session. "
    "You will receive the previous summary (if any) and the latest interaction. "
    "Produce a SINGLE updated summary in MAXIMUM 80 words in Italian that integrates "
    "the entire journey done so far, including the latest step. "
    "Use a compact bulleted list. Do NOT add introductions or conclusions. "
    "IMPORTANT: Do NOT include raw numerical scores or tables of data from the QSA questionnaire. "
    "Report only the INTERPRETATIONS and ADVICE that emerged from the analysis. "
    "The result REPLACES the previous summary — do not append, rewrite."
)

# Mappa chiavi runtime -> variabili d'ambiente (segreti e impostazioni locali).
ENV_KEY_MAP = {
    **{config_key(provider): env_vars for provider, env_vars in API_KEY_ENV_MAP.items()},
    'ollama_ip': ('OLLAMA_BASE_URL',),
    'omniroute_url': ('OMNIROUTE_API_URL',),
    'ollama_num_ctx': ('OLLAMA_NUM_CTX',),
    'ollama_keep_alive': ('OLLAMA_KEEP_ALIVE',),
    'ollama_preload': ('OLLAMA_PRELOAD',),
    'llamacpp_url': ('LLAMACPP_BASE_URL',),
    'qsa_ocr_model': ('QSA_OCR_MODEL',),
    'qsa_parser_model': ('QSA_PARSER_MODEL',),
}

# Provider con endpoint OpenAI-compatibile (chat/completions): si gestiscono
# tutti con lo stesso client OpenAI cambiando solo base_url + chiave.
# nome_provider -> base_url. La chiave DB e' sempre 'api_key_<nome>'.
# Aggiungere un provider OpenAI-compatibile = una voce qui (+ ENV_KEY_MAP).
OPENAI_COMPAT_PROVIDERS = {
    'omniroute': 'http://omniroute:20128/v1',
    'groq':      'https://api.groq.com/openai/v1',
    'cerebras':  'https://api.cerebras.ai/v1',
    'deepseek':  'https://api.deepseek.com/v1',
    'together':  'https://api.together.xyz/v1',
    'fireworks': 'https://api.fireworks.ai/inference/v1',
    'deepinfra': 'https://api.deepinfra.com/v1/openai',
}

# Provider locali: nessuna anonimizzazione verso l'esterno necessaria.
LOCAL_PROVIDERS = {'ollama', 'llamacpp'}
# #202: token di ragionamento per livello scelto sulle fonti personali (API).
PERSONAL_REASONING_BUDGETS = {'minimal': 512, 'low': 1024, 'medium': 4096, 'high': 12000, 'xhigh': 24000}

# Model ids that cannot answer a chat (embeddings, speech, images, moderation, legacy completions).
NON_CHAT_MODEL_MARKERS = ("embed", "tts", "whisper", "dall-e", "moderation", "transcribe", "gpt-image",
                          "davinci", "babbage", "-audio", "realtime", "guard")


def _chat_model(model_id):
    lowered = (model_id or "").lower()
    return bool(lowered) and not any(marker in lowered for marker in NON_CHAT_MODEL_MARKERS)


# Ripiego per budget superato. Il provider non e' piu' cablato su Ollama: su
# un'installazione portabile quel servizio puo' non esistere, e ogni chat
# fallirebbe. Il target si sceglie fra i ripieghi configurati dall'admin
# (`ai_fallback_targets`), che sono coppie provider/modello.
BUDGET_FALLBACK_ERROR_CODE = "chat.errors.budget"
BUDGET_FALLBACK_NO_TARGET_MESSAGE = (
    "Budget mensile superato e nessun modello di ripiego configurato. "
    "Aggiungi provider e modello fra i ripieghi in Amministrazione, poi riprova."
)
BUDGET_FALLBACK_UNAVAILABLE_MESSAGE = (
    "Budget mensile superato e i ripieghi configurati non sono disponibili "
    "({providers}): serve un provider locale o gratuito con le credenziali a "
    "posto. Ollama non e' piu' il ripiego predefinito."
)


def is_free_target(provider: str, model: str) -> bool:
    """True se il target non genera costo a consumo (provider locale o gratuiti)."""
    return provider in LOCAL_PROVIDERS or (
        provider == "openrouter"
        and (model == "openrouter/free"
             or (model.endswith(":free") and not model.startswith("openrouter/auto")))
    )


def provider_available(config: dict, provider: str) -> bool:
    """True se il provider e' instradabile: locale/OmniRoute, oppure con chiave.

    Non verifica la raggiungibilita' in rete: e' un controllo di configurazione,
    coerente con `provider_configured` dei preset."""
    if provider in LOCAL_PROVIDERS or provider == 'omniroute':
        return True
    return bool((config.get(config_key(provider)) or '').strip())


def configured_fallback_targets(config: dict) -> list:
    """Coppie (provider, modello) dei ripieghi configurati, in ordine.

    Tollera JSON malformato (la validazione avviene al salvataggio) e ignora le
    voci incomplete."""
    raw = config.get("ai_fallback_targets", "[]")
    try:
        parsed = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        return []
    targets = []
    for target in parsed or []:
        if not isinstance(target, dict):
            continue
        provider = str(target.get("provider") or "").strip()
        model = str(target.get("model") or "").strip()
        if provider and model:
            targets.append((provider, model))
    return targets


def budget_fallback_targets(config: dict) -> list:
    """Ripieghi usabili a budget superato: locali/gratuiti con provider configurato."""
    return [(provider, model) for provider, model in configured_fallback_targets(config)
            if is_free_target(provider, model) and provider_available(config, provider)]


# Alias conservati per i test e per il resto del modulo: la fonte vive in
# `reasoning_profiles`, così anche l'API pubblica può dichiarare il vincolo.
_OPENROUTER_MANDATORY_REASONING_MODELS = OPENROUTER_MANDATORY_REASONING_MODELS
_is_openrouter_mandatory_reasoning_model = is_openrouter_mandatory_reasoning
_mark_openrouter_mandatory_reasoning = mark_openrouter_mandatory_reasoning


def _is_openrouter_reasoning_error(exc: Exception) -> bool:
    """True se l'errore 400 di OpenRouter e' causato dal parametro reasoning
    (es. reasoning obbligatorio che non puo' essere disattivato o parametro non supportato)."""
    status = getattr(exc, "status_code", None)
    if status is not None and status != 400:
        return False
    body = getattr(exc, "body", None)
    msg = ""
    if isinstance(body, dict):
        msg = str(body.get("message") or "")
    if not msg:
        msg = str(exc)
    msg_lower = msg.lower()
    return "reasoning" in msg_lower and (
        "mandatory" in msg_lower
        or "cannot be disabled" in msg_lower
        or "not support" in msg_lower
        or "invalid" in msg_lower
    )


class AIService:
    def __init__(self, db: Session, username: str | None = None):
        self.db = db
        # Data subject of the calls, for the privacy gateway (P6).
        self.privacy_username = username
        self.config = self._load_config()
        # #202: livello di ragionamento della fonte personale; prevale sul preset.
        self.personal_reasoning = None
        # Scelta esplicita dello studente per il turno corrente. Vince sul
        # default della fonte personale e sul preset, così «Nessuno» e
        # «Esteso» non vengono silenziosamente ignorati.
        self._reasoning_effort_override = None
        # Effort scelto dal preset del counselor. La scelta esplicita dello
        # studente e la fonte personale hanno precedenza (vedi proprietà sotto).
        self._preset_reasoning_effort = None
        self.shared_owner = None  # teacher whose counselor and API key answer this student
        self.personal_target = None
        self.personal_error = None
        self.personal_error_code = "personalAPI.errors.configuration"
        from .chatgpt_connections import owner, preference
        self.chatgpt_model = preference(db)
        account = owner(db) if "chatgpt_username" in getattr(db, "info", {}) else username
        try:
            connection = personal_api.active_settings(db, account, getattr(db, "info", {}).get("personal_ai_counselor_id"))
            if connection:
                self.use_personal_connection(connection)
            if connection or self.chatgpt_model:
                self.personal_reasoning = personal_api.chosen_reasoning(
                    db, account, getattr(db, "info", {}).get("personal_ai_counselor_id"))
            else:
                # Without an own choice, a counselor offered by the student's teacher
                # answers through that teacher's API connection.
                from .class_api_sharing import offers
                offer = offers(db, account).get(getattr(db, "info", {}).get("personal_ai_counselor_id"))
                if offer is not None:
                    self.shared_owner, connection_id, reasoning = offer
                    self.use_personal_connection(db.get(models.PersonalAPIConnection, connection_id))
                    self.personal_reasoning = reasoning
        except personal_api.PersonalAPIError as exc:
            # Raise within dispatch so existing HTTP/SSE error handlers can
            # report it, while forbidding a fallback to system credentials.
            self.personal_error = str(exc)
            if self.shared_owner is not None:
                from .class_api_sharing import SHARE_ERROR, record_error
                record_error(db, self.shared_owner, "personalAPI.errors.configuration")
                self.personal_error, self.personal_error_code = "Class AI connection failed.", SHARE_ERROR
        self.last_usage = None
        self.last_provider = None
        self.last_model = None
        self.last_attempts = []
        self.last_context_report = None
        self.context_data = None
        self.last_envelope = None
        # Ultimo ragionamento «sto pensando» estratto (nativo Ollama o tag <think>),
        # esposto ai chiamatori non-stream (es. audit /live) come canale separato.
        self.last_thinking = None
        if self.chatgpt_model:
            self.config.update(active_provider="openai_chatgpt", model_name=self.chatgpt_model)
        # Modalità "no thinking": disattiva il reasoning sui modelli che lo supportano
        self.disable_thinking = str(self.config.get('disable_thinking', 'false')).lower() == 'true'
        # Override opzionale del budget di ragionamento (es. dal preset del counselor).
        # None = usa il default della famiglia del modello (reasoning_profiles).
        self.reasoning_budget_override = None
        # Temperatura esplicita per questa istanza. None = si lascia decidere al
        # provider, che e' quello che e' sempre successo: nessun percorso mandava
        # `temperature`. Serve a chi deve ottenere lo stesso esito sullo stesso
        # input — un giudice, un parser — non alla conversazione.
        self.temperature = None
        # Piano di reasoning della chiamata corrente: risolto per (provider, model)
        # prima del dispatch. Default neutro (spento) per chiamate dirette/riassunti.
        self._reasoning_plan = DISABLED_PLAN
        self.last_completion = None
        # Budget mensile: se >0 e la spesa del mese corrente lo supera, i modelli
        # a pagamento vengono disattivati e si usa solo Ollama locale (fallback).
        try:
            self.monthly_budget_usd = float(self.config.get('monthly_budget_usd', 0) or 0)
        except (TypeError, ValueError):
            self.monthly_budget_usd = 0.0
        self.budget_fallback_model = (self.config.get('budget_fallback_model') or 'muse-glimmer:30b').strip()
        self._budget_locked_cache = None  # calcolato pigramente una volta per istanza
        # Contesto ampio: con thinking attivo num_predict puo' essere alto e non deve
        # essere strozzato dal contesto (prompt + reasoning + risposta).
        self.ollama_num_ctx = self._int_config('ollama_num_ctx', 16384, 2048, 32768)
        self.ollama_keep_alive = self.config.get('ollama_keep_alive', '5m') or '5m'
        self.ollama_preload_enabled = str(self.config.get('ollama_preload', 'false')).lower() == 'true'
        self.embedding_provider, self.embedding_model, self.embedding_dimensions = embedding_service.options(self.config)
        # Anonimizzazione PII verso provider esterni: sempre attiva (P6, gateway in
        # `_anonymize_external`); `external_pii_redact=false` non la spegne più.
        # `block` = errore se il detector NER non risponde; `send_raw` = invio comunque.
        self.external_pii_fallback = (self.config.get('external_pii_fallback') or 'block').strip().lower()

        # Registro provider: un'unica fonte di verità per dispatch sync/stream.
        # call_max  = default max_tokens per la chiamata bloccante (get_response)
        # stream_max = default max_tokens per lo streaming
        # stream    = None → il provider non ha stream incrementale (chunk unico via call)
        # Aggiungere un provider = una voce qui + la coppia _call_/_stream_.
        self._providers = {
            'openai_chatgpt': {'call': self._call_chatgpt, 'stream': self._stream_chatgpt, 'call_max': None, 'stream_max': None},
            'openai':     {'call': self._call_openai,     'stream': self._stream_openai,     'call_max': None, 'stream_max': None},
            'anthropic':  {'call': self._call_anthropic,  'stream': self._stream_anthropic,  'call_max': 4096, 'stream_max': 4096},
            'openrouter': {'call': self._call_openrouter, 'stream': self._stream_openrouter, 'call_max': None, 'stream_max': None},
            'gemini':     {'call': self._call_gemini,     'stream': None,                    'call_max': None, 'stream_max': None},
            'mistral':    {'call': self._call_mistral,    'stream': None,                    'call_max': None, 'stream_max': None},
            'ollama':     {'call': self._call_ollama,     'stream': self._stream_ollama,     'call_max': 8000, 'stream_max': 4096},
            'llamacpp':   {'call': self._call_llamacpp,   'stream': self._stream_llamacpp,   'call_max': 8000, 'stream_max': None},
        }
        # Provider OpenAI-compatibili (groq/cerebras/deepseek/together/fireworks/deepinfra):
        # stesso path OpenAI, base_url diverso. Bind del nome via partial.
        for _name in OPENAI_COMPAT_PROVIDERS:
            self._providers[_name] = {
                'call':   partial(self._call_openai_compatible, _name),
                'stream': partial(self._stream_openai_compatible, _name),
                'call_max': None, 'stream_max': None,
            }

    def use_personal_connection(self, connection):
        self.personal_target = (connection.provider, connection.model_name)
        self.personal_error = None
        self.chatgpt_model = None
        for provider in API_KEY_ENV_MAP:
            self.config.pop(config_key(provider), None)
        self.config[config_key(connection.provider)] = personal_api.decrypt_key(connection)
        self.config.update(active_provider=connection.provider, model_name=connection.model_name,
                           summary_model_name=connection.model_name)

    def _personal_failure(self, exc):
        if self.shared_owner is not None:
            # Students get a neutral message; the teacher sees the reason on their APIs page.
            from .class_api_sharing import SHARE_ERROR, record_error
            record_error(self.db, self.shared_owner, personal_api.connection_error_code(exc))
            return AIError("Class AI connection failed.", code=SHARE_ERROR)
        return AIError("Personal AI connection failed.", code=personal_api.connection_error_code(exc))

    @staticmethod
    def _usage_to_dict(usage):
        if usage is None:
            return None
        if isinstance(usage, dict):
            return usage
        if hasattr(usage, "model_dump"):
            return usage.model_dump()
        if hasattr(usage, "dict"):
            return usage.dict()
        data = {}
        for key in ("prompt_tokens", "completion_tokens", "completion_tokens_details", "total_tokens", "cost", "cost_usd", "total_cost"):
            if hasattr(usage, key):
                data[key] = getattr(usage, key)
        return data or None

    def _record_completion(self, finish_reason, visible: bool, reasoning: bool, *, interrupted=False):
        """Classify output without storing any extra text or guessing token use."""
        usage = self.last_usage if isinstance(self.last_usage, dict) else {}
        details = usage.get("completion_tokens_details") or {}
        if not isinstance(details, dict):
            details = {"reasoning_tokens": getattr(details, "reasoning_tokens", None)}
        completion_tokens = usage.get("completion_tokens")
        reasoning_tokens = details.get("reasoning_tokens")
        completion_tokens = completion_tokens if type(completion_tokens) is int else None
        reasoning_tokens = reasoning_tokens if type(reasoning_tokens) is int else None
        visible_tokens = (max(0, completion_tokens - reasoning_tokens)
                          if completion_tokens is not None and reasoning_tokens is not None else None)
        finish_reason = finish_reason if isinstance(finish_reason, str) else None
        has_reasoning = reasoning or bool(reasoning_tokens)
        if finish_reason == "length":
            exhausted = not visible and has_reasoning and (visible_tokens is None or visible_tokens <= 1)
            status = "reasoning_exhausted" if exhausted else "length"
        elif interrupted:
            status = "interrupted"
        elif not visible:
            status = "reasoning_only" if has_reasoning else "empty"
        else:
            status = "complete"
        self.last_completion = {
            "status": status, "finish_reason": finish_reason,
            "visible_content": visible, "reasoning_present": has_reasoning,
            "completion_tokens": completion_tokens, "reasoning_tokens": reasoning_tokens,
            "visible_output_tokens": visible_tokens,
        }

    def _attempt_report(self, attempt):
        attempt["reasoning_plan"] = plan_details(self._plan())
        attempt["context_budget"] = getattr(self, "last_context_report", None)
        attempt["completion"] = getattr(self, "last_completion", None)

    def _provider(self, name: str) -> dict:
        """Unknown providers fail explicitly; they must never select a paid service."""
        if name not in self._providers:
            raise AIError(f"Provider sconosciuto: {name}")
        return self._providers[name]

    @staticmethod
    def _normalize_history(history) -> list:
        """Normalizza lo storico role-tagged ({role,content}) in una lista di
        messaggi user/assistant puliti, in ordine cronologico. Torna [] se vuoto
        o malformato. I provider accettano sempre una lista (anche vuota)."""
        if not history:
            return []
        out = []
        for item in history:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role") or "").strip().lower()
            content = str(item.get("content") or "").strip()
            if role in ("user", "assistant") and content:
                out.append({"role": role, "content": content})
        return out

    # Il preset del counselor imposta questi valori dopo la creazione del servizio:
    # il livello scelto per la fonte personale (#202) ha la precedenza.
    @property
    def disable_thinking(self):
        if self._reasoning_effort_override == 'off':
            return True
        if self._reasoning_effort_override == 'deep':
            return False
        if self.personal_reasoning:
            return self.personal_reasoning == 'none'
        return self._disable_thinking

    @disable_thinking.setter
    def disable_thinking(self, value):
        self._disable_thinking = value

    @property
    def reasoning_effort_override(self):
        return self._reasoning_effort_override

    @reasoning_effort_override.setter
    def reasoning_effort_override(self, value):
        self._reasoning_effort_override = value if value in ('off', 'deep') else None

    @property
    def preset_reasoning_effort(self):
        return self._preset_reasoning_effort

    @preset_reasoning_effort.setter
    def preset_reasoning_effort(self, value):
        text = value.strip().lower() if isinstance(value, str) else None
        self._preset_reasoning_effort = text if text in REASONING_EFFORT_VALUES else None

    @property
    def requested_reasoning_effort(self) -> str | None:
        return self._requested_reasoning_effort()

    def _requested_reasoning_effort(self) -> str | None:
        """Effort richiesto, in ordine di precedenza.

        Scelta esplicita dello studente (off/deep) > fonte personale > preset.
        "standard" non è un override: lascia decidere preset e catalogo.
        """
        if self._reasoning_effort_override in ('off', 'deep'):
            return self._reasoning_effort_override
        if self.personal_reasoning:
            return self.personal_reasoning
        return self._preset_reasoning_effort

    @property
    def reasoning_budget_override(self):
        if self._reasoning_effort_override == 'off':
            return 0
        if self._reasoning_effort_override == 'deep':
            return self._reasoning_budget_override or DEEP_REASONING_BUDGET
        if self.personal_reasoning:
            return PERSONAL_REASONING_BUDGETS.get(self.personal_reasoning)
        return self._reasoning_budget_override

    @reasoning_budget_override.setter
    def reasoning_budget_override(self, value):
        self._reasoning_budget_override = value

    def _openai_reasoning_effort(self, model: str | None) -> str | None:
        """Parametro OpenAI per approssimare «Nessuno»/«Esteso».

        OpenAI non espone uno spegnimento totale su o-series/GPT-5: `minimal`
        è il livello più basso. Lo inviamo solo quando la scelta è esplicita,
        per non cambiare il default dei modelli non interessati.
        """
        if not is_reasoning_model(model):
            return None
        effort = self._plan().effort
        if effort:
            if effort == 'none':
                return 'minimal'
            # OpenAI non accetta xhigh/max su tutte le famiglie: high è il
            # livello più alto portabile.
            return effort if effort in ('minimal', 'low', 'medium', 'high') else 'high'
        # Piano non ancora risolto (chiamate dirette): mantieni il contratto
        # storico basato sulla sola scelta esplicita.
        if self._reasoning_effort_override == 'off':
            return 'minimal'
        if self._reasoning_effort_override == 'deep':
            return 'high'
        if self.personal_reasoning == 'none':
            return 'minimal'
        if self.personal_reasoning in ('minimal', 'low', 'medium', 'high'):
            return self.personal_reasoning
        if self.personal_reasoning in ('xhigh', 'max'):
            return 'high'
        return None

    def _chatgpt_effort(self) -> str | None:
        effort = self._plan().effort
        if effort:
            if effort == 'none':
                return 'minimal'
            return effort if effort in ('minimal', 'low', 'medium', 'high') else 'high'
        if self._reasoning_effort_override == 'off':
            return 'minimal'
        if self._reasoning_effort_override == 'deep':
            return 'high'
        return self.personal_reasoning

    def _resolve_reasoning(self, model, requested_max_tokens, fallback_max_tokens,
                           provider: str | None = None) -> ReasoningPlan:
        """Risolve e memorizza il piano di reasoning per (modello, flag, budget).

        Restituisce il piano; `plan.max_tokens` e' il budget di output gia'
        comprensivo dell'headroom per la risposta, da inviare al provider."""
        plan = resolve_plan(
            model,
            disable_thinking=self.disable_thinking,
            requested_max_tokens=requested_max_tokens,
            fallback_max_tokens=fallback_max_tokens,
            budget_override=self.reasoning_budget_override,
            requested_effort=self._requested_reasoning_effort(),
            provider=provider,
        )
        self._reasoning_plan = plan
        return plan

    def _plan(self) -> ReasoningPlan:
        """Piano di reasoning corrente (default neutro se non risolto)."""
        return getattr(self, "_reasoning_plan", None) or DISABLED_PLAN

    @property
    def reasoning_enabled(self) -> bool:
        """True se il piano effettivo consente al modello di ragionare."""
        plan = getattr(self, "_reasoning_plan", None)
        if plan is not None:
            return bool(plan.enabled)
        return not bool(self.disable_thinking)

    @property
    def reasoning_suppressed(self) -> bool:
        """True se gli eventi di reasoning vanno nascosti all'utente."""
        return not self.reasoning_enabled

    def _budget_is_locked(self) -> bool:
        """True se il budget mensile e' impostato (>0) e la spesa del mese
        corrente (tutti i costi) lo ha raggiunto/superato. Cache per-istanza
        (una sola query per richiesta)."""
        if self.monthly_budget_usd <= 0:
            return False
        if self._budget_locked_cache is not None:
            return self._budget_locked_cache
        try:
            month_start = datetime.now(UTC).replace(
                day=1, hour=0, minute=0, second=0, microsecond=0
            )
            # Dispatch can run after the request session has closed. A lazy
            # budget check must release its connection before provider I/O.
            from .database import independent_read_session
            with independent_read_session(self.db) as budget_db:
                spent = budget_db.query(func.coalesce(func.sum(models.Log.cost_usd), 0.0)).filter(
                    models.Log.timestamp >= month_start,
                    models.Log.cost_usd.isnot(None),
                    func.coalesce(models.Log.details["credential_source"].as_string(), "system") != "personal",
                ).scalar() or 0.0
            self._budget_locked_cache = float(spent) >= self.monthly_budget_usd
        except Exception as e:
            logger.warning("Budget unavailable; paid dispatch blocked (%s)", type(e).__name__)
            self._budget_locked_cache = True
        return self._budget_locked_cache

    def _budget_fallback_target(self):
        """(provider, modello) del ripiego quando il budget mensile e' superato.

        Sceglie il primo ripiego configurato su un provider locale o gratuito e
        disponibile. Se non ce n'e' nessuno solleva `AIError` con un codice
        localizzabile: non si torna piu' a Ollama, che su un'installazione
        portabile non esiste."""
        usable = budget_fallback_targets(self.config)
        if usable:
            return usable[0]
        configured = configured_fallback_targets(self.config)
        if not configured:
            raise AIError(BUDGET_FALLBACK_NO_TARGET_MESSAGE, code=BUDGET_FALLBACK_ERROR_CODE)
        providers = ", ".join(sorted({provider for provider, _ in configured}))
        raise AIError(BUDGET_FALLBACK_UNAVAILABLE_MESSAGE.format(providers=providers),
                      code=BUDGET_FALLBACK_ERROR_CODE)

    def _apply_budget_lock(self, provider: str, model: str):
        """Se il budget e' superato, passa al ripiego configurato.
        Lascia invariati i provider gia' gratuiti. Non tocca il benchmark
        (che usa call_model, percorso esplicito dell'admin)."""
        if self.personal_target:
            return self.personal_target
        if not self._free_target(provider, model) and self._budget_is_locked():
            fallback_provider, fallback_model = self._budget_fallback_target()
            logger.info("Budget mensile superato: fallback %s/%s -> %s/%s",
                        provider, model, fallback_provider, fallback_model)
            return fallback_provider, fallback_model
        return provider, model

    def _openrouter_parameter_supported(self, model: str | None, parameter: str) -> bool:
        """True se il catalogo non smentisce un parametro (prudenza se manca)."""
        capability = openrouter_capability(model)
        if capability is None or not capability.supported_parameters:
            return True
        return parameter in capability.supported_parameters

    def _openrouter_reasoning(self, model: str | None = None) -> dict | None:
        """Parametro `reasoning` per OpenRouter dal piano corrente.

        Se il catalogo dichiara gli effort, invia `effort` (e non un budget
        numerico che il provider adattivo potrebbe ignorare). Altrimenti usa il
        contratto storico `enabled`/`max_tokens`. Per un modello che impone il
        reasoning non invia mai una disattivazione: al massimo il livello minimo
        già risolto in `plan.effort`.
        """
        plan = self._plan()
        capability = openrouter_capability(model)
        mandatory = bool(capability and capability.mandatory) or bool(
            model and _is_openrouter_mandatory_reasoning_model(model)
        )
        if plan.effort:
            if plan.effort == "none":
                if mandatory:
                    return None
                return {"enabled": False}
            if capability is not None and capability.supported_efforts:
                return {"effort": plan.effort}
        if not plan.enabled:
            if mandatory:
                return None
            return {"enabled": False}
        reasoning: dict = {"enabled": True}
        if plan.reasoning_budget and (capability is None or capability.supports_max_tokens):
            reasoning["max_tokens"] = int(plan.reasoning_budget)
        return reasoning

    def _anthropic_thinking(self, max_tokens: int | None) -> dict | None:
        """Parametro `thinking` per Anthropic dal piano corrente, o None se spento.

        Anthropic richiede budget_tokens >= 1024 e max_tokens > budget_tokens:
        il budget viene clampato lasciando spazio alla risposta."""
        plan = self._plan()
        if not plan.enabled or not plan.reasoning_budget:
            return None
        budget = int(plan.reasoning_budget)
        if max_tokens:
            budget = min(budget, max(int(max_tokens) - 512, 0))
        if budget < 1024:
            return None
        return {"type": "enabled", "budget_tokens": budget}

    def _int_config(self, key: str, default: int, minimum: int, maximum: int) -> int:
        try:
            value = int(self.config.get(key, default))
        except (TypeError, ValueError):
            value = default
        return max(minimum, min(value, maximum))

    def _apply_no_think(self, system_prompt: str, model: str = "") -> str:
        """Qwen3 soft switch for llama.cpp; other models must not receive it."""
        if (self.reasoning_suppressed and re.search(r"(?:^|[/_-])qwen3(?:[.:-]|$)", model.lower())
                and "/no_think" not in system_prompt):
            return f"{system_prompt}\n\n/no_think"
        return system_prompt

    def _apply_ollama_thinking_directive(self, system_prompt: str) -> str:
        # Ollama separates thinking from content natively. Asking it to print
        # <think> tags again can make models quote/nest tags or repeat a plan in
        # the answer (Nemotron Cascade). Keep the UI contract in the transport.
        directive = (
            "[THINKING] Use only the model's native thinking channel for internal reasoning. "
            "The content channel must contain only the final student-facing answer. "
            "Do not reproduce your reasoning, plans, instructions, thinking tags, or "
            "Reasoning/Answer headings in the content channel."
        )
        system_prompt = re.sub(
            r"\[THINKING\].*?(?=\n\s*\n|\n\[[A-Z_ ]+\]|$)",
            lambda _: directive, system_prompt, flags=re.DOTALL,
        )
        return system_prompt

    def _ollama_base(self) -> str:
        return (self.config.get('ollama_ip') or 'http://localhost:11434').rstrip('/')

    def _privacy_target(self, provider: str, model: str = "") -> Target:
        # Only engines that run the model themselves can be local; any other
        # provider, local proxies included (omniroute), forwards elsewhere.
        url = {
            'ollama': self._ollama_base(),
            'llamacpp': self.config.get('llamacpp_url') or LLAMACPP_DEFAULT_URL,
        }.get(provider, "")
        return Target(provider, model or "", url)

    def _anonymize_external(self, provider: str, user_message: str,
                            system_prompt: str, history: list, *, kind: str = "chat", model: str = ""):
        """Passa l'envelope dal gateway AI (P6, GDPR minimizzazione).

        Ritorna `(user_message, system_prompt, history, prepared)`; il ripristino
        della risposta usa `prepared.restore` / `prepared.stream_restorer`. Gli
        host locali fidati non vengono filtrati; ogni altro provider sì, senza
        opt-out. Un filtro non disponibile o residui PII bloccano la chiamata."""
        history = history or []
        request = AIRequest(kind, self._privacy_target(provider, model), [user_message, system_prompt],
                            attachments_context=[m.get('content', '') for m in history])
        try:
            config = {**self.config, 'external_pii_fallback': getattr(self, 'external_pii_fallback', None)}
            prepared = AIGateway(config).prepare(request, self.privacy_context())
        except PrivacyError:
            raise AIError(
                "Anonimizzazione PII non disponibile (modello locale non raggiungibile o dati "
                "non filtrabili): la richiesta non è stata inviata.",
                code="personalAPI.errors.privacy") from None
        message, system = prepared.request.texts
        filtered = prepared.request.attachments_context
        anon_history = [
            dict(m, content=filtered[i]) if m.get('content') else m
            for i, m in enumerate(history)
        ]
        return message, system, anon_history, prepared

    def privacy_context(self):
        # Instances built without __init__ (tests, tools) act without a subject.
        return context_for(getattr(self, "privacy_username", None))

    def _load_config(self):
        configs = self.db.query(models.Config).all()
        config_dict = {c.key: c.value for c in configs}

        # API keys have a dedicated single-source contract and are never read
        # from the generic Config table.
        for provider, resolved in resolve_api_secrets(self.db).items():
            key = config_key(provider)
            if resolved.value:
                config_dict[key] = resolved.value
            else:
                config_dict.pop(key, None)
        # The optional key of the OpenAI-compatible local server follows the same rule.
        _, llamacpp_key = llamacpp_api_key()
        if llamacpp_key:
            config_dict[LLAMACPP_KEY_CONFIG] = llamacpp_key
        else:
            config_dict.pop(LLAMACPP_KEY_CONFIG, None)

        # Non-secret runtime settings keep their existing environment override.
        for db_key, env_vars in ENV_KEY_MAP.items():
            if db_key.startswith('api_key_'):
                continue
            for env_var in env_vars:
                env_value = os.environ.get(env_var)
                if env_value:
                    config_dict[db_key] = env_value
                    break

        return config_dict

    def _get_api_key(self, provider_key):
        return self.config.get(provider_key)

    def list_models(self, provider: str = None):
        """Elenca i modelli realmente serviti dal provider (endpoint OpenAI-compatibile /v1/models).
        Ritorna una lista di id stringa, vuota se il provider non è interrogabile o è irraggiungibile."""
        provider = provider or self.config.get('active_provider', 'openai')
        timeout = httpx.Timeout(15.0, connect=5.0)
        try:
            if provider == 'gemini':
                api_key = self._get_api_key('api_key_gemini')
                if not api_key:
                    return []
                from google import genai
                client = genai.Client(api_key=api_key)
                names = []
                for m in client.models.list():
                    actions = getattr(m, 'supported_actions', None) or []
                    if 'generateContent' in actions:
                        names.append((m.name or '').removeprefix('models/'))
                return sorted(n for n in names if n)
            if provider == 'mistral':
                api_key = self._get_api_key('api_key_mistral')
                if not api_key:
                    return []
                # Mistral lists embedding, OCR and moderation models too: keep the chat ones.
                listed = Mistral(api_key=api_key).models.list().data or []
                return sorted({m.id for m in listed
                               if m.id and getattr(getattr(m, 'capabilities', None), 'completion_chat', False)})
            if provider == 'anthropic':
                api_key = self._get_api_key('api_key_anthropic')
                if not api_key:
                    return []
                return sorted(m.id for m in anthropic.Anthropic(api_key=api_key, timeout=15).models.list(limit=100).data)
            if provider == 'openai':
                client = OpenAI(api_key=self._get_api_key('api_key_openai'), timeout=timeout)
            elif provider == 'openrouter':
                client = OpenAI(base_url="https://openrouter.ai/api/v1",
                                api_key=self._get_api_key('api_key_openrouter'), timeout=timeout)
            elif provider == 'ollama':
                base = (self._get_api_key('ollama_ip') or "http://localhost:11434").rstrip('/')
                client = OpenAI(base_url=f"{base}/v1", api_key="ollama", timeout=timeout)
            elif provider == 'llamacpp':
                client = self._llamacpp_client(timeout)
            elif provider in OPENAI_COMPAT_PROVIDERS:
                client = self._openai_compatible_client(provider, timeout=timeout)
            else:
                return []
            return sorted({m.id for m in client.models.list().data if _chat_model(m.id)})
        except Exception as e:
            logger.warning(f"list_models fallito per {provider}: {e}")
            return []

    def verify_api_key(self, provider: str) -> bool:
        """Perform an authenticated, read-only provider request."""
        api_key = self._get_api_key(f"api_key_{provider}")
        if not api_key:
            return False
        timeout = httpx.Timeout(15.0, connect=5.0)
        try:
            if provider == "anthropic":
                anthropic.Anthropic(api_key=api_key, timeout=15).models.list(limit=1)
            elif provider == "gemini":
                from google import genai
                client = genai.Client(api_key=api_key)
                next(iter(client.models.list()), None)
            elif provider == "mistral":
                Mistral(api_key=api_key).models.list()
            else:
                base_url = None
                if provider == "openrouter":
                    base_url = "https://openrouter.ai/api/v1"
                elif provider in OPENAI_COMPAT_PROVIDERS:
                    base_url = OPENAI_COMPAT_PROVIDERS[provider]
                    if provider == "omniroute":
                        base_url = self.config.get("omniroute_url") or base_url
                kwargs = {"base_url": base_url} if base_url else {}
                client = OpenAI(api_key=api_key, timeout=timeout, **kwargs)
                client.models.list()
            return True
        except Exception as exc:
            logger.warning("Verifica chiave API fallita per %s (%s)", provider, type(exc).__name__)
            return False

    def get_response(
        self,
        user_message: str,
        system_prompt: str,
        mode: str,
        conversation_summary: str = "",
        max_tokens: int = None,
        provider: str = None,
        model: str = None,
        history: list = None,
        json_mode: bool | None = None,
    ):
        """
        Genera una risposta LLM.  Se conversation_summary è fornito, viene
        iniettato come contesto all'inizio del messaggio utente.
        `history` (opzionale): storico role-tagged [{role,content}] dei turni
        precedenti, iniettato come messaggi nativi ⟨user,assistant⟩ prima del
        messaggio utente corrente. `provider`/`model` opzionali come sopra.
        """
        if conversation_summary:
            user_message = f"CONTEXT OF PREVIOUS CONVERSATIONS:\n{conversation_summary}\n\n{user_message}"
        return self._response_with_fallback(
            user_message, system_prompt, provider, model, max_tokens, history, json_mode,
        )

    def _selected_target(self, provider, model):
        if self.personal_error:
            raise AIError(self.personal_error, code=self.personal_error_code)
        if self.chatgpt_model:
            return "openai_chatgpt", self.chatgpt_model
        if self.personal_target:
            return self.personal_target
        chosen = provider or self.config.get("active_provider", "openai")
        if model:
            return chosen, model
        if provider and chosen != self.config.get("active_provider"):
            selected = self.config.get(f"model_name_{chosen}")
            defaults = {"openrouter": "openrouter/free", "omniroute": "auto/best-chat",
                        "ollama": self.budget_fallback_model, "llamacpp": "default"}
            selected = selected or defaults.get(chosen)
            if not selected:
                raise AIError(f"Seleziona un modello per {chosen}")
            return chosen, selected
        return chosen, self.config.get("model_name", "gpt-4o")

    @staticmethod
    def _free_target(provider, model):
        return is_free_target(provider, model)

    def _targets(self, provider, model):
        primary = self._selected_target(provider, model)
        if self.personal_target or primary[0] == "openai_chatgpt":
            return [primary]
        primary = self._apply_budget_lock(*primary)
        raw = self.config.get("ai_fallback_targets", "[]")
        configured = json.loads(raw) if isinstance(raw, str) else raw
        targets = [primary]
        for target in configured or []:
            candidate = (target["provider"], target["model"])
            self._provider(candidate[0])
            if candidate not in targets:
                # A gateway's name does not prove that its upstream is free.
                if not self._free_target(*candidate) and self._budget_is_locked():
                    continue
                targets.append(candidate)
        return targets[:4]

    def _attempt_input(self, provider, model, message, system, history, max_tokens, streaming):
        self.last_usage = None
        self.last_thinking = None
        self.last_completion = None
        self.last_context_report = None
        self.last_envelope = None
        self._reasoning_plan = DISABLED_PLAN
        self.last_provider, self.last_model = provider, model
        entry = self._provider(provider)
        plan = self._resolve_reasoning(model, requested_max_tokens=max_tokens,
                                       fallback_max_tokens=entry['stream_max' if streaming else 'call_max'],
                                       provider=provider)
        validate_output_capacity(plan)
        profile = context_profile(self.config, provider, model)
        system, message, history, self.last_context_report = fit_context(
            system, message, self._normalize_history(history), profile, plan.max_tokens,
            context_data=self.context_data,
        )
        self.last_envelope = {"system_prompt_final": system, "full_message": message, "history": history}
        # A local-to-cloud fallback crosses the privacy boundary too.
        message, system, history, prepared = self._anonymize_external(
            provider, message, system, history, kind="chat_stream" if streaming else "chat", model=model)
        self.last_usage = None
        self.last_thinking = None
        self.last_provider, self.last_model = provider, model
        return entry, plan.max_tokens, message, system, history, prepared

    def _response_with_fallback(self, message, system, provider, model, max_tokens, history, json_mode):
        self.last_attempts = []
        last_error = None
        for selected_provider, selected_model in self._targets(provider, model):
            attempt = {"provider": selected_provider, "model": selected_model, "status": "failed"}
            self.last_attempts.append(attempt)
            try:
                entry, mt, msg, sys, hist, prepared = self._attempt_input(
                    selected_provider, selected_model, message, system, history, max_tokens, False)
                kwargs = {"max_tokens": mt, "history": hist}
                if selected_provider == "ollama":
                    kwargs["json_mode"] = json_mode
                result = entry['call'](msg, sys, selected_model, **kwargs)
                if result:
                    from .chat_logic import split_thinking
                    extracted, result = split_thinking(result)
                    if extracted and self.reasoning_enabled:
                        self.last_thinking = extracted
                if self.last_completion is None:
                    self._record_completion(None, bool(result and result.strip()), bool(self.last_thinking))
                if not result or not result.strip():
                    raise AIError("Il modello ha restituito una risposta vuota")
                attempt["status"] = "succeeded"
                self._attempt_report(attempt)
                return prepared.restore(result)
            except Exception as exc:
                last_error = exc
                # Log classifications only; upstream errors can contain request data.
                attempt["error_type"] = type(exc).__name__
                self._attempt_report(attempt)
                logger.warning("AI attempt %s/%s failed (%s)", selected_provider, selected_model, type(exc).__name__)
        if self.chatgpt_model and isinstance(last_error, AIError):
            raise last_error
        if self.personal_target:
            raise self._personal_failure(last_error) from None
        if isinstance(last_error, ContextCapacityError):
            raise AIError(str(last_error)) from last_error
        raise AIError(f"Nessun modello configurato ha completato la risposta ({type(last_error).__name__}).") from last_error

    def call_model(self, provider: str, model: str, user_message: str, system_prompt: str, max_tokens: int = None):
        """Chiamata bloccante a un (provider, model) ESPLICITO, bypassando la
        config attiva. La scelta personale esplicita precede anche i modelli
        ausiliari. Il benchmark senza identita' personale resta esplicito.
        Popola self.last_usage (token/costo) quando il provider lo fornisce."""
        if self.personal_error:
            raise AIError(self.personal_error, code=self.personal_error_code)
        if self.chatgpt_model:
            provider, model = "openai_chatgpt", self.chatgpt_model
        elif self.personal_target:
            provider, model = self.personal_target
        self.last_provider, self.last_model = provider, model
        attempt = {"provider": provider, "model": model, "status": "failed"}
        self.last_attempts = [attempt]
        try:
            entry, mt, user_message, system_prompt, _history, prepared = self._attempt_input(
                provider, model, user_message, system_prompt, None, max_tokens, False)
            result = entry['call'](user_message, system_prompt, model, max_tokens=mt)
            if result:
                from .chat_logic import split_thinking
                _extracted, result = split_thinking(result)
                if _extracted and self.reasoning_enabled:
                    self.last_thinking = _extracted
            if self.last_completion is None:
                self._record_completion(None, bool(result and result.strip()), bool(self.last_thinking))
            if not result or not result.strip():
                raise AIError("Il modello ha restituito una risposta vuota")
            attempt["status"] = "succeeded"
            self._attempt_report(attempt)
            return prepared.restore(result)
        except AIError as exc:
            attempt["error_type"] = type(exc).__name__
            self._attempt_report(attempt)
            raise
        except Exception as e:
            attempt["error_type"] = type(e).__name__
            self._attempt_report(attempt)
            logger.error("Errore call_model (%s/%s): %s", provider, model, type(e).__name__)
            if self.personal_target:
                raise self._personal_failure(e) from None
            if isinstance(e, ContextCapacityError):
                raise AIError(str(e)) from e
            raise AIError(f"Errore AI ({provider}/{model}): {type(e).__name__}") from e

    def call_vision(self, prompt: str, image_base64: str, *, provider: str | None = None,
                    model: str | None = None, timeout: int | None = None) -> str:
        """OCR di una pagina con il provider di visione configurato.

        I ripieghi QSA/pQBL passano da qui. Immagini esterne bloccate prima
        anche del detector: redigere il prompt non redige la scansione.
        Errori classificati e localizzati dai chiamanti; prompt e immagine
        passano dal gateway AI dentro `vision_service.call`."""
        if self.personal_error:
            raise AIError(self.personal_error, code=self.personal_error_code)
        resolved_provider, resolved_model = vision_service.resolve(self.config, provider, model)
        vision_service.require_local_target(self.config, resolved_provider)
        self.last_provider, self.last_model = resolved_provider, resolved_model
        return vision_service.call(
            self.config, self.db, resolved_provider, resolved_model, prompt,
            image_base64, timeout=timeout, ctx=self.privacy_context())

    # Token massimi per i riassunti (~80 parole → 120 token sono sufficienti)
    SUMMARY_MAX_TOKENS = 300

    def generate_summary(self, user_message: str, bot_response: str, step_label: str = "", previous_summary: str = "") -> str:
        """
        Genera un riassunto rotante aggiornato della sessione.
        Incorpora il riassunto precedente + l'ultima interazione → produce un unico testo ≤80 parole
        che SOSTITUISCE il vecchio riassunto (non si accumula).
        """
        provider = self.config.get('active_provider', 'openai')
        model_name = self.config.get('model_name', 'gpt-4o')

        # Per i riassunti usa un modello più leggero/veloce se configurato
        summary_model = self.config.get('summary_model_name', '') or model_name
        logger.info(f"generate_summary: provider={provider} model={summary_model}")

        prefix = f"[{step_label}] " if step_label else ""
        trunc_user = user_message[:1000]
        trunc_bot = bot_response[:1500]

        if previous_summary:
            user_msg = (
                f"RIASSUNTO PRECEDENTE DELLA SESSIONE:\n{previous_summary}\n\n"
                f"ULTIMA INTERAZIONE {prefix}:\n"
                f"UTENTE:\n{trunc_user}\n\n"
                f"ASSISTENTE:\n{trunc_bot}\n\n"
                f"Aggiorna il riassunto incorporando l'ultima interazione. Massimo 80 parole totali."
            )
        else:
            user_msg = (
                f"{prefix}Riassumi questa prima interazione:\n\n"
                f"UTENTE:\n{trunc_user}\n\n"
                f"ASSISTENTE:\n{trunc_bot}"
            )

        mt = self.SUMMARY_MAX_TOKENS
        # Il riassunto e' un task breve: niente reasoning (consumerebbe il budget).
        self._reasoning_plan = DISABLED_PLAN
        provider, summary_model = self._apply_budget_lock(provider, summary_model)
        # Anonimizza il testo verso provider esterni (il riassunto resta con i
        # placeholder: e' testo interno, mai mostrato allo studente).
        user_msg, _sp, _h, _prepared = self._anonymize_external(
            provider, user_msg, SUMMARY_SYSTEM_PROMPT, None, kind="summary", model=summary_model)
        try:
            return self._provider(provider)['call'](user_msg, SUMMARY_SYSTEM_PROMPT, summary_model, max_tokens=mt)
        except Exception as e:
            logger.error("Errore nella generazione del riassunto (%s)", type(e).__name__)
            # Fallback: troncamento semplice
            truncated = bot_response[:300].rsplit(' ', 1)[0]
            return f"{prefix}{truncated}..."

    def _call_openai(self, user_message, system_prompt, model, max_tokens: int = None, history=None):
        api_key = self._get_api_key('api_key_openai')
        if not api_key: raise AIError("OpenAI API Key non configurata")

        client = OpenAI(api_key=api_key, timeout=self._int_config("ai_timeout_seconds", 120, 10, 600), max_retries=0)
        nak = self._normalize_history(history)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(nak)
        messages.append({"role": "user", "content": user_message})
        kwargs = dict(
            model=model,
            messages=messages,
        )
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        if self.temperature is not None:
            kwargs["temperature"] = self.temperature
        reasoning_effort = self._openai_reasoning_effort(model)
        if reasoning_effort:
            kwargs["reasoning_effort"] = reasoning_effort
        response = client.chat.completions.create(**kwargs)
        return response.choices[0].message.content

    def _call_openrouter(self, user_message, system_prompt, model, max_tokens: int = None, history=None):
        api_key = self._get_api_key('api_key_openrouter')
        if not api_key: raise AIError("OpenRouter API Key non configurata")

        # OpenRouter uses OpenAI Client structure with base_url
        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            timeout=self._int_config("ai_timeout_seconds", 120, 10, 600),
            max_retries=0,
        )
        nak = self._normalize_history(history)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(nak)
        messages.append({"role": "user", "content": user_message})
        kwargs = dict(
            model=model,
            messages=messages,
        )
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        if self.temperature is not None and self._openrouter_parameter_supported(model, "temperature"):
            kwargs["temperature"] = self.temperature
        reasoning_extra = self._openrouter_reasoning(model)
        if reasoning_extra:
            kwargs["extra_body"] = {"reasoning": reasoning_extra}
        try:
            response = client.chat.completions.create(**kwargs)
        except Exception as exc:
            if "extra_body" in kwargs and _is_openrouter_reasoning_error(exc):
                _mark_openrouter_mandatory_reasoning(model)
                logger.info(
                    "OpenRouter model '%s' non accetta la disattivazione del reasoning (%s); riprovo senza extra_body",
                    model, exc,
                )
                kwargs.pop("extra_body", None)
                response = client.chat.completions.create(**kwargs)
            else:
                raise
        self.last_usage = self._usage_to_dict(getattr(response, "usage", None))
        if isinstance(getattr(response, "model", None), str):
            self.last_model = response.model
        choice = response.choices[0]
        content = choice.message.content
        reasoning = getattr(choice.message, "reasoning", None) or getattr(choice.message, "reasoning_content", None)
        from .chat_logic import split_thinking
        inline_reasoning, visible_content = split_thinking(content or "")
        if not isinstance(reasoning, str):
            reasoning = inline_reasoning
        elif inline_reasoning:
            reasoning += inline_reasoning
        self.last_thinking = reasoning if isinstance(reasoning, str) and self.reasoning_enabled else None
        self._record_completion(getattr(choice, "finish_reason", None), bool(visible_content.strip()),
                                isinstance(reasoning, str) and bool(reasoning))
        if self.last_completion["finish_reason"] == "length":
            raise AIError("The model reached its output token limit before completing the response.")
        return content

    def _llamacpp_client(self, timeout):
        """Server locale / compatibile OpenAI (llama.cpp, LM Studio, vLLM, LiteLLM) su /v1."""
        # Senza chiave configurata il client ne vuole comunque una: i server locali la ignorano.
        api_key = self._get_api_key(LLAMACPP_KEY_CONFIG) or "llamacpp"
        return OpenAI(base_url=openai_base(self._get_api_key('llamacpp_url') or LLAMACPP_DEFAULT_URL),
                      api_key=api_key, timeout=timeout)

    def _openai_compatible_client(self, provider: str, timeout=None):
        """Client OpenAI puntato a un provider OpenAI-compatibile (base_url + chiave)."""
        api_key = self._get_api_key(f'api_key_{provider}')
        base_url = OPENAI_COMPAT_PROVIDERS[provider]
        if provider == "omniroute":
            base_url = self.config.get("omniroute_url") or base_url
            api_key = api_key or "omniroute"
        if not api_key:
            raise AIError(f"{provider} API Key non configurata")
        timeout = timeout or self._int_config("ai_timeout_seconds", 120, 10, 600)
        return OpenAI(base_url=base_url, api_key=api_key, timeout=timeout, max_retries=0)

    def _call_openai_compatible(self, provider, user_message, system_prompt, model, max_tokens: int = None, history=None):
        client = self._openai_compatible_client(provider)
        nak = self._normalize_history(history)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(nak)
        messages.append({"role": "user", "content": user_message})
        kwargs = dict(
            model=model,
            messages=messages,
        )
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        if self.temperature is not None:
            kwargs["temperature"] = self.temperature
        if provider == "deepseek" and _requests_json_response(system_prompt, user_message):
            # Structured extraction needs content, not a long reasoning trace
            # that may consume the output budget before any JSON is returned.
            kwargs["response_format"] = {"type": "json_object"}
            kwargs["extra_body"] = {"thinking": {"type": "disabled"}}
        response = client.chat.completions.create(**kwargs)
        self.last_usage = self._usage_to_dict(getattr(response, "usage", None))
        if isinstance(getattr(response, "model", None), str):
            self.last_model = response.model
        return response.choices[0].message.content

    def _call_anthropic(self, user_message, system_prompt, model, max_tokens: int = 4096, history=None):
        api_key = self._get_api_key('api_key_anthropic')
        if not api_key: raise AIError("Anthropic API Key non configurata")

        client = anthropic.Anthropic(api_key=api_key, timeout=self._int_config("ai_timeout_seconds", 120, 10, 600), max_retries=0)
        nak = self._normalize_history(history)
        messages = list(nak)
        messages.append({"role": "user", "content": user_message})
        kwargs = dict(
            model=model,
            system=system_prompt,
            messages=messages,
            max_tokens=max_tokens,
        )
        thinking = self._anthropic_thinking(max_tokens)
        if thinking:
            kwargs["thinking"] = thinking
        response = client.messages.create(**kwargs)
        # Con il thinking attivo il primo blocco e' di tipo "thinking": prendi il testo.
        for block in response.content:
            if getattr(block, "type", None) == "text" and getattr(block, "text", None):
                return block.text
        return getattr(response.content[0], "text", "")

    def _call_gemini(self, user_message, system_prompt, model, max_tokens: int = None, history=None):
        api_key = self._get_api_key('api_key_gemini')
        if not api_key: raise AIError("Gemini API Key non configurata")

        # SDK google-genai: client per-istanza (niente stato globale come la vecchia
        # genai.configure), timeout in millisecondi via HttpOptions.
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=self._int_config("ai_timeout_seconds", 120, 10, 600) * 1000))
        contents = [types.Content(
            role="user" if turn["role"] == "user" else "model",
            parts=[types.Part.from_text(text=turn["content"])],
        ) for turn in self._normalize_history(history)]
        contents.append(types.Content(role="user", parts=[types.Part.from_text(text=user_message)]))
        # I modelli gemini 2.5/3 "thinking" consumano il budget di output sul
        # ragionamento: con max_tokens piccoli response.text torna vuoto. Se il
        # no-thinking è attivo azzera il budget di reasoning (thinking_budget=0).
        config_kwargs = {"system_instruction": system_prompt}
        if max_tokens:
            config_kwargs["max_output_tokens"] = max_tokens
        # thinking_budget bounded dal piano: spento -> 0; attivo -> cap esplicito
        # (max_output_tokens include gia' l'headroom per la risposta).
        plan = self._plan()
        if not plan.enabled:
            config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
        elif plan.reasoning_budget:
            config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=int(plan.reasoning_budget))
        config = types.GenerateContentConfig(**config_kwargs) if config_kwargs else None
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=config,
        )
        text = response.text
        if not text:
            # Risposta vuota: tipicamente il budget è stato esaurito dal reasoning.
            raise AIError(
                "Gemini ha restituito una risposta vuota "
                "(possibile modello ritirato o budget token esaurito dal reasoning)."
            )
        return text

    def _call_mistral(self, user_message, system_prompt, model, max_tokens: int = None, history=None):
        api_key = self._get_api_key('api_key_mistral')
        if not api_key: raise AIError("Mistral API Key non configurata")

        client = Mistral(api_key=api_key)
        nak = self._normalize_history(history)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(nak)
        messages.append({"role": "user", "content": user_message})
        kwargs = dict(model=model, messages=messages)
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        response = client.chat.complete(**kwargs)
        return response.choices[0].message.content

    def _call_ollama(self, user_message, system_prompt, model, max_tokens: int = 8000, history=None, json_mode: bool | None = None):
        base_url = (self._get_api_key('ollama_ip') or "http://localhost:11434").rstrip('/')
        system_prompt = self._apply_ollama_thinking_directive(system_prompt)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(self._normalize_history(history))
        messages.append({"role": "user", "content": user_message})
        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
            "keep_alive": self.ollama_keep_alive,
            "options": {
                "num_ctx": context_profile(self.config, "ollama", model).get("context_tokens") or self.ollama_num_ctx,
                "num_predict": max_tokens,
            },
        }
        if self.temperature is not None:
            payload["options"]["temperature"] = self.temperature
        # Estrazione JSON (parser QSA): mai reasoning, altrimenti il `think` puo'
        # rompere/rallentare l'output strutturato. Forza think off a prescindere.
        is_json = json_mode if json_mode is not None else _requests_json_response(system_prompt, user_message)
        if self.reasoning_suppressed or is_json:
            payload["think"] = False
        else:
            payload["think"] = self._plan().enabled
        if is_json:
            payload["format"] = "json"
        response = httpx.post(
            f"{base_url}/api/chat",
            json=payload,
            timeout=httpx.Timeout(self._int_config("ai_timeout_seconds", 120, 10, 600), connect=10.0),
        )
        response.raise_for_status()
        message = response.json().get("message", {}) or {}
        # Confina il «sto pensando»: preferisci il campo nativo `thinking`; se assente
        # estrai eventuali tag <think> inlineati nel contenuto (fallback model-agnostico).
        from .chat_logic import split_thinking
        extracted, content = split_thinking(message.get("content", "") or "")
        thinking = "\n\n".join(part for part in (message.get("thinking"), extracted) if part)
        self.last_thinking = None if self.disable_thinking else ((thinking or "").strip() or None)
        return content

    def _call_llamacpp(self, user_message, system_prompt, model, max_tokens: int = 8000, history=None):
        """llama.cpp / llama-server / llama-swap: endpoint OpenAI-compatibile su /v1."""
        client = self._llamacpp_client(httpx.Timeout(self._int_config("ai_timeout_seconds", 120, 10, 600), connect=10.0))
        system_prompt = self._apply_no_think(system_prompt, model or "")
        nak = self._normalize_history(history)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(nak)
        messages.append({"role": "user", "content": user_message})
        kwargs = dict(
            model=model or "default",
            messages=messages,
        )
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        response = client.chat.completions.create(**kwargs)
        return response.choices[0].message.content

    # ---------------------------------------------------------------------
    # Streaming
    # ---------------------------------------------------------------------
    def stream_response(
        self,
        user_message: str,
        system_prompt: str,
        mode: str,
        conversation_summary: str = "",
        max_tokens: int = None,
        provider: str = None,
        model: str = None,
        history: list = None,
    ):
        """
        Generatore che produce la risposta LLM a pezzi (token/delta).
        Stream incrementale per i provider OpenAI-compatibili e Anthropic;
        per gli altri produce la risposta completa in un unico chunk.
        `history` (opzionale): storico role-tagged iniettato come messaggi nativi.
        `provider`/`model` opzionali: forzano provider+modello (counselor via preset).
        """
        if conversation_summary:
            user_message = f"CONTEXT OF PREVIOUS CONVERSATIONS:\n{conversation_summary}\n\n{user_message}"
        self.last_attempts = []
        last_error = None
        for selected_provider, selected_model in self._targets(provider, model):
            content_seen = False
            reasoning_seen = False
            buffered_content = []
            attempt = {"provider": selected_provider, "model": selected_model, "status": "failed"}
            self.last_attempts.append(attempt)
            try:
                entry, mt, msg, sys, hist, prepared = self._attempt_input(
                    selected_provider, selected_model, user_message, system_prompt, history, max_tokens, True)
                restorer = prepared.stream_restorer()
                suppress_reasoning = self.reasoning_suppressed
                if entry['stream']:
                    output = entry['stream'](msg, sys, selected_model, max_tokens=mt, history=hist)
                else:
                    output = [entry['call'](msg, sys, selected_model, max_tokens=mt, history=hist)]
                for item in output:
                    if not item:
                        continue
                    item = item if isinstance(item, dict) else {"type": "content", "text": item}
                    if item.get("text"):
                        reasoning_seen = reasoning_seen or item.get("type") == "reasoning"
                        if restorer and item.get("type") == "content":
                            item = {**item, "text": restorer.feed(item["text"])}
                        else:
                            item = {**item, "text": prepared.restore(item["text"])}
                    if suppress_reasoning and item.get("type") == "reasoning":
                        continue
                    if item.get("type") == "content":
                        if suppress_reasoning:
                            buffered_content.append(item.get("text", ""))
                            continue
                        content_seen = content_seen or bool(item.get("text", "").strip())
                    yield item
                if restorer:
                    tail = restorer.flush()
                    if tail:
                        if suppress_reasoning:
                            buffered_content.append(tail)
                        else:
                            content_seen = content_seen or bool(tail.strip())
                            yield {"type": "content", "text": tail}
                if suppress_reasoning:
                    from .chat_logic import strip_thinking
                    visible = strip_thinking("".join(buffered_content))
                    content_seen = bool(visible.strip())
                    if content_seen:
                        yield {"type": "content", "text": visible}
                if self.last_completion is None:
                    self._record_completion(None, content_seen, reasoning_seen or bool(self.last_thinking))
                if not content_seen:
                    raise AIError("Il modello ha terminato senza contenuto")
                attempt["status"] = "succeeded"
                self._attempt_report(attempt)
                return
            except Exception as exc:
                last_error = exc
                attempt["error_type"] = type(exc).__name__
                self._attempt_report(attempt)
                if self.personal_target:
                    raise self._personal_failure(exc) from None
                if self.chatgpt_model and isinstance(exc, AIError):
                    raise exc
                # Solo il contenuto gia' arrivato allo studente impedisce il
                # ripiego. Il ragionamento viaggia su un canale separato, non
                # entra nella risposta e non viene salvato: un modello che ha
                # prodotto solo <think> e poi e' morto puo' essere sostituito
                # dalla riserva senza duplicare nulla di visibile.
                if content_seen:
                    raise AIError("La risposta e stata interrotta dal modello; riprova il turno.") from exc
                logger.warning("AI stream %s/%s failed before output (%s)", selected_provider, selected_model, type(exc).__name__)
        if isinstance(last_error, ContextCapacityError):
            raise AIError(str(last_error)) from last_error
        raise AIError(f"Nessun modello configurato ha completato la risposta ({type(last_error).__name__}).") from last_error

    def _iter_chat_stream(self, client, model, system_prompt, user_message, extra_body=None, max_tokens: int = None, stream_options=None, history=None, reasoning_effort=None, include_temperature=True):
        """Itera lo stream di un client OpenAI-compatibile producendo i delta di testo."""
        nak = self._normalize_history(history)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(nak)
        messages.append({"role": "user", "content": user_message})
        kwargs = dict(
            model=model,
            messages=messages,
            stream=True,
        )
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        if self.temperature is not None and include_temperature:
            kwargs["temperature"] = self.temperature
        if extra_body:
            kwargs["extra_body"] = extra_body
        if stream_options:
            kwargs["stream_options"] = stream_options
        if reasoning_effort:
            kwargs["reasoning_effort"] = reasoning_effort
        stream = client.chat.completions.create(**kwargs)
        finish_reason = None
        reasoning_acc: list[str] = []
        visible = False
        stream_ended = False
        from .chat_logic import ThinkStreamSplitter
        splitter = ThinkStreamSplitter()
        try:
            for chunk in stream:
                if isinstance(getattr(chunk, "model", None), str):
                    self.last_model = chunk.model
                usage = getattr(chunk, "usage", None)
                if usage is not None:
                    usage_dict = self._usage_to_dict(usage)
                    self.last_usage = usage_dict
                    yield {"type": "usage", "usage": usage_dict}
                try:
                    delta = chunk.choices[0].delta
                    finish_reason = getattr(chunk.choices[0], "finish_reason", None) or finish_reason
                except (IndexError, AttributeError):
                    continue
                # Reasoning / thinking: OpenRouter usa `reasoning`, altri `reasoning_content`.
                reasoning = getattr(delta, "reasoning", None) or getattr(delta, "reasoning_content", None)
                if isinstance(reasoning, str) and reasoning:
                    reasoning_acc.append(reasoning)
                    if not self.reasoning_suppressed:
                        yield {"type": "reasoning", "text": reasoning}
                content = getattr(delta, "content", None)
                if content:
                    for item in splitter.feed(content):
                        if item.get("type") == "reasoning":
                            reasoning_acc.append(item.get("text", ""))
                            if self.reasoning_suppressed:
                                continue
                        elif item.get("type") == "content" and item.get("text", "").strip():
                            visible = True
                        yield item
            for item in splitter.flush():
                if item.get("type") == "reasoning":
                    reasoning_acc.append(item.get("text", ""))
                    if self.reasoning_suppressed:
                        continue
                elif item.get("type") == "content" and item.get("text", "").strip():
                    visible = True
                yield item
            stream_ended = True
        finally:
            self.last_thinking = "".join(reasoning_acc).strip() or None
            self._record_completion(finish_reason, visible, bool(reasoning_acc), interrupted=not stream_ended)
            close = getattr(stream, "close", None)
            if close:
                close()
        if finish_reason == "length":
            raise AIError("The model reached its output token limit before completing the response.")

    def _stream_chatgpt(self, user_message, system_prompt, model, max_tokens=None, history=None):
        from .chatgpt_connections import ChatGPTError
        from .chatgpt_i18n import error_message
        from .chatgpt_responses import stream
        try:
            for item in stream(self.db, model, user_message, system_prompt, self._normalize_history(history),
                               timeout=self._int_config("ai_timeout_seconds", 120, 10, 600), effort=self._chatgpt_effort()):
                if isinstance(item, dict) and item.get("type") == "usage":
                    self.last_usage = item["usage"]
                yield item
        except ChatGPTError as exc:
            language = getattr(self.db, "info", {}).get("chatgpt_language", "it")
            raise AIError(error_message(exc.code, language)) from None

    def _call_chatgpt(self, user_message, system_prompt, model, max_tokens=None, history=None):
        return "".join(item for item in self._stream_chatgpt(user_message, system_prompt, model, history=history)
                       if isinstance(item, str))

    def _stream_openai(self, user_message, system_prompt, model, max_tokens: int = None, history=None):
        api_key = self._get_api_key('api_key_openai')
        if not api_key:
            raise AIError("OpenAI API Key non configurata")
        client = OpenAI(api_key=api_key, timeout=self._int_config("ai_timeout_seconds", 120, 10, 600), max_retries=0)
        yield from self._iter_chat_stream(
            client, model, system_prompt, user_message, max_tokens=max_tokens, history=history,
            reasoning_effort=self._openai_reasoning_effort(model),
        )

    def _stream_openrouter(self, user_message, system_prompt, model, max_tokens: int = None, history=None):
        api_key = self._get_api_key('api_key_openrouter')
        if not api_key:
            raise AIError("OpenRouter API Key non configurata")
        client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key, timeout=self._int_config("ai_timeout_seconds", 120, 10, 600), max_retries=0)
        # Reasoning bounded: budget separato dai metadati, l'headroom della
        # risposta e' gia' incluso in max_tokens (vedi reasoning_profiles).
        reasoning_extra = self._openrouter_reasoning(model)
        extra = {"reasoning": reasoning_extra} if reasoning_extra else None
        try:
            yield from self._iter_chat_stream(
                client,
                model,
                system_prompt,
                user_message,
                extra_body=extra,
                max_tokens=max_tokens,
                stream_options={"include_usage": True},
                history=history,
                include_temperature=self._openrouter_parameter_supported(model, "temperature"),
            )
        except Exception as exc:
            if extra and _is_openrouter_reasoning_error(exc):
                _mark_openrouter_mandatory_reasoning(model)
                logger.info(
                    "OpenRouter model '%s' non accetta la disattivazione del reasoning (%s); riprovo stream senza extra_body",
                    model, exc,
                )
                yield from self._iter_chat_stream(
                    client,
                    model,
                    system_prompt,
                    user_message,
                    extra_body=None,
                    max_tokens=max_tokens,
                    stream_options={"include_usage": True},
                    history=history,
                    include_temperature=self._openrouter_parameter_supported(model, "temperature"),
                )
            else:
                raise

    def _stream_ollama(self, user_message, system_prompt, model, max_tokens: int = None, history=None):
        base_url = (self._get_api_key('ollama_ip') or "http://localhost:11434").rstrip('/')
        system_prompt = self._apply_ollama_thinking_directive(system_prompt)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(self._normalize_history(history))
        messages.append({"role": "user", "content": user_message})
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "keep_alive": self.ollama_keep_alive,
            "options": {
                "num_ctx": context_profile(self.config, "ollama", model).get("context_tokens") or self.ollama_num_ctx,
                "num_predict": max_tokens or 4096,
            },
        }
        is_json = _requests_json_response(system_prompt, user_message)
        if is_json:
            payload["think"] = False
            payload["format"] = "json"
        else:
            payload["think"] = self.reasoning_enabled
        from .chat_logic import ThinkStreamSplitter
        splitter = ThinkStreamSplitter()
        reasoning_acc: list[str] = []
        done_reason = None
        self.last_thinking = None
        with httpx.Client(timeout=httpx.Timeout(self._int_config("ai_timeout_seconds", 120, 10, 600), connect=10.0)) as client:
            with client.stream("POST", f"{base_url}/api/chat", json=payload) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line:
                        continue
                    event = json.loads(line)
                    done_reason = event.get("done_reason") or done_reason
                    if event.get("error"):
                        raise RuntimeError(event["error"])
                    msg = event.get("message", {})
                    thinking = msg.get("thinking")
                    if thinking:
                        reasoning_acc.append(thinking)
                        if not self.reasoning_suppressed:
                            yield {"type": "reasoning", "text": thinking}
                    content = msg.get("content")
                    if content:
                        # Fallback tag: i modelli che inlineano <think> vengono separati
                        # qui, così il testo visibile resta pulito anche senza nativo.
                        for item in splitter.feed(content):
                            if item["type"] == "reasoning":
                                reasoning_acc.append(item["text"])
                                if self.reasoning_suppressed:
                                    continue
                            yield item
                for item in splitter.flush():
                    if item["type"] == "reasoning":
                        reasoning_acc.append(item["text"])
                        if self.reasoning_suppressed:
                            continue
                    yield item
        self.last_thinking = "".join(reasoning_acc).strip() or None
        if done_reason == "length":
            raise AIError("The model reached its output token limit before completing the response.")

    def _stream_llamacpp(self, user_message, system_prompt, model, max_tokens: int = None, history=None):
        client = self._llamacpp_client(httpx.Timeout(self._int_config("ai_timeout_seconds", 120, 10, 600), connect=10.0))
        system_prompt = self._apply_no_think(system_prompt, model or "")
        yield from self._iter_chat_stream(client, model or "default", system_prompt, user_message, max_tokens=max_tokens, history=history)

    def _stream_openai_compatible(self, provider, user_message, system_prompt, model, max_tokens: int = None, history=None):
        client = self._openai_compatible_client(provider)
        # include_usage: la maggior parte dei provider OpenAI-compatibili manda
        # i token nell'ultimo chunk (il costo NO: solo OpenRouter lo restituisce).
        yield from self._iter_chat_stream(
            client,
            model,
            system_prompt,
            user_message,
            max_tokens=max_tokens,
            stream_options={"include_usage": True},
            history=history,
        )

    def _stream_anthropic(self, user_message, system_prompt, model, max_tokens: int = 4096, history=None):
        api_key = self._get_api_key('api_key_anthropic')
        if not api_key:
            raise AIError("Anthropic API Key non configurata")
        client = anthropic.Anthropic(api_key=api_key, timeout=self._int_config("ai_timeout_seconds", 120, 10, 600), max_retries=0)
        nak = self._normalize_history(history)
        messages = list(nak)
        messages.append({"role": "user", "content": user_message})
        kwargs = dict(
            model=model,
            system=system_prompt,
            messages=messages,
            max_tokens=max_tokens,
        )
        thinking = self._anthropic_thinking(max_tokens)
        if thinking:
            kwargs["thinking"] = thinking
        with client.messages.stream(**kwargs) as stream:
            for text in stream.text_stream:
                if text:
                    yield text

    @property
    def embedding_cache_key(self):
        return embedding_service.identity(self.embedding_provider, self.embedding_model, self.embedding_dimensions)

    def embed_texts(self, texts, model: str = None, *, purpose="document", public_corpus=False,
                    retries=0, progress=None):
        """System embedding dispatch under the external privacy policy.

        External providers accept public-corpus documents and privacy-filtered
        queries (`embedding_service.filter_external_query`); `purpose="private"`
        stays local. Accounting is independent of chat usage and caller transactions.
        `retries`/`progress` serve index builds: see `embedding_service.embed_texts`.
        """
        def budget_locked():
            # Re-read between paid batches, including costs just recorded here.
            self._budget_locked_cache = None
            return self._budget_is_locked()

        try:
            return embedding_service.embed_texts(
                self.config, self.db, budget_locked, texts, model=model,
                purpose=purpose, public_corpus=public_corpus, retries=retries, progress=progress,
            )
        except embedding_service.EmbeddingError as exc:
            raise AIError("Embedding non disponibile: " + exc.code, code=exc.code) from None
        finally:
            self._budget_locked_cache = None

    def embed_query(self, text: str, model: str = None, *, public_corpus=False):
        vecs = self.embed_texts([text], model=model, purpose="query", public_corpus=public_corpus)
        return vecs[0] if vecs else []

    def preload_ollama_model(self):
        """Carica opzionalmente Ollama con contesto e durata di permanenza limitati."""
        import json as _json
        import urllib.request
        base_url = self._get_api_key('ollama_ip') or "http://localhost:11434"
        model = self.config.get('model_name', '')
        if not model:
            return
        try:
            payload = _json.dumps({
                "model": model,
                "keep_alive": self.ollama_keep_alive,
                "messages": [{"role": "user", "content": "ok"}],
                "stream": False,
                "options": {"num_ctx": context_profile(self.config, "ollama", model).get("context_tokens") or self.ollama_num_ctx, "num_predict": 1},
            }).encode()
            req = urllib.request.Request(
                f"{base_url}/api/chat",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=600) as r:
                r.read()
            logger.info(
                f"Ollama model '{model}' preloaded with keep_alive={self.ollama_keep_alive} "
                f"num_ctx={self.ollama_num_ctx}"
            )
        except Exception as e:
            logger.warning(f"Ollama preload fallito (non bloccante): {e}")
