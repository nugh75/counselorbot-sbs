# Handoff feature-invite-opens-mail-846 (#846)

## Stato
Implementato, PR in apertura.

## Fatto
- `useClassInvitations(groupId, groupName, webLink)`: dopo il 201 apre `mailto:` e chiama `.../invitations/{id}/sent`; senza link web comportamento invariato.
- `mailto` condiviso con la lista "Inviti in attesa" (prop `groupName` rimossa lì).
- Doc funzionalita aggiornata; testo hint i18n ancora vero (nessuna modifica).

## Verifiche
- `node --test --experimental-strip-types src/lib/class-invitations.test.ts`: 3 pass.
- tsc/lint non eseguiti: node_modules assente nel worktree.

## Prossimi passi
Review e merge dell'utente.

## Blocchi e rischi
Nessuno. Il test del componente e' di wiring sul sorgente (niente browser).
