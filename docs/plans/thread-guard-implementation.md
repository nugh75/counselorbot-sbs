# Thread guard — implementation plan

**Goal:** a per-turn evaluator that reports, as facts, whether a counselor turn
held the thread, asked a fitting question, grounded its advice, and developed
the previous question; its verdict enters the next turn's envelope.

**Spec:** `docs/plans/thread-guard.md`

**Architecture:** a new `backend/thread_guard.py` holding the schema, the input
builder, the model call and the rendering. A daemon thread writes the verdict
to `Log(action="thread_guard")` after each turn; `chat_preparation` reads the
latest verdict and injects it, either as its own `[THREAD]` block or, at step
entry, folded into the session ledger. A dedicated admin panel picks the model.

**Tech stack:** FastAPI, SQLAlchemy, pydantic v2, pytest against Postgres
(`backend/tests/artifact_database.artifact_session`), Next.js admin panel.

## Global constraints

- Default model: preset `Qwen 3.8B - no reasoning` (ollama `qwen3.8:latest`,
  `disable_thinking` true). The admin panel may point the guard at any preset,
  external providers included.
- Config keys: `thread_guard_enabled` (default `false`), `thread_guard_preset_id`.
- No schema migration. Verdicts live in `Log`.
- Every failure path renders an empty block and raises nothing.
- Note text is English, one factual sentence, ≤160 characters, no imperatives.
- `[THREAD]` block ≤400 characters, at most 2 notes.
- Admin strings translated in all six UI languages.

---

### Task 1: verdict schema and rendering

**Files:** create `backend/thread_guard.py`, create
`backend/tests/test_thread_guard.py`

**Produces:** `Verdict` (pydantic model with `on_thread`, `question_fit`,
`advice_grounded` as `Check{ok: bool, note: str|None}` and `answered:
Answered{last_question_developed: bool}`), `parse(raw: str) -> Verdict | None`,
`notes(verdict: Verdict) -> list[str]`, `render(notes: list[str]) -> str`.

- [ ] Tests: a healthy verdict renders `""`; two failing checks render a
      `[THREAD]` block naming both; three failing checks keep only the two most
      severe, `advice_grounded` before `on_thread` before `question_fit`; the
      block never exceeds 400 characters; `parse` returns `None` on invalid
      JSON, on a missing field and on a note longer than 160 characters after
      trimming; `answered.last_question_developed=false` adds its own line.
- [ ] Implement, run `pytest backend/tests/test_thread_guard.py -v`, commit.

### Task 2: storage and staleness

**Consumes:** Task 1's `Verdict`.
**Produces:** `store(db, *, session_id, username, turn_hash, verdict)`,
`latest(db, *, session_id, turn_hash) -> Verdict | None`,
`turn_hash(user_text: str, bot_text: str) -> str`.

- [ ] Tests (`artifact_session`): a stored verdict comes back for its own turn
      hash; a verdict written for an earlier turn is not returned for a new one;
      no row returns `None`; a row whose payload no longer parses returns `None`.
- [ ] Implement over `models.Log(action="thread_guard")`, run tests, commit.

### Task 3: input builder

**Produces:** `build_input(db, *, session_id, username, questionnaire_type,
step_id, step_prompt, language, advice_ids, candidate_ids) -> str`.

- [ ] Tests: the built input carries the step prompt, the student's last
      answers and the open question from `session_ledger.build`; it never
      carries a `guard` key even when one is present in the ledger dict; it is
      capped at 2500 characters; PII in the exchanges is redacted; for `IDEA`
      the current map replaces the step prompt.
- [ ] Implement, run tests, commit.

### Task 4: evaluation and degradation

**Produces:** `preset(db) -> tuple[str, str, bool] | None`,
`enabled(db) -> bool`, `evaluate(session_id, ...) -> None` (blocking worker),
`schedule(...)` (daemon thread, fire and forget).

- [ ] Tests: `enabled` false makes `evaluate` return without calling the model
      (a stub service that raises if called); a missing or non-numeric preset
      config returns `None` and skips; an `AIError`, a timeout and unparseable
      output each leave no row and raise nothing; a valid reply writes one row.
- [ ] Implement, run tests, commit.

### Task 5: injection

**Files:** modify `backend/session_ledger.py`, `backend/chat_preparation.py`,
`backend/routes/chat.py`.

- [ ] Tests: with a stored verdict, an ordinary turn's system prompt contains
      the `[THREAD]` block; at step entry (`use_phase_prompt`) the notes appear
      inside the ledger block and no separate `[THREAD]` is added; a note
      identical to the previous turn's is suppressed; with the feature off the
      prompt is byte-identical to today's.
- [ ] `session_ledger.build` accepts `guard_notes`, `_compose` renders them
      under one heading; `chat_preparation` reads `thread_guard.latest` and
      injects; `routes/chat.py` calls `thread_guard.schedule` after the turn is
      logged, in both the buffered and the streaming branch.
- [ ] Run `pytest backend/tests/test_thread_guard.py backend/tests/test_session_ledger.py backend/tests/test_chat_preparation.py -v`, commit.

### Task 6: seed, admin panel, i18n

**Files:** create `backend/thread_guard_seed.py`,
`frontend/src/components/admin/ThreadGuardPanel.tsx`; modify
`backend/main.py`, `frontend/src/app/admin/page.tsx`,
`frontend/src/lib/i18n-admin.ts`.

- [ ] Test: the seed picks an existing active ollama `qwen3.8` preset with
      thinking disabled and writes its id into `thread_guard_preset_id`;
      it creates that preset when none exists; run twice it changes nothing and
      never overwrites an admin-chosen value.
- [ ] Panel: an on/off switch and a preset dropdown fed by `/api/admin/presets`
      (so any provider can be chosen), saving through `POST /api/admin/config`.
      Register the tab, translate its strings in it/en/es/fr/de/sv.
- [ ] Run the backend tests and `npx tsc --noEmit`, commit.

### Task 7: close out

- [ ] `python -m backend.tests.test_smoke` inside the backend container.
- [ ] `docker compose up -d --build`, check status and logs.
- [ ] Update `CONTEXT.md` with the thread guard entry.
- [ ] Push the branch.
