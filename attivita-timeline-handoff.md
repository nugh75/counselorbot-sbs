# Handoff: Attività con date + Linea del tempo unica
Data: 2026-09-25 | Sessione precedente: rete Obiettivi (live) → ripensamento «Il mio percorso»

## Objective
Eliminare il doppione Attività / «Calendario e diario». Un solo oggetto «attività» con
data facoltativa (Bacheca); la pagina diventa «Linea del tempo» e mostra tutto (tappe
passate, attività datate, revisioni obiettivi, appuntamenti istituto); il futuro
desiderato sta negli Obiettivi; niente tappe future personali; Obiettivi e Assegnazioni
creano un solo oggetto. Prova in dev prima del rebuild.

## Progress
Branch `feature/activities-timeline` (da main df1dcd4). Spec
`docs/plans/2026-09-25-attivita-linea-del-tempo-design.md`, piano
`docs/plans/2026-09-25-attivita-linea-del-tempo-plan.md` (8 task). Esecuzione con
superpowers:subagent-driven-development; ledger (gitignored, fonte di verità):
`.superpowers/sdd/2026-09-25-attivita-linea-del-tempo-plan/progress.md`.
- [x] Task 1-3 backend (commit 41bd57b, b43030d, 40c044c): date su Action (DatedItem),
  422 su eventi personali futuri, migrazione per utente in `ensure_personal_timeline`,
  goals/assegnazioni creano solo attività datate.
- [x] Fix round 1 backend (9356909): migrazione senza perdite (traccia testuale
  Portfolio/collegamenti nel detail), merge solo se date assenti/uguali, riflessioni
  accodate, lock proprio nella migrazione, marcatore scritto una volta. 95 test verdi.
- [x] Re-review fix round 1: ok, ma nuova rottura (riflessioni fuse >1000 → 500).
- [x] Fix round 2 backend (b539851): riflessione fusa >1000 → attività separata;
  carryover assegnazioni troncato a 1000 con «…». 97 test verdi. Backend CHIUSO.
- [x] Task 4 lib `timeline-items.ts` (81d2b7d + test f6a2e10, 221 test unit). CHIUSO.
- [x] Task 5 date in Bacheca (89f1a0a + fix 31627a8): ActionDates.tsx, `?new=1` apre
  la creazione e poi si toglie dall'URL, link «Vedi sulla linea del tempo»
  (`?item=action-<id>`, ancora da gestire nel Task 6). CHIUSO.
- [x] Task 6 pagina Linea del tempo (1541061): nuovo `PersonalTimeline.tsx` (testata
  PersonalAreaHeader, barra +Tappa/+Attività/+Obiettivo, filtri con
  `cb_timeline_filters`, sezioni Passato/Oggi/Futuro/Senza data, `?item=`/`?event=`,
  calendario su `TimelineItem[]`, esportazione Portfolio invariata, useDraftGuard);
  `GoalsPanel` apre la creazione con `?new=1`; nome/descrizione «Linea del tempo» in 6 lingue.
- [x] Task 7 assegnazioni/testi/guida/docs (2baa89c, c64dd18): riflessione assegnazione
  da `event?.reflection ?? action?.reflection`; guida §13–14 e intro in 6 lingue;
  docs-counselorbot aggiornato; guidance-refresh/check ok.
- [x] Task 8 test browser (fa9e762): `frontend/tests/activities-timeline.test.mjs`
  (5 casi: attività datata → linea del tempo → ancora bacheca; obiettivo con revisione
  → popup; + Tappa passato senza scelta collocazione; filtri persistenti; 390 px senza
  overflow). Fixture `goals_browser_server.py` con `student-timeline` + middleware
  `asyncio.Lock` (sessione condivisa: senza serializzazione race/duplicati). Verifica
  completa: 97 test backend toccati, 221 unit, tsc, i18n:check, build, lint (1 errore
  pre-esistente in NewDeckDialog.tsx), guidance-check.
- [x] Deploy: mergiato su `main`, push, `./deploy.sh` (rebuild Docker).

## Stato finale
Feature COMPLETATA e in produzione. Nessun task aperto sul piano.
## Problems Encountered
- Limite di sessione API interrompe i sub-agenti: verificare `git log` e `git status`
  prima di riprendere; riprendere lo stesso agente o ridispatchare dal brief.
- In questo checkout `session_memory/` è di root: ~32 test backend falliscono sempre
  (non regressioni). Usare lo sweep mirato del ledger.
- Porta 3107 condivisa tra dev frontend dell'utente e test browser: controllare
  `ss -ltnp` e usare una porta alternativa, senza fermare processi altrui.

## Resolutions
- Test backend: comando Postgres host in global-constraints del ledger (porta 5435).
- `assignment_work.link_goal` ristretto a `kind='action'` (event_id ora sempre NULL).

## Decision Log
- Tre funzioni, un posto ciascuna: futuro desiderato = Obiettivi; fare = Attività;
  quando/racconto = Linea del tempo — scelta utente per togliere doppioni.
- Tappe future → Obiettivi (merge obiettivi/tappa futura) — decisione utente.
- Linea del tempo «mostra tutto»; tolta la scheda Calendario da Attività — utente.
- Nome pagina «Linea del tempo» — utente.
- Chat (workspace di sessione) invariate — contenere lo scope.
- Migrazione per utente in ensure_personal_timeline, non all'avvio — copre import tardivi.
- Assegnazioni: riflessione sull'attività; righe storiche con evento valido invariate.
- Perdita strutturale accettata solo come traccia testuale (Portfolio/collegamenti di
  eventi futuri migrati; in prod 0 casi); `symbol` scartato (solo visivo).
- Prova in dev (`scripts/dev-backend.sh` 8002, `scripts/dev-frontend.sh` 3107) prima
  del rebuild Docker — preferenza utente.
