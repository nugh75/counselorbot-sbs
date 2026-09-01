"""Layer ML prompt-driven per l'anonimizzazione PII verso provider esterni.

Il layer deterministico (`backend.pii`) resta autoritativo e sempre attivo;
questo modulo aggiunge un pass NER su modello locale via Ollama per nomi e
indirizzi in testo libero, con exact-match sul valore (il modello non
riscrive mai il testo). I token sono unici su tutti i testi della richiesta
e il mapping vive solo in memoria.

La redazione esterna e' reversibile: `restore_text` / `StreamRestorer`
ripristinano i valori reali nella risposta prima di mostrarla.
"""
import json
import logging

import httpx

from . import pii

logger = logging.getLogger(__name__)

# --- Config -----------------------------------------------------------------

_DEFAULT_MODEL = "qwen3:0.6b"
_DEFAULT_OLLAMA = "http://localhost:11434"
_ner_enabled: bool = True
_ner_model: str = _DEFAULT_MODEL

# Categorie che il prompt NER puo' restituire (normalizzate a minuscolo).
_NER_TYPES = {"nome", "indirizzo", "citta", "scuola", "matricola", "data_nascita"}


def set_ner_enabled(enabled: bool) -> None:
    global _ner_enabled
    _ner_enabled = bool(enabled)


def is_ner_enabled() -> bool:
    return _ner_enabled


def set_ner_model(model: str) -> None:
    global _ner_model
    _ner_model = model


def get_ner_model() -> str:
    return _ner_model


# --- Parsing NER ------------------------------------------------------------

def _parse_entities(raw: str) -> list:
    """Parsa l'output JSON del modello in lista di `(tipo, valore)`.

    Output malformato o entita' non riconosciute vengono scartati: qui un
    errore silenzioso e' preferibile a un falso positivo."""
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []
    entities = data.get("entities") if isinstance(data, dict) else None
    if not isinstance(entities, list):
        return []
    out = []
    for e in entities:
        if not isinstance(e, dict):
            continue
        etype = str(e.get("type", "")).lower().strip()
        value = e.get("value")
        if etype in _NER_TYPES and isinstance(value, str) and len(value) >= 3:
            out.append((etype, value))
    return out


def _ner_entities(text: str, base_url: str, model: str) -> list:
    """Chiama il modello locale via Ollama (/api/chat, format json) e ritorna
    le entita' rilevate.

    Gli errori di trasporto (rete, timeout) PROPAGANO: il chiamante deve
    distinguere "nessuna entita'" da "il detector non ha risposto" (policy
    di fallback). Un JSON malformato e' invece trattato come lista vuota."""
    prompt = (
        "Extract personal information from the following text. "
        "Recognize only these categories: person name (nome), postal address (indirizzo), "
        "city (citta), school or university name (scuola), student ID number (matricola), "
        "date of birth (data_nascita). "
        "A student ID number (matricola) is allowed even though it is numeric. "
        "Do not extract email, phone numbers, or other numeric identifiers. "
        "Return ONLY a JSON object with an \"entities\" array of "
        "{\"type\": \"nome\"|\"indirizzo\"|\"citta\"|\"scuola\"|\"matricola\"|\"data_nascita\", "
        "\"value\": \"exact text\"}. "
        "If nothing is found return {\"entities\": []}.\n\nText:\n" + text
    )
    resp = httpx.post(
        f"{base_url}/api/chat",
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "format": "json",
            "stream": False,
        },
        timeout=10.0,
    )
    resp.raise_for_status()
    content = resp.json().get("message", {}).get("content", "")
    return _parse_entities(content)


# --- Anonimizzazione multi-testo --------------------------------------------

