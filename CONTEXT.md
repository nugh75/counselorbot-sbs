# CONTEXT — Counselorbot SBS

<!-- ai4educ:context-template v1.0 -->

## Quick Reference
- **Stack**: Python (FastAPI), Next.js App Router, PostgreSQL, Docker Compose
- **Entry point**: `docker compose up -d --build` or `uvicorn backend.main:app --reload --port 8000` + `cd frontend && npm run dev`
- **Sviluppo live (hot reload, senza Docker)**: `docs/operations/live-dev-environment.md` — `scripts/dev-backend.sh` (:8002, DB di test) + `scripts/dev-frontend.sh` (:3107)
- **Test**: `docker exec counselorbot_backend python -m backend.tests.test_smoke`
- **Repo**: (github)
- **Visual identity**: `docs/design.md` — read it before changing layout, colour, typography, or any UI component

## Mandatory platform documentation maintenance

Every product change must update `docs-counselorbot/funzionalita-counselorbot.md`
in the same change. This is live grounding for the CounselorBot Assistant and
Compass, read per request from the documentation mount. Review the six-language
interface guide and relevant screenshots whenever behavior or navigation changes.
After reviewing the content, run `make guidance-refresh`, then `make guidance-check`,
and commit the state manifest too. CI checks both freshness and documentation
presence in the change. This gate detects omissions; it does not write or validate
feature descriptions automatically. Active database prompt changes use the same
review contract and the guarded update plan, never startup overwrites.
See `docs/operations/platform-guidance.md` for runtime, RAG and screenshot details.

## Domain
CounselorBot is an AI-powered web app that helps students analyze learning/career profiles through six scored questionnaires, four conversation tools (SAVICKAS, IDEA and the two significant-event paths), and personal journey resources. UI and content are primarily Italian.

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
| EVENTO_STUDIO | Significant study event: guided interview on one episode (6 steps + summary, milestone draft for the timeline) | — |
| EVENTO_PROFESSIONALE | Significant professional event: same path on a work or placement episode | — |
| IDEA | Free chat that brings one idea into focus, building a cumulative map (no questionnaire, no scores) | — |
| OBIETTIVO_STUDIO | Guided path that turns a vague wish into ONE learning objective: Bloom level (with Mager's visibility test on the verb), SMART check, challenge (Locke & Latham, Dweck), if-then plan (Gollwitzer/Zimmerman), proof and check date; the summary closes with the well-written objective in the complete form (who + observable verb + what + condition + criterion, Mager); essential version in three turns with the same formulation contract (visibility test on the verb, complete form at the summary); summary emits a private ```goal block that pre-fills a personal goal, saved only on explicit confirmation | — |
| OBIETTIVO_DOCENZA | Teacher variant: ONE didactic objective for a class, plan step becomes constructive alignment (Biggs/backward design); the summary closes with the ABCD formulation (audience in the class + observable verb + what + lesson condition + criterion tied to the planned assessment), in the essential variant too; reached from /docente (`/?start=OBIETTIVO_DOCENZA`), not in the student catalog; the teacher picks one or more managed/shared classes (`group_ids`) whose context — with the teacher notebook — replaces the student profile in every turn (re-checked server-side each turn); can publish to the teacher goal catalog or assign to a group on explicit confirmation | — |

### Glossary (student-facing terminology — use consistently)
- **Azione (action)**: what the STUDENT organizes for themselves — a dated or undated entry on the bacheca (`Action` in `visual_tools`). EN *action*, ES *acción*, FR *action*, DE *Aktion*, SV *åtgärd*. Internal identifiers keep the `action` name (route `/profilo/azioni`, type `Action`, `action_id`, `GoalResourceKind 'action'`); the UI must always say azione. The generic action kind (`ActionKind 'activity'`) is labelled *Generica/Generic/…*, never "attività".
- **Attività (assignment activity)**: what the TEACHER proposes — the object of an assignment with an expected response and optional due date (assignment flows only). In languages without a distinct word the assignment texts keep their own wording (e.g. SV *aktivitet* only for assignments; student-side objects are *åtgärd*).
- **Profilo (profile)**: the outcome of a questionnaire from the Competenze Strategiche site — a set of factor scores (`QuestionnaireResult`). "Profilo" refers ONLY to this.
- **Taccuino (notebook)**: the student's self-declared notes about themselves — the open learner model (`LearnerProfileRevision`, `/user/learner-profile` API). Internal identifiers keep the `learner_profile` name; UI must say taccuino/notebook. The form serves adults too: school-bound labels pair study and work wording with a slash (class / occupation, institution / work context), keys unchanged.
- **Libretto (booklet)**: RETIRED (2026-09). Its questions now live in the lettura, the goal (metodo, controlli, bilancio, origine, prove), the taccuino and the linea del tempo; old data are migrated once and `StudentBooklet` is kept only as a read-only source. Do not use the word in new UI or prompts.
- **Lettura (reading, «La mia lettura»)**: what the student reads in ONE questionnaire result — strengths to build on, areas to grow, «what it tells me about myself» (`ResultReading`, one per result). Lives with the result in Compilazioni. EN reading, ES lectura, FR lecture, DE Deutung, SV tolkning.
- **Metodo (method)**: the strategies chosen for a goal — certified ones (✦) and the student's own (✎, `PersonalStrategy`). EN method, ES método, FR méthode, DE Methode, SV metod.
- **Controllo (check)**: a dated action of kind `check` in which the student notes where they are (in linea / a rilento / fermo), what they observe and what they change. It documents progress; it never closes a goal. EN check, ES comprobación, FR contrôle, DE Kontrolle/Überprüfung, SV kontroll.
- **Bilancio (review)**: the closing reflection of a goal (`GoalReview`: commitment, outcome, satisfaction, obstacles, change, learned, next step). It closes the goal and adds a past milestone to the timeline; a reopened goal can have a later one. EN review, ES balance, FR bilan, DE Bilanz, SV utvärdering.
- **Origine (origin)**: where a goal was born — a lettura, the taccuino, a timeline milestone or a chat session (link role `origin`, at most one). EN origin («born from»), ES origen, FR origine, DE Ursprung, SV ursprung.
- **Prova (evidence)**: a Portfolio work or other resource the student links to a goal to show progress (link role `evidence`). EN evidence, ES prueba, FR preuve, DE Beleg, SV bevis.
- **Portfolio**: collection of the student's works (`PortfolioItem`).
- **Idea**: the free-chat instrument that brings a still-shapeless idea into focus (code `IDEA`), including study/career choices, free ideas, research/teaching work, and the exploration of a concept or construct. Same name in every language except FR *Idée*, DE *Idee*, SV *Idé*.
- **Mappa (map)**: the artefact an Idea session produces (`IdeaMapRevision`) — one per session, growing every turn. EN map, ES mapa, FR carte, DE Karte, SV karta. It is none of profilo/taccuino/lettura/portfolio, though a finished map can become a portfolio work.
- **Taccuino del docente (teacher notebook)**: the teacher's self-declared notes about their ROLE — subjects, experience, classroom methodologies, classes and institutes, professional development interests (`TeacherProfileRevision`, `/user/teacher-notebook` API, editable in `/docente`). Append-only like the student notebook; no autosave. It enters ONLY the OBIETTIVO_DOCENZA chat, in place of the student taccuino/portfolio/goals (a teacher's student-side data, if any, never enters this conversation).
- **Contesto classe (class context)**: class-level text written by the teacher on `StudentGroup` (`description`, `methodologies`) with an opt-in `context_visible_to_students` flag. When the flag is on, enrolled students receive a `[CONTESTO CLASSE]` block in the guided chat beside their own taccuino; never per-student notes (`TeacherNote` stays out). IDEA and the Bussola never receive it. The same fields feed the teacher's OBIETTIVO_DOCENZA chat via the class selection bar.
- **Gruppo/Classe (group/class)**: a teacher-managed school class or group of adults, university students or other participants (`StudentGroup`), independent of questionnaires. Participants join via invite code `GR-XXXXXX` (web `/gruppo?g=CODE`, invitation code from personal area, or Telegram deep link) → `GroupMembership`. Shared with co-teachers via `GroupShare`. An `AdministrationPlan` can attach a group (`group_id`) to tag results. Teacher notes/messages (`TeacherNote`) live on the group. `/profilo/classi` lists memberships as a participant, including for teachers; `/docente` is the management area for goals, groups/classes, administration plans and catalogs. Ownership/sharing and membership are distinct.
- Per-language pairs (taccuino / lettura): IT taccuino/lettura, EN notebook/reading, ES cuaderno/lectura, FR carnet/lecture, DE Notizbuch/Deutung, SV anteckningsbok/tolkning. The personal page (`/profilo` route) is labelled "Area personale" (personal area); role-preview identities are "account di prova" (test accounts), not "profili".

### Core Concepts

- **Verified institution teachers (deployed 2026-09-23)**: `InstitutionTeacher` records explicit, revocable administrator grants. `/admin/institutions/{id}/teachers` is restricted to actual administrators, not the generic researcher-inclusive admin dependency. `/teacher/institutions` returns only active grants for identities that currently hold the teacher role. `institution_access.require_institution_teacher` is the server-side guard for the institution category editor. A notebook institution or teacher-editable class field never grants this permission. The API, administrator association/revocation UI and teacher category editor at `/docente/orientamento` are deployed. `InstitutionCategoryCollection` revisions protect concurrent edits; `InstitutionOrientationCategory` keeps stable IDs and archived names. Teachers share create/edit/order/archive/restore actions; categories are not seeded. Teachers also assign active categories to published contacts and unexpired appointments, using the same collection revision and a locked content timestamp check. Separate association tables preserve archived links. `/orientation-directory` adds `institution_groups` for institution-specific student filters while retaining its flat fields for timeline clients; national resources stay outside local filters. See `docs/operations/institution-orientation-categories.md`.

- **Personal-area entry**: `/profilo` has five always-open groups and 17 illustrated links, with two columns on desktop and one on mobile (`PersonalAreaHome`, `personal-area.ts`, six-language `i18n-personal-area.ts`). The independent overview lists at most three existing goals/activities/assignments and retains data with retry on partial failure; it does not load questionnaire results. Activity links use `/profilo/azioni#action-ID` and focus the matching activity after loading. The Orientamento pilot uses `PersonalAreaHeader`: only a left-aligned `/profilo` link (the navigation panel was removed after user review); other subpages retain their headers until their exit guards are reviewed.

- **Chat format and essential QSA**: all web chat surfaces offer conversational, bullet or table presentation independently of response length. Only QSA guided chat offers a three-reply essential path (focus, example, action, summary); QSAr and other instruments keep their existing paths. Format and path survive frozen-session resume. See `docs/operations/chat-format-essential-qsa.md` for API contracts, persistence and verification.

- **Audio input**: guided chat and Bussola share `AudioInput` for browser microphone recording and audio file upload. Authenticated `/audio/transcribe` forwards to the isolated local `transcription` service (CPU faster-whisper, three bundled multilingual models — `small`, `large-v3-turbo` (default) and `large-v3` — no external fallback or retained audio). Admins pick the model in the **Trascrizione audio** tab, stored as config `transcription_model`; an unknown name falls back to the default. Recognition is primed with the project glossary (QSA, ZTPI, QPCS…), which is what stops the acronyms coming back as ordinary words. Two requests run in parallel and the rest queue for up to 90 s before `busy`; threads and workers stay modest because every resident model holds busy-waiting pools that steal CPU from the one transcribing. Automatic language detection runs on `small`, since on a large model detection costs as much as the transcription, and an unsure guess (below 0.7) is left to the transcribing model. The spoken language is chosen in the conversation options, independent of the UI language, and defaults to automatic detection (`cb_audio_language`). Transcripts append to the draft for review by default; a three-dot menu checkbox enables immediate sending, persisted in the browser for both chats. The same menu opens **Voice conversation**: press to record, press again to send, then hear the reply read aloud sentence by sentence as the counselor writes it, while the full text chat stays visible. `VoiceReaderController.enqueue` appends the later pieces to the playing queue; its runs are serialized because each numbers its segments after the ones already known. It uses the reader's counselor voice, engine and pronunciation settings. Only the main talk/stop-and-send button remains in the composer; status, help, pause/replay and return to typing are in the three-dot menu, which opens on errors to expose recovery controls. The microphone never restarts automatically; users can interrupt playback to speak. Exiting suppresses late speech without cancelling an already-sent chat turn. Cancellation discards late transcription responses and releases the microphone; recording and manual reading stop each other's audio. Uploads are limited to 10 MiB and 3 minutes. See `docs/operations/audio-input.md` for usage, API, model provenance and verification.

