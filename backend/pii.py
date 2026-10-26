"""Redazione di dati personali (PII) per i log conversazionali.

Contesto: CounselorBot raccoglie conversazioni di counseling con studenti.
I log salvano testi potenzialmente contenenti email, numeri di telefono e
altri dati personali. Questo modulo fornisce una redazione deterministica
basata su regex, applicata *solo* ai record di log (il testo inviato
all'LLM resta integro).

La redazione e' controllata dal flag di config `log_pii_redact` (default:
attiva). Quando disattivata, `redact()` restituisce il testo invariato.
"""
import re
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Optional

REDACTION_ERROR = "[ERRORE_REDAZIONE]"
_log_school_context: ContextVar = ContextVar("log_school_context", default=None)


@contextmanager
def log_redaction_context(school_context):
    """Scope known names to this request/task; never share a roster globally."""
    from .privacy.detect import GazetteerLayer

    token = _log_school_context.set(GazetteerLayer(school_context))
    try:
        yield
    finally:
        _log_school_context.reset(token)

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
_CF_RE = re.compile(
    r"(?<![A-Za-z0-9])"
    r"[A-Z]{6}"                    # cognome + nome (6 consonanti)
    r"\d{2}[A-Z]\d{2}"             # anno, mese, giorno
    r"[A-Z]\d{3}[A-Z]"             # comune + codice di controllo
    r"(?![A-Za-z0-9])"
)

# IBAN: nazione + check + BBAN alfanumerico, validato con mod-97.
_IBAN_RE = re.compile(
    r"(?<![A-Za-z0-9])"
    r"[A-Z]{2}\d{2}[A-Z0-9]{5,30}"
    r"(?![A-Za-z0-9])"
)

# Partita IVA italiana: 11 cifre, validata con cifra di controllo.
_PIVA_RE = re.compile(r"(?<!\d)\d{11}(?!\d)")

# Carte di pagamento: 13-19 cifre, validata con Luhn.
_CARD_RE = re.compile(r"(?<!\d)\d{13,19}(?!\d)")

# Targa italiana (formato 1994+): 2 lettere, 3 cifre, 2 lettere.
_TARGA_RE = re.compile(
    r"(?<![A-Za-z0-9])"
    r"[A-Z]{2}\d{3}[A-Z]{2}"
    r"(?![A-Za-z0-9])"
)

# Telefono internazionale: prefisso + obbligatorio. La classe include spazi,
# punti, trattini e parentesi; il validatore conta le cifre (7-15) per
# escludere falsi positivi come "+3 ore".
_INTL_PHONE_RE = re.compile(
    r"(?<!\w)\+[\d .\-()]{7,18}(?!\w)"
)

# --- Identificatori nazionali esteri ----------------------------------------

# DNI/NIE spagnolo: 8 cifre + lettera di controllo, oppure X/Y/Z + 7 cifre
# + lettera (NIE). Lettera = numero mod 23 sulla tabella ufficiale.
_DNI_RE = re.compile(r"(?<![A-Za-z0-9])[XYZ]?\d{7,8}[A-Z](?![A-Za-z0-9])")
_DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE"

# NIR francese (numero securite sociale): 15 cifre, chiave mod-97.
_NIR_RE = re.compile(r"(?<!\d)[12]\d{14}(?!\d)")

# NINO britannico: 2 lettere (no D/F/I/Q/U/V), 6 cifre, lettera A-D.
# Nessun checksum: il formato stesso e' distintivo.
_NINO_RE = re.compile(
    r"(?<![A-Za-z0-9])[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D](?![A-Za-z0-9])"
)

# Personnummer svedese: YYMMDD-XXXX (o + per ultracentenari), checksum Luhn
# sull'ultima cifra delle 10.
_PERSONNUMMER_RE = re.compile(r"(?<!\d)\d{6}[-+]\d{4}(?!\d)")

