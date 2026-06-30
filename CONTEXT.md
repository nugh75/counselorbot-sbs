# CONTEXT — Counselorbot SBS

<!-- ai4educ:context-template v1.0 -->

## Quick Reference
- **Stack**: Python (FastAPI), Next.js App Router, PostgreSQL, Docker Compose
- **Entry point**: `docker compose up -d --build` or `uvicorn backend.main:app --reload --port 8000` + `cd frontend && npm run dev`
- **Test**: `docker exec counselorbot_backend python -m backend.tests.test_smoke`
- **Repo**: (github)

## Domain
CounselorBot is an AI-powered web app that helps students analyze learning/career profiles through guided chat over seven instruments. UI and content are primarily Italian.

### Core Concepts
- **QSA**: learning strategies — full profile with cognitive and affective factors. Has **inverted factors** (high score = area of growth, not strength).
- **QSAr**: reduced QSA for quicker learning-strategy analysis.
- **ZTPI**: Zimbardo time perspective profile.
- **SAVICKAS**: narrative career construction interview.
- **QPCS**: perceived strategic competences.
- **QPCC**: perceived competences and beliefs.
- **QAP**: career adaptability resources.
- **Guided path**: ordered `GuidedStep` rows per `questionnaire_type`. Each step has a `prompt` and a `system_prompt_mode`.
- **Suggested questions**: `GuidedStepQuestion` rows linked to steps, shown in the student chat UI.
- **Session**: a chat session tied to a questionnaire result. Has rolling Markdown conversational memory.
- **Student-facing chat** vs **Admin panel**: two sides of the same app. Admin edits prompts, API keys, guided steps live.

### User Roles
- **Student**: fills out questionnaires, interacts with guided chat.
- **Admin**: configures prompts, AI providers, guided steps; views results.

## Architecture

### Request path / frontend↔backend wiring
The frontend reaches the backend through a Next.js rewrite in `frontend/next.config.ts`: `/api/:path*` → `http://backend:8000/:path*`. Exception: **`/api/chat/stream`** is served by a filesystem route at `frontend/src/app/api/chat/stream/route.ts` because the rewrite buffers Server-Sent Events. `/counselorbot` and `/counselorbot/*` redirect to root (app is mounted under that path behind the proxy).

### Auth
No client-side tokens. Authentication is **ai4auth forward-auth at the edge** (Nginx Proxy Manager): the proxy injects `Remote-*` headers, parsed in `backend/auth.py`. Admin status = membership in the `admins` group. `frontend/src/lib/auth.ts` reads identity from `/auth/me`.

### Key Directories
```
backend/
  main.py              — thin: app creation, CORS, lifespan, startup seeding
  routes/
    admin.py           — admin endpoints
    survey.py          — questionnaire endpoints
    chat.py            — chat/stream endpoints
    memory.py          — session memory endpoints
  chat_logic.py        — shared pure helpers (prompt resolution, memory retrieval)
  ai_service.py        — multi-provider AI dispatch
  auth.py              — Remote-* header parsing
  prompt_config.py     — default Config values (seeded into DB)
  guided_step_questions_seed.py — Italian default suggested questions
  tests/
    test_smoke.py      — smoke/regression guardrail
frontend/
  src/
    app/               — Next.js App Router pages
      admin/           — admin UI
      api/chat/stream/ — SSE bypass route
    components/
      admin/           — admin panel components (ConfigForm, etc.)
    lib/
      auth.ts          — identity from /auth/me
      chat-stream.ts   — SSE consumer
      i18n.ts          — student-facing strings
      i18n-admin.ts    — admin strings (IT + EN blocks)
      i18n-factors.ts  — factor descriptions
      i18n-survey.ts   — survey UI strings
      questionnaires.ts — factor definitions, inverted codes
```

