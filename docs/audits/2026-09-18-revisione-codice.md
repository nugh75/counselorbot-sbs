# Revisione del codice e caccia ai bug — 18 settembre 2026

Ricognizione su `main` a partire dal commit `9109d62`, albero di lavoro pulito.
Comprende due parti: una batteria di verifiche automatiche su tutto il progetto e
una revisione mirata del diff `f990efd^..HEAD` (i dieci commit della feature
«evento significativo», 73 file).

**Nessuna modifica è stata applicata.** Questo documento raccoglie solo le
proposte, da approvare una per una.

## Verifiche eseguite

| Verifica | Comando | Esito |
|---|---|---|
| Suite backend | `docker exec counselorbot_backend python -m pytest backend/tests -q` | **1444 passed, 6 skipped** in 193 s, 2610 warning |
| Tipi frontend | `npx tsc --noEmit` | pulito |
| Lint + i18n | `npm run lint` | 0 errori, 2 warning; 2777 chiavi × 6 lingue |
| Test unitari frontend | `npm test` | 189/189 |
| Sintassi Python | `python3 -m compileall backend scripts` | pulito |

Nessun test è rotto: i bug qui sotto emergono dall'ispezione, non da
fallimenti. La suite va eseguita **dentro il container**: da host tre file
falliscono per `DATABASE_URL` assente, non per il codice.

## Igiene già verificata (nessun intervento necessario)

Controllata e trovata corretta: la regex sugli slug delle collezioni RAG, la
guardia anti path-traversal `_safe_doc_abspath`, il timeout su tutti i client
`httpx`, la chiusura di `SessionLocal()` in `finally` in ogni punto, il
confronto a tempo costante sul secret del webhook Telegram, la dipendenza
`get_current_active_admin` su tutte le route amministrative, i limiti di
dimensione sugli upload e l'esecuzione dell'OCR in threadpool.

---

## Parte A — Proposte da ricognizione trasversale

### P1 — Postgres in ascolto su tutte le interfacce

`docker-compose.yml:104` pubblica `"5435:5432"`, mentre backend
(`127.0.0.1:8088`) e frontend (`127.0.0.1:3000`) stanno su loopback.
`ss -ltn` conferma `*:5435`. Docker pubblica scrivendo direttamente nelle
catene iptables, quindi una regola UFW non copre questa porta. Il database
contiene i dati degli studenti.

**Proposta:** `"127.0.0.1:5435:5432"`. Il loop di test da host su
`localhost:5435` continua a funzionare. Richiede `docker compose up -d` per
applicare (solo ricreazione del container postgres, nessun volume toccato).

### P2 — `/tts` senza tetto sulla lunghezza del testo

`backend/api_models.py:62` dichiara `text: str` senza vincoli;
`backend/routes/chat.py:1380` spezza in chunk da 3000 caratteri, li sintetizza
in sequenza e accumula tutto in un `BytesIO`. Un corpo grande produce centinaia
di chiamate a edge-tts, una richiesta lunghissima e un picco di memoria.
L'endpoint è protetto dall'auth di nginx, quindi non è esposto, ma manca la
difesa in profondità.

**Proposta:** `Field(max_length=20000)` su `text` più un tetto sul numero di
chunk generati.

### P3 — Immagine caricata e salvata come `.pdf`

`backend/routes/chat.py:1239` accetta `.pdf`, `.jpg`, `.jpeg`, `.png`, ma la
riga 1275 scrive sempre `uploads/qsa/{token}.pdf`. A valle
`pdf_storage_path()` (`backend/routes/opencode.py:356`) e `_extract_pdf_text`
(pypdf) presuppongono un PDF vero: caricando un'immagine l'estrazione fallisce,
viene loggato un warning e la sezione diventa «illeggibile» senza che l'utente
capisca perché.

**Proposta:** conservare l'estensione reale nel token, oppure rifiutare le
immagini su questo percorso e dirlo nel messaggio d'errore.

### P4 — Sessioni pQBL e memoria senza controllo di proprietà

`backend/routes/pqbl.py:490,510,563,630` e `backend/routes/memory.py:56`
accettano un `session_id` e non confrontano mai `session.username` con
l'identità della richiesta. Gli id sono UUID4, quindi non indovinabili, ma
chiunque ottenga un id — da un log, un link condiviso, una cronologia — può
leggere le domande, rispondere, inviare il test finale e leggere il riepilogo
di un altro studente.

**Proposta:** confronto fra `session.username` e l'identità, con gli
amministratori esentati, come già fa `_readable_owner` in `routes/idea_map.py`.

### P5 — Retention dei log: datetime naive contro colonna aware

