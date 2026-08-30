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

### Glossary (student-facing terminology — use consistently)
- **Profilo (profile)**: the outcome of a questionnaire from the Competenze Strategiche site — a set of factor scores (`QuestionnaireResult`). "Profilo" refers ONLY to this.
- **Taccuino (notebook)**: the student's self-declared notes about themselves — the open learner model (`LearnerProfileRevision`, `/user/learner-profile` API). Internal identifiers keep the `learner_profile` name; UI must say taccuino/notebook.
- **Libretto (booklet)**: per-instrument reflection on a dimension (`StudentBooklet`).
- **Portfolio**: collection of the student's works (`PortfolioItem`).
- **Gruppo/Classe (group/class)**: a teacher's autonomous class (`StudentGroup`), independent of questionnaires. Students join via invite code `GR-XXXXXX` (web `/gruppo?g=CODE`, class code from personal area, or Telegram deep link) → `GroupMembership`. Shared with co-teachers via `GroupShare`. An `AdministrationPlan` can attach a group (`group_id`) to tag results. Teacher notes/messages (`TeacherNote`) live on the group.
- Per-language pairs (taccuino / libretto): IT taccuino/libretto, EN notebook/booklet, ES cuaderno/cuadernillo, FR carnet/livret, DE Notizbuch/Arbeitsheft, SV anteckningsbok/arbetshäfte. The personal page (`/profilo` route) is labelled "Area personale" (personal area); role-preview identities are "account di prova" (test accounts), not "profili".

### Core Concepts
- **Guided path**: ordered `GuidedStep` rows per `questionnaire_type`. Each step has a `prompt` and `system_prompt_mode`. Steps are database-driven, seeded at startup from `prompt_config.py`.
- **Suggested questions**: `GuidedStepQuestion` rows linked to steps, shown as clickable suggestions in the student chat UI. Defaults in `guided_step_questions_seed.py`.
- **Skills engine**: `backend/skills/` selects and renders the skills bound to the current step. A deterministic, high-precision intent classifier activates at most one `primary` behaviour per turn: certified advice (`certified-advice`), conceptual clarification (`profile-wayfinder`), identifiable reading suggestions (`reading-guide`), or comparison of the same student's persisted profiles (`profile-comparison`). `always`/`support` skills may coexist; legacy `optional` candidates still use the LLM router above `skills_router_threshold`, with deterministic fallback. Behavioural instructions are appended in `directive_tail`, while handlers put certified sources, the citable reading whitelist and structured comparison data in `knowledge`. RAG retrieval runs *before* the engine so `reading-guide` can only offer sources actually retrieved in the turn (`reading_sources` handler); `profile-comparison` receives the last two compilations of each instrument, so the same questionnaire can be compared over time. Instructions are translated in all six languages (no English placeholder). The four primary skills are bound to all seven supported instruments; `approved-strategies` is retained but inactive and unbound. Which steps may deliver practical advice is decided upstream by `_ADVICE_PROMPT_MODES` in `chat_logic.py`: free chat, the QSA/QSAr second-level steps and the final synthesis step of QPCS, QPCC, QAP and SAVICKAS. Analysis, factor and interview steps stay interpretive and retrieve no certified strategy, and `_NO_NEW_ADVICE_STEP_IDS` keeps the QSA/QSAr synthesis from introducing new ones. The step prompts themselves were aligned to that directive: the QSA/QSAr second-level steps and the QPCS/QPCC/QAP/ZTPI summaries now ask for ONE practical action, not two or three. One exception: when a student's free message inside a step is classified as an advice request (`is_advice_follow_up`), one certified strategy is delivered even on an interpretive step, so the answer stays traceable to the catalog instead of being improvised. The per-step admin configuration and the synthesis veto both still win over that exception. Turning off the global engine flag restores the historic retrieval path in `chat_logic._retrieved_context`.
- **Session**: a chat session tied to a `QuestionnaireResult`. Has rolling Markdown conversational memory on disk.
- **Frozen session**: a student can suspend a guided-chat session mid-path via the "Congela sessione" button in `GuidedChatInterface`; the snapshot (step, scores, transcript) is stored in the `frozen_sessions` table keyed to the caller's `username` (`POST /session/freeze`). It's resumed from any device via the header's frozen-session icon (dropdown when several are frozen) or the `/?frozen=<session_id>` URL, which restores the snapshot into the guided chat. The snapshot is deleted (`DELETE /session/frozen/{session_id}`) once the guided path completes, so it can't be resumed into a finished session. Known limitation: the transcript comes back in full, but the model's own session memory has a 2-hour TTL and the snapshot doesn't carry `conversation_id`, so a session resumed much later returns "cold" — the student sees the history, the assistant may not remember it, and previously suggested strategies can repeat.
- **Student-facing chat** vs **Admin panel**: two sides of the same app. Admin edits prompts, API keys, guided steps, counselors live via UI.
- **Cross-synthesis**: on-demand synthesis across a student's multiple instrument results (`cross_synthesis.py`, `/user/cross-synthesis`).
- **Telegram bot**: students can link their account (`TelegramAccountLink`) and interact with guided chat over Telegram; group/plan deep links auto-enroll into a class. State machine in `telegram_state.py`, API in `telegram_bot.py`.

