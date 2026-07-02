# CONTEXT — Counselorbot SBS

<!-- ai4educ:context-template v1.0 -->

## Quick Reference
- **Stack**: Python (FastAPI), Next.js App Router, PostgreSQL, Docker Compose
- **Entry point**: `docker compose up -d --build` or `uvicorn backend.main:app --reload --port 8000` + `cd frontend && npm run dev`
- **Test**: `docker exec counselorbot_backend python -m backend.tests.test_smoke`
- **Repo**: (github)

## Domain
CounselorBot is an AI-powered web app that helps students analyze learning/career profiles through guided chat over seven instruments. UI and content are primarily Italian.

### Instruments
| Code | Description | Inverted factors |
|------|-------------|------------------|
| QSA | Learning strategies (full, cognitive + affective) | ✓ (high = growth area) |
| QSAr | Reduced QSA | ✓ |
| ZTPI | Zimbardo time perspective | — |
| SAVICKAS | Career construction interview (narrative) | — |
| QPCS | Perceived strategic competences | — |
| QPCC | Perceived competences and beliefs | — |
| QAP | Career adaptability | — |
| EVENTO_STUDIO | Significant study events (narrative, no dimensions) | — |
| EVENTO_PROFESSIONALE | Significant professional events (narrative, no dimensions) | — |

### Core Concepts
- **Guided path**: ordered `GuidedStep` rows per `questionnaire_type`. Each step has a `prompt` and `system_prompt_mode`. Steps are database-driven, seeded at startup from `prompt_config.py`.
- **Suggested questions**: `GuidedStepQuestion` rows linked to steps, shown as clickable suggestions in the student chat UI. Defaults in `guided_step_questions_seed.py`.
- **Session**: a chat session tied to a `QuestionnaireResult`. Has rolling Markdown conversational memory on disk.
- **Student-facing chat** vs **Admin panel**: two sides of the same app. Admin edits prompts, API keys, guided steps, counselors live via UI.

### User Roles
- **Student**: fills out questionnaires, interacts with guided chat, can view own learner profile and portfolio
- **Counselor**: can view assigned students' data with restricted access
- **Admin**: configures prompts, AI providers, guided steps, counselors; views all results

## Architecture

### Request path
Frontend reaches backend via Next.js rewrite in `frontend/next.config.ts`:
`/api/:path*` → `http://backend:8000/:path*`

Exception: **`/api/chat/stream`** is a filesystem route `frontend/src/app/api/chat/stream/route.ts` because Next.js rewrite buffers Server-Sent Events.

`/counselorbot` and `/counselorbot/*` redirect to root (app is mounted under that path behind the proxy).

### Auth
ai4auth forward-auth at the edge (Nginx). Proxy injects `Remote-*` headers → parsed in `backend/auth.py`. Admin = `admins` group. `frontend/src/lib/auth.ts` reads identity from `/auth/me`.

### Data Model
- **Config**: key-value DB store for prompts, UI texts, provider/model, API keys. Secrets overridable via env vars (`ENV_KEY_MAP` in `ai_service.py`). Defaults in `prompt_config.py`, seeded at startup without overwriting.
- **GuidedStep**: per `questionnaire_type`, ordered steps with `prompt` + `system_prompt_mode`
- **GuidedStepQuestion**: suggested questions per step
- **QuestionnaireResult**: per-session survey data
- **StudentBooklet**: per-instrument narrative booklet
- **Session memory**: on-disk per-session rolling Markdown (`SESSION_MEMORY_DIR`), thread-safe, with expired-session cleanup
- **Strategy memory**: knowledge base from `knowledge/approved_strategies.md`, optionally overridden by the admin UI in DB config key `approved_strategies_markdown`

### AI Providers
`AIService` (`backend/ai_service.py`) dispatches to openai / anthropic / gemini / mistral / openrouter / ollama / llamacpp through a provider registry. Each provider: `call`, `stream`, `call_max`, `stream_max`. `disable_thinking` per-provider. **Error contract**: config/provider failures raise `AIError` — never returned as chat content.

### Docker
Code baked into images (no volume mounts). Any backend/frontend change requires rebuild. When adding a new backend subpackage, add a `COPY` line in `backend/Dockerfile` (copies explicit paths, not whole tree).

### Networks
Containers on `proxy-network` + `auth-network` (external). Exposed ports: backend `8088` (host-only), frontend `3000` through Nginx proxy.

## Commands

