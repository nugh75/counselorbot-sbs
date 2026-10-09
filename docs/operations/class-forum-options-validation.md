# Class forum F3 options, mute and pre-approval (#104)

Scope: `forum` class tool key, "students can open discussions" and
"approve messages before they are visible" options, moderator mutes and the
pending queue. Forum options follow the S8 admin lock model (#109): a locked
option shows its lock value, a teacher save that contradicts it is 422
`item_locked_by_admin`, and every option change is also written to
`class_settings_audit_log` (`target_kind: forum_option`).

## API contract

- `PUT /teacher/groups/{id}/settings` accepts optional
  `forum: {students_can_open, premoderation}` (strict booleans, both required).
  `GET` returns them with `*_locked` flags. Each changed option or forum switch
  appends a `settings_change` row (`option: on|off`) to `forum_moderation_log`.
- `forum` tool key (category `forum`): when a class disables it, its students
  get 403 `tool_disabled_for_class` on topic, reply and edit; reads stay. Only
  that class's setting counts (no union). Staff are never filtered.
- Students open topics only with `students_can_open` (else 403
  `forum_topic_staff_only`).
- Pre-approval: student topics, replies and edits get `status: pending`;
  visible to the author and moderators only. `GET /teacher/groups/{id}/forum/pending`,
  `POST /teacher/forum/{topics|posts}/{id}/approve`, `.../reject {reason}`.
- Mutes: `GET|POST /teacher/groups/{id}/forum/mutes` `{username, reason, until?}`
  (`until` timezone-aware, future), `DELETE .../mutes/{mute_id}` lifts. Only class
  students can be muted (422 otherwise), a second active mute is 409. Muted
  students get 403 `forum_muted` on post/topic/edit; delete stays allowed.
  Rows in `forum_mutes` are never deleted.
- Read payloads add `forum_enabled`, `premoderated`, `mute`, `status` per message,
  `pending_count` (moderators) and `author_username` (moderators only).

## Reproduce

Synthetic Postgres container `c21-forum-options-104-postgres` on
`127.0.0.1:18624` (`c21_test`, `counselorbot_test`), dev runners on 8064/3169
(see `class-forum-moderation-validation.md` for the runner commands).

```bash
DATABASE_URL=postgresql://c21_test@127.0.0.1:18624/counselorbot_test \
  PYTHON_DOTENV_DISABLED=1 backend/.venv/bin/python -m pytest \
  backend/tests/test_forum.py backend/tests/test_forum_moderation.py \
  backend/tests/test_forum_privacy.py backend/tests/test_forum_options.py \
  backend/tests/test_class_settings.py backend/tests/test_class_access.py -q
cd frontend
npx tsc --noEmit && npm test && npm run i18n:check
FORUM_BASE_URL=http://127.0.0.1:3169 node --test tests/forum.test.mjs
CLASS_SETTINGS_BASE_URL=http://127.0.0.1:3169 node --test tests/class-settings.test.mjs
FORUM_LIVE=1 FORUM_BASE_URL=http://127.0.0.1:3169 FORUM_LIVE_ADMIN=c21.synthetic.admin \
  node --test tests/forum-live.test.mjs tests/forum-options-live.test.mjs
```

The live F3 test tolerates only the known `RolePreviewBanner` hydration
mismatch (view-as preview, same debt as `teacher-notebook-page.test.mjs`).

SSH preview: `ssh -N -L 3169:127.0.0.1:3169 -L 8064:127.0.0.1:8064 <user>@<server>`;
URL `http://localhost:3169/docente/classi`.
