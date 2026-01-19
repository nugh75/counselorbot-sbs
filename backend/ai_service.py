import os
from sqlalchemy.orm import Session
from . import models
from openai import OpenAI
import anthropic
import google.generativeai as genai
from mistralai import Mistral
from mistralai.models import UserMessage, SystemMessage

class AIService:
    def __init__(self, db: Session):
        self.db = db
        self.config = self._load_config()

    def _load_config(self):
        configs = self.db.query(models.Config).all()
        return {c.key: c.value for c in configs}

    def _get_api_key(self, provider_key):
        return self.config.get(provider_key)

    def get_response(self, user_message: str, system_prompt: str, mode: str):
        # Determine provider (default to openai if not set)
        provider = self.config.get('active_provider', 'openai')
        model_name = self.config.get('model_name', 'gpt-4o')
        
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
            SystemMessage(content=system_prompt),
            UserMessage(content=user_message)
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
            ]
        )
        return response.choices[0].message.content
