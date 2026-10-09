# Class forum F5 resource links (#106)

Scope: when opening a discussion, class staff may link it to a step of a
published class path or to a whole-class assignment of the same class. The
topic shows the resource; the step and assignment views show "Discuss in the
class forum". No forum content enters AI contexts, exports or PDFs.

## API contract

- `POST /groups/{id}/forum/topics` accepts optional `link_kind`
  (`path_step` | `assignment`) and `link_id` (strict positive int). They come in
  pairs (otherwise 422). Only staff may link (403 `forum_moderator_only`). The
  target must be current and in the same class, otherwise 422
  `forum_link_invalid`: other class, draft or archived path, removed step,
  revoked assignment, individual assignment (would disclose its recipient),
  missing id.
- Topic payloads carry `link` = `{kind, id, title, tool_key, path_title,
  available}` or null. It is resolved on read: archived paths, removed steps,
  revoked assignments and deleted paths become `available: false` (deleted
  targets lose the title). Hidden topics return `link: null` to students.
- `GET /groups/{id}/forum/link-targets`: staff only; selectable targets.
- `GET /user/forum/links`: `{kind, id, topic_id, group_id}` for published,
  visible, linked topics in the viewer's current classes plus classes they
  staff. Leaving a class removes them immediately.

## Frontend

- Composer: "Optional link" select (staff only), retry on load error, can send
  without a link.
- Discussion: linked resource as a link while available, plain text with
  "Unavailable" otherwise. Students go to `/profilo/percorsi#class-step-{id}` or
  `/profilo/assegnazioni#assignment-{id}`; staff to
  `/docente/classi/{id}?tab=paths` or `/docente/assegnazioni#assignment-{id}`.
- `ForumDiscussionLinks` in student paths, teacher path editor and assignments
  opens `/profilo/classi/{group}/forum?topic={id}`.
- Guide: teacher section 2 and student section 15, six languages.

## Reproduce in this dedicated worktree

Synthetic data only; no production data, secrets, env files or production
containers. Check 18622, 8002 and 3107 with `ss -ltn` first.

```bash
docker run -d --rm --name c22-forum-links-106-postgres \
  -p 127.0.0.1:18622:5432 -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_USER=c22_test -e POSTGRES_DB=counselorbot_test postgres:16
DATABASE_URL=postgresql://c22_test@127.0.0.1:18622/counselorbot_test \
  PYTHON_DOTENV_DISABLED=1 backend/.venv/bin/python -m pytest \
  backend/tests/test_forum.py backend/tests/test_forum_moderation.py \
  backend/tests/test_forum_privacy.py backend/tests/test_forum_links.py -q
DATABASE_URL=postgresql://c22_test@127.0.0.1:18622/counselorbot_test \
  DEV_BACKEND_PORT=8002 bash scripts/dev-class-settings-backend.sh
# Separate terminal:
DEV_BACKEND_PORT=8002 DEV_FRONTEND_PORT=3107 \
  DEV_AUTH_USER=c22.synthetic.admin DEV_AUTH_GROUPS=admins \
  bash scripts/dev-class-settings-frontend.sh
```

```bash
cd frontend
npx tsc --noEmit && npm test && npm run i18n:check
FORUM_BASE_URL=http://127.0.0.1:3107 node --test tests/forum.test.mjs
FORUM_LINKS_LIVE=1 FORUM_BASE_URL=http://127.0.0.1:3107 node --test tests/forum-links-live.test.mjs
# Repository root:
make guidance-refresh && make guidance-check
```

SSH preview: `ssh -N -L 3107:127.0.0.1:3107 -L 8002:127.0.0.1:8002 <user>@<server>`;
URL `http://localhost:3107/docente/classi`. Stop with Ctrl+C on both runners
and `docker stop c22-forum-links-106-postgres`. No sudo or deploy step.

## Results (2026-10-09)

- Backend on PostgreSQL 16: 118 forum tests passed (F1, F2, privacy gates and
  the new `test_forum_links.py`: same-class validation, archived/revoked/deleted
  targets, hidden topics, link-target listing, membership boundary matrix).
  Full backend suite earlier in the session: 186 passed.
- Frontend: `tsc`, 335 unit tests, six-language i18n check, targeted ESLint
  (one pre-existing unused-import warning) passed.
- Browser fixtures on 3107: 27 forum tests passed (link picker, available and
  unavailable links).
- Live (real API + synthetic Postgres): teacher links a step and an assignment,
  student navigates both ways, archive/revoke turn the reference into plain
  text, leaving the class removes access; no AI request made.
- Docker images built only as isolated verification tags; no production
  container touched.
