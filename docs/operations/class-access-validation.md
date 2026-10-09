# Class access S2 (#89)

Scope: `backend/class_access.py` (resolver + guards), `GET /user/access`, and
the guard on start/write entry points. Frontend change limited to the request
contract (QSA upload and memory events send the profile-preview headers via
`apiFetch`): the student catalog reads `/user/access` from #90; counselor
fields are filled by #93 (see "Counselors (#93)" below).

## Rules

1. **Admin layer.** An instrument with `is_active=false` → 403
   `{"detail": "tool_unavailable", "tool": "<CODE>"}` for everyone, platform
   admins included (decision 5: global disable always wins). The only exception
   is the admin sandbox preview (`preview: true` on `/chat` and `/chat/stream`,
   C4), which the routes already restrict to admins: that is where drafts are
   tested. `resolve_access` and `require_tool` therefore agree for admins too. A
   `target_audience != student` instrument → the same 403 for non-staff users.
2. **Staff bypass.** Teachers, researchers and admins (role markers of
   `auth.py`) are never filtered by classes.
3. **Class layer (students).** Active memberships in active classes only. A tool
   is enabled if at least one class enables it (admin lock in
   `locked_tool_keys` first, then `disabled_tool_keys`). Otherwise 403
   `{"detail": "tool_disabled_for_class", "tool": "<key>"}`. No active class →
   admin layer only.
4. Instrument codes match case-insensitively. Keys that are not catalog tools
   (generic chat, legacy types) pass.
