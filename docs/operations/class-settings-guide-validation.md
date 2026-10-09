# Class settings guide S9 (#95)

The existing guide structure stays at eight teacher and sixteen student sections.
Teacher section 2 documents the delivered class page, Tools & counselors,
institutional counselor/default choices, access rules, administrator badges and
Change history. Administrators see an additional subsection and three figures
inside that section, covering all classes, immediate ON/OFF locks, unlock and
the append-only audit. Student sections 4 and 5 explain missing counselors/tools;
section 1 retains Compass/Assistant guidance. The class forum text and images
from #107 remain unchanged. A class path is distinct from an instrument's guided
path, and a strict path-step lock does not disable the tool in the catalog.

## Base evidence

Base: `eb68b4021d4837c338c954bf56053a1f222b2c3c`, verified against GitHub main.
Closed prerequisites and actual ancestor implementations:

| Issue | Delivered behavior | Commit |
| --- | --- | --- |
| #90 | Student catalog and entry-point filtering | `0c82901` |
| #91 | Personal-area tool filtering and write guards | `005d49e` |
| #92 | Compass/Assistant access and enabled-only recommendations | `ac5bc32` |
| #93 | Institutional counselors and suitable class defaults | `6b99cb0` |
| #109 | All-classes directory, per-item locks and audit | `0687023` |
| #107 | Existing student/teacher forum guide | `d20b2e4` |

The obsolete six-language settings notice saying student filtering would ship
later was corrected as part of making the guide screenshots describe delivered
behavior. No authorization or application logic changed.

## Isolated live verification and captures

Only the C29 worktree and `docs/class-settings-guide-84` are used. Install local
frontend dependencies with `npm ci --no-audit --no-fund`. The documented runners
use a secret-free source snapshot, because Next loads environment files from its
working directory. Restart the frontend runner after source edits.

Check the ports before starting:

```bash
ss -ltn '( sport = :8002 or sport = :3107 or sport = :18629 )'
# Create once: dedicated synthetic PostgreSQL, no operational credentials/data.
docker run -d --name c29-class-settings-guide-95-postgres \
  -p 127.0.0.1:18629:5432 -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_USER=c29_test -e POSTGRES_DB=counselorbot_test postgres:16
# For a stopped instance already created by C29:
# docker start c29-class-settings-guide-95-postgres
uv venv --allow-existing backend/.venv
uv pip install --python backend/.venv/bin/python -r backend/requirements.txt
DATABASE_URL=postgresql://c29_test@127.0.0.1:18629/counselorbot_test \
  bash scripts/dev-class-settings-backend.sh
# In another terminal:
bash scripts/dev-class-settings-frontend.sh
```

Actual API/browser verification used the synthetic `class-settings.fixture`
teacher and `C29 synthetic guide class`. All six guide languages rendered with
actual test-backend identity; the real class Tools tab and settings readback
were checked too. No model call was required. The absent local embedding service
leaves RAG indexing deferred in this isolated environment; it does not affect
the guide or class settings. Browser fixture tests do not establish production
SSO or provider availability.

From `frontend/`, run capture first, then browser tests. Captures render the real
application with anonymous in-memory API responses, reject non-GET requests and
block external traffic. Do not run captures while testing the dev server: PNG
changes can trigger recompilation during navigation.

```bash
GUIDE_BASE_URL=http://127.0.0.1:3107 GUIDE_SCREENS=class-settings \
  node --experimental-strip-types scripts/capture-guide.mjs
GUIDE_BASE_URL=http://127.0.0.1:3107 \
  node --test --test-concurrency=1 tests/guide-audiences.test.mjs
CLASS_SETTINGS_BASE_URL=http://127.0.0.1:3107 \
  node --test --test-concurrency=1 tests/class-settings.test.mjs
TEACHER_ERRORS_BASE_URL=http://127.0.0.1:3107 \
  node --test --test-name-pattern='teacher guide explains' tests/teacher-loading-errors.test.mjs
```

48 genuine screenshots: eight per language, in
`frontend/public/guide/{it,en,es,fr,de,sv}/`:
`counselors.png`, `tool-selection.png`, `teacher-groups.png`,
`class-overview.png`, `class-tools.png`, `admin-classes.png`, `admin-locks.png`,
`admin-audit.png`. Thirty are new files, eighteen are refreshed. Test-only guide evidence stays under `frontend/.next/guide-audiences/`,
inside the owning worktree. Class settings
pages use a tall viewport so the actual sticky Save bar does not obscure rows.
All 48 served Docker PNG SHA-256 hashes matched the worktree files. Forum PNGs
and `i18n-forum.ts` have no diff from the base.