# Telefoni nazionali (senza prefisso internazionale), prefissi conservativi.
_PHONE_ES_RE = re.compile(r"(?<!\d)[689]\d{2}[ .\-]?\d{3}[ .\-]?\d{3}(?!\d)")
_PHONE_FR_RE = re.compile(r"(?<!\d)0[1-9](?:[ .\-]?\d{2}){4}(?!\d)")
_PHONE_DE_RE = re.compile(r"(?<!\d)01[567][ .\-]?\d{7,8}(?!\d)")
# Svedese: prefisso 07x, gruppi con separatori variabili ("070-123 45 67"
# spezza anche l'ultimo gruppo); validatore sul conteggio cifre (9-10).
_PHONE_SV_RE = re.compile(r"(?<!\d)07[02369][ \d.\-]{6,10}\d(?!\d)")
_PHONE_UK_RE = re.compile(r"(?<!\d)07\d{3}[ ]?\d{6}(?!\d)")

# URL: i link possono contenere parametri con dati personali (rizzo-pii li
# tratta via regex allo stesso modo).
_URL_RE = re.compile(r"https?://[^\s<>()\"']+")

# Indirizzo IPv4 con validazione degli ottetti.
_IP_RE = re.compile(r"(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)")

# Handle social (@nome.utente): richiede almeno una lettera per non
# confondersi con "@10" in testi generici.
_SOCIAL_RE = re.compile(r"(?<!\w)@[A-Za-z0-9_.]{2,}(?!\w)")

# Data completa (giorno/mese/anno): candidata tipica a data di nascita.
# Over-redazione reversibile: l'anno da solo resta fuori (troppi falsi
# positivi in testo accademico).
_DATE_RE = re.compile(r"(?<!\d)\d{1,2}[/-]\d{1,2}[/-](?:19|20)\d{2}(?!\d)")

# Termini diagnostici comuni nel contesto counseling (art. 9 GDPR): supporto
# deterministico al NER per la categoria salute. Solo termini tecnici
# specifici, mai sintomi generici ("mal di testa"): falsi positivi ~zero.
_HEALTH_TERMS = [
    # italiano
    "dislessia", "dislessico", "dislessica", "dislessici", "dislessiche",
    "discalculia", "disgrafia", "disortografia", "DSA", "BES", "ADHD",
    "TDAH", "autismo", "autistico", "autistica", "asperger",
    # inglese
    "dyslexia", "dyslexic", "dyscalculia", "dysgraphia", "dysorthographia",
    "autism", "autistic",
    # spagnolo
    "dislexia", "disléxico", "disléxica", "discalculia", "disgrafía",
    "disortografía", "autismo", "autista",
    # francese
    "dyslexie", "dyslexique", "dyscalculie", "dysgraphie",
    "dysorthographie", "autisme", "autiste",
    # tedesco
    "Legasthenie", "Legastheniker", "Legasthenikerin", "Dyskalkulie",
    "Dysgraphie", "ADHS", "Autismus", "Autist", "Autistin",
    # svedese
    "dyslexi", "dyskalkyli", "dysgrafi", "autism", "autistisk",
]
_HEALTH_RE = re.compile(
    r"(?<![A-Za-zÀ-ÿ])(" + "|".join(re.escape(t) for t in _HEALTH_TERMS) + r")(?![A-Za-zÀ-ÿ])",
    re.IGNORECASE,
)


# --- Checksum ---------------------------------------------------------------

def _cf_checksum_valid(cf: str) -> bool:
    """Verifica il carattere di controllo del codice fiscale."""
    odd = {
        "0": 1, "1": 0, "2": 5, "3": 7, "4": 9, "5": 13, "6": 15, "7": 17,
        "8": 19, "9": 21, "A": 1, "B": 0, "C": 5, "D": 7, "E": 9, "F": 13,
        "G": 15, "H": 17, "I": 19, "J": 21, "K": 2, "L": 4, "M": 18, "N": 20,
        "O": 11, "P": 3, "Q": 6, "R": 8, "S": 12, "T": 14, "U": 16, "V": 10,
        "W": 22, "X": 25, "Y": 24, "Z": 23,
    }
    total = 0
    for i, ch in enumerate(cf[:15], start=1):
        if i % 2 == 1:
            total += odd[ch]
        elif ch.isdigit():
            total += int(ch)
        else:
            total += ord(ch) - 65
    return chr(65 + total % 26) == cf[15]


