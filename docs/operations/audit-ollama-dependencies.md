# Audit delle dipendenze da Ollama e piano di sostituzione del recupero documenti

Data: 16 ottobre 2026. Base: `origin/main` `4fc202f6`. Audit di sola lettura:
nessun codice, configurazione, `.env`, database o container modificato.
Milestone GitHub: «Document retrieval without Ollama (Oct 2026)».

## Sintesi

- **Gli embedding sono cablati su Ollama.** `AIService.embed_texts`
  (`backend/ai_service.py:1247`) chiama solo `POST {ollama_ip}/api/embed`.
  Non esiste un provider di embedding alternativo. Il modello
  (`embedding_model`, predefinito `qwen3-embedding:4b`) è configurabile, il
  servizio no.
- **Senza Ollama il recupero degrada in silenzio.** Nella chat guidata i
  tre RAG (`competenzestrategiche`, `counselorbot`, `questionari`) finiscono
  in un `except` e producono contesto vuoto: il modello risponde senza
  materiali e l'utente non viene avvisato. Memorie, strategie approvate,
  strategie certificate e letture certificate ripiegano sulle parole chiave.
  L'assistente del sito mostra invece all'utente l'errore tecnico grezzo,
  tranne per la collezione CounselorBot, che usa il documento live.
- **Nessun ripiego lessicale nel RAG documentale.** `SiteRagIndex.search`
  ha solo coseno, grafo e un piccolo «name boost»: senza vettori non
  restituisce nulla. Dopo un errore ricostruisce l'indice a ogni richiesta
  (bug registrato).
- **Il problema non riguarda solo gli embedding.** OCR QSA/pQBL, traduzioni,
  NER PII, thread guard, il modello predefinito della Bussola, il ripiego per
  budget, Prompt Lab e OpenCode sono cablati su Ollama. In parte sono già
  disattivati o documentati nell'installazione portabile.
- **Raccomandazione:** BM25 in memoria sempre attivo, nessun nuovo motore di
  database. Embedding via API configurabile (Ollama | API | nessuno), fusione
  RRF dei risultati e indice separato per modello. I dati degli utenti
  (memorie, episodi) restano solo locali o lessicali. Il corpus pubblico può
  andare all'API. La query dello studente va all'API solo dopo il filtro
  privacy e con un responsabile del trattamento dichiarato.

## 1. Inventario delle dipendenze da Ollama

Legenda «Oggi senza Ollama»: **E** = errore visibile all'utente,
**S** = degradazione silenziosa (solo log), **K** = ripiego per parole chiave,
**B** = blocco della funzione, **—** = nessun effetto pratico.
«Configurabile» indica se la funzione può già usare un altro provider senza
modificare il codice.

### 1a. Embedding e recupero (oggetto principale)