```bash
# ── Docker (production) ──
docker compose up -d --build         # Full stack
docker compose ps                    # Status
docker compose logs -f backend       # Backend logs
docker exec counselorbot_backend python -m backend.tests.test_smoke  # Tests

# ── Local dev ──
uvicorn backend.main:app --reload --port 8000   # Backend (from repo root)
cd frontend && npm run dev                      # Frontend (http://localhost:3000)
cd frontend && npm run build                    # Production build + typecheck
cd frontend && npm run lint                     # ESLint
cd frontend && npx tsc --noEmit                 # Standalone typecheck

# ── Prompt testing (Makefile) ──
make prompt-test Q=QSA STEP=intro                    # Live LLM call, save log
make prompt-dry Q=QSAr STEP=qsar-cognitive           # Envelope only, no LLM
make prompt-steps Q=ZTPI                             # List steps for questionnaire
make prompt-log ID=42                                # Dump envelope from log
make prompt-log-on                                   # Enable full-prompt-logging
make prompt-log-off                                  # Disable full-prompt-logging
make prompt-test Q=QSA STEP=intro COUNSELOR=7 STUDENT=barbaraambu RESP_LANG=en  # Full params
```

## API Reference

### Chat & Guided UI
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/qsa/guided-ui-texts?questionnaire_type=QSA&lang=it` | — | Get guided steps + suggested questions for student UI |
| `POST` | `/api/chat` | student | Non-streaming chat turn |
| `POST` | `/api/chat/stream` | student | SSE streaming chat turn (filesystem route) |
| `POST` | `/api/chat/message` | student | Chat message logging |
| `POST` | `/api/tts` | student | Text-to-speech |

### Surveys & Scoring
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/survey` | student | Submit survey response |
| `POST` | `/api/questionnaire-result` | student | Submit scored questionnaire result → triggers guided chat |
| `POST` | `/api/instruments/{code}/score` | student | Score a single instrument's responses |
| `GET` | `/api/instruments/{code}/rules` | student | Get instrument scoring rules + factor definitions |
| `GET` | `/api/user/questionnaire-results` | student | List own questionnaire results |
| `GET` | `/api/questionnaire-result/{session_id}/pdf` | student | Download student booklet PDF |
| `GET` | `/api/questionnaire-result/{session_id}/conversation` | student | Get full conversation for a session |
| `POST` | `/api/strategy-feedback` | student | Submit feedback on a recommended strategy |
| `GET` | `/api/user/certified-strategies` | student | List certified strategies |

### Student Booklets (per-instrument narrative documents)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/user/student-booklets/instrument/{type}` | student | Get booklet for instrument type |
| `PUT` | `/api/user/student-booklets/instrument/{type}` | student | Create/update booklet |
| `GET` | `/api/user/student-booklets/instrument/{type}/pdf` | student | Download booklet as PDF |
| `DELETE` | `/api/user/student-booklets/id/{booklet_id}` | student | Delete booklet |

### Learner Profile
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/user/learner-profile` | student | Get profile |
| `POST` | `/api/user/learner-profile` | student | Create/update profile |
| `GET` | `/api/user/learner-profile/history` | student | Profile change history |
| `POST` | `/api/user/learner-profile/reflections` | student | Add reflection note |
| `DELETE` | `/api/user/learner-profile` | student | Delete profile |

### Portfolio
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/user/portfolio` | student | List items |
| `POST` | `/api/user/portfolio` | student | Create item |
| `PUT` | `/api/user/portfolio/{id}` | student | Update item |
| `DELETE` | `/api/user/portfolio/{id}` | student | Delete item |
| `POST` | `/api/user/portfolio/{id}/images` | student | Upload image |

### Counselors (public info for student chat)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/counselors` | student | List available counselors (public info) |

### Assistant Questions (suggested questions in guided chat)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/assistant-questions` | student | Get suggested questions for current step |

### Site Chat (public-facing chatbot on landing page)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/site-chat/stream` | — | SSE chat stream (public) |
| `GET` | `/api/site-chat/status` | admin | Index status |
| `POST` | `/api/site-chat/reindex` | admin | Rebuild RAG index |

### Admin: RAG Documents
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/admin/rag/collections` | admin | List builtin and dynamic RAG collections |
| `POST` | `/api/admin/rag/collections` | admin | Create a dynamic RAG collection |
| `DELETE` | `/api/admin/rag/collections/{slug}` | admin | Delete a dynamic RAG collection |
| `GET` | `/api/admin/rag/docs` | admin | List collection documents with index/scope status |
| `GET` | `/api/admin/rag/docs/file` | admin | Preview or download a RAG document |
| `POST` | `/api/admin/rag/docs` | admin | Upload a Markdown/PDF document and reindex |
| `PATCH` | `/api/admin/rag/docs/scope` | admin | Include/exclude a document from collection scope and reindex |
| `DELETE` | `/api/admin/rag/docs` | admin | Delete an uploaded document and reindex |

### PQBL (Problem/Question-Based Learning)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/pqbl/upload` | — | Upload document for question generation |
| `POST` | `/api/pqbl/sessions` | student | Start PQBL session |
| `GET` | `/api/pqbl/sessions/{id}/questions` | student | Get generated questions |
| `POST` | `/api/pqbl/sessions/{id}/answer` | student | Submit answer |
| `POST` | `/api/pqbl/sessions/{id}/final-test` | student | Take final test |
| `GET` | `/api/pqbl/sessions/{id}/summary` | student | Session summary |

