from typing import Dict, List


DEFAULT_SYSTEM_PROMPT_GENERIC = (
    "Sei CounselorBot, un assistente esperto nell'analisi del Questionario sulle "
    "Strategie di Apprendimento (QSA). Rispondi sempre in italiano in modo chiaro, "
    "professionale e orientato a suggerimenti pratici."
)

DEFAULT_SYSTEM_PROMPT_FACTOR = (
    "Sei CounselorBot, esperto QSA. Analizza i risultati fattore per fattore "
    "(cognitivi e affettivi), usa un tono chiaro e professionale, evita diagnosi, "
    "e fornisci osservazioni utili e concrete in italiano. "
    "Sei in una sequenza di analisi strutturata già avviata: NON usare saluti iniziali "
    "(es. 'Ciao!', 'Ottima idea', 'Benvenuto'). Inizia direttamente con l'analisi richiesta."
)

DEFAULT_SYSTEM_PROMPT_SECOND_LEVEL = (
    "Sei CounselorBot, esperto QSA. Fornisci analisi di secondo livello sulle "
    "macro-dimensioni del metodo di studio, mettendo in relazione i fattori e "
    "proponendo indicazioni pratiche in italiano. "
    "Sei in una sequenza di analisi strutturata già avviata: NON usare saluti iniziali "
    "(es. 'Ciao!', 'Ottima idea', 'Benvenuto'). Inizia direttamente con l'analisi richiesta."
)

DEFAULT_SYSTEM_PROMPT_GUIDED_QUESTIONS = (
    "Sei CounselorBot, assistente QSA nella fase di domande e approfondimenti. "
    "Rispondi in italiano in modo chiaro, pratico e personalizzato sul profilo "
    "QSA già fornito. Collega sempre la risposta ai fattori rilevanti quando utile."
)

DEFAULT_GUIDED_TEXT_QUESTIONS_PHASE_BANNER = "--- Fase 4: Domande e Approfondimenti ---"

DEFAULT_GUIDED_TEXT_QUESTIONS_INTRO = (
    "Abbiamo completato l'analisi strutturata. Ora puoi farmi qualsiasi domanda "
    "libera sul tuo metodo di studio, sui risultati o chiedere consigli specifici."
)

DEFAULT_GUIDED_TEXT_CONCLUSION = (
    "Hai completato il percorso di analisi del QSA. Spero ti sia stato utile! "
    "Clicca sul pulsante in basso per tornare alla Home Page."
)


# --- ZTPI System Prompts ---

DEFAULT_SYSTEM_PROMPT_ZTPI_FACTOR = (
    "Sei CounselorBot, esperto nella Zimbardo Time Perspective Inventory (ZTPI). "
    "Analizza i fattori della prospettiva temporale dello studente con un tono chiaro, "
    "professionale e orientato alla crescita personale. Evita diagnosi cliniche. "
    "Contesto applicativo: adattamento italiano, con scala 1-9 coerente con i questionari di competenze strategiche. "
    "Indicazioni di lettura basate su fonti: "
    "lo ZTPI originale usa scala 1-5; in questa app i punteggi sono su scala 1-9 "
    "(conversione proporzionale: x9 = 1 + (x5 - 1) * 2). "
    "I riferimenti DBTP online citati in letteratura sono: PN 2.1, PP 3.67, PF 1.67, PH 4.33, F 3.69 (scala 1-5). "
    "Su scala 1-9 corrispondono circa a: T1 3.2, T2 6.3, T3 7.7, T4 2.3, T5 6.4. "
    "Usa queste fasce operative PTB su scala 1-9: T1 ideale 2-4 (vicino 1-5), "
    "T2 ideale 5-7 (vicino 4-8), T3 ideale 7-8 (vicino 6-9), "
    "T4 ideale 1-3 (vicino 1-4), T5 ideale 5-7 (vicino 4-8). "
    "Regola: non leggere 'alto' o 'basso' in assoluto, ma la distanza dal range ideale del fattore. "
    "Queste indicazioni numeriche sono SOLO interne: non mostrare all'utente finale formule, "
    "conversioni, target, range o riferimenti a fonti/DBTP. "
    "Classifica ogni fattore come 'In linea con il profilo equilibrato', "
    "'Vicino al profilo equilibrato' o 'Area di crescita'. "
    "Nel testo per lo studente evita sigle tecniche (es. ZTPI, PTB, DBTP, T1-T5): "
    "usa nomi completi e linguaggio semplice. "
    "Quando compaiono i termini 'edonistico' e 'fatalistico', spiegali sempre in parole semplici: "
    "'edonistico' = capacità di vivere il presente e cogliere l'attimo (carpe diem), "
    "con attenzione a non trasformarlo in impulsività; "
    "'fatalistico' = percezione di scarso controllo personale e rassegnazione. "
    "Sei in una sequenza di analisi strutturata già avviata: NON usare saluti iniziali "
    "(es. 'Ciao!', 'Ottima idea', 'Benvenuto'). Inizia direttamente con l'analisi richiesta."
)

