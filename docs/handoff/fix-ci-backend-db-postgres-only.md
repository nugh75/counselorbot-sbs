# Handoff: fix/ci-backend-db-postgres-only

Issue #678 (Closes), follow-up #679. Milestone: Green test baseline (Oct 2026).

## Done
- `backend-db.yml`: `tests-postgres` pinned to `ubuntu-24.04` (ubuntu-26.04 graphviz has no circo/twopi); removed the `sudo dot -c` workaround; removed jobs `tests-sqlite` and `startup-sqlite`.
- Removed `sqlite_known_failures.txt`, 5 SQLite-only test files, the SQLite branch of `backend/tests/conftest.py`, the 5 `test_sqlite_load_concurrency` entries in `postgres_known_failures.txt`.
- `test_dual_db_checks.py`: ratchet subprocess test now uses `postgres_known_failures.txt` / `TEST_DB=postgres`.
- Docs: CONTEXT.md, `docs/operations/dual-db-ci.md`, ADR-0003 §5.2 table.

## Notes
- `test_smoke.py::test_concluding_keeps_the_result_where_the_person_chose` was not in `postgres_known_failures.txt` on main: nothing to remove.
- `backend/tests/artifact_database.py` still has a `TEST_DB=sqlite` path: left for #679.
- Not touched: test_prompt_routing x2, test_platform_guidance x1 (product regressions fixed by another agent); CI stays red only for those.

## Manual steps
None (no deploy, no sudo).
