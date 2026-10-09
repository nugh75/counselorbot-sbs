# Teacher institutes (#148)

Scope: teacher creation, explicit directory self-join, scoped metadata editing and
class association. The teacher-flow plan from PR #158 is the reviewed source; it
was already merged into base `c8e6d02`. The notebook-first ASCII structure is
preserved. Credentials, presets, new administration flows and imports are later
slices and are not implemented here.

## Domain and migration

- Creation saves the active institute and creator membership atomically. Slugs
  are allocated by the server with a random suffix; names do not infer membership.
- The teacher directory exposes public metadata and join availability only.
  Explicit self-join locks the institute before checking capacity and inserting
  or reactivating membership. Repeat active joins are idempotent. Administrator
  membership writes use the same lock and cannot newly exceed the capacity.
- Existing active memberships above two remain valid and have
  `needs_admin_review=true`, also in the administrator institute response.
- Metadata writes lock the institute and check `revision`; 409 preserves the
  local draft. Administrator changes also increment the revision.
- Class writes retain owner/co-teacher authorization and require explicit active
  institute membership for a new association. Unlinking requires membership in
  the current institute. Unchanged links do not block other class edits, including
  legacy inactive institutes. Institute membership never expands class visibility.
- `backend/migrations/20261009_teacher_institutes.py` runs during normal startup
  before ORM reads. It adds nullable `created_by` and `revision=1` for old rows,
  unlinks orphaned class institute IDs and adds/validates a foreign key. It is
  transactional, serialized with an advisory lock and idempotent. It deletes no
  classes or memberships and changes no credentials. The Dockerfile includes it.

No migration or deployment is performed on production by this PR. A later normal
backend deployment runs the migration automatically; no separate sudo command is
needed for this feature. Database backup and production deployment remain owner
operations outside this slice.

## Secret-free development

Run only in `teacher-flow-institutes`, never in the main checkout. Check ports
before starting; this session used 18648 (synthetic PostgreSQL), 8148 (backend),
3148 (frontend), and 3248 (isolated compiled frontend). Existing 8002/3107 services
were left untouched.

```bash
ss -ltn
docker run -d --rm --name c3-teacher-institutes-148-postgres \
  -p 127.0.0.1:18648:5432 -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_USER=c3_test -e POSTGRES_DB=counselorbot_test postgres:16
uv venv backend/.venv
uv pip install --python backend/.venv/bin/python -r backend/requirements.txt
npm ci --prefix frontend
scripts/dev-teacher-institutes.sh backend
# Separate terminal:
scripts/dev-teacher-institutes.sh frontend
```

The frontend runner creates an ignored source snapshot with no environment files;
Next serves it with hot reload. To refresh that snapshot after source edits, copy
only `frontend/src` into its `src` directory or restart the runner. The backend
uses an empty environment plus explicit synthetic configuration. Never use the
legacy runner that sources `.env`. No real users, providers or secrets are needed.

Tunnel: `ssh -N -L 3148:127.0.0.1:3148 -L 8148:127.0.0.1:8148 <user>@<server>`.
Open `http://localhost:3148/docente/istituti`. Stop foreground runners with Ctrl+C;
for background runs, verify process cwd and terminate only those process trees.
Stop the disposable test containers by their exact names:

```bash
docker stop c3-teacher-institutes-148-frontend-validation \
  c3-teacher-institutes-148-postgres
```

## Validation commands and evidence

```bash
DATABASE_URL=postgresql://c3_test@127.0.0.1:18648/counselorbot_test \
PYTHON_DOTENV_DISABLED=1 backend/.venv/bin/python -m pytest -q \
  backend/tests/test_teacher_institutes.py backend/tests/test_institution_teachers.py \
  backend/tests/test_platform_guidance.py
npm test --prefix frontend
INSTITUTES_BASE_URL=http://127.0.0.1:3148 \
  node --test frontend/tests/teacher-institutes.test.mjs
GUIDE_BASE_URL=http://127.0.0.1:3248 \
  node --test --experimental-strip-types frontend/tests/guide-audiences.test.mjs
make guidance-refresh
make guidance-check
```

