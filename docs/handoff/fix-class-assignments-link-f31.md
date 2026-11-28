# F31 — Link alle assegnazioni dalla scheda classe

## Stato

In corso: implementazione e test fatti, commit/PR da chiudere.

## Fatto

- `ClassOverviewTab` (Panoramica di `/docente/classi/[id]`): nuova voce
  «Assegnazioni di questa classe» accanto alle scorciatoie esistenti, con
  `EntryLink` e icona `ClipboardList`. Porta a
  `/docente/assegnazioni?group=<nome classe>` (la pagina filtra per
  `group_name`, non per id: con l'id il filtro resterebbe vuoto).
- Voce visibile solo nell'area docente (`!adminRoute`); l'Hub admin
  `/admin/classi/[id]` resta invariato.
- Non è stato ripristinato l'elenco inline `GroupAssignments` (rimosso in b49d1548).
- Traduzioni `classAssignments` e `classAssignmentsDesc` nelle sei lingue in
  `frontend/src/lib/i18n-class-settings.ts`.
- Test `frontend/src/lib/class-assignments-link.test.ts`: href con `?group=`,
  condizione `!adminRoute`, chiavi i18n presenti (6 lingue).
- `docs-counselorbot/funzionalita-counselorbot.md`: paragrafo F31.

## Verifiche

- `node --test --experimental-strip-types src/lib/class-assignments-link.test.ts`
- `npx eslint` sui file toccati; `npx tsc --noEmit`
- `python3 scripts/check-platform-guidance.py --base origin/main`

## Prossimi passi

- Commit `fix:` + `docs:`, push, PR (non bozza) e `gh project item-add 5`.

## Blocchi e rischi

- Nessun blocco noto. Il brief parlava di `?group=<id>`, ma la pagina usa il
  nome della classe: verificato in `frontend/tests/assignments.test.mjs`.