| Funzione | File:riga | A cosa serve all'utente | Oggi senza Ollama | Configurabile |
| --- | --- | --- | --- | --- |
| `AIService.embed_texts` / `embed_query` | `backend/ai_service.py:1247`, `:1286` | Vettori per tutti i recuperi semantici | `AIError("Errore embeddings Ollama … Connection refused")` in circa 0,03 s (sonda isolata) | Solo il nome del modello (`embedding_model`, `prompt_config.py:662`); il servizio è sempre Ollama |
| `SiteRagIndex.ensure/build/_do_build` | `backend/rag_index.py:1083`, `:1020`, `:1037` | Costruzione degli indici dei materiali | Eccezione. Dopo il fallimento l'indice resta «non corrente» e **a ogni ricerca rilegge e rispezza l'intero corpus**, poi ritenta (verificato) | No |
| `SiteRagIndex.search` | `backend/rag_index.py:1088` | Recupero ibrido coseno + pesi di categoria + grafo | Eccezione: nessun ripiego lessicale | No |
| RAG nella chat guidata | `backend/chat_logic.py:2280-2340` (`_retrieved_context`) | Materiali di competenzestrategiche.it, CounselorBot e questionari nel prompt | **S**: `logger.warning`, contesto vuoto, la chat risponde senza grounding | Interruttori `rag_*` nei component flags |
| Assistente del sito | `backend/routes/site_chat.py:371-386`, evento SSE `error` | Domande sui materiali, una collezione alla volta | **E**: testo tecnico mostrato all'utente (bug registrato). Collezione CounselorBot: usa il documento live, senza errore | No |
| Reindicizzazione admin | `backend/routes/site_chat.py:315-326` | Pulsante di ricostruzione dell'indice | **E** (500/eccezione) | No |
| Build all'avvio | `backend/main.py:277-292` | Precalcolo dell'indice del sito | **S** (warning, «differita») | No |
| Collezioni dinamiche | `backend/rag_index.py` (`_make_dynamic_index`) | Raccolte caricate dall'admin | Come `search`: nessun risultato | No |
| `MemoryEmbedder.rank` | `backend/memory_embeddings.py:45` | Ordinamento semantico di testi brevi | Restituisce `None`; il chiamante ripiega sulle parole chiave (verificato) | No |
| Memoria di sessione (episodi) | `backend/memory_service.py:604-626` | Continuità tra turni, anche nell'assistente | **K** (sovrapposizione di termini) | No |
| Strategie approvate (Markdown) | `backend/strategy_memory.py:65` | Suggerimenti editoriali | **K** | No |
| Strategie certificate | `backend/certified_strategy_service.py:148` | Catalogo per fattore | **K** (il gating per fattore resta il filtro principale) | No |
| Letture certificate | `backend/certified_reading_service.py:146` | Catalogo letture | **K** | No |
| Invii di orientamento | `backend/orientation_referral_service.py:9` | Invii ad altri servizi | — (non usa embedding per scelta) | n/a |

### 1b. Generazione, OCR, NER, traduzioni e preload

| Funzione | File:riga | A cosa serve | Oggi senza Ollama | Configurabile |
| --- | --- | --- | --- | --- |
| Provider chat `ollama` (`_call_ollama`, `_stream_ollama`) | `backend/ai_service.py:909`, `:1142` | Chat con modello locale | **E** se scelto. Prova `ai_fallback_targets` se configurati | **Sì**: il provider attivo e i preset sono scelti dall'admin |
| Ripiego per budget | `backend/ai_service.py:331-341`; seed `main.py:911` (`budget_fallback_model=muse-glimmer:30b`) | Al superamento del budget mensile forza `ollama/<fallback>` | **E/B**: con budget superato tutte le chat a pagamento falliscono | Parzialmente: modello configurabile, provider cablato su Ollama |
| Default per provider non attivo | `backend/ai_service.py:584` | Modello predefinito se si sceglie `ollama` senza modello | — | Sì |
| NER PII per provider esterni | `backend/ai_service.py:404-432`, `backend/pii_ner.py:75`, `:112`; seed `main.py:918-919` | Anonimizzazione dei nomi prima dell'invio esterno | Con `pii_ner_enabled=true` e `external_pii_fallback=block` le chiamate esterne sono **bloccate**. Sul portabile è stato scelto `basic` (NER spento) il 5 ottobre 2026 | Sì (`local`/`basic` da Admin) |
| Preload del modello | `backend/ai_service.py:1291`, `main.py:257-268` | Riscaldamento all'avvio | — (`OLLAMA_PRELOAD=false` nel portabile) | Sì |
| Bussola: modello predefinito | `backend/orientation.py:803-806` | Orientamento iniziale | **S**: senza preset del counselor usa `ollama/qwen3.8:latest`, fallisce e restituisce il ripiego deterministico (bug registrato) | Solo assegnando un preset al counselor o `ai_fallback_targets` |
| OCR + parser punteggi QSA | `backend/qsa_extractor.py:399` (Ollama), `:301` (ripiego OpenRouter); `routes/chat.py:1391-1398` | Caricamento del PDF del profilo | **E** (400). Il ripiego OpenRouter usa un modello preview cablato e **aggira `AIService` e l'anonimizzazione** (già documentato) | No |
| OCR pQBL per PDF scansionati | `backend/pqbl_generator.py:105-128` | Generazione di domande da PDF senza testo | **E** solo per i PDF scansionati; il testo nativo funziona | No (`OLLAMA_BASE_URL`, `QSA_OCR_MODEL` da env) |
| Traduzione delle descrizioni dei counselor | `backend/counselor_i18n.py:89`, `:155`; backfill `main.py:1466-1473` | Testi multilingua | — (`COUNSELOR_TRANSLATE_DISABLED=1` nel portabile) | No |
| Traduzione del catalogo certificato | `backend/certified_translation.py:48`; `routes/certified_strategies.py:118` | Pulsante «Traduci» del curatore | **E** (502 «Traduzione non disponibile») | No |
| Traduzione degli strumenti | `backend/instrument_translation.py:41`; `scripts/translate_instruments.py` | Script amministrativo | **E** | No |
| Thread guard | `backend/thread_guard_seed.py:13-35`; `routes/chat.py:176` | Giudice di coerenza per turno | — (disattivato di default) | Sì (preset modificabile) |
| Prompt Lab | `backend/prompt_lab/gateway.py:17`, `local_models.py:25`, `snapshots.py:58` | Banco prove dei prompt | **B** per scelta (solo Ollama) | No |
| OpenCode | `backend/routes/opencode.py:992` | Agente sperimentale | **B** (escluso dal portabile) | No |
| Classificazione locale/esterno | `routes/presets.py:19`, `routes/counselors.py:49`, `routes/tavolo.py:476`, `counselor_identity.py:508`, `schemas.py:1377` | Etichette e privacy | — (solo confronto di stringhe) | n/a |
| Parametri di contesto e ragionamento | `model_context.py:99`, `reasoning_profiles.py:69-97`, `prompt_audit.py:657`, `chat_logic.py:617` | Profili per famiglia di modelli | — | n/a |
| Benchmark QSA | `backend/benchmark_service.py:19` | Benchmark admin | **E** (chiamate reali) | n/a |