- **Audio reader**: the header exposes a reader for visible page text to every role, including the public guide; Bussola and guided-chat replies have Listen buttons using the same provider. Voice/engine preferences are stored per language and counselor; pronunciation corrections remain shared per language. Page reading and previews use the displayed counselor. Edge retains counselor voice mappings unless explicitly overridden; Piper matches the configured voice gender using the offline provider metadata in `backend/voice_profiles.json`; Piper is an isolated CPU Docker service with twelve bundled voices, female and male in every supported language and no online fallback. The original TD_daniele dictionary is imported unchanged (80 Italian + 49 English rules) and editable through the reader. The reader floats over the page without narrowing it, moves by mouse, touch or arrow keys and starts as a compact control bar on every screen; minimizing preserves playback and the chat remains editable. It highlights the original passage on the page, with no duplicate transcript. Double-clicking a word restarts from that selection through the rest of the page or the selected assistant message, excluding controls and drafts. DOM snapshots use `plain_text` to avoid a second Markdown parse. The first segment is capped at 180 characters, the following ones at 700; pronunciation corrections still apply to speech without changing the original DOM text. Edge word timings remain in the protocol, while Piper provides segment audio. `/tts/stream` is cancellable SSE proxied by a dedicated Next route; audio stays in the requesting stream and browser Blob URLs. See `docs/operations/voice-reader.md` for usage, API, provenance and checks.

