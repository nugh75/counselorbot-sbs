# Visual conversation tools

## Scope and acceptance

Implement the first three tools proposed to the user: a personal action board,
a comparison of up to three alternatives, and reflection cards to sort.
Reuse existing recommendations as optional source material. Do not generate new
recommendations, change prompts, inject hidden model instructions, or write to
the Taccuino automatically. Explicit discussion places the student's work in the
composer for review before sending.

## Delivery plan

1. Isolate work on `feature/visual-conversation-tools` in its own worktree.
2. Add session-owned, versioned storage with validation and conflict detection.
   Reuse the existing Log table; no schema migration or prompt configuration.
3. Add a shared visual workspace to guided chat and the graphical OpenCode chat.
   Provide a visible entry point, source-to-card action, editable action stages,
   comparison criteria/notes/choice, card sorting, undo and explicit save/retry.
4. Support six UI languages, 44px controls, keyboard navigation, mobile layout,
   dark mode, a text handoff and PDF export. Sorting works with simple controls;
   dragging is not required. The final session PDF includes saved visual work.
5. Test validation, ownership, stale-save conflicts, persistence, export, and
   browser interactions. Inspect mobile and desktop screenshots.
6. Inspect the other agent's changed paths. Keep its worktree untouched; check
   our patch against its in-progress changes before integrating and deploying.
   Only router registration and PDF data loading may need small separate hunks
   in shared integration files. Never copy or deploy unfinished prompt changes.

## Boundaries

- Prompt worktree: `/home/nugh75/counselorbot-sbs-prompts` (read-only).
- No edits to prompts, chat preparation, model context, routing policies,
  recommendation generation, skills, admin configuration, or Compose settings.
- Actions are the student's plan, separate from certified recommendation state.
- Comparison notes express the student's criteria, not computed suitability.
- Timeline, branching scenarios and flashcards are subsequent work.

## Verification before integration

- 104 frontend unit tests; TypeScript; six-language checks; ESLint (only four existing warnings).
- 24 targeted backend tests: ownership, bounded data, revision conflicts, persistence,
  final PDF compatibility and multi-page content.
- Nine visual-workspace browser cases, including 320/390/1440px, Italian/German/English,
  dark mode, keyboard focus, undo, network failures, conflicts, PDF retry, OpenCode,
  completed-session behavior, and an out-of-order response after closing/reopening. Fourteen existing artifact cases also pass.
- Actual screenshots inspected for mobile/desktop and the generated PDF.
- Our two integration files apply cleanly to a read-only snapshot of the prompt
  agent's in-progress files. No file in that worktree was edited.
- Touch validation uses browser emulation; no physical-device test was performed.

## Explicit personal transfers (2026-09-06)

The student can now select a visual entry and append edited text to a chosen notebook field or an existing/new booklet sheet for the session instrument. The full resulting field is previewed; excessive text is rejected without truncation. The reverse flow lets the student select an annotation field and create a card, action or comparison alternative. Both directions require confirmation and preserve provenance. There is no automatic synchronization. Notebook demographic fields and booklet factor scores are not offered as transfer content. Tests cover ownership, append preservation, stale writes, field limits, retry duplicates and desktop/mobile interaction.

## Cose da fare: strumenti con immagini e schemi (2026-09-06)

Stato: piano registrato, implementazione non avviata. La richiesta attuale
autorizza la stesura del piano; lo sviluppo partirà su successiva indicazione.
Questa sezione descrive l'evoluzione futura, distinta dalle funzionalità già
consegnate sopra.

### Regola di lavoro: una cosa alla volta

- Una sola attività numerata può essere in corso. Nessuno sviluppo parallelo
  di strumenti diversi, nemmeno tramite altri agenti.
- Seguire l'ordine sotto; completare anche le sottoattività in sequenza.
- Chiudere l'attività con risultato verificabile ed evidenze prima di passare
  alla successiva. Un blocco resta esplicito: non saltarlo iniziando altro.
- Alla chiusura riportare cosa è terminato, verifiche e limiti, e quale attività
  viene dopo. L'avanzamento segue il perimetro autorizzato dall'utente; questo
  backlog non autorizza automaticamente l'intera implementazione.
- Se emerge una nuova idea, aggiungerla in coda senza ampliare l'attività attiva.

### Sequenza delle attività