### User Roles
Roles are derived from ai4auth groups (marker-based, see `backend/auth.py`), not stored per-user.
- **Student**: fills out questionnaires, interacts with guided chat, can view own learner profile/taccuino, portfolio, groups
- **Counselor**: an AI persona (`Counselor` model) selectable in chat — a prompt profile, not a login role
- **Teacher / Docente** (`is_teacher`, group markers `docent/insegnant/teacher/educator/professor/faculty/staff`): owns classes/groups and administration plans, sees own students' results and conversations, writes notes/messages (`/docente` dashboard)
- **Researcher / Ricercatore** (`is_researcher`, markers `ricerc/research/researcher`): same class/plan capabilities as teacher, plus research contacts and anonymous-code administration
- **Admin** (member of any `ADMIN_GROUPS` group, env-configurable, defaults include `admins`): configures prompts, AI providers, guided steps, instruments, counselors, RAG; views all results and every group

## Architecture

### Request path
Frontend reaches backend via Next.js rewrite in `frontend/next.config.ts`:
`/api/:path*` → `http://backend:8000/:path*`

Exception: **`/api/chat/stream`** is a filesystem route `frontend/src/app/api/chat/stream/route.ts` because Next.js rewrite buffers Server-Sent Events.

`/counselorbot` and `/counselorbot/*` redirect to root (app is mounted under that path behind the proxy).

### Auth
ai4auth forward-auth at the edge (Nginx). Proxy injects `Remote-*` headers → parsed in `backend/auth.py`. Roles are marker-based on `Remote-Groups`: admin = any group in `ADMIN_GROUPS` (env `ADMIN_GROUPS`, comma-separated, always includes `admins`); researcher/teacher detected via `RESEARCH_GROUP_MARKERS`/`TEACHER_GROUP_MARKERS`. `frontend/src/lib/auth.ts` reads identity from `/auth/me`. Dev fallback identities exist for role preview (test accounts).