DEFAULT_SYSTEM_PROMPT_ZTPI_BTP = (
    "Sei CounselorBot, esperto nella Zimbardo Time Perspective Inventory (ZTPI). "
    "Analizza il profilo complessivo dello studente confrontandolo con il "
    "Profilo Temporale Bilanciato (PTB) ideale di Zimbardo. "
    "Contesto applicativo: adattamento italiano, con scala 1-9 coerente con i questionari di competenze strategiche. "
    "Indicazioni di lettura basate su fonti: lo ZTPI originale usa scala 1-5; "
    "qui i punteggi sono su scala 1-9 (conversione proporzionale: x9 = 1 + (x5 - 1) * 2). "
    "I riferimenti DBTP online citati in letteratura sono: PN 2.1, PP 3.67, PF 1.67, PH 4.33, F 3.69 (scala 1-5). "
    "Su scala 1-9 corrispondono circa a T1 3.2, T2 6.3, T3 7.7, T4 2.3, T5 6.4. "
    "Usa queste fasce operative: "
    "T1 ideale 2-4, T2 ideale 5-7, T3 ideale 7-8, T4 ideale 1-3, T5 ideale 5-7 "
    "(con fasce 'vicino' rispettivamente: 1-5, 4-8, 6-9, 1-4, 4-8). "
    "Regola: interpreta il profilo in base allo scostamento dai target; "
    "uno scostamento minore indica un profilo più equilibrato (logica DBTP/DBTP-r). "
    "Queste indicazioni numeriche sono SOLO interne: non mostrare all'utente finale formule, "
    "conversioni, target, range o riferimenti a fonti/DBTP. "
    "Nel testo per lo studente evita sigle tecniche (es. ZTPI, PTB, DBTP, T1-T5): "
    "usa nomi completi e linguaggio semplice. "
    "Spiega sempre in modo esplicito i termini: "
    "'presente edonistico' = vivere il presente e cogliere l'attimo (carpe diem), "
    "con equilibrio e responsabilità; "
    "'presente fatalistico' = sensazione di non poter incidere sugli eventi e tendenza alla rassegnazione. "
    "Metti in evidenza le aree di forza, quelle di crescita e suggerisci 2-3 strategie concrete "
    "per avvicinarsi al profilo temporale bilanciato. Usa un tono empatico e costruttivo, in italiano. "
    "NON usare saluti iniziali. Inizia direttamente con l'analisi."
)

DEFAULT_GUIDED_TEXT_ZTPI_QUESTIONS_INTRO = (
    "Abbiamo completato l'analisi strutturata della tua prospettiva temporale. "
    "Ora puoi farmi qualsiasi domanda libera sui risultati ZTPI o chiedere "
    "consigli specifici su come lavorare sul tuo equilibrio temporale."
)

DEFAULT_GUIDED_TEXT_ZTPI_CONCLUSION = (
    "Hai completato il percorso di analisi della tua Prospettiva Temporale (ZTPI). "
    "Ricorda: lavorare verso un Profilo Temporale Bilanciato è un percorso graduale. "
    "Clicca sul pulsante in basso per tornare alla Home Page."
)


# --- System prompt definitions (stored in configs table) ---

SYSTEM_PROMPT_DEFINITIONS: List[Dict[str, str]] = [
    {
        "key": "prompt_factor",
        "label": "Prompt Analisi Fattori",
        "description": "Prompt di sistema per la modalità analisi fattori",
        "default": DEFAULT_SYSTEM_PROMPT_FACTOR,
    },
    {
        "key": "prompt_second_level",
        "label": "Prompt Secondo Livello",
        "description": "Prompt di sistema per la modalità analisi di secondo livello",
        "default": DEFAULT_SYSTEM_PROMPT_SECOND_LEVEL,
    },
    {
        "key": "prompt_generic",
        "label": "Prompt Chat Generica",
        "description": "Prompt di sistema per la chat generica",
        "default": DEFAULT_SYSTEM_PROMPT_GENERIC,
    },
    {
        "key": "prompt_ztpi_factor",
        "label": "Prompt ZTPI Analisi Fattori",
        "description": "Prompt di sistema per l'analisi fattori ZTPI",
        "default": DEFAULT_SYSTEM_PROMPT_ZTPI_FACTOR,
    },
    {
        "key": "prompt_ztpi_btp",
        "label": "Prompt ZTPI Profilo Temporale Bilanciato",
        "description": "Prompt di sistema per l'analisi del profilo bilanciato ZTPI",
        "default": DEFAULT_SYSTEM_PROMPT_ZTPI_BTP,
    },
]


