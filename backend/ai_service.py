import os
import logging
import json

import anthropic
import google.generativeai as genai
import httpx
from mistralai.client import Mistral
from openai import OpenAI
from sqlalchemy.orm import Session

from . import models

logger = logging.getLogger(__name__)

# Prompt usato per aggiornare il riassunto rotante della sessione
SUMMARY_SYSTEM_PROMPT = (
    "Sei un assistente che mantiene un riassunto rotante della sessione di counseling. "
    "Riceverai il riassunto precedente (se presente) e l'ultima interazione. "
    "Produci UN UNICO riassunto aggiornato in MASSIMO 80 parole in italiano che integri "
    "tutto il percorso fatto finora, includendo l'ultimo step. "
    "Usa una lista puntata compatta. NON aggiungere introduzioni o conclusioni. "
    "IMPORTANTE: NON includere punteggi numerici grezzi o tabelle di dati del questionario QSA. "
    "Riporta solo le INTERPRETAZIONI e i CONSIGLI emersi dall'analisi. "
    "Il risultato SOSTITUISCE il riassunto precedente — non aggiungere, riscrivi."
)

# Mappa chiavi DB -> variabili d'ambiente per i segreti
ENV_KEY_MAP = {
    'api_key_openai': ('API_KEY_OPENAI',),
    'api_key_anthropic': ('API_KEY_ANTHROPIC',),
    'api_key_gemini': ('API_KEY_GEMINI',),
    'api_key_mistral': ('API_KEY_MISTRAL',),
    'api_key_openrouter': ('API_KEY_OPENROUTER', 'OPENROUTER_API_KEY'),
    'ollama_ip': ('OLLAMA_BASE_URL',),
    'ollama_num_ctx': ('OLLAMA_NUM_CTX',),
    'ollama_keep_alive': ('OLLAMA_KEEP_ALIVE',),
    'ollama_preload': ('OLLAMA_PRELOAD',),
    'llamacpp_url': ('LLAMACPP_BASE_URL',),
}

