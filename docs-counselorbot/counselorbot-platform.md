# CounselorBot — platform, tools and personal journey

Current interface reference: [CounselorBot functions](funzionalita-counselorbot.md),
maintained alongside product changes and read live by the CounselorBot Assistant
and Compass. The introduction offers Compass, Questionnaire analysis, Guided paths,
and Personal area and tools. The full activity catalog starts with Compass and
ends with Resume activities. PDF study and Flashcards are in the Personal area;
there is no separate Training category.


CounselorBot is an AI-assisted environment for reflecting on learning, work and
choices. It supports students, adults, trainees and teachers reflecting on their
practice. It complements educational support; it does not diagnose or decide for
the person. The interface and conversations support Italian, English, Spanish,
French, German and Swedish.

CounselorBot is the software platform. **competenzestrategiche.it** is the distinct
research/content project on strategic competences. For questions about using this
platform, select the CounselorBot knowledge base in the Assistant.

## Six questionnaires and four conversation tools

The six scored questionnaires are **QSA, QSAr, ZTPI, QPCS, QPCC and QAP**. They
return factor profiles that a separate guided conversation helps interpret.
Italian questionnaires are completed on competenzestrategiche.it, then results
are entered or uploaded in CounselorBot. Experimental item-level versions in
English, Spanish, French, German and Swedish are not yet validated.

Four tools start directly with a conversation, without questionnaire items or scores:

- **SAVICKAS**: narrative career-construction interview.
- **IDEA**: develop an idea, decision or project through dialogue and a cumulative map.
- **EVENTO_STUDIO — Evento significativo di studio / Significant study event**:
  revisit a particular lesson, exam, group project or other study episode.
- **EVENTO_PROFESSIONALE — Evento significativo professionale / Significant
  professional event**: revisit a work task, meeting, placement or lesson taught.

Both significant-event tools explore one episode chosen by the person, whether
positive or difficult. Six steps cover the event, facts, what worked, what did
not, a second look, and what to try next time. A final summary becomes a **Booklet
draft**: the person reviews, edits and explicitly saves it. There is no automatic
score, diagnosis or saving. These conversations are distinct from calendar events.

**pQBL** (`/profilo/pqbl`) is another activity: practice questions and formative feedback
generated from a study PDF. It is not a scored self-report questionnaire.

## Entry points and the guided chat

At first access the person chooses a counselor and completes the Notebook. The
**Compass** (`/bussola`) helps choose a route. When asked where to start it proposes
QSA first, or QSAr when a shorter version is explicitly requested; a specific
chosen tool remains respected. The Compass explains tools rather than conducting
their interviews or collecting scores. Tools open in their own screens.

The **Assistant** (`/assistente`) explains the materials of its selected knowledge
base. The illustrated **Guide** (`/guide`) is public and explains the interface,
significant-event tools, goals, personal work and teacher assignments.

In guided chat, the step bar goes back, repeats or advances. The three-dot menu
beside the composer contains tools, response format, independent response length and Freeze session. Message
controls offer listening and diagrams. Sessions with conversation progress save
after replies; the home page and navigation provide Resume. Freeze saves and closes.
An optional OpenCode workspace provides an alternative conversation experience.

## Personal area: terminology and organization

**Personal area** (`/profilo`) starts with **My journey**: active goals, next
activities, received assignments and teacher feedback. Resources are grouped by
purpose: understanding, exploring/acting, documenting and support.

- **Profile** means a questionnaire's factor scores, not the person's whole identity.
- **Notebook / Taccuino** is the person's editable self-description: context,
  difficulties, strengths and goals, with revision history and change reflections.
  It supplies context to the AI; it is not automatically written by the counselor.
- **Booklet / Libretto** contains per-instrument reflections, including narrative
  significant-event reflections, with PDF export.
- **Portfolio** documents works with title, description, category, date, links and
  images. Its context may help personalize conversations.