# Questions phase system prompt (stored in configs table)
GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS: Dict[str, Dict[str, str]] = {
    "questions": {
        "key": "prompt_guided_questions",
        "label": "Guided - 4. Domande e Approfondimenti (system)",
        "description": "Prompt di sistema per la fase domande della guided chat",
        "default": DEFAULT_SYSTEM_PROMPT_GUIDED_QUESTIONS,
    }
}


# Static text messages for guided chat (stored in configs table)
GUIDED_STATIC_TEXT_DEFINITIONS: List[Dict[str, str]] = [
    {
        "key": "text_guided_questions_phase_banner",
        "label": "Guided - Messaggio system fase Domande",
        "description": "Messaggio statico (role=system) all'ingresso della fase domande",
        "default": DEFAULT_GUIDED_TEXT_QUESTIONS_PHASE_BANNER,
    },
    {
        "key": "text_guided_questions_intro",
        "label": "Guided - Messaggio intro fase Domande",
        "description": "Messaggio statico (assistant) introduttivo della fase domande",
        "default": DEFAULT_GUIDED_TEXT_QUESTIONS_INTRO,
    },
    {
        "key": "text_guided_conclusion",
        "label": "Guided - Messaggio Conclusione",
        "description": "Messaggio statico (assistant) finale della guided chat",
        "default": DEFAULT_GUIDED_TEXT_CONCLUSION,
    },
    {
        "key": "text_ztpi_questions_intro",
        "label": "ZTPI - Messaggio intro fase Domande",
        "description": "Messaggio introduttivo della fase domande per ZTPI",
        "default": DEFAULT_GUIDED_TEXT_ZTPI_QUESTIONS_INTRO,
    },
    {
        "key": "text_ztpi_conclusion",
        "label": "ZTPI - Messaggio Conclusione",
        "description": "Messaggio statico finale della guided chat ZTPI",
        "default": DEFAULT_GUIDED_TEXT_ZTPI_CONCLUSION,
    },
]


# Labels for the fixed phases: questions and conclusion (stored in configs table)
GUIDED_FIXED_PHASE_LABEL_DEFINITIONS: List[Dict[str, str]] = [
    {
        "key": "label_guided_questions",
        "label": "Guided - Nome Step Domande",
        "description": "Etichetta UI dello step guided: domande e approfondimenti",
        "default": "4. Domande e Approfondimenti",
    },
    {
        "key": "label_guided_conclusion",
        "label": "Guided - Nome Step Conclusione",
        "description": "Etichetta UI dello step guided: conclusione",
        "default": "Conclusione",
    },
]


MODE_TO_SYSTEM_PROMPT_KEY: Dict[str, str] = {
    "factor": "prompt_factor",
    "second-level": "prompt_second_level",
    "generic": "prompt_generic",
    "ztpi-factor": "prompt_ztpi_factor",
    "ztpi-btp": "prompt_ztpi_btp",
}


# All config-table text definitions (seeded on startup)
ALL_CONFIG_TEXT_DEFINITIONS: List[Dict[str, str]] = (
    SYSTEM_PROMPT_DEFINITIONS
    + list(GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS.values())
    + GUIDED_STATIC_TEXT_DEFINITIONS
    + GUIDED_FIXED_PHASE_LABEL_DEFINITIONS
)

# Public UI config keys (returned by /qsa/guided-ui-texts)
GUIDED_PUBLIC_UI_CONFIG_DEFINITIONS: List[Dict[str, str]] = (
    GUIDED_STATIC_TEXT_DEFINITIONS + GUIDED_FIXED_PHASE_LABEL_DEFINITIONS
)


# --- Default guided steps (seeded into guided_steps table) ---

