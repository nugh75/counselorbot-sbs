# CounselorBot for teachers and researchers

This guide describes how teachers, researchers, and administrators use the
CounselorBot platform. It covers the **platform's operation**, not the theory of
strategic competences (for that, consult the "Strategic Competences" knowledge base).

## Teacher catalogs

The teacher area (`/docente`) includes **Catalogs**, with separate expandable
sections for **Goals**, **Strategies** and **Books, films and other resources**. Teachers,
researchers, and administrators curate the same shared strategy and reading/media catalogs: they can add,
edit, publish, deactivate, or delete entries. Teachers publish directly, without
administrator approval. This editorial permission does not grant access to
technical settings or modification/validation of psychometric questionnaires.

Choose **Draft** to keep unfinished work, or **Published** and save to make it
eligible for student recommendations. Publication preserves the existing checks
for educational relevance, sources, and sensitive content; actual recommendations
still depend on the student's context. Publishing a previously saved draft also
publishes its complete source-language version and records the publisher. Other
existing language versions retain their individual review status, which teachers
can manage from the same editor. Closing a catalog section keeps an unsaved form
while the page remains open.

## Goal proposals, groups and assignments

Teachers publish goal proposals for their managed groups; common goal proposals
require administrator review. Students explicitly adopt and personalize a proposal
at `/profilo/obiettivi`; later catalog changes do not rewrite adopted goals.
A teacher never adopts, concludes or shares a personal goal on a student's behalf.

Groups/classes are independent of questionnaire administrations. `/docente` is the
management area; `/profilo/classi` lists the user's memberships as a participant,
including for someone who is also a teacher. Management and participation differ.

Published goal proposals, strategies, readings, films and other resources can be
assigned to one current participant or an entire managed group, including an empty
group. Later members see active group assignments. A delivery preserves the chosen
content and teacher instructions. Mark it as a proposal to explore or an activity
with an expected response; optionally set a deadline. A deadline neither completes
personal work nor prevents a later response. Teachers can revoke their own deliveries.

## From an assignment to a shared response

The student opens `/profilo/assegnazioni` and **Work on this assignment**, which
expands an editor in the assignment itself. They plan an activity and diary entry,
with or without a date, optionally link a personal goal, and reflect. This uses
the same data as Calendar and diary; opening the editor does not navigate there.
They prepare a separate response, review its preview and explicitly share it with
the assigning teacher. A Portfolio attachment includes only title and description,
not images or private links. The assigning teacher opens shared responses and adds
feedback. This flow does not expose private drafts, planning dates, linked goals
or unshared diary reflections. Editing personal work does not update a shared copy.

Withdrawing a response removes it and its feedback from the flow while keeping
activities, diary and Portfolio work. Revoking a delivery likewise does not delete
personal work. Voluntary sharing of a goal summary with group teachers is separate.
Existing group permissions still let group managers consult the Notebook,
questionnaire results and related conversations; do not promise blanket privacy.

## Significant-event tools for study and professional practice

**EVENTO_STUDIO — Evento significativo di studio / Significant study event**
revisits one study episode, such as a lesson, exam or group project.
**EVENTO_PROFESSIONALE — Evento significativo professionale / Significant
professional event** revisits one work or placement episode: a task, meeting,
interaction with a colleague, or a lesson taught. The latter also supports adults,
trainees and teachers reflecting on their practice. An episode may be positive or
difficult; significance comes from the person's choice, not its dramatic nature.

Both are conversation tools within CounselorBot, without questionnaires, scores
or diagnoses. Six steps cover the episode, facts, what worked, what did not, a
second look and what to try next time, followed by a final summary. The person
reviews, edits and explicitly saves the resulting Booklet draft. This is distinct
from adding an event to the personal calendar or sharing a teacher-assignment response.

## Administration console

Administrators configure technical features in the administration console.
Researchers use the research and administration-plan features allowed by their role.
Teacher catalog permissions do not grant technical configuration. Features include:

- **AI configuration** — prompts, interface texts, active provider and model,
  temperature and max tokens; API keys are managed centrally in ai4educ Console.
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
logging level. Experimental item-level administrations run in **English, Spanish, French, German and Swedish**;
these versions are not yet validated, and
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

The assistant (`/assistente`) answers based on the selected knowledge base. In particular:

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