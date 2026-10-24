# Privacy Layer — piano a blocchi

Stato: **proposta** (2026-10-24). Ogni blocco = un compito di diario, un branch, una PR (con issue e milestone).
Tier: **opus** = Claude Opus (architettura, sicurezza, crittografia, autorizzazioni); **deepseek** = compiti meccanici
con contratto già fissato. Stime in giorni di lavoro effettivo, indicative.

Regole comuni a tutti i blocchi:

- codice portabile Postgres/SQLite e test su entrambi i DB (ADR-0003 §6); nessun dato reale nei test, solo il corpus sintetico (P2);
- nessun blocco attiva in produzione una finalità con base giuridica `undefined` (02 §7.2);
- ogni blocco che tocca `backend/` o `frontend/` aggiorna la documentazione di funzionalità e `make guidance-refresh` se richiesto dai check.

## Blocchi

| ID | Blocco | Definition of Done (verificabile) | Aree toccate | Dipende da | Tier | Stima |
|---|---|---|---|---|---|---|
| **P0** | Decisioni del titolare/DPO | Risposte scritte alle voci D1–D12 di [04](04-decisioni-titolare-dpo.md), anche parziali; le voci aperte restano `undefined` nel codice | nessun codice | — | utente | — |
| **P1** | Nucleo e contratti | `backend/privacy/{__init__,types,errors,policy}.py` con i tipi e le firme di 02 §3; implementazioni segnaposto che sollevano `PrivacyError`; test che verificano firme, codici d'errore e assenza di testo nei `repr` | `backend/privacy/` (nuovo) | — | opus | 1,5 |
| **P2** | Corpus sintetico italiano e misure | ≥ 600 frasi sintetiche scuola/università annotate per categoria (02 §3.5), incluse frasi ambigue («Rosa», «Volta», «Sole»), informazioni indirette e combinazioni; script `scripts/privacy_eval.py` che produce precision/recall/F1/falsi negativi per categoria in JSON; nessun nome di persona reale nota | `backend/privacy/corpus/`, `scripts/privacy_eval.py`, `backend/tests/test_privacy_corpus_benchmark.py` | — | deepseek (generazione) + opus (revisione delle etichette nello stesso blocco) | 3 |
| **P3** | Spike motore PII | Misura sul corpus di: regole, regole+gazetteer, +Ollama NER attuale, +GLiNER ONNX (due modelli di 02 §3.4); tempo per frase su CPU; dimensione; build PyInstaller con `onnxruntime` sui 4 runner desktop; licenze verificate su scheda del modello e del modello di base; report `docs/privacy/spikes/p3-pii-engine.md` con raccomandazione | `docs/privacy/spikes/`, `scripts/spikes/`, workflow manuale | P2 | opus | 3 |
| **P4** | `detect_pii` + `pseudonymize` + verifica residui | Implementazione con il motore scelto in P3; mappe per conversazione cifrate (`privacy_pseudonym_maps`); segnaposto `[PERSONA_1]` coerenti fra turni e non collegabili fra utenti; neutralizzazione dei segnaposto nel testo utente; `DetectorUnavailable` ⇒ errore; soglie di P3 raggiunte in CI | `backend/privacy/detect.py`, `pseudonymize.py`, `backend/pii.py`, `backend/pii_ner.py` | P1, P3, P5 (per la mappa cifrata) | opus | 4 |
| **P5** | Crittografia e chiavi | `backend/privacy/crypto.py`: AES-256-GCM con formato `v1.<key_id>.…`, AAD per campo, DEK per finalità avvolte dalla KEK, HMAC per `subject_pid` e indici ciechi; fornitori di KEK: env/`_FILE` (L1), portachiavi via env passato dal guscio (L2, riusa F1-08); tabella `privacy_keys`; rotazione; kit di recupero; verifica dei parametri Argon2id attuali. Test: andata/ritorno, AAD errata ⇒ `IntegrityError`, nonce mai ripetuti su 10⁵ cifrature, chiave mancante ⇒ `KeyUnavailable` | `backend/privacy/crypto.py`, `keys.py`, `backend/credential_storage.py` (solo lettura/adattatore) | P1 | opus | 4 |
| **P6a** | Correzione rapida: immagini verso provider esterni (G1) | `vision_service.call` rifiuta immagini verso provider non locali salvo config esplicita; OCR QSA/pQBL passano a un provider locale o falliscono con errore localizzato; test con trasporto che nega la rete | `backend/vision_service.py`, `backend/ai_service.py:1025-1047`, test | — | opus | 1 |
| **P6b** | Correzione rapida: «locale» per host (G3) | funzione `is_trusted_local(url)` (loopback + `privacy_local_hosts`); `_anonymize_external` e i moduli OCR la usano al posto del nome del provider; test con `ollama_ip` remoto ⇒ filtrato o bloccato | `backend/ai_service.py:118`, `:704-732`, `backend/qsa_extractor.py`, `backend/pqbl_generator.py` | — | opus | 1 |
| **P6c** | Correzione rapida: Edge TTS (G2) | la lettura vocale con motore `edge` passa il testo da `pii.redact_always` o usa Piper secondo politica; scelta predefinita in attesa di 04-D9: Piper se disponibile, altrimenti testo filtrato | `backend/routes/voice_reader.py` | F1-11 (stesso file: heartbeat SSE) | opus | 0,5 |
| **P6** | Gateway AI unico | `AIGateway` di 02 §6 con tutti i `kind`; migrazione dei 15 punti di 01 §5; test statico `test_ai_egress_guard.py`; suite E2E con rete negata che verifica l'assenza dei valori del corpus nei corpi HTTP verso provider; rimozione di `external_pii_redact=false` dalla produzione | `backend/privacy/gateway.py`, `backend/ai_service.py`, `vision_service.py`, `embedding_service.py`, `qsa_extractor.py`, `pqbl_generator.py`, `routes/voice_reader.py`, `telegram_bot.py` | P4, P6a, P6b, P6c, P8, F1-05h | opus | 5 |
| **P7** | Autorizzazioni docente-studente e admin | `authorize_data_access`; tabella `teacher_student_grants` con riempimento da `group_memberships` (base `institutional_assignment`, periodo dalla data di iscrizione); ambito per classe/periodo (G5); 404 fuori ambito; vista pseudonimizzata per l'admin tecnico su L1; break-glass con evento; test IDOR su tutte le rotte `routes/groups.py:731-854`, isolamento fra istituti, revoca e scadenza immediate | `backend/privacy/authz.py`, `backend/routes/groups.py`, `backend/group_visibility.py`, `backend/models.py` | P1, P8, F1-05e/F1-05f (stesso `models.py`), F1-06 (`auth.py`) | opus | 5 |
| **P8** | Eventi privacy e audit | tabella `privacy_events` (02 §7.1), `record_privacy_event`, `subject_pid`; eventi obbligatori fail-closed; API di lettura per l'interessato e per il titolare; test: nessun campo di testo libero, nessun username in chiaro | `backend/privacy/events.py`, `backend/models.py` (solo tabelle nuove) | P1, P5 (HMAC) | deepseek | 2 |
| **P9** | Informative, finalità, consensi (backend) | tabelle `privacy_documents`, `privacy_purposes`; API: documenti correnti, scelte, revoca; `PurposeDisabled` per basi `undefined`; i consensi lato client esistenti (questionario, somministrazioni) diventano eventi; test: rifiuto non blocca funzioni indipendenti, nuova versione ⇒ nuovo consenso solo se richiesto | `backend/privacy/consent.py`, `backend/routes/privacy.py` (nuovo), `backend/routes/survey.py` (solo registrazione evento) | P8, P0 (contenuti) | opus | 3 |
| **P10** | UI privacy studente e docente | sezione Privacy al primo uso e nelle impostazioni; interruttori separati non preselezionati; condivisioni con revoca; cronologia scelte; i18n in tutte le lingue attive; test di componente | `frontend/src/app/privacy/`, `frontend/src/components/privacy/`, `frontend/src/lib/i18n-privacy.ts` | P9 | deepseek (su specifica di P9) | 3 |
| **P11** | Cifratura a riposo dei contenuti | colonne cifrate per taccuino, conversazioni/log `details`, note docente, riferimenti Idea, risultati (02 §4.2); file di memoria di sessione cifrati; `logs.email` sostituita da indice cieco; migrazione a 4 passi di 02 §9 con interruttore e test di rollback su entrambi i DB | `backend/models.py`, `backend/memory_service.py`, `backend/routes/chat.py` (scrittura log), job di migrazione | P5, P7, F1-05g (aggiornamenti schema), F1-05j (backup) | opus | 6 |
| **P12** | Migrazione delle chiavi Fernet | le tre istanze di `CredentialStore` passano a DEK separate; lettura vecchia/scrittura nuova; test con chiave persa ⇒ errore chiaro | `backend/credential_storage.py`, `personal_api.py`, `chatgpt_connections.py`, `institution_password.py` | P5 | opus | 2 |
| **P13** | Log e diagnostica | redazione dei log fail-closed (in errore: testo sostituito, non originale); strato gazetteer anche nei log; nessun dato di punteggio nei log Python (`qsa_extractor.py:148`); «Esporta diagnostica» (ADR-0002 §2.3) senza PII; test | `backend/pii.py` (solo `redact*`), `backend/qsa_extractor.py`, log desktop | P4 | deepseek | 1,5 |
| **P14** | Conservazione e diritti | politiche per categoria (04-D5) come dati; job di cancellazione su DB, file, mappe, eventi scaduti; esportazione dei propri dati (JSON + PDF) e cancellazione coerenti su L1/L2 (e L3 quando esiste); procedura documentata per i backup | `backend/privacy/retention.py`, `backend/routes/privacy.py`, `docs/privacy/` | P11, P0 | opus | 4 |
| **P15** | App studente (Fase 2) | Privacy Layer locale nel backend «studente» (F2-02), DB cifrato (F2-06) con KEK nel portachiavi, sync minimizzata e cifrata (F2-01/F2-03), ripristino locale dei segnaposto; test offline | `desktop/student/`, sync | F2-01, F2-02, P4, P5 | opus | 5 |
| **P16** | Bozze documentali GDPR | bozze di 04 §Documenti con campi `[DA VALIDARE]`: informative studente/docente/AI, consenso condivisione, ricerca, conservazione, data breach, schema DPIA, registro, misure tecniche e organizzative; nessuna dichiarazione di conformità | `docs/privacy/bozze/` | P0 parziale | opus | 3 |
| **P17** | Revisione di sicurezza finale | revisione del threat model (02 §8) sul codice consegnato, test di penetrazione mirati (IDOR, tunnel, gateway), report dei rischi residui | `docs/privacy/` | P6, P7, P11 | opus | 2 |

