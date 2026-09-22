# CounselorBot — technical and pedagogical description

This document describes **what CounselorBot does** from a technical and pedagogical
perspective, and is intended for two audiences: students using the platform and
administrators/teachers/researchers who configure, monitor, and integrate it into
teaching or research.

> **Test mode notice**: Item-level questionnaire administration on CounselorBot is
> currently in **test mode** and available in **English, Spanish, French, German, and
> Swedish**; none of those versions is validated yet. It is not available in Italian. The
> guided chat and the platform interface work in Italian, English, Spanish, French,
> German, and Swedish once a profile is entered manually or uploaded. For Italian-language
> questionnaires, the official validated instruments are administered through
> [competenzestrategiche.it](https://competenzestrategiche.it).

---

## 1. Pedagogical foundations

CounselorBot embodies key principles of educational psychology and career guidance:

- **Self-Regulated Learning (SRL)** — The platform helps students become aware of
  their cognitive and affective-motivational strategies, supporting planning,
  monitoring, and self-assessment processes (Pellerey model, QSA).
- **Time perspective** — Through the ZTPI (Zimbardo), students explore how their
  orientation toward past, present, and future influences motivation and study
  decisions.
- **Narrative career construction** — The Savickas Career Construction Interview helps
  students build a coherent narrative of their vocational identity, starting from
  open-ended questions about role models, interests, and life themes.
- **Open learner model** — the Notebook contains the person's explicit self-description,
  edited by them with revision history and change reflections. It informs counselor
  responses. The AI does not automatically rewrite it; "profile" means questionnaire scores.
- **Conversational scaffolding** — The guided chat is structured in steps (guided
  steps), each with a prompt and a system mode, to support students without
  overwhelming them, offering a gradual reflection path. Steps are DB-driven rows per
  `questionnaire_type`, ordered by `sort_order`.
- **Critical thinking, not judgment** — The platform does not return evaluations but
  mirrors for reflection. There are no right or wrong answers; the focus is on
  awareness and self-determination.
- **Pure Question-Based Learning (pQBL)** — Following the Jemstedt & Bälter method, the
  student uploads a PDF and the system extracts skills and generates multiple-choice
  questions with formative feedback per alternative, to support active retrieval.

---

## 2. Technical architecture

### Stack

| Component | Technology |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Recharts, xterm.js (sandbox) |
| Backend | FastAPI (Python), SQLAlchemy, asyncpg |
| Database | PostgreSQL 15 (Dockerized) |
| AI | OpenAI, Anthropic, Gemini, Mistral, OpenRouter, Ollama, llama.cpp, Groq, Cerebras, DeepSeek, Together AI, Fireworks, DeepInfra |
| Deploy | Docker Compose + Nginx Proxy Manager |
| Auth | ai4auth (proxy-level forward-auth) |

### Request flow

The frontend reaches the backend through a Next.js rewrite:
`/api/:path*` → `http://backend:8000/:path*`. The exception is `/api/chat/stream`
(SSE), served by a frontend filesystem route because the rewrite would buffer
server-sent events.

### Database-driven configuration

Prompts, UI texts, active provider/model, and API keys are rows in the `configs`
table, not hardcoded constants. The admin UI edits them live. For secrets, environment
variables override the database (the UI shows an `ENV` badge). Guided steps, instrument
catalog factors/items/norm thresholds, counselors, presets, certified strategies,
training examples, benchmarks, administration plans, and research contacts are all
DB rows.

### Memory

- **Session memory** (`memory_service.py`): per-session rolling conversational Markdown
  memory on disk, thread-safe. Expires after 2 hours. Tracks state, facts, preferences,
  goals, external notes (synced from the OpenCode `appunti.md`), and the last 16
  episodes. Background cleanup loop and log retention loop.
- **Strategy memory** (`strategy_memory.py` + `knowledge/approved_strategies.md`):
  knowledge base of editorially-approved learning strategies, retrieved by relevance
  (keyword overlap or semantic similarity) and injected into the system context.
- **Certified strategy memory** (`certified_strategy_service.py`): DB-driven catalog of
  active certified strategies, gated by factor salience and `match_mode`, multilingual,
  injected with an explicit certified-advice directive.
- **Shared memory** (`SharedResponseMemory`): AI responses found useful by students
  (thumbs up), made available anonymously to other students.

### Startup and migrations

At startup the backend performs idempotent seeding and migrations: creates missing
columns (raw SQL `ALTER TABLE ADD COLUMN IF NOT EXISTS`), inserts default texts if not
present, populates guided steps and the instrument catalog, syncs environment
variables into the database, migrates counselor personas to English with the
`{{counselor_name}}` placeholder, and back-fills instrument display names.

### AI providers and error handling

`AIService` dispatches across all providers through a unified registry. Each provider
exposes `call` and `stream`. Streaming is incremental for OpenAI, Anthropic, Ollama,
llama.cpp, and compatibles; single-chunk for Gemini, Mistral, and OpenRouter.
Configuration/provider failures raise `AIError`: the SSE path emits an `{error}` event,
the non-streaming path returns HTTP 502. The frontend throws on error events. A monthly
budget can be configured with a fallback model (`qwen3.5:9b`).

---

## 3. For students: what the platform does

### The user journey

1. **Tool selection** — Six questionnaires (QSA, QSAr, ZTPI, QPCS, QPCC, QAP)
   produce score profiles. Four conversation tools (SAVICKAS, IDEA, EVENTO_STUDIO,
   EVENTO_PROFESSIONALE) require no scores. pQBL offers practice from a PDF.
   The Compass helps choose a route; the catalog also permits direct selection.
2. **Counselor selection** — The student selects an AI counselor (persona, style,
   language). Each counselor has a distinct tone and AI model, configurable by
   administrators.
3. **Profile entry** — For numeric questionnaires: manual input (stanine scores 1-9)
   or PDF/photo upload with automatic OCR score extraction. For the four conversation tools:
   direct entry into the chat, without a factor-score dashboard.
4. **Visual dashboard** — Radar/bar chart with colored bands (green = strength, yellow
   = moderate area, red = growth area), corrected for inverted factors.
5. **Guided chat** — The counselor walks the student through step by step: explains
   each factor, answers free-text questions, proposes macro-analysis and improvement
   strategies. The chat streams (SSE) with progressive Markdown rendering. The system
   auto-expands factor codes (e.g. `C1` → `C1 (Elaborative strategies)`) and
   simplifies ZTPI technical labels.
6. **Completion** — The student can download a PDF report, edit a **student booklet**
   (also `EVENTO_STUDIO` and `EVENTO_PROFESSIONALE` narratives), analyze another
   questionnaire, or launch a **combined analysis** (when QSA/QSAr + ZTPI + Savickas
   are all completed).

### Significant events and the personal journey

EVENTO_STUDIO (Significant study event) revisits one study episode; EVENTO_PROFESSIONALE
(Significant professional event) revisits one work or placement episode, including
a teacher's practice. Both follow six steps (event, facts, what worked, what did not,
a second look, next time) and a final summary. They require no questionnaire or
scores. The summary is a Booklet draft, reviewed and explicitly saved by the person.
These conversation tools are distinct from personal calendar events.

