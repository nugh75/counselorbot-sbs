"""Vocabolario controllato dei temi delle letture certificate.

Un romanzo o un film non si agganciano a un codice fattore: si agganciano a un
tema. La lista e' chiusa di proposito — un tema libero per voce renderebbe il
gate inservibile — e copre i costrutti dei sette strumenti senza ricalcarli uno
a uno.

Ogni tema porta:
  - `label`: come si chiama in italiano nel pannello admin;
  - `factors`: i codici fattore che, quando salienti nel turno, rendono il tema
    pertinente anche se lo studente non lo ha nominato;
  - `keywords`: le parole che lo attivano dal messaggio dello studente o dalla
    etichetta dello step.
"""
from __future__ import annotations

import re
import unicodedata

READING_THEMES: dict[str, dict] = {
    "metodo-di-studio": {
        "label": "Metodo di studio",
        "factors": ["C1", "C5", "C7", "C1r", "C3r", "S4", "K4"],
        "keywords": ["metodo", "studiare", "studio", "appunti", "memoria", "memorizzare",
                     "ripasso", "mappe", "schemi", "comprensione"],
    },
    "organizzazione-e-tempo": {
        "label": "Organizzazione e gestione del tempo",
        "factors": ["C2", "C3", "C6", "C2r", "C4r", "S3", "K3"],
        "keywords": ["organizzazione", "tempo", "pianificare", "scadenze", "procrastinare",
                     "concentrazione", "distrazioni", "priorita"],
    },
    "motivazione-e-volizione": {
        "label": "Motivazione e volizione",
        "factors": ["A2", "A5", "A2r", "S3", "K3"],
        "keywords": ["motivazione", "volonta", "perseveranza", "impegno", "costanza",
                     "mollare", "arrendersi", "obiettivi"],
    },
    "ansia-e-prestazione": {
        "label": "Ansia e prestazione",
        "factors": ["A1", "A7", "A1r", "S1", "K1", "K2"],
        "keywords": ["ansia", "ansioso", "paura", "panico", "tensione", "stress",
                     "verifica", "esame", "interrogazione", "prova"],
    },
    "emozioni": {
        "label": "Emozioni e regolazione emotiva",
        "factors": ["A7", "A1", "S1", "K2"],
        "keywords": ["emozioni", "rabbia", "tristezza", "sentimenti", "umore", "regolare"],
    },
    "fallimento-e-attribuzione": {
        "label": "Fallimento, errore e attribuzione",
        "factors": ["A3", "A4", "A3r", "A4r", "K5"],
        "keywords": ["fallimento", "errore", "sbagliare", "colpa", "fortuna",
                     "insuccesso", "bocciatura", "voto basso"],
    },
    "fiducia-in-se": {
        "label": "Fiducia in se stessi e autoefficacia",
        "factors": ["A6", "A4r", "S5", "K5", "AD4"],
        "keywords": ["fiducia", "autostima", "capace", "insicurezza", "valgo",
                     "autoefficacia", "sicurezza"],
    },
    "relazioni-e-collaborazione": {
        "label": "Relazioni, gruppo e collaborazione",
        "factors": ["C4", "S2", "S4", "K1"],
        "keywords": ["gruppo", "compagni", "collaborare", "amici", "classe",
                     "insieme", "aiuto", "relazioni"],
    },
    "comunicazione": {
        "label": "Comunicazione ed esposizione",
        "factors": ["S2", "K1"],
        "keywords": ["parlare", "esporre", "presentazione", "pubblico", "spiegare",
                     "comunicare", "timidezza"],
    },
    "identita-e-se": {
        "label": "Identita e immagine di se",
        "factors": ["S5", "K5"],
        "keywords": ["identita", "chi sono", "me stesso", "crescere", "adolescenza",
                     "cambiare", "diventare"],
    },
    "scelta-e-decisione": {
        "label": "Scelta e decisione",
        "factors": ["AD2", "S5"],
        "keywords": ["scelta", "scegliere", "decidere", "decisione", "bivio",
                     "indeciso", "dubbio"],
    },
    "futuro-e-orientamento": {
        "label": "Futuro, orientamento e progetto di vita",
        "factors": ["AD1", "T5", "S5"],
        "keywords": ["futuro", "progetto di vita", "progetto", "orientamento", "universita",
                     "carriera", "professione", "dopo la scuola"],
    },
    "tempo-e-memoria": {
        "label": "Rapporto col tempo, passato e presente",
        "factors": ["T1", "T2", "T3", "T4"],
        "keywords": ["passato", "presente", "ricordi", "rimpianti", "nostalgia",
                     "destino", "fatalismo", "vivere alla giornata"],
    },
    "curiosita-ed-esplorazione": {
        "label": "Curiosita ed esplorazione",
        "factors": ["AD3"],
        "keywords": ["curiosita", "esplorare", "scoprire", "provare", "nuovo",
                     "informarsi", "conoscere"],
    },
    "lavoro-e-vocazione": {
        "label": "Lavoro, vocazione e adattabilita",
        "factors": ["AD1", "AD2", "AD3", "AD4"],
        "keywords": ["lavoro", "mestiere", "vocazione", "professione", "adattarsi",
                     "cambiamento", "opportunita"],
    },
    "transizione-scuola-universita": {
        "label": "Transizioni: scuola, universita, primo lavoro",
        "factors": ["AD1", "S5", "K3"],
        "keywords": ["transizione", "primo anno", "matricola", "cambio scuola",
                     "iniziare", "nuovo inizio", "trasferirsi"],
    },
}

THEME_CODES = tuple(READING_THEMES)


def _plain(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", (text or "").casefold())
    return "".join(char for char in normalized if not unicodedata.combining(char))


def themes_from_text(text: str) -> set[str]:
    """Temi nominati da un testo (messaggio dello studente, etichetta dello step)."""
    plain = _plain(text)
    if not plain.strip():
        return set()
    found = set()
    for code, theme in READING_THEMES.items():
        for keyword in theme["keywords"]:
            if re.search(rf"\b{re.escape(_plain(keyword))}", plain):
                found.add(code)
                break
    return found


def themes_from_factors(codes) -> set[str]:
    """Temi resi pertinenti dai fattori salienti del turno."""
    salient = {str(c).upper() for c in (codes or ())}
    if not salient:
        return set()
    return {
        code for code, theme in READING_THEMES.items()
        if salient & {f.upper() for f in theme["factors"]}
    }


def known_themes(codes) -> list[str]:
    """Filtra una lista di temi tenendo solo quelli del vocabolario."""
    return [str(c).strip() for c in (codes or []) if str(c).strip() in READING_THEMES]