SSH access:

```bash
ssh -N -L 3107:127.0.0.1:3107 -L 8002:127.0.0.1:8002 <user>@<server>
```

Open `http://localhost:3107/guide?audience=teacher` or
`http://localhost:3107/guide?audience=student`. Screenshot data exist only in the
Playwright contexts; the ordinary dev browser uses the dedicated test backend.
Stop dev with Ctrl+C in the runner terminals, or TERM only verified C29 PIDs.
Stop the owned database with `docker stop c29-class-settings-guide-95-postgres`.
No container, volume or database removal is part of this workflow.

## Docker verification

A separate build context under `backend/.venv/c29-docker-context` contains only
`frontend/src`, `public`, `Dockerfile`, `.dockerignore`, `package.json`,
`package-lock.json`, `tsconfig.json`, `next.config.ts` and `postcss.config.mjs`.
No environment files are copied. The existing Dockerfile and its production
`npm run build` are used unchanged:

```bash
docker build -t counselorbot-c29-guide-95:validation \
  --build-arg BACKEND_ORIGIN=http://127.0.0.1:9 backend/.venv/c29-docker-context
ss -ltn 'sport = :3189'
docker run -d --name c29-class-settings-guide-95-frontend \
  -p 127.0.0.1:3189:3000 counselorbot-c29-guide-95:validation
cd frontend
GUIDE_BASE_URL=http://127.0.0.1:3189 \
  node --test --test-concurrency=1 tests/guide-audiences.test.mjs
# From the repository root:
docker inspect c29-class-settings-guide-95-frontend --format '{{.State.Status}}'
docker logs --tail 8 c29-class-settings-guide-95-frontend
docker stop c29-class-settings-guide-95-frontend
```

Image ID:
`sha256:d888a23d2ff14ab4aa8949deccb60f103679bbbd1430e179b986ac25d38a9cc1`.
Production services were not rebuilt, restarted or deployed. No sudo is needed.

## Results and limits

- `npx tsc --noEmit`: PASS.
- `npm test`: 339 passed, 0 failed/skipped.
- `npm run i18n:check`: 3275 keys, all six languages, PASS.
- ESLint on all changed frontend source/capture/test files: PASS.
- Guide browser suite: 12 passed on both the fresh dev snapshot and isolated
  Docker frontend, including
  teacher/student and administrator guidance, images, 320/390/1440 widths,
  dark/light themes, zoom keyboard/focus, history and zero writes.
- Class settings browser regressions: 17 passed, 0 failed/skipped.
- Teacher guide recovery subset: 6 passed, 0 failed/skipped.
- Isolated live guide: six actual test-backend language checks and class settings
  readback/notice PASS.
- Docker build (`npm run build`): PASS; runtime ready and 48/48 PNG hashes PASS.
- `make guidance-refresh`, `make guidance-check`, `git diff --check`: PASS.
- Global `npm run lint`: FAIL, 5 errors/48 warnings outside this change. A
  separate source snapshot taken directly from HEAD, with unchanged ESLint
  config, reproduces the same five errors: `ReturningHome.tsx:56`,
  `PersonalAreaHome.tsx:98`, `NewDeckDialog.tsx:36`,
  `class-paths-tool-names.ts:8`, `use-collapsed-catalog.ts:27`. This pre-existing
  repository gate is not represented as clean or repaired by S9.

Journal bugs: capture selector `e2f962ea-7d7d-46d1-a704-a3ab500eac42` and obsolete
notice `0af83b5f-07af-476e-ad61-dbb9e869cacb` are fixed here. Global lint debt
`a003016d-e3b0-46e2-bfdb-e0c73be1a4d7` is confirmed and out of scope. Dev
navigation/recompilation instability `ecaca776-d91f-4ea3-8970-b3da757d242b`
is registered as suspected; verification uses completed captures and a stable
compiled container, without weakening assertions or increasing timeouts.
Registrations are local journal receipts (`sync: not-linked`), not GitHub issues.
