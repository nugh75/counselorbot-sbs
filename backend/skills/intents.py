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
    # Domanda puntuale su qualcosa che sta fuori dal profilo: un'opera, una
    # persona, un termine. Copre sia la richiesta su un'opera ("di cosa parla",
    # "chi l'ha scritto") sia quella enciclopedica ("cos'e' la metacognizione",
    # "chi era Vygotskij"). E' l'unico caso in cui ha senso uscire a consultare
    # una fonte: il modello non deve rispondere a memoria su un dato verificabile.
    "factual": re.compile(
        # opera: trama, autore, anno
        r"\b(di\s+(?:cosa|che)\s+(?:parla|tratta)|qual\s+e\s+la\s+trama|la\s+trama\s+di|"
        r"chi\s+(?:ha\s+scritto|ha\s+diretto|l\s?.?\s?ha\s+scritto)|chi\s+e\s+l.?\s?autore|"
        r"in\s+che\s+anno|quando\s+e\s+(?:uscito|stato\s+pubblicato|stato\s+girato)|"
        r"what\s+(?:is|s)\s+it\s+about|what\s+is\s+the\s+plot|the\s+plot\s+of|"
        r"who\s+(?:wrote|directed)\b|what\s+year|when\s+was\s+it\s+published|when\s+did\s+it\s+come\s+out|"
        r"de\s+que\s+trata|quien\s+(?:escribio|dirigio)|en\s+que\s+ano|cuando\s+se\s+publico|"
        r"de\s+quoi\s+parle|qui\s+a\s+(?:ecrit|realise)|en\s+quelle\s+annee|quand\s+est\s+sorti|"
        r"worum\s+geht\s+es|in\s+welchem\s+jahr|wann\s+erschien|"
        r"vad\s+handlar|vem\s+(?:skrev|regisserade)|nar\s+kom|"
        # voce enciclopedica: definizione di un termine, identita' di una persona
        r"(?:che\s+)?cos\W?\s*e\b|che\s+cosa\s+e\b|"
        r"chi\s+(?:e'?|era|sono|erano)\s+\w|"
        r"quando\s+(?:e\s+)?(?:nato|nata|morto|morta|vissut)|dove\s+si\s+trova|"
        r"what\s+(?:is|are|was|were)\s+(?:a|an|the)?\s*\w|who\s+(?:is|was|were)\s+\w|"
        r"que\s+es\b|quien\s+(?:es|fue|era)\s+\w|"
        r"qu\W?est-ce\s+que|qui\s+(?:est|etait)\s+\w|"
        r"was\s+ist\b|wer\s+(?:ist|war)\s+\w|"
        r"vad\s+ar\b|vem\s+(?:ar|var)\s+\w|"
        # "cosa significa X" e' una voce di dizionario solo quando X e' un
        # termine e la frase finisce li'. "Cosa significa che sono nella fascia
        # bassa?" resta una domanda sul proprio profilo.
        r"cosa\s+(?:significa|vuol\s+dire)\s+(?:l[ao]\W?\s*)?[a-z]{4,}(?:\s+[a-z]{4,})?\s*\??\s*$|"
        r"what\s+does\s+[a-z]{4,}(?:\s+[a-z]{4,})?\s+mean|"
        r"que\s+significa\s+(?:l[ao]s?\s+)?[a-z]{4,}(?:\s+[a-z]{4,})?\s*\??\s*$|"
        r"que\s+veut\s+dire\s+(?:l[ae]\W?\s*)?[a-z]{4,}(?:\s+[a-z]{4,})?\s*\??\s*$|"
        r"was\s+bedeutet\s+[a-z]{4,}(?:\s+[a-z]{4,})?\s*\??\s*$|"
        r"vad\s+betyder\s+[a-z]{4,}(?:\s+[a-z]{4,})?\s*\??\s*$)"
    ),
    "advice": re.compile(
        r"\b(consigl|cosa\s+posso\s+fare|come\s+faccio|come\s+(?:mi|posso)\s+organizz|come\s+posso\s+miglior|azione\s+concreta|"
        r"piano\s+d.azione|recommend|advice|what\s+can\s+i\s+do|how\s+can\s+i\s+improve|"
        r"consej|recomend|conseil|empfehl|rat\b|rad\b|"
        # Risposta all'offerta di fine step ("ne vuoi un'altra?"): senza questi
        # la richiesta non e' classificata come consiglio e il catalogo resta
        # chiuso, cosi' l'offerta appena fatta non puo' essere mantenuta.
        r"un.?altra\s+(?:azione|idea|opzione|strategia)|"
        r"seconda\s+(?:azione|opzione|idea)|"
        r"another\s+(?:\w+\s+)?(?:one|action|option|idea|suggestion)|"
        r"second\s+(?:action|option|suggestion)|"
        r"otra\s+(?:accion|opcion|idea|sugerencia)|"
        r"une\s+autre\s+(?:action|option|idee|suggestion)|"
        r"noch\s+eine[nrs]?\s+(?:aktion|option|idee|vorschlag)|"
        r"en\s+till\b|ett\s+till\b|annat\s+forslag)"
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
    # Chi puo' aiutare dal vivo: una persona, un ufficio, un appuntamento.
    # Pattern stretto di proposito: senza un sostantivo di servizio o la
    # costruzione esplicita "a chi rivolgersi", "chi e' X" resta una domanda
    # enciclopedica e deve restare a `factual`.
    "referral": re.compile(
        r"\b(?:sportello|referente|tutor\b|orientatore|orientatrice|"
        r"psicolog[oa]\b|counsell?or\s+scolastic|segreteria|"
        r"ufficio\s+(?:orientamento|placement|stage|tirocini|studenti|relazioni|didattica)|"
        r"open\s?day|porte\s+aperte|help\s?desk|career\s+service|"
        r"student\s+(?:services|support)|welcome\s+desk|"
        r"a\s+chi\s+(?:mi\s+)?(?:posso\s+)?(?:rivolg|chied|parl)|"
        r"con\s+chi\s+(?:posso\s+)?parl|chi\s+(?:mi\s+)?puo\s+aiutar|"
        r"who\s+can\s+i\s+(?:talk|speak|turn)|who\s+should\s+i\s+(?:ask|contact)|"
        r"quien\s+me\s+puede\s+ayudar|a\s+quien\s+me\s+dirijo|"
        r"a\s+qui\s+(?:je\s+)?m\W?adress|qui\s+peut\s+m\W?aider|"
        r"an\s+wen\s+kann\s+ich\s+mich\s+wenden|wer\s+kann\s+mir\s+helfen|"
        r"vem\s+kan\s+jag\s+(?:prata|vanda))"
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
    # Una domanda su di se' non e' una domanda enciclopedica: il profilo, i
    # punteggi e i codici fattore restano dentro la chiarificazione riflessiva e
    # non escono mai a cercare in rete. "Cosa significa A6" non e' una voce di
    # enciclopedia; "cosa significa metacognizione" si'.
    "factual": re.compile(
        r"\b(?:mio|mia|miei|mie|questo|questa|quel|quella)\s+"
        r"(?:profil|punteggi|risultat|dat[oi]|taccuin|libretto|fattor|scala|dimension)|"
        r"\bmy\s+(?:profile|score|result|notebook)|\bthis\s+(?:score|result|profile|factor)|"
        r"\bdieses\s+ergebnis|\bmein\s+(?:profil|ergebnis)|"
        r"\beste\s+resultado|\bmi\s+(?:perfil|resultado)|"
        r"\bce\s+resultat|\bmon\s+(?:profil|resultat)|"
        r"\b(?:detta|mitt)\s+resultat|"
        # codici fattore: A6, C1, T3, AD4, C1r
        r"\b(?:a|c|s|k|t|ad|qsa)\s?\d{1,2}r?\b"
    ),
    "advice": re.compile(
        r"\b(?:non\s+(?:voglio\s+)?consigl|non\s+(?:darmi|datemi|consigliarmi)|"
        r"senza\s+consigl|(?:do\s+not|don't)\s+(?:give|offer|recommend|suggest)\b(?:\s+me)?|without\s+advice)"
    ),
}


def classify(message: str, *, guided: bool = False) -> str:
    """Ritorna compare|referral|factual|reading|advice|clarify|guided oppure "".

    L'ordine e' intenzionale: un confronto o una lettura possono contenere la
    parola "strategia/consiglio", ma restano comportamenti piu' specifici. La
    domanda fattuale precede la lettura perche' "di cosa parla quel libro"
    chiede un dato su un'opera, non una nuova raccomandazione. `referral`
    precede `factual` perche' "chi e' il referente DSA" e' una richiesta di
    contatto, non una voce di enciclopedia: il suo pattern e' stretto apposta,
    cosi' "chi e' Vygotskij" resta a `factual`.
    """
    text = _plain(message)
    for intent in ("compare", "referral", "factual", "reading", "advice", "clarify"):
        negated = _NEGATED_PATTERNS.get(intent)
        if _PATTERNS[intent].search(text) and not (negated and negated.search(text)):
            return intent
    return "guided" if guided else ""
