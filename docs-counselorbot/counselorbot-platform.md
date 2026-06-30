# CounselorBot — the platform

CounselorBot is an AI-powered web application that helps students analyze their
learning and career profiles through a **guided chat** based on the questionnaires it
hosts, plus an **informational assistant** for teachers and students. Item-level
questionnaire administration on CounselorBot is currently in **test mode** and available
only in **Swedish, English, and Spanish**. The guided chat and the platform interface
work in Italian, English, Spanish, French, German, and Swedish when a profile is entered
manually or uploaded. For Italian-speaking students, the official, validated
questionnaires are administered through
[competenzestrategiche.it](https://competenzestrategiche.it).

## What it is (and what it is not)

- CounselorBot is the **software platform**: it administers questionnaires, runs the chat
  with AI counselors, builds the student profile, hosts a student portfolio and booklet,
  and provides an administration and research console.
- It is **separate from the competenzestrategiche.it project**: the latter is the research
  and content project on strategic competences (theory, QSA/QSAr and related constructs).
  CounselorBot is the tool that delivers the questionnaires and the assisted counseling
  experience.
- The **Savickas** narrative career interview is a resource of this platform, not of the
  competenzestrategiche.it project.

## Hosted questionnaires

CounselorBot integrates seven instruments, each with its own guided chat. Item-level test
administrations are available in Swedish, English, and Spanish; the guided chat works in
all six interface languages once a profile is entered.

- **QSA** — Learning Strategies Questionnaire (Pellerey, 100 items, 14 factors).
- **QSAr** — reduced version of QSA (8 factors).
- **ZTPI** — Zimbardo Time Perspective Inventory (5 temporal perspectives + balanced time
  perspective reading).
- **QPCS** — perceived strategic competences (5 factors).
- **QPCC** — perceived competences and beliefs (5 factors).
- **QAP** — career adaptability resources (4 factors).
- **Savickas** — narrative career construction interview (agent-only; no scores, direct
  entry into the chat).

## How it works (student journey)

1. The student chooses a questionnaire and, where applicable, an **AI counselor**
   (persona/style/language).
2. The student completes the questionnaire (test-mode item administration, en/es/sv) or
   enters/obtains a profile: manual stanine input, or PDF/photo upload with automatic OCR
   score extraction. Savickas skips scores and goes straight into the chat.
3. The **guided chat** starts: the counselor walks the student through the results step by
   step, encouraging reflection. Score-based paths use a next-step button with free-text
   questions; interview paths (Savickas) ask open narrative questions. The chat streams
   (SSE) with progressive Markdown rendering.
4. The system builds a **student profile** (open learner model) that updates during and
   across sessions, with revision history and change reflections.
5. On completion the student can download a **PDF report**, keep a personal **student
   booklet**, run a **combined analysis** (when QSA/QSAr + ZTPI + Savickas are done), or
   take another instrument.

## Alternative experience — OpenCode

An optional workspace-based mode (`/opencode`) offers an alternative self-analysis path:
an isolated per-workspace container with a live terminal PTY, working documents
(`documento.md`, `appunti.md`, `guida-questionario.md`, `memoria.md`), and a headless
OpenCode API. It supports the six interface languages and logs `opencode_chat`.

## pQBL (pure Question-Based Learning)

The student can upload a PDF and the system extracts skills and generates multiple-choice
questions with formative feedback per alternative (Jemstedt & Bälter method). Questions
are verified server-side, analytics are available per skill, and administrators curate
the bank.

## AI counselors

Counselors are configurable profiles (persona + AI model preset) that give tone and style
to the conversation. Each counselor carries a language, localized description, avatar,
and the list of questionnaire types it supports. An administrator can create, activate,
and associate them with a model preset from the administration panel; personas are
authored in English with a `{{counselor_name}}` placeholder resolved at runtime.

## Student profile, booklet, and portfolio

- **Open learner model** (`/profilo`): a profile that summarizes results and reflections,
  with append-only revision history and change-reflection notes (`/profilo/cambiamenti`).
- **Student booklet**: per-instrument booklet the student can edit and export as PDF,
  including narrative `EVENTO_STUDIO` and `EVENTO_PROFESSIONALE` booklets.
- **Portfolio** (`/profilo`, portfolio tab): works with title, description, category,
  date, link, and image attachments. Portfolio context is injected into the informational
  assistant and the guided chat to personalize responses.
- **Session history**: past results, resume of interrupted conversations, session
  deletion.

## Informational assistant (two knowledge bases)

`/assistente` is a RAG-based chatbot that answers based on **two separately selectable
knowledge bases**:

- **Strategic Competences** — materials from the competenzestrategiche.it project
  (theory, instruments, validation, guides), with hybrid vector + knowledge-graph
  retrieval.
- **CounselorBot** — documents about how the platform works (these materials), with plain
  vector retrieval.

The assistant answers **only** from the selected base, with separate teacher and student
audience modes, and never mixes platform features with project content. Students can
thumbs-up responses; helpful answers are shared anonymously across students.

## Memory subsystems

- **Session memory**: per-session rolling Markdown memory on disk (thread-safe, expires
  after 2 hours), tracking state, facts, preferences, goals, external notes, and the last
  16 episodes.
- **Strategy memory**: editorially-approved learning strategies
  (`knowledge/approved_strategies.md`) retrieved by relevance and injected into the AI
  context.
- **Certified strategy memory**: an active certified strategy catalog (DB-driven, gated by
  factor salience, multilingual) injected with an explicit certified-advice directive.
- **Shared response memory**: AI responses students found useful (thumbs up), made
  available anonymously to others.

## Roles

- **Student** — completes the questionnaires, uses the guided chat, keeps a booklet and a
  portfolio, uses the informational assistant.
- **Teacher** — uses the platform in educational contexts, the informational assistant,
  and the teacher-facing tools (role preview, pQBL, certifications).
- **Researcher / Administrator** — accesses the console (AI configuration, counselors,
  questionnaires, results, research contacts, administration plans, costs and monitoring,
  training dataset, benchmarks).

Authentication is handled via ai4auth (proxy-level forward-auth with signed headers);
administrator status depends on membership in configured groups, and researchers (groups
containing "ricerc"/"research") get console access. A role-preview feature lets
administrators impersonate demo accounts.

## Administration and research console

Collapsible sections grouped for configuration, research, monitoring, and training:

- **AI configuration** — prompts, interface texts, active provider and model,
  temperature, max tokens, API keys, model presets, AI counselors (hot-editable,
  DB-driven; environment variables override with a visible `ENV` badge).
- **Content** — certified strategies catalog (with multilingual auto-translation) and a
  bank of suggested assistant questions by topic and language.
- **Questionnaires** — instrument catalog editor (instruments, factors, items, reverse
  scoring, norm thresholds), results viewer, validation export (CSV for
  R/JASP/SPSS/Mplus).
- **Research** — research contacts (`RC-XXXXXX`), administration plans (`AP-XXXXXX`,
  linking researchers, scheduled sessions, responses), satisfaction surveys, strategy
  feedback.
- **Training dataset** — review and approve AI-generated training examples, synthetic QSA
  example generation, JSONL export for fine-tuning.
- **pQBL** — document upload, MCQ bank generation, per-skill analytics.
- **Monitoring and costs** — conversation logs (with filters, PII report, retention),
  per-model cost dashboards (daily/weekly/monthly/yearly, budget enforcement, run-rate),
  in-app benchmarks comparing presets on QSA prompts (quality, tokens/sec, cost).
- **Prompt audit** — token-gated dry-run/live/matrix endpoints to inspect the full prompt
  envelope per step.

## Security and privacy

- **Authentication**: proxy-level ai4auth forward-auth; no client-side tokens. Signed
  headers are verified by the backend with a shared secret (with optional direct cookie
  verification against `AI4AUTH_VERIFY_URL`).
- **Authorization**: admin access based on configured `ADMIN_GROUPS`; researchers get
  console access.
- **Logs and retention**: conversation logs support PII redaction and configurable
  retention; session memory expires automatically; GDPR-compliant session deletion.
- **Data on PostgreSQL**: production uses PostgreSQL 15 (no SQLite); tests run against a
  dedicated `counselorbot_test` database.

## Languages

The platform interface and the guided chat support Italian, English, Spanish, French,
German, and Swedish. Item-level questionnaire administration (test mode) is limited to
English, Spanish, and Swedish. Italian-language questionnaires are administered via
[competenzestrategiche.it](https://competenzestrategiche.it).