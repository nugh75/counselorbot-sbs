# Allineamento di Bussola, Assistente e guida

Il riferimento corrente è `docs-counselorbot/funzionalita-counselorbot.md`, letto
a ogni richiesta da Bussola e Assistente CounselorBot. Il contesto di fabbrica in
`backend/prompts/default_counselorbot_chat_context.md` ne mantiene una sintesi. Distingue:

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

## Guida per uso personale e docente

La pagina pubblica `/guide` offre un selettore fra due percorsi, consultabili
anche prima del login:

- `/guide?audience=student`: uso personale/studente, 15 sezioni;
- `/guide?audience=teacher`: docente, 7 sezioni dedicate ad accesso, gruppi,
  cataloghi, assegnazioni, restituzioni/riscontri, condivisione e strumenti.

Il parametro seleziona soltanto la documentazione, non assegna ruoli. Gli URL
senza parametro o con valore sconosciuto aprono il percorso personale. Le ancore
personali `#guide-section-N` restano valide; quelle docente usano
`#guide-teacher-section-N`. I testi aggiuntivi sono in
`frontend/src/lib/i18n-guide-audiences.ts`, con sei traduzioni obbligatorie.

Le immagini sono catture della UI reale con API simulate e dati sintetici:
nessun account reale, nessuna chiamata di scrittura al backend. Le nove nuove
viste (Area personale, obiettivi, due eventi, Area docenti, gruppi, catalogo,
assegnazione e riscontro) sono acquisite in tutte le sei lingue. Le due viste
chat correnti sono state riacquisite in italiano, come dichiara la guida.
Il registro `frontend/src/lib/guide-images.ts` usa import statici per produrre
asset con hash; il percorso personale mostra dieci immagini e quello docente
sette, tutte ingrandibili anche da tastiera. La nota dimostrativa riguarda anche codici d’invito, nomi e contenuti.

Per rigenerare, da `frontend/`, contro un frontend aggiornato:

```bash
node --experimental-strip-types scripts/capture-guide.mjs
UPDATE_GUIDE_SCREENSHOTS=1 node --test --experimental-strip-types \
  --test-name-pattern='capture current guide screenshots' tests/visual-tools.test.mjs
```

`GUIDE_BASE_URL` cambia l’URL per le nuove viste; `VISUAL_TOOLS_BASE_URL` per le
viste chat. Ispezionare le immagini e ricostruire l’immagine Docker frontend
**dopo** la cattura, così le nuove risorse entrano nel bundle distribuito.

Verifiche browser aggiuntive:

```bash
node --test --experimental-strip-types tests/guide-audiences.test.mjs
node --test --experimental-strip-types \
  --test-name-pattern='updated guide' tests/visual-tools.test.mjs
```

Le prove coprono entrambe le versioni nelle sei lingue, accesso pubblico,
collegamenti diretti, ricarica e cronologia, ancore, decodifica delle immagini,
zoom/chiusura e ritorno del focus, tastiera, temi chiaro/scuro e larghezze
320/390/1440 px. Le chiamate della guida non devono modificare dati.

### Verifica dei due percorsi — 21 settembre 2026

- 12 prove browser superate (6 per percorso) nelle sei lingue, con larghezze
  320/390/1440 px, tema scuro e tastiera. Verificato anche il ritorno al percorso
  docente dopo ancore interne, cambio percorso, ricarica e Indietro: il selettore
  usa navigazione documentale per ripristinare insieme URL e contenuto.
- i18n (2.789 chiavi), ESLint dei file modificati, TypeScript e build Docker
  frontend superati. Container frontend ricreato e avviato; backend invariato.
- 57 PNG distribuiti confrontati con i sorgenti tramite SHA-256: tutti coincidenti.
  Controllo visivo delle catture e delle due guide su desktop e telefono.
- Prova locale senza API simulate: entrambe le versioni rispondono HTTP 200 a
  390 e 1440 px, con 15/7 sezioni e nessun overflow orizzontale. Il dominio
  pubblico restituisce HTTP 302 verso SSO: la prova locale non costituisce
  verifica di una sessione pubblica autenticata. La guida non impone login
  applicativo, ma resta soggetta all’eventuale controllo SSO del dominio.

## Riferimento vivo delle funzionalità (23 settembre 2026)

