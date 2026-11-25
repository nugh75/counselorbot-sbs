# Handoff — Issue #911 (lotto 1): 2 bug reali frontend + 5 test Playwright aggiornati

## Contesto
Primo lotto di lavoro su [#911](https://github.com/nugh75/counselorbot-sbs/issues/911) (*Rewrite stale browser tests to match the current app*): durante lo sweep Playwright contro un dev server isolato (`next dev --webpack --port 3191`, `BACKEND_ORIGIN=http://127.0.0.1:9`) sono emersi due bug reali nell'applicazione che bloccavano il rendering di più pagine, più cinque suite browser obsolete.

## Modifiche effettuate
- **Bug reali corretti:**
  - `frontend/src/lib/ai-source.ts`, `frontend/src/components/layout/HeaderAISource.tsx`, `frontend/src/lib/ai-source.test.ts`: aggiunto type-guard `isAISource` e fallback `null` su `Badge` così `/api/me/ai-source` con payload inattesi (es. `[]` o `{}`) non manda in crash `RootLayout`.
  - `frontend/src/components/ui/RoleBadge.tsx`: riformulato il commento con `--role-<ruolo>-muted` perché Tailwind CSS v4 lo estraeva generando CSS non parsabile da Turbopack (`Unexpected token Delim('<')`).
- **Test browser Playwright riallineati e verificati (`49/49` assert verdi su `:3191`):**
  - `frontend/tests/teacher-area-home.test.mjs`: icone inline SVG al posto di `<img>` nelle tile + filtro sul falso positivo dev Next 16 `cannot have a negative time stamp` su redirect server-side.
  - `frontend/tests/personal-area-home.test.mjs`: verifica flessibile con il catalogo strumenti (`#profile-instrument-catalog`) incluso nella home personale, focus Tab sul primo gruppo illustrato, attesa `domcontentloaded` e rimozione dell'assert obsoleto contro `/api/user/questionnaire-results` (ora usato da `PersonalAreaHome`).
  - `frontend/tests/personal-error-states.test.mjs`: limite PDF aggiornato da `100 MB` a `25 MB`.
  - `frontend/tests/personal-pqbl.test.mjs`: selettore univoco `a[href="/profilo"][aria-labelledby="intro-link-workspace"]` nella schermata intro.
  - `frontend/tests/personal-ai-visibility.test.mjs`: rimosso `/usr/bin/chromium` hardcoded (allineato a PR `#1038`) + filtro su `cannot have a negative time stamp` nei redirect `api-personali`/`chatgpt`.
- **Documentazione:** aggiornati `docs-counselorbot/funzionalita-counselorbot.md` e `docs/progetto/piano-interventi.md` (allineamento `make guidance-check` e stato PR `#1040`–`#1044`).

## Da completare in seguito su #911
Eseguire i rimanenti test Playwright di `frontend/tests/` (incluso `personal-area-header.test.mjs` ed aree catalogo, strumenti, palestra, classi, obiettivi, navbar e legacy routes) contro un singolo dev server isolato avviato con `--webpack`.