- **Personal goals and teacher catalog**: `/profilo/obiettivi` coordinates student-owned goals with existing personal actions, timeline events, cards, comparison, notebook, readings, saved Tavoli and Portfolio items; each goal can be downloaded as a «Percorso dell'obiettivo» PDF (`/user/goals/{id}/pdf`). `/profilo` leads with the journey and groups tools by purpose. Catalog entries are DB-authored, versioned, scoped to active groups or common (admin-reviewed); adoption snapshots the chosen version and never assigns goals to students automatically. Sharing with a group's teachers is voluntary, revocable and summary-only. Goal writes use revisions and ownership checks; activity creation writes to the existing personal workspace atomically. Guided chat and Compass receive bounded read-only context; Tavolo help/suggestions receive only explicitly linked goals. QSA-first routing remains unchanged. See `docs/operations/personal-goals.md` for API, migration, privacy and browser-test setup.
- **Teacher notebook and class context**: the teacher role has its own notebook (`TeacherProfileRevision`, `/user/teacher-notebook`, gated to plan managers, editable in `/docente`) about subjects, experience, methodologies and classes; it never mixes with the student taccuino. Classes carry `description`, `methodologies` and `context_visible_to_students` on `StudentGroup` (editable in the `/docente` groups panel, inline "Contesto classe" section). In `build_context_envelope` the OBIETTIVO_DOCENZA chat swaps the `[PROFILE]` slot for teacher notebook + the classes selected via `ChatRequest.group_ids` (multi-select bar `DocenzaClassBar` in the guided chat; ids persisted per browser, ownership/share re-checked every turn) and skips the reading; student chats get a `[CONTESTO CLASSE]` block only from classes where the teacher turned sharing on, capped at 600 chars. `teacher_context.py` is the single home for the labels and builders, mirroring `student_context.py`.
- **Teacher assignments**: `/docente` groups goals, strategies and readings in one catalog block. Published entries can be explicitly assigned to a current participant or an entire managed group/class, even while empty. Group-wide assignments remain available to current and future members until revoked; the displayed group recipient count follows current membership. Deliveries keep a server-built snapshot and teacher instructions in `teacher_assignments` / `assignment_recipients`, distinct from personal goals. `/profilo/assegnazioni` lists received content; teachers can revoke their own deliveries. Teachers distinguish proposals from activities with an expected response and optional due date. Students explicitly plan in the existing personal activity/timeline workspace, link their own goals, reflect in the same diary entry and share a reviewed text snapshot, optionally including the title and description of an owned Portfolio item. Only the assigning teacher can read current members' shared responses and write feedback; private drafts and linked goals stay private in this flow. Withdrawal removes the shared response and feedback without deleting personal work. JourneyOverview surfaces assignments and feedback. Additive `assignment_learning_settings` and `assignment_work` tables preserve old assignments as proposals. Retries are idempotent; revisions, group visibility and membership are checked server-side. Existing class access to Notebook/results/conversations remains explicitly disclosed. See `docs/operations/catalog-assignments.md`.
- **Personal calendar and diary**: `/profilo/timeline` presents one chronological personal timeline with native date pickers. A milestone is a single-day event (`date_mode=point`, `start_date`) or a period (`date_mode=period`) with both boundaries or either boundary left open. `planned` preserves intentions separately from the existing `reflection` diary; dates never mark activities completed. Desktop uses a proportional horizontal axis with points, interval bars and Today; mobile uses a chronological vertical sequence with explicit date labels. Legacy text periods remain undated until the student explicitly chooses dates. Save remains explicit, and Portfolio snapshots and PDF/text exports include both fields. Other personal work tabs remain available in a collapsed section. See `docs/progetto/linea-del-tempo.md` for the API contract and usage.
- **Bussola (orientation compass)**: repeatable, student-owned orientation chat at `/bussola`. After account setup, new students can use it or choose the tool catalog directly; existing users with prior activity are not blocked, and frozen/resumed sessions bypass the gate. The new-user introduction places Start after all guidance and contacts. Both the introduction and Bussola explain one tool at a time, multiple dialogue turns and separate visits; 20–40 minutes is a flexible planning window, not a guaranteed duration. Bussola offers one starting tool, asks at most one focused question per turn and reserves the complete catalog for explicit requests. That starting tool is always QSA when the student asks which tool to use or where to start, even if their goal points elsewhere; QSAr replaces it only when the student asks for the shorter or reduced version (`_starting_tool`), and the tool the goal points to may follow as a second card for later. Explaining one named tool and a tool the student has already chosen are left alone. The offline fallback applies the same rule: platform-help questions carry the QSA card, keyword matches give QSA plus at most one later tool. It recommends only IDs from the shared tool catalog, stores its own conversation in `OrientationSession`, and never creates scores or questionnaire results. Bringing a disoriented student into focus is the Compass's own job, not IDEA's: with no readable intent it asks which area matters instead of routing, `_rank_tools` returns no fallback trio, and IDEA is recommended only when the student names a concrete idea, decision or project. The recommendation panel summarises the session, not the last turn: `_merged_recommendations` puts the new proposals on top of the ones already there, deduplicated by tool id and capped at three, so a turn with no recommendation leaves the previous ones in place and the instrument a student just decided to start with does not vanish the moment the next turn names others. The same model call now receives the current cards and chooses `merge` (the default), `hold`, `replace`, or `clear`. Replacement or clearing is reserved for an explicit rejection or invalidation of the previous direction; replacement requires valid catalog proposals with reasons. Unknown actions, empty replacements, and destructive actions without a visible reply preserve the cards. Header facts about the Guide (`/guide`), Assistant and Personal area remain available in every turn. Talking about a tool proposes it: a tool question stays informational but now carries that tool as a recommendation, since the reply ends by offering to start it. When the model answers in prose instead of JSON, the tools are read out of the reply itself (`_tools_named_in`, whole words and case-sensitive, so Italian "idea" never triggers IDEA and QSAr is not QSA) and only then from `_rank_tools` on the student's words, which finds nothing in a typo like "Qss". The Compass screen only orients: the prompt says questionnaires are filled in elsewhere, the guided chat opens on the instrument's screen from the card or from Resume in the header, and forbids offering to open it "here", asking which factor to start from, or stating instrument details such as item counts that the briefs do not give. Saying "I have already filled it in" is not a reason to route elsewhere: having the results is what opens that instrument's guided chat, and the prompt says so, and forbids asking the student to paste scores into the Compass, which receives none. The canned platform overview and per-tool explanations are material, not answers: `_canonical_reference` injects the exact text into the system prompt and the model writes the turn, because a short-circuited reply cannot see the history and reprinted the whole catalog to a student who had just read it. They stay the offline fallback, where `_fallback_without_repetition` swaps the overview for the "I would start with QSA" reply if the history already carries it. It explains a tool from `orientation_tool_briefs`, one English text per catalog id seeded from `tool_brief_seed.py` and editable in the admin panel — the seed only fills gaps and never overwrites an edited row. Each brief answers four fixed headings (what it looks at, what you get, when it is the right moment, what it does not do), and the injected block adds the instrument's factors from the catalog, marking the reverse-scored ones so a high score is not explained as a resource. Only the tools in play get the full text — at most two, picked from the tool question, the local ranker and what the previous turn named — because nine full briefs would double the prompt; the rest keep the one-line catalog entry. The briefs are instructions for the model, not text shown to the student, so they are written in English instead of translated six times. The current interface language governs both the reply and every recommendation reason, independently of the language of the Notebook, history, persona or instructions; the prompt names that language explicitly. Existing saved messages are preserved when the interface language changes. It reads what the student has already done and only advises: `student_context` injects the instruments already completed with their dates, the frozen sessions that can be resumed, the Taccuino and the Portfolio, under one 2000-character cap, with the Notebook first (goal, difficulty and strengths before demographics; each field capped at 160 characters and the Notebook block at 1000), followed by completed instruments, interrupted sessions and Portfolio. A new Bussola generates its opening from the latest owned Notebook and saves its first recommendation; an empty Notebook keeps the static welcome, and reopening an existing session preserves its conversation. If the model fails, the opening refers to the recorded goal or difficulty and asks one focused question. Every turn uses the latest Notebook without asking the student to repeat known information; explicit current wishes take precedence over older notes. Scores never enter it — the Compass produces none and interprets none, so it gets the fact and the date, not the numbers — and neither do the readings, whose per-factor reflections the routing does not use. `LEARNER_PROFILE_LABELS` lives there too, so the notebook's field list has one home and `chat_logic` imports it. It never writes into the Taccuino, the readings, the goals or the Portfolio. The Taccuino frames the conversation; it is initialized once during account setup and edited voluntarily in the Personal area. Starting or completing a Bussola never inserts a notebook form. A completed Bussola remains reopenable; readings are edited from Compilazioni, not from here.
- **Account setup**: `/inizia` asks only for missing counselor/notebook information. `account_preferences` is keyed by authenticated username, with `counselor_id` and `notebook_completed`; `GET/PUT /user/account-preferences` reads/saves it. A nonempty existing notebook and a counselor from the latest Bussola (or, if absent, the latest frozen session) can be migrated once into account preferences. Unbound legacy browser selections are not silently assigned to an account. `AccountSetupGate` restores account defaults before opening pages; failures expose Retry. `/counselor` shows full cards with an explicit confirmation; clicking a card alone does not save. The navigation counselor link opens the same full-card selection in a full-screen dialog, keeping the current workspace mounted; confirmation, Back and Escape return to the current activity with unsent drafts and manual input intact. Direct `/counselor` access remains available (no counselor dropdown); the Taccuino stays in the existing Personal area. Instrument entry validates availability and compatibility, routing to the same counselor page only when needed. Frozen/resumed conversations restore their session counselor without changing account defaults. New Bussolas reuse the default; no opening/closing notebook invitations in Bussola, guided chat, OpenCode, Assistant or pQBL. Voluntary Tools actions remain available. `npm run test:account` runs browser fixtures against `ACCOUNT_BASE_URL` (default localhost:3107); PostgreSQL API coverage is `backend/tests/test_account_preferences.py`.
- **Guided path**: ordered `GuidedStep` rows per `questionnaire_type`. Each step has a `prompt` and `system_prompt_mode`. Steps are database-driven, seeded at startup from `prompt_config.py`.
- **Suggested questions**: `GuidedStepQuestion` rows linked to steps, shown as clickable suggestions in the student chat UI. Defaults in `guided_step_questions_seed.py`. Sentence starters are added once to populated analysis/interview steps by `seed_response_openings`; the version marker preserves later admin edits and deletions. Suggestions fill the composer and never send automatically.
- **Canonical QPCC/QAP paths**: QPCC has agreement, five areas and synthesis (7 steps); QAP has agreement, four resources and synthesis (6 steps). `prompt_config.py` seeds these complete qualitative interview paths only for an empty instrument. Existing custom paths are preserved. Scores may guide the interview internally, but are not displayed or reassigned.
- **Interview paths**: SAVICKAS, QPCC and QAP share one interview behaviour, defined in `frontend/src/lib/interview-path.ts` (agreement and summary step per instrument). Writing the localized acceptance on the agreement step advances without an AI call; on interview and summary steps (`*-interview`, `*-summary`) the person decides when to change topic — a reply with text and `[[AVANZA_STEP]]` only shows the suggestion, the forward button appears after it or after three answers, and only the summary advances by itself; a reply made of the marker alone is the answer to an explicit request to move on (the guided path context asks for exactly that), so it advances, and in voice mode the turn announces the next step instead of reporting a missing reply; presentation, profile reading and the questions phase keep the forward button always visible. Every turn resends the step instructions, on the web and in Telegram (`telegram_state.INTERVIEW_PATH_QUESTIONNAIRES`). QPCS is not an interview path but also leaves the advance to the person.
- **Significant event paths**: `EVENTO_STUDIO` and `EVENTO_PROFESSIONALE` are two interview paths with the same steps (`evstudio-*`, `evprof-*`: intro, agreement, event, facts, what worked, what did not, second look, next time, summary), built from `backend/prompts/evento_*.md` with a `{domain}` placeholder; system prompts `prompt_evento_interview`/`prompt_evento_summary` are shared, meta and closing texts are per instrument. Inspired by the PeF60 trainee-teacher portfolio (Roma Tre) but not a copy of it: no personal data, no university export, other people named by role only. The summary turn asks (via `turn_contract`) for a private ```booklet block, stripped by `backend/event_booklet.py` and returned as `event_booklet`; the conclusion shows `EventMilestoneCard`, prefilled and saved as a past milestone in the personal timeline (`POST /user/timeline/milestones`) only on confirmation; a «try next» can become a goal with that milestone as origin. One-time migrations: counselors that list SAVICKAS also serve both paths (`counselor_scope_event_paths_v1`), and the skill engine list gains both codes (`skills_event_paths_v1`). Web only: the Telegram bot does not offer them.
- **Conversation continuity**: `session_ledger.py` recovers recent and salient student answers, chosen/refused actions, a still-open question and repeated steps from owned session data. It is injected at step entry; synthesis uses journey evidence instead. `[ANCHOR]` requests one final experience-linked question in factor analysis; `[PERSPECTIVE]` connects one evidenced thread to the student's stated horizon at synthesis. Factor names are introduced once instead of repeatedly expanding the same code. These directives require sampling actual answers, not merely checking prompt presence.
- **Thread guard**: `thread_guard.py` judges each finished counselor turn on a preset of its own (`thread_guard_preset_id`, seeded by `thread_guard_seed.py` to a local qwen3.8; the admin panel “Guardiano del filo” can point it at any preset, external providers included) and stores the verdict in `Log(action="thread_guard")`. Three fields — `on_thread`, `question_fit`, `advice_grounded` — and only the failing ones are injected: on an ordinary turn as a `[THREAD]` block of at most 400 characters, at step entry folded into `session_ledger` under its 1900-character cap so nothing is said twice. It judges the counselor and never the student: a student who changes subject is not derailing, only a counselor who neither followed it nor tied it back is. Notes are facts, never orders — an imperative or a “should” is dropped in all six languages, a rambling note keeps its first sentence, a long one is trimmed at a word boundary; at most two per turn in fixed severity order (`advice_grounded`, `on_thread`, `question_fit`), and a note identical to the previous turn's is suppressed once, not forever. Everything a rule can settle stays with the rules: whether the counselor's own open question was taken up is `session_ledger.open_question_note`, which clears itself when the student replies and reaches free turns where the ledger is not injected — asked of a model instead, it answered “not developed” on most turns whatever the turn held. The judge is given the step's **name**, never its prompt: handed the script verbatim it ticked the instructions off and condemned a turn that answered what the student had actually asked. For the same reason a step entry is shown as “the student said nothing”, because `effective_user_input` there is the platform's hidden directive, not the student. It runs with thinking off whatever its preset says, at temperature 0 (`AIService.temperature`, which no path sent before), 45s, its own session, PII redacted with `redact_always` since the judge may be external. A verdict about an older exchange is stale and ignored; timeout, unreadable JSON, a missing preset or `thread_guard_enabled` false each render an empty block — never a delayed or failed turn. Measured with `scripts/thread_guard_dry_run.py`, which reads verdicts over real sessions and writes nothing: on qwen3.8, 25 real turns produce no injection and no unreadable verdict across repeated runs, while a deliberately derailed turn is caught on all three checks. A larger local model (nemotron-cascade-2) passed that same broken turn as sound: silence is not accuracy, and a judge must be tested against a turn known to be bad. The Compass does not pass through `chat_preparation` and is not covered. See `docs/plans/thread-guard.md`.
- **Advice and questions**: a third sidebar tab, “Consigli e domande”, uses `RecommendationHistory` type `advice` with payload kind `advice` or `question`. A private `recommendations.notes` declaration is accepted only for text present in the visible completed reply; advice respects the step gate. Exact normalized duplicates share a stable hash. A question has four fates, all in the payload: `proposed` while open, `closed` with `closed_by=student` when the student closes it from the sidebar, `closed` with `closed_by=conversation` when `thread_guard` sees it answered in substance while the student was talking about something else, and `stale` when `session_ledger.retire_stale_questions` finds the conversation has moved past the step it came from (`step_id`/`step_order` are recorded when it is declared). The student can reopen any of them; a reopened one carries `revived` and never decays again. The ledger gives the counselor a different rule for each — take an open one back up once, reformulated; treat one answered while talking as already said; leave one that was left behind unless the student returns to it — and the sidebar names all four. An open question travels only in the ledger: carried also by `recommendation_service.conversation_context`, the same turn received the same text with two opposite instructions. That channel keeps the rest, including closed questions and anything the student names explicitly. The latest 12 notes (220 characters each) and any explicitly named older note are injected as data to avoid paraphrased repeats. See `docs/superpowers/specs/2026-09-07-ciclo-di-vita-delle-domande-design.md`. Semantic non-repetition depends on the model and must be observed live. Books and certified strategies keep their existing catalogues and states.
- **QSA life actions (W4b)**: four Italian strategies grounded in the authorized Ottone QSA sheets connect learning to already stated personal projects (C1/C1r, C2/C2r, A2/A2r, A5). Source support and editorial adaptations are separated in `docs/handoff/w4b-strategie-azione-vita.md`. No inferred career destiny or automatic certification of missing translations.

- **Skills engine**: `backend/skills/` selects and renders the skills bound to the current step. A deterministic, high-precision intent classifier activates at most one `primary` behaviour per turn: certified advice (`certified-advice`), conceptual clarification (`profile-wayfinder`), identifiable reading suggestions (`reading-guide`), comparison of the same student's persisted profiles (`profile-comparison`), or a factual lookup on public sources (`web-lookup`). `always`/`support` skills may coexist; legacy `optional` candidates still use the LLM router above `skills_router_threshold`, with deterministic fallback. Skills take the shared budget (`skills_total_max_chars`, 4500) in order of rank — structural (`always`/`support`), then `primary`, then everything else — and only then by `sort_order`. Rank was missing until an optional illustration (`concept-diagram`, 1977 chars, sort 35) starved the primary answer material (`certified-advice`, sort 50): the knowledge block was dropped with no error and no log. A block that does not fit disappears silently, so growing a contract past its cap or the budget is a real failure mode — `test_skills_budget.py` and the contract-length test in `test_idea_map.py` guard it. Behavioural instructions are appended in `directive_tail`, while handlers put certified sources, the citable reading whitelist and structured comparison data in `knowledge`. RAG retrieval runs *before* the engine so `reading-guide` can only offer sources actually retrieved in the turn (`reading_sources` handler); `profile-comparison` receives the last two compilations of each instrument, so the same questionnaire can be compared over time. Instructions are translated in all six languages (no English placeholder). The five primary skills are bound to all seven supported instruments; `approved-strategies` is retained but inactive and unbound. `web-lookup` is the only one that leaves the machine: it fires on a circumscribed factual question — about a work, a person or a term ("cos'e' la metacognizione", "chi era Vygotskij", "di cosa parla Mindset") in all six languages — and answers from the encyclopedias instead of from memory. It is on by default (`web_lookup_enabled`, revocable from the admin panel). A question about the student's own profile never reaches it: factor codes and the words profile/score/result/notebook negate the `factual` intent, which keeps those turns with `profile-wayfinder`. It never recommends a work outside the certified catalog. Which steps may deliver practical advice is decided upstream by `_ADVICE_PROMPT_MODES` in `chat_logic.py`: free chat, the QSA/QSAr second-level steps and the final synthesis step of QPCS, QPCC, QAP and SAVICKAS. Analysis, factor and interview steps stay interpretive and retrieve no certified strategy, and `_NO_NEW_ADVICE_STEP_IDS` keeps the QSA/QSAr synthesis from introducing new ones. The step prompts themselves were aligned to that directive: the QSA/QSAr second-level steps and the QPCS/QPCC/QAP/ZTPI summaries now ask for ONE practical action, not two or three. One exception: when a student's free message inside a step is classified as an advice request (`is_advice_follow_up`), one certified strategy is delivered even on an interpretive step, so the answer stays traceable to the catalog instead of being improvised. The per-step admin configuration and the synthesis veto both still win over that exception. Turning off the global engine flag restores the historic retrieval path in `chat_logic._retrieved_context`.
- **Session**: a chat session tied to a `QuestionnaireResult`. Has rolling Markdown conversational memory on disk.
- **Conversation artifacts**: manual message diagrams are saved as `Log(action="message_diagram")` revisions, keyed by the original message hash; redacted source text links them to the PDF transcript. Opening a resumed session restores its latest diagrams, and generation failures preserve the last valid revision. The mobile toolbar wraps and includes render retry.
- **Diagram generation fallback**: `/diagram/from-message` tries the selected counselor and then the distinct preset in `diagram_preset_id`. Each model has 40 seconds total, including one repair of invalid JSON, keeping both attempts below the browser's 120-second limit. Timeout, provider error, empty output or invalid output advances to the reserve; late results are discarded before validation or saving. DeepSeek JSON-only extraction explicitly requests `response_format=json_object` and disables thinking; ordinary conversational calls keep their existing behavior. Qwen/Ollama already uses native JSON mode for this prompt.
- **Diagram icon meanings**: `diagram_icon_catalog.json` defines 100 IDs, meanings and exact aliases. `diagram_factor_symbols.json` binds all 41 QSA/QSAr/ZTPI/QPCS/QPCC/QAP factors in six languages to fixed symbols. `DiagramSpec` resolves known names or `factor: "QSA:A6"` metadata in code, overriding arbitrary model icons for recognized factors and filling missing general icons only on exact dictionary matches. Levels remain in labels. Manual generation supplies the session instrument's dictionary through fallback/repair; saved diagrams are normalized on read without rewriting history. IDEA role icons remain unchanged. The shared English skill cap is 4100, migrated with a stock-text hash guard (`skills_diagram_factor_symbols_v1`). `node scripts/generate_diagram_icons.mjs --check` verifies assets and both searchable previews. See `docs/diagram-icons.md`.
- **Diagram reading and interaction**: `DiagramBlock` keeps overview, readable text scale, full-screen camera, selection and guided reading separate from the saved spec. `DiagramViewport` preserves the SVG DOM through resize, supports node selection by touch/keyboard and highlights both endpoints of adjacent edges; future steps remain hidden and outside keyboard navigation. Reading mode starts at a scale where the smallest SVG labels are 15 CSS pixels; manual zoom remains available. Fullscreen supports drag/pinch and retains the view on return. The textual representation is always available, and SVG/PNG exports use the complete spec through the existing render endpoint. Motion is off by default; optional short transitions and explicitly started playback respect both system and in-app reduced-motion settings. Captions describe existing edges without another AI request. Graphviz fixtures in `frontend/tests/fixtures/` exercise real geometry in both themes; the browser suite also covers selection, text size, focus, playback and touch gestures.
- **Visual conversation tools**: the `VisualTools` workspace opens beside the guided chat and in the graphical OpenCode chat. It contains the student's action board (`todo` / `doing` / `done`), up to three comparison alternatives with six student-defined criteria, and reflection cards sorted into student-chosen columns — three localized presets (Reflection = the four historic states `unsorted` / `yes` / `explore` / `no`, Kanban, Exploration) plus up to eight freely named custom columns stored in `Workspace.card_columns` (empty = default set; no migration). The backend rejects card buckets outside the chosen columns; preset labels stay translated in six languages while custom columns carry the student's text. Existing recommendations may seed editable entries, but workspace changes never alter recommendation certification or state. `GET/PUT /session/{session_id}/visual-tools` stores validated, PII-redacted revisions in `Log(action="visual_workspace")`; ownership is checked and a revision mismatch returns 409 without overwriting work. Writes use a per-session transaction lock; no schema migration. The UI retains a failed draft, supports undo and draft text export, and requires explicit saving. “Discuss in chat” saves and fills the composer without sending or changing hidden prompts. Saved work can be exported through `/session/{session_id}/visual-tools/pdf` and appears in both final session PDF modes; the conversation summary continues to summarize the conversation. Six-language UI, keyboard-operable sorting and responsive layouts require no new animation or drag library. See `docs/plans/visual-conversation-tools.md` for scope and concurrent-agent boundaries.
- **Personal timeline**: `/profilo/timeline` is a single student-owned workspace independent of sessions. `/user/timeline` GET/PUT and `/pdf`, `/preview`, `/portfolio` subroutes use the authenticated username, `Log(action="personal_timeline_workspace", session_id=NULL)` and revision conflict checks. On first access, `ensure_personal_timeline` imports every milestone and its linked actions from the latest legacy workspace of each session; deterministic IDs preserve cross-references across collisions. Originals remain untouched and a `personal_timeline_import` record prevents duplicate imports or resurrection after deletion. Legacy session/event URLs resolve into the personal timeline, and Portfolio backlinks now target `?event=…`. Personal events can link the Notebook, orientation directory, personal actions (including book/article/film goals) and owned Portfolio works. Published institutional appointments and registration deadlines are selected from the existing scoped orientation directory: title/date are authoritative, refreshed on read, and unavailable records expose no stale institution content. They remain visible after their date while certified, active and in scope. Personal reflections/actions remain editable. Personal storage accepts imported timelines larger than the old 30-event session limit. Portfolio snapshots remain immutable, revision/hash checked and idempotent, with the existing text-size limit. Session Tools now link to this independent workspace; their legacy timeline data remains available for historical PDFs. Tests cover extraction, ownership, conflicts, institution scope, snapshots, PDFs and desktop/mobile flows; the opt-in real API fixture remains `backend.tests.timeline_browser_server`.
- **Visual tools and personal annotations**: the workspace offers explicit, bidirectional transfers with source selection and editable text. `GET/POST /session/{session_id}/visual-tools/personal` exposes the student's notebook fields and the reading note of the session's result only. Exports append to the selected field (600 notebook / 2000 reading characters including existing text and provenance), reject stale field/workspace versions, and suppress repeated saves. Other fields remain intact. Imports create a selected card, action or comparison alternative through the versioned workspace API, retaining provenance; they do not choose or score alternatives. No automatic synchronization or AI calls. Regression tests: `backend/tests/test_visual_personal.py`, frontend unit tests and `npm run test:visual`.
- **Platform guidance**: Bussola and the Assistant factory context share `backend/prompts/default_counselorbot_chat_context.md`: six questionnaires, four score-free conversations (including EVENTO_STUDIO and EVENTO_PROFESSIONALE), personal goals, calendar/diary, assignments, feedback and distinct sharing permissions. `/guide` has a public audience selector in six languages: `?audience=student` (default, 15 sections) and `?audience=teacher` (7 dedicated sections). The selector does not change account permissions. Assistant runtime uses DB overrides plus `docs-counselorbot`; changing factory defaults alone does not update existing DB values. Apply reviewed, scoped plans through `backend.prompt_updates` (hash checks and revision history), then rebuild the CounselorBot RAG index. See `docs/operations/platform-guidance.md`.
- **Interface guide screenshots**: `/guide` uses static image imports from `frontend/public/guide` so updated captures receive new asset URLs and retain their actual dimensions. Nine views of personal tools, significant events and teacher workflows are captured in all six languages with synthetic data by `cd frontend && node --experimental-strip-types scripts/capture-guide.mjs` (`GUIDE_BASE_URL` optionally selects the frontend). The three Italian chat screenshots are refreshed separately with `UPDATE_GUIDE_SCREENSHOTS=1 node --test --experimental-strip-types --test-name-pattern='capture current guide' tests/visual-tools.test.mjs` (`VISUAL_TOOLS_BASE_URL`). The personal guide includes current introduction, catalog, PDF and Flashcard screenshots; `tests/guide-audiences.test.mjs` covers public role selection, direct URLs, browser history and accessible zoom; the guide cases in `tests/visual-tools.test.mjs` cover personal-guide sections. See `docs/operations/platform-guidance.md` for capture and deployment verification.
- **Reading and strategy choices**: retrieved catalogue entries are candidates. A private `recommendations` block declares the IDs actually proposed in the visible reply; only IDs from that turn's certified candidates are accepted. Missing or malformed blocks add nothing, and the block is hidden from streaming, logs and exports. `RecommendationHistory.payload` stores `status` (`proposed`, `selected`, `tried`, `dismissed`) and optional `helpful`; refreshes preserve these choices, and historical rows default to `proposed` without rewriting history. The panel supports synopsis, links, per-item feedback, archive/restore and an explicit composer handoff. Selected/tried items and explicitly reopened titles return to chat context without widening retrieval limits. No schema migration is needed.
- **Final session report**: the personal-area preview and PDF use the same canonical summary, cached by conversation content, scores, recommendation choices and language. A current final-step summary can be reused in its original language; otherwise generation processes the entire transcript in bounded chunks, preserving later decisions. Failures return `status="unavailable"` and are not cached. The report starts with the summary and recommendations; `mode=brief` includes these plus diagrams, while the default `mode=full` also includes scores and the transcript. Both formats require session ownership (or admin access). Long text cards paginate and book URLs are clickable.
- **Frozen session**: a guided-chat session freezes itself. `GuidedChatInterface` and `OpenCodeExperience` write a snapshot ~1.5s after each finished turn (`lib/auto-freeze.ts` holds the guards: a session with only the intro message, one still streaming, or one already completed is never written) and flush a pending one on unmount and on `pagehide`, so leaving the tool by any route — back button, header link, closed tab — keeps the session. The "Congela sessione" button in `GuidedChatInterface` does the same and closes the chat on top; the snapshot (step, scores, transcript) is stored in the `frozen_sessions` table keyed to the caller's `username` (`POST /session/freeze`). It's resumed from any device via the header's frozen-session icon (dropdown when several are frozen) or the `/?frozen=<session_id>` URL, which restores the snapshot into the guided chat or into the OpenCode sandbox, following the snapshot's `experience`. The snapshot is deleted (`DELETE /session/frozen/{session_id}`) once the guided path completes, so it can't be resumed into a finished session. Known limitation: the transcript comes back in full, but the model's own session memory has a 2-hour TTL and the snapshot doesn't carry `conversation_id`, so a session resumed much later returns "cold" — the student sees the history, the assistant may not remember it, and previously suggested strategies can repeat.
- **Discard a resume point**: the header, mobile menu and returning home show a delete control beside every resumable entry. Confirmation removes the owned frozen snapshot through the existing DELETE endpoint and clears a matching local resume point; questionnaire results and other session artifacts remain. Local pQBL progress can also be removed. Failures keep the entry visible for retry; a missing snapshot (404) is treated as already removed.
- **pQBL placement and resume**: “Studiare da un PDF” belongs to the personal area, next to Flashcards under “Studiare, esplorare e agire”. Home and the selector link to the whole personal area instead of an “Allenamento” category. The introduction offers four equal entries (Compass, questionnaire analysis, guided paths, personal area) and a secondary link to the full catalog. The activity catalog starts with Compass, followed by questionnaires, guided paths and the personal area; resumable activities stay last. Input method and chat mode are remembered only on explicit selection in their respective screens. The pQBL activity keeps its own progress in `localStorage` (`lib/pqbl-progress.ts`) and restores it on entry; `hasPqblProgress` also lists it among the header's "Riprendi" entries (link to `/profilo/pqbl`; legacy `/pqbl` redirects there), so it isn't the one tool whose interrupted session is invisible. It is per-browser, not cross-device like a frozen session.
- **Student-facing chat** vs **Admin panel**: two sides of the same app. Admin edits prompts, guided steps and counselors; API keys are read-only here and are managed centrally in ai4educ Console → Secrets.
- **Cross-synthesis**: on-demand synthesis across a student's multiple instrument results (`cross_synthesis.py`, `/user/cross-synthesis`).
- **Telegram bot**: students can link their account (`TelegramAccountLink`) and interact with guided chat over Telegram; group/plan deep links auto-enroll into a class. State machine in `telegram_state.py`, API in `telegram_bot.py`.

### User Roles
Roles are derived from ai4auth groups (marker-based, see `backend/auth.py`), not stored per-user.
- **Student**: fills out questionnaires, interacts with guided chat, can view own learner profile/taccuino, portfolio, groups
- **Counselor scope**: `counselors.questionnaire_types` decides which instruments a counselor may serve, and it is finally read (`backend/counselor_scope.py`). Empty still means "all" — except on **invite-only instruments** (config `counselor_restricted_instruments`, default `["IDEA"]`), where empty means "none" and only a counselor naming the code qualifies. That inversion exists so excluding everyone from one instrument does not require writing the other seven on every counselor, and re-writing them all whenever an instrument is added. `GET /counselors?questionnaire_type=X` marks each row `suitable` and sorts the fit ones first; unsuitable ones are still returned, because the selector uses them to say why the current pick does not work and which ones do. Idea is invite-only because it needs a reasoning model: it must emit a structured block every turn, and a no-reasoning model silently skips the turn — Clio and Giulio (qwen3.8 reasoning) are in, Iride currently uses preset 15 (`ollama / nemotron-cascade-2:latest`) with thinking enabled (verified 2026-09-06); instrument access still depends on her explicit scope.
- **Counselor**: an AI persona (`Counselor` model) selectable in chat — a prompt profile, not a login role
- **Teacher / Docente** (`is_teacher`, group markers `docent/insegnant/teacher/educator/professor/faculty/staff`): owns classes/groups and administration plans, sees own students' results and conversations, writes notes/messages and directly publishes the shared strategy and reading/media catalogs (`/docente` dashboard). Catalog editing does not grant technical administration or instrument validation; see `docs/operations/teacher-catalogs.md`
- **Researcher / Ricercatore** (`is_researcher`, markers `ricerc/research/researcher`): same class/plan capabilities as teacher, plus research contacts and anonymous-code administration
- **Admin** (member of any `ADMIN_GROUPS` group, env-configurable, defaults include `admins`): configures prompts, AI providers, guided steps, instruments, counselors, RAG; views all results and every group

## Architecture

### Adding an instrument: the lists to touch

Instrument membership is not stored in one place: it lives in hardcoded lists
scattered across both sides. Forgetting one raises no error — the instrument
just disappears from that part of the app, which is how `IDEA` first shipped
invisible. When adding an instrument, walk this list:

| Where | Constant | Effect if missed |
|---|---|---|
| `frontend/src/lib/questionnaires.ts` | `QuestionnaireType`, `QUESTIONNAIRES` | the instrument does not exist |
| `content_language_versions` | una riga per lingua, via `derive_instrument_versions` | non somministrabile in nessuna lingua |
| `frontend/src/components/questionnaire/QuestionnaireSelector.tsx` | `ACTIVE_QUESTIONNAIRES` | shown as "coming soon", not selectable |
| `frontend/src/app/page.tsx` | `STARTABLE_QUESTIONNAIRES` | deep link `?q=` ignored |
| `frontend/src/components/home/ReturningHome.tsx` | `STARTABLE` | returning students cannot start it |
| `frontend/src/app/strumenti/[id]/page.tsx` | `AVAILABLE_INSTRUMENTS` | `/strumenti/<id>` 404s |
| `backend/chat_logic.py` | `_ensure_questionnaire_guided_steps` | no guided steps are ever seeded |
| `backend/routes/memory.py` | `MEMORY_QUESTIONNAIRE_TYPES` | the session memory drops every turn |
| `backend/schemas.py` | `FROZEN_SESSION_TYPES` | freezing a session fails |
| `backend/skills_seed.py` | `ENGINE_INSTRUMENTS` (+ `SEEDED_INSTRUMENTS` only if it should get certified material) | the skills engine skips it |
| admin panels | `SkillsPanel`, `CounselorsPanel`, `LogViewer`, `PromptExportPanel`, `routes/admin.py:_EXPORT_INSTRUMENT_ORDER` | invisible to the admin, so unconfigurable |

Scored instruments also need items in the DB catalog (served by
`GET /instruments/{code}/rules`, no longer duplicated in a frontend file), the
administration and research panels, `telegram_state.SCORE_QUESTIONNAIRES` and
`routes/survey.INSTRUMENT_TYPES`; an agent-led one does not. `test_smoke.test_every_gate_that_would_silently_exclude_idea_lets_it_through`
holds the backend half of this.

Guided-step labels are translated at startup by `seed_step_label_i18n`; steps
created lazily on first request get their `label_i18n` in
`_ensure_questionnaire_guided_steps` instead.


### Request path
Frontend reaches backend via Next.js rewrite in `frontend/next.config.ts`:
`/api/:path*` → `http://backend:8000/:path*`

