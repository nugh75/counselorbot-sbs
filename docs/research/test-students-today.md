# How do test students and class management work today?

Research for wayfinder ticket #829 (map #828). Read-only audit of branch `research/test-students-today` (based on `main` at 6d4fa33b). Facts with `file:line`; no proposals.

Two separate mechanisms exist today. Both are called "test/practice" in the code, and neither is a class concept.

- **A. Practice notebooks** ("taccuini studente di prova"): imaginary students owned by one teacher.
- **B. View-as demo accounts**: five fixed fake accounts an admin can impersonate.

## 1. Scored questionnaires (QSA, QSAr, ZTPI, QPCS, QPCC, QAP) as a test student

**Data model (A).**
- `TeacherPracticeNotebook`: one imaginary student per row, with `owner_username`, `title`, `data` (JSON profile), `group_ids` (JSON list, not a FK), `archived_at` (`backend/models.py:822-841`).
- `TeacherPracticeResult`: the student's questionnaire profile, with `notebook_id`, `questionnaire_type`, `scores`, `session_id`, `source` = manual|generated|chat (`backend/models.py:844-870`). Its docstring says it is not a `QuestionnaireResult` and stays out of the teacher's compilations, profile comparisons and research data (`backend/models.py:846-851`).
- Profile fields are fixed: age, gender, school_class, school_year, context, goal, main_difficulty, strengths, weaknesses, notes (`backend/student_context.py:22-33`).

**Creating and editing test students (A).**
- Screen `/docente/taccuini-prova` (`frontend/src/app/docente/taccuini-prova/page.tsx`), reached from the "Palestra" card (`frontend/src/components/teacher/PracticeGymSection.tsx:55-69`). Components: `PracticeNotebooks.tsx`, `PracticeRepertoire.tsx` (scores per instrument), `PracticeChats.tsx` (chat history).
- API, all under `/api/teacher/practice-notebooks` (`frontend/src/lib/practice-notebooks-api.ts:6`; routes in `backend/routes/practice_notebooks.py:42-148`): list, create, update/archive, delete, link to class (`PUT .../{id}/classes/{group_id}`, `:125`), results CRUD (`:165-250`), chats list and transcript (`:275-314`).
- Role guard: `get_current_plan_manager` = admin, researcher, or group name containing a teacher marker (`backend/auth.py:45`, `:237-250`). Ownership is checked on every call (`backend/routes/practice_notebooks.py:26-34`).
- Repertoire instruments are limited to `['QSA','QSAr','ZTPI','QPCS','QPCC','QAP']` (`frontend/src/lib/practice-notebooks.ts:65`). Scores are typed by hand or randomly generated client-side (`PracticeRepertoire.tsx:73-80`, `:86-90`).

**Picking the test student in the scored flow (A).**
- Home flow, step `method-select` (`frontend/src/app/page.tsx:388`, `:427`), component `InputMethodSelector`. For teachers with at least one notebook it shows a "practice student" `<select>` (`frontend/src/components/qsa/InputMethodSelector.tsx:310-317`) and, once a notebook is chosen, a "practice" method that loads one of its saved profiles (`:130-134`, `:172-175`, `:289-291`). The choice is stored in `localStorage` (`frontend/src/lib/notebook-context.ts:13-14`, `:32-48`).
- When a practice notebook is active the remembered-method shortcut is skipped (`frontend/src/app/page.tsx:420-427`).
- New scores typed in this mode are saved as a `TeacherPracticeResult` (`source: 'chat'`), not as a `QuestionnaireResult` (`frontend/src/app/page.tsx:776-790`).
- Deep link from the repertoire: `/?start=<id>&practice_notebook_id=..&practice_result_id=..`; the page re-reads the scores from the owner API (`frontend/src/app/page.tsx:676-710`).
- In the chat, the same choice is in the Options menu: `NotebookContextSelector` (student|teacher|practice|none) plus `PracticeNotebookPicker`, shown only if `isTeacherUser` (`frontend/src/components/qsa/GuidedChatInterface.tsx:376-379`, `:1793-1796`; `NotebookContextSelector.tsx:19`; `PracticeNotebookPicker.tsx`).
- Each turn sends `notebook_context` and `practice_notebook_id` (`GuidedChatInterface.tsx:1538-1539`). The server re-checks role and ownership every turn (`backend/practice_notebooks.py` `requested_practice_notebook`; `backend/chat_preparation.py:97-103`). The prompt gets a `[SIMULATION]` notice and the notebook as `[PROFILE]` (`backend/practice_notebooks.py:1-14`, `:43-48`). Score-reading skills read the notebook's results, never the teacher's own (`backend/skills/handlers.py:79-100`).

