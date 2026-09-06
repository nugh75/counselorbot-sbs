"""Seed idempotente del catalogo `certified_strategies`.

Le strategie sono modificabili dagli admin: il seed crea solo gli slug mancanti e
non sovrascrive mai righe già presenti.
"""
from __future__ import annotations

from typing import Any


OTTONE_QSA_SOURCE = (
    "Schede sui fattori del QSA (E. Ottone, APPRENDO, 2017; QSA di M. Pellerey, "
    "LAS 1996); testo integrale: "
    "docs/fonti/competenze-strategiche/.../03_Schede_fattori_QSA_testo_integrale.md."
)

EVIDENCE_SOURCE = (
    "Dunlosky, Rawson, Marsh, Nathan & Willingham (2013), Improving Students' "
    "Learning With Effective Learning Techniques; The Learning Scientists, six "
    "strategies for effective learning."
)

PREVIEW_SOURCE = (
    "Proposta utente; UNC Learning Center, Reading Textbooks Effectively; Stanford "
    "CTL, SQ3R Method; letteratura su pre-questioning/pretesting."
)

MULTIMEDIA_SOURCE = (
    "Proposta utente; Mayer, multimedia learning / dual coding; The Learning "
    "Scientists, dual coding."
)

WIDE_READING_SOURCE = (
    "Proposta utente; National Reading Panel, wide reading/background knowledge; "
    "UNC Learning Center, active reading."
)


QPCS_SOURCE = (
    "Pellerey, Questionario di Percezione delle proprie Competenze Strategiche "
    "(QPCS); scheda docs/questionari/strumenti/schede-bibliografiche/QPCS_it.md."
)

QPCC_SOURCE = (
    "Pellerey & Orio (2001), Questionario di percezione delle proprie competenze "
    "e convinzioni (QPCC), Ed. Lavoro; scheda "
    "docs/questionari/strumenti/schede-bibliografiche/QPCC_it.md."
)

QAP_SOURCE = (
    "Savickas & Porfeli, Career Adapt-Abilities Scale (CAAS); adattamento "
    "italiano QAP (Pellerey, Margottini, Leproni); scheda "
    "docs/questionari/strumenti/schede-bibliografiche/QAP_it.md."
)

ZTPI_SOURCE = (
    "Zimbardo & Boyd, Il paradosso del tempo (Mondadori, 2009); scheda "
    "docs/questionari/strumenti/schede-bibliografiche/ZTPI_it.md."
)