### Data Model
- **Config**: key-value DB store for prompts, UI texts, provider/model, API keys. Every key in `ENV_KEY_MAP` (`ai_service.py`) — API keys, `ollama_ip`, `ollama_num_ctx`, `ollama_keep_alive`, `qsa_ocr_model`, `qsa_parser_model` — is owned by the environment, not by the database: the env value wins at runtime and startup rewrites the Config row to match, so editing those in the admin panel or in SQL has no lasting effect. Change them in `.env` (or the compose default) and recreate the container. Defaults in `prompt_config.py`, seeded at startup without overwriting.
- **GuidedStep**: per `questionnaire_type`, ordered steps with `prompt` + `system_prompt_mode`
- **GuidedStepQuestion**: suggested questions per step
- **QuestionnaireResult**: per-session survey data
- **StudentBooklet**: per-instrument narrative booklet
- **StudentGroup / GroupMembership / GroupShare**: teacher classes, student enrollment, and co-teacher sharing (see Glossary → Gruppo/Classe)
- **TeacherNote**: teacher note (`kind=note`) or message (`kind=message`) about a student, scoped to a group/plan; messages can be delivered via Telegram
- **AdministrationPlan / AdministrationPlanResearcher / ResearchContact / AnonymousResearchCode**: research administration of instruments; a plan can attach a group and Telegram deep links
- **TelegramAccountLink / TelegramLinkCode / TelegramConversationState**: verified Telegram↔username mapping, one-time link codes, per-user bot conversation state machine
- **UserDisplayName**: cached display name/email for teachers/researchers/admins, auto-populated on plan/group/note creation
- **Session memory**: on-disk per-session rolling Markdown (`SESSION_MEMORY_DIR`), thread-safe, with expired-session cleanup. Semantic embedding retrieval available via `backend/memory_embeddings.py` (best-effort, falls back to keyword).
- **Strategy memory**: knowledge base from `knowledge/approved_strategies.md`, optionally overridden by the admin UI in DB config key `approved_strategies_markdown`
- **SharedChatResponse**: user feedback (helpful/unhelpful) on shared chat responses
- **NormThreshold**: normative thresholds per instrument (stanine cutoffs)
- **Skill / GuidedStepSkill**: declarative skills injected into the chat prompt (conditions, multilingual instructions, optional Python handler) and their binding to instrument/step (`step_id = "*"` = every step). Engine in `backend/skills/`, intent rules in `backend/skills/intents.py`, seed and one-time rollout policies in `backend/skills_seed.py` (`skills_certified_advice_policy_v1`, `skills_specialized_behaviors_v1`, `skills_reading_sources_and_i18n_v1` — each applied once, never overwriting admin edits), API `/admin/skills`. The admin preview exposes the detected intent. Enabled by default for QSA, QSAr, ZTPI, QPCS, QPCC, QAP and SAVICKAS; the admin can still disable the global flag as a rollback.
- **PqblDocument / PqblQuestion / PqblSession / PqblAttempt**: PQBL (Problem/Question-Based Learning) — uploaded PDFs, generated MCQs, student sessions, answer attempts
- **ValidationResponse**: psychometric validation data

### Prompts: code defaults vs DB (important)
Prompts live in **two places** with different roles:

- **DB = live, editable copy used at runtime.** System prompts and UI texts are rows in the `configs` table (e.g. `prompt_qpcs_analysis`, `prompt_qpcs_summary`); each guided step's instruction is the `prompt` column of `guided_steps` (with `system_prompt_mode`, label, color). The admin panel edits these DB rows.
- **`backend/prompt_config.py` = defaults + structure (in code, versioned in git).** It provides three things the DB does not:
  1. **Seed values** (`SYSTEM_PROMPT_DEFINITIONS`, `DEFAULT_*_GUIDED_STEPS`, guided texts): copied into the DB **at first startup only if missing** — an already-populated DB is **not** overwritten (`main.py` seeds guided steps `if count == 0`).
  2. **Fallback**: if a config key is missing from the DB at runtime, the code default is used (`SYSTEM_PROMPT_DEFAULTS.get(key, DEFAULT_SYSTEM_PROMPT_GENERIC)` in `chat_logic.py`).
  3. **Wiring not stored in the DB**: which steps exist / their order, and the **mode → config-key** map `MODE_TO_SYSTEM_PROMPT_KEY` (e.g. `"qpcs-analysis" → "prompt_qpcs_analysis"`).

**Runtime resolution order**: DB value (admin-edited) → code default in `prompt_config.py` → generic prompt.

**Editing rule**: to change a prompt, update **both**:
- **code** (`prompt_config.py`) → versioned, covers fresh installs and the fallback;
- **DB** (`configs` / `guided_steps`) → takes effect on the running instance (seed does not touch an existing DB).

Editing only the DB → a fresh install would ship the old text; editing only the code → the running instance is unchanged until the DB is updated. Git versions the code, **not** the DB.

### AI Providers
`AIService` (`backend/ai_service.py`) dispatches through a provider registry supporting **13 providers**: openai, anthropic, gemini, mistral, openrouter, ollama, llamacpp, **groq**, **cerebras**, **deepseek**, **together**, **fireworks**, **deepinfra**. Each provider: `call`, `stream`, `call_max`, `stream_max`. `disable_thinking` per-provider, driven by reasoning profiles (`backend/reasoning_profiles.py`). **Error contract**: config/provider failures raise `AIError` — never returned as chat content. Monthly budget fallback (`monthly_budget_usd`) switches to Ollama local model when exceeded.

