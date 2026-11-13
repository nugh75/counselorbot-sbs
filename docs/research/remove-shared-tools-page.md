# Research: removing the shared tools page (#849, map #848)

Read-only investigation, 13 Nov 2026. Paths are relative to `frontend/src/` unless stated.
Terms: **home** = `/?view=home` = step `base` of `app/page.tsx`, rendered by `components/home/ReturningHome.tsx`
(heading «Attività e percorsi», i18n `base.instruments.title`, `lib/i18n.ts:205`).

## 1. Key finding: the Student area has no tool catalog today

The map says "Student area: its existing catalog becomes the only one". That is **not true of the code**:

- `/profilo` home (`components/profile/PersonalAreaHome.tsx:158-190`, groups in `lib/personal-area.ts:4-8`) lists
  **personal areas** only: piani-operativi, taccuino, cambiamenti, compilazioni, analisi-combinata, obiettivi, azioni,
  timeline, pqbl, flashcard, carte, confronto, tavolo, portfolio, assegnazioni, classi, orientamento, telegram.
- The **instrument catalog** (QSA, QSAr, ZTPI, QPCS, QPCC, QAP; Savickas, EVENTO_*, OBIETTIVO_STUDIO, IDEA) exists only in
  `ReturningHome.tsx` (`#home-catalog-section`, line ~190; groups `assessment`/`guided` from `lib/tool-catalog.ts:21-40`,
  `getDynamicToolCategories` `:105`). There is nothing in `/profilo` that starts a questionnaire or guided chat.
- `CONTEXT.md:14` ("Catalogo Area studente") and test ids `#personal-catalog-section` refer to the personal-areas list.

Consequence: removing the home means **moving** the instrument catalog into `/profilo` (new work), not just deleting.

## 2. What `/?view=home` renders, per role

`ReturningHome` has **no role branches**: no `identity`, `isTeacher` or `canUse*` in the component. Only the class filter
(`useUserAccess` → `resolveActiveStudentTools`, `isToolAllowed`, `isClassContentHidden`) changes the output.

| Role | Result |
| --- | --- |
| Guest | `app/page.tsx:950-972`: login card, not the catalog |
| Student with class(es) | class path hero (if view ≠ "all"), paused-chat notice, Bussola entry, suggestions, grouped tools filtered by class tool keys, personal-area entry, resume list, "upcoming" tools |
| Student, no class | same, unfiltered (access unrestricted) |
| Teacher / researcher / admin | **identical** to the student render; staff are unrestricted by default (`backend/class_access.py:85-95`). `OBIETTIVO_DOCENZA` is hidden from everyone (`TEACHER_AREA_INSTRUMENT_IDS`, `tool-catalog.ts:45`; filter `:67`, `:78`) |

Blocks, in order (`ReturningHome.tsx`): class path hero (`:152`), paused-chat notice after the freeze ribbon (`:~160`),
Bussola entry `CompassEntry`, suggested tools (`suggestTools`, `lib/catalog-status.ts`), catalog groups with
"Compila sul sito" `/somministrazione/{id}/{lang}` (`:~318`) and "Details" `/strumenti/{id}` (`:~325`),
`PersonalAreaEntry` → `/profilo`, resume section `data-testid="home-resume"`, upcoming tools.

Difference from `/profilo`: home = start tools + resume; `/profilo` = personal pages (results, notebook, plans, classes).
They already cross-link (`PersonalAreaEntry`, home pill to `/profilo`; `/profilo` back arrow `backHref="/"` at `app/profilo/page.tsx:441`).
`/` itself: first visit with no history/paths shows the **intro** step (`homeStep`, `app/page.tsx:315-317`; entry decision `:~325-332`),
which also has "all tools" buttons calling `openTools` → step `base` (`components/home/IntroScreen.tsx:60,66`).

## 3. Entry points to home and `/strumenti`

