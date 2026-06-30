# Diario di Bordo / Project Journal

Questo file raccoglie la cronologia dettagliata delle attività svolte per il progetto **CounselorBot** e la validazione dei questionari.

---

## Versione Italiana (Cronologica)

### 30 Giugno 2026 - README in inglese e verifica link
* **README aggiornati**: riscritti in inglese i README del repository, della cartella `docs/`, del frontend e degli archivi locali delle fonti.
* **Allineamento al codice**: documentati stack attuale, flussi principali, route frontend/backend, setup Docker, sviluppo locale, pQBL, assistente RAG, admin console e test dei prompt.
* **Igiene dei link**: verificati i link locali nei README tracciati da Git e rimossi dai README gli URL esterni non certificabili o già noti come non disponibili.
* **Git**: modifiche documentali tracciate nella cronologia Git con commit dedicati.

### 30 Maggio 2026 - Organizzazione documentazione
* **Cartella unica `docs/`**: Consolidata la documentazione stabile del progetto in `docs/`, con indice principale in [`docs/README.md`](../README.md).
* **Nuova tassonomia**: Organizzati i materiali in `progetto/`, `validazione/`, `questionari/`, `prompting/`, `implementazione/` e `fonti/`.
* **Proposta implementata**: Archiviata la proposta di migrazione in [`proposta-organizzazione-docs-implementata-2026-05-30.md`](organizzazione/proposta-organizzazione-docs-implementata-2026-05-30.md).
* **Archivio competenzestrategiche.it**: Scaricate le risorse documentali pubbliche mancanti dal sito in [`sito-competenzestrategiche`](../fonti/competenze-strategiche/sito-competenzestrategiche/) e le fonti esterne collegate in [`fonti-esterne-collegate`](../fonti/competenze-strategiche/fonti-esterne-collegate/).
* **Grafo Graphify**: Generato il grafo semantico della cartella `docs/` con `safishamsi/graphify`, archiviato in [`graphify-docs-2026-05-30`](organizzazione/graphify-docs-2026-05-30/).
* **Contatto M. Begoña Alfageme González**: Preparata la bozza di risposta in spagnolo per proporre l'uso della piattaforma CounselorBot nella validazione della versione spagnola del QSA gia' revisionata, con dati operativi per creare un account di prova. Documento archiviato in [`contatto-begona-qsa-es-2026-05-30.md`](comunicazioni/contatto-begona-qsa-es-2026-05-30.md).
* **Sezione admin Validazione**: Implementato il salvataggio delle risposte grezze item-per-item in `validation_responses`, un exporter CSV Python riusabile anche da CLI e un pannello admin per filtrare/esportare dataset per strumento, lingua e versione. Aggiunto generatore di link di raccolta dati con `version`, `cohort` e `study`, piu' metadati anonimi e consenso nella somministrazione.

### 30 Maggio 2026 - Validazione Metodologica e Contatto KTH
* **Dettagli Psicometrici**: Redatto il documento [dettagli-validazione-questionari.md](../validazione/dettagli-validazione-questionari.md) contenente le specifiche dei questionari QSA (100 item, 14 fattori), QSAr (46 item, 8 fattori), ZTPI, QPCS, QPCC e QAP.
* **Manuale Operativo**: Creato [manuale-operativo-validazione.md](../validazione/manuale-operativo-validazione.md) che descrive la procedura di validazione del QSAr in inglese per gli studenti del KTH in 6 passi (preparazione, interviste, studio pilota, raccolta dati, analisi psicometriche con R/CFA e calcolo delle norme Stanine).
* **Contatto con il Prof. Olle Bälter (KTH)**:
  - Scritta la mail di proposta in italiano [mail-olle.md](comunicazioni/mail-olle.md) per presentare il progetto QSA/QSAr e proporre una collaborazione attiva con gli studenti del KTH.
  - Tradotta la mail in inglese [mail-olle-en.md](comunicazioni/mail-olle-en.md).

### 29 Maggio 2026 - Questionnaire Editor e Integrazione Admin
* **Editor Questionari**: Implementato il componente frontend `QuestionnaireEditor` per la gestione dinamica di metadati, fattori, item e regole dal pannello amministratore.
* **Seeding Database**: Aggiunti i cataloghi degli item e le scale di risposta in formato JSON per i questionari QSAr e ZTPI. Creato uno script per generare il catalogo dei questionari per il seeding iniziale del database.

### 24 Maggio 2026 - Tracciamento Profili e Refactoring Backend
* **Calcolo Punteggi**: Sviluppata la logica di calcolo del profilo ed elaborazione punteggi (`test-scoring.ts`) e tracciamento dei test completati (`profile-tracker.ts`) per QSA/QSAr in italiano, inglese e svedese.
* **Refactoring Backend**: Suddiviso l'originario `main.py` di 1392 righe in router modulari per una migliore manutenibilità (`routes/admin`, `routes/survey`, `routes/chat`, `routes/memory`).
* **Integrazione AI**: Migrato il client SDK di Gemini a `google-genai` per supportare la ricerca live dei modelli e migliorata la gestione degli errori AI (`AIError`).

