"""Redazione di dati personali (PII) per i log conversazionali.

Contesto: CounselorBot raccoglie conversazioni di counseling con studenti.
I log salvano testi potenzialmente contenenti email, numeri di telefono e
altri dati personali. Questo modulo fornisce una redazione deterministica
basata su regex, applicata *solo* ai record di log (il testo inviato
all'LLM resta integro).

La redazione e' controllata dal flag di config `log_pii_redact` (default:
attiva). Quando disattivata, `redact()` restituisce il testo invariato.
"""
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

# --- Config -----------------------------------------------------------------

# Default attivo; puo' essere disattivato via config DB key "log_pii_redact".
_DEFAULT_REDACT = True
_pii_redact_enabled: bool = _DEFAULT_REDACT


def set_pii_redact_enabled(enabled: bool) -> None:
    """Imposta a runtime lo stato della redazione (chiamato dal seeder di config)."""
    global _pii_redact_enabled
    _pii_redact_enabled = bool(enabled)


def is_pii_redact_enabled() -> bool:
    return _pii_redact_enabled


# --- Patterns ---------------------------------------------------------------
# Ordine rilevante: email prima del telefono (un'email contiene cifre ma non
# matcha i pattern telefonici). Codice fiscale italiano e' opzionale e
# volutamente conservatore per evitare falsi positivi su stringhe alfanumeriche.

# Email (RFC-ish semplificata).
_EMAIL_RE = re.compile(
    r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}"
)

# Telefono italiano: +39 opzionale, prefisso internazionale 0039, numeri
# mobili/fissi con spazi, punti o trattini come separatori. 9-11 cifre.
_PHONE_RE = re.compile(
    r"(?<!\w)"
    r"(?:\+39|0039|39)?"          # prefisso internazionale opzionale
    r"[ \.\-]?"                    # separatore opzionale
    r"(?:3\d{2}|0\d{1,3})"         # cellulare (3xx) o fisso (0xx)
    r"[ \.\-]?"                    # separatore
    r"\d{5,8}"                     # resto del numero
    r"(?!\w)"
)

# Codice fiscale italiano (16 caratteri alfanumerici, formato standard).
# Conservativo: richiede le 3 consonanti iniziali tipiche del cognome.
_CF_RE = re.compile(
    r"(?<![A-Za-z0-9])"
    r"[A-Z]{6}"                    # cognome + nome (6 consonanti)
    r"\d{2}[A-Z]\d{2}"             # anno, mese, giorno
    r"[A-Z]\d{3}[A-Z]"             # comune + codice di controllo
    r"(?![A-Za-z0-9])"
)


def _redact_email(text: str) -> str:
    return _EMAIL_RE.sub("[email]", text)


def _redact_phone(text: str) -> str:
    return _PHONE_RE.sub("[telefono]", text)


def _redact_cf(text: str) -> str:
    return _CF_RE.sub("[cf]", text)


def redact(text: Optional[str]) -> Optional[str]:
    """Redige PII in `text`. Ritorna None per None.

    Se la redazione e' disattivata (config), ritorna il testo invariato.
    """
    if text is None:
        return None
    if not isinstance(text, str):
        return text
    if not _pii_redact_enabled or not text:
        return text
    try:
        out = _redact_email(text)
        out = _redact_phone(out)
        out = _redact_cf(out)
        return out
    except Exception as e:  # pragma: no cover - difensivo
        logger.warning("PII redaction failed (returning original): %s", e)
        return text


def redact_details(details: dict, *fields: str) -> dict:
    """Redige in-place i `fields` specificati dentro un dict `details`.

    Esempio: ``redact_details(details, "user_input", "bot_response")``.
    Campi mancanti o non-stringa vengono ignorati. Ritorna lo stesso dict.
    Se la redazione e' disattivata, non fa nulla.
    """
    if not details or not _pii_redact_enabled:
        return details
    for f in fields:
        v = details.get(f)
        if isinstance(v, str):
            details[f] = redact(v)
    return details


def redact_envelope(envelope: dict) -> dict:
    """Redige PII in un envelope di log `{system_prompt_final, full_message, history}`.

    Ritorna una **copia nuova**: la `history` proviene da
    ``session_memory.get_transcript()`` e i suoi dict sono condivisi con la memoria di
    sessione, quindi non vanno mutati in place. Rispetta il flag `_pii_redact_enabled`
    (se off, ritorna comunque una copia non redatta)."""
    if not isinstance(envelope, dict):
        return envelope
    history_out = []
    for item in envelope.get("history") or []:
        if isinstance(item, dict):
            new_item = dict(item)
            if isinstance(new_item.get("content"), str):
                new_item["content"] = redact(new_item["content"])
            history_out.append(new_item)
        else:
            history_out.append(item)
    return {
        "system_prompt_final": redact(envelope.get("system_prompt_final")),
        "full_message": redact(envelope.get("full_message")),
        "history": history_out,
    }


def detect_pii_types(text: Optional[str]) -> set[str]:
    """Ritorna i tipi PII rilevati nel testo, senza esporre i valori trovati."""
    if not text or not isinstance(text, str):
        return set()
    found: set[str] = set()
    if _EMAIL_RE.search(text):
        found.add("email")
    if _PHONE_RE.search(text):
        found.add("telefono")
    if _CF_RE.search(text):
        found.add("cf")
    return found
