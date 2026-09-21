# Allineamento di Bussola, Assistente e guida

La descrizione di piattaforma in
`backend/prompts/default_counselorbot_chat_context.md` è il riferimento comune
per la Bussola e il contesto predefinito dell’Assistente. Distingue:

- sei questionari con profilo di punteggi;
- quattro strumenti conversazionali senza punteggi: SAVICKAS, IDEA,
  EVENTO_STUDIO ed EVENTO_PROFESSIONALE;
- pQBL, Bussola, Assistente e Guida;
- Area personale, obiettivi, attività, calendario/diario, carte, confronto,
  Tavolo, Taccuino, Libretto e Portfolio;
- cataloghi e assegnazioni dei docenti, lavoro personale, restituzioni,
  riscontri e permessi di condivisione distinti.

I percorsi sugli eventi significativi prevedono sei passi e una sintesi finale
che può diventare una bozza del Libretto, da rivedere e salvare esplicitamente.
Non sono eventi del calendario, questionari o valutazioni con punteggi.

## Dove aggiornare

1. Modificare il contesto comune e, se necessario, le aperture dei due prompt
   `prompt_counselorbot_chat_docente` e `prompt_counselorbot_chat_studente` in
   `backend/prompt_config.py`. La scheda strumenti è in
   `backend/prompts/default_site_chat_knowledge_card.md`.
2. Allineare i riferimenti e i fallback nelle sei lingue in `backend/orientation.py`.
   Le regole QSA-first, l’autonomia della persona e il catalogo chiuso restano validi.
3. Aggiornare i documenti operativi in `docs-counselorbot/`, realmente indicizzati
   dall’Assistente. Le pubblicazioni accademiche conservano il testo della fonte.
4. Aggiornare la guida visibile: `frontend/src/app/guide/page.tsx` e le chiavi
   `guide.*` di `frontend/src/lib/i18n.ts` nelle sei lingue. Le sezioni 10–15
   coprono i due eventi, obiettivi, calendario/diario, assegnazioni e docenti.

## Configurazioni attive e attivazione

Il database prevale sui default: un rebuild non sostituisce i prompt esistenti.
Preparare un piano JSON con `version: 1` e `changes`, ciascuno con `scope`, `key`,
`before`, `after` ed `expected_hash` (SHA-256 del valore precedente). Conservarlo
fuori dal repository, con permessi 0600, e revisionare il diff prima di applicarlo.
Non includere configurazioni estranee: il piano del 21 settembre 2026 riguarda
solo i due prompt dell’Assistente CounselorBot, `counselorbot_chat_context` e
`site_chat_knowledge_card`. Le regole comuni dei prompt già configurati sono
preservate; alla scheda esistente si aggiungono soltanto i tre strumenti mancanti.

Copiare il piano nel container aggiornato e usare il meccanismo esistente:

```bash
docker exec counselorbot_backend python -m backend.prompt_updates apply /tmp/platform-guidance-plan.json
```

L’applicazione confronta tutti gli hash prima delle scritture, registra lo storico
`PromptRevision` e applica il lotto in una transazione. Il comando `rollback` sullo
stesso piano ripristina i valori precedenti solo se non sono stati modificati nel
frattempo. Non introdurre una migrazione automatica all’avvio.

Ricostruire backend/frontend dopo le modifiche al codice o ai prompt inclusi nelle
immagini. Dopo l’aggiornamento dei documenti, reindicizzare soltanto la collezione
`counselorbot` dal pannello RAG o tramite `get_index('counselorbot').build(AIService(db))`.
Riavviare il backend se la ricostruzione è stata eseguita da un processo separato,
per svuotare le copie dell’indice eventualmente già caricate nei worker.

## Verifiche

- Backend: `test_platform_guidance.py`, `test_orientation.py`,
  `test_prompt_updates.py` e `test_prompt_files.py`. I nuovi test usano PostgreSQL
  isolato e coprono composizione effettiva, assenza di obiettivi, priorità DB,
  separazione delle collezioni e completezza dei fallback nelle sei lingue.
- Frontend: controllo i18n, ESLint, TypeScript e build.
- Browser: da `frontend/`, `node --test --experimental-strip-types
  --test-name-pattern='updated guide' tests/visual-tools.test.mjs` controlla le
  15 sezioni, le ancore, le immagini e l’assenza di overflow a 320/390/1440 px,
  includendo tutte le lingue e il tema scuro. Le API sono simulate nel test.
- Runtime: verificare i quattro valori attivi, gli hash dei file nel container,
  le fonti dell’indice e il recupero dei passaggi su eventi/assegnazioni. Le
  risposte del modello vanno distinte dalla verifica dei prompt e del retrieval.

## Verifica del 21 settembre 2026

- 62 test backend superati; restano i warning di deprecazione preesistenti.
- Controlli i18n, ESLint dei file modificati e TypeScript superati.
- Build Docker backend/frontend completate; sorgenti dei prompt e Bussola nel
  container verificati tramite SHA-256; tutti e quattro i worker avviati.
- Sei test browser della guida superati nelle sei lingue, a 320/390/1440 px,
  con tema scuro incluso. Ulteriore apertura senza API simulate a 390 e 1440 px:
  tutte le 15 sezioni presenti, nessun overflow; HTTP locale `/guide` 200.
- Quattro configurazioni attive aggiornate con storico; una successiva revisione
  dei due testi informativi chiarisce che la sintesi degli eventi è il passo 7.
  Entrambi i piani sono conservati fuori dal repository per rollback in ordine
  inverso. Nessuna migrazione automatica e nessuna modifica ai dati degli studenti.
- Collezione CounselorBot ricostruita: 259 passaggi da 16 fonti, modello embedding
  `qwen3-embedding:4b`. Verificata attuale anche dopo il riavvio dei worker.
  Tre richieste in italiano recuperano passaggi pertinenti su entrambi gli eventi,
  restituzioni/riscontri e collegamento fra obiettivi, attività e diario.
- Prove live con `qwen3.8:latest` locale: Bussola distingue conversazioni sugli
  eventi e calendario; Assistente studente spiega pianificazione, obiettivi,
  restituzione separata, ritiro e protezione delle bozze; Assistente docente
  riconosce la lezione tenuta come evento professionale e la sintesi al passo 7.
  Richieste sintetiche senza identità studente, conversazioni o assegnazioni salvate.
  L’Assistente è stato verificato in streaming come nella route applicativa:
  il primo tentativo con chiamata bloccante aveva raggiunto il timeout.
- Ulteriore prova live dopo la precisazione delle fonti: l’Assistente indica
  correttamente l’editor nella stessa pagina dell’assegnazione e la data facoltativa.
