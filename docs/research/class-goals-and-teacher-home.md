# Research #901: class goals (OBIETTIVO_DOCENZA), catalog, hierarchy and teacher home

Read-only research for map #900 (parent #861). No product code changed. Paths are relative to the repo root; `file:line` was read on branch `research/class-goals-teacher-home` (base `db6b549f`).

Owner decisions applied (issue #901 comment, map #900): class/student choice happens BEFORE the chat and several can be chosen; the result goes into the teacher goal catalog with a note of whom it was written for; Orientamento moves into the group "La mia classe"; teacher goals get the same hierarchy and map as student goals.

## 1. How OBIETTIVO_DOCENZA starts today

Entry points (all end in `/?start=OBIETTIVO_DOCENZA`):
- Teacher home, section "Didattica": `frontend/src/components/teacher/DidacticDesignSection.tsx:15`.
- Teacher home, section "Prova gli strumenti": `TryToolsSection.tsx:20-21,27` appends the tool to the student tools list.
- Tool registry: `frontend/src/lib/tool-catalog.ts:42-46` (`TEACHER_AREA_INSTRUMENT_IDS`), `frontend/src/app/strumenti/[id]/page.tsx:24`, `frontend/src/app/questionario/page.tsx:52`.

Flow in `frontend/src/app/page.tsx`:
- `:558` reads `?start=`; the instrument is loaded and `startInstrument` runs (`:266-352`).
- `:325-330` the #837 method-choice screen: for an agent-only tool, a teacher (`canUseTeacherAssistant`) without `resumeSid`, `studentEntry` or `practiceProfileEntry` is sent to step `method-select`.
- `:648-649` the handler: `'test-student'` or `'own'` both call `startAgentOnlyQuestionnaire` (`:266`), so the choice only changes which notebook is stored, not the route.
- `:837-850` back navigation treats `method-select` as a step.

The choice screen: `frontend/src/components/qsa/InputMethodSelector.tsx`
- `:27-29` the `Method` type includes `'test-student' | 'own'`.
- `:57` `unscored = questionnaire.agentOnly`; `:75-76` default is `test-student` if a practice notebook is stored, else `own`.
- `:109` `setSelected(id !== null ? 'test-student' : 'own')`; `:151-158` the two options; `:336-339` confirm; `:358` practice-student picker shown only to teachers.

The same practice choice also lives inside the chat: `GuidedChatInterface.tsx:375,390,395` (notebook context and practice notebook id, stored in the browser by `frontend/src/lib/notebook-context.ts:11-55`), selector at `:1814-1815`, snapshot save at `:1550`. The server reads `notebook_context` per turn (`backend/chat_logic.py:3296,3332-3338`).

What removing the test-student choice touches (minimum list):
1. `page.tsx:325-330`: for OBIETTIVO_DOCENZA skip `method-select` for the practice choice. It must still show a pre-chat step (see section 4, new class/student picker) because #837 uses `method-select` as the only teacher gate.
2. `InputMethodSelector.tsx:151-158` (options), `:75-76,109` (default) and `:336-339`: the test-student option must not be offered for this tool; the other agent-only tools (OBIETTIVO_STUDIO, SAVICKAS...) keep it.
3. `GuidedChatInterface.tsx:1814`: hide the "practice" notebook option when `isDocenza`; `notebook-context.ts:50-55` (`isPracticeRun`) already stops a practice run being saved as the teacher's result, so no change there.
4. `TryToolsSection.tsx:20-21`: the tool is listed there only because "Prova gli strumenti" is where the choice lives; with the move to Libreria it leaves this section.
5. Tests that pin the current behaviour (to update, not to run here): `frontend/tests/teacher-area-home.test.mjs`, `teacher-practice-notebooks.test.mjs`, `frontend/src/lib/teacher-try-tools.test.ts`.

Risk: `readStoredNotebookContext() === 'practice'` is global in the browser (`notebook-context.ts:12`). A teacher who last chose "practice" in another tool would still enter the docenza chat in practice mode unless the docenza entry forces `default`/`teacher`.

## 2. Where the result goes today

The chat ends with a private ```` ```goal ```` block, never shown to the user.
- Contract: `backend/goal_draft.py:22-57` (`GOAL_INSTRUMENTS`, directive text; fields `title, motivation, criteria, reflection, review_date`), `:86-124` (`extract`, `_draft`).
- Wiring: `backend/routes/chat.py:391,802-807,999,1315-1316,1374-1375,1413`. The draft reaches the client as `goal_draft`.
- Client: `GuidedChatInterface.tsx:516,1138,1343,2091` keeps it in state and renders `GoalDraftCard`.
- `backend/obiettivo_layout.py:1-25` defines only the phases (prefix `obbdocenza`), not storage.

`frontend/src/components/qsa/GoalDraftCard.tsx`:
- `:35-41` Save: `POST /api/user/goals` with `origin: {kind:'session', target_id: sessionId}` and idempotent `request_id` (`frontend/src/lib/goal-draft.ts:53-57`). So today the result is a **personal goal of the teacher** (table `personal_goals`, `backend/models.py:713-733`), visible at `/profilo/obiettivi` (`GoalsPanel`).
- `:63-69` for OBIETTIVO_DOCENZA only, a secondary button "publish" opens `GoalCatalogEditor` pre-filled (title, description=motivation, criteria, suggestions=reflection). It is a separate, manual second step.

Tables and fields involved:
- `personal_goals` (`models.py:713`): `username, catalog_id, catalog_snapshot, title, motivation, criteria, reflection, status, priority, review_date, shared_group_id, revision, method`. No class and no student column except `shared_group_id`, which is the **student's** own share with a class (validated against the student's memberships, `backend/goals.py:166-168`). A teacher is not a member of their own class, so this field cannot hold a class target for them.
- `goal_resource_links` (`models.py:736-745`): `kind` is one of reading/notebook/event/session (`goals.py:16`). Holds the session origin, nothing about a class.
- `goal_catalog` (`models.py:630-642`): `author_username, group_id (nullable), status (draft|pending|published|archived), version, data JSON`. `data` is `CatalogData` (`goals.py:23-30`): `title, description, area, audience, criteria, suggestions, language`. The schema is `extra='forbid'` (`goals.py:19-20`).
- `teacher_assignments` (`models.py:652-673`): delivery of a catalog snapshot to a class (`group_id`) or one `recipient_username`; `source_kind`/`source_id`/`snapshot`. Created by `POST /teacher/assignments` (`backend/routes/assignments.py:125-165`), `source_kind` fixed to `'goal'` (`:31`), recipients from `group_memberships` (`:152-160`).
- `goal_catalog.group_id` is the only existing link between a catalog entry and a class (`StudentGroup`); one class at most, and the entry is then visible to the students of that class once `published` (`goals.py:143-147`).

Goal catalog page `/docente/catalogo-obiettivi`: `frontend/src/app/docente/catalogo-obiettivi/page.tsx:7` renders `GoalCatalogEditor` (`frontend/src/components/goals/GoalCatalogEditor.tsx`). API `GET/POST /teacher/goal-catalog`, `PUT /teacher/goal-catalog/{id}` (`backend/routes/goals.py:47-94`), optimistic lock on `version` (`:84`). The old `/docente/obiettivi` only redirects (`app/docente/obiettivi/page.tsx:5`).

Class plans: operational plans are `class_paths` (`models.py:2103`) with steps (`:2186`), separate from goals; assignments are the only bridge goal -> class.

Existing gap, no link at all: nothing connects a **session** (the teacher's goal chat) to the classes chosen in it. The classes are only sent per turn (`GuidedChatInterface.tsx:1025,1076,1102,1323`) and stored in the frozen snapshot (`frontend/src/lib/frozen-session.ts:49,71`).

## 3. What exists to show a goal on a class page or a student page

Class page tabs: `ClassSettingsPage.tsx:401` (`overview | students | paths | forum | audit | toolsTab | council | orientation | noticing`), panels at `:446-476`.
- Overview/Students: `ClassOverviewTab.tsx`, `ClassStudentsTab.tsx`. No goal section anywhere in `components/teacher/Class*.tsx` (grep of "goal" only hits `ClassPathsTab.tsx:341`, a tool-key list).
- Noticing: `ClassNoticingTab.tsx`, API `GET/POST /admin/groups/{id}/noticing` (`backend/routes/groups.py:1005-1021`), per student `.../students/{username}/noticing` (`:1032-1041`), cache table `teacher_noticing_artifacts` (`models.py:2513-2527`, keyed by group and optional student, append-only, outside log exports). Logic in `backend/class_noticing.py`, `teacher_noticing.py`, `noticing_sources.py`. It has no goal source.
- Teacher notes: `teacher_notes` (`models.py:1374-1391`): `group_id, username (student), author_username, kind note|message, text (encrypted), visible_to_student (default False)`. API `GET/POST /admin/groups/{id}/notes` (`routes/groups.py:1192-1233`), student side `GET /user/teacher-notes` returns only `visible_to_student` rows (`:1414-1432`). A note needs a class member (`_require_group_member`, `:167`).
- Student goals seen by the teacher: `GET /teacher/groups/{id}/goals` (`routes/goals.py:301-321`) returns only goals the student shared with that class (`shared_group_id`) plus their descendants (branch rule `:307-309`), without ancestors. Shown in the catalog editor bottom section with indentation only (`GoalCatalogEditor.tsx` "shared" block, `orderBranches` at `frontend/src/lib/goal-network.ts:93-102`), not on the class page.
- Student goals page: `/profilo/obiettivi` -> `GoalsPanel` (`frontend/src/components/goals/GoalsPanel.tsx`).

So a teacher goal can today be shown on a class page only through an assignment (a delivery to students), never as a teacher-side annotation of the class.

## 4. Options to tie a result to classes or students

Decision already taken: choose BEFORE the chat, several allowed, result goes to the catalog with a note of whom it is for.

Where to ask:
- Before the chat (decided). Reuse `DocenzaClassBar` (`frontend/src/components/qsa/DocenzaClassBar.tsx:90-142`): it already does multi-select of the teacher's active classes via `GET /api/admin/groups?own=true`, keeps ids in `localStorage` key `cb-docenza-group-ids` (`:75-85`) and sends `group_ids` every turn; the server re-verifies access each turn (`backend/teacher_context.py:93-119`, `visible_group_for_teacher` `:74-89`) and puts class name/school/description/methodologies into the prompt. Today it sits inside the chat (`GuidedChatInterface.tsx:2142`), after the chat started. The change is to render the same bar (plus a student picker) in the pre-chat step that replaces `method-select` (`page.tsx:325-330`) and pass the ids in.
- Students: a student picker per selected class needs the member list. `GroupMembership` is `(group_id, username)` (`models.py:1478-1487`); the class page loads members for `ClassStudentsTab`. A new light endpoint may be needed only if the existing members call is too heavy for a picker.
- At the summary or when saving are not needed once the choice is before the chat; at save the targets only have to be copied from the session snapshot into the catalog entry.

Data model for "note of whom it is for" (several classes and students):
- Do NOT put it in `goal_catalog.data`: `catalog_dict` (`goals.py:150-151`) returns `data` to students through `GET /user/goal-catalog` (`routes/goals.py:42-44`) when the entry is published, so names of students (or classes) would leak. `CatalogData` is also `extra='forbid'` (`goals.py:19`).
- Recommended: new table `goal_catalog_targets(id, catalog_id FK goal_catalog ON DELETE CASCADE, group_id FK student_groups, username NULL)`; `username` null = whole class. Returned only by `GET /teacher/goal-catalog` (`routes/goals.py:47-65`), never by `student_catalog`. Cheap alternative: one JSON column `targets` on `goal_catalog` with the same teacher-only serialization. Table is better because the class page needs "goals for this class" as a query (`WHERE group_id = ?`).
- Keep `goal_catalog.group_id` for what it already means (visibility for students when published); it is single valued, so it cannot express several classes. Do not reuse it for the note.
- Migration pattern: `create_all` adds new tables on existing installs (see note at `models.py:2513-2518`); new columns need an entry in the column list in `backend/main.py:731` style.

Privacy rules (student must not see teacher notes unless shared):
- Targets and the free note stay teacher-only by construction (separate table/endpoint above).
- When a catalog entry is later delivered to a class, `teacher_assignments.snapshot` copies the entry (`routes/assignments.py:78` `_snapshot`); the snapshot must be built from `data` only, never from targets. Existing behaviour already does that because targets are not in `data`.
- Per-student targets must be limited to real members of a class the teacher can see (same check as `_require_group_member`, `routes/groups.py:167`, and `visible_group_for_teacher`). Re-verify at save, as the chat does each turn.
- If the teacher wants the student to read a note, the existing mechanism is `teacher_notes.visible_to_student` (`models.py:1387`), not the catalog note.

Showing it on class and student pages (follow-up, not required for the first slice): query targets by `group_id`/`username` and add a read-only block in the class Overview tab and next to the student's notes (`ClassStudentsTab`). Noticing needs no change.

## 5. Student goals: hierarchy and map today (and what teacher goals need)

Models (`backend/models.py`):
- `PersonalGoal` `:713-733`; `GoalEdge` `:747-760` (`parent_id`, `child_id`, FK `personal_goals` ON DELETE CASCADE, unique pair `uq_goal_edge`, check `parent_id <> child_id`): a network, a child may have several parents. `GoalResourceLink` `:736`, `GoalReview` `:774`, `PersonalStrategy` `:763`.
- `GoalCatalogEntry` `:630` has NO edges, no `status` lifecycle like goals, no priority, no review date.

Backend (`backend/goals.py`, `backend/routes/goals.py`):
- Helpers: `parent_ids` `goals.py:176`, `descendant_ids` `:180-187` (iterative, used for cycles and sharing), `lock_network` `:171-173` (advisory lock per student so two requests cannot close a cycle), `owned_goal` `:154-163` (revision check).
- Routes: `POST /user/goals` accepts `parent_id` and creates the edge in the same transaction (`routes/goals.py:115-147`, edge at `:143-144`); `POST /user/goals/{id}/parents` rejects cycles with 422 (`:199-211`); `DELETE .../parents/{parent_id}` (`:214-224`); `GET /user/goals` returns each goal with `parent_ids` (`goals.py:259-282`); teacher read-only view `GET /teacher/groups/{id}/goals` (`:301-321`).

Frontend:
- Pure graph functions on `PersonalGoal[]`: `frontend/src/lib/goal-network.ts` (`buildForest`, `descendants`, `ancestors`, `wouldCycle` `:37`, `effectiveShares`, `progress`, `visibleGoals`, `orderBranches` `:93-102`). They read only `id, parent_ids, status, priority, review_date, shared_group_id, title`.
- Type: `frontend/src/lib/goals.ts` (`PersonalGoal`, `parent_ids`); API client `goalApi` (`goals.ts:19-24`).
- List: `GoalTree.tsx` (nested disclosure lists, repeated multi-parent goals collapsed, add-child button `:13-36`).
- Map: `GoalMap.tsx` (React Flow `@xyflow/react` + Dagre top-to-bottom layout, read-only, hidden below `lg`, `:36-54`); view toggle persisted in `localStorage` `cb_goals_view` in `GoalsPanel.tsx:20-21,86`.
- Editing structure: `GoalDialog.tsx` (add/remove parent `:136-143`, candidate list excludes self, descendants and current parents `:158`, sub-goal creation with `parentId` `:56,130`).
- Page: `frontend/src/app/profilo/obiettivi/page.tsx` -> `GoalsPanel`.

What reusing it for teacher goals in the catalog would take (smallest path, mirror, do not generalize):
1. DB: `goal_catalog_edges(parent_id, child_id)` FK `goal_catalog` ON DELETE CASCADE, same unique and no-self constraints. New table only.
2. Backend: `descendant_ids`/`parent_ids`/`lock_network` take a table argument (or small copies in a `catalog_goals` module). Routes under `/teacher/goal-catalog/{id}/parents` (POST/DELETE) with the same cycle check; `GET /teacher/goal-catalog` adds `parent_ids`; `CatalogWrite` accepts `parent_id` on create. Auth: author only (admin all), as `update_catalog` (`routes/goals.py:77-94`). Locking: the catalog uses `version`, not `revision`; keep `version`.
3. Frontend: `GoalTree`, `GoalMap`, `goal-network.ts` are typed to `PersonalGoal`. Cheapest is an adapter that maps a catalog row to the minimal shape they use (`id, title, status, priority:2, review_date:null, shared_group_id:group_id, parent_ids`), then render `GoalTree` and `GoalMap` inside `GoalCatalogEditor`. Narrowing the three components to a `Pick<PersonalGoal, ...>` type is the cleaner variant, small and mechanical. The editing UI (parent picker, sub-goal) needs a catalog version of `GoalDialog`'s parent section; do not reuse `GoalDialog` itself (reviews, links, method, sharing do not exist for catalog entries).
4. Sharing semantics: for students, `effectiveShares` follows ancestors (`goal-network.ts`); for the catalog, visibility is `status='published'` + `group_id` (`goals.py:143-147`). Decide: a child never more visible than a draft parent? Proposed: no inheritance, keep visibility per entry; show "also under" like `GoalTree` does.
5. Adoption by students (`PersonalGoal.catalog_id`/`catalog_snapshot`, `routes/goals.py:130-137`) copies one entry; edges are NOT copied. Out of scope unless the owner wants "adopt a branch".
6. Alternative not chosen: save docenza results as the teacher's own `PersonalGoal` (already happens, `GoalDraftCard.tsx:35`) and reuse everything with zero new code. It does not match decision Q2 (the catalog), and `personal_goals` has no target fields, but it is the cheapest fallback for the hierarchy if the catalog edges are postponed.

## 6. Teacher home today: sections and entries

File `frontend/src/components/teacher/TeacherAreaHome.tsx:22-61`; slugs and groups in `frontend/src/lib/teacher-area.ts:3-10`; titles in `frontend/src/lib/i18n-teacher-area.ts` (`didacticDesign:33`, `myClassesTitle:145`, `practiceGymTitle:257`, `tryToolsTitle:329`, `teacherProfileHeading:345`, `classroom:378`, `resources:380`, `research:381`). Render order (top to bottom):

| # | Section (id) | Entries | href | Component |
|---|---|---|---|---|
| 1 | Didattica (`teacher-didactic-design-heading`) | OBIETTIVO_DOCENZA | `/?start=OBIETTIVO_DOCENZA` | `DidacticDesignSection.tsx:15` |
| 2 | Le mie classi (`teacher-my-classes-heading`) | `classi` | `/docente/classi` | `MyClassesSection.tsx:13` |
| 3 | Classe e assegnazioni (`teacher-group-classroom`) | `istituti` (only if `institutes`), `compilazioni`, `piani-operativi`, `incontri`, `assegnazioni`; `classi` is filtered out (`TeacherAreaHome.tsx:30`) | `/docente/<slug>` | `renderGroup`, group `teacher-area.ts:7` |
| 4 | Palestra (`teacher-practice-gym-heading`) | `taccuini-prova` | `/docente/taccuini-prova` | `PracticeGymSection.tsx:15` |
| 5 | Prova gli strumenti (`teacher-try-tools-heading`) | all active student tools + OBIETTIVO_DOCENZA | `/?start=<id>` | `TryToolsSection.tsx:27` |
| 6 | Profilo (`teacher-profile-notebook-heading`) | `taccuino` | `/docente/taccuino` | `TeacherAreaHome.tsx:51-53` |
| 7 | Libreria e risorse didattiche (`teacher-resources-heading`) | `catalogo-obiettivi`, `risorse`, `strategie`, `materiali` | `/docente/<slug>` | `TeacherResourcesSection.tsx:8` |
| 8 | Somministrazioni e ricerca (`teacher-group-research`) | `orientamento` (teachers only, `:30`), `somministrazioni` | `/docente/<slug>` | group `teacher-area.ts:9` |
| 9 | AI connections | personal AI / API | (component) | `PersonalAIConnections area="docente"` `:58` |

Slugs defined but not in any group: `dispositivi` (`teacher-area.ts:3`, route `app/docente/dispositivi`), `taccuini-prova` and `taccuino` (rendered by their own sections). `risorse` is a hub (`TeacherResourcesHub.tsx`) that duplicates strategie/materiali. Other routes under `app/docente/`: `api-personali`, `chatgpt`, `palestra`, `proposte`, `obiettivi` (redirect). Gating: `teacher` flag hides `orientamento`; `institutes` flag shows `istituti`.

Note the duplication that the regrouping removes: OBIETTIVO_DOCENZA appears twice (rows 1 and 5), and the goal catalog sits away from the tool that feeds it.

Proposed regrouping (owner-approved, map #900 Q3) mapped to code:
1. **La mia classe**: `classi`, `piani-operativi`, `assegnazioni`, `incontri`, `compilazioni`, `orientamento`, `istituti` (flagged). Merge `MyClassesSection` and the `classroom` group (`teacher-area.ts:7`) and move `orientamento` out of `research` (`:9`). `orientamento` keeps its teacher-only gate (`TeacherAreaHome.tsx:30`).
2. **Libreria e risorse didattiche**: OBIETTIVO_DOCENZA (new first entry, taken from `DidacticDesignSection`), `catalogo-obiettivi`, `strategie`, `materiali` (`risorse` hub is the owner's call: it duplicates two of these).
3. **Provare**: `taccuini-prova` (studenti di prova) + "Prova gli strumenti" without OBIETTIVO_DOCENZA (`TryToolsSection.tsx:20-21`).
4. **Ricerca**: `somministrazioni`.
5. **Il mio profilo**: `taccuino`, plus AI connections and API (`PersonalAIConnections`, slug `api-personali`).
Unplaced by the decision: `dispositivi` (not on the home today; leave as is).
Tests that read the section ids: `frontend/tests/teacher-area-home.test.mjs`, `teacher-loading-errors.test.mjs`, `teacher-notebook-page.test.mjs`.

## 7. Suggested split into issues (all base `main`, no stacking)

1. **Home regrouping** (frontend only, `TeacherAreaHome.tsx`, `teacher-area.ts`, `i18n-teacher-area.ts`, the 5 section files, `teacher-area-home.test.mjs`). Includes moving OBIETTIVO_DOCENZA to Libreria and `orientamento` into La mia classe. Independent; can ship first.
2. **Pre-chat class/student picker, no test-student for OBIETTIVO_DOCENZA** (`page.tsx:325-330,648`, `InputMethodSelector.tsx`, `DocenzaClassBar` reuse, `GuidedChatInterface.tsx:1814,2142`, `frozen-session.ts`). Persist chosen classes and students in the session snapshot. Server: accept `student_usernames` next to `group_ids` in the request (`backend/api_models.py:51`) and verify membership per turn like `teacher_context.py:93`; optionally add the student's notebook to the prompt (no prompt change otherwise, per map "Not doing").
3. **Catalog targets and save into the catalog** (backend table `goal_catalog_targets` + teacher-only serialization in `routes/goals.py:47-65`, `GoalDraftCard.tsx` saving straight to `POST /teacher/goal-catalog` with targets, assignments unchanged). Includes privacy tests: student endpoint never returns targets.
4. **Show catalog goals on class and student pages** (read-only block in class Overview tab and student notes area; query by target). Depends on 3.
5. **Hierarchy for the catalog** (`goal_catalog_edges`, parent routes, cycle check) and 6. **Tree + map for the catalog** (`GoalTree`/`GoalMap` adapter inside `GoalCatalogEditor`, editing UI for parents). 5 before 6; both independent of 2 and 4. Optional last: "adopt a branch" for students.

Order proposal: 1, 2 and 5 in parallel; 3 after 2; 4 after 3; 6 after 5. Docs to touch in the product PRs: `docs-counselorbot/funzionalita-counselorbot.md` and guidance refresh (`make guidance-check`) for 1-4 and 6.

## 8. Open questions for the owner

1. Is the student picker (individual students) needed in the first slice, or is class-only enough for issue 2? Per-student needs a members list in the pre-chat step.
2. Catalog visibility of children in a branch (section 5, point 4): independent per entry (proposed) or inherited from the parent?
3. Keep the `risorse` hub on the home, given that it duplicates `strategie` and `materiali`?
4. Should the old `?start=OBIETTIVO_DOCENZA` deep link from "Prova gli strumenti" keep working (it will, as the route is the same)?
