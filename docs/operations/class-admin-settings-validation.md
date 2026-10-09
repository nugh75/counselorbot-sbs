# Class administration, locks and settings history (#109)

Scope: `GET /admin/classes` (search by name/code/school, filters by owner,
institution and active status), `POST /admin/groups/{id}/settings/lock` and
`/unlock`, the append-only `class_settings_audit_log` table and
`GET /teacher/groups/{id}/settings/audit-log`. UI: the Classes block in
Administration → Groups and classes (`/admin?tab=groupsClasses`; `/admin/classi`
redirects there), and `/admin/classi/{id}`,
which reuses the teacher settings editor with lock controls and Change history.

Rules:

- Only administrators (`is_admin`) use the directory and lock routes;
  researchers, teachers and students receive 403.
- A lock forces a tool or institutional counselor ON or OFF and bumps the
  settings revision, so open teacher drafts reload. Always-on items, unknown
  keys and private counselors are rejected with 422.
- Teacher PUT that contradicts a lock returns 422
  `{"detail": "item_locked_by_admin", "item_kind", "item_id"}` and writes nothing.
- Platform disable (`is_active=False`) wins: a globally disabled item cannot be
  newly locked ON (`cannot_lock_on_platform_disabled`) and stays off even if a
  previous lock was ON.
- Locking a counselor OFF clears it as class default (audited).
- Unlock keeps the last value and returns control to teachers.
- Every actual change, lock and unlock writes one audit row (actor, role,
  old/new, optional reason, time). No-op saves write none. No route updates or
  deletes audit rows; they go only with the class (cascade).
- Audit history is visible to the class owner, co-teachers and admins only.
- Forum option locks are stored and shown with a future-release notice; their
  effect on discussions belongs to F3.

The table is created by the normal metadata bootstrap; no manual migration.

## Isolated verification

Run from the feature worktree only, never the main checkout, `.env` or
production data. Check ports first with `ss -ltn`. The C20 run used an
ephemeral PostgreSQL 16 container with synthetic records on loopback 18609,
backend 8072 and frontend 3177.

```bash
docker run -d --rm --name c20-admin-settings-109-postgres \
  -p 127.0.0.1:18609:5432 -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_USER=c20_test -e POSTGRES_DB=counselorbot_test postgres:16
export DATABASE_URL=postgresql://c20_test@127.0.0.1:18609/counselorbot_test
export PYTHON_DOTENV_DISABLED=1
backend/.venv/bin/python -m pytest -q --disable-warnings \
  backend/tests/test_class_settings.py backend/tests/test_class_settings_admin.py
DEV_BACKEND_PORT=8072 bash scripts/dev-class-settings-backend.sh
# Separate terminal; the live test needs an admin identity injected locally.
DEV_FRONTEND_PORT=3177 DEV_BACKEND_PORT=8072 \
  DEV_AUTH_USER=c20.synthetic.admin DEV_AUTH_GROUPS=admins \
  bash scripts/dev-class-settings-frontend.sh
```

Frontend checks (from `frontend/`):

```bash
npx tsc --noEmit && npm test && npm run i18n:check
CLASS_SETTINGS_BASE_URL=http://127.0.0.1:3177 node --test tests/class-settings.test.mjs
CLASS_ADMIN_LIVE=1 node --test tests/admin-class-settings-live.test.mjs
```

`class-settings.test.mjs` mocks every API call (teacher lock badges, admin lock
flow, 320px layout); `admin-class-settings-live.test.mjs` creates a synthetic
class on the real dev backend and walks directory → settings → lock → teacher
rejection → unlock → audit. Rerun the frontend runner after source edits: it
serves a snapshot.

Stop: `docker stop c20-admin-settings-109-postgres` and Ctrl+C on both runners.
