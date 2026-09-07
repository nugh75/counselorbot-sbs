# Thread guard

A per-turn evaluator that reads a finished counselor turn and reports, as
facts, whether the conversation still holds its thread: whether the question
asked belongs to the step's mandate, whether the advice given follows from
something the student actually said, and whether the previous question was
answered or developed. Its verdict enters the next turn's envelope as data,
never as an order.

## Scope and acceptance

Judge the counselor, not the student. A student who changes subject is not
derailing; the guard reports only when the counselor neither followed the new
thread nor reconnected it to the instrument. Nothing the guard writes is ever
shown to the student, quoted back, or apologised for.

Deterministic work stays deterministic. The age of an open question, a repeated
step, and whether an advice id belongs to the turn's certified candidates are
already established by `session_ledger` and `recommendation_blocks`; the model
is asked only for the judgement no rule can give — relevance, grounding, and
whether the thread holds.

Accepted when: a healthy turn injects nothing; a failing model injects nothing
and raises nothing; the verdict never delays or blocks a turn; the feature flag
off leaves today's behaviour byte-identical.

## How it works

**After turn T** — a background task (`background_tasks` in `routes/chat.py`,
both the buffered and the streaming branch) calls `thread_guard.evaluate()`.
It builds the input, calls the preset named by `guardian_preset_id` with JSON
mode and thinking disabled, 20s timeout, validates the reply against a pydantic
schema, and writes `Log(action="thread_guard")` carrying the verdict and the
turn hash. An invalid or late reply is discarded.

**Input**, capped at ~2500 characters — a small local model on a larger input
becomes slow and vague:

1. The turn's mandate: instrument and the step's **name**, never its prompt.
   Given the script verbatim the judge ticked its instructions off and condemned
   a turn that answered what the student had actually asked; the step names the
   area under discussion, not what the turn must contain. For IDEA the current
   map takes its place.
2. The ledger dict from `session_ledger.build()`, minus the `guard` key: open
   question and its age, pending and refused actions, repeated step, the
   student's recent answers.
3. The last three exchanges, PII-redacted, ~250 characters each. A step entry is
   shown as "the student said nothing": `effective_user_input` there is the
   platform's hidden directive, and printed as the student's words it told the
   judge the student had asked for things the step prompt had asked for.
4. The advice declared in the turn: the ids from the `recommendations` block
   plus the certified candidates retrieved. Catalog membership is already
   enforced in code; the guard adds whether the advice follows from the
   student's own words.
5. Language.

The guard never sees its own earlier notes. Given them, it confirms itself and
amplifies the same finding every turn.

**Output** — three fields, English, because these are instructions for a model
and not text for a student (the criterion already used for `tool_brief_seed`):

```json
{
  "on_thread":       {"ok": true,  "note": null},
  "question_fit":    {"ok": false, "note": "Asked about exam anxiety; this step is about planning time."},
  "advice_grounded": {"ok": true,  "note": null}
}
```

A fourth field asked whether the counselor's open question had been taken up.
Both judges tried answered "not developed" on most turns whatever the turn held,
so it measured the model's prior rather than the conversation. It is gone: the
ledger already knows which question is open and clears it the moment the student
replies, and `session_ledger.open_question_note` carries that fact onto free
turns, where the ledger itself is deliberately not injected.

`note` is one factual sentence of at most 140 characters. The guard's prompt
forbids imperatives and "should": the verdict states what happened, the
counselor decides what to do about it, and a note that arrives as an order is
dropped rather than injected. A rambling note keeps its first sentence and an
over-long one is trimmed at a word boundary, because a small local model
overshoots often enough that rejecting the whole verdict would throw away most
of them. The model reports only whether the last
question was developed; which question is open and how old it is comes from the
ledger, which already computes both — less surface to hallucinate.

**Before turn T+1** — `chat_preparation` reads the session's latest guard row.
A row whose turn hash does not match is stale and ignored. A row not yet
written is simply absent: the turn never waits, and that verdict applies one
turn later instead.

- Ordinary turn: a `[THREAD]` block of at most 400 characters carrying only the
  failing fields. A healthy turn injects nothing — a section that says "all
  fine" every turn burns envelope and teaches the model to skip it.
- Step entry: the notes go into the ledger dict instead and render under its
  existing 1900-character cap, so they are not stated twice.

Either way the text is recorded in `components["thread_guard"]`, so it reaches
the logs and `prompt_audit` with no extra work.

**Noise defences.** A guard that always finds something becomes background the
model ignores. At most two notes per turn, in fixed severity order
(`advice_grounded`, `on_thread`, `question_fit`); a note identical to the
previous turn's is suppressed by normalized hash, as duplicate recommendations
already are; an unanswered question is raised only within the age the ledger
already treats as live (`OPEN_QUESTION_MAX_AGE`, 2 turns) — past that, the
conversation has moved on and insisting is worse than silence.

**Degradation.** Timeout, invalid JSON, missing preset, model down, feature off:
no block. Never an error, never a blocked turn, never a wait. The same rule the
ledger follows — a gap degrades to an empty block instead of a failure.

## Delivery plan

1. `backend/thread_guard.py`: input builder, prompt, pydantic schema,
   `evaluate()`, `render()`. Tests first.
2. `session_ledger.build()` accepts the notes and `_compose` renders them. The
   existing logic is not touched.
3. `chat_preparation` reads the verdict and either injects `[THREAD]` or hands
   the notes to the ledger at step entry.
4. `routes/chat.py`: the background task in both branches.
5. Config `feature_thread_guard` (default off) and `guardian_preset_id`, with
   two admin panel fields.
6. Observation phase: run with logging only, no injection, over real sessions,
   and read the verdicts by hand before enabling the block.
7. Second step, declared and separate: the Compass. It has its own route and
   `OrientationSession`, and does not pass through `chat_preparation` or the
   ledger, so it is a second hook rather than an extension. Its mandate differs
   — it informs and suggests and never writes — so `advice_grounded` becomes
   "the tools proposed follow from what the student said" and `on_thread`
   becomes "still orienting, rather than slipping into counselling".

No schema migration: verdicts live in `Log`.

## Boundaries

- The guard never writes to the Taccuino, the Libretto, the Portfolio or the
  recommendation state, and never changes what the student sees in the turn
  being judged.
- It does not judge the student, and produces no score about them.
- It reads the ledger; it does not replace it or change when the ledger is
  injected.
- It runs on a preset of its own, so a conversation served by an external
  provider can be watched by a local model.
- A panel over the logged verdicts is separate work, not part of this.

## Verification

Tests in `backend/tests/test_thread_guard.py`:

- all four fields healthy renders an empty block;
- invalid JSON, a timeout and a missing preset each render an empty block and
  raise nothing;
- a note identical to the previous turn's is suppressed;
- at most two notes, in severity order;
- at step entry the notes are inside the ledger and no separate `[THREAD]` is
  added;
- the input builder excludes the `guard` key;
- a verdict whose turn hash does not match is ignored;
- with the feature off no model call is made.

Three things tests cannot settle, and that the observation phase exists for:
whether a small local model judges relevance well enough to be worth reading;
what one extra local call per turn costs under real load, IDEA paying it on top
of its map patch; and whether the counselor keeps the block to itself instead of
apologising to the student about it. Like the semantic non-repetition already
documented in `CONTEXT.md`, that last one has to be watched live.