DEFAULT_CERTIFIED_STRATEGIES: list[dict[str, Any]] = [
    {
        "slug": "qsa-elaborative-links",
        "name_it": "Collegamenti ed esempi (strategie elaborative)",
        "recommended_when_it": "Quando C1 (strategie elaborative) e' un'area di crescita.",
        "description_it": (
            "Collegare i nuovi concetti a esempi, esperienze personali, immagini e analogie, "
            "ripetere mentalmente e selezionare progressivamente gli elementi fondamentali "
            "del discorso collegandoli tra loro."
        ),
        "factor_codes": ["C1", "C1r"],
        "questionnaire_types": ["QSA", "QSAr"],
        "keywords": "C1 strategie elaborative collegamenti esempi analogie immagini",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": f"{OTTONE_QSA_SOURCE} {EVIDENCE_SOURCE}",
        "sort_order": 0,
    },
    {
        "slug": "qsa-semantic-organizers",
        "name_it": "Schemi e mappe (organizzatori semantici)",
        "recommended_when_it": "Quando C5 (uso di organizzatori semantici) e' un'area di crescita.",
        "description_it": (
            "Usare organizzatori semantici grafici (schemi, tabelle, diagrammi, mappe "
            "concettuali) per organizzare in modo coerente quanto si studia, facilitare "
            "la memorizzazione e favorire la capacità di risolvere problemi."
        ),
        "factor_codes": ["C5", "C3r"],
        "questionnaire_types": ["QSA", "QSAr"],
        "keywords": "C5 organizzatori semantici schemi mappe tabelle dual-coding",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": f"{OTTONE_QSA_SOURCE} {EVIDENCE_SOURCE}",
        "sort_order": 1,
    },
    {
        "slug": "qsa-self-questioning",
        "name_it": "Autointerrogazione",
        "recommended_when_it": "Quando C7 (autointerrogazione) e' un'area di crescita.",
        "description_it": (
            "Porsi domande mentre si studia e in classe: anticipare le domande "
            "dell'insegnante, annotarle quando i compagni sono interrogati e usare le "
            "domande del testo per comprendere e ricordare i concetti."
        ),
        "factor_codes": ["C7"],
        "questionnaire_types": ["QSA"],
        "keywords": "C7 autointerrogazione retrieval practice domande verifica",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": f"{OTTONE_QSA_SOURCE} {EVIDENCE_SOURCE}",
        "sort_order": 2,
    },
    {
        "slug": "qsa-disorientation-structure",
        "name_it": "Dare struttura allo studio",
        "recommended_when_it": "Quando emerge disorientamento (C3 elevato).",
        "description_it": (
            "Organizzare e gestire efficacemente il materiale da studiare, il tempo a "
            "disposizione e l'ambiente di studio."
        ),
        "factor_codes": ["C3"],
        "questionnaire_types": ["QSA"],
        "keywords": "C3 disorientamento organizzazione materiale tempo ambiente",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": f"{OTTONE_QSA_SOURCE} {EVIDENCE_SOURCE}",
        "sort_order": 3,
    },
    {
        "slug": "qsa-collaboration-openness",
        "name_it": "Apertura allo studio collaborativo",
        "recommended_when_it": "Quando C4 (disponibilita' alla collaborazione) e' un'area di crescita.",
        "description_it": (
            "Valorizzare lo studio con altri per comprendere meglio quanto si studia, "
            "migliorare l'apprendimento e imparare a lavorare in gruppo."
        ),
        "factor_codes": ["C4"],
        "questionnaire_types": ["QSA"],
        "keywords": "C4 collaborazione studio di gruppo confronto compagni",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": f"{OTTONE_QSA_SOURCE} {EVIDENCE_SOURCE}",
        "sort_order": 4,
    },
    {
        "slug": "qsa-anxiety-regulation",
        "name_it": "Gestione dell'ansia da prestazione",
        "recommended_when_it": "Quando A1 (ansieta' di base) e' un'area di crescita.",
        "description_it": (
            "Ricondurre l'ansia eccessiva a una dimensione gestibile riflettendo sugli "
            "elementi che la provocano, ricordando che una tensione moderata aiuta mentre "
            "un'eccitazione eccessiva blocca la prestazione, e offrendo rassicurazione e "
            "incoraggiamento."
        ),
        "factor_codes": ["A1", "A1r"],
        "questionnaire_types": ["QSA", "QSAr"],
        "keywords": "A1 ansieta tensione interrogazioni gestione emozioni respirazione",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": f"{OTTONE_QSA_SOURCE} {EVIDENCE_SOURCE}",
        "sort_order": 5,
    },
    {
        "slug": "qsa-emotional-interference",
        "name_it": "Gestione delle interferenze emotive",
        "recommended_when_it": "Quando A7 (interferenze emotive) e' un'area di crescita.",
        "description_it": (
            "Riflettere sulle situazioni che provocano reazioni emotive intense e "
            "inquietudine diffusa, per imparare a conoscere e gestire le proprie emozioni "
            "e vivere con serenità gli impegni scolastici."
        ),
        "factor_codes": ["A7"],
        "questionnaire_types": ["QSA"],
        "keywords": "A7 interferenze emotive umore concentrazione",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": f"{OTTONE_QSA_SOURCE} {EVIDENCE_SOURCE}",
        "sort_order": 6,
    },
    {
        "slug": "qsa-perseverance-small-goals",
        "name_it": "Perseveranza e piccoli obiettivi",
        "recommended_when_it": "Quando A5 (mancanza di perseveranza) e' un'area di crescita.",
        "description_it": (
            "Analizzare le cause della scarsa perseveranza (segno di demotivazione) e "
            "individuare strategie cognitive e motivazionali, ad esempio proporsi "
            "obiettivi accessibili e raggiungibili in breve tempo."
        ),
        "factor_codes": ["A5"],
        "questionnaire_types": ["QSA"],
        "keywords": "A5 perseveranza demotivazione obiettivi accessibili difficolta",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": f"{OTTONE_QSA_SOURCE} {EVIDENCE_SOURCE}",
        "sort_order": 7,
    },
    {
        "slug": "qsa-growth-mindset-attribution",
        "name_it": "Attribuzioni e mentalita' di crescita",
        "recommended_when_it": (
            "Quando A3 (attribuzione a cause controllabili) e' un'area di crescita o A4 "
            "(cause incontrollabili) e' elevata."
        ),
        "description_it": (
            "Diventare consapevoli delle spiegazioni che si attribuiscono a successi e "
            "insuccessi e passare da una visione statica a una dinamica dell'intelligenza, "
            "che migliora nel tempo con esercizio e impegno costante."
        ),
        "factor_codes": ["A3", "A4", "A3r"],
        "questionnaire_types": ["QSA", "QSAr"],
        "keywords": "A3 A4 attribuzioni impegno intelligenza mindset controllabili",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": f"{OTTONE_QSA_SOURCE} {EVIDENCE_SOURCE}",
        "sort_order": 8,
    },
    {
        "slug": "qsa-perceived-competence",
        "name_it": "Percezione di competenza",
        "recommended_when_it": "Quando A6 (percezione di competenza) e' un'area di crescita.",
        "description_it": (
            "Valorizzare un risultato concreto già ottenuto e alimentare il circolo "
            "responsabilità - soddisfazione - stima di sé - percezione di competenza - "
            "nuova responsabilità, evitando rassicurazioni generiche."
        ),
        "factor_codes": ["A6", "A4r"],
        "questionnaire_types": ["QSA", "QSAr"],
        "keywords": "A6 percezione di competenza fiducia motivazione successo",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": f"{OTTONE_QSA_SOURCE} {EVIDENCE_SOURCE}",
        "sort_order": 9,
    },
    {
        "slug": "qsa-self-regulation-plan-check",
        "name_it": "Pianificare e verificare lo studio",
        "recommended_when_it": "Quando C2 (autoregolazione) è un'area di crescita.",
        "description_it": (
            "Pianificare e organizzare lo studio in base al tempo disponibile, tenere sotto "
            "controllo le proprie azioni (prendere e risistemare gli appunti, segnare sul "
            "testo le cose importanti) e a fine sessione verificare cosa ha funzionato per "
            "regolare il passo successivo."
        ),
        "factor_codes": ["C2", "C2r"],
        "questionnaire_types": ["QSA", "QSAr"],
        "keywords": "C2 autoregolazione pianificazione monitoraggio obiettivo verifica",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": f"{OTTONE_QSA_SOURCE} {EVIDENCE_SOURCE}",
        "sort_order": 10,
    },
    {
        "slug": "qsa-concentration-environment",
        "name_it": "Ridurre le distrazioni e studiare a intervalli",
        "recommended_when_it": "Quando emerge difficoltà di concentrazione (C6 elevato).",
        "description_it": (
            "Eliminare le fonti di distrazione e ridurre l'eccessiva esposizione a TV, "
            "computer e videogiochi, chiarire l'obiettivo di ciascuna attività e pianificare "
            "il tempo, partendo da un intervallo di studio breve da estendere solo se regge."
        ),
        "factor_codes": ["C6", "C4r"],
        "questionnaire_types": ["QSA", "QSAr"],
        "keywords": "C6 concentrazione distrazioni ambiente intervalli attenzione",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": f"{OTTONE_QSA_SOURCE} {EVIDENCE_SOURCE}",
        "sort_order": 11,
    },
    {
        "slug": "qsa-volition-protect-intention",
        "name_it": "Proteggere l'intenzione di studiare",
        "recommended_when_it": "Quando A2 (volizione) è un'area di crescita.",
        "description_it": (
            "Prendere coscienza delle difficoltà che frenano l'impegno e proteggere la "
            "motivazione da interessi alternativi, stanchezza e frustrazione, riflettendo "
            "sul valore assegnato agli obiettivi; fissare quando e dove studiare e una "
            "micro-regola per riprendere dopo un'interruzione."
        ),
        "factor_codes": ["A2", "A2r"],
        "questionnaire_types": ["QSA", "QSAr"],
        "keywords": "A2 volizione intenzione rinvio distrazioni costanza ripresa",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": f"{OTTONE_QSA_SOURCE} {EVIDENCE_SOURCE}",
        "sort_order": 12,
    },
    {
        "slug": "qsa-retrieval-practice",
        "name_it": "Pratica di recupero (test su se stessi)",
        "recommended_when_it": (
            "Quando C7 (autointerrogazione) o C2 (autoregolazione) risulta un'area di crescita."
        ),
        "description_it": (
            "A libro chiuso, provare a ripetere o riscrivere a memoria i punti chiave, poi "
            "controllare; ripassare a distanza i punti non ricordati. Più efficace della "
            "semplice rilettura."
        ),
        "factor_codes": ["C7", "C2", "C2r"],
        "questionnaire_types": ["QSA", "QSAr"],
        "keywords": "C7 C2 recupero memoria autoverifica test rievocazione ripasso",
        "certified_by": "Evidence-based (ricerca cognitiva applicata allo studio)",
        "source_reference": "Dunlosky et al. (2013), practice testing (high utility); The Learning Scientists (retrieval practice).",
        "sort_order": 13,
    },
    {
        "slug": "qsa-spaced-practice",
        "name_it": "Studio distribuito nel tempo",
        "recommended_when_it": (
            "Quando C2 (autoregolazione) è un'area di crescita o serve sostenere l'impegno "
            "nel tempo (A5)."
        ),
        "description_it": (
            "Distribuire lo studio in più sessioni brevi su giorni diversi invece di un'unica "
            "sessione lunga; pianificare brevi ripassi a distanza."
        ),
        "factor_codes": ["C2", "A5", "C2r"],
        "questionnaire_types": ["QSA", "QSAr"],
        "keywords": "C2 A5 distribuito spaziato ripasso pianificazione sessioni tempo",
        "certified_by": "Evidence-based (ricerca cognitiva applicata allo studio)",
        "source_reference": "Dunlosky et al. (2013), distributed practice (high utility); The Learning Scientists (spaced practice).",
        "sort_order": 14,
    },
    {
        "slug": "qsa-active-preview-predict",
        "name_it": "Anteprima attiva e ipotesi prima dello studio",
        "recommended_when_it": (
            "Quando C2 (autoregolazione), C5 (uso di organizzatori semantici) o C7 "
            "(autointerrogazione) è un'area di crescita."
        ),
        "description_it": (
            "Prima di leggere in dettaglio, osservare titoli, sottotitoli, parole in "
            "grassetto, figure, sommario e domande finali; scrivere tre domande e una "
            "ipotesi su cosa sarà importante, poi studiare verificando se l'ipotesi regge."
        ),
        "factor_codes": ["C2", "C5", "C7", "C2r", "C3r"],
        "questionnaire_types": ["QSA", "QSAr"],
        "keywords": "C2 C5 C7 anteprima titoli grassetto parole chiave ipotesi preview SQ3R prequestioning",
        "certified_by": "Evidence-informed + proposta utente",
        "source_reference": PREVIEW_SOURCE,
        "sort_order": 20,
    },
    {
        "slug": "qsa-focused-wide-reading",
        "name_it": "Lettura ampia ma focalizzata",
        "recommended_when_it": "Quando C1 (strategie elaborative) è un'area di crescita.",
        "description_it": (
            "Leggere materiale vario sullo stesso tema (manuale, appunti, breve articolo o "
            "fonte diversa), poi chiudere con un prodotto concreto: un collegamento, una "
            "differenza tra fonti e un esempio nuovo. L'obiettivo non è accumulare pagine, "
            "ma costruire più agganci per capire e ricordare."
        ),
        "factor_codes": ["C1", "C1r"],
        "questionnaire_types": ["QSA", "QSAr"],
        "keywords": "C1 lettura ampia leggere molto fonti diverse background knowledge collegamenti esempi",
        "certified_by": "Evidence-informed + proposta utente",
        "source_reference": WIDE_READING_SOURCE,
        "sort_order": 21,
    },
    {
        "slug": "qsa-multimodal-dual-coding",
        "name_it": "Materiali diversi integrati in uno schema",
        "recommended_when_it": (
            "Quando C1 (strategie elaborative) o C5 (uso di organizzatori semantici) è "
            "un'area di crescita."
        ),
        "description_it": (
            "Usare più canali (testo, video, audio, immagini) solo se alla fine vengono "
            "integrati: costruire una mappa, tabella o schema unico che collega parole, "
            "immagini ed esempi. Evitare di sostituire lo studio con la sola visione passiva "
            "di un video."
        ),
        "factor_codes": ["C1", "C5", "C1r", "C3r"],
        "questionnaire_types": ["QSA", "QSAr"],
        "keywords": "C1 C5 video audio immagini dual coding multimediale schema mappa materiali diversi",
        "certified_by": "Evidence-informed + proposta utente",
        "source_reference": MULTIMEDIA_SOURCE,
        "sort_order": 22,
    },
    {
        "slug": "qsa-interleaved-practice",
        "name_it": "Esercizio intervallato tra tipi diversi",
        "recommended_when_it": (
            "Quando C2 (autoregolazione) o C7 (autointerrogazione) è un'area di crescita, "
            "specialmente se lo studente confonde concetti o esercizi simili."
        ),
        "description_it": (
            "Dopo una prima fase di esercizi simili, mescolare tipi diversi di domande o "
            "problemi e chiedersi ogni volta: che tipo di compito è questo e perché? Serve a "
            "riconoscere quando applicare una procedura, non solo a ripeterla."
        ),
        "factor_codes": ["C2", "C7", "C2r"],
        "questionnaire_types": ["QSA", "QSAr"],
        "keywords": "C2 C7 interleaving esercizi misti discriminare problemi confronto autoverifica",
        "certified_by": "Evidence-based (ricerca cognitiva applicata allo studio)",
        "source_reference": f"{EVIDENCE_SOURCE} Rohrer & Taylor, interleaved practice.",
        "sort_order": 23,
    },
    {
        "slug": "qsa-self-explanation-teach-back",
        "name_it": "Auto-spiegazione e spiegazione a un compagno",
        "recommended_when_it": (
            "Quando C1 (strategie elaborative), C7 (autointerrogazione) o C4 "
            "(disponibilità alla collaborazione) è un'area di crescita."
        ),
        "description_it": (
            "Spiegare ad alta voce un concetto come se lo si insegnasse a un compagno; "
            "segnare i punti in cui la spiegazione si blocca e tornare solo su quelli. "
            "Quando possibile, fare il controllo con un compagno che faccia domande brevi."
        ),
        "factor_codes": ["C1", "C7", "C4", "C1r"],
        "questionnaire_types": ["QSA", "QSAr"],
        "keywords": "C1 C7 C4 auto spiegazione teach back spiegare compagno elaborazione domande",
        "certified_by": "Evidence-based (ricerca cognitiva applicata allo studio)",
        "source_reference": "Dunlosky et al. (2013), self-explanation; Chi et al., self-explanation; The Learning Scientists, elaboration.",
        "sort_order": 24,
    },
    {
        "slug": "qsa-concrete-examples-nonexamples",
        "name_it": "Esempi concreti e non-esempi",
        "recommended_when_it": (
            "Quando C1 (strategie elaborative) o C5 (uso di organizzatori semantici) è "
            "un'area di crescita."
        ),
        "description_it": (
            "Per ogni definizione o regola, trovare due esempi concreti e un non-esempio; "
            "scrivere in una frase perché il non-esempio non rientra nel concetto. Questo "
            "costringe a chiarire i confini dell'idea studiata."
        ),
        "factor_codes": ["C1", "C5", "C1r", "C3r"],
        "questionnaire_types": ["QSA", "QSAr"],
        "keywords": "C1 C5 esempi concreti non esempi elaborazione definizioni concetti confini",
        "certified_by": "Evidence-based (ricerca cognitiva applicata allo studio)",
        "source_reference": "The Learning Scientists, concrete examples; Dunlosky et al. (2013), elaborative interrogation.",
        "sort_order": 25,
    },
    {
        "slug": "qsa-memory-map-check",
        "name_it": "Mappa da memoria e controllo dei buchi",
        "recommended_when_it": (
            "Quando C5 (uso di organizzatori semantici) o C7 (autointerrogazione) è "
            "un'area di crescita."
        ),
        "description_it": (
            "Dopo una lettura o una spiegazione, chiudere il materiale e costruire una mappa "
            "da memoria; riaprire solo dopo per correggere, aggiungere i collegamenti mancanti "
            "e trasformare i buchi in domande di ripasso."
        ),
        "factor_codes": ["C5", "C7", "C3r"],
        "questionnaire_types": ["QSA", "QSAr"],
        "keywords": "C5 C7 mappa memoria schema recupero buchi controllo organizzatori",
        "certified_by": "Evidence-informed (retrieval + organizzatori semantici)",
        "source_reference": f"{EVIDENCE_SOURCE} Letteratura su concept mapping e retrieval practice.",
        "sort_order": 26,
    },
    {
        "slug": "qsa-error-log-control",
        "name_it": "Registro degli errori controllabili",
        "recommended_when_it": (
            "Quando A3 (attribuzione a cause controllabili), A4 (attribuzione a cause "
            "incontrollabili) o A6 (percezione di competenza) è un'area di crescita."
        ),
        "description_it": (
            "Dopo esercizi, interrogazioni o verifiche, annotare un errore alla volta con tre "
            "campi: cosa è successo, quale causa controllabile posso correggere, quale "
            "micro-azione provo la prossima volta. Chiudere registrando anche un progresso "
            "osservabile."
        ),
        "factor_codes": ["A3", "A4", "A6", "A3r", "A4r"],
        "questionnaire_types": ["QSA", "QSAr"],
        "keywords": "A3 A4 A6 errori cause controllabili correzione fiducia competenza progresso",
        "certified_by": "Evidence-informed + fonti competenze strategiche",
        "source_reference": f"{OTTONE_QSA_SOURCE} Self-regulated learning e attribuzioni controllabili.",
        "sort_order": 27,
    },
    {
        "slug": "ztpi-past-negative-reframe",
        "name_it": "Rilettura del passato negativo",
        "recommended_when_it": "Quando il Passato Negativo (T1) e' elevato.",
        "description_it": (
            "Accogliere senza minimizzare e aiutare a rileggere un'esperienza passata "
            "cercando anche cio' che se ne e' imparato, senza forzare un tono positivo."
        ),
        "factor_codes": ["T1"],
        "questionnaire_types": ["ZTPI"],
        "keywords": "T1 passato negativo rilettura rimpianti risorse",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": "Zimbardo & Boyd, Balanced Time Perspective (ZTPI).",
        "sort_order": 100,
    },
    {
        "slug": "ztpi-fatalism-agency",
        "name_it": "Ridurre il fatalismo, costruire agentivita'",
        "recommended_when_it": "Quando il Presente Fatalistico (T4) e' elevato.",
        "description_it": (
            "Individuare un piccolo ambito in cui la persona puo' comunque influire con una "
            "scelta concreta, per ridurre il senso di impotenza."
        ),
        "factor_codes": ["T4"],
        "questionnaire_types": ["ZTPI"],
        "keywords": "T4 presente fatalistico controllo agentivita scelte",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": "Zimbardo & Boyd, Balanced Time Perspective (ZTPI).",
        "sort_order": 101,
    },
    {
        "slug": "ztpi-future-without-losing-present",
        "name_it": "Futuro senza perdere il presente",
        "recommended_when_it": "Quando si rafforza l'orientamento al Futuro (T5).",
        "description_it": (
            "Collegare l'obiettivo a uno spazio che mantenga anche il piacere del presente "
            "(T3), evitando una pianificazione che sacrifichi del tutto il presente."
        ),
        "factor_codes": ["T5", "T3"],
        "questionnaire_types": ["ZTPI"],
        "keywords": "T5 T3 futuro presente edonistico obiettivi piacere equilibrio",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": "Zimbardo & Boyd, Balanced Time Perspective (ZTPI).",
        "sort_order": 102,
    },
    {
        "slug": "savickas-narrative-theme",
        "name_it": "Tema narrativo",
        "recommended_when_it": "Durante l'intervista Savickas, raccogliendo le risposte come micro-narrazioni.",
        "description_it": (
            "Trattare le risposte come micro-narrazioni da collegare in un tema ricorrente, "
            "riflettendo al ragazzo le sue stesse parole; non interpretare come diagnosi ma "
            "come prompt di riflessione."
        ),
        "factor_codes": [],
        "questionnaire_types": ["SAVICKAS"],
        "keywords": "tema di vita micro-narrazioni storia identita preoccupazione",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": "Savickas, Career Construction Interview / Life Design.",
        "sort_order": 110,
    },
    {
        "slug": "savickas-models-to-self",
        "name_it": "Dai modelli di ruolo al se'",
        "recommended_when_it": "Quando emergono figure ammirate / modelli di ruolo.",
        "description_it": (
            "Far emergere le qualita' che il ragazzo riconosce e desidera per se', come "
            "indizio di come affronta la propria sfida personale."
        ),
        "factor_codes": [],
        "questionnaire_types": ["SAVICKAS"],
        "keywords": "modelli di ruolo eroi qualita se soluzione",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": "Savickas, Career Construction Interview / Life Design.",
        "sort_order": 111,
    },
    {
        "slug": "savickas-motto-and-step",
        "name_it": "Dal motto al passo concreto",
        "recommended_when_it": "Verso la fine del percorso Savickas, a partire dal motto/consiglio preferito.",
        "description_it": (
            "Usare il motto come auto-consiglio del ragazzo e tradurlo in un solo passo "
            "concreto e verificabile coerente con il tema emerso."
        ),
        "factor_codes": [],
        "questionnaire_types": ["SAVICKAS"],
        "keywords": "motto consiglio a se prossimo passo azione",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": "Savickas, Career Construction Interview / Life Design.",
        "sort_order": 112,
    },
    {
        "slug": "qpcs-emotion-regulation",
        "name_it": "Routine per la tensione prima della prova",
        "recommended_when_it": "Quando S1 (gestione delle emozioni) e' un'area di crescita.",
        "description_it": (
            "Preparare una routine breve e ripetibile prima di una verifica: respirazione "
            "lenta, riordino del materiale e una frase che riporti l'attenzione al compito "
            "invece che al giudizio; dopo la prova annotare quanto la tensione ha inciso "
            "davvero sul risultato."
        ),
        "factor_codes": ["S1"],
        "questionnaire_types": ["QPCS"],
        "keywords": "S1 emozioni ansia tensione prova respirazione routine",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": QPCS_SOURCE,
        "sort_order": 120,
    },
    {
        "slug": "qpcs-ask-and-explain",
        "name_it": "Chiedere aiuto e rispiegare",
        "recommended_when_it": "Quando S2 (competenza comunicativa) e' un'area di crescita.",
        "description_it": (
            "Allenare la comunicazione su un compito reale: preparare in anticipo una domanda "
            "precisa da rivolgere al docente o a un compagno e provare a rispiegare a voce un "
            "concetto appena studiato, notando dove la spiegazione si inceppa."
        ),
        "factor_codes": ["S2"],
        "questionnaire_types": ["QPCS"],
        "keywords": "S2 comunicazione chiedere aiuto spiegare gruppo ascolto",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": QPCS_SOURCE,
        "sort_order": 121,
    },
    {
        "slug": "qpcs-perseverance-microsteps",
        "name_it": "Passi brevi e punto di ripresa",
        "recommended_when_it": "Quando S3 (volonta' e perseveranza) e' un'area di crescita.",
        "description_it": (
            "Scomporre il compito lungo in passi da venti-venticinque minuti, ciascuno con un "
            "obiettivo dichiarato, e decidere in anticipo il punto da cui riprendere dopo "
            "l'interruzione, cosi' la ripartenza non dipende dalla motivazione del momento."
        ),
        "factor_codes": ["S3"],
        "questionnaire_types": ["QPCS"],
        "keywords": "S3 perseveranza volonta tempo scadenze passi obiettivi",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": QPCS_SOURCE,
        "sort_order": 122,
    },
    {
        "slug": "qpcs-strategy-mix",
        "name_it": "Variare le strategie e distribuirle nel tempo",
        "recommended_when_it": "Quando S4 (strategie e collaborazione) e' un'area di crescita.",
        "description_it": (
            "Alternare le strategie in base al materiale invece di rileggere sempre: recupero "
            "attivo dai propri appunti, ripasso distribuito a distanza di giorni e una "
            "revisione condivisa con un compagno per verificare cio' che si e' capito."
        ),
        "factor_codes": ["S4"],
        "questionnaire_types": ["QPCS"],
        "keywords": "S4 strategie studio appunti ripasso collaborazione gruppo",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": f"{QPCS_SOURCE} {EVIDENCE_SOURCE}",
        "sort_order": 123,
    },
    {
        "slug": "qpcs-life-project-step",
        "name_it": "Dal progetto lontano al passo della settimana",
        "recommended_when_it": "Quando S5 (fiducia e progetto di vita) e' un'area di crescita.",
        "description_it": (
            "Tradurre un obiettivo formativo lontano in un passo verificabile entro la "
            "settimana, collegandolo a una capacita' che lo studente si riconosce gia', e "
            "fissare come capira' di averlo compiuto."
        ),
        "factor_codes": ["S5"],
        "questionnaire_types": ["QPCS"],
        "keywords": "S5 fiducia progetto di vita futuro obiettivi decisione",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": QPCS_SOURCE,
        "sort_order": 124,
    },
    {
        "slug": "qpcc-public-speaking-rehearsal",
        "name_it": "Esporre per gradi",
        "recommended_when_it": "Quando K1 (parlare in pubblico) e' un'area di crescita.",
        "description_it": (
            "Preparare l'esposizione per gradi: una scaletta di tre punti, una prova a voce "
            "alta da soli, poi una davanti a una persona di fiducia, spostando l'attenzione "
            "dal timore del giudizio al messaggio da far arrivare."
        ),
        "factor_codes": ["K1"],
        "questionnaire_types": ["QPCC"],
        "keywords": "K1 parlare in pubblico esposizione presentazione ansia da prestazione",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": QPCC_SOURCE,
        "sort_order": 130,
    },
    {
        "slug": "qpcc-pressure-and-responsibility",
        "name_it": "Separare cio' che dipende da se'",
        "recommended_when_it": "Quando K2 (gestione dell'ansia e responsabilita') e' un'area di crescita.",
        "description_it": (
            "Davanti a una decisione che pesa, distinguere per iscritto cio' che dipende dalla "
            "propria scelta da cio' che non dipende, agire solo sulla prima colonna e fissare "
            "quando la decisione verra' rivista."
        ),
        "factor_codes": ["K2"],
        "questionnaire_types": ["QPCC"],
        "keywords": "K2 ansia pressione responsabilita decisioni stress controllo",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": QPCC_SOURCE,
        "sort_order": 131,
    },
    {
        "slug": "qpcc-goal-monitoring",
        "name_it": "Obiettivo della settimana e verifica",
        "recommended_when_it": "Quando K3 (volonta' e autoregolazione) e' un'area di crescita.",
        "description_it": (
            "Fissare un obiettivo verificabile per la settimana e un momento fisso di "
            "verifica in cui annotare che cosa ha funzionato, che cosa va cambiato e quale "
            "sara' l'aggiustamento concreto."
        ),
        "factor_codes": ["K3"],
        "questionnaire_types": ["QPCC"],
        "keywords": "K3 autoregolazione obiettivi priorita monitoraggio riflessione",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": QPCC_SOURCE,
        "sort_order": 132,
    },
    {
        "slug": "qpcc-elaboration-links",
        "name_it": "Collegare, esemplificare, verificare",
        "recommended_when_it": "Quando K4 (strategie di elaborazione) e' un'area di crescita.",
        "description_it": (
            "Collegare il nuovo contenuto a qualcosa di gia' noto con un esempio proprio e "
            "un'analogia, poi verificare la comprensione riformulandolo senza guardare il "
            "testo e controllando solo dopo."
        ),
        "factor_codes": ["K4"],
        "questionnaire_types": ["QPCC"],
        "keywords": "K4 elaborazione collegamenti esempi analogie comprensione",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": f"{QPCC_SOURCE} {EVIDENCE_SOURCE}",
        "sort_order": 133,
    },
    {
        "slug": "qpcc-effort-attribution",
        "name_it": "Cercare le cause su cui si puo' agire",
        "recommended_when_it": "Quando K5 (convinzioni su di se') e' un'area di crescita.",
        "description_it": (
            "Rileggere un risultato recente cercando le cause modificabili — preparazione, "
            "strategia usata, tempo disponibile — invece delle sole abilita' considerate "
            "stabili, e indicare la variabile su cui intervenire alla prossima occasione."
        ),
        "factor_codes": ["K5"],
        "questionnaire_types": ["QPCC"],
        "keywords": "K5 convinzioni autoefficacia attribuzione impegno abilita fiducia",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": QPCC_SOURCE,
        "sort_order": 134,
    },
    {
        "slug": "qap-concern-future-timeline",
        "name_it": "Rendere il futuro pensabile",
        "recommended_when_it": "Quando AD1 (preoccupazione per il futuro) e' un'area di crescita.",
        "description_it": (
            "Costruire una linea del tempo breve: dove si vorrebbe essere fra un anno e quali "
            "due passi, a partire dalle scelte di adesso, lo rendono possibile; poi collocarli "
            "nel calendario."
        ),
        "factor_codes": ["AD1"],
        "questionnaire_types": ["QAP"],
        "keywords": "AD1 preoccupazione futuro pianificazione scelte carriera",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": QAP_SOURCE,
        "sort_order": 140,
    },
    {
        "slug": "qap-control-own-decision",
        "name_it": "Riprendere in mano una decisione",
        "recommended_when_it": "Quando AD2 (controllo) e' un'area di crescita.",
        "description_it": (
            "Riformulare come scelta propria una decisione finora delegata ad altri: motivo, "
            "alternative considerate e responsabilita' che si accetta, senza attribuire "
            "l'esito solo alle circostanze."
        ),
        "factor_codes": ["AD2"],
        "questionnaire_types": ["QAP"],
        "keywords": "AD2 controllo decisioni autonomia responsabilita convinzioni",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": QAP_SOURCE,
        "sort_order": 141,
    },
    {
        "slug": "qap-curiosity-exploration",
        "name_it": "Esplorare prima di scegliere",
        "recommended_when_it": "Quando AD3 (curiosita') e' un'area di crescita.",
        "description_it": (
            "Raccogliere informazioni di prima mano su due percorsi possibili — una persona da "
            "intervistare, un'esperienza da osservare — e confrontarle su criteri scelti dallo "
            "studente, prima di restringere il campo."
        ),
        "factor_codes": ["AD3"],
        "questionnaire_types": ["QAP"],
        "keywords": "AD3 curiosita esplorazione alternative informazioni opportunita",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": QAP_SOURCE,
        "sort_order": 142,
    },
    {
        "slug": "qap-confidence-mastery",
        "name_it": "Fiducia costruita su prove concrete",
        "recommended_when_it": "Quando AD4 (fiducia) e' un'area di crescita.",
        "description_it": (
            "Scegliere un compito appena sopra il livello attuale, portarlo a termine con cura "
            "e annotare l'ostacolo superato: la fiducia si appoggia su prove verificabili, non "
            "su incoraggiamenti generici."
        ),
        "factor_codes": ["AD4"],
        "questionnaire_types": ["QAP"],
        "keywords": "AD4 fiducia autoefficacia ostacoli problemi competenza",
        "certified_by": "Import fonti competenze strategiche",
        "source_reference": QAP_SOURCE,
        "sort_order": 143,
    },
    # --- Backfill: strumenti con un solo consiglio per fattore -------------
    # QPCS, QPCC, QAP e ZTPI avevano una sola strategia per fattore (T2 nessuna):
    # con `limit=2` e la non-ripetizione il pannello si esauriva al primo turno.
    # Queste voci entrano come bozze: raggiungono lo studente solo dopo che un
    # admin le certifica dal pannello.
    {
        "slug": "qpcs-emotion-name-and-scale",
        "name_it": "Dare un nome e una misura alla tensione",
        "recommended_when_it": "Quando S1 (gestione delle emozioni) e' un'area di crescita.",
        "description_it": (
            "Prima di iniziare a studiare o prima di una prova, scrivere che emozione si sta "
            "provando e darle un valore da uno a dieci; rifare la misura dopo dieci minuti di "
            "lavoro effettivo e confrontare i due numeri, perche' la tensione quasi sempre "
            "scende quando il compito e' cominciato."
        ),
        "factor_codes": ["S1"],
        "questionnaire_types": ["QPCS"],
        "keywords": "S1 emozioni ansia tensione misura consapevolezza avvio",
        "certified_by": "Bozza da revisionare",
        "source_reference": QPCS_SOURCE,
        "status": "draft",
        "sort_order": 150,
    },
    {
        "slug": "qpcs-emotion-worry-window",
        "name_it": "La finestra delle preoccupazioni",
        "recommended_when_it": "Quando S1 (gestione delle emozioni) e' un'area di crescita.",
        "description_it": (
            "Riservare dieci minuti, sempre gli stessi, per scrivere di getto le preoccupazioni "
            "legate allo studio, e chiudere li' il foglio; quando un pensiero torna durante la "
            "sessione, rimandarlo alla finestra del giorno dopo invece di seguirlo."
        ),
        "factor_codes": ["S1"],
        "questionnaire_types": ["QPCS"],
        "keywords": "S1 preoccupazioni scrittura ansia prova rimuginio concentrazione",
        "certified_by": "Bozza da revisionare",
        "source_reference": QPCS_SOURCE,
        "status": "draft",
        "sort_order": 151,
    },
    {
        "slug": "qpcs-communication-listen-back",
        "name_it": "Ridire prima di rispondere",
        "recommended_when_it": "Quando S2 (competenza comunicativa) e' un'area di crescita.",
        "description_it": (
            "In una discussione o in un lavoro di gruppo, riformulare con parole proprie la "
            "posizione dell'altro e chiedere conferma prima di esporre la propria: il "
            "malinteso emerge subito, e chi ascolta e' piu' disposto a fare lo stesso."
        ),
        "factor_codes": ["S2"],
        "questionnaire_types": ["QPCS"],
        "keywords": "S2 comunicazione ascolto riformulare gruppo discussione conflitto",
        "certified_by": "Bozza da revisionare",
        "source_reference": QPCS_SOURCE,
        "status": "draft",
        "sort_order": 152,
    },
    {
        "slug": "qpcs-communication-three-sentence-summary",
        "name_it": "Tre frasi per farsi capire",
        "recommended_when_it": "Quando S2 (competenza comunicativa) e' un'area di crescita.",
        "description_it": (
            "Preparare la sintesi di cio' che si e' studiato in tre frasi — di che cosa parla, "
            "perche' conta, che cosa resta aperto — e usarla come apertura sia quando si "
            "espone sia quando si chiede aiuto, cosi' l'interlocutore sa da dove partire."
        ),
        "factor_codes": ["S2"],
        "questionnaire_types": ["QPCS"],
        "keywords": "S2 comunicazione sintesi esporre chiedere aiuto chiarezza",
        "certified_by": "Bozza da revisionare",
        "source_reference": QPCS_SOURCE,
        "status": "draft",
        "sort_order": 153,
    },
    {
        "slug": "qpcs-perseverance-if-then",
        "name_it": "Piano se-allora per gli ostacoli",
        "recommended_when_it": "Quando S3 (volonta' e perseveranza) e' un'area di crescita.",
        "description_it": (
            "Individuare in anticipo l'ostacolo che con piu' probabilita' fara' interrompere lo "
            "studio e scrivere la risposta gia' decisa nella forma \"se succede X, allora "
            "faccio Y\": nel momento critico non serve piu' decidere, basta eseguire."
        ),
        "factor_codes": ["S3"],
        "questionnaire_types": ["QPCS"],
        "keywords": "S3 perseveranza ostacoli intenzioni se allora interruzioni piano",
        "certified_by": "Bozza da revisionare",
        "source_reference": f"{QPCS_SOURCE} Gollwitzer, implementation intentions.",
        "status": "draft",
        "sort_order": 154,
    },
    {
        "slug": "qpcs-perseverance-visible-progress",
        "name_it": "Rendere visibile l'avanzamento",
        "recommended_when_it": "Quando S3 (volonta' e perseveranza) e' un'area di crescita.",
        "description_it": (
            "Tenere una traccia visibile delle sessioni portate a termine — non delle ore "
            "passate al tavolo — cosi' la costanza si misura su cio' che si e' concluso; "
            "dopo un'interruzione si riparte dalla traccia, non da zero."
        ),
        "factor_codes": ["S3"],
        "questionnaire_types": ["QPCS"],
        "keywords": "S3 costanza avanzamento tracciamento sessioni motivazione ripresa",
        "certified_by": "Bozza da revisionare",
        "source_reference": QPCS_SOURCE,
        "status": "draft",
        "sort_order": 155,
    },
    {
        "slug": "qpcs-collaboration-role-split",
        "name_it": "Ruoli espliciti nel lavoro di gruppo",
        "recommended_when_it": "Quando S4 (strategie e collaborazione) e' un'area di crescita.",
        "description_it": (
            "Prima di cominciare un lavoro di gruppo, mettere per iscritto chi fa che cosa "
            "entro quando e chi ricompone i pezzi: la parte piu' fragile di un lavoro condiviso "
            "non e' l'esecuzione, e' il punto in cui i contributi si uniscono."
        ),
        "factor_codes": ["S4"],
        "questionnaire_types": ["QPCS"],
        "keywords": "S4 collaborazione gruppo ruoli scadenze coordinamento",
        "certified_by": "Bozza da revisionare",
        "source_reference": QPCS_SOURCE,
        "status": "draft",
        "sort_order": 156,
    },
    {
        "slug": "qpcs-strategy-fit-to-material",
        "name_it": "Scegliere la strategia in base al materiale",
        "recommended_when_it": "Quando S4 (strategie e collaborazione) e' un'area di crescita.",
        "description_it": (
            "Distinguere cio' che va ricordato a memoria da cio' che va capito e applicato, e "
            "assegnare a ciascuno la tecnica adatta: recupero attivo e ripasso distribuito per "
            "il primo, spiegazione a se' stessi ed esempi propri per il secondo."
        ),
        "factor_codes": ["S4"],
        "questionnaire_types": ["QPCS"],
        "keywords": "S4 strategie materiale memoria comprensione recupero attivo ripasso",
        "certified_by": "Bozza da revisionare",
        "source_reference": f"{QPCS_SOURCE} {EVIDENCE_SOURCE}",
        "status": "draft",
        "sort_order": 157,
    },
    {
        "slug": "qpcs-confidence-evidence-log",
        "name_it": "Registro delle prove di competenza",
        "recommended_when_it": "Quando S5 (fiducia e progetto di vita) e' un'area di crescita.",
        "description_it": (
            "Per due settimane annotare ogni giorno un fatto in cui si e' riusciti in qualcosa "
            "di non banale, con l'ostacolo che c'era: la fiducia cresce su un elenco di prove "
            "verificabili, non su un incoraggiamento generico."
        ),
        "factor_codes": ["S5"],
        "questionnaire_types": ["QPCS"],
        "keywords": "S5 fiducia autoefficacia prove registro riuscite ostacoli",
        "certified_by": "Bozza da revisionare",
        "source_reference": QPCS_SOURCE,
        "status": "draft",
        "sort_order": 158,
    },
    {
        "slug": "qpcs-life-project-two-paths",
        "name_it": "Due strade, gli stessi criteri",
        "recommended_when_it": "Quando S5 (fiducia e progetto di vita) e' un'area di crescita.",
        "description_it": (
            "Descrivere due percorsi formativi possibili e confrontarli sugli stessi tre "
            "criteri, scelti dallo studente prima di guardare le opzioni: cosi' il confronto "
            "non si sposta ogni volta sul criterio che favorisce l'opzione preferita."
        ),
        "factor_codes": ["S5"],
        "questionnaire_types": ["QPCS"],
        "keywords": "S5 progetto di vita scelta criteri confronto percorsi futuro",
        "certified_by": "Bozza da revisionare",
        "source_reference": QPCS_SOURCE,
        "status": "draft",
        "sort_order": 159,
    },
    {
        "slug": "qpcc-speaking-question-first",
        "name_it": "Aprire con la domanda",
        "recommended_when_it": "Quando K1 (parlare in pubblico) e' un'area di crescita.",
        "description_it": (
            "Cominciare l'esposizione enunciando la domanda a cui si risponde, non il titolo "
            "dell'argomento: chi ascolta capisce subito dove si va, e chi parla ha un filo a "
            "cui tornare se si perde."
        ),
        "factor_codes": ["K1"],
        "questionnaire_types": ["QPCC"],
        "keywords": "K1 esposizione presentazione domanda apertura filo pubblico",
        "certified_by": "Bozza da revisionare",
        "source_reference": QPCC_SOURCE,
        "status": "draft",
        "sort_order": 160,
    },
    {
        "slug": "qpcc-speaking-recover-from-blank",
        "name_it": "Che cosa fare quando ci si blocca",
        "recommended_when_it": "Quando K1 (parlare in pubblico) e' un'area di crescita.",
        "description_it": (
            "Preparare prima una frase-ponte da usare nel vuoto di memoria — \"riprendo dal "
            "punto in cui...\" — e tenere in vista una scaletta di tre voci: il blocco smette "
            "di essere una catastrofe quando esiste gia' la mossa successiva."
        ),
        "factor_codes": ["K1"],
        "questionnaire_types": ["QPCC"],
        "keywords": "K1 blocco vuoto di memoria esposizione scaletta ansia recupero",
        "certified_by": "Bozza da revisionare",
        "source_reference": QPCC_SOURCE,
        "status": "draft",
        "sort_order": 161,
    },
    {
        "slug": "qpcc-decision-worst-case-plan",
        "name_it": "Nominare il peggio e preparare il primo passo",
        "recommended_when_it": "Quando K2 (gestione dell'ansia e responsabilita') e' un'area di crescita.",
        "description_it": (
            "Scrivere lo scenario peggiore che si teme, stimare quanto sia davvero probabile e "
            "definire il primo passo che si farebbe se accadesse: cio' che resta indefinito "
            "pesa piu' di cio' che e' stato guardato in faccia."
        ),
        "factor_codes": ["K2"],
        "questionnaire_types": ["QPCC"],
        "keywords": "K2 ansia decisioni scenario peggiore probabilita piano responsabilita",
        "certified_by": "Bozza da revisionare",
        "source_reference": QPCC_SOURCE,
        "status": "draft",
        "sort_order": 162,
    },
    {
        "slug": "qpcc-responsibility-share-and-check",
        "name_it": "Dividere il peso e fissare la verifica",
        "recommended_when_it": "Quando K2 (gestione dell'ansia e responsabilita') e' un'area di crescita.",
        "description_it": (
            "Individuare quale parte della responsabilita' e' davvero condivisa e con chi va "
            "concordata, dirlo esplicitamente alla persona coinvolta e fissare quando si "
            "verifichera' insieme, invece di portare da soli anche cio' che non compete."
        ),
        "factor_codes": ["K2"],
        "questionnaire_types": ["QPCC"],
        "keywords": "K2 responsabilita condivisione pressione accordo verifica confini",
        "certified_by": "Bozza da revisionare",
        "source_reference": QPCC_SOURCE,
        "status": "draft",
        "sort_order": 163,
    },
    {
        "slug": "qpcc-time-block-protection",
        "name_it": "Proteggere un blocco di tempo",
        "recommended_when_it": "Quando K3 (volonta' e autoregolazione) e' un'area di crescita.",
        "description_it": (
            "Fissare un blocco settimanale sempre nello stesso giorno e nella stessa ora, "
            "dichiararlo a chi potrebbe interromperlo e non usarlo per altro: un tempo "
            "ricorrente e annunciato si difende meglio di un tempo deciso volta per volta."
        ),
        "factor_codes": ["K3"],
        "questionnaire_types": ["QPCC"],
        "keywords": "K3 autoregolazione tempo blocco routine interruzioni pianificazione",
        "certified_by": "Bozza da revisionare",
        "source_reference": QPCC_SOURCE,
        "status": "draft",
        "sort_order": 164,
    },
    {
        "slug": "qpcc-start-ritual",
        "name_it": "Rito di avvio breve",
        "recommended_when_it": "Quando K3 (volonta' e autoregolazione) e' un'area di crescita.",
        "description_it": (
            "Definire tre gesti sempre uguali che aprono la sessione — sgombrare il tavolo, "
            "scrivere l'obiettivo del blocco, mettere via il telefono — cosi' l'inizio diventa "
            "una sequenza da eseguire e non una decisione da prendere ogni volta."
        ),
        "factor_codes": ["K3"],
        "questionnaire_types": ["QPCC"],
        "keywords": "K3 avvio rito abitudine procrastinazione sessione obiettivo",
        "certified_by": "Bozza da revisionare",
        "source_reference": QPCC_SOURCE,
        "status": "draft",
        "sort_order": 165,
    },
    {
        "slug": "qpcc-transfer-to-new-case",
        "name_it": "Applicare a un caso nuovo",
        "recommended_when_it": "Quando K4 (strategie di elaborazione) e' un'area di crescita.",
        "description_it": (
            "Subito dopo aver capito una regola o un procedimento, applicarlo a un esempio non "
            "trattato a lezione e cercato da soli: e' il punto in cui si scopre se si e' capito "
            "davvero o si e' solo riconosciuto il caso gia' visto."
        ),
        "factor_codes": ["K4"],
        "questionnaire_types": ["QPCC"],
        "keywords": "K4 elaborazione trasferimento esempio nuovo applicazione comprensione",
        "certified_by": "Bozza da revisionare",
        "source_reference": f"{QPCC_SOURCE} {EVIDENCE_SOURCE}",
        "status": "draft",
        "sort_order": 166,
    },
    {
        "slug": "qpcc-compare-and-contrast",
        "name_it": "Confrontare due concetti vicini",
        "recommended_when_it": "Quando K4 (strategie di elaborazione) e' un'area di crescita.",
        "description_it": (
            "Prendere due nozioni che si tendono a confondere e scrivere dove coincidono, dove "
            "si separano e quale esempio le distingue: la distinzione tenuta a mente in modo "
            "vago e' la prima cosa che salta in una verifica."
        ),
        "factor_codes": ["K4"],
        "questionnaire_types": ["QPCC"],
        "keywords": "K4 confronto concetti distinzione esempi elaborazione precisione",
        "certified_by": "Bozza da revisionare",
        "source_reference": f"{QPCC_SOURCE} {EVIDENCE_SOURCE}",
        "status": "draft",
        "sort_order": 167,
    },
    {
        "slug": "qpcc-self-talk-rewrite",
        "name_it": "Riscrivere la frase che ci si ripete",
        "recommended_when_it": "Quando K5 (convinzioni su di se') e' un'area di crescita.",
        "description_it": (
            "Trascrivere alla lettera il giudizio che si ripete su di se' dopo un insuccesso e "
            "riformularlo in termini di comportamento modificabile: da \"non sono portato\" a "
            "\"con questo metodo non ha funzionato, provo a cambiare X\"."
        ),
        "factor_codes": ["K5"],
        "questionnaire_types": ["QPCC"],
        "keywords": "K5 convinzioni giudizio su di se attribuzione insuccesso riformulare",
        "certified_by": "Bozza da revisionare",
        "source_reference": QPCC_SOURCE,
        "status": "draft",
        "sort_order": 168,
    },
    {
        "slug": "qpcc-mastery-model-peer",
        "name_it": "Guardare chi ci e' gia' passato",
        "recommended_when_it": "Quando K5 (convinzioni su di se') e' un'area di crescita.",
        "description_it": (
            "Individuare una persona vicina per eta' e condizione che ha superato la stessa "
            "difficolta' e chiederle che cosa ha cambiato in concreto: vedere riuscire "
            "qualcuno di simile a se' incide sulla fiducia piu' di un incoraggiamento."
        ),
        "factor_codes": ["K5"],
        "questionnaire_types": ["QPCC"],
        "keywords": "K5 fiducia modello esperienza vicaria compagni autoefficacia",
        "certified_by": "Bozza da revisionare",
        "source_reference": f"{QPCC_SOURCE} Bandura, esperienza vicaria e autoefficacia.",
        "status": "draft",
        "sort_order": 169,
    },
    {
        "slug": "qap-future-letter-to-self",
        "name_it": "Lettera da un anno avanti",
        "recommended_when_it": "Quando AD1 (preoccupazione per il futuro) e' un'area di crescita.",
        "description_it": (
            "Scrivere una pagina dal punto di vista di se' stessi fra un anno, raccontando al "
            "passato che cosa si e' fatto per arrivare fin li': il futuro diventa pensabile "
            "quando viene raccontato come gia' accaduto."
        ),
        "factor_codes": ["AD1"],
        "questionnaire_types": ["QAP"],
        "keywords": "AD1 futuro narrazione lettera progetto immaginare percorso",
        "certified_by": "Bozza da revisionare",
        "source_reference": QAP_SOURCE,
        "status": "draft",
        "sort_order": 170,
    },
    {
        "slug": "qap-future-fixed-dates",
        "name_it": "Le date che decidono",
        "recommended_when_it": "Quando AD1 (preoccupazione per il futuro) e' un'area di crescita.",
        "description_it": (
            "Elencare le scadenze reali dei prossimi dodici mesi — iscrizioni, prove, colloqui, "
            "termini di domanda — e collocarle in calendario con due settimane di margine: la "
            "preoccupazione diffusa si riduce quando diventa un elenco di date."
        ),
        "factor_codes": ["AD1"],
        "questionnaire_types": ["QAP"],
        "keywords": "AD1 scadenze calendario iscrizioni pianificazione futuro margine",
        "certified_by": "Bozza da revisionare",
        "source_reference": QAP_SOURCE,
        "status": "draft",
        "sort_order": 171,
    },
    {
        "slug": "qap-control-decision-criteria",
        "name_it": "Dichiarare i criteri prima delle opzioni",
        "recommended_when_it": "Quando AD2 (controllo) e' un'area di crescita.",
        "description_it": (
            "Stabilire i tre criteri che contano davvero — e in quale ordine — prima di "
            "guardare le alternative, cosi' la scelta non si riduce a giustificare a posteriori "
            "l'opzione verso cui si propendeva gia'."
        ),
        "factor_codes": ["AD2"],
        "questionnaire_types": ["QAP"],
        "keywords": "AD2 controllo criteri decisione alternative autonomia priorita",
        "certified_by": "Bozza da revisionare",
        "source_reference": QAP_SOURCE,
        "status": "draft",
        "sort_order": 172,
    },
    {
        "slug": "qap-control-reversible-first",
        "name_it": "Cominciare dalle scelte reversibili",
        "recommended_when_it": "Quando AD2 (controllo) e' un'area di crescita.",
        "description_it": (
            "Separare le decisioni che si possono correggere da quelle che vincolano a lungo, e "
            "agire prima sulle reversibili: si accumula esperienza e si rimanda l'impegno "
            "irreversibile a quando si sa di piu'."
        ),
        "factor_codes": ["AD2"],
        "questionnaire_types": ["QAP"],
        "keywords": "AD2 decisione reversibile vincolo autonomia rischio esperienza",
        "certified_by": "Bozza da revisionare",
        "source_reference": QAP_SOURCE,
        "status": "draft",
        "sort_order": 173,
    },
    {
        "slug": "qap-curiosity-informational-interview",
        "name_it": "Un'ora con chi fa quel lavoro",
        "recommended_when_it": "Quando AD3 (curiosita') e' un'area di crescita.",
        "description_it": (
            "Preparare cinque domande — giornata tipo, parte piu' difficile, come ci si e' "
            "arrivati, che cosa si sarebbe fatto diversamente, che cosa serve davvero sapere — "
            "e intervistare una persona che svolge il lavoro considerato."
        ),
        "factor_codes": ["AD3"],
        "questionnaire_types": ["QAP"],
        "keywords": "AD3 curiosita esplorazione intervista lavoro professione informazioni",
        "certified_by": "Bozza da revisionare",
        "source_reference": QAP_SOURCE,
        "status": "draft",
        "sort_order": 174,
    },
    {
        "slug": "qap-curiosity-try-small",
        "name_it": "Prova piccola prima della scelta grande",
        "recommended_when_it": "Quando AD3 (curiosita') e' un'area di crescita.",
        "description_it": (
            "Cercare un'esperienza breve e a basso costo nel campo che interessa — una giornata "
            "di osservazione, un laboratorio, un corso introduttivo — e ricavarne una nota su "
            "che cosa e' piaciuto e che cosa no, prima di impegnarsi su un percorso lungo."
        ),
        "factor_codes": ["AD3"],
        "questionnaire_types": ["QAP"],
        "keywords": "AD3 esplorazione prova esperienza laboratorio orientamento scelta",
        "certified_by": "Bozza da revisionare",
        "source_reference": QAP_SOURCE,
        "status": "draft",
        "sort_order": 175,
    },
    {
        "slug": "qap-confidence-obstacle-inventory",
        "name_it": "Inventario degli ostacoli superati",
        "recommended_when_it": "Quando AD4 (fiducia) e' un'area di crescita.",
        "description_it": (
            "Elencare tre difficolta' gia' affrontate negli ultimi due anni e, per ciascuna, "
            "che cosa in concreto le ha sbloccate: quasi sempre ricompaiono le stesse due o tre "
            "mosse, ed e' da quelle che conviene ripartire."
        ),
        "factor_codes": ["AD4"],
        "questionnaire_types": ["QAP"],
        "keywords": "AD4 fiducia ostacoli problemi risorse riuscite inventario",
        "certified_by": "Bozza da revisionare",
        "source_reference": QAP_SOURCE,
        "status": "draft",
        "sort_order": 176,
    },
    {
        "slug": "qap-problem-solving-steps",
        "name_it": "Scomporre il problema in mosse",
        "recommended_when_it": "Quando AD4 (fiducia) e' un'area di crescita.",
        "description_it": (
            "Trasformare il problema in una sequenza di mosse verificabili e individuare quale "
            "sia la prima davvero eseguibile oggi: un problema resta paralizzante finche' "
            "rimane un blocco unico senza un punto d'ingresso."
        ),
        "factor_codes": ["AD4"],
        "questionnaire_types": ["QAP"],
        "keywords": "AD4 problem solving scomporre passi primo passo blocco",
        "certified_by": "Bozza da revisionare",
        "source_reference": QAP_SOURCE,
        "status": "draft",
        "sort_order": 177,
    },
    {
        "slug": "ztpi-past-negative-continuity",
        "name_it": "Che cosa e' cambiato da allora",
        "recommended_when_it": "Quando il Passato Negativo (T1) e' elevato.",
        "description_it": (
            "Accanto al ricordo che pesa, elencare che cosa e' cambiato nel frattempo — "
            "capacita' acquisite, persone diverse intorno, contesto nuovo — senza negare "
            "l'esperienza: il ricordo resta, smette di descrivere il presente."
        ),
        "factor_codes": ["T1"],
        "questionnaire_types": ["ZTPI"],
        "keywords": "T1 passato negativo cambiamento risorse presente distanza",
        "certified_by": "Bozza da revisionare",
        "source_reference": ZTPI_SOURCE,
        "status": "draft",
        "sort_order": 180,
    },
    {
        "slug": "ztpi-past-negative-boundaries",
        "name_it": "Il passato al suo posto nel tempo",
        "recommended_when_it": "Quando il Passato Negativo (T1) e' elevato.",
        "description_it": (
            "Collocare esplicitamente l'episodio nel momento in cui e' accaduto — eta', luogo, "
            "chi c'era — e distinguere quali sue conseguenze sono ancora attive oggi e quali "
            "no: molte hanno smesso di valere senza che se ne prendesse atto."
        ),
        "factor_codes": ["T1"],
        "questionnaire_types": ["ZTPI"],
        "keywords": "T1 passato negativo episodio conseguenze confini rimpianti",
        "certified_by": "Bozza da revisionare",
        "source_reference": ZTPI_SOURCE,
        "status": "draft",
        "sort_order": 181,
    },
    {
        "slug": "ztpi-past-positive-resources",
        "name_it": "Risorse dal passato che funzionano ancora",
        "recommended_when_it": "Quando il Passato Positivo (T2) e' una risorsa da valorizzare.",
        "description_it": (
            "Ricostruire in dettaglio un momento passato in cui si e' riusciti in qualcosa di "
            "difficile e individuare la risorsa che allora ha funzionato — una persona, un "
            "metodo, un'abitudine — per riportarla nella situazione attuale."
        ),
        "factor_codes": ["T2"],
        "questionnaire_types": ["ZTPI"],
        "keywords": "T2 passato positivo risorse riuscite memoria continuita",
        "certified_by": "Bozza da revisionare",
        "source_reference": ZTPI_SOURCE,
        "status": "draft",
        "sort_order": 182,
    },
    {
        "slug": "ztpi-past-positive-rituals",
        "name_it": "Tenere vivi i legami e i riti",
        "recommended_when_it": "Quando il Passato Positivo (T2) e' una risorsa da valorizzare.",
        "description_it": (
            "Riconoscere i riti e i legami che danno continuita' — una cena ricorrente, un "
            "luogo, un'amicizia lunga — e proteggerne almeno uno nella settimana: sono la parte "
            "del passato che continua a sostenere il presente."
        ),
        "factor_codes": ["T2"],
        "questionnaire_types": ["ZTPI"],
        "keywords": "T2 passato positivo riti legami famiglia amicizie continuita",
        "certified_by": "Bozza da revisionare",
        "source_reference": ZTPI_SOURCE,
        "status": "draft",
        "sort_order": 183,
    },
    {
        "slug": "ztpi-past-positive-narrative-thread",
        "name_it": "Il filo che tiene insieme la storia",
        "recommended_when_it": "Quando il Passato Positivo (T2) e' una risorsa da valorizzare.",
        "description_it": (
            "Raccontare il proprio percorso di studi come una storia con un filo — da dove si e' "
            "partiti, che cosa ha fatto svoltare, dove si e' adesso — invece che come una serie "
            "di episodi slegati: il filo rende leggibile anche la direzione."
        ),
        "factor_codes": ["T2"],
        "questionnaire_types": ["ZTPI"],
        "keywords": "T2 passato positivo narrazione percorso identita continuita direzione",
        "certified_by": "Bozza da revisionare",
        "source_reference": ZTPI_SOURCE,
        "status": "draft",
        "sort_order": 184,
    },
    {
        "slug": "ztpi-hedonism-planned-pleasure",
        "name_it": "Il piacere messo in calendario",
        "recommended_when_it": "Quando il Presente Edonistico (T3) e' elevato.",
        "description_it": (
            "Collocare in calendario il tempo di piacere invece di lasciarlo prendere il posto "
            "dello studio: cosi' non va difeso ogni volta contro il senso di colpa, e il tempo "
            "di lavoro smette di essere quello che viene eroso."
        ),
        "factor_codes": ["T3"],
        "questionnaire_types": ["ZTPI"],
        "keywords": "T3 presente edonistico piacere calendario equilibrio studio",
        "certified_by": "Bozza da revisionare",
        "source_reference": ZTPI_SOURCE,
        "status": "draft",
        "sort_order": 185,
    },
    {
        "slug": "ztpi-hedonism-impulse-pause",
        "name_it": "Una pausa fra impulso e azione",
        "recommended_when_it": "Quando il Presente Edonistico (T3) e' elevato.",
        "description_it": (
            "Quando arriva il desiderio immediato che manderebbe all'aria il piano, darsi dieci "
            "minuti prima di decidere e usarli per guardare che cosa costa: l'impulso spesso "
            "non regge la pausa, e quando la regge la scelta e' comunque piu' consapevole."
        ),
        "factor_codes": ["T3"],
        "questionnaire_types": ["ZTPI"],
        "keywords": "T3 impulsivita pausa desiderio autocontrollo scelta presente",
        "certified_by": "Bozza da revisionare",
        "source_reference": ZTPI_SOURCE,
        "status": "draft",
        "sort_order": 186,
    },
    {
        "slug": "ztpi-fatalism-evidence-of-effect",
        "name_it": "Cercare le prove che qualcosa ha inciso",
        "recommended_when_it": "Quando il Presente Fatalistico (T4) e' elevato.",
        "description_it": (
            "Ripescare un caso recente in cui un'azione propria ha cambiato l'esito, anche "
            "piccolo, e descriverlo nei dettagli: il fatalismo si regge sulla convinzione che "
            "non esistano casi del genere, e di solito basta guardarli per trovarli."
        ),
        "factor_codes": ["T4"],
        "questionnaire_types": ["ZTPI"],
        "keywords": "T4 fatalismo controllo prove esito azione agentivita",
        "certified_by": "Bozza da revisionare",
        "source_reference": ZTPI_SOURCE,
        "status": "draft",
        "sort_order": 187,
    },
    {
        "slug": "ztpi-fatalism-one-week-experiment",
        "name_it": "Esperimento di una settimana",
        "recommended_when_it": "Quando il Presente Fatalistico (T4) e' elevato.",
        "description_it": (
            "Scegliere un solo comportamento da cambiare e osservarne l'effetto per sette "
            "giorni, annotando ogni giorno una riga: l'esperimento breve verifica sul campo se "
            "davvero nulla dipende da se', invece di discuterne in astratto."
        ),
        "factor_codes": ["T4"],
        "questionnaire_types": ["ZTPI"],
        "keywords": "T4 fatalismo esperimento settimana comportamento effetto verifica",
        "certified_by": "Bozza da revisionare",
        "source_reference": ZTPI_SOURCE,
        "status": "draft",
        "sort_order": 188,
    },
    {
        "slug": "ztpi-future-milestones",
        "name_it": "Tappe intermedie visibili",
        "recommended_when_it": "Quando si rafforza l'orientamento al Futuro (T5).",
        "description_it": (
            "Spezzare l'obiettivo lontano in tre tappe, ciascuna con una data e un segno "
            "riconoscibile di averla raggiunta: senza tappe l'orientamento al futuro resta "
            "un'intenzione, e la verifica arriva solo alla fine."
        ),
        "factor_codes": ["T5"],
        "questionnaire_types": ["ZTPI"],
        "keywords": "T5 futuro tappe obiettivi date pianificazione verifica",
        "certified_by": "Bozza da revisionare",
        "source_reference": ZTPI_SOURCE,
        "status": "draft",
        "sort_order": 189,
    },
    {
        "slug": "ztpi-future-cost-of-postponing",
        "name_it": "Il costo del rimandare",
        "recommended_when_it": "Quando si rafforza l'orientamento al Futuro (T5).",
        "description_it": (
            "Rendere esplicito che cosa costa rimandare — quante ore si accumulano, quale "
            "margine si perde, che cosa diventa impossibile fare bene — invece di lasciare la "
            "scadenza come una data astratta e lontana."
        ),
        "factor_codes": ["T5"],
        "questionnaire_types": ["ZTPI"],
        "keywords": "T5 futuro rimandare procrastinazione costo scadenza margine",
        "certified_by": "Bozza da revisionare",
        "source_reference": ZTPI_SOURCE,
        "status": "draft",
        "sort_order": 190,
    },
]


