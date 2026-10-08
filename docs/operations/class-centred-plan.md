# Class-centred CounselorBot — plan (epic #87)

Status: **approved decisions, ready for slicing** (2026-10-08). Child issues:
#84 (per-class tools and counselors), #85 (class path), #86 (class forum).
Priority over #57–#60, #82, #83.

The problem: students meet the whole catalog (7 questionnaires, 6 guided
chats, Idea, Bussola, Assistant, 17 personal-area links, 26 counselors) with no
frame. The fix: the **class** becomes the frame. The teacher decides what the
class sees (#84), in which order (#85), and the class has one place to talk
with the teacher (#86).

UI structure in section 8 is the ASCII prototype required by the project rules:
approve it before any UI code.

---

## 1. Decisions (settled with the user, 2026-10-08)

21 approved decisions (decisions 1–20 approved 2026-10-08; decision 21 approved 2026-10-08).

| # | Topic | Decision |
|---|---|---|
| 1 | What is toggleable | Chat tools (questionnaires, guided chats incl. dynamic ones, Idea, significant-event paths, Obiettivo) + personal-area tools (Tavolo, Goals, Actions, Timeline, Portfolio, pQBL, Flashcards, Cards, Comparison) + Bussola and Assistant. **Always on**: Notebook (taccuino), Compilazioni, Classes, Assignments. |
| 2 | Student in several classes | **Union**: a tool is visible if at least one of the student's active classes enables it. |
| 3 | Student with no class | Everything as today. |
| 4 | Defaults (new classes and existing classes at rollout) | Everything enabled: no visible change until the teacher acts. |
| 5 | Precedence and editors | Admin-disabled always wins; the teacher can only restrict within what the admin enables. Owner, co-teachers (`GroupShare`) and admins can edit. Teachers, researchers and admins are never filtered when they use the app. |
| 6 | Student's counselor gets disabled | The teacher may set a class **default counselor**; otherwise the next start opens the selector showing only allowed counselors. |
| 7 | Student's private counselors (personal API) | Always available, never filtered by the class. |
| 8 | Data produced with a tool later disabled | Stays readable; no new sessions start and frozen sessions of that tool cannot be resumed. |
| 9 | Step order in a class path | Chosen per path by the teacher: **recommended** (default, skippable) or **strict**. |
| 10 | Step completion | Automatic where detectable; otherwise the student marks it done. The teacher can mark or unmark any step. |
| 11 | Work done before publication | Counts only if done **after** the path was published. |
| 12 | Paths per class | Several published paths per class; optional due date per step. |
| 13 | Where the student sees paths | Home and personal area, above the catalog; the catalog stays below, collapsed. |
| 14 | Forum structure | Teacher opens discussions, students reply. Per-class toggle (default **off**) lets students open discussions. |
| 15 | Moderation powers | Hide/restore with reason, lock, pin, mute a student; optional per-class pre-approval (default off). All actions logged. Authors can delete their own messages. |
| 16 | Identity in the forum | Profile display name. |
| 17 | Notifications (v1) | In-app badge only. |
| 18 | Privacy | No forum content to any LLM provider, **local ones included**; out of research exports and PDFs. A deactivated class keeps its forum as a read-only archive. |
| 19 | Link discussion → path step / assignment | Yes, optional, in a later slice. |
| 20 | Message content | Text only (reduced Markdown), no attachments in v1. |
| 21 | Admin override and lock ("edit + lock") | The administrator can edit the settings of **any** class (tools, counselors, forum options) from an admin page listing all classes (search/filter by teacher, institution, class name) or via direct class routes. Admin can **lock** individual items for a class (a tool, a counselor, a forum option): the item is forced on or off and teachers (owner and co-teachers) cannot change it. Admin can unlock. Every change by admin and every lock/unlock is written to an append-only audit log (`class_settings_audit_log`, who, what, old→new, when), visible to owner, co-teachers and admins. Teacher UI shows "changed by the administrator" / "locked by the administrator" on affected items (locked items not editable, with explanation). Precedence: admin global disable (`Instrument.is_active` / `Counselor.is_active`) still wins over everything; a per-class admin lock forced ON is only possible for items enabled at platform level. Minimal lock scope: locks apply only to class settings items (not to individual class path steps or forum topics/posts, where admins already have native full role editing/moderation powers). |

---

## 2. Current-state audit (origin/main 459a632)

**Classes.** `StudentGroup` (owner, `is_active`, class context fields),
`GroupMembership` (username, `joined_via`), `GroupShare` (co-teachers, lowercase
username). `routes/groups.py`: `_visible_group_query` / `_require_visible_group`
give admin all groups and teachers owned + shared ones; co-teachers can already
edit a class (`PUT /admin/groups/{id}`), only the owner deletes it. Students list
memberships via `GET /user/groups`. No per-class setting beyond class context.
Admin listing endpoint `GET /admin/groups` currently returns all groups for admins
but lacks query parameters for search and filtering (by teacher/owner, institution,
or class name).

**Assignments.** `TeacherAssignment` (group or single recipient, catalog
snapshot of `goal | strategy | reading`), `AssignmentLearningSettings`
(`proposal | activity`, due date), `AssignmentWork` (private refs + shared
snapshot + feedback), `AssignmentRecipient`. Group-wide deliveries follow current
membership. Pattern to reuse: server-built snapshot, revision checks,
`request_id` idempotency, membership checked server-side every read.

**Tool catalog (C1–C4, PR #68).** `Instrument` rows carry `is_active`,
`tool_category` (`assessment | guided`), `target_audience` (`student | teacher`),
`icon`, `color_theme`, `description_i18n`. `GET /instruments` hides inactive rows
from non-admins. The frontend (`lib/tool-catalog.ts`:
`resolveActiveStudentTools`, `getDynamicToolCategories`,
`isStartableQuestionnaireId`) filters inactive and teacher-only tools.
Personal-area tools are a static list in `lib/personal-area.ts` (5 groups,
17 slugs) with no backend registry.

**Counselors (M2.x).** `Counselor` has `is_active`, `owner_username` (private
counselors via personal API), `questionnaire_types` scope
(`counselor_scope.suits`), categories, covers. `GET /counselors` returns visible
active counselors and marks `suitable`; it never removes unsuitable ones. The
account default lives in `account_preferences.counselor_id`.

**Server-side enforcement gap (registered as suspected bug in the journal).**
`POST /chat` and `/chat/stream` resolve the counselor with
`personal_api.require_visible_counselor` and the step by id, but check neither
`Instrument.is_active` / `target_audience` nor counselor suitability. Today's
catalog gating is therefore UI-only. Slice S2 closes it as part of the class
guard.

**Other entry points that start or write tool work.** Questionnaire submission
(`POST /questionnaire-result`, `/instruments/{code}/score`), frozen-session
resume (`GET /session/frozen/...`), Bussola (`POST /orientation/sessions` and
its message route, tool recommendations from the shared catalog), Assistant
(`/site-chat`), Tavolo (`POST /tavolo` and AI help routes), goals
(`POST /user/goals`), timeline/actions (`PUT /user/timeline`), Portfolio, pQBL,
flashcards, Telegram bot (`telegram_state.ALL_QUESTIONNAIRES`).

**Completion signals that exist today.** `QuestionnaireResult.submitted_at`
(scored questionnaires); `OrientationSession.completed_at`; `Log` actions
`qsa_completed`, `pqbl_session_completed`; `Tavolo`, `PersonalGoal`,
`IdeaMapRevision` rows with timestamps. **Missing**: a server-side marker that a
guided chat reached its final step (the frontend only deletes the frozen
snapshot).

**Teacher area.** `/docente/classi` renders `GroupsPanel`: one page of
collapsible class cards (editor, students, `GroupAssignments`). No per-class
detail route. Shared hooks: `useTeacherAccessState`, `TeacherAreaPage`,
`TeacherAreaHeader`.

**Schema migrations.** No Alembic: `Base.metadata.create_all` at startup plus
idempotent `ALTER TABLE` blocks in `main.py`. New tables only need models;
new columns on existing tables need an `ALTER` entry.

**Audit mechanisms.** The codebase has no generic audit log table (`PromptRevision`
records append-only prompt edits; `Log` records chat/AI sessions and user events).
Class settings modifications, admin overrides, and lock/unlock events therefore
use a dedicated append-only table `class_settings_audit_log`.

**Forum.** Nothing exists. Telegram groups live outside the platform.

---

## 3. Domain vocabulary (to add to CONTEXT.md in the slices)

- **Class settings (impostazioni della classe)**: per-class choice of enabled
  tools and counselors, default counselor, forum options.
- **Admin lock (blocco amministrativo)**: a per-class lock set by an administrator
  on a specific tool, counselor, or forum option. Forces the item ON or OFF and
  prevents teachers from modifying it until unlocked.
- **Class settings audit log (registro di controllo impostazioni)**: append-only
  history of every change to class settings made by administrators or teachers,
  and every lock/unlock event. Visible to class owner, co-teachers, and administrators.
- **Tool key**: stable identifier of a toggleable tool: an `Instrument.code`
  (`QSA`, `IDEA`, any dynamic code) or a personal-tool key (`tavolo`, `goals`,
  `actions`, `timeline`, `portfolio`, `pqbl`, `flashcards`, `cards`,
  `comparison`, `bussola`, `assistant`, `forum`).
- **Resolved access**: the set of tool keys and counselor ids a given user may
  use now, computed from admin settings + the user's active classes.
- **Class path (percorso di classe)**: an ordered list of tool steps a teacher
  publishes for a class. EN *class path*, ES *itinerario de clase*, FR *parcours
  de classe*, DE *Klassenpfad*, SV *klassväg* (to verify with the translators).
  **Not** the same as the existing "guided path" (`GuidedStep` rows inside one
  instrument) nor the «Percorso dell'obiettivo» PDF: the UI must never call it
  just "percorso guidato".
- **Class forum (forum della classe)**: discussions (`topic`) with replies
  (`post`) visible to the class members and its teachers.

---

## 4. Data model

All tables additive; no change to existing rows. Union and defaults are encoded
as **deny-lists**, so a tool or counselor added later by the admin is enabled for
every class automatically (decision 4).

### 4.1 Class settings (#84)

```
class_settings                       one row per group, created lazily
  group_id             PK, = student_groups.id
  disabled_tool_keys   JSON list[str]   default []
  disabled_counselor_ids JSON list[int] default []
  default_counselor_id int NULL         must be enabled and institutional
  forum_students_can_open BOOL default false
  forum_premoderation     BOOL default false
  locked_tool_keys     JSON dict[str, dict] default {}  # {key: {"enabled": bool, "locked_by": str, "locked_at": str}}
  locked_counselor_ids JSON dict[str, dict] default {}  # {id_str: {"enabled": bool, "locked_by": str, "locked_at": str}}
  locked_forum_options JSON dict[str, dict] default {}  # {option: {"value": bool, "locked_by": str, "locked_at": str}}
  revision             INT default 1    optimistic concurrency (409)
  updated_by           str, updated_at
```

Personal-tool registry: `backend/class_tools.py` (new) holds
`PERSONAL_TOOL_KEYS` with category and i18n label keys, plus
`ALWAYS_ON = {notebook, results, classes, assignments}` that can never be
disabled. Instrument keys come from the `instruments` table (student audience
only; `OBIETTIVO_DOCENZA` and teacher-only tools are not listed).

To prevent future database migrations, slice S1 (#88) reserves the lock columns
(`locked_tool_keys`, `locked_counselor_ids`, `locked_forum_options`) in the
`class_settings` model definition from day one.

### 4.2 Class path (#85)

```
class_paths
  id, group_id (idx), title, description
  mode            'recommended' | 'strict'       default 'recommended'
  status          'draft' | 'published' | 'archived'
  published_at    first publication time (decision 11 boundary; kept on archive)
  created_by, revision, created_at, updated_at, archived_at

class_path_steps
  id, path_id (idx), position INT, tool_key, title (optional override),
  instructions TEXT, due_date DATE NULL, removed_at NULL (soft remove keeps progress)

class_path_progress                    only explicit marks are stored
  id, step_id (idx), username (idx)
  state   'done' | 'not_done'
  source  'student' | 'teacher'
  created_at, actor_username
  UNIQUE(step_id, username, source)
```

Automatic completion is **computed on read**, never stored, from evidence
created by the student after `published_at` (decision 11):

| Tool kind | Evidence |
|---|---|
| Scored questionnaire (`tool_category=assessment`) | `QuestionnaireResult` of that type |
| Guided chat (SAVICKAS, EVENTO_*, OBIETTIVO_STUDIO, dynamic `guided`) | new `Log(action="guided_chat_completed", questionnaire_type)` written server-side when a turn on the instrument's last `GuidedStep` completes |
| IDEA | `IdeaMapRevision` whose map meets `idea_map`'s existing "focused" rule |
| Bussola | `OrientationSession.completed_at` |
| Tavolo | `Tavolo` saved |
| Goals | `PersonalGoal` created |
| pQBL | `Log(action="pqbl_session_completed")` |
| Actions, Timeline, Portfolio, Flashcards, Cards, Comparison, Assistant | none: student marks done |

Resolution per (step, student): teacher mark > student mark > automatic
evidence > not done. Students can self-mark only steps without automatic
evidence. In **strict** mode a step counts as done only if all earlier
(non-removed) steps are done; later steps render locked. Strict mode does not
change tool enablement: a locked step's tool stays reachable from the catalog if
enabled — the lock is about the path, not access.

A step whose tool is later disabled for the class (or by the admin) renders
"not available" and is excluded from the completion ratio.

### 4.3 Class forum (#86)

```
forum_topics
  id, group_id (idx), title, body, author_username, author_display_name (snapshot)
  status 'published' | 'pending', pinned BOOL, locked BOOL
  hidden_at, hidden_by, hidden_reason
  link_kind NULL, link_id NULL          (slice F6: 'path_step' | 'assignment')
  created_at, edited_at, last_post_at

forum_posts
  id, topic_id (idx), author_username, author_display_name (snapshot), body
  status 'published' | 'pending'
  hidden_at, hidden_by, hidden_reason
  deleted_at                             author deletion → tombstone "message deleted"
  created_at, edited_at

forum_mutes
  id, group_id, username, muted_by, reason, until NULL (= until lifted), lifted_at, created_at

forum_moderation_log                   append-only
  id, group_id, actor_username, action, target_kind, target_id, reason, created_at
  actions: hide, restore, lock, unlock, pin, unpin, mute, unmute, approve, reject,
           settings_change

forum_reads
  topic_id, username, last_read_at      PK(topic_id, username)
```

Display name: taken from the ai4auth identity at post time (decision 16) and
snapshotted, so a later rename does not rewrite history. Body ≤ 4000 chars,
title ≤ 160; rendered with the existing Markdown renderer in safe mode (no raw
HTML, no images, links `rel="nofollow noopener"`). Rate limit: 10 posts per user
per 5 minutes per class.

### 4.4 Class settings audit log (decision 21, #109)

```
class_settings_audit_log              append-only
  id             INT PK AUTOINCREMENT
  group_id       INT (idx), FK student_groups.id
  actor_username STR (idx)
  actor_role     STR ('admin' | 'teacher')
  action         STR ('setting_change' | 'lock' | 'unlock')
  target_kind    STR ('tool' | 'counselor' | 'forum_option' | 'settings_bulk')
  target_id      STR (tool key, counselor id string, or forum option name)
  old_value      JSON
  new_value      JSON
  reason         TEXT NULL
  created_at     TIMESTAMP default func.now()
```

Every modification to class settings made by administrators or teachers, as well
as every lock and unlock action performed by administrators, appends an immutable
audit row. This log is exposed to class owners, co-teachers, and platform
administrators.

---

## 5. API contracts

### 5.1 Class settings and resolved access (#84, #109)

```
GET  /teacher/groups/{group_id}/settings          owner | co-teacher | admin
→ { group_id, revision,
    tools: [{ key, kind: 'instrument'|'personal', category, label_i18n,
              admin_enabled, enabled, always_on,
              locked: bool, locked_by: str | null, locked_at: str | null,
              changed_by_admin: bool }],
    counselors: [{ id, name, avatar_url, admin_enabled, enabled,
                   locked: bool, locked_by: str | null, locked_at: str | null,
                   changed_by_admin: bool }],   institutional only
    default_counselor_id,
    forum: { students_can_open, students_can_open_locked: bool,
             premoderation, premoderation_locked: bool } }

PUT  /teacher/groups/{group_id}/settings          owner | co-teacher | admin
   { revision, disabled_tool_keys, disabled_counselor_ids,
     default_counselor_id, forum? }
→ 200 new settings | 409 revision mismatch
  | 422 item_locked_by_admin (if teacher attempts to alter a locked item:
        {"detail": "item_locked_by_admin", "item_kind": str, "item_id": str})
  | 422 unknown key, always-on key, or default counselor disabled/private
   (forum fields are accepted from slice F3 on; admins may also submit lock changes)

GET  /admin/classes                                admin only
   ?search=&owner=&institution_id=&is_active=
→ [{ id, code, name, school, school_level, institution_id, institution_name,
     owner_username, owner_display_name, co_teachers: [str], members_count,
     is_active, created_at, has_custom_settings: bool, locked_items_count: int }]

POST /admin/groups/{group_id}/settings/lock        admin only
   { target_kind: 'tool' | 'counselor' | 'forum_option', target_id: str,
     state: bool, reason?: str }
→ 200 { status: 'locked', target_kind, target_id, state, locked_by, locked_at }
  | 422 cannot lock ON platform-disabled item

POST /admin/groups/{group_id}/settings/unlock      admin only
   { target_kind: 'tool' | 'counselor' | 'forum_option', target_id: str, reason?: str }
→ 200 { status: 'unlocked', target_kind, target_id }

GET  /teacher/groups/{group_id}/settings/audit-log owner | co-teacher | admin
→ [{ id, actor_username, actor_display_name, actor_role, action,
     target_kind, target_id, old_value, new_value, reason, created_at }]

GET  /user/access                                  any authenticated user
→ { restricted: bool,                 false = no class filter (no class or staff role)
    tool_keys: [str],                 enabled tools after admin + class resolution
    counselor_ids: [int] | null,      null = all visible institutional counselors
    default_counselor_id: int | null,
    class_ids: [int] }                active classes that produced the result
```

Resolution (`backend/class_access.py`, one function used by every guard):

1. **Admin platform layer**: instrument `is_active` and student audience;
   counselor `is_active`. Admin-disabled globally → never enabled (decision 5,
   decision 21). An admin per-class lock forced ON cannot override platform-level
   disable.
2. **Staff bypass**: staff (teacher, researcher, admin roles) or no active
   membership in an active class → admin platform layer only (`restricted=false`,
   decisions 3 and 5).
3. **Class layer — Admin lock**: if an item is locked in `class_settings`:
   - locked ON: forced enabled for that class (subject to rule 1).
   - locked OFF: forced disabled for that class (overrides teacher choice).
4. **Class layer — Teacher choice**: if not locked: follows
   `disabled_tool_keys` and `disabled_counselor_ids` configured for the class.
5. **Multi-class union for students**: a tool/counselor is enabled if **any**
   active class of the student enables it (decision 2). Private counselors owned
   by the user are always added (decision 7).
6. **Default counselor**: picked from the most recently joined active class
   whose default is in the resolved set; else `null` (decision 6).

Guard: `class_access.require_tool(db, identity, tool_key)` → 403
`{"detail": "tool_disabled_for_class", "tool": key}` (and
`tool_unavailable` for admin-disabled). Called at every **start or write**
entry point listed in section 2; reads of existing data are never blocked
(decision 8). Counselor guard: `require_counselor(...)` on chat routes and on
`PUT /user/account-preferences`.

### 5.2 Class paths (#85)

```
GET    /teacher/groups/{group_id}/paths                 list (all statuses)
POST   /teacher/groups/{group_id}/paths                 create draft {title, description, mode}
GET    /teacher/paths/{path_id}
PUT    /teacher/paths/{path_id}  {revision, title, description, mode,
                                  steps:[{id?, tool_key, title, instructions, due_date}]}
                                  order = array order; missing ids → soft-removed;
                                  tool_key must be enabled for the class (422)
POST   /teacher/paths/{path_id}/publish | /archive | /restore
GET    /teacher/paths/{path_id}/progress
→ { steps:[...], students:[{ username, display_name,
      cells:[{ step_id, state:'done'|'not_done'|'locked'|'unavailable',
               source:'auto'|'student'|'teacher'|null, at }] , done, total }] }
PUT    /teacher/paths/{path_id}/steps/{step_id}/progress/{username}
       { state: 'done'|'not_done'|'clear' }               teacher override

GET    /user/paths          published paths of the user's active classes
→ [{ id, group_name, title, mode, steps:[{ id, tool_key, title, instructions,
      due_date, state, source, start_href, can_self_mark }], next_step_id, done, total }]
POST   /user/paths/{path_id}/steps/{step_id}/done
DELETE /user/paths/{path_id}/steps/{step_id}/done        only for can_self_mark steps
```

### 5.3 Class forum (#86)

```
GET    /groups/{group_id}/forum/topics              members + staff of the class
POST   /groups/{group_id}/forum/topics              teacher; student only if students_can_open
GET    /forum/topics/{topic_id}                     topic + posts (hidden shown as placeholder;
                                                    moderators see content + reason)
POST   /forum/topics/{topic_id}/posts               member, not muted, topic not locked,
                                                    class active
PATCH  /forum/posts/{post_id}                       author edit (sets edited_at)
DELETE /forum/posts/{post_id}                       author delete → tombstone

POST   /teacher/forum/{topics|posts}/{id}/hide {reason} | /restore
POST   /teacher/forum/topics/{id}/lock | /unlock | /pin | /unpin
POST   /teacher/forum/{topics|posts}/{id}/approve | /reject     premoderation
POST   /teacher/groups/{group_id}/forum/mutes {username, until?, reason}
DELETE /teacher/groups/{group_id}/forum/mutes/{mute_id}
GET    /teacher/groups/{group_id}/forum/log

GET    /user/forum/unread    → { total, by_group: {group_id: n} }
POST   /forum/topics/{topic_id}/read
```

Permission matrix (tested in F1–F3):

| Actor | Read | Post reply | Open topic | Moderate |
|---|---|---|---|---|
| Non-member | 403 | 403 | 403 | 403 |
| Member (student) | ✓ | ✓ unless muted/locked | only if `students_can_open` | ✗ |
| Former member | 403 | 403 | 403 | ✗ |
| Owner / co-teacher | ✓ | ✓ | ✓ | ✓ |
| Admin | ✓ | ✓ | ✓ | ✓ |
| Any, class inactive | read only | 403 | 403 | log view only |

---

## 6. Privacy and safety

- **No LLM, local included** (decision 18): the forum module must not import
  `ai_service`, `chat_preparation`, RAG or Bussola context builders. A test
  asserts the import graph, and context builders (`student_context`,
  `build_context_envelope`, `journey_context`) never query forum tables.
- Forum content is excluded from research exports, admin result exports, PDFs,
  the session ledger and the RAG indexes.
- Forum is visible only to current members and the class's teachers; former
  members lose access. Posts of a student who leaves stay with their name
  snapshot; the author can delete own messages at any time before leaving.
- Class settings and paths are not personal data, but path progress is: the
  teacher sees progress only for current members of their own/shared classes,
  same rule as assignments.
- Moderation log is visible to owner, co-teachers and admins only.
- PII: forum is never sent outside the server, so no redaction path is needed;
  logs record ids, never message bodies.

---

## 7. Migration and rollout

- New tables via `create_all`; no `ALTER` on existing tables. Settings rows are created lazily on first teacher save: absence =
  everything enabled (decision 4). No data backfill.
- Slices land behind no feature flag: each is invisible until the teacher acts
  (settings, paths) or opens a discussion (forum). Exception: S2's admin-layer
  guard starts rejecting chats on **inactive or teacher-only instruments** for
  students immediately; verify on dev that no live tool used by students is
  inactive before deploying it.
- Rebuild: each backend slice needs `docker compose up -d --build`; dev
  environment (8002/3107, test DB) first, per project rule.
- Every slice updates `docs-counselorbot/funzionalita-counselorbot.md`, runs
  `make guidance-refresh` + `make guidance-check`, and commits the manifest.
  Guide text and screenshots per area are their own slices (S8, P6, F7).

---

## 8. UI structure (ASCII, approve before code)

Visual rules from `docs/design.md`: petrol for structure, **ochre only for
"where you are"** (current path step, unread marker), no decorative motion.

### 8.1 Teacher — class page with settings tab (`/docente/classi/{id}`)

The existing `/docente/classi` list keeps its cards; each card gains a
"Open class" link to a new per-class page with tabs.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ← Classes                                        3B Liceo · 24 members │
│ [ Overview ] [ Tools & counselors ] [ Class paths ] [ Forum ]          │
├──────────────────────────────────────────────────────────────────────┤
│ TOOLS                Enabled 14 / 19   [Save] (r7) [Audit history →] │
│ Students see only what is enabled here. Disabled tools keep the work  │
│ already done readable. Items locked by administrator cannot be changed.│
│                                                                      │
│ Questionnaires                         [Enable all] [Disable all]     │
│   [x] QSA      Learning strategies                                    │
│   [x] QSAr     Reduced QSA                                            │
│   [ ] ZTPI     Time perspective        🔒 Locked OFF by admin         │
│   [-] QPCS     Disabled at platform level             (not editable)  │
│ Guided chats                                                          │
│   [x] SAVICKAS   [x] Study event   [ ] Work event   [x] Study goal    │
│   [x] IDEA 🔒 Locked ON by admin   [x] <dynamic tool from admin>     │
│ Personal area                                                         │
│   [x] Tavolo ℹ️ Changed by admin  [x] Goals  [x] Actions             │
│   [x] Timeline  [x] Portfolio  [ ] pQBL  [ ] Flashcards  [ ] Cards    │
│   [ ] Comparison                                                      │
│ Orientation and help                                                  │
│   [x] Bussola  [x] Assistant                                          │
│ Always available: Notebook · Compilazioni · Classes · Assignments     │
├──────────────────────────────────────────────────────────────────────┤
│ COUNSELORS                               Enabled 6 / 26               │
│ [filter by category ▾] [search…]                                       │
│   [x] (cover) Clio     maieutic          ( ) default                  │
│   [x] (cover) Giulio   philosopher       (•) default  🔒 Locked ON    │
│   [ ] (cover) Iride    narrative                                      │
│ Students' private counselors are never affected.                      │
├──────────────────────────────────────────────────────────────────────┤
│ FORUM OPTIONS                       (appears with slice F3)           │
│   [ ] Students can open discussions                                   │
│   [ ] Approve messages before they are visible 🔒 Locked OFF by admin │
└──────────────────────────────────────────────────────────────────────┘
 Save errors: 409 → "Settings changed elsewhere — reload" (keeps draft).
              422 → "Item locked by administrator cannot be modified".
 Mobile: one column; category groups collapsible; sticky Save bar.
```

### 8.2 Teacher — class path builder (`Class paths` tab)

```
┌──────────────────────────────────────────────────────────────────────┐
│ CLASS PATHS                                         [+ New path]      │
│  ● Start of year        published · 5 steps · 12/24 done   [Open]     │
│  ○ Choosing after school draft · 3 steps                   [Open]     │
│  ▸ Archived (1)                                                       │
├──────────────────────────────────────────────────────────────────────┤
│ Edit: "Start of year"                       published  [Archive]      │
│ Title [Start of year_____________]                                    │
│ Description [________________________________]                        │
│ Order  (•) Recommended — steps can be skipped                         │
│        ( ) Strict — next step unlocks when the previous is done       │
│                                                                      │
│  #  Tool             Title / instructions            Due       Move   │
│  1  Bussola          "Where do you start?"           —        [↑][↓][×]│
│  2  QSA              "Fill in, then read with…"      10/10    [↑][↓][×]│
│  3  Guided chat QSA  —                               17/10    [↑][↓][×]│
│  4  Goals            "One study goal for October"    31/10    [↑][↓][×]│
│  5  Timeline ⚑self   "Add the milestone"             —        [↑][↓][×]│
│ [+ Add step ▾ only tools enabled for this class]                      │
│ ⚑self = no automatic detection: the student marks it done             │
│                                     [Save draft] [Publish]            │
├──────────────────────────────────────────────────────────────────────┤
│ PROGRESS                       [filter: all | late | not started]     │
│            1    2    3    4    5     done                            │
│ Anna       ✓a   ✓a   ✓a   ·    ·     3/5                             │
│ Marco      ✓a   ·    🔒    🔒    🔒    1/5    (strict mode)            │
│ Sara       ✓s   ✓t   ·    ·    ✓s    3/5                             │
│  a = automatic  s = student  t = teacher   click cell → mark/unmark   │
└──────────────────────────────────────────────────────────────────────┘
 Arrow buttons, not drag-only (keyboard). Mobile: progress as per-student
 list with "3/5" and an expandable row.
```

### 8.3 Student — class path view (home + `/profilo/percorsi`)

```
HOME (student in a class with a published path)
┌──────────────────────────────────────────────────────────────────────┐
│ YOUR CLASS PATH · 3B Liceo                                            │
│ Start of year                                     2 of 5 done ▓▓░░░   │
│  ✓ 1 Bussola                                                          │
│  ✓ 2 QSA                                                              │
│  ▶ 3 Guided chat QSA    due 17/10   [Start]          ← ochre: you are here
│  ○ 4 Goals              due 31/10                                     │
│  ○ 5 Timeline                                     [Mark as done]      │
│                                              [See all class paths →]  │
├──────────────────────────────────────────────────────────────────────┤
│ ▸ All tools (collapsed catalog, only tools enabled for your classes)  │
└──────────────────────────────────────────────────────────────────────┘

/profilo/percorsi — one card per published path, grouped by class;
strict mode shows later steps as 🔒 "unlocks after step 3";
a step whose tool is no longer available shows "not available" and is not
counted. Personal area: new link "Class paths" in the first group.
```

### 8.4 Forum and moderation

```
STUDENT  /profilo/classi/{id}/forum        TEACHER  /docente/classi/{id} → Forum tab
┌────────────────────────────────────┐   ┌────────────────────────────────────────┐
│ Forum · 3B Liceo                    │   │ Forum · 3B Liceo   [+ New discussion]   │
│ [+ New discussion] (if allowed)     │   │ Pending approval (2)  ▸                 │
│ 📌 How to read your QSA     ● 3 new │   │ 📌 How to read your QSA  12 replies      │
│    Prof. Rossi · 12 replies         │   │ 🔒 Choosing after school  closed         │
│ 🔒 Choosing after school (closed)   │   │ [Muted students (1)] [Moderation log]   │
└────────────────────────────────────┘   └────────────────────────────────────────┘

TOPIC
┌──────────────────────────────────────────────────────────────────────┐
│ How to read your QSA                                   📌 pinned      │
│ Prof. Rossi · 08/10                                                   │
│ Body text…                                                            │
├──────────────────────────────────────────────────────────────────────┤
│ Anna B. · 09/10                                     [Edit][Delete]    │
│ Reply text…                                                           │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
│ [Message hidden by the teacher]                (student view)        │
│ Marco P. · hidden: "off topic"  [Restore]     (teacher view)        │
│ teacher menu on each message: [Hide…] [Mute author…]                  │
├──────────────────────────────────────────────────────────────────────┤
│ [ reply box, text only, 4000 chars ]                     [Send]       │
│ Locked: "This discussion is closed."  Muted: "You cannot post until…" │
│ Pending: "Your message will appear after the teacher approves it."    │
└──────────────────────────────────────────────────────────────────────┘
 Header: badge with unread count on "Classes" (personal area) — no push.
 Inactive class: banner "Archive — read only", no composer.
```

### 8.5 Admin — all classes management and settings lock (`/admin` → Classes)

The administrator accesses the full directory of classes across institutions, with
search, filters, direct settings editing, per-item lock controls, and audit log access.

```
┌────────────────────────────────────────────────────────────────────────┐
│ ALL CLASSES                                  Total: 42 classes         │
│ [Search class, code, school… 🔍] [Teacher: All ▾] [Institution: All ▾] │
├────────────────────────────────────────────────────────────────────────┤
│ Class      School          Teacher       Institution   Members  Status │
│ 3B Liceo   Liceo Fermi     m.rossi       Liceo Fermi   24       active │
│   [Edit settings & locks]  [View audit log]  [Students]                │
│ 5A ITI     ITIS Da Vinci   g.bianchi     ITIS Da Vinci 28       active │
│   [Edit settings & locks]  [View audit log]  [Students]                │
│ 1C Media   IC Manzoni      l.verdi       IC Manzoni    19       active │
│   [Edit settings & locks]  [View audit log]  [Students]                │
└────────────────────────────────────────────────────────────────────────┘

ADMIN CLASS SETTINGS MODAL / DRAWER (3B Liceo)
┌────────────────────────────────────────────────────────────────────────┐
│ Settings & Locks: 3B Liceo                               [Save] (r7)   │
│ As admin, your edits override teacher defaults. Locking an item forces │
│ it ON or OFF and prevents teachers from modifying it.                  │
│                                                                        │
│ Tools                                             Lock status          │
│   [x] QSA Learning strategies                    [🔓 Lock item ▾]      │
│   [ ] ZTPI Time perspective                      [🔒 Locked OFF] [Unlock]
│   [x] IDEA                                       [🔒 Locked ON ] [Unlock]
│   [-] QPCS (Disabled globally at platform level — cannot lock ON)      │
│ Counselors                                                             │
│   [x] Giulio (•) default                         [🔒 Locked ON ] [Unlock]
│ Forum options                                                          │
│   [ ] Approve messages before visible            [🔒 Locked OFF] [Unlock]
│                                                                        │
│ Reason for audit log: [Mandated school policy 2026/27_______________] │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Test strategy

- **Backend (Postgres test DB, `backend/tests/`)**: resolver truth table
  (no class, one class, two classes union, inactive class ignored, staff
  bypass, admin-disabled wins, private counselor always in, default counselor
  pick); every guard endpoint returns 403 for a disabled tool and 200 when
  enabled; reads of existing data stay 200; settings 409/422; path completion
  per tool kind with evidence before/after `published_at`; strict ordering;
  override precedence; forum permission matrix; mute/lock/premoderation;
  moderation log append-only; import-graph test that forum code never reaches
  `ai_service`; export/PDF builders never touch forum tables.
  **Decision 21 additions**:
  - Admin all-classes listing endpoint (`GET /admin/classes` or `GET /admin/groups`)
    filters by teacher/owner, institution, and search query across name/code/school.
  - Admin can update settings of any class regardless of ownership.
  - Admin lock/unlock endpoints force an item ON or OFF and persist `locked_by`
    and `locked_at`.
  - Teacher `PUT /teacher/groups/{id}/settings` attempting to modify a locked
    item returns 422 `{"detail": "item_locked_by_admin", ...}` and does not persist;
    modifying non-locked items in the same class succeeds (200).
  - Admin unlock clears the lock, allowing teachers to modify the item again.
  - Precedence test: platform-level disable (`is_active=False`) wins over a per-class
    lock forced ON; accessing the tool still returns 403 `tool_unavailable`.
  - Audit log: every admin edit, lock, and unlock writes a `class_settings_audit_log`
    row with actor username, actor role, old and new values.
  - Audit log permissions: owner, co-teacher, and admin return 200; other users
    return 403.
- **Frontend**: unit tests for catalog filtering with `/user/access`
  (`tool-catalog.test.ts` pattern), path state rendering, forum composer
  states; browser fixtures per new page (pattern of
  `teacher-class-management-validation.md`) on dedicated 127.0.0.1 ports.
  **Decision 21 additions**:
  - Teacher Tools & counselors tab renders "locked by administrator" badges and
    disables inputs for locked items with explanatory tooltips.
  - Admin all-classes page renders class filters, settings editor, and lock toggle
    controls.
- **Gates per slice**: `npx tsc --noEmit`, `npm test`, `npm run i18n:check`
  (6 languages), backend tests touched, `make guidance-refresh` +
  `make guidance-check`.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| A guard is missed on some entry point → disabled tool still reachable | Single resolver + guard; S2 test enumerates the entry points; slices S4/S5/S7 each list theirs. |
| Students lose a tool mid-session | Decision 8: reads stay; frozen resume blocked with a clear message naming the class setting. |
| Staff detection wrong → teacher sees filtered app | Staff bypass tested on role markers from `auth.py`. |
| "Class path" confused with the instrument's guided path | Vocabulary rule in §3; i18n review in P6. |
| Guided-chat completion marker misfires (e.g. on resumed sessions) | Written only by the server on the last step's completed turn; idempotent per session; student/teacher marks override. |
| Forum used for harassment between minors | Teacher moderation + mute + premoderation option + log; teacher notified via badge. No anonymous posting. |
| Forum content leaks to LLMs through future features | Import-graph test fails the build. |
| Concurrent teacher edits (co-teachers) | `revision` + 409 on settings and paths. |
| Teacher confused when unable to toggle a locked setting | Clear badge "Locked by administrator" with tooltip and explanation; API returns 422 with machine-readable item details instead of silent failure. |
| Conflict between per-class lock ON and platform-level disable | Admin UI displays warning if tool is globally inactive; resolution engine strictly enforces platform `is_active=False` priority. |
| Audit log table bloat | Append-only table indexed by `group_id` and `created_at`; writes occur only on manual settings saves and lock/unlock operations (low volume). |
| Scope creep from notifications/Telegram | v1 badge only (decision 17); Telegram is a separate future issue. |

---

## 11. Slices

Issues under milestone **"Class-centred CounselorBot (epic #87)"**, label
`priority: high`, board 5. Each slice = one PR with its own tests and docs.
Order and dependencies are in the issues and in the epic comment on #87.

| Slice | Issue | Title | Blocked by |
|---|---|---|---|
| S1 | #88 | feat: class settings storage and teacher Tools tab for chat instruments | — |
| S2 | #89 | feat: resolved class access and server-side guard for chat instruments | #88 |
| S3 | #90 | feat: student catalog and entry points filtered by class access | #89 |
| S4 | #91 | feat: per-class toggles for personal-area tools | #89 |
| S5 | #92 | feat: per-class toggles for Bussola and Assistant; Bussola recommends only enabled tools | #89 |
| S6 | #93 | feat: per-class counselor enablement and class default counselor | #89 |
| S7 | #94 | feat: Telegram bot respects class tool access | #89 |
| S8 | #109 | feat: admin class settings page with lock/unlock and audit log | #88, #89 |
| S9 | #95 | docs: guide sections and screenshots for class settings | #90, #91, #92, #93, #109 |
| P1 | #96 | feat: class path model and teacher builder (drafts) | #88 |
| P2 | #97 | feat: publish class paths and student path page with self-marking | #96, #89 |
| P3 | #98 | feat: automatic step completion and strict mode for class paths | #97 |
| P4 | #99 | feat: teacher progress view and overrides for class paths | #98 |
| P5 | #100 | feat: class path first on home and personal area, catalog collapsed below | #97, #90 |
| P6 | #101 | docs: guide sections and screenshots for class paths | #99, #100 |
| F1 | #102 | feat: class forum core (teacher discussions, member replies, permissions) | #88 |
| F2 | #103 | feat: forum moderation: hide/restore, lock, pin, author edit/delete, log | #102 |
| F3 | #104 | feat: forum mute, pre-approval and students-can-open option | #103, #89 |
| F4 | #105 | feat: in-app unread badge for the class forum | #102 |
| F5 | #106 | feat: link a forum discussion to a class path step or assignment | #102, #97 |
| F6 | #107 | docs: guide sections and screenshots for the class forum | #103, #104, #105 |

### Parallel lanes

• Start: S1 (#88) alone — every lane needs the settings table, registry
  and per-class page shell. S1 reserves lock columns in `class_settings`
  to avoid later schema migrations.
• After S1, three independent lanes:
  • Access: S2 (#89), then S3 (#90), S4 (#91), S5 (#92), S6 (#93), S7 (#94),
    and S8 (#109) in parallel. S4, S5, S6 all append to `class_tools` and to the
    Tools & counselors tab: run them in parallel only with a rebase-on-merge
    discipline, or sequence S4 → S6 → S5 to avoid conflicts. S3 and S7 touch
    separate files (frontend catalog / Telegram) and are safe in parallel.
    S8 (#109) adds admin all-classes management, lock/unlock controls, and the
    audit log.
  • Paths: P1 (#96) right after S1; P2 (#97) needs S2; then P3 → P4;
    P5 (#100) after P2 and S3 (both edit home).
  • Forum: F1 (#102), then F2 (#103) and F4 (#105) in parallel; F3 (#104)
    after F2 and S2; F5 (#106) after P2.
• Docs slices close each lane: S9 (#95), P6 (#101), F6 (#107).