### Key Files
- `backend/main.py` — app creation, CORS, lifespan (Ollama preload), and the idempotent **startup seeding/migration** (`startup_event`). Then `include_router` for each router.
- `backend/ai_service.py` — `AIService` dispatches to openai / anthropic / gemini / mistral / openrouter / ollama / llamacpp through a provider registry. Each provider has `call`, `stream`, `call_max`, `stream_max`. Error contract: config/provider failures raise `AIError` — never return/yield error strings as chat content.
- `backend/chat_logic.py` — `_resolve_system_prompt` and `_resolve_user_message_for_chat` (guided-phase overrides, conversational follow-up, anti-greeting suffix). Also `_retrieved_context`.
- `backend/prompt_config.py` — `ALL_CONFIG_TEXT_DEFINITIONS` with default values. Seeded into DB at startup **without overwriting existing values**.
- `frontend/next.config.ts` — API rewrite + `/counselorbot` redirects.
- `frontend/src/lib/chat-stream.ts` — SSE consumer; throws on `{error}` events.
- `knowledge/approved_strategies.md` — read-only knowledge base for strategy memory.

### Data Model (essential)
- **Config**: key-value store for prompts, UI texts, provider/model selection, API keys. Secrets can be overridden by env vars (`ENV_KEY_MAP` in `ai_service.py`). Admin UI: `ConfigForm.tsx`.
- **GuidedStep**: per `questionnaire_type`, ordered steps with `prompt` and `system_prompt_mode`.
- **GuidedStepQuestion**: suggested questions linked to steps, shown at base of guided-chat UI.
- **Session memory**: per-session rolling Markdown on disk (`SESSION_MEMORY_DIR`), file-backed, thread-safe, expired-session cleanup loop.
- **Strategy memory**: read-only collective knowledge base from `knowledge/approved_strategies.md`.

### Docker notes
Code is **baked into the images** (no volume mount for app code). Any backend or frontend change requires rebuild + recreate of that service. When adding a new backend subpackage/module dir, add a matching `COPY` line in `backend/Dockerfile` — it copies explicit paths, NOT the whole tree.

## Conventions
- **Backend layout**: routes in `backend/routes/`, logic in `backend/chat_logic.py`, models in `backend/api_models.py`. `main.py` is thin.
- **Configuration is DB-driven**: prompts, UI texts, and API keys are DB rows, not constants. Defaults in `prompt_config.py`, seeded at startup. Admin edits live via `ConfigForm.tsx`.
- **Error contract**: AI failures raise `AIError`. SSE catches and emits `{error}` event. Non-streaming `/chat` maps `AIError` to HTTP 502. Frontend consumer throws on `{error}`.
- **Student-facing sanitization**: QSA factor codes expanded to `Code (Name)` (`_annotate_qsa_factor_codes`). ZTPI technical labels stripped (`_sanitize_ztpi_*`). Inverted QSA factors (`_QSA_INVERTED_CODES`) must stay aligned with `frontend/src/lib/questionnaires.ts`.
- **i18n**: admin strings in `i18n-admin.ts` with IT + EN blocks — add new keys to both.
- **Tests**: run against dedicated `counselorbot_test` Postgres DB (never SQLite). Override `get_db`/auth, mock `AIService`. Plain-runnable and pytest-compatible.
- **Startup seeding**: idempotent (no overwrite of existing). Raw-SQL column migrations must be idempotent.

## Common Tasks

| Task | Command / Procedure |
|---|---|
| Avvio Docker | `docker compose up -d --build` |
| Avvio locale | Backend: `uvicorn backend.main:app --reload --port 8000` (da repo root). Frontend: `cd frontend && npm run dev` |
| Test backend | `docker exec counselorbot_backend python -m backend.tests.test_smoke` |
| Lint frontend | `cd frontend && npm run lint` |
| Typecheck frontend | `cd frontend && npx tsc --noEmit` |
| Build frontend | `cd frontend && npm run build` |
| Aggiungere un provider AI | Aggiungi entry nel registry di `AIService` (1 riga) + coppia `_call_`/`_stream_` |
| Aggiungere un nuovo questionario | Crea `GuidedStep` rows, `GuidedStepQuestion` rows, seed in `guided_step_questions_seed.py`, aggiungi route in `backend/routes/` |
| Aggiungere directory backend | Aggiungi `COPY` in `backend/Dockerfile` |

## ADRs / Decisions
- **SSE bypass**: `/api/chat/stream` non passa per il rewrite Next.js perché bufferizza gli SSE. Servito da filesystem route Next.js.
- **Test con Postgres reale**: mai SQLite, per fedeltà dialettale (sequences, JSON, `func.now()`).
- **No volume mount per codice**: le immagini contengono il codice. Ogni modifica richiede rebuild.
