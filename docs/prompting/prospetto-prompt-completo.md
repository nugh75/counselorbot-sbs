# Prospetto completo dei prompt di CounselorBot

**Data di riferimento:** 31 ottobre 2026  
**Perimetro:** tutti i testi che, a vario titolo, entrano in un prompt dell'applicazione:
chat guidate, assistente del sito, Bussola, pQBL, sintesi, traduzioni, OCR e servizi
interni.  
**Natura del documento:** inventario **strutturale**. Descrive chiavi, ruoli,
destinazioni, composizione ed ereditarietà; **non** duplica integralmente i testi.
I testi completi restano disponibili nella Mappa dei prompt dell'admin, nell'export
e nel database (vedi §0.3).

> Documento collegato: [`qsa-prompt-quadro.md`](qsa-prompt-quadro.md) per il
> dettaglio del percorso QSA; [`../operations/admin-prompt-map.md`](../operations/admin-prompt-map.md)
> per la Mappa dei prompt; [`../operations/prompt-factory-alignment.md`](../operations/prompt-factory-alignment.md)
> per il perimetro di fabbrica.

---

## 0. Legenda e fonti

### 0.1 Simboli

| Simbolo | Significato |
|---------|-------------|
| ⚙️ | Testo di configurazione: vive in `configs` (o `guided_steps.prompt`), è modificabile dall'admin |
| 🤖 | Istruzione inviata al modello |
| 👤 | Testo mostrato allo studente/docente |
| 🧩 | Blocco costruito a runtime dal codice, non modificabile come testo unico |
| 🗄️ | Dato letto dal database (taccuino, punteggi, step, counselor, ecc.) |
| 🔒 | Blocco privato: il modello lo produce, il server lo rimuove prima di mostrarlo |
| 📌 | Marcatore tecnico interpretato dal client o dal server |

### 0.2 Convenzioni delle chiavi

| Prefisso / forma | Famiglia | Esempio |
|------------------|----------|---------|
| `prompt_*` | System prompt di modalità, prompt di fase, prompt di strumento | `prompt_factor`, `prompt_intro`, `prompt_qpcc_interview` |
| `prompt_meta_<STRUMENTO>` | Meta system prompt base dello strumento | `prompt_meta_ZTPI` |
| `prompt_meta_<STRUMENTO>_<STEP>` | Meta system prompt specifico dello step | `prompt_meta_QSA_cognitive` |
| `directive_*` | Direttiva globale, iniettata in testa al system prompt | `directive_language` |
| `text_*` | Testo statico di fase o messaggio UI | `text_ztpi_conclusion` |
| `label_*` | Etichetta UI di fase fissa | `label_guided_questions` |
| `site_chat_*` | Assistente del sito: contesto, scheda, parametri di retrieval | `site_chat_knowledge_card` |
| `counselorbot_chat_*`, `framework_chat_context`, `questionari_chat_context` | Contesti delle collezioni dell'assistente | `counselorbot_chat_context` |
| `pqbl_*` | pQBL: prompt, onboarding, modello | `pqbl_question_generation_prompt` |
| `guided_steps.prompt` | Istruzione dello step guidato (colonna DB, non chiave `configs`) | `cognitive`, `qsar-synthesis` |

### 0.3 Dove si vedono e si modificano i testi completi

| Luogo | Cosa mostra | Uso |
|-------|-------------|-----|
| **Amministrazione → Configurazione → Mappa dei prompt** (`/admin?section=prompt-map`) | Tutti i testi delle chat guidate, dal comune allo step, con livello, destinazione, token, varianti Totale/Ristretto/Minimo e storico | Lettura e modifica guidata |
| **`GET /admin/guided-steps/export`** | Export completo di step e testi | Backup, audit, diff |
| **Tabella `configs`** | Valori live delle chiavi `prompt_*`, `directive_*`, `text_*`, `site_chat_*`, `pqbl_*` | Ispezione SQL |
| **Tabella `guided_steps`** | `prompt`, `system_prompt_mode`, `label`, `sort_order` per strumento | Ispezione SQL |
| **`backend/prompts/*.md`** | Sorgenti di fabbrica (105 file) letti da `prompt_config._text` | Manutenzione del codice |
| **`backend/prompt_config.py`** | Registro delle 131 definizioni e degli 101 step di default | Fonte autorevole dei default |
| **`prompt_revisions`** | Storico di ogni salvataggio, con origine (`seed`, `migration`, `admin`) | Audit e ripristino |

> **Regola d'oro:** il DB è la copia viva usata a runtime. I default di
> `prompt_config.py` vengono seminati all'avvio e **non sovrascrivono** mai una
> riga già presente. Un testo personalizzato dall'admin resta tale anche dopo un
> aggiornamento dei default, finché non lo si allinea esplicitamente.

### 0.4 I numeri di questo prospetto

| Grandezza | Valore | Fonte |
|-----------|--------|-------|
| Definizioni in `ALL_CONFIG_TEXT_DEFINITIONS` | **131** | `backend/prompt_config.py` |
| System prompt di modalità | **34** | `SYSTEM_PROMPT_DEFINITIONS` |
| Meta system prompt | **35** | `META_SYSTEM_PROMPT_DEFINITIONS` |
| Direttive globali | **6** | `GLOBAL_DIRECTIVE_DEFINITIONS` |
| Placeholder | **1** | `PLACEHOLDER_DEFINITIONS` |
| Prompt di fase guidata | **12** | `GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS` |
| Testi statici guidati | **23** | `GUIDED_STATIC_TEXT_DEFINITIONS` |
| Etichette fisse | **2** | `GUIDED_FIXED_PHASE_LABEL_DEFINITIONS` |
| Assistente del sito | **10** | `SITE_CHAT_CONFIG_DEFINITIONS` |
| CounselorBot Chat | **3** | `COUNSELORBOT_CHAT_CONFIG_DEFINITIONS` |
| Framework Chat | **1** | `FRAMEWORK_CHAT_CONFIG_DEFINITIONS` |
| Questionari Chat | **1** | `QUESTIONARI_CHAT_CONFIG_DEFINITIONS` |
| pQBL | **3** | `PQBL_CONFIG_DEFINITIONS` |
| Strumenti guidati | **12** | `INSTRUMENT_ORDER` + `IDEA` |
| Step guidati | **101** | `DEFAULT_*_GUIDED_STEPS` |
| Fasi essenziali virtuali | **13** | `backend/qsa_essential.py` |
| Skill del motore | **9** | `backend/skills_seed.py` |
| Testi nel perimetro di fabbrica | **97 config + 101 step** | `prompt_factory_alignment.factory_catalog()` |

> La documentazione di `prompt-factory-alignment.md` cita **93** configurazioni
> «al momento dell'introduzione»: il registro è cresciuto nel tempo. Il numero
> verificato oggi nel codice è **97**.

---

## 1. Struttura generale

### 1.1 Mappa delle famiglie di prompt

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                        COUNSELORBOT — I PROMPT                              │
└──────────────────────────────────────────────────────────────────────────────┘

  131 TESTI CONFIGURATI                          101 STEP GUIDATI
  (configs + guided_steps)                       (guided_steps.prompt)
            │                                              │
            ├──────────────┬──────────────┐                │
            ▼              ▼              ▼                ▼
   ┌────────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
   │ CHAT GUIDATE   │ │ ASSISTENTE   │ │ ALTRE        │ │ 9 SKILL          │
   │ 12 strumenti   │ │ DEL SITO     │ │ SUPERFICI AI │ │ (motore runtime) │
   │                │ │ 4 collezioni │ │              │ │                  │
   │ system prompt  │ │ + dinamiche  │ │ Bussola      │ │ certified-advice │
   │ meta prompt    │ │              │ │ pQBL         │ │ profile-wayfinder│
   │ prompt di fase │ │ prompt       │ │ sintesi      │ │ reading-guide    │
   │ testi statici  │ │ docente/     │ │ cross        │ │ profile-comparison│
   │ direttive      │ │ studente     │ │ sintesi Idea │ │ web-lookup       │
   │                │ │ contesti     │ │ traduzioni   │ │ concept-diagram  │
   │                │ │ parametri    │ │ OCR          │ │ idea-focus       │
   │                │ │ RAG          │ │ bozza        │ │ referral-guide   │
   │                │ │              │ │ orientativa  │ │                  │
   └───────┬────────┘ └──────┬───────┘ └──────┬───────┘ └────────┬─────────┘
           │                 │                │                  │
           ▼                 ▼                ▼                  ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │                        COMPOSIZIONE DEL TURNO                       │
   │  prepare_chat_turn → build_context_envelope → AI service → post-processing │
   └─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Le quattro famiglie, in breve

| Famiglia | Cosa contiene | Dove vive | Modificabile da admin |
|----------|---------------|-----------|-----------------------|
| **Chat guidate** | System prompt di modalità, meta prompt, prompt di fase, testi statici, istruzioni dei 101 step, direttive globali | `configs`, `guided_steps` | Sì, dalla Mappa dei prompt |
| **Assistente del sito** | Prompt docente/studente per 4 collezioni, contesti di collezione, scheda strumenti, parametri di retrieval | `configs` | Sì, dalla scheda Configurazione |
| **Bussola / Compass** | Un unico system prompt inline con catalogo strumenti, contesto piattaforma, taccuino, history e contratto JSON | `backend/orientation.py` | No (codice) |
| **Servizi AI** | pQBL, sintesi cross-strumento, sintesi Idea, traduzioni, OCR/estrazione, bozza consiglio orientativo, teacher noticing, journey evidence | `configs` o codice | In parte |

### 1.3 Pipeline di un turno guidato

```text
┌─────────────┐
│   CLIENT    │  POST /api/chat (o /api/chat/stream)
│  (browser)  │  mode, phase, questionnaire_type, scores_context,
└──────┬──────┘  message, language, counselor_id, response_length, ...
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ ROUTES / CHAT                                                              │
│  • risolve lo step (`guided_steps.id = phase`)                             │
│  • normalizza mode e phase; applica alias e override                       │
│  • valida il percorso (completo / essenziale)                              │
│  • sceglie il system prompt di modalità o di fase                          │
│  • applica le direttive globali                                            │
│  • decide i componenti del contesto (punteggi, RAG, skill, profilo, ...)   │
└──────┬──────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ CHAT_PREPARATION.prepare_chat_turn                                         │
│  1. prompt dello step (solo all'ingresso, `use_phase_prompt`)              │
│  2. persona del counselor                                                  │
│  3. system prompt di modalità                                              │
│  4. meta system prompt (step → strumento)                                  │
│  5. retrieval RAG + skill + punteggi                                       │
│  6. contratti runtime (turno, facilitazione, obiettivo, QPCC, ...)         │
└──────┬──────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ BUILD_CONTEXT_ENVELOPE                                                     │
│  SYSTEM  = [STEP] [PERSONA] [SYSTEM] [META] [ROLE] [STUDENT] ...           │
│  MESSAGES = history verbatim + turno utente corrente                       │
└──────┬──────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ AI SERVICE                                                                 │
│  provider/modello attivo, preset, reasoning, token, privacy gateway        │
└──────┬──────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ POST-PROCESSING                                                            │
│  • estrae e rimuove i blocchi privati (```booklet, ```goal, ```idea)       │
│  • interpreta i marcatori [[AVANZA_STEP]], [[TORNA_AL_PERCORSO]], ...      │
│  • applica il formato visibile e la lunghezza scelta                       │
│  • salva history, log, revisioni                                           │
└──────┬──────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────┐
│   CLIENT    │  testo visibile + eventuale bozza + stato navigazione
└─────────────┘
```

### 1.4 L'envelope del system prompt, nell'ordine effettivo

L'ordine è quello prodotto da `build_context_envelope` e completato da
`prepare_chat_turn`. I blocchi in maiuscolo sono sentinelle lette dal modello;
non sono mostrate allo studente.

```text
system_prompt_final
│
├─ 01  [STEP PROMPT]                  🤖 ⚙️  guided_steps.prompt
│                                        solo al turno di ingresso nello step
│                                        (o `use_phase_prompt`), non nei follow-up
│
├─ 02  [PERSONA]                      🤖 🗄️  counselors.persona
│                                        + "{{counselor_name}}" risolto
│
├─ 03  SYSTEM PROMPT                  🤖 ⚙️  prompt_* di modalità
│                                        già attraversato da:
│                                        [ORIENTATION] [CONTEXT] [LANGUAGE]
│                                        [REGISTER] [THINKING] [AFFIRMATIVE]
│                                        [PLATFORM CAPABILITIES]
│                                        [RESPONSE LENGTH - BINDING]
│                                        [FACTOR LABELS] [INTERPRETATION TABLE]
│                                        [CURRENT STEP FACTORS]
│                                        [CURRENT STEP SCORE PROFILE]
│
├─ 04  [META SYSTEM PROMPT]           🤖 ⚙️  prompt_meta_<STRUMENTO>[_<STEP>]
│
├─ 05  [ROLE]                         🧩  prompt_contract.ROLE_BLOCK
│
├─ 06  [SECTION]                      🧩  slot "section" delle skill (raro)
│
├─ 07  [STUDENT]                      🧩 🗄️  codice anonimo, lingua, questionario,
│                                        step corrente, step completati, obiettivi,
│                                        preferenze, note condivise
│
├─ 08  [GUIDED PATH]                  🧩 🗄️  elenco step, corrente/prossimo,
│                                        regole di avanzamento, [[AVANZA_STEP]]
│
├─ 09  [SIMULATION]                   🧩  avviso "studente simulato" (taccuino di prova)
│
├─ 10  [PROFILE]                      🧩 🗄️  taccuino, portfolio, obiettivi,
│                                        punteggi di riferimento della sessione
│
├─ 11  [CONTESTO CLASSE]              🗄️  testo condiviso dal docente
│
├─ 12  [READING]                      🗄️  letture dello studente
│
├─ 13  [IDEA REFERENCE]               🗄️  solo IDEA: documento privato scelto
│
├─ 14  [IDEA SOURCES]                 🗄️  solo IDEA: fonti del ramo a fuoco
│
├─ 15  [IDEA MAP]                     🗄️  solo IDEA: mappa corrente + PACE
│
├─ 16  [KNOWLEDGE]                    🧩  RAG + materiale delle skill
│                                        [SOURCE n], [CERTIFIED_READINGS],
│                                        [READING_SOURCES], [WEB_SOURCES]
│
├─ 17  directive_tail                 🧩  contratti delle skill
│
├─ 18  [JOURNEY EVIDENCE]             🧩  solo sintesi: evidenze cronologiche
│      [PERSPECTIVE]                      + aggancio al progetto di vita
│
├─ 19  [SESSION LEDGER]               🧩  solo ingresso step: risposte, azioni,
│                                        domanda aperta, step ripetuti
│
├─ 20  [THREAD GUARD]                 🧩  note del guardiano del filo
│      [REFLECTION THREAD]                + filo riflessivo dello step
│
├─ 21  [TURN CONTRACT]                🧩  prompt_contract.turn_contract
│                                        (o [FREE CHAT CONTRACT])
│
├─ 22  [CANONICAL QPCC CONTRACT]      🧩  solo QPCC
│
├─ 23  [STEP DIRECTION CHOICE]        🧩  ogni N scambi: continua o torna al percorso
│
├─ 24  [ESSENTIAL SESSION EVIDENCE]   🧩  solo percorso essenziale
│      direttiva essenziale
│
├─ 25  [GUIDED EXPLORATION]           🧩  ramo opzionale attivo
│
├─ 26  [VISIBLE RESPONSE FORMAT]      🧩  prosa / elenco puntato
│
└─ 27  [SESSION NOTES]                🧩  note di sessione e JSON già proposti
```

> **Nota:** i blocchi 01–04 sono il "prefisso editabile" della Mappa dei prompt;
> 05–27 sono costruiti dal codice o dai dati. La Mappa mostra i primi quattro e,
> per ogni step, le componenti del contesto e le skill agganciate.

### 1.5 Il turno utente e la history

```text
full_message
│
├─ turno di analisi (ingresso step)
│    └─ "PROFILO QSA DELLO STUDENTE: C1 ...: 7/9 (…); A1 ...: 3/9 (…)"
│       (il prompt dello step è già in cima al system)
│
├─ turno libero dentro uno step
│    └─ "<punteggi scope-ati>\n\nDOMANDA DELLO STUDENTE:\n<testo>"
│
├─ ingresso step QPCS / IDEA
│    └─ solo punteggi, oppure il testo dello step (niente domanda)
│
└─ chat libera
     └─ solo il messaggio dello studente

