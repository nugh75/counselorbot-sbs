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
- **Lotto 2 dell'audit Area personale applicato (2026-09-26)**: testata comune 0.3 su tutte le
  pagine dell'area (`/profilo/*` mega-pagina, azioni/carte/confronto, flashcard, pQBL). Piano
  aggiornato. Lot 1A in backlog su accordo esplicito (utenti di prova); da fare prima dell'apertura
  a utenti reali (F02 Portfolio `setForm(null)`, guardia `draftTitle` in VisualTools).
- Test browser stanti preesistenti (falliscono anche senza queste modifiche):
  `personal-area-home` 8 (17→16 collegamenti dopo il ritiro libretto), `personal-tools-navigation` 2,
  `personal-pqbl` 2, `notebook-autosave` 2. Da riallineare in un lotto test dedicato.
- Errore lint preesistente `NewDeckDialog.tsx:36` (setState sincrono in effect) e 14 warning —
  già presenti prima di questo lavoro.
- Backend: 4 test diagrammi/icone, 2 OCR locali, smoke `test_an_older_stage_of_the_map_can_be_drawn_again`
  falliscono anche su main (ambiente locale, fuori piano).
- **Domanda di prodotto aperta**: il campo `planned` («Cosa programmo») non è più editabile nella
  pagina unificata `/profilo/timeline` — l'editor `MilestoneEditor` non lo espone e il ramo `personal`
  di `TimelineTools.tsx` (che lo aveva) è codice morto non raggiungibile. Il dato resta nel modello,
  nel PDF e nelle snapshot. Da decidere: reintrodurre il campo o ripulire il ramo morto.
- Prima di eliminare la tabella `student_booklets`: escludere workspace personali e marcatori per
  utente dalla pulizia log a 90 giorni (`_log_retention_loop`) — rischio preesistente.

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