## 2. Provider supportati e possibilità di embedding

Chiavi lette **solo dall'ambiente** (`backend/api_secrets.py`, `API_KEY_ENV_MAP`).
Nomi presenti in `.env.example`. I valori non sono stati letti. La loro
presenza sulla macchina portabile **non è stata verificata** (vedi §6).
Secondo `docs/operations/portable-installation.md` le `API_KEY_*` erano
vuote all'installazione. Il canale previsto è l'assistente Mac ChatGPT
(`openai_chatgpt`), un abbonamento personale che **non offre un endpoint
di embedding**: per gli embedding serve una chiave API di sistema.

| Provider (chat in `ai_service`) | Variabili | SDK già nel backend | Embedding disponibile presso il provider | Note |
| --- | --- | --- | --- | --- |
| OpenAI | `API_KEY_OPENAI` | `openai` | Sì: `text-embedding-3-small` (1536 dim., riducibili), `-3-large` | Stesso client già usato; costo da verificare |
| Mistral | `API_KEY_MISTRAL` | `mistralai` | Sì: `mistral-embed` (1024 dim.) | Fornitore UE: utile per il GDPR; costo da verificare |
| Gemini | `API_KEY_GEMINI` / `GEMINI_API_KEY` / `GOOGLE_API_KEY` | `google-genai` | Sì (modelli `text-embedding-004` / `gemini-embedding-*`; nome attuale da verificare) | Verificare le condizioni d'uso dei dati: sul piano gratuito i contenuti possono essere usati da Google (da verificare sulle condizioni attuali) |
| Together, Fireworks, DeepInfra | `API_KEY_TOGETHER`, `API_KEY_FIREWORKS`, `API_KEY_DEEPINFRA` | `openai` (compatibile) | Sì, endpoint `/v1/embeddings` compatibile (modelli open, es. famiglia BGE/E5; catalogo da verificare) | Permettono lo **stesso modello** usato in locale (es. bge-m3), se disponibile: da verificare |
| OpenRouter | `API_KEY_OPENROUTER` | `openai` | Da verificare | — |
| Groq, Cerebras, DeepSeek | `API_KEY_GROQ`, `API_KEY_CEREBRAS`, `API_KEY_DEEPSEEK` | `openai` | Non noti con certezza: da verificare | — |
| Anthropic | `API_KEY_ANTHROPIC` | `anthropic` | **No** (nessun endpoint di embedding proprio) | — |
| OmniRoute | `OMNIROUTE_API_KEY` | `openai` | Dipende dagli upstream: da verificare | Gateway interno, assente nel portabile |
| Voyage, Cohere | — | Non integrati | Sì, ma richiederebbero nuove chiavi e nuove dipendenze | Non consigliati ora |