**View-as (B).** A real admin can act as `studente.demo`, `studente.demo2`, `studente.demo3`, `ricercatore.demo`, `docente.demo` (`backend/auth.py:161-169`; mirrored in `frontend/src/lib/auth.ts:35-43`).
- Activated from the admin panel "role preview" (`frontend/src/components/admin/RolePreviewPanel.tsx`, opens `/?view_as=<username>` in a new tab), stored in `sessionStorage` (`frontend/src/lib/auth.ts:25`, `:45-65`).
- Every `/api` fetch then carries `X-View-As` (`frontend/src/components/layout/ViewAsFetchPatch.tsx:14-35`; `frontend/src/lib/auth.ts:76-92`). The backend honours it only if the real identity `is_admin` (`backend/auth.py:185-194`), in `get_current_user` and `get_identity_view_as` (`:197-210`).
- Data created in this mode is stored under the demo username: "restano in DB sotto questi username" (`backend/auth.py:158-160`). So a view-as session runs the ordinary student flow and saves ordinary `QuestionnaireResult` rows as `studente.demo*`.
- Non-admin teachers cannot use it (`backend/auth.py:188`; `frontend/src/lib/auth.ts:136-137` clears a leftover override).

## 2. Unscored guided tools

Instruments flagged `agentOnly` (no items, chat only): `SAVICKAS`, `EVENTO_STUDIO`, `EVENTO_PROFESSIONALE`, `OBIETTIVO_STUDIO`, `OBIETTIVO_DOCENZA`, `IDEA` (`frontend/src/lib/questionnaires.ts:172-241`). Dynamic catalog instruments are `agentOnly` when `tool_category` is not `assessment` or `item_count === 0` (`:297-308`).

- **No test-student screen.** For `agentOnly` tools `prepareInstrument` jumps straight to `startAgentOnlyQuestionnaire` (`frontend/src/app/page.tsx:407-409`), skipping `method-select`, which is the only screen that lists practice students and profiles (`InputMethodSelector.tsx:310`).
- **What is offered instead.** Only the in-chat Options menu: `NotebookContextSelector` + `PracticeNotebookPicker` (`GuidedChatInterface.tsx:1793-1796`). It exists in every `GuidedChatInterface`, so it is also reachable here, but only after the session has started. The Compass (`/bussola`) offers only "default" and "practice" (`frontend/src/app/bussola/page.tsx:381`; server side `backend/routes/orientation.py:224`, `:272`). The practice repertoire cannot hold profiles for these tools (`PRACTICE_RESULT_TYPES`, see §1).
- **What the start does with a teacher in practice mode.** `startAgentOnlyQuestionnaire` has no practice branch. It POSTs `/api/questionnaire-result` with `scores: {}` (`frontend/src/app/page.tsx:349-372`). The route saves a `QuestionnaireResult` under the caller's username (`backend/routes/survey.py:250-269`; model `backend/models.py:305-322`). In practice mode the caller is the teacher, so the row is attached to the teacher's own account, not to the practice notebook. (Scored flow, by contrast, branches to practice storage at `page.tsx:777-790`.)
- Chat turns of practice sessions are logged in `Log` under the teacher's username, tagged only in `details.practice_notebook_id` (`backend/routes/chat.py:1110-1118`; read back by `backend/routes/practice_notebooks.py:259-272`).

## 3. How students join a class; is there a test class?

