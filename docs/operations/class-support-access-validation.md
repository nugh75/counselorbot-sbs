# Compass and Assistant class access (#92)

The existing `bussola` and `assistant` catalog keys now govern navigation and
server writes. The shared resolver retains active-class union, inherited
settings, administrator locks, staff exemptions and platform instrument limits.
No schema migration is needed. Saved Compass sessions remain owner-readable.

The approved class settings and Compass ASCII layouts in the class-centred plan
are preserved. Disabled entries and write controls disappear; the existing
denial panel explains direct Assistant navigation. The six-language Guide
explains availability. Existing screenshots still represent the enabled layout;
browser checks decode the images and check mobile overflow in all six languages.

## Isolated verification

Run from the dedicated feature worktree. Check port availability and process
ownership first; never use the main checkout, environment files or production.
The C19 run used an ephemeral PostgreSQL 16 container with synthetic records,
loopback 18592 and database `counselorbot_test`. Artifact fixtures use a unique
transactional schema and roll it back. Models, retrieval and browser APIs are
fakes; no real student or provider data is needed.

```bash
ss -ltn
docker run -d --rm --name c19-bussola-92-postgres \
  -p 127.0.0.1:18592:5432 \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=c19_test \
  -e POSTGRES_DB=counselorbot_test postgres:16
export DATABASE_URL=postgresql://c19_test@127.0.0.1:18592/counselorbot_test
export PYTHON_DOTENV_DISABLED=1
export SESSION_MEMORY_DIR="$PWD/backend/.venv/test-memory"
export RAG_INDEX_DIR="$PWD/backend/.venv/test-rag"
backend/.venv/bin/python -m pytest -q -p no:cacheprovider \
  backend/tests/test_class_orientation.py backend/tests/test_orientation.py \
  backend/tests/test_class_access.py backend/tests/test_class_access_writes.py \
  backend/tests/test_class_settings.py backend/tests/test_class_counselors.py \
  backend/tests/test_practice_notebooks.py backend/tests/test_platform_guidance.py
DEV_BACKEND_PORT=8072 bash scripts/dev-class-settings-backend.sh
# Separate terminal, same worktree; this runner makes a secret-free snapshot:
DEV_FRONTEND_PORT=3173 DEV_BACKEND_PORT=8072 \
  bash scripts/dev-class-settings-frontend.sh
CLASS_SUPPORT_BASE_URL=http://127.0.0.1:3173 \
  node --test frontend/tests/class-support-access.test.mjs
STUDENT_CATALOG_BASE_URL=http://127.0.0.1:3173 \
CLASS_SETTINGS_BASE_URL=http://127.0.0.1:3173 \
  node --test frontend/tests/student-class-catalog.test.mjs frontend/tests/class-settings.test.mjs
```

Frontend checks: `npx tsc --noEmit`, `npm test`, `npm run i18n:check`, ESLint on
the touched files and a production build in a separate secret-free source
snapshot. Run `make guidance-refresh` and `make guidance-check` from the root,
then commit the guidance manifest with the product change.

The live backend check used synthetic class settings to disable both features:
new sessions, messages, completion and Assistant chat returned 403;
`orientation/status` returned `required: false`, and an existing session GET
returned 200 with its saved conversation. Ownership checks remain intact.

After live dev verification, both Dockerfiles were built using an explicit
tracked-source context excluding environment files. The backend image's three
changed application files matched local SHA-256 hashes. The isolated frontend
container on loopback 3175 passed the support browser suite. Production images,
containers and services were not rebuilt or restarted.
The backend image passed the 25 support access tests with the feature reference
mounted read-only and `COUNSELORBOT_DOCS_DIR` pointing to that mount, as required
by the normal platform-guidance contract. Running it without that mount fails
the reference lookup; it is not a valid production-equivalent test setup.

## Access and shutdown

For a manually started dev preview:
`ssh -N -L 3173:127.0.0.1:3173 -L 8072:127.0.0.1:8072 <user>@<server>`, then
`http://localhost:3173`. The browser fixture suite supplies fake identities;
the underlying runner defaults to a teacher fixture. Stop with Ctrl+C in the
two runner terminals. For background runs, verify `/proc/<pid>/cwd` belongs to
this worktree before sending TERM to the owned process. Never use broad pkill.

Stop only the named C19 validation containers:
`docker stop c19-bussola-92-frontend-validation c19-bussola-92-postgres`.
Both were created with `--rm`; the database contains disposable fake data.
The delivery handoff records final checks and process shutdown.
