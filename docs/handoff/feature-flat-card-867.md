# Handoff feature/flat-card-867 (#867, mappa #861)

## Stato
Implementato, verificato; PR aperta.

## Fatto
- `Card` variante `flat` (filetto in alto, niente box/ombra/sfondo).
- Flat in: ClassSettingsPage (5), ClassCompilationsSection, TeacherMeetingsPage, TeacherDevicesPanel, StudentClassPathsPage.
- Intestazioni d'area: dispositivi (nuovo slug `dispositivi` + testi 6 lingue + breadcrumb), docente/orientamento (TeacherAreaHeader), cambiamenti e forum (PersonalAreaHeader).
- Test: `frontend/tests/flat-area-subpages.test.mjs`.
- Doc: funzionalita-counselorbot.md.

## Verifiche
- node --test (4 test) ok. tsc ok (solo errori png guida preesistenti), eslint 0 errori, i18n:check e make guidance-check ok.
- Nessun controllo visivo/browser (nessun dev server avviato).

## Prossimi passi
- Attendere merge.

## Blocchi e rischi
- Fuori scope: home aree, AdministrationPlansPanel, pqbl, Flashcards/VisualTools, ForumView/ProfileChangeReflection, InstitutesPanel/AssignmentsPanel/GroupsPanel/PersonalAPISettings (issue sorelle).
