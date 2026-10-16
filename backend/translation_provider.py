"""Traduzioni editoriali attraverso il provider AI configurato.

Le traduzioni del catalogo (strategie e letture certificate, item e fattori degli
strumenti, descrizioni dei counselor) sono **testi editoriali**, non dati degli
utenti: possono quindi uscire verso un provider esterno. La chiamata passa da
`AIService`, cosi' valgono le stesse regole della chat: provider attivo o preset
dedicato, chiavi di sistema, politica privacy esterna, budget mensile.

Il preset e' opzionale. Se `translation_provider` (env `TRANSLATION_PROVIDER`) e'
impostato ha la precedenza sul provider attivo; `translation_model`
(`TRANSLATION_MODEL`) sceglie il modello. Senza preset si usano il provider e il
modello attivi in Amministrazione. `COUNSELOR_TRANSLATE_MODEL` resta accettato
come nome del modello per non rompere gli script esistenti.

Quando non c'e' alcun provider utilizzabile il modulo solleva
`TranslationUnavailable` con un messaggio leggibile: e' quello che i chiamanti
devono mostrare invece di un errore di trasporto.

Nessuna chiamata di rete nei test: `_service` e' il punto di iniezione e i test
sostituiscono il dispatch del provider.
"""
from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from . import models
from .ai_service import AIError, AIService
from .api_secrets import API_KEY_ENV_MAP, config_key

logger = logging.getLogger(__name__)

TRANSLATION_PROVIDER_ENV = "TRANSLATION_PROVIDER"
TRANSLATION_MODEL_ENV = "TRANSLATION_MODEL"
TRANSLATION_PROVIDER_KEY = "translation_provider"
TRANSLATION_MODEL_KEY = "translation_model"
LEGACY_MODEL_ENV = "COUNSELOR_TRANSLATE_MODEL"

# Modello predefinito quando il provider non ne porta uno in configurazione.
_DEFAULT_MODELS = {
    "openai": "gpt-4o",
    "openrouter": "openrouter/free",
    "omniroute": "auto/best-chat",
    "llamacpp": "default",
}

_JSON_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*|\s*```\s*$", re.IGNORECASE)


class TranslationUnavailable(AIError):
    """Nessun provider AI utilizzabile per una traduzione editoriale."""


@dataclass
class TranslationTarget:
    """Provider, modello e servizio risolti per una sessione di traduzione."""

    provider: str
    model: str
    service: AIService = field(repr=False, compare=False)

    @property
    def label(self) -> str:
        """Provenienza registrata accanto al testo (es. `mistral/mistral-large`)."""
        return f"{self.provider}/{self.model}" if self.model else self.provider


def _service(db: Session) -> AIService:
    return AIService(db)


def _config(db: Session, key: str) -> Optional[str]:
    row = db.query(models.Config).filter(models.Config.key == key).first()
    return (str(row.value).strip() if row and row.value else "") or None


def _env(name: str) -> Optional[str]:
    return (os.environ.get(name) or "").strip() or None


def resolve_target(db: Session, service: Optional[AIService] = None) -> TranslationTarget:
    """Provider e modello della traduzione: preset esplicito, altrimenti attivo.

    Solleva `TranslationUnavailable` con un messaggio leggibile se non c'e' un
    provider utilizzabile o se manca la chiave di sistema del provider esterno.
    """
    service = service or _service(db)
    preset_provider = _env(TRANSLATION_PROVIDER_ENV) or _config(db, TRANSLATION_PROVIDER_KEY)
    preset_model = _env(TRANSLATION_MODEL_ENV) or _config(db, TRANSLATION_MODEL_KEY)
    # Il vecchio nome del modello vale ancora, ma solo per il provider locale:
    # era il modello Ollama della traduzione, non un modello per ogni provider.
    legacy_model = _env(LEGACY_MODEL_ENV) or _config(db, "counselor_translate_model")
    active_provider = (service.config.get("active_provider") or "").strip() or None
    provider = preset_provider or active_provider
    if not provider or provider == "none":
        raise TranslationUnavailable(
            "Nessun provider AI configurato per la traduzione: scegli il provider attivo "
            "in Amministrazione oppure imposta translation_provider."
        )
    try:
        service._provider(provider)
    except AIError as exc:
        raise TranslationUnavailable(str(exc)) from exc
    model = preset_model
    if not model and provider == "ollama":
        model = legacy_model
    if not model and provider == active_provider:
        model = service.config.get("model_name")
    if not model:
        model = service.config.get(f"model_name_{provider}")
    model = model or _DEFAULT_MODELS.get(provider)
    if not model:
        raise TranslationUnavailable(
            f"Modello di traduzione non configurato per il provider '{provider}'."
        )
    if provider in API_KEY_ENV_MAP and not service.config.get(config_key(provider)):
        raise TranslationUnavailable(
            f"Chiave API mancante per il provider di traduzione '{provider}': "
            "configurala in Console, pagina Segreti."
        )
    return TranslationTarget(provider=provider, model=model, service=service)


def _parse_json_object(raw: str) -> dict:
    """Estrae l'oggetto JSON dalla risposta, anche se avvolta in una code fence."""
    text = (raw or "").strip()
    if not text:
        return {}
    text = _JSON_FENCE_RE.sub("", text).strip()
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            return {}
        try:
            data = json.loads(text[start:end + 1])
        except (json.JSONDecodeError, TypeError):
            return {}
    return data if isinstance(data, dict) else {}


def translate_payload(
    target: TranslationTarget,
    system_prompt: str,
    user_prompt: str,
    wanted: List[str],
) -> Dict[str, str]:
    """Traduce via provider e filtra le lingue richieste (`wanted`).

    Ritorna {lingua: testo} con le sole lingue davvero prodotte: una lingua
    mancante resta scoperta, non viene mai spacciata per traduzione.
    """
    response = target.service.get_response(
        user_prompt,
        system_prompt,
        "translation",
        provider=target.provider,
        model=target.model,
        json_mode=True,
    )
    data = _parse_json_object(response)
    if not data:
        raise TranslationUnavailable(
            f"Il provider di traduzione {target.label} non ha restituito un JSON valido."
        )
    out: Dict[str, str] = {}
    for code in wanted:
        value = data.get(code)
        if isinstance(value, str) and value.strip():
            out[code] = value.strip()
    return out
