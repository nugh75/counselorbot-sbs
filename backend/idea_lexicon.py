"""Le parole con cui la diagnosi arriva alla persona.

Al modello si parla canonico (`mentioned`, `unsupported`, `premature`): e' un
contratto unico, come le istruzioni delle skill. Alla persona no. "Il tuo
assunto e' Unmotivated" detto a uno studente di terza e' violenza
terminologica; detto a un ricercatore e' la parola esatta. Da cui due registri.

L'obiettivo di ogni task non sta qui: lo dice il modello, nella lingua del
turno, perche' e' una frase e non un'etichetta.
"""
from __future__ import annotations

RESEARCH = "research"
PLAIN = "plain"

LANGS = ("it", "en", "es", "fr", "de", "sv")


def register_for_variant(variant: str | None) -> str:
    """La variante decide il registro, non il contenuto della diagnosi."""
    return RESEARCH if (variant or "") in {"research", "concept"} else PLAIN


STATUS_WORDS = {
    RESEARCH: {
        "it": {"mentioned": "nominato", "defined": "definito",
               "delimited": "delimitato", "related": "messo in relazione"},
        "en": {"mentioned": "mentioned", "defined": "defined",
               "delimited": "delimited", "related": "related"},
        "es": {"mentioned": "nombrado", "defined": "definido",
               "delimited": "delimitado", "related": "puesto en relacion"},
        "fr": {"mentioned": "mentionne", "defined": "defini",
               "delimited": "delimite", "related": "mis en relation"},
        "de": {"mentioned": "genannt", "defined": "definiert",
               "delimited": "abgegrenzt", "related": "in Beziehung gesetzt"},
        "sv": {"mentioned": "namnd", "defined": "definierad",
               "delimited": "avgransad", "related": "satt i relation"},
    },
    PLAIN: {
        "it": {"mentioned": "l'hai detto, non ancora spiegato",
               "defined": "si capisce cos'e'",
               "delimited": "si capisce dove finisce",
               "related": "si lega al resto"},
        "en": {"mentioned": "said, not yet explained",
               "defined": "you can tell what it is",
               "delimited": "you can tell where it ends",
               "related": "it ties to the rest"},
        "es": {"mentioned": "lo has dicho, aun no explicado",
               "defined": "se entiende que es",
               "delimited": "se entiende donde acaba",
               "related": "se une al resto"},
        "fr": {"mentioned": "dit, pas encore explique",
               "defined": "on comprend ce que c'est",
               "delimited": "on comprend ou ca s'arrete",
               "related": "ca se relie au reste"},
        "de": {"mentioned": "gesagt, noch nicht erklart",
               "defined": "man versteht, was es ist",
               "delimited": "man versteht, wo es endet",
               "related": "es verbindet sich mit dem Rest"},
        "sv": {"mentioned": "sagt, annu inte forklarat",
               "defined": "man forstar vad det ar",
               "delimited": "man forstar var det slutar",
               "related": "det knyts till resten"},
    },
}

FLAW_WORDS = {
    RESEARCH: {
        "it": {"orphaned": "nodo orfano", "unsupported": "affermazione non sostenuta",
               "duplicate": "funzione duplicata", "overloaded": "unita' sovraccarica",
               "premature": "concetto prematuro"},
        "en": {"orphaned": "orphaned idea", "unsupported": "unsupported claim",
               "duplicate": "duplicate function", "overloaded": "overloaded unit",
               "premature": "premature concept"},
        "es": {"orphaned": "nodo huerfano", "unsupported": "afirmacion no sostenida",
               "duplicate": "funcion duplicada", "overloaded": "unidad sobrecargada",
               "premature": "concepto prematuro"},
        "fr": {"orphaned": "noeud orphelin", "unsupported": "affirmation non etayee",
               "duplicate": "fonction dupliquee", "overloaded": "unite surchargee",
               "premature": "concept premature"},
        "de": {"orphaned": "verwaister Knoten", "unsupported": "ungestutzte Behauptung",
               "duplicate": "doppelte Funktion", "overloaded": "uberladene Einheit",
               "premature": "verfruhter Begriff"},
        "sv": {"orphaned": "foraldralos nod", "unsupported": "ostott pastaende",
               "duplicate": "dubblerad funktion", "overloaded": "overbelastad enhet",
               "premature": "for tidigt begrepp"},
    },
    PLAIN: {
        "it": {"orphaned": "sta li' da solo, non si aggancia",
               "unsupported": "non si appoggia a niente che hai detto",
               "duplicate": "questo lo hai gia' detto in altro modo",
               "overloaded": "qui stai facendo due cose insieme",
               "premature": "lo usi prima di averlo spiegato"},
        "en": {"orphaned": "it sits there on its own",
               "unsupported": "nothing you said holds it up",
               "duplicate": "you already said this another way",
               "overloaded": "you are doing two things at once here",
               "premature": "you use it before explaining it"},
        "es": {"orphaned": "esta ahi solo, no se engancha",
               "unsupported": "no se apoya en nada que hayas dicho",
               "duplicate": "esto ya lo dijiste de otro modo",
               "overloaded": "aqui estas haciendo dos cosas a la vez",
               "premature": "lo usas antes de haberlo explicado"},
        "fr": {"orphaned": "il reste la tout seul",
               "unsupported": "rien de ce que tu as dit ne le soutient",
               "duplicate": "tu l'as deja dit autrement",
               "overloaded": "ici tu fais deux choses a la fois",
               "premature": "tu l'utilises avant de l'avoir explique"},
        "de": {"orphaned": "es steht allein da",
               "unsupported": "nichts von dem, was du gesagt hast, tragt es",
               "duplicate": "das hast du schon anders gesagt",
               "overloaded": "hier machst du zwei Dinge zugleich",
               "premature": "du benutzt es, bevor du es erklart hast"},
        "sv": {"orphaned": "den star dar for sig sjalv",
               "unsupported": "inget du sagt bar upp det",
               "duplicate": "det har sa du redan pa ett annat satt",
               "overloaded": "har gor du tva saker samtidigt",
               "premature": "du anvander det innan du forklarat det"},
    },
}

