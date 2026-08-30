"""Seme minimo del catalogo delle letture certificate.

Idempotente: crea solo gli slug mancanti e non tocca le voci gia' presenti, come
il seed delle strategie. E' un punto di partenza verificabile, non un canone: il
catalogo vero lo costruiscono gli admin dal pannello.

I testi sono seminati in italiano e inglese; il campo e' JSON per lingua, quindi
le altre quattro si aggiungono dal pannello senza migrazioni.
"""
from __future__ import annotations

from typing import Any

SEED_CERTIFIED_READINGS: list[dict[str, Any]] = [
    # --- saggistica divulgativa ---
    {
        "slug": "dweck-mindset",
        "kind": "essay",
        "title": "Mindset. Cambiare forma mentis per raggiungere il successo",
        "original_title": "Mindset: The New Psychology of Success",
        "creators": ["Carol S. Dweck"],
        "year": 2006,
        "publisher": "Random House (ed. it. Franco Angeli)",
        "themes": ["fallimento-e-attribuzione", "fiducia-in-se", "motivazione-e-volizione"],
        "factor_codes": ["A3", "A4", "A6", "K5"],
        "audience": ["secondaria", "universita", "adulti"],
        "available_languages": ["it", "en", "es", "fr", "de", "sv"],
        "summary_i18n": {
            "it": "La differenza fra credere che l'intelligenza sia fissa e crederla allenabile, e come questa convinzione cambia il modo di reagire agli errori.",
            "en": "The difference between believing ability is fixed and believing it can grow, and how that belief changes the response to failure.",
        },
        "why_i18n": {
            "it": "Utile quando un risultato basso viene letto come un verdetto sulle proprie capacita' invece che su una strategia da cambiare.",
            "en": "Useful when a low score is read as a verdict on ability rather than on a strategy that can change.",
        },
        "where_to_find": "In libreria e in biblioteca; edizione italiana Franco Angeli.",
        "source_reference": "Dweck, C. S. (2006). Mindset: The New Psychology of Success. Random House.",
        "sort_order": 10,
    },
    {
        "slug": "oakley-mind-for-numbers",
        "kind": "essay",
        "title": "Impara a imparare",
        "original_title": "A Mind for Numbers",
        "creators": ["Barbara Oakley"],
        "year": 2014,
        "publisher": "TarcherPerigee (ed. it. Vallardi)",
        "themes": ["metodo-di-studio", "organizzazione-e-tempo"],
        "factor_codes": ["C1", "C2", "C5", "C7", "S4", "K4"],
        "audience": ["secondaria", "universita"],
        "available_languages": ["it", "en", "es", "de"],
        "summary_i18n": {
            "it": "Come funzionano attenzione diffusa e attenzione concentrata, e perche' distribuire lo studio nel tempo rende piu' di rileggere.",
            "en": "How focused and diffuse attention work, and why spacing study beats rereading.",
        },
        "why_i18n": {
            "it": "Da' una base concreta a chi studia molto ma con tecniche che non tengono, come la rilettura ripetuta.",
            "en": "Gives concrete grounding to a student who studies hard with techniques that do not hold, such as rereading.",
        },
        "where_to_find": "In libreria e in biblioteca; edizione italiana Vallardi.",
        "source_reference": "Oakley, B. (2014). A Mind for Numbers. TarcherPerigee.",
        "sort_order": 11,
    },
    {
        "slug": "duckworth-grit",
        "kind": "essay",
        "title": "Grit. La forza della passione e della perseveranza",
        "original_title": "Grit: The Power of Passion and Perseverance",
        "creators": ["Angela Duckworth"],
        "year": 2016,
        "publisher": "Scribner (ed. it. Giunti)",
        "themes": ["motivazione-e-volizione", "fiducia-in-se"],
        "factor_codes": ["A2", "A5", "S3", "K3"],
        "audience": ["secondaria", "universita", "adulti"],
        "available_languages": ["it", "en", "es", "fr", "de"],
        "summary_i18n": {
            "it": "Perche' la costanza su un interesse coltivato nel tempo pesa piu' del talento dichiarato.",
            "en": "Why sustained effort on a cultivated interest matters more than declared talent.",
        },
        "why_i18n": {
            "it": "Per chi parte con slancio e si ferma dopo pochi giorni, e legge questo come mancanza di talento.",
            "en": "For a student who starts strongly, stops after a few days, and reads that as lack of talent.",
        },
        "where_to_find": "In libreria e in biblioteca; edizione italiana Giunti.",
        "source_reference": "Duckworth, A. (2016). Grit. Scribner.",
        "sort_order": 12,
    },
    {
        "slug": "zimbardo-boyd-time-paradox",
        "kind": "essay",
        "title": "Il paradosso del tempo",
        "original_title": "The Time Paradox",
        "creators": ["Philip Zimbardo", "John Boyd"],
        "year": 2008,
        "publisher": "Free Press (ed. it. Mondadori)",
        "themes": ["tempo-e-memoria", "futuro-e-orientamento"],
        "factor_codes": ["T1", "T2", "T3", "T4", "T5"],
        "questionnaire_types": ["ZTPI"],
        "audience": ["secondaria", "universita", "adulti"],
        "available_languages": ["it", "en", "es"],
        "summary_i18n": {
            "it": "Le cinque prospettive temporali degli autori dello ZTPI, e come uno sbilanciamento verso il passato o il presente pesa sulle scelte.",
            "en": "The five time perspectives from the authors of the ZTPI, and how leaning too far into past or present shapes choices.",
        },
        "why_i18n": {
            "it": "E' il libro degli autori dello strumento: chiarisce da dove vengono i fattori del profilo temporale.",
            "en": "Written by the authors of the instrument: it explains where the time profile factors come from.",
        },
        "where_to_find": "In libreria e in biblioteca; edizione italiana Mondadori.",
        "source_reference": "Zimbardo, P. & Boyd, J. (2008). The Time Paradox. Free Press.",
        "sort_order": 13,
    },
    # --- articoli divulgati ---
    {
        "slug": "dunlosky-learning-techniques",
        "kind": "article",
        "title": "Improving Students' Learning With Effective Learning Techniques",
        "creators": ["John Dunlosky", "Katherine A. Rawson", "Elizabeth J. Marsh",
                     "Mitchell J. Nathan", "Daniel T. Willingham"],
        "year": 2013,
        "publisher": "Psychological Science in the Public Interest",
        "identifiers": {"doi": "10.1177/1529100612453266"},
        "themes": ["metodo-di-studio", "organizzazione-e-tempo"],
        "factor_codes": ["C1", "C2", "C5", "C7"],
        "audience": ["universita", "adulti"],
        "available_languages": ["en"],
        "summary_i18n": {
            "it": "La rassegna che mette in fila dieci tecniche di studio e dice quali reggono alla prova sperimentale: pratica di recupero e studio distribuito in testa.",
            "en": "The review that ranks ten study techniques by how well they hold up experimentally: retrieval practice and spacing come first.",
        },
        "why_i18n": {
            "it": "E' la fonte da cui vengono diverse strategie certificate del catalogo: utile a chi vuole vedere le prove dietro il consiglio.",
            "en": "It is the source behind several certified strategies in the catalog: for a student who wants the evidence behind the advice.",
        },
        "where_to_find": "Accesso aperto tramite il DOI indicato.",
        "source_reference": "Dunlosky et al. (2013), PSPI 14(1), 4-58.",
        "sort_order": 20,
    },
    {
        "slug": "ramirez-beilock-writing-worries",
        "kind": "article",
        "title": "Writing About Testing Worries Boosts Exam Performance in the Classroom",
        "creators": ["Gerardo Ramirez", "Sian L. Beilock"],
        "year": 2011,
        "publisher": "Science",
        "identifiers": {"doi": "10.1126/science.1199427"},
        "themes": ["ansia-e-prestazione", "emozioni"],
        "factor_codes": ["A1", "A7", "S1", "K2"],
        "audience": ["universita", "adulti"],
        "available_languages": ["en"],
        "summary_i18n": {
            "it": "Dieci minuti di scrittura sulle proprie preoccupazioni prima di una prova migliorano il risultato di chi soffre d'ansia da esame.",
            "en": "Ten minutes of writing about one's worries before a test improves the performance of test-anxious students.",
        },
        "why_i18n": {
            "it": "E' lo studio dietro la strategia certificata della scrittura espressiva prima della verifica.",
            "en": "It is the study behind the certified expressive-writing strategy used before a test.",
        },
        "where_to_find": "Tramite il DOI indicato; molte biblioteche universitarie hanno l'accesso.",
        "source_reference": "Ramirez, G. & Beilock, S. (2011). Science 331(6014), 211-213.",
        "sort_order": 21,
    },
    # --- narrativa ---
    {
        "slug": "pennac-diario-di-scuola",
        "kind": "fiction",
        "title": "Diario di scuola",
        "original_title": "Chagrin d'ecole",
        "creators": ["Daniel Pennac"],
        "year": 2007,
        "publisher": "Gallimard (ed. it. Feltrinelli)",
        "themes": ["fallimento-e-attribuzione", "identita-e-se", "fiducia-in-se"],
        "audience": ["secondaria", "universita", "adulti"],
        "available_languages": ["it", "fr", "en", "es", "de"],
        "summary_i18n": {
            "it": "Il racconto di un pessimo studente diventato scrittore e insegnante, dal punto di vista di chi a scuola si sentiva un caso perso.",
            "en": "The story of a hopeless pupil who became a writer and a teacher, told from inside the experience of feeling written off.",
        },
        "why_i18n": {
            "it": "Per chi ha smesso di credere di poter cambiare rendimento: mostra il vissuto, non la teoria dell'insuccesso scolastico.",
            "en": "For a student who has stopped believing performance can change: it shows the lived side of school failure, not the theory.",
        },
        "where_to_find": "In libreria e in biblioteca; edizione italiana Feltrinelli.",
        "source_reference": "Pennac, D. (2007). Chagrin d'ecole. Gallimard. Premio Renaudot 2007.",
        "sort_order": 30,
    },
    {
        "slug": "calvino-barone-rampante",
        "kind": "fiction",
        "title": "Il barone rampante",
        "creators": ["Italo Calvino"],
        "year": 1957,
        "publisher": "Einaudi",
        "themes": ["scelta-e-decisione", "identita-e-se"],
        "audience": ["secondaria", "universita", "adulti"],
        "available_languages": ["it", "en", "es", "fr", "de", "sv"],
        "summary_i18n": {
            "it": "Un ragazzo sale su un albero per non obbedire e decide di non scendere piu': una scelta tenuta per tutta la vita, con quello che costa e quello che apre.",
            "en": "A boy climbs a tree in refusal and decides never to come down: a single choice held for a lifetime, with everything it costs and opens.",
        },
        "why_i18n": {
            "it": "Per ragionare su che cosa significa tenere una decisione nel tempo, invece di viverla come un bivio istantaneo.",
            "en": "To think about what it means to hold a decision over time, rather than treat it as one instantaneous fork.",
        },
        "where_to_find": "In libreria e in biblioteca; edizione Einaudi o Mondadori.",
        "source_reference": "Calvino, I. (1957). Il barone rampante. Einaudi.",
        "sort_order": 31,
    },
    {
        "slug": "ferrante-amica-geniale",
        "kind": "fiction",
        "title": "L'amica geniale",
        "creators": ["Elena Ferrante"],
        "year": 2011,
        "publisher": "Edizioni E/O",
        "themes": ["transizione-scuola-universita", "identita-e-se", "relazioni-e-collaborazione"],
        "audience": ["secondaria", "universita", "adulti"],
        "available_languages": ["it", "en", "es", "fr", "de", "sv"],
        "summary_i18n": {
            "it": "Due bambine in un rione povero di Napoli: per una la scuola diventa la via d'uscita, per l'altra si chiude presto.",
            "en": "Two girls in a poor Naples neighbourhood: for one, school becomes the way out; for the other it closes early.",
        },
        "why_i18n": {
            "it": "Per chi vive lo studio come una porta stretta fra sé e la propria origine, e ne sente il peso.",
            "en": "For a student who experiences study as a narrow door between themselves and where they come from.",
        },
        "where_to_find": "In libreria e in biblioteca; edizioni E/O.",
        "source_reference": "Ferrante, E. (2011). L'amica geniale. Edizioni E/O.",
        "sort_order": 32,
    },
    # --- film e documentari ---
    {
        "slug": "bergman-posto-delle-fragole",
        "kind": "film",
        "title": "Il posto delle fragole",
        "original_title": "Smultronstallet",
        "creators": ["Ingmar Bergman"],
        "year": 1957,
        "publisher": "Svensk Filmindustri",
        "themes": ["tempo-e-memoria", "futuro-e-orientamento"],
        "factor_codes": ["T1", "T2"],
        "questionnaire_types": ["ZTPI"],
        "audience": ["universita", "adulti"],
        "available_languages": ["sv", "it", "en"],
        "summary_i18n": {
            "it": "Un anziano professore attraversa la Svezia per un premio e fa i conti con il proprio passato lungo la strada.",
            "en": "An elderly professor drives across Sweden to receive an award and settles accounts with his own past along the way.",
        },
        "why_i18n": {
            "it": "Mostra che cosa vuol dire guardare al passato con rimpianto invece che come a una risorsa: il tema centrale del profilo temporale.",
            "en": "It shows what it means to look at the past with regret rather than as a resource: the core question of the time profile.",
        },
        "where_to_find": "Disponibile in DVD e su piattaforme di cinema d'autore; spesso nelle mediateche.",
        "source_reference": "Bergman, I. (1957). Smultronstallet. Svensk Filmindustri.",
        "sort_order": 40,
    },
    {
        "slug": "weir-attimo-fuggente",
        "kind": "film",
        "title": "L'attimo fuggente",
        "original_title": "Dead Poets Society",
        "creators": ["Peter Weir"],
        "year": 1989,
        "publisher": "Touchstone Pictures",
        "themes": ["scelta-e-decisione", "identita-e-se", "futuro-e-orientamento"],
        "audience": ["secondaria", "universita", "adulti"],
        "available_languages": ["it", "en", "es", "fr", "de", "sv"],
        "is_sensitive": True,
        "content_warning": "Il film contiene il suicidio di un personaggio adolescente. Va proposto dicendolo prima, e non a chi sta portando in conversazione un disagio personale.",
        "summary_i18n": {
            "it": "In un collegio rigido un professore di lettere spinge i suoi studenti a decidere che vita vogliono, con conseguenze che non controlla.",
            "en": "In a strict boarding school a literature teacher pushes his students to decide what life they want, with consequences he cannot control.",
        },
        "why_i18n": {
            "it": "Per ragionare sul conflitto fra le attese della famiglia e la propria scelta di studio, senza far finta che sia un conflitto semplice.",
            "en": "To think about the conflict between family expectations and one's own choice of study, without pretending it is a simple one.",
        },
        "where_to_find": "Disponibile in DVD e sulle principali piattaforme.",
        "source_reference": "Weir, P. (1989). Dead Poets Society. Touchstone Pictures.",
        "sort_order": 41,
    },
    {
        "slug": "ted-duckworth-grit",
        "kind": "video",
        "title": "Grit: the power of passion and perseverance",
        "creators": ["Angela Duckworth"],
        "year": 2013,
        "publisher": "TED Talks Education",
        "themes": ["motivazione-e-volizione"],
        "factor_codes": ["A2", "A5", "S3"],
        "audience": ["secondaria", "universita"],
        "available_languages": ["en", "it", "es", "fr", "de", "sv"],
        "summary_i18n": {
            "it": "Sei minuti in cui l'autrice riassume la sua ricerca sulla perseveranza, con sottotitoli in molte lingue.",
            "en": "Six minutes in which the author sums up her research on perseverance, subtitled in many languages.",
        },
        "why_i18n": {
            "it": "Un primo passo breve per chi non vuole partire da un libro intero.",
            "en": "A short first step for a student who does not want to start with a whole book.",
        },
        "where_to_find": "Archivio TED, con trascrizione e sottotitoli.",
        "source_reference": "Duckworth, A. (2013). TED Talks Education.",
        "sort_order": 50,
    },
]


def seed_certified_readings(db, models_module) -> int:
    """Crea le letture mancanti. Idempotente: non tocca gli slug gia' presenti."""
    inserted = 0
    for spec in SEED_CERTIFIED_READINGS:
        exists = (
            db.query(models_module.CertifiedReading)
            .filter(models_module.CertifiedReading.slug == spec["slug"])
            .first()
        )
        if exists:
            continue
        data = dict(spec)
        db.add(models_module.CertifiedReading(
            certified_by="Seme iniziale del catalogo letture",
            # Nasce in bozza: la certificazione la da' l'admin dopo la verifica.
            status="draft",
            is_active=True,
            **data,
        ))
        inserted += 1
    if inserted:
        db.commit()
    return inserted
