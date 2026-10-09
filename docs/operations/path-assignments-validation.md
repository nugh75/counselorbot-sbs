# TF6: Goal assignments in paths and standalone (#153)

## Implemented contract

`ClassPathStep` gains a fourth typed target: `step_type=assignment` with
`assignment_id`, a foreign key to `teacher_assignments` with `ON DELETE RESTRICT`.
The `class_path_step_target` check admits exactly one target per type.
`AssignmentPathStepInput` joins the strict discriminated input union.
`assignment_target` in `backend/path_step_types.py` is the single target check used
by save, publish, availability, launch and completion: the assignment belongs to
the path's class (422 `assignment_class_mismatch`), has no individual recipient
(422 `assignment_targeted`), is anchored to a catalog goal (422
`assignment_not_goal`), is not revoked (409 `assignment_revoked`) and its class is
active (409 `assignment_class_inactive`). `validate_composition` rejects the same
assignment twice in one path (422 `duplicate_assignment_step`). Path saves lock the
referenced assignment row before writing, so a concurrent revocation applies after
the save. The target is part of the immutable identity after activation.

The builder lists eligible assignments through
`GET /teacher/groups/{id}/path-assignments` (class teachers only, any author) and
creates new ones through the existing `POST /teacher/assignments` dialog, fixed to
the class and the whole class, with the existing `request_id` idempotency and
server-built goal and attachment snapshot.

Availability, launch and evidence share the standalone assignment. `start_href`
and `launch` return `/profilo/assegnazioni#assignment-{id}`; launching writes
nothing. `assignment_evidence` resolves on read: a current class member's
`AssignmentWork` with a `submission` and `submitted_at` at or after the step's
`active_from`. Opening, planning, reflections and feedback never count; withdrawal
clears the submission and with it the completion. A revoked assignment makes the
step unavailable (excluded from the ratio, no launch, no override, publish 409).
Teacher marks keep precedence. Progress responses carry the completion kind
`assignment_submission` and its time only.

Migration `20261009_assignment_steps` (advisory lock, replay-safe) adds the
column and replaces the TF5 target check only when it lacks `assignment_id`.
The TF5 migration now writes a frozen copy of its own check, so it still replays
on a database that does not yet have the TF6 column.

## Lean validation

Synthetic PostgreSQL only, in the disposable container
`c10-path-assignments-153-postgres` (loopback 18650, user `c5_test`, required by
the TF3 fixtures), removed after the run. No app dev server, browser journey,
screenshot, Docker image build or deployment.

```sh
DATABASE_URL=postgresql://c5_test@127.0.0.1:18650/counselorbot_test PYTHON_DOTENV_DISABLED=1 \
  backend/.venv/bin/python -m pytest -q --disable-warnings \
  backend/tests/test_path_assignments.py backend/tests/test_path_assignment_concurrency.py \
  backend/tests/test_assignment_steps_migration.py backend/tests/test_results_deep_dive.py \
  backend/tests/test_deep_dive_concurrency.py backend/tests/test_results_chat_migration.py \
  backend/tests/test_inapp_administration.py backend/tests/test_inapp_runner_concurrency.py \
  backend/tests/test_it_administration.py backend/tests/test_it_entry_concurrency.py \
  backend/tests/test_typed_steps_migration.py backend/tests/test_class_paths.py \
  backend/tests/test_assignments.py backend/tests/test_assignment_work.py \
  backend/tests/test_forum_privacy.py
npm test --prefix frontend
npm run i18n:check --prefix frontend
npm run build --prefix frontend
make guidance-refresh && make guidance-check
```

Covered: server-built snapshot and attachments, catalog deletion preserving the
delivered snapshot, cross-class, targeted, revoked, legacy non-goal and unknown
targets, duplicate targets, rejected saves writing nothing, request-id retry
(sequential and concurrent), save/revoke race, standalone and path sharing one
submission, explicit submission vs private planning and reflection, feedback not
required, pre-activation submission, withdrawal and resubmission, teacher override
and clear, revocation unavailability, membership changes, strict ordering and
target immutability, late-added step activation, unauthorized contexts, hash deep
link and migration replay and check constraint.

Browser journeys were not run in this lean build.