def anonymize_texts(texts: list, ollama_base: str = None) -> tuple:
    """Anonimizza una lista di testi (user_message, system_prompt, history).

    Ritorna `(testi_anonimizzati, mapping, ner_ok)`:
    - mapping: token -> valore reale, unico su tutti i testi (stesso valore =
      stesso token);
    - ner_ok: True se il pass NER e' disabilitato o e' riuscito; False se il
      modello non ha risposto (policy di fallback del chiamante).
    """
    if ollama_base is None:
        ollama_base = _DEFAULT_OLLAMA
    mapping: dict = {}
    # token per (tipo, valore): lo stesso valore usa lo stesso token ovunque.
    value_tokens: dict = {}
    counters: dict = {}
    ner_ok = True

    def token_for(etype: str, value: str) -> str:
        key = (etype, value)
        if key in value_tokens:
            return value_tokens[key]
        n = counters.get(etype, 0) + 1
        counters[etype] = n
        token = f"[[PII:{etype.upper()}:{n}]]"
        value_tokens[key] = token
        mapping[token] = value
        return token

    def collect(text: str) -> str:
        nonlocal ner_ok
        if not text or not isinstance(text, str):
            return text
        det_spans = []  # (start, end, token) — layer deterministico
        for ptype, value in pii.find_pii(text):
            token = token_for(ptype, value)
            idx = 0
            while True:
                idx = text.find(value, idx)
                if idx < 0:
                    break
                det_spans.append((idx, idx + len(value), token))
                idx += len(value)
        ner_spans = []  # (start, end, token) — layer NER
        if _ner_enabled:
            try:
                for ntype, value in _ner_entities(text, ollama_base, _ner_model):
                    token = token_for(ntype, value)
                    idx = 0
                    while True:
                        idx = text.find(value, idx)
                        if idx < 0:
                            break
                        ner_spans.append((idx, idx + len(value), token))
                        idx += len(value)
            except Exception as e:  # pragma: no cover - difensivo
                logger.warning("NER exception: %s", e)
                ner_ok = False
        # Filtra gli span NER: (1) mai sopra uno span deterministico;
        # (2) tra span NER sovrapposti vince il piu' esterno/lungo (un
        # indirizzo che contiene la citta' va anonimizzato per intero,
        # altrimenti la strada resta visibile = leak).
        ner_spans.sort(key=lambda s: (s[0], -(s[1] - s[0])))
        kept_ner = []
        for s, e, t in ner_spans:
            if any(s < d_e and e > d_s for d_s, d_e, _ in det_spans):
                continue
            if any(s < k_e and e > k_s for k_s, k_e, _ in kept_ner):
                continue
            kept_ner.append((s, e, t))
        spans = det_spans + kept_ner
        if not spans:
            return text
        spans.sort(key=lambda s: s[0], reverse=True)
        out = list(text)
        placed: list = []
        for start, end, token in spans:
            if any(start < p_end and end > p_start for p_start, p_end in placed):
                continue
            out[start:end] = [token]
            placed.append((start, end))
        return "".join(out)

    # ner_ok=False solo su eccezione del chiamante NER (rete): la lista vuota
    # di _ner_entities e' gia' gestita lì con il log.
    results = [collect(t) for t in texts]
    return results, mapping, ner_ok


def restore_text(text, mapping: dict):
    """Inverte l'anonimizzazione sui token noti. Token sconosciuti restano."""
    return pii.restore(text, mapping)


class StreamRestorer:
    """Restore incrementale per lo streaming: i chunk possono spezzare un
    placeholder a meta'. Mantiene in buffer la coda che potrebbe essere un
    prefisso di token e la emette solo quando e' completa o certa."""

    def __init__(self, mapping: dict):
        self._mapping = mapping or {}
        self._buf = ""

    def feed(self, chunk: str) -> str:
        self._buf += chunk
        if not self._mapping:
            out, self._buf = self._buf, ""
            return out
        # 1) Sostituisci i token completi ovunque siano nel buffer.
        out = pii.restore(self._buf, self._mapping)
        # 2) Tieni in buffer la coda che e' una SUBSTRING di qualche token:
        # i provider possono spezzare un placeholder in pezzi minuscoli
        # (' [[' + 'P' + 'II' ...) che non sono ancora un prefisso valido.
        for k in range(len(out), 0, -1):
            tail = out[-k:]
            if any(tail in tok for tok in self._mapping):
                self._buf = tail
                return out[:-k]
        self._buf = ""
        return out

    def flush(self) -> str:
        out = pii.restore(self._buf, self._mapping)
        self._buf = ""
        return out
