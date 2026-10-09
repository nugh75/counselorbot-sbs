# TF5: Optional guided deep dive on the bound result (#152)

## Implemented contract

`ClassPathStep` gains a third typed target: `step_type=guided_results_chat` with
`results_step_id`, a self-reference to an earlier `questionnaire_administration`
step of the same path. The `class_path_step_target` check admits exactly one target
per type. `GuidedResultsChatStepInput` joins the strict discriminated input union.
`validate_composition` in `backend/path_step_types.py` rejects, before any write:
an unknown, unsaved, foreign-path or non-administration reference (422
`results_step_invalid`), a deep dive before its administration (422
`results_step_order`), two deep dives on one administration (422
`duplicate_results_chat`) and the removal of an administration that a kept deep
dive references (409 `results_step_referenced`). The reference belongs to the
activated target identity, so changing it after activation is 409
`activated_step_target_immutable`; reordering keeps ID and `active_from`.

Availability, launch information and the instrument used for tool access come from
the linked administration through the shared `administration_target`. The step's
`start_href` is `/profilo/percorsi/{path}/{step}/approfondimento`; `launch` returns
the step identity and that link.

`POST /user/paths/{path}/steps/{step}/deep-dive` (`backend/results_deep_dive.py`)
reuses `require_step_launch` (membership, strict order, availability, tool access,
path row lock). The bound result is the first qualifying result of the linked
administration step from the same evidence resolver that completes it (guided entry
or confirmed import). Without one, including a teacher override alone, the answer
is 409 `results_step_incomplete`. The server issues the session ID and stores one
`ClassPathDeepDiveSession` per step/student/result (unique, plus a unique session
ID); a retry, reload or concurrent start returns the same session and result.

Completion is resolved on read by `deep_dive_evidence`: a binding started after the
step's activation, whose result still qualifies for the administration step, plus a
`guided_chat_completed` marker on that exact session for the same student and
questionnaire at or after the binding start. The marker writer is shared by `/chat`
and `/chat/stream` and now stamps the turn time instead of the transaction start.
Failed, truncated and preview turns write no marker. Deleting the result cascades
the binding; invalidating the administration evidence removes the deep-dive
completion too. Removing the deep dive leaves the administration evidence intact.

Migration `20261009_guided_results_chat_steps` (advisory lock, replay-safe) adds the
column, replaces the TF3 target check only when it lacks the new branch and creates
`class_path_deep_dive_sessions`. Existing rows are untouched.

## Lean validation

Synthetic PostgreSQL only, in the disposable container
`c7-deep-dive-152-postgres` (loopback 18650, user `c5_test`, required by the TF3
fixtures). No app dev server, browser journey, screenshot, Docker image build or
deployment.

```sh
DATABASE_URL=postgresql://c5_test@127.0.0.1:18650/counselorbot_test PYTHON_DOTENV_DISABLED=1 \
  backend/.venv/bin/python -m pytest -q --disable-warnings \
  backend/tests/test_results_deep_dive.py backend/tests/test_deep_dive_concurrency.py \
  backend/tests/test_results_chat_migration.py backend/tests/test_inapp_administration.py \
  backend/tests/test_inapp_runner_concurrency.py backend/tests/test_it_administration.py \
  backend/tests/test_it_entry_concurrency.py backend/tests/test_typed_steps_migration.py \
  backend/tests/test_class_paths.py
npm test --prefix frontend
npm run i18n:check --prefix frontend
npm run build --prefix frontend
make guidance-check
```

Backend cases: omission and linking, every reference rule without writes, activated
reference immutability and reorder, final marker binding through `/chat` and
`/chat/stream`, no completion on the first guided step, idempotent start/resume,
entry session / other student / other instrument / earlier marker / unbound session
markers, failed stream then successful retry, missing result and teacher override
without result, outsider and teacher starts refused, strict lock, deep-dive removal
keeping the administration done, deleted result and invalidated entry, concurrent
starts with an injected delay (one binding), migration upgrade from a TF4 schema
run twice and the widened check rejecting mixed targets.

Frontend units: start acknowledgement, distinct incomplete/locked/error failures,
forged path/step/session/result rejection, builder source selection (saved and not
yet linked administrations only), deep-dive step parsing for teacher and student,
progress labels and six-language copy.
