# s11-builder — builder dei piani operativi

## Stato
PR unica [#595](https://github.com/nugh75/counselorbot-sbs/pull/595), branch
`feature/piano-builder-interno`. Contiene il builder (tre task feature `fatto`, da
non riaprire: 2014148c passi autonomi, eb537b45 forum in pagina, c8a79b2b incontri
in pagina) e le integrazioni di main. Merge e review restano del proprietario.

## Fatto
- Passi autonomi anche nei piani storici strict, ordine solo visivo; riferimenti
  storici delle analisi conservati come dati. Discussioni e incontri gestiti in
  finestra nel builder con le API e i permessi esistenti, bozza preservata.
- Chiusura CI: riscritti i quattro casi del blocco sequenziale
  (`test_legacy_strict_*`); baseline SQLite riallineata 385→355 (−30 casi che ora
  passano davvero, verificati nell'XML JUnit), una voce rinominata.
- Integrazione main `39d72182` (PR #601, fix SSE) nel merge `d059a99e`: unica
  variazione di baseline la rimozione della voce SSE
  `test_sse_heartbeat.py::test_sync_disconnect_...` → SQLite 354 voci.
- **Integrazione main `1b5270d5` (PR #589, UI consensi P10)** nel merge `08a8059a`.
  Unico conflitto: `docs/operations/platform-guidance-state.json`, rigenerato
  dall'albero combinato con `check-platform-guidance.py --refresh` (né ours né
  theirs: nuova coppia di hash). Codice, dizionari i18n e checker i18n P10
  (camelCase) conservati insieme alle chiavi `piano.builder.*` del builder.
  Baseline ratchet intatte: SQLite 354, PostgreSQL 53. Nessun allargamento.

## Verifiche
- Verdi già registrate, non ripetute: head `968b7ca7`, run `40235232613` tutto
  `success` (PostgreSQL 5866 verdi, 53 censiti, 0 fuori baseline; SQLite 0 fuori
  baseline); `test_sse_heartbeat.py` 16/16 dopo #601.
- Dopo il merge P10, sull'albero combinato: `check-platform-guidance.py --check`
  e `--check --base origin/main` rc=0; unittest del checker rc=0;
  `sync-version.py --check` rc=0 (0.1.1); `check-i18n.mjs` **3652 chiavi, 6 lingue**
  (unione P10 + builder); `tsc --noEmit` rc=0; import `backend.main` ok.
- CI del head integrato: tracciata dai check della PR #595, da verificare fino
  all'esito. Non attribuire verdi a SHA diversi da quello push-ato.

## Prossimi passi
Revisione e merge dal proprietario. Nessun deploy, tag, release, migrazione dati o
variabile nuova richiesta.

## Blocchi e rischi
Il flake SSE è corretto da #601 e uscito dalla baseline: se ricompare è una
regressione nuova, non un ratchet da allargare (riferimento: S15). P10 e builder
convivono sullo stesso albero: ogni futura modifica deve preservare entrambi.
Limite preesistente: le scritture forum usano `statement_timestamp` e restano fuori
dalle suite SQLite storiche (forum verificato su PostgreSQL). Runner 3176 e
PostgreSQL temporaneo sono fermi; nessun dato o servizio di produzione toccato.
