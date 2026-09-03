"""Vocabolario controllato dei bisogni di orientamento.

Chiave d'aggancio di figure ed eventi, come `reading_themes` lo e' delle
letture. I temi di lettura non sono riusabili: dicono di cosa parla un'opera,
non quale servizio serve.

La lista e' chiusa di proposito. Un bisogno libero per riga renderebbe il
filtro inservibile e farebbe arrivare allo studente contatti a caso.

Nessun aggancio ai codici fattore: uno sportello non e' la conseguenza di un
punteggio, e legarcelo produrrebbe rimandi automatici che nessuno ha chiesto.
"""
from __future__ import annotations

import re
import unicodedata

REFERRAL_NEEDS: dict[str, dict] = {
    "scelta-percorso": {
        "label": "Scelta del percorso",
        "keywords": ["orientamento", "quale scuola", "quale corso", "quale facolta",
                     "cosa fare dopo", "indirizzo", "che universita", "iscrivermi a",
                     "orientation", "which course", "which degree", "what to do after"],
    },
    "metodo-di-studio": {
        "label": "Metodo di studio",
        "keywords": ["metodo di studio", "tutor", "recupero", "sportello didattico",
                     "aiuto nello studio", "ripetizioni", "study method", "tutoring"],
    },
    "disagio-emotivo": {
        "label": "Disagio emotivo",
        "keywords": ["psicolog", "sportello d ascolto", "sportello di ascolto", "ascolto",
                     "sto male", "ansia", "counselor", "consulenza psicologica",
                     "counselling", "mental health", "wellbeing"],
    },
    "dsa-bes": {
        "label": "DSA e bisogni educativi speciali",
        "keywords": ["dsa", "bes", "dislessia", "discalculia", "disabilita", "sostegno",
                     "referente inclusione", "pdp", "learning disability", "disability"],
    },
    "tirocinio-lavoro": {
        "label": "Tirocinio e lavoro",
        "keywords": ["tirocinio", "stage", "pcto", "alternanza", "lavoro", "placement",
                     "internship", "job", "career service"],
    },
    "borse-e-tasse": {
        "label": "Borse di studio e tasse",
        "keywords": ["borsa di studio", "borse", "tasse", "isee", "esonero", "diritto allo studio",
                     "scholarship", "tuition", "fees", "grant"],
    },
    "mobilita-estero": {
        "label": "Mobilita' e studio all'estero",
        "keywords": ["erasmus", "estero", "scambio", "mobilita", "exchange", "study abroad",
                     "mobility"],
    },
    "iscrizioni-scadenze": {
        "label": "Iscrizioni e scadenze",
        "keywords": ["iscrizion", "immatricolazion", "scadenza", "scadono", "bando",
                     "graduatoria", "test d ingresso", "enrolment", "enrollment", "deadline"],
    },
}


def _plain(text) -> str:
    normalized = unicodedata.normalize("NFKD", str(text or "").casefold())
    return "".join(char for char in normalized if not unicodedata.combining(char))


def needs_from_text(text) -> set[str]:
    """Bisogni nominati dallo studente. Insieme vuoto = nessun filtro."""
    plain = _plain(text)
    if not plain.strip():
        return set()
    found: set[str] = set()
    for code, need in REFERRAL_NEEDS.items():
        for keyword in need["keywords"]:
            if re.search(rf"\b{re.escape(_plain(keyword))}", plain):
                found.add(code)
                break
    return found


def known_needs(codes) -> list[str]:
    """Filtra una lista di bisogni tenendo solo quelli del vocabolario."""
    return [str(c).strip() for c in (codes or []) if str(c).strip() in REFERRAL_NEEDS]