**Costi:** nessun listino degli embedding è documentato nel repository.
Tutti i prezzi sono **da verificare**. Volume misurato sul corpus attuale
(collettori reali, `docs/` + `docs-counselorbot/`):

| Collezione | File | Chunk | Caratteri |
| --- | --- | --- | --- |
| competenzestrategiche | 95 | 212 | ~211k |
| counselorbot | 19 | 553 | ~613k |
| questionari | 95 | 74 | ~99k |
| framework (solo assistente del sito) | 95 | 7.641 | ~8,8 M |

Con 3–4 caratteri per token, l'indicizzazione completa vale circa
**2,4–3,2 M token una tantum** (il 90% è il framework). Ogni query vale
qualche centinaio di token. La cache per hash del chunk già presente evita
di ripagare i chunk invariati. Anche con listini da pochi centesimi per
milione di token il costo è marginale, ma va calcolato sul listino vigente.

## 3. Dati coinvolti e privacy

| Indice / funzione | Contenuto indicizzato | Testo della query | Natura dei dati |
| --- | --- | --- | --- |
| RAG competenzestrategiche, framework, questionari | Materiali pubblicati e fonti editoriali (`docs/`) | Etichetta dello step, **messaggio dello studente, punteggi**, coda conversazionale (`chat_preparation.py:359-364`) | Corpus pubblico; **query = dati personali** (punteggi psicometrici e testo libero) |
| RAG counselorbot | Documentazione della piattaforma | Domanda dell'utente | Corpus pubblico; query personale |
| Collezioni dinamiche | Documenti caricati dall'admin | Domanda | Corpus editoriale da verificare caso per caso (potrebbe contenere materiali interni) |
| Strategie approvate / certificate, letture certificate | Catalogo editoriale | `scores_context` + messaggio | Corpus pubblico; query personale |
| Episodi di memoria di sessione | **Trascrizioni ed episodi dell'utente** (`session_memory/*.md`, non redatti: vedi `docs/implementazione/anonimizzazione-pii-audit.md`) | Messaggio | **Interamente dati personali** |

Riferimenti sulla privacy nel repository:

- `docs/protocollo-sperimentazione.md` §7: «Le comunicazioni verso provider
  AI esterni usano anonimizzazione reversibile dei dati personali». Il
  consenso informato per la ricerca è ancora un segnaposto.
- Guida utente `/guide/dati-riservatezza` (`frontend/src/lib/i18n.ts:28-33`):
  promette un filtro locale prima dell'invio «nei messaggi e nel contesto»
  e precisa che non garantisce l'anonimato.
- Sul portabile la politica è `basic` (filtro deterministico, nessun NER).

Valutazione:

1. Il percorso degli embedding **non passa da `_anonymize_external`**. Se
   l'embedding andasse oggi a un'API, query e memorie uscirebbero senza
   filtro, contro quanto dichiarano la guida e il protocollo. Ogni
   embedding via API di testo utente deve quindi passare dallo stesso
   filtro della chat.
2. Il fornitore di embedding è un **responsabile del trattamento
   aggiuntivo** (art. 28 GDPR), a meno che non coincida con il provider di
   chat già in uso. Va indicato nell'informativa e servono DPA e
   valutazione del trasferimento extra-UE (OpenAI, Google). Mistral riduce
   il problema del trasferimento.
