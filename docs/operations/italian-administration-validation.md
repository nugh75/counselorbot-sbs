# TF3: Italian administration and typed class path steps (#150)

## Implemented contract

`ClassPathUpdate.steps` is a strict discriminated union of `tool` and
`questionnaire_administration`. A missing discriminator remains `tool` for older
clients. Target columns have a matching PostgreSQL check and foreign key. Other
step types are deliberately introduced by their own later slices; TF3 does not
publish unsupported targets or add preset/import editors.

`backend/path_step_types.py` is the shared builder, availability, launch and
completion boundary for TF4–TF8. `backend/questionnaire_entry.py` is the atomic
writer. The old tool evaluator remains unchanged. A path row lock serializes
updates and guided-entry retries; entry also locks the administration before
validating the shared institute-grant contract from #149. Activated targets cannot
be repurposed in either the path editor or research administration editor.

Class list/create/detail/edit and research use one `AdministrationPlan` ID and
revision. Class context is resolved server-side. A co-teacher can edit the class
administration without receiving unrelated research dataset access. Italian plans
use `external_it`; this does not claim that an external submission was verified.

`POST /user/paths/{path}/steps/{step}/launch` returns the institute code, external
URL and factor definitions, never a password. Opening it creates no evidence.
The student separately receives the external password from the teacher.
`POST /user/paths/{path}/steps/{step}/guided-entry` verifies current membership,
strict order, target availability, the exact plan's institute grant, all factor
scores (integer stanines 1–9) and any selected result's ownership/context. A manual
entry commits result, `QuestionnaireGuidedEntry` and `ClassPathStepEvidence`
together. The response contains all three IDs and the accepted session. A retry
with the same authenticated user/request/session/step and payload returns the same
acknowledgement; a changed payload is a 409. Failed persistence rolls back all
three records. Browser scores/retry IDs survive errors in an account/path/step
session draft; passwords/grants are transient. Chat opens only on a valid durable
acknowledgement, with the saved result's scores.

`QuestionnaireImportConfirmation` represents a future committed teacher
confirmation, with exact result/student/administration/batch/actor/time. Distinct
`confirmed_import` evidence has no guided-entry/session reference. The resolver
requires the matching imported result and valid confirmation after activation;
source labels, preview, mismatches, invalidation and deletion do not qualify.
No importer parser, upload, batch execution endpoint or matching UI exists here.
The future importer must create confirmation/result/evidence in one authorized
transaction. Import timestamps do not fabricate chat evidence or refresh on retry.

## Migration

`20261009_typed_administration_steps` runs during normal backend bootstrap,
idempotently under an advisory lock. Old steps retain IDs, tool keys, soft removal
and explicit progress. They become `tool`, with the original path publication
baseline as `active_from`. Old results become `in-app`/`legacy_unknown`; unknown
locale/source system remain unknown, and no guided-entry evidence is invented.
New typed steps use their first activation timestamp; reordering preserves it.
New result provenance is `in-app`/`manual_scores`/`competenzestrategiche.it`/`it`.
The migration adds typed target, provenance, guided-entry and completion-contract
storage; it changes no external credentials and reads no environment files.

## Lean validation

Synthetic PostgreSQL only: a dedicated disposable `postgres:16-alpine` container,
`c5-italian-administration-150-postgres`, loopback port 18650, synthetic user
`c5_test`, database `counselorbot_test`, trust authentication. No production volume
or database is used. API fixtures roll back private schemas; migration and
concurrency fixtures drop their generated schemas. There are no app dev processes.

```sh
# Start only the disposable synthetic test database; no app dev server.
docker run -d --name c5-italian-administration-150-postgres \
  -e POSTGRES_USER=c5_test -e POSTGRES_DB=counselorbot_test \
  -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:18650:5432 postgres:16-alpine
uv venv backend/.venv
uv pip install --python backend/.venv/bin/python -r backend/requirements.txt pytest httpx
npm ci --prefix frontend
DATABASE_URL=postgresql://c5_test@127.0.0.1:18650/counselorbot_test PYTHON_DOTENV_DISABLED=1 \
  backend/.venv/bin/python -m pytest -q --disable-warnings \
  backend/tests/test_it_administration.py \
  backend/tests/test_it_entry_concurrency.py \
  backend/tests/test_typed_steps_migration.py \
  backend/tests/test_class_paths.py
# Run the full privacy gate separately; its inherited import-graph failure is described below.
DATABASE_URL=postgresql://c5_test@127.0.0.1:18650/counselorbot_test PYTHON_DOTENV_DISABLED=1 \
  backend/.venv/bin/python -m pytest -q --disable-warnings backend/tests/test_forum_privacy.py
# #149 fixtures intentionally require a different disposable synthetic database.
docker run -d --name c5-italian-administration-150-credentials-postgres \
  -e POSTGRES_USER=c4_test -e POSTGRES_DB=counselorbot_test \
  -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:18649:5432 postgres:16-alpine
DATABASE_URL=postgresql://c4_test@127.0.0.1:18649/counselorbot_test PYTHON_DOTENV_DISABLED=1 \
  backend/.venv/bin/python -m pytest -q --disable-warnings backend/tests/test_institute_credentials.py
npm test --prefix frontend
npm run i18n:check --prefix frontend
npm run build --prefix frontend
make guidance-check
docker stop c5-italian-administration-150-postgres c5-italian-administration-150-credentials-postgres
```

The cases cover atomic success and rollback, identical concurrent retry, revision
conflict, wrong student/plan, practice request rejection, invalid/missing factors,
forged credentials/provenance, strict-order gating, removed/archived/disabled
targets, legacy tool/override regression, two migration runs and exact confirmed
import evidence without a chat session. Frontend units check failed HTTP/network
persistence, acknowledgement validation, truthful typed parsing and localized text.

Existing #138/#139/#140 remain open; #146 and PR #147 are merged and the server
still checks the path's own class, regardless of the student's selected view.
Six-language guide text and feature grounding are updated; screenshots were
reviewed as historical context and not regenerated under the owner's lean rules.
No browser journey, screenshot capture, live external submission, Docker image
build, deployment or merge was performed.

Dependency installation reported 8 pre-existing npm advisories (2 moderate,
6 high), registered as local-only suspected bug `c932b0b3-973f-48d3-9b08-149e0f77d65c`.
Focused ESLint reports no errors; two existing warnings remain in the research
panel and student path page. Neither dependency updates nor unrelated UI issues
are part of TF3.


## Inherited privacy-gate failure

The full `test_forum_privacy.py` suite retains one baseline failure:
`test_forum_import_graph_has_no_ai_rag_context_or_export_path` has an exact
expected dependency set that omits `backend.institution_access`, already imported
by the unchanged `backend.routes.groups` on `origin/main`. The failure was
reproduced using module sources read directly from `origin/main`, and registered
as confirmed bug `11445e70-3d86-43b2-9c6d-460c8a664d58`. No privacy assertion was
skipped or weakened. The tests forbidding non-forum content readers and forum
queries/content in exports/PDF still pass. TF3 neither imports forum consumers
nor reads forum content; fixing the inherited expected set is outside #150.