Il riferimento operativo è **`docs-counselorbot/funzionalita-counselorbot.md`**.
`backend/platform_guidance.py` lo legge a ogni richiesta dell’Assistente nella base
CounselorBot e a ogni analisi della Bussola. Non viene memorizzato all’importazione:
una modifica nel volume `COUNSELORBOT_DOCS_DIR` vale dalla richiesta successiva,
senza riavviare i worker o ricostruire gli embeddings. Le altre basi dell’Assistente
non ricevono questo documento. I prompt configurati mantengono le istruzioni di
comportamento; i fatti correnti prevalgono sulle vecchie descrizioni di interfaccia.

L’Assistente aggiunge il documento intero alle fonti disponibili, con anteprima
Markdown consultabile. Risponde sui fatti documentati anche quando non ci sono
risultati vettoriali o il servizio embeddings restituisce un errore AI. Le altre
basi conservano il comportamento precedente. Un file mancante o invalido è un
problema operativo: non viene sostituito silenziosamente da una copia obsoleta.
La Bussola conserva inoltre i propri fallback localizzati in caso di errore AI.

### Obbligo per ogni modifica al prodotto

1. Aggiornare il Markdown delle funzionalità nella stessa modifica al codice:
   nomi visibili, collocazione, comportamento, salvataggio, permessi e limiti.
   Anche una correzione può richiedere una precisazione; una modifica interna
   senza effetti visibili va annotata come tale, senza inventare funzionalità.
2. Se cambia ciò che l’utente vede o deve fare, allineare i testi della Guida
   nelle sei lingue e le schermate interessate. Preservare gli ancoraggi esistenti.
3. Eseguire `make guidance-refresh` dopo la revisione, poi `make guidance-check`.
   Il refresh viene rifiutato se i sorgenti cambiano ma il Markdown è identico.
   Includere `docs/operations/platform-guidance-state.json` nel commit.
4. La GitHub Action `Platform guidance` verifica gli hash e, rispetto alla base
   della modifica, la presenza dell’aggiornamento del Markdown. Il controllo
   comprende codice frontend/backend, prompt, immagini e configurazione Docker;
   esclude test e dati ignorati da Git. Aggiunte e rimozioni sono comprese.
5. Ricostruire l’indice CounselorBot quando cambiano gli approfondimenti RAG;
   il riferimento vivo è già aggiornato indipendentemente dall’indice. Modifiche
   ai prompt attivi nel database richiedono comunque il piano con hash descritto
   sopra. Non sovrascrivere personalizzazioni o la scheda condivisa con altre basi.

Il controllo rileva la mancata revisione, **non interpreta il significato del
codice** e non certifica da solo la completezza del testo. Il contenuto resta
curato da chi implementa la funzione. Modifiche amministrative nel database non
sono visibili a Git: seguono lo stesso obbligo di aggiornamento documentale.

Le schermate della Guida comprendono ora anche presentazione, catalogo, PDF e
Flashcard, con dati sintetici e sei lingue. La struttura resta di 15 sezioni per
uso personale e 7 per docenti; le sezioni 8–9 spiegano PDF/Flashcard e strumenti
personali. Il catalogo è distinto dalla presentazione e la ripresa resta in fondo.

### Verifica dell’allineamento corrente

- Guida aggiornata nelle sei lingue; 12 prove browser su percorsi personale/docente,
  immagini, zoom da tastiera, navigazione e larghezze 320/390/1440 px superate.
  Acquisizione della chat e delle viste localizzate con soli dati sintetici.
- 205 test frontend, controllo i18n (2916 chiavi per lingua), ESLint mirato,
  TypeScript di produzione e build Docker frontend superati.
- Test del lettore vivo: nuova versione visibile alla richiesta successiva,
  isolamento dalle altre basi, errore per documento mancante e risposta fondata
  anche senza risultati o con errore del servizio embeddings.
- Tre prompt attivi allineati mediante `backend.prompt_updates`, con controllo
  dell’hash e cronologia. Nessuna modifica alla scheda condivisa con Competenze.
- Prova col modello attivo: colloca PDF/Flashcard nell’Area personale, ripresa in
  fondo al catalogo e distingue bozza automatica da revisione manuale del Taccuino.
  Prova sintetica senza creare conversazioni o lavori di studenti.
- Il controllo documentale è verificato su modifiche, aggiunte e rimozioni di file;
  il refresh senza aggiornare il Markdown viene rifiutato.
- 89 test backend superati (88 nel container e controllo dei percorsi frontend
  nel repository); 3 test del controllo documentale superati. Indice CounselorBot
  corrente: 287 passaggi da 17 fonti; anteprima del Markdown vivo verificata.
- Backend e frontend ricostruiti e avviati; pagina locale `/guide` HTTP 200.
  I test browser usano API simulate, mentre la prova del modello usa il servizio
  AI attivo: non equivalgono a una verifica di login SSO pubblico.