DEFAULT_GUIDED_STEPS: List[Dict] = [
    {
        "id": "cognitive",
        "sort_order": 1,
        "label": "1. Fattori Cognitivi",
        "prompt": (
            "Analizza SOLO i fattori COGNITIVI (C1-C7) del mio profilo QSA. "
            "Per ciascuno dai il punteggio, interpretazione e breve commento."
        ),
        "system_prompt_mode": "factor",
        "color_theme": "blue",
    },
    {
        "id": "affective",
        "sort_order": 2,
        "label": "2. Fattori Affettivi",
        "prompt": (
            "Analizza SOLO i fattori AFFETTIVI (A1-A7) del mio profilo QSA. "
            "Per ciascuno dai il punteggio, interpretazione e breve commento."
        ),
        "system_prompt_mode": "factor",
        "color_theme": "purple",
    },
    {
        "id": "sl-elaboration",
        "sort_order": 3,
        "label": "3.1 Elaborazione e Org.",
        "prompt": (
            "Analisi 2° Livello - Parte 1: ELABORAZIONE E ORGANIZZAZIONE. "
            "Analizza insieme i fattori: C1 (Strategie elaborative), "
            "C5 (Organizzatori semantici), C7 (Autointerrogazione). "
            "Valuta come lo studente processa e struttura le informazioni."
        ),
        "system_prompt_mode": "second-level",
        "color_theme": "indigo",
    },
    {
        "id": "sl-selfcontrol",
        "sort_order": 4,
        "label": "3.2 Autocontrollo",
        "prompt": (
            "Analisi 2° Livello - Parte 2: AUTOCONTROLLO E CONCENTRAZIONE. "
            "Analizza insieme i fattori: C2 (Autoregolazione), C3 (Disorientamento), "
            "C6 (Difficoltà concentrazione). Valuta la capacità di gestire il processo "
            "di studio."
        ),
        "system_prompt_mode": "second-level",
        "color_theme": "indigo",
    },
    {
        "id": "sl-motivation",
        "sort_order": 5,
        "label": "3.3 Motivazione",
        "prompt": (
            "Analisi 2° Livello - Parte 3: MOTIVAZIONE E VOLONTÀ. "
            "Analizza insieme i fattori: A2 (Volizione), A5 (Mancanza perseveranza), "
            "A6 (Percezione competenza). Valuta la spinta motivazionale e la fiducia "
            "in se stessi."
        ),
        "system_prompt_mode": "second-level",
        "color_theme": "pink",
    },
    {
        "id": "sl-emotions",
        "sort_order": 6,
        "label": "3.4 Gestione Emotiva",
        "prompt": (
            "Analisi 2° Livello - Parte 4: GESTIONE EMOTIVA. "
            "Analizza insieme i fattori: A1 (Ansietà di base), "
            "A7 (Interferenze emotive). Valuta la capacità di gestire stress "
            "ed emozioni negative."
        ),
        "system_prompt_mode": "second-level",
        "color_theme": "pink",
    },
    {
        "id": "sl-attribution",
        "sort_order": 7,
        "label": "3.5 Stile Attributivo",
        "prompt": (
            "Analisi 2° Livello - Parte 5: STILE ATTRIBUTIVO. "
            "Analizza insieme i fattori: A3 (Attribuzione controllabile), "
            "A4 (Attribuzione incontrollabile). Valuta come lo studente interpreta "
            "successi e insuccessi."
        ),
        "system_prompt_mode": "second-level",
        "color_theme": "orange",
    },
    {
        "id": "sl-social",
        "sort_order": 8,
        "label": "3.6 Dimensione Sociale",
        "prompt": (
            "Analisi 2° Livello - Parte 6: DIMENSIONE SOCIALE. "
            "Analizza il fattore C4 (Collaborazione). Valuta la propensione "
            "al lavoro di gruppo."
        ),
        "system_prompt_mode": "second-level",
        "color_theme": "teal",
    },
]


# --- Default ZTPI guided steps (seeded into guided_steps table) ---

