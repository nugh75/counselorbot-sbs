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


def _redact_spans(text: str) -> str:
    """Redazione distruttiva basata sullo stesso motore di `find_pii`."""
    spans = []  # (start, end, label)
    for ptype, value in find_pii(text):
        idx = 0
        while True:
            idx = text.find(value, idx)
            if idx < 0:
                break
            spans.append((idx, idx + len(value), _LABELS[ptype]))
            idx += len(value)
    # Ordine discendente come in `anonymize`.
    spans.sort(key=lambda s: s[0], reverse=True)
    out = list(text)
    placed: list = []  # (start, end) gia' sostituiti
    for start, end, label in spans:
        if any(start < p_end and end > p_start for p_start, p_end in placed):
            continue
        out[start:end] = [label]
        placed.append((start, end))
    return "".join(out)


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
        return _redact_spans(text)
    except Exception as e:  # pragma: no cover - difensivo
        logger.warning("PII redaction failed (returning original): %s", e)
        return text


def redact_always(text: Optional[str]) -> Optional[str]:
    """Come `redact`, ma ignora il flag di config.

    Serve quando il testo esce dal sistema — una query verso una fonte esterna —
    dove la redazione non e' una preferenza di logging ma una condizione.
    """
    if not isinstance(text, str) or not text:
        return text
    try:
        return _redact_spans(text)
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
    return {ptype for ptype, _ in find_pii(text)}
