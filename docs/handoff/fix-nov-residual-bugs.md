# Handoff — fix/nov-residual-bugs

## Stato
Completo: verifiche eseguite, PR in apertura verso `main` (project `CounselorBot`, `Refs #911`).

## Fatto
- Rimosso il backup orfano tracciato `docs-counselorbot/funzionalita-counselorbot.md-e` (`git rm`); né `Makefile` né `scripts/` usano `sed -i -e` o lo ricreano.
- `backend/tests/test_smoke.py`: `test_an_older_stage_of_the_map_can_be_drawn_again` falliva localmente con `422` perché `GET /idea/map/image` solleva `GraphvizUnavailableError` (sottoclasse di `DiagramSpecError`, mappata a `422`) quando il binario `dot` di Graphviz non è installato sull'host macOS. Aggiunto il controllo `if not find_program("dot"):` (stesso pattern di `test_diagram_endpoint_renders_svg_when_graphviz_present` in `test_smoke.py:7950`) dopo la verifica `404` della revisione inesistente.
- Audit "Student area Back button loops back to /profilo": già risolto da `#973` (`e1df7c5f`). Prova in codice: `frontend/src/app/profilo/page.tsx:444-447` rende `<PageHeader>` senza `backHref` sulla home `/profilo`; `PersonalAreaHeader.tsx:28-38` usa `<AreaBreadcrumbs items={[{ label: l('title'), href: '/profilo' }, ...]} />` e `<PageHeader>` senza `backHref`; le sottopagine (`VisualTools.tsx:300`, `TavoloWorkspace.tsx:283`, `PersonalAPISettings.tsx:175`) puntano a `/profilo` o `/profilo/tavolo` e `PreviousPageButton.tsx:33` verifica `cbPreviousPage !== window.location.pathname`.
- `frontend/tests/admin-section-filter.test.mjs` e `frontend/tests/admin-step-system-prompt-key.test.mjs` (`Refs #911`): rimosso il fallback `/usr/bin/chromium` a favore di `...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})`, e aggiornato `admin-step-system-prompt-key.test.mjs` alla vista `Mappa dei prompt` (`/admin?section=prompt-map&instrument=OBIETTIVO_STUDIO`, selettori `[data-entry-key="..."]`).

## Verifiche
- `PYTHONPATH=. pytest backend/tests/test_native_deps.py backend/tests/test_idea_map.py backend/tests/test_diagram_render.py`: 167 passed, 6 skipped.
- `test_smoke.py` (`test_an_older_stage_of_the_map_can_be_drawn_again`): richiede Postgres locale (vietato avviare container Postgres in questo task).
- `make guidance-check`: OK.
- `cd frontend && npm run test:ci && npm run i18n:check && npx next typegen && npx tsc --noEmit -p .`: verdi.

## Prossimi passi
- Attesa CI su GitHub e review/merge dell'utente. Nessun deploy né passo `sudo` (modificati solo test e rimosso file di backup doc).

## Blocchi e rischi
- Nessuno.
