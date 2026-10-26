# Privacy Layer — Fase 1: analisi dello stato attuale

Stato: **bozza tecnica** (2026-10-24), `main` @ `2d47a5e6`. Riferimenti `file:riga` verificati su quel commit.
Questo documento descrive il codice: **non** è una valutazione di conformità al GDPR (vedi [04](04-decisioni-titolare-dpo.md)).
Nota 2026-10-26: i riferimenti SQLite descrivono il layout 1 analizzato e i bundle correnti. Il target
ADR-0004 porta PostgreSQL 15 su L2/L3 con credenziali nel portachiavi e cluster su loopback, ma non è
ancora implementato; SQLite resterà solo nel converter legacy. Il DPIA dovrà riesaminare il flusso al
momento dell'attivazione, senza assumere che il target sia già una misura disponibile.

Indice: [1 Livelli](#1-i-quattro-livelli-reali) · [2 Stack](#2-stack) · [3 Dati personali](#3-dove-stanno-i-dati-personali) ·
[4 Autenticazione e autorizzazione](#4-autenticazione-e-autorizzazione) · [5 Chiamate ai modelli](#5-tutte-le-uscite-verso-modelli-e-servizi-esterni) ·
[6 Cosa arriva ai modelli](#6-cosa-di-questionari-e-profili-arriva-ai-modelli) · [7 Filtro PII esistente](#7-filtro-pii-esistente) ·
[8 Cifratura e chiavi](#8-cifratura-e-chiavi-già-presenti) · [9 Docente-studente](#9-associazione-docente-studente) ·
[10 Informative e consensi](#10-informative-e-consensi-esistenti) · [11 Lacune](#11-lacune-principali)

---

## 1. I quattro livelli reali

Il repository contiene **un solo backend** (FastAPI, `backend/main.py`) e **un solo frontend** (Next.js, `frontend/`),
installati in profili diversi (ADR-0001, `docs/architecture/adr/0001-installation-profiles-and-desktop-packaging.md`).
I livelli che separano i dati sono quattro:

| # | Livello | Stato nel codice | Responsabilità per la privacy |
|---|---|---|---|
| L1 | **Server** (profilo `console`: server ai4educ e Mac portable; in futuro `school-server`, #212) | in produzione: `docker-compose.yml:2-116`, `docker-compose.portable.yml:5-150`; Postgres 15; identità ai4auth (`backend/auth.py:83-127`) | conserva identità, risultati, conversazioni, classi; esegue tutte le chiamate ai modelli; gestisce chiavi API (solo da env, `backend/api_secrets.py`) |
| L2 | **App desktop docente** (profilo `teacher-pc`) | Fase 1 in corso: guscio Tauri `desktop/teacher/`, contratti ADR-0002; **stesso backend** su SQLite (ADR-0003) | sul PC del docente gira **un intero L1 in miniatura**: backend + frontend + `cloudflared`. È il server dei suoi studenti (ADR-0002 §1.2, §2.1). Docente = admin locale (ADR-0002 §3.3) |
| L3 | **App desktop studente** (profilo `student-pc`) | **non esiste ancora**: solo piano (`docs/architecture/desktop-apps-plan.md` §4) e riga in ADR-0001. In Fase 1 lo studente usa il **browser** via tunnel | Fase 2: SQLite locale cifrato (F2-06), sync a eventi con L2 (F2-01), LLM locale facoltativo (F2-07), mai chiavi del docente (§4.4) |
| L4 | **Livello web / BFF Next.js** (server Next standalone + browser) | presente in tutti i profili: rewrite `/api/:path*` → backend (`frontend/next.config.ts:37-46`), proxy SSE (`frontend/src/lib/stream-proxy.ts`), middleware `frontend/src/proxy.ts`, firma dell'origine (`frontend/src/lib/request-origin.ts`, F1-19) | **unico ingresso** di ogni richiesta verso il backend: decide `tunnel`/`local`, cancella e reimposta le intestazioni `X-CounselorBot-*` (ADR-0002 §2.7); il browser conserva bozze in `localStorage` (es. `QuestionnaireRunner.tsx:195-230`) |

**Perché L4 e non un «gateway AI»**: nel codice non esiste un processo separato verso i provider. Le chiamate ai
modelli partono dal backend, in gran parte da `AIService` (`backend/ai_service.py:222`), ma anche da altri moduli (§5).
`OmniRoute` (`backend/ai_service.py:107`, `docker-compose.yml:53`) è solo **un provider** OpenAI-compatibile esterno al
repo, non un punto di controllo. Il gateway AI richiesto dal brief va quindi **costruito dentro il backend** (design §6),
senza un nuovo servizio. Alternative considerate e scartate come «quarto livello»: Telegram (canale secondario,
`backend/telegram_bot.py`, escluso da teacher-pc), i provider AI (sono esterni, non un livello del sistema).

## 2. Stack

- **Backend**: Python, FastAPI + uvicorn, SQLAlchemy (`backend/database.py`), 112 modelli in `backend/models.py`;
  migrazioni idempotenti a mano (`backend/main.py`, `backend/migrations/*.py`), nessun Alembic. Dipendenze in
  `backend/requirements.txt` (fra cui `cryptography` per Fernet, `passlib[bcrypt]` + `argon2-cffi`, `httpx`, `openai`, `anthropic`,
  `google-genai`, `mistralai`, `edge-tts`).
- **Database**: Postgres 15 su L1, SQLite su L2/L3 (ADR-0003). Il backend deve restare compatibile con entrambi.
- **Frontend**: Next.js standalone, React; i18n in `frontend/src/lib/i18n*.ts`.
- **Desktop**: Tauri v2 (Rust) + sidecar (backend PyInstaller, Node, `cloudflared`) — `desktop/teacher/`.
- **Servizi Compose**: `transcription` (`docker-compose.yml:3`), `piper` (`:21`), `postgres` (`:101`), `frontend` (`:116`).
- **Modelli locali**: Ollama / server OpenAI-compatibili (`LOCAL_PROVIDERS = {'ollama','llamacpp'}`, `backend/ai_service.py:118`).
- **Piattaforme desktop ufficiali**: macOS 13+ arm64/x64, Windows 10/11 x64, Ubuntu 22.04+ x64 (ADR-0001).

## 3. Dove stanno i dati personali

### 3.1 Database (Postgres su L1, SQLite su L2)

| Tabella (riga in `backend/models.py`) | Dati personali | Note |
|---|---|---|
| `users` (`:31`) | username, `hashed_password` | Argon2 via passlib (`backend/auth.py:35`) |
| `logs` (`:140`) | `username`, **`email` in chiaro** (`:150`), `anonymous_research_code`, `details` JSON con `user_input` e `bot_response` | scritto da `routes/chat.py:784-834`, `:999-1054`, `:1514-1537`; redazione solo regex (§7.3) |
| `user_display_names` (`:164`) | nome, email di docenti/ricercatori/admin | |
| `survey_responses` (`:206`) | età, sesso, istruzione, istituto, provenienza, paese, feedback libero | questionario di gradimento, senza username |
| `questionnaire_results` (`:268`) | `username`, `scores` JSON, piano, contatto di ricerca | **profilo psicologico/educativo** (QSA, ZTPI, …) |
| `validation_responses` (`:288`) | dataset grezzo di validazione psicometrica | |
| `anonymous_research_codes` (`:312`) | `username` ↔ codice `SBS-XXXX-XXXX` | tavola di corrispondenza in chiaro (`backend/anonymous_codes.py:20-52`) |
| `research_contacts` (`:324`) | nome, email, telefono, istituto | |
| `learner_profile_revisions` (`:825`), `learner_profile_reflections` (`:843`) | taccuino dello studente: obiettivo, difficoltà, punti di forza, contesto | testo libero, iniettato nei prompt (§6) |
| `orientation_sessions` (`:858`), `frozen_sessions` (`:922`), `memory_session_owners` (`:941`) | conversazioni di orientamento, sessioni sospese | |
| `portfolio_items` (`:900`), `personal_goals` (`:664`), `goal_reviews` (`:725`), `result_readings` (`:740`) | contenuti personali | |
| `teacher_notes` (`:1296`) | note/messaggi del docente su uno studente | consegnabili via Telegram |
| `student_groups` (`:1319`), `group_memberships` (`:1393`), `group_shares` (`:1206`) | relazione docente–classe–studente | §9 |
| `telegram_account_links` (`:1244`), `telegram_conversation_states` (`:1274`) | chat id Telegram ↔ username | |
| `institutions` (`:1557`) | `hashed_password`, **`encrypted_password`** (Fernet) | §8 |
| `institution_teachers` (`:1624`), `institution_verification_*` (`:1594-1616`) | username docenti, tentativi | |
| `personal_api_connections` (`:105`), `chatgpt_connections` (`:50`) | chiavi/token dell'utente cifrati | §8 |
| `idea_references` (`:1476`) | testo estratto da documenti caricati (fino a 24.000 caratteri) | |
| `tavoli` / `tavolo_revisions` / `tavolo_images` (`:1794-1856`), `idea_map_revisions` (`:1453`) | lavori dello studente | |
| `forum_posts` (`:2165`), `class_meeting_*` (`:2001-2103`), `assignment_work` (`:640`) | contributi e presenze | |
| `recommendation_history` (`:955`) | cosa è stato consigliato a chi | |
| `local_sessions`, `class_pairing_codes` | ADR-0002 §3.2, §4.1 (F1-06/F1-13, non ancora su `main`) | solo hash dei token |

Nessuna colonna di contenuto è cifrata a livello applicativo, a parte §8. Su L1 la cifratura a riposo dipende dal
disco del server (**non verificato**); su L2 dipende da FileVault/BitLocker/LUKS del docente (piano desktop §7.1).

### 3.2 File

| Dove | Contenuto | Riferimento |
|---|---|---|
| `SESSION_MEMORY_DIR` | memoria di sessione in Markdown **in chiaro** | `backend/memory_service.py:36`, scrittura `:715` |
| `DATA_DIR/uploads/{portfolio,tavolo,tavolo-images,idea-sources,qsa,pqbl}` | upload (anche scansioni di profili QSA) | ADR-0002 §1.2 |
| `rag/collections/` | documenti caricati dall'admin | ADR-0002 §1.2 |
| `credentials/credential.key` | chiave Fernet dell'installazione (0600) | `backend/credential_storage.py:22-25`, `:43-68` |
| `logs/*.log` (L2) | stdout/stderr dei sidecar | ADR-0002 §2.3 (impegno: niente segreti; nessun impegno esplicito su PII) |
| `backups/*.sqlite3` (L2) | copie del DB **non cifrate** | ADR-0002 §1.2, F1-05j |
| browser `localStorage` | bozze delle compilazioni | `frontend/src/components/administration/QuestionnaireRunner.tsx:212-230` |

### 3.3 Cache, log applicativi, backup

- `web_lookup_cache` (`models.py:1188`): query verso fonti esterne, già ripulite (`backend/web_lookup.py:249`).
- Log Python: `ai_service.py` registra solo il tipo di errore («upstream errors can contain request data», `:969-972`).
  Altri moduli registrano dati: es. `backend/qsa_extractor.py:148` scrive i punteggi estratti nel log.
- Conservazione: solo la tabella `logs`, `log_retention_days` default 90 (`backend/chat_logic.py:165`); memoria di sessione
  con pulizia delle sessioni scadute; nessuna politica per risultati, taccuini, upload, backup.
- Backup L1: non c'è uno script nel repo (`pg_dump` compare solo in `docs/operations/test-instance-hot-reload.md`);
  la chiave Fernet va salvata insieme al DB (`docs/operations/chatgpt-subscription.md:56-74`). **Cifratura dei backup: non verificata.**

## 4. Autenticazione e autorizzazione

- **L1**: ai4auth forward-auth; il backend si fida delle intestazioni `Remote-*` solo con `X-Forwarded-Auth-Secret`
  uguale a `FORWARD_AUTH_SHARED_SECRET` (confronto a tempo costante, `backend/auth.py:84-89`), altrimenti verifica il
  cookie su ai4auth (`:91-114`). Fallisce verso l'identità anonima (`:127`).
- **Ruoli** derivati dai gruppi, non salvati: admin = `ADMIN_GROUPS` (`auth.py:18-20`), docente/ricercatore per marcatori
  di sottostringa (`:21-23`, `:180-182`). Un nome di gruppo che contiene «staff» rende docente.
- **Impersonazione** di profili demo da parte dell'admin (`auth.py:130-168`), limitata a un elenco chiuso.
- Dipendenze: `get_current_user` (`:162`), `get_current_active_admin` (`:171`), `get_current_plan_manager` (`:185`, docente o ricercatore).
- **L2**: fornitore `local` con cookie `cb_session` (hash SHA-256 nel DB), docente via link monouso, studenti con pseudonimo
  e codice personale (ADR-0002 §3-§4); origine `tunnel`/`local` firmata dal frontend, fail-closed (`backend/request_origin.py:1-12`).
- **Accesso ai dati docente→studente**: §9. **Admin**: vede ogni classe (`backend/group_visibility.py:23-26`) e tutti i log;
  nessuna separazione tra amministrazione tecnica e lettura dei contenuti.

## 5. Tutte le uscite verso modelli e servizi esterni

«Filtrato» = passa da `AIService._anonymize_external` (`backend/ai_service.py:704-732`). I provider locali sono esclusi per nome (`:712`).

| # | Punto | Destinazione | Cosa parte | Filtrato |
|---|---|---|---|---|
| 1 | `AIService._response_with_fallback` → `_attempt_input` (`ai_service.py:942-966`, `:916-940`) | provider di chat (13 + `openai_chatgpt`) | messaggio, system prompt, cronologia | sì; ripristino `pii.restore` (`:966`) |
| 2 | `AIService.call_model` (`:981-1010`) | provider esplicito | idem | sì |
| 3 | `AIService.stream_response` (`:1366-1420`) | provider di chat in streaming | idem, ripristino con `StreamRestorer` (`:1396`) | sì |
| 4 | `AIService.generate_summary` (`:1049-1095`) | provider dei riassunti | ultimo scambio | sì (`:1087`), resta con segnaposto |
| 5 | `AIService.call_vision` → `vision_service.call` (`ai_service.py:1025-1047`; `vision_service.py:119-185`) | Ollama, Gemini, Mistral, OpenAI, OpenRouter | **immagine della pagina** + prompt | **solo il prompt**: l'immagine parte intatta (`vision_service.py:140-185`) |
| 6 | `qsa_extractor._ollama_post` (`backend/qsa_extractor.py:152-160`, usi `:191`, `:254`) | Ollama (`ollama_ip`) | scansione profilo QSA e testo OCR | no (assunto locale) |
| 7 | `pqbl_generator._local_ollama_ocr` (`backend/pqbl_generator.py:95-112`) | Ollama | pagine PDF | no (assunto locale) |
| 8 | `pii_ner._ner_entities` (`backend/pii_ner.py:75-110`) | Ollama | **testo in chiaro** da filtrare | per costruzione no: deve essere locale |
| 9 | `embedding_service` (`backend/embedding_service.py:148`, `:431`, `:480-509`) | Ollama, Mistral, OpenRouter | documenti pubblici; query filtrate; `purpose="private"` mai all'esterno (`:76-77`) | sì, politica propria |
| 10 | `chatgpt_responses._stream` (`backend/chatgpt_responses.py:34-41`) | OpenAI (abbonamento ChatGPT dell'utente) | envelope già filtrato da (1)/(3) | sì, a monte |
| 11 | `routes/voice_reader.synthesize` (`backend/routes/voice_reader.py:149-161`) | **Microsoft Edge TTS** (`edge_tts.Communicate`, `:161`) o Piper locale | testo dei messaggi da leggere ad alta voce, già ripristinato in chiaro | **no** |
| 12 | `routes/audio_input` (`backend/routes/audio_input.py:13`, `:42`) | servizio `transcription` del Compose | audio dello studente | no (servizio interno) |
| 13 | `routes/opencode` (`backend/routes/opencode.py:926-1000`) | OpenCode con provider `ollama` (`:81`) | prompt dell'utente | no (locale; escluso da teacher-pc) |
| 14 | `prompt_lab/gateway.py:49`, `prompt_lab/local_models.py:111` | modelli locali di laboratorio | casi sintetici | no (escluso da teacher-pc) |
| 15 | `telegram_bot.send_message` (`backend/telegram_bot.py:52-63`, `:26-28`) | Telegram | messaggi del docente allo studente, riepiloghi | no (non è un modello, ma è un trasferimento esterno) |
| 16 | `web_lookup` (`backend/web_lookup.py:249`, `:360`), `reading_verification.py:49`, `idea_sources.py:288` | Wikipedia, OpenAlex, … | query ridotte | sì (`redact_always`) |
| 17 | `counselor_i18n`, `translation_provider`, `certified_translation`, `instrument_translation` | Ollama / provider | contenuti di catalogo, non personali | n/a |
| 18 | `ai_service.list_models`/`verify_api_key` (`:768-848`), `preload_ollama_model` (`:1726-1747`) | provider | nessun dato personale | n/a |

**Dipendenti da `AIService`** (quindi coperti da 1-4): `routes/chat.py`, `routes/site_chat.py`, `class_noticing.py:138`,
`teacher_noticing.py`, `routes/cross_synthesis.py`, `orientation.py`, `idea_synthesis.py`, `routes/tavolo.py`,
`routes/survey.py`, `routes/diagram.py`, `routes/pqbl.py`, `thread_guard.py`, `benchmark_service.py` e altri (elenco da
`grep -rln "AIService(" backend`).

## 6. Cosa di questionari e profili arriva ai modelli

- **Contesto studente** (`backend/student_context.py:113-140`): taccuino (obiettivo, difficoltà, forze, debolezze, contesto;
  `:84-95`), strumenti completati, sessioni sospese, titoli del portfolio (`:98-110`). Il testo dice al modello che «non vede i punteggi».
- **Chat guidata sui risultati**: la preparazione del turno (`backend/chat_preparation.py`, `prepare_chat_turn`) inserisce
  punteggi e fattori dello strumento nell'envelope; i riassunti finali usano il log cronologico completo (`journey_context`).
- **Contesto docente** (`backend/teacher_context.py:93-165`): nomi e impostazioni delle classi visibili.
- **Osservazioni di classe** (`backend/class_noticing.py:34-45`, `:138`): risultati di tutti i membri della classe, con
  `username`, al modello scelto dal docente.
- **Riferimenti Idea** (`IdeaReference`): fino a 24.000 caratteri di un documento caricato, come dato non fidato.
- **Memoria di sessione** e cronologia: tutto lo storico della conversazione rientra nella `history`.

Verso un provider esterno tutto questo passa dal filtro (§7); verso Ollama/llamacpp arriva in chiaro.

## 7. Filtro PII esistente

### 7.1 Strato deterministico — `backend/pii.py`

Regex con verifica di checksum (`:41-136`, `:169-269`): email, URL, IP, social, date, termini sanitari, P.IVA, codice
fiscale (con checksum, `:169`), IBAN (mod-97), carte (Luhn), targhe, telefoni di 6 paesi, documenti ES/FR/UK/SE.
`anonymize` (`:345-380`) produce segnaposto `[[PII:TIPO:N]]` e una mappa in memoria; `restore` (`:383-391`).

### 7.2 Strato NER — `backend/pii_ner.py`

Un **LLM generativo locale** via Ollama (`qwen3:0.6b`, `:23`) restituisce entità in JSON (`nome, indirizzo, citta, scuola,
matricola, data_nascita, salute`, `:28`), sostituite per corrispondenza esatta (`:112-200`). I segnaposto sono coerenti
**dentro una richiesta** (`:131-142`), non tra turni: la stessa persona può ricevere numeri diversi in turni diversi.
Se Ollama non risponde, `ner_ok=False` (`:166-168`) e con `external_pii_fallback=block` la chiamata fallisce (`ai_service.py:723-727`).

### 7.3 Redazione dei log

`pii.redact` (`:417-432`) è **solo regex** (i nomi restano), disattivabile con `log_pii_redact` (`main.py:259-261`,
`routes/admin.py:1217`) e **fail-open**: in caso di eccezione restituisce il testo originale (`:430-432`).

### 7.4 Configurazione

Pannello admin `GET/PUT /admin/external-privacy` (`backend/routes/external_privacy.py:36-54`): modalità `local` (regex + NER)
o `basic` (solo regex). `external_pii_redact=false` è ancora possibile via config (`ai_service.py:308`) e spegne il filtro.

## 8. Cifratura e chiavi già presenti

- **`CredentialStore`** (`backend/credential_storage.py:15-80`): chiave **Fernet** (AES-128-CBC + HMAC-SHA256, specifica Fernet)
  da env, da file `_FILE` o generata in `credential.key` con permessi 0700/0600 (`:43-68`). Tre istanze:
  `personal_api.py:21` (chiavi API personali, `encrypt_key`/`decrypt_key` `:81-95`), `chatgpt_connections.py:35` (token
  ChatGPT), `institution_password.py:29` (copia visualizzabile della password d'istituto, `remember`/`reveal` `:32-56`).
  `institution_password` **condivide** la cartella e la chiave gestita delle API personali se `INSTITUTION_CREDENTIAL_KEY` non è impostata (`:26-29`): di default una sola chiave per due finalità.
- Nessuna rotazione (Fernet `MultiFernet` non usato), nessuna versione della chiave nei dati cifrati.
- **Password**: Argon2 (`auth.py:35`). **Token di sessione/abbinamento**: solo SHA-256 (ADR-0002 §3.2, §4.1).
- **Chiavi API di sistema**: solo env (`backend/api_secrets.py`); su L2 dal portachiavi del sistema (ADR-0002 §1.2, F1-08 non ancora fatto).
- **HMAC per ricerche deterministiche**: assente. Codici anonimi di ricerca casuali ma con tabella in chiaro (§3.1).

## 9. Associazione docente-studente

- Lo studente entra in una classe con il **codice della classe** (`POST /groups/join`, `backend/routes/groups.py:989-1017`);
  su L2 con codice di abbinamento e pseudonimo (ADR-0002 §4).
- Il docente vede le classi **proprie o condivise** (`group_visibility.py:29-45`); co-docenza con `GroupShare` (`routes/groups.py:653-726`).
- Per i dati del singolo studente la verifica è: classe visibile + studente membro (`routes/groups.py:731-737`,
  `_require_student_result`). Il risultato è poi cercato **solo per `username` e id/sessione** (`:734`): non è legato
  alla classe, al piano o al periodo in cui lo studente ne fa parte. Lo stesso vale per le trascrizioni (`:842-854`).
- `InstitutionTeacher` (`models.py:1624`) lega docenti e istituti, ma l'accesso ai dati degli studenti non lo usa.
- Nessuna scadenza dell'accesso, nessun registro delle consultazioni (esiste solo `forum_moderation_log` e
  `class_settings_audit_log`, `models.py:1371`, `:2213`).

## 10. Informative e consensi esistenti

- Pagina informativa **non versionata** `/guide/dati-riservatezza` (`frontend/src/app/guide/dati-riservatezza/page.tsx:1-20`)
  con quattro sezioni (`frontend/src/lib/i18n.ts:28-34`): modello locale, filtro esterno («non garantisce l'anonimato»),
  embedding, accessi del docente. Link dalla schermata iniziale (`frontend/src/components/home/IntroScreen.tsx:102`).
- **Consenso al questionario di gradimento**: casella obbligatoria lato client (`frontend/src/app/questionario/page.tsx:112`,
  `:219-220`, `:467-499`). **Consenso nelle somministrazioni**: casella obbligatoria lato client
  (`QuestionnaireRunner.tsx:160`, `:301-302`). In entrambi i casi il backend **non registra** consenso, versione del testo
  o data (nessuna colonna `consent` in `backend/models.py`).
- Avviso «Le risposte vengono salvate…» (`i18n.ts:1171`). Nessuna informativa specifica per docente, per l'AI o per la ricerca.
- Il piano desktop rinvia informative e DPIA a F1-17 (`desktop-apps-plan.md` §7.1).

## 11. Lacune principali

| # | Lacuna | Evidenza | Gravità (stima tecnica) |
|---|---|---|---|
| G1 | Immagini inviate a provider di visione esterni senza filtro | `vision_service.py:140-185` | alta |
| G2 | Testo inviato a Microsoft Edge TTS senza filtro | `routes/voice_reader.py:161` | alta |
| G3 | «Locale» deciso dal nome del provider, non dall'host: un `ollama_ip` remoto riceve tutto in chiaro | `ai_service.py:118`, `:712`; `qsa_extractor.py:152`; `pqbl_generator.py:109` | media |
| G4 | Nessun punto unico di uscita: chiamate dirette in 6+ moduli | §5 | alta (strutturale) |
| G5 | Il docente vede tutti i risultati/conversazioni di un membro, non solo quelli della classe | `routes/groups.py:731-737`, `:842-854` | alta |
| G6 | Admin tecnico legge contenuti in chiaro; nessun break-glass, nessun audit | `group_visibility.py:23-26` | media |
| G7 | Contenuti a riposo in chiaro (DB, memoria di sessione, upload, backup) | §3 | media su L1, alta su L3 |
| G8 | Una chiave Fernet per più finalità, senza rotazione | `institution_password.py:26-29`, `credential_storage.py` | media |
| G9 | Log con email in chiaro e testi con nomi; redazione regex fail-open | `models.py:150`; `pii.py:430-432` | media |
| G10 | Consensi non registrati né versionati; informativa non versionata | §10 | alta (organizzativa) |
| G11 | Segnaposto non coerenti tra turni; NER generativo senza misure di recall | `pii_ner.py:131-142`; nessun corpus di test | media |
| G12 | Filtro spegnibile da config (`external_pii_redact=false`) | `ai_service.py:308`, `:712` | media |
| G13 | Nessuna conservazione differenziata oltre `logs` | `chat_logic.py:165` | media |
