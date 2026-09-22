#!/usr/bin/env python3
"""
Costruttore del documento Word: 'docs/Guida_Costruzione_Prompt_QSA_CounselorBot.docx'.
Assembla tutti i dati estratti dai file di documentazione DB e dal codice backend
in un documento Word professionale di alta qualità tipografica e pedagogica.
"""

import os
import sys
import json
import re

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL

from docx_helpers import (
    NAVY, TEAL, SLATE, CHARCOAL, MUTED, AMBER,
    set_cell_background, set_cell_margins, set_row_header, set_row_cant_split,
    set_table_borders, add_callout_box, add_theory_box, add_prompt_box,
    add_warning_box, add_heading_1, add_heading_2, add_heading_3,
    add_p, add_bullet, add_styled_table
)

from parse_prompt_data import load_text_files, parse_db_sections, parse_strategies, parse_cultural_catalog

OUTPUT_DOCX_PATH = "/home/nugh75/counselorbot-sbs/docs/Guida_Costruzione_Prompt_QSA_CounselorBot.docx"

def build_qsa_document():
    print("Inizio caricamento e parsing dei file...")
    db_text, all_text = load_text_files()
    db_data = parse_db_sections(db_text)
    strategies = parse_strategies(all_text)
    catalog = parse_cultural_catalog(all_text)
    print(f"Estratti {len(db_data['steps'])} step, {len(strategies)} strategie, {sum(len(v) for v in catalog.values())} risorse culturali.")

    doc = Document()

    # Impostazione margini A4
    for section in doc.sections:
        section.top_margin = Inches(0.98)
        section.bottom_margin = Inches(0.98)
        section.left_margin = Inches(0.98)
        section.right_margin = Inches(0.98)
        section.page_width = Inches(8.27)
        section.page_height = Inches(11.69)
        
        # Header e Footer
        header = section.header
        p_head = header.paragraphs[0]
        p_head.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        r_head = p_head.add_run("CounselorBot • Architettura e Costruzione del Prompt QSA")
        r_head.font.name = "Calibri"
        r_head.font.size = Pt(8.5)
        r_head.font.color.rgb = MUTED

        footer = section.footer
        p_foot = footer.paragraphs[0]
        p_foot.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r_foot = p_foot.add_run("Documentazione Tecnica di Sistema — ai4educ / CounselorBot — Settembre 2026")
        r_foot.font.name = "Calibri"
        r_foot.font.size = Pt(8.5)
        r_foot.font.color.rgb = MUTED

    # ==========================================
    # FRONTESPIZIO / INTESTAZIONE DOCUMENTO
    # ==========================================
    p_title = doc.add_paragraph()
    p_title.paragraph_format.space_before = Pt(24)
    p_title.paragraph_format.space_after = Pt(4)
    r_title = p_title.add_run("ARCHITETTURA E COSTRUZIONE DEL PROMPT QSA IN COUNSELORBOT")
    r_title.font.name = "Calibri"
    r_title.font.size = Pt(22)
    r_title.font.bold = True
    r_title.font.color.rgb = NAVY

    p_sub = doc.add_paragraph()
    p_sub.paragraph_format.space_before = Pt(0)
    p_sub.paragraph_format.space_after = Pt(14)
    r_sub = p_sub.add_run("Guida Tecnica di Riferimento ai Prompt Reali del Database, Regole di Scoping dei Fattori, Framework Pedagogico di Pellerey e Pipeline di Generazione")
    r_sub.font.name = "Calibri"
    r_sub.font.size = Pt(12.5)
    r_sub.font.color.rgb = TEAL

    # Tabella Metadati Frontespizio
    meta_headers = ["Parametro di Sistema", "Specifiche Tecniche"]
    meta_data = [
        ["Sistema & Piattaforma", "CounselorBot (ai4educ / KTH EECS — Step-by-Step Guidance)"],
        ["Origine dei Prompt", "Database Live counselorbot (tabelle guided_steps, configs, certified_*)"],
        ["Questionario di Riferimento", "QSA (14 fattori) e QSAr (8 fattori ridotti)"],
        ["Modello Psicopedagogico", "Modello di Autodirezione (Michele Pellerey et al., 2013)"],
        ["Pipeline di Costruzione", "Envelope Canonico a 3 Livelli (chat_preparation.py + chat_logic.py)"],
        ["Architettura Logica", "Direttiva (SOP) -> Orchestrazione (Routing/Scoping) -> Esecuzione (Script/DB)"],
        ["Data Documento", "Settembre 2026 — Rilascio di Produzione"]
    ]
    add_styled_table(doc, meta_headers, meta_data, col_widths=[2.5, 4.2])

    add_callout_box(
        doc,
        title="NOTA DI CONSULTAZIONE OPERATIVA",
        text=(
            "Questo documento raccoglie la totalità delle informazioni ingegneristiche e psicopedagogiche necessarie a "
            "comprendere, verificare e mantenere la costruzione del prompt in CounselorBot per il percorso QSA. "
            "Tutti i testi di prompt presentati nei box corrispondono fedelmente ai record estratti dal database di produzione, "
            "i quali prevalgono sulle configurazioni di fabbrica (backend/prompts/) in quanto contengono i vincoli "
            "e le ottimizzazioni raffinate durante la sperimentazione con gli studenti."
        ),
        border_color="0D9488",
        bg_color="F0FDFA",
        title_color="0F766E",
        font_name="Calibri",
        font_size=9.5
    )

    # ==========================================
    # CAPITOLO 1: FONDAMENTI METODOLOGICI
    # ==========================================
    add_heading_1(doc, "1. Introduzione e Fondamenti Metodologici")
    
    add_heading_2(doc, "1.1 Finalità del Documento")
    add_p(doc, (
        "Il presente documento fornisce una guida tecnica esaustiva e rigorosa sull'architettura e la costruzione dinamica "
        "del prompt all'interno della piattaforma CounselorBot per il percorso guidato relativo al Questionario sulle "
        "Strategie di Apprendimento (QSA) e alla sua versione ridotta (QSAr). Il sistema CounselorBot opera come un "
        "assistente conversazionale pedagogico (Counselor AI) destinato a studenti delle scuole secondarie superiori e "
        "dell'università, con l'obiettivo di sostenerli nella comprensione del proprio metodo di studio e nello sviluppo "
        "della competenza strategico-riflessiva."
    ))

    add_heading_2(doc, "1.2 Il Modello Teorico di Michele Pellerey (2013)")
    add_p(doc, (
        "Alla base dell'intero percorso non vi è una tassonomia empirica casuale, ma il rigoroso impianto scientifico "
        "delineato da Michele Pellerey e collaboratori (Pellerey et al., 2013; Pellerey, 2001). Il QSA indaga le competenze "
        "strategiche dell'apprendimento mediante 14 fattori psicometrici suddivisi in due grandi dimensioni:"
    ))
    add_bullet(doc, (
        "Area Cognitiva (C1-C7): descrive COME lo studente elabora le informazioni. Coinvolge i processi di attenzione "
        "selettiva, elaborazione attiva dei contenuti, organizzazione semantica delle conoscenze, metacognizione e autoregolazione."
    ), bold_prefix="• ")
    add_bullet(doc, (
        "Area Affettivo-Motivazionale (A1-A7): descrive COSA MUOVE e COSA FRENA lo studente. Comprende la gestione dell'ansia "
        "e delle interferenze emotive, la volizione e la perseveranza nel compito, lo stile attributivo (locus of control) "
        "e la percezione di competenza (autoefficacia scolastica)."
    ), bold_prefix="• ")

    add_p(doc, (
        "L'obiettivo fondamentale del counselling in CounselorBot è sostenere la capacità di Autodirezione (Self-Direction). "
        "L'autodirezione richiede la convergenza di due pilastri inseparabili:"
    ))
    add_bullet(doc, (
        "Autodeterminazione: la capacità di individuare scopi personali, trovare significato nello studio, formulare intenzioni "
        "chiare e scegliere la direzione delle proprie azioni."
    ), bold_prefix="1. ")
    add_bullet(doc, (
        "Autoregolazione: l'abilità di monitorare attivamente l'esecuzione, pianificare i tempi, gestire le distrazioni, "
        "valutare i risultati e adattare le strategie quando necessario (modellata sul Ciclo di Zimmerman: Forethought, Performance, Self-Reflection)."
    ), bold_prefix="2. ")

    add_theory_box(
        doc,
        title="Il Concetto di 'Carattere' e l'Identità Narrativa",
        text=(
            "Nel modello di Pellerey (2013, cap. 2), le competenze strategiche non sono compartimenti stagni né tratti statici: "
            "esse costituiscono il 'Carattere' dello studente, inteso come integrazione progressiva e dinamica di abitudini cognitive, "
            "affettive e sociali in un modo coerente di essere. Nel percorso guidato, il CounselorBot aiuta lo studente a passare "
            "da 'Cosa sono?' (la somma dispersa dei punteggi) a 'Chi sono e come studio?' (la propria Identità Narrativa). "
            "Lo studente non è un mero esecutore passivo delle proprie tendenze scolastiche, ma può diventare l'autore consapevole "
            "del proprio percorso di crescita."
        )
    )

    add_heading_2(doc, "1.3 Origine dei Dati: Prompt del Database vs Codice di Fabbrica")
    add_p(doc, (
        "Un elemento cardine della corretta gestione del sistema CounselorBot è la distinzione fondamentale tra i prompt di fabbrica "
        "(factory defaults contenuti nel codice repository sotto 'backend/prompts/') e i prompt effettivi memorizzati nel Database "
        "(tabelle 'guided_steps' e 'configs')."
    ))
    add_p(doc, (
        "In produzione, l'applicazione interroga prioritariamente le tabelle del database. I testi estratti in questo documento "
        "provengono direttamente dal dump live del database e costituiscono il testo realmente servito dal backend. Rispetto ai "
        "default di fabbrica, i prompt da database presentano raffinamenti cruciali:"
    ))
    add_bullet(doc, "Eliminazione totale di etichette burocratiche o metanegazioni ('Non devi fare tabelle', 'Sono un'IA');", bold_prefix="• ")
    add_bullet(doc, "Integrazione dei vincoli di anchoring ([ANCHOR]) per chiudere con domande su misura per lo studente;", bold_prefix="• ")
    add_bullet(doc, "Perfezionamento del secondo livello ([SECOND-LEVEL METHOD]) che impone di formulare prima l'ipotesi e la riflessione e solo dopo (se consentito) il consiglio;", bold_prefix="• ")
    add_bullet(doc, "Integrazione delle direttive sui framework teorici di Pellerey e Zimmerman;", bold_prefix="• ")
    add_bullet(doc, "Calibrazione rigorosa della distribuzione dei consigli per evitare il sovraccarico cognitivo dello studente.", bold_prefix="• ")

    # ==========================================
    # CAPITOLO 2: L'ARCHITETTURA TECNICA DEL PROMPT
    # ==========================================
    add_heading_1(doc, "2. L'Architettura Tecnica del Prompt (L'Envelope Canonico a 3 Livelli)")
    
    add_heading_2(doc, "2.1 L'Architettura a 3 Livelli di CounselorBot")
    add_p(doc, (
        "CounselorBot adotta un'architettura rigorosa a 3 livelli progettata per separare nettamente le responsabilità e massimizzare "
        "l'affidabilità delle interazioni conversazionali. Gli LLM sono modelli probabilistici, mentre i vincoli psicometrici "
        "e pedagogici richiedono determinismo assoluto:"
    ))
    add_bullet(doc, (
        "Livello 1: Direttiva (Cosa Fare) — Costituito dalle SOP (Standard Operating Procedures) in linguaggio naturale, "
        "dai prompt di fase in 'guided_steps' e dalle configurazioni di comportamento in 'configs'. Definisce obiettivi, vincoli e tono."
    ), bold_prefix="• ")
    add_bullet(doc, (
        "Livello 2: Orchestrazione (Routing e Decision-Making) — Implementato in Python ('chat_preparation.py' e 'chat_logic.py'). "
        "Determina i componenti da attivare, calcola lo scoping dei fattori, seleziona le strategie certificate pertinenti, "
        "gestisce i controlli di coerenza (thread guard, session ledger) e assembla l'Envelope canonico."
    ), bold_prefix="• ")
    add_bullet(doc, (
        "Livello 3: Esecuzione (Fare il Lavoro) — Script Python deterministici e storage su database ('counselorbot.db', indici RAG, "
        "session memory). Gestisce in modo infallibile e tracciabile il calcolo dei punteggi, la persistenza dei transcript, "
        "il logging di audit e il recupero delle strategie."
    ), bold_prefix="• ")

    add_heading_2(doc, "2.2 Anatomia dell'Envelope Canonico (Fase 5)")
    add_p(doc, (
        "All'interno della funzione 'build_context_envelope()' ('backend/chat_logic.py', righe 2638-2920) e della funzione "
        "'prepare_chat_turn()' ('backend/chat_preparation.py'), CounselorBot unifica la preparazione del turno in un ordine fisso "
        "e non negoziabile. La chiamata alle API del modello linguistico riceve due strutture primarie:"
    ))
    add_bullet(doc, (
        "SYSTEM PROMPT FINAL: Un'unica stringa monolitica ma strutturata gerarchicamente, formata dalla concatenazione "
        "di blocchi tematici recanti identificatori standardizzati in maiuscolo e parentesi quadre ([PERSONA], [SECTION], "
        "[STUDENT], [PROFILE], [KNOWLEDGE], ecc.)."
    ), bold_prefix="1. ")
    add_bullet(doc, (
        "MESSAGES (Storico Verbatim + Messaggio Utente Corrente): Lo storico verbatim della sessione (history) e il turno "
        "utente corrente contenente esclusivamente i punteggi scopati per lo step e il testo digitato o il comando di avanzamento."
    ), bold_prefix="2. ")

    add_heading_2(doc, "2.3 I 18 Blocchi Funzionali del System Prompt Finale")
    add_p(doc, (
        "La costruzione del 'system_prompt_final' segue un rigoroso flusso a 18 stadi che garantisce la presenza di tutte le "
        "informazioni di contesto necessarie e la soppressione di qualsiasi elemento estraneo:"
    ))

    envelope_blocks = [
        ["1. [STEP PROMPT]", "Prompt della Fase Guidata", "Invocato all'ingresso dello step (use_phase_prompt=True). Posizionato in testa al system prompt per fissare l'obiettivo della fase prima di qualsiasi altra istruzione."],
        ["2. [PERSONA]", "Identità del Counselor", "Definisce il nome, il ruolo professionale, il tono accogliente, maieutico e non giudicante del counselor selezionato dall'utente."],
        ["3. [SECTION]", "System Prompt di Base", "Risolto in base al system_prompt_mode dello step (prompt_intro, prompt_factor, prompt_second_level). Fissa le regole interpretative."],
        ["4. Direttive Globali", "Formato e Linguaggio", "Applicate da _apply_global_directives: lingua richiesta (es. italiano), registro formale/informale, thinking directive per modelli con reasoning e binding response length."],
        ["5. Direttiva Scope Fattori", "Perimetro di Analisi", "Iniettata da _apply_current_step_factor_scope_directive: limita severamente l'LLM all'analisi dei soli codici ammessi nello step corrente (phase_codes)."],
        ["6. Regole di Inversione", "Inversion Table", "Elenca e applica le regole per i fattori invertiti (_QSA_INVERTED_CODES: C3, C6, A1, A4, A5, A7). Impone che 7-9 sia debolezza e 1-3 sia risorsa."],
        ["7. Profilo Punteggi Step", "Score Profile & Labels", "Fornisce le etichette verbali iniettate per ciascun punteggio dello studente e accerta se vi sono improvement targets nello step corrente."],
        ["8. Politica dei Consigli", "Advice Distribution", "Regola ferrea: nessun consiglio in Intro o Fattori Singoli; massimo 1 consiglio certificato in Secondo Livello se presente un'area di crescita."],
        ["9. [META SYSTEM PROMPT]", "Framework Pellerey", "Approfondimento pedagogico specifico dello step (es. prompt_meta_QSA_sl-selfcontrol con il ciclo di Zimmerman). Fornisce la chiave di lettura scientifica."],
        ["10. [STUDENT]", "Metadati della Sessione", "Contiene lingua, codice anonimo di ricerca, step completati, obiettivi dichiarati nel colloquio e preferenze espresse dallo studente."],
        ["11. [GUIDED PATH]", "Stato del Percorso", "Indica allo studente a che punto del percorso guidato ci si trova e quali sono i passaggi successivi per dare senso di orientamento."],
        ["12. [PROFILE]", "Modello Discente & Portfolio", "Profilo autodichiarato, note del portfolio delle competenze e riferimento ai punteggi generali persistiti nella sessione."],
        ["13. [BOOKLET]", "Taccuino dello Studente", "Contenuto del taccuino riflessivo dello studente, utilizzato per agganciare le riflessioni a note scritte in precedenza."],
        ["14. [KNOWLEDGE]", "RAG & Strategie Certificate", "Fonti esterne RAG (competenzestrategiche.it, documenti di piattaforma) e candidati del catalogo delle 23 strategie e delle letture certificate."],
        ["15. [SESSION LEDGER]", "Registro Conversazionale", "Traccia le domande aperte poste nelle fasi precedenti e le risposte dello studente, evitando l'oblio informativo nel passaggio tra step."],
        ["16. [JOURNEY EVIDENCE]", "Sintesi Cronologica (Step 9)", "Attivo solo nello step di sintesi: riassume l'evoluzione del discente durante tutta la sessione evidenziando rettifiche e consapevolezze."],
        ["17. [THREAD GUARD]", "Guardrail di Coerenza", "Note generate dal modulo di guardia per prevenire allucinazioni, cambi di opinione immotivati o violazioni delle regole di inversione."],
        ["18. [TURN CONTRACT]", "Contratto Vincolante", "Regole finali di chiusura: divieto categorico di tabelle, divieto di formule di chiusura stereotipate, obbligo di porre prima la domanda riflessiva e poi il consiglio."]
    ]
    add_styled_table(doc, ["Blocco Architetturale", "Funzione", "Descrizione Operativa nel Prompt"], envelope_blocks, col_widths=[1.8, 1.8, 3.1])

    add_heading_2(doc, "2.4 La Struttura dei MESSAGES: History Verbatim e User Scoping")
    add_p(doc, (
        "La seconda metà dell'Envelope è costituita dal flusso dei messaggi scambiati tra studente e assistente. CounselorBot "
        "abbandona la logica dei 'riassunti intermedi' che spesso introducono distorsioni interpretative, adottando una rigorosa "
        "history verbatim gestita da 'session_memory':"
    ))
    add_bullet(doc, (
        "History Verbatim: tutti i turni precedenti vengono inviati come messaggi effettivi con i rispettivi ruoli (user e assistant). "
        "In questo modo il modello mantiene una memoria perfetta del tono e delle risposte effettive dello studente."
    ), bold_prefix="• ")
    add_bullet(doc, (
        "User Message Corrente (full_message): quando lo studente preme 'Avvia Step' o invia un messaggio, il backend assembla "
        "il messaggio utente anteponendo i soli punteggi del profilo pertinenti allo step ('message_scores_context'). "
        "In questo modo l'attenzione dell'LLM è focalizzata esattamente sui 1-3 fattori della fase corrente, senza dispersione su tutto il questionario."
    ), bold_prefix="• ")

    add_warning_box(
        doc,
        title="Regola di Inversione dei Fattori QSA (_QSA_INVERTED_CODES)",
        text=(
            "Nel QSA, 6 fattori su 14 presentano direzione invertita rispetto alla scala usuale: "
            "C3 (Disorientamento), C6 (Difficoltà di concentrazione), A1 (Ansia di base), "
            "A4 (Attribuzione a cause non controllabili), A5 (Mancanza di perseveranza), A7 (Interferenze emotive).\n"
            "Per questi fattori: un punteggio ALTO (7-9) denota una GRANDE DIFFICOLTÀ (area di crescita), "
            "mentre un punteggio BASSO (1-3) denota una GRANDE FORZA (risorsa).\n"
            "Il prompt inietta le etichette pre-calcolate e proibisce categoricamente all'LLM di ricalcolare "
            "o invertire autonomamente i punteggi: il modello deve attenersi strettamente alle etichette fornite."
        )
    )

    # ==========================================
    # CAPITOLO 3: MATRICE DEI COMPONENT FLAGS
    # ==========================================
    add_heading_1(doc, "3. Matrice Sinottica dei Component Flags (prompt_components_QSA_*)")
    add_p(doc, (
        "Nel database di CounselorBot, la tabella 'configs' ospita per ciascuno step un oggetto JSON denominato "
        "'prompt_components_QSA_<step_id>'. Tale oggetto governa in modo deterministico quali moduli dell'Envelope devono "
        "essere inclusi o esclusi durante l'assemblaggio del prompt per quel singolo turno."
    ))

    comp_headers = ["Step ID", "Cognitive", "Affective", "Knowledge", "History", "Profile", "Booklet", "RAG CB", "RAG CS", "Cert. Strat.", "Limit"]
    comp_rows = [
        ["intro", "False", "False", "True", "True", "True", "True", "True", "False", "False", "0"],
        ["cognitive", "True", "False", "False", "True", "True", "True", "False", "False", "False", "0"],
        ["affective", "False", "True", "False", "True", "True", "True", "False", "False", "False", "0"],
        ["sl-elaboration", "True", "False", "True", "True", "True", "True", "False", "False", "True", "1"],
        ["sl-selfcontrol", "True", "False", "True", "True", "True", "True", "False", "False", "True", "1"],
        ["sl-motivation", "False", "True", "True", "True", "True", "True", "False", "False", "True", "1"],
        ["sl-emotions", "False", "True", "True", "True", "True", "True", "False", "False", "True", "1"],
        ["sl-attribution", "False", "True", "True", "True", "True", "True", "False", "False", "True", "1"],
        ["sl-social", "True", "False", "True", "True", "True", "True", "False", "False", "True", "1"],
        ["sl-synthesis", "True", "True", "True", "True", "True", "True", "False", "False", "False*", "0*"]
    ]
    add_styled_table(doc, comp_headers, comp_rows, col_widths=[1.2, 0.6, 0.6, 0.6, 0.5, 0.5, 0.5, 0.6, 0.6, 0.6, 0.4])

    add_p(doc, "* Nota sulla Sintesi (sl-synthesis): nel backend il limite di consigli per la sintesi è forzato programmaticamente a 0 tramite la costante _NO_NEW_ADVICE_STEP_IDS, poiché la sintesi deve ricapitolare il percorso svolto e non può introdurre nuove strategie mai discusse prima.", space_after=8)

    add_heading_2(doc, "3.1 Logica delle Abilitazioni e delle Esclusioni")
    add_bullet(doc, (
        "Step 0 (intro): i fattori sia cognitivi che affettivi sono disabilitati (False) per impedire qualsiasi analisi prematura. "
        "Al contrario, 'rag_counselorbot' è abilitato (True) per consentire all'assistente di spiegare gli strumenti della piattaforma se lo studente lo chiede."
    ), bold_prefix="• ")
    add_bullet(doc, (
        "Step 1 e Step 2 (Fattori Singoli): 'knowledge' e 'certified_strategies' sono rigorosamente disabilitati (limit=0). "
        "Questi step devono rimanere puramente interpretativi ed esplorativi: il counselor deve far prendere coscienza del profilo senza dispensare consigli o soluzioni pratiche."
    ), bold_prefix="• ")
    add_bullet(doc, (
        "Step 3-8 (Secondi Livelli): 'knowledge' e 'certified_strategies' sono abilitati con limite pari a 1 (certified_strategy_limit=1). "
        "L'inclusione di una strategia è tuttavia condizionata alla presenza effettiva di un'area di miglioramento nello step."
    ), bold_prefix="• ")
    add_bullet(doc, (
        "Scoping dei Punteggi: negli step cognitivi (sl-elaboration, sl-selfcontrol, sl-social) 'affective_factors' è False; "
        "negli step affettivi (sl-motivation, sl-emotions, sl-attribution) 'cognitive_factors' è False. Questo azzera le allucinazioni incrociate."
    ), bold_prefix="• ")

    # ==========================================
    # CAPITOLO 4: ANALISI STEP PER STEP (TUTTI I 10 STEP)
    # ==========================================
    add_heading_1(doc, "4. Analisi Dettagliata Step per Step del Percorso QSA")
    add_p(doc, (
        "In questa sezione viene esaminata nel dettaglio ciascuna delle 10 tappe del percorso guidato QSA (Step 0 - Step 9). "
        "Per ogni step vengono presentati i metadati, il testo integrale del prompt dal database (tabella 'guided_steps'), "
        "il system prompt di base e il meta system prompt con la teoria di Pellerey (tabella 'configs'), la configurazione "
        "dei componenti e una spiegazione analitica della logica di costruzione del prompt."
    ))

    # Definizione dettagliata di ciascuno step
    step_details = [
        {
            "num": 0,
            "id": "intro",
            "title": "0. Presentazione",
            "mode": "intro",
            "factors": "Nessuno (fase introduttiva)",
            "inverted": "Nessuno",
            "advice_limit": "0 (vietato consigliare)",
            "base_prompt_key": "prompt_intro",
            "meta_prompt_key": "prompt_meta_QSA_intro",
            "comp_key": "prompt_components_QSA_intro",
            "pedagogical_goal": (
                "Accogliere lo studente in un clima di sicurezza psicologica, presentare le tappe del percorso senza anticipare "
                "i dati e chiarire che il QSA non è un test valutativo né un giudizio clinico, bensì un supporto per la riflessione autonoma."
            ),
            "construction_logic": (
                "Il prompt dello Step 0 ordina all'LLM di presentare il percorso in 3-4 frasi naturali e calorose. "
                "Viene imposto il divieto tassativo di menzionare punteggi, fattori, tabelle o codici alfanumerici. "
                "Nel System Prompt viene iniettato il framework [PELLEREY SELF-DIRECTION], che stabilisce che le competenze strategiche "
                "sono abitudini allenabili e non tratti immutabili. Se lo studente chiede come funziona la piattaforma, il blocco "
                "[PLATFORM CAPABILITIES] consente di descrivere gli strumenti disponibili senza analizzare il profilo."
            )
        },
        {
            "num": 1,
            "id": "cognitive",
            "title": "1. Fattori Cognitivi",
            "mode": "factor",
            "factors": "C1 (Elaborative), C2 (Autoregolazione), C3 (Disorientamento), C4 (Collaborazione), C5 (Organizzatori), C6 (Concentrazione), C7 (Autointerrogazione)",
            "inverted": "C3 (Disorientamento) e C6 (Difficoltà di concentrazione)",
            "advice_limit": "0 (puramente interpretativo)",
            "base_prompt_key": "prompt_factor",
            "meta_prompt_key": "prompt_meta_QSA_cognitive",
            "comp_key": "prompt_components_QSA_cognitive",
            "pedagogical_goal": (
                "Fornire una prima lettura interpretativa d'insieme dei 7 fattori cognitivi, evidenziando le sinergie operative "
                "e le tensioni tra processi di elaborazione e processi di controllo, senza dare consigli pratici."
            ),
            "construction_logic": (
                "Il prompt ordina di redigere un singolo paragrafo per ciascun fattore cognitivo presente, riportando codice, nome, punteggio "
                "e l'etichetta verbale esatta iniettata dal sistema. È vietato l'uso di tabelle ed è vietato dare consigli pratici. "
                "L'LLM deve rilevare le relazioni interne all'area: il supporto reciproco tra C1, C5 e C7 nell'elaborazione e memoria; "
                "il ruolo di risorsa di C2 (Autoregolazione) quando emergono difficoltà in C3 o C6; il rinforzo reciproco tra C3 e C6 "
                "come difficoltà nel controllo dello studio. Alla fine, i fattori vengono raggruppati per etichette reali. "
                "Lo step si chiude categoricamente con il blocco [ANCHOR]: una sola domanda aperta e riflessiva legata all'esperienza viva dello studente."
            )
        },
        {
            "num": 2,
            "id": "affective",
            "title": "2. Fattori Affettivi",
            "mode": "factor",
            "factors": "A1 (Ansia base), A2 (Volizione), A3 (Cause controllabili), A4 (Cause incontrollabili), A5 (Mancanza perseveranza), A6 (Percezione competenza), A7 (Interferenze emotive)",
            "inverted": "A1 (Ansia base), A4 (Cause incontrollabili), A5 (Mancanza perseveranza), A7 (Interferenze emotive)",
            "advice_limit": "0 (puramente interpretativo)",
            "base_prompt_key": "prompt_factor",
            "meta_prompt_key": "prompt_meta_QSA_affective",
            "comp_key": "prompt_components_QSA_affective",
            "pedagogical_goal": (
                "Esplorare la sfera emotivo-motivazionale che sostiene o blocca lo studio: ansia, volizione, perseveranza, attribuzioni e autoefficacia."
            ),
            "construction_logic": (
                "Come per lo Step 1, la modalità è 'factor': un paragrafo per fattore, rispetto assoluto delle inversioni (A1, A4, A5, A7), "
                "nessun consiglio pratico e chiusura con [ANCHOR]. Il prompt guida l'LLM a notare tensioni e rinforzi affettivi: "
                "A1 e A7 possono amplificare la tensione emotiva; A2 (Volizione) agisce come risorsa positiva contro la demotivazione (A5); "
                "A3 (Attribuzione a cause controllabili) compensa le derive di impotenza appresa legate ad A4 elevato; A6 (Percezione di competenza) "
                "sostiene la tenuta volitiva e aiuta a ridimensionare l'ansia. Le discrepanze devono essere trattate come tensioni psicologiche e mai come errori."
            )
        },
        {
            "num": 3,
            "id": "sl-elaboration",
            "title": "3. Elaborazione e Org.",
            "mode": "second-level",
            "factors": "C1 (Strategie elaborative), C5 (Uso organizzatori semantici), C7 (Autointerrogazione)",
            "inverted": "Nessuno (tutti diretti: punteggio alto = risorsa)",
            "advice_limit": "1 (solo se emerge un'area di crescita)",
            "base_prompt_key": "prompt_second_level",
            "meta_prompt_key": "prompt_meta_QSA_sl-elaboration",
            "comp_key": "prompt_components_QSA_sl-elaboration",
            "pedagogical_goal": (
                "Analizzare in profondità come lo studente comprende, organizza, collega e ricorda il materiale di studio, "
                "utilizzando i punti di forza come leve di miglioramento per le componenti più deboli."
            ),
            "construction_logic": (
                "Inaugura il Secondo Livello ([SECOND-LEVEL METHOD]). L'LLM non deve elencare i fattori isolati, ma descrivere il loro INTERPLAY: "
                "come C1 (collegamenti, analogie), C5 (schemi, mappe) e C7 (farsi domande) cooperano nell'apprendimento profondo. "
                "Il meta prompt di Pellerey distingue lo studio passivo ('tempo passato con il libro aperto') dalla costruzione attiva di significato. "
                "La struttura della risposta impone: 1) lettura integrata dell'interplay; 2) UNA ipotesi interpretativa sul modo di studiare; "
                "3) UNA domanda riflessiva concreta; 4) al massimo UN consiglio pratico certificato (es. 'Pratica di recupero' o 'Schemi e mappe') "
                "solo se C1, C5 o C7 sono aree di crescita. La domanda riflessiva precede obbligatoriamente il consiglio."
            )
        },
        {
            "num": 4,
            "id": "sl-selfcontrol",
            "title": "4. Autocontrollo",
            "mode": "second-level",
            "factors": "C2 (Autoregolazione), C3 (Disorientamento), C6 (Difficoltà di concentrazione)",
            "inverted": "C3 e C6 (punteggi 7-9 indicano difficoltà)",
            "advice_limit": "1 (se C3 o C6 elevati o C2 debole)",
            "base_prompt_key": "prompt_second_level",
            "meta_prompt_key": "prompt_meta_QSA_sl-selfcontrol",
            "comp_key": "prompt_components_QSA_sl-selfcontrol",
            "pedagogical_goal": (
                "Esplorare la regolazione dell'attenzione, la pianificazione dello studio e la gestione del disorientamento e delle distrazioni."
            ),
            "construction_logic": (
                "Il prompt mobilita il framework più articolato dell'intero sistema: il Ciclo di Autoregolazione di Zimmerman adattato da Pellerey: "
                "1) Forethought (obiettivi specifici vs vaghi); 2) Performance (gestione di noia, fatica e disinteresse mediante strategie alternative); "
                "3) Self-Reflection (analisi causale dei risultati). Rispetta rigorosamente l'inversione di C3 e C6: se C2 è alto e C3/C6 sono alti, "
                "si configura un pattern di autoregolazione mista dove C2 rappresenta la leva chiave per arginare la confusione e le distrazioni. "
                "Se emergono difficoltà, il catalogo può consigliare 'Ridurre le distrazioni e studiare a intervalli' o 'Dare struttura allo studio'."
            )
        },
        {
            "num": 5,
            "id": "sl-motivation",
            "title": "5. Motivazione",
            "mode": "second-level",
            "factors": "A2 (Volizione), A5 (Mancanza di perseveranza), A6 (Percezione di competenza)",
            "inverted": "A5 (Mancanza di perseveranza: alto = debolezza)",
            "advice_limit": "1 (se A5 elevata o A2/A6 deboli)",
            "base_prompt_key": "prompt_second_level",
            "meta_prompt_key": "prompt_meta_QSA_sl-motivation",
            "comp_key": "prompt_components_QSA_sl-motivation",
            "pedagogical_goal": (
                "Comprendere la tenuta della volontà nel tempo, la persistenza di fronte alla fatica e l'impatto dell'autoefficacia percepita."
            ),
            "construction_logic": (
                "Il prompt impone una verifica psicometrica fondamentale: il controllo della simmetria tra A2 e A5. "
                "Fisiologicamente, un'alta volizione (A2) si associa a un basso punteggio nella mancanza di perseveranza (A5). "
                "L'LLM deve verificare se il profilo rispetta o rompe questa simmetria e commentarne il significato per lo studente. "
                "Inoltre, indaga il ruolo di A6 (Percezione di competenza): se A6 è basso, l'intenzione di studiare non si traduce in perseveranza "
                "a causa della sfiducia nelle proprie capacità. È vietato dire 'non hai motivazione': il modello deve descrivere la dinamica "
                "tra intenzione, autoefficacia e continuità operativa."
            )
        },
        {
            "num": 6,
            "id": "sl-emotions",
            "title": "6. Gestione Emotiva",
            "mode": "second-level",
            "factors": "A1 (Ansia di base), A7 (Interferenze emotive)",
            "inverted": "Entrambi invertiti (A1 e A7: punteggi 7-9 indicano difficoltà)",
            "advice_limit": "1 (se A1 o A7 risultano elevati)",
            "base_prompt_key": "prompt_second_level",
            "meta_prompt_key": "prompt_meta_QSA_sl-emotions",
            "comp_key": "prompt_components_QSA_sl-emotions",
            "pedagogical_goal": (
                "Riconoscere e gestire le manifestazioni dell'ansia da prestazione e dell'interferenza emotiva diffusa, "
                "normalizzando la tensione e fornendo strategie di regolazione senza mai formulare diagnosi cliniche."
            ),
            "construction_logic": (
                "La direttiva teorica di Pellerey chiarisce che l'ansia non è un difetto da eliminare ma un segnale fisiologico di attivazione: "
                "una tensione moderata favorisce l'attenzione, mentre l'eccesso blocca la memoria di lavoro. "
                "L'LLM deve distinguere con precisione l'ansia situazionale da prestazione (A1, legata a verifiche ed esami orali) "
                "dall'interferenza emotiva diffusa (A7, inquietudine generale durante lo studio). "
                "Vige il divieto assoluto di diagnosi cliniche: il modello deve esplorare gli episodi concreti descritti dallo studente. "
                "Se emergono criticità, il sistema offre strategie certificate quali 'Gestione dell'ansia da prestazione' o 'Gestione delle interferenze emotive'."
            )
        },
        {
            "num": 7,
            "id": "sl-attribution",
            "title": "7. Stile Attributivo",
            "mode": "second-level",
            "factors": "A3 (Cause controllabili), A4 (Cause incontrollabili), con riferimento ad A6 (Percezione di competenza)",
            "inverted": "A4 (Cause incontrollabili: punteggi 7-9 indicano fatalismo/impotenza)",
            "advice_limit": "1 (se A4 elevato o A3 debole)",
            "base_prompt_key": "prompt_second_level",
            "meta_prompt_key": "prompt_meta_QSA_sl-attribution",
            "comp_key": "prompt_components_QSA_sl-attribution",
            "pedagogical_goal": (
                "Sviluppare consapevolezza sulle spiegazioni che lo studente dà dei propri successi e insuccessi, "
                "promuovendo una mentalità di crescita (Growth Mindset) orientata a cause modificabili (impegno e metodo)."
            ),
            "construction_logic": (
                "Basato sulla teoria dell'attribuzione di Weiner e sulle ricerche di Carol Dweck sul Growth Mindset. "
                "Il fattore discriminante è la CONTROLLABILITÀ: impegno e metodo di studio sono sotto il controllo dello studente; "
                "fortuna, destino e compiti ritenuti 'impossibili' non lo sono. Il prompt istruisce l'LLM a verificare se lo studente "
                "presenta uno stile attributivo ambivalente (A3 e A4 entrambi alti) o disfunzionale (A3 basso e A4 alto, rischio di impotenza appresa). "
                "Lo stile attributivo interno (A3 alto, A4 basso) viene collegato ad A6: credere che i risultati dipendano da sé sostiene l'autoefficacia."
            )
        },
        {
            "num": 8,
            "id": "sl-social",
            "title": "8. Dimensione Sociale",
            "mode": "second-level",
            "factors": "C4 (Disponibilità alla collaborazione)",
            "inverted": "Nessuno (diretto: punteggio alto = risorsa)",
            "advice_limit": "1 (se C4 rappresenta un'area di crescita)",
            "base_prompt_key": "prompt_second_level",
            "meta_prompt_key": "prompt_meta_QSA_sl-social",
            "comp_key": "prompt_components_QSA_sl-social",
            "pedagogical_goal": (
                "Valorizzare lo studio cooperativo, il peer tutoring e la capacità di chiedere aiuto come leve per chiarire il pensiero e consolidare l'apprendimento."
            ),
            "construction_logic": (
                "Contiene una REGOLA SPECIALE FONDAMENTALE: essendo uno step a fattore singolo (solo C4), è VIETATO categoricamente inventare "
                "relazioni o discrepanze con altri fattori del QSA. Il meta prompt di Pellerey introduce il concetto di 'Comunità di Pratica': "
                "chi ha un punteggio basso in C4 spesso associa il lavoro di gruppo all'esperienza negativa di 'dover fare il lavoro per gli altri'. "
                "Il prompt guida a ristrutturare questa percezione: spiegare a un pari è la forma più alta di consolidamento mnemonico. "
                "Suggerimenti pratici: peer tutoring, studio in coppia strutturato con ruoli precisi."
            )
        },
        {
            "num": 9,
            "id": "sl-synthesis",
            "title": "3.7 Sintesi Integrata",
            "mode": "second-level",
            "factors": "Tutti i 14 fattori (C1-C7 cognitivi e A1-A7 affettivi)",
            "inverted": "Tutti i 6 fattori invertiti considerati nel quadro globale",
            "advice_limit": "0 (vietato consigliare nuove strategie)",
            "base_prompt_key": "prompt_second_level",
            "meta_prompt_key": "prompt_meta_QSA_sl-synthesis",
            "comp_key": "prompt_components_QSA_sl-selfcontrol (ereditato con veto advice=0)",
            "pedagogical_goal": (
                "Offrire una visione d'insieme del profilo dello studente, identificando le 2-3 relazioni trasversali tra cognitivo e affettivo, "
                "consolidando le consapevolezze maturate e aprendo a una prospettiva esistenziale e professionale autonoma."
            ),
            "construction_logic": (
                "Lo step culminante del percorso. Il prompt impone il divieto assoluto di ri-elencare i fattori uno ad uno. "
                "L'LLM deve isolare 2-3 intersezioni cross-dominio salienti: ad es. come l'ansia (A1/A7) influisce sulla concentrazione (C6); "
                "come la percezione di competenza (A6) alimenta la volizione (A2); come lo stile attributivo (A3/A4) modella la perseveranza (A5). "
                "Nel System Prompt vengono iniettati [JOURNEY EVIDENCE] (cronologia dell'evoluzione dello studente) e [PERSPECTIVE] "
                "(connessione del metodo con il Taccuino, il Portfolio e gli orizzonti di vita). "
                "Regola ferrea [SYNTHESIS ADVICE]: è vietato proporre nuove strategie; si può al massimo ribadire una priorità già concordata."
            )
        }
    ]

    for st in step_details:
        s_num = st["num"]
        add_heading_2(doc, f"Step {s_num}: {st['title']} (id: {st['id']})")
        
        # Tabella di sintesi dello Step
        st_summary_headers = ["Proprietà dello Step", "Valore di Configurazione"]
        st_summary_data = [
            ["ID Database & Label", f"{st['id']} — {st['title']}"],
            ["Modalità di Prompt (mode)", st["mode"]],
            ["Fattori QSA Coinvolti", st["factors"]],
            ["Fattori Invertiti nello Step", st["inverted"]],
            ["Limite Strategie Certificate", st["advice_limit"]],
            ["System Prompt Base Associato", st["base_prompt_key"]],
            ["Meta System Prompt Associato", st["meta_prompt_key"]],
            ["Configurazione Componenti", st["comp_key"]]
        ]
        add_styled_table(doc, st_summary_headers, st_summary_data, col_widths=[2.4, 4.3])

        # Obiettivo Pedagogico
        add_p(doc, st["pedagogical_goal"], bold_prefix="🎯 Obiettivo Pedagogico: ")

        # 1. Step Prompt Reale (da DB guided_steps)
        db_step_info = db_data["steps"].get(s_num)
        step_prompt_text = db_step_info["prompt"] if db_step_info else "Non presente nel dump"
        add_prompt_box(doc, f"Step Prompt Reale dallo Step {s_num} (tabella guided_steps)", step_prompt_text)

        # 2. System Prompt Base Reale
        base_prompt_text = db_data["base_prompts"].get(st["base_prompt_key"], "Non presente")
        add_prompt_box(doc, f"System Prompt Base: {st['base_prompt_key']} (tabella configs)", base_prompt_text)

        # 3. Meta System Prompt Reale
        meta_prompt_text = db_data["meta_prompts"].get(st["meta_prompt_key"], "Non presente")
        add_theory_box(doc, f"{st['meta_prompt_key']} (tabella configs)", meta_prompt_text)

        # 4. Component Flags
        comp_dict = db_data["components"].get(st["comp_key"], {})
        comp_json_str = json.dumps(comp_dict, indent=2) if isinstance(comp_dict, dict) else str(comp_dict)
        add_callout_box(
            doc,
            title=f"Flag Componenti Attivi: {st['comp_key']}",
            text=comp_json_str,
            border_color="475569",
            bg_color="F8FAFC",
            title_color="1E293B",
            font_name="Consolas",
            font_size=8.5
        )

        # 5. Spiegazione della Costruzione del Prompt
        add_heading_3(doc, f"Analisi Tecnica della Costruzione del Prompt per lo Step {s_num}")
        add_p(doc, st["construction_logic"])

        # Chiusura con paragrafo di separazione
        p_sep = doc.add_paragraph()
        p_sep.paragraph_format.space_before = Pt(4)
        p_sep.paragraph_format.space_after = Pt(12)

    # ==========================================
    # CAPITOLO 5: GESTIONE DEI FOLLOW-UP (PROMPT_FACTOR_QA)
    # ==========================================
    add_heading_1(doc, "5. Gestione dei Turni di Follow-Up e Domande Libere (prompt_factor_qa)")
    add_p(doc, (
        "Durante l'interazione, lo studente non si limita ad avanzare linearmente da uno step al successivo, ma può "
        "interrompere il percorso per porre domande di chiarimento, chiedere approfondimenti teorici ('perché ho preso questo punteggio?') "
        "o sollecitare un consiglio su una situazione specifica. Quando lo studente invia un messaggio libero all'interno di uno step già avviato, "
        "il sistema passa automaticamente in modalità Follow-Up (Fase di Q&A)."
    ))

    qa_prompt_text = db_data["base_prompts"].get("prompt_factor_qa", "Testo non disponibile")
    add_prompt_box(doc, "prompt_factor_qa — Regole per le Domande di Approfondimento", qa_prompt_text)

    add_heading_2(doc, "5.1 I Principi Guida del Follow-Up")
    add_bullet(doc, (
        "Perimetro Ristretto (Scope Adherence): l'assistente risponde esclusivamente alla domanda posta, utilizzando solo ciò che è "
        "già emerso e solo i fattori discussi fino a quel momento. È fatto divieto assoluto di introdurre fattori o punteggi "
        "appartenenti a step successivi."
    ), bold_prefix="• ")
    add_bullet(doc, (
        "Divieto di Ripetizioni e Saluti: la risposta deve essere diretta e colloquiale, priva di convenevoli, formule introduttive ('Certamente!', 'Ottima domanda!') o riassunti non richiesti."
    ), bold_prefix="• ")
    add_bullet(doc, (
        "La Direttiva [DEPTH ON REQUEST]: quando lo studente chiede un approfondimento esplicito ('spiegami meglio', 'perché funziona così?'), "
        "la risposta deve essere strutturata in 3 parti: (1) spiegare il MECCANISMO psicopedagogico, attingendo al materiale teorico [KNOWLEDGE]; "
        "(2) fornire UN esempio scolastico concreto coerente con la fascia di punteggio; (3) chiudere con UNA domanda riflessiva mirata."
    ), bold_prefix="• ")
    add_bullet(doc, (
        "Riconoscimento dell'Intento di Consiglio (is_advice_follow_up): se lo studente chiede esplicitamente un consiglio pratico in un turno di follow-up, "
        "il classificatore di intenti ('skills_intents.classify') rileva l'intento 'advice' e sblocca in via eccezionale il recupero di 1 strategia certificata "
        "pertinente, garantendo che la risposta rimanga scientificamente tracciabile e ancorata al catalogo."
    ), bold_prefix="• ")

    # ==========================================
    # CAPITOLO 6: IL PERCORSO RIDOTTO QSAR
    # ==========================================
    add_heading_1(doc, "6. Il Percorso Ridotto QSAr (Questionario Sintetico)")
    add_p(doc, (
        "Il QSAr è la versione breve del Questionario sulle Strategie di Apprendimento, progettata per interventi rapidi o screening iniziale. "
        "Comprende 8 fattori sintetici contrassegnati dal suffisso 'r':"
    ))
    add_bullet(doc, "Fattori Cognitivi QSAr: C1r (Strategie elaborative), C2r (Strategie autoregolative), C3r (Strategie grafiche/organizzatori), C4r (Difficoltà di controllo dell'attenzione - INVERTITO).", bold_prefix="• ")
    add_bullet(doc, "Fattori Affettivi QSAr: A1r (Ansia ed emotività - INVERTITO), A2r (Volizione e perseveranza), A3r (Attribuzioni causali), A4r (Percezione di competenza).", bold_prefix="• ")

    add_p(doc, (
        "Il database di CounselorBot ospita prompt dedicati specificamente al QSAr, i quali riflettono la natura compatta e sintetica del profilo, "
        "imponendo analisi più brevi ed evitando di ricostruire le sottoscale complesse del QSA completo:"
    ))

    qsar_prompts = [
        ("prompt_qsar_intro", "Introduzione al QSAr", db_data["base_prompts"].get("prompt_qsar_intro", "")),
        ("prompt_qsar_factor", "Lettura Fattori Singoli QSAr", db_data["base_prompts"].get("prompt_qsar_factor", "")),
        ("prompt_qsar_second_level", "Secondo Livello e Interplay QSAr", db_data["base_prompts"].get("prompt_qsar_second_level", "")),
        ("prompt_qsar_factor_qa", "Follow-up In-Step QSAr", db_data["base_prompts"].get("prompt_qsar_factor_qa", "")),
        ("prompt_qsar_generic", "Domande Generiche sul QSAr", db_data["base_prompts"].get("prompt_qsar_generic", ""))
    ]
    for p_key, p_desc, p_val in qsar_prompts:
        if p_val:
            add_prompt_box(doc, f"{p_key} ({p_desc})", p_val)

    # Conclusioni multilingua
    add_heading_2(doc, "6.1 Testi di Conclusione e Transizione alle Domande Libere")
    add_p(doc, (
        "Al termine del percorso guidato QSAr, il sistema chiude la fase strutturata e invita lo studente a porre domande aperte. "
        "Il database ospita le stringhe localizzate per tutte le lingue supportate dalla piattaforma (Italiano, Inglese, Tedesco, Spagnolo, Francese, Svedese):"
    ))
    lang_headers = ["Lingua", "text_qsar_conclusion (Conclusione)", "text_qsar_questions_intro (Invito Domande Libere)"]
    lang_rows = [
        ["Italiano (it)", db_data["other"].get("text_qsar_conclusion", ""), db_data["other"].get("text_qsar_questions_intro", "")],
        ["Inglese (en)", db_data["other"].get("text_qsar_conclusion__en", ""), db_data["other"].get("text_qsar_questions_intro__en", "")],
        ["Tedesco (de)", db_data["other"].get("text_qsar_conclusion__de", ""), db_data["other"].get("text_qsar_questions_intro__de", "")],
        ["Spagnolo (es)", db_data["other"].get("text_qsar_conclusion__es", ""), db_data["other"].get("text_qsar_questions_intro__es", "")],
        ["Francese (fr)", db_data["other"].get("text_qsar_conclusion__fr", ""), db_data["other"].get("text_qsar_questions_intro__fr", "")],
        ["Svedese (sv)", db_data["other"].get("text_qsar_conclusion__sv", ""), db_data["other"].get("text_qsar_questions_intro__sv", "")]
    ]
    add_styled_table(doc, lang_headers, lang_rows, col_widths=[1.2, 2.7, 2.8])

    # ==========================================
    # CAPITOLO 7: CATALOGO STRATEGIE CERTIFICATE
    # ==========================================
    add_heading_1(doc, "7. Catalogo Completo delle Strategie Certificate QSA/QSAr (23 Strategie)")
    add_p(doc, (
        "Uno dei principi architetturali più rigorosi di CounselorBot è il rifiuto categorico dei consigli 'allucinati' o generici. "
        "Quando un turno di secondo livello o un follow-up richiede un consiglio pratico, il sistema interroga il catalogo delle "
        "Strategie Certificate (tabella 'certified_strategies' e seed 'certified_strategy_seed.py'). "
        "Nel prompt viene iniettata una scheda operativa dettagliata contenente l'obiettivo, i passaggi pratici e le evidenze scientifiche. "
        "Di seguito è riportata la matrice completa delle 23 strategie certificate reali disponibili per QSA e QSAr:"
    ))

    strat_headers = ["N.", "Titolo della Strategia", "Fattori Target", "Condizione di Innesco (Quando)", "Azione Operativa (Cosa)"]
    strat_rows = []
    for idx, st in enumerate(strategies, 1):
        strat_rows.append([
            str(idx),
            st["title"],
            st["factors"],
            st["when"],
            st["what"]
        ])
    add_styled_table(doc, strat_headers, strat_rows, col_widths=[0.4, 1.6, 1.0, 1.7, 2.0])

    add_heading_2(doc, "7.1 Meccanismo di Iniezione Deterministica nel Prompt")
    add_p(doc, (
        "La funzione 'certified_strategy_memory.retrieve()' ('backend/certified_strategy_memory.py') implementa il matching psicometrico:"
    ))
    add_bullet(doc, "Verifica quali fattori dello step corrente presentano un punteggio corrispondente a un'area di miglioramento (tenendo conto delle inversioni);", bold_prefix="1. ")
    add_bullet(doc, "Filtra il catalogo delle strategie escludendo quelle già raccomandate nella stessa sessione (previous_certified_strategy_ids);", bold_prefix="2. ")
    add_bullet(doc, "Seleziona la strategia con la massima pertinenza semantica e psicometrica rispetto al profilo dello studente;", bold_prefix="3. ")
    add_bullet(doc, "Formatta la strategia selezionata all'interno del blocco [KNOWLEDGE] del System Prompt;", bold_prefix="4. ")
    add_bullet(doc, "Invia l'id della strategia alla whitelist dei candidati: solo se il modello linguistico include effettivamente la strategia nella sua risposta, essa viene registrata come 'raccomandata' e resa visibile nella sidebar.", bold_prefix="5. ")

    # ==========================================
    # CAPITOLO 8: CATALOGO CULTURALE
    # ==========================================
    add_heading_1(doc, "8. Catalogo Multimediale di Approfondimento Culturale (Libri, Articoli, Film, Video)")
    add_p(doc, (
        "In piena coerenza con la teoria di Pellerey sulla Trascendenza e sull'Identità Narrativa, CounselorBot integra un ricco "
        "catalogo culturale di opere letterarie, saggi di psicologia cognitiva, articoli scientifici peer-reviewed, pellicole cinematografiche "
        "d'autore e video formativi (TED Talks). Queste risorse non sono meri elenchi bibliografici, ma potenti strumenti di mediazione "
        "simbolica ed esistenziale che permettono allo studente di rispecchiare le proprie sfide di apprendimento nelle storie di personaggi reali o fittizi."
    ))

    # 8.1 Saggi e Libri
    add_heading_2(doc, f"8.1 Saggi e Libri Scientifico-Divulgativi ({len(catalog['saggi'])})")
    saggi_headers = ["Titolo & Autore (Anno)", "Editore / Produzione", "Fattori Collegati", "Tema Pedagogico & Trama"]
    saggi_rows = []
    for s in catalog["saggi"]:
        saggi_rows.append([s["header"], s["publisher"], s["factors"], s["theme"]])
    add_styled_table(doc, saggi_headers, saggi_rows, col_widths=[2.1, 1.3, 1.1, 2.2])

    # 8.2 Articoli Scientifici
    add_heading_2(doc, f"8.2 Articoli Scientifici Peer-Reviewed ({len(catalog['articoli'])})")
    art_headers = ["Titolo & Autori", "Rivista Accademica", "Fattori Collegati", "Contenuto della Ricerca"]
    art_rows = []
    for a in catalog["articoli"]:
        art_rows.append([a["header"], a["publisher"], a["factors"], a["theme"]])
    add_styled_table(doc, art_headers, art_rows, col_widths=[2.4, 1.4, 1.0, 1.9])

    # 8.3 Opere di Narrativa
    add_heading_2(doc, f"8.3 Opere di Narrativa e Romanzi ({len(catalog['narrativa'])})")
    narr_headers = ["Titolo & Autore (Anno)", "Editore", "Fattori Collegati", "Trama e Spunto Riflessivo"]
    narr_rows = []
    for n in catalog["narrativa"]:
        narr_rows.append([n["header"], n["publisher"], n["factors"], n["theme"]])
    add_styled_table(doc, narr_headers, narr_rows, col_widths=[2.1, 1.2, 1.1, 2.3])

    # 8.4 Film d'Autore
    add_heading_2(doc, f"8.4 Film d'Autore e Cinema Educativo ({len(catalog['film'])})")
    film_headers = ["Titolo Film & Regista (Anno)", "Produzione", "Fattori Collegati", "Tema Chiave & Trama"]
    film_rows = []
    for flm in catalog["film"]:
        film_rows.append([flm["header"], flm["publisher"], flm["factors"], flm["theme"]])
    add_styled_table(doc, film_headers, film_rows, col_widths=[2.1, 1.2, 1.1, 2.3])

    # 8.5 Video e Documentari
    add_heading_2(doc, f"8.5 Video Formativi (TED Talks) e Documentari ({len(catalog['video']) + len(catalog['documentari'])})")
    vid_headers = ["Titolo & Autore (Anno)", "Canale / Produzione", "Fattori Collegati", "Argomento Chiave"]
    vid_rows = []
    for v in catalog["video"]:
        vid_rows.append([v["header"], v["publisher"], v["factors"], v["theme"]])
    for d in catalog["documentari"]:
        vid_rows.append([d["header"], d["publisher"], d["factors"], d["theme"]])
    add_styled_table(doc, vid_headers, vid_rows, col_widths=[2.1, 1.2, 1.1, 2.3])

    # ==========================================
    # CAPITOLO 9: BEST PRACTICES E CONCLUSIONI
    # ==========================================
    add_heading_1(doc, "9. Linee Guida di Prompt Engineering e Conclusioni")
    add_p(doc, (
        "L'esperienza progettuale e sperimentale di CounselorBot dimostra che l'efficacia di un assistente di intelligenza artificiale "
        "nel counselling pedagogico non dipende dalla 'grandezza' o 'creatività' del modello generativo, ma dal rigore con cui "
        "l'architettura del sistema governa e vincola il prompt. Alcune linee guida fondamentali emergono come canoni imprescindibili:"
    ))
    add_bullet(doc, (
        "Separazione tra Logica Deterministica e Linguaggio Probabilistico: i calcoli psicometrici, le inversioni dei punteggi, "
        "le regole di abilitazione dei consigli e lo scoping dei fattori devono essere eseguiti determinamente in Python prima "
        "della chiamata LLM. L'LLM deve ricevere 'fatti già calcolati' e concentrarsi unicamente sulla maieutica conversazionale."
    ), bold_prefix="1. ")
    add_bullet(doc, (
        "Prevenzione del Sovraccarico Cognitivo (Cognitive Load Theory): dispensare troppi consigli blocca l'azione dello studente. "
        "La regola 'massimo 1 consiglio per turno, e zero consigli nell'intro e nei fattori singoli' protegge l'efficacia dell'intervento."
    ), bold_prefix="2. ")
    add_bullet(doc, (
        "Scaffolding Riflessivo Prima della Prescrizione: in educazione, un consiglio non richiesto viene ignorato. "
        "Imporre che la domanda riflessiva ([ANCHOR] o [SECOND-LEVEL METHOD]) preceda sempre l'azione garantisce che lo studente "
        "abbia interiorizzato il senso del problema prima di tentare di risolverlo."
    ), bold_prefix="3. ")
    add_bullet(doc, (
        "Sicurezza Psicologica e Non-Clinicità: vietare assolutamente diagnosi psichiatriche o etichette fisse ('sei demotivato', 'sei ansioso'). "
        "Il modello deve parlare sempre di comportamenti e abitudini osservabili in uno specifico momento di studio, suscettibili di trasformazione."
    ), bold_prefix="4. ")

    # Salvataggio del Documento
    doc.save(OUTPUT_DOCX_PATH)
    print(f"Documento generato con successo e salvato in: {OUTPUT_DOCX_PATH}")

if __name__ == "__main__":
    build_qsa_document()
