# #959 — Pagine isolate piatte (2º audit visivo)

## Stato
- Branch `refactor/flat-isolated-pages-2-959` da `origin/main`; worktree `Counselorbot-wt-959`.
- Lavoro completato su tutti i file del ticket; nessun dev server né Docker avviati.

## Fatto
- `/bussola`: cinque `Card` piatte (bivio, ripresa, conclusione, suggerimenti); resta un solo
  riquadro, il pannello della conversazione. Intestazione senza `Card`.
- `/assistente`: via `shadow-card` a trascritto, scrittura e anteprima; un solo riquadro (trascritto);
  «Accedi» è `ButtonLink`.
- `/questionario`: cinque `Card` piatte con `h2` `text-lg`, campi `Field`/`Input`/`Select`/`Textarea`,
  conferma finale `Callout` di successo.
- `/guide`: gruppi come `EntrySection` con righe, scheda e «correlati» senza riquadro né ombra,
  ricerca su `Input`, «Apri» su `ButtonLink`, elenco dei risultati a filetti.
- `/strumenti/[id]`: due `Callout` con azione, codice e password in `font-mono` senza riquadro,
  nota finale con filetto, link primari su `ButtonLink`.
- `/somministrazione`: griglia di card → elenco a voci (`EntryLink` con `ToolIllustration`,
  `StatusBadge` per lo strumento non disponibile), avvisi e caricamento come `Callout`/`<p>`.
- `QuestionnaireRunner` (`:488`, `:537`, `:547`), `AdministrationStepFlow` (cinque `Card`, campi
  credenziali `Field`/`Input`, credenziali senza riquadri, link esterni `ButtonLink`) e
  `ResultsDeepDiveFlow` (pannello piatto, storico a filetti, scelta risultati `Select`) piatti.
- `CounselorSelector`: chip filtro `rounded-control`, riquadro ricerca piatto (solo `:267`, `:403`, `:427`).
- `/unisciti`: campi su `Field`/`Input` (form isolati restano riquadri); `/telegram-link`: `PageHeader`,
  `ButtonLink`, codice in `font-mono` senza riquadro.
- Guardia `frontend/src/lib/flat-isolated-pages.test.ts`; docs prodotto + `docs/design.md` §4.

## Verifiche
- `npx tsc --noEmit -p frontend`: nessun errore nuovo (restano i 252 `Cannot find module '../../public/...`
  già presenti per le immagini guida non versionate).
- eslint sui 13 file toccati: 0 errori, 2 warning preesistenti (`STATIC_AVAILABLE_INSTRUMENTS`, direttiva
  eslint inutilizzata in `QuestionnaireRunner`).
- node --test: `flat-isolated-pages`, `orientation-flow`, `guided-path-flat`, `event-instrument-parity`,
  `catalog-paused-chat`, `compilation-draft`, `counselor-identity`, `double-click-selection`,
  `legacy-routes` (52 test) + `tests/questionnaire-runner-flat.test.mjs` (5): tutti verdi.
- `make guidance-check`: allineato. `check-i18n`: 3917 chiavi, nessuna modifica.

## Prossimi passi
- Push del branch, PR su `main` con `Closes #959`, milestone «Flat visual consistency (Nov 2026)».

## Blocchi e rischi
- Nessun controllo visivo su browser (vietato dev server su questa macchina): verifiche solo statiche.
- `node_modules` in questo worktree è un symlink temporaneo a un worktree fratello (non committato).
- "Bug non registrati": nessuno osservato.