3. I punteggi dei questionari sono dati di profilo psicologico-educativo,
   da trattare con particolare cautela. La query composta non deve
   includere `scores_context` quando l'embedding è esterno: bastano
   etichetta dello step, messaggio filtrato e nomi dei fattori.

Proposta:

| Cosa | Dove |
| --- | --- |
| Corpus pubblico (docs, docs-counselorbot, catalogo certificato, strategie approvate) | **API ammessa** |
| Collezioni dinamiche | API solo se l'admin marca la collezione come pubblicabile; altrimenti solo BM25 |
| Query RAG dello studente | API ammessa **solo** con filtro PII applicato, senza punteggi numerici e con fornitore dichiarato; altrimenti solo BM25 |
| Episodi e memorie di sessione | **Solo locale**: BM25/keyword, oppure Ollama se presente. Mai API, salvo futura decisione esplicita del titolare |
| Query sulle memorie | Locale (lo stesso testo resta nel processo) |

## 4. Piano di sostituzione

Ogni blocco è una PR separata basata su `main`, con issue propria nella
milestone «Document retrieval without Ollama (Oct 2026)». Tier: **basso** =
modello economico, effort basso; **medio** = Sonnet o Opus a effort medio;
**alto** = Opus a effort alto.

### Blocco 1 — Degradazione pulita senza backend di embedding

- Issue: `fix: degrade retrieval cleanly when the embedding backend is unavailable`
- Contenuto: cache negativa con cooldown (es. 5 minuti) dopo un errore di
  embedding, così `SiteRagIndex` non rilegge il corpus a ogni turno.
  Messaggio localizzato nell'assistente del sito al posto di `str(AIError)`.
  Avviso nei log una sola volta. Modello predefinito della Bussola letto da
  `active_provider`/`model_name` al posto di `ollama/qwen3.8`.
- DoD: test che con embedding falliti il collettore viene chiamato una sola
  volta per cooldown; test che l'SSE non contiene dettagli di trasporto;
  test della Bussola senza preset con provider attivo non Ollama.
- Complessità: bassa. Tier: basso/medio.

### Blocco 2 — Indice BM25 sempre attivo e fusione dei risultati

- Issue: `feat: add an always-on BM25 lexical index to document retrieval`
- Contenuto: BM25 in puro Python/numpy dentro `SiteRagIndex`, calcolato in
  fase di collezione senza rete e salvato accanto all'indice. Tokenizzatore
  multilingua (sei lingue UI) con stopword e normalizzazione degli accenti,
  stemming leggero opzionale. Modalità `hybrid | lexical | vector`.
  Fusione **RRF** (k≈60) dei ranghi vettoriali e lessicali, poi i pesi di
  categoria, il cap per sorgente e l'espansione via grafo già esistenti.
  Senza vettori la ricerca usa solo BM25.
- Perché non SQLite FTS5 o il full-text di PostgreSQL: il corpus sta in
  file, è piccolo (~10 M caratteri, 8,5k chunk) e l'indice è già un JSON su
  volume. Un secondo archivio aggiungerebbe migrazioni e sincronizzazione
  senza benefici misurabili. FTS5 resta un'alternativa se il corpus cresce
  di un ordine di grandezza.
- DoD: test di regressione su query note (autore nel nome del file, codici
  fattore, frasi in IT/EN/SV); la ricerca con embedder che fallisce
  restituisce risultati; tempi di build e query misurati sul framework.
- Complessità: media. Tier: medio.

### Blocco 3 — Astrazione del provider di embedding

- Issue: `feat: make the embedding provider configurable (Ollama, API, none)`
- Contenuto: `embedding_provider` = `ollama | openai | mistral | gemini |
  together | fireworks | deepinfra | none` e `embedding_model`.
  `embed_texts(texts, purpose="document"|"query")` smista ai client già
  presenti, con batch e limiti per provider, timeout e chiave di sistema
  da env (mai chiavi personali). Usage e costo registrati in `Log` con
  `cost_usd`, così rientrano nel budget mensile e nel suo blocco.
  `none` = solo lessicale.
