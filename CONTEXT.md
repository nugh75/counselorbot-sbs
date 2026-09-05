# CONTEXT — Counselorbot SBS

<!-- ai4educ:context-template v1.0 -->

## Quick Reference
- **Stack**: Python (FastAPI), Next.js App Router, PostgreSQL, Docker Compose
- **Entry point**: `docker compose up -d --build` or `uvicorn backend.main:app --reload --port 8000` + `cd frontend && npm run dev`
- **Test**: `docker exec counselorbot_backend python -m backend.tests.test_smoke`
- **Repo**: (github)
- **Visual identity**: `docs/design.md` — read it before changing layout, colour, typography, or any UI component

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
| IDEA | Free chat that brings one idea into focus, building a cumulative map (no questionnaire, no scores) | — |

### Glossary (student-facing terminology — use consistently)
- **Profilo (profile)**: the outcome of a questionnaire from the Competenze Strategiche site — a set of factor scores (`QuestionnaireResult`). "Profilo" refers ONLY to this.
- **Taccuino (notebook)**: the student's self-declared notes about themselves — the open learner model (`LearnerProfileRevision`, `/user/learner-profile` API). Internal identifiers keep the `learner_profile` name; UI must say taccuino/notebook.
- **Libretto (booklet)**: per-instrument reflection on a dimension (`StudentBooklet`).
- **Portfolio**: collection of the student's works (`PortfolioItem`).
- **Idea**: the free-chat instrument that brings a still-shapeless idea into focus (code `IDEA`), including study/career choices, free ideas, research/teaching work, and the exploration of a concept or construct. Same name in every language except FR *Idée*, DE *Idee*, SV *Idé*.
- **Mappa (map)**: the artefact an Idea session produces (`IdeaMapRevision`) — one per session, growing every turn. EN map, ES mapa, FR carte, DE Karte, SV karta. It is none of profilo/taccuino/libretto/portfolio, though a finished map can become a portfolio work.
- **Gruppo/Classe (group/class)**: a teacher's autonomous class (`StudentGroup`), independent of questionnaires. Students join via invite code `GR-XXXXXX` (web `/gruppo?g=CODE`, class code from personal area, or Telegram deep link) → `GroupMembership`. Shared with co-teachers via `GroupShare`. An `AdministrationPlan` can attach a group (`group_id`) to tag results. Teacher notes/messages (`TeacherNote`) live on the group.
- Per-language pairs (taccuino / libretto): IT taccuino/libretto, EN notebook/booklet, ES cuaderno/cuadernillo, FR carnet/livret, DE Notizbuch/Arbeitsheft, SV anteckningsbok/arbetshäfte. The personal page (`/profilo` route) is labelled "Area personale" (personal area); role-preview identities are "account di prova" (test accounts), not "profili".

