# Handoff: C19 Compass and Assistant class access (#92)
Date: 2026-10-09 | Agent: c19-bussola-assistant-92 | Role: Constructor (C)

## Objective
Implement issue #92 only, validate in isolation, push one feature branch and
open one draft PR. Review is optional; merge and deployment are not authorized.

## Session and custody
- Tab: C19: Bussola + Assistant #92 (w2Q:tZ); pane: w2Q:pZ.
- Cwd: `/home/nugh75/counselorbot-sbs-worktrees/c19-bussola-assistant-92`.
- Branch: `feature/class-bussola-assistant-toggles-84`.
- Verified base/default HEAD: `b604e22c86c4102d35265c8c7f07cc8820e286f8`.
- Prerequisites #112, #123 and #124 are MERGED and ancestors of the base.
- Task: `8628398c-ee18-4b1d-ae7c-851e5552f99f`; currently open during delivery.
- No other agents, successor tasks, main-checkout changes, production actions,
  secrets/environment-file access or destructive Git operations.

## Progress
- [x] Guard new/resumed Compass sessions, messages, completion and Assistant chat.
- [x] Hide disabled navigation and home entries; preserve owner-readable history.
- [x] Filter model JSON, free text, offline ranking and carried cards by access.
- [x] Use the first enabled questionnaire when QSA is unavailable; omit the
  starting card if none is enabled; bypass the disabled Compass orientation gate.
- [x] Preserve integrated resolver inheritance, union, locks, staff and ownership.
- [x] Update feature reference, six-language Guide and guidance manifest.
- [x] Finish all required checks and review the staged implementation diff.
- [ ] Push, publish the draft PR, notify the project and close the journal task.

## Validation
- TypeScript, 334 frontend unit tests, i18n (3273 keys / six languages), touched-file
  ESLint, separate Webpack production build and Docker frontend build passed.
- Support browser suite: 14 passed on dev and compiled image; existing class
  settings/catalog browser regressions: 20 passed.
- Focused class support backend suite: 25 passed on isolated PostgreSQL and
  25 passed inside the backend validation image with read-only documentation.
- Final backend regression: 246 passed, six pre-existing raw-prompt-mode skips;
  Compass/guidance focused regression: 86 passed. Initial guidance-contract
  failures were corrected before the final run.
- Live synthetic backend: four write routes 403, gate false, saved session GET 200.
- `make guidance-refresh`, `make guidance-check` and `git diff --check` passed.
- Dedicated images: `counselorbot-c19-backend-validation:92` and
  `counselorbot-c19-frontend-validation:92`; no deployment.
- Commands and limitations: `docs/operations/class-support-access-validation.md`.

## Files and delivery
Backend orientation analysis/routes and Assistant guard; PostgreSQL orientation
fixtures and support tests; frontend Header, Compass/Assistant pages, home/goals
entries, localized Guide; product reference, guidance manifest, validation docs.
Implementation commit: `ac5bc32` (`feat: enforce class access for Compass and
Assistant`). PR reference and notification will be recorded after publication.

## Registered bugs
All entries are local Diario records; registration does not imply a GitHub issue.
- 9f68c137-3cf8-4a54-bdac-594412c34832: Compass writes ignore disabled access (local-only).
- 2d61dcc9-d68a-4bbd-aa50-7e764f986e9f: Assistant chat ignores disabled access (local-only).
- 21fbd029-a221-4d91-a47e-77e557d27513: disabled Compass still gates new students.
- affb1028-9332-48af-a036-cf7224ce7746: disabled tools recommended by Compass.
- f4d40ab1-103c-4cbb-b231-0d9f6ce66972: disabled support navigation remains visible.
- 94cbb5e1-c457-4345-bb75-df4a1146df11: disabled Compass completion writes (local-only).
- c178d669-355b-4d7c-a9a5-250a8cd2277c: stale six-language class access guidance.
- 7240ddac-9919-4663-85ec-eafa4ba965b4: guidance route inventory rejects nested
  dynamic routes. Initial title blamed missing documentation; corrected evidence
  confirms the guide already documents the forum. The test is fixed.
- cc48e416-4fc2-466a-abbe-0bb530175cb4: eight dependency advisories reported by
  npm installation (suspected, local-only, outside #92, no dependency changes).
- Unregistered bugs: none.

## Problems Encountered and Resolutions
- Orientation tests previously used SQLite/global AI replacement: converted to
  rolled-back PostgreSQL schemas and per-test monkeypatches.
- Guidance tests assumed unconditional QSA and only static one-segment routes:
  updated to the enabled starting rule and dynamic-route normalization.
- Separate dev/build snapshots avoid Next build interference and environment files.
- Remaining blockers: none. Publication and journal closure are the final steps.

## Decision Log
- Reuse existing catalog keys and resolver; no new access abstraction or schema.
- Apply guards to writes, retain unguarded owner-scoped historical reads.
- Preserve approved ASCII structure; only availability and existing panels change.
- Keep teacher-only active instruments available to staff in Compass recommendations.
- No successor is authorized. Report unblocked follow-up work to T without launch.
- Plan S9 (#95) depends on #92 and its other prerequisites. This draft does not
  unblock it on main until merged; no follow-up task or model was launched.

## Processes and remaining steps
Own dev processes stopped after cwd verification:
`kill -TERM 1744036 1787044 1787063` (backend 8072, frontend 3173).
Frontend validation container stopped; loopback 3175 is free.
The synthetic PostgreSQL container was stopped with
`docker stop c19-bussola-92-postgres`; all owned dev processes are stopped.
PR notification and journal closure will be recorded after publication.
