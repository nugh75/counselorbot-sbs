# SDD ledger — plan: docs/plans/2026-09-25-libretto-nella-triade-plan.md
Spec: docs/plans/2026-09-25-libretto-nella-triade-design.md
Worktree: /tmp/cb-libretto (branch feature/libretto-triade). Base branch start: 29f2564.
Test cmd: set -a && . /home/nugh75/counselorbot-sbs/.env && set +a && DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" python3 -m pytest <file> -q
Baseline: test_goals.py + test_activities_timeline.py 33 passed.

## Preflight scan
| Tasks | Shared file/interface | Finding |
|---|---|---|
| A1/A3/A6/A7/C4 | backend/main.py (ALTER, routers, hook) | sequential edits, no conflict |
| A2→A4→A5 | goal_dict links/origin; resources action_kind; checks | A4 adds action_kind before A5 consumes: order ok |
| A2/A3/A5 | test_goals.py edit_payload | A5 extends with method; A3 GoalWrite.method default [] keeps old tests valid |
| A3/C5 | /user/certified-strategies in survey.py | C5 must keep route (plan says so) |
| A4/A7/C4 | EventReview, TimelineEvent.review | A4 defines before A7/C4 use |
| A7 self | tests for points 4,6,7 described not coded | implementer writes them |
| B1 self | 5-language texts not given | implementer translates (ruling R2) |
| B3→C1..C4 | DialogTarget.origin/prefill | B3 produces before C consumes |
| B4→C2 | ?note= on taccuino | ok |
| C1→C5 | FactorMultiSelect extracted before StudentBookletCard deleted | ok |
| B3→D1 | PDF_READY flag | ok |
| D2 self | goals_context drops reflection | existing tests may assert reflection: implementer adjusts |
Every other task: text self-consistent (tests vs code checked for A1-A7).

## Rulings
Ruling R1: implementers = pi CLI opencode-go/glm-5.3-flash for tasks whose plan text has complete code (A1-A6, small fixes); Claude sonnet for integration tasks (A7, B*, C*, D*); reviewers Claude sonnet; final review opus — user asked for pi/GLM — cost if wrong: extra fix rounds.
Ruling R2: B1 translations of new labels written by implementer, same register as existing keys, no coined compounds — cost: wording review later.
Ruling R3: commits made by pi carry trailer "Generated-with: pi (opencode-go/glm-5.3-flash)" instead of Claude co-author — honest attribution — cost: none.
Ruling R4: worktree /tmp/cb-libretto; main checkout switched back to main — other agents share main tree — cost: none.

