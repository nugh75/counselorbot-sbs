# Class access S2 (#89)

Scope: `backend/class_access.py` (resolver + guard), `GET /user/access`, and the
guard on start/write entry points. No frontend change: the student catalog reads
`/user/access` from #90; counselor fields stay `null` until #93.

## Rules

1. **Admin layer.** An instrument with `is_active=false` → 403
   `{"detail": "tool_unavailable", "tool": "<CODE>"}` for everyone except platform
   admins (they test drafts in the sandbox). A `target_audience != student`
   instrument → the same 403 for non-staff users.
2. **Staff bypass.** Teachers, researchers and admins (role markers of
   `auth.py`) are never filtered by classes.
3. **Class layer (students).** Active memberships in active classes only. A tool
   is enabled if at least one class enables it (admin lock in
   `locked_tool_keys` first, then `disabled_tool_keys`). Otherwise 403
   `{"detail": "tool_disabled_for_class", "tool": "<key>"}`. No active class →
   admin layer only.
4. Instrument codes match case-insensitively; the chat guard uses the guided
   step's instrument when `phase` names a step, exactly like `prepare_chat_turn`.
   Keys that are not catalog tools (generic chat, legacy types) pass.

Guarded: `POST /chat`, `/chat/stream`, `/chat/message`, `/questionnaire-result`,
`/instruments/{code}/score`, and `GET /session/frozen/{id}` (the resume step).
Not guarded (reads, decision 8): results, conversations, PDFs, the frozen list,
freeze and delete. Personal tools, Bussola, Assistant and Telegram call
`require_tool` in their own slices (#91, #92, #94).

## Pre-deploy check (mandatory)

From this release the admin layer is enforced immediately for every student.
On the dev environment, before the Docker rebuild, confirm that no instrument
students use is inactive or teacher-only. Read-only:

```sql
SELECT i.code, i.is_active, i.target_audience,
       COUNT(DISTINCT r.username) FILTER (WHERE r.submitted_at > now() - interval '90 days') AS recent_users
FROM instruments i
LEFT JOIN questionnaire_results r ON r.questionnaire_type = i.code
WHERE NOT i.is_active OR i.target_audience <> 'student'
GROUP BY 1, 2, 3 ORDER BY 1;
```

Any row with `recent_users > 0` that should stay usable must be reactivated
(or set to student audience) by an admin before deploying. Guided chats without
an `instruments` row are not affected.

## Isolated verification

Same runners as `class-settings-validation.md`, on this worktree's own ports:
synthetic Postgres on `127.0.0.1:18589`, backend on `8012`
(`DEV_BACKEND_PORT=8012 bash scripts/dev-class-settings-backend.sh`).

```bash
DATABASE_URL=postgresql://c2_test@127.0.0.1:18589/counselorbot_test \
  PYTHON_DOTENV_DISABLED=1 backend/.venv/bin/python -m pytest \
  backend/tests/test_class_access.py -q --disable-warnings
```

## Results (2026-10-08)

- `test_class_access.py`: 27 passed on PostgreSQL 16 (resolver truth table,
  guard, every entry point 403/200, reads stay 200, `/user/access` contract).
- Related suites (smoke, sandbox, chat, notebook, account, settings and others):
  only the three failures already present on `origin/main` 22f5894 remain
  (journal `bcbcdb09`). Smoke fixtures that created instruments with the model
  default `is_active=false` now set it explicitly.
- Live API run on 8012 with a synthetic teacher, student and class: disable QSA
  → `/user/access` drops it; chat, stream (lowercase code), submission, scoring
  and resume return `tool_disabled_for_class`; QSAr, teacher submission, frozen
  list, results read and delete stay 200; re-enabling restores submission;
  deleting the class returns the student to `restricted: false`.