### Core Concepts
- **Bussola (orientation compass)**: repeatable, student-owned orientation chat at `/bussola`. New students complete it before opening ordinary tools; existing users with prior activity are not blocked, and frozen/resumed sessions bypass the gate. It recommends only IDs from the shared tool catalog, stores its own conversation in `OrientationSession`, and never creates scores or questionnaire results. Bringing a disoriented student into focus is the Compass's own job, not IDEA's: with no readable intent it asks which area matters instead of routing, `_rank_tools` returns no fallback trio, and IDEA is recommended only when the student names a concrete idea, decision or project. The recommendation panel summarises the session, not the last turn: `_merged_recommendations` puts the new proposals on top of the ones already there, deduplicated by tool id and capped at three, so a turn with no recommendation leaves the previous ones in place and the instrument a student just decided to start with does not vanish the moment the next turn names others. Talking about a tool proposes it: a tool question stays informational but now carries that tool as a recommendation, since the reply ends by offering to start it. When the model answers in prose instead of JSON, the tools are read out of the reply itself (`_tools_named_in`, whole words and case-sensitive, so Italian "idea" never triggers IDEA and QSAr is not QSA) and only then from `_rank_tools` on the student's words, which finds nothing in a typo like "Qss". Saying "I have already filled it in" is not a reason to route elsewhere: having the results is what opens that instrument's guided chat, and the prompt says so, and forbids asking the student to paste scores into the Compass, which receives none. The canned platform overview and per-tool explanations are material, not answers: `_canonical_reference` injects the exact text into the system prompt and the model writes the turn, because a short-circuited reply cannot see the history and reprinted the whole catalog to a student who had just read it. They stay the offline fallback, where `_fallback_without_repetition` swaps the overview for the area question if the history already carries it. It explains a tool from `orientation_tool_briefs`, one English text per catalog id seeded from `tool_brief_seed.py` and editable in the admin panel — the seed only fills gaps and never overwrites an edited row. Each brief answers four fixed headings (what it looks at, what you get, when it is the right moment, what it does not do), and the injected block adds the instrument's factors from the catalog, marking the reverse-scored ones so a high score is not explained as a resource. Only the tools in play get the full text — at most two, picked from the tool question, the local ranker and what the previous turn named — because nine full briefs would double the prompt; the rest keep the one-line catalog entry. The briefs are instructions for the model, not text shown to the student, so they are written in English instead of translated six times. It reads what the student has already done and only advises: `student_context` injects the instruments already completed with their dates, the frozen sessions that can be resumed, the Taccuino and the Portfolio, ordered by routing value under one 2000-character cap that truncates from the bottom, so the instrument list survives a long Portfolio. Scores never enter it — the Compass produces none and interprets none, so it gets the fact and the date, not the numbers — and neither does the Libretto, whose per-factor reflections the routing does not use. `LEARNER_PROFILE_LABELS` lives there too, so the notebook's field list has one home and `chat_logic` imports it. It never writes into the Taccuino, the Libretto or the Portfolio. The Taccuino frames the conversation instead — the student reviews it (`LearnerProfileCard variant="review"`) after choosing the counselor and before the first message, and edits it again (`variant="update"`) once the session is completed. A completed Bussola remains reopenable; the Libretto is edited from `/profilo`, not from here.
- **Guided path**: ordered `GuidedStep` rows per `questionnaire_type`. Each step has a `prompt` and `system_prompt_mode`. Steps are database-driven, seeded at startup from `prompt_config.py`.
- **Suggested questions**: `GuidedStepQuestion` rows linked to steps, shown as clickable suggestions in the student chat UI. Defaults in `guided_step_questions_seed.py`.
- **Skills engine**: `backend/skills/` selects and renders the skills bound to the current step. A deterministic, high-precision intent classifier activates at most one `primary` behaviour per turn: certified advice (`certified-advice`), conceptual clarification (`profile-wayfinder`), identifiable reading suggestions (`reading-guide`), comparison of the same student's persisted profiles (`profile-comparison`), or a factual lookup on public sources (`web-lookup`). `always`/`support` skills may coexist; legacy `optional` candidates still use the LLM router above `skills_router_threshold`, with deterministic fallback. Skills take the shared budget (`skills_total_max_chars`, 4500) in order of rank — structural (`always`/`support`), then `primary`, then everything else — and only then by `sort_order`. Rank was missing until an optional illustration (`concept-diagram`, 1977 chars, sort 35) starved the primary answer material (`certified-advice`, sort 50): the knowledge block was dropped with no error and no log. A block that does not fit disappears silently, so growing a contract past its cap or the budget is a real failure mode — `test_skills_budget.py` and the contract-length test in `test_idea_map.py` guard it. Behavioural instructions are appended in `directive_tail`, while handlers put certified sources, the citable reading whitelist and structured comparison data in `knowledge`. RAG retrieval runs *before* the engine so `reading-guide` can only offer sources actually retrieved in the turn (`reading_sources` handler); `profile-comparison` receives the last two compilations of each instrument, so the same questionnaire can be compared over time. Instructions are translated in all six languages (no English placeholder). The five primary skills are bound to all seven supported instruments; `approved-strategies` is retained but inactive and unbound. `web-lookup` is the only one that leaves the machine: it fires on a circumscribed factual question — about a work, a person or a term ("cos'e' la metacognizione", "chi era Vygotskij", "di cosa parla Mindset") in all six languages — and answers from the encyclopedias instead of from memory. It is on by default (`web_lookup_enabled`, revocable from the admin panel). A question about the student's own profile never reaches it: factor codes and the words profile/score/result/notebook negate the `factual` intent, which keeps those turns with `profile-wayfinder`. It never recommends a work outside the certified catalog. Which steps may deliver practical advice is decided upstream by `_ADVICE_PROMPT_MODES` in `chat_logic.py`: free chat, the QSA/QSAr second-level steps and the final synthesis step of QPCS, QPCC, QAP and SAVICKAS. Analysis, factor and interview steps stay interpretive and retrieve no certified strategy, and `_NO_NEW_ADVICE_STEP_IDS` keeps the QSA/QSAr synthesis from introducing new ones. The step prompts themselves were aligned to that directive: the QSA/QSAr second-level steps and the QPCS/QPCC/QAP/ZTPI summaries now ask for ONE practical action, not two or three. One exception: when a student's free message inside a step is classified as an advice request (`is_advice_follow_up`), one certified strategy is delivered even on an interpretive step, so the answer stays traceable to the catalog instead of being improvised. The per-step admin configuration and the synthesis veto both still win over that exception. Turning off the global engine flag restores the historic retrieval path in `chat_logic._retrieved_context`.
- **Session**: a chat session tied to a `QuestionnaireResult`. Has rolling Markdown conversational memory on disk.
- **Conversation artifacts**: manual message diagrams are saved as `Log(action="message_diagram")` revisions, keyed by the original message hash; redacted source text links them to the PDF transcript. Opening a resumed session restores its latest diagrams, and generation failures preserve the last valid revision. The mobile toolbar wraps and includes render retry.
- **Diagram reading and interaction**: `DiagramBlock` keeps overview, readable text scale, full-screen camera, selection and guided reading separate from the saved spec. `DiagramViewport` preserves the SVG DOM through resize, supports node selection by touch/keyboard and highlights both endpoints of adjacent edges; future steps remain hidden and outside keyboard navigation. Reading mode starts at a scale where the smallest SVG labels are 15 CSS pixels; manual zoom remains available. Fullscreen supports drag/pinch and retains the view on return. The textual representation is always available, and SVG/PNG exports use the complete spec through the existing render endpoint. Motion is off by default; optional short transitions and explicitly started playback respect both system and in-app reduced-motion settings. Captions describe existing edges without another AI request. Graphviz fixtures in `frontend/tests/fixtures/` exercise real geometry in both themes; the browser suite also covers selection, text size, focus, playback and touch gestures.
- **Visual conversation tools**: the `VisualTools` workspace opens beside the guided chat and in the graphical OpenCode chat. It contains the student's action board (`todo` / `doing` / `done`), up to three comparison alternatives with six student-defined criteria, and reflection cards (`unsorted` / `yes` / `explore` / `no`). Existing recommendations may seed editable entries, but workspace changes never alter recommendation certification or state. `GET/PUT /session/{session_id}/visual-tools` stores validated, PII-redacted revisions in `Log(action="visual_workspace")`; ownership is checked and a revision mismatch returns 409 without overwriting work. Writes use a per-session transaction lock; no schema migration. The UI retains a failed draft, supports undo and draft text export, and requires explicit saving. “Discuss in chat” saves and fills the composer without sending or changing hidden prompts. Saved work can be exported through `/session/{session_id}/visual-tools/pdf` and appears in both final session PDF modes; the conversation summary continues to summarize the conversation. Six-language UI, keyboard-operable sorting and responsive layouts require no new animation or drag library. See `docs/plans/visual-conversation-tools.md` for scope and concurrent-agent boundaries.
- **Reading and strategy choices**: retrieved catalogue entries are candidates. A private `recommendations` block declares the IDs actually proposed in the visible reply; only IDs from that turn's certified candidates are accepted. Missing or malformed blocks add nothing, and the block is hidden from streaming, logs and exports. `RecommendationHistory.payload` stores `status` (`proposed`, `selected`, `tried`, `dismissed`) and optional `helpful`; refreshes preserve these choices, and historical rows default to `proposed` without rewriting history. The panel supports synopsis, links, per-item feedback, archive/restore and an explicit composer handoff. Selected/tried items and explicitly reopened titles return to chat context without widening retrieval limits. No schema migration is needed.
- **Final session report**: the personal-area preview and PDF use the same canonical summary, cached by conversation content, scores, recommendation choices and language. A current final-step summary can be reused in its original language; otherwise generation processes the entire transcript in bounded chunks, preserving later decisions. Failures return `status="unavailable"` and are not cached. The report starts with the summary and recommendations; `mode=brief` includes these plus diagrams, while the default `mode=full` also includes scores and the transcript. Both formats require session ownership (or admin access). Long text cards paginate and book URLs are clickable.
- **Frozen session**: a guided-chat session freezes itself. `GuidedChatInterface` and `OpenCodeExperience` write a snapshot ~1.5s after each finished turn (`lib/auto-freeze.ts` holds the guards: a session with only the intro message, one still streaming, or one already completed is never written) and flush a pending one on unmount and on `pagehide`, so leaving the tool by any route — back button, header link, closed tab — keeps the session. The "Congela sessione" button in `GuidedChatInterface` does the same and closes the chat on top; the snapshot (step, scores, transcript) is stored in the `frozen_sessions` table keyed to the caller's `username` (`POST /session/freeze`). It's resumed from any device via the header's frozen-session icon (dropdown when several are frozen) or the `/?frozen=<session_id>` URL, which restores the snapshot into the guided chat or into the OpenCode sandbox, following the snapshot's `experience`. The snapshot is deleted (`DELETE /session/frozen/{session_id}`) once the guided path completes, so it can't be resumed into a finished session. Known limitation: the transcript comes back in full, but the model's own session memory has a 2-hour TTL and the snapshot doesn't carry `conversation_id`, so a session resumed much later returns "cold" — the student sees the history, the assistant may not remember it, and previously suggested strategies can repeat.
- **pQBL resume**: the pQBL activity keeps its own progress in `localStorage` (`lib/pqbl-progress.ts`) and restores it on entry; `hasPqblProgress` also lists it among the header's "Riprendi" entries (link to `/pqbl`), so it isn't the one tool whose interrupted session is invisible. It is per-browser, not cross-device like a frozen session.
- **Student-facing chat** vs **Admin panel**: two sides of the same app. Admin edits prompts, guided steps and counselors; API keys are read-only here and are managed centrally in ai4educ Console → Secrets.
- **Cross-synthesis**: on-demand synthesis across a student's multiple instrument results (`cross_synthesis.py`, `/user/cross-synthesis`).
- **Telegram bot**: students can link their account (`TelegramAccountLink`) and interact with guided chat over Telegram; group/plan deep links auto-enroll into a class. State machine in `telegram_state.py`, API in `telegram_bot.py`.

