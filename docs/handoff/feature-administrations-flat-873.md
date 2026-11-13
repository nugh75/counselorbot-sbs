# Handoff — feature/administrations-flat-873 (#873)

## Stato
In corso: struttura piatta completa di `AdministrationPlansPanel.tsx`; verifiche e PR.

## Fatto
- Header e contatori senza riquadri (nessun `rounded-lg`, nessun box `surface-sunken`).
- Ogni piano: `Card as="section" variant="flat"` (filetto in alto), ring solo sul piano aperto da `#plan-<id>`.
- Modulo: `Card` piatta; sezioni interne separate da `border-t` invece di box annidati.
- Codice, note e blocco link/QR: niente box colorati; campi, badge, avvisi invariati.
- Elenco in una colonna (era griglia a 2 su xl), stati vuoti come testo con filetto.
- Doc: `docs-counselorbot/funzionalita-counselorbot.md` (#873).
- Test: `frontend/tests/flat-area-subpages.test.mjs` nuovo caso.

## Decisioni
- Nessun `EntrySection/EntryLink`: la pagina non ha parti indice di navigazione (i piani hanno azioni, non link).
- Il pannello è condiviso con `/admin` (scheda Somministrazioni): cambia aspetto anche lì.

## Verifiche
- `node --test tests/flat-area-subpages.test.mjs` (node 22): 5/5.
- `node --test --experimental-strip-types src/lib/admin-system-zone-tokens.test.ts`: 4/4.
- eslint/tsc: vedi PR. Nessun controllo visivo (nessun dev server).

## Prossimi passi
- Controllo visivo su tunnel quando possibile.

## Blocchi e rischi
- Worktree senza `node_modules`: symlink temporaneo al checkout principale per eslint/tsc, rimosso alla fine.
