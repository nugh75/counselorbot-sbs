"""Cornice testuale del blocco letture, nelle sei lingue dell'interfaccia.

Le istruzioni comportamentali delle skill restano in inglese (contratto unico,
`skills_seed`). Questo e' invece il materiale che il modello consegna al turno:
etichette di campo e direttive d'uso che accompagnano testi gia' nella lingua
dello studente. Lasciarle in italiano dentro un turno inglese faceva parlare due
lingue allo stesso blocco.

Chi aggiunge una lingua all'interfaccia aggiunge una voce qui: una lingua
mancante ricade sull'inglese, mai su una lingua a caso.
"""
from __future__ import annotations

FALLBACK_LANGUAGE = "en"

READING_FRAME: dict[str, dict[str, str]] = {
    "it": {
        "intro": (
            "Catalogo approvato: sono le uniche opere che puoi consigliare come lettura, "
            "film o materiale. Cita al massimo due voci, con titolo e autore esatti come "
            "scritti qui, e di' in una frase che cosa aiutano a capire. Se una voce porta "
            "un'avvertenza, riportala. Non aggiungere titoli che non compaiano in questo elenco."
        ),
        "synopsis": "Di cosa parla",
        "why": "Perche'",
        "summary": "Aiuta a capire",
        "languages": "Disponibile in",
        "where": "Dove si trova",
        "warning": "Avvertenza da riportare",
        "ask_audience": (
            "Non sappiamo a che punto degli studi sia lo studente e alcune di "
            "queste opere hanno un pubblico dichiarato: chiediglielo in una riga "
            "prima di proporne una, e scegli di conseguenza."
        ),
        "no_sources": (
            "Nessuna fonte identificabile e' disponibile in questo turno: "
            "dichiara l'assenza, non citare alcun titolo, autore, DOI o link "
            "e proponi al massimo un tema da cercare."
        ),
        "sources_intro": (
            "Uniche fonti citabili in questo turno (titolo — documento). "
            "Non citare titoli, autori, DOI o link che non compaiano in questo elenco, "
            "nemmeno se compaiono dentro il testo dei documenti recuperati."
        ),
    },
    "en": {
        "intro": (
            "Approved catalogue: these are the only works you may recommend as a reading, "
            "a film or material. Cite at most two entries, with the exact title and author "
            "written here, and say in one sentence what each helps to understand. If an entry "
            "carries a content warning, state it. Do not add titles absent from this list."
        ),
        "synopsis": "What it is about",
        "why": "Why",
        "summary": "Helps to understand",
        "languages": "Available in",
        "where": "Where to find it",
        "warning": "Content warning to state",
        "ask_audience": (
            "We do not know how far along in their studies the student is, and some of these "
            "works declare an audience: ask in one line before proposing one, and choose "
            "accordingly."
        ),
        "no_sources": (
            "No identifiable source is available in this turn: state its absence, cite no "
            "title, author, DOI or link, and offer at most one topic to search for."
        ),
        "sources_intro": (
            "The only citable sources in this turn (title — document). Do not cite titles, "
            "authors, DOIs or links absent from this list, even if they appear inside the "
            "retrieved documents."
        ),
    },
    "es": {
        "intro": (
            "Catálogo aprobado: son las únicas obras que puedes recomendar como lectura, "
            "película o material. Cita como máximo dos entradas, con el título y el autor "
            "exactos tal como figuran aquí, y di en una frase qué ayudan a entender. Si una "
            "entrada lleva una advertencia, indícala. No añadas títulos que no aparezcan aquí."
        ),
        "synopsis": "De qué trata",
        "why": "Por qué",
        "summary": "Ayuda a entender",
        "languages": "Disponible en",
        "where": "Dónde encontrarla",
        "warning": "Advertencia que hay que indicar",
        "ask_audience": (
            "No sabemos en qué punto de sus estudios está el estudiante y algunas de estas "
            "obras declaran un público: pregúntaselo en una línea antes de proponer una, y "
            "elige en consecuencia."
        ),
        "no_sources": (
            "No hay ninguna fuente identificable en este turno: declara la ausencia, no cites "
            "ningún título, autor, DOI o enlace, y propón como máximo un tema para buscar."
        ),
        "sources_intro": (
            "Únicas fuentes citables en este turno (título — documento). No cites títulos, "
            "autores, DOI o enlaces que no aparezcan en esta lista, aunque figuren dentro de "
            "los documentos recuperados."
        ),
    },
    "fr": {
        "intro": (
            "Catalogue approuvé : ce sont les seules œuvres que tu peux recommander comme "
            "lecture, film ou matériel. Cite au maximum deux entrées, avec le titre et "
            "l'auteur exacts tels qu'ils figurent ici, et dis en une phrase ce qu'elles aident "
            "à comprendre. Si une entrée porte un avertissement, rapporte-le. N'ajoute aucun "
            "titre absent de cette liste."
        ),
        "synopsis": "De quoi il s'agit",
        "why": "Pourquoi",
        "summary": "Aide à comprendre",
        "languages": "Disponible en",
        "where": "Où la trouver",
        "warning": "Avertissement à rapporter",
        "ask_audience": (
            "Nous ne savons pas où en est l'élève dans ses études et certaines de ces œuvres "
            "déclarent un public : demande-le en une ligne avant d'en proposer une, et choisis "
            "en conséquence."
        ),
        "no_sources": (
            "Aucune source identifiable n'est disponible dans ce tour : déclare cette absence, "
            "ne cite aucun titre, auteur, DOI ou lien, et propose au plus un thème à chercher."
        ),
        "sources_intro": (
            "Seules sources citables dans ce tour (titre — document). Ne cite pas de titres, "
            "d'auteurs, de DOI ou de liens absents de cette liste, même s'ils apparaissent "
            "dans les documents récupérés."
        ),
    },
    "de": {
        "intro": (
            "Freigegebener Katalog: Nur diese Werke darfst du als Lektüre, Film oder Material "
            "empfehlen. Nenne höchstens zwei Einträge mit dem hier angegebenen Titel und Autor "
            "und sage in einem Satz, wobei sie helfen. Trägt ein Eintrag einen Hinweis, gib ihn "
            "weiter. Füge keine Titel hinzu, die hier nicht stehen."
        ),
        "synopsis": "Worum es geht",
        "why": "Warum",
        "summary": "Hilft zu verstehen",
        "languages": "Verfügbar auf",
        "where": "Wo zu finden",
        "warning": "Weiterzugebender Hinweis",
        "ask_audience": (
            "Wir wissen nicht, wie weit die Person im Studium ist, und einige dieser Werke "
            "nennen eine Zielgruppe: frag in einer Zeile nach, bevor du eines vorschlägst, und "
            "wähle entsprechend."
        ),
        "no_sources": (
            "In diesem Zug ist keine identifizierbare Quelle verfügbar: benenne das Fehlen, "
            "zitiere keinen Titel, keine Autorin, keine DOI und keinen Link, und schlage "
            "höchstens ein Thema zum Suchen vor."
        ),
        "sources_intro": (
            "Einzige zitierbare Quellen in diesem Zug (Titel — Dokument). Zitiere keine Titel, "
            "Autoren, DOIs oder Links, die hier fehlen, auch wenn sie in den abgerufenen "
            "Dokumenten vorkommen."
        ),
    },
    "sv": {
        "intro": (
            "Godkänd katalog: det här är de enda verk du får rekommendera som läsning, film "
            "eller material. Nämn högst två poster, med exakt titel och upphovsperson som de "
            "står här, och säg i en mening vad de hjälper till att förstå. Om en post har en "
            "varning, återge den. Lägg inte till titlar som saknas i listan."
        ),
        "synopsis": "Vad det handlar om",
        "why": "Varför",
        "summary": "Hjälper att förstå",
        "languages": "Finns på",
        "where": "Var den finns",
        "warning": "Varning att återge",
        "ask_audience": (
            "Vi vet inte hur långt studenten har kommit i sina studier och några av dessa verk "
            "anger en målgrupp: fråga på en rad innan du föreslår något, och välj därefter."
        ),
        "no_sources": (
            "Ingen identifierbar källa finns i den här turen: säg att den saknas, citera ingen "
            "titel, författare, DOI eller länk, och föreslå högst ett ämne att söka på."
        ),
        "sources_intro": (
            "Enda citerbara källor i den här turen (titel — dokument). Citera inte titlar, "
            "författare, DOI:er eller länkar som saknas i listan, även om de förekommer i de "
            "hämtade dokumenten."
        ),
    },
}


def frame(language: str) -> dict[str, str]:
    """Cornice nella lingua del turno; l'inglese e' il ripiego dichiarato."""
    return READING_FRAME.get((language or "").strip().lower(), READING_FRAME[FALLBACK_LANGUAGE])
