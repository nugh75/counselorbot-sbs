# TF7: Exact-discussion forum steps with isolated metadata completion (#154)

## Implemented contract

`ClassPathStep` gains a fifth typed target: `step_type=forum` with `topic_id`, a
foreign key to the class forum discussions. The `class_path_step_target` check
admits exactly one target per type. `ForumPathStepInput` joins the strict
discriminated input union. `forum_target` in `backend/path_step_types.py` is the
single target check used by save, publish, availability, launch and completion:
the discussion belongs to the path's class (422 `forum_topic_class_mismatch`), is
published and not hidden (409 `forum_topic_unavailable`), its class is active (409
`forum_class_inactive`) and the class's own forum setting is on (409
`forum_disabled_for_class`). `validate_composition` rejects the same discussion
twice in one path (422 `duplicate_forum_step`). Path saves lock the referenced
discussion row before writing, so a concurrent hide applies after the save. The
target is part of the immutable identity after activation.

The builder reads the discussions through the forum's own
`GET /groups/{id}/forum/topics` and keeps only published, visible ones. Path
responses never carry the title: the step's target summary is `{id, group_id,
locked}`.

Completion is resolved on read. `forum_evidence` returns the current class member's
earliest own reply in that exact discussion with `status=published`, no
`hidden_at`, no `deleted_at` and `created_at` at or after the step's `active_from`
(completion kind `forum_reply`). Pending replies, other discussions, other authors,
the opening message and pre-activation replies never count. Approval qualifies the
existing reply; hide, reject and delete remove it unless another qualifying reply
remains; restore brings it back. A premoderated author edit returns the reply to
pending. Lock keeps earlier evidence. A hidden discussion, an archived class or a
class forum switched off makes the step unavailable (excluded from the ratio, no
launch, no override, publish 409). The forum step ignores the student's tool view
and the union of their classes: only the path class's own forum setting counts,
exactly as on the forum routes. `/user/paths` adds `forum_state` (`pending`,
`hidden`, `locked`, `muted`, booleans only) for available forum steps.

## Privacy seam

`backend/forum_completion.py` is the named metadata reader, the only module outside
the forum boundary that queries forum tables. `tests/test_forum_privacy.py` allows
it to name only these columns and never a whole forum row:

| Model | Columns |
|---|---|
| Discussion | `id`, `group_id`, `status`, `hidden_at`, `locked` |
| Reply | `id`, `topic_id`, `author_username`, `status`, `hidden_at`, `deleted_at`, `created_at` |
| Mute | `id`, `group_id`, `username`, `lifted_at`, `until` |

The same test requires `backend.path_step_types` to be its only importer and pins
every module that can load it, at any depth, to the class-path routes, the
administration seams that already import `path_step_types`, and `main`. Chat, RAG,
context builders, exports and PDFs cannot reach it without failing the gate.
`tests/test_path_forum.py` records every SQL statement issued while resolving
student and teacher path views and asserts that no forum body, title, display
name, reason, read marker or moderation log column is selected, and that no
forum marker text appears in the responses.

The pre-existing baseline failure of
`test_forum_import_graph_has_no_ai_rag_context_or_export_path` came from
`routes.forum` importing `routes.groups` for `_visible_group_query`, which pulled in
`institution_access` and other class-management modules. The helper now lives in
`backend/group_visibility.py`; `routes.groups` re-imports it, and the forum import
graph shrinks to `routes.forum`, `forum_schemas`, `auth`, `database`, `models`,
`group_visibility`, `class_tools` and `class_access`. The test was tightened, not
relaxed.

## Migration

`20261010_forum_steps` (advisory lock, replay-safe) adds the column, taking the
referenced table from the model, and replaces the TF6 target check only when it
lacks `topic_id`. The foreign key uses the default `NO ACTION`: deleting a
referenced discussion is refused, while deleting the whole class still cascades
to its discussions, paths and steps in one statement.

## Lean validation

Synthetic PostgreSQL only, in the disposable container
`c11-forum-steps-154-postgres` (loopback 18650, user `c5_test`, required by the TF3
fixtures), removed after the run. No app dev server, browser journey, screenshot,
Docker image build or deployment.

```sh
DATABASE_URL=postgresql://c5_test@127.0.0.1:18650/counselorbot_test PYTHON_DOTENV_DISABLED=1 \
  backend/.venv/bin/python -m pytest -q --disable-warnings \
  backend/tests/test_path_forum.py backend/tests/test_path_forum_concurrency.py \
  backend/tests/test_forum_steps_migration.py backend/tests/test_forum_privacy.py \
  backend/tests/test_path_assignments.py backend/tests/test_path_assignment_concurrency.py \
  backend/tests/test_assignment_steps_migration.py backend/tests/test_results_deep_dive.py \
  backend/tests/test_deep_dive_concurrency.py backend/tests/test_results_chat_migration.py \
  backend/tests/test_inapp_administration.py backend/tests/test_inapp_runner_concurrency.py \
  backend/tests/test_it_administration.py backend/tests/test_it_entry_concurrency.py \
  backend/tests/test_typed_steps_migration.py backend/tests/test_class_paths.py \
  backend/tests/test_assignments.py backend/tests/test_assignment_work.py
npm test --prefix frontend
npm run i18n:check --prefix frontend
npm run build --prefix frontend
make guidance-refresh && make guidance-check
```

Covered: exact discussion, class, author and timing matrix; pending, approval,
hide, restore, reject, delete and premoderated edit; two qualifying replies;
locked discussion and muted student; hidden discussion; class archive and
restore; class forum setting under the All tools view and under another class's
view; unauthorized contexts and self-mark refusal; strict ordering, target
immutability, membership loss and late-added steps; concurrent save and hide;
concurrent replies and approvals; migration replay, check constraint and delete
behavior; SQL-level absence of forum text columns.

Browser journeys were not run in this lean build.