### RAG System
Four built-in knowledge collections (plus dynamic collections created via admin UI):

| Collection | Source | Description |
|-----------|--------|-------------|
| `competenzestrategiche` | `docs/` (graphify pipeline) | Original site docs |
| `counselorbot` | `docs-counselorbot/` | Platform-specific docs |
| `framework` | `docs/fonti/competenze-strategiche/` | Theoretical articles, research papers |
| `questionari` | `docs/questionari/` | Instrument items, factor structures, scoring |

Site-chat endpoints accept `?collection=` query parameter. Per-collection context and audience-specific prompts configurable via DB keys (`FRAMEWORK_CHAT_CONFIG_DEFINITIONS`, `QUESTIONARI_CHAT_CONFIG_DEFINITIONS`, `COUNSELORBOT_CHAT_CONFIG_DEFINITIONS`).

### Docker
Code baked into images (no volume mounts). Any backend/frontend change requires rebuild. When adding a new backend subpackage, add a `COPY` line in `backend/Dockerfile` (copies explicit paths, not whole tree). Additional copy for JSON seed data: `COPY backend/*.json backend/`.

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

### Groups & Classes (teacher/researcher)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET/POST` | `/api/admin/groups` | teacher | List/create own (or shared) classes |
| `PUT/DELETE` | `/api/admin/groups/{group_id}` | teacher | Update/delete a class |
| `GET/POST` | `/api/admin/groups/{group_id}/shares` | teacher | List/add co-teacher shares |
| `DELETE` | `/api/admin/groups/{group_id}/shares/{share_id}` | teacher | Remove a share |
| `GET` | `/api/admin/groups/{group_id}/students` | teacher | Class students with results |
| `GET` | `/api/admin/groups/{group_id}/students/{username}/conversation/{session_id}` | teacher | Student conversation transcript |
| `GET/POST` | `/api/admin/groups/{group_id}/notes` | teacher | List/create teacher notes |
| `DELETE` | `/api/admin/teacher-notes/{note_id}` | teacher | Delete a note |
| `POST` | `/api/admin/groups/{group_id}/messages` | teacher | Send message to a student (web + Telegram) |
| `GET` | `/api/groups/info` | student | Resolve invite/class code info |
| `POST` | `/api/groups/join` | student | Join a class by code |
| `GET` | `/api/user/groups` | student | List own class memberships |
| `DELETE` | `/api/user/groups/{membership_id}` | student | Leave a class |
| `GET` | `/api/user/teacher-notes` | student | Notes/messages visible to the student |

### Cross-Synthesis
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/user/cross-synthesis/availability` | student | Whether enough results exist for a synthesis |
| `POST` | `/api/user/cross-synthesis` | student | Generate a cross-instrument synthesis |

### Telegram
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/telegram/webhook` | — | Telegram bot webhook (secret-guarded) |
| `GET` | `/api/telegram/bot-info` | — | Bot enabled status + username |
| `POST` | `/api/telegram/link-code` | student | Generate one-time account-link code |
| `GET` | `/api/telegram/link-status` | student | Current link status |
| `POST` | `/api/telegram/unlink` | student | Unlink Telegram account |
| `GET` | `/api/admin/telegram/links` | admin | List account links |
| `POST` | `/api/admin/telegram/links/{link_id}/revoke` | admin | Revoke a link |

### Assistant Questions (suggested questions in guided chat)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/assistant-questions` | student | Get suggested questions for current step |

### Site Chat (public-facing chatbot on landing page)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/site-chat/stream` | — | SSE chat stream (public). Accepts `?collection=` for multi-collection RAG |
| `GET` | `/api/site-chat/status` | admin | Index status. Accepts `?collection=` |
| `GET` | `/api/site-chat/collections` | — | List available knowledge collections |
| `POST` | `/api/site-chat/reindex` | admin | Rebuild RAG index. Accepts `?collection=` |

