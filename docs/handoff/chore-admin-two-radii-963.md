# Handoff: chore/admin-two-radii-963 (#963)

## Stato
Sweep dei raggi completato su 39 file admin (311 classi); test e doc aggiornati.
In attesa di commit/PR. Base `origin/main` (e3c8012d). Nessun dev server avviato.

## Fatto
- **Raggi admin**: in `frontend/src/components/admin/**` e `app/admin/**`
  `rounded`/`rounded-md`/`rounded-sm` → `rounded-control` (154),
  `rounded-lg` → `rounded-card` su contenitori (153) e `rounded-control` su
  controlli (15), `rounded-2xl` → `rounded-card` (4).
- **Test**: rimosso lo scaglionamento admin da
  `lib/ui-primitives-tokens.test.ts` («only rounded-control and rounded-card
  outside DiagramBlock») + nuova guardia «the admin area uses the same two
  radii» (elenco directory admin, regex a zero, soglia 60 file).
- **Doc**: `docs-counselorbot/funzionalita-counselorbot.md` § Due soli raggi e
  `docs/design.md` §2.6.

## Verifiche
- `node --test --experimental-strip-types src/lib/ui-primitives-tokens.test.ts`
  → 18/18; `admin-content-zone-tokens.test.ts` + `admin-system-zone-tokens.test.ts`
  → 7/7.
- `tsc --noEmit -p frontend`: 0 errori. `eslint` sui 40 file toccati: 0 errori,
  25 warning pre-esistenti (righe non toccate). `make guidance-check`: allineata.
- Selettore del fixture browser `admin-step-system-prompt-key` aggiornato a
  `rounded-card` (era `rounded-lg`); il fixture non è stato eseguito (serve un dev
  server, vietato in questa sessione).
- Nessun controllo visivo/browser (Mac 8 GB, volume esterno lento): solo classi.

## Prossimi passi
- PR contro main, milestone «Flat visual consistency (Nov 2026)», merge manuale.

## Blocchi e rischi
- Restano fuori scope: `rounded-full` (55) e le varianti direzionali
  `rounded-t-xl`/`rounded-t-2xl` dei due dialoghi a mano (2), elencate nella PR.
- `frontend/node_modules` è un symlink al checkout principale (solo per i check);
  `next-env.d.ts` copiato per tsc, entrambi gitignored.