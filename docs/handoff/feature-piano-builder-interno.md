# s11-builder — builder dei piani operativi

## Stato
PR unica [#595](https://github.com/nugh75/counselorbot-sbs/pull/595), branch
`feature/piano-builder-interno`, senza conflitti (`MERGEABLE`). I tre task feature
sono `fatto` e non vanno riaperti: 2014148c (passi autonomi), eb537b45 (forum in
pagina), c8a79b2b (incontri in pagina). Questo handoff copre la chiusura CI e la
consegna (task f0802d7a, poi 6172fff3). Merge e review restano del proprietario.

## Fatto
- Passi autonomi anche nei piani storici strict; ordine solo visivo. Riferimenti
  storici delle analisi conservati come dati, senza vincolare ordine o rimozione.
- Discussioni e incontri creati e modificati in finestra nel builder, con le API e
  i permessi esistenti; bozza del piano preservata sugli errori.
- Chiusura CI: riscritti i quattro casi che asserivano il blocco sequenziale
  (`test_legacy_strict_*`). Baseline SQLite riallineata 385→355 (−30 casi che ora
  passano davvero, verificati nell'XML JUnit), una voce rinominata.
- **Integrazione di main `39d72182` (PR #601, fix SSE)** nel merge `d059a99e`:
  unica variazione di baseline è la rimozione della voce
  `test_sse_heartbeat.py::test_sync_disconnect_returns_promptly_and_closes_after_the_pending_next`
  → baseline SQLite **354 voci**. Nessun allargamento, nessuna modifica a runtime o
  test SSE oltre all'integrazione esatta di #601. Baseline PostgreSQL invariata (53).

## Verifiche
- Consegna precedente, verde e verificata: head `968b7ca7`, run `40235232613` →
  `documentation`, `portability`, `startup (sqlite)`, `tests (sqlite)` e
  `tests (postgres)` tutti `success`; PostgreSQL 5866 verdi con 53 censiti e
  **0 fuori baseline**; SQLite **0 fuori baseline**.
- Dopo l'integrazione di #601, sul branch così com'è: `test_sse_heartbeat.py`
  isolato su SQLite **16/16 verdi in 10,3 s** (prima falliva sotto carico), quindi
  la rimozione dalla lista è corretta; `check-platform-guidance.py --check` rc=0;
  `sync-version.py --check` rc=0 (0.1.1 allineato).
- Locali già verdi nello stesso filone e non ripetuti: typecheck, ESLint mirato,
  `check-i18n.mjs` (3535 chiavi, 6 lingue), 697 test Node di `src/lib`, due suite
  browser del builder sul runner 3176.
- CI del head integrato: tracciata dai check della PR #595; nessun rerun locale.
  Non dichiarare verdi su SHA diversi da quello push-ato.

## Prossimi passi
Revisione e merge dal proprietario. Nessun deploy, tag, release, migrazione dati
o variabile nuova richiesta.

## Blocchi e rischi
Il flake SSE noto è corretto da #601 ed è uscito dalla baseline: se ricompare va
trattato come regressione nuova, non riallargando il ratchet. S15 resta il
riferimento per il trasporto SSE; qui non si tocca `backend/sse.py` né il test.
Limite preesistente: le scritture forum usano `statement_timestamp` e restano fuori
dalle suite SQLite storiche; il forum è verificato su PostgreSQL. Runner 3176 e
PostgreSQL temporaneo sono fermi; nessun dato o servizio di produzione toccato.
