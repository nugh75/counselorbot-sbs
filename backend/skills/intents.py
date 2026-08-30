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
        # "rispetto a" da solo e' troppo largo ("mi sento perso rispetto al
        # risultato"): richiede un termine di paragone esplicito.
        r"\b(confront|compar|differen|precedent|previous|versus|"
        r"anterior|precedente|comparer|difference|vergleich|unterschied|fruher|"
        r"jamfor|skillnad|tidigare|"
        r"rispetto\s+a(?:l|lla|llo|gli|i|d)?\s+(?:precedent|prim|scors|altr|second|ultim|vecchi))"
    ),
    "reading": re.compile(
        r"\b(lettur|libro|articol|bibliograf|fonte|fonti|read|book|article|source|"
        r"lectura|livro|lecture|livre|lesen|buch|quelle|lasa|bok|kalla)"
    ),
    # Domanda fattuale circoscritta su un'opera o un termine: "di cosa parla",
    # "chi l'ha scritto", "in che anno". E' l'unico caso in cui ha senso uscire
    # a consultare una fonte esterna.
    "factual": re.compile(
        r"\b(di\s+(?:cosa|che)\s+(?:parla|tratta)|qual\s+e\s+la\s+trama|la\s+trama\s+di|"
        r"chi\s+(?:ha\s+scritto|ha\s+diretto|l\s?.?\s?ha\s+scritto)|chi\s+e\s+l.?\s?autore|"
        r"in\s+che\s+anno|quando\s+e\s+(?:uscito|stato\s+pubblicato|stato\s+girato)|"
        r"what\s+(?:is|s)\s+it\s+about|what\s+is\s+the\s+plot|the\s+plot\s+of|"
        r"who\s+(?:wrote|directed)\b|what\s+year|when\s+was\s+it\s+published|when\s+did\s+it\s+come\s+out|"
        r"de\s+que\s+trata|quien\s+(?:escribio|dirigio)|en\s+que\s+ano|cuando\s+se\s+publico|"
        r"de\s+quoi\s+parle|qui\s+a\s+(?:ecrit|realise)|en\s+quelle\s+annee|quand\s+est\s+sorti|"
        r"worum\s+geht\s+es|in\s+welchem\s+jahr|wann\s+erschien|"
        r"vad\s+handlar|vem\s+(?:skrev|regisserade)|nar\s+kom)"
    ),
    "advice": re.compile(
        r"\b(consigl|cosa\s+posso\s+fare|come\s+faccio|come\s+(?:mi|posso)\s+organizz|come\s+posso\s+miglior|azione\s+concreta|"
        r"piano\s+d.azione|recommend|advice|what\s+can\s+i\s+do|how\s+can\s+i\s+improve|"
        r"consej|recomend|conseil|empfehl|rat\b|rad\b)"
    ),
    # Oltre alle domande esplicite di significato, il chiarimento copre anche il
    # disorientamento: "mi sento perso", "non so da dove partire", "non mi torna".
    "clarify": re.compile(
        r"\b(cosa\s+significa|che\s+significa|non\s+capisco|aiutami\s+a\s+capire|"
        r"confus|mi\s+rappresenta|sorprend|perche|meaning|what\s+does|understand|"
        r"reflect|significa|entend|comprendre|bedeutet|verstehen|betyder|forsta|"
        r"cosa\s+vuol\s+dire|che\s+vuol\s+dire|in\s+che\s+senso|"
        r"non\s+mi\s+e\s+chiar|non\s+mi\s+torna|non\s+mi\s+ritrovo|"
        r"mi\s+sento\s+(?:\S+\s+){0,2}pers[oa]|sono\s+pers[oa]\b|spaesat|disorientat|smarrit|"
        r"non\s+so\s+da\s+dove|da\s+dove\s+(?:parto|comincio|inizio)|"
        r"lost\b|unclear|make\s+sense|where\s+do\s+i\s+(?:start|begin)|"
        r"perdid|por\s+donde\s+empez|no\s+se\s+por\s+donde|"
        r"perdu|pas\s+clair|par\s+ou\s+commencer|"
        r"verloren|unklar|wo\s+(?:soll\s+)?ich\s+anfangen|"
        r"vilse|oklar|var\s+ska\s+jag\s+borja)"
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
    # Una domanda su di se' non e' una domanda su un'opera: "di cosa parla il
    # mio risultato" resta dentro il profilo, non esce a cercare in rete.
    "factual": re.compile(
        r"\b(?:mio|mia|miei|questo|questa)\s+(?:profil|punteggi|risultat|dat[oi]|taccuin|libretto)|"
        r"\bmy\s+(?:profile|score|result)|\bthis\s+(?:score|result|profile)"
    ),
    "advice": re.compile(
        r"\b(?:non\s+(?:voglio\s+)?consigl|non\s+(?:darmi|datemi|consigliarmi)|"
        r"senza\s+consigl|(?:do\s+not|don't)\s+(?:give|offer|recommend|suggest)\b(?:\s+me)?|without\s+advice)"
    ),
}


def classify(message: str, *, guided: bool = False) -> str:
    """Ritorna compare|factual|reading|advice|clarify|guided oppure stringa vuota.

    L'ordine e' intenzionale: un confronto o una lettura possono contenere la
    parola "strategia/consiglio", ma restano comportamenti piu' specifici. La
    domanda fattuale precede la lettura perche' "di cosa parla quel libro" chiede
    un dato su un'opera, non una nuova raccomandazione.
    """
    text = _plain(message)
    for intent in ("compare", "factual", "reading", "advice", "clarify"):
        negated = _NEGATED_PATTERNS.get(intent)
        if _PATTERNS[intent].search(text) and not (negated and negated.search(text)):
            return intent
    return "guided" if guided else ""
