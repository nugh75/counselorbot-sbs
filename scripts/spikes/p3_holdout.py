"""Hand-written held-out sentences for the P3 spike (not used to write any rule).

The P2 corpus comes from templates and from the generator's name lists, so
rules and gazetteers tuned on it overfit. These sentences use other phrasings
and names outside generator.py (some in the generic gazetteer, some in no
list at all) to show the generalization gap. Annotation syntax as in P2:
``[[text|category]]``. All names and identifiers are invented.
"""
from __future__ import annotations

import random

from backend.privacy.corpus.generator import render

HOLDOUT_TEMPLATES: list[tuple[str, tuple[str, ...]]] = [
    ("Ieri [[Ettore Valsecchi|person]] è arrivato in ritardo alla prima ora.", ("registro",)),
    ("Ho chiesto aiuto a [[Brunilda|person]] per la versione di greco.", ("relazioni",)),
    ("Secondo la coordinatrice, [[Tancredi|person]] non si integra con i compagni.", ("relazioni",)),
    ("La maestra [[Ortensia Pivetti|person]] ha organizzato la recita di Natale.", ("scuola",)),
    ("Mi ha scritto [[Kwame Mensah|person]] dicendo che domani non viene.", ("relazioni",)),
    ("[[Ludovica Sartori|person]] vive con la nonna a [[Lodi|city]] da due anni.", ("anagrafica",)),
    ("Non dirlo a nessuno, ma [[Gianmaria|person]] ha smesso di mangiare a mensa.", ("relazioni",)),
    ("Mia cugina [[Ottavia|person]] studia all'[[Istituto Alberghiero di Spoleto|school]].", ("scuola",)),
    ("Il papà di [[Thiago Barreto|person]] ha chiamato la scuola stamattina.", ("relazioni",)),
    ("Il coordinatore [[Fumagalli|person]] vuole parlare con i genitori di [[Iacopo|person]].",
     ("disciplina",)),
    ("Sto all'[[IIS «Enrico Mattei»|school]] di [[Vasto|city]], quarta linguistico.", ("scuola",)),
    ("La [[Scuola Media «Dante Alighieri»|school]] è vicina a casa mia.", ("scuola",)),
    ("Abito in [[contrada Santa Lucia 14|address]], fuori paese.", ("contatti",)),
    ("Ci vediamo in [[piazzale Kennedy 2|address]] alle quattro.", ("contatti",)),
    ("Vengo dalla [[Basilicata|region]] e mi sono trasferito a [[Cremona|city]].", ("anagrafica",)),
    ("Gioco a calcio con l'[[US Virtus Castelfranco|organization]] tre volte a settimana.", ("scuola",)),
    ("[[Clotilde|person]] ha la [[sindrome di Tourette|health]] e a volte la prendono in giro.",
     ("salute",)),
    ("Da quando ho il [[disturbo alimentare|health]] non vado più in palestra.", ("salute", "indiretto")),
    ("Ho saputo che [[Romeo Bettini|person]] è [[buddista|art9_other]] da qualche mese.", ("art9",)),
    ("Il fratello di [[Desirée|person]] ha la [[sclerosi multipla|health]].", ("salute",)),
    ("Scrivimi a [[tancredi.lusardi@posta.example|email]] o al [[347 118 2093|phone]].", ("contatti",)),
    ("Sono nato il [[14/02/2011|birth_date]] a [[Bressanone|city]].", ("anagrafica",)),
    ("La nuova arrivata, [[Svetlana Morozova|person]], parla già bene l'italiano.", ("relazioni",)),
    ("Il [[Convitto «Tommaseo»|school]] organizza il torneo di scacchi.", ("scuola",)),
    ("[[Ignazio|person]] e [[Pasquale|person]] si sono picchiati all'uscita.", ("disciplina",)),
    ("Domani interroga la [[Cavalleri|person]], speriamo non chieda la Rivoluzione industriale.",
     ("registro",)),
    ("Il nostro allenatore della [[Pallacanestro Vigevano|organization]] è severissimo.", ("scuola",)),
    ("[[Wanda|person]] ha prestato gli appunti a [[Ruben Castellucci|person]].", ("relazioni",)),
    ("Il nonno di [[Agata Spinelli|person]] ci accompagna in gita.", ("relazioni",)),
    ("Ho chiesto il cambio di banco perché [[Ernesto|person]] mi copia sempre.", ("disciplina",)),
    ("Oggi la professoressa ha portato i compiti corretti.", ("negativo",)),
    ("In geografia abbiamo studiato il Po e le Alpi.", ("negativo",)),
    ("La gita a Venezia è stata rimandata a maggio.", ("negativo",)),
]


def holdout_records() -> list[dict]:
    rng = random.Random(0)
    records = []
    for n, (template, tags) in enumerate(HOLDOUT_TEMPLATES, 1):
        text, entities = render(template, rng)
        records.append({"id": f"ho-{n:03d}", "text": text, "tags": list(tags), "entities": entities})
    return records