- DoD: test con client finti per ogni ramo; nessuna chiamata di rete nei
  test; chiave mancante → errore classificato e ripiego BM25; costo
  registrato.
- Complessità: media. Tier: medio.

### Blocco 4 — Politica privacy degli embedding

- Issue: `feat: apply the external privacy policy to embedding requests`
- Contenuto: le query verso API passano da `pii_ner.anonymize_texts` con
  la stessa politica della chat (`block` vale anche qui). Query composta
  senza punteggi numerici quando il provider è esterno. `MemoryEmbedder`
  usa solo provider locali, altrimenti il ripiego lessicale. Flag per le
  collezioni dinamiche «pubblicabile all'API». Aggiornamento dei testi di
  `/guide/dati-riservatezza` nelle sei lingue e di
  `protocollo-sperimentazione.md`.
- DoD: test che le memorie non arrivano mai a un client esterno; test che
  la query esterna è anonimizzata e senza punteggi; testi i18n verificati.
- Complessità: media. Tier: alto (logica privacy).

### Blocco 5 — Indici per modello e reindicizzazione

- Issue: `feat: version RAG indexes by embedding model and reindex safely`
- Contenuto: file di indice e cache identificati da
  `provider/model/dimensione`. Controllo della dimensione del vettore query
  rispetto alla matrice. Costruzione in background con scambio atomico: il
  vecchio indice resta in servizio finché il nuovo non è completo, e nel
  frattempo serve BM25. Stima di token e costo prima di reindicizzare.
  Pulizia degli indici orfani.
- DoD: test di cambio modello (1024 → 1536 dimensioni) senza errori di
  shape; test che un build fallito lascia attivo l'indice precedente.
- Complessità: media. Tier: medio.

### Blocco 6 — Configurazione da Admin

- Issue: `feat: configure document retrieval from the admin panel`
- Contenuto: sezione «Recupero documenti» con provider, modello, modalità
  (`hybrid/lexical/vector`) e stato della chiave (presente/assente, mai il
  valore). Pulsante «Prova» su un testo fittizio, stato degli indici per
  collezione, stima dei costi e «Reindicizza». i18n nelle sei lingue. Il
  campo `embedding_model` di `prompt_config.py:662` viene rinominato
  (oggi dice «(Ollama)»).
- DoD: test dell'API admin; test frontend; nessun segreto nelle risposte.
- Complessità: media. Tier: medio.

### Blocco 7 — Documentazione e deploy portabile

- Issue: `docs: document retrieval without Ollama for the portable install`
- Contenuto: aggiornare `portable-installation.md` (tabella «senza
  Ollama»), `.env.example` (nessuna nuova variabile segreta: si riusano
  `API_KEY_*`), `CONTEXT.md`. Rebuild di `counselorbot-backend` con
  `docker-compose.portable.yml`; il volume `rag_index` persiste.
  Reindicizzazione iniziale da Admin. **Nessun passo sudo previsto.**
- DoD: stack ricostruito, container healthy, query di prova con risposta
  e fonti, log senza errori di embedding.
- Complessità: bassa. Tier: basso.

### Fuori ambito, da pianificare a parte

Issue suggerite, sotto la stessa milestone o una successiva:

- `fix: choose the budget fallback target from configured providers instead of Ollama`
- `fix: route QSA OCR fallback through AIService and its privacy filter`
- `feat: let catalog translations use the configured AI provider`
- `feat: allow pQBL OCR through a configured vision provider`

Ordine consigliato: 1 → 2 → 3 → 4 → 5 → 6 → 7. I blocchi 1 e 2 da soli
rendono il portabile utilizzabile senza alcuna chiave. Il 4 deve precedere
qualunque attivazione di un provider esterno in produzione.

## 5. Un «second brain» o vault (es. Obsidian) come fonte editoriale

