# Handoff — fix/nov-ui-css-bugs

## Stato
Completo: verifiche locali tutte verdi, PR #1034 verso `main` aperta (project `CounselorBot`).

## Fatto
- `globals.css`: `--info-ink: #f8fafc` esplicito in `.dark` (11.08:1 su `#103f42`), `.prose` (`h1..h4`, `strong`, `code`, `blockquote`) portato ai token semantici, `--success` chiaro portato a `var(--color-emerald-700)` (>5.1:1 su `#ffffff` e `#f8fafc`).
- `tool-catalog.ts` + `InstrumentCatalog.tsx`: `resolveCatalogSections` omette le categorie senza strumenti risolti da `activeInstrumentById`.
- `i18n-guide-tasks.ts`: sostituito nella scheda `events` (6 lingue) il riferimento al ritirato Libretto con la Linea del tempo.
- `docs-counselorbot/funzionalita-counselorbot.md` (e `-e`): rimosse le citazioni a `percorsi-classe.png` e `incontri.png`.
- Test unitari: `globals-css-tokens.test.ts`, estensioni in `tool-catalog.test.ts` e `guide-tasks.test.ts`.

## Verifiche
- `cd frontend && npm test`: 915/915 verdi.
- `cd frontend && npm run i18n:check`: 3920 chiavi x 6 lingue ok.
- `npx eslint` sui file TS/TSX toccati: 0 errori.
- `npx next typegen && npx tsc --noEmit -p .`: 0 errori.
- `make guidance-check`: documentazione allineata.
- Nessun dev server né Playwright eseguiti (vincolo del task).

## Prossimi passi
- PR: https://github.com/nugh75/counselorbot-sbs/pull/1034 — attesa CI e review/merge del proprietario.
- Deploy post-merge: rebuild solo frontend (`docker compose up -d --build --no-deps counselorbot-frontend`), nessun passo `sudo`.

## Blocchi e rischi
- Bug fuori scope registrato nel Diario (`5b2a0c19-2960-49f8-ad00-48d56cf0385a`): `docs-counselorbot/funzionalita-counselorbot.md-e` tracciato in git come backup orfano `sed -i -e`.
