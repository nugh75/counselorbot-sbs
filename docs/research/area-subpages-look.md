# Area subpages: flat-look audit (#866, map #861)

Read-only audit of the 48 `page.tsx` files under `frontend/src/app/profilo` (25) and
`frontend/src/app/docente` (23). Model: the entry list in
`frontend/src/components/profile/PersonalAreaHome.tsx`. Navbar and rounded buttons stay as they are.
Paths below are relative to `frontend/src` and line numbers are from `research/area-subpages-look`.

## Method
- Every `page.tsx` read; the component it mounts read for `Card`, `rounded-card`, `rounded-lg`,
  `border`, `bg-*` boxes (counts via grep, then read).
- No server, no tests, no product code touched.

## Classes
- **A** already aligned (nothing to do / redirect).
- **B** index page that should use the entry list (a list of items that open something).
- **C** work page: only the header and the outer frame align; the inside is a tool and stays.
- **D** needs a redesign (many nested boxes or heavy cards around the whole content).

## Shared headers (already flat, one fix each)
- `components/profile/PersonalAreaHeader.tsx:25-39`: back link + privacy link, `PageHeader` with
  72px illustration. Flat. Used by obiettivi, piani-operativi, pqbl, flashcard, timeline/azioni/carte/confronto
  (`components/visual/PersonalVisualWorkspacePage.tsx:27,36`) and by the area sections in
  `app/profilo/page.tsx:444`.
- `components/teacher/TeacherAreaHeader.tsx:26-38`: breadcrumbs + `PageHeader` with illustration. Flat.
  Wrapped by `TeacherAreaPage.tsx:20-24` (`bg-surface-sunken` page, `space-y-8`).
- Gap: three pages skip the illustrated header and call `PageHeader` bare:
  `docente/dispositivi/page.tsx:13`, `docente/orientamento/page.tsx:27`, `profilo/cambiamenti/page.tsx:80`
  (plus `profilo/classi/[id]/forum/page.tsx:9`, no header at all, only a `ClassContentGate`).
- Gap: `profilo/page.tsx:444` renders `PersonalAreaHeader` but the page also sets its own
  `page-wide px-4 py-8` wrapper (`:442`), while the docente shell uses `page-wide` or `page-narrow`
  (`TeacherAreaPage.tsx:21`). Same outer width rule is not shared.

