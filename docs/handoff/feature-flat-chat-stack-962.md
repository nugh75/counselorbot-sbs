# Handoff — feature/flat-chat-stack-962 (#962)

## Stato
Implementazione completa, in verifica (tsc/eslint). PR da aprire.

## Fatto
- 10 file `components/qsa/*` della chat e del percorso guidato sui token (tabella E1/E2 dell'audit 2): niente `slate/indigo/teal/sky/red/amber` grezzi, `font-medium/bold` → `font-semibold`, `h-9/h-11` → `min-h-control`.
- Pillole `uppercase` (messaggi di sistema, "solo questo ramo", ragionamento, contatori) → testo `text-xs text-ink-muted`; varianti IDEA e risposte rapide `rounded-control` a 44 px.
- Campi a mano → `Input` (titolo esplorazione, richiesta in RecommendationsPanel, punteggi); avvisi → `Callout`; bottoni a mano → `Button`/`buttonClasses`.
- `ScoreInputForm`: tolto `PREFIX_COLOR`, un solo colore + etichetta, righe con filetto.
- `IntroScreen`: quattro schede → `EntrySection`/`EntryLink` con le immagini esistenti.
- Guardia `src/lib/flat-chat-stack.test.ts`; test browser intro aggiornati (selettori `article` → voci).
- Docs: `docs/design.md`, `funzionalita-counselorbot.md`.

## Verifiche
- node --test mirati (16 file lib + guardia): 155 pass, 0 fail.
- tsc / eslint: in corso.
- Nessun dev server/Docker: verifica visiva e test browser (account-onboarding, personal-pqbl) non eseguiti.

## Decisioni
- IntroScreen tiene le PNG esistenti (non `ToolIllustration`): niente nuove illustrazioni; le chiavi i18n «Apri…» restano nel dizionario.
- Le card dei suggerimenti in RecommendationsPanel restano (primo livello in un pannello flat).

## Prossimi passi
Commit, merge origin/main, PR, gh pr checks.

## Blocchi e rischi
Nessuno. Rischio visivo basso (token = stessi valori in chiaro).
