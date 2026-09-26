# Handoff: Libretto nella triade — follow-up chiusi
Data: 2026-09-26 | Sessione precedente: completamento lotti C–D, revisione finale, merge (PR #8) e deploy

## Objective
Il libretto (`StudentBooklet`, `/profilo/libretto`) è eliminato e le sue domande vivono in
Compilazioni («La mia lettura»), Taccuino, Obiettivi (metodo, controlli, bilancio, origine, prove,
PDF «Percorso dell'obiettivo») e Linea del tempo. **Obiettivo raggiunto e in produzione.**

## Follow-up della sessione 2026-09-26 — TUTTI CHIUSI
- [x] **Registro decisioni R1–R25 salvato**: `docs/handoff/2026-09-25-libretto-nella-triade-sdd-ledger.md`
      (nel repo); tutti gli artefatti SDD (brief, report, review, diff) in
      `~/counselorbot-backups/libretto-sdd-artifacts/` (fuori dal repo, 2.2 MB).
- [x] **`capture-guide.mjs` corretto e catture rigenerate in 6 lingue**. La causa reale non era la
      tappa futura (il mock era già al passato) ma il selettore obsoleto `#timeline-guide-event`
      (oggi `#timeline-milestone-<id>`) e il mock obiettivo senza i campi nuovi del modello
      (`parent_ids`, `method`, `origin`, `reviews`, `checks` → crash «goal.parent_ids is not iterable»).
      Mock evento messo in `tense: 'past'` per coerenza. 126 PNG aggiornati; `guide-images.ts` invariato.
- [x] **`test:timeline` 5/5** (prima 2/5). Causa: i titoli di prova con timestamp numerico
      («Sessione di studio 073050 1440» → run di 10 cifre) vengono **redatti come telefono** dalla
      redazione PII; dopo il salvataggio il titolo cambia e i selettori non trovano più la card.
      Fix: stamp base36 (stesso pattern di `personal-goals.test.mjs`, fix B6) + `waitFor` esplicito.
      Flaky per natura: falliva solo quando il timestamp passava il check di Luhn.
- [x] **`test:visual` 32 pass / 0 falliti / 2 skip opt-in** (baseline vecchia: 12/34).
      I test dialog-era di `/profilo/timeline` sono stati riscritti per la pagina unificata
      (commit `1541061`): Portfolio snapshot, 4 forme di data + diario, midnight timezone,
      legacy text, date istituzionali. Conteggio figure guida 18→19. Test «repeat step» aggiornato
      all'ordine di barra introdotto da `7eabda1` (Congela, [Precedente], Ripeti, [Avanza]).
- [x] **Pulizia**: worktree `/tmp/cb-mainbase` e `/tmp/cb-libretto` rimossi (dopo copia artefatti e
      rimozione del symlink `node_modules`), stash `c3-wip-baseline-check` (`5e51d30`) eliminato,
      processo `next dev` orfano del worktree terminato.
- [x] **Baseline `test:visual` della sessione precedente NON attendibile**: era girata su
      `/tmp/cb-mainbase` (main vecchio) con i test nuovi → fallimenti da disallineamento test/codice.

## Remaining (non bloccanti)
- **Lotto 1A** (audit Area personale) in backlog su accordo esplicito (utenti di prova); da fare
  prima dell'apertura a utenti reali (F02 Portfolio `setForm(null)`, guardia `draftTitle` in VisualTools).
- **F21 applicato (2026-09-26)**: scheda azione leggibile di default con modifica esplicita
  (Modifica → campi → Chiudi); il tavolo di sessione resta com'è.
- **Sessione chiusa in produzione (2026-09-26)**. **F26 (Tavolo) e lotto 1A (F02/F06) applicati
  prima della chiusura**: Tavolo con lista in cima e creazione/modello dopo; X del Portfolio
  con conferma di scarto; i testi delle sotto-form di creazione attivano le guardie di uscita.
  **Lotto 4 e Lotto 5A completati.** Resta solo 5B (estensioni da concordare: consegna lavoro già svolto, anteprima invito, bozze Tavolo).
  Verifica finale: frontend/api 200, unit 233/233, timeline 5/5, visual 32/0, error-states 7/7,
  personal-5a 4/4, goals 19/21 (2 fallimenti preesistenti su main).
- Errore lint preesistente `NewDeckDialog.tsx:36` (setState sincrono in effect) e 14 warning —
  già presenti prima di questo lavoro.
- Backend: 4 test diagrammi/icone, 2 OCR locali, smoke `test_an_older_stage_of_the_map_can_be_drawn_again`
  falliscono anche su main (ambiente locale, fuori piano).
- Prima di eliminare la tabella `student_booklets`: escludere workspace personali e marcatori per
  utente dalla pulizia log a 90 giorni (`_log_retention_loop`) — rischio preesistente.

## Completati il 2026-09-26 (audit Area personale)
- **Lotto 2 dell'audit Area personale applicato (2026-09-26)**: testata comune 0.3 su tutte le
  pagine dell'area (`/profilo/*` mega-pagina, azioni/carte/confronto, flashcard, pQBL). Piano
  aggiornato.
- **Lotto 3A residuo applicato (2026-09-26)**: creazione obiettivo con «Più dettagli ▾» (criteri,
  priorità, stato, condivisione ripiegati; titolo/motivazione/data in vista) e ponte
  «→ Collega a un obiettivo» dal Portfolio (inline, un obiettivo per volta, solo obiettivi attivi,
  endpoint `/user/goals/{id}/links` esistente, 409 → pannello riapribile con dati freschi).
  F12/F13/F16 così assorbiti; il lotto 3A si considera chiuso.
- **Lotto 1B applicato (2026-09-26)**: F03 — stati di caricamento/errore/vuoto distinti con
  Riprova su Taccuino, Compilazioni, Portfolio, Classi e Telegram (un 503 non mostra più
  «nessun dato» né fa sparire la card; crash preesistente di `CrossSynthesisCard` su risposta
  inattesa corretto); F04 — uscita dal gruppo con conferma inline che nomina il gruppo,
  conseguenze, busy ed errore locale; F25 — uploader pQBL allineato al backend (solo PDF,
  100 MB). Test: `tests/personal-error-states.test.mjs` 7/7.
- **Lotto 4, parte applicata (2026-09-26) — Linea del tempo, Carte, Flashcard, Confronto**: decisione `planned` = reintroduzione del
  campo «Cosa programmo» nell'editor della pagina unificata, visibile solo su tappe future o
  senza data (il contratto del campo è invariato; snapshot e PDF lo includono già).
  `TimelineTools.tsx` eliminato come dead code (unico uso era il ramo `personal` irraggiungibile
  dal lotto attività-timeline; nessun riferimento nei test). **F23 applicato (2026-09-26)**: rinomina in linea (`ui/InlineRename.tsx`) al posto dei
  `window.prompt` nativi, nei mazzi/colonne di Carte e nei mazzi di Flashcard.
  **F24 applicato (2026-09-26)**: Confronto progressivo (Criteri/Confronto/Scelta solo con
  almeno un'alternativa, etichette di passo 1–4 in sei lingue).
- **Lotto 5A completato (2026-09-26) — Assegnazioni, Classi e Telegram (audit Area personale)**:
  - F27: lista assegnazioni gestibile con un solo dettaglio aperto alla volta per lo studente e vista docente sempre espansa; filtri client-side per gruppo, tipo, finalità (richiesta/proposta) e stato (da esplorare, pianificata, inviata, con riscontro); link diretto con hash `#assignment-N`.
  - F28: pianificazione spiegata (`planHelp`: crea attività e tappa personali, non invia nulla al docente).
  - F29: anteprima con destinatario esplicito (`Destinatario: {author_name}`) e nota di copia statica (`copyStays`).
  - F30: collegamenti contestuali Classi↔Assegnazioni (`/profilo/assegnazioni?group=...`) e messaggi docente consultabili nella pagina Classi (`MyGroupsCard` + `TeacherNotesCard`).
  - F31: Orientamento verificato dal pilota 0.3 (nessuna modifica necessaria).
  - F32: Telegram a 3 passi guidati con scadenza codice visibile (`expires_in_minutes`), verifica automatica al ritorno (`visibilitychange`), pulsante "Verifica il collegamento", stati distinti e rigenerazione codice.
  - F34 parziale: date localizzate con `toLocaleDateString(lang)` in assegnazioni, iscrizioni a gruppi e note docente.
  - Test browser: `frontend/tests/personal-5a.test.mjs` (4/4 pass), `frontend/tests/personal-error-states.test.mjs` (7/7 pass), `frontend/tests/assignments.test.mjs` compatibile, unit 233/233 pass, `tsc` ed `eslint` puliti.
- **Ordinamento gruppi Area personale (2026-09-26)**: «Conoscermi e riflettere» precede ora «Il mio percorso» nella pagina d'ingresso di `/profilo` (`personalAreaGroups`).
- **Domanda di prodotto chiusa**: il campo `planned` («Cosa programmo») è di nuovo editabile nella
  pagina unificata `/profilo/timeline` (tappe future o senza data); `TimelineTools.tsx` eliminato.
- **Guida funzionalità riallineata**: `docs-counselorbot/funzionalita-counselorbot.md` aggiornata
  per lotti 2, 3A, 1B, 4 e 5A e nuovo ordinamento gruppi; `make guidance-refresh` e `make guidance-check` eseguiti.

## Resolutions
- Test backend sempre da worktree/checkout con `DATABASE_URL` sul DB test `localhost:5435` (vedi CLAUDE.md/CONTEXT.md).
- Test browser: fixture `python3 -m backend.tests.goals_browser_server` — avviarla con
  `GOALS_TEST_HOST=127.0.0.1 GOALS_TEST_PORT=18096` (la 8096 di default collide con altri progetti)
  e **riavviarla a ogni run** (lo schema persiste tra i run).
- Rollback dei testi DB: `python -m backend.prompt_updates rollback <plan>` nel container (piano non più su disco:
  ricostruibile dai `prompt_revisions`); backup completo: `~/counselorbot-backups/pre-libretto-triade-20260926-0850.dump`.

## Decision Log
Vedi `docs/handoff/2026-09-25-libretto-nella-triade-sdd-ledger.md` per il registro completo R1–R25.
Punti chiave: solo modelli Anthropic (R9, R12); rotte libretto → 410 con helper unico; tabella
`student_booklets` conservata read-only; migrazione idempotente con marcatori durevoli; DE/SV
«La mia lettura» = «Meine Deutung» / «Min tolkning»; etichetta `('booklet','Libretto')` mantenuta
nella traccia migrate (R23); PDF con marcatori metodo in parole per il font latin-1 (R19).