### User Roles
Roles are derived from ai4auth groups (marker-based, see `backend/auth.py`), not stored per-user.
- **Student**: fills out questionnaires, interacts with guided chat, can view own learner profile/taccuino, portfolio, groups
- **Counselor scope**: `counselors.questionnaire_types` decides which instruments a counselor may serve, and it is finally read (`backend/counselor_scope.py`). Empty still means "all" — except on **invite-only instruments** (config `counselor_restricted_instruments`, default `["IDEA"]`), where empty means "none" and only a counselor naming the code qualifies. That inversion exists so excluding everyone from one instrument does not require writing the other seven on every counselor, and re-writing them all whenever an instrument is added. `GET /counselors?questionnaire_type=X` marks each row `suitable` and sorts the fit ones first; unsuitable ones are still returned, because the selector uses them to say why the current pick does not work and which ones do. Idea is invite-only because it needs a reasoning model: it must emit a structured block every turn, and a no-reasoning model silently skips the turn — Clio and Giulio (qwen3.8 reasoning) are in, Iride (qwen3.8 without reasoning) is not.
- **Counselor**: an AI persona (`Counselor` model) selectable in chat — a prompt profile, not a login role
- **Teacher / Docente** (`is_teacher`, group markers `docent/insegnant/teacher/educator/professor/faculty/staff`): owns classes/groups and administration plans, sees own students' results and conversations, writes notes/messages (`/docente` dashboard)
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
the booklet lists; an agent-led one does not. `test_smoke.test_every_gate_that_would_silently_exclude_idea_lets_it_through`
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
- **CertifiedReading**: catalogo di letture, film, articoli e video approvati dall'admin (`certified_readings`), gemello di `CertifiedStrategy` ma agganciato a un TEMA del vocabolario chiuso in `reading_themes.py`, non a un codice fattore: un romanzo non mappa su un costrutto. I codici fattore restano un canale secondario. Testi in un unico campo JSON per lingua (sei lingue) invece di una colonna per lingua. Le voci nascono `draft` e arrivano allo studente solo da `certified`; `reading_verification.py` controlla titolo, anno e autori su OpenAlex e per film e narrativa dichiara che una fonte automatica non esiste. Il materiale marcato sensibile richiede due condizioni: la config `readings_allow_sensitive` accesa e il tema nominato dallo studente, e porta sempre l'avvertenza. La fascia di pubblico dello studente non viene chiesta apposta: `reading_audience.py` la ricava dall'`age` e dai campi scolastici gia' presenti nel taccuino, e in assenza di quelli dal `school_level` della classe o del piano di somministrazione; fra segnali discordanti vince il piu' protettivo. Fascia ignota: nessun filtro, ma la direttiva impone al modello di chiedere a che punto degli studi si trova prima di proporre. Ogni voce puo' portare una **sinossi** (`synopsis_i18n`, di cosa parla l'opera) distinta da `summary_i18n` (cosa aiuta a capire) e da `why_i18n` (perche' e' pertinente): la sinossi viaggia sempre con la sua provenienza in `synopsis_source` (fonte, URL, data, licenza), e senza URL la voce non puo' essere certificata. La bozza si recupera dal pannello (`POST /admin/certified-readings/{id}/synopsis-draft`, non salva: propone) o in blocco con `scripts/backfill_reading_synopsis.py`; l'approvazione resta un gesto dell'admin. In chat la sinossi entra cappata a 220 caratteri. La cornice del blocco consegnato al modello — direttiva d'uso, etichette, richiesta della fascia, dichiarazione di assenza — vive in `reading_frame.py` nelle sei lingue e segue la lingua del turno; il tag `[CERTIFIED_READINGS]` resta un marcatore e non si traduce, e una lingua non prevista ricade sull'inglese. Restano invece in inglese le istruzioni comportamentali delle skill, che sono un contratto unico. Servizio `certified_reading_service.py`, seed `certified_reading_seed.py`, API `/admin/certified-readings`, consegnato in chat dall'handler `reading_sources` insieme alla whitelist RAG.
- **RecommendationHistory**: il catalogo di quel che la chat ha gia' consigliato (`recommendation_history`, servizio `backend/recommendation_service.py`). Una riga per `(username, session_id, recommendation_type, slug)`: `username` sta nella chiave perche' due studenti possono portare lo stesso `session_id` e la sidebar dell'uno non deve mostrare le letture dell'altro. Nasce da un problema di forma, non di contenuto: una lettura nominata in prosa scorre via col resto della conversazione e non si ritrova piu', e lo skills engine, che il catalogo lo rinietta a ogni turno, la riproponeva. Le raccomandazioni escono percio' dalla prosa e diventano dati: a fine turno le route `/chat`, `/chat/stream` registrano gli slug del turno (`reading-guide` per le letture, `certified-advice` per le strategie) con il `payload` gia' pronto per il render, e il turno dopo `_retrieved_context` rilegge quegli slug e li passa come `excluded_reading_ids` / `excluded_strategy_ids`, cosi' il modello riceve solo materiale nuovo. Le direttive dicono al modello di non ripetere titoli e nomi (`reading_frame.py`, `_SIDEBAR_INSTRUCTION` in `certified_strategy_service.py`): in chat restano le implicazioni, nel pannello i titoli. Il log non si cancella mai a fine sessione — una sessione congelata deve riaprirsi con la stessa sidebar — e si rilegge da `GET /api/session/{id}/recommendations`. Lato studente e' il `RecommendationsPanel` (tab Letture/Film e Strategie) accanto ai punteggi.
- **IdeaSource**: le fonti esterne che lo studente ha deciso di tenere per un RAMO dell'idea (`idea_sources`, servizio `backend/idea_sources.py`, config `idea_sources_enabled`). Il gesto e' esplicito: nessuna ricerca parte da sola a ogni turno — si cerca dal pannello del ramo, si guardano i risultati, e viene salvato solo quel che si sceglie. Due gruppi, perche' sono due domande diverse: `encyclopedia` (Wikipedia, Treccani, via `cached_lookup` col controllo sul titolo, che li' serve ancora) e `works` (OpenAlex, Europe PMC, via `web_lookup.search_works`). La ricerca tematica NON e' la ricerca per entita': `lookup` pretende che il titolo trovato ricalchi la domanda — giusto per "di cosa parla Mindset", fatale per "dispersione scolastica nella secondaria", dove nessun titolo la ricalca — quindi `search_works` quel controllo non ce l'ha e usa invece i filtri della fonte (anno, lingua, accesso aperto) e il suo ordine di pertinenza, deduplicando per DOI fra le due fonti. Il ramo e' la chiave: `context_for` inietta in `[IDEA SOURCES]` solo le fonti del ramo a fuoco (6 voci, abstract a 300 caratteri), perche' le letture di un altro ramo non c'entrano con il lavoro in corso; il PDF di conclusione le riporta tutte. **Il PDF ad accesso aperto e' l'unica cosa che esce dalla whitelist chiusa di `web_lookup`**: sta sull'editore o sul repository indicato dalla fonte, e quell'host cambia a ogni lavoro. Percio' il download ha regole sue e non si fida della provenienza: solo `https`, nessun indirizzo di rete interna (l'URL arriva dal client e non deve poter diventare una richiesta verso l'interno), `Content-Type: application/pdf`, magic number `%PDF`, tetto di 15 MB, timeout 20s, e i file finiscono in `IDEA_SOURCES_STORAGE_DIR` (default `/app/uploads/idea-sources`). Quote: 10 ricerche per sessione (contatore di processo, cortesia verso le fonti) e 10 PDF per sessione (contati sulle righe salvate, perche' e' spazio su disco).
- **WebLookupCache**: memoria delle consultazioni esterne (`web_lookup_cache`, TTL 30 giorni), cosi' la stessa sinossi non ricompra la stessa pagina. Client in `backend/web_lookup.py`: whitelist chiusa di fonti (Wikipedia, Treccani — enciclopedia e vocabolario, Open Library, Google Books, OpenAlex, Europe PMC — che copre gli abstract che OpenAlex non puo' ridistribuire), URL ricontrollato contro i domini ammessi, query ripulita dalle PII anche a redazione dei log spenta e ridotta all'entita' cercata (l'apertura interrogativa viene tolta: "cos'e' la metacognizione?" esce come "metacognizione"), titolo trovato validato: contro il titolo atteso per una sinossi (scarta la pagina dell'autore e l'omonimo che allunga il titolo), contro la domanda stessa per una ricerca libera, con tolleranza morfologica ("procrastinare" trova "Procrastinazione") — senza quel secondo controllo una redirezione dell'enciclopedia diventa una risposta sicura di se' e sbagliata ("Mindset" rispondeva "The Witch"). Piu' il controllo del medium: un film omonimo non diventa la sinossi di un saggio. La chiave di cache porta una versione, cosi' una regola corretta non lascia in memoria per trenta giorni le risposte accettate da quella vecchia. Google Books richiede `GOOGLE_BOOKS_API_KEY`: senza chiave la fonte viene saltata. Una voce con DOI si risolve, non si cerca per titolo; un film viene ritentato col qualificatore dell'enciclopedia ("Lady Bird (film)", "Inside Out (film 2015)") perche' il titolo nudo finisce sull'omonimo o sul seguito. Il testo viene ripulito dal rumore di catalogo (grassetti, note `[2]`, riga di attribuzione) e archiviato sotto la lingua in cui la fonte ha risposto, non sotto quella richiesta: Open Library risponde nella lingua dell'edizione. CLI: `python -m backend.web_lookup "<query>" --source wikipedia --lang it`.
- **Skill / GuidedStepSkill**: declarative skills injected into the chat prompt (conditions, multilingual instructions, optional Python handler) and their binding to instrument/step (`step_id = "*"` = every step). Engine in `backend/skills/`, intent rules in `backend/skills/intents.py`, seed and one-time rollout policies in `backend/skills_seed.py` (`skills_certified_advice_policy_v1`, `skills_specialized_behaviors_v1`, `skills_reading_sources_and_i18n_v1` — each applied once, never overwriting admin edits), API `/admin/skills`. The admin preview exposes the detected intent. Enabled by default for QSA, QSAr, ZTPI, QPCS, QPCC, QAP and SAVICKAS; the admin can still disable the global flag as a rollback.
- **PqblDocument / PqblQuestion / PqblSession / PqblAttempt**: PQBL (Problem/Question-Based Learning) — uploaded PDFs, generated MCQs, student sessions, answer attempts
- **IdeaMapRevision**: the map of an Idea session, append-only. The newest row per `session_id` is the current map, earlier ones are the history of the thinking. The model never rewrites the map: it emits a patch (`add_nodes`/`add_edges`/`update`/`remove`) in a fenced ```idea block, `backend/idea_map.py` merges it and writes a new revision, and the block is stripped from the reply before it reaches the student, the transcript or the session memory. A node carries a `role` from a closed vocabulary (idea, assumption, evidence, alternative, implication, open-question, constraint, step) which decides its icon and is spoken in the textual description; an idea counts as focused when idea + assumption + open-question + step are all on the map. Drawn as the `mindmap` diagram type (Graphviz `twopi`, ceiling 24 nodes / 30 edges instead of the 8/12 of an in-chat illustration). The current map is injected into the envelope as `[IDEA MAP]`, last system block before the directive tail: without it the skill instructs the model about a map the prompt never shows, and no patch is ever sent. RAG is muted for IDEA (`knowledge_enabled` in `_retrieved_context`) — the competenzestrategiche guide has nothing to do with an idea and was crowding out the map. The path is not a sequence: `next_move` derives the next step from what the branch in hand lacks (a required role) or carries (a flaw), so `/idea/next-step` drives navigation and IDEA has no `[[AVANZA_STEP]]` and no stepper. Work that emerges mid-conversation opens a `task` node with its own `task_type` from eleven types in five families, including `concept-exploration`, its own required roles (`TASK_PROFILES`) and its own close: the server detects readiness, the model makes the case, the person confirms, to a depth of two below which a task is demoted to a step. Nodes carry `status` (drawn as fill intensity) and `flaw`; `orphaned` and `unsupported` are computed server-side and cannot be overridden by the model. `idea_lexicon.py` renders statuses and flaws in two registers (research/plain) x six languages — the model always gets the canonical English token, the person never does. Navigation is the map, not a stepper: `GET /idea/branches` returns the tree of work nodes with what each still lacks, and `POST /idea/focus` moves the work to another branch, writing a revision with `focus_id` so the choice survives the next turn (append-only covers navigation too, and the history shows where the thinking went). A chosen branch beats the derived focus while it still exists; a closed one stays reachable, since rereading or reopening it is legitimate. In the UI the map and the branch tree sit BELOW the chat in a collapsible workspace rather than inside the message flow, where they drifted away with every turn. Length is set by the person, in exchanges rather than minutes, since minutes are not something the app can honour: `idea_budget` on the request (8/16/30, or 0 for as long as it takes) becomes a PACE line at the head of `[IDEA MAP]`. It changes the pace, never truncates — a short session asks one thing per turn and opens a branch only if the idea cannot be settled without it; the last quarter stops opening new ground, because a branch left open at the end is worse than one never opened; a spent budget proposes closing and says the person may carry on. Turns are counted from the logged exchanges, not from map revisions: a turn that produced no patch is still time spent. Every branch and the final session read-back end with an explicit ordered plan for producing or developing the idea; unresolved questions become verification actions instead of invented certainty. A closed branch is not a finished one: `POST /idea/reopen` reopens it and moves the work back to it, keeping its conclusion (deleting it would lose what the branch had settled before the change of mind), and coming back to a closed branch makes the model ask what changed. A session ends by asking, not by saving: when every branch is closed the model reads the map back and asks where it should be kept, and `POST /idea/conclude` performs the chosen destinations in one call (notebook, portfolio, both or neither — keeping nothing is a valid answer), one failing destination not stopping the others. The keep buttons left the map panel for that dialog: a session that ends with no question leaves the map in a table nobody finds again. Behind config `feature_idea_focus`. The skill `idea-focus` carries the patch contract and binds to IDEA alone — `concept-diagram` forbids replacing prose with a drawing, the opposite of what Idea does, so the two must never share a prompt.
- **IdeaReference**: one private reference per Idea session. PDF, UTF-8 TXT and Markdown are accepted up to 10 MB; another upload replaces the previous one. Only locally extracted text is stored, capped to 24,000 characters. It enters the envelope as untrusted `[IDEA REFERENCE]` data immediately before `[IDEA MAP]`, so instructions inside a document are never executable and the map remains the final operational context.
- **ValidationResponse**: psychometric validation data
- **ContentLanguageVersion**: stato di certificazione per (tipo di contenuto, chiave, lingua) — tabella `content_language_versions`. Gli strumenti seguono la scala del protocollo di validazione (`draft → translated → reviewed → pilot → validated`), i tool si fermano a `certified`; i vocabolari stanno in `backend/content_versions.py`. La promozione avanza di un gradino per volta — saltarne uno nasconderebbe un passo del protocollo, per esempio le interviste cognitive prima del pilot — mentre la retrocessione è libera, perché una traduzione trovata sbagliata deve poter tornare in bozza subito. `is_served()` decide se il contenuto arriva all'utente. Per gli **strumenti il cancello è attivo**: `scoring_service._assert_locale_available` solleva `LocaleUnavailable` e le route rispondono `409` con lo stato e le lingue disponibili (diverso dal `404` di uno strumento sconosciuto). Anche i **tool sono fail-closed per lingua**: strategie e letture usano la lingua richiesta solo a `certified`; altrimenti ripiegano esclusivamente su una lingua sorgente certificata (italiano, oppure inglese per le letture). Il pannello mostra e promuove lo stato della lingua selezionata. Lo stato iniziale è dedotto dai dati in `content_versions_seed` per strumenti, strategie, letture e le due famiglie di domande; ogni contenuto riceve sei righe e una promozione esistente non viene sovrascritta. Uno strumento creato dopo l'avvio deriva le sue righe alla prima richiesta; gli altri contenuti le ricevono alla creazione e allo startup. API: `GET /admin/content-versions`, `GET /admin/content-versions/ladders`, `POST /admin/content-versions/{id}/promote`.
- **Testi multilingue (JSON)**: `instruments.name_i18n`, `factors.label_i18n`/`description_i18n`, `questionnaire_items.text_i18n`, `certified_strategies.name_i18n`/`recommended_when_i18n`/`description_i18n` sono JSON `{lingua: testo}`, come già `guided_steps.label_i18n` e `counselors.description_i18n`. Le vecchie colonne `*_it/_en/_es/_sv` **esistono ancora** e sono lette in ripiego da `backend/i18n_fields.py`: la rimozione è un lavoro successivo. Un campo si legge sempre con `i18n_fields.localized(row, campo, lingua)`, che **non ripiega mai su un'altra lingua** — il ripiego è una decisione di prodotto, non di lettura. Le ALTER stanno in `content_versions_seed.ensure_i18n_columns` e non fra le migrazioni di `main.py`, perché `create_all` non altera una tabella esistente e i test devono esercitare la migrazione vera. `instruments.response_labels` (etichette della scala di risposta) è una proprietà dello strumento, viene seminato per le lingue storiche e completato dalla traduzione dello strumento.

### Prompts: code defaults vs DB (important)
Prompts live in **two places** with different roles:

- **Traduzione dei contenuti**: `backend/certified_translation.py` (strategie e letture, sorgente **italiano**) e `backend/instrument_translation.py` (item, fattori, nome ed etichette della scala degli strumenti, sorgente **inglese** — gli originali italiani stanno sul sito esterno). Entrambi prendono il traduttore come parametro, così i test girano senza rete; in produzione è Ollama via `counselor_i18n._ollama_base` / `_model` (config `ollama_ip`, `counselor_translate_model`; il container raggiunge il server come `host.docker.internal:11434`). CLI: `python -m scripts.translate_certified_content --what all` e `python -m scripts.translate_instruments --all --targets fr,de,es`. Entrambi idempotenti: non richiamano il modello per una lingua già presente e non sovrascrivono una traduzione umana senza `--force`. **Una traduzione automatica nasce `translated` e si ferma lì**: `certified` per i tool e `reviewed`/`pilot`/`validated` per gli strumenti restano gesti umani; una risposta parziale del modello resta `draft`. Per gli strumenti una lingua diventa `translated` solo se sono completi nome, etichette dei fattori, scala di risposta e tutti gli item attivi (`refresh_instrument_status`). Il ricalcolo non retrocede mai una lingua che una persona ha portato oltre `translated`.
- **DB = live, editable copy used at runtime.** System prompts and UI texts are rows in the `configs` table (e.g. `prompt_qpcs_analysis`, `prompt_qpcs_summary`); each guided step's instruction is the `prompt` column of `guided_steps` (with `system_prompt_mode`, label, color). The admin panel edits these DB rows.
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

Plain collections skip any `graphify-out/` path (`_is_build_artifact`): those are build reports, not domain knowledge, and 59 dated snapshots used to make up 89% of the `counselorbot` corpus. The filter lives in both `_collect_plain_corpus` and `_plain_signature` — they must stay symmetric, otherwise the signature never matches and the index rebuilds on every query. Scanned PDFs with no text layer are skipped silently (only a log line): `sito-competenzestrategiche/studi/MELOGNO_2018.pdf` is one, a 21 MB print-to-PDF scan.

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
| `POST` | `/api/orientation/sessions/{id}/message` | owner | Add a turn and receive closed-catalog recommendations plus a Taccuino draft |
| `POST` | `/api/orientation/sessions/{id}/notebook-review` | owner | Save only confirmed Taccuino fields as an append-only revision, or explicitly skip |
| `POST` | `/api/orientation/sessions/{id}/complete` | owner | Complete orientation after recommendations and Taccuino review |
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
| `POST` | `/api/tts` | student | Text-to-speech |

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
- **Student-facing sanitization**: QSA codes expanded to `Code (Name)`. ZTPI labels stripped. Inverted QSA factors must stay aligned with `questionnaires.ts`.
- **i18n**: admin strings in `i18n-admin.ts` (IT + EN blocks). Add new keys to both.
- **Tests**: dedicated `counselorbot_test` Postgres DB (never SQLite). Override `get_db`/auth, mock `AIService`. Plain-runnable and pytest-compatible.
- **Artifact regression checks**: `cd frontend && npm run test:artifacts` exercises diagrams at 320/390/1440 px, recommendation updates/retry and summary downloads against the running app with mocked API fixtures (`ARTIFACTS_BASE_URL` overrides localhost:3000). Backend coverage is in `test_message_diagrams.py`, `test_recommendation_blocks.py`, `test_recommendation_state.py`, `test_pdf_summary.py` and the existing smoke/diagram suites; database fixtures use a rolled-back schema inside `counselorbot_test`.
- **Startup seeding**: idempotent. Raw-SQL column migrations must be idempotent.
- **Visual identity**: `docs/design.md` is the source of truth; the tokens live in `frontend/src/app/globals.css`. The brand colour is a petrol teal exposed through the **remapped `indigo-*` scale** — use `indigo-*` utilities, never a petrol hex at the call site. `ochre-*` means movement (active step, start), `amber` means warning; they are not interchangeable. `slate` is the only neutral scale. Dark mode is a **central remap** at the bottom of `globals.css`, not `dark:` at call sites: a colour utility with no entry there stays light on dark. Prefer the primitives in `src/components/ui/`. The same identity is restated outside the web app in `backend/pdf_generator.py` (`APP_*`), `backend/diagram_render.py` (`PALETTE`) and the printed QR sheets built inline in the admin panels — those change together.
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
