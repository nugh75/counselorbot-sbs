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
