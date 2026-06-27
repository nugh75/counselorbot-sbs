# CounselorBot — technical and pedagogical description

This document describes **what CounselorBot does** from a technical and pedagogical
perspective, and is intended for two audiences: students using the platform and
administrators/teachers/researchers who configure, monitor, and integrate it into
teaching or research.

> **Test mode notice**: Questionnaires on CounselorBot are currently in **test mode**
> and available only in **Swedish, English, and Spanish**. For Italian-language
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
- **Open learner model** — CounselorBot maintains a student profile model (explicit,
  revisable, historical) that evolves across chat sessions and is used to personalize
  the AI counselor's responses.
- **Conversational scaffolding** — The guided chat is structured in steps (guided
  steps), each with a prompt and a system mode, to support students without
  overwhelming them, offering a gradual reflection path.
- **Critical thinking, not judgment** — The platform does not return evaluations but
  mirrors for reflection. There are no right or wrong answers; the focus is on
  awareness and self-determination.

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
variables override the database (the UI shows an `ENV` badge).

### Memory

- **Session memory** (`memory_service.py`): per-session rolling conversational Markdown
  memory on disk, thread-safe. Expires after 2 hours. Tracks state, facts, preferences,
  goals, and the last 16 episodes.
- **Strategy memory** (`strategy_memory.py` + `certified_strategy_service.py`):
  knowledge base of editorially-approved learning strategies, retrieved by relevance
  (keyword overlap or semantic similarity) and injected into the system context.
- **Shared memory** (`SharedResponseMemory`): AI responses found useful by students
  (thumbs up), made available anonymously to other students.

### Startup and migrations

At startup the backend performs idempotent seeding and migrations: creates missing
columns (raw SQL `ALTER TABLE ADD COLUMN IF NOT EXISTS`), inserts default texts if not
present, populates guided steps and the instrument catalog, and syncs environment
variables into the database.

### AI providers and error handling

`AIService` dispatches across all providers through a unified registry. Each provider
exposes `call` and `stream`. Streaming is incremental for OpenAI, Anthropic, Ollama,
llama.cpp, and compatibles; single-chunk for Gemini, Mistral, and OpenRouter.
Configuration/provider failures raise `AIError`: the SSE path emits an `{error}` event,
the non-streaming path returns HTTP 502. The frontend throws on error events.

---

## 3. For students: what the platform does

### The user journey

1. **Questionnaire selection** — The student picks from QSA, QSAr, ZTPI, Savickas,
   QPCS, QPCC, QAP. Each instrument explores a different aspect of the learning and
   career profile.
2. **Counselor selection** — The student selects an AI counselor (persona, style,
   language). Each counselor has a distinct tone and AI model, configurable by
   administrators.
3. **Profile entry** — For numeric questionnaires: manual input (stanine scores 1-9)
   or PDF/photo upload with automatic OCR score extraction. For Savickas (agent-only):
   direct entry into the chat.
4. **Visual dashboard** — Radar/bar chart with colored bands (green = strength, yellow
   = moderate area, red = growth area), corrected for inverted factors.
5. **Guided chat** — The counselor walks the student through step by step: explains
   each factor, answers free-text questions, proposes macro-analysis and improvement
   strategies. The chat streams (SSE) with progressive Markdown rendering. The system
   auto-expands factor codes (e.g. `C1` → `C1 (Elaborative strategies)`) and
   simplifies ZTPI technical labels.
6. **Completion** — The student can download a PDF report, analyze another
   questionnaire, or launch a combined analysis (if they have completed QSA/QSAr +
   ZTPI + Savickas).

### Pedagogy of the student experience

- **Personalization**: the counselor addresses the student by name, remembers the
  conversation, adapts the linguistic register.
- **Non-directiveness**: the counselor does not impose interpretations; it proposes
  ideas and asks for confirmation ("Do you see yourself in this reading?").
- **Inverted factors**: the platform automatically handles factors where a high score
  indicates a growth area (e.g. basic anxiety, disorientation). The chart and the
  counselor's language make this explicit.
