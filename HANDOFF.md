# Handoff: Libretto nella triade — rilasciato; follow-up aperti
Data: 2026-09-26 | Sessione precedente: completamento lotti C–D, revisione finale, merge (PR #8) e deploy

## Objective
Il libretto (`StudentBooklet`, `/profilo/libretto`) è eliminato e le sue domande vivono in
Compilazioni («La mia lettura»), Taccuino, Obiettivi (metodo, controlli, bilancio, origine, prove,
PDF «Percorso dell'obiettivo») e Linea del tempo. **Obiettivo raggiunto e in produzione.**
Restano solo i follow-up qui sotto.

## Progress
- [x] Lotti A–D (21 task) su `feature/libretto-triade`, merge `0091a84` su `main`, PR #8 MERGED, push fatto.
- [x] Revisione finale (Opus): 1 Critical + 6 Important corretti (`f6523dd`…`7156845`), ri-revisione pulita.
- [x] Rebuild `docker compose up -d --build backend frontend`: container attivi, startup pulito.
- [x] Migrazione in produzione: 8 utenti, 9 letture; marcatore durevole `configs.booklet_triade_migration_done = 2026-09-26`.
- [x] Testi DB aggiornati con conferma dell'utente: 20 config/guided_step via `backend.prompt_updates apply`
      (revisioni registrate), 2 `orientation_tool_briefs`, 12 domande guidate riscritte, 18 domande
      dell'assistente disattivate (sostituite dai nuovi seed).
- [ ] Catture della guida non rigenerate (vedi Problems).
- [ ] Test browser preesistenti rossi (vedi Problems).
- [ ] Pulizia worktree temporanei: `/tmp/cb-mainbase` (baseline main) da rimuovere con
      `git worktree remove /tmp/cb-mainbase` (prima `rm` del symlink `frontend/node_modules`); `/tmp/cb-libretto` non serve più.
- [ ] Stash `c3-wip-baseline-check` (`5e51d30`) lasciato da un subagente: contenuto già committato, eliminabile.

## Problems Encountered
- `frontend/scripts/capture-guide.mjs` si ferma al passo calendario (`#timeline-guide-event`): simula una
  tappa **futura**, che la Linea del tempo non mostra più dal lotto attività. Va corretto il mock (tappa passata
  o azione datata) prima di rigenerare le catture di Obiettivi/Compilazioni/Linea del tempo nelle 6 lingue.
- `npm run test:timeline`: 2 fallimenti (1440px link alla bacheca; filtri dopo reload) **anche su main 245b84f**.
- `npm run test:visual`: molti fallimenti (test del TimelineTools personale, ramo non più raggiungibile) anche
  prima del piano. La baseline su main era in corso a fine sessione: log in
  `/tmp/claude-1000/-home-nugh75-counselorbot-sbs/5881af38-7f4c-49d4-a609-76617b5e396d/scratchpad/base-visual.log`.
- Backend: fallimenti noti fuori piano: 4 test diagrammi/icone, 2 OCR locali (falliscono anche su main),
  smoke `test_an_older_stage_of_the_map_can_be_drawn_again`.
- La pulizia dei log a 90 giorni (`_log_retention_loop`) cancella anche i workspace personali e i marcatori
  per utente: rischio preesistente, da escludere prima di eliminare la tabella `student_booklets`.

## Resolutions
- Test backend sempre da worktree/checkout con `DATABASE_URL` sul DB test `localhost:5435` (vedi CLAUDE.md/CONTEXT.md).
- Test browser: fixture `python3 -m backend.tests.goals_browser_server` (porta 18096, **riavviarla a ogni run**)
  + dev server del checkout da testare; con `node_modules` in symlink serve `next dev --webpack`.
- `docker exec` con script da stdin richiede `-i`, altrimenti Python non riceve niente.
- Rollback dei testi DB: `python -m backend.prompt_updates rollback <plan>` nel container (piano non più su disco:
  ricostruibile dai `prompt_revisions`); backup completo: `~/counselorbot-backups/pre-libretto-triade-20260926-0850.dump`.

## Decision Log
- Solo modelli Anthropic (utente): pi/glm dismessi; da C4 in poi implementazione diretta del controller (Opus 5.5).
- Rotte libretto → 410 con un unico helper registrato su ogni percorso (lista `EXPECTED_ROUTES` intatta).
- `/profilo/libretto` → redirect a Compilazioni mantenendo `?instrument=`.
- Tabella `student_booklets` conservata come sorgente read-only della migrazione.
- Migrazione ad ogni avvio, idempotente: marcatore per utente in `logs` + marcatore globale durevole in `configs`.
- Schede evento migrate: `objective→try_next`, `strategy→how_when`, contesto in testa alla rilettura; arricchiscono la tappa già sincronizzata.
- Etichetta `('booklet','Libretto')` mantenuta nella traccia delle attività migrate (traccia senza perdite).
- Nuova chiave flag `student_booklet` invariata (config salvata in DB); etichetta UI «La mia lettura»; marcatore contesto `[READING]`.
- PDF: marcatori metodo in parole («certificata/mia») perché il font core è latin-1.
- Vecchio `reflection` degli obiettivi: visibile in sola lettura (dialog + PDF «Note») solo finché non c'è un bilancio.
- Prompt DB personalizzati: solo **append** di una nota «booklet retired»; testi UI di conclusione evento: **sostituzione**.
- DE/SV «La mia lettura» = «Meine Deutung» / «Min tolkning» (non «Lesung»/«läsning»).
- Registro completo con tutti i ruling (R1–R25): `/tmp/cb-libretto/.superpowers/sdd/2026-09-25-libretto-nella-triade-plan/progress.md`
  (fuori dal repo: copiarlo altrove se serve conservarlo prima di eliminare il worktree).