### Admin: RAG Documents
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/admin/rag/collections` | admin | List builtin and dynamic RAG collections |
| `POST` | `/api/admin/rag/collections` | admin | Create a dynamic RAG collection |
| `DELETE` | `/api/admin/rag/collections/{slug}` | admin | Delete a dynamic RAG collection |
| `GET` | `/api/admin/rag/docs` | admin | List collection documents with index/scope status |
| `GET` | `/api/admin/rag/docs/file` | admin | Preview or download a RAG document |
| `GET` | `/api/admin/rag/graph` | admin | Open the collection Graphify HTML graph |
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
| `GET/POST` | `/api/admin/guided-step-questions` | List/create suggested questions |
| `PUT/DELETE` | `/api/admin/guided-step-questions/{id}` | Update/delete suggested question |

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
| `GET` | `/api/admin/logs/options` | Log filter options (phases, modes, actions) |
| `GET` | `/api/admin/logs/conversation/{id}` | Logs for a specific conversation |
| `GET` | `/api/admin/logs/export` | Export filtered logs |
| `GET` | `/api/admin/logs/retention-status` | Log retention status |
| `GET` | `/api/admin/logs/pii-report` | PII scan report |
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
| `POST` | `/api/admin/counselors/{id}/translate` | Auto-translate counselor descriptions (Ollama) |
| `GET/POST/PUT/DELETE` | `/api/admin/presets` | Model presets |
| `GET/POST/PUT/DELETE` | `/api/admin/certified-strategies` | Certified strategies |
| `POST` | `/api/admin/benchmark/run` | Run benchmark |
| `GET` | `/api/admin/benchmark/runs` | Benchmark history |
| `GET/POST/PUT/DELETE` | `/api/admin/administration-plans` | Administration plans |
| `GET/POST/PUT/DELETE` | `/api/admin/research-contacts` | Research contacts |
| `GET` | `/api/admin/users-summary` | Teachers/researchers/students overview + groups (scoped by visibility) |

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
    guided_step_questions.py Admin CRUD for suggested questions per step
    rag_docs.py             Admin RAG collections + document management
    cross_synthesis.py      Cross-instrument synthesis for a student
    groups.py               Teacher classes/groups, memberships, shares, notes/messages
    telegram.py             Telegram account linking + admin link management
    approved_strategies.py  Admin CRUD for approved RAG strategies
  chat_logic.py             Prompt resolution, memory retrieval, post-processing
  ai_service.py             Multi-provider AI dispatch + env overrides
  auth.py                   Remote-* header parsing + role checks (admin/teacher/researcher)
  telegram_bot.py           Telegram Bot API client (send, webhook config)
  telegram_state.py         Telegram conversation state machine + deep-link enrollment
  user_names.py             Display-name cache helpers (UserDisplayName)
  rag_index.py              Site/RAG embedding index
  memory_service.py         On-disk session memory
  memory_embeddings.py      Semantic embedding retrieval for session memory
  certified_strategy_service.py  Certified strategy matching
  prompt_config.py          Default Config values (seeded at startup)
  scoring_service.py        Instrument scoring logic
  strategy_memory.py        Read-only knowledge base
  questionnaire_catalog.py  Instrument catalog defaults
  guided_text_i18n.py       Italian default guided text definitions
  guided_step_questions_seed.py  Italian default suggested questions per step
  guided_step_label_i18n.py i18n labels for guided steps
  anonymous_codes.py        Anonymous research code generation
  models.py                 SQLAlchemy models
  schemas.py                Pydantic schemas
  api_models.py             Pydantic API request/response models
  database.py               DB connection + session management
  reasoning_profiles.py     Cross-provider reasoning budget architecture
  pii.py                    PII redaction for conversation logs
  pdf_generator.py          Multi-language PDF generation for booklets
  model_pricing.py          Price table for cost estimation
  qsa_extractor.py          Local QSA profile extraction from PDFs/images
  pqbl_generator.py         PQBL skill extraction and MCQ generation
  benchmark_service.py      In-app benchmark engine
  prompt_audit.py           Prompt audit engine (shared logic)
  cross_synthesis.py        Cross-synthesis shared logic
  training_dataset.py       QSA fine-tuning dataset generation
  validation_export.py      Psychometric validation CSV export
  counselor_i18n.py         Counselor auto-translation (Ollama)
  assistant_questions_seed.py  Seed data for assistant questions
  certified_strategy_seed.py   Seed data for certified strategies
  legacy_italian_prompts.py Legacy Italian prompt defaults
  admin_sync.py             Sync ai4auth admin users as research contacts
  translations_seed.json    Default translations seed data
  tests/test_smoke.py       Smoke/regression guardrail
frontend/
  src/app/                  Next.js App Router
    admin/                  Admin panel pages
    docente/                Teacher dashboard (classes, students, notes/messages)
    gruppo/                 Class invite / join page (?g=CODE)
    somministrazione/       Administration-plan instrument flow
    assistente/             Assistant/guided-chat entry
    telegram-link/          Telegram account-linking page
    profilo/                Personal area (Area personale)
    questionario/           User feedback survey page
    pqbl/                   PQBL (Problem/Question-Based Learning) page
    login/                  Auth login (redirects to ai4auth)
    register/               Registration (redirects to home)
    strumenti/[id]/         Instrument detail pages
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
  translate_questions.py    Translator for guided step questions
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
- **Counselor** is an AI persona (`Counselor` model: name, description, `persona` prefix, model preset), not a human login role
- Classes (`StudentGroup`) are decoupled from questionnaires: they exist before/independently of administrations; an `AdministrationPlan.group_id` optionally attaches one to tag results
- Telegram bot requires `TELEGRAM_BOT_TOKEN`/webhook secret env config; disabled gracefully when unset (`telegram_bot.bot_enabled()`)
- **Pellerey meta prompts**: `prompt_config.py` defines `META_SYSTEM_PROMPT_DEFINITIONS` with 13 per-step knowledge blocks from Pellerey et al. (2013) "Imparare a dirigere se stessi", reframed from the student's perspective. Blocks: `PELLEREY_SELF_DIRECTION`, `PELLEREY_COGNITIVE_PROCESSES`, `PELLEREY_AFFECTIVE_PROCESSES`, `PELLEREY_ELABORATION`, `PELLEREY_SELFCONTROL`, `PELLEREY_MOTIVATION`, `PELLEREY_EMOTIONS`, `PELLEREY_ATTRIBUTION`, `PELLEREY_SOCIAL`, `PELLEREY_SYNTHESIS`, `PELLEREY_STRATEGIC_COMPETENCES` (instrument-level catch-all for QPCS/QPCC/QAP), `PELLEREY_SELF_REGULATION_CYCLE`, `PELLEREY_NARRATIVE_IDENTITY`. Injected as `[META SYSTEM PROMPT]` via `_instrument_meta_system_prompt()` in `chat_logic.py`. Per-step keys take priority over instrument-level. Admins can override per-step via UI. Seeded idempotently at startup. ~25 per-step + 3 instrument-level keys (pattern: `prompt_meta_{INSTRUMENT}_{STEP_ID}`).
- **Global directives**: 5 directive config keys injected into every prompt — `directive_context` (platform identity), `directive_language` (with `{lang}`/`{lang_native}`), `directive_register` (informal tu/du), `directive_thinking` (reasoning block with `<think>` tags), `directive_affirmative` (no negation-started sentences).
- **Intro prompts**: each instrument has an intro/welcome step ("Presentazione") with dedicated prompt keys (`prompt_intro`, `prompt_qsar_intro`, `prompt_ztpi_intro`, `prompt_savickas_intro`, `prompt_qpcs_welcome`, `prompt_qpcc_welcome`, `prompt_qap_welcome`).
- **Reasoning profiles**: `backend/reasoning_profiles.py` maps model families (qwen3, deepseek, gemini thinking, claude thinking, o-series) to reasoning budgets and `disable_thinking` behavior — a cross-provider reasoning architecture.
- **PII redaction**: `log_pii_redact` config key (default: true) — emails, phones, fiscal codes redacted from conversation logs before storage via `backend/pii.py`.
- **Counselor auto-translation**: `POST /api/admin/counselors/{id}/translate` triggers Ollama-based i18n for counselor descriptions (stored in `description_i18n` JSON field).
