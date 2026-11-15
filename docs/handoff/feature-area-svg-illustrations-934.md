# Handoff — feature/area-svg-illustrations-934

## Stato
PR #944 aperta (issue #934, mappa #920), in attesa di merge. Check gating verdi.

## Fatto
- 24 SVG `area-*` + 2 SVG di categoria (questionario, percorso) in `frontend/src/lib/tool-illustrations.ts`, stessa griglia 96x96 e palette `--i-*`.
- `personalAreaImages` → `personalAreaIllustrations`, `teacherAreaImages` → `teacherAreaIllustrations` (id `area-*`).
- `ToolIllustration` ora solo SVG; `EntryLink` perde la prop `image` (non più usata).
- Elenchi `/profilo`, `/docente`, Riprendi, Libreria, Provare e intestazioni d'area usano `ToolIllustration`.
- Doc: `docs/design.md`, `docs-counselorbot/funzionalita-counselorbot.md`.

## Verifiche
- `node --test` su `tool-illustrations.test.ts`, `teacher-area.test.ts`, `tests/flat-area-subpages.test.mjs`: verdi.
- eslint sui file toccati: pulito. tsc: solo TS5097 preesistente in `field-wiring.test.ts` (non toccato).
- `make guidance-check`: verde. CI: documentation ed eslint verdi.
- Visivo: foglio PNG con tutti gli SVG in chiaro e scuro (Playwright su HTML statico), nessun dev server.
- `tests/personal-area-home.test.mjs` aggiornato (richiede app avviata): non eseguito.

## Prossimi passi
- Merge PR; poi i PNG elencati nella PR possono essere rimossi in un PR separato.

## Blocchi e rischi
- Build desktop rosse per il TS5097 preesistente su main (bug registrato nel Diario), non gating.
- In scuro i tratti isolati su sfondo (`--i-out`) hanno poco contrasto, come negli SVG strumenti esistenti.