history
│
└─ messaggi verbatim della sessione, con marcatori tipo
   "[Avvio analisi: 2. Fattori Affettivi]"
```

### 1.6 I quattro livelli della Mappa dei prompt

```text
                         ┌──────────────────────────────┐
                         │ 1. COMUNE                    │
                         │ testi usati da tutte le      │
                         │ chat guidate                 │
                         │ es. prompt_guided_questions, │
                         │ direttive globali            │
                         └──────────────┬───────────────┘
                                        │ ereditato
                         ┌──────────────▼───────────────┐
                         │ 2. GRUPPO                    │
                         │ testi condivisi da più       │
                         │ strumenti                    │
                         │ es. prompt_strategies (6),   │
                         │ prompt_evento_interview (2)  │
                         └──────────────┬───────────────┘
                                        │ ereditato
                         ┌──────────────▼───────────────┐
                         │ 3. STRUMENTO                 │
                         │ testi propri: intro, meta    │
                         │ base, testi di fase          │
                         └──────────────┬───────────────┘
                                        │ ereditato
                         ┌──────────────▼───────────────┐
                         │ 4. STEP                      │
                         │ prompt dello step, meta      │
                         │ specifico, componenti, note  │
                         └──────────────────────────────┘
```

Il livello non è dichiarato a mano: `backend/prompt_map.py` lo calcola contando
gli strumenti e gli step che usano una chiave. Una chiave usata da tutti è
*comune*; da più strumenti è di *gruppo*; da più step dello stesso strumento, o
propria dello strumento, è di *strumento*; altrimenti è di *step*.

### 1.7 Come la chat sceglie il system prompt

```text
_system_prompt_key(mode, phase, step)
│
├─ phase ∈ GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS ?
│     │
│     ├─ sì → prompt di fase
│     │        es. phase="intro"        → prompt_intro
│     │            phase="questions"    → prompt_guided_questions
│     │            phase="qpcs-intro"   → prompt_qpcs_welcome
│     │
│     └─ no ↓
│
├─ step presente e mode non conversazionale ?
│     │
│     ├─ step.system_prompt_mode inizia con "prompt_" ?
│     │     └─ sì → quella chiave
│     │
│     └─ altrimenti → MODE_TO_SYSTEM_PROMPT_KEY[step.system_prompt_mode]
│
├─ mode inizia con "prompt_" → quella chiave
│
└─ altrimenti → MODE_TO_SYSTEM_PROMPT_KEY.get(mode, "prompt_generic")
```

Esempi:

| `mode` | Chiave risolta |
|--------|----------------|
| `factor` | `prompt_factor` |
| `second-level` | `prompt_second_level` |
| `factor-qa` | `prompt_factor_qa` |
| `qsar-factor` | `prompt_qsar_factor` |
| `qsar-second-level` | `prompt_qsar_second_level` |
| `ztpi-factor` | `prompt_ztpi_factor` |
| `savickas-interview` | `prompt_savickas_interview` |
| `evento-interview` | `prompt_evento_interview` |
| `obiettivo-interview` | `prompt_obiettivo_interview` |
| `qpcs-analysis` | `prompt_qpcs_analysis` |
| `qpcc-interview` | `prompt_qpcc_interview` |
| `qap-interview` | `prompt_qap_interview` |
| `strategies` | `prompt_strategies` |
| `idea-focus` | `prompt_idea_focus` |
| `free` | `prompt_free_chat` |
| assente / sconosciuto | `prompt_generic` |

### 1.8 Come la chat sceglie il meta prompt

```text
meta effettivo
│
├─ prompt_meta_<STRUMENTO>_<STEP>   se esiste ed è non vuoto
│     es. prompt_meta_QSA_cognitive
│
├─ altrimenti prompt_meta_<STRUMENTO>   se esiste
│     es. prompt_meta_ZTPI
│
└─ altrimenti nessun blocco [META SYSTEM PROMPT]
```

Conseguenze pratiche:

- **QSA** e **QSAr** hanno un meta specifico per quasi tutti gli step; il meta
  base è vuoto.
- **ZTPI** ha il meta base per T1–T4 e specifici per intro, T5 e BTP.
- **SAVICKAS** ha il meta base per patto e Q1–Q5, specifici per intro e sintesi.
- **EVENTO_STUDIO** e **EVENTO_PROFESSIONALE** usano un solo meta base ciascuno.
- **OBIETTIVO_STUDIO**, **OBIETTIVO_DOCENZA** e **IDEA** non hanno meta prompt.
- **QPCS**, **QPCC**, **QAP** usano un solo meta base ciascuno.

### 1.9 Eredità e override in un colpo d'occhio

```text
                        ┌─────────────────────────┐
                        │ DEFAULT DI FABBRICA     │
                        │ backend/prompts/*.md    │
                        │ prompt_config.py        │
                        └───────────┬─────────────┘
                                    │ seed all'avvio
                                    │ (solo se la riga manca)
                                    ▼
                        ┌─────────────────────────┐
                        │ DB: configs             │
                        │     guided_steps        │
                        │     prompt_revisions    │
                        └───────────┬─────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
      ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
      │ Admin:        │     │ Varianti      │     │ Runtime:      │
      │ Mappa prompt  │     │ Totale /      │     │ contratti,    │
      │ Config, step  │     │ Ristretto /   │     │ skill, RAG,   │
      │ Counselor     │     │ Minimo        │     │ punteggi      │
      └───────────────┘     └───────────────┘     └───────────────┘
```

Regole:

1. Il default è solo un **punto di partenza**: non sovrascrive mai una riga DB.
2. L'admin modifica un testo in **un solo posto**, al livello a cui appartiene.
3. Ai livelli inferiori il testo compare come **ereditato** (in grigio), con
   link al livello giusto.
4. Vuoto, nei campi delle varianti, significa **eredita il Totale**.
5. Un salvataggio admin acquisisce la proprietà del testo: l'allineamento di
   fabbrica non lo sostituisce più, salvo i casi forzati documentati.
6. I testi di fase `text_*` sono tradotti in sei lingue; i testi del modello
   restano in inglese.

---

## 2. Inventario completo dei 131 testi config

### 2.1 System prompt di modalità (34)

Sono i prompt che definiscono il comportamento del modello in una modalità o in
un turno. La colonna **Uso** indica dove la chiave viene risolta.

| # | Chiave | Etichetta | Uso |
|---|--------|-----------|-----|
| 1 | `prompt_factor` | Prompt Analisi Fattori | QSA, step `factor` (cognitive, affective) |
| 2 | `prompt_second_level` | Prompt Secondo Livello | QSA, step `second-level` (3.1–3.7) |
| 3 | `prompt_strategies` | Prompt Strategie e consigli | QSA, QSAr, ZTPI, QPCS, QPCC, QAP (step `strategies`) |
| 4 | `prompt_free_chat` | Prompt Chat libera | Chat libera (`mode=free`, #754) |
| 5 | `prompt_free_chat_contract` | Contratto di turno Chat libera | Contratto della chat libera, al posto di `[TURN CONTRACT]` |
| 6 | `prompt_factor_qa` | Prompt Domanda di Approfondimento (in-step) | Follow-up QSA dentro uno step (`factor-qa`) |
| 7 | `prompt_generic` | Prompt Chat Generica | Fallback e chat generica |
| 8 | `prompt_qsar_factor` | Prompt QSAr Analisi Fattori | QSAr, step `qsar-factor` |
| 9 | `prompt_qsar_second_level` | Prompt QSAr Secondo Livello | QSAr, step `qsar-second-level` |
| 10 | `prompt_qsar_factor_qa` | Prompt QSAr Domanda di Approfondimento | Follow-up QSAr (`qsar-factor-qa`) |
| 11 | `prompt_qsar_generic` | Prompt QSAr Chat Generica | QSAr, chat generica |
| 12 | `prompt_cross_synthesis` | Prompt Sintesi Cross-Strumento | `POST /user/cross-synthesis` |
| 13 | `prompt_ztpi_factor` | Prompt ZTPI Analisi Fattori | ZTPI, T1–T5 |
| 14 | `prompt_ztpi_btp` | Prompt ZTPI Profilo Temporale Bilanciato | ZTPI, step `ztpi-btp` |
| 15 | `prompt_savickas_interview` | Prompt Savickas Intervista | SAVICKAS, patto + Q1–Q5 |
| 16 | `prompt_idea_focus` | Prompt Idea | IDEA, tutti gli step |
| 17 | `prompt_idea_variant_student_path` | Idea - variante percorso di studio | Variante Idea «percorso di studio» |
| 18 | `prompt_idea_variant_student_open` | Idea - variante idea libera | Variante Idea «idea libera» |
| 19 | `prompt_idea_variant_research` | Idea - variante ricerca e didattica | Variante Idea «ricerca e didattica» |
| 20 | `prompt_idea_variant_concept` | Idea - variante concetto o costrutto | Variante Idea «concetto o costrutto» |
| 21 | `prompt_savickas_summary` | Prompt Savickas Sintesi Finale | SAVICKAS, step `savickas-final` |
| 22 | `prompt_evento_interview` | Prompt Evento significativo Intervista | EVENTO_STUDIO / EVENTO_PROFESSIONALE, patto–prossima |
| 23 | `prompt_evento_summary` | Prompt Evento significativo Sintesi Finale | EVENTO_*, step finale |
| 24 | `prompt_obiettivo_interview` | Prompt Obiettivo di apprendimento Conversazione | OBIETTIVO_STUDIO / OBIETTIVO_DOCENZA, step 1–4 |
| 25 | `prompt_obiettivo_summary` | Prompt Obiettivo di apprendimento Sintesi Finale | OBIETTIVO_*, step finale |
| 26 | `prompt_qpcs_factor` | Prompt QPCS Analisi Fattori | QPCS, `qpcs-profilo` |
| 27 | `prompt_qpcs_analysis` | Prompt QPCS Analisi Risultati | QPCS, aree 2–6 |
| 28 | `prompt_qpcs_summary` | Prompt QPCS Sintesi Finale | QPCS, `qpcs-sintesi` |
| 29 | `prompt_qpcc_factor` | Prompt QPCC Analisi Fattori | QPCC, `qpcc-profilo` |
| 30 | `prompt_qpcc_interview` | Prompt QPCC Intervista | QPCC, aree 2–6 |
| 31 | `prompt_qpcc_summary` | Prompt QPCC Sintesi Finale | QPCC, `qpcc-sintesi` |
| 32 | `prompt_qap_factor` | Prompt QAP Analisi Fattori | QAP, `qap-profilo` |
| 33 | `prompt_qap_interview` | Prompt QAP Intervista | QAP, aree 2–5 |
| 34 | `prompt_qap_summary` | Prompt QAP Sintesi Finale | QAP, `qap-sintesi` |

> L'ordine della tabella è logico, non quello del registro: in
> `SYSTEM_PROMPT_DEFINITIONS` le chiavi QPCC/QAP sono intercalate.

### 2.2 Meta system prompt (35)

Sono i blocchi `[META SYSTEM PROMPT]`: contesto teorico e istruzioni di lettura
specifiche dello strumento o dello step. Il meta di step, se presente, vince su
quello base.

| # | Chiave | Etichetta | Dove si applica |
|---|--------|-----------|-----------------|
| 1 | `prompt_meta_QSA` | Meta system prompt QSA | Base QSA (vuoto: contano i meta di step) |
| 2 | `prompt_meta_QSA_intro` | QSA Intro - Contesto Pellerey | QSA `intro` |
| 3 | `prompt_meta_QSA_cognitive` | QSA Cognitive - Contesto Pellerey | QSA `cognitive` |
| 4 | `prompt_meta_QSA_affective` | QSA Affective - Contesto Pellerey | QSA `affective` |
| 5 | `prompt_meta_QSA_sl-elaboration` | QSA Elaboration - Contesto Pellerey | QSA `sl-elaboration` |
| 6 | `prompt_meta_QSA_sl-selfcontrol` | QSA Self-control - Contesto Pellerey | QSA `sl-selfcontrol` |
| 7 | `prompt_meta_QSA_sl-motivation` | QSA Motivation - Contesto Pellerey | QSA `sl-motivation` |
| 8 | `prompt_meta_QSA_sl-emotions` | QSA Emotions - Contesto Pellerey | QSA `sl-emotions` |
| 9 | `prompt_meta_QSA_sl-attribution` | QSA Attribution - Contesto Pellerey | QSA `sl-attribution` |
| 10 | `prompt_meta_QSA_sl-social` | QSA Social - Contesto Pellerey | QSA `sl-social` |
| 11 | `prompt_meta_QSA_sl-synthesis` | QSA Synthesis - Contesto Pellerey | QSA `sl-synthesis` |
| 12 | `prompt_meta_QSA_sl-strategies` | QSA Strategie e consigli - Contesto Pellerey | QSA `sl-strategies` |
| 13 | `prompt_meta_QSAR` | Meta system prompt QSAr | Base QSAr (vuoto) |
| 14 | `prompt_meta_QSAR_qsar-intro` | QSAr Intro - Contesto Pellerey | QSAr `qsar-intro` |
| 15 | `prompt_meta_QSAR_qsar-cognitive` | QSAr Cognitive - Contesto Pellerey | QSAr `qsar-cognitive` |
| 16 | `prompt_meta_QSAR_qsar-affective` | QSAr Affective - Contesto Pellerey | QSAr `qsar-affective` |
| 17 | `prompt_meta_QSAR_qsar-processing` | QSAr Processing - Contesto Pellerey | QSAr `qsar-processing` |
| 18 | `prompt_meta_QSAR_qsar-selfcontrol` | QSAr Self-control - Contesto Pellerey | QSAr `qsar-selfcontrol` |
| 19 | `prompt_meta_QSAR_qsar-motivation` | QSAr Motivation - Contesto Pellerey | QSAr `qsar-motivation` |
| 20 | `prompt_meta_QSAR_qsar-emotions` | QSAr Emotions - Contesto Pellerey | QSAr `qsar-emotions` |
| 21 | `prompt_meta_QSAR_qsar-attributions` | QSAr Attributions - Contesto Pellerey | QSAr `qsar-attributions` |
| 22 | `prompt_meta_QSAR_qsar-synthesis` | QSAr Synthesis - Contesto Pellerey | QSAr `qsar-synthesis` |
| 23 | `prompt_meta_QSAR_qsar-strategies` | QSAr Strategie e consigli - Contesto Pellerey | QSAr `qsar-strategies` |
| 24 | `prompt_meta_ZTPI` | Meta system prompt ZTPI | Base ZTPI (T1–T4, strategie) |
| 25 | `prompt_meta_ZTPI_ztpi-intro` | ZTPI Intro - Contesto Pellerey | ZTPI `ztpi-intro` |
| 26 | `prompt_meta_ZTPI_ztpi-t5` | ZTPI Future - Contesto Pellerey | ZTPI `ztpi-t5` |
| 27 | `prompt_meta_ZTPI_ztpi-btp` | ZTPI BTP - Contesto Pellerey | ZTPI `ztpi-btp` |
| 28 | `prompt_meta_SAVICKAS` | Meta system prompt Savickas | Base SAVICKAS (patto, Q1–Q5) |
| 29 | `prompt_meta_SAVICKAS_savickas-intro` | Savickas Intro - Contesto Pellerey | SAVICKAS `savickas-intro` |
| 30 | `prompt_meta_SAVICKAS_savickas-final` | Savickas Summary - Contesto Pellerey | SAVICKAS `savickas-final` |
| 31 | `prompt_meta_EVENTO_STUDIO` | Meta system prompt Evento significativo di studio | EVENTO_STUDIO, tutti gli step |
| 32 | `prompt_meta_EVENTO_PROFESSIONALE` | Meta system prompt Evento significativo professionale | EVENTO_PROFESSIONALE, tutti gli step |
| 33 | `prompt_meta_QPCS` | Meta system prompt QPCS | QPCS, tutti gli step |
| 34 | `prompt_meta_QPCC` | Meta system prompt QPCC | QPCC, tutti gli step |
| 35 | `prompt_meta_QAP` | Meta system prompt QAP | QAP, tutti gli step |

### 2.3 Direttive globali (6) e placeholder (1)

Le direttive sono iniettate in testa al system prompt di ogni turno, dopo il
prompt di modalità. Sono testi brevi e trasversali.

| # | Chiave | Etichetta | Cosa governa |
|---|--------|-----------|--------------|
| 1 | `directive_conversation_quality` | Direttiva qualita conversazione | Una domanda per turno, niente interrogatori, niente lezioni non richieste |
| 2 | `directive_context` | Direttiva contesto piattaforma | Distinzione tra CounselorBot e competenzestrategiche.it, dove avvengono le cose |
| 3 | `directive_language` | Direttiva linguaggio | Lingua della risposta e registro |
| 4 | `directive_register` | Direttiva registro | Tu informale, tono di consulenza |
| 5 | `directive_thinking` | Direttiva thinking | Quando il modello può usare il ragionamento interno |
| 6 | `directive_affirmative` | Direttiva linguaggio affermativo | Vieta le formule "non è X ma Y" |
| 7 | `placeholder_language_mappings` | Mappatura placeholder lingua | Non è un prompt: mappa i placeholder di lingua |

### 2.4 Prompt di fase guidata (12)

Sono i prompt usati quando `phase` è una fase speciale, non uno step del DB.
La fase `questions` è condivisa da tutte le chat guidate; le altre sono gli
intro dei singoli strumenti.

| # | Chiave | Etichetta | Fase | Strumento |
|---|--------|-----------|------|-----------|
| 1 | `prompt_guided_questions` | Guided - 4. Domande e Approfondimenti (system) | `questions` | Tutti |
| 2 | `prompt_intro` | Guided - 0. Presentazione QSA (system) | `intro` | QSA |
| 3 | `prompt_qsar_intro` | Guided - 0. Presentazione QSAr (system) | `qsar-intro` | QSAr |
| 4 | `prompt_ztpi_intro` | Guided - 0. Presentazione ZTPI (system) | `ztpi-intro` | ZTPI |
| 5 | `prompt_savickas_intro` | Guided - 0. Presentazione SAVICKAS (system) | `savickas-intro` | SAVICKAS |
| 6 | `prompt_evstudio_intro` | Guided - 0. Presentazione Evento significativo di studio (system) | `evstudio-intro` | EVENTO_STUDIO |
| 7 | `prompt_evprof_intro` | Guided - 0. Presentazione Evento significativo professionale (system) | `evprof-intro` | EVENTO_PROFESSIONALE |
| 8 | `prompt_obbstudio_intro` | Guided - 0. Presentazione Obiettivo di apprendimento (system) | `obbstudio-intro` | OBIETTIVO_STUDIO |
| 9 | `prompt_obbdocenza_intro` | Guided - 0. Presentazione Obiettivi per la mia classe (system) | `obbdocenza-intro` | OBIETTIVO_DOCENZA |
| 10 | `prompt_qpcs_welcome` | Guided - 0. Presentazione QPCS (system) | `qpcs-intro` | QPCS |
| 11 | `prompt_qpcc_welcome` | Guided - 0. Presentazione QPCC (system) | `qpcc-intro` | QPCC |
| 12 | `prompt_qap_welcome` | Guided - 0. Presentazione QAP (system) | `qap-intro` | QAP |

> Attenzione al disallineamento nome/fase: per QPCS, QPCC e QAP la chiave si
> chiama `*_welcome` ma la fase si chiama `*-intro`. L'alias è in
> `GUIDED_PHASE_ALIASES`.

### 2.5 Testi statici guidati (23) ed etichette fisse (2)

Sono testi 👤 mostrati allo studente, non istruzioni al modello. I primi tre
sono globali (QSA e IDEA li usano come default); gli altri sono per strumento.

| # | Chiave | Quando appare | Default (IT) |
|---|--------|---------------|--------------|
| 1 | `text_guided_questions_phase_banner` | Banner della fase Domande (QSA e strumenti senza numero calcolato) | `--- Fase finale: Riflessione e Strategie ---` |
| 2 | `text_guided_questions_intro` | Introduzione della fase Domande (QSA) | `Abbiamo completato l'analisi strutturata. Prima di concludere, puoi riflettere sui risultati, chiarire cosa ti rappresenta di più e scegliere una strategia concreta da provare.` |
| 3 | `text_guided_conclusion` | Conclusione del percorso (QSA) | `Hai completato il percorso di analisi del QSA. Spero ti sia stato utile! Continua per scegliere il prossimo passaggio.` |
| 4 | `text_qsar_questions_intro` | QSAr, fase Domande | `Abbiamo completato l'analisi strutturata del tuo profilo QSAr. Ora puoi farmi qualsiasi domanda libera sui risultati o chiedere consigli specifici.` |
| 5 | `text_qsar_conclusion` | QSAr, conclusione | `Hai completato il percorso di analisi del QSAr. Continua per scegliere il prossimo passaggio.` |
| 6 | `text_ztpi_questions_intro` | ZTPI, fase Domande | `Abbiamo completato l'analisi strutturata della tua prospettiva temporale. Ora puoi farmi qualsiasi domanda libera sui risultati o chiedere consigli specifici su come lavorare sul tuo equilibrio temporale.` |
| 7 | `text_ztpi_conclusion` | ZTPI, conclusione | `Hai completato il percorso di analisi della tua prospettiva temporale. Ricorda: lavorare verso un profilo temporale equilibrato è un percorso graduale. Continua per scegliere il prossimo passaggio.` |
| 8 | `text_savickas_questions_intro` | SAVICKAS, fase Domande | `Abbiamo completato le 5 domande dell'intervista Savickas. Ora puoi chiedere chiarimenti sulla sintesi o approfondire i prossimi passi.` |
| 9 | `text_savickas_conclusion` | SAVICKAS, conclusione | `Hai completato l'intervista Savickas di career counseling. Puoi usare la sintesi come bussola e aggiornarla nel tempo mentre fai esperienza. Continua per scegliere il prossimo passaggio.` |
| 10 | `text_evento_studio_questions_intro` | EVENTO_STUDIO, fase Domande | `Abbiamo riletto insieme il tuo evento di studio. Ora puoi chiedere chiarimenti sulla sintesi o approfondire ciò che hai scelto di provare.` |
| 11 | `text_evento_studio_conclusion` | EVENTO_STUDIO, conclusione | `Hai completato la rilettura del tuo evento significativo di studio. Puoi salvare la sintesi come tappa nella tua Linea del tempo e riprenderla dopo aver provato ciò che hai scelto. Continua per scegliere il prossimo passaggio.` |
| 12 | `text_evento_professionale_questions_intro` | EVENTO_PROFESSIONALE, fase Domande | `Abbiamo riletto insieme il tuo evento professionale. Ora puoi chiedere chiarimenti sulla sintesi o approfondire ciò che hai scelto di provare.` |
| 13 | `text_evento_professionale_conclusion` | EVENTO_PROFESSIONALE, conclusione | `Hai completato la rilettura del tuo evento significativo professionale. Puoi salvare la sintesi come tappa nella tua Linea del tempo e riprenderla dopo aver provato ciò che hai scelto. Continua per scegliere il prossimo passaggio.` |
| 14 | `text_obbstudio_questions_intro` | OBIETTIVO_STUDIO, fase Domande (non usata: gli Obiettivi non hanno fase Domande) | `Abbiamo impostato insieme il tuo obiettivo di apprendimento. Ora puoi chiedere chiarimenti sull'obiettivo o approfondire i passi che hai scelto.` |
| 15 | `text_obbstudio_conclusion` | OBIETTIVO_STUDIO, conclusione (non usata) | `Hai completato il percorso sul tuo obiettivo di apprendimento. Puoi salvare l'obiettivo tra i tuoi obiettivi personali e riprenderlo alla data che hai scelto. Continua per scegliere il prossimo passaggio.` |
| 16 | `text_obbdocenza_questions_intro` | OBIETTIVO_DOCENZA, fase Domande (non usata) | `Abbiamo impostato insieme l'obiettivo didattico per la tua classe. Ora puoi chiedere chiarimenti sull'obiettivo o approfondire le attività allineate che hai scelto.` |
| 17 | `text_obbdocenza_conclusion` | OBIETTIVO_DOCENZA, conclusione (non usata) | `Hai completato il percorso sull'obiettivo didattico. Puoi salvare l'obiettivo tra i tuoi obiettivi, pubblicarlo nel tuo catalogo o assegnarlo a un gruppo. Continua per scegliere il prossimo passaggio.` |
| 18 | `text_qpcs_questions_intro` | QPCS, fase Domande | `Abbiamo analizzato il tuo profilo di competenze strategiche. Ora puoi farmi qualsiasi domanda libera o chiedere consigli pratici.` |
| 19 | `text_qpcs_conclusion` | QPCS, conclusione | `Hai completato l'analisi delle tue competenze strategiche (QPCS). Continua per scegliere il prossimo passaggio.` |
| 20 | `text_qpcc_questions_intro` | QPCC, fase Domande | `Abbiamo analizzato il tuo profilo di competenze e convinzioni. Ora puoi farmi qualsiasi domanda libera o chiedere consigli pratici.` |
| 21 | `text_qpcc_conclusion` | QPCC, conclusione | `Hai completato l'analisi di competenze e convinzioni (QPCC). Continua per scegliere il prossimo passaggio.` |
| 22 | `text_qap_questions_intro` | QAP, fase Domande | `Abbiamo analizzato il tuo profilo di adattabilità professionale. Ora puoi farmi qualsiasi domanda libera o chiedere consigli pratici.` |
| 23 | `text_qap_conclusion` | QAP, conclusione | `Hai completato l'analisi dell'adattabilità professionale (QAP). Continua per scegliere il prossimo passaggio.` |

| # | Chiave | Etichetta | Default |
|---|--------|-----------|---------|
| 1 | `label_guided_questions` | Nome Step Domande | `4. Domande e Approfondimenti` |
| 2 | `label_guided_conclusion` | Nome Step Conclusione | `Conclusione` |

> L'ordinale iniziale delle etichette è storico: il client lo rimuove con
> `stripStepOrdinal` prima di mostrarlo. Per QSAr, SAVICKAS, EVENTO_* e
> OBIETTIVO_* il numero e il banner sono calcolati nel codice (8, 7, 8, 8).

### 2.6 Assistente del sito (10)

| # | Chiave | Etichetta | Tipo |
|---|--------|-----------|------|
| 1 | `site_chat_knowledge_card` | Site Chat - Scheda strumenti (dati canonici) | Dati iniettati: sigle, nomi e fattori esatti |
| 2 | `site_chat_platform_context` | Site Chat - Contesto piattaforma (distinzioni/attribuzioni) | Preambolo di contesto |
| 3 | `prompt_site_chat_docente` | Site Chat - Prompt Docente | System prompt |
| 4 | `prompt_site_chat_studente` | Site Chat - Prompt Studente | System prompt |
| 5 | `embedding_model` | Recupero documenti - Modello di embedding | Parametro (`qwen3-embedding:4b`) |
| 6 | `site_chat_top_k` | Site Chat - Numero passaggi recuperati (top-k) | Parametro (`10`) |
| 7 | `site_chat_category_weights` | Site Chat - Pesi per macro-categoria (JSON) | Parametro |
| 8 | `site_chat_audience_weights` | Site Chat - Pesi per pubblico (JSON) | Parametro |
| 9 | `site_chat_max_per_source` | Site Chat - Max chunk per documento | Parametro (`3`) |
| 10 | `site_chat_min_score` | Site Chat - Soglia minima similarità | Parametro (`0.2`) |

### 2.7 Altre chat e pQBL (3 + 1 + 1 + 3)

| # | Chiave | Etichetta | Gruppo |
|---|--------|-----------|--------|
| 1 | `counselorbot_chat_context` | CounselorBot Chat - Contesto piattaforma (base, sempre iniettato) | CounselorBot |
| 2 | `prompt_counselorbot_chat_docente` | CounselorBot Chat - Prompt Docente | CounselorBot |
| 3 | `prompt_counselorbot_chat_studente` | CounselorBot Chat - Prompt Studente | CounselorBot |
| 4 | `framework_chat_context` | Framework Chat - Contesto (base, sempre iniettato) | Framework |
| 5 | `questionari_chat_context` | Questionari Chat - Contesto (base, sempre iniettato) | Questionari |
| 6 | `pqbl_question_generation_prompt` | pQBL - Prompt Generazione Domande | pQBL |
| 7 | `pqbl_onboarding_text` | pQBL - Testo Onboarding Studente | pQBL |
| 8 | `pqbl_model` | pQBL - Modello dedicato (opzionale) | pQBL |

### 2.8 Riepilogo numerico

```text
34  system prompt di modalità
35  meta system prompt
 6  direttive globali
 1  placeholder
12  prompt di fase guidata
23  testi statici guidati
 2  etichette fisse
10  assistente del sito
 3  CounselorBot Chat
 1  Framework Chat
 1  Questionari Chat
 3  pQBL
───
131 definizioni totali
```


---

## 3. I 12 strumenti guidati: struttura dei prompt

### 3.0 Riepilogo degli strumenti

| Strumento | Tipo | Step | Fasi fisse | Meta base | Blocco privato | Percorso essenziale |
|-----------|------|------|-----------|-----------|----------------|---------------------|
| **QSA** | Fattori di studio (cognitivi/affettivi + secondo livello) | 11 | Domande, Conclusione | vuoto | — | sì (4 fasi) |
| **QSAr** | Fattori di studio (versione ristretta) | 10 | Domande, Conclusione | vuoto | — | no |
| **ZTPI** | Prospettiva temporale | 8 | Domande, Conclusione | `META_ZTPI_TIME_PERSPECTIVE` | — | no |
| **SAVICKAS** | Career construction (intervista narrativa) | 8 | — (intervista autonoma) | `META_SAVICKAS_CAREER_CONSTRUCTION` | — | no |
| **EVENTO_STUDIO** | Evento significativo di studio | 9 | Domande, Conclusione | `META_EVENTO_REFLECTIVE_PRACTICE` | ```booklet``` | no |
| **EVENTO_PROFESSIONALE** | Evento significativo professionale | 9 | Domande, Conclusione | `META_EVENTO_REFLECTIVE_PRACTICE` | ```booklet``` | no |
| **OBIETTIVO_STUDIO** | Obiettivo di apprendimento | 6 | — (sintesi finale) | vuoto | ```goal``` | sì (4 fasi) |
| **OBIETTIVO_DOCENZA** | Obiettivo di docenza | 6 | — (sintesi finale) | vuoto | ```goal``` | sì (4 fasi) |
| **QPCS** | Competenze strategiche | 9 | Domande, Conclusione | `PELLEREY_STRATEGIC_COMPETENCES` | — | no |
| **QPCC** | Competenze e convinzioni professionali (10 scale) | 9 | Domande, Conclusione | `PELLEREY_STRATEGIC_COMPETENCES` | — | no |
| **QAP** | Adattabilità di carriera | 8 | Domande, Conclusione | `PELLEREY_STRATEGIC_COMPETENCES` | — | no |
| **IDEA** | Messa a fuoco di un'idea | 8 | — (nessuna) | — (nessuno) | ```idea``` | no |

**Totale: 101 step** (97 config di fabbrica + 101 step; il perimetro «istruzioni» di
`prompt_factory_alignment.factory_catalog()` è oggi di 97 config, mentre la doc
`prompt-factory-alignment.md` cita 93 «al momento dell'introduzione»).

### 3.1 Struttura comune di uno strumento guidato

```
┌──────────────────────────────────────────────────────────────────┐
│  STRUMENTO (es. QSA)                                             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Livello comune (tutti gli strumenti)                      │  │
│  │  prompt_intro, prompt_factor, prompt_second_level,          │  │
│  │  prompt_generic, prompt_free_chat, prompt_strategies,       │  │
│  │  prompt_guided_questions, text_*_conclusion,                │  │
│  │  directive_* (6), placeholder                              │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Livello strumento (system prompt di modalità)             │  │
│  │  prompt_<strum>_intro / _factor / _second_level / ...       │  │
│  │  prompt_meta_<STRUM> (base) + prompt_meta_<STRUM>_<step>   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Livello step (guided_steps.prompt + system_prompt_mode)     │  │
│  │  step 0..N: id, label, sort_order, prompt, mode, color       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Fase fissa (se presente)                                  │  │
│  │  «Domande e Approfondimenti» → prompt_guided_questions      │  │
│  │  «Conclusione» → text_<strum>_conclusion (statico, no LLM) │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [Per strumenti con blocco privato: l'ultima sintesi produce     │
│   ```booklet / ```goal / ```idea, rimosso dal server]            │
└──────────────────────────────────────────────────────────────────┘
```

Legenda delle colonne delle tabelle step:
- **Mode** → chiave system via `MODE_TO_SYSTEM_PROMPT_KEY`.
- **Meta** → chiave meta effettiva: `step` se esiste `prompt_meta_<STRUM>_<step>`, altrimenti `base` (`prompt_meta_<STRUM>`); `—` se nessuno.
- **Note** → particolarità (sort_order non sequenziale, etichetta i18n, blocco privato, ecc.).

---

### 3.2 QSA — Questionario sulle Strategie di Apprendimento (11 step)

```
0 Presentazione ──► 1 Cognitivi ──► 2 Affettivi ──►
  3.1 Elaborazione ──► 3.2 Autocontrollo ──► 3.3 Motivazione ──►
  3.4 Emozioni ──► 3.5 Attribuzione ──► 3.6 Sociale ──►
  3.7 Sintesi integrata ──► Strategie e consigli ──►
  [Domande] ──► [Conclusione]
```

| # | id | sort | label | mode → system key | meta | note |
|---|----|------|-------|-------------------|------|------|
| 0 | `intro` | 0 | 0. Presentazione | `intro` → `prompt_intro` | step | meta `prompt_meta_QSA_intro` |
| 1 | `cognitive` | 1 | 1. Fattori Cognitivi | `factor` → `prompt_factor` | step | `prompt_meta_QSA_cognitive` |
| 2 | `affective` | 2 | 2. Fattori Affettivi | `factor` → `prompt_factor` | step | `prompt_meta_QSA_affective` |
| 3 | `sl-elaboration` | 3 | 3.1 Elaborazione e Org. | `second-level` → `prompt_second_level` | step | `prompt_meta_QSA_sl-elaboration` |
| 4 | `sl-selfcontrol` | 4 | 3.2 Autocontrollo | `second-level` → `prompt_second_level` | step | `prompt_meta_QSA_sl-selfcontrol` |
| 5 | `sl-motivation` | 5 | 3.3 Motivazione | `second-level` → `prompt_second_level` | step | `prompt_meta_QSA_sl-motivation` |
| 6 | `sl-emotions` | 6 | 3.4 Gestione Emotiva | `second-level` → `prompt_second_level` | step | `prompt_meta_QSA_sl-emotions` |
| 7 | `sl-attribution` | 7 | 3.5 Stile Attributivo | `second-level` → `prompt_second_level` | step | `prompt_meta_QSA_sl-attribution` |
| 8 | `sl-social` | 8 | 3.6 Dimensione Sociale | `second-level` → `prompt_second_level` | step | `prompt_meta_QSA_sl-social` |
| 9 | `sl-synthesis` | 9 | 3.7 Sintesi Integrata | `second-level` → `prompt_second_level` | step | prompt += `SYNTHESIS_ADVICE_DIRECTIVE`; meta `prompt_meta_QSA_sl-synthesis` |
| 10 | `sl-strategies` | 10 | 10. Strategie e consigli | `strategies` → `prompt_strategies` | step | meta `prompt_meta_QSA_sl-strategies`; prompt inietta `[OBJECTIVE FOCUS]` |

- **Fasi fisse:** `Domande e Approfondimenti` → `prompt_guided_questions`; `Conclusione` → `text_qsa_conclusion` (statico).
- **Percorso essenziale:** 4 fasi virtuali (`qsa_essential.py`): `intro` (Presentazione), `cognitive` (Cognitivi), `affective` (Affettivi), `sl-synthesis` (Sintesi). Il passo `sl-strategies` resta fuori dall'essenziale.
- **Componenti prompt (QSA-specifici):** `qsa_component_defaults(step_id, advice_requested)` modula cognitivi/affettivi/altri punteggi/conoscenza/strategie approvate/certificate in base allo step e alla richiesta di consigli.
- **Meta base** `prompt_meta_QSA` = `""` (vuoto): ogni step ha il proprio meta; il base è fallback.

---

### 3.3 QSAr — Questionario sulle Strategie (versione ristretta) (10 step)

```
0 Presentazione ──► 1 Cognitivi ──► 2 Affettivi ──►
  3 Elaborazione ──► 4 Autoregolazione ──► 5 Motivazione ──►
  6 Emozioni ──► 7 Attribuzioni ──► 8 Sintesi integrata ──►
  Strategie e consigli ──► [Domande] ──► [Conclusione]
```

| # | id | sort | label | mode → system key | meta | note |
|---|----|------|-------|-------------------|------|------|
| 0 | `qsar-intro` | 0 | 0. Presentazione | `intro` → `prompt_intro` | step | prompt = `SCORE_BASED_INTRO_STEP_PROMPT`; meta `prompt_meta_QSAR_qsar-intro` |
| 1 | `qsar-cognitive` | 1 | 1. Fattori Cognitivi | `qsar-factor` → `prompt_qsar_factor` | step | prompt inline (C1r..C4r); meta `prompt_meta_QSAR_qsar-cognitive` |
| 2 | `qsar-affective` | 2 | 2. Fattori Affettivi | `qsar-factor` → `prompt_qsar_factor` | step | prompt inline (A1r..A4r); meta `prompt_meta_QSAR_qsar-affective` |
| 3 | `qsar-processing` | 3 | 3. Elaborazione e Organizzazione | `qsar-second-level` → `prompt_qsar_second_level` | step | prompt inline (C1r+C3r); meta `..._qsar-processing` |
| 4 | `qsar-selfcontrol` | 4 | 4. Autoregolazione e Attenzione | `qsar-second-level` | step | prompt inline (C2r+C4r); meta `..._qsar-selfcontrol` |
| 5 | `qsar-motivation` | 5 | 5. Motivazione e Competenza | `qsar-second-level` | step | prompt inline (A2r+A4r); meta `..._qsar-motivation` |
| 6 | `qsar-emotions` | 6 | 6. Gestione Emotiva | `qsar-second-level` | step | prompt inline (A1r); meta `..._qsar-emotions` |
| 7 | `qsar-attributions` | 7 | 7. Attribuzioni Causali | `qsar-second-level` | step | prompt inline (A3r); meta `..._qsar-attributions` |
| 8 | `qsar-synthesis` | 8 | 8. Sintesi Integrata | `qsar-second-level` | step | prompt inline + `SYNTHESIS_ADVICE_DIRECTIVE`; meta `..._qsar-synthesis` |
| 9 | `qsar-strategies` | 9 | 9. Strategie e consigli | `strategies` → `prompt_strategies` | step | meta `prompt_meta_QSAR_qsar-strategies` |

- **Fasi fisse:** `Domande e Approfondimenti` → `prompt_guided_questions`; `Conclusione` → `text_qsar_conclusion`.
- **Meta base** `prompt_meta_QSAR` = `""` (vuoto): tutti gli step hanno meta specifico.
- **Note:** QSAr non ha percorso essenziale e non ha blocco privato. I prompt degli step 1–8 sono inline nel codice (non file `.md`).

---

### 3.4 ZTPI — Zimbardo Time Perspective Inventory (8 step)

```
0 Presentazione ──► 1 Passato Negativo ──► 2 Passato Positivo ──►
  3 Presente Edonistico ──► 4 Presente Fatalistico ──►
  5 Futuro ──► 6 Profilo Temporale Equilibrato ──►
  Strategie e consigli ──► [Domande] ──► [Conclusione]
```

| # | id | sort | label | mode → system key | meta | note |
|---|----|------|-------|-------------------|------|------|
| 0 | `ztpi-intro` | 0 | 0. Presentazione | `intro` → `prompt_intro` | step | prompt = `SCORE_BASED_INTRO_STEP_PROMPT`; meta `prompt_meta_ZTPI_ztpi-intro` |
| 1 | `ztpi-t1` | 1 | 1. Passato Negativo | `ztpi-factor` → `prompt_ztpi_factor` | base | prompt inline (zona); meta fallback `prompt_meta_ZTPI` |
| 2 | `ztpi-t2` | 2 | 2. Passato Positivo | `ztpi-factor` | base | prompt inline; meta base |
| 3 | `ztpi-t3` | 3 | 3. Presente Edonistico | `ztpi-factor` | base | prompt inline; meta base |
| 4 | `ztpi-t4` | 4 | 4. Presente Fatalistico | `ztpi-factor` | base | prompt inline; meta base |
| 5 | `ztpi-t5` | 5 | 5. Futuro | `ztpi-factor` | step | prompt inline; meta `prompt_meta_ZTPI_ztpi-t5` (Pellerey futuro) |
| 6 | `ztpi-btp` | 6 | 6. Profilo Temporale Equilibrato | `ztpi-btp` → `prompt_ztpi_btp` | step | prompt inline (confronto con BTP ideale); meta `prompt_meta_ZTPI_ztpi-btp` |
| 7 | `ztpi-strategies` | 7 | 7. Strategie e consigli | `strategies` → `prompt_strategies` | base | meta fallback `prompt_meta_ZTPI` |

- **Fasi fisse:** `Domande e Approfondimenti` → `prompt_guided_questions`; `Conclusione` → `text_ztpi_conclusion`.
- **Meta base** `prompt_meta_ZTPI` = `META_ZTPI_TIME_PERSPECTIVE` (quadro teorico iniettato a ogni step senza meta specifico).
- **Note:** T1–T4 usano il meta base; solo intro, T5 e BTP hanno meta specifico. Nessun percorso essenziale.

---

### 3.5 SAVICKAS — Career Construction Interview (8 step)

```
-1 Presentazione ──► 0 Patto di Collaborazione ──► 1 Modelli di Ruolo ──►
  2 Media Preferiti ──► 3 Storia Preferita ──► 4 Motto Personale ──►
  5 Ricordi Precoci ──► 6 Sintesi Narrativa e Piano d'Azione
```

| # | id | sort | label | mode → system key | meta | note |
|---|----|------|-------|-------------------|------|------|
| 0 | `savickas-intro` | -1 | 0. Presentazione | `intro` → `prompt_intro` | step | prompt = `SAVICKAS_INTRO_STEP_PROMPT`; meta `prompt_meta_SAVICKAS_savickas-intro` |
| 1 | `savickas-patto` | 0 | 0. Patto di Collaborazione | `savickas-interview` → `prompt_savickas_interview` | base | patto: conferma esplicita, nessun `[[AVANZA_STEP]]` fino all'accordo |
| 2 | `savickas-q1` | 1 | 1. Modelli di Ruolo | `savickas-interview` | base | 3 persone ammirate; `[[AVANZA_STEP]]` a fine |
| 3 | `savickas-q2` | 2 | 2. Media Preferiti | `savickas-interview` | base | contenuti seguiti; `[[AVANZA_STEP]]` |
| 4 | `savickas-q3` | 3 | 3. Storia Preferita | `savickas-interview` | base | storia preferita; `[[AVANZA_STEP]]` |
| 5 | `savickas-q4` | 4 | 4. Motto Personale | `savickas-interview` | base | motto; `[[AVANZA_STEP]]` |
| 6 | `savickas-q5` | 5 | 5. Ricordi Precoci | `savickas-interview` | base | 3 ricordi precoci (3–6 anni); `[[AVANZA_STEP]]` |
| 7 | `savickas-final` | 6 | 6. Sintesi Narrativa e Piano d'Azione | `savickas-summary` → `prompt_savickas_summary` | step | meta `prompt_meta_SAVICKAS_savickas-final` (`PELLEREY_NARRATIVE_IDENTITY`) |

- **Fasi fisse:** nessuna. L'intervista Savickas è autonoma: patto → 5 domande → sintesi; ogni domanda termina con `[[AVANZA_STEP]]`. Non ci sono «Domande e Approfondimenti» né «Conclusione».
- **Meta base** `prompt_meta_SAVICKAS` = `META_SAVICKAS_CAREER_CONSTRUCTION`.
- **Note:** sort_order inizia a -1 (presentazione). Solo intro e final hanno meta specifico; patto e Q1–Q5 usano il meta base.

---

### 3.6 EVENTO_STUDIO e EVENTO_PROFESSIONALE (9 step ciascuno)

Stesso percorso per i due strumenti; cambia il `{domain}` (studio vs professionale) e il meta è lo stesso (`META_EVENTO_REFLECTIVE_PRACTICE`).

```
-1 Presentazione ──► 0 Patto ──► 1 L'evento ──► 2 Il fatto ──►
  3 Cosa ha funzionato ──► 4 Cosa non ha funzionato ──►
  5 Rilettura ──► 6 La prossima volta ──► 7 Sintesi dell'evento
```

| # | suffisso id | sort | label | mode → system key | meta | note |
|---|-------------|------|-------|-------------------|------|------|
| 0 | `{prefix}-intro` | -1 | 0. Presentazione | `intro` → `prompt_intro` | base | testo = `evento_intro_step_prompt` con `{domain}` |
| 1 | `{prefix}-patto` | 0 | 0. Patto di Collaborazione | `evento-interview` → `prompt_evento_interview` | base | patto |
| 2 | `{prefix}-evento` | 1 | 1. L'evento | `evento-interview` | base | — |
| 3 | `{prefix}-fatto` | 2 | 2. Il fatto | `evento-interview` | base | — |
| 4 | `{prefix}-funzionato` | 3 | 3. Cosa ha funzionato | `evento-interview` | base | — |
| 5 | `{prefix}-criticita` | 4 | 4. Cosa non ha funzionato | `evento-interview` | base | — |
| 6 | `{prefix}-rilettura` | 5 | 5. Rilettura | `evento-interview` | base | — |
| 7 | `{prefix}-prossima` | 6 | 6. La prossima volta | `evento-interview` | base | — |
| 8 | `{prefix}-final` | 7 | 7. Sintesi dell'evento | `evento-summary` → `prompt_evento_summary` | base | produce blocco privato ```booklet``` |

- **Prefissi id:** `evento-studio-*` (EVENTO_STUDIO) e `evento-professionale-*` (EVENTO_PROFESSIONALE).
- **Fasi fisse:** `Domande e Approfondimenti` → `prompt_guided_questions`; `Conclusione` → `text_evento_studio_conclusion` / `text_evento_professionale_conclusion`.
- **Meta base** `prompt_meta_EVENTO_STUDIO` / `prompt_meta_EVENTO_PROFESSIONALE` = `META_EVENTO_REFLECTIVE_PRACTICE`. Nessun meta step-specifico.
- **Blocco privato:** la sintesi finale produce un blocco ```booklet``` (rimosso dal server, salvato in `event_booklets`).
- **Note:** i testi degli step contengono il segnaposto `{domain}` sostituito a runtime; il banner delle Domande è calcolato nel codice (8 fasi).

---

### 3.7 OBIETTIVO_STUDIO e OBIETTIVO_DOCENZA (6 step ciascuno)

Stesso percorso; varianti per strumento per i passi `piano`, `verifica`, `final`. Sort order non sequenziale (3 e 4 ritirati).

```
-1 Presentazione ──► 1 Partenza ──► 2 Livello ──►
  5 Piano ──► 6 Verifica ──► 7 Sintesi dell'obiettivo
```

| # | suffisso id | sort | label (it) | mode → system key | meta | note |
|---|-------------|------|------------|-------------------|------|------|
| 0 | `{prefix}-intro` | -1 | (label it) | `intro` → `prompt_intro` | — (nessuno) | testo = `obiettivo_intro_step_prompt` con sostituzioni |
| 1 | `{prefix}-partenza` | 1 | (label it) | `obiettivo-interview` → `prompt_obiettivo_interview` | — | — |
| 2 | `{prefix}-livello` | 2 | (label it) | `obiettivo-interview` | — | — |
| 3 | `{prefix}-piano` | 5 | (label it) | `obiettivo-interview` | — | testo variante per strumento |
| 4 | `{prefix}-verifica` | 6 | (label it) | `obiettivo-interview` | — | testo variante per strumento |
| 5 | `{prefix}-final` | 7 | (label it) | `obiettivo-summary` → `prompt_obiettivo_summary` | — | produce blocco privato ```goal``` |

- **Prefissi id:** `obiettivo-studio-*` e `obiettivo-docenza-*`.
- **Etichette:** `obiettivo_step_labels(prefix)` fornisce label localizzate (it/en/...) per ogni suffisso; le label italiane sono nei file di configurazione.
- **Fasi fisse:** nessuna. L'ultima fase è la sintesi; non ci sono «Domande e Approfondimenti» né «Conclusione».
- **Meta:** nessun meta prompt per OBIETTIVO_* (né base né step-specifico). `prompt_meta_OBIETTIVO_*` non esiste.
- **Blocco privato:** la sintesi finale produce un blocco ```goal``` (rimosso dal server, salvato in `goal_drafts`).
- **Percorso essenziale:** 4 fasi virtuali (`qsa_essential.py`): `intro`, `partenza`, `livello`, `final` (con `verifica` come fase di verifica). Per OBIETTIVO_DOCENZA il contesto è la docenza.
- **Note:** sort order 3 e 4 sono ritirati (gap voluto per compatibilità DB). Etichette visualizzate 1–5.

---

### 3.8 QPCS — Questionario sulle Competenze Strategiche (9 step)

```
0 Patto di Collaborazione ──► 1 Lettura del Profilo ──►
  2 Emozioni ──► 3 Comunicazione ──► 4 Volizione ──►
  5 Strategie e Collaborazione ──► 6 Fiducia e Progetto ──►
  7 Sintesi e Piano d'Azione ──► Strategie e consigli ──►
  [Domande] ──► [Conclusione]
```

| # | id | sort | label | mode → system key | meta | note |
|---|----|------|-------|-------------------|------|------|
| 0 | `qpcs-intro` | 0 | 0. Patto di Collaborazione | `qpcs-analysis` → `prompt_qpcs_analysis` | base | patto: chiede cosa lo studente vuole fare; nessun `[[AVANZA_STEP]]` |
| 1 | `qpcs-profilo` | 1 | 1. Lettura del Profilo | `qpcs-factor` → `prompt_qpcs_factor` | base | lettura dei 5 punteggi S1–S5; label i18n (5 lingue) |
| 2 | `qpcs-emozioni` | 2 | 2. Gestione delle Emozioni | `qpcs-analysis` | base | area 1/5 |
| 3 | `qpcs-comunicazione` | 3 | 3. Competenza Comunicativa | `qpcs-analysis` | base | area 2/5 |
| 4 | `qpcs-volizione` | 4 | 4. Volontà e Perseveranza | `qpcs-analysis` | base | area 3/5 |
| 5 | `qpcs-apprendimento` | 5 | 5. Strategie e Collaborazione | `qpcs-analysis` | base | area 4/5 |
| 6 | `qpcs-fiducia` | 6 | 6. Fiducia e Progetto di Vita | `qpcs-analysis` | base | area 5/5 |
| 7 | `qpcs-sintesi` | 7 | 7. Sintesi e Piano d'Azione | `qpcs-summary` → `prompt_qpcs_summary` | base | `[[AVANZA_STEP]]` |
| 8 | `qpcs-strategie` | 8 | 8. Strategie e consigli | `strategies` → `prompt_strategies` | base | — |

- **Fasi fisse:** `Domande e Approfondimenti` → `prompt_guided_questions`; `Conclusione` → `text_qpcs_conclusion`.
- **Meta base** `prompt_meta_QPCS` = `PELLEREY_STRATEGIC_COMPETENCES`. Nessun meta step-specifico.
- **Note:** QPCS ha due famiglie di mode (`qpcs-analysis`/`qpcs-summary` per compatibilità con percorsi già configurati, e `qpcs-factor` per la lettura profilo). `label_i18n` su profilo e strategie.

---

### 3.9 QPCC — Questionario sulle Competenze e Convinzioni (10 scale) (9 step)

```
0 Patto di Collaborazione ──► 1 Lettura del Profilo ──►
  2 Ansia di parlare in pubblico (A1) ──►
  3 Insicurezza e inadeguatezza (A2/A3) ──►
  4 Dimensione volitiva (V1/V2) ──► 5 Dimensione cognitiva (C1/C2) ──►
  6 Dimensione motivazionale (M1/M2/M3) ──►
  7 Sintesi e Piano d'Azione ──► Strategie e consigli ──►
  [Domande] ──► [Conclusione]
```

| # | id | sort | label | mode → system key | meta | note |
|---|----|------|-------|-------------------|------|------|
| 0 | `qpcc-intro` | 0 | 0. Patto di Collaborazione | `qpcc-interview` → `prompt_qpcc_interview` | base | patto; `[[AVANZA_STEP]]` alla conferma |
| 1 | `qpcc-profilo` | 1 | 1. Lettura del Profilo | `qpcc-factor` → `prompt_qpcc_factor` | base | 10 scale A1/A2/A3/V1/V2/C1/C2/M1/M2/M3, stanine 1–9 |
| 2 | `qpcc-comunicazione` | 2 | 2. Ansia di parlare in pubblico | `qpcc-interview` | base | A1; A1 ≠ C2 |
| 3 | `qpcc-controllo` | 3 | 3. Insicurezza e inadeguatezza | `qpcc-interview` | base | A2/A3 |
| 4 | `qpcc-volizione` | 4 | 4. Dimensione volitiva | `qpcc-interview` | base | V1/V2 |
| 5 | `qpcc-elaborazione` | 5 | 5. Dimensione cognitiva | `qpcc-interview` | base | C1/C2 |
| 6 | `qpcc-convinzioni` | 6 | 6. Dimensione motivazionale | `qpcc-interview` | base | M1/M2/M3; M2 contestuale |
| 7 | `qpcc-sintesi` | 7 | 7. Sintesi e Piano d'Azione | `qpcc-summary` → `prompt_qpcc_summary` | base | 10 scale integrate; `[[AVANZA_STEP]]` |
| 8 | `qpcc-strategie` | 8 | 8. Strategie e consigli | `strategies` → `prompt_strategies` | base | — |

- **Fasi fisse:** `Domande e Approfondimenti` → `prompt_guided_questions`; `Conclusione` → `text_qpcc_conclusion`.
- **Meta base** `prompt_meta_QPCC` = `PELLEREY_STRATEGIC_COMPETENCES`. Nessun meta step-specifico.
- **Contratto canonico:** in ogni turno QPCC il server inietta `[CANONICAL QPCC CONTRACT]` (da `backend/qpcc.py`): 10 scale, stanine 1–9, A1–A3 invertite (alto = più difficoltà), M2 contestuale (non buono/cattivo), K1–K5 non riutilizzabili.
- **Note:** tutti gli step hanno `label_i18n` (5 lingue).

---

### 3.10 QAP — Adattabilità di Carriera (8 step)

```
0 Patto di Collaborazione ──► 1 Lettura del Profilo ──►
  2 Orientamento al Futuro (AD1) ──► 3 Controllo e Autonomia (AD2) ──►
  4 Curiosità ed Esplorazione (AD3) ──► 5 Fiducia e Problem Solving (AD4) ──►
  6 Sintesi e Piano d'Azione ──► Strategie e consigli ──►
  [Domande] ──► [Conclusione]
```

| # | id | sort | label | mode → system key | meta | note |
|---|----|------|-------|-------------------|------|------|
| 0 | `qap-intro` | 0 | 0. Patto di Collaborazione | `qap-interview` → `prompt_qap_interview` | base | patto; conferma esplicita; `[[AVANZA_STEP]]` |
| 1 | `qap-profilo` | 1 | 1. Lettura del Profilo | `qap-factor` → `prompt_qap_factor` | base | 4 aree AD1–AD4 |
| 2 | `qap-preoccupazione` | 2 | 2. Orientamento al Futuro | `qap-interview` | base | area 1/4 (Concern) |
| 3 | `qap-controllo` | 3 | 3. Controllo e Autonomia | `qap-interview` | base | area 2/4 (Control) |
| 4 | `qap-curiosita` | 4 | 4. Curiosità ed Esplorazione | `qap-interview` | base | area 3/4 (Curiosity) |
| 5 | `qap-fiducia` | 5 | 5. Fiducia e Problem Solving | `qap-interview` | base | area 4/4 (Confidence) |
| 6 | `qap-sintesi` | 6 | 6. Sintesi e Piano d'Azione | `qap-summary` → `prompt_qap_summary` | base | 4 risorse integrate; `[[AVANZA_STEP]]` |
| 7 | `qap-strategie` | 7 | 7. Strategie e consigli | `strategies` → `prompt_strategies` | base | — |

- **Fasi fisse:** `Domande e Approfondimenti` → `prompt_guided_questions`; `Conclusione` → `text_qap_conclusion`.
- **Meta base** `prompt_meta_QAP` = `PELLEREY_STRATEGIC_COMPETENCES`. Nessun meta step-specifico.
- **Note:** tutti gli step hanno `label_i18n` (5 lingue).

---

### 3.11 IDEA — Messa a fuoco di un'idea (8 step)

```
0 Di cosa parliamo ──► 1 L'idea in una frase ──► 2 Cosa do per scontato ──►
  3 Su cosa mi baso ──► 4 Come si potrebbe vedere diversamente ──►
  5 Dove porta ──► 6 È la domanda giusta? ──► 7 Mappa e prossimo passo
```

| # | id | sort | label | mode → system key | meta | note |
|---|----|------|-------|-------------------|------|------|
| 0 | `idea-intro` | 0 | Di cosa parliamo | `idea-focus` → `prompt_idea_focus` | — | prompt inline; apertura, mappa accanto |
| 1 | `idea-statement` | 1 | L'idea in una frase | `idea-focus` | — | nodo centrale `idea` |
| 2 | `idea-assumptions` | 2 | Cosa do per scontato | `idea-focus` | — | nodo `assumption` |
| 3 | `idea-evidence` | 3 | Su cosa mi baso | `idea-focus` | — | nodi `evidence`/`constraint` |
| 4 | `idea-alternatives` | 4 | Come si potrebbe vedere diversamente | `idea-focus` | — | nodo `alternative` |
| 5 | `idea-implications` | 5 | Dove porta | `idea-focus` | — | nodi `implication`/`constraint` |
| 6 | `idea-question` | 6 | È la domanda giusta? | `idea-focus` | — | nodo `open-question` |
| 7 | `idea-synthesis` | 7 | Mappa e prossimo passo | `idea-focus` | — | nodo `step`; blocco privato ```idea``` |

- **Fasi fisse:** nessuna. IDEA non ha «Domande e Approfondimenti» né «Conclusione».
- **Meta:** nessun meta prompt (né base né step-specifico).
- **Blocco privato:** la sintesi produce un blocco ```idea``` (rimosso dal server, salvato in `idea_maps`).
- **Note:** tutti gli step usano la stessa chiave `prompt_idea_focus` (system prompt di modalità unico). IDEA non usa `[[AVANZA_STEP]]`, non ha punteggi, non ha meta. Gli step possono essere riutilizzati su nuovi rami. Il prompt di ogni step descrive quando scatta (es. «questo step scatta quando il ramo non ha un nodo `idea`»).

---

### 3.12 Fasi fisse e percorsi essenziali

**Fasi fisse (Domande / Conclusione):**

| Strumento | Banner Domande | Conclusione (testo statico) |
|-----------|----------------|------------------------------|
| QSA, QSAr, ZTPI, EVENTO_*, QPCS, QPCC, QAP | `label_guided_questions` = "4. Domande e Approfondimenti" (ordinale rimosso dal client via `stripStepOrdinal`) | `text_<strum>_conclusion` |
| SAVICKAS, OBIETTIVO_*, IDEA | nessuna | nessuna |

Il banner delle Domande è calcolato nel codice per alcuni strumenti:
- **QSAr / SAVICKAS / EVENTO_***: 8/7/8 fasi (il numero è calcolato, non l'etichetta).
- **QSA / OBIETTIVO_***: banner e numero gestiti dal client.

**Percorso essenziale** (`qsa_essential.py`): 13 fasi virtuali, solo per QSA, OBIETTIVO_STUDIO, OBIETTIVO_DOCENZA. Per ogni fase virtuale esiste una direttiva essenziale (`essential_directive`) iniettata come `[STEP DIRECTION CHOICE]`/direttiva essenziale. Le fasi essenziali hanno `sort_order` virtuali e `meta_key` dedicati.


---

## 4. Prompt runtime e contratti (non config)

### 4.1 Blocchi costruiti a runtime (ordine del system prompt)

In un turno guidato, il system prompt è assemblato da `chat_preparation.prepare_chat_turn`
in questo ordine (vedi anche §1.4):

1. **Istruzione dello step** (`guided_steps.prompt`) — il testo dello step attivo.
2. `[PERSONA]` — persona del counselor (da `counselors`).
3. **System prompt di modalità** + direttive globali (`directive_*` in testa) — chiave da `MODE_TO_SYSTEM_PROMPT_KEY`.
4. `[META SYSTEM PROMPT]` — base o step-specifico (`prompt_meta_*`).
5. `[ROLE]`, `[SECTION]`, `[STUDENT]`, `[GUIDED PATH]`, `[SIMULATION]`, `[PROFILE]`, `[CONTESTO CLASSE]`, `[READING]`.
6. `[IDEA REFERENCE]`, `[IDEA SOURCES]`, `[IDEA MAP]` (solo IDEA).
7. `[KNOWLEDGE]` + skill `directive_tail`.
8. `[JOURNEY EVIDENCE]` / `[PERSPECTIVE]` (se presenti).
9. `[SESSION LEDGER]` / `[REFLECTION THREAD]`.
10. `[TURN CONTRACT]` — contratto del turno (§4.2).
11. `[CANONICAL QPCC CONTRACT]` — solo QPCC.
12. `[STEP DIRECTION CHOICE]` — solo percorsi essenziali.
13. **Direttiva essenziale** — solo percorsi essenziali.
14. `[GUIDED EXPLORATION]` — solo percorsi essenziali.
15. `[VISIBLE RESPONSE FORMAT]` — formato di risposta visibile.
16. `[SESSION NOTES]` — note di sessione.

### 4.2 Contratti runtime (`prompt_contract.py`)

| Contratto | Quando | Contenuto |
|-----------|--------|-----------|
| `turn_contract` | Ogni turno guidato | Regole del turno: una domanda alla volta, nessun consiglio non richiesto, marker `[[AVANZA_STEP]]`, ecc. |
| `[OBJECTIVE FOCUS]` | Step `sl-strategies` e sintesi | Focus dell'obiettivo di apprendimento |
| `[QUESTIONNAIRE DESCRIPTION]` | Ogni turno | Descrizione del questionario in uso |
| `[FACILITATION]` | Ogni turno | Stile di facilitazione |
| `[SELF-QUESTIONING]` | Ogni turno | Autointerrogazione |
| `[GUIDED CHOICE]` | Ogni turno | Scelta guidata |
| `[GUIDED EXPLORATION]` | Percorsi essenziali | Esplorazione guidata |
| `[STEP DIRECTION CHOICE]` | Percorsi essenziali | Scelta della direzione dello step |
| `[CANONICAL QPCC CONTRACT]` | QPCC | 10 scale, stanine, inversioni, M2 contestuale |
| `[BOOKLET DRAFT]` | EVENTO_* (ultima sintesi) | Contratto del blocco ```booklet``` |
| `[GOAL DRAFT]` | OBIETTIVO_* (ultima sintesi) | Contratto del blocco ```goal``` |
| `[IDEA …]` | IDEA | Contratto del blocco ```idea``` |

### 4.3 Blocchi privati (rimossi dal server prima della risposta)

| Blocco | Strumento | Destinazione | Contratto |
|--------|-----------|--------------|-----------|
| ```booklet``` | EVENTO_STUDIO, EVENTO_PROFESSIONALE | `event_booklets` | `event_booklet.py` |
| ```goal``` | OBIETTIVO_STUDIO, OBIETTIVO_DOCENZA | `goal_drafts` | `goal_draft.py` |
| ```idea``` | IDEA | `idea_maps` | contratto inline in `chat_logic` |

### 4.4 Le 9 skill del motore

| Skill | Chiave | Uso |
|-------|--------|-----|
| `approved-strategies` | `directive_tail` | Strategie approvate, iniettate in `[KNOWLEDGE]` |
| `certified-advice` | `directive_tail` | Consigli certificati |
| `profile-wayfinder` | `directive_tail` | Navigazione del profilo |
| `reading-guide` | `directive_tail` | Guida alla lettura |
| `profile-comparison` | `directive_tail` | Confronto profili |
| `web-lookup` | `directive_tail` | Ricerca web |
| `concept-diagram` | `directive_tail` | Diagramma concettuale |
| `idea-focus` | `directive_tail` | Focus idea (IDEA) |
| `referral-guide` | `directive_tail` | Guida al rinvio |

Le skill sono definite in `backend/skills_seed.py` e iniettate come `directive_tail` nel blocco `[KNOWLEDGE]`.

### 4.5 Marker tecnici interpretati dal client/server

| Marker | Significato |
|--------|-------------|
| `[[AVANZA_STEP]]` | Il modello chiede di avanzare allo step successivo (rimosso dalla risposta visibile) |
| ```booklet / ```goal / ```idea``` | Blocco privato di sintesi (rimosso dalla risposta visibile) |
| `stripStepOrdinal` | Il client rimuove l'ordinale dall'etichetta (es. "4. Domande..." → "Domande...") |

---

## 5. Superfici AI non guidate

### 5.1 Assistente del sito (RAG)

```
┌──────────────────────────────────────────────────────────────┐
│  site_chat (4 collezioni: counselorbot, competenzestrategiche,│
│              questionari, framework)                          │
│                                                              │
│  Contesti base: counselorbot_chat_context,                   │
│                 framework_chat_context,                       │
│                 questionari_chat_context                      │
│  + site_chat_system_prompt, site_chat_knowledge_card,        │
│    site_chat_collection_descriptions,                        │
│    site_chat_retrieval_params, site_chat_followup_*,         │
│    site_chat_output_limits                                   │
│                                                              │
│  Flusso: domanda → retrieval (top-k) → composizione prompt → │
│          LLM → risposta (con citazioni)                      │
└──────────────────────────────────────────────────────────────┘
```

| Chiave | Ruolo |
|--------|-------|
| `site_chat_system_prompt` | System prompt dell'assistente |
| `site_chat_knowledge_card` | Scheda di conoscenza |
| `site_chat_collection_descriptions` | Descrizioni delle 4 collezioni |
| `site_chat_retrieval_params` | Parametri di retrieval (top-k, soglia) |
| `site_chat_followup_system_prompt` | System prompt dei follow-up |
| `site_chat_followup_user_prompt` | Prompt utente dei follow-up |
| `site_chat_output_limits` | Limiti di output |
| `counselorbot_chat_context` | Contesto base CounselorBot |
| `prompt_counselorbot_chat_docente` | Prompt docente |
| `prompt_counselorbot_chat_studente` | Prompt studente |
| `framework_chat_context` | Contesto Framework |
| `questionari_chat_context` | Contesto Questionari |

### 5.2 Bussola (Compass) — `orientation.py`

Prompt inline per la Bussola: orientamento, sintesi del percorso, suggerimenti di strumenti. Non ha chiavi config dedicate: i prompt sono hardcoded in `orientation.py`.

### 5.3 pQBL — `pqbl_*`

| Chiave | Ruolo |
|--------|-------|
| `pqbl_question_generation_prompt` | Generazione domande |
| `pqbl_onboarding_text` | Testo onboarding studente |
| `pqbl_model` | Modello dedicato (opzionale) |

### 5.4 Sintesi cross-strumento

Prompt inline in `chat_logic.py` (sezione «Cross-instrument synthesis»): produce una sintesi tra 2+ strumenti completati. Non ha chiave config dedicata.

### 5.5 Sintesi Idea

Prompt inline per la sintesi della mappa idea. Non ha chiave config dedicata.

### 5.6 Servizi interni (prompt inline, non config)

| Servizio | File | Prompt |
|----------|------|--------|
| Traduzioni | `translation.py` | Prompt di traduzione (inline) |
| OCR / estrazione QSA | `qsa_extraction.py` | Prompt di estrazione punteggi |
| Bozza consiglio orientativo | `orientation_advice.py` | Prompt di bozza |
| Teacher noticing | `teacher_noticing.py` | Prompt di analisi |
| Journey evidence | `journey_evidence.py` | Prompt di estrazione evidenze |
| Cross-instrument synthesis | `chat_logic.py` | Prompt di sintesi |
| Idea synthesis | `idea_synthesis.py` | Prompt di sintesi mappa |

### 5.7 Bussola e altri prompt inline

Tutti i prompt dei servizi interni §5.6 sono inline nel codice: non sono modificabili dall'admin via Mappa dei prompt. Per modificarli occorre editare il codice.

---

## 6. Dove si modifica cosa

| Obiettivo | Dove |
|-----------|------|
| Testo di uno step guidato | Admin → Mappa dei prompt → livello Step; oppure tabella `guided_steps.prompt` |
| System prompt di modalità | Admin → Mappa dei prompt → livello Strumento; oppure `configs` chiave `prompt_*` |
| Meta prompt base/step | Admin → Mappa dei prompt → livello Step/Strumento; oppure `configs` chiave `prompt_meta_*` |
| Direttiva globale | Admin → Configurazione → `directive_*` |
| Testo statico di fase | Admin → `text_*` |
| Etichetta fissa | Admin → `label_*` |
| Assistente del sito | Admin → `site_chat_*` |
| pQBL | Admin → `pqbl_*` |
| Default di fabbrica | `backend/prompt_config.py` + `backend/prompts/*.md` (non sovrascrivono il DB) |
| Contratti runtime | `backend/prompt_contract.py` (codice) |
| Blocchi privati | `backend/event_booklet.py`, `backend/goal_draft.py` (codice) |
| Servizi interni | File in §5.6 (codice) |
| Skill | `backend/skills_seed.py` (codice) |

---

## 7. Verifiche e manutenzione

### 7.1 Conteggi da mantenere coerenti

| Grandezza | Valore attuale |
|-----------|----------------|
| Definizioni `ALL_CONFIG_TEXT_DEFINITIONS` | 131 |
| Step totali (12 strumenti) | 101 |
| Config di fabbrica (`factory_catalog`) | 97 |
| Skill | 9 |
| Fasi essenziali virtuali | 13 |
| Strumenti con blocco privato | 3 (EVENTO_*, OBIETTIVO_*, IDEA) |
| Strumenti senza fasi fisse | 3 (SAVICKAS, OBIETTIVO_*, IDEA) |
| Strumenti con percorso essenziale | 3 (QSA, OBIETTIVO_STUDIO, OBIETTIVO_DOCENZA) |

### 7.2 Quando aggiornare questo documento

- Aggiunta/rimozione di uno strumento o di uno step.
- Cambio di una chiave config o di un mode.
- Modifica della pipeline del turno (ordine dei blocchi).
- Nuovo blocco privato o nuovo contratto runtime.
- Nuova skill.

### 7.3 Fonti autorevoli da consultare

- `backend/prompt_config.py` — registro default.
- `backend/prompt_map.py` — livelli e regole Mappa dei prompt.
- `backend/chat_logic.py` — risoluzione mode/meta, envelope.
- `backend/chat_preparation.py` — ordine dei blocchi.
- `backend/prompt_contract.py` — contratti runtime.
- `backend/routes/chat.py` — testi di fase.
- `backend/routes/site_chat.py` — assistente del sito.
- `backend/orientation.py` — Bussola.
- `docs/operations/admin-prompt-map.md` — regole Mappa dei prompt.
- `docs/operations/prompt-factory-alignment.md` — perimetro di fabbrica.

---

## Appendice A — Indice dei 101 step

| # | Strumento | id | sort | mode |
|---|-----------|----|------|------|
| 1 | QSA |  | 0 |  |
| 2 | QSA |  | 1 |  |
| 3 | QSA |  | 2 |  |
| 4 | QSA |  | 3 |  |
| 5 | QSA |  | 4 |  |
| 6 | QSA |  | 5 |  |
| 7 | QSA |  | 6 |  |
| 8 | QSA |  | 7 |  |
| 9 | QSA |  | 8 |  |
| 10 | QSA |  | 9 |  |
| 11 | QSA |  | 10 |  |
| 12 | QSAr |  | 0 |  |
| 13 | QSAr |  | 1 |  |
| 14 | QSAr |  | 2 |  |
| 15 | QSAr |  | 3 |  |
| 16 | QSAr |  | 4 |  |
| 17 | QSAr |  | 5 |  |
| 18 | QSAr |  | 6 |  |
| 19 | QSAr |  | 7 |  |
| 20 | QSAr |  | 8 |  |
| 21 | QSAr |  | 9 |  |
| 22 | ZTPI |  | 0 |  |
| 23 | ZTPI |  | 1 |  |
| 24 | ZTPI |  | 2 |  |
| 25 | ZTPI |  | 3 |  |
| 26 | ZTPI |  | 4 |  |
| 27 | ZTPI |  | 5 |  |
| 28 | ZTPI |  | 6 |  |
| 29 | ZTPI |  | 7 |  |
| 30 | SAVICKAS |  | -1 |  |
| 31 | SAVICKAS |  | 0 |  |
| 32 | SAVICKAS |  | 1 |  |
| 33 | SAVICKAS |  | 2 |  |
| 34 | SAVICKAS |  | 3 |  |
| 35 | SAVICKAS |  | 4 |  |
| 36 | SAVICKAS |  | 5 |  |
| 37 | SAVICKAS |  | 6 |  |
| 38 | EVENTO_STUDIO |  | -1 |  |
| 39 | EVENTO_STUDIO |  | 0 |  |
| 40 | EVENTO_STUDIO |  | 1 |  |
| 41 | EVENTO_STUDIO |  | 2 |  |
| 42 | EVENTO_STUDIO |  | 3 |  |
| 43 | EVENTO_STUDIO |  | 4 |  |
| 44 | EVENTO_STUDIO |  | 5 |  |
| 45 | EVENTO_STUDIO |  | 6 |  |
| 46 | EVENTO_STUDIO |  | 7 |  |
| 47 | EVENTO_PROFESSIONALE |  | -1 |  |
| 48 | EVENTO_PROFESSIONALE |  | 0 |  |
| 49 | EVENTO_PROFESSIONALE |  | 1 |  |
| 50 | EVENTO_PROFESSIONALE |  | 2 |  |
| 51 | EVENTO_PROFESSIONALE |  | 3 |  |
| 52 | EVENTO_PROFESSIONALE |  | 4 |  |
| 53 | EVENTO_PROFESSIONALE |  | 5 |  |
| 54 | EVENTO_PROFESSIONALE |  | 6 |  |
| 55 | EVENTO_PROFESSIONALE |  | 7 |  |
| 56 | OBIETTIVO_STUDIO |  | -1 |  |
| 57 | OBIETTIVO_STUDIO |  | 1 |  |
| 58 | OBIETTIVO_STUDIO |  | 2 |  |
| 59 | OBIETTIVO_STUDIO |  | 5 |  |
| 60 | OBIETTIVO_STUDIO |  | 6 |  |
| 61 | OBIETTIVO_STUDIO |  | 7 |  |
| 62 | OBIETTIVO_DOCENZA |  | -1 |  |
| 63 | OBIETTIVO_DOCENZA |  | 1 |  |
| 64 | OBIETTIVO_DOCENZA |  | 2 |  |
| 65 | OBIETTIVO_DOCENZA |  | 5 |  |
| 66 | OBIETTIVO_DOCENZA |  | 6 |  |
| 67 | OBIETTIVO_DOCENZA |  | 7 |  |
| 68 | QPCS |  | 1 |  |
| 69 | QPCS |  | 0 |  |
| 70 | QPCS |  | 2 |  |
| 71 | QPCS |  | 3 |  |
| 72 | QPCS |  | 4 |  |
| 73 | QPCS |  | 5 |  |
| 74 | QPCS |  | 6 |  |
| 75 | QPCS |  | 7 |  |
| 76 | QPCS |  | 8 |  |
| 77 | QPCC |  | 1 |  |
| 78 | QPCC |  | 0 |  |
| 79 | QPCC |  | 2 |  |
| 80 | QPCC |  | 3 |  |
| 81 | QPCC |  | 4 |  |
| 82 | QPCC |  | 5 |  |
| 83 | QPCC |  | 6 |  |
| 84 | QPCC |  | 7 |  |
| 85 | QPCC |  | 8 |  |
| 86 | QAP |  | 1 |  |
| 87 | QAP |  | 0 |  |
| 88 | QAP |  | 2 |  |
| 89 | QAP |  | 3 |  |
| 90 | QAP |  | 4 |  |
| 91 | QAP |  | 5 |  |
| 92 | QAP |  | 6 |  |
| 93 | QAP |  | 7 |  |
| 94 | IDEA |  | 0 |  |
| 95 | IDEA |  | 1 |  |
| 96 | IDEA |  | 2 |  |
| 97 | IDEA |  | 3 |  |
| 98 | IDEA |  | 4 |  |
| 99 | IDEA |  | 5 |  |
| 100 | IDEA |  | 6 |  |
| 101 | IDEA |  | 7 |  |
| 1 | QSA | `intro` | 0 | `intro` |
| 2 | QSA | `cognitive` | 1 | `factor` |
| 3 | QSA | `affective` | 2 | `factor` |
| 4 | QSA | `sl-elaboration` | 3 | `second-level` |
| 5 | QSA | `sl-selfcontrol` | 4 | `second-level` |
| 6 | QSA | `sl-motivation` | 5 | `second-level` |
| 7 | QSA | `sl-emotions` | 6 | `second-level` |
| 8 | QSA | `sl-attribution` | 7 | `second-level` |
| 9 | QSA | `sl-social` | 8 | `second-level` |
| 10 | QSA | `sl-synthesis` | 9 | `second-level` |
| 11 | QSA | `sl-strategies` | 10 | `strategies` |
| 12 | QSAr | `qsar-intro` | 0 | `intro` |
| 13 | QSAr | `qsar-cognitive` | 1 | `qsar-factor` |
| 14 | QSAr | `qsar-affective` | 2 | `qsar-factor` |
| 15 | QSAr | `qsar-processing` | 3 | `qsar-second-level` |
| 16 | QSAr | `qsar-selfcontrol` | 4 | `qsar-second-level` |
| 17 | QSAr | `qsar-motivation` | 5 | `qsar-second-level` |
| 18 | QSAr | `qsar-emotions` | 6 | `qsar-second-level` |
| 19 | QSAr | `qsar-attributions` | 7 | `qsar-second-level` |
| 20 | QSAr | `qsar-synthesis` | 8 | `qsar-second-level` |
| 21 | QSAr | `qsar-strategies` | 9 | `strategies` |
| 22 | ZTPI | `ztpi-intro` | 0 | `intro` |
| 23 | ZTPI | `ztpi-t1` | 1 | `ztpi-factor` |
| 24 | ZTPI | `ztpi-t2` | 2 | `ztpi-factor` |
| 25 | ZTPI | `ztpi-t3` | 3 | `ztpi-factor` |
| 26 | ZTPI | `ztpi-t4` | 4 | `ztpi-factor` |
| 27 | ZTPI | `ztpi-t5` | 5 | `ztpi-factor` |
| 28 | ZTPI | `ztpi-btp` | 6 | `ztpi-btp` |
| 29 | ZTPI | `ztpi-strategies` | 7 | `strategies` |
| 30 | SAVICKAS | `savickas-intro` | -1 | `intro` |
| 31 | SAVICKAS | `savickas-patto` | 0 | `savickas-interview` |
| 32 | SAVICKAS | `savickas-q1` | 1 | `savickas-interview` |
| 33 | SAVICKAS | `savickas-q2` | 2 | `savickas-interview` |
| 34 | SAVICKAS | `savickas-q3` | 3 | `savickas-interview` |
| 35 | SAVICKAS | `savickas-q4` | 4 | `savickas-interview` |
| 36 | SAVICKAS | `savickas-q5` | 5 | `savickas-interview` |
| 37 | SAVICKAS | `savickas-final` | 6 | `savickas-summary` |
| 38 | EVENTO_STUDIO | `evstudio-intro` | -1 | `intro` |
| 39 | EVENTO_STUDIO | `evstudio-patto` | 0 | `evento-interview` |
| 40 | EVENTO_STUDIO | `evstudio-evento` | 1 | `evento-interview` |
| 41 | EVENTO_STUDIO | `evstudio-fatto` | 2 | `evento-interview` |
| 42 | EVENTO_STUDIO | `evstudio-funzionato` | 3 | `evento-interview` |
| 43 | EVENTO_STUDIO | `evstudio-criticita` | 4 | `evento-interview` |
| 44 | EVENTO_STUDIO | `evstudio-rilettura` | 5 | `evento-interview` |
| 45 | EVENTO_STUDIO | `evstudio-prossima` | 6 | `evento-interview` |
| 46 | EVENTO_STUDIO | `evstudio-final` | 7 | `evento-summary` |
| 47 | EVENTO_PROFESSIONALE | `evprof-intro` | -1 | `intro` |
| 48 | EVENTO_PROFESSIONALE | `evprof-patto` | 0 | `evento-interview` |
| 49 | EVENTO_PROFESSIONALE | `evprof-evento` | 1 | `evento-interview` |
| 50 | EVENTO_PROFESSIONALE | `evprof-fatto` | 2 | `evento-interview` |
| 51 | EVENTO_PROFESSIONALE | `evprof-funzionato` | 3 | `evento-interview` |
| 52 | EVENTO_PROFESSIONALE | `evprof-criticita` | 4 | `evento-interview` |
| 53 | EVENTO_PROFESSIONALE | `evprof-rilettura` | 5 | `evento-interview` |
| 54 | EVENTO_PROFESSIONALE | `evprof-prossima` | 6 | `evento-interview` |
| 55 | EVENTO_PROFESSIONALE | `evprof-final` | 7 | `evento-summary` |
| 56 | OBIETTIVO_STUDIO | `obbstudio-intro` | -1 | `intro` |
| 57 | OBIETTIVO_STUDIO | `obbstudio-partenza` | 1 | `obiettivo-interview` |
| 58 | OBIETTIVO_STUDIO | `obbstudio-livello` | 2 | `obiettivo-interview` |
| 59 | OBIETTIVO_STUDIO | `obbstudio-piano` | 5 | `obiettivo-interview` |
| 60 | OBIETTIVO_STUDIO | `obbstudio-verifica` | 6 | `obiettivo-interview` |
| 61 | OBIETTIVO_STUDIO | `obbstudio-final` | 7 | `obiettivo-summary` |
| 62 | OBIETTIVO_DOCENZA | `obbdocenza-intro` | -1 | `intro` |
| 63 | OBIETTIVO_DOCENZA | `obbdocenza-partenza` | 1 | `obiettivo-interview` |
| 64 | OBIETTIVO_DOCENZA | `obbdocenza-livello` | 2 | `obiettivo-interview` |
| 65 | OBIETTIVO_DOCENZA | `obbdocenza-piano` | 5 | `obiettivo-interview` |
| 66 | OBIETTIVO_DOCENZA | `obbdocenza-verifica` | 6 | `obiettivo-interview` |
| 67 | OBIETTIVO_DOCENZA | `obbdocenza-final` | 7 | `obiettivo-summary` |
| 68 | QPCS | `qpcs-profilo` | 1 | `qpcs-factor` |
| 69 | QPCS | `qpcs-intro` | 0 | `qpcs-analysis` |
| 70 | QPCS | `qpcs-emozioni` | 2 | `qpcs-analysis` |
| 71 | QPCS | `qpcs-comunicazione` | 3 | `qpcs-analysis` |
| 72 | QPCS | `qpcs-volizione` | 4 | `qpcs-analysis` |
| 73 | QPCS | `qpcs-apprendimento` | 5 | `qpcs-analysis` |
| 74 | QPCS | `qpcs-fiducia` | 6 | `qpcs-analysis` |
| 75 | QPCS | `qpcs-sintesi` | 7 | `qpcs-summary` |
| 76 | QPCS | `qpcs-strategie` | 8 | `strategies` |
| 77 | QPCC | `qpcc-profilo` | 1 | `qpcc-factor` |
| 78 | QPCC | `qpcc-intro` | 0 | `qpcc-interview` |
| 79 | QPCC | `qpcc-comunicazione` | 2 | `qpcc-interview` |
| 80 | QPCC | `qpcc-controllo` | 3 | `qpcc-interview` |
| 81 | QPCC | `qpcc-volizione` | 4 | `qpcc-interview` |
| 82 | QPCC | `qpcc-elaborazione` | 5 | `qpcc-interview` |
| 83 | QPCC | `qpcc-convinzioni` | 6 | `qpcc-interview` |
| 84 | QPCC | `qpcc-sintesi` | 7 | `qpcc-summary` |
| 85 | QPCC | `qpcc-strategie` | 8 | `strategies` |
| 86 | QAP | `qap-profilo` | 1 | `qap-factor` |
| 87 | QAP | `qap-intro` | 0 | `qap-interview` |
| 88 | QAP | `qap-preoccupazione` | 2 | `qap-interview` |
| 89 | QAP | `qap-controllo` | 3 | `qap-interview` |
| 90 | QAP | `qap-curiosita` | 4 | `qap-interview` |
| 91 | QAP | `qap-fiducia` | 5 | `qap-interview` |
| 92 | QAP | `qap-sintesi` | 6 | `qap-summary` |
| 93 | QAP | `qap-strategie` | 7 | `strategies` |
| 94 | IDEA | `idea-intro` | 0 | `idea-focus` |
| 95 | IDEA | `idea-statement` | 1 | `idea-focus` |
| 96 | IDEA | `idea-assumptions` | 2 | `idea-focus` |
| 97 | IDEA | `idea-evidence` | 3 | `idea-focus` |
| 98 | IDEA | `idea-alternatives` | 4 | `idea-focus` |
| 99 | IDEA | `idea-implications` | 5 | `idea-focus` |
| 100 | IDEA | `idea-question` | 6 | `idea-focus` |
| 101 | IDEA | `idea-synthesis` | 7 | `idea-focus` |

---

## Appendice B — Le 9 skill (istruzioni in `skills_seed.py`)

| # | Skill | Descrizione sintetica |
|---|-------|----------------------|
| 1 | `approved-strategies` | Strategie approvate per l'area di miglioramento |
| 2 | `certified-advice` | Consigli certificati (letteratura) |
| 3 | `profile-wayfinder` | Navigazione del profilo studente |
| 4 | `reading-guide` | Guida alla lettura dei risultati |
| 5 | `profile-comparison` | Confronto tra profili/strumenti |
| 6 | `web-lookup` | Ricerca web contestuale |
| 7 | `concept-diagram` | Diagramma concettuale |
| 8 | `idea-focus` | Focus e mappa dell'idea (IDEA) |
| 9 | `referral-guide` | Guida al rinvio ad altri servizi |

---

*Fine del prospetto. Testi completi: Mappa dei prompt dell'admin, export `/admin/guided-steps/export`, tabelle `configs` e `guided_steps`.*