`backend/routes/admin.py:945` usa `datetime.utcnow()` (naive) per confrontarlo
con `Log.timestamp`, dichiarata `DateTime(timezone=True)`, mentre il conteggio
dei record da cancellare (riga ~312) usa `now()` di Postgres. Se il fuso della
sessione database non è UTC, le fasce 0-30 / 31-90 / 91-180 giorni slittano e
non coincidono con ciò che la purge cancella davvero.

**Proposta:** `datetime.now(timezone.utc)`; è l'unico punto del progetto che
ancora mescola i due stili.

### P6 — Eccezioni interne restituite al client

`backend/routes/chat.py:1085` emette `{'error': str(e)}` dentro lo stream SSE;
nelle route ci sono 39 occorrenze di `detail=str(e)`. Il testo d'errore del
provider LLM arriva così al browser.

**Proposta:** messaggio generico più un identificativo di correlazione, con il
dettaglio solo nei log.

### P7 — Residui di Pydantic V1

22 `@validator`, 32 `class Config:` e 3 `.copy(update=)` producono 2610 warning
per esecuzione della suite. Il progetto gira su Pydantic 2.13.5: questi
costrutti spariscono in V3.

**Proposta:** migrazione meccanica a `field_validator`, `ConfigDict` e
`model_copy`, un commit per tipo di costrutto.

### P8 — Tabella dei gate di `CONTEXT.md` non più veritiera

`CONTEXT.md:100-101` indica `STARTABLE_QUESTIONNAIRES` in
`frontend/src/app/page.tsx` e `STARTABLE` in
`frontend/src/components/home/ReturningHome.tsx`: nessuno dei due esiste più, il
gate è ora il registro `QUESTIONNAIRES` in `frontend/src/lib/questionnaires.ts`.
Quella tabella è la checklist da seguire quando si aggiunge uno strumento,
quindi l'informazione stale è una trappola attiva. Le altre righe della tabella
sono state verificate e sono corrette: entrambi i tipi evento compaiono in
`MEMORY_QUESTIONNAIRE_TYPES`, `FROZEN_SESSION_TYPES`, `ENGINE_INSTRUMENTS`,
`AVAILABLE_INSTRUMENTS` e `_EXPORT_INSTRUMENT_ORDER`.

**Proposta:** aggiornare le due righe.

### P9 — Idea, proprietario identificato solo dallo username

`backend/routes/idea_map.py:89-103`: l'accesso è corretto e ben difeso, ma la
chiave è solo lo username. Conferma il bug già noto: una sessione iniziata da
anonimo con login a metà percorso perde i rami costruiti prima.

**Proposta:** chiave secondaria su `session_id` e adozione dei rami al momento
del login.

### Minori

- 17 `except Exception: pass` (in `chat_logic.py`, `routes/opencode.py`,
  `main.py`, `routes/admin.py`) che mangiano l'errore senza loggarlo.
- Due warning `react-hooks/exhaustive-deps` in
  `frontend/src/components/admin/ConfigForm.tsx:855,1319`, entrambi con
  dipendenze elencate a grana fine: probabilmente intenzionali, vale una nota
  nel codice.

---

## Parte B — Revisione del diff `f990efd^..HEAD` (evento significativo)

### R1 — La bozza del libretto si perde sulle risposte troncate

`frontend/src/lib/chat-stream.ts:126`. Il backend è stato cambiato apposta
perché un riepilogo troncato porti comunque la bozza:
`backend/routes/chat.py:927` non interrompe più il loop sui percorsi evento e
`:1016` aggiunge `event_booklet` all'evento `done` con `incomplete`. Ma
`streamChat` lancia `IncompleteChatStreamError` prima di restituire e il payload
dell'errore contiene solo `{response, session_id, conversation_id}`:
`eventBooklet` viene letto e buttato.

Scenario: percorso `EVENTO_STUDIO` con `response_length` impostato, il riepilogo
supera il tetto di parole, il backend manda la bozza e `EventBookletCard` si
apre comunque vuota. È esattamente la funzione per cui la feature esiste.

### R2 — Bozza valida sovrascritta dal retry

