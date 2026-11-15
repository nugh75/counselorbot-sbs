# Handoff — refactor/primitive-adoption-teacher-960 (issue #960)

Aggiornato: 2026-11-16

## Stato
PR aperta: https://github.com/nugh75/counselorbot-sbs/pull/965 (7 commit, base `main`,
nessun merge da `origin/main` perché era già allineato). Nessun dev server, nessun Docker.
Task del Diario chiuso (fatto).

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
- Attesa merge da app del proprietario; i build desktop restano pending ma non sono
  gating, eslint e documentation sono verdi.

## Blocchi e rischi
- `AdministrationPlansPanel` tiene `uppercase` e hex solo nel foglio HTML stampabile
  dei piani (fuori dall'interfaccia): invariato di proposito.
- `StepPresentationFields` conserva i campi a mano (il ticket chiede lì solo la taglia
  dei bottoni).
- Da verificare a occhio in deploy: larghezza dei filtri di `/docente/assegnazioni`
  (`Select` con `w-auto`) e il `Dialog` di creazione assegnazione.