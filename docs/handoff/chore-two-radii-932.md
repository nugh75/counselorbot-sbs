# Handoff: chore/two-radii-932 (#932)

## Stato
Sweep completato; in attesa di commit/PR. Base: `origin/main` (#946). Nessun
conflitto noto: gli altri ticket del map toccano file diversi.

## Fatto
- **Due raggi (M10)**: in `frontend/src` (esclusi `components/admin/` e
  `ui/DiagramBlock.tsx`) `rounded-md`/`rounded` → `rounded-control`,
  `rounded-xl`/`rounded-2xl` → `rounded-card`, `rounded-lg` → `rounded-control`
  su `button`/`input`/`select`/`textarea`/`a`/`Link`/`Button`/`label` e
  `rounded-card` su `div`/`section`/`li`/`article`/`details`/`fieldset`/`form`/
  `nav`/`p`/`img`/`pre`. 85 file, 286 classi; `rounded-full` e le varianti
  direzionali intatte.
- **Test**: nuova guardia in `lib/ui-primitives-tokens.test.ts` («only
  rounded-control and rounded-card outside the admin area»); riscritta
  l'asserzione stale di `tests/flat-area-subpages.test.mjs` (la pagina
  orientamento ora usa `<Callout variant="warning">`, falliva già su main).
- **Doc**: `docs-counselorbot/funzionalita-counselorbot.md` (§ Due soli raggi),
  `docs/design.md` §2.6 e commento in `lib/utils.ts`.

## Verifiche
- `tsc --noEmit -p .`: 3 errori pre-esistenti (`field-wiring.test.ts`,
  `factor-chart-colours.test.ts`, TS5097), identici prima e dopo lo sweep.
  Serve `next-env.d.ts` (gitignored) e `node_modules` symlink al checkout
  principale, altrimenti 255 errori TS2307 sulle immagini guida.
- `eslint` sui 85 file toccati: 0 errori, 23 warning pre-esistenti.
- Node 22.23.3 (`--experimental-strip-types`): 8 test flat → 28/28;
  `ui-primitives-tokens`, `loading-states`, `guided-path-flat`,
  `counselor-identity` → 32/32 + 14/14.
- Accettazione grep: fuori da `components/admin/` resta solo
  `ui/DiagramBlock.tsx` (5 classi, escluso dalla issue).
- Nessun controllo visivo/browser (Mac 8 GB, volume esterno lento): solo classi.

## Prossimi passi
- PR contro main, milestone «Flat visual consistency (Nov 2026)»; merge manuale.

## Blocchi e rischi
- `app/admin/*` è stato incluso (la issue esclude solo `components/admin/`).
- Restano fuori scope e invariati: `rounded-sm` (4), `rounded-xs` (3),
  `rounded-none` (2), `rounded-[2px]`, `rounded-t-*`/`rounded-b-*`,
  `rounded-l-full`/`rounded-r-full`.
- `frontend/node_modules` è un symlink al checkout principale (solo per i check);
  non versionato.