Exception: **`/api/chat/stream`** is a filesystem route `frontend/src/app/api/chat/stream/route.ts` because Next.js rewrite buffers Server-Sent Events.

`/counselorbot` and `/counselorbot/*` redirect to root (app is mounted under that path behind the proxy).

### Auth
ai4auth forward-auth at the edge (Nginx). Proxy injects `Remote-*` headers → parsed in `backend/auth.py`. Roles are marker-based on `Remote-Groups`: admin = any group in `ADMIN_GROUPS` (env `ADMIN_GROUPS`, comma-separated, always includes `admins`); researcher/teacher detected via `RESEARCH_GROUP_MARKERS`/`TEACHER_GROUP_MARKERS`. `frontend/src/lib/auth.ts` reads identity from `/auth/me`. Dev fallback identities exist for role preview (test accounts).

### Data Model
- **Config**: key-value DB store for prompts, UI texts, provider/model and non-secret runtime settings. API keys follow a separate single-source contract in `api_secrets.py`: they are read only from environment variables distributed through ai4educ Console → Secrets. The CounselorBot admin panel never stores, changes or returns secret values; it only reports whether each provider is configured and runs an authenticated, read-only provider check to distinguish “configured” from “working”. The legacy `api_secrets` table is retained only for schema compatibility and is never read at runtime. Non-secret keys in `ENV_KEY_MAP` (`ollama_ip`, `ollama_num_ctx`, `ollama_keep_alive`, `qsa_ocr_model`, `qsa_parser_model`) retain environment precedence. Defaults in `prompt_config.py` are seeded at startup without overwriting.
- **GuidedStep**: per `questionnaire_type`, ordered steps with `prompt` + `system_prompt_mode`
- **GuidedStepQuestion**: suggested questions per step
- **QuestionnaireResult**: per-session survey data
- **OrientationSession**: private, repeatable Bussola conversation with validated tool recommendations. It is separate from profiles and questionnaire results; completion of the first session unlocks the ordinary student routes. Its `notebook_draft` / `notebook_reviewed` / `notebook_revision_id` columns are leftovers of the removed draft flow and are no longer read or written.
- **StudentBooklet**: retired per-instrument booklet, kept read-only as the source of the one-off migration
- **ResultReading**: «La mia lettura» of one questionnaire result (one per user and session)
- **StudentGroup / GroupMembership / GroupShare**: teacher classes, student enrollment, and co-teacher sharing (see Glossary → Gruppo/Classe)
- **TeacherNote**: teacher note (`kind=note`) or message (`kind=message`) about a student, scoped to a group/plan; messages can be delivered via Telegram
- **AdministrationPlan / AdministrationPlanResearcher / ResearchContact / AnonymousResearchCode**: research administration of instruments; a plan can attach a group and Telegram deep links
- **TelegramAccountLink / TelegramLinkCode / TelegramConversationState**: verified Telegram↔username mapping, one-time link codes, per-user bot conversation state machine
- **UserDisplayName**: cached display name/email for teachers/researchers/admins, auto-populated on plan/group/note creation
- **Session memory**: on-disk per-session rolling Markdown (`SESSION_MEMORY_DIR`), thread-safe, with expired-session cleanup. Semantic embedding retrieval available via `backend/memory_embeddings.py` (best-effort, falls back to keyword).
- **Strategy memory**: knowledge base from `knowledge/approved_strategies.md`, optionally overridden by the admin UI in DB config key `approved_strategies_markdown`
- **SharedChatResponse**: user feedback (helpful/unhelpful) on shared chat responses
- **NormThreshold**: normative thresholds per instrument (stanine cutoffs)
- **CertifiedReading**: catalogo di letture, film, articoli e video approvati dall'admin (`certified_readings`), gemello di `CertifiedStrategy` ma agganciato a un TEMA del vocabolario chiuso in `reading_themes.py`, non a un codice fattore: un romanzo non mappa su un costrutto. I codici fattore restano un canale secondario. Testi in un unico campo JSON per lingua (sei lingue) invece di una colonna per lingua. Le voci nascono `draft` e arrivano allo studente solo da `certified`; `reading_verification.py` controlla titolo, anno e autori su OpenAlex e per film e narrativa dichiara che una fonte automatica non esiste. Il materiale marcato sensibile richiede due condizioni: la config `readings_allow_sensitive` accesa e il tema nominato dallo studente, e porta sempre l'avvertenza. La fascia di pubblico dello studente non viene chiesta apposta: `reading_audience.py` la ricava dall'`age` e dai campi scolastici gia' presenti nel taccuino, e in assenza di quelli dal `school_level` della classe o del piano di somministrazione; fra segnali discordanti vince il piu' protettivo. Fascia ignota: nessun filtro, ma la direttiva impone al modello di chiedere a che punto degli studi si trova prima di proporre. Ogni voce puo' portare una **sinossi** (`synopsis_i18n`, di cosa parla l'opera) distinta da `summary_i18n` (cosa aiuta a capire) e da `why_i18n` (perche' e' pertinente): la sinossi viaggia sempre con la sua provenienza in `synopsis_source` (fonte, URL, data, licenza), e senza URL la voce non puo' essere certificata. La bozza si recupera dal pannello (`POST /admin/certified-readings/{id}/synopsis-draft`, non salva: propone) o in blocco con `scripts/backfill_reading_synopsis.py`; l'approvazione resta un gesto dell'admin. In chat la sinossi entra cappata a 220 caratteri. La cornice del blocco consegnato al modello — direttiva d'uso, etichette, richiesta della fascia, dichiarazione di assenza — vive in `reading_frame.py` nelle sei lingue e segue la lingua del turno; il tag `[CERTIFIED_READINGS]` resta un marcatore e non si traduce, e una lingua non prevista ricade sull'inglese. Restano invece in inglese le istruzioni comportamentali delle skill, che sono un contratto unico. Servizio `certified_reading_service.py`, seed `certified_reading_seed.py`, API `/admin/certified-readings`, consegnato in chat dall'handler `reading_sources` insieme alla whitelist RAG.
- **RecommendationHistory**: il catalogo di quel che la chat ha gia' consigliato (`recommendation_history`, servizio `backend/recommendation_service.py`). Una riga per `(username, session_id, recommendation_type, slug)`: `username` sta nella chiave perche' due studenti possono portare lo stesso `session_id` e la sidebar dell'uno non deve mostrare le letture dell'altro. Nasce da un problema di forma, non di contenuto: una lettura nominata in prosa scorre via col resto della conversazione e non si ritrova piu', e lo skills engine, che il catalogo lo rinietta a ogni turno, la riproponeva. Le raccomandazioni escono percio' dalla prosa e diventano dati: a fine turno le route `/chat`, `/chat/stream` registrano gli slug del turno (`reading-guide` per le letture, `certified-advice` per le strategie) con il `payload` gia' pronto per il render, e il turno dopo `_retrieved_context` rilegge quegli slug e li passa come `excluded_reading_ids` / `excluded_strategy_ids`, cosi' il modello riceve solo materiale nuovo. Le direttive dicono al modello di non ripetere titoli e nomi (`reading_frame.py`, `_SIDEBAR_INSTRUCTION` in `certified_strategy_service.py`): in chat restano le implicazioni, nel pannello i titoli. Il log non si cancella mai a fine sessione — una sessione congelata deve riaprirsi con la stessa sidebar — e si rilegge da `GET /api/session/{id}/recommendations`. Lato studente e' il `RecommendationsPanel` (tab Letture/Film e Strategie) accanto ai punteggi.
- **IdeaSource**: le fonti esterne che lo studente ha deciso di tenere per un RAMO dell'idea (`idea_sources`, servizio `backend/idea_sources.py`, config `idea_sources_enabled`). Il gesto e' esplicito: nessuna ricerca parte da sola a ogni turno — si cerca dal pannello del ramo, si guardano i risultati, e viene salvato solo quel che si sceglie. Due gruppi, perche' sono due domande diverse: `encyclopedia` (Wikipedia, Treccani, via `cached_lookup` col controllo sul titolo, che li' serve ancora) e `works` (OpenAlex, Europe PMC, via `web_lookup.search_works`). La ricerca tematica NON e' la ricerca per entita': `lookup` pretende che il titolo trovato ricalchi la domanda — giusto per "di cosa parla Mindset", fatale per "dispersione scolastica nella secondaria", dove nessun titolo la ricalca — quindi `search_works` quel controllo non ce l'ha e usa invece i filtri della fonte (anno, lingua, accesso aperto) e il suo ordine di pertinenza, deduplicando per DOI fra le due fonti. Il ramo e' la chiave: `context_for` inietta in `[IDEA SOURCES]` solo le fonti del ramo a fuoco (6 voci, abstract a 300 caratteri), perche' le letture di un altro ramo non c'entrano con il lavoro in corso; il PDF di conclusione le riporta tutte. **Il PDF ad accesso aperto e' l'unica cosa che esce dalla whitelist chiusa di `web_lookup`**: sta sull'editore o sul repository indicato dalla fonte, e quell'host cambia a ogni lavoro. Percio' il download ha regole sue e non si fida della provenienza: solo `https`, nessun indirizzo di rete interna (l'URL arriva dal client e non deve poter diventare una richiesta verso l'interno), `Content-Type: application/pdf`, magic number `%PDF`, tetto di 15 MB, timeout 20s, e i file finiscono in `IDEA_SOURCES_STORAGE_DIR` (default `/app/uploads/idea-sources`). Quote: 10 ricerche per sessione (contatore di processo, cortesia verso le fonti) e 10 PDF per sessione (contati sulle righe salvate, perche' e' spazio su disco).
- **WebLookupCache**: memoria delle consultazioni esterne (`web_lookup_cache`, TTL 30 giorni), cosi' la stessa sinossi non ricompra la stessa pagina. Client in `backend/web_lookup.py`: whitelist chiusa di fonti (Wikipedia, Treccani — enciclopedia e vocabolario, Open Library, Google Books, OpenAlex, Europe PMC — che copre gli abstract che OpenAlex non puo' ridistribuire), URL ricontrollato contro i domini ammessi, query ripulita dalle PII anche a redazione dei log spenta e ridotta all'entita' cercata (l'apertura interrogativa viene tolta: "cos'e' la metacognizione?" esce come "metacognizione"), titolo trovato validato: contro il titolo atteso per una sinossi (scarta la pagina dell'autore e l'omonimo che allunga il titolo), contro la domanda stessa per una ricerca libera, con tolleranza morfologica ("procrastinare" trova "Procrastinazione") — senza quel secondo controllo una redirezione dell'enciclopedia diventa una risposta sicura di se' e sbagliata ("Mindset" rispondeva "The Witch"). Piu' il controllo del medium: un film omonimo non diventa la sinossi di un saggio. La chiave di cache porta una versione, cosi' una regola corretta non lascia in memoria per trenta giorni le risposte accettate da quella vecchia. Google Books richiede `GOOGLE_BOOKS_API_KEY`: senza chiave la fonte viene saltata. Una voce con DOI si risolve, non si cerca per titolo; un film viene ritentato col qualificatore dell'enciclopedia ("Lady Bird (film)", "Inside Out (film 2015)") perche' il titolo nudo finisce sull'omonimo o sul seguito. Il testo viene ripulito dal rumore di catalogo (grassetti, note `[2]`, riga di attribuzione) e archiviato sotto la lingua in cui la fonte ha risposto, non sotto quella richiesta: Open Library risponde nella lingua dell'edizione. CLI: `python -m backend.web_lookup "<query>" --source wikipedia --lang it`.
- **Skill / GuidedStepSkill**: declarative skills injected into the chat prompt (conditions, multilingual instructions, optional Python handler) and their binding to instrument/step (`step_id = "*"` = every step). Engine in `backend/skills/`, intent rules in `backend/skills/intents.py`, seed and one-time rollout policies in `backend/skills_seed.py` (`skills_certified_advice_policy_v1`, `skills_specialized_behaviors_v1`, `skills_reading_sources_and_i18n_v1` — each applied once, never overwriting admin edits), API `/admin/skills`. The admin preview exposes the detected intent. Enabled by default for QSA, QSAr, ZTPI, QPCS, QPCC, QAP and SAVICKAS; the admin can still disable the global flag as a rollback.
- **PqblDocument / PqblQuestion / PqblSession / PqblAttempt**: PQBL (Problem/Question-Based Learning) — uploaded PDFs, generated MCQs, student sessions, answer attempts
- **IdeaMapRevision**: the map of an Idea session, append-only. The newest row per `session_id` is the current map, earlier ones are the history of the thinking. The model never rewrites the map: it emits a patch (`add_nodes`/`add_edges`/`update`/`remove`) in a fenced ```idea block, `backend/idea_map.py` merges it and writes a new revision, and the block is stripped from the reply before it reaches the student, the transcript or the session memory. A node carries a `role` from a closed vocabulary (idea, assumption, evidence, alternative, implication, open-question, constraint, step) which decides its icon and is spoken in the textual description; an idea counts as focused when idea + assumption + open-question + step are all on the map. Drawn as the `mindmap` diagram type (Graphviz `twopi`, ceiling 24 nodes / 30 edges instead of the 8/12 of an in-chat illustration). The current map is injected into the envelope as `[IDEA MAP]`, last system block before the directive tail: without it the skill instructs the model about a map the prompt never shows, and no patch is ever sent. RAG is muted for IDEA (`knowledge_enabled` in `_retrieved_context`) — the competenzestrategiche guide has nothing to do with an idea and was crowding out the map. The path is not a sequence: `next_move` derives the next step from what the branch in hand lacks (a required role) or carries (a flaw), so `/idea/next-step` drives navigation and IDEA has no `[[AVANZA_STEP]]` and no stepper. Work that emerges mid-conversation opens a `task` node with its own `task_type` from eleven types in five families, including `concept-exploration`, its own required roles (`TASK_PROFILES`) and its own close: the server detects readiness, the model makes the case, the person confirms, to a depth of two below which a task is demoted to a step. Nodes carry `status` (drawn as fill intensity) and `flaw`; `orphaned` and `unsupported` are computed server-side and cannot be overridden by the model. `idea_lexicon.py` renders statuses and flaws in two registers (research/plain) x six languages — the model always gets the canonical English token, the person never does. Navigation is the map, not a stepper: `GET /idea/branches` returns the tree of work nodes with what each still lacks, and `POST /idea/focus` moves the work to another branch, writing a revision with `focus_id` so the choice survives the next turn (append-only covers navigation too, and the history shows where the thinking went). A chosen branch beats the derived focus while it still exists; a closed one stays reachable, since rereading or reopening it is legitimate. In the UI the map and the branch tree sit BELOW the chat in a collapsible workspace rather than inside the message flow, where they drifted away with every turn. Length is set by the person, in exchanges rather than minutes, since minutes are not something the app can honour: `idea_budget` on the request (8/16/30, or 0 for as long as it takes) becomes a PACE line at the head of `[IDEA MAP]`. It changes the pace, never truncates — a short session asks one thing per turn and opens a branch only if the idea cannot be settled without it; the last quarter stops opening new ground, because a branch left open at the end is worse than one never opened; a spent budget proposes closing and says the person may carry on. Turns are counted from the logged exchanges, not from map revisions: a turn that produced no patch is still time spent. Every branch and the final session read-back end with an explicit ordered plan for producing or developing the idea; unresolved questions become verification actions instead of invented certainty. A closed branch is not a finished one: `POST /idea/reopen` reopens it and moves the work back to it, keeping its conclusion (deleting it would lose what the branch had settled before the change of mind), and coming back to a closed branch makes the model ask what changed. The tree is the person's to arrange, not only the model's: `POST /idea/branch/arrange` moves a branch among its siblings (`up`/`down`), nests it under the one above (`indent`), lifts it to its grandparent (`outdent`) or turns a demoted node back into a branch (`restore`), and `DELETE /idea/branch?node_id=…&cascade=` removes one either alone - what hung from it passing to the parent - or with everything under it, dropping the sources kept on the branches that go. Each command writes a revision like any other change, and one that would break the two-level ceiling is refused instead of silently demoting the branch, since a command that does the opposite of what it says is worse than one denied. `GET /idea/branches` now returns the tree in reading order (each branch under its own parent) rather than level by level: ordering siblings means nothing in a list sorted by depth. When the talk has drawn nothing yet, `POST /idea/branch` starts the map from the label the person types instead of refusing: the root carries their own words and a second box holds the tool's opening question in the session language (`opening_question` in `idea_lexicon.py`), since a saved map needs two nodes and an edge. The panel therefore never dead-ends on an empty state - a panel that will not start until the model draws leaves the person with nothing to click. The workspace itself sits beside the conversation at desktop widths, inside the resizable panel the other tools use: `ChatWorkspace` takes its width bounds and its storage key as parameters, and Idea asks for 360-720 px under `cb_chat_panel_idea` because a map does not read in the 480 the recommendations list was built for. On a phone the four pieces - chat, map, branches, sources - are tabs (`IdeaTabs`), each pane kept mounted so a reply streaming in is never dropped; the kept sources stay full width below the conversation, since a search returns long lines. A line at the head of the panel says what the turn is for, composed from `next_move` (`stepLine`): the missing leg, the flaw to sort out, or the pivot question when the branch is ready to close. A turn that returned no patch says so and offers to ask the model for the map, as a normal visible turn rather than a hidden round. The content of the map is no longer the model's alone: a correction switch in the map header turns clicks from navigation into editing - `POST /idea/node` adds a node to the branch in hand, `POST /idea/node/edit` fixes its label or role, and the delete route takes any node, a branch being a node like the others - while `idea` and `task` stay out of reach, having their own doors and their own rules about the kind of work. `GET /idea/map/image` takes a `revision` and draws the map as it stood at that stage, which the panel's stage slider walks through with corrections switched off. The map in words is an outline (`outline` in `idea_map.py`), not the generic one-sentence-per-edge description: on thirty nodes that reads as a wall and the structure, the only thing such a map has to say, disappears. `GET /idea/map` returns it as the description in the requested language and `synthesis_for` feeds it to the model, so the fallback text when no synthesis comes back is readable as well. A session ends by asking, not by saving: when every branch is closed the model reads the map back and asks where it should be kept, and `POST /idea/conclude` performs the chosen destinations in one call (notebook, portfolio, both or neither — keeping nothing is a valid answer), one failing destination not stopping the others. The keep buttons left the map panel for that dialog: a session that ends with no question leaves the map in a table nobody finds again. Behind config `feature_idea_focus`. The skill `idea-focus` carries the patch contract and binds to IDEA alone — `concept-diagram` forbids replacing prose with a drawing, the opposite of what Idea does, so the two must never share a prompt.
- **Tavolo / TavoloRevision**: the working table, a graph the person and the model build together. It is a third tool: it replaces neither the in-chat diagrams nor the Idea map. It is reached where the other tools are — the personal area and the "Tavolo" tab in the tools row next to taccuino and compilazioni — never from a message or from the Idea map. Two rules hold it up. The vocabulary: a connection names one token, `rel`, from a closed list of twelve, and its family (`argument`, `cause`, `time`, `part`) is derived server-side and only picks the stroke colour — four colours read at a glance, thirteen do not, which is the lesson of the four node forms applied to edges. Weight and doubt stay out of that list, as the modifiers `strength` (1-3, stroke width), `hypothesis` (dashed) and `reciprocal` (a second arrowhead, never on the `part` family, which draws none): they are adjectives of any link, and putting them among the types would have multiplied it. A person may write their own verb over the vocabulary word (`label`, 40 characters) and the rendition speaks that instead. A piece takes an optional `color` from a closed set of five, which is grouping and not meaning: it is the person's alone, the model can never set it, state beats it (a proposal stays dashed ochre, the accented piece stays filled petrol), and the rendition reads the groups out so the grouping survives for whoever listens. Emphasis is one bit, `accent`, and at most one piece per table carries it, the same rule the diagrams hold; the model can never set it, a second accent is a `TavoloError`, and the rendition names the accented piece. A link attaches to the border facing the other piece, computed per form (rectangle, rhombus, ellipse), so nothing about the attachment is stored and the four handles on a piece exist only to start a drag from any side. The authority: the model never writes the table, it proposes. Its moves enter with `state="pending"` and count for nobody until `/settle` promotes them, so `live()` — used by the rendition, the export and every count — is the only view that is content. Revisions are append-only like `IdeaMapRevision` but keep the whole graph rather than a patch: a table stays under forty nodes, and rereading a revision without replaying the history is worth more than the bytes. Every write declares the `base_index` it was thought on; a mismatch is `409`, because two tabs on one table must not overwrite each other silently. A table is a draft until it is saved: saving gives it a name, detaches it from the session and makes it resumable. It leaves the browser as an image the browser itself captures at save time (so it never goes stale — a table changes only when saved) plus a server-written textual rendition that is always there, for screen readers, TTS, PDF search and Telegram. The canvas carries its own zoom in, zoom out, fit and widen buttons, one group at the top right and no React Flow stock controls beside it, the last of which folds the side panel away so the drawing takes the window; max zoom is 4 rather than the default 2, because `fitView` reaches 2 on a small table and would leave the enlarge button with nothing to do. Desktop only: below 1024px the table is read, not worked. Behind config `feature_tavolo`. A table can be born from a prompt: `POST /tavolo/{id}/compose` (and `source_text` at creation) asks the model for a whole schema, which arrives as a proposal with every element pending, like any other model move. A genre — `workflow`, `causal`, `concept`, `argument`, `algorithm`, or none, letting the model pick and name it in the note — narrows the vocabulary inside the system prompt before the model speaks: the grammar lives in `backend/tavolo_presets.json` (admitted verbs, node forms, layout direction, prompt fragment, two example prompts, one worked example graph), the genre itself lives in `TavoloGraph.preset` inside the revision JSON so no migration was needed, and the rendition names it. A verb outside the genre is dropped like an invented icon, and a composition tops out at 16 nodes and 24 edges while a plain suggestion stays at 6. Pieces carry an `icon` from the same hundred-symbol catalogue as the in-chat diagrams, validated against it, proposed by the model and changed by the person from a searchable picker; the SVGs are served by `GET /api/diagram-icons/{id}.svg`, which is the one source for the canvas, the capture and Graphviz and lives outside `feature_tavolo` because the diagrams need it too. Pieces can also carry an `image` from a catalogue the administration curates: it uploads a whole set at once together with the CSV file that gives each image a name and a usage note (semicolon or comma separated; an image with no CSV row is not an error — it enters with the file name as its name and an empty usage the admin panel flags to complete, and only the admin manages the set, `tavolo_images` table and `PATCH`/`DELETE /api/admin/tavolo-images/{id}`, max 200 images, 10 MiB each). The person picks one from a searchable panel: alongside the name like a large icon, or as the new `image` form where the picture is almost the whole piece and the name sits under it; an image and an icon are alternatives on one piece — choosing one clears the other. An unknown image id is dropped at write like an invented icon (`_prune_images`), and `GET /api/tavolo-images[/{id}/file]` serves the catalogue and its files to anyone, like the diagram icons.

- **Tavolo usability and navigation**: `TavoloWorkspace` is shared by the standalone route and the embedded VisualTools view. Serialized writes drain before save, suggestions, settlement and help; explicit Save changes and retry expose persistence state. Connect pieces supports linking words; View proposals reviews individual pending nodes and links. A piece is written inside itself: a double click (or double tap) opens an input in the piece — `nodrag`/`nowheel` keep the React Flow gestures off the keyboard — and Enter, Escape or a click outside closes it, while the trash button on the piece border (visible on hover, selection or focus) removes it together with every connected link, without going through the panel. The list supports rename and confirmed deletion. A visible counselor choice and configuration preflight precede AI calls, and contextual help never mutates the graph. Local/cloud explanations also appear in the counselor selector and Guide. Incompatible instrument counselors reopen selection inside the main flow. Page Back uses observed application history; embedded tables return to the existing tools panel, its selected tab and drafts. See `docs/operations/tavolo-usability.md` for contracts and verification.

- **IdeaReference**: one private reference per Idea session. PDF, UTF-8 TXT and Markdown are accepted up to 10 MB; another upload replaces the previous one. Only locally extracted text is stored, capped to 24,000 characters. It enters the envelope as untrusted `[IDEA REFERENCE]` data immediately before `[IDEA MAP]`, so instructions inside a document are never executable and the map remains the final operational context.
- **ValidationResponse**: psychometric validation data
- **ContentLanguageVersion**: stato di certificazione per (tipo di contenuto, chiave, lingua) — tabella `content_language_versions`. Gli strumenti seguono la scala del protocollo di validazione (`draft → translated → reviewed → pilot → validated`), i tool si fermano a `certified`; i vocabolari stanno in `backend/content_versions.py`. La promozione avanza di un gradino per volta — saltarne uno nasconderebbe un passo del protocollo, per esempio le interviste cognitive prima del pilot — mentre la retrocessione è libera, perché una traduzione trovata sbagliata deve poter tornare in bozza subito. `is_served()` decide se il contenuto arriva all'utente. Per gli **strumenti il cancello è attivo**: `scoring_service._assert_locale_available` solleva `LocaleUnavailable` e le route rispondono `409` con lo stato e le lingue disponibili (diverso dal `404` di uno strumento sconosciuto). Anche i **tool sono fail-closed per lingua**: strategie e letture usano la lingua richiesta solo a `certified`; altrimenti ripiegano esclusivamente su una lingua sorgente certificata (italiano, oppure inglese per le letture). Il pannello mostra e promuove lo stato della lingua selezionata. Lo stato iniziale è dedotto dai dati in `content_versions_seed` per strumenti, strategie, letture e le due famiglie di domande; ogni contenuto riceve sei righe e una promozione esistente non viene sovrascritta. Uno strumento creato dopo l'avvio deriva le sue righe alla prima richiesta; gli altri contenuti le ricevono alla creazione e allo startup. API: `GET /admin/content-versions`, `GET /admin/content-versions/ladders`, `POST /admin/content-versions/{id}/promote`.
- **Testi multilingue (JSON)**: `instruments.name_i18n`, `factors.label_i18n`/`description_i18n`, `questionnaire_items.text_i18n`, `certified_strategies.name_i18n`/`recommended_when_i18n`/`description_i18n` sono JSON `{lingua: testo}`, come già `guided_steps.label_i18n` e `counselors.description_i18n`. Le vecchie colonne `*_it/_en/_es/_sv` **esistono ancora** e sono lette in ripiego da `backend/i18n_fields.py`: la rimozione è un lavoro successivo. Un campo si legge sempre con `i18n_fields.localized(row, campo, lingua)`, che **non ripiega mai su un'altra lingua** — il ripiego è una decisione di prodotto, non di lettura. Le ALTER stanno in `content_versions_seed.ensure_i18n_columns` e non fra le migrazioni di `main.py`, perché `create_all` non altera una tabella esistente e i test devono esercitare la migrazione vera. `instruments.response_labels` (etichette della scala di risposta) è una proprietà dello strumento, viene seminato per le lingue storiche e completato dalla traduzione dello strumento.

### Prompts: code defaults vs DB (important)
Prompts live in **two places** with different roles:

- **Traduzione dei contenuti**: `backend/certified_translation.py` (strategie e letture, sorgente **italiano**) e `backend/instrument_translation.py` (item, fattori, nome ed etichette della scala degli strumenti, sorgente **inglese** — gli originali italiani stanno sul sito esterno). Entrambi prendono il traduttore come parametro, così i test girano senza rete; in produzione è Ollama via `counselor_i18n._ollama_base` / `_model` (config `ollama_ip`, `counselor_translate_model`; il container raggiunge il server come `host.docker.internal:11434`). CLI: `python -m scripts.translate_certified_content --what all` e `python -m scripts.translate_instruments --all --targets fr,de,es`. Entrambi idempotenti: non richiamano il modello per una lingua già presente e non sovrascrivono una traduzione umana senza `--force`. **Una traduzione automatica nasce `translated` e si ferma lì**: `certified` per i tool e `reviewed`/`pilot`/`validated` per gli strumenti restano gesti umani; una risposta parziale del modello resta `draft`. Per gli strumenti una lingua diventa `translated` solo se sono completi nome, etichette dei fattori, scala di risposta e tutti gli item attivi (`refresh_instrument_status`). Il ricalcolo non retrocede mai una lingua che una persona ha portato oltre `translated`.
- **DB = live, editable copy used at runtime.** System prompts and UI texts are rows in the `configs` table (e.g. `prompt_qpcs_analysis`, `prompt_qpcs_summary`); each guided step's instruction is the `prompt` column of `guided_steps` (with `system_prompt_mode`, label, color). The admin panel edits these DB rows.
- **Shared prompt preparation and model routing**: `chat_preparation.prepare_chat_turn` supplies sync chat, streaming chat and prompt audit. `prompt_contract` keeps the current language, question/advice permissions and private IDEA patch structure explicit; QSAr has its own meta-prompts. Final summaries use complete chronological log evidence through `journey_context`, not just rolling memory. `model_context` fits optional theory and history to tested per-model limits without cutting essential evidence or JSON. `AIService` tries the selected counselor target, then `ai_fallback_targets`, anonymizing each external attempt and never changing models after output starts. Paid attempts stop at the recorded monthly budget; this is not an atomic cost reservation. OmniRoute is OpenAI-compatible and uses environment-only credentials. Dry-run does not call retrieval/skills or write memory; exact replay accepts captured context. For protected live-text updates use reviewed `prompt_updates` plans with hash checks and revision history. See `docs/audits/2026-09-05-prompt-coherence.md` for configuration, validation and deployment details.
- **`backend/prompts/*.md` = the factory text itself, one file per prompt.** `prompt_config._text("name")` loads `backend/prompts/name.md` **verbatim** (only the final newline is dropped). Leading/trailing spaces and newlines that glue one block to another stay in Python, next to the concatenation that uses them — the file holds the text and nothing else. Short labels and composed prompts (`A + B`) remain inline in `prompt_config.py`. **The Dockerfile must copy this directory** (`COPY backend/prompts/`), otherwise `prompt_config` fails to import at startup.
- **`backend/prompt_config.py` = defaults + structure (in code, versioned in git).** It provides three things the DB does not:
  1. **Seed values** (`SYSTEM_PROMPT_DEFINITIONS`, `DEFAULT_*_GUIDED_STEPS`, guided texts): copied into the DB **at first startup only if missing** — an already-populated DB is **not** overwritten (`main.py` seeds guided steps `if count == 0`).
  2. **Fallback**: if a config key is missing from the DB at runtime, the code default is used (`SYSTEM_PROMPT_DEFAULTS.get(key, DEFAULT_SYSTEM_PROMPT_GENERIC)` in `chat_logic.py`).
  3. **Wiring not stored in the DB**: which steps exist / their order, and the **mode → config-key** map `MODE_TO_SYSTEM_PROMPT_KEY` (e.g. `"qpcs-analysis" → "prompt_qpcs_analysis"`).

**Runtime resolution order**: DB value (admin-edited) → code default in `prompt_config.py` → generic prompt.

**Editing rule**: to change a prompt, update **both**:
- **code** (`prompt_config.py`) → versioned, covers fresh installs and the fallback;
- **DB** (`configs` / `guided_steps`) → takes effect on the running instance (seed does not touch an existing DB).

Editing only the DB → a fresh install would ship the old text; editing only the code → the running instance is unchanged until the DB is updated. Git versions the code, **not** the DB.

**Prompt history and the protection rule (`backend/prompt_revisions.py`)**

Every prompt write is appended to the `prompt_revisions` table — `scope` (`config` / `guided_step` / `counselor_persona`), `target_key`, `value`, `origin` (`seed` / `migration` / `admin`), author and timestamp. Only prompt keys are versioned; operational settings in `configs` (`active_provider`, PII flags, model names) are not.

This buys two things:

1. **Rollback and audit.** `GET /api/admin/prompt-revisions` lists the history of a prompt; `POST /api/admin/prompt-revisions/{id}/restore` puts an old text back. A restore is itself appended, so the table stays append-only.
2. **Admin edits are never silently overwritten.** The startup migrations recognise the rows to rewrite by looking for phrases inside the text, so a customised prompt that still contains a legacy phrase used to get clobbered on restart. `_seed_and_migrate` now photographs every admin-owned prompt before running the migrations and puts it back after — one choke point, so **migrations added in the future are covered without needing their own guard**.

On the **first startup** after this feature, `reconcile` writes a baseline: a prompt that already differs from its factory default is recorded as `admin` and is protected from then on. A prompt still matching the default is recorded as `seed` and stays open to future automatic updates.

**Consequence for whoever writes a migration**: do not add ad-hoc guards for customised text, and do not assume a rewrite will stick — if the row belongs to an admin, it will be reverted at the end of startup, by design.

**A directive that applies to more than one instrument is written once, not copied into each row.** Put the text in `backend/prompts/<name>.md`, give it a sentinel (`[ANCHOR]`, `[SECOND-LEVEL METHOD]`, `[DEPTH ON REQUEST]`, `[FACTOR INTERPLAY]`), compose it into the code defaults, and append it to the live rows with an idempotent one-off keyed on that sentinel. Hand-copying the sentence into the QSA row and then into the QSAr row is how one instrument quietly keeps an older rule — the second-level closing formula survived months that way. `backend/tests/test_prompt_pair_drift.py` locks the blocks still duplicated across files and fails when the twins drift. When the target row is admin-owned, the live write alone is not enough: pair it with `prompt_revisions.record(..., ORIGIN_ADMIN)`, or the startup restore puts the old text back.

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

Plain collections skip any `graphify-out/` path (`_is_build_artifact`): those are build reports, not domain knowledge, and 59 dated snapshots used to make up 89% of the `counselorbot` corpus. The filter lives in both `_collect_plain_corpus` and `_plain_signature` — they must stay symmetric, otherwise the signature never matches and the index rebuilds on every query. The 46 reference PDFs were replaced by verified Markdown derivatives on 2026-09-19; originals are archived outside the indexed roots. Indexes accept only Markdown; canonical files supersede stale Graphify conversions and raw PDFs are ignored. Guide/framework/questionnaire defaults accept pdf2md-marked derivatives; other existing Markdown still needs explicit admin inclusion. Legacy PDF scope flags, graph paths and citation previews follow the replacement. Collection and signature filters must remain symmetric. MELOGNO_2018 is now readable through local OCR. Migration hashes and limits: `docs/implementazione/rag-markdown-migration-2026-09-19.md`. New RAG PDF uploads are converted to Markdown in an isolated process before publication (local Italian/English OCR on textless scan pages); indexes accept Markdown only, including forced scope. Invalid/password-protected/unreadable PDFs return 422 without publication; existing same-name Markdown returns 409. Conversion dependencies are pinned and OCR language data are bundled in Docker. Upload contract: `docs/implementazione/rag-markdown-upload.md`.

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
| `GET` | `/api/orientation/status` | student | Whether first-use orientation is required, completed or already in progress |
| `POST` | `/api/orientation/sessions` | student | Resume an in-progress Bussola or start a new repeatable session |
| `GET` | `/api/orientation/sessions/{id}` | owner | Reopen one of the student's Bussola sessions |
| `POST` | `/api/orientation/sessions/{id}/message` | owner | Add a turn and receive closed-catalog recommendations |
| `POST` | `/api/orientation/sessions/{id}/complete` | owner | Complete orientation after recommendations |
| `GET` | `/api/qsa/guided-ui-texts?questionnaire_type=QSA&lang=it` | — | Get guided steps + suggested questions for student UI |
| `GET` | `/api/idea/map?session_id=…` | student | Current Idea map + which of the four roles it still lacks |
| `GET` | `/api/idea/map/history?session_id=…` | student | Stages of the map |
| `POST` | `/api/idea/map/patch` | student | Apply a patch by hand (the chat applies its own server-side) |
| `GET` | `/api/idea/map/image?session_id=…&theme=&format=` | student | Draw the map (SVG or PNG) |
| `GET` | `/api/idea/map/pdf?session_id=…` | student | Map, description and stages as PDF |
| `POST` | `/api/idea/map/portfolio` | student | Keep the map as a portfolio work |
| `POST` | `/api/idea/map/notebook` | student | Add one line about the idea to the notebook |
| `GET/POST/DELETE` | `/api/idea/reference` | student | Read metadata, upload/replace, or remove the session's PDF/TXT/MD reference |
| `POST` | `/api/idea/sources/search` | student | Search sources for the branch in hand (group `encyclopedia` or `works`); proposes, saves nothing |
| `GET/POST` | `/api/idea/sources` | student | List the sources kept (optionally for one branch), or keep the ones chosen |
| `DELETE` | `/api/idea/sources/{id}` | student | Drop a kept source and its stored PDF |
| `GET` | `/api/idea/sources/{id}/pdf` | student | The stored open-access PDF of a kept source |
| `POST` | `/api/chat` | student | Non-streaming chat turn |
| `POST` | `/api/chat/stream` | student | SSE streaming chat turn (filesystem route) |
| `POST` | `/api/chat/message` | student | Chat message logging |
| `GET` | `/api/session/{session_id}/recommendations?lang=it` | student | The session's recommendation catalogue and saved choices, using available certified translations |
| `PATCH` | `/api/session/{session_id}/recommendations/{reading\|strategy}/{slug}` | owner | Update `status` and/or `helpful`; returns the catalogue; accepts `lang` |
| `GET` | `/api/session/{session_id}/diagrams` | owner | Latest saved diagram for each source message |
| `POST` | `/api/diagram/from-message` | student | Generate a diagram; optional `session_id` and `source_text` persist it after ownership validation |
| `POST` | `/api/tavolo` | student | Open a working table; seeds from an Idea map (translated) or a chat message (proposed) |
| `GET` | `/api/tavolo` | student | The person's saved tables; drafts are not listed |
| `GET`/`PUT` | `/api/tavolo/{id}` | owner | Read the current revision; write a person's move against `base_index` (`409` if stale) |
| `POST` | `/api/tavolo/{id}/settle` | owner | Accept or discard the model's pending proposals; the only place a proposal becomes content |
| `POST` | `/api/tavolo/{id}/suggest` | owner | Ask the model for moves (`what-is-missing`, `organize`, `connect`, `continue`); they land pending |
| `POST` | `/api/tavolo/{id}/compose` | owner | Compose a whole schema from a prompt in a genre; it lands pending |
| `GET` | `/api/tavolo/capabilities` | student | Check configured AI candidates and disclose fallback origin before asking |
| `PATCH`/`DELETE` | `/api/tavolo/{id}` | owner | Rename or delete the table and its revisions/capture |
| `POST` | `/api/tavolo/{id}/help` | owner | Contextual guidance without writing to the graph |
| `GET` | `/api/tavolo/presets` | student | The five genres: admitted verbs, forms, layout direction, example prompts |
| `GET` | `/api/tavolo/presets/{id}/example` | student | The worked example graph of a genre, in the asked language |
| `GET` | `/api/diagram-icons[/{id}.svg]` | any | The semantic icon catalogue and one icon as SVG |
| `GET` | `/api/tavolo-images` | any | The image catalogue of the table: id, name, usage per image |
| `GET` | `/api/tavolo-images/{id}/file` | any | One catalogue image as its stored file; unknown id is `404` |
| `POST` | `/api/admin/tavolo-images` | admin | Bulk upload: N images plus one CSV file (name and usage per row); unlisted images are accepted with the file name and empty usage |
| `GET`/`PATCH`/`DELETE` | `/api/admin/tavolo-images/{id}` | admin | List, complete name/usage, or remove the image and its file |
| `POST` | `/api/tavolo/{id}/save` | owner | Name the table, detach it from the session, store its textual rendition |
| `POST`/`GET` | `/api/tavolo/{id}/capture[.png]` | owner | Upload/read the browser capture taken at save time |
| `POST` | `/api/tts` | student | Text-to-speech |
| `GET` | `/api/tts/voices?engine=edge\|piper` | all | Available voices |
| `POST` | `/api/tts/stream` | all | Progressive reading with pronunciation corrections |

### Surveys & Scoring
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/survey` | student | Submit survey response |
| `POST` | `/api/questionnaire-result` | student | Submit scored questionnaire result → triggers guided chat |
| `POST` | `/api/instruments/{code}/score` | student | Score a single instrument's responses |
| `GET` | `/api/instruments/{code}/rules` | student | Get instrument scoring rules + factor definitions |
| `GET` | `/api/user/questionnaire-results` | student | List own questionnaire results |
| `GET` | `/api/questionnaire-result/{session_id}/pdf?lang=it&mode=full` | owner | Download brief/full report; `X-Summary-Status` reports summary availability |
| `GET` | `/api/user/questionnaire-result/{session_id}/summary?lang=it` | owner | Canonical summary and status; `regenerate=true` explicitly refreshes it |
| `GET` | `/api/questionnaire-result/{session_id}/conversation` | student | Get full conversation for a session |
| `POST` | `/api/strategy-feedback` | student | Submit feedback on a recommended strategy |
| `GET` | `/api/user/certified-strategies` | student | List certified strategies |

### Readings, milestones and goal path (the retired booklet's successors)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/user/readings?session_id=…` | student | «La mia lettura» of a result (null if none) |
| `PUT` | `/api/user/readings/{session_id}` | student | Create/update the reading |
| `POST` | `/api/user/timeline/milestones` | student | Save a past milestone from the event chat (idempotent per `request_id`) |
| `GET` | `/api/user/goals/{goal_id}/pdf?lang=` | student | «Percorso dell'obiettivo» PDF |
| any | `/api/user/student-booklets/*` | — | 410 Gone |

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
| `POST` | `/api/admin/rag/docs` | admin | Upload Markdown or convert PDF to Markdown, then reindex |
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
| `GET` | `/api/admin/prompt-revisions` | Prompt history (`scope`, `target_key`, `limit`), newest first |
| `POST` | `/api/admin/prompt-revisions/{id}/restore` | Restore a prompt to an earlier revision |

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
| `GET/POST/PUT/DELETE` | `/api/admin/certified-readings` | Reading catalog (books, films, articles) |
| `POST` | `/api/admin/certified-readings/{id}/verify` | Bibliographic check on OpenAlex |
| `POST` | `/api/admin/certified-readings/{id}/synopsis-draft` | Synopsis draft from public sources (proposes, does not save) |
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
    survey.py               Questionnaire submission, scoring, PDF (booklet routes answer 410)
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
  certified_reading_service.py   Reading catalog retrieval for a chat turn
  reading_frame.py          Six-language frame of the reading block (labels, directives)
  web_lookup.py             Whitelisted public sources (Wikipedia, Treccani, Open Library, OpenAlex)
  idea_sources.py           Sources kept per Idea branch (search, keep, open-access PDF)
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
  pii.py                    PII redaction for conversation logs (and for outgoing lookup queries)
  pdf_generator.py          Multi-language PDFs: results, goal path, Idea map
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
  src/app/globals.css       Design tokens, utilities, dark-mode remap (see docs/design.md)
  src/components/ui/        Shared primitives (Button, Card, Callout, PageHeader, CompassMark)
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
  backfill_reading_synopsis.py  Fill missing reading synopses from public sources
Makefile                    Prompt testing shortcuts
```

## Conventions
- **Configuration is DB-driven except secrets**: prompts and UI texts are DB rows seeded from `prompt_config.py` at startup (idempotent, no overwrite). API keys come only from the environment managed by ai4educ Console; ConfigForm displays and verifies them but cannot edit them.
- **Error contract**: AI failures raise `AIError`. SSE emits `{error}` event. Non-streaming maps `AIError` → HTTP 502. Frontend consumer throws on `{error}`.
- **Interrupted responses**: streaming endpoints emit session/conversation IDs before text; `done` is required for completion. `ChatContinuation` keeps the visible text and resumes on its own after transport/provider interruption: up to 3 automatic continuations, 400 ms apart, and only then a localized Continue action as manual fallback. The optional `partial_response` request field (max 60,000 characters) asks guided/site/OpenCode chat to generate only the missing suffix; the server returns and logs the combined answer. Guided phase advancement and final metadata wait for `done`. This detects interrupted streams, not semantically unfinished prose in an otherwise successful response. `npm run test:recovery` uses API fixtures against `RECOVERY_BASE_URL` (default localhost:3101).
- **Resume loading**: failed frozen-session requests retain the current list and expose Retry in the home and desktop/mobile navigation. Header loading starts after authentication. Conversation and summary details in `/profilo` load only in the compilations section.
- **Student-facing sanitization**: QSA codes expanded to `Code (Name)`. ZTPI labels stripped. Inverted QSA factors must stay aligned with `questionnaires.ts`.
- **i18n**: admin strings in `i18n-admin.ts` (IT + EN blocks). Add new keys to both.
- **Tests**: dedicated `counselorbot_test` Postgres DB (never SQLite). Override `get_db`/auth, mock `AIService`. Plain-runnable and pytest-compatible.
- **Artifact regression checks**: `cd frontend && npm run test:artifacts` exercises diagrams at 320/390/1440 px, recommendation updates/retry and summary downloads against the running app with mocked API fixtures (`ARTIFACTS_BASE_URL` overrides localhost:3000). Backend coverage is in `test_message_diagrams.py`, `test_recommendation_blocks.py`, `test_recommendation_state.py`, `test_pdf_summary.py` and the existing smoke/diagram suites; database fixtures use a rolled-back schema inside `counselorbot_test`.
- **Startup seeding**: idempotent. Raw-SQL column migrations must be idempotent.
- **Visual identity**: `docs/design.md` is the source of truth; the tokens live in `frontend/src/app/globals.css`. The brand colour is a petrol teal exposed through the **remapped `indigo-*` scale** — use `indigo-*` utilities, never a petrol hex at the call site. `ochre-*` means movement (active step, start), `amber` means warning; they are not interchangeable. `slate` is the only neutral scale. Dark mode is a **central remap** at the bottom of `globals.css`, not `dark:` at call sites: a colour utility with no entry there stays light on dark. Prefer the primitives in `src/components/ui/`. The same identity is restated outside the web app in `backend/pdf_generator.py` (`APP_*`), `backend/diagram_render.py` (`PALETTE`) and the printed QR sheets built inline in the admin panels — those change together.
- **Backend Dockerfile**: copies explicit paths (`COPY backend/routes/`, `COPY backend/tests/`), not the whole tree. Missing COPY → `ModuleNotFoundError` after rebuild.
- **Workflow rami, PR e Release per sviluppatore singolo**: sviluppare sempre su un branch dedicato (`feature/...`, `fix/...`, `docs/...`). A fine lavoro/sessione: validare il codice (`make guidance-check`), aggiornare `HANDOFF.md`, pushare il branch e creare la Pull Request con descrizione chiara (usando `.github/pull_request_template.md`). L'utente revisiona e unisce la PR direttamente da GitHub App (mobile/web). Al merge su `main`, la GitHub Action (`release-drafter`) aggiorna automaticamente le Release Notes categorizzate (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`) per mantenere leggibile la timeline del progetto.

## Notes
- `GEMINI.md` describes a separate "3-layer agent" philosophy for agent workflows — not the app's runtime architecture
- `EVENTO_STUDIO`/`EVENTO_PROFESSIONALE` summaries are saved as past milestones in the timeline (no dimensions); the private ```booklet block keeps its name
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