DEFAULT_ZTPI_GUIDED_STEPS: List[Dict] = [
    {
        "id": "ztpi-t1",
        "sort_order": 1,
        "label": "1. T1 - Passato Negativo",
        "prompt": (
            "Analizza il fattore T1 (Passato Negativo) del mio profilo ZTPI. "
            "Usa internamente la fascia del profilo equilibrato su scala 1-9: ideale 2-4, vicino 1-5. "
            "Indica il punteggio, la zona di appartenenza "
            "(In linea con il profilo equilibrato / Vicino al profilo equilibrato / Area di crescita), "
            "cosa significa per lo studente e un breve commento pratico. "
            "Non esplicitare all'utente formule, conversioni o parametri tecnici e non usare sigle."
        ),
        "system_prompt_mode": "ztpi-factor",
        "color_theme": "rose",
        "questionnaire_type": "ZTPI",
    },
    {
        "id": "ztpi-t2",
        "sort_order": 2,
        "label": "2. T2 - Passato Positivo",
        "prompt": (
            "Analizza il fattore T2 (Passato Positivo) del mio profilo ZTPI. "
            "Usa internamente la fascia del profilo equilibrato su scala 1-9: ideale 5-7, vicino 4-8. "
            "Indica il punteggio, la zona "
            "(In linea con il profilo equilibrato / Vicino al profilo equilibrato / Area di crescita), "
            "cosa significa e un commento pratico. "
            "Non esplicitare all'utente formule, conversioni o parametri tecnici e non usare sigle."
        ),
        "system_prompt_mode": "ztpi-factor",
        "color_theme": "amber",
        "questionnaire_type": "ZTPI",
    },
    {
        "id": "ztpi-t3",
        "sort_order": 3,
        "label": "3. T3 - Presente Edonistico",
        "prompt": (
            "Analizza il fattore T3 (Presente Edonistico) del mio profilo ZTPI. "
            "Usa internamente la fascia del profilo equilibrato su scala 1-9: ideale 7-8, vicino 6-9. "
            "Indica il punteggio, la zona "
            "(In linea con il profilo equilibrato / Vicino al profilo equilibrato / Area di crescita), "
            "cosa significa e un commento pratico. "
            "Spiega sempre in modo semplice che 'edonistico' significa anche capacità di vivere il presente "
            "e cogliere l'attimo (carpe diem), oltre alla ricerca di gratificazione immediata. "
            "Non esplicitare all'utente formule, conversioni o parametri tecnici e non usare sigle."
        ),
        "system_prompt_mode": "ztpi-factor",
        "color_theme": "orange",
        "questionnaire_type": "ZTPI",
    },
    {
        "id": "ztpi-t4",
        "sort_order": 4,
        "label": "4. T4 - Presente Fatalistico",
        "prompt": (
            "Analizza il fattore T4 (Presente Fatalistico) del mio profilo ZTPI. "
            "Usa internamente la fascia del profilo equilibrato su scala 1-9: ideale 1-3, vicino 1-4. "
            "Indica il punteggio, la zona "
            "(In linea con il profilo equilibrato / Vicino al profilo equilibrato / Area di crescita), "
            "cosa significa e un commento pratico. "
            "Spiega sempre in modo semplice che 'fatalistico' significa sensazione di non poter "
            "incidere sugli eventi e tendenza alla rassegnazione. "
            "Non esplicitare all'utente formule, conversioni o parametri tecnici e non usare sigle."
        ),
        "system_prompt_mode": "ztpi-factor",
        "color_theme": "red",
        "questionnaire_type": "ZTPI",
    },
    {
        "id": "ztpi-t5",
        "sort_order": 5,
        "label": "5. T5 - Futuro",
        "prompt": (
            "Analizza il fattore T5 (Futuro) del mio profilo ZTPI. "
            "Usa internamente la fascia del profilo equilibrato su scala 1-9: ideale 5-7, vicino 4-8. "
            "Indica il punteggio, la zona "
            "(In linea con il profilo equilibrato / Vicino al profilo equilibrato / Area di crescita), "
            "cosa significa e un commento pratico. "
            "Non esplicitare all'utente formule, conversioni o parametri tecnici e non usare sigle."
        ),
        "system_prompt_mode": "ztpi-factor",
        "color_theme": "teal",
        "questionnaire_type": "ZTPI",
    },
    {
        "id": "ztpi-btp",
        "sort_order": 6,
        "label": "6. Profilo Temporale Bilanciato",
        "prompt": (
            "Analisi Finale ZTPI: confronta il mio profilo complessivo con il "
            "Profilo Temporale Bilanciato (PTB) ideale di Zimbardo "
            "usando internamente la parametrizzazione tecnica. "
            "(T1 ideale 2-4, T2 ideale 5-7, T3 ideale 7-8, T4 ideale 1-3, T5 ideale 5-7; "
            "fasce vicino: T1 1-5, T2 4-8, T3 6-9, T4 1-4, T5 4-8). "
            "Indica quali fattori sono in linea con il PTB e quali si discostano, "
            "specificando per ogni fattore se è sotto, dentro o sopra il range ideale. "
            "Aggiungi una breve lettura dello scostamento complessivo. "
            "Nel testo per lo studente non usare sigle: sostituisci le sigle con nomi completi. "
            "Spiega esplicitamente i termini: 'presente edonistico' = vivere il presente e cogliere l'attimo (carpe diem), "
            "con equilibrio e responsabilità; "
            "'presente fatalistico' = sensazione di non poter incidere sugli eventi e rassegnazione. "
            "Non esplicitare all'utente formule, conversioni o parametri tecnici. "
            "Proponi 2-3 strategie concrete per avvicinarsi al profilo bilanciato."
        ),
        "system_prompt_mode": "ztpi-btp",
        "color_theme": "purple",
        "questionnaire_type": "ZTPI",
    },
]
