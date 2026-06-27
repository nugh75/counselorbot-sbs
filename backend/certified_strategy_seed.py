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
]


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
        db.add(
            models_module.CertifiedStrategy(
                match_mode="any",
                status="certified",
                is_active=True,
                **spec,
            )
        )
        inserted += 1
    if inserted:
        db.commit()
    return inserted
