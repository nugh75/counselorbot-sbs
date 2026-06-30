import os
import logging
import json
from datetime import datetime, timezone
from functools import partial

import anthropic
import httpx
from mistralai.client import Mistral
from openai import OpenAI
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models
from .reasoning_profiles import DISABLED_PLAN, ReasoningPlan, resolve_plan

logger = logging.getLogger(__name__)


class AIError(Exception):
    """Errore di configurazione o di chiamata al provider AI.
    Sollevato invece di restituire stringhe d'errore come fossero risposte del bot."""


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

# Mappa chiavi DB -> variabili d'ambiente per i segreti
ENV_KEY_MAP = {
    'api_key_openai': ('API_KEY_OPENAI',),
    'api_key_anthropic': ('API_KEY_ANTHROPIC',),
    'api_key_gemini': ('API_KEY_GEMINI', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'),
    'api_key_mistral': ('API_KEY_MISTRAL',),
    'api_key_openrouter': ('API_KEY_OPENROUTER', 'OPENROUTER_API_KEY'),
    'api_key_groq': ('API_KEY_GROQ', 'GROQ_API_KEY'),
    'api_key_cerebras': ('API_KEY_CEREBRAS', 'CEREBRAS_API_KEY'),
    'api_key_deepseek': ('API_KEY_DEEPSEEK', 'DEEPSEEK_API_KEY'),
    'api_key_together': ('API_KEY_TOGETHER', 'TOGETHER_API_KEY'),
    'api_key_fireworks': ('API_KEY_FIREWORKS', 'FIREWORKS_API_KEY'),
    'api_key_deepinfra': ('API_KEY_DEEPINFRA', 'DEEPINFRA_API_KEY'),
    'ollama_ip': ('OLLAMA_BASE_URL',),
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
    'groq':      'https://api.groq.com/openai/v1',
    'cerebras':  'https://api.cerebras.ai/v1',
    'deepseek':  'https://api.deepseek.com/v1',
    'together':  'https://api.together.xyz/v1',
    'fireworks': 'https://api.fireworks.ai/inference/v1',
    'deepinfra': 'https://api.deepinfra.com/v1/openai',
}

class AIService:
    def __init__(self, db: Session):
        self.db = db
        self.config = self._load_config()
        self.last_usage = None
        # Ultimo ragionamento «sto pensando» estratto (nativo Ollama o tag <think>),
        # esposto ai chiamatori non-stream (es. audit /live) come canale separato.
        self.last_thinking = None
        # Modalità "no thinking": disattiva il reasoning sui modelli che lo supportano
        self.disable_thinking = str(self.config.get('disable_thinking', 'false')).lower() == 'true'
        # Override opzionale del budget di ragionamento (es. dal preset del counselor).
        # None = usa il default della famiglia del modello (reasoning_profiles).
        self.reasoning_budget_override = None
        # Piano di reasoning della chiamata corrente: risolto per (provider, model)
        # prima del dispatch. Default neutro (spento) per chiamate dirette/riassunti.
        self._reasoning_plan = DISABLED_PLAN
        # Budget mensile: se >0 e la spesa del mese corrente lo supera, i modelli
        # a pagamento vengono disattivati e si usa solo Ollama locale (fallback).
        try:
            self.monthly_budget_usd = float(self.config.get('monthly_budget_usd', 0) or 0)
        except (TypeError, ValueError):
            self.monthly_budget_usd = 0.0
        self.budget_fallback_model = (self.config.get('budget_fallback_model') or 'qwen3.5:9b').strip()
        self._budget_locked_cache = None  # calcolato pigramente una volta per istanza
        # Contesto ampio: con thinking attivo num_predict puo' essere alto e non deve
        # essere strozzato dal contesto (prompt + reasoning + risposta).
        self.ollama_num_ctx = self._int_config('ollama_num_ctx', 16384, 2048, 32768)
        self.ollama_keep_alive = self.config.get('ollama_keep_alive', '5m') or '5m'
        self.ollama_preload_enabled = str(self.config.get('ollama_preload', 'false')).lower() == 'true'
        # Modello di embedding locale (via Ollama) per il RAG del chatbot del sito.
        self.embedding_model = (self.config.get('embedding_model') or 'qwen3-embedding:4b').strip()

        # Registro provider: un'unica fonte di verità per dispatch sync/stream.
        # call_max  = default max_tokens per la chiamata bloccante (get_response)
        # stream_max = default max_tokens per lo streaming
        # stream    = None → il provider non ha stream incrementale (chunk unico via call)
        # Aggiungere un provider = una voce qui + la coppia _call_/_stream_.
        self._providers = {
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
        for key in ("prompt_tokens", "completion_tokens", "total_tokens", "cost", "cost_usd", "total_cost"):
            if hasattr(usage, key):
                data[key] = getattr(usage, key)
        return data or None

    def _provider(self, name: str) -> dict:
        """Voce del registro per il provider; fallback a openai se sconosciuto."""
        return self._providers.get(name, self._providers['openai'])

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

    def _resolve_reasoning(self, model, requested_max_tokens, fallback_max_tokens) -> ReasoningPlan:
        """Risolve e memorizza il piano di reasoning per (modello, flag, budget).

        Restituisce il piano; `plan.max_tokens` e' il budget di output gia'
        comprensivo dell'headroom per la risposta, da inviare al provider."""
        plan = resolve_plan(
            model,
            disable_thinking=self.disable_thinking,
            requested_max_tokens=requested_max_tokens,
            fallback_max_tokens=fallback_max_tokens,
            budget_override=self.reasoning_budget_override,
        )
        self._reasoning_plan = plan
        return plan

    def _plan(self) -> ReasoningPlan:
        """Piano di reasoning corrente (default neutro se non risolto)."""
        return getattr(self, "_reasoning_plan", None) or DISABLED_PLAN

    def _budget_is_locked(self) -> bool:
        """True se il budget mensile e' impostato (>0) e la spesa del mese
        corrente (tutti i costi) lo ha raggiunto/superato. Cache per-istanza
        (una sola query per richiesta)."""
        if self.monthly_budget_usd <= 0:
            return False
        if self._budget_locked_cache is not None:
            return self._budget_locked_cache
        try:
            month_start = datetime.now(timezone.utc).replace(
                day=1, hour=0, minute=0, second=0, microsecond=0
            )
            spent = self.db.query(func.coalesce(func.sum(models.Log.cost_usd), 0.0)).filter(
                models.Log.timestamp >= month_start,
                models.Log.cost_usd.isnot(None),
            ).scalar() or 0.0
            self._budget_locked_cache = float(spent) >= self.monthly_budget_usd
        except Exception as e:
            logger.warning(f"Verifica budget fallita (non bloccante): {e}")
            self._budget_locked_cache = False
        return self._budget_locked_cache

    def _apply_budget_lock(self, provider: str, model: str):
        """Se il budget e' superato, forza Ollama locale + modello di fallback.
        Lascia invariati i provider gia' locali. Non tocca il benchmark
        (che usa call_model, percorso esplicito dell'admin)."""
        if provider != 'ollama' and self._budget_is_locked():
            fallback = self.budget_fallback_model or 'qwen3.5:9b'
            logger.info(f"Budget mensile superato: fallback {provider}/{model} -> ollama/{fallback}")
            return 'ollama', fallback
        return provider, model

    def _openrouter_reasoning(self) -> dict:
        """Parametro `reasoning` per OpenRouter dal piano corrente.

        Reasoning attivo -> abilitato con cap `max_tokens` (se noto), così il
        ragionamento non sfora nel budget riservato alla risposta. Spento ->
        `enabled: False` (alcuni modelli ragionano comunque, ma nessun budget)."""
        plan = self._plan()
        if not plan.enabled:
            return {"enabled": False}
        reasoning: dict = {"enabled": True}
        if plan.reasoning_budget:
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

    def _apply_no_think(self, system_prompt: str) -> str:
        """Aggiunge la direttiva /no_think al system prompt (convenzione qwen3/llama.cpp/ollama)."""
        if self.disable_thinking and "/no_think" not in system_prompt:
            return f"{system_prompt}\n\n/no_think"
        return system_prompt

    def _load_config(self):
        configs = self.db.query(models.Config).all()
        config_dict = {c.key: c.value for c in configs}

        # Le variabili d'ambiente hanno priorità sui valori nel DB
        for db_key, env_vars in ENV_KEY_MAP.items():
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
            if provider == 'openai':
                client = OpenAI(api_key=self._get_api_key('api_key_openai'), timeout=timeout)
            elif provider == 'openrouter':
                client = OpenAI(base_url="https://openrouter.ai/api/v1",
                                api_key=self._get_api_key('api_key_openrouter'), timeout=timeout)
            elif provider == 'ollama':
                base = (self._get_api_key('ollama_ip') or "http://localhost:11434").rstrip('/')
                client = OpenAI(base_url=f"{base}/v1", api_key="ollama", timeout=timeout)
            elif provider == 'llamacpp':
                base = (self._get_api_key('llamacpp_url') or "http://localhost:8080").rstrip('/')
                if not base.endswith('/v1'):
                    base = f"{base}/v1"
                client = OpenAI(base_url=base, api_key="llamacpp", timeout=timeout)
            elif provider in OPENAI_COMPAT_PROVIDERS:
                api_key = self._get_api_key(f'api_key_{provider}')
                if not api_key:
                    return []
                client = OpenAI(base_url=OPENAI_COMPAT_PROVIDERS[provider], api_key=api_key, timeout=timeout)
            else:
                # anthropic/gemini/mistral: nessun elenco dinamico, usa il fallback statico lato UI
                return []
            return sorted({m.id for m in client.models.list().data})
        except Exception as e:
            logger.warning(f"list_models fallito per {provider}: {e}")
            return []

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
    ):
        """
        Genera una risposta LLM.  Se conversation_summary è fornito, viene
        iniettato come contesto all'inizio del messaggio utente.
        `history` (opzionale): storico role-tagged [{role,content}] dei turni
        precedenti, iniettato come messaggi nativi ⟨user,assistant⟩ prima del
        messaggio utente corrente. `provider`/`model` opzionali come sopra.
        """
        effective_provider = provider or self.config.get('active_provider', 'openai')
        history = self._normalize_history(history)
        # Se l'utente sovrascrive il provider (es. gemini), usa un modello
        # predefinito per quel provider, non il model_name generico che
        # potrebbe essere un modello Ollama (es. qwen3.5:9b).
        _PROVIDER_DEFAULT_MODELS = {
            "openai": "gpt-4o",
            "anthropic": "claude-sonnet-4-20250514",
            "gemini": "gemini-2.0-flash",
            "openrouter": "meta-llama/llama-3.3-70b-instruct:free",
            "mistral": "mistral-small-latest",
            "ollama": "qwen3.5:9b",
            "llamacpp": "default",
            "groq": "llama-3.3-70b-versatile",
            "cerebras": "llama-3.3-70b",
            "deepseek": "deepseek-v4-flash",
            "together": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
            "fireworks": "accounts/fireworks/models/llama-v3p3-70b-instruct",
            "deepinfra": "meta-llama/Llama-3.3-70B-Instruct",
        }
        if model:
            model_name = model
        elif provider:
            model_name = (
                self.config.get(f'model_name_{provider}')
                or _PROVIDER_DEFAULT_MODELS.get(provider, 'gpt-4o')
            )
        else:
            model_name = self.config.get('model_name', 'gpt-4o')

        # Inietta il riassunto conversazionale come contesto
        if conversation_summary:
            user_message = (
                f"CONTEXT OF PREVIOUS CONVERSATIONS:\n{conversation_summary}\n\n"
                f"---\n\n{user_message}"
            )
        
        effective_provider, model_name = self._apply_budget_lock(effective_provider, model_name)
        entry = self._provider(effective_provider)
        plan = self._resolve_reasoning(model_name, requested_max_tokens=max_tokens,
                                       fallback_max_tokens=entry['call_max'])
        mt = plan.max_tokens
        self.last_usage = None
        try:
            return entry['call'](user_message, system_prompt, model_name, max_tokens=mt, history=history)
        except AIError:
            raise
        except Exception as e:
            logger.error(f"Errore chiamata AI ({effective_provider}): {e}")
            raise AIError(f"Errore AI ({effective_provider}): {e}") from e

    def call_model(self, provider: str, model: str, user_message: str, system_prompt: str, max_tokens: int = None):
        """Chiamata bloccante a un (provider, model) ESPLICITO, bypassando la
        config attiva. Usato dal benchmark per confrontare modelli/provider.
        Popola self.last_usage (token/costo) quando il provider lo fornisce."""
        entry = self._provider(provider)
        plan = self._resolve_reasoning(model, requested_max_tokens=max_tokens,
                                       fallback_max_tokens=entry['call_max'])
        mt = plan.max_tokens
        self.last_usage = None
        try:
            return entry['call'](user_message, system_prompt, model, max_tokens=mt)
        except AIError:
            raise
        except Exception as e:
            logger.error(f"Errore call_model ({provider}/{model}): {e}")
            raise AIError(f"Errore AI ({provider}/{model}): {e}") from e

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
        try:
            return self._provider(provider)['call'](user_msg, SUMMARY_SYSTEM_PROMPT, summary_model, max_tokens=mt)
        except Exception as e:
            logger.error(f"Errore nella generazione del riassunto: {e}")
            # Fallback: troncamento semplice
            truncated = bot_response[:300].rsplit(' ', 1)[0]
            return f"{prefix}{truncated}..."

    def _call_openai(self, user_message, system_prompt, model, max_tokens: int = None, history=None):
        api_key = self._get_api_key('api_key_openai')
        if not api_key: raise AIError("OpenAI API Key non configurata")

        client = OpenAI(api_key=api_key, timeout=600)
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
        response = client.chat.completions.create(**kwargs)
        return response.choices[0].message.content

    def _call_openrouter(self, user_message, system_prompt, model, max_tokens: int = None, history=None):
        api_key = self._get_api_key('api_key_openrouter')
        if not api_key: raise AIError("OpenRouter API Key non configurata")

        # OpenRouter uses OpenAI Client structure with base_url
        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            timeout=600,
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
        kwargs["extra_body"] = {"reasoning": self._openrouter_reasoning()}
        # Retry su rate-limit (429) con backoff esponenziale o Retry-After dai metadati/header
        import time as _time
        for attempt in range(6):
            try:
                response = client.chat.completions.create(**kwargs)
                usage = getattr(response, "usage", None)
                self.last_usage = self._usage_to_dict(usage)
                return response.choices[0].message.content
            except Exception as e:
                status = getattr(e, 'status_code', None)
                resp = getattr(e, 'response', None)
                if status is None and resp is not None:
                    status = getattr(resp, 'status_code', None)

                if status == 429 and attempt < 5:
                    wait = None
                    try:
                        if resp is not None:
                            # 1. Controlla gli header della response
                            headers = getattr(resp, 'headers', None)
                            if headers:
                                h_wait = headers.get("Retry-After") or headers.get("retry-after")
                                if h_wait:
                                    wait = float(h_wait)
                            
                            # 2. Controlla il corpo JSON per metadata.retry_after_seconds
                            if wait is None and hasattr(resp, 'json'):
                                body = resp.json()
                                if isinstance(body, dict):
                                    err_info = body.get('error', {})
                                    if isinstance(err_info, dict):
                                        metadata = err_info.get('metadata', {})
                                        if isinstance(metadata, dict):
                                            wait = metadata.get('retry_after_seconds')
                                            if wait is None:
                                                raw_headers = metadata.get('headers', {})
                                                if isinstance(raw_headers, dict):
                                                    h_wait = raw_headers.get('Retry-After') or raw_headers.get('retry-after')
                                                    if h_wait:
                                                        wait = float(h_wait)
                    except Exception as parse_ex:
                        logger.warning(f"pQBL: errore parsing del retry status di OpenRouter: {parse_ex}")

                    if wait is None or wait <= 0:
                        wait = 2 ** (attempt + 2)  # 4s, 8s, 16s, 32s, 64s

                    # Limitiamo l'attesa del singolo tentativo a max 90 secondi
                    wait = min(max(wait, 1.0), 90.0)
                    logger.warning(f"pQBL: OpenRouter rate-limit (tentativo {attempt + 1}/6), attesa di {wait:.1f}s prima del retry")
                    _time.sleep(wait)
                    continue
                raise

    def _openai_compatible_client(self, provider: str, timeout=600):
        """Client OpenAI puntato a un provider OpenAI-compatibile (base_url + chiave)."""
        api_key = self._get_api_key(f'api_key_{provider}')
        if not api_key:
            raise AIError(f"{provider} API Key non configurata")
        base_url = OPENAI_COMPAT_PROVIDERS[provider]
        return OpenAI(base_url=base_url, api_key=api_key, timeout=timeout)

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
        response = client.chat.completions.create(**kwargs)
        self.last_usage = self._usage_to_dict(getattr(response, "usage", None))
        return response.choices[0].message.content

    def _call_anthropic(self, user_message, system_prompt, model, max_tokens: int = 4096, history=None):
        api_key = self._get_api_key('api_key_anthropic')
        if not api_key: raise AIError("Anthropic API Key non configurata")

        client = anthropic.Anthropic(api_key=api_key, timeout=600)
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

        client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=600_000))
        # Gemini non ha messages array: lo storico viene inlined come testo
        # role-tagged prima dell'ultimo user turn (System -> turni -> User).
        nak = self._normalize_history(history)
        parts = [f"System: {system_prompt}"]
        for turn in nak:
            tag = "User" if turn["role"] == "user" else "Assistant"
            parts.append(f"{tag}: {turn['content']}")
        parts.append(f"User: {user_message}")
        full_prompt = "\n".join(parts)
        # I modelli gemini 2.5/3 "thinking" consumano il budget di output sul
        # ragionamento: con max_tokens piccoli response.text torna vuoto. Se il
        # no-thinking è attivo azzera il budget di reasoning (thinking_budget=0).
        config_kwargs = {}
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
            contents=full_prompt,
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

    def _call_ollama(self, user_message, system_prompt, model, max_tokens: int = 8000, history=None):
        base_url = (self._get_api_key('ollama_ip') or "http://localhost:11434").rstrip('/')
        system_prompt = self._apply_no_think(system_prompt)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(self._normalize_history(history))
        messages.append({"role": "user", "content": user_message})
        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
            "keep_alive": self.ollama_keep_alive,
            "options": {
                "num_ctx": self.ollama_num_ctx,
                "num_predict": max_tokens,
            },
        }
        # Estrazione JSON (parser QSA): mai reasoning, altrimenti il `think` puo'
        # rompere/rallentare l'output strutturato. Forza think off a prescindere.
        is_json = "json" in system_prompt.lower() or "json" in user_message.lower()
        if self.disable_thinking or is_json:
            payload["think"] = False
        else:
            payload["think"] = self._plan().enabled
        if is_json:
            payload["format"] = "json"
        response = httpx.post(
            f"{base_url}/api/chat",
            json=payload,
            timeout=httpx.Timeout(600.0, connect=10.0),
        )
        response.raise_for_status()
        message = response.json().get("message", {}) or {}
        # Confina il «sto pensando»: preferisci il campo nativo `thinking`; se assente
        # estrai eventuali tag <think> inlineati nel contenuto (fallback model-agnostico).
        from .chat_logic import split_thinking
        extracted, content = split_thinking(message.get("content", "") or "")
        thinking = message.get("thinking") or extracted
        self.last_thinking = (thinking or "").strip() or None
        return content

    def _call_llamacpp(self, user_message, system_prompt, model, max_tokens: int = 8000, history=None):
        """llama.cpp / llama-server / llama-swap: endpoint OpenAI-compatibile su /v1."""
        base_url = self._get_api_key('llamacpp_url') or "http://localhost:8080"
        base_url = base_url.rstrip('/')
        # accetta sia l'host nudo sia un URL che termina già con /v1
        if not base_url.endswith('/v1'):
            base_url = f"{base_url}/v1"

        client = OpenAI(
            base_url=base_url,
            api_key="llamacpp",  # richiesta dal client ma non usata dal server
            timeout=httpx.Timeout(600.0, connect=10.0),
        )
        system_prompt = self._apply_no_think(system_prompt)
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
        provider = provider or self.config.get('active_provider', 'openai')
        model_name = model or self.config.get('model_name', 'gpt-4o')
        provider, model_name = self._apply_budget_lock(provider, model_name)
        history = self._normalize_history(history)

        if conversation_summary:
            user_message = (
                f"CONTESTO DELLE CONVERSAZIONI PRECEDENTI:\n{conversation_summary}\n\n"
                f"---\n\n{user_message}"
            )

        def _dispatch():
            entry = self._provider(provider)
            self.last_usage = None
            if entry['stream']:
                plan = self._resolve_reasoning(model_name, requested_max_tokens=max_tokens,
                                               fallback_max_tokens=entry['stream_max'])
                yield from entry['stream'](user_message, system_prompt, model_name, max_tokens=plan.max_tokens, history=history)
            else:
                # nessuno stream incrementale: chunk unico via call bloccante
                plan = self._resolve_reasoning(model_name, requested_max_tokens=max_tokens,
                                               fallback_max_tokens=entry['call_max'])
                yield entry['call'](user_message, system_prompt, model_name, max_tokens=plan.max_tokens, history=history)

        try:
            # Normalizza: i provider possono produrre stringhe (solo testo) o dict
            # {"type": "content"|"reasoning", "text": ...}. Esponi sempre dict.
            for item in _dispatch():
                if isinstance(item, dict):
                    yield item
                elif item:
                    yield {"type": "content", "text": item}
        except AIError:
            raise
        except Exception as e:
            raise RuntimeError(f"AI Error ({provider}): {str(e)}") from e

    def _iter_chat_stream(self, client, model, system_prompt, user_message, extra_body=None, max_tokens: int = None, stream_options=None, history=None):
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
        if extra_body:
            kwargs["extra_body"] = extra_body
        if stream_options:
            kwargs["stream_options"] = stream_options
        stream = client.chat.completions.create(**kwargs)
        try:
            for chunk in stream:
                usage = getattr(chunk, "usage", None)
                if usage is not None:
                    usage_dict = self._usage_to_dict(usage)
                    self.last_usage = usage_dict
                    yield {"type": "usage", "usage": usage_dict}
                    continue
                try:
                    delta = chunk.choices[0].delta
                except (IndexError, AttributeError):
                    continue
                # Reasoning / thinking: OpenRouter usa `reasoning`, altri `reasoning_content`.
                reasoning = getattr(delta, "reasoning", None) or getattr(delta, "reasoning_content", None)
                if reasoning:
                    yield {"type": "reasoning", "text": reasoning}
                content = getattr(delta, "content", None)
                if content:
                    yield {"type": "content", "text": content}
        finally:
            close = getattr(stream, "close", None)
            if close:
                close()

    def _stream_openai(self, user_message, system_prompt, model, max_tokens: int = None, history=None):
        api_key = self._get_api_key('api_key_openai')
        if not api_key:
            raise AIError("OpenAI API Key non configurata")
        client = OpenAI(api_key=api_key, timeout=600)
        yield from self._iter_chat_stream(client, model, system_prompt, user_message, max_tokens=max_tokens, history=history)

    def _stream_openrouter(self, user_message, system_prompt, model, max_tokens: int = None, history=None):
        api_key = self._get_api_key('api_key_openrouter')
        if not api_key:
            raise AIError("OpenRouter API Key non configurata")
        client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key, timeout=600)
        # Reasoning bounded: budget separato dai metadati, l'headroom della
        # risposta e' gia' incluso in max_tokens (vedi reasoning_profiles).
        extra = {"reasoning": self._openrouter_reasoning()}
        yield from self._iter_chat_stream(
            client,
            model,
            system_prompt,
            user_message,
            extra_body=extra,
            max_tokens=max_tokens,
            stream_options={"include_usage": True},
            history=history,
        )

    def _stream_ollama(self, user_message, system_prompt, model, max_tokens: int = None, history=None):
        base_url = (self._get_api_key('ollama_ip') or "http://localhost:11434").rstrip('/')
        system_prompt = self._apply_no_think(system_prompt)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(self._normalize_history(history))
        messages.append({"role": "user", "content": user_message})
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "keep_alive": self.ollama_keep_alive,
            "options": {
                "num_ctx": self.ollama_num_ctx,
                "num_predict": max_tokens or 4096,
            },
        }
        is_json = "json" in system_prompt.lower() or "json" in user_message.lower()
        if is_json:
            payload["think"] = False
            payload["format"] = "json"
        else:
            payload["think"] = (not self.disable_thinking) and self._plan().enabled
        from .chat_logic import ThinkStreamSplitter
        splitter = ThinkStreamSplitter()
        reasoning_acc: list[str] = []
        self.last_thinking = None
        with httpx.Client(timeout=httpx.Timeout(600.0, connect=10.0)) as client:
            with client.stream("POST", f"{base_url}/api/chat", json=payload) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line:
                        continue
                    event = json.loads(line)
                    if event.get("error"):
                        raise RuntimeError(event["error"])
                    msg = event.get("message", {})
                    thinking = msg.get("thinking")
                    if thinking:
                        reasoning_acc.append(thinking)
                        yield {"type": "reasoning", "text": thinking}
                    content = msg.get("content")
                    if content:
                        # Fallback tag: i modelli che inlineano <think> vengono separati
                        # qui, così il testo visibile resta pulito anche senza nativo.
                        for item in splitter.feed(content):
                            if item["type"] == "reasoning":
                                reasoning_acc.append(item["text"])
                            yield item
                for item in splitter.flush():
                    if item["type"] == "reasoning":
                        reasoning_acc.append(item["text"])
                    yield item
        self.last_thinking = "".join(reasoning_acc).strip() or None

    def _stream_llamacpp(self, user_message, system_prompt, model, max_tokens: int = None, history=None):
        base_url = (self._get_api_key('llamacpp_url') or "http://localhost:8080").rstrip('/')
        if not base_url.endswith('/v1'):
            base_url = f"{base_url}/v1"
        client = OpenAI(base_url=base_url, api_key="llamacpp", timeout=httpx.Timeout(600.0, connect=10.0))
        system_prompt = self._apply_no_think(system_prompt)
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
        client = anthropic.Anthropic(api_key=api_key, timeout=600)
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

    # ---------------------------------------------------------------------
    # Embeddings (locali, via Ollama) — usati dal RAG del chatbot del sito.
    # ---------------------------------------------------------------------
    def embed_texts(self, texts, model: str = None):
        """Ritorna la lista di vettori di embedding per `texts` (lista di stringhe).

        Usa l'endpoint Ollama /api/embed (batch). Il modello di default è
        `embedding_model` (bge-m3). Solleva AIError su fallimento, coerente con
        il resto del service (mai stringhe d'errore come risultato)."""
        if not texts:
            return []
        base_url = (self._get_api_key('ollama_ip') or "http://localhost:11434").rstrip('/')
        model = model or self.embedding_model
        if not model:
            raise AIError("Modello di embedding non configurato (embedding_model)")

        vectors: list[list[float]] = []
        # Batch contenuti per non superare i limiti di payload del server.
        BATCH = 32
        try:
            with httpx.Client(timeout=httpx.Timeout(600.0, connect=10.0)) as client:
                for start in range(0, len(texts), BATCH):
                    batch = texts[start:start + BATCH]
                    resp = client.post(
                        f"{base_url}/api/embed",
                        json={"model": model, "input": batch, "keep_alive": self.ollama_keep_alive},
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    embeddings = data.get("embeddings")
                    if not embeddings or len(embeddings) != len(batch):
                        raise AIError(
                            f"Risposta embeddings inattesa da Ollama (modello '{model}'): "
                            f"attesi {len(batch)} vettori, ricevuti {len(embeddings or [])}"
                        )
                    vectors.extend(embeddings)
        except AIError:
            raise
        except Exception as e:
            raise AIError(f"Errore embeddings Ollama (modello '{model}'): {e}") from e
        return vectors

    def embed_query(self, text: str, model: str = None):
        """Embedding di una singola stringa (comodità). Ritorna un vettore."""
        vecs = self.embed_texts([text], model=model)
        return vecs[0] if vecs else []

    def preload_ollama_model(self):
        """Carica opzionalmente Ollama con contesto e durata di permanenza limitati."""
        import urllib.request, json as _json
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
                "options": {"num_ctx": self.ollama_num_ctx, "num_predict": 1},
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
