# Class forum F2 moderation (#103)

Scope: moderator hide/restore (topics and replies, with reason), lock/unlock and
pin/unpin of topics, author edit/delete of own replies, append-only
`forum_moderation_log`. Plus the F1 review follow-ups: control characters
rejected with 422 (journal bug 5bf973fd), hidden-topic notice in active classes
(journal bug 490cbaa6), extended permission matrix. Mute, pre-approval and
students-can-open are F3 (#104); unread badges are F4 (#105).

## API contract

- `POST /teacher/forum/{topics|posts}/{id}/hide` `{reason}` (1–500 chars),
  `POST /teacher/forum/{topics|posts}/{id}/restore`,
  `POST /teacher/forum/topics/{id}/lock|unlock|pin|unpin`: owner, co-teachers,
  admins, and researchers who own or share the class (same staff rule as F1).
  Active class only (archive → 403). A transition already in effect → 409 and
  no log row; a deleted reply cannot be hidden (409). Responses carry the
  moderator view.
- `PATCH /forum/posts/{id}` `{body}` and `DELETE /forum/posts/{id}`: the author
  only, current access, active class. Edit sets `edited_at`; refused on hidden
  replies (409) and in closed or hidden discussions (403). Delete sets
  `deleted_at` and is a tombstone for everyone; a second delete or later edit
  is 409. The row stays (thread order, class cascade) and its body is never
  serialized again. Author actions are not moderation and are not logged.
- `GET /teacher/groups/{id}/forum/log?offset&limit`: staff only, also in
  archived classes; newest first; entries carry id, actor username, action,
  target kind/id, reason, time. No write route exists for the log.
- Read payloads add `hidden_reason` (moderators only, otherwise null), `own`
  (viewer authored the message) and `can_moderate`. Moderators see hidden
  titles and bodies; students keep the F1 placeholders.
- `forum_moderation_log` check constraints already accept the F3 actions
  (mute, unmute, approve, reject, settings_change) because `create_all` cannot
  widen a constraint on an existing table. It cascades with the class.
- Titles, bodies, reasons: NUL and other C0 controls except tab, LF and CR → 422.

Privacy (decision 18) is unchanged: the privacy gate now also covers
`ForumModerationLog`/`forum_moderation_log`; the log stores reasons, never
message bodies (asserted with a sentinel in backend and live tests).

## Reproduce in this dedicated worktree

No production data, secrets, environment files or production containers.
Check 18623, 8062 and 3167 with `ss -ltn` first.

```bash
docker run -d --rm --name c5-forum-moderation-103-postgres \
  -p 127.0.0.1:18623:5432 -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_USER=c5_test -e POSTGRES_DB=counselorbot_test postgres:16
uv venv backend/.venv
uv pip install --python backend/.venv/bin/python -r backend/requirements.txt \
  'sqlalchemy<2.1' pytest
DATABASE_URL=postgresql://c5_test@127.0.0.1:18623/counselorbot_test \
  PYTHON_DOTENV_DISABLED=1 backend/.venv/bin/python -m pytest \
  backend/tests/test_forum.py backend/tests/test_forum_moderation.py \
  backend/tests/test_forum_privacy.py backend/tests/test_class_settings.py -q
DATABASE_URL=postgresql://c5_test@127.0.0.1:18623/counselorbot_test \
  DEV_BACKEND_PORT=8062 bash scripts/dev-class-settings-backend.sh
# Separate terminal:
DEV_BACKEND_PORT=8062 DEV_FRONTEND_PORT=3167 \
  DEV_AUTH_USER=c5.synthetic.admin DEV_AUTH_GROUPS=admins \
  bash scripts/dev-class-settings-frontend.sh
```

```bash
cd frontend
npx tsc --noEmit && npm test && npm run i18n:check
FORUM_BASE_URL=http://127.0.0.1:3167 node --test tests/forum.test.mjs
CLASS_SETTINGS_BASE_URL=http://127.0.0.1:3167 node --test tests/class-settings.test.mjs
FORUM_LIVE=1 FORUM_BASE_URL=http://127.0.0.1:3167 FORUM_LIVE_ADMIN=c5.synthetic.admin \
  node --test tests/forum-live.test.mjs
# Repository root:
make guidance-refresh && make guidance-check
```

`FORUM_BASE_URL` and `FORUM_LIVE_ADMIN` default to the F1 values (3137,
`c4.synthetic.admin`). A fresh worktree needs an ignored
`frontend/next-env.d.ts` before `tsc` (see `class-forum-validation.md`).

SSH preview: `ssh -N -L 3167:127.0.0.1:3167 -L 8062:127.0.0.1:8062 <user>@<server>`;
URL `http://localhost:3167/docente/classi`. Stop with Ctrl+C on both runners
and `docker stop c5-forum-moderation-103-postgres`. No sudo or deploy step.

## Results (2026-10-08)

- Backend on PostgreSQL 16: 83 forum tests (41 `test_forum.py` incl. the
  extended matrix — cross-class student, researcher owner/shared/unrelated —
  and control-character 422 cases; 39 `test_forum_moderation.py`; 3 privacy
  gates) plus 20 S1 settings regressions: 103 passed. 4 group/class smoke
  tests passed.
- Frontend: `tsc`, 301 unit tests (new: closed-notice order, reply action
  rules, parsers), six-language i18n check and targeted ESLint passed.
- Browser fixtures on 3167: 20 forum tests (7 new: teacher hide/restore with
  reason, pin, close and log; student placeholders, own edit/delete with
  confirmation; hidden-topic notice in an active class; rejected action without
  private detail; archived class keeps the log and hides controls; 320px in
  de/fr) and 12 S1 regressions passed.
- Live (real API + synthetic Postgres): F1 flow and the new moderation flow
  passed — hidden text never reached the student page or the log, no AI
  request was made, the synthetic class was deleted afterwards. Teacher log and
  mobile student screenshots were inspected.
- No Docker image rebuilt, no production container touched.
