# Handoff — fix/reasoning-routing-guidance-routes

Issue: #677 · Milestone: Green test baseline (Oct 2026)

## Regressions fixed

1. `backend/tests/test_prompt_routing.py`
   - `test_a_model_that_only_thought_is_replaced_by_the_reserve`
   - `test_never_mix_models_after_the_answer_has_started`
   - Cause: PR #649, commit e3cb8a7d («hide reasoning consistently across
     chat providers»). With reasoning off, `stream_response` drops reasoning
     events and buffers content until the provider finishes (by design).
     The routing fixture sets `disable_thinking=true`, so both tests hit the
     hidden path instead of the streaming invariants they protect.
   - Decision: the tests were outdated, not the code. Both now set
     `ai.disable_thinking = False` and keep checking the original contracts
     (visible reasoning + fallback; no model mixing after visible output).
     The hidden path is already covered by `test_reasoning_off_contract.py`.
     No reasoning was made visible again.

2. `backend/tests/test_platform_guidance.py::test_reference_personal_routes_are_real_and_cover_the_personal_area`
   - Cause: PR #651, commit 0fef2715 («unify operational plan activity
     flow») shortened the guide row to "`/approfondimento`". The page
     `frontend/src/app/profilo/piani-operativi/[pathId]/[stepId]/approfondimento/page.tsx`
     still exists (same `PlanActivityFlow`), so the guide was wrong.
   - Fix: full route restored in `docs-counselorbot/funzionalita-counselorbot.md`;
     `make guidance-refresh` updated `docs/operations/platform-guidance-state.json`.

## Checks

- Ephemeral Postgres 15 (`counselorbot_test`, port 55432, removed after):
  `test_prompt_routing.py`, `test_platform_guidance.py`,
  `test_reasoning_off_contract.py` → 53 passed, ratchet clean.
- `scripts/check-platform-guidance.py --check` → aligned.
- Local Python 3.9 shim cannot import the backend (`datetime.UTC`); use the
  project venv (Python 3.12).

## Out of scope

- `.github/` and SQLite test files (handled by another agent).
