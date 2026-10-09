# Teacher flow: institute, class and composable class paths

Status: implementation plan; no application change or deployment. Decisions supplied
by the owner on 2026-10-09. Source baseline: `origin/main` at
`a76ab8d6fcb4bff799d264253ac652054b38b638`. Planner journal task:
`01b9c727-5a4b-48b2-9cc3-cdf2b976d58e`; goal:
`8b11f603-7086-479c-8626-47d667ba2b5c` (Teacher flow).

## 1. Outcome and settled decisions

A teacher creates an immediately active institute, enters the institute credentials
issued by competenzestrategiche.it, creates or associates a class, and composes a
class path. Students complete each step using that step's actual evidence rule.
The teacher can also create assignments outside paths. A questionnaire
administration is one object available through research and classroom views.

- The first teacher creates an institute without administrator approval. A second
  teacher selects it from the existing-institute list and explicitly self-joins,
  without an invitation or administrator step. Typically there are one or two
  teachers per institute; duplicate institutes are handled by the administrator later.
- The institute owns the external code and password verifier. Administration plans
  reference that institute; they do not own another set of credentials.
- Italian validated questionnaires are completed on competenzestrategiche.it;
  their scores are then entered in the guided chat. Other available questionnaire
  languages use the in-app runner, then explicitly enter the scores into chat.
- New questionnaire administration steps finish when valid questionnaire data are
  durably accepted into CounselorBot through guided chat or a confirmed teacher
  import matched to that student and the exact plan/administration of the step.
  An imported result does not require the student to open guided chat first.
  Link opening or ordinary runner submission alone does not qualify. A results
  deep dive is a separate optional step in the composition.
- Assignment steps reuse catalog goals, attachments and `TeacherAssignment` and
  finish on the student's explicit submission. Standalone assignments remain supported.
- Forum steps point to the exact discussion chosen by the teacher and finish when
  the student's post is published; a post pending moderation does not count.
  Other tool steps retain existing completion behavior.
- Administrator-authored path presets and CSV/API imports are future work. The
  model must preserve a place for template lineage and result provenance.
- Future imports populate the student's existing compilations/history with imported
  entries and also complete a matching questionnaire step when the teacher-confirmed
  import is valid for that student and administration. This is the owner's final
  decision of 2026-10-09, replacing the earlier guided-entry-only default.

## 2. Current state and evidence

All file:line references below refer to the baseline above, not deployed behavior.
This review used source inspection and GitHub metadata, not live application tests.

| Area | Evidence | Consequence |
|---|---|---|
| Institute creation | `backend/routes/institutions.py:48-53,153-170`; `backend/institution_access.py:15-35` | Teachers list active memberships; institute creation is currently administrator-facing. |
| Institute membership | `backend/models.py:1514-1527`; `backend/routes/institutions.py:69-114` | Reuse the membership table; make creator membership atomic with creation and add explicit second-teacher self-join from the institute directory. |
| Institute credentials | `backend/models.py:1488-1511` | Institute already owns a unique code and password verifier; external credentials are supplied by the teacher. |
| Administration association | `backend/models.py:321-344`; `backend/routes/administration_plans.py:204-243,295-331` | There is already one plan with an optional class and research contacts. Add a canonical institute reference rather than another administration model. |
| Administration validation | `backend/routes/survey.py:97-133`; `backend/routes/administration_plans.py:59-73` | Replace the legacy credential check with a shared, blocking institution-context contract. Sensitive diagnostic details remain in the local journal. |
| Plan edit round trip | `backend/schemas.py:455-473`; `backend/routes/administration_plans.py:224-243`; `frontend/src/components/admin/AdministrationPlansPanel.tsx:238-243` | The editor expects the institute reference that the serializer omits. New responses must round-trip institute identity. |
| Class association | `backend/models.py:1270`; `backend/routes/groups.py:498-503,530-532` | Keep class permissions separate from institute permissions and validate eligible institute links server-side. |
| Teacher placement | `frontend/src/lib/teacher-area.ts:3-10`; `frontend/src/app/docente/somministrazioni/page.tsx:3-7` | Classes/assignments are in classroom; orientation/administrations in research. The teacher page directly embeds the administrator panel. |
| Administration locales | `frontend/src/components/admin/AdministrationPlansPanel.tsx:10,85-87`; `backend/routes/administration_plans.py:76-78` | The form offers en/es/sv; backend locale normalization alone is not a capability check. Italian must be an explicit external mode. |
| Builder already exists | `frontend/src/components/teacher/ClassPathsTab.tsx:105-123,128-226,602-652` | Draft creation, editing and publication exist. Extend this builder instead of implementing a replacement. |
| Tool-only step shape | `backend/models.py:1786-1803`; `backend/schemas.py:1868-1885` | Steps have a required tool key without typed targets. The builder infers completion from tool category. |
| Current questionnaire completion | `backend/class_path_completion.py:107-136` | Any result of the instrument after path publication satisfies an assessment tool step; no administration or specific-step binding exists. Preserve this only for legacy tool steps. |
| Current progress/ordering | `backend/routes/class_paths.py:216-263` | Teacher marks outrank student marks and automatic evidence; unavailable steps are excluded; strict ordering applies inside the path. |
| Start link | `backend/routes/class_paths.py:56-60,706-712` | Generic instruments launch with `/?start=<KEY>`, losing specific administration/step context. |
| Score persistence | `backend/routes/survey.py:216-233,316-368`; `frontend/src/app/page.tsx:682-719` | Scoring can associate a study; manual score entry does not carry it. Chat entry can proceed after unsuccessful persistence. New typed flows require a committed server acknowledgement. |
| Questionnaire handoff | `frontend/src/components/ui/QuestionnaireLink.tsx:25-58` | Existing external/in-app guidance can be reused, but class flows must use the selected institute context. An external link is not proof of external completion. |
| Guided completion marker | `backend/class_path_completion.py:31-61`; `backend/routes/chat.py:774,965` | Last-step completion is already server-recorded and idempotent by session/instrument/user. Bind new deep-dive evidence to its result and path step. |
| Assignments | `backend/models.py:574-626`; `backend/routes/assignment_work.py:169-208` | Reuse goal snapshots, attachments, recipients and explicit submission. Private drafts and teacher feedback are distinct from submission. |
| Forum | `backend/models.py:1830-1875`; `backend/routes/forum.py:283-302` | Topic and post identifiers, authors, moderation state and timestamps support exact-thread completion. |
| Forum privacy | `backend/tests/test_forum_privacy.py:32-110`; `docs/operations/class-centred-plan.md:41` | Current tests prohibit non-forum readers. Any completion metadata seam needs a narrowly tested allowance; never permit forum bodies into AI, RAG, research exports or PDFs. |
| Migration mechanism | `backend/main.py:426-457`; `docs/operations/class-centred-plan.md:109` | Existing database changes use startup DDL and metadata creation, not Alembic. Use repeatable additive migrations and explicit backfills. |

Related documents are historical inputs: `docs/operations/class-centred-plan.md`
defines the access, ordering, override and forum privacy contracts;
`CLASS_PATH_AUDIT.md:3-38` incorrectly describes the current builder as missing;
`assegnazioni-modernizzazione-handoff.md` describes a pending visual restyle whose
surface selection remains unanswered. This plan does not activate that restyle.

