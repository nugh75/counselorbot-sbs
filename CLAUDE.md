# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CounselorBot is an AI-powered web app that helps students analyze learning/career profiles through guided chat over three questionnaires: **QSA** (learning strategies), **ZTPI** (Zimbardo time perspective), and **Savickas** (career construction interview). UI and content are primarily Italian.

Stack: Next.js (App Router) frontend + FastAPI backend + PostgreSQL, deployed with Docker Compose.

## Commands

### Local dev (without Docker)
```bash
# Backend (run from repo root, NOT backend/, because it's a package: backend.main)
uvicorn backend.main:app --reload --port 8000

# Frontend
cd frontend && npm install && npm run dev      # http://localhost:3000
npm run build        # production build (also the truest typecheck of the app)
npm run lint         # eslint
npx tsc --noEmit     # standalone typecheck
```

### Docker (this is how it actually runs)
```bash
docker compose build backend frontend
docker compose up -d backend frontend
# Services: counselorbot_frontend (127.0.0.1:3000), counselorbot_backend (internal :8000),
# counselorbot_postgres (host :5435). proxy-network + auth-network are EXTERNAL networks.
```
Code is **baked into the images** (no volume mount for app code), so any backend or frontend change requires a rebuild + recreate of that service before it takes effect.

### Backend tests (smoke / regression guardrail)
```bash
docker exec counselorbot_backend python -m backend.tests.test_smoke
```
Tests run against a **dedicated Postgres database `counselorbot_test`** on the same instance (created automatically, prod `counselorbot` DB untouched) — never SQLite, to keep dialect fidelity (sequences, JSON, `func.now()`). The test file is plain-runnable (no pytest in the image) and also pytest-compatible. It overrides `get_db`/auth and mocks `AIService` (no network). `backend/tests/test_smoke.py` asserts the full route inventory plus key endpoints and pure helpers — run it before and after any backend refactor.

## Architecture

### Request path / frontend↔backend wiring
The frontend reaches the backend through a Next.js rewrite in `frontend/next.config.ts`: `/api/:path*` → `http://backend:8000/:path*`. The one exception is **`/api/chat/stream`**, served by a filesystem route at `frontend/src/app/api/chat/stream/route.ts` because the rewrite buffers Server-Sent Events. `/counselorbot` and `/counselorbot/*` redirect to root (app is mounted under that path behind the proxy).

### Auth
No client-side tokens. Authentication is **ai4auth forward-auth at the edge** (Nginx Proxy Manager): the proxy injects `Remote-*` headers, parsed in `backend/auth.py`. Admin status = membership in the `admins` group. `frontend/src/lib/auth.ts` reads identity from `/auth/me`.

### Backend layout (post-refactor)
`main.py` is intentionally thin: app creation, CORS, lifespan (Ollama preload), and the large idempotent **startup seeding/migration** (`startup_event`), then `include_router` for each router. Endpoints live in `backend/routes/{admin,survey,chat,memory}.py`. Shared pure helpers live in `backend/chat_logic.py`; request models in `backend/api_models.py`.

> When adding a new backend subpackage/module dir, you must add a matching `COPY` line in `backend/Dockerfile` — it copies `backend/*.py` plus explicit `COPY backend/routes/` and `backend/tests/`, NOT the whole tree. A missing COPY shows up as `ModuleNotFoundError` only after rebuild.

### Configuration is database-driven
Prompts, UI texts, active provider/model, and API keys are rows in the `Config` table, not constants. Defaults live in `backend/prompt_config.py` and are **seeded into the DB at startup without overwriting existing values** (`ALL_CONFIG_TEXT_DEFINITIONS`). The admin UI (`frontend/src/app/admin`, `components/admin/ConfigForm.tsx`) edits these rows live. For secrets, **environment variables override the DB** via `ENV_KEY_MAP` in `ai_service.py` (the admin UI shows an `ENV` badge when overridden). `startup_event` also performs raw-SQL column migrations and one-off legacy-prompt upgrades — keep these idempotent.

### AI providers (`backend/ai_service.py`)
`AIService` dispatches to openai / anthropic / gemini / mistral / openrouter / ollama / llamacpp through a single **provider registry** (`self._providers`: `call`, `stream`, `call_max`, `stream_max`). Adding a provider = one registry entry + a `_call_`/`_stream_` pair. Streaming uses `stream_response` (incremental for OpenAI-compatible + Anthropic; single chunk for gemini/mistral). `disable_thinking` (no-reasoning mode) is applied per-provider.

**Error contract:** config/provider failures raise `AIError` — never return/yield error strings as chat content (they would be shown to the student and saved into memory). The SSE path in `routes/chat.py` catches exceptions and emits a `{error}` event; the non-streaming `/chat` maps `AIError` to HTTP 502; the frontend consumer (`frontend/src/lib/chat-stream.ts`) throws on `{error}` events.

### Guided chat flow
Each questionnaire has ordered `GuidedStep` rows (per `questionnaire_type`), seeded at startup and editable in admin. A step carries a `prompt` and a `system_prompt_mode`. Chat requests resolve the effective system prompt and user message in `chat_logic._resolve_system_prompt` / `_resolve_user_message_for_chat` (guided-phase overrides, conversational follow-up modes, anti-greeting suffix).

### Memory
Two separate stores: `memory_service.session_memory` is per-session rolling **Markdown conversational memory** on disk (`SESSION_MEMORY_DIR`, file-backed, thread-safe, expired-session cleanup loop); `strategy_memory.strategy_memory` is a read-only collective **knowledge base of editorially-approved strategies** loaded from `knowledge/approved_strategies.md`. Retrieval for a chat turn is combined in `chat_logic._retrieved_context`.

### Student-facing sanitization
Before text reaches the student it is post-processed: QSA factor codes are always expanded to `Code (Name)` (`_annotate_qsa_factor_codes`, with progressive handling during streaming), and ZTPI technical labels/acronyms are stripped to plain language (`_sanitize_ztpi_*`). Note QSA has **inverted factors** (`_QSA_INVERTED_CODES`): for those, high score = area of growth, not strength — this must stay aligned with the frontend `questionnaires.ts`.

### Frontend i18n
Admin strings live in `frontend/src/lib/i18n-admin.ts` with **two locale blocks (IT + EN)** — add new keys to both. Other dictionaries: `i18n.ts`, `i18n-factors.ts`, `i18n-survey.ts`.

## Notes
- `GEMINI.md` describes a separate "3-layer agent" operating philosophy (`directives/` + `execution/` scripts) for agent workflows; it is not the app's runtime architecture.
- The README setup instructions are accurate for local dev but the production system runs via Docker Compose behind Nginx Proxy Manager (`deploy.sh`, `nginx_custom_location.conf`).
