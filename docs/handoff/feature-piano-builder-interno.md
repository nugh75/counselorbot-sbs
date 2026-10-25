# s11-builder — builder dei piani operativi

## Stato
PR unica [#595](https://github.com/nugh75/counselorbot-sbs/pull/595), branch
`feature/piano-builder-interno`, senza conflitti (`MERGEABLE`). I tre task feature
sono `fatto` e non vanno riaperti: 2014148c (passi autonomi), eb537b45 (forum in
pagina), c8a79b2b (incontri in pagina). Questo handoff copre la sola chiusura
CI/consegna (task f0802d7a). Revisione del proprietario e merge restano suoi.

## Fatto
- Passi autonomi anche nei piani storici strict; ordine solo visivo. Riferimenti
  storici delle analisi conservati come dati, senza vincolare ordine o rimozione.
- Discussioni e incontri creati e modificati in finestra nel builder, con le API e
  i permessi esistenti; bozza del piano preservata sugli errori.
- Chiusura CI: riscritti i quattro casi che asserivano ancora il blocco sequenziale
  (`test_legacy_strict_*`). Baseline SQLite riallineata da 385 a 355 voci
  (−30 che ora passano) e una voce rinominata sul nuovo nome del caso misto.
- Allineamento a `origin/main` 0.1.1 incluso; `platform-guidance-state.json`
  rigenerato dopo il merge. Baseline PostgreSQL invariata (53 voci, tutte ancora
  fallenti: nessuna voce stantia). Nessuna modifica a `backend/sse.py` o al test SSE.

## Verifiche
- CI sullo SHA `754629a5` (run `40227302878`): `documentation`, `portability`,
  `startup (sqlite)` e `tests (sqlite)` verdi; `tests (postgres)` 5865 verdi,
  53 censiti e **un solo inatteso**:
  `test_sse_heartbeat.py::test_sync_disconnect_returns_promptly_and_closes_after_the_pending_next`.
  Confronto integrale artefatto `postgres-failures` vs baseline: nessun altro scarto.
- Prova di indipendenza dal branch: la suite `test_sse_heartbeat.py` eseguita isolata
  su SQLite ha fatto passare quel caso e fallire con `TimeoutError` un altro caso
  (`…flush_headers_and_first_frame_before_slow_work[voice_reader]`) sotto carico.
  È instabilità di timing del trasporto SSE, non regressione del builder; diagnosi
  e fix spettano a S15.
- Locali verdi nello stesso giro: `make guidance-check` e `--check --base`, `make
  version-check`, unittest dello script guidance, typecheck, ESLint mirato,
  `check-i18n.mjs` (3535 chiavi, 6 lingue), 697 test Node di `src/lib` e le due
  suite browser del builder sul runner 3176.
- Nota d'ambiente: il checker `check-platform-guidance.py` va in timeout quando
  `git ls-files` è conteso dagli altri agenti; non è un errore del repo.

## Prossimi passi
PR pronta per la revisione e il merge dal proprietario. Nessun deploy, tag, release,
migrazione dati o variabile nuova richiesta.

## Blocchi e rischi
Resta rosso il solo job PostgreSQL per il flake SSE, comune e già censito nel
commento della baseline: S15 è l'unico responsabile della diagnosi. Non allargare
ratchet né toccare il runtime SSE per forzare il verde. Limite preesistente:
le scritture forum usano `statement_timestamp` e restano fuori dalle suite SQLite
storiche; il forum è verificato su PostgreSQL. Runner 3176, PostgreSQL temporaneo
e processi di prova sono fermi; nessun dato o servizio di produzione toccato.