Direct `/?view=home` links:
- Navbar «Attività e percorsi»: `lib/header-navigation.ts:71` (visible to everyone, incl. guests; `group: 'support'`).
- Brand click and mobile menu fire `cb-navigate-home` (`components/layout/Header.tsx:73`, `HeaderMenu.tsx:72`), handled `app/page.tsx:255-275`; brand `<a href="/">` `Header.tsx:93`.
- Bussola: `app/bussola/page.tsx:223` (finish, unless `?next=`), `:262` (`skipToTools`), `:269` (`goToTools`); `orientationToolHref` fallback `lib/tool-catalog.ts:139` (`/pqbl` aside).
- `/inizia` back: `components/profile/AccountSetup.tsx:48` (`goBack`); success path uses `safeAccountNext` → `/` (`lib/account-preferences.ts:28-31`), which lands on intro/home by the entry rules above.
- Group invite `/gruppo`: `app/gruppo/page.tsx:103` («Vai agli strumenti»).
- Tool pages and questionnaire flows as "back to selection": `app/strumenti/[id]/page.tsx:23`, `app/somministrazione/page.tsx:19`, `app/somministrazione/[instrument]/page.tsx:32` (fallbackHref), `components/administration/QuestionnaireRunner.tsx:36`.
- Guide tasks: `lib/guide-tasks.ts:28,29,36` (`questionnaires`, `chat`, `events`; audiences student/teacher).
- Legacy: `/strumenti` → 308 `/?view=home` (`lib/legacy-routes.ts:5`, wired in `next.config.ts:33`); `?view=questionnaires` also accepted (`app/page.tsx:580-593`). `app/strumenti/` has only `[id]` and `layout.tsx`; `[id]` stays.
- Implicit: anything that returns to plain `/` (profilo cards `app/profilo/page.tsx:409,429,494`, `app/profilo/cambiamenti/page.tsx:51,69`, `app/questionario/page.tsx:278,293`, `app/admin/page.tsx:172,193`, `app/unisciti/page.tsx:194`, `components/teacher/TeacherAccess.tsx:23`, logout `app/logout/page.tsx:17`, `app/register/page.tsx:10`, many admin panels on 401/403). These land on the intro or home depending on history; the replacement needs a **role-aware `/`** or they stay as-is.
- Resume entries: `lib/use-resume-entries.ts` (`resumeHref`, `LOCAL_RESUME_HREF`, `PQBL_RESUME_HREF`) open `/?frozen=…` or sub-pages, not home; the **list** itself is rendered on home (`ReturningHome` resume section) and in the header (`HeaderResume`). The paused-chat landing after a freeze goes to step `base` (`app/page.tsx` `pausedChat`, `lib/catalog-status.ts:7`).
- Disabled-tool deep links fall back to `setStep('base')` (`app/page.tsx` ~`:456,503,573,630,918`, `:1264` "back" button).
- `useEffect` history trail uses `cbPageStep` `base`/`intro` (`app/page.tsx:225-239,585`): popstate depends on the `base` step.

Stay valid regardless: `/?start=<id>`, `/?frozen=`, `/?session_id=&instrument=`, `/strumenti/[id]`, `/somministrazione/*`.

## 4. Navbar class selector

- Component: `components/layout/ClassViewSwitcher.tsx` (native `<select>`, `Layers` icon, `aria-live` error). Rendered in `Header.tsx:108` (desktop, `lg`+) and `HeaderMenu.tsx:94` (compact, `labelled`).
- Visibility: `nav.classView` = authenticated **and** `classViewOptions(access).length > 0` (`header-navigation.ts:109`) = the account has ≥1 active class. Not role-based: teachers enrolled as students see it too (`lib/class-view.ts:15-16` comment).
- Options (`lib/class-view.ts:17-27`): 1 class → «Tutti gli strumenti» + that class; ≥2 → «Tutti gli strumenti», «Le mie classi», one per class. Labels `lib/i18n-class-view.ts:3`.
- State: server side, `AccountPreferences.class_view` (`backend/models.py:65`). Resolved by `_scoped_classes` (`backend/class_access.py:80-101`): students default to the class view; **staff default to "all"** unless they pick a class; stale class → full.
- API: `PUT /api/user/access/view` body `{view: 'all'|'classes'|<id>}` (`backend/routes/class_access.py:21-33`, `save_view` `class_access.py:112-121`, 400 `no_class`/`class_not_joined`). The client then stores the response (`setCachedUserAccess`) and dispatches `USER_ACCESS_CHANGED` (`lib/class-view.ts:41-48`); `useUserAccess` consumers re-render. No reload.
- What «Tutti gli strumenti» does: `restricted: false`, no class tool filter, class content hidden (`isClassContentHidden`, `CONTEXT.md:13`): hides plans, assignments, messages, meetings of classes in the student UI; chat preferences use only the active view. Data and enrolment are untouched.
- Rename target: the label is shared by `i18n-class-view.ts:3`, `i18n-class-paths.ts:128,130` (`allTools`, `allPersonalTools`) and `i18n-noticing.ts:75` (`allInstruments`); check each before renaming to «Senza classe» in 6 languages.
- Moving it to the top of `/profilo` is feasible without API change; `access` is available via `useUserAccess` (used in `PersonalAreaHome`). Header props `classView`/`access` and `HeaderMenu` slot are then removed.