GitHub checked on 2026-10-09: [PR #147](https://github.com/nugh75/counselorbot-sbs/pull/147)
is **OPEN, draft**, targeting main; its student view selector is not in the baseline.
Recheck before each affected slice. Preserve the class-specific rules for path/forum
entry even if the student chooses All tools. Do not treat #147 as merged.
[Issues #138](https://github.com/nugh75/counselorbot-sbs/issues/138),
[#139](https://github.com/nugh75/counselorbot-sbs/issues/139) and
[#140](https://github.com/nugh75/counselorbot-sbs/issues/140) overlap navigation and
administration UX; their bodies currently contain temporary-file placeholders and
no comments. They remain untouched; review concurrent delivery before implementing
these slices. This milestone owns the domain integration, not a second restyle.

## 3. Target domain model

An **Institute** is an active school/university record and the sole owner of external
questionnaire credentials. **Institute membership** permits institute management;
it is not inferred from a student notebook, a class's free-text school name or
knowledge of an external password. Creator membership is immediately valid. The
second teacher explicitly selects an active existing institute and self-joins;
that selection creates immediate membership without an invitation or admin approval.
Names alone never silently associate an account with an institute.

A **Class** has its own owner, co-teachers, current members and tool settings, and
may reference an institute. Existing classes without an institute remain usable;
institute-backed administrations require an explicit eligible institute. Institute
membership does not grant access to all that institute's classes. Class sharing
does not automatically grant credential-management privileges.

An **Administration** retains the existing `AdministrationPlan` identity, AP code,
researchers, schedule, status, instrument, locale and optional class. Research and
classroom views edit the same row with the same revision. One plan has zero or one
class in v1. An unclassed research plan may exist; attaching it requires class access
and compatible institute identity. A linked administration is not copied into a path.

A **Class path** belongs to one class. A **Path step** is an ordered typed action
with one type-specific target. A **Questionnaire result** is the saved student
profile, with provenance independent of how it is later used. **Guided entry**
records the student's explicit acceptance of a result into a guided-chat session;
it is not a claim that CounselorBot verified an external submission. A **Completion
evidence** record binds guided entry, a teacher-confirmed imported result or a guided
deep dive to the exact step. Import confirmation is its own evidence kind and never
pretends that a guided-chat session occurred.

| Step type | Required target | Completion policy |
|---|---|---|
| `questionnaire_administration` | `administration_plan_id` | Valid data accepted through guided chat or a confirmed teacher import matched to the student and this administration. |
| `guided_results_chat` | Earlier questionnaire administration step in the same path | Server-recorded final guided turn tied to that step's result. |
| `assignment` | `assignment_id` | Explicit current submission for that assignment. |
| `forum` | `topic_id` | Published qualifying reply in that exact discussion. |
| `tool` | `tool_key` | Existing automatic evidence or permitted self-mark. |

Use a discriminated input union with strict fields and typed nullable foreign keys,
not an unvalidated generic JSON payload or tool-key pseudo-types. A completion
module exposes availability, launch information and resolved progress through one
interface. Type-specific implementations keep target checks and evidence rules
local. Research and class callers use the same administration interface.

## 4. Data model and migration contract

| Entity | Planned additions/changes | Constraints and compatibility |
|---|---|---|
| Institution | Creator/audit identity and `revision`; retain code and verifier | Teacher creation inserts institute + active membership in one transaction. Server allocates a collision-safe slug. Code is external, never generated by CounselorBot. |
| InstitutionTeacher | Reuse membership and audit fields | Unique institute/user. New institutes allow up to two active teachers; preserve existing memberships above that count and flag them for admin review rather than revoking access. The second teacher self-joins through explicit directory selection; serialize capacity checks and membership insertion to prevent concurrent overfilling. |
| StudentGroup | Validate existing `institution_id`; add FK after orphan remediation | Only authorized institute members may set/change the institute; ordinary authorized class co-teachers can still edit other fields. Free-text school is display metadata. |
| AdministrationPlan | `institution_id` FK, `delivery_mode` (`external_it` or `in_app`), `revision`, readiness/reconciliation state | Class and plan institutes must agree. Research-only legacy rows may remain unlinked and marked needs-reconciliation. No duplicate credential writer. |
| ClassPathStep | `step_type`, nullable `tool_key`, administration/assignment/topic FKs, `results_step_id`, `active_from` | Exactly the required target for the declared type; referenced results step belongs to this path and precedes it. Reordering preserves IDs. Removed IDs are not reused for a different target. |
| QuestionnaireResult | `source` (`in-app` or `imported`), `capture_method`, `source_system`, optional `source_record_id`, `locale` | Source means how data reached CounselorBot; manual IT score entry is `in-app`, `capture_method=manual_scores`, `source_system=competenzestrategiche.it`. Future CSV/API ingestion uses `imported`. Student requests cannot assert imported origin. |
| QuestionnaireGuidedEntry (new) | Result FK, authenticated student, guided session, accepted timestamp; optional step FK | Unique result/student/session/step acceptance; standalone entries have no step. Scoped request idempotency also prevents duplicate results on retry. |
| ClassPathStepEvidence (new) | Step FK, username, evidence kind, result reference, guided-entry/session reference or confirmed-import/batch reference, recorded timestamp, invalidation timestamp | Guided-entry and confirmed-import evidence are distinct. Import evidence needs no chat session; it binds the matched student and exact administration. Stores linkage and timestamps, not scores or forum bodies; remains separate from explicit overrides. |
| ClassPathProgress | Keep existing marks and precedence | Retain actor/reason and history. Manual student marking is only allowed for tool types already permitting it. |
| Future path lineage | Reserve versioned template identity in the model contract | No preset tables, endpoints or editor now. Future instantiation copies a definition and resolves targets in the destination class; it must not share live class-specific references. |

Migration order follows TF1-TF4; later types add their own target column and check
branch with their slice. Introduce only types that already have API/UI/evidence
support. Do not publish unsupported types as placeholders.

1. Add columns/tables idempotently; install safe server defaults before new writes.
   Synthetic PostgreSQL tests cover empty and upgraded schemas and a second run.
2. Backfill plan institute references only from unambiguous existing institute code
   matches and compatible class links. No inference from a school name. Conflicts,
   missing institutes or mismatched classes become needs-reconciliation records;
   authorized staff resolve them through the same plan editor. Never print credentials.
3. Keep a canonical institute verifier when present. Only migrate a legacy credential
   into an empty institute credential slot after a unique, consistent mapping and
   verification of its representation. Ambiguity requires teacher re-entry; never
   select one competing value silently. Counts/IDs suffice for reports.
4. Stop legacy credential writes, scrub duplicate values after validated cutover,
   and remove duplicate schema fields/columns through an explicit reviewed migration.
   A rollback must not restore the old credential acceptance contract. Backups and
   old binaries require a separately authorized operational procedure.
5. Backfill every old step as `tool`; preserve IDs, tool keys, removed timestamps,
   published timestamps and marks. Do not reinterpret assessment tool steps as
   administrations. Set `active_from` to the original publication baseline for those
   steps. New steps added after publication use their first activation time.
6. Backfill existing results as `in-app` because they were captured inside the app;
   use `capture_method=legacy_unknown`/unknown source system when historical evidence
   is absent. Do not invent historical guided-entry acknowledgements.

Typed target identity is immutable after first activation. To change a type or
target, soft-remove the old step and create a new ID; reordering and text/due-date
editing retain identity. Existing pre-path results can be explicitly accepted into
a new guided session after activation; creation of the original result alone is
insufficient. A confirmed import after activation also qualifies for the exact
student and administration; its external assessment date need not be recent.
Result deletion removes/invalidates associated evidence. Keep legacy
tool behavior unchanged rather than retroactively resetting existing progress.

## 5. Credential and institution-context contract

The teacher enters externally issued code and password through the institute editor.
Store only the verifier on the institute; teacher reads expose code and
`credentials_configured`, never a password or hash. Replace/reset requires institute
management rights and revision checks. Avoid logging request bodies. Normalize the
code consistently, but never trim/transform the password silently.

This verifies later entries against the institute's saved verifier. It **does not**
verify issuance, validity or completion at competenzestrategiche.it. There is no API,
SSO, credential autofill or background request to that site in v1. A saved hash cannot
be recovered to display the password: the teacher distributes the external login
credentials separately. Class handoffs show the institute code and a password-entry
instruction, never generic credentials from a different institute.

Where an administration requires institution verification, code/password entry must
succeed before a result is accepted. Use an explicit verification endpoint that
returns a short-lived, server-verifiable grant scoped to authenticated user,
administration, institute and credential revision. Keep it out of URLs and persistent
browser storage. Score and guided-entry writers validate the grant; invalid/missing
credentials, stale grants and mismatched context fail before any result, validation
row or completion evidence is committed. The grant proves local verification only.
Unlinked legacy research plans retain their explicitly displayed no-institute mode;
they cannot masquerade as an institute-backed administration.

This grant is not a replacement for membership, plan status, locale, instrument,
class settings or target checks. Known but invalid context fails explicitly rather
than falling back to a standalone result. Standalone use with no administration
context keeps its existing access policy. All result-write entry points share this
contract, including manual scores, saved scoring and guided entry.

## 6. Planned API and authorization

Backend paths below omit the frontend `/api` proxy prefix. Names are proposed
contracts; reuse existing handlers and response shapes where compatible.

| Interface | Intended behavior |
|---|---|
| `GET/POST /teacher/institutions` | List manageable institutes; atomically create active institute and creator membership. Teacher role required; a researcher alone cannot create. |
| `GET /teacher/institutions/directory` | List/search active existing institutes for authenticated teachers, exposing only selection metadata and join availability, not credentials or other teachers' personal data. |
| `POST /teacher/institutions/{id}/join` | Immediately self-join the selected active institute as the authenticated teacher. No invitation, administrator step or credential requirement. Idempotent for an active member; transactional capacity checks reject a third active teacher without a partial write. |
| `GET/PUT /teacher/institutions/{id}` | Scoped metadata editor with revision; 409 preserves local draft. |
| `PUT /teacher/institutions/{id}/credentials` | Write-only code/password replacement on the institute, with revision and safe readiness response. |
| Existing class create/update routes | Validate institute existence, activity and actor eligibility when attaching/changing it; preserve class-scoped ownership/sharing rules. |
| `GET/POST /teacher/groups/{id}/administrations` | Class view of the same AdministrationPlan rows; create with class/institute context resolved server-side. |
| `GET/PUT /teacher/administrations/{id}` | Shared administration detail/edit contract with optimistic revision; owner/co-teacher class rights do not expose research-only datasets. |
| Existing `/admin/administration-plans` routes | Preserve research/admin navigation and researcher visibility; use the same canonical plan writer and reconciliation UI. Unrelated institute membership never grants research response access. |
| `POST /user/administrations/{id}/verify-institution` | Verify transient credentials against the canonical institute after access checks; issue the scoped grant without storing plaintext. |
| Existing path create/update/publish routes | Accept typed steps, validate same-class references and report safe launch descriptors; revisions cover mutations. Publish validates every active target and capability. |
| `POST /user/paths/{path}/steps/{step}/launch` | Resolve class membership, active target and path ordering; return a context-bound launch descriptor. An IT external link opening alone creates no evidence. |
| Existing `/instruments/{code}/score` | Persist a result only in a validated administration context when supplied; runner output is not yet new administration-step completion. |
| `POST /user/questionnaire-results/{id}/guided-entry` | Accept validated scores into the student's guided session and create the exact step evidence atomically; retries return the same acknowledgement. Manual entry uses the canonical result writer first/in the same transaction. |
| Existing `/chat`, `/chat/stream` | Bind final-turn completion to authenticated session/result/step context; streaming failure or cancelled turn never produces a new success marker. |
| Existing assignment work/submission and forum post routes | Keep their native permission/mutation contracts; path completion reads qualifying metadata. No alternate submission or forum content store. |
| Existing `/user/paths` and teacher progress | Return `step_type`, safe target summary, availability reason, completion source/time and safe launch descriptor. Avoid embedding private work, secrets or forum message content. |

Never trust browser-supplied username, institute ID, plan ID, imported provenance or
completion state. Validate the authenticated user, class membership, plan/step
relationship, instrument/locale, active status and target rights in every writer.
Machine-readable errors: 401 unauthenticated; 403 not authorized/invalid required
verification; 404 inaccessible target; 409 revision or target lifecycle conflict;
422 invalid target/type/scores; capability-unavailable errors preserve existing
localized behavior. Explicitly reject disabled tools on every path start/write.

Strict ordering gates launch and step-associated writes; it does not ban standalone
use of a tool, assignment or forum. Evidence created after activation can satisfy a
later step once predecessors complete, following the existing strict-path rule.
Future teacher imports are plan-level ingestion: they may populate history and
provide matching evidence while a step is locked; strict progress still waits for
predecessors, and the import never bypasses class/target availability rules.
Changing All tools/class view cannot bypass a specific path's class settings.

## 7. UI placement and ASCII structure

These structures are planning artifacts for review before UI implementation. Keep
the existing notebook-first entry, design tokens, responsive behavior and six UI
languages (it/en/es/fr/de/sv). Questionnaire availability is independently checked
per instrument/locale; six UI languages do not imply six runnable translations.

```text
TEACHER AREA
  My notebook / Practice notebooks                  (existing first entry)
  CLASSROOM
    Institutes -> Classes -> Class detail -> Paths
    Assignments                                     (standalone access)
  CATALOGS
    Goals | Strategies | Materials
  RESEARCH AND ORIENTATION
    Administrations                                 (same objects, broader view)
    Orientation

Institutes                                      [+ Create institute]
  Existing institutes [Search/select institute v] [Join selected institute]
  Second teacher: immediate self-join; no invitation or administrator step
  My institute   [Edit] [External credentials: configured/missing]
  [Classes in this institute] [+ Create class]
  Duplicate warning: administrator handles reconciliation later

Class: 3B   Institute: My institute
  Overview | Tools & counselors | Paths | Assignments | Forum
  Paths                                         [+ New path]
  Administrations for this class          [Create] [Open research view]
```

Do not add a separate global Paths catalog: a path needs its class. Keep existing
bookmarked routes and the research administration entry. Use breadcrumbs and
preselected institute/class context; show a link to setup when the institute is
missing. Integrate any class-card shortcut already delivered by #138.

```text
PATH BUILDER: Orientation for 3B
  Title [________________]  Mode [Recommended / Strict]
  1. Questionnaire administration: QSA / Italian
     Administration [AP-... existing v / Create]
     Institute [My institute]  Delivery [External questionnaire]
     Rule: guided score entry OR confirmed import for this student/administration
  2. Guided results chat (optional addition)
     Results from [step 1 v]  Rule: final guided turn completed
  3. Assignment
     Goal [catalog goal v]  Attachments [strategies/readings +]
     [Use existing whole-class assignment / Create assignment]
     Rule: student explicitly submits work
  4. Forum
     Discussion [published discussion in this class v]
     Rule: student posts in this discussion
  5. Other tool [enabled tool v]  Rule: existing automatic/self-mark
  [+ Add step: Questionnaire | Results chat | Assignment | Forum | Tool]
  [Move up/down] [Remove]                  [Save draft] [Publish]
  Published target change -> replace step with a new identity

STUDENT: QSA administration / AP-... / My institute
  1 [Open competenzestrategiche.it]  Use teacher-provided external login
  2 [Enter questionnaire scores]    Preserve draft on save failure
  3 [Use scores in guided chat]     Server confirms durable acceptance
  Step done: scores accepted; follow-up chat remains a separate step
  Future alternative: teacher confirms matched import -> step done without opening chat

NON-ITALIAN AVAILABLE QUESTIONNAIRE
  [Complete in app] -> saved profile -> [Use scores in guided chat]
  In-app submission alone: administration step still awaiting guided entry

ASSIGNMENT
  [Open assigned goal and attachments] -> [Submit work explicitly]
  Same assignment in standalone list and path; one submission state

FORUM
  [Open exact discussion] -> [Post reply]
  Pending moderation: awaiting approval; no body in path progress
```

Use type-specific labels, not a questionnaire/tool label for every activity.
Show load/error/empty states distinctly, preserve drafts across 409/422/5xx and
account changes, retain keyboard reordering and explicit save/publish actions.
The assignment restyle in its historical handoff needs its own owner decision;
this plan only adds the path integration controls.

## 8. Completion and lifecycle rules

For new steps the evidence lower bound is `active_from`, set on first activation
(path publication for initial steps). Unavailable steps are excluded from the ratio,
never silently marked done. Resolve teacher override first, then permitted student
self-mark for `tool`, then automatic evidence. Retain teacher reasons and the ability
to clear an override. An override does not authorize access to an unavailable target.

| Type | Qualifying evidence | Does not count / lifecycle |
|---|---|---|
| Questionnaire administration, IT | Valid result for the exact student/plan/instrument/locale, accepted through guided chat or a confirmed teacher import matched to that student and administration after activation | External link, unconfirmed upload/preview, failed save, unmatched student, another plan, anonymous/practice result, direct result POST alone. A qualifying import requires no chat opening; the separate deep dive is not completed. |
| Questionnaire administration, other languages | Exact in-app scored result followed by guided entry, or a valid confirmed teacher import for the exact matched student and plan, after activation | Ordinary runner submission alone, unconfirmed/unmatched import or another plan. An unavailable locale must not fall back to a different locale. |
| Guided results chat | Final guided turn marker for the step's bound student session and the preceding administration result, after this step's activation | A score-entry event, unrelated chat, old final marker, cancelled/failed turn. Teacher omission of this step is how the deep dive stays optional in the composition. |
| Assignment | `AssignmentWork.submission` present and `submitted_at` after activation for the referenced, non-revoked assignment and current eligible student | Opening, planning, private reflection, feedback or a different assignment. Withdrawal removes automatic completion. Path v1 supports whole-class goal assignments; targeted deliveries remain standalone. |
| Forum | Student-authored published reply in the specified same-class published topic, after activation, with neither hidden nor deleted post | Reading, replying elsewhere, pending moderation, hidden/deleted reply. Approval qualifies the existing reply; hiding/deleting it removes evidence unless another qualifying reply remains. Topic lock blocks new replies but does not erase earlier qualifying evidence; hidden/unpublished topic becomes unavailable. |
| Other tool | Existing evaluator: assessment result, guided final marker, focused IDEA map, Bussola completion, saved Tavolo, goal creation, pQBL completion; existing self-mark types unchanged | Preserve legacy timing and tool rules; do not infer typed administration completion from the old evaluator. |

Owner decisions confirmed on 2026-10-09: forum completion requires a published post
in the indicated thread; assignment completion requires explicit student submission;
the second institute teacher self-joins from the existing-institute list. These are
settled decisions, not pending review questions. The final import decision also
allows a confirmed matched import to complete the questionnaire step without chat
entry, as specified in section 12.

Do not make identical tool/instrument codes the step identity. Repeated administrations
must have different plan targets. Duplicate automatic targets in one path are rejected
in v1 unless an explicit distinct attempt requirement is defined later. A second
administration cannot reuse another plan's result automatically. Removed/archived
steps retain history. Archived/inactive classes provide existing read access without
new completion-producing writes. Linked plans/assignments/topics cannot be deleted
in a way that silently detaches published steps: archive/revoke or return a conflict.

Forum completion reads only identifiers, author, class, status and timestamps through
a narrowly scoped metadata module. Never fetch a post body or import the forum router
into chat/completion. Extend the strict privacy tests only for that named metadata
seam and forbid wider consumers; retain provider/network and export/PDF exclusions.
Class progress may show a completion boolean; research datasets never gain forum data.

## 9. Ordered vertical slices

Each slice includes persistence/migration **where needed**, authorized handlers,
working teacher/student UI, relevant integration tests and documentation. Each is
demoable in isolation after its blockers. All are AFK under the recorded decisions;
owner review/merge and launch-time model confirmation remain required. This planner
does not select future agents' models. One dedicated implementation branch/PR per
slice, created from updated main after its blockers merge.

| Order | Slice | Branch | Blocked by |
|---|---|---|---|
| 1 | TF1: Teacher creates an institute and associates a class | `feature/teacher-flow-institutes` | None |
| 2 | TF2: Institute-owned credentials and canonical administration references | `feature/teacher-flow-institute-credentials` | TF1 |
| 3 | TF3: Italian administration as the first typed path step | `feature/teacher-flow-it-administration` | TF2 |
| 4 | TF4: In-app administration enters guided chat with provenance | `feature/teacher-flow-in-app-administration` | TF3 |
| 5 | TF5: Optional guided deep dive on the bound result | `feature/teacher-flow-results-chat` | TF4 |
| 6 | TF6: Goal assignments with attachments in paths and standalone | `feature/teacher-flow-path-assignments` | TF5 |
| 7 | TF7: Exact-discussion forum steps with isolated metadata completion | `feature/teacher-flow-path-forum` | TF6 |
| 8 | TF8: Publish and manage the complete mixed teacher flow | `feature/teacher-flow-publish-mixed-paths` | TF7 |

The dependency chain intentionally serializes changes to the shared builder,
schemas and progress resolver; each subsequent slice extends and verifies the
previously delivered flow. Future parallelism requires changing both issue and
journal dependencies explicitly. The CLI supports one predecessor per task.

### TF1 — create institute and class

DoD: an authenticated teacher creates an active institute with immediate creator
membership, edits scoped metadata and creates/links a class from that context.
Add the Institutes entry and institute -> class breadcrumb while retaining notebook
placement. The second teacher selects an active institute from the existing-institute
directory and self-joins immediately, without invitation or administrator action.
Enforce the new-record two-teacher limit transactionally and grandfather existing
larger memberships. Class attachment requires creator/self-join membership rather
than implicitly joining through a class edit. Existing unlinked classes keep working.

Tests: synthetic PostgreSQL atomic rollback, simultaneous slug/membership creation,
teacher-only directory/self-join, idempotent repeat join, concurrent second/third joins,
capacity rejection without partial writes, inactive/nonexistent institute rejection,
teacher/researcher/student/admin role matrix, unauthorized institute attachment,
class co-teacher vs institute manager rights, preserved old classes; browser first
teacher creates -> second teacher selects/self-joins -> reload -> class, draft failure
and six-language labels. No invitation or administrator action is part of that journey.

### TF2 — canonical credentials and existing administrations

DoD: teacher saves external credentials only on their institute. Existing research
administrations select and round-trip a canonical institute; reconciliation UI
handles unmatched/mismatched legacy rows. Shared writer and local verification
grant enforce the context contract across existing score/result writers. Duplicate
credential writes end and existing administration UI gains revision checks.

Tests: migration repeatability, canonical/empty/conflicting legacy mapping,
authorization and wrong/missing credentials, expired/rotated grant, no partial result
or validation writes, all write endpoints, safe serialization/logs/URLs, research
permissions preserved; browser institute save -> administration edit/reload and 409.

### TF3 — Italian administration and typed step

DoD: create/select the same IT administration from class or research views, add a
typed questionnaire step, publish and launch it. External link uses institute context;
manual scores enter guided chat with committed result/entry/evidence acknowledgement.
Progress remains undone on link opening or failed persistence. Introduce the typed
envelope, stable activation/target identity and guided-entry tables with legacy steps
backfilled as `tool`. Support provenance fields from this first new result writer.
The completion model also recognizes future confirmed-import evidence for the exact
student/administration; importer UI/parser implementation remains future issue #157.

Tests: IT path -> external handoff fixture -> manual scores -> server completion;
another plan/student/practice result rejected; score validation, retry idempotency,
409/422/5xx draft retention; class and research show one plan ID; upgrade retains old
IDs/marks/tool completion; secret-free fixture only, no live external submission.
Synthetic completion-contract evidence also covers a confirmed import for the exact
student/administration without a chat session; preview, unmatched/wrong-plan and
failed-import evidence never qualifies. No importer parser or UI is implemented.

### TF4 — in-app administration and guided entry

DoD: available non-IT languages complete in app, persist the exact plan result and
offer guided entry using those scores without retyping or duplicating the result.
Guided entry completes the in-app flow; future confirmed teacher imports also
complete matching steps without chat opening. Results/history show accurate provenance;
future import evidence is representable but import creation is not exposed here.

Tests: capability-available and unavailable language fixtures; scoring -> result ->
guided entry with plan, locale and student binding; ordinary runner submission alone
stays undone; synthetic future confirmed-import evidence completes the matching step
without chat, while a source label alone does not;
standalone runner regression, forged origin rejection, repeated acceptance, old
results with unknown capture method, research counts/exports without new secrets.

### TF5 — results deep dive

DoD: teacher optionally adds a guided-results-chat step selecting a preceding
administration step. Student launches a session using that bound result and reaches
done only after the server's final completed guided turn. Removing the deep dive
from the composition does not undo the administration step.

Tests: final marker binding, streamed/non-streamed parity, failed/cancelled stream,
resumed/retried turn idempotency, unrelated result/chat, deleted result, strict
ordering, referenced step removal conflicts, student and teacher progress UI.

### TF6 — assignment step

DoD: teacher creates/selects a whole-class goal assignment with catalog attachments
inside the builder; student opens the existing assignment workflow and explicitly
submits. It is the same assignment and submission in standalone and path views.
Revocation/withdrawal updates completion. Private activity is never auto-shared.

Tests: server-built goal snapshot and attachments, cross-class/targeted/revoked
target rejection, request-id retry, standalone assignments regression, explicit
submission vs private draft, withdrawal and teacher override, recipient/membership
changes, source catalog deletion preserves the delivered snapshot, hash deep link.

### TF7 — forum step

DoD: teacher selects an exact published discussion of this class, student replies
there and path progress derives qualifying metadata only. Pending, approval,
hide/restore, deletion, lock and mute states explain what the student can do.
Privacy tests permit only the named metadata reader, with no broad allowlist.

Tests: exact-thread/class/author/timing matrix, pending -> approved -> hidden ->
restored/deleted, two qualifying replies, locked topic and muted student, class
archive, forum settings even under All tools view; assert no bodies/providers/network
or forum-derived data in chat, RAG, research exports and PDFs.

### TF8 — mixed publication and lifecycle

DoD: teacher travels institute -> class -> mixed path and publishes after a unified
validation of every target, capability and revision. Publication/edit/archive/restore
preserve activation timestamps, target identity and historical progress. Surface
actionable unavailable reasons and safe mixed-step progress on student and teacher
views. Research and classroom links reach the same administration. Complete the
guide/screenshots and explicitly label the obsolete audit historical (or replace it).

Tests: complete synthetic IT and non-IT journeys with questionnaire, optional deep
dive, goal assignment, forum and other tool; stale concurrent edits, target change
after activation, late step addition, reorder/remove/archive/restore, admin disable,
teacher override clear, multi-class and #147 view behavior if merged, six languages,
keyboard/mobile navigation and error recovery. Application API tests support browser
fixtures; a successful HTTP response alone is not completion proof.

### Shared implementation gates

Use isolated synthetic PostgreSQL and browser fixtures; never production data or
live external credentials. Run focused backend suites for institutions, orientation,
administrations, class paths, survey/scoring, assignments or forum as touched, plus
the authorization/privacy regressions affected by the slice. Run frontend tests,
TypeScript, build and `i18n:check` for UI changes; record baseline failures separately.
Each product slice updates `docs-counselorbot/funzionalita-counselorbot.md`, reviews
the six-language guide/screenshots, and runs `make guidance-refresh` then
`make guidance-check`. Rebuild affected images only in an isolated authorized test
environment. Merge, deploy and runtime verification remain separate actions.

## 10. Risks, future work and review questions

| Risk | Handling |
|---|---|
| Institute creation/self-join changes the old admin-only trust model | Membership is created by the first teacher or explicit second-teacher directory selection; enforce role/activity/capacity atomically and preserve independent class visibility. |
| Duplicate name vs unique external code | Similar names may coexist; exact canonical code conflicts return actionable 409 and admin reconciliation. A collision never automatically joins an institute; an explicit directory selection can self-join it. |
| Hash mistaken for recoverable external login | Separate credential distribution; no password read-back/autofill or claims of remote verification. |
| Legacy mapping and DDL failure | Repeatable migration, safe counters, reconciliation state and blocking writer checks; no silent best-effort schema success. |
| Results assigned to wrong administration or repeated step | Server-bound plan/result/student/session/step evidence; immutable activated target; no forged imported provenance. |
| Existing assessment path progress changes retroactively | Legacy steps remain `tool`; do not fabricate guided-entry timestamps. |
| Forum privacy tests weakened for completion | Allow only constrained metadata fields through a named module and test all downstream AI/export consumers. |
| Earlier import default survives the final owner decision | Recognize guided entry OR a confirmed teacher import for the matched student and exact administration. Keep import evidence distinct from chat evidence, and keep the importer outside the current milestone. |
| Concurrent UX and view-switcher work | Recheck #138/#139/#140/#147 and current main at each slice; integrate delivered work rather than duplicating it. |

Out of scope: application implementation in this PR; administrator duplicate-merge
tools; general assignment restyling; notifications beyond current in-app behavior;
new questionnaire translations/validation; administrator-authored path presets;
CSV import UI/jobs; competenzestrategiche.it API keys, connectors, SSO or automatic
credential delivery. No new vendor/API capability is assumed.

The future file-import contract is specified in section 12. A confirmed teacher
import matched to the student and exact administration completes the questionnaire
step without opening guided chat, under the final owner decision of 2026-10-09.
Future templates have versioned source definitions and class-local instantiation;
admin editing a template must not mutate already published paths.

Owner decisions recorded on 2026-10-09:

1. A forum step completes when the student's post in the indicated thread is
   published; pending moderation does not qualify.
2. An assignment step completes on the student's explicit submission; teacher
   feedback is not required and private planning is insufficient.
3. The first teacher creates the institute; the second selects it from the existing
   list and self-joins, without administrator action or invitation. Aim for two
   teachers per institute; duplicates are handled later by the administrator.
4. Future imported results appear as imported entries in the student's compilations/
   history and also complete the matching questionnaire step through a confirmed
   teacher import for that student and administration. No guided-chat opening is
   required; this final decision supersedes the earlier revisitable default.

Before implementation, review these ASCII structures with the owner and confirm the
assigned model separately for every task. No future model was chosen by this plan.

## 11. Tracking and planner validation

Milestone: [Teacher flow: institutes and composable class paths](https://github.com/nugh75/counselorbot-sbs/milestone/6).
The draft planning PR references implementation issues without closing them. Existing
goals/issues are not closed by publication of the plan.

| Order | Issue | Journal task | Depends on task |
|---|---|---|---|
| 1 | [TF1 #148](https://github.com/nugh75/counselorbot-sbs/issues/148) | `0f7d87e6-bece-4737-a929-194e2103f714` | None |
| 2 | [TF2 #149](https://github.com/nugh75/counselorbot-sbs/issues/149) | `52b21374-edcd-4e94-98b5-b6239938b757` | `0f7d87e6-bece-4737-a929-194e2103f714` |
| 3 | [TF3 #150](https://github.com/nugh75/counselorbot-sbs/issues/150) | `e2d62bd9-e3cd-45f3-98ae-4fc85dbe2ab4` | `52b21374-edcd-4e94-98b5-b6239938b757` |
| 4 | [TF4 #151](https://github.com/nugh75/counselorbot-sbs/issues/151) | `e59e0593-01fc-4524-b72f-8b47f1f23501` | `e2d62bd9-e3cd-45f3-98ae-4fc85dbe2ab4` |
| 5 | [TF5 #152](https://github.com/nugh75/counselorbot-sbs/issues/152) | `d7cc9cc4-3a74-41ac-ad7f-c21f185de356` | `e59e0593-01fc-4524-b72f-8b47f1f23501` |
| 6 | [TF6 #153](https://github.com/nugh75/counselorbot-sbs/issues/153) | `41be299a-145e-48d3-b2c3-5ecfffed116d` | `d7cc9cc4-3a74-41ac-ad7f-c21f185de356` |
| 7 | [TF7 #154](https://github.com/nugh75/counselorbot-sbs/issues/154) | `baf87e21-d771-4002-b1ec-f0b5bf9d4d51` | `41be299a-145e-48d3-b2c3-5ecfffed116d` |
| 8 | [TF8 #155](https://github.com/nugh75/counselorbot-sbs/issues/155) | `208630de-eb89-4ca2-b1d6-e5942241a6d0` | `baf87e21-d771-4002-b1ec-f0b5bf9d4d51` |

Observed defects were registered through journal-cli as **suspected**, with source
evidence and no runtime reproduction: institute reference round-trip mismatch;
chat entry after save failure; obsolete class-path audit; temporary-file issue bodies.
Sensitive findings were registered **local-only**; their diagnostic details are not
copied to public artifacts. Bug registration is distinct from GitHub publication.

Planner verification is documentation-only: check every source reference, dependency
order, issue/milestone/task readback, diff scope, draft PR and board association.
No application tests, build, schema migration, deployment or external questionnaire
submission is claimed by this planning PR.

Planner checks completed: 38 file:line references exist within the baseline files;
eight published issue bodies, milestone assignments and predecessor references
match their prepared specifications; eight journal tasks have the requested goal,
assignee, branch, optional review and dependency IDs; `make guidance-check` and the
guidance check against the source baseline pass. Six suspected defects were saved
in the journal, including two local-only records. No registration was rejected.

## 12. Future: competenzestrategiche.it results import

Amendment requested on 2026-10-09. **Future only: outside milestone #6 and its eight
ordered slices; do not launch this work.** This section specifies file ingestion;
it does not activate an import feature or imply an available vendor API. The teacher
downloads a JSON or CSV export from competenzestrategiche.it and explicitly imports
factor-level results into an authorized class. No vendor credentials/API keys are
stored in the file-import workflow.

**Owner-confirmed purpose (2026-10-09):** populate the student's compilation history
already present in CounselorBot. Each committed imported result appears in the same
compilations/history views used for in-app results, clearly identified as imported.
Do not confine it to a teacher-only import log or require a guided chat to make the
history entry visible. Existing in-app entries remain intact; idempotent re-import
adds no duplicate history entry. Path-step progress is a separate concern.
The final owner decision also makes a confirmed import qualifying questionnaire-step
evidence for the matched student and exact plan/administration; history visibility
does not by itself complete unrelated steps.

### Contract and questionnaire-specific factor mappings

The source contains student identifiers/names and **scores per factor**, not answers
to questionnaire items. The teacher selects their active institute, class, instrument,
locale and, when applicable, the exact administration. A file containing several
instruments or administrations is partitioned into explicit preview groups; each
group has its own mapping and target context. A guessed instrument is only a
suggestion requiring confirmation. Mixed or unidentified rows are excluded until
their context is resolved; the server never attributes them by column resemblance.

Current factor definitions are questionnaire-scoped in
`backend/models.py:434-456`; the scorer retrieves them per instrument in
`backend/scoring_service.py:225-229`. Profile storage uses factor-code scores
(`backend/scoring_service.py:323-325`). The baseline frontend definitions in
`frontend/src/lib/questionnaires.ts:49-115` provide the following planning inventory:

| Questionnaire | Baseline CounselorBot factor codes | Mapping contract |
|---|---|---|
| QSA | C1, C2, C3, C4, C5, C6, C7, A1, A2, A3, A4, A5, A6, A7 | Separate QSA map and factor-set fingerprint. |
| QSAr | C1r, C2r, C3r, C4r, A1r, A2r, A3r, A4r | Separate QSAr map; never reuse QSA targets or drop the r suffix. |
| ZTPI | T1, T2, T3, T4, T5 | Separate ZTPI map and report-scale declaration. |
| QPCS | S1, S2, S3, S4, S5 | Separate QPCS map and factor-set fingerprint. |
| QPCC | K1, K2, K3, K4, K5 | Separate QPCC map and factor-set fingerprint. |
| QAP | AD1, AD2, AD3, AD4 | Separate QAP map and factor-set fingerprint. |

These are source-baseline codes, not a fixed future import whitelist. Validate every
mapping against the server's selected instrument factor set at preview **and commit**.
Future supported instruments require their own mappings; a changed factor set makes
an older map stale until reviewed. Questionnaire availability and import capability
are separate: an external IT export does not require an IT in-app item runner, but
the profile/guided-chat contract must support the selected instrument and scores.

Each immutable mapping version identifies provider, instrument code, external export
schema/version, locale/report scale, expected factor-set fingerprint and entries of
`external CSV column or JSON key/path -> CounselorBot factor code`. CSV dialect,
encoding and decimal format, or JSON row/factor container paths, are part of that
version. Identifier/name/record-id columns are declared separately from factor columns.
For wide CSV/JSON there is one record per questionnaire result; a documented long
CSV form may group factor rows by external student, record, instrument and attempt,
rejecting duplicate or inconsistent factors within a group.

Exact external headers/keys cannot be listed honestly without representative exports;
none were supplied for this amendment. A mapping preview lets the teacher select a
known version or explicitly map detected fields to the selected factor set. Preview
changes are provisional; a successful confirmed commit stores an immutable scoped
version. Reusing a version never mutates its old entries. Do not infer equivalence
from translated labels, column position or shared prefixes. For example, an external
QSAr field selected for C1r must target C1r even if its label resembles QSA C1.

Before any durable result, student-link or reusable mapping write, preview reports:

- Unknown factor fields and unknown target codes; declared non-factor metadata fields
  are shown separately. The teacher must resolve an unknown field or explicitly
  classify it as unused metadata; never silently discard a score column.
- Missing required factors per record, blank/non-numeric/non-finite/out-of-range
  scores, duplicate headers/keys/factors, incompatible instrument or report scale,
  ambiguous export grouping and duplicate/conflicting external records.
- Exact expected vs mapped factor sets. Every factor has one source value; two
  source fields cannot silently collapse to the same target. Invalid/incomplete rows
  remain unselected and cannot be committed; valid rows may form an explicit subset.
- Missing external record IDs, unresolved student identities, stale class membership
  and conflicts with previous imported records. Show imported/reimported/skipped/
  excluded counts and selected recipients before confirmation.

Use the instrument's report-scale contract, not its item-response scale. An imported
factor score is already an aggregate: no item reverse scoring or speculative
renorming. If the export supplies raw scores but the guided profile expects stanines,
block those rows until a documented versioned conversion using validated norms is
available. Retain declared input/output scales and conversion version if conversion
is later supported; do not silently round or approximate.

### Student matching and remembered identities

The teacher is responsible for matching every external student to a **current
student of the selected class**. Names and external identifiers do not grant an
account association. Suggestions may use exact saved external-ID matches and local,
deterministic name comparison against that class roster. No uploaded identity is
sent to an LLM, third-party matching service or institute-wide/global account search.

Every new import displays suggested and remembered matches with their reason; the
teacher explicitly confirms each selected external student, including remembered
matches. Rows for the same unambiguous external student may share one confirmed
selection. Distinct students with the same name require manual resolution. Do not
merge different external IDs just because their normalized names coincide.

Unmatched, ambiguous or explicitly excluded rows are left out, with an exclusion
count; they do not create accounts or questionnaire results. A selected account must
still belong to the class at commit. Several attempts for one confirmed student may
be imported as separate results when their external record IDs differ. Several
external identities pointing to one account require explicit review rather than
automatic collapse. A remembered mapping can be replaced only by an explicit audited
teacher confirmation; this changes later imports and never reassigns old results.

Remember provider/institute/class-scoped external student ID -> account mappings
after successful confirmation, with confirming teacher and revision. If the export
has no stable student ID, names may produce suggestions but do not become durable
identity keys; a teacher must manually match again unless a reliable provider ID
has been established. Reuse is limited to teachers authorized for both that class
and institute; revoked access and departed students invalidate reuse. Expose removal
of a remembered link without deleting the already imported profile.

### Future data model and preview/commit interface

These entities are future contracts, not additional migrations for TF1-TF8.

| Entity | Proposed fields | Invariant |
|---|---|---|
| ExternalFactorMappingVersion | Provider, institute scope, instrument, export schema/version, mapping version, factor-set fingerprint, field/path map, parser format, input/output score scales, creator/time | Immutable after commit; exact factor set and compatible scales; no student names or credentials in the shared map. |
| QuestionnaireImportPreview | Random preview ID, authenticated teacher, institute/class, target plan/instrument, roster and mapping revisions, expiry, selected row hashes | Temporary class-scoped state, not a durable result; commit rechecks all permissions, mappings and identities. |
| ExternalStudentMatch | Provider, institute/class, stable external student key, matched account, confirming teacher/time, revision | Unique within that scope; no name-only key, no access to other classes, and no historical result reassignment. |
| QuestionnaireImportBatch | Institute/class, teacher, provider, mapping versions, confirmed timestamp, counts and commit request ID | Durable minimal audit and idempotent request identity; omit raw file, excluded names and full source rows. |
| QuestionnaireResult provenance | Existing proposed source fields plus mapping/batch identity, external instrument/attempt context and normalized payload fingerprint | `source=imported`, `source_system=competenzestrategiche.it`, `capture_method=json_import` or `csv_import`, exact external record ID and server-resolved student. |
| Confirmed-import completion evidence | Result and committed-batch identity, matched student, exact administration, qualifying step and confirmation timestamp | Server-created only after successful teacher confirmation; distinct from guided-entry evidence, no chat session required. Idempotent re-import does not add duplicate evidence or refresh its timestamp. |
| ExternalResultIdentity | Provider, institute, instrument, external record ID, result ID, matched student, payload fingerprint | Scoped database uniqueness and transactional checks make re-import idempotent across filenames, row order and concurrent batches. |

Retain external record identity exactly, with its documented namespace. Scope includes
instrument because vendor identifiers may only be unique per questionnaire; any
additional export namespace must be declared by the mapping. The file hash or row
number is not an external record ID. If exports lack a stable result ID, preview
flags the rows and excludes them until the owner chooses a documented stable source
identity policy. Never invent a provider ID or claim idempotency from a filename.

For an identical scoped identity, matched account and normalized payload, re-import
returns the existing result as already imported. A changed payload, different student,
different administration association or changed interpretation/mapping is a preview
conflict, not an overwrite. A mapping version may be recorded on the new batch without
rewriting unchanged historical provenance; semantic changes require review. Correction
or replacement requires a future explicit audited resolution contract. Existing
`in-app` results remain independent and unchanged, even for the same student/instrument.
When selecting a result for guided chat, show source, assessment date when supplied,
import time and administration so the student does not select an arbitrary latest row.
The student's existing compilations/history reader includes both in-app and imported
results with source labels; commit makes the imported entry visible without creating
a synthetic compilation session, guided-entry acknowledgement or chat transcript.
When that committed result matches a questionnaire step's student and administration,
the same transaction records confirmed-import completion evidence for the applicable
step. Unlinked history entries do not complete arbitrary steps of the same instrument.

Proposed interface: class-scoped preview upload, preview mapping/matching revisions,
explicit commit with request ID, and cancel/delete preview. Preview writes no durable
results or reusable matches. Commit is atomic for the explicitly selected valid
subset, revalidates current roster/permissions/target and returns created, already
imported and excluded counts. Concurrent identity or revision conflicts roll back
that selected commit and require a refreshed preview. Do not accept client-supplied
username/provenance as authority. Standalone imports may omit a plan; associating
them later with a questionnaire step requires explicit compatible administration
selection and audited teacher confirmation before creating matching import evidence,
never automatic attachment to all steps of the same instrument.

### Teacher and student flow (ASCII)

```text
TEACHER: Institute -> Class -> Questionnaire results -> Import (future)
  [Questionnaire v] [Administration v / Unlinked] [JSON or CSV file]
          |
          v
  FACTOR PREVIEW
  [Export schema v] [Mapping version v / Map fields]
  External column/key       CounselorBot factor       Validation
  <detected field>          <factor of this instrument> missing/valid/error
  Unknown fields [resolve / explicitly unused]  Missing factors [row excluded]
          |
          v
  STUDENT MATCHING (only current roster of this class)
  External student    Suggested account     Reason          [Confirm] [Exclude]
  <file identity>     <class student v>     saved/exact/manual   [ ]
  Unmatched identities stay excluded; no account creation
          |
          v
  FINAL PREVIEW
  New: N | Already imported: N | Conflicts: N | Excluded: N
  [Remember confirmed stable-ID matches] [Confirm import] [Cancel]
  Confirmation -> scoped atomic save -> raw upload deleted
  Matching student + exact administration -> questionnaire-step import evidence

STUDENT: Existing compilations/history
  Result: imported / competenzestrategiche.it / <questionnaire> / <date>
  Visible immediately after confirmed import; existing in-app entries stay present
  Matching questionnaire step: done after teacher-confirmed import; no chat needed
  [Use this result in guided chat]     Optional; separate deep dive still needs its turn
  Unconfirmed/unmatched/wrong-administration import: no step completion
```

### Privacy, retention and risks

An upload can contain names of minors and identifiers outside CounselorBot. Require
the authorized teacher's class and institute context for upload, preview, remembered
links and commit; recheck access on every read/write, including co-teachers. Institute
membership alone is insufficient. No cross-class match suggestions. Student reads
show only their own imported results, and research visibility continues to follow
the existing explicit administration permissions rather than exposing uploaded names.

Use bounded temporary storage: delete the raw file and identity-bearing parsed preview
after commit, cancel or expiry, including abandoned/failed imports. Proposed maximum
preview lifetime: 24 hours, configurable shorter; automatic cleanup on expiry and
crash recovery. Do not include temporary uploads in backups, logs, telemetry, RAG,
LLM context or research/PDF exports. Keep only the validated result/provenance,
minimal batch audit and explicitly confirmed stable-ID links under normal account/
class retention. Revocation blocks reads immediately; deletion of remembered links
must be available independently of result retention. The exact retention default
needs owner review before implementation.

Set documented file/row/field/depth limits, strict encoding/dialect parsing and schema
validation. Never evaluate JSON content, spreadsheet formulas or source values.
Escape untrusted labels in the preview; sanitize any later report export. Do not
persist unused columns or excluded identities in result metadata. Evidence/tests
use invented student identities and sanitized export fixtures only.

Risks requiring explicit handling: incorrect student match; identical names; missing
stable IDs; changed factor catalog/export headers; QSA/QSAr code collision; raw scores
mistaken for stanines; cross-institute identity leakage; retry/concurrent overwrite;
stale roster after preview; temporary uploads surviving failure; confusing unconfirmed
file ingestion with qualifying confirmed-import evidence. Unknown external schemas
are a future implementation prerequisite, not evidence that the vendor supports a
specific format.

### Final path-step completion decision and remaining future questions

**Final owner decision (2026-10-09):** a questionnaire step is done when its data
enter CounselorBot through either guided chat or a confirmed teacher import matched
to that student and the plan/administration of the step. **An imported result does
not require the student to open guided chat first.** This replaces the earlier
guided-entry-only/revisitable default.

Successful import confirmation creates the student's imported history entry and
distinct `confirmed_import` completion evidence for an eligible matching step in the
same transaction. Validate teacher/class/institute authority, current student matching,
scores, instrument/locale, exact administration and target availability server-side;
the source label alone or a browser-supplied plan ID is insufficient. Upload, preview,
unmatched rows, failed commit and a different administration do not count. An unlinked
import remains history-only until its compatible administration association is
explicitly confirmed and audited by the teacher.

Retain section 8's activation and strict-order rules: use the actual qualifying
teacher-confirmation timestamp after activation, not the external assessment date;
an earlier assessment may be imported after activation. Re-import is idempotent and
does not fabricate a new confirmation time. Result/evidence deletion or invalidation
removes automatic completion, with existing explicit override precedence retained.
Never synthesize guided-entry timestamps, chat sessions or final-turn markers for
imports. A separate results-deep-dive step still requires its own completed guided turn.

Other owner questions before future implementation: provide sanitized representative
JSON/CSV exports and clarify stable student/result IDs and factor report scales;
approve the proposed 24-hour maximum preview retention; define whether corrected
external records may create audited replacement versions or always require manual
conflict resolution. These questions do not add a ninth milestone slice or authorize
launching the future task.

Future tracking: [#157 — Import competenzestrategiche.it factor results with teacher-confirmed student matching](https://github.com/nugh75/counselorbot-sbs/issues/157), labelled `future`, with **no milestone**.
Journal task: `3b65aa9b-8edd-4aae-aa19-173684b832ba`, title ending in `future, model to confirm`, assignee codex,
review optional and no branch/dependency. Neither belongs to the milestone #6
execution chain; closure of this planning task does not unblock or authorize the
future task. Implementation requires a separate owner instruction.

Amendment validation: 42 source references checked; all six listed factor sets match
the baseline definitions; future issue #157 has the `future` label and no milestone;
milestone #6 still contains exactly #148-#155. The future journal task is pending,
with the requested goal/assignee/review and no execution-chain dependency. Guidance
and diff checks cover this documentation-only amendment; no import was implemented
or launched and no additional defect was observed during this amendment.