- [ ] **1. Verificare risorse e API per le carte illustrate.**
  Controllare assegnazioni e stato non segreto delle API in Console, credenziali
  disponibili per il backend, quote e condizioni d'uso. Pexels, Pixabay,
  Unsplash e Iconfinder risultano nel catalogo locale esaminato, ma ciò non
  dimostra l'assegnazione o l'operatività per CounselorBot. Gemini è previsto
  come provider dal codice; la generazione immagini richiede un'integrazione
  dedicata. Non esporre chiavi né eseguire generazioni a pagamento durante
  questa verifica. Scegliere una sola fonte iniziale, valutando repertorio
  statico revisionato, fotografie da API o illustrazioni generate.
  **Chiusura:** breve decisione documentata con fonte, disponibilità verificata,
  attribuzioni, limiti, costi stimati e punti ancora incerti.

- [ ] **2. Definire l'attività educativa delle carte illustrate.**
  Preparare consegna, esempio, criterio di selezione delle immagini e un piccolo
  campione rappresentativo. Conservare i gruppi attuali delle carte; il significato
  dell'immagine viene spiegato dallo studente, non dedotto come tratto personale
  dall'AI. Definire testi alternativi e modalità di ripresa in chat.
  **Chiusura:** esempio completo e revisionato dell'esperienza, con perimetro
  della prima versione e repertorio iniziale definito.

- [ ] **3. Realizzare e chiudere le carte illustrate.**
  Procedere nell'ordine: dati e immagini persistenti; selezione e raggruppamento;
  annotazioni; salvataggio e riapertura; ripresa esplicita in chat; esportazione.
  Riutilizzare React, Lucide e i componenti esistenti. Valutare dnd kit solo per
  il trascinamento, mantenendo comandi da tastiera e un'alternativa al gesto.
  Le credenziali restano gestite dalla Console e utilizzate dal backend.
  **Chiusura:** prove di proprietà della sessione, conflitti di salvataggio,
  persistenza delle immagini, PDF e browser mobile/desktop, sei lingue e tema
  scuro; breve prova d'uso e correzione dei problemi emersi. Completare la
  consegna Git/runtime secondo il perimetro autorizzato prima di iniziare altro.

- [ ] **4. Definire la linea del tempo personale.**
  Partire dall'esito delle carte. Definire eventi passati e futuri, date precise
  o periodi approssimativi, simboli, annotazioni e immagini dal repertorio scelto.
  Preparare un esempio che colleghi un'esperienza a un prossimo passo.
  **Chiusura:** esempio revisionato, modello dei dati e interazioni concordati.

- [ ] **5. Realizzare e chiudere la linea del tempo.**
  Procedere nell'ordine: dati degli eventi; vista temporale; modifica e ordine;
  salvataggio e riapertura; ripresa in chat; PDF. Usare inizialmente React,
  CSS/SVG e date-fns già presenti; aggiungere dipendenze solo per un'esigenza
  dimostrata. Non trasformarla in un calendario generale.
  **Chiusura:** verifiche equivalenti alle carte, ordine temporale e periodi
  incerti inclusi, prova d'uso e consegna completata nel perimetro autorizzato.

- [ ] **6. Definire lo storyboard di una situazione.**
  Progettare una sequenza guidata di 3–5 scene: situazione, ostacolo, azione,
  possibile esito. Riutilizzare il repertorio immagini. Eventuali proposte AI
  restano bozze modificabili; valutare la generazione su richiesta solo dopo
  aver verificato utilità e costi. Preparare un esempio educativo completo.
  **Chiusura:** esempio revisionato e scelta esplicita delle funzioni della
  prima versione, senza editor grafico libero.

- [ ] **7. Realizzare e chiudere lo storyboard.**
  Procedere nell'ordine: dati delle scene; immagini e didascalie; riordino;
  salvataggio e riapertura; ripresa in chat; PDF. Riutilizzare React e l'eventuale
  dnd kit introdotto per le carte, mantenendo testi e immagini separati e
  modificabili. Konva non è necessario per caselle prestabilite.
  **Chiusura:** verifiche equivalenti agli strumenti precedenti, ordine delle
  scene incluso, prova d'uso e consegna completata nel perimetro autorizzato.

### Idee in coda, da valutare soltanto dopo

Scenari futuri affiancati, matrice delle priorità e collage personale restano
proposte non impegnative. Se si decide di svilupparle, sceglierne una sola e
aggiungere attività sequenziali con criteri di chiusura. Per un eventuale collage
libero valutare react-konva/Konva; Recharts è già disponibile per grafici
quantitativi. Nessuna di queste librerie va installata preventivamente.
