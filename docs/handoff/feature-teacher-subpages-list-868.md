# Handoff feature/teacher-subpages-list-868 (#868)

## Stato
Implementato, in verifica (tsc in corso), PR da aprire.

## Fatto
- GroupsPanel: voci EntryLink in EntrySection (niente tile con ombra, senza copia codice/scorciatoie: restano in ClassOverviewTab).
- InstitutesPanel, AssignmentsPanel: Card variant="flat" per riga/direttorio.
- Test sorgente: frontend/src/lib/teacher-subpages-flat.test.ts. Doc funzionalita aggiornato.

## Verifiche
- node --test (node 22) teacher-subpages-flat + admin-system-zone-tokens: verdi.
- Nessun dev server avviato: controllo visivo non fatto.

## Prossimi passi
Commit, PR, guidance-check.

## Blocchi e rischi
node_modules nel worktree e' un symlink (ignorato da git).
