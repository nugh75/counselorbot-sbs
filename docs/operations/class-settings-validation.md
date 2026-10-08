# Class settings S1 (#88)

Scope: lazy `class_settings` storage, student-audience tool registry, settings
GET/PUT, and `/docente/classi/{id}` with the approved tools section. This release
stores class choices without affecting student access. Counselor controls, forum
options, class paths, per-class locks and audit history belong to later slices.
The three lock dictionaries are reserved columns only. Forum flags default to
false and cannot be updated by the S1 API.

The settings routes use the existing class ownership/share visibility rules and
manager role gate. Unauthorized teachers/students receive 403. Missing rows use
revision 1; the first save returns revision 2. PUT locks the parent class before
reading settings, including concurrent first saves. Unknown, teacher-only and
always-on keys receive 422. A default counselor must be active, institutional and
outside the counselor deny-list. A tools-only PUT preserves counselor and forum
settings. New student instruments are automatically enabled by the deny-list.
Personal and always-on tool keys are reserved against instrument code collisions.

## Isolated verification

Use only a dedicated synthetic PostgreSQL instance. The following instance is
for this worktree; it uses trust authentication on loopback and no production
credentials, volumes or data. Check 18588, 8002 and 3107 with `ss -ltn` first.

```bash
docker run -d --rm --name c1-class-settings-88-postgres \
  -p 127.0.0.1:18588:5432 -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_USER=c1_test -e POSTGRES_DB=counselorbot_test postgres:16
uv venv backend/.venv
uv pip install --python backend/.venv/bin/python -r backend/requirements.txt
# Temporary verification constraint for the separately registered SQLAlchemy
# 2.1/undeclared psycopg driver issue; application dependencies are unchanged.
uv pip install --python backend/.venv/bin/python 'sqlalchemy<2.1'
DATABASE_URL=postgresql://c1_test@127.0.0.1:18588/counselorbot_test \
  PYTHON_DOTENV_DISABLED=1 backend/.venv/bin/python -m pytest \
  backend/tests/test_class_settings.py -q --disable-warnings
DATABASE_URL=postgresql://c1_test@127.0.0.1:18588/counselorbot_test \
  bash scripts/dev-class-settings-backend.sh
# Separate terminal:
bash scripts/dev-class-settings-frontend.sh
```

These runners use the worktree venv and a clean process environment, never source
`.env`, and never use the main checkout. The frontend takes an explicit source
snapshot under the ignored venv so Next cannot load the existing development
environment file. Next serves that snapshot in dev mode; rerun the frontend
script after source edits. Tailwind discovery stays in the original frontend
directory. No environment files are copied or read. The backend rejects a URL
outside a local `counselorbot_test` database.

Create an anonymous test class via POST `/admin/groups` with the synthetic
identity `class-settings.fixture` / group `docenti` and trusted development
header `X-Forwarded-Auth-Secret: dev-local-only`. The frontend injects that
identity locally. Verify **Open class**, Tools, Save, reload, and settings
readback against the actual backend. No LLM call is needed.

```bash
cd frontend
npm ci --no-audit --no-fund
npx tsc --noEmit
npm test
npm run i18n:check
node --test tests/class-settings.test.mjs
CLASS_SETTINGS_LIVE=1 node --test tests/class-settings-live.test.mjs
```

Browser fixtures intercept every API and reject external traffic. They cover
explicit saves, keyboard toggles/tabs, category actions, platform-disabled rows,
409 draft retention and confirmed reload, read failures, access denial, failed
save retry, duplicate submission prevention, six languages, 320px layout and
the sticky Save bar. API tests use rolled-back schemas; concurrency tests use
temporary committed schemas in this worktree's synthetic test database.
The opt-in live test adds representative guided instrument metadata to the owned
synthetic database, creates its own class, verifies standard/dynamic tools and
platform-disabled/teacher-only rows, saves through the UI, reloads, reads back
through the actual API and checks stale revision rejection. The current fresh-DB
bootstrap only seeds assessment instrument metadata; missing historical guided
registry rows are registered separately as a suspected bootstrap defect. S1
intentionally uses the instrument table as its source of truth.

SSH preview: `ssh -N -L 3107:127.0.0.1:3107 -L 8002:127.0.0.1:8002 <user>@<server>`;
URL `http://localhost:3107/docente/classi`. Stop dev processes with Ctrl+C in
their terminals, or TERM only verified PIDs from this session. Stop the owned
ephemeral database with `docker stop c1-class-settings-88-postgres`. Do not stop
other dev sessions or production containers. No sudo or deployment is required.

## Results (2026-10-08)

- 20 settings API tests passed on PostgreSQL 16, plus 5 existing group smoke
  tests. Concurrent saves use separate connections and client event loops.
- `npx tsc --noEmit`, all 295 frontend unit tests, six-language `i18n:check`
  (3267 dictionary keys), and ESLint for the touched frontend sources passed.
- 12 settings browser tests passed, including six-language teacher guide
  content; 34 existing class-management browser regressions passed.
- The opt-in actual API/browser flow passed on 8002/3107 with the synthetic
  test DB, including standard/dynamic guided rows, disabled/teacher-only rows,
  explicit persistence, reload, stale revision rejection and class deletion.
- The production frontend build (`npm run build -- --webpack`) passed in the
  secret-free source snapshot. The six class-list guide screenshots were
  refreshed; tools were visually checked at 1440px/light and 390px/dark.
- Backend/frontend dev processes and the owned ephemeral Postgres instance
  were stopped. No production container rebuild, restart, sudo or deployment.

Journal findings: `08fcd27c-2198-4543-9e7d-b7adf31cc131` is the confirmed
SQLAlchemy installation defect; `b63a8dc8-ecd5-498c-a9b6-78ff53440c5e` is the
suspected guided metadata bootstrap defect. Both remain outside #88. The isolated
runner findings (`ce9aac97-3b61-4aac-b0cc-fc1da9d2f4f3`,
`78b00a46-aeff-454e-87b2-7626de8545ef`) and reserved-key collision
(`cf6dd41d-2e59-4b18-8524-e054a4e6d1a2`) are resolved with test evidence.