- **Tavolo** is a workspace for materials and ideas; saved Tavoli can be linked to goals.
- **Cards** collect thoughts and **Comparison** helps examine alternatives using
  criteria chosen by the person.

## Goals, activities, calendar and diary

At `/profilo/obiettivi`, write a goal or explicitly adopt and personalize a catalog
proposal. Record motivation, criteria for progress, priority, review date and
reflection. Link existing activities, calendar events, cards, comparisons, Notebook,
Booklet, saved Tavoli and Portfolio works. Adoption preserves the chosen catalog
version; later catalog edits do not rewrite an adopted goal.

At `/profilo/timeline`, plan activities and dated events or periods, then record
what happened in the diary. Goal and assignment activities use this same personal
workspace. Plan and reflection remain separate; passing a date does not complete
an activity. A completed activity does not automatically achieve a goal. The person
reviews progress and explicitly decides when to pause, conclude or archive it.
Links do not automatically copy, synchronize or share personal material.

## Teacher catalogs, assignments and feedback

The **Teacher area** (`/docente`) manages groups/classes, administration plans and
catalogs of goals, strategies and reading/media resources. Teachers publish
strategies and resources directly. They publish goal proposals for managed groups;
the common goal catalog requires administrator review. These permissions do not
grant technical administration or questionnaire validation.

Teachers assign published content to a participant or entire managed group, even
an empty group: later members receive still-active group assignments. Delivery
preserves a snapshot and instructions. It can be a proposal to explore or an
activity with an expected response and optional deadline.

**Received assignments** (`/profilo/assegnazioni`) lets the person open **Work on
this assignment** within the assignment itself, without navigating automatically
to the calendar. There they plan an activity and diary entry (a date is optional),
link a personal goal if wanted, reflect, then prepare a separate response. Calendar
and diary show the same underlying personal work. The person previews and explicitly shares that response with the
assigning teacher, who can give feedback. Optional Portfolio inclusion is title
and description only. Personal edits do not update the shared copy. Withdrawal
removes the shared response and its feedback, preserving personal work. Receiving
an assignment does not adopt, complete or share a personal goal.

## Groups, permissions and sharing

`/profilo/classi` lists personal group memberships; `/docente` manages groups.
Groups exist independently of questionnaire administrations. Current group
managers can access the Notebook, questionnaire results and related conversations,
as disclosed when joining. This is separate from voluntary goal-summary sharing
with the group's teachers and explicit assignment-response sharing with the
assigning teacher. Response drafts and linked goals are not disclosed through
that flow. Do not describe all Personal area content as private from teachers.

Students own their goals and personal work. Teachers and researchers have scoped
group and pedagogical capabilities; research contacts support research operations.
Administrators configure AI providers, prompts, counselors, instruments, RAG and
technical settings. An AI counselor is a selectable persona, not a human login role.

## Reports and configuration

Session reports and Booklets can be exported to PDF. Combined analysis requires
QSA or QSAr plus ZTPI plus SAVICKAS results. Administrators manage prompt versions,
guided steps, AI model presets, catalogs, monitoring, benchmarks and training data.
Authentication uses ai4auth; server-side permissions govern access. The AI explains
and suggests: it does not adopt goals, edit notes, share or submit work for the person.

## Current personal tools and saving

PDF study is at `/profilo/pqbl`, beside Flashcards (`/profilo/flashcard`).
Flashcards support editable decks and study sessions with answer reveal and self-assessment.
Cards (`/profilo/carte`) organize thoughts in multiple decks with templates, columns
and drag-and-drop; they are distinct from study Flashcards. Comparison, the action
board and Tavolo (when enabled) support exploring alternatives and organizing work.
Notebook autosave protects a recoverable draft silently in the background; only
manual saving creates a meaningful history revision. Errors remain visible.
Input and conversation-mode preferences are saved only through their explicit
checkboxes; Idea asks for its mode each time. Response format (conversation, bullets,
table) is independent of response length. QSA offers its own essential path of
three replies and a summary; do not extend this to other scored questionnaires.