### Admin: Config
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/config` | List all config entries |
| `POST` | `/api/admin/config` | Create/update config entry |
| `GET` | `/api/admin/config/env-status` | Check which secrets are overridden by env vars |
| `GET` | `/api/admin/models` | List available AI models per provider |

### Admin: Prompt Audit
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/admin/prompt-audit/dry-run` | Build envelope without calling LLM |
| `POST` | `/api/admin/prompt-audit/live` | Call LLM with current config |
| `POST` | `/api/admin/prompt-audit/matrix` | Test multiple provider/model combos |

### Admin: Strategy Knowledge
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/approved-strategies` | List generic RAG strategies (`strategy_ids`) |
| `POST` | `/api/admin/approved-strategies` | Create generic RAG strategy |
| `PUT` | `/api/admin/approved-strategies/{strategy_id}` | Update generic RAG strategy |
| `DELETE` | `/api/admin/approved-strategies/{strategy_id}` | Delete generic RAG strategy |
| `GET/POST/PUT/DELETE` | `/api/admin/certified-strategies` | Manage certified learning strategies |

### Admin: Guided Steps
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/guided-steps` | List all steps |
| `POST` | `/api/admin/guided-steps` | Create step |
| `PUT` | `/api/admin/guided-steps/{id}` | Update step |
| `DELETE` | `/api/admin/guided-steps/{id}` | Delete step |
| `PATCH` | `/api/admin/guided-steps/reorder` | Reorder steps |

### Admin: Instruments & Factors
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/instruments` | List instruments |
| `POST` | `/api/admin/instruments` | Create instrument |
| `PUT` | `/api/admin/instruments/{code}` | Update instrument |
| `GET` | `/api/admin/instruments/{code}/factors` | List factors |
| `POST` | `/api/admin/instruments/{code}/factors` | Create factor |
| `PUT` | `/api/admin/factors/{id}` | Update factor |
| `DELETE` | `/api/admin/factors/{id}` | Delete factor |
| `GET` | `/api/admin/instruments/{code}/items` | List items |
| `POST` | `/api/admin/instruments/{code}/items` | Create item |
| `PUT` | `/api/admin/items/{id}` | Update item |
| `DELETE` | `/api/admin/items/{id}` | Delete item |
| `GET/POST/DELETE` | `/api/admin/instruments/{code}/norm-thresholds` | Normative thresholds |

### Admin: Training Dataset (QSA fine-tuning)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/training-dataset/summary` | Status overview |
| `GET` | `/api/admin/training-dataset/examples` | List examples |
| `POST` | `/api/admin/training-dataset/examples` | Create example |
| `POST` | `/api/admin/training-dataset/generate` | Auto-generate examples from submissions |
| `PATCH` | `/api/admin/training-dataset/examples/{id}` | Update example |
| `DELETE` | `/api/admin/training-dataset/examples/{id}` | Delete example |
| `GET` | `/api/admin/training-dataset/export.jsonl` | Export ChatML JSONL |

### Admin: Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/logs` | Logs with filtering |
| `GET` | `/api/admin/logs/count` | Log counts |
| `GET` | `/api/admin/logs/stats` | Aggregated stats |
| `GET` | `/api/admin/cost-stats` | Cost per model/provider |
| `DELETE` | `/api/admin/logs/session/{id}` | Delete session logs |
| `POST` | `/api/admin/logs/retention-run` | Run log retention cleanup |
| `GET` | `/api/admin/surveys` | List surveys |
| `DELETE` | `/api/admin/survey/{id}` | Delete survey |
| `GET` | `/api/admin/validation/summary` | Validation data summary |
| `GET` | `/api/admin/validation/export.csv` | Export validation CSV |
| `GET` | `/api/admin/questionnaire-results` | List all results |
| `GET` | `/api/admin/strategy-feedback` | Strategy feedback summary |
| `GET/POST/PUT/DELETE` | `/api/admin/counselors` | Counselor management |
| `GET/POST/PUT/DELETE` | `/api/admin/presets` | Model presets |
| `GET/POST/PUT/DELETE` | `/api/admin/certified-strategies` | Certified strategies |
| `POST` | `/api/admin/benchmark/run` | Run benchmark |
| `GET` | `/api/admin/benchmark/runs` | Benchmark history |
| `GET/POST/PUT/DELETE` | `/api/admin/administration-plans` | Administration plans |
| `GET/POST/PUT/DELETE` | `/api/admin/research-contacts` | Research contacts |

