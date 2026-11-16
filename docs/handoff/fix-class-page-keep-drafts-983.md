# Handoff — fix/class-page-keep-drafts-983 (issue #983)

## Stato
Commit creati; merge origin/main, push e PR in corso.

## Fatto
- `useTeacherResource`: un reload dello stesso path con dati già caricati non rimette
  `loading`, usa `refreshing` (aggiornamento in background); cambio path = primo caricamento.
- `ClassDetail`: `TeacherLoading` solo al primo caricamento; errore di refresh mostrato sopra
  le schede senza smontarle; `ClassToolsEditor` con `key={settings.data.revision}`.
- Scheda attiva in `?tab=` via `history.replaceState` (Panoramica = nessun parametro).
- Test `frontend/tests/class-page-keep-drafts.test.mjs`; doc funzionalità aggiornata.

## Verifiche
- ESLint sui file toccati: ok.
- `node --test --experimental-strip-types` (Node 22) su class-page-keep-drafts e
  flat-area-subpages: 12/12 ok.
- `tsc --noEmit`: nessun errore nei file toccati (5 errori `.png` preesistenti per
  `next-env.d.ts` mancante nel worktree).
- `make guidance-check`: ok.

## Prossimi passi
Commit, merge origin/main, push, PR, `gh pr checks`.

## Blocchi e rischi
- Nessun controllo visivo (vietato dev server): da verificare a mano dopo il deploy.
- Caso limite: salvo strumenti, modifico ancora, poi ricarica Panoramica → la revisione nel
  padre cambia e l'editor si riallinea perdendo la seconda bozza.
- Test di sorgente (nessun jsdom/vitest nel frontend), non di rendering.
