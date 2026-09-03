"""Cornice testuale del blocco dei referenti, nelle sei lingue dell'interfaccia.

Le istruzioni comportamentali della skill restano in inglese (contratto unico,
`skills_seed`). Questo e' invece il materiale che il modello consegna al turno:
etichette di campo e direttiva d'uso, che accompagnano testi gia' nella lingua
dello studente. Lasciarle in italiano dentro un turno svedese farebbe parlare
due lingue allo stesso blocco.
"""
from __future__ import annotations

FALLBACK_LANGUAGE = "en"

_INTRO_IT = (
    "Elenco approvato: sono le uniche figure ed eventi che puoi nominare. "
    "Riporta nomi, orari, date e recapiti esattamente come scritti qui, al massimo "
    "due figure e due eventi. Non aggiungere contatti che non compaiano in questo elenco."
)
_INTRO_EN = (
    "Approved list: these are the only people, offices and events you may name. "
    "Report names, opening times, dates and contacts exactly as written here, at most "
    "two figures and two events. Do not add contacts absent from this list."
)

REFERRAL_FRAME: dict[str, dict[str, str]] = {
    "it": {
        "intro": _INTRO_IT,
        "referrals": "A chi rivolgersi",
        "events": "Appuntamenti e scadenze",
        "what_for": "Cosa puoi chiedere",
        "how_to_reach": "Come raggiungerla",
        "contact": "Contatto",
        "when": "Quando",
        "where": "Dove",
        "online": "online",
        "deadline": "Iscrizioni entro",
        "page": "Pagina",
        "empty": (
            "Nessun referente o evento approvato copre questa richiesta: dillo in una riga, "
            "rimanda alla pagina di orientamento dell'istituto e non inventare contatti."
        ),
    },
    "en": {
        "intro": _INTRO_EN,
        "referrals": "Who to turn to",
        "events": "Dates and deadlines",
        "what_for": "What you can bring them",
        "how_to_reach": "How to reach them",
        "contact": "Contact",
        "when": "When",
        "where": "Where",
        "online": "online",
        "deadline": "Register by",
        "page": "Page",
        "empty": (
            "No approved referral or event covers this request: say so in one line, point to "
            "the institution's orientation page and do not invent contacts."
        ),
    },
    "es": {
        "intro": _INTRO_EN,
        "referrals": "A quien dirigirse",
        "events": "Citas y plazos",
        "what_for": "Que puedes consultarle",
        "how_to_reach": "Como contactar",
        "contact": "Contacto",
        "when": "Cuando",
        "where": "Donde",
        "online": "en linea",
        "deadline": "Inscripciones hasta",
        "page": "Pagina",
        "empty": (
            "Ningun referente o evento aprobado cubre esta peticion: dilo en una linea, "
            "remite a la pagina de orientacion del centro y no inventes contactos."
        ),
    },
    "fr": {
        "intro": _INTRO_EN,
        "referrals": "A qui s'adresser",
        "events": "Rendez-vous et echeances",
        "what_for": "Ce que tu peux lui demander",
        "how_to_reach": "Comment la joindre",
        "contact": "Contact",
        "when": "Quand",
        "where": "Ou",
        "online": "en ligne",
        "deadline": "Inscriptions avant le",
        "page": "Page",
        "empty": (
            "Aucun referent ni evenement approuve ne couvre cette demande : dis-le en une ligne, "
            "renvoie a la page d'orientation de l'etablissement et n'invente aucun contact."
        ),
    },
    "de": {
        "intro": _INTRO_EN,
        "referrals": "An wen du dich wenden kannst",
        "events": "Termine und Fristen",
        "what_for": "Was du dort ansprechen kannst",
        "how_to_reach": "So erreichst du sie",
        "contact": "Kontakt",
        "when": "Wann",
        "where": "Wo",
        "online": "online",
        "deadline": "Anmeldung bis",
        "page": "Seite",
        "empty": (
            "Keine freigegebene Anlaufstelle und kein Termin deckt diese Frage ab: sag das in "
            "einer Zeile, verweise auf die Orientierungsseite der Schule und erfinde keine Kontakte."
        ),
    },
    "sv": {
        "intro": _INTRO_EN,
        "referrals": "Vem du kan vanda dig till",
        "events": "Tider och sista datum",
        "what_for": "Vad du kan ta upp",
        "how_to_reach": "Sa nar du dem",
        "contact": "Kontakt",
        "when": "Nar",
        "where": "Var",
        "online": "online",
        "deadline": "Anmalan senast",
        "page": "Sida",
        "empty": (
            "Ingen godkand kontaktperson eller handelse tacker den har fragan: sag det pa en rad, "
            "hanvisa till skolans orienteringssida och hitta inte pa kontakter."
        ),
    },
}


def frame(language: str) -> dict[str, str]:
    """Etichette nella lingua del turno. Lingua ignota: inglese, mai una a caso."""
    return REFERRAL_FRAME.get((language or "").strip().lower()) or REFERRAL_FRAME[FALLBACK_LANGUAGE]