## File Layout
```
backend/
  main.py                   Thin: app creation, CORS, lifespan, startup seeding
  routes/
    admin.py                Admin CRUD (logs, config, guided steps, instruments, dataset)
    survey.py               Questionnaire submission, scoring, booklets, PDF
    chat.py                 Chat (stream/non-stream), guided UI texts, TTS, QSA upload
    memory.py               Session memory endpoints
    site_chat.py            Public-facing chatbot + RAG
    learner_profile.py      Student learner profile
    portfolio.py            Student portfolio (items + images)
    pqbl.py                 Problem/Question-Based Learning
    opencode.py             OpenCode agent workspace for PDF chat
    presets.py              Model presets
    benchmark.py            Benchmark runner
    prompt_audit.py         Prompt testing (dry-run, live, matrix)
    counselors.py           Counselor profiles
    certified_strategies.py Certified strategy management
    research_contacts.py    Research contact management
    administration_plans.py Study administration plans
    assistant_questions.py  Suggested questions for guided chat
  chat_logic.py             Prompt resolution, memory retrieval, post-processing
  ai_service.py             Multi-provider AI dispatch + env overrides
  auth.py                   Remote-* header parsing + role checks
  prompt_config.py          Default Config values (seeded at startup)
  scoring_service.py        Instrument scoring logic
  strategy_memory.py        Read-only knowledge base
  questionnaire_catalog.py  Instrument catalog defaults
  guided_text_i18n.py       Italian default guided text definitions
  guided_step_questions_seed.py  Italian default suggested questions per step
  anonymous_codes.py        Anonymous research code generation
  models.py                 SQLAlchemy models
  schemas.py                Pydantic schemas
  database.py               DB connection + session management
  tests/test_smoke.py       Smoke/regression guardrail
frontend/
  src/app/                  Next.js App Router
    admin/                  Admin panel pages
    api/chat/stream/        SSE bypass filesystem route
  src/components/admin/     Admin UI components (ConfigForm, etc.)
  src/lib/
    auth.ts                 Identity from /auth/me
    chat-stream.ts          SSE consumer (throws on {error})
    i18n.ts                 Student-facing strings
    i18n-admin.ts           Admin strings (IT + EN blocks)
    i18n-factors.ts         Factor descriptions
    i18n-survey.ts          Survey UI strings
    questionnaires.ts       Factor definitions + inverted codes
knowledge/
  approved_strategies.md    Read-only strategy knowledge base
scripts/
  prompt_test.py            Prompt envelope tester
Makefile                    Prompt testing shortcuts
```

## Conventions
- **Configuration is DB-driven**: prompts, UI texts, API keys are DB rows, seeded from `prompt_config.py` at startup (idempotent, no overwrite). Admin edits live via ConfigForm.
- **Error contract**: AI failures raise `AIError`. SSE emits `{error}` event. Non-streaming maps `AIError` → HTTP 502. Frontend consumer throws on `{error}`.
- **Student-facing sanitization**: QSA codes expanded to `Code (Name)`. ZTPI labels stripped. Inverted QSA factors must stay aligned with `questionnaires.ts`.
- **i18n**: admin strings in `i18n-admin.ts` (IT + EN blocks). Add new keys to both.
- **Tests**: dedicated `counselorbot_test` Postgres DB (never SQLite). Override `get_db`/auth, mock `AIService`. Plain-runnable and pytest-compatible.
- **Startup seeding**: idempotent. Raw-SQL column migrations must be idempotent.
- **Backend Dockerfile**: copies explicit paths (`COPY backend/routes/`, `COPY backend/tests/`), not the whole tree. Missing COPY → `ModuleNotFoundError` after rebuild.

## Notes
- `GEMINI.md` describes a separate "3-layer agent" philosophy for agent workflows — not the app's runtime architecture
- Student booklets for `EVENTO_STUDIO`/`EVENTO_PROFESSIONALE` are narrative-only (no dimensions)
- `prompt_test.py` runs inside the backend container via `docker exec` with env vars for all parameters
- Log retention: configurable via `logFullRetentionDays` config key, with manual `retention-run` trigger
- `openai_assistants` functions can auto-generate QSA training examples
- The `_resolve_system_prompt` function applies: counselor overrides → guided-phase mode → questionnaire-default → fallbacks
