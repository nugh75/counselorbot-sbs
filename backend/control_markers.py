"""Registro unico dei segnali di controllo che il modello scrive e la persona non legge.

Il modello chiude uno step con `[[AVANZA_STEP]]`. Il segnale serve
all'applicazione, non a chi legge: esce dal testo nel percorso comune di ogni
chat (le due rotte `/chat` e `/chat/stream`, la chat del sito, OpenCode) come
gli altri blocchi privati, e arriva al client come `control_signals`. Log,
memoria, cronologia ed export ricevono quindi solo il testo visibile; chi
rilegge log scritti prima di questo filtro passa da `strip_control_markers`.

Una chat nuova lo eredita senza fare nulla. Per aggiungere un segnale:
inserirlo in `CONTROL_MARKERS` qui e in `frontend/src/lib/control-markers.ts`
(un test confronta i due elenchi), poi decidere nel client che cosa fa.
"""
import re

CONTROL_MARKERS: tuple[str, ...] = ("AVANZA_STEP", "APRI_APPROFONDIMENTO", "TORNA_AL_PERCORSO")

ADVANCE_STEP = "AVANZA_STEP"
ADVANCE_MARKER = f"[[{ADVANCE_STEP}]]"


def _name_pattern(name: str) -> str:
    # Il markdown a volte scappa il trattino basso (`AVANZA\_STEP`).
    return r"\\?_".join(re.escape(part) for part in name.split("_"))


_MARKER_RE = re.compile(
    r"\[\[\s*(" + "|".join(_name_pattern(name) for name in CONTROL_MARKERS) + r")\s*\]\]",
    re.IGNORECASE,
)
# Durante lo streaming un segnale arriva a pezzi: la coda `[[AVAN` non si mostra.
_PARTIAL_TAIL_RE = re.compile(r"\[(?:\[[A-Za-z_\\\s]*\]?)?$")


def _tidy(text: str) -> str:
    text = re.sub(r"[ \t]+\n", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def extract(text: str | None) -> tuple[str, list[str]]:
    """Testo visibile e segnali trovati, in ordine e senza doppioni."""
    if not text:
        return "", []
    signals: list[str] = []
    for match in _MARKER_RE.finditer(text):
        name = match.group(1).replace("\\", "").upper()
        if name not in signals:
            signals.append(name)
    if not signals:
        return text, []
    return _tidy(_MARKER_RE.sub("", text)), signals


def strip_control_markers(text: str | None) -> str:
    """Solo il testo visibile: per rileggere log e testi salvati."""
    visible, signals = extract(text)
    return visible if signals else (text or "").strip()


def strip_for_display(text: str | None) -> str:
    """Testo parziale dello streaming: senza segnali, interi o ancora a meta'."""
    visible, _ = extract(text)
    trimmed = _PARTIAL_TAIL_RE.sub("", visible)
    return trimmed.rstrip() if trimmed != visible else visible
