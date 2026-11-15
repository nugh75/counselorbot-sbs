# Handoff: feature/flat-class-page-tabs-957 (issue #957)

## Stato
Completo. PR #966 aperta verso main (documentation, eslint verdi; build desktop non bloccanti).

## Fatto
- Schede Panoramica, Orientamento, Osservazioni, Consiglio, Studenti, Registro piatte:
  `Card variant="flat"`, pillole -> `StatusBadge`, campi -> `Field`/`Input`/`Select`/`Textarea`.
- Studenti e inviti: sezione con filetto + `RoleBadge` (student/teacher), niente sfondo tinto.
- Registro (`ClassSettingsAudit`): lista `divide-y divide-line`.
- `ClassImageModal` e conferma eliminazione classe su `Dialog` condiviso (Esc/backdrop bloccati durante il salvataggio).
- Guard test `frontend/src/lib/class-page-tabs-flat.test.ts`.
- Doc `docs-counselorbot/funzionalita-counselorbot.md` (#957).

## Verifiche
- `npx tsc --noEmit`: nessun errore nuovo (solo TS2307 sui `.png`, preesistenti: manca `next-env.d.ts` generato).
- eslint sui file toccati: 0 errori (1 warning preesistente, `AlertCircle` non usato in ClassImageModal).
- node --test (Node 22): class-page-tabs-flat, flat-notices-headings, teacher-subpages-flat,
  class-invitations, orientation-recommendation, flat-isolated-pages, flat-quick-fixes, targeted-goals: 24/24.
- `make guidance-check`: ok.
- Verifica visiva NON eseguita (niente dev server per vincoli di RAM/volume).

## Prossimi passi
- Controllo visivo della pagina classe dopo il merge (tema chiaro/scuro, 390 px).

## Blocchi e rischi
- Nessun blocco. Node nel PATH è v20: i test .ts richiedono Node 22 (nvm).
