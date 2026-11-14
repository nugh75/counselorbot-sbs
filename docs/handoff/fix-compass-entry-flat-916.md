# Handoff fix/compass-entry-flat-916

## Stato
PR aperta per #916 (map #861). Frontend only.

## Fatto
- EntryLink: nuove prop opzionali `testId` e `onOpen` (button piatto).
- CompassEntry usa EntryLink (nessun bordo/card), href/onOpen/data-testid invariati.
- /profilo: il link «Cambiamenti» (riquadro) ora è EntryLink. Altri riquadri sono form/avvisi/contenuti, non ingressi.
- Doc funzionalita aggiornata.

## Verifiche
- node --test tests/compass-entry-flat.test.mjs: 3 pass
- tsc: solo errori preesistenti (PNG guide mancanti); eslint: 0 errori
- make guidance-check: ok
- Nessun controllo visivo/browser (nessun dev server).

## Prossimi passi
Review e merge dell'utente.

## Blocchi e rischi
node_modules in worktree = symlink al checkout principale (ignorato da git).
