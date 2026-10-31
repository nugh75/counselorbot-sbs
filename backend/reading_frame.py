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
        "intro": 'Catalogo approvato: queste opere, insieme alle fonti recuperate in questo turno, sono le sole che puoi proporre e citare. Scegli solo quelle che consigli effettivamente nella risposta e spiega il collegamento alla situazione dello studente. Le opere scelte compariranno nel pannello Raccomandazioni dopo la risposta. Non aggiungere opere assenti.',
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
            "Fonti recuperate in questo turno (titolo — documento): puoi proporle e citarle "
            "insieme al catalogo approvato. Non citare titoli, autori, DOI o link assenti "
            "da entrambi, nemmeno se compaiono dentro il testo dei documenti recuperati."
        ),
    },
    "en": {
        "intro": "Approved catalogue: these works, together with the sources retrieved in this turn, are the only ones you can propose and cite. Select only works you actually recommend in the reply and explain their connection to the student's situation. Selected works will appear in the Recommendations panel after the reply. Do not add absent works.",
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
            "Sources retrieved in this turn (title — document): you can propose and cite them "
            "together with the approved catalogue. Do not cite titles, authors, DOIs or links "
            "absent from both, even if they appear inside the retrieved documents."
        ),
    },
    "es": {
        "intro": 'Catálogo aprobado: estas obras, junto con las fuentes recuperadas en este turno, son las únicas que puedes proponer y citar. Selecciona solo las que realmente recomiendas en la respuesta y explica su relación con la situación del estudiante. Aparecerán en el panel de Recomendaciones después de la respuesta. No añadas obras ausentes.',
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
            "Fuentes recuperadas en este turno (título — documento): puedes proponerlas y "
            "citarlas junto con el catálogo aprobado. No cites títulos, autores, DOI o enlaces "
            "ausentes de ambos, aunque figuren dentro de los documentos recuperados."
        ),
    },
    "fr": {
        "intro": 'Catalogue approuvé : ces œuvres, avec les sources récupérées dans ce tour, sont les seules que tu peux proposer et citer. Sélectionne uniquement celles réellement recommandées dans la réponse et explique leur lien avec la situation de l’étudiant. Elles apparaîtront dans le panneau Recommandations après la réponse. N’ajoute aucune œuvre absente.',
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
            "Sources récupérées dans ce tour (titre — document) : tu peux les proposer et les "
            "citer avec le catalogue approuvé. Ne cite pas de titres, d'auteurs, de DOI ou de "
            "liens absents des deux, même s'ils apparaissent dans les documents récupérés."
        ),
    },
    "de": {
        "intro": 'Genehmigter Katalog: Nur diese Werke und die in diesem Zug abgerufenen Quellen darfst du vorschlagen und zitieren. Wähle nur Werke, die du in der Antwort tatsächlich empfiehlst, und erkläre ihren Bezug zur Situation der lernenden Person. Sie erscheinen nach der Antwort im Empfehlungsbereich. Füge keine anderen Werke hinzu.',
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
            "In diesem Zug abgerufene Quellen (Titel — Dokument): Du kannst sie zusammen mit "
            "dem genehmigten Katalog vorschlagen und zitieren. Zitiere keine Titel, Autoren, "
            "DOIs oder Links, die in beiden fehlen, auch wenn sie in den abgerufenen Dokumenten vorkommen."
        ),
    },
    "sv": {
        "intro": 'Godkänd katalog: endast dessa verk och källorna som hämtats i den här turen får föreslås och citeras. Välj bara verk som du faktiskt rekommenderar i svaret och förklara kopplingen till studentens situation. De visas i rekommendationspanelen efter svaret. Lägg inte till andra verk.',
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
            "Källor som hämtats i den här turen (titel — dokument): du kan föreslå och citera "
            "dem tillsammans med den godkända katalogen. Citera inte titlar, författare, DOI:er "
            "eller länkar som saknas i båda, även om de förekommer i de hämtade dokumenten."
        ),
    },
}


def frame(language: str) -> dict[str, str]:
    """Cornice nella lingua del turno; l'inglese e' il ripiego dichiarato."""
    return READING_FRAME.get((language or "").strip().lower(), READING_FRAME[FALLBACK_LANGUAGE])