- **Multilingual (test mode)**: questionnaires are available in Swedish, English, and
  Spanish. The platform interface supports additional languages. Italian-language
  questionnaires are administered via
  [competenzestrategiche.it](https://competenzestrategiche.it).
- **Historical profile**: the student can return to their profile (`/profilo`) to
  review past results, resume interrupted chats, and delete sessions.

---

## 4. For administrators and teachers: what the platform does

### Administration console

Accessible only to users in `admins` groups or with "ricerc" (researcher) in the group
name. The console has collapsible sections:

#### AI configuration and prompts
- **ConfigForm**: live-edit all system prompts, interface texts, active provider and
  model, temperature, max tokens, API keys. Each value is a DB row; environment
  variables override (with a visible `ENV` badge).
- **PresetsPanel**: create reusable model presets (provider + model + temperature +
  reasoning budget), assignable to counselors and benchmarks.
- **CounselorsPanel**: create and manage AI counselors (slug, name, description,
  avatar, persona text, linked preset, supported questionnaire types, language).

#### Content and strategies
- **CertifiedStrategiesPanel**: structured catalog of learning strategies (name,
  description, when to recommend, linked factor codes, match mode). Multilingual. Only
  strategies with `certified` status and active are injected into the AI context.
- **AssistantQuestionsPanel**: bank of suggested questions for the teacher
  informational assistant, by topic and language.

#### Research and results
- **QuestionnaireEditor**: instrument catalog editor (instruments, factors, items,
  normative thresholds). Configure items, factor mapping, reverse-scoring rules, and
  normative ranges here.
- **QuestionnaireResultsViewer**: view all questionnaire results (scores, sessions,
  timestamps), filterable.
- **ValidationExportPanel**: export validation datasets for psychometric analysis.
- **ResearchContactsPanel**: manage research contacts for experimental
  administrations, with code, QR, and PDF card generation.

#### Monitoring and costs
- **LogViewer**: conversation logs with filters (provider, questionnaire type, phase,
  cost, PII presence, feedback join).
- **CostStats**: daily/weekly/monthly cost dashboards by provider and model.
- **BenchmarkPanel**: in-app benchmarks comparing presets on QSA prompts (quality,
  tokens/sec, cost).

#### Training dataset and pQBL
- **TrainingDatasetPanel**: review and approve AI-generated training examples (SFT
  data), export to JSONL for fine-tuning.
- **PqblAdminPanel**: manage the pQBL module (pure Question-Based Learning) — document
  upload, MCQ bank generation.

### What teachers/researchers can do

- **Administer questionnaires** in educational or research contexts, generating codes
  and access links for students.
- **Use the informational assistant** (`/assistente`): a RAG-based chatbot that
  answers based on the competenzestrategiche.it project content and the platform
  itself, with two separately selectable knowledge bases.
- **Export data** for statistical and psychometric analysis.
- **Configure the tone and content** of the student experience without touching code,
  by editing prompts, counselors, and certified strategies from the admin panel.
- **Monitor usage and costs** through logs and dashboards.

### Pedagogy for teachers

- **Supplementary teaching tool**: CounselorBot does not replace the teacher or human
  counselor, but offers a guided self-reflection experience that teachers can insert
  into a broader curriculum (e.g. before or after a module on study strategies).
- **Research data**: the platform cleanly separates individual counseling flows from
  research data collection, in logging and in the administration contact architecture.
- **Editorial quality**: strategies injected into the AI context go through a
  certified catalog, ensuring that advice is pedagogically grounded and not improvised
  by the model.

---

## 5. Security and privacy

- **Authentication**: handled at the proxy level by ai4auth (forward-auth). No
  client-side tokens. The proxy injects signed headers (`Remote-Email`, `Remote-User`,
  `Remote-Name`, `Remote-Groups`) verified by the backend with a shared secret.
- **Authorization**: admin access based on membership in configured groups
  (`ADMIN_GROUPS`). Researchers (groups containing "ricerc") get admin access.
- **Logs and retention**: conversation logs support PII redaction; configurable
  retention (default: `retention_days` days). Disk-based session memory expires
  automatically.
- **Data on PostgreSQL**: no SQLite in production; tests run against a dedicated
  `counselorbot_test` database to ensure dialect fidelity.