`backend/routes/chat.py:986`: `retry, booklet_draft = event_booklet.extract(retry)`
riassegna incondizionatamente una bozza già estratta a riga 936. Se sul turno di
riepilogo il modello emette il blocco ```booklet ma la prosa visibile viene
svuotata dal sanitizer, `response_content.strip()` è falso e parte il retry; la
risposta di retry non contiene il blocco, `extract` restituisce `None` e la
bozza buona sparisce.

**Proposta:** guardia `draft = ... or booklet_draft` invece della riassegnazione.

### R3 — Avanzamento silenzioso anche fuori dai percorsi intervista

`frontend/src/lib/interview-path.ts:62`: il controllo
`if (!visibleReply.trim()) return false;` sta **prima** del lookup in
`INTERVIEW_PATHS`, quindi si applica anche a QPCS, che percorso intervista non è.
Se la risposta del modello resta vuota — budget di ragionamento esaurito, turno
di solo `<think>`, sanitizer — ma porta `[[AVANZA_STEP]]`, allora
`GuidedChatInterface.tsx:1222` ha già chiamato `dropLast()`: la bolla
dell'assistente sparisce e lo step avanza da solo, senza messaggio e senza che
la persona possa accorgersene. Prima compariva il suggerimento di avanzare e il
controllo restava all'utente.

**Proposta:** restringere il ramo «risposta vuota» alla famiglia intervista,
oppure richiedere che sia stato l'utente a chiedere di procedere.

### R4 — Fence di codice troncata durante lo streaming

`backend/event_booklet.py:29,62`: il gruppo di cattura di `_PARTIAL_FENCE_RE` è
`[A-Za-z]*`, quindi matcha la stringa vuota, e `"booklet".startswith("")` è
`True`. Verificato:
`strip_for_display("Ecco uno schema:\n```\npasso 1\npasso 2\n```")` restituisce
il testo senza la fence di chiusura. Per il resto dello stream la persona vede
un blocco di codice aperto e il renderer markdown si mangia la coda; l'evento
`done` finale ripristina il testo, quindi è un artefatto del solo streaming.

**Proposta:** richiedere un tag di linguaggio non vuoto (`[A-Za-z]+`) o
controllare la verità di `partial.group(1)`.

### R5 — Passo `questions` senza domande per i percorsi evento

`backend/guided_step_questions_seed.py:417`: `DEFAULT_GUIDED_STEP_QUESTIONS`
acquisisce nove step id per ciascun tipo evento ma nessuna voce `"questions"`,
mentre tutti gli altri strumenti ce l'hanno (QSA 10, SAVICKAS 9, QAP 10). Dopo
il riepilogo la persona arriva alla fase domande e riceve il fallback generico
`_REFLECTION_FIXED_QUESTIONS` invece degli spunti propri del percorso, e
l'amministratore vede uno slot vuoto in `GuidedStepQuestionsPanel.tsx:212`. La
suite non lo intercetta perché `STEP_SUFFIXES` in `test_evento_significativo.py`
esclude proprio `questions`.

**Proposta:** aggiungere le domande per i due tipi evento e includere
`questions` in `STEP_SUFFIXES`.

### R6 — Keyword di orientamento troppo larghe e sovrapposte

`backend/orientation.py:69-70`: le due voci nuove di `_KEYWORDS` si sovrappongono
su 5 token su 10 (`episod`, `evento`, `event`, `tirocin`, `praktik`, `hande`) e
`_rank_tools` (riga 275) assegna il punteggio per semplice contenimento di
sottostringa, tenendo solo i primi tre. Un messaggio come «vorrei capire come
studio, eventualmente cambiando metodo» fa scattare `event` su entrambi gli
strumenti evento, che occupano due slot su tre a pari punteggio ed escludono uno
strumento più pertinente. `hande` scatta anche sul tedesco «handeln» e «Handy».

**Proposta:** passare a frasi intere (`evento significativo`,
`significant event`) ed eliminare il bare `event`.

### Verificato e trovato corretto nel diff

Le migrazioni one-shot (`counselor_scope.extend_interview_counselors`,
`skills_seed.apply_event_paths_policy`: `seed_skills` gira incondizionatamente
prima, a `main.py:799`, quindi i binding `*` per i nuovi codici vengono creati),
i nomi dei campi del libretto (ogni chiave scritta da `bookletDataFromForm` è
resa da `StudentBookletCard`), la guardia `isQuestionnaireType`, la
deduplicazione di `EVENT_BOOKLET_TYPES` in `profilo/page.tsx:154` e il gate di
sintesi in `turn_contract`.

---

## Ordine suggerito

1. **R1 + R2** insieme — stesso sintomo visibile, la bozza del libretto che si perde.
2. **R3** — perdita silenziosa di uno step, l'unico che sottrae lavoro senza dirlo.
3. **P1** — Postgres su `*:5435`, unica correzione di sicurezza vera; richiede rebuild.
4. **R4, R5, P3, P5** — difetti circoscritti con riproduzione chiara.
5. **P2, P4, P6** — irrobustimento, nessuno urgente dietro l'auth di nginx.
6. **P7, P8, P9** e i minori — manutenzione.

Ogni voce è indipendente: un commit per proposta, con il test che la copre.