È utile come strumento di redazione, non come soluzione al recupero.

- **Pro:** un vault è una cartella di Markdown con frontmatter e
  `[[wikilink]]`, già vicina a ciò che `rag_index` consuma (le collezioni
  `plain` sono cartelle di `.md`). I wikilink danno un grafo esplicito e
  curato a mano, più affidabile di quello inferito da graphify in
  `docs/graphify-out/cache/semantic`. Il frontmatter può portare
  categoria, pubblico, lingua e stato (`publish: true`), che oggi sono
  dedotti dal percorso (`category_for`).
- **Contro:** non sostituisce né embedding né BM25: sposta solo la fonte.
  Un vault personale mescola note private e materiali pubblicabili, quindi
  serve una cartella o un vault dedicato con filtro esplicito. Richiede
  una sincronizzazione (git o cartella montata) verso il server e una
  regola su chi pubblica. Duplicherebbe `docs/graphify-out/converted`
  finché la pipeline graphify resta in uso.
- **Integrazione proposta (dopo i blocchi 1–5):** una collezione dinamica
  «vault» montata in sola lettura. Indicizza solo le note con
  `publish: true`, converte i wikilink in archi di adiacenza (stessa
  struttura di `_load_graph`) e usa il frontmatter per categoria e
  pubblico. graphify resta la via per i PDF e le fonti esterne.
  Issue eventuale: `feat: index a curated Markdown vault as a RAG collection`.

## 6. Cosa non è stato verificato

- **Chiavi presenti sul portabile:** non letto il `.env` di produzione né
  il DB per vincolo dell'audit. Non so quali `API_KEY_*` siano valorizzate.
- **Configurazione runtime del portabile:** valori effettivi di
  `embedding_model`, `ollama_ip`, `ai_fallback_targets`,
  `monthly_budget_usd`, component flags `rag_*` e preset dei counselor (da
  cui dipende la Bussola). Non è verificato nemmeno se il volume
  `rag_index` contenga un indice già costruito.
- **Comportamento nel container:** verificato solo con una sonda isolata in
  un venv temporaneo con SDK simulati e Ollama su porta chiusa.
  `embed_texts` fallisce in circa 0,03 s con «Connection refused»,
  `MemoryEmbedder.rank` restituisce `None`, `SiteRagIndex.search`
  richiama il collettore a ogni tentativo. Non provato con
  `host.docker.internal` né con DNS non risolvibile.
- **Test esistenti** (`test_rag_markdown.py`, `test_pii_external.py`, …):
  non eseguiti, perché l'ambiente locale non ha le dipendenze del backend e
  la suite richiede un DB dedicato. Nessun container è stato avviato.
- **Prezzi, nomi correnti dei modelli e disponibilità degli endpoint di
  embedding** per OpenRouter, Groq, Cerebras, DeepSeek, OmniRoute e per
  bge-m3 su Together/Fireworks/DeepInfra: nessuna chiamata esterna,
  quindi tutto da verificare.
- **Qualità del recupero** con modelli API rispetto a `qwen3-embedding:4b`,
  soprattutto in svedese: richiede un set di query di valutazione.
- **Valutazione legale** (DPA, trasferimenti extra-UE, testo
  dell'informativa): fuori dalla competenza tecnica dell'audit.

## Bug registrati nel Diario

- `089e7cd5` — «RAG index rebuild retried on every request when embeddings
  are unavailable» (media, confermato con sonda).
- `54e4d065` — «Site chat shows raw Ollama connection error to end users
  when embeddings fail» (bassa, sospetto).
- `c996ef4c` — «Bussola falls back silently because default model is
  hard-wired to ollama/qwen3.8» (media, sospetto).

## Bug non registrati

Nessuno. Il ripiego OCR verso OpenRouter senza filtro privacy e il ripiego
per budget verso Ollama erano già documentati in
`docs/operations/portable-install-audit.md` e `portable-installation.md`;
qui sono riportati solo come issue suggerite.