**Model.** `StudentGroup` (class, `code` GR-XXXXXX, `owner_username`) (`backend/models.py:1397-1424`); `GroupMembership` (`group_id`, `username`, `joined_via`, comment lists `web | telegram | teacher | pairing`) (`backend/models.py:1478-1487`).

**Create a class.** `POST /admin/groups`, plan-manager role (`backend/routes/groups.py:583-614`).

**Join paths (all found writers of `GroupMembership`).**
1. **Web invite link / code.** Teacher copies `/gruppo?g=<code>` (`frontend/src/components/teacher/ClassOverviewTab.tsx:375`). Opening it posts `/api/groups/join` on page load, with no confirmation click (`frontend/src/app/gruppo/page.tsx:63-82`; also `frontend/src/components/profile/MyGroupsCard.tsx:168`). Backend: `join_group` → `ensure_membership(..., "web")` (`backend/routes/groups.py:1153-1181`, `:144-160`). Public preview of name: `GET /groups/info` (`:1137-1150`). Uses `get_current_user`, so a view-as admin joins as the demo account (`backend/auth.py:197-210`).
2. **Telegram.** Link `t.me/<bot>?start=g_<code>` (`ClassOverviewTab.tsx:376`) → `ensure_membership(..., "telegram")` (`backend/telegram_state.py:986-991`).
3. **Local pairing (desktop/portable).** Teacher generates a one-time key link `/unisciti#k=<key>` (`backend/local_pairing.py:366-397`; UI `frontend/src/components/teacher/ClassPairingSection.tsx`). The student types a pseudonym at `/unisciti` (`frontend/src/app/unisciti/page.tsx`); `POST /pair` creates a `LocalStudent` plus a membership with `joined_via="pairing"`, optionally pending teacher approval (`backend/local_pairing.py:206-262`; `requires_approval` at `backend/models.py:1490-1503`).

**Not found.**
- No teacher action that adds a named student manually. `"teacher"` appears only in the `joined_via` comment (`backend/models.py:1482`); no code writes it (grep of `GroupMembership(` and `ensure_membership` callers).
- No test-class concept: no flag, type or naming rule on `StudentGroup`. The only link between practice students and classes is `TeacherPracticeNotebook.group_ids` (`backend/models.py:835-837`; endpoint `backend/routes/practice_notebooks.py:125`), used to scope which class context enters a practice prompt (`backend/models.py:822-829`) and to list notebooks per class (`:59`; UI `ClassPracticeStudents.tsx:15`). Practice notebooks are not `GroupMembership` rows and do not count as members.
- No owner check in `join_group`: the class owner opening their own invite link becomes a member (`backend/routes/groups.py:1153-1181`).

**Class listing and counts.** `members_count` = number of `GroupMembership` rows (`backend/routes/groups.py:95-96`, `:124`). Students screen: `GET /admin/groups/{id}/students` (`:907-987`).

## 4. Where test data could leak

Practice notebooks (A) are mostly isolated; view-as demo accounts (B) and the teacher's own account are not. Facts per place:

**Isolated (A).**
- Practice scores live in `teacher_practice_results`, not `questionnaire_results` (`backend/models.py:846-851`), so the class students screen, class noticing, plans, and orientation recommendations, which read `QuestionnaireResult` by membership, do not see them.
- Practice notebooks are visible only to the owner, plus read access for teachers of linked classes (`backend/models.py:822-829`; `backend/routes/practice_notebooks.py:59`).
- Practice frozen sessions are skipped in the student resume lists and class path activity (`frontend/src/components/profile/PersonalAreaHome.tsx:56`; `frontend/src/components/profile/ClassPathHeroList.tsx:60`; `backend/path_activity.py:93`).

