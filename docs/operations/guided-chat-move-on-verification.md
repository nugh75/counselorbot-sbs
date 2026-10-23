# Guided chat: invitation to move on (#411)

Verification of when the guided chat invites the student to continue after several exchanges in the same step.

## Current behaviour
- `backend/step_closure.py::step_choice_context` adds `[STEP DIRECTION CHOICE]` to the system prompt when `(assistant exchanges in the step + 1) % threshold == 0` (default threshold 5, config `step_safety_threshold` / env `STEP_SAFETY_THRESHOLD`). It repeats every `threshold` exchanges, not every turn.
- Only intermediate steps with a next step are eligible: free chat, IDEA, intro, synthesis/farewell and last steps never get it.
- The counter is a reminder, never consent (#390 superseded by #410): no `[[AVANZA_STEP]]` is injected or forced; the person's choice (`[GUIDED CHOICE]`) decides. Exchanges inside a chosen exploration are not counted.
- The exchange count comes from persisted `chat_message` logs, so a resumed session keeps the same invitation point.
- Frontend (`GuidedChatInterface.tsx`): the next-step button and the `advance` quick reply stay available whenever a next step exists, and are disabled only while an exploration is active or an agreement is pending.

## Simulated verification (no live model)
- `test_server_side_step_closure.py::test_threshold_reminds_the_model_but_never_overrides_the_choice` — 6 turns, `/chat` and `/chat/stream`: invitation only at turn 5, no control signal, step never completed.
- `test_guided_choice.py::test_resumed_session_still_invites_to_move_on_after_several_exchanges` — resumed history reaches the invitation; exploration turns are not counted.

## Not verified
Whether a live model words the invitation naturally is not covered; it needs observation with a real model.

No defect found; no behaviour changed.