TASK_LABELS = {
    "it": {"thesis-chapter": "Tesi o capitolo", "article": "Articolo",
           "position": "Posizione da sostenere", "research-question": "Domanda di ricerca",
           "systematic-review": "Revisione sistematica", "empirical-study": "Studio empirico",
           "teaching-unit": "Unita' didattica", "intervention": "Intervento",
           "study-path": "Percorso di studio", "personal-project": "Progetto personale",
           "concept-exploration": "Esplorazione di un concetto o costrutto"},
    "en": {"thesis-chapter": "Thesis or chapter", "article": "Article",
           "position": "Position to defend", "research-question": "Research question",
           "systematic-review": "Systematic review", "empirical-study": "Empirical study",
           "teaching-unit": "Teaching unit", "intervention": "Intervention",
           "study-path": "Study path", "personal-project": "Personal project",
           "concept-exploration": "Concept or construct exploration"},
    "es": {"thesis-chapter": "Tesis o capitulo", "article": "Articulo",
           "position": "Posicion que defender", "research-question": "Pregunta de investigacion",
           "systematic-review": "Revision sistematica", "empirical-study": "Estudio empirico",
           "teaching-unit": "Unidad didactica", "intervention": "Intervencion",
           "study-path": "Itinerario de estudio", "personal-project": "Proyecto personal",
           "concept-exploration": "Exploracion de un concepto o constructo"},
    "fr": {"thesis-chapter": "These ou chapitre", "article": "Article",
           "position": "Position a defendre", "research-question": "Question de recherche",
           "systematic-review": "Revue systematique", "empirical-study": "Etude empirique",
           "teaching-unit": "Unite didactique", "intervention": "Intervention",
           "study-path": "Parcours d'etudes", "personal-project": "Projet personnel",
           "concept-exploration": "Exploration d'un concept ou construit"},
    "de": {"thesis-chapter": "Arbeit oder Kapitel", "article": "Artikel",
           "position": "Zu vertretende Position", "research-question": "Forschungsfrage",
           "systematic-review": "Systematische Ubersicht", "empirical-study": "Empirische Studie",
           "teaching-unit": "Unterrichtseinheit", "intervention": "Intervention",
           "study-path": "Bildungsweg", "personal-project": "Personliches Projekt",
           "concept-exploration": "Erkundung eines Konzepts oder Konstrukts"},
    "sv": {"thesis-chapter": "Uppsats eller kapitel", "article": "Artikel",
           "position": "Standpunkt att forsvara", "research-question": "Forskningsfraga",
           "systematic-review": "Systematisk oversikt", "empirical-study": "Empirisk studie",
           "teaching-unit": "Undervisningsmoment", "intervention": "Insats",
           "study-path": "Studievag", "personal-project": "Personligt projekt",
           "concept-exploration": "Utforskning av begrepp eller konstrukt"},
}


def _pick(table: dict, register: str, lang: str) -> dict:
    by_register = table.get(register, table[PLAIN])
    return by_register.get((lang or "it")[:2], by_register["en"])


def status_word(status: str, lang: str = "it", register: str = PLAIN) -> str:
    return _pick(STATUS_WORDS, register, lang).get(status, status)


def flaw_word(flaw: str, lang: str = "it", register: str = PLAIN) -> str:
    return _pick(FLAW_WORDS, register, lang).get(flaw, flaw)


def task_label(task_type: str, lang: str = "it") -> str:
    return TASK_LABELS.get((lang or "it")[:2], TASK_LABELS["en"]).get(task_type, task_type)