**Not isolated.**
- **View-as demo accounts (B) have no filter.** `VIEW_AS_DEMO_ACCOUNTS` is referenced only in `backend/auth.py`, `chatgpt_connections.py:105`, `class_api_sharing.py:54`, `personal_api.py:134,164,217` and `routes/personal_api.py:97`, all about personal-API/ChatGPT sharing. No class, statistics, export or orientation code excludes these usernames (grep of `VIEW_AS_DEMO_ACCOUNTS`/`.demo` in `backend/`). An admin who opens an invite link or Telegram invite while viewing as `studente.demo` creates a real membership (`backend/routes/groups.py:1153-1181`), and from then the demo account is counted and listed:
  - `members_count` (`backend/routes/groups.py:95-96`);
  - students screen with all its results (`:907-987`);
  - class noticing results (`backend/class_noticing.py:35-37`);
  - class council members (`backend/class_council.py:21-25`);
  - plan student list (`backend/routes/administration_plans.py:655-661`);
  - shared goals (`backend/routes/goals.py:305`), meetings and attendance (`backend/routes/class_meetings.py:164,280`), assignments (`backend/routes/assignment_work.py:231,241`), path templates (`backend/path_templates.py:201`);
  - orientation recommendation member list (`backend/routes/orientation_recommendation.py:60-66`, `:104-127`).
- **Teacher/admin own account.** Unscored tools started in practice mode save an empty-score `QuestionnaireResult` under the teacher's username (see §2). A teacher who is also a member of a class (via the owner-can-join gap, §3) would show it in that class's results and plan lists.
- **Practice chat logs are in the shared `Log` table**, under the teacher's username, distinguished only by `details.practice_notebook_id` (`backend/routes/chat.py:1110-1118`). The admin log filters, stats and exports (`backend/routes/admin.py:133-223`, `:543`, `:1061`) have no practice filter (no `practice` match in `backend/routes/admin.py`, `backend/benchmark_service.py` or `backend/prompt_audit.py`). Cost, usage and chat-log statistics therefore include practice turns.
- **Research/validation data.** `ValidationResponse` and its CSV export (`backend/routes/survey.py:452-475`) read their own table; I did not find any path writing practice data there.
- **Orientation advice.** The teacher-facing recommendations read only `QuestionnaireResult` joined to plans of the class (`backend/orientation_recommendation.py:82-85`), so practice scores are not used; demo-account results are (see above). The Compass in practice mode reads the notebook and its instrument list, never scores (`backend/practice_notebooks.py:98-126`).

## 5. Colour usage by role (today)

- **Palette is not per role.** `docs/design.md` sets one identity for the whole app: brand is petrol (teal), via `indigo-*` remapped in `@theme` (`docs/design.md:28-30`, `:43-62`; `frontend/src/app/globals.css:62`); `ochre` marks movement/entry CTAs (`docs/design.md:66-77`; `globals.css:77`, `--color-move` `:118-119`); `amber` is warning only (`docs/design.md:79`, `:96`); `emerald` is success only (`docs/design.md:97`, `:117-125`).
- **"Section is not recognised by its own tint."** The teacher Palestra is petrol like the rest of the teacher area, with an ochre CTA; simulation is signalled by a badge and shield icon, not a colour (`docs/design.md:121-124`; `PracticeGymSection.tsx:26-31`, `:55-62`).
- **No role or area switch in CSS.** `globals.css` has no teacher/student scoping; the only area-specific rule is dark-mode card gradients for the teacher area (`globals.css:824-834`).
- **Measured token use** (grep of `bg|text|border|from|to|via-<family>`): teacher components use `brand` 98, `success` 47, `warning` 29, `info` 8, `move` 4; student profile components use `brand` 27, `success` 16, `warning` 10, `move` 4. `components/qsa` (student chat) still uses raw Tailwind families: `indigo` 83, `teal` 79, `amber` 30, `rose` 19, `green` 9, `sky` 6.
- **Green is not the student colour in the docs.** The only green-ish brand-level usages are `emerald` for success and per-instrument chips such as SAVICKAS `bg-emerald-500` (`frontend/src/lib/questionnaires.ts:179`). Cream yellow and light blue (celestino) have no tokens (no `cream`/`celest` in `globals.css` or `docs/design.md`).
- **Practice mode has no visual marker in the chat besides the Options label** (`GuidedChatInterface.tsx:1793-1796`); the view-as banner is `warning` amber (`frontend/src/components/layout/RolePreviewBanner.tsx:30`).