The creation test first failed with the missing POST endpoint. Directory/self-join
and simultaneous-capacity tests then failed before those routes were added; class
association tests failed before membership enforcement. Their green runs exercise
real PostgreSQL transactions in disposable schemas, including membership-insert
failure rollback, simultaneous equal-name creation, concurrent second/third joins,
role matrix, revision conflicts, revocation/reactivation, grandfathered membership,
independent class sharing and legacy migration replay/orphan remediation.

The first browser test failed before the Institutes page existed. Feature browser
checks cover creation → class → reload, explicit second-teacher selection/self-join,
class privacy, metadata conflicts, failed creation/join/attachment with draft
preservation, retry/cancel and unauthorized roles. All six languages fit 320 px;
fixtures intercept every API and reject external traffic. Screenshots use synthetic
records only. The six-language guide adds institute instructions and screenshots;
home screenshots retain the notebook-first placement. Class/editor screenshots
were reviewed and remain representative of linked and unlinked classes.

A live API run against the synthetic cluster proved creation, directory selection,
second-teacher join, third-teacher rejection, class attachment, independent class
visibility and readback through the real frontend proxy. This is development proof,
not a production release.

Production frontend compilation is run with `npm run build --prefix frontend` in
an ignored secret-free source snapshot. Its host-only PostCSS discovery is bounded
to `src` to avoid scanning sibling Python development artifacts. The actual
Dockerfiles are also built as `counselorbot-tf1-148-backend` and
`counselorbot-tf1-148-frontend` from explicit source contexts without environment
files. Backend image tests use the synthetic cluster with the documentation and
frontend sources mounted read-only for the guidance route contract. Frontend image
browser tests run only on loopback 3248. No production image tag or container is
rebuilt or restarted.

## Baseline and related work

`npm run i18n:check --prefix frontend` fails unchanged on base `c8e6d02`:
`admin.ap.section.institution`, `.help`, `institutionCode`,
`institutionCodePlaceholder`, `institutionPassword`, and
`institutionPasswordPlaceholder` are missing in es/fr/de/sv. This verified baseline
is registered in the Journal as `1a274e7a-0d9c-400c-9820-1dfe76549420`; it is not
masked or fixed in this slice. New institute labels and guide prose cover all six
UI languages and are checked in the browser.

Issues #138, #139 and #140 were open at start. Their cross-references identify the
future teacher-flow slices; no delivered PR is linked in their timelines. Existing
per-class Paths links, the shared class editor and the assignment panels are reused
without changing their behavior or closing those issues. Credential changes belong
to #149; the existing credential readiness flag is read-only in #148.

The existing RolePreviewBanner hydration mismatch remains separately registered
as Journal bug `42fe7150-9122-40c5-9325-688d78468815`. Notebook preview fixtures
explicitly assert the pre-existing React 418 errors; they are not silently
suppressed. Compiled notebook verification requires
`TEACHER_NOTEBOOK_COMPILED=1`, as documented by that suite.

## Delivery checks

| Check | Result |
| --- | --- |
| Teacher institute API, independent-worker concurrency and migration replay | 17 passed on synthetic PostgreSQL |
| Initial backend regression bundle: institutes, settings, counselors, teacher context, class view and memberships | 81 passed |
| Final backend image: institute API, memberships and platform guidance | 43 passed; six changed application/migration files match source bytes |
| Frontend units (`npm test --prefix frontend`) | 352 passed |
| Institute browser journey, errors, permissions and six languages | 14 passed on the final compiled image |
| Existing class management and class-picker browser suites | 88 passed on the compiled image |
| Dedicated notebook page, notebook-first order and existing preview guard | 34 passed with the compiled-suite flag |
| Class settings browser suite | 17 passed |
| Six-language public/admin guide and screenshot decode/zoom | 12 passed |
| TypeScript and ESLint on touched UI files | Passed |
| Host production build and both isolated Dockerfile builds | Passed |
| Guidance manifest, baseline-diff gate and guidance checker unit tests | Passed |
| Global i18n check | Unchanged verified baseline failure listed above |

Development and validation processes/containers are stopped before delivery. The
synthetic cluster is disposable; the dedicated worktree and test image tags remain.
No merge, production migration, production deployment or sudo action is performed.
