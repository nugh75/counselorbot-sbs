# Handoff — refactor/primitive-adoption-teacher-960 (issue #960)

Aggiornato: 2026-11-16

## Stato
In corso — codice e test pronti, manca commit/PR finale. Nessun dev server, nessun Docker.

## Fatto
- Docente: `TeacherDevicesPanel` (StatusBadge, Input), `InstitutesPanel` (Card flat,
  Field/Input/Select), `AssignmentsPanel` (StatusBadge, Select), `AssignmentWork`
  (Field/Input/Select/Textarea, filetti al posto dei riquadri), `AssignmentButton`
  (`<dialog>` → `Dialog`/`DialogBody`).
- Forum di classe: `ForumView` su token (`ink*`, `surface`, `line*`), campi primitivi,
  niente `prose-slate`.
- Admin (solo campi/pillole/ombre/outline-none): `CertifiedReadingsPanel`,
  `CertifiedStrategiesPanel`, `AdministrationPlansPanel` (StatusBadge, Field),
  `PlanStudentsPanel` (StatusBadge, Textarea, ombre via).
- Tavolo: comandi primari a mano → `Button`, tinte dei pezzi invariate.
- `/docente/orientamento`: campi primitivi, bottoni `Button`, menu su token.
- `ClassPathsTab`/`StepPresentationFields`: `size="sm"` → `md`. Privacy e
  `ClassCouncilView`: `font-medium` → `font-semibold`.
- Nuovo test di guardia `src/lib/teacher-primitives-adoption.test.ts`.
- Guida aggiornata (`docs-counselorbot/funzionalita-counselorbot.md`).

## Verifiche
- `tsc --noEmit -p frontend`: verde (serve `next-env.d.ts`, generato e gitignored,
  e `node_modules` — qui link simbolico al checkout principale).
- eslint sui file toccati: 0 errori (solo warning preesistenti).
- Test mirati: guardia nuova + `teacher-subpages-flat`, `flat-notices-headings`,
  `admin-content-zone-tokens`, `admin-system-zone-tokens`, `class-path-presentation`,
  `ui-primitives-tokens`, `tests/forum-changes-flat`, `tests/flat-area-subpages`,
  `tests/flat-isolated-pages`: tutti verdi.
- Nessun controllo visivo: niente dev server né browser.

## Prossimi passi
- Commit atomici, push, PR verso `main` (milestone "Flat visual consistency (Nov 2026)").
- `make guidance-check` prima della PR.

## Blocchi e rischi
- `AdministrationPlansPanel` tiene `uppercase` e hex solo nel foglio HTML stampabile
  dei piani (fuori dall'interfaccia): invariato di proposito.
- `StepPresentationFields` conserva i campi a mano (il ticket chiede lì solo la taglia
  dei bottoni).
- Da verificare a occhio in deploy: larghezza dei filtri di `/docente/assegnazioni`
  (`Select` con `w-auto`) e il `Dialog` di creazione assegnazione.