# Handoff feature/flat-factor-colours-933

## Stato
Implementazione di #933 completa; PR da aprire.

## Fatto
- globals.css: token `--chart-1..5` (petrolio → slate) e `--chart-accent` (ocra), chiari e scuri, esposti come `bg-chart-*`.
- questionnaires.ts: colori per questionario e `tailwindColorFromTheme` su token chart (niente -500). ztpi-model.ts: allineamento su `bg-success/warning/danger`.
- ProfileScoresPanel/ProfileVisualization: titoli gruppo `text-ink` + filetto, senza uppercase/colore, `font-semibold`, niente `shadow-md`, chip su token di stato.
- Test: src/lib/factor-chart-colours.test.ts; tool-catalog.test.ts riscritto (`bg-chart-accent`). Doc: funzionalita.

## Verifiche
- node --test (Node 22): factor-chart-colours, qpcc, qpcc-neutral-scale, guided-path-flat, tool-catalog verdi.
- tsc: nessun errore nei file toccati (preesistenti: .png). eslint sui file toccati lanciato.
- Nessun dev server né Docker: controllo visivo non fatto. Barre punteggio rosso/giallo/verde (zone di esito) lasciate com'erano: fuori scopo.

## Prossimi passi
Merge da parte dell'utente.

## Blocchi e rischi
node_modules nel worktree è un symlink al checkout principale (ignorato da git).