# Adaptations checked against the authorized source; see the editorial evidence sheet.
DEFAULT_CERTIFIED_STRATEGIES.extend([{'slug': 'qsa-life-personal-commitment',
  'name_it': 'Un impegno personale sostenibile',
  'recommended_when_it': 'C2 basso; C2r basso. Quando lo studente ha già nominato un impegno personale o un '
                         'progetto.',
  'description_it': 'Scegli un impegno personale già emerso e riservagli uno spazio realistico nella '
                    'settimana. Al termine controlla che cosa hai effettivamente fatto. Quale spazio sei '
                    'riuscito a mantenere?',
  'factor_codes': ['C2', 'C2r'],
  'questionnaire_types': ['QSA', 'QSAr'],
  'keywords': 'impegni progetto personale settimana tempo vita',
  'certified_by': 'Verifica editoriale su fonte QSA autorizzata, 2026-09-06; adattamento dichiarato',
  'source_reference': 'E. Ottone, APPRENDO, Schede sui fattori QSA, sezione C2 — Autoregolazione. '
                      'https://www.competenzestrategiche.it/pluginfile.php/2132/mod_folder/content/0/QSA%20e%20QSAr/03_Schede%20fattori%20QSA.pdf?forcedownload=1 '
                      'Adattamento editoriale circoscritto: docs/handoff/w4b-strategie-azione-vita.md.',
  'sort_order': 200},
 {'slug': 'qsa-life-goal-value',
  'name_it': 'Il motivo per cui vale la pena',
  'recommended_when_it': 'A2 basso; A2r basso. Quando un impegno di apprendimento legato a un progetto '
                         'personale perde significato.',
  'description_it': 'Scrivi in una frase a quale obiettivo personale, già nominato nella conversazione, '
                    'serve l’impegno che fatichi a mantenere. Quanto senti ancora tuo quel motivo?',
  'factor_codes': ['A2', 'A2r'],
  'questionnaire_types': ['QSA', 'QSAr'],
  'keywords': 'obiettivi valore significato progetto personale vita motivazione',
  'certified_by': 'Verifica editoriale su fonte QSA autorizzata, 2026-09-06; adattamento dichiarato',
  'source_reference': 'E. Ottone, APPRENDO, Schede sui fattori QSA, sezione A2 — Volizione. '
                      'https://www.competenzestrategiche.it/pluginfile.php/2132/mod_folder/content/0/QSA%20e%20QSAr/03_Schede%20fattori%20QSA.pdf?forcedownload=1 '
                      'Adattamento editoriale circoscritto: docs/handoff/w4b-strategie-azione-vita.md.',
  'sort_order': 201},
 {'slug': 'qsa-life-accessible-step',
  'name_it': 'Un passo raggiungibile nel proprio progetto',
  'recommended_when_it': 'A5 alto. Quando lo studente fatica a proseguire un progetto personale che richiede '
                         'apprendimento.',
  'description_it': 'Nel progetto di cui hai parlato scegli un risultato piccolo, raggiungibile nel tempo '
                    'che hai davvero. Dopo il tentativo annota se lo hai raggiunto e cosa ti ha ostacolato. '
                    'Il passo era sostenibile?',
  'factor_codes': ['A5'],
  'questionnaire_types': ['QSA'],
  'keywords': 'progetto personale passo obiettivo raggiungibile vita perseveranza',
  'certified_by': 'Verifica editoriale su fonte QSA autorizzata, 2026-09-06; adattamento dichiarato',
  'source_reference': 'E. Ottone, APPRENDO, Schede sui fattori QSA, sezione A5 — Mancanza di perseveranza. '
                      'https://www.competenzestrategiche.it/pluginfile.php/2132/mod_folder/content/0/QSA%20e%20QSAr/03_Schede%20fattori%20QSA.pdf?forcedownload=1 '
                      'Adattamento editoriale circoscritto: docs/handoff/w4b-strategie-azione-vita.md.',
  'sort_order': 202},
 {'slug': 'qsa-life-personal-application',
  'name_it': 'Un concetto nella propria esperienza',
  'recommended_when_it': 'C1 basso; C1r basso. Quando lo studente cerca il legame tra ciò che apprende e una '
                         'situazione personale già raccontata.',
  'description_it': 'Scegli un concetto che stai apprendendo e usalo per rileggere una situazione personale '
                    'già emersa. Scrivi un esempio concreto del collegamento. Che cosa ti aiuta a capire, e '
                    'che cosa lascia fuori?',
  'factor_codes': ['C1', 'C1r'],
  'questionnaire_types': ['QSA', 'QSAr'],
  'keywords': 'esperienza personale concetti collegamento vita progetto',
  'certified_by': 'Verifica editoriale su fonte QSA autorizzata, 2026-09-06; adattamento dichiarato',
  'source_reference': 'E. Ottone, APPRENDO, Schede sui fattori QSA, sezione C1 — Strategie elaborative. '
                      'https://www.competenzestrategiche.it/pluginfile.php/2132/mod_folder/content/0/QSA%20e%20QSAr/03_Schede%20fattori%20QSA.pdf?forcedownload=1 '
                      'Adattamento editoriale circoscritto: docs/handoff/w4b-strategie-azione-vita.md.',
  'sort_order': 203}])

def seed_certified_strategies(db, models_module) -> int:
    """Crea le strategie certificate mancanti e ritorna quante righe ha inserito."""
    inserted = 0
    for spec in DEFAULT_CERTIFIED_STRATEGIES:
        exists = (
            db.query(models_module.CertifiedStrategy)
            .filter(models_module.CertifiedStrategy.slug == spec["slug"])
            .first()
        )
        if exists:
            continue
        # Una voce puo' dichiarare il proprio stato: le bozze restano fuori dalla
        # chat finche' un admin non le certifica dal pannello.
        spec = dict(spec)
        status = spec.pop("status", "certified")
        db.add(
            models_module.CertifiedStrategy(
                match_mode="any",
                status=status,
                is_active=True,
                **spec,
            )
        )
        inserted += 1
    if inserted:
        db.commit()
    return inserted
