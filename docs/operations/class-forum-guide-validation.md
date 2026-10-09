# Class forum guide F6 (#107)

Guide-only slice: no application behaviour changes. The public guide gains
student section 16 (Class forum) and teacher section 8 (Class forum and
moderation) in the six platform languages, with two screenshots per language
(`frontend/public/guide/{lang}/class-forum.png`, `teacher-forum.png`). The
forum resource-link paragraph (F5) moved from student section 15 and teacher
section 2 to the new forum sections.

## Reproduce in a worktree

Screenshots use synthetic API fixtures only (`Prof. Demo`, `Alex · Demo`); no
backend or database is needed. Check the port is free with `ss -ltn`, then from
`frontend/`:

```bash
# Worktrees symlink node_modules to the main checkout: Turbopack refuses it, webpack works.
env BACKEND_ORIGIN=http://127.0.0.1:9 npx next dev --webpack --hostname 127.0.0.1 --port 3181
# Separate terminal, from frontend/:
GUIDE_BASE_URL=http://127.0.0.1:3181 GUIDE_SCREENS=forum node --experimental-strip-types scripts/capture-guide.mjs
GUIDE_BASE_URL=http://127.0.0.1:3181 node --test --test-concurrency=1 tests/guide-audiences.test.mjs
TEACHER_ERRORS_BASE_URL=http://127.0.0.1:3181 node --test --test-name-pattern="teacher guide explains" tests/teacher-loading-errors.test.mjs
```

Stop the dev server with Ctrl+C.

## Results (2026-10-09)

- `tests/guide-audiences.test.mjs` was stale on main (anonymous identity while
  the audience selector is shown only to staff since f934828; second paragraph
  in teacher section 2; figure count). The fixture now signs in a synthetic
  teacher, and the test covers the 8 teacher and 16 student sections, the
  forum screenshots and the forum-link paragraph: 6/6 languages pass.
- Teacher guide recovery tests (`teacher-loading-errors`, guide subset): 6/6.
- `npx tsc --noEmit`, `npm test`, `npm run i18n:check`, `make guidance-check`
  pass.