The Personal area starts with My journey, goals, next activities and assignments.
`/profilo/obiettivi` coordinates student-owned goals and links to activities, diary,
cards, comparisons, Notebook, Booklet, saved Tavoli and Portfolio. Completing an
activity never automatically achieves a goal. `/profilo/timeline` holds the shared
personal activity/calendar/diary workspace. `/profilo/assegnazioni` connects teacher
deliveries to planning, private reflection, explicit response sharing and feedback.
Goal adoption and sharing remain explicit; the AI cannot perform them for the person.

### Alternative experience — OpenCode

The student can opt into a workspace-based self-analysis (`/opencode`): an isolated
per-workspace container with a live terminal PTY (browser xterm.js over WebSocket),
working documents (`documento.md`, `appunti.md`, `guida-questionario.md`,
`memoria.md`), and a headless OpenCode API. Supports the six interface languages; logs
under `opencode_chat`. Bash and webfetch are denied in the sandbox.

### pQBL (pure Question-Based Learning)

The student uploads a PDF (≤100 MB); the system chunks it in parallel (4 questions per
chunk, 3 pages per segment), extracts skills, and generates multiple-choice questions
with formative feedback per alternative. Question banks exist per document (hash +
provider + language); `learning` and `final_test` modes are supported; answers are
verified server-side.