class AIService:
    def __init__(self, db: Session):
        self.db = db
        self.config = self._load_config()
        # Modalità "no thinking": disattiva il reasoning sui modelli che lo supportano
        self.disable_thinking = str(self.config.get('disable_thinking', 'false')).lower() == 'true'
        self.ollama_num_ctx = self._int_config('ollama_num_ctx', 8192, 2048, 32768)
        self.ollama_keep_alive = self.config.get('ollama_keep_alive', '5m') or '5m'
        self.ollama_preload_enabled = str(self.config.get('ollama_preload', 'false')).lower() == 'true'

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
        import httpx
        provider = provider or self.config.get('active_provider', 'openai')
        timeout = httpx.Timeout(15.0, connect=5.0)
        try:
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
    ):
        """
        Genera una risposta LLM.  Se conversation_summary è fornito, viene
        iniettato come contesto all'inizio del messaggio utente.
        """
        # Determine provider (default to openai if not set)
        provider = self.config.get('active_provider', 'openai')
        model_name = self.config.get('model_name', 'gpt-4o')

        # Inietta il riassunto conversazionale come contesto
        if conversation_summary:
            user_message = (
                f"CONTESTO DELLE CONVERSAZIONI PRECEDENTI:\n{conversation_summary}\n\n"
                f"---\n\n{user_message}"
            )
        
        try:
            if provider == 'openai':
                return self._call_openai(user_message, system_prompt, model_name, max_tokens=max_tokens)
            elif provider == 'anthropic':
                return self._call_anthropic(user_message, system_prompt, model_name, max_tokens=max_tokens or 4096)
            elif provider == 'openrouter':
                return self._call_openrouter(user_message, system_prompt, model_name, max_tokens=max_tokens)
            elif provider == 'gemini':
                return self._call_gemini(user_message, system_prompt, model_name, max_tokens=max_tokens)
            elif provider == 'mistral':
                return self._call_mistral(user_message, system_prompt, model_name, max_tokens=max_tokens)
            elif provider == 'ollama':
                return self._call_ollama(user_message, system_prompt, model_name, max_tokens=max_tokens or 8000)
            elif provider == 'llamacpp':
                return self._call_llamacpp(user_message, system_prompt, model_name, max_tokens=max_tokens or 8000)
            else:
                return self._call_openai(user_message, system_prompt, model_name, max_tokens=max_tokens)
        except Exception as e:
            return f"AI Error ({provider}): {str(e)}"

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
        try:
            if provider == 'openai':
                return self._call_openai(user_msg, SUMMARY_SYSTEM_PROMPT, summary_model, max_tokens=mt)
            elif provider == 'anthropic':
                return self._call_anthropic(user_msg, SUMMARY_SYSTEM_PROMPT, summary_model, max_tokens=mt)
            elif provider == 'openrouter':
                return self._call_openrouter(user_msg, SUMMARY_SYSTEM_PROMPT, summary_model, max_tokens=mt)
            elif provider == 'gemini':
                return self._call_gemini(user_msg, SUMMARY_SYSTEM_PROMPT, summary_model, max_tokens=mt)
            elif provider == 'mistral':
                return self._call_mistral(user_msg, SUMMARY_SYSTEM_PROMPT, summary_model, max_tokens=mt)
            elif provider == 'ollama':
                return self._call_ollama(user_msg, SUMMARY_SYSTEM_PROMPT, summary_model, max_tokens=mt)
            elif provider == 'llamacpp':
                return self._call_llamacpp(user_msg, SUMMARY_SYSTEM_PROMPT, summary_model, max_tokens=mt)
            else:
                return self._call_openai(user_msg, SUMMARY_SYSTEM_PROMPT, summary_model, max_tokens=mt)
        except Exception as e:
            logger.error(f"Errore nella generazione del riassunto: {e}")
            # Fallback: troncamento semplice
            truncated = bot_response[:300].rsplit(' ', 1)[0]
            return f"{prefix}{truncated}..."

    def _call_openai(self, user_message, system_prompt, model, max_tokens: int = None):
        api_key = self._get_api_key('api_key_openai')
        if not api_key: return "Error: OpenAI API Key not configured."

        client = OpenAI(api_key=api_key, timeout=600)
        kwargs = dict(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ]
        )
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        response = client.chat.completions.create(**kwargs)
        return response.choices[0].message.content

    def _call_openrouter(self, user_message, system_prompt, model, max_tokens: int = None):
        api_key = self._get_api_key('api_key_openrouter')
        if not api_key: return "Error: OpenRouter API Key not configured."

        # OpenRouter uses OpenAI Client structure with base_url
        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
            timeout=600,
        )
        kwargs = dict(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ]
        )
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        # OpenRouter: disattiva il reasoning a livello di richiesta
        if self.disable_thinking:
            kwargs["extra_body"] = {"reasoning": {"enabled": False}}
        response = client.chat.completions.create(**kwargs)
        return response.choices[0].message.content

    def _call_anthropic(self, user_message, system_prompt, model, max_tokens: int = 4096):
        api_key = self._get_api_key('api_key_anthropic')
        if not api_key: return "Error: Anthropic API Key not configured."

        client = anthropic.Anthropic(api_key=api_key, timeout=600)
        response = client.messages.create(
            model=model,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_message}
            ],
            max_tokens=max_tokens
        )
        return response.content[0].text

    def _call_gemini(self, user_message, system_prompt, model, max_tokens: int = None):
        api_key = self._get_api_key('api_key_gemini')
        if not api_key: return "Error: Gemini API Key not configured."

        genai.configure(api_key=api_key)
        gemini_model = genai.GenerativeModel(model)

        full_prompt = f"System: {system_prompt}\nUser: {user_message}"
        gen_config = {}
        if max_tokens:
            gen_config["max_output_tokens"] = max_tokens
        response = gemini_model.generate_content(
            full_prompt,
            generation_config=gen_config if gen_config else None,
            request_options={"timeout": 600},
        )
        return response.text

    def _call_mistral(self, user_message, system_prompt, model, max_tokens: int = None):
        api_key = self._get_api_key('api_key_mistral')
        if not api_key: return "Error: Mistral API Key not configured."

        client = Mistral(api_key=api_key)
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]
        kwargs = dict(model=model, messages=messages)
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        response = client.chat.complete(**kwargs)
        return response.choices[0].message.content

    def _call_ollama(self, user_message, system_prompt, model, max_tokens: int = 8000):
        base_url = (self._get_api_key('ollama_ip') or "http://localhost:11434").rstrip('/')
        system_prompt = self._apply_no_think(system_prompt)
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            "stream": False,
            "keep_alive": self.ollama_keep_alive,
            "options": {
                "num_ctx": self.ollama_num_ctx,
                "num_predict": max_tokens,
            },
        }
        if self.disable_thinking:
            payload["think"] = False
        response = httpx.post(
            f"{base_url}/api/chat",
            json=payload,
            timeout=httpx.Timeout(600.0, connect=10.0),
        )
        response.raise_for_status()
        return response.json().get("message", {}).get("content", "")

    def _call_llamacpp(self, user_message, system_prompt, model, max_tokens: int = 8000):
        """llama.cpp / llama-server / llama-swap: endpoint OpenAI-compatibile su /v1."""
        import httpx
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
        kwargs = dict(
            model=model or "default",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
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
    ):
        """
        Generatore che produce la risposta LLM a pezzi (token/delta).
        Stream incrementale per i provider OpenAI-compatibili e Anthropic;
        per gli altri produce la risposta completa in un unico chunk.
        """
        provider = self.config.get('active_provider', 'openai')
        model_name = self.config.get('model_name', 'gpt-4o')

        if conversation_summary:
            user_message = (
                f"CONTESTO DELLE CONVERSAZIONI PRECEDENTI:\n{conversation_summary}\n\n"
                f"---\n\n{user_message}"
            )

        try:
            if provider == 'openai':
                yield from self._stream_openai(user_message, system_prompt, model_name, max_tokens=max_tokens)
            elif provider == 'openrouter':
                yield from self._stream_openrouter(user_message, system_prompt, model_name, max_tokens=max_tokens)
            elif provider == 'ollama':
                yield from self._stream_ollama(user_message, system_prompt, model_name, max_tokens=max_tokens)
            elif provider == 'llamacpp':
                yield from self._stream_llamacpp(user_message, system_prompt, model_name, max_tokens=max_tokens)
            elif provider == 'anthropic':
                yield from self._stream_anthropic(user_message, system_prompt, model_name, max_tokens=max_tokens or 4096)
            elif provider == 'gemini':
                # nessuno stream incrementale: chunk unico
                yield self._call_gemini(user_message, system_prompt, model_name, max_tokens=max_tokens)
            elif provider == 'mistral':
                yield self._call_mistral(user_message, system_prompt, model_name, max_tokens=max_tokens)
            else:
                yield self._call_openai(user_message, system_prompt, model_name, max_tokens=max_tokens)
        except Exception as e:
            raise RuntimeError(f"AI Error ({provider}): {str(e)}") from e

    def _iter_chat_stream(self, client, model, system_prompt, user_message, extra_body=None, max_tokens: int = None):
        """Itera lo stream di un client OpenAI-compatibile producendo i delta di testo."""
        kwargs = dict(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            stream=True,
        )
        if max_tokens:
            kwargs["max_tokens"] = max_tokens
        if extra_body:
            kwargs["extra_body"] = extra_body
        stream = client.chat.completions.create(**kwargs)
        try:
            for chunk in stream:
                try:
                    delta = chunk.choices[0].delta.content
                except (IndexError, AttributeError):
                    delta = None
                if delta:
                    yield delta
        finally:
            close = getattr(stream, "close", None)
            if close:
                close()

    def _stream_openai(self, user_message, system_prompt, model, max_tokens: int = None):
        api_key = self._get_api_key('api_key_openai')
        if not api_key:
            yield "Error: OpenAI API Key not configured."
            return
        client = OpenAI(api_key=api_key, timeout=600)
        yield from self._iter_chat_stream(client, model, system_prompt, user_message, max_tokens=max_tokens)

    def _stream_openrouter(self, user_message, system_prompt, model, max_tokens: int = None):
        api_key = self._get_api_key('api_key_openrouter')
        if not api_key:
            yield "Error: OpenRouter API Key not configured."
            return
        client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key, timeout=600)
        extra = {"reasoning": {"enabled": False}} if self.disable_thinking else None
        yield from self._iter_chat_stream(client, model, system_prompt, user_message, extra_body=extra, max_tokens=max_tokens)

    def _stream_ollama(self, user_message, system_prompt, model, max_tokens: int = None):
        base_url = (self._get_api_key('ollama_ip') or "http://localhost:11434").rstrip('/')
        system_prompt = self._apply_no_think(system_prompt)
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            "stream": True,
            "keep_alive": self.ollama_keep_alive,
            "options": {
                "num_ctx": self.ollama_num_ctx,
                "num_predict": max_tokens or 800,
            },
        }
        if self.disable_thinking:
            payload["think"] = False
        with httpx.Client(timeout=httpx.Timeout(600.0, connect=10.0)) as client:
            with client.stream("POST", f"{base_url}/api/chat", json=payload) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line:
                        continue
                    event = json.loads(line)
                    if event.get("error"):
                        raise RuntimeError(event["error"])
                    delta = event.get("message", {}).get("content")
                    if delta:
                        yield delta

    def _stream_llamacpp(self, user_message, system_prompt, model, max_tokens: int = None):
        import httpx
        base_url = (self._get_api_key('llamacpp_url') or "http://localhost:8080").rstrip('/')
        if not base_url.endswith('/v1'):
            base_url = f"{base_url}/v1"
        client = OpenAI(base_url=base_url, api_key="llamacpp", timeout=httpx.Timeout(600.0, connect=10.0))
        system_prompt = self._apply_no_think(system_prompt)
        yield from self._iter_chat_stream(client, model or "default", system_prompt, user_message, max_tokens=max_tokens)

    def _stream_anthropic(self, user_message, system_prompt, model, max_tokens: int = 4096):
        api_key = self._get_api_key('api_key_anthropic')
        if not api_key:
            yield "Error: Anthropic API Key not configured."
            return
        client = anthropic.Anthropic(api_key=api_key, timeout=600)
        with client.messages.stream(
            model=model,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
            max_tokens=max_tokens,
        ) as stream:
            for text in stream.text_stream:
                if text:
                    yield text

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