def _iban_mod97_valid(iban: str) -> bool:
    rearranged = iban[4:] + iban[:4]
    digits = ""
    for ch in rearranged:
        digits += ch if ch.isdigit() else str(ord(ch) - 55)
    return int(digits) % 97 == 1


def _piva_checksum_valid(piva: str) -> bool:
    total = 0
    for i, ch in enumerate(piva[:10], start=1):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return (10 - total % 10) % 10 == int(piva[10])


def _luhn_valid(number: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(number)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def _intl_phone_valid(value: str) -> bool:
    return 7 <= sum(c.isdigit() for c in value) <= 15


def _dni_valid(value: str) -> bool:
    if len(value) != 9:
        return False
    if value[0].isdigit():
        number, letter = int(value[:8]), value[8]
    elif value[0] in "XYZ":
        number = int("XYZ".index(value[0])) * 10**7 + int(value[1:8])
        letter = value[8]
    else:
        return False
    return _DNI_LETTERS[number % 23] == letter


def _nir_valid(value: str) -> bool:
    return (int(value[:13]) + int(value[13:])) % 97 == 0


def _personnummer_valid(value: str) -> bool:
    digits = value.replace("-", "").replace("+", "")
    if len(digits) != 10:
        return False
    total = 0
    for i, ch in enumerate(digits[:9]):
        d = int(ch)
        if i % 2 == 0:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return (10 - total % 10) % 10 == int(digits[9])


def _sv_phone_valid(value: str) -> bool:
    return 9 <= sum(c.isdigit() for c in value) <= 10


def _ip_valid(value: str) -> bool:
    return all(0 <= int(o) <= 255 for o in value.split("."))


def _social_valid(value: str) -> bool:
    return any(c.isalpha() for c in value)


def _date_valid(value: str) -> bool:
    day, month, year = value.replace("-", "/").split("/")
    return 1 <= int(day) <= 31 and 1 <= int(month) <= 12 and 1900 <= int(year) <= 2100


# --- Motore di detection condiviso ------------------------------------------
# Etichetta per la redazione distruttiva dei log (invariata per i tipi storici).
_LABELS = {
    "email": "[email]",
    "telefono": "[telefono]",
    "cf": "[cf]",
    "iban": "[iban]",
    "piva": "[piva]",
    "card": "[carta]",
    "targa": "[targa]",
    "dni": "[dni]",
    "nir": "[nir]",
    "nino": "[nino]",
    "personnummer": "[personnummer]",
    "url": "[url]",
    "ip": "[ip]",
    "social": "[social]",
    "data": "[data]",
    "salute": "[salute]",
}

# Priorita': i rilevatori a checksum vincono su telefono e carte (una sequenza
# di cifre lunga matcha anche quei pattern).
_DETECTORS: list = [
    # (tipo, regex, validatore|None)
    ("email", _EMAIL_RE, None),
    ("url", _URL_RE, None),
    ("ip", _IP_RE, _ip_valid),
    ("social", _SOCIAL_RE, _social_valid),
    ("data", _DATE_RE, _date_valid),
    ("salute", _HEALTH_RE, None),
    ("piva", _PIVA_RE, _piva_checksum_valid),
    ("nir", _NIR_RE, _nir_valid),
    ("nino", _NINO_RE, None),
    ("dni", _DNI_RE, _dni_valid),
    ("personnummer", _PERSONNUMMER_RE, _personnummer_valid),
    ("card", _CARD_RE, _luhn_valid),
    ("iban", _IBAN_RE, _iban_mod97_valid),
    ("cf", _CF_RE, _cf_checksum_valid),
    ("targa", _TARGA_RE, None),
    ("telefono", _INTL_PHONE_RE, _intl_phone_valid),
    ("telefono", _PHONE_RE, None),
    ("telefono", _PHONE_ES_RE, None),
    ("telefono", _PHONE_FR_RE, None),
    ("telefono", _PHONE_DE_RE, None),
    ("telefono", _PHONE_SV_RE, _sv_phone_valid),
    ("telefono", _PHONE_UK_RE, None),
]


def find_pii(text: Optional[str]) -> list:
    """Ritorna le occorrenze PII come tuple `(tipo, valore)` in ordine di
    posizione, con validazione checksum dove disponibile."""
    if not text or not isinstance(text, str):
        return []
    claimed: list = []  # (start, end) gia' assegnati
    found: list = []    # (start, tipo, valore)
    for ptype, regex, validator in _DETECTORS:
        for m in regex.finditer(text):
            value = m.group(0)
            if validator is not None and not validator(value):
                continue
            start, end = m.span()
            if any(start < c_end and end > c_start for c_start, c_end in claimed):
                continue
            claimed.append((start, end))
            found.append((start, ptype, value))
    found.sort(key=lambda x: x[0])
    return [(ptype, value) for _, ptype, value in found]


def anonymize(text: Optional[str]) -> tuple:
    """Anonimizzazione reversibile: sostituisce ogni PII con un placeholder
    `[[PII:TIPO:N]]` e ritorna `(testo_anonimizzato, mapping)`.

    Il mapping (token -> valore reale) vive solo in memoria: nessuna traccia
    su disco. `restore` inverte la trasformazione.
    """
    if not text or not isinstance(text, str):
        return text, {}
    spans = []  # (start, end, token)
    counters: dict = {}
    for ptype, value in find_pii(text):
        n = counters.get(ptype, 0) + 1
        counters[ptype] = n
        token = f"[[PII:{ptype.upper()}:{n}]]"
        # trova tutte le occorrenze della stessa stringa, per valore
        idx = 0
        while True:
            idx = text.find(value, idx)
            if idx < 0:
                break
            spans.append((idx, idx + len(value), token))
            idx += len(value)
    # Ordine discendente: la sostituzione in-place non sfalsa gli indici
    # precedenti. Skip di span sovrapposti (casi limite tra tipi diversi).
    spans.sort(key=lambda s: s[0], reverse=True)
    out = list(text)
    mapping: dict = {}
    placed: list = []  # (start, end) gia' sostituiti
    for start, end, token in spans:
        if any(start < p_end and end > p_start for p_start, p_end in placed):
            continue
        out[start:end] = [token]
        mapping[token] = text[start:end]
        placed.append((start, end))
    return "".join(out), mapping


def restore(text: Optional[str], mapping: dict) -> Optional[str]:
    """Inverte `anonymize`: sostituisce i token noti con i valori reali.
    Token sconosciuti restano invariati."""
    if not text or not isinstance(text, str):
        return text
    out = text
    for token, value in mapping.items():
        out = out.replace(token, value)
    return out


def _redact_spans(text: str, *, school_context=None) -> str:
    """Legacy labels plus P4 rules/gazetteer, without loading the ML model."""
    from .privacy.detect import GazetteerLayer, RulesLayer

    spans = []  # (start, end, label)
    for ptype, value in find_pii(text):
        if not isinstance(value, str) or not value:
            raise ValueError("Invalid PII match")
        idx = 0
        while True:
            idx = text.find(value, idx)
            if idx < 0:
                break
            spans.append((idx, idx + len(value), _LABELS[ptype]))
            idx += len(value)
    school = school_context if school_context is not None else _log_school_context.get()
    # These deterministic layers do not consult PrivacyContext or any provider.
    gazetteer = school if isinstance(school, GazetteerLayer) else GazetteerLayer(school)
    for layer in (RulesLayer(), gazetteer):
        spans.extend((s.start, s.end, f"[{s.category.value}]")
                     for s in layer.detect_pii(text, None))
    # Union overlapping hits: skipping a longer overlap would expose its tail.
    merged = []
    for start, end, label in sorted(spans, key=lambda s: s[0]):
        if merged and start < merged[-1][1]:
            old_start, old_end, old_label = merged[-1]
            merged[-1] = (old_start, max(old_end, end), old_label)
        else:
            merged.append((start, end, label))
    for start, end, label in reversed(merged):
        text = text[:start] + label + text[end:]
    return text


def redact(text: Optional[str], *, school_context=None) -> Optional[str]:
    """Redige PII in `text`. Ritorna None per None.

    Se la redazione e' disattivata (config), ritorna il testo invariato.
    """
    if text is None:
        return None
    if not isinstance(text, str):
        return REDACTION_ERROR
    if not _pii_redact_enabled or not text:
        return text
    try:
        return _redact_spans(text, school_context=school_context)
    except Exception:
        # Exception messages/tracebacks can contain the entire input. Do not log
        # even the error here (also avoids recursive failures in log formatters).
        return REDACTION_ERROR


def redact_always(
    text: Optional[str], *, school_context=None, fail_closed: bool = False
) -> Optional[str]:
    """Come `redact`, ma ignora il flag di config.

    Serve quando il testo esce dal sistema — una query verso una fonte esterna —
    dove la redazione non e' una preferenza di logging ma una condizione.
    I chiamanti con `fail_closed=True` bloccano l'uscita in caso di errore.
    """
    if text is None:
        return text
    if not isinstance(text, str):
        return REDACTION_ERROR
    if not text:
        return text
    try:
        return _redact_spans(text, school_context=school_context)
    except Exception:
        if fail_closed:
            raise ValueError("pii_redaction_unavailable") from None
        return REDACTION_ERROR


def redact_details(details: dict, *fields: str, school_context=None) -> dict:
    """Redige in-place i `fields` specificati dentro un dict `details`.

    Esempio: ``redact_details(details, "user_input", "bot_response")``.
    Campi mancanti ignorati; contenuti JSON annidati redatti. Ritorna lo stesso dict.
    Se la redazione e' disattivata, non fa nulla.
    """
    if not isinstance(details, dict):
        return {"error": REDACTION_ERROR}
    if not details or not _pii_redact_enabled:
        return details
    try:
        for f in fields:
            if f in details:
                details[f] = _redact_value(details[f], school_context=school_context)
    except Exception:
        return {"error": REDACTION_ERROR}
    return details


def redact_envelope(envelope: dict, *, school_context=None) -> dict:
    """Redige PII in un envelope di log `{system_prompt_final, full_message, history}`.

    Ritorna una **copia nuova**: la `history` proviene da
    ``session_memory.get_transcript()`` e i suoi dict sono condivisi con la memoria di
    sessione, quindi non vanno mutati in place. Rispetta il flag `_pii_redact_enabled`
    (se off, ritorna comunque una copia non redatta)."""
    result = _redact_value(envelope, school_context=school_context)
    return result if isinstance(result, dict) else {"error": REDACTION_ERROR}


def _redact_value(value, *, school_context=None, always=False):
    """Copy JSON-like payloads, including nested history and multimodal parts."""
    try:
        if isinstance(value, str):
            fn = redact_always if always else redact
            return fn(value, school_context=school_context)
        if isinstance(value, dict):
            return {_redact_value(k, school_context=school_context, always=always):
                    _redact_value(v, school_context=school_context, always=always)
                    for k, v in value.items()}
        if isinstance(value, (list, tuple)):
            return [_redact_value(v, school_context=school_context, always=always) for v in value]
        if value is None or type(value) in (int, float, bool):
            return value
    except Exception:
        pass
    return REDACTION_ERROR


def redact_diagnostics(value, *, school_context=None):
    """Mandatory export sanitization; never rely on historical DB redaction.

    Direct identifiers and personal questionnaire data are omitted by key;
    remaining free text passes through rules/gazetteer even with logging off.
    """
    private_fields = {
        "username", "email", "name", "first_name", "last_name", "display_name",
        "student", "student_name", "teacher_name", "school", "institution",
        "session_id", "conversation_id", "response_id", "anonymous_research_code",
        "scores", "score", "answers", "responses", "profile", "score_data",
    }
    try:
        if isinstance(value, dict):
            return {redact_always(k, school_context=school_context):
                    ("[OMESSO]" if k.lower() in private_fields and v is not None else
                     redact_diagnostics(v, school_context=school_context))
                    for k, v in value.items()}
        if isinstance(value, (list, tuple)):
            return [redact_diagnostics(v, school_context=school_context) for v in value]
        return _redact_value(value, school_context=school_context, always=True)
    except Exception:
        return REDACTION_ERROR


def detect_pii_types(text: Optional[str]) -> set[str]:
    """Ritorna i tipi PII rilevati nel testo, senza esporre i valori trovati."""
    return {ptype for ptype, _ in find_pii(text)}