## Parallelismo

- **Subito, in parallelo** (file disgiunti): P1, P2, P6a, P6b, P16; P0 (utente). P6c appena F1-11 è su `main`.
- **Dopo P1**: P5 ∥ P8 (P8 usa l'HMAC di P5: implementa `subject_pid` dopo P5 o con un'interfaccia temporanea).
- **Dopo P2**: P3.
- **Dopo P3 + P5**: P4. **Dopo P4**: P13.
- **Dopo P8**: P9 → P10. P7 dopo P8 e dopo F1-05e/f e F1-06.
- **Dopo P4, P6a/b/c, P8, F1-05h**: P6.
- **Dopo P5**: P12. **Dopo P5 + P7 + F1-05g + F1-05j**: P11 → P14.
- **Fase 2**: P15 con F2. **Ultimo**: P17.

Percorso critico: P1 → P5 → P4 → P6 → P11 → P14 → P17 (≈ 25 giorni effettivi), con P2 → P3 a monte di P4.

## Collisioni con i lavori desktop in corso

| File / area | Compito desktop | Regola |
|---|---|---|
| `backend/models.py` | F1-05e (UTC), F1-05f (indici parziali) | P7, P8, P11 aggiungono solo classi nuove in coda o aspettano il merge; nessuna modifica alle colonne esistenti prima di F1-05e |
| `backend/auth.py`, sessioni locali | F1-06 | P7 non tocca `auth.py`; usa l'identità restituita |
| `backend/routes/voice_reader.py`, `routes/chat.py`, `routes/site_chat.py` | F1-11 (heartbeat), F1-05h (transazioni brevi) | P6c dopo F1-11; P6 e P11 dopo F1-05h |
| `backend/routes/external_privacy.py` | F1-05d (lock portabili) | P6 la modifica solo dopo F1-05d |
| portachiavi nel guscio | F1-08 | P5 consuma la variabile d'ambiente fornita da F1-08, non scrive codice Rust |
| backup | F1-05j, F1-16 | P11 e P14 riusano quella procedura |

## Test previsti (copertura delle 20 aree del brief)

| Area del brief | Blocco |
|---|---|
| nomi/ID, CF, email/telefoni/indirizzi, testi italiani ambigui, info indirette | P2, P3, P4 |
| coerenza dei segnaposto | P4 |
| cifratura/decrittazione, non recuperabilità via hash | P5 |
| isolamento studenti, istituzioni; docente solo autorizzati; revoca/scadenza | P7 |
| blocco delle chiamate AI non filtrate; E2E con intercettazione HTTP | P6 |
| errori del modello PII (detector giù, output malformato) | P4 |
| assenza di PII nei log | P13 |
| versioni delle informative, consensi | P9, P10 |
| PII offline | P3, P15 |
| compatibilità OS | P3 (build), P15 |
| regressioni funzionali (chat, questionari) | ogni blocco: suite esistente mirata |
