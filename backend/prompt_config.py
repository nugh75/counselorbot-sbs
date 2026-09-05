import json
from pathlib import Path
from typing import Dict, List

# I testi dei prompt stanno in `backend/prompts/`, un file per prompt: una
# modifica si legge come diff di testo invece che come stringa dentro una
# concatenazione Python. Qui vivono solo i DEFAULT DI FABBRICA — il testo
# davvero servito e' quello del DB, che l'admin puo' cambiare dal pannello
# (lo storico e le regole di precedenza stanno in `prompt_revisions.py`).
_PROMPTS_DIR = Path(__file__).parent / "prompts"


def _text(name: str) -> str:
    """Default di fabbrica letto da `backend/prompts/<name>.md`, verbatim.

    Viene tolto solo l'a capo finale, quello che aggiungono gli editor: non fa
    parte del prompt. Gli spazi e gli a capo che servono a incollare un blocco
    a un altro restano nel codice che li compone, cosi' il file contiene il
    testo e nient'altro.
    """
    return (_PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8").rstrip("\n")


DEFAULT_SYSTEM_PROMPT_GENERIC = _text("default_system_prompt_generic")

DEFAULT_SYSTEM_PROMPT_FACTOR = _text("default_system_prompt_factor")

# Direttiva di profondità per i follow-up in-step: i prompt QA storici sono nati
# per bloccare la ri-analisi del profilo a ogni domanda e hanno over-corretto
# (risposte corte e superficiali anche quando lo studente chiede di approfondire).
# Blocco additivo con sentinella (stesso pattern idempotente di FACTOR_INTERPLAY,
# riusato in main.startup_event sulle righe DB personalizzate).
QA_DEPTH_SENTINEL = "[DEPTH ON REQUEST]"

DEFAULT_QA_DEPTH_DIRECTIVE = '\n\n' + _text("default_qa_depth_directive")

DEFAULT_SYSTEM_PROMPT_FACTOR_QA = (
    "In the follow-up phase of an analysis step already completed, the student asks "
    "a clarifying question. "
    "Your task is to COMMENT on and EXPAND ONLY what has already emerged in the "
    "current conversation: it is a comment on what was already said, not a new analysis. "
    "Reply in a FOCUSED, conversational way. Binding rules: "
    "(1) do NOT produce tables unless the student explicitly requests them; "
    "(2) answer ONLY the question asked, referring solely to the factors already discussed "
    "and relevant to the question; "
    "(3) do NOT re-list or re-analyse all the factors of the profile; "
    "(4) do NOT introduce factors, scores, data or topics not yet covered in the "
    "conversation (e.g. if only the cognitive factors have been discussed so far, do not bring in "
    "the affective factors or later steps, unless the student explicitly asks); "
    "(5) no opening greetings, go straight to the answer. "
    "Clear and professional tone, with practical, targeted suggestions."
    + DEFAULT_QA_DEPTH_DIRECTIVE
)

# Direttiva di sintesi per il secondo livello: i counselor tendono a elencare i
# fattori del gruppo invece di metterli in relazione. Questo blocco (additivo,
# riusato anche nell'upgrade DB in main.startup_event) impone almeno una frase
# esplicita sull'interazione tra fattori. La sentinella serve all'idempotenza.
FACTOR_INTERPLAY_SENTINEL = "[FACTOR INTERPLAY]"

DEFAULT_FACTOR_INTERPLAY_QSA = '\n\n' + _text("default_factor_interplay_qsa")

DEFAULT_FACTOR_INTERPLAY_QSAR = '\n\n' + _text("default_factor_interplay_qsar")

# Direttiva di metodo per il secondo livello: oltre alla lettura relazionale
# (FACTOR INTERPLAY), il counselor deve proporre un'ipotesi interpretativa e far
# riflettere lo studente PRIMA dei consigli pratici. Blocco additivo con propria
# sentinella (stesso pattern idempotente di FACTOR_INTERPLAY, riusato in
# main.startup_event per l'upgrade delle righe DB personalizzate).
SECOND_LEVEL_METHOD_SENTINEL = "[SECOND-LEVEL METHOD]"

SYNTHESIS_ADVICE_SENTINEL = "[SYNTHESIS ADVICE]"

SYNTHESIS_ADVICE_DIRECTIVE = '\n\n' + _text("synthesis_advice_directive")

DEFAULT_SECOND_LEVEL_METHOD = '\n\n' + _text("default_second_level_method")

DEFAULT_SYSTEM_PROMPT_SECOND_LEVEL = (
    "Provide second-level analysis of the "
    "macro-dimensions of the study method, relating the factors to one another and "
    "proposing practical guidance. "
    "You are inside an already-started structured analysis sequence: do NOT use opening greetings "
    "(e.g. 'Hi!', 'Great idea', 'Welcome'). Start directly with the requested analysis."
    + DEFAULT_FACTOR_INTERPLAY_QSA
    + DEFAULT_SECOND_LEVEL_METHOD
)

DEFAULT_SYSTEM_PROMPT_GUIDED_QUESTIONS = _text("default_system_prompt_guided_questions")

DEFAULT_GUIDED_TEXT_QUESTIONS_PHASE_BANNER = "--- Fase finale: Riflessione e Strategie ---"

DEFAULT_GUIDED_TEXT_QUESTIONS_INTRO = (
    "Abbiamo completato l'analisi strutturata. Prima di concludere, puoi riflettere "
    "sui risultati, chiarire cosa ti rappresenta di più e scegliere una strategia "
    "concreta da provare."
)

DEFAULT_GUIDED_TEXT_CONCLUSION = (
    "Hai completato il percorso di analisi del QSA. Spero ti sia stato utile! "
    "Continua per scegliere il prossimo passaggio."
)

# --- QSAr System Prompts ---

DEFAULT_SYSTEM_PROMPT_QSAR_FACTOR = _text("default_system_prompt_qsar_factor")

DEFAULT_SYSTEM_PROMPT_QSAR_FACTOR_QA = (
    "In the follow-up phase of an analysis step already completed, answer the "
    "student's question in a focused way, commenting only on the factors "
    "already discussed and relevant to the question. Do not produce tables unless explicitly requested, "
    "do not re-analyse the whole profile and do not anticipate other steps. Do not use opening greetings."
    + DEFAULT_QA_DEPTH_DIRECTIVE
)

DEFAULT_SYSTEM_PROMPT_QSAR_SECOND_LEVEL = (
    "Provide an integrated analysis of the short-form QSAr factors "
    "of the study method, connecting the relevant results and proposing practical guidance in English. "
    "Avoid diagnoses and do not use opening greetings. Start directly with the requested analysis."
    + DEFAULT_FACTOR_INTERPLAY_QSAR
    + DEFAULT_SECOND_LEVEL_METHOD
)

DEFAULT_SYSTEM_PROMPT_QSAR_GENERIC = (
    "Analyse the QSAr profile (Learning Strategies Questionnaire - Short form) "
    "clearly and non-diagnostically, referring to the profile provided."
)

# --- Cross-instrument synthesis (secondo livello inter-strumento) ---

DEFAULT_SYSTEM_PROMPT_CROSS_SYNTHESIS = (
    "You are producing a cross-instrument synthesis for a student who has completed "
    "two or more questionnaires (e.g. QSA learning strategies, QSAr short form, ZTPI "
    "time perspective). The [MULTI-INSTRUMENT PROFILE] block lists, for each "
    "instrument, the factor scores with the interpretation label already resolved: "
    "inversions and ideal ranges are pre-computed, just read each row, do NOT "
    "re-derive bands yourself. Do not re-analyse the instruments one by one: identify "
    "the 2-3 most salient convergences or tensions ACROSS instruments (e.g. a strong "
    "future orientation sustaining volition; anxiety surfacing consistently in more "
    "than one profile; a hedonistic present in tension with self-regulation) and build "
    "a single integrated picture of how the student studies and faces the future, "
    "grounded in the actual scores. Name each factor with code and full name. "
    "Avoid diagnoses, avoid unexplained technical acronyms, and address the student "
    "directly."
    + DEFAULT_SECOND_LEVEL_METHOD
)

DEFAULT_GUIDED_TEXT_QSAR_QUESTIONS_INTRO = (
    "Abbiamo completato l'analisi strutturata del tuo profilo QSAr. "
    "Ora puoi farmi qualsiasi domanda libera sui risultati o chiedere consigli specifici."
)

DEFAULT_GUIDED_TEXT_QSAR_CONCLUSION = (
    "Hai completato il percorso di analisi del QSAr. "
    "Continua per scegliere il prossimo passaggio."
)


# --- ZTPI System Prompts ---

DEFAULT_SYSTEM_PROMPT_ZTPI_FACTOR = _text("default_system_prompt_ztpi_factor")

DEFAULT_SYSTEM_PROMPT_ZTPI_BTP = _text("default_system_prompt_ztpi_btp")


# --- Savickas Career Construction Interview (5 domande) ---

DEFAULT_SYSTEM_PROMPT_SAVICKAS_INTERVIEW = _text("default_system_prompt_savickas_interview")

DEFAULT_SYSTEM_PROMPT_IDEA = _text("default_system_prompt_idea")

# La copia live nel DB non viene sovrascritta dal seed. Questa ricostruzione
# esatta permette alla migrazione di aggiornare solo il vecchio testo di serie,
# lasciando intatte le personalizzazioni dell'admin.
PREVIOUS_DEFAULT_SYSTEM_PROMPT_IDEA = DEFAULT_SYSTEM_PROMPT_IDEA.replace(
    "When a distinction stays abstract or the person hesitates, offer two short, "
    "concrete, contrasting examples and ask which is closer. Present them as "
    "possibilities, never as facts about the person or their idea. ",
    "",
)

PRE_ORIENTATION_DEFAULT_SYSTEM_PROMPT_IDEA = PREVIOUS_DEFAULT_SYSTEM_PROMPT_IDEA.replace(
    "Begin with the concrete observation that advances the work. Never open with "
    "generic acknowledgements such as 'I understand', 'you are right', 'of course', "
    "or their equivalents. Restate only when it resolves an ambiguity or checks a "
    "working hypothesis; otherwise move directly to the next orienting question. "
    "When useful, make the criterion, alternatives or consequences at stake visible. "
    "Then update the shared map: every reply that adds anything MUST end with one fenced ",
    "After each answer, restate in one sentence what you understood, then update "
    "the shared map: every reply that adds anything MUST end with one fenced ",
)

LEGACY_DEFAULT_SYSTEM_PROMPT_IDEA = PRE_ORIENTATION_DEFAULT_SYSTEM_PROMPT_IDEA.replace(
    "Do not give advice, reading suggestions or a plan while the idea is still "
    "forming; premature solutions would replace the person's reasoning. At the "
    "end, however, you MUST turn the completed map into an explicit plan for "
    "producing or developing the idea, with ordered actions and a clear first "
    "action. Uncertainty becomes a verification action, never invented certainty. ",
    "Do not give advice, reading suggestions or a plan unless the person asks "
    "for one; an idea that is still forming does not need solutions yet. ",
)

# Le quattro varianti: stesso percorso, materia diversa. La direttiva si aggiunge
# al prompt di sistema all'avvio della sessione e resta per tutta la sessione.
DEFAULT_IDEA_VARIANT_STUDENT_PATH = _text("default_idea_variant_student_path")

DEFAULT_IDEA_VARIANT_STUDENT_OPEN = _text("default_idea_variant_student_open")

DEFAULT_IDEA_VARIANT_RESEARCH = _text("default_idea_variant_research")

DEFAULT_IDEA_VARIANT_CONCEPT = _text("default_idea_variant_concept")

DEFAULT_SYSTEM_PROMPT_SAVICKAS_SUMMARY = _text("default_system_prompt_savickas_summary")

DEFAULT_GUIDED_TEXT_ZTPI_QUESTIONS_INTRO = _text("default_guided_text_ztpi_questions_intro")

DEFAULT_GUIDED_TEXT_ZTPI_CONCLUSION = (
    "Hai completato il percorso di analisi della tua prospettiva temporale. "
    "Ricorda: lavorare verso un profilo temporale equilibrato è un percorso graduale. "
    "Continua per scegliere il prossimo passaggio."
)

DEFAULT_GUIDED_TEXT_SAVICKAS_QUESTIONS_INTRO = (
    "Abbiamo completato le 5 domande dell'intervista Savickas. "
    "Ora puoi chiedere chiarimenti sulla sintesi o approfondire i prossimi passi."
)

DEFAULT_GUIDED_TEXT_SAVICKAS_CONCLUSION = (
    "Hai completato l'intervista Savickas di career counseling. "
    "Puoi usare la sintesi come bussola e aggiornarla nel tempo mentre fai esperienza. "
    "Continua per scegliere il prossimo passaggio."
)


# --- Questionari basati su punteggi di fattore (QPCS, QPCC, QAP) ---
# Come il QSA: lo studente inserisce i valori dei fattori (scala 1-9) e l'AI
# produce un'analisi guidata. Tutti i fattori sono diretti (alto = forza).

_FACTOR_TABLE_RULES = _text("factor_table_rules")

# QPCS — Perception of one's own Strategic Competences (Pellerey)
DEFAULT_SYSTEM_PROMPT_QPCS_FACTOR = (
    "Analyse the Questionnaire on the Perception of one's own Strategic Competences "
    "(QPCS) profile by strategic-competence areas: "
    "S1 Managing emotions, S2 Communication competence, S3 Will and perseverance, "
    "S4 Strategies and collaboration, S5 Confidence and life project. "
    + _FACTOR_TABLE_RULES
)

# QPCS — guided analysis of self-assessment results (7-step guided path)
DEFAULT_SYSTEM_PROMPT_QPCS_ANALYSIS = _text("default_system_prompt_qpcs_analysis")

DEFAULT_SYSTEM_PROMPT_QPCS_SUMMARY = _text("default_system_prompt_qpcs_summary")

# QPCC — Perception of one's own Competences and Beliefs (Pellerey-Orio)
DEFAULT_SYSTEM_PROMPT_QPCC_FACTOR = (
    "Analyse the Questionnaire on the Perception of one's own Competences and Beliefs "
    "(QPCC) profile by areas: "
    "K1 Public communication, K2 Managing anxiety and responsibility, "
    "K3 Volition and self-regulation, K4 Elaboration strategies, K5 Beliefs about oneself. "
    + _FACTOR_TABLE_RULES
)

# QAP — Career Adaptability (CAAS, Savickas-Porfeli)
DEFAULT_SYSTEM_PROMPT_QAP_FACTOR = (
    "Analyse the Career Adaptability Questionnaire (QAP, adaptation of the CAAS) "
    "profile by its 4 adaptability resources: "
    "AD1 Future orientation, AD2 Control and autonomy, AD3 Curiosity and exploration, "
    "AD4 Confidence and problem solving. "
    + _FACTOR_TABLE_RULES
)

DEFAULT_GUIDED_TEXT_QPCS_QUESTIONS_INTRO = (
    "Abbiamo analizzato il tuo profilo di competenze strategiche. "
    "Ora puoi farmi qualsiasi domanda libera o chiedere consigli pratici."
)
DEFAULT_GUIDED_TEXT_QPCS_CONCLUSION = (
    "Hai completato l'analisi delle tue competenze strategiche (QPCS). "
    "Continua per scegliere il prossimo passaggio."
)
DEFAULT_GUIDED_TEXT_QPCC_QUESTIONS_INTRO = (
    "Abbiamo analizzato il tuo profilo di competenze e convinzioni. "
    "Ora puoi farmi qualsiasi domanda libera o chiedere consigli pratici."
)
DEFAULT_GUIDED_TEXT_QPCC_CONCLUSION = (
    "Hai completato l'analisi di competenze e convinzioni (QPCC). "
    "Continua per scegliere il prossimo passaggio."
)
DEFAULT_GUIDED_TEXT_QAP_QUESTIONS_INTRO = (
    "Abbiamo analizzato il tuo profilo di adattabilita' professionale. "
    "Ora puoi farmi qualsiasi domanda libera o chiedere consigli pratici."
)
DEFAULT_GUIDED_TEXT_QAP_CONCLUSION = (
    "Hai completato l'analisi dell'adattabilita' professionale (QAP). "
    "Continua per scegliere il prossimo passaggio."
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
        "key": "prompt_factor_qa",
        "label": "Prompt Domanda di Approfondimento (in-step)",
        "description": "Prompt di sistema per le domande libere dello studente durante uno step di analisi QSA: risposta puntuale, niente tabelle, niente anticipo di altri fattori",
        "default": DEFAULT_SYSTEM_PROMPT_FACTOR_QA,
    },
    {
        "key": "prompt_generic",
        "label": "Prompt Chat Generica",
        "description": "Prompt di sistema per la chat generica",
        "default": DEFAULT_SYSTEM_PROMPT_GENERIC,
    },
    {
        "key": "prompt_qsar_factor",
        "label": "Prompt QSAr Analisi Fattori",
        "description": "Prompt di sistema per l'analisi fattori QSAr",
        "default": DEFAULT_SYSTEM_PROMPT_QSAR_FACTOR,
    },
    {
        "key": "prompt_qsar_second_level",
        "label": "Prompt QSAr Secondo Livello",
        "description": "Prompt di sistema per l'analisi integrata QSAr",
        "default": DEFAULT_SYSTEM_PROMPT_QSAR_SECOND_LEVEL,
    },
    {
        "key": "prompt_qsar_factor_qa",
        "label": "Prompt QSAr Domanda di Approfondimento",
        "description": "Prompt per le domande in-step del percorso QSAr",
        "default": DEFAULT_SYSTEM_PROMPT_QSAR_FACTOR_QA,
    },
    {
        "key": "prompt_qsar_generic",
        "label": "Prompt QSAr Chat Generica",
        "description": "Prompt di sistema per le domande libere sul QSAr",
        "default": DEFAULT_SYSTEM_PROMPT_QSAR_GENERIC,
    },
    {
        "key": "prompt_cross_synthesis",
        "label": "Prompt Sintesi Cross-Strumento",
        "description": "Prompt di sistema per la sintesi integrata tra strumenti diversi (profilo multi-strumento nella pagina personale)",
        "default": DEFAULT_SYSTEM_PROMPT_CROSS_SYNTHESIS,
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
    {
        "key": "prompt_savickas_interview",
        "label": "Prompt Savickas Intervista",
        "description": "Prompt di sistema per la conduzione dell'intervista Savickas",
        "default": DEFAULT_SYSTEM_PROMPT_SAVICKAS_INTERVIEW,
    },
    {
        "key": "prompt_idea_focus",
        "label": "Prompt Idea",
        "description": "Prompt di sistema dello strumento Idea: conduzione socratica della messa a fuoco",
        "default": DEFAULT_SYSTEM_PROMPT_IDEA,
    },
    {
        "key": "prompt_idea_variant_student_path",
        "label": "Idea - variante percorso di studio",
        "description": "Direttiva della variante studente: idea di studio o carriera",
        "default": DEFAULT_IDEA_VARIANT_STUDENT_PATH,
    },
    {
        "key": "prompt_idea_variant_student_open",
        "label": "Idea - variante idea libera",
        "description": "Direttiva della variante studente: idea di qualunque natura, senza aggancio agli strumenti",
        "default": DEFAULT_IDEA_VARIANT_STUDENT_OPEN,
    },
    {
        "key": "prompt_idea_variant_research",
        "label": "Idea - variante ricerca e didattica",
        "description": "Direttiva della variante docente/ricercatore: domanda di ricerca, disegno, unita' didattica",
        "default": DEFAULT_IDEA_VARIANT_RESEARCH,
    },
    {
        "key": "prompt_idea_variant_concept",
        "label": "Idea - variante concetto o costrutto",
        "description": "Direttiva per esplorare, delimitare e rendere lavorabile un concetto o costrutto",
        "default": DEFAULT_IDEA_VARIANT_CONCEPT,
    },
    {
        "key": "prompt_savickas_summary",
        "label": "Prompt Savickas Sintesi Finale",
        "description": "Prompt di sistema per la sintesi finale dell'intervista Savickas",
        "default": DEFAULT_SYSTEM_PROMPT_SAVICKAS_SUMMARY,
    },
    {
        "key": "prompt_qpcs_factor",
        "label": "Prompt QPCS Analisi Fattori",
        "description": "Prompt di sistema per l'analisi dei fattori QPCS (tabella, scala 1-9)",
        "default": DEFAULT_SYSTEM_PROMPT_QPCS_FACTOR,
    },
    {
        "key": "prompt_qpcs_analysis",
        "label": "Prompt QPCS Analisi Risultati",
        "description": "Prompt di sistema per l'analisi guidata dei risultati QPCS (autovalutazione, punteggi come riferimento) area per area",
        "default": DEFAULT_SYSTEM_PROMPT_QPCS_ANALYSIS,
    },
    {
        "key": "prompt_qpcs_summary",
        "label": "Prompt QPCS Sintesi Finale",
        "description": "Prompt di sistema per la sintesi finale dell'analisi dei risultati QPCS",
        "default": DEFAULT_SYSTEM_PROMPT_QPCS_SUMMARY,
    },
    {
        "key": "prompt_qpcc_factor",
        "label": "Prompt QPCC Analisi Fattori",
        "description": "Prompt di sistema per l'analisi dei fattori QPCC (tabella, scala 1-9)",
        "default": DEFAULT_SYSTEM_PROMPT_QPCC_FACTOR,
    },
    {
        "key": "prompt_qap_factor",
        "label": "Prompt QAP Analisi Fattori",
        "description": "Prompt di sistema per l'analisi delle 4 risorse QAP (tabella, scala 1-9)",
        "default": DEFAULT_SYSTEM_PROMPT_QAP_FACTOR,
    },
]

SYSTEM_PROMPT_DEFAULTS: Dict[str, str] = {
    item["key"]: item["default"] for item in SYSTEM_PROMPT_DEFINITIONS
}


# --- Chatbot informativo sul sito competenzestrategiche.it (RAG) ---
# Risponde a domande sul progetto/sito basandosi SOLO sui materiali in docs/
# (recuperati via RAG e iniettati come blocchi [FONTE n]). Niente conoscenza
# esterna: se la risposta non è nei materiali, lo dichiara.

_SITE_CHAT_COMMON_RULES = _text("site_chat_common_rules")

# Scheda canonica degli strumenti (dati dall'app: sigle, nomi IT, fattori). Iniettata
# nel prompt per garantire nomi/sigle/conteggi esatti, indipendentemente dal RAG.
DEFAULT_SITE_CHAT_KNOWLEDGE_CARD = _text("default_site_chat_knowledge_card")

DEFAULT_SYSTEM_PROMPT_SITE_DOCENTE = (
    "You are the information assistant of the project and the website competenzestrategiche.it, "
    "addressed to TEACHERS, trainers, and operators.\n"
    "Provide accurate and professional answers on instruments (QSA, QSAr, ZTPI, Savickas, "
    "QPCS, QPCC, QAP), methodology, theoretical foundations, administration, and educational use.\n"
    "You may use appropriate technical terminology and refer to the materials and guides.\n\n"
    + _SITE_CHAT_COMMON_RULES
)

DEFAULT_SYSTEM_PROMPT_SITE_STUDENTE = (
    "You are the information assistant of the website competenzestrategiche.it, addressed to STUDENTS.\n"
    "Explain in a simple, encouraging, and concrete way what the questionnaires are, "
    "what they are for, how they are carried out, and how to read the results.\n"
    "Avoid technical jargon: use common words and examples. Friendly and reassuring tone.\n\n"
    + _SITE_CHAT_COMMON_RULES
)

DEFAULT_SITE_CHAT_PLATFORM_CONTEXT = _text("default_site_chat_platform_context")

# --- Collezione separata: CounselorBot (la piattaforma), distinta dai contenuti
# teorici di competenzestrategiche.it. Testo base sempre iniettato + prompt audience. ---
DEFAULT_COUNSELORBOT_CHAT_CONTEXT = _text("default_counselorbot_chat_context")

DEFAULT_SYSTEM_PROMPT_COUNSELORBOT_DOCENTE = (
    "You are the assistant of the CounselorBot platform, addressed to TEACHERS, trainers and operators.\n"
    "Answer about how the platform works: administering the questionnaires, the guided AI chat, the AI "
    "counselors, the student profile (open learner model), roles, supported languages, and data handling.\n"
    "Stay on the PLATFORM: do not explain the strategic-competences theory of competenzestrategiche.it.\n\n"
    + _SITE_CHAT_COMMON_RULES
)

DEFAULT_SYSTEM_PROMPT_COUNSELORBOT_STUDENTE = (
    "You are the assistant of the CounselorBot platform, addressed to STUDENTS.\n"
    "Explain in a simple and reassuring way HOW TO USE CounselorBot: how to start, how the guided chat "
    "works, how to answer the questionnaires, and how to read your own profile.\n"
    "Avoid technical jargon: use common words and examples. Friendly and encouraging tone.\n\n"
    + _SITE_CHAT_COMMON_RULES
)

SITE_CHAT_CONFIG_DEFINITIONS: List[Dict[str, str]] = [
    {
        "key": "site_chat_knowledge_card",
        "label": "Site Chat - Scheda strumenti (dati canonici)",
        "description": "Sigle, nomi e fattori esatti degli strumenti, iniettati nel prompt per risposte accurate e non generiche",
        "default": DEFAULT_SITE_CHAT_KNOWLEDGE_CARD,
    },
    {
        "key": "site_chat_platform_context",
        "label": "Site Chat - Contesto piattaforma (distinzioni/attribuzioni)",
        "description": "Verità di base iniettata nel prompt: distingue questa piattaforma da competenzestrategiche.it, "
                       "corregge attribuzioni (ZTPI/Zimbardo, Savickas solo-piattaforma, costrutti da altri autori)",
        "default": DEFAULT_SITE_CHAT_PLATFORM_CONTEXT,
    },
    {
        "key": "prompt_site_chat_docente",
        "label": "Site Chat - Prompt Docente",
        "description": "Prompt di sistema del chatbot informativo del sito, modalità docente (RAG, solo materiali)",
        "default": DEFAULT_SYSTEM_PROMPT_SITE_DOCENTE,
    },
    {
        "key": "prompt_site_chat_studente",
        "label": "Site Chat - Prompt Studente",
        "description": "Prompt di sistema del chatbot informativo del sito, modalità studente (RAG, solo materiali)",
        "default": DEFAULT_SYSTEM_PROMPT_SITE_STUDENTE,
    },
    {
        "key": "embedding_model",
        "label": "Site Chat - Modello Embedding (Ollama)",
        "description": "Modello di embedding locale (via Ollama) per il RAG del chatbot del sito. "
                       "Default qwen3-embedding:4b (già installato, SOTA multilingue). "
                       "Alternative: bge-m3 (richiede ollama pull), nomic-embed-text.",
        "default": "qwen3-embedding:4b",
    },
    {
        "key": "site_chat_top_k",
        "label": "Site Chat - Numero passaggi recuperati (top-k)",
        "description": "Quanti chunk recuperare dall'indice RAG per ogni domanda",
        "default": "10",
    },
    {
        "key": "site_chat_category_weights",
        "label": "Site Chat - Pesi per macro-categoria (JSON)",
        "description": "Peso moltiplicativo per categoria nel ranking RAG (priorità contenuti core vs riferimenti esterni)",
        "default": (
            '{"strumenti": 1.0, "guide": 1.0, "validazione": 1.0, '
            '"studi": 0.9, "convegni": 0.75, "approfondimenti": 0.5, "altro": 0.9}'
        ),
    },
    {
        "key": "site_chat_audience_weights",
        "label": "Site Chat - Pesi per pubblico (JSON)",
        "description": "Moltiplicatori categoria per pubblico (docente/studente); default 1.0 dove non specificato",
        "default": (
            '{"docente": {"studi": 1.2, "validazione": 1.2, "convegni": 1.1}, '
            '"studente": {"guide": 1.2, "strumenti": 1.2}}'
        ),
    },
    {
        "key": "site_chat_max_per_source",
        "label": "Site Chat - Max chunk per documento",
        "description": "Tetto di chunk dallo stesso documento nei risultati (diversità, evita che un libro riempia tutto)",
        "default": "3",
    },
    {
        "key": "site_chat_min_score",
        "label": "Site Chat - Soglia minima similarità",
        "description": "Coseno minimo (0-1) perché un chunk sia considerato: scarta match deboli",
        "default": "0.2",
    },
]

# Collezione separata CounselorBot: testo base sempre iniettato + prompt audience.
# (La cartella RAG è docs-counselorbot/, indicizzata a parte; vedi rag_index.py.)
COUNSELORBOT_CHAT_CONFIG_DEFINITIONS: List[Dict[str, str]] = [
    {
        "key": "counselorbot_chat_context",
        "label": "CounselorBot Chat - Contesto piattaforma (base, sempre iniettato)",
        "description": "Verità di base sulla piattaforma CounselorBot, distinta da competenzestrategiche.it; "
                       "iniettata in testa al prompt quando si sceglie la base 'CounselorBot'",
        "default": DEFAULT_COUNSELORBOT_CHAT_CONTEXT,
    },
    {
        "key": "prompt_counselorbot_chat_docente",
        "label": "CounselorBot Chat - Prompt Docente",
        "description": "Prompt di sistema dell'assistente per la base CounselorBot, modalità docente (RAG su docs-counselorbot)",
        "default": DEFAULT_SYSTEM_PROMPT_COUNSELORBOT_DOCENTE,
    },
    {
        "key": "prompt_counselorbot_chat_studente",
        "label": "CounselorBot Chat - Prompt Studente",
        "description": "Prompt di sistema dell'assistente per la base CounselorBot, modalità studente (RAG su docs-counselorbot)",
        "default": DEFAULT_SYSTEM_PROMPT_COUNSELORBOT_STUDENTE,
    },
]

# --- Contesti per le nuove collezioni RAG (framework teorico e questionari) ---

DEFAULT_FRAMEWORK_CHAT_CONTEXT = _text("default_framework_chat_context")

DEFAULT_QUESTIONARI_CHAT_CONTEXT = _text("default_questionari_chat_context")

FRAMEWORK_CHAT_CONFIG_DEFINITIONS: List[Dict[str, str]] = [
    {
        "key": "framework_chat_context",
        "label": "Framework Chat - Contesto (base, sempre iniettato)",
        "description": "Verita' di base sulla collezione Framework: articoli teorici, ricerche, "
                       "pubblicazioni accademiche su competenze strategiche e costrutti collegati",
        "default": DEFAULT_FRAMEWORK_CHAT_CONTEXT,
    },
]

QUESTIONARI_CHAT_CONFIG_DEFINITIONS: List[Dict[str, str]] = [
    {
        "key": "questionari_chat_context",
        "label": "Questionari Chat - Contesto (base, sempre iniettato)",
        "description": "Verita' di base sulla collezione Questionari: strumenti QSA/QSAr/ZTPI/QPCS/QPCC/QAP, "
                       "item, fattori, scoring, interpretazione",
        "default": DEFAULT_QUESTIONARI_CHAT_CONTEXT,
    },
]

# --- pQBL (pure Question-Based Learning) da PDF — metodo Jemstedt & Bälter ---
# Lo studente carica un PDF; l'AI estrae skill e genera MCQ con feedback
# formativo per ogni alternativa. Vedi backend/pqbl_generator.py.

DEFAULT_PQBL_SKILL_EXTRACTION_PROMPT = _text("default_pqbl_skill_extraction_prompt")

DEFAULT_PQBL_QUESTION_GENERATION_PROMPT = _text("default_pqbl_question_generation_prompt")

DEFAULT_PQBL_ONBOARDING_TEXT = _text("default_pqbl_onboarding_text")

PQBL_CONFIG_DEFINITIONS: List[Dict[str, str]] = [
    {
        "key": "pqbl_skill_extraction_prompt",
        "label": "pQBL - Prompt Estrazione Skill",
        "description": "Prompt di sistema per derivare le skill dal PDF caricato (output JSON)",
        "default": DEFAULT_PQBL_SKILL_EXTRACTION_PROMPT,
    },
    {
        "key": "pqbl_question_generation_prompt",
        "label": "pQBL - Prompt Generazione Domande",
        "description": "Prompt di sistema per generare le MCQ con feedback per ogni opzione (regole R1/R2 dell'articolo)",
        "default": DEFAULT_PQBL_QUESTION_GENERATION_PROMPT,
    },
    {
        "key": "pqbl_onboarding_text",
        "label": "pQBL - Testo Onboarding Studente",
        "description": "Testo mostrato allo studente prima della sessione (le domande non sono un esame, lo sforzo aiuta, sessioni brevi)",
        "default": DEFAULT_PQBL_ONBOARDING_TEXT,
    },
    {
        "key": "pqbl_model",
        "label": "pQBL - Modello dedicato (opzionale)",
        "description": "Modello da usare per la generazione pQBL; vuoto = provider/modello attivi",
        "default": "",
    },
]


SITE_CHAT_MODE_TO_PROMPT_KEY: Dict[str, str] = {
    "docente": "prompt_site_chat_docente",
    "studente": "prompt_site_chat_studente",
}

COUNSELORBOT_CHAT_MODE_TO_PROMPT_KEY: Dict[str, str] = {
    "docente": "prompt_counselorbot_chat_docente",
    "studente": "prompt_counselorbot_chat_studente",
}


# --- Intro / presentation step (warm welcome, no scores/factors) ---
# One per instrument: seeded into configs as prompt_<strum>_intro and rendered
# for the matching GuidedStep (id intro / <strum>-intro, system_prompt_mode=intro).
# All in English (the language directive handles localization at runtime).

INTRO_ALLOWED_QUESTIONS_SENTINEL = "[INTRO ALLOWED QUESTIONS]"
INTRO_ALLOWED_QUESTIONS = (
    "\n\n"
    f"{INTRO_ALLOWED_QUESTIONS_SENTINEL}\n"
    "If the student asks how the interaction works, explain briefly that the "
    "path is guided step by step: the student can move forward when ready and "
    "can write whenever they want a clarification. For score-based questionnaire "
    "paths, describe the counsellor role positively as guiding the reading of "
    "the profile results already provided. Avoid meta-negations about questions "
    "or stage labels; do not make the intro sound like a procedural disclaimer. "
    "Only explicitly dialogic or interview phases are question-led.\n"
    "If the student asks what tools are available in CounselorBot, list only "
    "these instruments: QSA and QSAr for learning strategies, ZTPI for time "
    "perspective, SAVICKAS for the career construction interview, QPCS and QPCC "
    "for competences and beliefs, and QAP for career adaptability. Keep it "
    "brief and do not analyse any result."
)

_SCORE_BASED_INTRO_FLOW = _text("score_based_intro_flow") + '\n'

_SAVICKAS_INTRO_FLOW = _text("savickas_intro_flow") + '\n'

DEFAULT_SYSTEM_PROMPT_INTRO = (
    "You are introducing yourself to the student at the start of the QSA "
    "exploration of their learning strategies.\n\n"
    "In this turn:\n"
    + _SCORE_BASED_INTRO_FLOW
    + "\n"
    "Do NOT yet: mention any score, factor, factor code, or table. This is only the "
    "welcome, not the analysis."
) + INTRO_ALLOWED_QUESTIONS

DEFAULT_SYSTEM_PROMPT_QSAR_INTRO = (
    "You are introducing yourself to the student at the start of the QSAr "
    "exploration of their self-regulation "
    "strategic repertoire.\n\n"
    "In this turn:\n"
    + _SCORE_BASED_INTRO_FLOW
    + "\n"
    "Do NOT yet: mention any score, factor, factor code, or table. This is only the "
    "welcome, not the analysis."
) + INTRO_ALLOWED_QUESTIONS

DEFAULT_SYSTEM_PROMPT_ZTPI_INTRO = (
    "You are introducing yourself to the student at the start of the ZTPI "
    "exploration of their time perspective "
    "(Zimbardo Time Perspective Inventory).\n\n"
    "In this turn:\n"
    + _SCORE_BASED_INTRO_FLOW
    + "\n"
    "Do NOT yet: mention any score, factor, or table. This is only the "
    "welcome, not the analysis."
) + INTRO_ALLOWED_QUESTIONS

DEFAULT_SYSTEM_PROMPT_SAVICKAS_INTRO = (
    "You are introducing yourself to the student at the start of the Savickas "
    "career construction interview.\n\n"
    "In this turn:\n"
    + _SAVICKAS_INTRO_FLOW
    + "\n"
    "Do NOT yet: mention any score, factor, or table. This is only the "
    "welcome, not the interview."
) + INTRO_ALLOWED_QUESTIONS

DEFAULT_SYSTEM_PROMPT_QPCS_INTRO = (
    "You are introducing yourself to the student at the start of the QPCS "
    "reflection on their strategic competences.\n\n"
    "In this turn:\n"
    + _SCORE_BASED_INTRO_FLOW
    + "\n"
    "Do NOT yet: mention any score, factor, or table. This is only the "
    "welcome, not the reflection."
) + INTRO_ALLOWED_QUESTIONS

DEFAULT_SYSTEM_PROMPT_QPCC_INTRO = (
    "You are introducing yourself to the student at the start of the QPCC "
    "reflection on their competences and "
    "beliefs.\n\n"
    "In this turn:\n"
    + _SCORE_BASED_INTRO_FLOW
    + "\n"
    "Do NOT yet: mention any score, factor, or table. This is only the "
    "welcome, not the reflection."
) + INTRO_ALLOWED_QUESTIONS

DEFAULT_SYSTEM_PROMPT_QAP_INTRO = (
    "You are introducing yourself to the student at the start of the QAP path "
    "on their career adaptability.\n\n"
    "In this turn:\n"
    + _SCORE_BASED_INTRO_FLOW
    + "\n"
    "Do NOT yet: mention any score, factor, or table. This is only the "
    "welcome, not the path."
) + INTRO_ALLOWED_QUESTIONS


# Questions / intro phase system prompts (stored in configs table)
GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS: Dict[str, Dict[str, str]] = {
    "questions": {
        "key": "prompt_guided_questions",
        "label": "Guided - 4. Domande e Approfondimenti (system)",
        "description": "Prompt di sistema per la fase domande della guided chat",
        "default": DEFAULT_SYSTEM_PROMPT_GUIDED_QUESTIONS,
    },
    "intro": {
        "key": "prompt_intro",
        "label": "Guided - 0. Presentazione QSA (system)",
        "description": "Prompt di sistema per lo step intro QSA (auto-presentazione counselor, preambolo caldo, no fattori/punteggi)",
        "default": DEFAULT_SYSTEM_PROMPT_INTRO,
    },
    "qsar-intro": {
        "key": "prompt_qsar_intro",
        "label": "Guided - 0. Presentazione QSAr (system)",
        "description": "Prompt di sistema per lo step intro QSAr",
        "default": DEFAULT_SYSTEM_PROMPT_QSAR_INTRO,
    },
    "ztpi-intro": {
        "key": "prompt_ztpi_intro",
        "label": "Guided - 0. Presentazione ZTPI (system)",
        "description": "Prompt di sistema per lo step intro ZTPI",
        "default": DEFAULT_SYSTEM_PROMPT_ZTPI_INTRO,
    },
    "savickas-intro": {
        "key": "prompt_savickas_intro",
        "label": "Guided - 0. Presentazione SAVICKAS (system)",
        "description": "Prompt di sistema per lo step intro SAVICKAS",
        "default": DEFAULT_SYSTEM_PROMPT_SAVICKAS_INTRO,
    },
    "qpcs-welcome": {
        "key": "prompt_qpcs_welcome",
        "label": "Guided - 0. Presentazione QPCS (system)",
        "description": "Prompt di sistema per lo step intro QPCS",
        "default": DEFAULT_SYSTEM_PROMPT_QPCS_INTRO,
    },
    "qpcc-welcome": {
        "key": "prompt_qpcc_welcome",
        "label": "Guided - 0. Presentazione QPCC (system)",
        "description": "Prompt di sistema per lo step intro QPCC",
        "default": DEFAULT_SYSTEM_PROMPT_QPCC_INTRO,
    },
    "qap-welcome": {
        "key": "prompt_qap_welcome",
        "label": "Guided - 0. Presentazione QAP (system)",
        "description": "Prompt di sistema per lo step intro QAP",
        "default": DEFAULT_SYSTEM_PROMPT_QAP_INTRO,
    },
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
        "key": "text_qsar_questions_intro",
        "label": "QSAr - Messaggio intro fase Domande",
        "description": "Messaggio introduttivo della fase domande per QSAr",
        "default": DEFAULT_GUIDED_TEXT_QSAR_QUESTIONS_INTRO,
    },
    {
        "key": "text_qsar_conclusion",
        "label": "QSAr - Messaggio Conclusione",
        "description": "Messaggio statico finale della guided chat QSAr",
        "default": DEFAULT_GUIDED_TEXT_QSAR_CONCLUSION,
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
    {
        "key": "text_savickas_questions_intro",
        "label": "Savickas - Messaggio intro fase Domande",
        "description": "Messaggio introduttivo della fase domande per Savickas",
        "default": DEFAULT_GUIDED_TEXT_SAVICKAS_QUESTIONS_INTRO,
    },
    {
        "key": "text_savickas_conclusion",
        "label": "Savickas - Messaggio Conclusione",
        "description": "Messaggio statico finale della guided chat Savickas",
        "default": DEFAULT_GUIDED_TEXT_SAVICKAS_CONCLUSION,
    },
    {
        "key": "text_qpcs_questions_intro",
        "label": "QPCS - Messaggio intro fase Domande",
        "description": "Messaggio introduttivo della fase domande per QPCS",
        "default": DEFAULT_GUIDED_TEXT_QPCS_QUESTIONS_INTRO,
    },
    {
        "key": "text_qpcs_conclusion",
        "label": "QPCS - Messaggio Conclusione",
        "description": "Messaggio statico finale della guided chat QPCS",
        "default": DEFAULT_GUIDED_TEXT_QPCS_CONCLUSION,
    },
    {
        "key": "text_qpcc_questions_intro",
        "label": "QPCC - Messaggio intro fase Domande",
        "description": "Messaggio introduttivo della fase domande per QPCC",
        "default": DEFAULT_GUIDED_TEXT_QPCC_QUESTIONS_INTRO,
    },
    {
        "key": "text_qpcc_conclusion",
        "label": "QPCC - Messaggio Conclusione",
        "description": "Messaggio statico finale della guided chat QPCC",
        "default": DEFAULT_GUIDED_TEXT_QPCC_CONCLUSION,
    },
    {
        "key": "text_qap_questions_intro",
        "label": "QAP - Messaggio intro fase Domande",
        "description": "Messaggio introduttivo della fase domande per QAP",
        "default": DEFAULT_GUIDED_TEXT_QAP_QUESTIONS_INTRO,
    },
    {
        "key": "text_qap_conclusion",
        "label": "QAP - Messaggio Conclusione",
        "description": "Messaggio statico finale della guided chat QAP",
        "default": DEFAULT_GUIDED_TEXT_QAP_CONCLUSION,
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
    "factor-qa": "prompt_factor_qa",
    "second-level": "prompt_second_level",
    "generic": "prompt_generic",
    "qsar-factor": "prompt_qsar_factor",
    "qsar-factor-qa": "prompt_qsar_factor_qa",
    "qsar-second-level": "prompt_qsar_second_level",
    "qsar-generic": "prompt_qsar_generic",
    "ztpi-factor": "prompt_ztpi_factor",
    "ztpi-btp": "prompt_ztpi_btp",
    "idea-focus": "prompt_idea_focus",
    "savickas-interview": "prompt_savickas_interview",
    "savickas-summary": "prompt_savickas_summary",
    "qpcs-factor": "prompt_qpcs_factor",
    "qpcc-factor": "prompt_qpcc_factor",
    "qap-factor": "prompt_qap_factor",
    # Keep compatibility with detailed guided paths already configured in existing databases.
    "qpcs-analysis": "prompt_qpcs_analysis",
    "qpcs-summary": "prompt_qpcs_summary",
    "qpcc-interview": "prompt_qpcc_interview",
    "qpcc-summary": "prompt_qpcc_summary",
    "qap-interview": "prompt_qap_interview",
    "qap-summary": "prompt_qap_summary",
}


# --- Pellerey framework knowledge blocks (from "Imparare a dirigere se stessi", 2013) ---
# Injected as [META SYSTEM PROMPT] per-step, reframed from the student's
# perspective (practical, not theoretical). Grouped by concept; reused across
# steps that share the same domain.
#
# MANDATORY STYLE RULE: never frame explanations as negations of what something
# is NOT. Always affirm what something IS directly. Example: instead of "A2 is
# not generic motivation — it is the ability to persist", write "A2 is the ability
# to persist even when motivation drops". The student learns from positive
# statements; negations create confusion and sound defensive.

PELLEREY_SELF_DIRECTION = _text("pellerey_self_direction")

PELLEREY_COGNITIVE_PROCESSES = _text("pellerey_cognitive_processes")

PELLEREY_AFFECTIVE_PROCESSES = _text("pellerey_affective_processes")

PELLEREY_ELABORATION = _text("pellerey_elaboration")

PELLEREY_SELFCONTROL = _text("pellerey_selfcontrol")

PELLEREY_MOTIVATION = _text("pellerey_motivation")

PELLEREY_EMOTIONS = _text("pellerey_emotions")

PELLEREY_ATTRIBUTION = _text("pellerey_attribution")

PELLEREY_SOCIAL = _text("pellerey_social")

PELLEREY_SYNTHESIS = _text("pellerey_synthesis")

PELLEREY_STRATEGIC_COMPETENCES = _text("pellerey_strategic_competences")

PELLEREY_SELF_REGULATION_CYCLE = _text("pellerey_self_regulation_cycle")

PELLEREY_NARRATIVE_IDENTITY = _text("pellerey_narrative_identity")


# --- Instrument-level meta system prompts (injected as [META SYSTEM PROMPT]) ---
# Empty default: optional extra context an admin can fill per-instrument.
# Per-step overrides use prompt_meta_{Q}_{STEP_ID} and are created on demand.

META_SYSTEM_PROMPT_DEFINITIONS: List[Dict[str, str]] = [
    {
        "key": "prompt_meta_QSA",
        "label": "Meta system prompt QSA",
        "description": "Contesto aggiuntivo iniettato come [META SYSTEM PROMPT] per lo strumento QSA (vuoto = nessun contesto extra)",
        "default": "",
    },
    {
        "key": "prompt_meta_QSAR",
        "label": "Meta system prompt QSAr",
        "description": "Contesto aggiuntivo iniettato come [META SYSTEM PROMPT] per lo strumento QSAr",
        "default": "",
    },
    {
        "key": "prompt_meta_ZTPI",
        "label": "Meta system prompt ZTPI",
        "description": "Contesto aggiuntivo iniettato come [META SYSTEM PROMPT] per lo strumento ZTPI",
        "default": "",
    },
    {
        "key": "prompt_meta_SAVICKAS",
        "label": "Meta system prompt Savickas",
        "description": "Contesto aggiuntivo iniettato come [META SYSTEM PROMPT] per lo strumento Savickas",
        "default": "",
    },
    {
        "key": "prompt_meta_QPCS",
        "label": "Meta system prompt QPCS",
        "description": "Contesto aggiuntivo iniettato come [META SYSTEM PROMPT] per lo strumento QPCS",
        "default": PELLEREY_STRATEGIC_COMPETENCES,
    },
    {
        "key": "prompt_meta_QPCC",
        "label": "Meta system prompt QPCC",
        "description": "Contesto aggiuntivo iniettato come [META SYSTEM PROMPT] per lo strumento QPCC",
        "default": PELLEREY_STRATEGIC_COMPETENCES,
    },
    {
        "key": "prompt_meta_QAP",
        "label": "Meta system prompt QAP",
        "description": "Contesto aggiuntivo iniettato come [META SYSTEM PROMPT] per lo strumento QAP",
        "default": PELLEREY_STRATEGIC_COMPETENCES,
    },
    # QSA per-step meta prompts
    {
        "key": "prompt_meta_QSA_intro",
        "label": "QSA Intro - Contesto Pellerey",
        "description": "Concetto di auto-direzione per lo step introduttivo QSA",
        "default": PELLEREY_SELF_DIRECTION,
    },
    {
        "key": "prompt_meta_QSA_cognitive",
        "label": "QSA Cognitive - Contesto Pellerey",
        "description": "Framework processi cognitivi (attenzione, elaborazione, organizzazione, metacognizione)",
        "default": PELLEREY_COGNITIVE_PROCESSES,
    },
    {
        "key": "prompt_meta_QSA_affective",
        "label": "QSA Affective - Contesto Pellerey",
        "description": "Framework processi affettivi (ansia, volizione, attribuzioni, percezione di competenza)",
        "default": PELLEREY_AFFECTIVE_PROCESSES,
    },
    {
        "key": "prompt_meta_QSA_sl-elaboration",
        "label": "QSA Elaboration - Contesto Pellerey",
        "description": "Elaborazione e organizzazione: collegare conoscenze, mappe, distinguere centrale da accessorio",
        "default": PELLEREY_ELABORATION,
    },
    {
        "key": "prompt_meta_QSA_sl-selfcontrol",
        "label": "QSA Self-control - Contesto Pellerey",
        "description": "Autocontrollo e concentrazione: strategie apprese, auto-osservazione, gestione distrazioni",
        "default": PELLEREY_SELF_REGULATION_CYCLE,
    },
    {
        "key": "prompt_meta_QSA_sl-motivation",
        "label": "QSA Motivation - Contesto Pellerey",
        "description": "Motivazione e volonta': percezione di competenza, perseveranza, orientamento",
        "default": PELLEREY_MOTIVATION,
    },
    {
        "key": "prompt_meta_QSA_sl-emotions",
        "label": "QSA Emotions - Contesto Pellerey",
        "description": "Gestione emotiva: ansia di base vs occasionale, soglia ottimale, regolazione",
        "default": PELLEREY_EMOTIONS,
    },
    {
        "key": "prompt_meta_QSA_sl-attribution",
        "label": "QSA Attribution - Contesto Pellerey",
        "description": "Stile attributivo: cause controllabili vs incontrollabili, impatto su impegno",
        "default": PELLEREY_ATTRIBUTION,
    },
    {
        "key": "prompt_meta_QSA_sl-social",
        "label": "QSA Social - Contesto Pellerey",
        "description": "Dimensione sociale: collaborazione come competenza strategica",
        "default": PELLEREY_SOCIAL,
    },
    {
        "key": "prompt_meta_QSA_sl-synthesis",
        "label": "QSA Synthesis - Contesto Pellerey",
        "description": "Sintesi integrata: il profilo come sistema, interazioni cognitive-affettive",
        "default": PELLEREY_SYNTHESIS,
    },
    # QSAr per-step meta prompts
    {
        "key": "prompt_meta_QSAR_qsar-intro",
        "label": "QSAr Intro - Contesto Pellerey",
        "description": "Concetto di auto-direzione per lo step introduttivo QSAr",
        "default": _text("qsar_meta_intro"),
    },
    {
        "key": "prompt_meta_QSAR_qsar-cognitive",
        "label": "QSAr Cognitive - Contesto Pellerey",
        "description": "Framework processi cognitivi per QSAr",
        "default": _text("qsar_meta_cognitive"),
    },
    {
        "key": "prompt_meta_QSAR_qsar-affective",
        "label": "QSAr Affective - Contesto Pellerey",
        "description": "Framework processi affettivi per QSAr",
        "default": _text("qsar_meta_affective"),
    },
    {
        "key": "prompt_meta_QSAR_qsar-processing",
        "label": "QSAr Processing - Contesto Pellerey",
        "description": "Elaborazione e organizzazione per QSAr",
        "default": _text("qsar_meta_processing"),
    },
    {
        "key": "prompt_meta_QSAR_qsar-selfcontrol",
        "label": "QSAr Self-control - Contesto Pellerey",
        "description": "Autoregolazione e attenzione per QSAr",
        "default": _text("qsar_meta_selfcontrol"),
    },
    {
        "key": "prompt_meta_QSAR_qsar-motivation",
        "label": "QSAr Motivation - Contesto Pellerey",
        "description": "Motivazione e competenza percepita per QSAr",
        "default": _text("qsar_meta_motivation"),
    },
    {
        "key": "prompt_meta_QSAR_qsar-emotions",
        "label": "QSAr Emotions - Contesto Pellerey",
        "description": "Gestione emotiva per QSAr",
        "default": _text("qsar_meta_emotions"),
    },
    {
        "key": "prompt_meta_QSAR_qsar-attributions",
        "label": "QSAr Attributions - Contesto Pellerey",
        "description": "Attribuzioni causali per QSAr",
        "default": _text("qsar_meta_attributions"),
    },
    {
        "key": "prompt_meta_QSAR_qsar-synthesis",
        "label": "QSAr Synthesis - Contesto Pellerey",
        "description": "Sintesi integrata per QSAr",
        "default": _text("qsar_meta_synthesis"),
    },
    # ZTPI per-step meta prompts
    {
        "key": "prompt_meta_ZTPI_ztpi-intro",
        "label": "ZTPI Intro - Contesto Pellerey",
        "description": "Concetto di auto-direzione per ZTPI",
        "default": PELLEREY_SELF_DIRECTION,
    },
    {
        "key": "prompt_meta_ZTPI_ztpi-t5",
        "label": "ZTPI Future - Contesto Pellerey",
        "description": "Prospettiva temporale futura e progetto di vita (Pellerey cap. 7)",
        "default": (
            "[PELLEREY SENSE & PERSPECTIVE]\n"
            "The capacity to give meaning and direction to one's life is a core strategic "
            "competence (Pellerey et al., 2013). A strong future orientation helps students "
            "persevere through difficulty because they can connect today's effort to "
            "tomorrow's goal. When this perspective is weak, school tasks can feel pointless.\n"
            "Two components matter: (1) having a sense of purpose - some idea of what matters "
            "and where you want to go; (2) feeling that you are the author of your choices, "
            "not a pawn moved by others.\n"
            "When analysing the Future factor, help the student connect it to concrete, "
            "personal goals - even small, short-term ones. A student who cannot see 5 years "
            "ahead can still find meaning in 'what do I want to get better at this semester?'"
        ),
    },
    {
        "key": "prompt_meta_ZTPI_ztpi-btp",
        "label": "ZTPI BTP - Contesto Pellerey",
        "description": "Profilo temporale equilibrato e auto-direzione",
        "default": (
            "[PELLEREY BALANCED PROFILE]\n"
            "A balanced time perspective supports self-direction (Pellerey et al., 2013): "
            "learning from the past without being trapped by it, enjoying the present with "
            "awareness, and planning for the future with purpose. The goal is not to maximise "
            "any single perspective but to find an equilibrium where each one supports the "
            "others. When suggesting strategies, anchor them in the student's real context: "
            "a student stuck in past negativity may need help reframing past experiences; a "
            "student too focused on future achievement may need permission to value present "
            "well-being."
        ),
    },
    # QPCS / QPCC / QAP: instrument-level catch-all (set above) covers all steps.
    # Per-step keys can be added by admins via UI for specific step IDs as needed.
    # Savickas meta prompts
    {
        "key": "prompt_meta_SAVICKAS_savickas-intro",
        "label": "Savickas Intro - Contesto Pellerey",
        "description": "Auto-direzione e senso per l'intro Savickas",
        "default": PELLEREY_SELF_DIRECTION,
    },
    {
        "key": "prompt_meta_SAVICKAS_savickas-final",
        "label": "Savickas Summary - Contesto Pellerey",
        "description": "Senso e prospettiva per la sintesi finale Savickas",
        "default": PELLEREY_NARRATIVE_IDENTITY,
    },
]


# Default della direttiva [CONTEXT]: distingue CounselorBot (strumenti di analisi)
# dal sito competenzestrategiche.it (dove si compilano i questionari).
DEFAULT_CONTEXT_DIRECTIVE = _text("default_context_directive")


# --- Global directives (context, language, register, thinking) — editable via admin ---
GLOBAL_DIRECTIVE_DEFINITIONS: List[Dict[str, str]] = [
    {
        "key": "directive_conversation_quality",
        "label": "Direttiva qualita conversazione",
        "description": "Istruzione globale per aperture dirette e interazioni orientative.",
        "default": "[ORIENTATION] Begin with the specific observation, issue or decision that advances the conversation. Never open with ritual acknowledgements such as 'I understand', 'you are right', 'of course', or equivalents. Restate the student's words only to resolve ambiguity or verify a working hypothesis. Make the orienting move explicit: clarify the situation, a relevant criterion, realistic alternatives and consequences, or one concrete next action. Ask at most one focused question when a question is needed.",
    },
    {
        "key": "directive_context",
        "label": "Direttiva contesto piattaforma",
        "description": "Istruzione [CONTEXT] iniettata in ogni system prompt: cosa sono CounselorBot, gli strumenti e il sito competenzestrategiche.it. Vuoto = usa default hardcoded.",
        "default": DEFAULT_CONTEXT_DIRECTIVE,
    },
    {
        "key": "directive_language",
        "label": "Direttiva linguaggio",
        "description": "Istruzione [LANGUAGE] iniettata in ogni system prompt (usa {lang} e {lang_native} come placeholder per la lingua dello studente). Vuoto = usa default hardcoded.",
        "default": "[LANGUAGE] You MUST write your student-facing response in {lang} ({lang_native}), regardless of the language of the instructions or scores above. Translate any fixed phrases, headings and labels into {lang} as well. Also produce your internal reasoning/thinking in {lang} ({lang_native}). Do NOT mix languages in the visible prose. Keep technical block names, JSON keys and identifiers unchanged.",
    },
    {
        "key": "directive_register",
        "label": "Direttiva registro",
        "description": "Istruzione [REGISTER] iniettata in ogni system prompt. Vuoto = usa default hardcoded.",
        "default": "[REGISTER] Always address the student informally, using the informal second-person form of the chosen language (Italian 'tu' not 'Lei', Spanish 'tú', German and Swedish 'du', French 'tu'). Keep this informal register consistent across the ENTIRE conversation, including follow-up answers and summaries. Never switch to the formal form.",
    },
    {
        "key": "directive_thinking",
        "label": "Direttiva thinking",
        "description": "Istruzione [THINKING] iniettata in ogni system prompt. Vuoto = usa default hardcoded.",
        "default": "[THINKING] If you reason before answering, put ALL of your reasoning inside ONE single block at the very beginning, wrapped exactly in <think> and </think> tags, and keep it concise (a few short lines). After </think>, write the student-facing answer directly: it must NOT contain your plan, your checklist, phrases like 'Attivazione interna', 'Devo', 'Ho i punteggi', nor any meta-commentary about what you are doing. Never start the visible answer with a preparatory checklist such as 'Devo analizzare', 'Identificare il filo rosso', 'Strutturare i contenuti' or 'Proporre azioni concrete'. Never expose reasoning outside the <think> block.",
    },
    {
        "key": "directive_affirmative",
        "label": "Direttiva linguaggio affermativo",
        "description": "Istruzione [AFFIRMATIVE]: preferisce spiegazioni dirette preservando distinzioni, correzioni e incertezza. Vuoto = nessuna direttiva.",
        "default": "[AFFIRMATIVE] Prefer direct, affirmative explanations. Use negation when it clarifies a construct, corrects a false premise, or states a real limitation. State uncertainty plainly and briefly when the evidence is insufficient.",
    },
]


# --- Placeholder language mappings (editable via admin) ---
PLACEHOLDER_DEFINITIONS: List[Dict[str, str]] = [
    {
        "key": "placeholder_language_mappings",
        "label": "Mappatura placeholder lingua",
        "description": "Sostituzioni per {lang} e {lang_native} in ogni lingua supportata. Formato: JSON con chiave=lingua, valore=[nome_inglese, nome_nativo].",
        "default": json.dumps({
            "it": ["Italian", "italiano"],
            "en": ["English", "English"],
            "es": ["Spanish", "español"],
            "fr": ["French", "français"],
            "de": ["German", "Deutsch"],
            "sv": ["Swedish", "svenska"],
        }, ensure_ascii=False),
    },
]

# All config-table text definitions (seeded on startup)
ALL_CONFIG_TEXT_DEFINITIONS: List[Dict[str, str]] = (
    SYSTEM_PROMPT_DEFINITIONS
    + META_SYSTEM_PROMPT_DEFINITIONS
    + GLOBAL_DIRECTIVE_DEFINITIONS
    + PLACEHOLDER_DEFINITIONS
    + list(GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS.values())
    + GUIDED_STATIC_TEXT_DEFINITIONS
    + GUIDED_FIXED_PHASE_LABEL_DEFINITIONS
    + SITE_CHAT_CONFIG_DEFINITIONS
    + COUNSELORBOT_CHAT_CONFIG_DEFINITIONS
    + FRAMEWORK_CHAT_CONFIG_DEFINITIONS
    + QUESTIONARI_CHAT_CONFIG_DEFINITIONS
    + PQBL_CONFIG_DEFINITIONS
)

# Public UI config keys (returned by /qsa/guided-ui-texts)
GUIDED_PUBLIC_UI_CONFIG_DEFINITIONS: List[Dict[str, str]] = (
    GUIDED_STATIC_TEXT_DEFINITIONS + GUIDED_FIXED_PHASE_LABEL_DEFINITIONS
)


# --- Default guided steps (seeded into guided_steps table) ---

SCORE_BASED_INTRO_STEP_PROMPT = _text("score_based_intro_step_prompt")

SAVICKAS_INTRO_STEP_PROMPT = _text("savickas_intro_step_prompt")

# Pattern attesi del secondo livello (spec analisi di secondo livello): frasi
# additive riusate sia nei default degli step sia nell'upgrade DB idempotente in
# main.startup_event (append se il prompt live, anche personalizzato, non le ha).
SL_MOTIVATION_SYMMETRY_NOTE = ' ' + _text("sl_motivation_symmetry_note")

SL_ATTRIBUTION_A6_NOTE = (
    " Relate the attributional style to A6 (Perceived competence): an internal locus "
    "of control (high A3, low A4) usually supports a stronger perception of "
    "competence. Check this pattern on the profile."
)

DEFAULT_GUIDED_STEPS: List[Dict] = [
    {
        "id": "intro",
        "sort_order": 0,
        "label": "0. Presentazione",
        "prompt": SCORE_BASED_INTRO_STEP_PROMPT,
        "system_prompt_mode": "intro",
        "color_theme": "teal",
    },
    {
        "id": "cognitive",
        "sort_order": 1,
        "label": "1. Fattori Cognitivi",
        "prompt": (
            "Analyse ONLY the COGNITIVE factors (C1-C7) of my QSA profile. "
            "For each, give the score, interpretation and a short comment."
        ),
        "system_prompt_mode": "factor",
        "color_theme": "blue",
    },
    {
        "id": "affective",
        "sort_order": 2,
        "label": "2. Fattori Affettivi",
        "prompt": (
            "Analyse ONLY the AFFECTIVE factors (A1-A7) of my QSA profile. "
            "For each, give the score, interpretation and a short comment."
        ),
        "system_prompt_mode": "factor",
        "color_theme": "purple",
    },
    {
        "id": "sl-elaboration",
        "sort_order": 3,
        "label": "3.1 Elaborazione e Org.",
        "prompt": (
            "Second-Level Analysis - Part 1: ELABORATION AND ORGANISATION. "
            "Analyse together the factors: C1 (Elaborative strategies), "
            "C5 (Use of semantic organisers), C7 (Self-questioning). "
            "Assess how the student processes and structures information."
        ),
        "system_prompt_mode": "second-level",
        "color_theme": "indigo",
    },
    {
        "id": "sl-selfcontrol",
        "sort_order": 4,
        "label": "3.2 Autocontrollo",
        "prompt": (
            "Second-Level Analysis - Part 2: SELF-CONTROL AND CONCENTRATION. "
            "Analyse together the factors: C2 (Self-regulation), C3 (Disorientation), "
            "C6 (Concentration difficulties). Assess the ability to manage the study "
            "process."
        ),
        "system_prompt_mode": "second-level",
        "color_theme": "indigo",
    },
    {
        "id": "sl-motivation",
        "sort_order": 5,
        "label": "3.3 Motivazione",
        "prompt": (
            "Second-Level Analysis - Part 3: MOTIVATION AND WILL. "
            "Analyse together the factors: A2 (Volition), A5 (Lack of perseverance), "
            "A6 (Perceived competence). Assess motivational drive and self-confidence."
            + SL_MOTIVATION_SYMMETRY_NOTE
        ),
        "system_prompt_mode": "second-level",
        "color_theme": "pink",
    },
    {
        "id": "sl-emotions",
        "sort_order": 6,
        "label": "3.4 Gestione Emotiva",
        "prompt": (
            "Second-Level Analysis - Part 4: EMOTIONAL MANAGEMENT. "
            "Analyse together the factors: A1 (Baseline anxiety), "
            "A7 (Emotional interference). Assess the ability to manage stress "
            "and negative emotions."
        ),
        "system_prompt_mode": "second-level",
        "color_theme": "pink",
    },
    {
        "id": "sl-attribution",
        "sort_order": 7,
        "label": "3.5 Stile Attributivo",
        "prompt": (
            "Second-Level Analysis - Part 5: ATTRIBUTIONAL STYLE. "
            "Analyse together the factors: A3 (Attribution to controllable causes), "
            "A4 (Attribution to uncontrollable causes). Assess how the student interprets "
            "successes and failures." + SL_ATTRIBUTION_A6_NOTE
        ),
        "system_prompt_mode": "second-level",
        "color_theme": "orange",
    },
    {
        "id": "sl-social",
        "sort_order": 8,
        "label": "3.6 Dimensione Sociale",
        "prompt": (
            "Second-Level Analysis - Part 6: SOCIAL DIMENSION. "
            "Analyse factor C4 (Willingness to collaborate). Assess the inclination "
            "towards group work."
        ),
        "system_prompt_mode": "second-level",
        "color_theme": "teal",
    },
    {
        "id": "sl-synthesis",
        "sort_order": 9,
        "label": "3.7 Sintesi Integrata",
        "prompt": (
            "Second-Level Analysis - Part 7: INTEGRATED SYNTHESIS. "
            "Consider the WHOLE profile: cognitive factors C1-C7 and affective-motivational "
            "factors A1-A7. Do NOT re-analyse each factor one by one: identify the 2-3 most "
            "salient relationships in this profile that CROSS the two areas (e.g. anxiety "
            "A1/A7 affecting concentration C6; perceived competence A6 sustaining or "
            "undermining strategies C1/C2; attributional style A3/A4 shaping perseverance "
            "A5) and build a single integrated picture of HOW the student studies and WHY, "
            "grounded in the actual scores."
            + SYNTHESIS_ADVICE_DIRECTIVE
        ),
        "system_prompt_mode": "second-level",
        "color_theme": "indigo",
    },
]

DEFAULT_QSAR_GUIDED_STEPS: List[Dict] = [
    {
        "id": "qsar-intro",
        "sort_order": 0,
        "label": "0. Presentazione",
        "prompt": SCORE_BASED_INTRO_STEP_PROMPT,
        "system_prompt_mode": "intro",
        "color_theme": "teal",
    },
    {
        "id": "qsar-cognitive",
        "sort_order": 1,
        "label": "1. Fattori Cognitivi",
        "prompt": (
            "Analyse ONLY the cognitive factors of my QSAr profile: C1r, C2r, C3r and C4r. "
            "For each, give the score, interpretation and a short practical comment."
        ),
        "system_prompt_mode": "qsar-factor",
        "color_theme": "blue",
        "questionnaire_type": "QSAr",
    },
    {
        "id": "qsar-affective",
        "sort_order": 2,
        "label": "2. Fattori Affettivi",
        "prompt": (
            "Analyse ONLY the affective factors of my QSAr profile: A1r, A2r, A3r and A4r. "
            "For each, give the score, interpretation and a short practical comment."
        ),
        "system_prompt_mode": "qsar-factor",
        "color_theme": "purple",
        "questionnaire_type": "QSAr",
    },
    {
        "id": "qsar-processing",
        "sort_order": 3,
        "label": "3. Elaborazione e Organizzazione",
        "prompt": (
            "Analyse together C1r (elaborative strategies) and C3r (graphic strategies and "
            "semantic organisers), assessing how the student understands and remembers."
        ),
        "system_prompt_mode": "qsar-second-level",
        "color_theme": "indigo",
        "questionnaire_type": "QSAr",
    },
    {
        "id": "qsar-selfcontrol",
        "sort_order": 4,
        "label": "4. Autoregolazione e Attenzione",
        "prompt": (
            "Analyse together C2r (self-regulated strategies) and C4r (lack of attention "
            "control), respecting the inverted direction of C4r."
        ),
        "system_prompt_mode": "qsar-second-level",
        "color_theme": "teal",
        "questionnaire_type": "QSAr",
    },
    {
        "id": "qsar-motivation",
        "sort_order": 5,
        "label": "5. Motivazione e Competenza",
        "prompt": (
            "Analyse together A2r (volition) and A4r (perceived competence), "
            "assessing effort and confidence in one's own abilities."
        ),
        "system_prompt_mode": "qsar-second-level",
        "color_theme": "pink",
        "questionnaire_type": "QSAr",
    },
    {
        "id": "qsar-emotions",
        "sort_order": 6,
        "label": "6. Gestione Emotiva",
        "prompt": (
            "Analyse A1r (anxiety and emotional control), respecting its "
            "inverted direction and proposing practical, non-diagnostic suggestions."
        ),
        "system_prompt_mode": "qsar-second-level",
        "color_theme": "rose",
        "questionnaire_type": "QSAr",
    },
    {
        "id": "qsar-attributions",
        "sort_order": 7,
        "label": "7. Attribuzioni Causali",
        "prompt": (
            "Analyse A3r (causal attributions) and explain practically how the way "
            "successes and difficulties are read can support studying."
        ),
        "system_prompt_mode": "qsar-second-level",
        "color_theme": "orange",
        "questionnaire_type": "QSAr",
    },
    {
        "id": "qsar-synthesis",
        "sort_order": 8,
        "label": "8. Sintesi Integrata",
        "prompt": (
            "Integrated synthesis of the WHOLE QSAr profile: C1r, C2r, C3r, C4r, A1r, A2r, "
            "A3r, A4r. Do NOT re-analyse each factor one by one: identify the 2-3 most "
            "salient relationships in this profile that cross the cognitive and affective "
            "areas (e.g. anxiety A1r affecting attention control C4r; perceived competence "
            "A4r sustaining volition A2r and self-regulated strategies C2r) and build a "
            "single integrated picture of how the student studies and why, grounded in the "
            "actual scores. Respect the inverted direction of C4r and A1r."
            + SYNTHESIS_ADVICE_DIRECTIVE
        ),
        "system_prompt_mode": "qsar-second-level",
        "color_theme": "indigo",
        "questionnaire_type": "QSAr",
    },
]


# --- Default ZTPI guided steps (seeded into guided_steps table) ---

DEFAULT_ZTPI_GUIDED_STEPS: List[Dict] = [
    {
        "id": "ztpi-intro",
        "sort_order": 0,
        "label": "0. Presentazione",
        "prompt": SCORE_BASED_INTRO_STEP_PROMPT,
        "system_prompt_mode": "intro",
        "color_theme": "teal",
    },
    {
        "id": "ztpi-t1",
        "sort_order": 1,
        "label": "1. Passato Negativo",
        "prompt": (
            "Analyse the Past Negative factor of my time-perspective profile. "
            "Use internally the balanced-profile band on a 1-9 scale: ideal 2-4, near 1-5. "
            "Give the score, the zone "
            "(In line with the balanced profile / Close to the balanced profile / Area for growth), "
            "what it means for the student, and a short practical comment. "
            "Do not reveal to the user any formulas, conversions or technical parameters, and do not use acronyms."
        ),
        "system_prompt_mode": "ztpi-factor",
        "color_theme": "rose",
        "questionnaire_type": "ZTPI",
    },
    {
        "id": "ztpi-t2",
        "sort_order": 2,
        "label": "2. Passato Positivo",
        "prompt": (
            "Analyse the Past Positive factor of my time-perspective profile. "
            "Use internally the balanced-profile band on a 1-9 scale: ideal 5-7, near 4-8. "
            "Give the score, the zone "
            "(In line with the balanced profile / Close to the balanced profile / Area for growth), "
            "what it means, and a practical comment. "
            "Do not reveal to the user any formulas, conversions or technical parameters, and do not use acronyms."
        ),
        "system_prompt_mode": "ztpi-factor",
        "color_theme": "amber",
        "questionnaire_type": "ZTPI",
    },
    {
        "id": "ztpi-t3",
        "sort_order": 3,
        "label": "3. Presente Edonistico",
        "prompt": (
            "Analyse the Present Hedonistic factor of my time-perspective profile. "
            "Use internally the balanced-profile band on a 1-9 scale: ideal 7-8, near 6-9. "
            "Give the score, the zone "
            "(In line with the balanced profile / Close to the balanced profile / Area for growth), "
            "what it means, and a practical comment. "
            "Always explain in simple terms that 'hedonistic' also means the ability to live in the present "
            "and seize the moment (carpe diem), beyond the pursuit of immediate gratification. "
            "Do not reveal to the user any formulas, conversions or technical parameters, and do not use acronyms."
        ),
        "system_prompt_mode": "ztpi-factor",
        "color_theme": "orange",
        "questionnaire_type": "ZTPI",
    },
    {
        "id": "ztpi-t4",
        "sort_order": 4,
        "label": "4. Presente Fatalistico",
        "prompt": (
            "Analyse the Present Fatalistic factor of my time-perspective profile. "
            "Use internally the balanced-profile band on a 1-9 scale: ideal 1-3, near 1-4. "
            "Give the score, the zone "
            "(In line with the balanced profile / Close to the balanced profile / Area for growth), "
            "what it means, and a practical comment. "
            "Always explain in simple terms that 'fatalistic' means the feeling of being unable "
            "to influence events and a tendency towards resignation. "
            "Do not reveal to the user any formulas, conversions or technical parameters, and do not use acronyms."
        ),
        "system_prompt_mode": "ztpi-factor",
        "color_theme": "red",
        "questionnaire_type": "ZTPI",
    },
    {
        "id": "ztpi-t5",
        "sort_order": 5,
        "label": "5. Futuro",
        "prompt": (
            "Analyse the Future factor of my time-perspective profile. "
            "Use internally the balanced-profile band on a 1-9 scale: ideal 5-7, near 4-8. "
            "Give the score, the zone "
            "(In line with the balanced profile / Close to the balanced profile / Area for growth), "
            "what it means, and a practical comment. "
            "Do not reveal to the user any formulas, conversions or technical parameters, and do not use acronyms."
        ),
        "system_prompt_mode": "ztpi-factor",
        "color_theme": "teal",
        "questionnaire_type": "ZTPI",
    },
    {
        "id": "ztpi-btp",
        "sort_order": 6,
        "label": "6. Profilo Temporale Equilibrato",
        "prompt": (
            "Final time-perspective analysis: compare my overall profile with "
            "Zimbardo's ideal balanced time perspective, "
            "using the technical parametrisation internally. "
            "(Past Negative ideal 2-4, Past Positive ideal 5-7, Present Hedonistic ideal 7-8, "
            "Present Fatalistic ideal 1-3, Future ideal 5-7; "
            "near bands: Past Negative 1-5, Past Positive 4-8, Present Hedonistic 6-9, "
            "Present Fatalistic 1-4, Future 4-8). "
            "Indicate which factors are in line with the balanced time perspective and which deviate, "
            "specifying for each factor whether it is below, inside or above the ideal range. "
            "Add a short reading of the overall deviation. "
            "In the text for the student do not use acronyms: replace acronyms with full names. "
            "Explain the terms explicitly: 'present hedonistic' = living in the present and seizing the moment (carpe diem), "
            "with balance and responsibility; "
            "'present fatalistic' = the feeling of being unable to influence events and resignation. "
            "Do not reveal to the user any formulas, conversions or technical parameters. "
            "Discuss actions already agreed to; add at most ONE new practical suggestion only when permitted by the current step and supported by a certified candidate."
        ),
        "system_prompt_mode": "ztpi-btp",
        "color_theme": "purple",
        "questionnaire_type": "ZTPI",
    },
]


# --- Default Savickas guided steps (seeded into guided_steps table) ---

DEFAULT_SAVICKAS_GUIDED_STEPS: List[Dict] = [
    {
        "id": "savickas-intro",
        "sort_order": -1,
        "label": "0. Presentazione",
        "prompt": SAVICKAS_INTRO_STEP_PROMPT,
        "system_prompt_mode": "intro",
        "color_theme": "teal",
    },
    {
        "id": "savickas-patto",
        "sort_order": 0,
        "label": "0. Patto di Collaborazione",
        "prompt": (
            "Start of the Savickas path: build the agreement with the student. "
            "Briefly explain the goal, duration (5 questions + summary), method (narrative questions), "
            "mutual roles and confidentiality in the guidance context. "
            "Ask for an explicit confirmation to begin (e.g. 'If you agree, write: I accept'). "
            "Do NOT advance until there is a clear confirmation. "
            "When the confirmation arrives, close the step and on the last line put only [[AVANZA_STEP]]."
        ),
        "system_prompt_mode": "savickas-interview",
        "color_theme": "cyan",
        "questionnaire_type": "SAVICKAS",
    },
    {
        "id": "savickas-q1",
        "sort_order": 1,
        "label": "1. Modelli di Ruolo",
        "prompt": (
            "Savickas interview - question 1 of 5. "
            "Ask this question: 'Who are three people you admired growing up "
            "(real or fictional) and what specific qualities do you admire in each of them?'. "
            "Wait for the answer before asking one useful follow-up in a later turn. "
            "When you have enough material, give a mini-summary and on the last line put only [[AVANZA_STEP]]."
        ),
        "system_prompt_mode": "savickas-interview",
        "color_theme": "blue",
        "questionnaire_type": "SAVICKAS",
    },
    {
        "id": "savickas-q2",
        "sort_order": 2,
        "label": "2. Media Preferiti",
        "prompt": (
            "Savickas interview - question 2 of 5. "
            "Ask this question: 'Which magazines, websites, channels or content do you follow most willingly, "
            "and what attracts you about this content?'. "
            "Wait for the answer before asking one useful follow-up in a later turn. "
            "When you have enough material, give a mini-summary and on the last line put only [[AVANZA_STEP]]."
        ),
        "system_prompt_mode": "savickas-interview",
        "color_theme": "indigo",
        "questionnaire_type": "SAVICKAS",
    },
    {
        "id": "savickas-q3",
        "sort_order": 3,
        "label": "3. Storia Preferita",
        "prompt": (
            "Savickas interview - question 3 of 5. "
            "Ask this question: 'What is your favourite story from a book, film or series? "
            "Tell it to me briefly and say what strikes you most about it.'. "
            "Wait for the answer before asking one useful follow-up in a later turn. "
            "When you have enough material, give a mini-summary and on the last line put only [[AVANZA_STEP]]."
        ),
        "system_prompt_mode": "savickas-interview",
        "color_theme": "amber",
        "questionnaire_type": "SAVICKAS",
    },
    {
        "id": "savickas-q4",
        "sort_order": 4,
        "label": "4. Motto Personale",
        "prompt": (
            "Savickas interview - question 4 of 5. "
            "Ask this question: 'What is your motto, or the phrase that guides you most often? "
            "How do you apply it in important choices?'. "
            "Wait for the answer before asking one useful follow-up in a later turn. "
            "When you have enough material, give a mini-summary and on the last line put only [[AVANZA_STEP]]."
        ),
        "system_prompt_mode": "savickas-interview",
        "color_theme": "teal",
        "questionnaire_type": "SAVICKAS",
    },
    {
        "id": "savickas-q5",
        "sort_order": 5,
        "label": "5. Ricordi Precoci",
        "prompt": (
            "Savickas interview - question 5 of 5. "
            "Ask this question: 'Tell me three early memories (ideally between ages 3 and 6) "
            "and give a short title to each memory.'. "
            "Wait for the answer before asking one useful follow-up in a later turn. "
            "When you have enough material, give a mini-summary and on the last line put only [[AVANZA_STEP]]."
        ),
        "system_prompt_mode": "savickas-interview",
        "color_theme": "rose",
        "questionnaire_type": "SAVICKAS",
    },
    {
        "id": "savickas-final",
        "sort_order": 6,
        "label": "6. Sintesi Narrativa e Piano d'Azione",
        "prompt": (
            "Final Savickas interview summary: integrate the answers that emerged across the 5 questions and "
            "build a coherent narrative portrait. "
            "Include: central theme, resources, obstacles, 2-3 tentative direction hypotheses, and actions and timeframes actually agreed to by the student. Distinguish proposals from commitments. "
            "On the last line put only [[AVANZA_STEP]]."
        ),
        "system_prompt_mode": "savickas-summary",
        "color_theme": "purple",
        "questionnaire_type": "SAVICKAS",
    },
]


# --- Default QPCS guided steps (guided analysis of self-assessment results, 5 areas + summary) ---

DEFAULT_IDEA_GUIDED_STEPS: List[Dict] = [
    {
        "id": "idea-intro",
        "sort_order": 0,
        "label": "Di cosa parliamo",
        "prompt": (
            "Opening of the Idea path. In a few lines: say that the goal is to bring one "
            "idea into focus, that you will ask one question at a time, and that a map of "
            "the idea grows beside the conversation and belongs to the person. "
            "Say that they can move between the steps freely and stop whenever they want. "
            "Then ask what the idea is, even roughly, even badly said. As soon as they say what the idea is, put it on the map with role `idea` and the accent. This step runs when the kind of work is not declared yet: it is not a preamble and it can run again on a new branch."
        ),
        "system_prompt_mode": "idea-focus",
        "color_theme": "teal",
        "questionnaire_type": "IDEA",
    },
    {
        "id": "idea-statement",
        "sort_order": 1,
        "label": "L'idea in una frase",
        "prompt": (
            "Clarification. Work with the person until the idea fits in ONE sentence that "
            "they recognise as theirs. Ask what they mean by the vaguest word they used. "
            "Ask for an example of the idea working, and one of it not working. "
            "Put the sentence on the map as the central node. The sentence goes on the map as the `idea` node; anything else they name goes with the role that fits it. This step runs whenever the branch in hand has no `idea` node, or one that is orphaned, duplicated or overloaded."
        ),
        "system_prompt_mode": "idea-focus",
        "color_theme": "cyan",
        "questionnaire_type": "IDEA",
    },
    {
        "id": "idea-assumptions",
        "sort_order": 2,
        "label": "Cosa do per scontato",
        "prompt": (
            "Assumptions. Find what the idea takes for granted without having checked it: "
            "about other people, about time and resources, about how things work. "
            "Name one assumption you can hear in what they said and ask whether it holds. "
            "Ask what would have to be true for the idea to work at all. Every assumption they recognise as theirs goes on the map with role `assumption`. This step runs whenever the branch lacks an assumption, or carries a concept used before being explained."
        ),
        "system_prompt_mode": "idea-focus",
        "color_theme": "amber",
        "questionnaire_type": "IDEA",
    },
    {
        "id": "idea-evidence",
        "sort_order": 3,
        "label": "Su cosa mi baso",
        "prompt": (
            "Evidence and reasoning. Ask what the idea rests on: something they saw, did, "
            "read, or were told. Keep what they experienced separate from what they suppose. "
            "When a reason does not support the claim it is attached to, say so and ask what "
            "would support it instead. What they actually saw, did or read goes on the map with role `evidence`; what only holds it back goes as `constraint`. This step runs whenever the branch lacks evidence, or carries a claim nothing supports."
        ),
        "system_prompt_mode": "idea-focus",
        "color_theme": "green",
        "questionnaire_type": "IDEA",
    },
    {
        "id": "idea-alternatives",
        "sort_order": 4,
        "label": "Come si potrebbe vedere diversamente",
        "prompt": (
            "Alternative viewpoints. Offer one reading of the same facts that differs from "
            "theirs, and ask what speaks against it. Ask who would disagree with the idea "
            "and what that person would say. Do not argue for the alternative: put it on "
            "the map and let them weigh it. The reading they take seriously goes on the map with role `alternative`. This step runs whenever the branch lacks an alternative reading."
        ),
        "system_prompt_mode": "idea-focus",
        "color_theme": "purple",
        "questionnaire_type": "IDEA",
    },
    {
        "id": "idea-implications",
        "sort_order": 5,
        "label": "Dove porta",
        "prompt": (
            "Implications and consequences. Ask what would follow if the idea held: what "
            "changes, for whom, at what cost. Ask what they would have to give up. "
            "Follow a consequence one step further than they do, then check it with them. What would follow goes on the map with role `implication`; what it would cost goes as `constraint`. This step runs whenever the branch lacks an implication or a real constraint."
        ),
        "system_prompt_mode": "idea-focus",
        "color_theme": "blue",
        "questionnaire_type": "IDEA",
    },
    {
        "id": "idea-question",
        "sort_order": 6,
        "label": "E' la domanda giusta?",
        "prompt": (
            "Question the question. Ask whether the thing they came in with is really what "
            "they need to decide, or whether a different question sits underneath it. "
            "Ask what would change if the answer turned out to be no. If a better question "
            "has emerged during the session, say it plainly and ask whether it is theirs. A question that turns out to decide something goes on the map with role `open-question`. This step runs whenever the branch lacks an open question."
        ),
        "system_prompt_mode": "idea-focus",
        "color_theme": "rose",
        "questionnaire_type": "IDEA",
    },
    {
        "id": "idea-synthesis",
        "sort_order": 7,
        "label": "Mappa e prossimo passo",
        "prompt": (
            "Closing. Read the map back in a few sentences: the idea, what it assumes, what "
            "still stands open, what it would cost. Name what is still missing from the four "
            "things a focused idea needs. Then ask for ONE concrete next step they could take "
            "this week, and put it on the map. Do not add new questions here. The action they name goes on the map with role `step`. This step runs when the branch has what it needs, or lacks a step or a decision. It closes one branch, not the session: after it, the work goes back to the branch above."
        ),
        "system_prompt_mode": "idea-focus",
        "color_theme": "teal",
        "questionnaire_type": "IDEA",
    },
]

DEFAULT_QPCS_GUIDED_STEPS: List[Dict] = [
    {
        "id": "qpcs-intro",
        "sort_order": 0,
        "label": "0. Patto di Collaborazione",
        "prompt": (
            "Start of the QPCS path. Briefly explain what this is: the student has just "
            "completed the QPCS, a SELF-ASSESSMENT questionnaire, and now you will read and "
            "analyse their results together, one area at a time, to help them recognise the "
            "strategic competences that support their studying and their future. Make clear that "
            "the scores are reference points for reflection, not grades or judgements. Name the "
            "five areas that will be explored: managing emotions, communicative competence, will "
            "and perseverance, learning and collaboration strategies, and confidence in one's own "
            "competences and life project. Explain the method (for each area: a short "
            "explanation, a look at their result, a brief reflection through questions and, when "
            "useful, a concrete proposal) and mention confidentiality. Then ASK the student "
            "whether there is anything they would like you to do during the conversation - for "
            "example, help them with the language or translate a word when they cannot find it in "
            "English - and tell them you will keep it in mind (they can also tell you later). "
            "Finally, invite the student to click the 'Next Step' button in the path panel to "
            "start the analysis whenever they are ready. Do NOT ask them to type a confirmation "
            "to accept and do NOT emit any step marker."
        ),
        "system_prompt_mode": "qpcs-analysis",
        "color_theme": "cyan",
        "questionnaire_type": "QPCS",
    },
    {
        "id": "qpcs-emozioni",
        "sort_order": 1,
        "label": "1. Gestione delle Emozioni",
        "prompt": (
            "You are now starting Area 1/5 - Managing emotions and anxiety. If a previous topic "
            "was still open, close it in ONE short sentence, then focus fully on this area. "
            "Explain the area in one or two simple sentences: how you recognise and handle "
            "anxiety, fear of making mistakes and tension when facing difficult or demanding "
            "tasks. Refer to the student's self-assessment result for this area (as "
            "self-perception, not a judgement), then open the reflection with ONE question "
            "connected to a real, recent situation."
        ),
        "system_prompt_mode": "qpcs-analysis",
        "color_theme": "blue",
        "questionnaire_type": "QPCS",
    },
    {
        "id": "qpcs-comunicazione",
        "sort_order": 2,
        "label": "2. Competenza Comunicativa",
        "prompt": (
            "You are now starting Area 2/5 - Communicative and relational competence. If the "
            "previous area's conversation was still open, wrap it up in ONE short sentence (you "
            "may briefly connect it to this area), then focus fully on this area and do NOT keep "
            "discussing the previous topic. Explain the area in one or two simple sentences: how "
            "you express your ideas, make sure you are understood and that you have understood "
            "others, and how you feel when talking with new or important people. Refer to the "
            "student's self-assessment result for this area (as self-perception, not a "
            "judgement), then open the reflection with ONE question connected to a real "
            "situation."
        ),
        "system_prompt_mode": "qpcs-analysis",
        "color_theme": "indigo",
        "questionnaire_type": "QPCS",
    },
    {
        "id": "qpcs-volizione",
        "sort_order": 3,
        "label": "3. Volonta' e Perseveranza",
        "prompt": (
            "You are now starting Area 3/5 - Will, perseverance and commitment. If the previous "
            "area's conversation was still open, wrap it up in ONE short sentence (you may briefly "
            "connect it to this area), then focus fully on this area and do NOT keep discussing "
            "the previous topic. Explain the area in one or two simple sentences: how you keep "
            "going and finish what you start, even when a task is boring or tiring, and how you "
            "stay focused. Refer to the student's self-assessment result for this area (as "
            "self-perception, not a judgement), then open the reflection with ONE question "
            "connected to a real situation."
        ),
        "system_prompt_mode": "qpcs-analysis",
        "color_theme": "amber",
        "questionnaire_type": "QPCS",
    },
    {
        "id": "qpcs-apprendimento",
        "sort_order": 4,
        "label": "4. Strategie e Collaborazione",
        "prompt": (
            "You are now starting Area 4/5 - Learning and collaboration strategies. If the "
            "previous area's conversation was still open, wrap it up in ONE short sentence (you "
            "may briefly connect it to this area), then focus fully on this area and do NOT keep "
            "discussing the previous topic. Explain the area in one or two simple sentences: how "
            "you study and learn - connecting new things to what you already know, spotting the "
            "important information and applying it to real life - and how you work together with "
            "others. Refer to the student's self-assessment result for this area (as "
            "self-perception, not a judgement), then open the reflection with ONE question "
            "connected to a real situation."
        ),
        "system_prompt_mode": "qpcs-analysis",
        "color_theme": "teal",
        "questionnaire_type": "QPCS",
    },
    {
        "id": "qpcs-fiducia",
        "sort_order": 5,
        "label": "5. Fiducia e Progetto di Vita",
        "prompt": (
            "You are now starting Area 5/5 - Confidence in one's own competences and sense/project "
            "of life. If the previous area's conversation was still open, wrap it up in ONE short "
            "sentence (you may briefly connect it to this area), then focus fully on this area and "
            "do NOT keep discussing the previous topic. Explain the area in one or two simple "
            "sentences: how capable you feel of succeeding in your activities and whether you have "
            "a sense of what matters to you and an idea of a life or career project. Refer to the "
            "student's self-assessment result for this area (as self-perception, not a "
            "judgement), then open the reflection with ONE question connected to a real "
            "situation."
        ),
        "system_prompt_mode": "qpcs-analysis",
        "color_theme": "rose",
        "questionnaire_type": "QPCS",
    },
    {
        "id": "qpcs-sintesi",
        "sort_order": 6,
        "label": "6. Sintesi e Piano d'Azione",
        "prompt": (
            "You are now producing the final summary of the QPCS results analysis. If the "
            "previous area's conversation was still open, close it in ONE short sentence, then "
            "move to the summary. FIRST, briefly recall the five areas so "
            "the student sees the whole picture. THEN integrate their self-assessment results "
            "into an overall reading (perceived strengths and areas they feel less sure about, "
            "treating the scores as reference points, not judgements), with recurring resources, "
            "areas to work on and actions the student already agreed to. Offer at most ONE new practical suggestion when this step permits it and a certified candidate supports it; otherwise consolidate existing actions. End with a "
            "reflection question. On the last line put only [[AVANZA_STEP]]."
        ),
        "system_prompt_mode": "qpcs-summary",
        "color_theme": "purple",
        "questionnaire_type": "QPCS",
    },
]


# --- Default QPCC guided steps (analisi fattori su punteggi 1-9, come QSA) ---

DEFAULT_QPCC_GUIDED_STEPS: List[Dict] = [
    {
        "id": "qpcc-welcome",
        "sort_order": 0,
        "label": "0. Presentazione",
        "prompt": SCORE_BASED_INTRO_STEP_PROMPT,
        "system_prompt_mode": "intro",
        "color_theme": "teal",
    },
    {
        "id": "qpcc-factors",
        "sort_order": 1,
        "label": "1. Analisi di Competenze e Convinzioni",
        "prompt": (
            "Analyse all the factors of my QPCC profile: K1 (Public communication), "
            "K2 (Managing anxiety and responsibility), K3 (Volition and self-regulation), "
            "K4 (Elaboration strategies), K5 (Beliefs about oneself). "
            "For each, give the score, interpretation and a short practical comment."
        ),
        "system_prompt_mode": "qpcc-factor",
        "color_theme": "indigo",
        "questionnaire_type": "QPCC",
    },
]


# --- Default QAP guided steps (CAAS: 4 risorse, analisi su punteggi 1-9) ---

DEFAULT_QAP_GUIDED_STEPS: List[Dict] = [
    {
        "id": "qap-welcome",
        "sort_order": 0,
        "label": "0. Presentazione",
        "prompt": SCORE_BASED_INTRO_STEP_PROMPT,
        "system_prompt_mode": "intro",
        "color_theme": "teal",
    },
    {
        "id": "qap-factors",
        "sort_order": 1,
        "label": "1. Analisi delle Risorse",
        "prompt": (
            "Analyse the 4 resources of my QAP profile: AD1 (Future orientation), "
            "AD2 (Control and autonomy), AD3 (Curiosity and exploration), "
            "AD4 (Confidence and problem solving). "
            "For each, give the score, interpretation and a short practical comment."
        ),
        "system_prompt_mode": "qap-factor",
        "color_theme": "green",
        "questionnaire_type": "QAP",
    },
]
