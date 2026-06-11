# Piano: strumento pQBL da PDF (metodo Bälter)

Nuovo strumento per CounselorBot: lo studente carica un PDF di studio, l'AI lo legge e genera
una sessione di **sole domande a scelta multipla con feedback formativo** (pure Question-Based
Learning), configurabile a **10, 20 o 30 domande**.

Riferimento: Jemstedt, Bälter, Gavel, Glassey & Bosk (2025), *Less to produce and less to
consume: the advantage of pure question-based learning*, Interactive Learning Environments,
33(2), 1040–1061. DOI: 10.1080/10494820.2024.2362830.

> Nota: questo piano è distinto da `docs/implementazione/pQBL-counselorbot.md`, che applica il
> pQBL al flusso guidato QSA. Qui il contenuto viene da un PDF caricato dallo studente.

---

## 1. Requisiti pedagogici derivati dall'articolo (vincolanti)

Ogni punto qui sotto è una scelta di design esplicita dello studio e va replicata:

| # | Regola dell'articolo | Dove si applica nel nostro design |
|---|---------------------|-----------------------------------|
| R1 | Ogni MCQ = domanda + **4 alternative (1 corretta + 3 distrattori)**; nessuna alternativa ovviamente giusta o sbagliata | Prompt di generazione + validatore |
| R2 | **Feedback costruttivo unico per ogni alternativa**. Per la corretta: conferma + spiega perché. Per i distrattori: spiega perché è sbagliata **senza rivelare la risposta corretta** | Prompt + validatore (check che il feedback del distrattore non citi l'opzione corretta) |
| R3 | Le domande sono organizzate per **skill** ("saper fare X"), ~4 MCQ per skill | Fase di estrazione skill dal PDF |
| R4 | **Onboarding obbligatorio**: le domande non sono un esame ma un modo per imparare; lo sforzo è normale e aiuta; consigliato spezzare in sessioni brevi | Prima schermata della sessione |
| R5 | Si può **rispondere più volte** alla stessa domanda, anche dopo aver azzeccato (per leggere gli altri feedback) | UI domanda: opzioni restano cliccabili |
| R6 | **Ordine delle alternative randomizzato** a ogni presentazione (e ri-randomizzato dopo ogni risposta) | Server-side al momento del rendering |
| R7 | **Test finale opzionale**: 1 domanda per skill (la prima di ogni skill), una sola risposta consentita, feedback solo alla fine | Modalità `final_test` della sessione |
| R8 | Metriche: % corrette **al primo tentativo** in apprendimento; soglie qualità: iniziale scarso <50%, finale buono >80%; tempo stimato con cap inattività 5 min | Logging tentativi + summary |

## 2. Architettura

### 2.1 Pipeline di generazione (backend, nuovo modulo `backend/pqbl_generator.py`)

```
PDF → estrazione testo → estrazione skill → generazione MCQ per skill → validazione → persistenza
```

1. **Estrazione testo**: `pypdf` per PDF testuali (nuova dipendenza in `backend/requirements.txt`);
   fallback OCR riusando la pipeline esistente di `qsa_extractor.py` (pdf2image + modello OCR
   Ollama) per PDF scansionati. Limiti: max pagine (~40) e max caratteri (~60k) per restare nel
   contesto del modello; PDF più lunghi → si campiona/tronca con avviso allo studente.
2. **Estrazione skill** (1 chiamata LLM): dal testo si derivano `K = ceil(N/4)` skill in formato
   "saper …" (R3), dove N = dimensione sessione scelta (10/20/30 → K = 3/5/8).
3. **Generazione MCQ** (1 chiamata LLM per skill, parallelizzabili): per ogni skill 4 MCQ in JSON
   strutturato `{question, options: [{text, correct, feedback}]}` rispettando R1–R2. La lingua
   delle domande = lingua del PDF (rilevata in fase di estrazione; default IT).
4. **Validatore puro-Python** (testabile senza rete): esattamente 4 opzioni, esattamente 1
   corretta, feedback non vuoto per ogni opzione, feedback dei distrattori che non contiene il
   testo dell'opzione corretta (R2). Skill che falliscono → 1 retry, poi errore esplicito.
5. **Persistenza** del question bank legato al documento. Se generate più domande di N, si
   tronca mantenendo ≥3 per skill.

La generazione di 30 domande richiede minuti → **job in background** (`BackgroundTasks` di
FastAPI o thread, come già fa `rag_index`): l'upload risponde subito con `document_id` e stato
`processing`; il frontend fa polling su un endpoint di stato.

Tutte le chiamate LLM passano da `AIService` (provider registry esistente) e rispettano il
contratto errori: fallimenti → `AIError` → HTTP 502, mai stringhe d'errore come contenuto.

### 2.2 Prompt come Config (convenzione del progetto)

Tre nuove righe `Config` seedate in `prompt_config.py` (in inglese, come gli altri prompt;
modificabili da admin in `ConfigForm`):

- `pqbl_skill_extraction_prompt` — istruzioni per derivare le skill dal testo
- `pqbl_question_generation_prompt` — istruzioni R1+R2 per generare le 4 MCQ di una skill
- `pqbl_onboarding_text` — testo onboarding R4 (questo invece in IT/EN, è rivolto allo studente)

Più una config opzionale `pqbl_model` per scegliere un modello dedicato alla generazione
(default: provider/modello attivi).

### 2.3 Modelli DB (nuove tabelle, migrazione idempotente in `startup_event`)

```
PqblDocument   id, session_id/user, filename, text_hash, language,
               status (processing|ready|error), error_detail, created_at
PqblQuestion   id, document_id, skill, position, question_text,
               options JSON [{key, text, correct, feedback}]
PqblSession    id, document_id, size (10|20|30), mode (learning|final_test),
               started_at, finished_at
PqblAttempt    id, session_id, question_id, selected_key, correct (bool),
               first_try (bool), created_at
```

`text_hash` permette di riusare il question bank se lo stesso PDF viene ricaricato.

### 2.4 API (nuovo router `backend/routes/pqbl.py`, montato in `main.py`)

| Endpoint | Funzione |
|----------|----------|
| `POST /pqbl/upload` | Upload PDF (riusa pattern/limiti di `/qsa/upload`: 10 MB, suffissi). Param `size` ∈ {10,20,30}. Avvia generazione, ritorna `document_id` |
| `GET /pqbl/documents/{id}` | Stato generazione (`processing/ready/error`) per polling |
| `POST /pqbl/sessions` | Crea sessione (learning o final_test) su documento `ready` |
| `GET /pqbl/sessions/{id}/questions` | Domande della sessione **senza** flag `correct` né feedback (anti-cheating: la verifica è solo server-side), opzioni già randomizzate (R6) |
| `POST /pqbl/sessions/{id}/answer` | `{question_id, option_key}` → `{correct, feedback}`; registra `PqblAttempt` con `first_try` (R5, R8) |
| `POST /pqbl/sessions/{id}/final-test` | Submit batch unico delle risposte → correzione + feedback completi (R7) |
| `GET /pqbl/sessions/{id}/summary` | % primo tentativo, per-skill, tempo stimato con cap 5 min (R8) |

> Dockerfile: nessun nuovo COPY necessario se i file restano in `backend/*.py` e
> `backend/routes/` (già copiati). Da verificare comunque al momento dell'implementazione.

### 2.5 Frontend

- **Entry point**: nuova card nella pagina strumenti → route `frontend/src/app/strumenti/pqbl/page.tsx`
  (o `app/pqbl/`); riusa lo stile di `PDFUploader.tsx` per l'upload.
- **Flusso UI**:
  1. Upload PDF + scelta dimensione sessione (10/20/30)
  2. Schermata di attesa con polling stato generazione (progress per skill)
  3. **Onboarding** (R4) con testo da config
  4. Loop domande: testo domanda, 4 bottoni opzione; al click → chiamata `answer` → pannello
     feedback sotto l'opzione scelta; le altre opzioni restano cliccabili (R5); pulsante
     "Prossima domanda"; barra di progresso
  5. Fine sessione → riepilogo + proposta **test finale** (R7): stessa UI ma risposta singola,
     submit unico, feedback alla fine
  6. Summary: % primo tentativo, dettaglio per skill, confronto learning vs test finale
- **i18n**: nuove chiavi in `i18n.ts` (IT + EN, entrambe le sezioni).
- Niente streaming SSE: le risposte sono JSON puntuali, basta il rewrite standard `/api/*`.

### 2.6 Admin

- I tre prompt compaiono automaticamente in `ConfigForm` una volta seedati.
- (Fase 2, opzionale) Pagina admin per ispezionare i question bank generati, eliminarli o
  rigenerarli — utile per controllo qualità editoriale.

### 2.7 Test (`backend/tests/test_smoke.py`)

- Aggiornare l'inventario route con i nuovi endpoint `/pqbl/*`.
- Unit test del validatore puro (R1/R2) con casi: opzione corretta mancante/doppia, feedback
  mancante, feedback distrattore che rivela la risposta.
- Test endpoint con `AIService` mockato (come già fatto per chat): upload finto → generazione
  mockata → sessione → answer → summary, verificando `first_try` e che `GET questions` non
  esponga mai `correct`/feedback.

## 3. Fasi di lavoro

| Fase | Contenuto | Stima |
|------|-----------|-------|
| 1 | `pqbl_generator.py` (estrazione testo, skill, MCQ, validatore) + prompt in `prompt_config.py` + tabelle/migrazione | core, ~metà del lavoro |
| 2 | Router `/pqbl/*` + logica sessione/tentativi/summary + smoke test | |
| 3 | Frontend: pagina strumento, flusso completo, i18n IT/EN | |
| 4 | Test finale (R7) + summary avanzato + rifiniture admin | opzionale al primo rilascio |
| 5 | Rebuild Docker (`docker compose build backend frontend && up -d`) + smoke test nel container | |

## 4. Decisioni aperte (con raccomandazione)

1. **Quando scegliere 10/20/30**: alla creazione del documento (genera esattamente N) o sempre
   bank da 30 con sessioni a sottoinsiemi. **Raccomandato: generare esattamente N all'upload**
   — meno token, più semplice; il riuso via `text_hash` copre il ricaricamento dello stesso PDF.
2. **Test finale nel v1**: l'articolo lo usa per misurare l'apprendimento. **Raccomandato: sì
   ma come opzione** a fine sessione, non obbligatorio.
3. **Autenticazione**: strumento dietro ai4auth come il resto, sessioni legate all'utente
   `Remote-*`. **Raccomandato: sì**, così il summary è recuperabile.
4. **Domande aperte riflessive**: fuori dal metodo pQBL puro (solo MCQ). **Raccomandato: no nel
   v1**; eventualmente una domanda metacognitiva finale in fase 4.
5. **PDF molto lunghi** (dispense intere): v1 tronca a ~60k caratteri con avviso.
   In futuro: selezione capitoli o campionamento per sezione.