## /profilo (25 files)
| Page | Class | Evidence |
|---|---|---|
| `profilo/page.tsx` (home) | out of scope (#862/#863) | 818 lines, `Card` at `:475,:578,:779`, `rounded-card` boxes `:462,:490,:495` |
| `analisi-combinata`, `assegnazioni`, `classi`, `compilazioni`, `orientamento`, `portfolio`, `taccuino`, `tavolo`, `telegram` | **C** (via `profilo/page.tsx`) | each is `export { default } from '../page'` (line 1). The page picks the area from the path (`profilo/page.tsx:155-156`) and shows `PersonalAreaHeader` (`:444`) then the section. Inner content is the boxes below. |
| `chatgpt` | A | redirect to `/profilo/api-personali#chatgpt` (`chatgpt/page.tsx:6`) |
| `libretto` | A | redirect to compilazioni (`libretto/page.tsx:8`) |
| `api-personali` | **C** | `PersonalAPISettings` has 5 `Card`: connection rows `:193`, form `:199`, own counselors `:236`, form `:237`. A form Card inside a list of Cards. Header at `page.tsx:4` is bare. |
| `obiettivi` | **C** | `PersonalAreaHeader` `:9`; `GoalsPanel.tsx` 99 lines, no `Card`/border: already flat |
| `piani-operativi` | **C** (+ small) | `PersonalAreaHeader` `:10`; `StudentClassPathsPage.tsx:77` single empty-state `Card` |
| `piani-operativi/[pathId]/[stepId]` | **C** | `PlanActivityFlow.tsx:87` one bordered toolbar box |
| `piani-operativi/[pathId]/[stepId]/approfondimento` | **C** | same component |
| `pqbl` | **D** | 858 lines; ~11 `Card` (`:486,555,591,600,649,709,745,770,775,819,826`), `Card` inside `Card` for questions (`:775`,`:826`), dashed drop zone `:513`, info box `:450` |
| `flashcard` | **D** | `FlashcardsPage.tsx`: bordered deck cards with shadow `:156`, `details` box `:187`, form box inside `details` box `:188`, card tiles `:213`, empty state box `:152,:289` |
| `timeline` | **C** | `PersonalVisualWorkspacePage.tsx` 48 lines. Tools in `components/visual/VisualTools.tsx:330,358-359` (details box holding a form box) and `ExperienceReview.tsx:49`, `InstitutionTimelineDates.tsx:26` |
| `azioni`, `carte`, `confronto` | **C** | same `PersonalVisualWorkspacePage` with a tab (`azioni/page.tsx:5` etc.); same inner boxes as timeline |
| `cambiamenti` | **C** | header `:80` bare `PageHeader`; two centred login boxes `:44,:62` (shadow card); `ProfileChangeReflection.tsx` 393 lines, 11 borders, `Card` inside |
| `classi/[id]/forum` | **C** | no header (`:9`); `ForumView.tsx` 5 `Card` (`:282,325,381,459,466`) around composer and list; threads inside a list Card |

## /docente (23 files)
| Page | Class | Evidence |
|---|---|---|
| `page.tsx` (home) | out of scope (#862/#863) | `TeacherAreaHome.tsx:18` already uses the entry-list row (`rounded-card` only as hover) |
| `chatgpt`, `obiettivi`, `palestra`, `proposte` | A | one-line redirects (`chatgpt/page.tsx:6`, `obiettivi/page.tsx:4`, `palestra/page.tsx:4`, `proposte/page.tsx:4`) |
| `classi` | **B** | `GroupsPanel.tsx` (379 lines): one bordered shadow tile per class `:238`; becomes an entry list (class name, institute, arrow) |
| `istituti` | **B** | `InstitutesPanel.tsx:121` one `Card` per institute with a link; directory `Card` `:107`; create form `Card` `:60` |
| `istituti/[id]` | **B** | `InstituteClasses` in the same file, `Card` `:164` plus class rows |
| `classi/[id]` | **C** | `ClassSettingsPage.tsx` 495 lines: 5 `Card` (`:59,275,303,312,362`) plus bordered box `:382`; settings form stack, only per-section titles needed |
| `assegnazioni` | **B** | `AssignmentsPanel.tsx:144` one `Card as="article"` per assignment (`p-4 sm:p-6`, `space-y-4`) |
| `compilazioni` | **C** | `ClassCompilationsSection.tsx:53` one outer `Card` around the whole section |
| `somministrazioni` | **D** | `AdministrationPlansPanel.tsx` 926 lines, 29 borders: `rounded-lg` panels `:520,694`, empty states `:754,759,764`, plan cards with shadow `:773` |
| `incontri` | **C** | `TeacherMeetingsPage.tsx:39` one `Card` around `ClassMeetingsManager` |
| `piani-operativi` | **C** | `TeacherClassPathsPage.tsx` 57 lines, one border |
| `materiali`, `risorse`, `strategie` | **C** | same `TeacherResourcesHub.tsx:44`: a brand-coloured intro box (`bg-brand-soft`, icon in a second box `:46`) = box inside box; then tabs. `materiali/page.tsx:9`, `risorse/page.tsx:9`, `strategie/page.tsx:9` |
| `taccuino` | **C** | `TeacherNotebook.tsx` 380 lines, 4 borders, no `Card` |
| `taccuini-prova` | **C** | `PracticeNotebooks.tsx` 264 lines, 6 borders (also the "gym" list the map calls out) |
| `catalogo-obiettivi` | **D (small)** | `GoalCatalogEditor.tsx:41` outer bordered section, `:52` sunken fieldset inside it, `:66` an article per branch: three nested levels in 70 lines |
| `orientamento` | **D** | 217 lines, 8 `rounded-card`: draft form `:167`, assignment form `:193`, row boxes `:177`, `details` boxes `:202`; header bare `:27` |
| `dispositivi` | **C** | `TeacherDevicesPanel.tsx:133,137` `Card` per class; header bare `:13` |
| `api-personali` | **C** | same `PersonalAPISettings` as the student page; fix once, both pages follow |

## Counts (48 files)
- A (redirects): **6** (student `chatgpt`, `libretto`; teacher `chatgpt`, `obiettivi`, `palestra`, `proposte`).
- B (entry list): **4** (docente `classi`, `istituti`, `istituti/[id]`, `assegnazioni`).
- C (header + outer frame only): **31** (20 student incl. 9 re-exports of `profilo/page.tsx`, 11 teacher incl. the 3 resource hubs).
- D (redesign): **5** (`profilo/pqbl`, `profilo/flashcard`, `docente/somministrazioni`, `docente/orientamento`, `docente/catalogo-obiettivi`).
- Out of scope: **2** area homes (#862, #863).

## Recurring patterns to remove (one fix each, many pages follow)
1. `components/ui/Card.tsx:12` is the heavy box (`rounded-card border bg-surface p-6 shadow-card`).
   It is used on ~20 pages above. A flat variant (no border, no shadow, no bg; a top rule instead)
   would fix most C pages in one change. Do not touch the other users of `Card` outside the two areas.
2. Intro box in `TeacherResourcesHub.tsx:44-46`: replace by the standard header text.
3. `PersonalAPISettings.tsx` (shared by two pages): list of connections `:193`/`:236` as an entry list,
   forms inline without a Card.
4. `Callout` (`ui/Callout.tsx:33`) is a role-colour notice: keep, allowed by the map.
5. Bare `PageHeader` pages (3) and the page with no header (forum): move to the area headers.

## Suggested split into issues (each a PR on main, no stacking)
1. **Flat `Card` variant + header gaps** (C, 31 files): add the flat style, use it in the Teacher
   and Student subpages, fix the 3 bare headers and the forum header. Smallest, unlocks the rest.
2. **Teacher entry lists**: `classi` (`GroupsPanel.tsx:238`), `istituti` (`InstitutesPanel.tsx:121`),
   `assegnazioni` (`AssignmentsPanel.tsx:144`), `istituti/[id]`. Reuse the row of `TeacherAreaHome.tsx:18`.
3. **Resource hub + API settings**: `TeacherResourcesHub.tsx:44`, `PersonalAPISettings.tsx`
   (two pages, one component).
4. **Somministrazioni redesign** (`AdministrationPlansPanel.tsx`, 926 lines, biggest; split further).
5. **PQBL redesign** (`profilo/pqbl/page.tsx`, 858 lines, 11 Cards).
6. **Flashcards redesign** (`FlashcardsPage.tsx`) together with the visual tools boxes
   (`VisualTools.tsx:330-368`) if the same flat pattern fits.
7. **Orientamento (docente) + catalogo-obiettivi** (small D pages, 217 + 70 lines).
8. **Forum + cambiamenti** boxes (`ForumView.tsx`, `ProfileChangeReflection.tsx`), lowest priority.

## Notes and risks
- Counts of `border`/`bg-*` are grep estimates; line numbers are exact for the cited lines.
- Content inside tools (editors, forms, dialogs such as `FlashcardsPage.tsx:235`, `ConfirmActionDialog`)
  keeps its boxes: dialogs and form fields are not "cards inside cards".
- Not checked visually (no dev server started): classification is from code only.
- Role colours on badges/notices (`Callout`, `warning-soft` alert at `orientamento/page.tsx:166`) stay.
