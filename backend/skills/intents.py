"""Classificazione conservativa del comportamento richiesto dallo studente.

Le regole coprono solo segnali espliciti e ad alta precisione. Se non emerge
un'intenzione, nessuna skill primaria viene forzata; i turni tecnici del
percorso guidato usano invece l'intenzione ``guided``.
"""
from __future__ import annotations

import re
import unicodedata


def _plain(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", (text or "").casefold())
    return "".join(char for char in normalized if not unicodedata.combining(char))


_PATTERNS = {
    "compare": re.compile(
        r"\b(confront|compar|differen|rispetto\s+a|precedent|previous|versus|"
        r"anterior|precedente|comparer|difference|vergleich|unterschied|fruher|"
        r"jamfor|skillnad|tidigare)"
    ),
    "reading": re.compile(
        r"\b(lettur|libro|articol|bibliograf|fonte|fonti|read|book|article|source|"
        r"lectura|livro|lecture|livre|lesen|buch|quelle|lasa|bok|kalla)"
    ),
    "advice": re.compile(
        r"\b(consigl|cosa\s+posso\s+fare|come\s+faccio|come\s+(?:mi|posso)\s+organizz|come\s+posso\s+miglior|azione\s+concreta|"
        r"piano\s+d.azione|recommend|advice|what\s+can\s+i\s+do|how\s+can\s+i\s+improve|"
        r"consej|recomend|conseil|empfehl|rat\b|rad\b)"
    ),
    "clarify": re.compile(
        r"\b(cosa\s+significa|che\s+significa|non\s+capisco|aiutami\s+a\s+capire|"
        r"confus|mi\s+rappresenta|sorprend|perche|meaning|what\s+does|understand|"
        r"confus|reflect|significa|entender|comprendre|bedeutet|verstehen|betyder|forsta)"
    ),
}

_NEGATED_PATTERNS = {
    "compare": re.compile(
        r"\b(?:non\s+(?:voglio\s+)?(?:confront|compar)|senza\s+(?:fare\s+)?(?:confront|compar)|"
        r"(?:do\s+not|don't)\s+(?:compare|contrast))"
    ),
    "reading": re.compile(
        r"\b(?:non\s+(?:voglio\s+)?(?:lettur|libr|articol|font)|"
        r"non\s+(?:suggerirmi|consigliarmi)\s+(?:lettur|libr|articol|font)|"
        r"senza\s+(?:lettur|libr|articol|font)|(?:do\s+not|don't)\s+(?:recommend|suggest)\s+(?:a\s+)?(?:book|reading|source))"
    ),
    "advice": re.compile(
        r"\b(?:non\s+(?:voglio\s+)?consigl|non\s+(?:darmi|datemi|consigliarmi)|"
        r"senza\s+consigl|(?:do\s+not|don't)\s+(?:give|offer|recommend|suggest)\b(?:\s+me)?|without\s+advice)"
    ),
}


def classify(message: str, *, guided: bool = False) -> str:
    """Ritorna compare|reading|advice|clarify|guided oppure stringa vuota.

    L'ordine e' intenzionale: un confronto o una lettura possono contenere la
    parola "strategia/consiglio", ma restano comportamenti piu' specifici.
    """
    text = _plain(message)
    for intent in ("compare", "reading", "advice", "clarify"):
        negated = _NEGATED_PATTERNS.get(intent)
        if _PATTERNS[intent].search(text) and not (negated and negated.search(text)):
            return intent
    return "guided" if guided else ""
