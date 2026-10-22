# Institute credentials and canonical administration references (#149)

Scope: teacher-flow slice TF2 from `docs/operations/teacher-flow-plan.md`. Builds on
TF1 (#148, PR #159). No presets, CSV/API imports, typed path steps or guided-entry
evidence (#150-#155, #157) are implemented here.

## Secret storage decision

The institute keeps the external password in two forms with separate jobs:

- `institutions.hashed_password` is the **bcrypt verifier** checked by
  `POST /user/administrations/{id}/verify-institution`. It is written on every
  credential save and reset and is never returned to any client.
- `institutions.encrypted_password` is a **Fernet-encrypted display copy** used by
  the external (`external_it`) operational-plan step and by the explicit teacher
  reveal. The class password is a class access code, not a personal secret: every
  student who can launch the step must be able to read it before opening
  competenzestrategiche.it. Both UIs keep it masked behind a **Show/Hide** control.

Teacher list/detail and administrator responses expose only the code and
`credentials_configured`; neither the password nor either stored form is returned.
The dedicated reveal endpoint below returns the decrypted display copy only to an
active institute member, with `Cache-Control: no-store`.
The display copy lives in the existing `personal_api_credentials` volume and uses
the `INSTITUTION_CREDENTIAL_KEY` / `_FILE` store (optional; a managed key is
created in that volume on first save). No new volume or Compose change is needed.
Existing installations that stored only the bcrypt verifier have no readable copy:
a teacher must re-enter the credentials once (`Replace external credentials`) to
populate it. Until then, and whenever the copy cannot be decrypted, the student
step falls back to "Not available here: ask your teacher" and the institute card
asks the teacher to re-enter the password once.

The institute code is not secret: it is stored as entered (outer whitespace
trimmed), compared case-insensitively and unique across institutes. The password is
never trimmed or transformed; inputs above 72 UTF-8 bytes are rejected because
bcrypt would otherwise truncate them silently.

## Contracts

| Interface | Behavior |
|---|---|
| `PUT /teacher/institutions/{id}/credentials` | Member teacher only; body `{institution_code, password, revision}` parsed by hand so 422 errors never echo the secret; 409 `institution_revision_conflict` / `institution_code_conflict`; stores the bcrypt verifier and refreshes the encrypted display copy; bumps `revision` and `credentials_revision`. |
| `GET /teacher/institutions/{id}/password` | Active institute member only; returns `{password, reason}` from the decrypted display copy (`reason` `not_configured` / `display_copy_missing` when unavailable); sends `Cache-Control: no-store`. List and detail responses never include the password. |
| `PUT /admin/institutions/{id}/password` | Plaintext reset only; raw hashes rejected; responses carry `credentials_configured`, never `hashed_password`, `encrypted_password` or the password. A `null` plaintext clears both stored forms. |
| `POST /user/paths/{path_id}/steps/{step_id}/launch` | Class members only. For `external_it` plans the `institution` object also carries `institution_password` (decrypted display copy, `null` when unavailable); in-app launches always return `null`. |
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

`backend/migrations/20261022_institution_password_display.py` then adds the
nullable `institutions.encrypted_password` column under its own advisory lock
(`ADD COLUMN IF NOT EXISTS`, replay-safe). It never backfills: a bcrypt verifier
cannot be decrypted, so legacy rows keep `NULL` and both the student step and the
institute card show the fallback until the teacher re-enters the credentials.

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
  backend/tests/test_institute_credentials_migration.py backend/tests/test_institute_credentials_telegram.py \
  backend/tests/test_institution_password.py backend/tests/test_institution_password_display_migration.py
DATABASE_URL=postgresql://c5_test@127.0.0.1:18650/counselorbot_test PYTHON_DOTENV_DISABLED=1 \
  backend/.venv/bin/python -m pytest -q backend/tests/test_it_administration.py
npm test --prefix frontend
npm run build --prefix frontend
make guidance-check
```

Each new backend test was first observed failing for the missing feature (404
endpoints, missing fields, plaintext password persisted in validation metadata,
bcrypt helper raising). Coverage: credential ownership and no echo on 422 or in
logs, encrypted display copy at rest and its reveal/clear paths, role matrix,
revision and code conflicts, admin non-disclosure of hash and password, plan
round trip/options, legacy field rejection, membership/class/inactive checks,
research visibility, reconciliation, grant issuance/throttling/binding/expiry/
rotation, no partial writes for score and manual results, instrument mismatch,
missing credentials, metadata scrubbing, concurrent plan edits, Telegram refusal,
launch reveal only for external class members, and migration replay for
canonical/empty/conflicting/ambiguous/class and display-copy columns.

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

## Display copy follow-up (2026-10-22)

The password is now displayed to class members in the external step and can be
revealed by a member teacher in the institute card, so the write-only wording
above is superseded by the storage decision at the top of this document.

| Check | Result |
| --- | --- |
| `test_institute_credentials.py`, both credential migration suites and Telegram (`c4`, 127.0.0.1:18649) | 31 passed |
| `test_it_administration.py` (`c5`, 127.0.0.1:18650) | 33 passed |
| `test_institution_password.py` (key fallbacks, no database) | 3 passed |
| Frontend units | 608 passed |
| `tsc --noEmit`, `i18n:check` (3417 keys, six languages) | Passed |
| `make guidance-refresh`, `make guidance-check` | Passed |
| Production frontend build | Passed |

The role-matrix test now checks `admin -> 403` with a non-member account:
administrators reach the teacher area only through an active institute membership
(`require_teacher`), so the old expectation using the member default user was
stale on `main`. No authorization behavior changed in this fix.
