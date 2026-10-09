# Institute credentials and canonical administration references (#149)

Scope: teacher-flow slice TF2 from `docs/operations/teacher-flow-plan.md`. Builds on
TF1 (#148, PR #159). No presets, CSV/API imports, typed path steps or guided-entry
evidence (#150-#155, #157) are implemented here.

## Secret storage decision

The institute stores the external password only as a **bcrypt verifier**
(`institutions.hashed_password`), never in a recoverable form. Plan section 5 is
explicit: teacher reads expose the code and `credentials_configured`, a saved hash
cannot be recovered to display the password, and teachers distribute the external
login separately. Class handoffs may show the institute code; the password is never
shown back to anyone. No encryption key is introduced.

The institute code is not secret: it is stored as entered (outer whitespace
trimmed), compared case-insensitively and unique across institutes. The password is
never trimmed or transformed; inputs above 72 UTF-8 bytes are rejected because
bcrypt would otherwise truncate them silently.

## Contracts

| Interface | Behavior |
|---|---|
| `PUT /teacher/institutions/{id}/credentials` | Member teacher only; body `{institution_code, password, revision}` parsed by hand so 422 errors never echo the secret; 409 `institution_revision_conflict` / `institution_code_conflict`; bumps `revision` and `credentials_revision`. |
| `PUT /admin/institutions/{id}/password` | Plaintext reset only; raw hashes rejected; responses carry `credentials_configured`, never `hashed_password`. |
| `/admin/administration-plans` create/edit | `institution_id` replaces legacy fields (rejected with `administration_credentials_moved_to_institution`); edits require `revision` (409 `administration_revision_conflict`); link needs admin or active membership (403 `institution_link_forbidden`); class institute must match (422 `administration_institution_mismatch`). |
| `GET /admin/administration-plans/institution-options` | Linkable institutes: all active for administrators, memberships otherwise. |
| `POST /user/administrations/{id}/verify-institution` | Authenticated; returns a 30-minute grant bound to user, plan, institute and credential revision; digest-only storage; 10 failures per user/plan in 15 minutes → 429. |
| Result writers | `/instruments/{code}/score`, `/questionnaire-result` and Telegram share `administration_context.require_result_context`; failures happen before any result or validation row. |

The grant proves a local check against the saved verifier only. There is no API,
SSO, autofill or background request to competenzestrategiche.it.

## Migration

`backend/migrations/20261009_institute_credentials.py` runs at startup after the
TF1 migration, in one transaction under an advisory lock. It adds the plan
institute FK, `institution_link_state`, `reconciliation_reason`, `revision` and
`institutions.credentials_revision`, then classifies only rows whose state is still
NULL, so replays change nothing.

| Legacy row | Result |
|---|---|
| No legacy code | `unlinked` (no-institute mode, unchanged behavior) |
| Unknown / duplicated / inactive code | `needs_reconciliation` (`institution_not_found` / `ambiguous_institution` / `institution_inactive`) |
| Class linked to another institute | `needs_reconciliation` (`class_institution_mismatch`) |
| Institute has a verifier; plan password matches or is empty | `linked`, plan password scrubbed |
| Institute has a verifier; plan password differs | `needs_reconciliation` (`credential_conflict`), canonical verifier kept |
| Empty institute slot; one consistent plaintext legacy value | verifier created from it, plans `linked`, duplicates scrubbed |
| Empty institute slot; competing or hash-like values | `needs_reconciliation` (`credential_reentry_required`); teacher re-enters on the institute |

Logs report counts only. Unresolved legacy values stay until an explicit editor
reconciliation, which scrubs them. Removing the legacy plan columns is left to a
later reviewed migration. A normal backend deployment runs the migration; no sudo
step is needed. Production backup/deploy remain owner operations.

## Validation (synthetic PostgreSQL only)

Disposable container `c4-institute-credentials-149-postgres` on 127.0.0.1:18649,
schemas created and dropped per test; invented secrets only.

```bash
DATABASE_URL=postgresql://c4_test@127.0.0.1:18649/counselorbot_test PYTHON_DOTENV_DISABLED=1 \
  backend/.venv/bin/python -m pytest -q backend/tests/test_institute_credentials.py \
  backend/tests/test_institute_credentials_migration.py backend/tests/test_institute_credentials_telegram.py
npm test --prefix frontend
npm run build --prefix frontend
make guidance-check
```

Each new backend test was first observed failing for the missing feature (404
endpoints, missing fields, plaintext password persisted in validation metadata,
bcrypt helper raising). Coverage: write-only credentials and no echo on 422 or in
logs, role matrix, revision and code conflicts, admin hash non-disclosure, plan
round trip/options, legacy field rejection, membership/class/inactive checks,
research visibility, reconciliation, grant issuance/throttling/binding/expiry/
rotation, no partial writes for score and manual results, instrument mismatch,
missing credentials, metadata scrubbing, concurrent plan edits, Telegram refusal
and migration replay for canonical/empty/conflicting/ambiguous/class cases.

Frontend unit tests cover credential payloads, verification parsing, grant
placement and plan institute field semantics. A Playwright suite
(`frontend/tests/institute-credentials.test.mjs`, intercepted synthetic APIs) and
six-language guide screenshots were produced before the owner's lean-build
instruction; the dev servers were then stopped and no further browser runs or
Docker builds were made.

`npm run i18n:check` previously failed on six missing `admin.ap` credential keys
(Journal `1a274e7a-0d9c-400c-9820-1dfe76549420`); those keys are removed with the
legacy plan credential form, so the check now passes.

## Delivery checks

| Check | Result |
| --- | --- |
| New #149 backend suites (API, migration, Telegram) | 29 passed on synthetic PostgreSQL |
| Focused regression: class access/Telegram/writes, class settings admin, institution categories, smoke, SQLite create_all, teacher context, PDF summary, class paths | 471 passed, 6 skipped; smoke plan-edit calls updated for the required `revision` |
| TF1 institute and membership suites | 28 passed (separate disposable TF1 database) |
| `test_smoke.py` on the branch | 204 passed, 2 failed; both failures reproduce unchanged on origin/main `ceb119d` and are registered in the Journal (`15c56ea2…`, `0efd4ef0…`) |
| Frontend units (`npm test --prefix frontend`) | 362 passed |
| `npm run i18n:check --prefix frontend` | Passed (previous baseline failure removed with the legacy keys) |
| `npm run build --prefix frontend` | Passed |
| TypeScript and ESLint on touched files | Passed (one pre-existing `window.location.href` warning) |
| `make guidance-check` | Passed |
| Browser suite and guide screenshots (before the lean-build instruction) | 11 + 14 (TF1) + 12 (guide) passed on a loopback dev server; servers stopped |

A full `backend/tests` run was stopped at 57% after the lean-build instruction:
external-provider timeouts made it impractically slow. It is not claimed as passed.