5. **Chat turns are authorized from the server's own selection**
   (`require_chat_turn`). The turn's instrument is the guided step's when
   `phase` names a step, otherwise the client's `questionnaire_type`. The
   system prompt the server will actually use (`_system_prompt_key(mode, phase,
   step)`, or the `/chat/message` mode map) is checked too: its owners are the
   instruments whose default or stored guided steps use it (entry prompt or the
   step mode's follow-up prompt) plus per-instrument config keys
   (`prompt_meta_<CODE>…`, `prompt_components_<CODE>_…`,
   `prompt_guidance_<CODE>_…`). If the prompt belongs to the turn's instrument,
   the instrument guard suffices; otherwise at least one owner must be allowed.
   `prompt_generic` has no owner. An omitted, unknown or mismatched
   `questionnaire_type` can no longer reach a disabled instrument's prompt.

## Guard inventory

Guarded (start/write):

| Entry point | Instrument checked |
|---|---|
| `POST /chat`, `/chat/stream`, `/chat/message` | step or claim + owners of the selected prompt |
| `POST /questionnaire-result`, `/instruments/{code}/score` | submitted instrument |
| `GET /session/frozen/{id}` (resume) | frozen session's instrument |
| `POST /qsa/upload` | form instrument; **authenticated user required**, checked before extraction or any stored file |
| `POST /qsa/audit` | request instrument, before the completion log |
| `POST /memory/event` | event instrument and the step's instrument; **authenticated user required**; 403 when the session is recorded (result, frozen session or log) under another username; a fresh session id is started by the caller |
| Idea `POST /idea/reference`, `/idea/map/patch`, `/idea/branch`, `/idea/node`, `/idea/node/edit`, `/idea/branch/arrange`, `/idea/reopen`, `/idea/focus`, `/idea/conclude`, `/idea/sources`, `/idea/sources/search` | `IDEA` |
| OpenCode `POST /opencode/workspace` | requested instrument, before files or the agent start |
| OpenCode `POST /opencode/workspace/{key}/chat`, `/reset`, `/sync-memory` | instrument recorded when the workspace started |

Not guarded (decision 8: existing data stays readable and removable): results,
conversations, PDFs, the frozen list, freeze and delete; Idea reads
(`GET /idea/map`, `/idea/map/history`, `/idea/map/image`, `/idea/map/pdf`,
`/idea/branches`, `/idea/next-step`, `/idea/reference`, `/idea/sources`, source
PDFs), exports of an existing map (`POST /idea/map/portfolio`,
`/idea/map/notebook`) and deletions (`DELETE /idea/reference`, `/idea/branch`,
`/idea/sources/{id}`); OpenCode `abort` (stopping a running turn is always
allowed). Personal tools, Bussola, Assistant and Telegram call `require_tool`
in their own slices (#91, #92, #94): Telegram currently writes flow results
before its guarded chat turn (review N3, owned by #94).

## Counselors (#93)

`resolve_access` adds `counselor_ids` and `default_counselor_id` for restricted
students (both `null` otherwise). A counselor is allowed when it is active and
institutional and at least one active class enables it (admin lock in
`locked_counselor_ids`, keyed by the id as a string, first; then
`disabled_counselor_ids`), plus the student's own active private counselors.
The default is the one of the most recently joined class whose default is
allowed. `require_counselor` refuses other counselors on `POST /chat` and
`/chat/stream` with 403 `{"detail": "counselor_disabled_for_class",
"counselor_id": <id>}`; `GET /counselors` (and `/counselors/public`, recommend,
search) list only allowed counselors; `PUT /user/account-preferences` answers
422, and `GET` substitutes the class default (or `counselor_ready: false`) when
the stored counselor is not allowed, without overwriting it. Compass
(`/orientation/sessions`) and Assistant (`/site-chat`) take the counselor
selected by the client and are not counselor-guarded here; their class toggles
belong to #92. Tests: `backend/tests/test_class_counselors.py`; browser
fixtures `frontend/tests/class-settings.test.mjs` (teacher section) and
`frontend/tests/student-class-counselors.test.mjs` (resume fallback, selector).

## Pre-deploy check (mandatory)

From this release the admin layer is enforced immediately for every student,
and for admins outside the sandbox. On the dev environment, before the Docker
rebuild, confirm that no instrument in use is inactive or teacher-only.
Read-only (a single `WITH … SELECT`):

```sql
WITH staff AS (
    SELECT owner_username AS username FROM student_groups
    UNION SELECT shared_with_username FROM group_shares
    UNION SELECT ext_username FROM research_contacts WHERE ext_username IS NOT NULL
    UNION SELECT created_by_username FROM administration_plans WHERE created_by_username IS NOT NULL
), recent_use AS (
    SELECT questionnaire_type AS code, username, 'result' AS source
    FROM questionnaire_results WHERE submitted_at > now() - interval '90 days'
    UNION ALL
    SELECT questionnaire_type, username, 'guided'
    FROM logs WHERE questionnaire_type IS NOT NULL AND timestamp > now() - interval '90 days'
)
SELECT i.code, i.is_active, i.target_audience,
       COUNT(DISTINCT u.username) FILTER (WHERE COALESCE(u.username, '') <> '') AS student_users,
       COUNT(u.code) FILTER (WHERE COALESCE(u.username, '') = '') AS anonymous_uses,
       COUNT(u.code) FILTER (WHERE u.source = 'guided') AS guided_uses
FROM instruments i
LEFT JOIN recent_use u
       ON lower(u.code) = lower(i.code)
      AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.username = u.username)
WHERE NOT i.is_active OR i.target_audience <> 'student'
GROUP BY 1, 2, 3 ORDER BY 1
```

- `student_users`: distinct non-staff usernames with a submission or a guided
  conversation log in the last 90 days.
- `anonymous_uses`: submissions or logs without a username (anonymous research
  flows): the guard returns `tool_unavailable` for them as well.
- `guided_uses`: rows coming from guided conversation logs (instruments with
  steps but no stored submission).
- Staff is approximated from the database (class owners, co-teachers, synced
  research contacts including admins, plan creators): ai4auth groups are not
  stored. A staff account missing from those tables is counted as a student,
  which errs on the safe side.

Any row with `student_users > 0` or `anonymous_uses > 0` that should stay usable
must be reactivated (or set to student audience) by an admin before deploying.
Guided chats without an `instruments` row are not affected.

## Isolated verification

Same runners as `class-settings-validation.md`, on this worktree's own ports:
synthetic Postgres on `127.0.0.1:18589`, backend on `8012`
(`DEV_BACKEND_PORT=8012 bash scripts/dev-class-settings-backend.sh`).

```bash
DATABASE_URL=postgresql://c2_test@127.0.0.1:18589/counselorbot_test \
  PYTHON_DOTENV_DISABLED=1 backend/.venv/bin/python -m pytest \
  backend/tests/test_class_access.py backend/tests/test_class_access_writes.py \
  -q --disable-warnings
```

## Results (2026-10-08)

- `test_class_access.py`: 27 passed on PostgreSQL 16 (resolver truth table,
  guard, every entry point 403/200, reads stay 200, `/user/access` contract).
- Related suites (smoke, sandbox, chat, notebook, account, settings and others):
  only the three failures already present on `origin/main` 22f5894 remain
  (journal `bcbcdb09`). Smoke fixtures that created instruments with the model
  default `is_active=false` now set it explicitly.
- Live API run on 8012 with a synthetic teacher, student and class: disable QSA
  → `/user/access` drops it; chat, stream (lowercase code), submission, scoring
  and resume return `tool_disabled_for_class`; QSAr, teacher submission, frozen
  list, results read and delete stay 200; re-enabling restores submission;
  deleting the class returns the student to `restricted: false`.

### Review fixes (PR #112, cross-model review)

- B1: `mode`-selected prompts (`savickas-interview`, raw `prompt_*` keys,
  `factor-qa` follow-ups) with an omitted, generic or different enabled claim →
  403 on `/chat`, `/chat/stream`, `/chat/message`; enabled and generic prompts
  stay 200.
- B2–B6 and N1/N2 are covered by `test_class_access_writes.py` and the new cases
  in `test_class_access.py` (each written failing first from the reviewer's
  reproductions).
- After merging `origin/main` b6edc29: `test_class_access.py` 61 passed, 6
  skipped (raw `prompt_*` modes do not apply to `/chat/message`);
  `test_class_access_writes.py` 30 passed. Related suites (settings, forum,
  sandbox, dynamic instruments, Idea, chat continuation/preparation, thread
  guard, Tavolo, ChatGPT): 440 passed, 1 failed = N4 sandbox mock contamination
  (passes alone). SQLite-fixture suites need a local `char_length` shim until
  N5 is fixed. `test_smoke.py`: 204 passed, 2 failed, identical to `origin/main`.
- The reviewer's 16 bypass reproductions now get 403/401 (the remaining three
  are the resolver query count, dynamic steps and the deferred Telegram N3).
- Live on 8012: anonymous `/qsa/upload`, `/memory/event` and `/user/access` →
  401, no upload stored; a generic chat passes the guard.

### Fix round 2 (PR #112 re-review B1-R, B4-R)

- Prompt variants: stored variants (`<key>__level_<level>`, legacy
  `<key>__short`) resolve to their base prompt (`prompt_variants.base_key`)
  before the owner lookup, so a raw variant selector on `/chat` or
  `/chat/stream` is guarded like its instrument prompt. A raw `prompt_*` `mode`
  with no resolvable owner (not generic, not a known mode, guided phase or step
  prompt) now fails closed for students: 403 `tool_unavailable`. Staff and the
  admin sandbox preview keep the previous behaviour. `/chat/message` maps only
  known modes and cannot select variants.
- Session binding: the first successful `/memory/event` for a fresh session id
  writes a row in the new `memory_session_owners` table (`session_id` primary
  key, `username`; created by `create_all`, no change to existing tables).
  Later events from another user get 403 and write nothing; the owner continues.
- Tests (written failing first): `test_class_access.py` +10,
  `test_class_access_writes.py` +1; both suites 102 passed, 6 skipped. Related
  settings/variants/context-level/chat/sandbox suites: 92 passed plus the three
  known N5 SQLite fixture errors (3 passed with the `char_length` shim); focused
  `test_smoke.py` memory/chat/Idea/OpenCode: 32 passed.

## Student view after a class change (bug 838e6852)

- Frontend: `fetchUserAccess` (`frontend/src/lib/user-access.ts`) used to
  return the `sessionStorage` copy of `/user/access` for the whole browser
  session, and nothing cleared it. A tool or counselor the teacher disabled
  stayed in the student's catalog, navigation and start flows until the tab
  was closed; only the server guards refused it. It now always asks the
  server (concurrent callers share one request); the stored copy only seeds
  the first render, so each page shows the current class settings.
- Paths tab: steps whose tool the class no longer enables carry the same
  "Not available" badge students see, and the step picker uses
  `pathStepTools`, the set the server accepts on save.
- Backend: `class_paths.is_tool_available_for_class` (paths tab progress,
  student `/user/paths`, self-marks, teacher overrides) applies the
  resolver's `class_access.class_enables` instead of its own copy of the
  lock/deny-list rule.
- Unchanged by design: a student in several classes gets the union (decision
  in the module docstring), and staff are not filtered, so testing as a staff
  account shows every tool.
- Tests (written failing first where behaviour changed):
  `user-access.test.ts` revalidation, `class-paths.test.ts` step tools,
  `test_class_paths.py::test_path_availability_matches_the_class_access_resolver`.