### 23 Maggio 2026 - Aggiornamento UI e Chat Streaming
* **Restyling Indigo**: Rinnovato il design di `ChatInterface`, `GuidedChatInterface`, `PDFUploader` e visualizzazione del profilo adottando una palette cromatica basata sul colore Indigo.
* **Reasoning AI**: Aggiunto il supporto e la visualizzazione del "ragionamento" (reasoning) dell'assistente AI nella chat guidata, con traduzioni in varie lingue.
* **Streaming API**: Implementate le API di streaming per le risposte della chat in tempo reale.

### 13 Aprile 2026 - Riassunti di Sessione e Savickas
* **Counseling Summaries**: Aggiornato il sistema di riepilogo delle sessioni di counseling e la gestione della memoria conversazionale.
* **Questionario Savickas**: Aggiunto il supporto e la logica d'interazione per il questionario Savickas nella chat guidata.

---

## English Version (Chronological)

### June 30, 2026 - English README files and link check
* **README update**: rewrote the repository, `docs/`, frontend, and local source-archive README files in English.
* **Code alignment**: documented the current stack, main flows, frontend/backend routes, Docker setup, local development, pQBL, the RAG assistant, the admin console, and prompt-testing commands.
* **Link hygiene**: checked local links in Git-tracked README files and removed external URLs that were not certifiable or were already known to be unavailable.
* **Git**: documentation changes were tracked in Git history with dedicated commits.

### May 30, 2026 - Documentation Organization
* **Single `docs/` folder**: Consolidated stable project documentation in `docs/`, with the main index in [`docs/README.md`](../README.md).
* **New taxonomy**: Organized materials into `progetto/`, `validazione/`, `questionari/`, `prompting/`, `implementazione/`, and `fonti/`.
* **Implemented proposal**: Archived the migration proposal in [`proposta-organizzazione-docs-implementata-2026-05-30.md`](organizzazione/proposta-organizzazione-docs-implementata-2026-05-30.md).
* **competenzestrategiche.it archive**: Downloaded missing public documentation from the site into [`sito-competenzestrategiche`](../fonti/competenze-strategiche/sito-competenzestrategiche/) and linked external sources into [`fonti-esterne-collegate`](../fonti/competenze-strategiche/fonti-esterne-collegate/).
* **Graphify graph**: Generated the semantic graph for `docs/` with `safishamsi/graphify`, archived in [`graphify-docs-2026-05-30`](organizzazione/graphify-docs-2026-05-30/).
* **Contact with M. Begoña Alfageme González**: Prepared a Spanish reply proposing CounselorBot as a working platform for validating the already reviewed Spanish QSA version, including operational account-creation data. Archived in [`contatto-begona-qsa-es-2026-05-30.md`](comunicazioni/contatto-begona-qsa-es-2026-05-30.md).
* **Validation admin section**: Implemented item-level raw response storage in `validation_responses`, a reusable Python CSV exporter also available from CLI, and an admin panel to filter/export datasets by instrument, language, and version. Added a data-collection link generator with `version`, `cohort`, and `study`, plus anonymous metadata and consent capture in the administration flow.

### May 30, 2026 - Methodological Validation and KTH Contact
* **Psychometric Details**: Drafted [dettagli-validazione-questionari.md](../validazione/dettagli-validazione-questionari.md) specifying details for QSA (100 items, 14 factors), QSAr (46 items, 8 factors), ZTPI, QPCS, QPCC, and QAP.
* **Operational Manual**: Created [manuale-operativo-validazione.md](../validazione/manuale-operativo-validazione.md) detailing the 6-step validation procedure for QSAr in English for KTH students (preparation, interviews, pilot study, data collection, psychometric analysis with R/CFA, and Stanine norms calculation).
* **Contact with Prof. Olle Bälter (KTH)**:
  - Wrote the proposal email in Italian [mail-olle.md](comunicazioni/mail-olle.md) to outline the QSA/QSAr project and suggest collaboration with KTH students.
  - Translated the email into English [mail-olle-en.md](comunicazioni/mail-olle-en.md).

### May 29, 2026 - Questionnaire Editor and Admin Integration
* **Questionnaire Editor**: Implemented the frontend `QuestionnaireEditor` component for dynamic management of metadata, factors, items, and scoring rules from the admin panel.
* **Database Seeding**: Added JSON item catalogs and response scales for QSAr and ZTPI instruments, along with a seeding helper script to initialize the database catalog.

### May 24, 2026 - Profile Tracking and Backend Refactoring
* **Scoring Logic**: Developed profile scoring calculations (`test-scoring.ts`) and profile tracking logic (`profile-tracker.ts`) supporting QSA/QSAr in Italian, English, and Swedish.
* **Backend Refactoring**: Split the original 1392-line `main.py` into modular route files (`routes/admin`, `routes/survey`, `routes/chat`, `routes/memory`).
* **AI Integration**: Migrated the Gemini SDK client to `google-genai` for live model lists and improved AI error handling (`AIError`).

### May 23, 2026 - UI Restyling and Chat Streaming
* **Indigo Restyling**: Revamped `ChatInterface`, `GuidedChatInterface`, `PDFUploader`, and profile visualization using a modern Indigo color palette.
* **AI Reasoning**: Added support and visual display for the AI assistant's reasoning process in the guided chat, along with multilingual translations.
* **Streaming API**: Implemented real-time chat streaming response endpoints.

### April 13, 2026 - Session Summaries and Savickas
* **Counseling Summaries**: Upgraded the counseling session summary system and conversational memory management.
* **Savickas Questionnaire**: Added integration and interaction logic for the Savickas questionnaire inside the guided chat.
