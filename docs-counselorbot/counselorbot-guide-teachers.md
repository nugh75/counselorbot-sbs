# CounselorBot for teachers and researchers

This guide describes how teachers, researchers, and administrators use the
CounselorBot platform. It covers the **platform's operation**, not the theory of
strategic competences (for that, consult the "Strategic Competences" knowledge base).

## Administration console

Users with administrator or researcher roles (groups containing "ricerc"/"research" or
members of configured `ADMIN_GROUPS`) can access a console with collapsible sections:

- **AI configuration** — prompts, interface texts, active provider and model,
  temperature, max tokens, API keys; environment variables override with an `ENV` badge.
- **Model presets** — reusable provider/model combinations with reasoning budget,
  assignable to counselors and benchmarks.
- **Counselors** — creation and management of AI counselors (persona, preset, supported
  questionnaire types, language, localized description, avatar, sort order, active flag).
- **Certified strategies** — editorial catalog of learning strategies, multilingual
  (Italian source + auto-translation to en/es/sv), gated by factor salience and
  `match_mode`, injected into the AI context with a certified-advice directive.
- **Assistant questions** — suggested questions for the informational assistant, by
  topic and language.
- **Surveys and strategy feedback** — satisfaction surveys and aggregated feedback
  (thumbs up/down) on AI responses, with shared-response memory reused anonymously.
- **Questionnaires** — instrument catalog editor (instruments, factors, items,
  reverse scoring, norm thresholds); questionnaires results viewer; validation export
  (item-per-item CSV for R/JASP/SPSS/Mplus).
- **Research contacts** — manage contacts for experimental administrations (`RC-XXXXXX`)
  with QR and PDF card generation.
- **Administration plans** — operational plans for a test administration
  (`AP-XXXXXX`, instrument, locale, scheduled date/location, linked researchers,
  status `planned/active/completed/archived`) with linked-responses view.
- **Monitoring and costs** — conversation logs with filters (provider, questionnaire
  type, phase, cost, PII, feedback, audience, model, paid-only), PII report, retention
  status, GDPR session deletion; cost dashboards (day/week/month/year, budget
  enforcement with fallback `qwen3.5:9b`, run-rate, USD/EUR rate).
- **Benchmark** — in-app comparison of presets on QSA guided steps, with per-step
  detail (quality, tokens/sec, cost).
- **Training dataset** — review and approve AI-generated training examples, synthetic
  QSA example generation, JSONL export for fine-tuning.
- **pQBL** — document upload, MCQ bank generation, per-skill analytics, question
  edit/delete, server-side answer verification.
- **Prompt audit** — token-gated endpoints (`/admin/prompt-audit/dry-run|live|matrix`)
  to inspect the full prompt envelope per step; admin OR `PROMPT_AUDIT_API_TOKEN`.
- **Role preview** — impersonate sandbox demo accounts (`studente.demo*`,
  `ricercatore.demo`, `docente.demo`) to view the platform from another perspective.

## Questionnaire administration

A researcher can generate codes and links (with QR and PDF card) to hand out to
students for administration, and organize administrations via **administration plans**
that link researchers, instrument, locale, and scheduled session. The separation between
data collection for research and individual counseling use is maintained at the flow and
logging level. Item-level test administrations run in **Swedish, English, and Spanish**;
the guided chat works in all six interface languages once a profile is entered. For
Italian-language administration, refer students to
[competenzestrategiche.it](https://competenzestrategiche.it).

## AI counselors

A counselor is defined by a **persona** (English text with a `{{counselor_name}}`
placeholder resolved at runtime) and a **preset** that sets provider and model. Each
counselor carries a language, localized description, avatar, and the list of
questionnaire types it supports. Active counselors can be offered to the student before
the guided chat.

## The informational assistant

The assistant (`/assistente`) answers based on two separately selectable knowledge bases:

- **Strategic Competences** — materials from the competenzestrategiche.it project
  (theory, instruments, validation, guides), with hybrid vector + knowledge-graph
  retrieval (Ollama embeddings, graphify corpus).
- **CounselorBot** — documents about how the platform works (these materials), with
  plain vector retrieval.

For each knowledge base, the assistant answers **only** based on the materials of the
selected base, with separate teacher and student audience modes, avoiding confusion
between project content and platform features. Retrieval is configurable (top-k,
category weights, audience weights, max per source, min similarity score); students can
thumbs-up responses, and helpful answers are shared anonymously.

## Memory subsystems

- **Session memory** — per-session rolling Markdown memory on disk (thread-safe,
  expires after 2 hours), tracking state, facts, preferences, goals, external notes,
  and the last 16 episodes.
- **Certified strategy memory** — active certified strategies, gated by factor
  salience, injected with an explicit certified-advice directive.
- **Shared response memory** — AI responses students found useful (thumbs up), reused
  anonymously.
- **Strategy memory** — editorially-approved learning strategies from
  `knowledge/approved_strategies.md`.

## Privacy and data

Session data and profiles are managed by the platform; interaction logging supports
monitoring and research with PII redaction, configurable retention, and GDPR-compliant
session deletion. Production data lives on PostgreSQL 15; tests run against a dedicated
`counselorbot_test` database. The OpenCode workspace sandbox denies bash and webfetch
and exposes the PTY only over an authenticated WebSocket.