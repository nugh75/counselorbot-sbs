import os
import logging

import anthropic
import google.generativeai as genai
from mistralai.client import Mistral
from openai import OpenAI
from sqlalchemy.orm import Session

from . import models

logger = logging.getLogger(__name__)

# Prompt usato per generare i riassunti delle risposte
SUMMARY_SYSTEM_PROMPT = (
    "Sei un assistente che produce riassunti cronologici estremamente concisi. "
    "Ti verrà fornito il messaggio dell'utente (o il prompt di sistema) e la tua risposta. "
    "Crea un riassunto in MASSIMO 80 parole in italiano che descriva l'interazione: "
    "cosa ha chiesto/fatto l'utente e cosa hai risposto (punti chiave, consigli). "
    "Usa una lista puntata compatta. NON aggiungere introduzioni o conclusioni. "
    "IMPORTANTE: NON includere punteggi numerici grezzi o tabelle di dati del questionario QSA. "
    "Riporta solo le INTERPRETAZIONI e i CONSIGLI emersi dall'analisi."
)

# Mappa chiavi DB -> variabili d'ambiente per i segreti
ENV_KEY_MAP = {
    'api_key_openai': ('API_KEY_OPENAI',),
    'api_key_anthropic': ('API_KEY_ANTHROPIC',),
    'api_key_gemini': ('API_KEY_GEMINI',),
    'api_key_mistral': ('API_KEY_MISTRAL',),
    'api_key_openrouter': ('API_KEY_OPENROUTER', 'OPENROUTER_API_KEY'),
    'ollama_ip': ('OLLAMA_BASE_URL',),
}

class AIService:
    def __init__(self, db: Session):
        self.db = db
        self.config = self._load_config()

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

    def get_response(self, user_message: str, system_prompt: str, mode: str, conversation_summary: str = ""):
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
                return self._call_openai(user_message, system_prompt, model_name)
            elif provider == 'anthropic':
                return self._call_anthropic(user_message, system_prompt, model_name)
            elif provider == 'openrouter':
                return self._call_openrouter(user_message, system_prompt, model_name)
            elif provider == 'gemini':
                return self._call_gemini(user_message, system_prompt, model_name)
            elif provider == 'mistral':
                return self._call_mistral(user_message, system_prompt, model_name)
            elif provider == 'ollama':
                return self._call_ollama(user_message, system_prompt, model_name)
            else:
                return self._call_openai(user_message, system_prompt, model_name)
        except Exception as e:
            return f"AI Error ({provider}): {str(e)}"

    def generate_summary(self, user_message: str, bot_response: str, step_label: str = "") -> str:
        """
        Chiama l'LLM per generare un riassunto conciso dell'interazione (domanda + risposta).
        Usato per costruire la memoria conversazionale progressiva.
        """
        provider = self.config.get('active_provider', 'openai')
        model_name = self.config.get('model_name', 'gpt-4o')

        prefix = f"[{step_label}] " if step_label else ""
        user_msg = (
            f"{prefix}Riassumi questa interazione:\n\n"
            f"UTENTE:\n{user_message}\n\n"
            f"ASSISTENTE:\n{bot_response}"
        )

        try:
            if provider == 'openai':
                return self._call_openai(user_msg, SUMMARY_SYSTEM_PROMPT, model_name)
            elif provider == 'anthropic':
                return self._call_anthropic(user_msg, SUMMARY_SYSTEM_PROMPT, model_name)
            elif provider == 'openrouter':
                return self._call_openrouter(user_msg, SUMMARY_SYSTEM_PROMPT, model_name)
            elif provider == 'gemini':
                return self._call_gemini(user_msg, SUMMARY_SYSTEM_PROMPT, model_name)
            elif provider == 'mistral':
                return self._call_mistral(user_msg, SUMMARY_SYSTEM_PROMPT, model_name)
            elif provider == 'ollama':
                return self._call_ollama(user_msg, SUMMARY_SYSTEM_PROMPT, model_name)
            else:
                return self._call_openai(user_msg, SUMMARY_SYSTEM_PROMPT, model_name)
        except Exception as e:
            logger.error(f"Errore nella generazione del riassunto: {e}")
            # Fallback: troncamento semplice
            truncated = bot_response[:300].rsplit(' ', 1)[0]
            return f"{prefix}{truncated}..."

    def _call_openai(self, user_message, system_prompt, model):
        api_key = self._get_api_key('api_key_openai')
        if not api_key: return "Error: OpenAI API Key not configured."
        
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ]
        )
        return response.choices[0].message.content

    def _call_openrouter(self, user_message, system_prompt, model):
        api_key = self._get_api_key('api_key_openrouter')
        if not api_key: return "Error: OpenRouter API Key not configured."
        
        # OpenRouter uses OpenAI Client structure with base_url
        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
        )
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ]
        )
        return response.choices[0].message.content

    def _call_anthropic(self, user_message, system_prompt, model):
        api_key = self._get_api_key('api_key_anthropic')
        if not api_key: return "Error: Anthropic API Key not configured."

        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=model,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_message}
            ],
            max_tokens=1024
        )
        return response.content[0].text

    def _call_gemini(self, user_message, system_prompt, model):
        api_key = self._get_api_key('api_key_gemini')
        if not api_key: return "Error: Gemini API Key not configured."

        genai.configure(api_key=api_key)
        # Gemini setup often requires specific model instantiation
        gemini_model = genai.GenerativeModel(model)
        
        full_prompt = f"System: {system_prompt}\nUser: {user_message}"
        response = gemini_model.generate_content(full_prompt)
        return response.text

    def _call_mistral(self, user_message, system_prompt, model):
        api_key = self._get_api_key('api_key_mistral')
        if not api_key: return "Error: Mistral API Key not configured."

        client = Mistral(api_key=api_key)
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]
        response = client.chat.complete(
            model=model,
            messages=messages,
        )
        return response.choices[0].message.content

    def _call_ollama(self, user_message, system_prompt, model):
        base_url = self._get_api_key('ollama_ip') or "http://localhost:11434"

        client = OpenAI(
            base_url=f"{base_url}/v1",
            api_key="ollama", # required but not used
        )
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            max_tokens=4000,
        )
        return response.choices[0].message.content

    def preload_ollama_model(self):
        """Carica il modello Ollama in memoria con keep_alive=-1 (non scaricare mai)."""
        import urllib.request, json as _json
        base_url = self._get_api_key('ollama_ip') or "http://localhost:11434"
        model = self.config.get('model_name', '')
        if not model:
            return
        try:
            payload = _json.dumps({
                "model": model,
                "keep_alive": -1,
                "messages": [{"role": "user", "content": "ok"}],
                "stream": False,
            }).encode()
            req = urllib.request.Request(
                f"{base_url}/api/chat",
                data=payload,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=180) as r:
                r.read()
            logger.info(f"Ollama model '{model}' preloaded with keep_alive=-1")
        except Exception as e:
            logger.warning(f"Ollama preload fallito (non bloccante): {e}")
