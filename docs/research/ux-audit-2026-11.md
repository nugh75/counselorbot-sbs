# UX audit of the student and teacher journeys (November 2026)

Issue: #895 (map #861, milestone «UI consistency»). Audited code: `main` at `e2fc242a` (14 Nov 2026).

## Method and limits

- **Code reading only.** No dev server, browser, Docker or test suite was started (the external volume is slow and other agents were working in parallel). Every finding comes from the source at the cited `file:line`. **No visual check at 390 px or in dark mode was made**: the layout and contrast findings are inferred from classes and tokens, and need a quick visual check before the fix.
- Checklists: the `design:design-critique`, `design:accessibility-review` (WCAG 2.1 AA) and `design:ux-copy` skills, the glossary in `CONTEXT.md` («Glossary»), the six-language dictionaries (`frontend/src/lib/i18n*.ts`) and the approved flat look of map #861 (`origin/prototype/flat-areas:docs/prototypes/flat-areas/index.html`).
- Contrast ratios are computed from the hex values of the tokens in `frontend/src/app/globals.css`.
- **Areas changing right now, mentioned briefly only:** practice gym (#892), noticing (#890), QSA load retry (#889).
- Severity: **blocker** (stops the task), **major** (slows down or misleads many people, or fails WCAG AA), **minor** (friction, inconsistency). Effort: **S** (< half a day, one or two files), **M** (one to two days, several components), **L** (a redesign or a cross-cutting change).

## What works

- The flat entry list (`frontend/src/components/ui/EntryList.tsx`) is now shared by the Student area, the Teacher area, the catalog, «Da riprendere» and the class list. Every entry is a 96 px tall target with a decorative image (`alt=""`), a name made from `aria-labelledby`/`aria-describedby` and an arrow.
- Focus is visible everywhere: there is a global `:focus-visible` ring (`globals.css:416`) and the dark theme has its own focus token (`--console-focus`, `globals.css:670`).
- Dark mode is handled centrally. Raw `slate/indigo/white` classes and their `hover:` variants are remapped under `.dark` (`globals.css:735-817`), so the hard-coded colours still look right.
- The main dictionary has the same keys in all six languages: 1,303 keys each in `lib/i18n.ts`, checked with a key diff.
- Partial failure is handled well in «Da riprendere»: it keeps the stale rows and offers a retry (`PersonalAreaHome.tsx:47-72`).
- The class tabs follow the ARIA tab pattern with arrows, Home and End (`ClassSettingsPage.tsx:435-444`).

## Findings — Student journeys

| # | Finding | Where | Sev. | Effort |
|---|---|---|---|---|
| S1 | **The Back button on the Student area home does nothing.** `PageHeader backHref="/"` falls back to `router.replace('/')` when there is no in-app history (direct link, bookmark, login landing). `/` sends a signed-in person straight back to their area (`homeLandingHref`), so the button reloads `/profilo`. The Teacher area home has no Back button at all. | `app/profilo/page.tsx:445`, `components/ui/PreviousPageButton.tsx:31-39`, `lib/home-entry.ts:5-11`, `app/page.tsx:373` | major | S |
| S2 | **Getting from the tool to the chat takes 5-6 screens.** The path is: tool page `/strumenti/[id]` → `/?start=` → counselor (if needed) → method → scores or upload → profile dashboard → conversation settings → chat. The stepper shows the stages but not how many are left before the chat. The «dashboard» and «settings» steps are separate pages with their own Back/Forward pair. | `app/page.tsx:880-1000`, `app/strumenti/[id]/page.tsx:119-126` | major | M |
| S3 | **The tool page has three competing calls to action and a stack of coloured boxes.** The primary «Analizza» or «Inizia il percorso» button sits next to the bordered «Compila sul sito» button. Further down are a warning-coloured box for the in-app administration (warning colour on a positive action, `bg-move` button), an info box with code and password (boxes inside a box) and a brand-coloured «ready» box whose text always says «avvia il percorso guidato», even for questionnaires. This breaks the flat look of #861 and the rule that role colours belong on badges and notices only. | `app/strumenti/[id]/page.tsx:119-196`; copy `lib/i18n.ts:662` (`detail.ready`) | major | M |
| S4 | **The «In preparazione» block is a dashed box with boxed chips inside.** The tool names are not translated (`q.name`) and the chip says `IN ARRIVO` in capitals, which some screen readers spell out letter by letter. | `components/home/InstrumentCatalog.tsx:182-196`; `lib/i18n.ts:437` | minor | S |
| S5 | **Catalog load errors are silent in Italian.** The catalog's loading line and error-with-retry only show when `lang !== 'it'`. The student-path fetch (`loadPaths`) and the questionnaire-results fetch swallow every error, so the «Compilato il…» status lines and the operational plan disappear without a word. | `InstrumentCatalog.tsx:150-160`; `PersonalAreaHome.tsx:123-160` | major | S |
| S6 | **Results page («Risultati e conversazioni»): the picker shows technical IDs.** Each option reads `date · QSA · 3f2a9c1b` (instrument code plus 8 characters of the session UUID) inside a search box and a `<select>`. The section is titled «Le Tue Compilazioni» (Title Case) while the entry is called «Risultati e conversazioni»; in EN it is «My Submissions» vs «Results and conversations». | `app/profilo/page.tsx:350-353`, `:466-541`; `lib/i18n.ts:1080`, `lib/i18n-personal-area.ts:33` | major | M |
| S7 | **Results and notebook pages are card stacks.** Results: a `Card` holding a danger box, a dashed empty-state box and a bordered search box. Notebook: a bordered visibility note, then `LearnerProfileCard`, `TeacherNotesCard` and a link card. These are the «boxes inside boxes» that #861 removed from the area homes. | `app/profilo/page.tsx:452-544` | minor | M |
| S8 | **The empty Results page sends people to the wrong place.** The CTA links to `/` with the label «Avvia». Since #848 the catalog lives in `/profilo#profile-instrument-catalog`, and `/` only redirects. | `app/profilo/page.tsx:497-506` | minor | S |
| S9 | **First access (`/inizia`) shows a header and nothing else while preferences load.** There is no loading state. The compatibility notice prints the raw instrument code («Per usare SAVICKAS…») because it comes from the `start`/`instrument` query. | `components/profile/AccountSetup.tsx:24-28`, `:62-68` | minor | S |
| S10 | **Signed-out and not-allowed pages lose context.** «Torna alla Home per accedere» does `window.location.href='/'` instead of opening login with a return URL. They are also centred boxed cards with a shadow. | `app/profilo/page.tsx:403-438` | minor | S |
| S11 | **The personal API page can be blank.** When the feature is unavailable the component returns `null`: no header, no back link. It also builds its own page shell (`min-h-screen … px-4`) and back link instead of `PersonalAreaHeader`. | `components/profile/PersonalAPISettings.tsx:172-175` | minor | S |
| S12 | **The class dropdown has no visible confirmation.** On a save failure it shows a short `role="status"` line; on success nothing tells the person that the catalog below has changed. | `components/layout/ClassViewSwitcher.tsx:26-36`, `:66-68` | minor | S |

## Findings — Teacher journeys

| # | Finding | Where | Sev. | Effort |
|---|---|---|---|---|
| T1 | **The class page has nine tabs that wrap.** The tabs are 44 px tall pills in a `flex-wrap` row. At 390 px with the 32 px double gutter (X2) that is about 3-4 rows (~180 px) before any content (inferred, not seen). The name «Noticing» is not translated in any language. | `components/teacher/ClassSettingsPage.tsx:425-444`; `lib/i18n-class-settings.ts:182` | major | M |
| T2 | **The class tab is not in the URL.** `?tab=` is read once on mount, and clicking a tab only calls `setTab`. Refresh, browser Back and copying the link all return to «Panoramica». The quick switcher does carry the tab. | `ClassSettingsPage.tsx:402-415`, `:438`; `ClassQuickSwitcher.tsx:39` | major | S |
| T3 | **Three back devices on the class page.** The breadcrumbs (root link with an arrow), a separate «Indietro» link and the quick class switcher sit within 100 px of each other. | `ClassSettingsPage.tsx:426-433`; `TeacherBreadcrumbs.tsx` | minor | S |
| T4 | **The «Participants and results» tab is three tinted cards.** The real students card is brand-soft, the pending invitations card is teacher cream with a bordered list inside, and the test students card is light blue. The coloured list backgrounds go against the #861 decision («role colours stay on badges and notices only»). | `components/teacher/ClassStudentsTab.tsx:12-28`; `ClassEmailInvitations.tsx:126-171` | major | M |
| T5 | **Invitation actions are small and destructive.** «Invia/Reinvia» and «Annulla» are 36 px tall (the project standard is 44 px); «Annulla» deletes the invitation at once, with no confirmation and no undo. The add error is `text-xs text-warning`. | `ClassEmailInvitations.tsx:151`, `:158-166`, `:116` | minor | S |
| T6 | **The class creation form hides focus.** Its inputs use `focus:outline-none` with only a 1 px border colour change, so the focus indicator is weak (WCAG 2.4.7; the same pattern appears in `ClassPathsTab.tsx:630,647` and `StepPresentationFields.tsx`). The create error is not announced (no `role="alert"`). | `components/admin/GroupsPanel.tsx:128,137,147,163`, `:198` | major | S |
| T7 | **The class list repeats the obvious and breaks the grid.** Each entry shows «Proprietario: <own username>» even for the teacher's own classes. The icon is a 24 px `Users` glyph where every other list uses 64-72 px illustrations, so the text column jumps. The empty state is a bare sentence. | `GroupsPanel.tsx:224-237`, `:212` | minor | S |
| T8 | **The Teacher area home is long and repetitive.** «Le mie classi», the gym and the teacher notebook are each a titled section holding one entry with the same name as the section. «Prova gli strumenti» lists every student tool (~12 entries) on the home page. Several entries share an image (`classi.png` for classi, istituti and dispositivi; `library_hall.png` for materiali and risorse). | `components/teacher/TeacherAreaHome.tsx:40-58`, `MyClassesSection.tsx:12-14`, `TryToolsSection.tsx:24-31`, `lib/teacher-area.ts:12-28` | minor | M |
| T9 | **The class overview is a card wall.** It holds 13 `Card`/bordered blocks; assignments get a card each (by design, `AssignmentsPanel.tsx:38,144`). These are the next places where the #861 flat look stops. | `components/teacher/ClassOverviewTab.tsx`, `AssignmentsPanel.tsx:144` | minor | L |
| T10 | **In-progress areas, mentioned only:** the practice gym (#892; `/docente/palestra` only redirects to `/docente/taccuini-prova`), noticing (#890; see T1 for the untranslated tab name) and the QSA load retry (#889). Re-audit after merge. | — | — | — |

## Findings — Cross-cutting

| # | Finding | Where | Sev. | Effort |
|---|---|---|---|---|
| X1 | **The success colour fails contrast in light mode.** `--success` is emerald-600 `#059669`: 3.77:1 on white (needs 4.5:1). It is used as text in ~96 places, mostly «saved» notices (`GoalDraftCard.tsx:62`, `EventMilestoneCard.tsx:103`, `ClassSettingsPage.tsx:384`…). emerald-700 `#047857` gives ~5.5:1. Dark mode (`#6ee7b7`) passes. | `app/globals.css:242` | major | S |
| X2 | **Gutters differ at 390 px.** `<main>` already has `px-4` (`app/layout.tsx:75`); `/profilo` (`app/profilo/page.tsx:386,442`), `/docente` (`app/docente/page.tsx:20`), `TeacherAreaPage` (`:22`) and `PersonalAPISettings` (`:174`) add another `px-4`. The result is 32 px gutters in the areas and 16 px in the chat flow and on `/strumenti`, leaving ~326 px of content on a 390 px phone. | as cited | major | S |
| X3 | **Five different back patterns.** `BackButton` labelled pill (bordered, hard-coded `slate/indigo/white`, `BackButton.tsx:21-25`), the plain `/profilo` link in `PersonalAreaHeader.tsx:28`, `TeacherBreadcrumbs`, the class page link (`ClassSettingsPage.tsx:433`) and the `text-link` link in `PersonalAPISettings.tsx:175`. People cannot learn one way back. | as cited | major | M |
| X4 | **Every entry list is a `<nav>` landmark.** `EntrySection` wraps each list in `<nav>`, so `/profilo` exposes about 10 extra navigation landmarks (catalog categories, suggestions, resume, five groups) next to the header ones. Screen-reader landmark lists become noise. A list (`<ul>`) inside the labelled `<section>` is enough. | `components/ui/EntryList.tsx:17` | major | S |
| X5 | **Hard-coded Italian fallback.** `PageHeader` defaults `backLabel` to `'Indietro'` when `onBack` is used. No current caller hits it, but it is a trap. | `components/ui/PageHeader.tsx:29` | minor | S |
| X6 | **Glossary drift in the guide.** The significant-event task still tells IT/FR people to save the summary «nel Libretto» / «dans le livret» (retired in 2026-09; EN says «journal»). DE/SV say «Handlungen»/«handlingar» where the navigation says «Aktionen»/«Åtgärder». The catalog section «Attività e percorsi» uses «Attività», which the glossary reserves for teacher assignments, and #861 asked for the plain «Questionari» / «Percorsi guidati» titles. | `lib/i18n-guide-tasks.ts:114,126,129`; `lib/i18n.ts:205`; `CONTEXT.md` Glossary | minor | S |
| X7 | **Muted text fails on raised surfaces.** `--ink-muted` slate-500 is 4.75:1 on white, 4.55:1 on the page background (slate-50), and **4.34:1 on `surface-raised`** (slate-100). That surface is used for chips and hover rows, e.g. `IN ARRIVO` (`InstrumentCatalog.tsx:192`) and the inactive class badge (`GroupsPanel.tsx:243`). | `globals.css:208-215` | minor | S |
| X8 | **Error and empty states are inconsistent.** Each panel uses its own pattern: a danger `Callout`, a red bordered box (`app/profilo/page.tsx:490`), plain red text (`GroupsPanel.tsx:198,201`), a warning box (`InstrumentCatalog.tsx:154`), or nothing (S5). There is no shared «message + retry» component, even though «Da riprendere» shows the good pattern. | as cited | minor | M |
| X9 | **Raw palette classes still pile up** in `GuidedChatInterface.tsx` (89), `ForumView.tsx` (64), the privacy components (~170) and `ProfileVisualization.tsx` (49). Dark mode survives only thanks to the remap. Every new raw class needs a remap entry or it breaks. | counts from `grep` | minor | L |

## Ranked proposals (issues to open)

Ranking: user impact × reach ÷ effort. Each item is sized to fit one PR.

1. **Fix the dead Back button on the Student area home (S1).** Remove the Back control from the `/profilo` home, matching `/docente`. Area subpages keep `PersonalAreaHeader`.
   *Acceptance:* `/profilo` opened directly has no Back control. A unit test on the page header covers it, and no subpage loses its back link.
2. **Make the success colour pass contrast (X1).** Set `--success` to emerald-700 in light mode, keep the dark value.
   *Acceptance:* `text-success` on white and on `surface-sunken` reaches 4.5:1 or more (contrast unit test on the tokens); no visual regression in dark mode.
3. **Keep the class tab in the URL (T2).** Changing tab updates `?tab=` with `replaceState`; the initial value keeps today's aliases.
   *Acceptance:* refresh, Back and a copied link reopen the same tab; `node --test` covers the mapping both ways.
4. **Turn entry lists into lists, not landmarks (X4).** Use `<ul>/<li>` inside the labelled section of `EntrySection`.
   *Acceptance:* `/profilo` and `/docente` expose only the header `nav` landmarks; keyboard order and the look are unchanged; the navbar contract tests still pass.
5. **Use one gutter at 390 px (X2).** Drop the inner `px-4` on area pages.
   *Acceptance:* 16 px side gutter on `/profilo`, `/docente`, `/docente/*` and `/profilo/api-personali` at 390 px; no horizontal scroll (screenshot at 390 px in the PR).
6. **Show catalog and status load errors in every language (S5).** One quiet line plus retry, reusing the «Da riprendere» pattern; status lines come back after the retry.
   *Acceptance:* with `/api/instruments` or `/api/user/questionnaire-results` failing, IT shows the error and retry; the unit test covers `lang === 'it'`.
7. **Flat tool page (S3).** One primary start button. «Compila sul sito» and code/password go in a plain secondary section with a rule, not a box; the in-app administration is a secondary link, not a warning box; `detail.ready` wording depends on the tool kind; no coloured backgrounds.
   *Acceptance:* the page follows the #861 prototype grammar (titles with rules, no nested boxes); the copy is updated in six languages; the guidance check passes.
8. **Readable result picker (S6).** Options read `«QSA ridotto» — 12 nov 2026` (translated tool name and date, no UUID); the section title matches the entry name «Risultati e conversazioni» in every language; sentence case.
   *Acceptance:* no instrument code or session id appears in student-facing text; six-language keys are aligned.
9. **Flat «Participants and results» tab (T4 + T5).** Three sections with title and rule, no tinted cards; invitation actions become 44 px buttons; «Annulla» asks for confirmation inline (`ConfirmInline`).
   *Acceptance:* no coloured list backgrounds; every touch target in the tab is at least 44 px; cancelling needs a second click.
10. **Class page tabs at phone width (T1).** Below 768 px the tabs become one horizontally scrollable row or a `<select>`; translate «Noticing» (coordinate with #890).
    *Acceptance:* the tab bar takes one row at 390 px; the ARIA tab pattern is kept; the tab name is translated in six languages.
11. **Focus and error announcements in class forms (T6).** Remove `focus:outline-none` from `GroupsPanel`, `ClassPathsTab` and `StepPresentationFields` inputs (let the global ring work); add `role="alert"` to the create error.
    *Acceptance:* keyboard focus on every field shows the 2 px ring; the error is announced.
12. **One back pattern (X3 + T3 + X5).** Pick the `PersonalAreaHeader` link style for area subpages and breadcrumbs for deep teacher pages; remove the extra «Indietro» on the class page; translate the `PageHeader` fallback; move `BackButton` to tokens.
    *Acceptance:* each page has exactly one back device; `BackButton.tsx` uses no raw palette classes.
13. **Shorter path to the chat (S2).** Merge «profile dashboard» and «conversation settings» into one screen (profile above, settings and Start below) and show «Step n of m» in the stepper.
    *Acceptance:* from the tool page to the first counselor message takes at most 4 screens for a scored tool with saved preferences; the flow tests are updated.
14. **Fix glossary drift (X6).** Replace «Libretto/livret» in the guide task, align DE/SV «actions» with the navigation, and rename «Attività e percorsi» in the catalog per #861 (or record why not).
    *Acceptance:* a grep for retired terms in `lib/i18n*.ts` finds nothing; the funzionalità doc and guidance refresh are updated.
15. **Empty and signed-out states that lead somewhere (S8, S10, S11, S9).** The empty Results page points to `/profilo#profile-instrument-catalog`; signed-out pages link to login with `next`; the personal API page explains when the feature is unavailable, with the area back link; `/inizia` shows a loading line and the translated tool name.
    *Acceptance:* each state has a message and one working action; no blank page.
16. **Lighter Teacher area home (T8).** Merge the single-entry sections («Le mie classi», the gym, the teacher notebook) under one «La mia classe e il mio lavoro» group. «Prova gli strumenti» becomes one entry to a page listing the tools, with a distinct image per entry.
    *Acceptance:* the home fits in about two phone screens fewer (measure before and after); there are no section titles that repeat their only entry.
17. **Shared state message component (X8).** One `StateMessage` (loading / empty / error + retry) adopted by the catalog, results, classes and assignments.
    *Acceptance:* the four surfaces use it; the old ad-hoc boxes are removed.
18. **Raised-surface muted text (X7).** Use `ink-body` or a darker muted colour on `surface-raised` chips.
    *Acceptance:* every chip text reaches 4.5:1 or more.
19. **Flat class overview and assignment list (T9, S7).** Continue #861 into the class overview, assignments, results and notebook pages.
    *Acceptance:* no nested bordered boxes; role colours only on badges and notices (to be split per page).
20. **Reduce the raw palette (X9).** Migrate `GuidedChatInterface`, `ForumView` and the privacy components to tokens, file by file.
    *Acceptance:* a raw-palette `grep` count on each migrated file is 0, and dark mode is unchanged.

## Suggested order

Quick wins first (1-6, 11: about a day in total, mostly S), then the flat-look continuation of #861 (7, 9, 10, 16, 19), then the flow change (13), which needs an owner decision on merging the two screens.

## Bugs registered in the project journal (triage: suspected)

1. The Back button on the Student area home loops to `/profilo` (S1). 2. `--success` contrast 3.77:1 (X1). 3. The personal API page is blank when the feature is unavailable (S11). 4. The guide still says «Libretto» in IT/FR (X6).