### Personal area, Notebook, Booklet and Portfolio

- **Notebook** in the Personal area (`/profilo`): self-description edited by the person, with **revision history** and
  **change-reflection notes** (`/profilo/cambiamenti`) linking two consecutive revisions.
- **Student booklet**: per-instrument editable booklet exportable as PDF, plus
  `EVENTO_STUDIO` and `EVENTO_PROFESSIONALE` narrative types.
- **Portfolio**: works with metadata (title, description, category, date, link) and
  image attachments (≤10 MB, JPG/PNG/WEBP/GIF). Portfolio context is injected into the
  informational assistant and the guided chat to personalize responses.
- **Session history**: past results, resume of interrupted conversations, session
  deletion.

### Pedagogy of the student experience

- **Personalization**: the counselor addresses the student by name, remembers the
  conversation, adapts the linguistic register, and uses portfolio context.
- **Non-directiveness**: the counselor does not impose interpretations; it proposes
  ideas and asks for confirmation ("Do you see yourself in this reading?"). The system
  distinguishes certified strategies (pedagogically grounded) from interpretive
  suggestions.
- **Inverted factors**: the platform automatically handles factors where a high score
  indicates a growth area (e.g. basic anxiety, disorientation). The chart and the
  counselor's language make this explicit.
- **Multilingual**: the guided chat works in it/en/es/fr/de/sv; item-level test
  administrations are experimental in en/es/fr/de/sv and not yet validated. Italian-language questionnaires are
  administered via [competenzestrategiche.it](https://competenzestrategiche.it).
- **Historical profile**: the student can return to `/profilo` to review past results,
  resume interrupted chats, delete sessions, and read/edit the learner model history.

---

## 4. For administrators and teachers: what the platform does

### Administration console

Technical configuration belongs to administrators; research and group features
are available according to role and scope. Teacher catalog access does not grant
technical administration. The console groups configuration, content, research,
monitoring and training:

#### AI configuration and prompts
- **ConfigForm**: live-edit all system prompts, interface texts, active provider and
  model, temperature and max tokens. API keys are read-only here and managed
  centrally in ai4educ Console; environment overrides show an `ENV` badge.
- **PresetsPanel**: create reusable model presets (provider + model + temperature +
  reasoning budget), assignable to counselors and benchmarks. `provider_configured`
  shows whether an external provider has an API key set.
- **CounselorsPanel**: create and manage AI counselors (slug, name, description with
  i18n, avatar, persona text, linked preset, supported questionnaire types, language,
  sort order, is_active).

#### Content and strategies
- **CertifiedStrategiesPanel**: structured catalog of learning strategies (name,
  description, when to recommend, linked factor codes, match mode). Multilingual
  (Italian source + auto-translation to en/es/sv via Ollama). Only strategies with
  `certified` status and `is_active` are injected into the AI context, gated by factor
  salience.
- **AssistantQuestionsPanel**: bank of suggested questions for the teacher
  informational assistant, by topic and language.

#### Research and results
- **QuestionnaireEditor**: instrument catalog editor (instruments, factors, items,
  normative thresholds). Configure items, factor mapping, reverse-scoring rules, and
  normative ranges here.
- **QuestionnaireResultsViewer**: view all questionnaire results (scores, sessions,
  timestamps), filterable.
- **ValidationExportPanel**: export validation datasets (item-per-item CSV for
  R/JASP/SPSS/Mplus).
- **ResearchContactsPanel**: manage research contacts for experimental
  administrations, with code (`RC-XXXXXX`), QR, and PDF card generation.
- **AdministrationPlansPanel**: manage administration plans (code `AP-XXXXXX`,
  instrument, locale, scheduled date/location, linked researchers, status
  `planned/active/completed/archived`); view linked responses.

#### Training dataset and pQBL
- **TrainingDatasetPanel**: review and approve AI-generated training examples (SFT
  data), synthetic QSA example generation, export to JSONL for fine-tuning.
- **PqblAdminPanel**: manage the pQBL module — document upload, MCQ bank generation
  (4 Q/chunk, parallel), per-skill analytics, question edit/delete, server-side answer
  verification.

#### Monitoring and costs
- **LogViewer**: conversation logs with filters (provider, questionnaire type, phase,
  cost, PII presence, feedback join, audience, model, paid-only), PII report, retention
  status, GDPR session deletion, conversation reconstruction.
- **CostStats**: daily/weekly/monthly/yearly cost dashboards by provider and model,
  with monthly budget enforcement (fallback model `qwen3.5:9b`), run-rate projection,
  and USD/EUR rate config.
- **BenchmarkPanel**: in-app benchmarks comparing presets on QSA prompts (quality,
  tokens/sec, cost), with per-step detail.

#### Prompt audit and preview
- **Prompt audit**: token-gated `/admin/prompt-audit/dry-run|live|matrix` endpoints
  (admin OR `PROMPT_AUDIT_API_TOKEN`) to inspect the full prompt envelope per step.
- **Role preview**: administrators can impersonate demo accounts (`studente.demo*`,
  `ricercatore.demo`, `docente.demo`) via `RolePreviewPanel` to see the platform from
  another perspective.

### What teachers and researchers can do

Teachers manage groups and administration plans in `/docente`, publish strategies
and reading/media resources directly, and propose goals for their groups. The
common goal catalog requires administrator review. They assign published content
to current participants or whole groups, including empty groups for later members.
Students receive it at `/profilo/assegnazioni`, plan personal work and explicitly
share a reviewed response; the assigning teacher can give feedback. Withdrawal
removes the response and feedback without deleting personal work. Private drafts
and linked goals are not disclosed through this flow. Existing group access to
Notebook, results and related conversations remains separately applicable.

Researchers additionally use research contacts and the research operations allowed
by their role. The informational Assistant answers the selected knowledge base.
AI providers, prompts, counselors, technical monitoring and instrument validation
remain administrative capabilities, not permissions granted by catalog editing.

### Pedagogy for teachers

- **Supplementary teaching tool**: CounselorBot does not replace the teacher or human
  counselor, but offers a guided self-reflection experience that teachers can insert
  into a broader curriculum (e.g. before or after a module on study strategies).
- **Research data**: the platform cleanly separates individual counseling flows from
  research data collection, in logging and in the administration contact/plan
  architecture.
- **Editorial quality**: strategies injected into the AI context go through a certified
  catalog, ensuring that advice is pedagogically grounded and not improvised by the
  model.

---

## 5. Security and privacy

- **Authentication**: handled at the proxy level by ai4auth (forward-auth). No
  client-side tokens. The proxy injects signed headers (`Remote-Email`, `Remote-User`,
  `Remote-Name`, `Remote-Groups`) verified by the backend with a shared secret, with
  optional direct cookie verification against `AI4AUTH_VERIFY_URL`.
- **Authorization**: admin access based on membership in configured groups
  (`ADMIN_GROUPS`). Researchers (groups containing "ricerc"/"research") get console
  access. A role-preview feature lets administrators impersonate sandbox demo accounts.
- **Logs and retention**: conversation logs support PII redaction; configurable retention
  (default: `retention_days` days) with manual run; PII report endpoint. Disk-based
  session memory expires automatically. GDPR-compliant session deletion.
- **OpenCode sandbox**: bash and webfetch are denied in the per-workspace container; the
  PTY is accessible only over an authenticated WebSocket keyed by workspace.
- **Data on PostgreSQL**: no SQLite in production; tests run against a dedicated
  `counselorbot_test` database to ensure dialect fidelity.