## Progress
Task A1: complete (commits 29f2564..80de914, review clean)
Task A1: minor (deferred): test_goal_triad_models asserts only a few fields (plan-mandated test)
Ruling R5: tests always run from /tmp/cb-libretto (plan's PYTEST cd's to main checkout, which lacks branch code) — pi contract updated — cost: none.
Ruling R6: existing/other-code action links get role 'means' (spec §5.2): add to A2 fix — assignment_work.py + personal_timeline.py pass role='means', startup UPDATE goal_resource_links SET role='means' WHERE kind='action' — cost if wrong: one extra UPDATE.
Task A2: review clean; confirmed gap R6 → fix round 1
Task A2: fix round 1 attempt 1 hung 30min (pi resume of session, no output) — killed; retry fresh session, stdin </dev/null, timeout 25min
Task A2: fix round 1/5 (4 addressed, 0 open; commits 0b55df6..609d332)
Task A2: complete (commits 80de914..609d332, review clean)
Task A2: minor (deferred): event→action migration forces role means even if the event link was an origin — Ruling: acceptable, migration touches only future events while origin-from-event comes from past milestones — cost if wrong: a goal loses its origin label.
Task A3: review → 1 Important (update_goal method untested), 2 minor; fix round 1
Task A3: minor (deferred): create/update_goal set method twice (model_dump then explicit list) — plan-mandated, harmless
Task A3: fix round 1/5 (1 addressed, 1 minor open — trailing newline personal_strategies.py; commits 97d0c28..c22ceb1)
Task A3: complete (commits 609d332..c22ceb1, review clean)
Task A3: minor (deferred): backend/routes/personal_strategies.py missing trailing newline
Task A4: pi crashed after commit (API 400 reasoning_effort); controller ran tests 72 passed and wrote report stub
Task A4: parked — missing RED evidence (implementer crashed) — Ruling: accepted; reviewer confirmed tests exercise the new validator branches and legacy data cannot be rejected — cost if wrong: a vacuous test, caught by final review.
Task A4: complete (commits c22ceb1..c803a1c, 1 parked)
Task A4: minor (deferred): extra blank line before test_goal_can_create_a_check in test_goals.py
Task A5: parked — commit f49db99 carries both Co-Authored-By Claude and Generated-with pi trailers — Ruling: keep, no history rewrite for a trailer; pi contract already asks only for the pi line — cost if wrong: one commit with double attribution.
Task A5: complete (commits c803a1c..f49db99, 1 parked)
Task A6: commit 91731af complete (tests 3 passed re-verified by controller 00:30); review agent hit session rate limit 429 before verdict → review INCOMPLETE, re-dispatch on resume
Task A6: finding (pre-review): routes/assignments.py belongs to stale worktree /tmp/counselorbot-teacher-catalogs, not ours
Task A6: review attempt 1-2 failed (upstream reasoning_effort 400; --no-reasoning unknown flag) — working flag: --thinking off (run-pi.sh already had it on retry)
Task A6: review via pi/glm (user ruling: no Anthropic subagents for review while quota-limited) — APPROVED, 5 findings all Minor (3 test-coverage, 1 lambda style, 1 race info); findings in task-A6-findings.md
Task A6: test gaps noted for consolidation: clean() behavior, GET other-user returns null, factor-less instruments (design §11), 409 body, validation limits
Task A6: complete (commits c803a1c..91731af, review clean — Approved by glm reviewer)
Ruling R7: reviews also via pi/glm (user: "usa glm, niente agenti Anthropic" while quota-limited) — reviewer session separate from implementer session — cost if wrong: same model self-review; mitigated with severity-max checklist on A7.
Task A7: complete (commit 6045166; 7 tests GREEN; corr. 63+38 passed; dry-run on prod copy: 8 users, 9 readings, 2 new goals, idempotent; hook gated BOOKLET_MIGRATION=1)
Task A7: review via glm — APPROVED, 0 Critical/Important, 5 Minor (silent truncation note>2000/id>12 monitor in C5; unused `date` import; mid-file import in test; no per-user try/except in migrate_all_booklets — add when hook fires in C5; smoke/pg_dump evidence from report only)
Task A7: incident — pi deleted a preexisting stash during verification, recovered intact via git stash store (48147c0); stash list verified = 3 entries as before
Task A7: minor (deferred): record — residual smoke failure test_an_older_stage_of_the_map_can_be_drawn_again reproduced pre-existing on ae1eebc (not in known-failures list, add to plan notes)
X: LOT A COMPLETE (A1-A7 all committed and reviewed). Next: lotto B dispatch.
Task B1: complete (commit 9e68755; npm test 223 pass; tsc/lint only preexisting PNG/NewDeckDialog errors; 48+2 i18n keys x 6 langs)
Task B1: review via glm — APPROVED, 3 Minor (redundant ternary goal-method.ts; RED step skipped for upstream crash, declared; method fallback in goalFields)
Ruling R8: upstream 400 reasoning_effort recurs intermittently on first attempt; run-pi.sh retry (thinking off) self-heals — keep
Task B2: complete (commit ddd9599; MethodPicker 47 lines conforme; tsc/lint clean in file; goal-method tests 2 pass; browser tests deferred — need backend fixture on 3107)
Task B2: review via glm — APPROVED, 1 Important process note: commit lacks Co-Authored-By trailer (Ruling R3 stands: pi trailer only, plan's Claude trailer not required since implementer is pi — keep, note for final review); 3 Minor (write() no error handling — cover in B3/B5; titleOf empty edge; split(':') parsing)
Task B2: incident — external stash (Sep 14) caused transient conflicts during verification; files restored to HEAD, stash untouched
Task B3: complete (commit 9b1b3c5; all §7.4 sections in order; draft guard extended; npm test 223; i18n:check 2919x6 PASS)
Task B3: review via glm — APPROVED, 3 Minor (Past reviews from 2+ reviews (saner than brief's 1); Metti in pratica doesn't open action details; review placeholder until B4); onPractice on MethodPicker = minimal & required by brief
Task B4: attempt 1 hung 25min (timeout, no output, empty tree) — re-dispatch fresh session worked
Task B4: complete (commit b90d296; GoalReviewStep 68 lines; onSaved held via bodyKey; npm test 223; i18n:check PASS zero new keys)
Task B4: review via glm — APPROVED with 1 Important (409 Retry button missing in GoalReviewStep while body has it — per design §10 «messaggio conflitto e Ricarica» → fix round 1); 3 Minor + 1 Info
Task B4: fix round 1 (409 Retry button on GoalReviewStep + newline) — pi wrote the fix but crashed before commit; controller verified diff and committed 1d1349d (npm test 223 re-run)
Task B4: re-review via glm — APPROVED (retry wired, draft intact, newline ok)
Task B4: complete (commits 9b1b3c5..1d1349d)
Task B5: complete (commit 1765840; RED-GREEN; npm test 224/224; test:visual baseline unchanged 12/20 preexisting)
Task B5: review via glm — APPROVED, 2 Minor (weak test assert; re-emptying progress on done check → 422 without frontend message)
Task B5: note — merge conflict markers UU in tavolo/* from external stash preexist, untouched (verify before lot C)
Incident B5: 3 stale UU merge markers in tavolo/* (from an aborted external merge, MERGE_HEAD absent, stage2 == HEAD verified blob-for-blob) — resolved by checkout HEAD; npm test 224/224 re-run; no content change
Task B6: complete (commit cb338b9; test:goals 21 pass/1 skipped; npm test 224)
Task B6: root causes found while fixing: (1) PII redaction: Date.now() 13-digit titles pass Luhn → redacted as [carta] → switched to base36 run ids; (2) test fixture missing /orientation-directory mock → pageerror crashed timeline page (fixed in fixture); (3) 'Cosa farò'/'Scegli contenuto' duplicated in dialog → .first()/.last() scoping; (4) summary elements have no button role → getByText; (5) radios not reachable by fieldset legend → getByRole('group').getByRole('radio'); (6) isDisabled() unreliable on <option> → getAttribute('disabled'); (7) tree focus-return to opener row broken also on baseline (056ce70) → test skipped with note, follow-up tracked
Task B6: note — browser test run requires fresh fixture server per run (kill + restart goals_browser_server) since its schema persists across runs
X: LOT B COMPLETE (B1-B6 all committed and glm-reviewed; B4 needed 1 fix round)
Task C1: dispatched pi (BASE 321a335) 2026-09-26 06:45
Ruling R9 (2026-09-26, user): no more glm/pi — only Anthropic models. Implementers = Claude sonnet subagents; task reviewers = Claude sonnet; final review = opus. Supersedes R1/R7 — cost if wrong: higher quota use.
Task C1: pi run interrupted by user ruling R9 (uncommitted partial work saved to task-C1-pi-partial.patch, tree reset to 321a335); re-dispatch to sonnet
Task C1: dispatched sonnet implementer (BASE 321a335)
Task C1: implementer DONE commit 96efd13 (npm test 227/227, tsc clean)
Task C1: review sonnet — Approved, 0 Critical/Important; ⚠️ GoalDialog runtime from second mount not unit-covered → Ruling: covered by browser run test:goals in C5 step 4 + final review — cost if wrong: a dialog bug surfaces late
Task C1: minor (deferred): ResultReadingCard applyRow block repeated 3x (226-233, 256-260, 272-277)
Task C1: minor (deferred): «Rendi obiettivo» prefill carries note only, not the clicked growth area
Task C1: complete (commits 321a335..96efd13, review clean)
Task C2: dispatched sonnet implementer (BASE 96efd13)
Task C2: implementer DONE commits 5361cba, 3b87b09 (backend 204 pass/1 known-preexisting smoke; npm test 227/227)
Ruling R10: AssignmentJourney.tsx (dead after JourneyOverview removal) and unused i18n-goals keys (journey, related, manage, empty, next, unsure, reviewDate) are removed in C5's residual cleanup — C5 already sweeps dead booklet code — cost if wrong: dead code lingers one more task
Ruling R11: C2 goal bridge only on LearnerProfileCard variant 'edit' (not onboarding 'review') — onboarding is a first-run flow, goals come later — cost if wrong: one extra button to add
Task C2: review sonnet — Approved, 0 Critical/Important; ⚠️ backend run evidence → resolved: report carries RED/GREEN transcripts + 204/1 known-preexisting
Task C2: minor (deferred): ?note= not stripped from URL after applying (reload re-appends)
Task C2: complete (commits 96efd13..3b87b09, review clean)
Task C3: dispatched sonnet implementer (BASE 3b87b09)
Task C3: implementer DONE_WITH_CONCERNS commit e26f519 (npm test 232/232; tsc clean; test:timeline 3/5, 2 fails at 1440px claimed preexisting on baseline)
Task C3: concerns — new ExperienceReview.tsx (TimelineTools personal branch unreachable, real editor in PersonalTimeline); /profilo/azioni ignores title param (link does not prefill); stash entry 5e51d30 "c3-wip-baseline-check" left (drop blocked by guard for subagent — left for user); ports 3117/18096 verified free
Task C3: review sonnet — spec ✅ (ExperienceReview.tsx extra file verified justified: TimelineTools personal timeline branch unreachable); 1 Important: browser-failure baseline cited 951a4a5 (main, not ancestor) → fix round 1 (re-run test:timeline on 3b87b09 via temp worktree)
Task C3: minor (deferred): worked/did_not_work lines lack 300-char client guard (preexisting pattern)
Task C3: minor (deferred): 'goal-review-' prefix check duplicated timeline-legend.ts:10 / PersonalTimeline.tsx:129
Task C3: minor (deferred): no test for ExperienceReview branching
Task C3: fix round 1 — controller re-ran test:timeline on 3b87b09 (temp worktree, fresh fixture, dev 3118): same 2 failures (1440px board link; filters+reload) → preexisting on this branch, not C3; temp worktree/servers cleaned
Task C3: minor (deferred): test:timeline 2 preexisting failures (1440px dated activity link; filters survive reload) — investigate at final review
Task C3: complete (commits 3b87b09..e26f519, review clean after round 1)
Ruling R12 (2026-09-26, user "puoi fare direttamente con opus 5.5"): controller (Opus 5.5) implements C4–D4 directly; per-task review skipped in favour of controller self-check + one opus final whole-branch review — cost if wrong: fewer review seats per task
Ruling R13: C4 milestone mapping keeps the draft's «contesto» by prepending it to review.reading (EventReview has no context field) — no user text silently dropped — cost if wrong: context shows inside the reading
Ruling R14: C4 request_id = crypto.randomUUID() per card mount (retry-safe within the card) — simpler than hashing sessionId — cost if wrong: a page reload + resave duplicates a milestone
Task C4: note for D2/final — tool_brief_seed never updates existing DB rows: prod orientation tool briefs keep "save in their Booklet" until edited (append-only rule on DB prompts)
Task C4: complete (commits e26f519..HEAD, controller-implemented: backend 48 passed; npm test 233/233; tsc clean; lint only preexisting NewDeckDialog)
Ruling R13: C4 milestone mapping keeps the draft's «contesto» by prepending it to review.reading (EventReview has no context field) — no user text silently dropped — cost if wrong: context shows inside the reading
Ruling R14: C4 request_id = crypto.randomUUID() per card mount (retry-safe within the card) — simpler than hashing sessionId — cost if wrong: a page reload + resave duplicates a milestone
Task C4: note for D2/final — tool_brief_seed never updates existing DB rows: prod orientation tool briefs keep "save in their Booklet" until edited (append-only rule on DB prompts)
Task C4: complete (commits e26f519..fb94e93, controller-implemented: backend 48 passed; npm test 233/233; tsc clean; lint only preexisting NewDeckDialog)
Ruling R15: C5 booklet routes → one helper `_booklet_gone` registered on every old path via add_api_route (no auth, 410 for all) — keeps EXPECTED_ROUTES smoke list valid, bodies gone — cost if wrong: anonymous callers learn the route is gone
Ruling R16: C5 removed the booklet mode of «Cambiamenti» (ProfileChangeReflection) — it read/wrote booklet routes now 410; profile-change reflection stays — cost if wrong: students lose a reflection view on old booklet sheets (data still in student_booklets + migrated)
Ruling R17: C5 i18n-reading DE «Meine Lesung»→«Meine Deutung», SV «Min läsning»→«Min tolkning» (C1 calques; D3 glossary terms) — cost if wrong: one wording change
Ruling R18: R10 correction — i18n-goals `empty`, `unsure`, `reviewDate`, `next` are still used (GoalsPanel/GoalTree/GoalForm/GoalDialog); only journey/related/manage removed
Task C5: note — personal-area-booklet.test.mjs deleted (tested the retired page, not in any npm script); visual-tools browser mock moved to `reading`
Task C5: note — residual booklet mentions left for D: pdf_generator (D1), chat_logic/prompt_*/orientation.py/ConfigForm/i18n-admin (D2), guide i18n + assistant_questions_seed + guided_step_questions_seed + guided_text_i18n (D3)
Task C5: complete (commits fb94e93..f892e75, controller: backend smoke+C5 225 passed/1 known; npm test 230/230; tsc clean; lint only NewDeckDialog; build OK; test:goals 21/1skip; test:timeline 3/2 baseline; test:visual 12/20 = B5 baseline counts; i18n:check 2848x6)
Ruling R19: D1 method marks rendered as words «(certificata)»/«(mia)» instead of ✦/✎ — PDF core text is latin-1, the glyphs would print «?» — cost if wrong: less visual marks in the PDF
Ruling R20: D1 PDF_READY toggle removed (always true after D1) instead of flipped — dead constant — cost: none
Ruling R21: D1 check text in PDF = action.reflection («Cosa osservo») + adjustment («Cosa cambio») read from the workspace, since Action.progress is an enum — cost if wrong: none
Task D1: complete (commits f892e75..c308795, controller: test_goal_pdf 4 + pdf_summary + goals = 41 passed; sample PDF rendered and inspected; tsc clean)
Task D2: complete (commits c308795..3ba30ec: reading context [READING], goals_context method/last_check/last_review, fixed texts 6 langs; backend 428 passed/1 known; DB prompt append snippets pending user confirmation)
Ruling R22: D3 guide screenshots NOT regenerated — capture-guide.mjs fails at its calendar step (mock uses a future personal event, which the timeline no longer renders since the activities-timeline lot, preexisting); generated PNGs reverted — cost: guide images still show old Obiettivi popup / booklet tile until the script is fixed
Task D3: complete (commit HEAD docs: glossary, functional doc, guide texts 6 langs, assistant topics, guidance manifest refreshed; i18n:check 2847x6; knowledge card DB append pending user confirmation)
Final review (opus): with fixes — C-1 migration marker purged with logs; I-1 event booklet migration wrong keys/duplicate; I-2 review textareas eat spaces/newlines; I-3 ?note= reapplied/truncated; I-4 legacy reflection hidden; I-5 browser baselines not on main; I-6 booklet questions in seeds
Ruling R23: C5 removal of ('booklet','Libretto') trace label reverted — full suite showed it breaks the lossless trace of migrated activities (test_activities_timeline) — cost: none
Ruling R24: I-4 resolved by showing the legacy reflection read-only in the dialog and as «Note» in the PDF (spec §8.6), teacher summary unchanged — cost if wrong: student still cannot edit/clear old text
Ruling R25: I-3 note over the 600 limit is not applied and stays in the URL, with a message — no silent truncation — cost if wrong: student must shorten notes by hand
Final fix wave: commits bf5d570..8db7e07 (backend migration/pdf/goals/guidance 56 passed; npm test 233; i18n 2848x6); scoped re-review dispatched
D4: user confirmed DB text updates + rebuild (2026-09-26). Full prod pg_dump: ~/counselorbot-backups/pre-libretto-triade-20260926-0850.dump. Applied: 20 config/guided_step changes via prompt_updates apply (revisions recorded; rollback = prompt_updates rollback with the same plan), 2 orientation tool briefs (hash-checked). Pending after rebuild: deactivate 30 old booklet suggested-question rows once the new seeds exist.
