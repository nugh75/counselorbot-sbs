# Class forum F1 (#102)

Scope: `forum_topics`, `forum_posts`, `forum_reads`; teacher Forum tab on
`/docente/classi/{id}` and student `/profilo/classi/{id}/forum`, linked from
Classes. The approved plan §8.4 supplies list, discussion and composer structure.
No moderation endpoints, student-opening settings, unread badges or path links.

## API and privacy contract

- GET/POST `/groups/{group_id}/forum/topics`; GET
  `/forum/topics/{topic_id}`; POST `/forum/topics/{topic_id}/posts`;
  POST `/forum/topics/{topic_id}/read` (idempotent timestamp upsert).
- Only current class members, owner, co-teachers and admins can read/reply.
  Only owner/co-teachers/admins create discussions in F1. Former members lose
  access immediately; their earlier name snapshots and messages remain.
  Inactive classes are read-only for otherwise authorized users.
- Inputs reject extra fields, forged author names, empty text and attachments.
  Titles are at most 160 characters; bodies at most 4000. Published display
  names are snapshotted from the trusted identity, with username fallback.
- The database-backed limit counts topics and replies together: 10 per user,
  per class, per five minutes. Writes lock the parent class before counting
  and inserting; multiple workers cannot bypass the limit. HTTP 429 includes
  `Retry-After: 300`. Lists/posts use `offset` and `limit` (default 50, max 100),
  with `has_more`. Replies are chronological.
- Safe reduced Markdown uses the existing React Markdown dependency: no raw
  HTML/images, emphasis/lists/quotes/code only, HTTP(S) links with
  `nofollow noopener noreferrer`. No attachments or AI features.
- `test_forum_privacy.py` traverses imports from forum modules, including
  their lazy imports, and rejects provider/network imports. Shared DB/auth
  initialization is checked separately from unrelated lazy AI functions;
  the forum may use only the ordinary `get_db` dependency. A reverse static
  gate rejects forum model/table consumers elsewhere, including context,
  RAG, ledger, export and PDF modules. `main.py` may register the router only.
  Runtime SQL capture also verifies research CSV, admin results/log/training
  exports and questionnaire PDF with synthetic forum sentinels present.
  No content is sent to local or external LLMs.
- Reserved moderation columns exist for later slices; hidden/deleted messages
  serialize as placeholders and pending rows remain invisible. Moderator
  content readback and moderation operations belong to #103/#104.

## Reproduce in this dedicated worktree

No production data, secrets, environment files or production containers are
needed. Check 18602, 8032 and 3137 with `ss -ltn` first.

```bash
docker run -d --rm --name c4-class-forum-102-postgres \
  -p 127.0.0.1:18602:5432 -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_USER=c4_test -e POSTGRES_DB=counselorbot_test postgres:16
uv venv backend/.venv
uv pip install --python backend/.venv/bin/python -r backend/requirements.txt \
  'sqlalchemy<2.1' pytest
DATABASE_URL=postgresql://c4_test@127.0.0.1:18602/counselorbot_test \
  PYTHON_DOTENV_DISABLED=1 backend/.venv/bin/python -m pytest \
  backend/tests/test_forum.py backend/tests/test_forum_privacy.py \
  backend/tests/test_class_settings.py -q --disable-warnings
DATABASE_URL=postgresql://c4_test@127.0.0.1:18602/counselorbot_test \
  DEV_BACKEND_PORT=8032 bash scripts/dev-class-settings-backend.sh
# Separate terminal:
DEV_BACKEND_PORT=8032 DEV_FRONTEND_PORT=3137 \
  DEV_AUTH_USER=c4.synthetic.admin DEV_AUTH_GROUPS=admins \
  bash scripts/dev-class-settings-frontend.sh
```

The existing secret-free runners use this worktree's venv and an explicit
frontend source snapshot. Rerun the frontend runner after source edits. For a
fresh worktree, copy its generated `next-env.d.ts` from that owned snapshot to
`frontend/next-env.d.ts` before TypeScript checks; it remains ignored.
The test venv uses the S1-documented SQLAlchemy verification constraint without
changing application dependencies. The isolated Python 3.10 Docker image
installed SQLAlchemy 2.0.54 and imported the forum successfully.

```bash
cd frontend
npm ci --no-audit --no-fund
npx tsc --noEmit
npm test
npm run i18n:check
node --test tests/forum.test.mjs
CLASS_SETTINGS_BASE_URL=http://127.0.0.1:3137 \
  node --test tests/class-settings.test.mjs
FORUM_LIVE=1 node --test tests/forum-live.test.mjs
# Repository root:
make guidance-refresh
make guidance-check
```

Browser fixtures reject external traffic. The live test uses the actual forum,
class and membership APIs and PostgreSQL, with only the unrelated student
onboarding status bypassed. The synthetic admin creates the class; the existing
`studente.demo` preview identity joins, replies, reloads, marks read and leaves.
The test verifies departure denial and inactive archive behavior and deletes its
own synthetic class. No LLM request is made.

SSH preview: `ssh -N -L 3137:127.0.0.1:3137 -L 8032:127.0.0.1:8032 <user>@<server>`;
URL `http://localhost:3137/docente/classi`. Stop the owned dev sessions with
Ctrl+C and the owned database with `docker stop c4-class-forum-102-postgres`.
Do not stop other dev sessions or production containers. No sudo/manual deploy.

## Results (2026-10-08)

- 52 backend tests passed on PostgreSQL 16: 29 forum API tests (including the
  complete role matrix, archive, snapshots, pagination, cascade, persistent
  rate limit and independent-worker concurrency), 3 privacy gates and 20 S1
  settings regressions. Three existing class/group smoke tests also passed.
- TypeScript, all 298 frontend unit tests, six-language i18n check and targeted
  ESLint passed. Forum translations also have a six-entry completeness test.
- 13 forum browser tests passed: teacher/student composition, failed sends,
  rate-limit draft retention, safe Markdown, archive, read error/revocation,
  six languages at 320px, explicit discard, duplicate-send prevention and
  late responses after account changes. All 12 S1 browser regressions passed.
- The actual 8032/3137 flow passed; mobile student rendering was visually
  inspected. The broader six-language guide/screenshots remain #107.
- Both images were rebuilt under isolated `c4-class-forum-102-{backend,frontend}:
  verification` tags from explicit source contexts excluding environment
  files and secrets. The frontend production build passed; backend image
  forum import passed against the synthetic database. No production container
  was rebuilt or restarted; no deployment or sudo step was performed.
- `make guidance-refresh` and `make guidance-check` passed; manifest included.
  All owned backend/frontend dev processes and the ephemeral Postgres instance
  were stopped at completion. Verification images remain as isolated tags.

Journal bug `5e7bbe84-2f80-4c29-bf1c-4891e0277ccd` (local only) recorded a Cancel
button that could submit the draft. Explicit `type="button"` and a browser
regression resolved it. No bug report remains unregistered.
