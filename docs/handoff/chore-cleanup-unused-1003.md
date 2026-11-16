# Handoff — chore/cleanup-unused-1003 (#1003)

## Stato
Completo: verifiche verdi, commit pronti, PR verso main in apertura.

## Fatto
- Rimossi 6 file frontend non importati da codice di produzione:
  `PersonalAreaEntry`, `GroupAssignments`, `QuestionnaireIcon`,
  `guide-institutes`, `AnalysisModeSelector`, `VisualPersonalTransfer`.
- Rimossi 4 cartelle immagini non citate (`onboarding`, `minimal`,
  `stylized`, `functional`) e 10 PNG di `images/platform` non referenziati.
- `git rm backend/app.db` (0 byte; già coperto da `*.db` in `.gitignore`).
- Prompt copertine classe in inglese in `frontend/src/lib/class-cover-presets.ts`
  (`themePrompt` x10 e `composeClassCoverAIPrompt`).
- Test aggiornati: `guided-path-flat.test.ts`, `flat-notices-headings.test.ts`,
  `class-cover-presets.test.ts`.
- Doc: `funzionalita-counselorbot.md`, `docs/operations/class-centred-plan.md`.

## Verifiche
- `npx tsc --noEmit` (frontend): 0 errori (`next-env.d.ts` generato dal CI;
  `node_modules` symlink al checkout main, package-lock identico).
- `node --test --experimental-strip-types` sui 3 file toccati: 12/12.
- `npx eslint` sui file toccati: pulito.
- `make guidance-check`: ok.
- Nessun controllo visivo: niente dev server per vincolo RAM.

## Prossimi passi
- Push, PR, merge del proprietario. Deploy solo frontend (nessun backend,
  nessun passo sudo): rimuove file e immagini da `public/`, rigenerare l'immagine
  frontend.

## Blocchi e rischi
- 4 PNG rimossi sono citati solo in `docs/plans/2026-09-23-area-personale-audit-piano-ux.md`
  (piano storico, già inaccurato): lasciato invariato.
- Nessun contenuto runtime nel DB verificabile senza accesso al DB; il grep su
  repository (codice, seed, config) non trova riferimenti.