## 5. What the Teacher area lacks to start a tool

- `/docente` home (`components/teacher/TeacherAreaHome.tsx`, groups `lib/teacher-area.ts:7-9`: classroom, resources, research) has **no block that starts a tool**. The only launcher is `DidacticDesignSection.tsx:52` → `/?start=OBIETTIVO_DOCENZA`. Practice runs start from `/docente/taccuini-prova` (`PracticeGymSection.tsx:59,69`, `PracticeRepertoire.tsx:121` via `practiceResultChatHref`, `lib/practice-notebooks.ts:80`).
- Own data: a teacher runs a tool from the shared home today; no equivalent in `/docente`. `/profilo` is open to staff (`lib/roles.ts` `canUsePersonalPage`) but has no catalog (see §1).
- Test-student choice (#837, closed): lives in the root page flow — `method-select` step (`app/page.tsx:746-750` `method==='practice'`), practice context `isPracticeRun(canUseTeacherAssistant(identity), readStoredNotebookContext())` (`:356,410,428`), practice entry params `practice_notebook_id`/`practice_result_id` honoured only for `canUseTeacherAssistant` (`:683-701`). A "Try the tools" block can deep-link `/?start=<id>` and reuse that screen; whether it can **pre-select** a test student (vs. choosing in the method screen) needs a small decision.
- Catalog source for the block: reuse `resolveActiveStudentTools`/`getDynamicToolCategories`; add `OBIETTIVO_DOCENZA` explicitly (excluded by `TEACHER_AREA_INSTRUMENT_IDS`). Teachers are not class-filtered by default, so the block needs no access gate beyond `isToolAllowed`.
- Role flag gap: `canUseTeacherAssistant` = admin, teacher or researcher (`lib/roles.ts`); the navbar teacher link uses it (`header-navigation.ts:92-95`), so "teacher area" = all three.

## 6. Navbar after the change (Q2/Q3/Q4)

- Remove entry `instruments` from `HEADER_LINKS` (`header-navigation.ts:70-73`) and key `'instruments'` from `HeaderLinkKey`; Header icon map and `matchesHref` `/?view=home` case then go (`header-navigation.ts:126-139`).
- Student link `profile` is already visible to every authenticated user (incl. teachers) and `teacher-panel` to staff: Q2 "both areas" already holds. Guests lose their only catalog link (they see the login card at `/` anyway).
- Q4 (no class, no teacher): `/profilo` gets the catalog unrestricted (access unrestricted).
- `presentation` link `/?view=intro` stays; `matchesHref` `['/?view=intro','/','?view=home',false]` test case needs review.
- Bussola `finish`/`skipToTools`/`goToTools` and `orientationToolHref` fallback → `/profilo` (Q3). Introduction `onOpenTools` and `/inizia` `goBack` likewise.

## 7. Tests and docs bound to current behaviour

Unit (`node --test`): `lib/header-navigation.test.ts:158-171` (matchesHref for `/?view=home`), `lib/legacy-routes.test.ts:12-19`, `lib/orientation-flow.test.ts:12,46,106,118`, `lib/catalog-paused-chat.test.ts:5,25`, `lib/tool-catalog` guards.
Browser (Playwright fixtures): `tests/navbar-visibility.test.mjs` (instruments link for every profile `:151`; selector `:313-318,488-496`; `/?view=home` loop `:292`) and `tests/fixtures/navbar-contract.mjs` (`:65-77` expectations with `view` options, `:103,138,147`); `tests/legacy-routes.test.mjs:85-135` (redirect keeps anchor, renders catalog, `/gruppo` link); `tests/class-path-placement.test.mjs:404-426,433-463,492-517,600` (`#home-catalog-section`, `#personal-catalog-section`, heading); `tests/design-usability.test.mjs:120`; `tests/account-onboarding.test.mjs:521-530`; `tests/class-support-access.test.mjs`, `tests/class-path-presentation.test.mjs`, `tests/personal-pqbl.test.mjs`, `tests/chat-recovery.test.mjs` (reference `view=home`/`/strumenti`; verify per file).
Docs: `CONTEXT.md:12-14,53` (navbar legacy compatibility, «Tutti gli strumenti», Catalogo Area studente), `docs/operations/audit-navbar.md` (inventory rows ~`:105`, `:318`, `:455-456`), `docs/operations/navbar-visibility-tests.md:51,201`, `docs/design.md:305`, `docs/operations/plan-activity-flow.md:38`, `docs-counselorbot/` and `docs/guide`-style pages (guide tasks, `lib/i18n-guide-tasks.ts:6,166`), funzionalità doc + guidance-refresh required for product PRs (project memory).

## 8. Risks

1. **Catalog does not exist in `/profilo`** (§1): biggest piece of work; scope and design must be agreed before slicing.
2. **Role-aware redirect of `/` and `/strumenti`**: `/strumenti` redirect is static (`next.config.ts` permanent 308 → cached by browsers). A role-dependent target needs a client or middleware step; make `/strumenti` temporary or point it to a neutral route, since permanent redirects are cached.
3. Plain `/` is the app's universal "back" (≈25 sites, §3) and a first-visit intro. Decide whether `/` keeps intro + redirect or also becomes role-aware.
4. Staff default to "all" view and unrestricted access; moving the selector to `/profilo` means a teacher using the Student area sees all tools unless they pick a class (relates to the open Q2 detail).
5. Chat/flow state hangs on step `base` (`cbPageStep`, popstate trail, paused-chat landing, disabled-tool fallbacks): these need a new landing (`/profilo`) with the same notices (paused chat, resume list, suggestions).
6. Class-view label rename touches three i18n files and `navbar-contract.mjs` fixtures (6 languages).
7. Resume list and paused-chat notice currently live on home only; they must move, not vanish.
8. Test volume: ~10 browser tests reference the heading or `#home-catalog-section`; one test suite at a time on this Mac.

## 9. Suggested split (small issues, dependencies)

1. **Catalog in the Student area** — extract the catalog block (suggestions, groups, "Compila sul sito", details, upcoming) from `ReturningHome` into a shared component and mount it on `/profilo`; move resume list, paused-chat notice, class path hero. No removals yet. *No deps.*
2. **Class selector to `/profilo`** — new top dropdown «Scegli la tua classe», rename «Tutti gli strumenti» → «Senza classe» (i18n ×6), remove from `Header`/`HeaderMenu`; update navbar contract fixtures. *Depends on 1 (layout) or can go parallel.*
3. **Teacher «Try the tools» block** (cream) on `/docente` with test-student choice from #837 and own-data start; includes `OBIETTIVO_DOCENZA` and moves `DidacticDesignSection` launcher if desired. *No deps; needs the Q1/Q2 decision.*
4. **Role-aware redirects** for `/?view=home`, `/?view=questionnaires` and `/strumenti` (staff-only → `/docente`? per decision: by role) with a non-cached redirect; update `legacy-routes` + tests. *Depends on 1 and 3.*
5. **Repoint entry points** — Bussola, intro, `/inizia`, `/gruppo`, tool pages, guide tasks, `orientationToolHref`, disabled-tool fallbacks to the Student area. *Depends on 1.*
6. **Remove the home** — drop `ReturningHome`, step `base`, `instruments` navbar entry, `cb-navigate-home`; keep intro and deep links. *Depends on 2, 4, 5.*
7. **Tests and docs** — update contracts, legacy-routes, class-path-placement, navbar docs, CONTEXT.md, funzionalità doc, guidance-refresh. *Alongside each issue above; final sweep after 6.*

Open before slicing: Q2 detail (teacher in the Student area: student experience or not), and whether the Student area catalog should be a new section or replace the personal-areas index.
