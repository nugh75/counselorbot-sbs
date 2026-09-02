# Indice dei branch

Fotografia del 2026-09-02. **Nessun branch è stato cancellato**:
questa tabella serve a ritrovare, senza scorrere `git branch`, dove è stata
sviluppata una feature e se è già confluita in `main`.

## Confluiti in `main`

Il tip di ognuno è raggiungibile da `main`, quindi il branch non contiene lavoro
che main non abbia già. `git log <sha>` e `git show <sha>` mostrano la storia del ramo.

| Branch | Tip | Data | Dietro main | Ultimo commit | Su origin |
|---|---|---|---|---|---|
| `chore/graphify-updates` | `3500874` | 2026-07-03 | 261 | chore: update graphify-out reports and graph data | sì |
| `deploy` | `9b2844a` | 2026-04-12 | 600 | upp | sì |
| `feat/header-improvements` | `a087a0d` | 2026-06-25 | 566 | feat: add tooltips to header components and improve accessibility | sì |
| `feat/rag-corpus-cleanup` | `b1f5dc5` | 2026-08-30 | 134 | docs(rag): add open access sources for Savickas, ZTPI and pQBL | — |
| `feature/admin-prompt-components` | `86aae62` | 2026-07-01 | 349 | feat: add instrument meta system prompt | sì |
| `feature/admin-step-prompts` | `1e28c64` | 2026-06-30 | 389 | refactor: organize admin prompt settings | sì |
| `feature/chat-diagrams` | `8ea77f4` | 2026-08-30 | 142 | fix: expose certified readings with RAG disabled | sì |
| `feature/content-language-versions` | `51380cd` | 2026-08-31 | 50 | test: cover language gating, promotion and translation completeness | sì |
| `feature/counselor-instrument-scope` | `bcb645b` | 2026-08-31 | 97 | feat(counselors): let each counselor declare the instruments it can serve | — |
| `feature/counselor-local-cloud-grouping` | `ba7a7f8` | 2026-06-29 | 450 | fix: render nested fields and markdown in admin log readable view | sì |
| `feature/counselor-persona-english-placeholder` | `cfd5ea6` | 2026-06-29 | 446 | docs: prompt-testing make usage + session handoff | sì |
| `feature/diagram-legibility` | `73a5491` | 2026-08-30 | 129 | docs(diagrams): record the graphic revision | sì |
| `feature/final-reflection-summary-pdf` | `0c0e9d2` | 2026-07-01 | 362 | feat: add final reflection summaries to PDFs | sì |
| `feature/forward-arrow-selection` | `b7ceb93` | 2026-06-29 | 404 | feat: select-then-continue tool picker with forward arrow | sì |
| `feature/frontend-reskin` | `5b61148` | 2026-06-28 | 493 | style(ui): move profile legend to the bottom | sì |
| `feature/guided-step-label-i18n` | `5718f35` | 2026-07-02 | 308 | feat: localize guided step labels in all UI languages | sì |
| `feature/guided-step-questions` | `4807d3f` | 2026-06-28 | 521 | fix: remove generic guided quick replies | sì |
| `feature/idea-branch-navigation` | `9a93b8f` | 2026-08-31 | 94 | feat(idea): put the map under the chat and make the branches navigable | — |
| `feature/idea-conclusion` | `f4ce0cf` | 2026-08-31 | 92 | feat(idea): end a session by asking where the result should be kept | — |
| `feature/idea-focus` | `01bf28a` | 2026-08-30 | 110 | fix(idea): bind the map skill to Idea alone and cover the map with smoke tests | sì |
| `feature/idea-pace` | `c68b8d5` | 2026-08-31 | 84 | feat(idea): let the person set how long the session should be | — |
| `feature/idea-plans-references` | `e1d285f` | 2026-08-31 | 75 | feat: surface other tools on the home page | sì |
| `feature/idea-reopen-and-plan` | `a894291` | 2026-08-31 | 86 | feat(idea): reopen a closed branch, and close with a plan only where one belongs | — |
| `feature/idea-wayfinder` | `a01dadd` | 2026-08-31 | 102 | feat(idea): navigate the map instead of a stepper | sì |
| `feature/landing-and-resume` | `b8b9e2b` | 2026-08-30 | 125 | feat(home): add a landing screen for returning students | sì |
| `feature/log-filter-multiselect` | `9951017` | 2026-06-29 | 453 | feat: multi-select log filters + fix filter-bar overflow | sì |
| `feature/multilingual-suggestions` | `ec91b7f` | 2026-07-02 | 312 | feat: add multilingual chat suggestions and admin management panel | sì |
| `feature/notebook-forza-debolezza` | `13cceef` | 2026-07-22 | 227 | fix: mount host-agent socket dir from /var/lib instead of /run | sì |
| `feature/pii-external-anonymization` | `9a4b5dc` | 2026-09-02 | 0 | docs(context): describe the Compass as advice-only with notebook bookends | sì |
| `feature/prompt-audit-api` | `b953ccc` | 2026-06-27 | 559 | test(qsa): regression test for per-factor interpretation directive | sì |
| `feature/qa-followup-depth` | `e3096d3` | 2026-07-02 | 287 | feat: deepen in-step follow-up answers (QA depth, retrieval tail, certified advice) | sì |
| `feature/qsa-certified-strategy-seeds` | `62f49c1` | 2026-06-28 | 525 | feat: seed certified study strategies | sì |
| `feature/qsa-counselor-test-battery` | `64180e9` | 2026-06-27 | 544 | test(qsa): add counselor prompt & performance battery via prompt-audit API | sì |
| `feature/qsa-reasoning-confined` | `ac53888` | 2026-06-27 | 546 | docs(handoff): QSA counselor reasoning confinement + test/log findings | sì |
| `feature/qsa-second-level-synthesis` | `af64b43` | 2026-07-02 | 295 | feat: add integrated second-level synthesis and reflective method to QSA/QSAr | sì |
| `feature/rag-doc-collections` | `6d80e92` | 2026-07-02 | 313 | fix: restore guided path phase colors | sì |
| `feature/reading-synopsis-web-lookup` | `6962b8a` | 2026-08-30 | 157 | fix(startup): tolerate concurrent create_all across uvicorn workers | sì |
| `feature/response-length-controls` | `0b6c198` | 2026-08-28 | 197 | Merge branch 'feature/frozen-sessions' | sì |
| `feature/step-knowledge-routing` | `dbf6e77` | 2026-07-01 | 330 | feat: move step prompt to system prompt for guided step welcome | sì |
| `feature/student-orientation` _(worktree: `/home/nugh75/counselorbot-sbs-bussola`)_ | `4e6b599` | 2026-09-01 | 13 | feat(orientation): qwen3.8 default model and no forced JSON | sì |
| `feature/student-profile-booklet` | `f2dd32e` | 2026-06-28 | 468 | feat: send view-as identity on API calls during preview | sì |
| `feature/telegram-bot` | `e7a84e7` | 2026-07-03 | 263 | feat: replace generic demo account names with recognizable nicknames | sì |
| `feature/test-profiles` | `8907bc7` | 2026-06-28 | 464 | test: cover isolation between test profiles | — |
| `fix/assistente-neutral-question-prompt` | `b331471` | 2026-06-29 | 396 | fix: neutralize questionari prompt for student audience | sì |
| `fix/assistente-role-differentiation` | `08bc30f` | 2026-06-30 | 394 | feat: differentiate /assistente per ruolo/collezione + counselor selector | sì |
| `fix/assistente-student-view` | `4118a3e` | 2026-06-29 | 398 | fix: show student version of assistente when impersonating a student | sì |
| `fix/complete-i18n-english-skills` | `79a3b44` | 2026-08-30 | 167 | test(skills): assert English instruction headings in prompt tests | sì |
| `fix/conversation-id-logs` | `a3d5632` | 2026-06-29 | 429 | feat: add conversation ids to logs | sì |
| `fix/diagram-render-icons` | `cc2861c` | 2026-08-30 | 122 | docs(diagrams): document icons and fullscreen | sì |
| `fix/farewell-feedback-option` | `b4fc792` | 2026-06-29 | 425 | fix: restore final feedback option | sì |
| `fix/guide-visual-usability` | `f5b05ec` | 2026-09-01 | 31 | docs: record guide usability corrections and verification | sì |
| `fix/guided-completion-cta` | `3104a09` | 2026-06-29 | 427 | fix: clarify guided completion cta | sì |
| `fix/header-riprendi-risorse-ordinamento` | `978f65d` | 2026-06-30 | 379 | fix: riduci 'Riprendi' a icona e sposta 'accedi ad altre risorse' prima di 'Esci' | sì |
| `fix/idea-map-title` | `e594cd4` | 2026-08-31 | 82 | fix(idea): name the work, not the tool, when a map is kept | — |
| `fix/idea-skill-truncation` | `17de9db` | 2026-08-31 | 90 | fix(idea): stop the map contract from being cut off at its own cap | — |
| `fix/interaction-farewell-copy` | `f78ecaa` | 2026-06-29 | 426 | fix: simplify interaction farewell | sì |
| `fix/intro-prompt-scope` | `2f0f34f` | 2026-06-29 | 439 | docs: refine CNOS-FAP bibliographic card and regenerate graph | sì |
| `fix/log-conversation-multiselect` | `93a6fde` | 2026-06-29 | 424 | fix: add conversation multiselect log filter | sì |
| `fix/mobile-chat-layout` | `128ef51` | 2026-06-28 | 460 | fix: satisfy role preview lint rules | sì |
| `fix/pdf-conversation-farewell-screen` | `bba5ea6` | 2026-06-29 | 430 | feat: add farewell screen after session completion | sì |
| `fix/petrolio-cta-color` | `ed80503` | 2026-06-29 | 407 | fix: remove right-arrow icons from CTAs | sì |
| `fix/prompt-audit-component-flags` | `aba8ef5` | 2026-07-01 | 343 | feat: improve prompt audit controls | sì |
| `fix/qsa-certified-second-level-advice` | `5a55c8c` | 2026-06-27 | 527 | docs(qsa): section-3 multi-model audit + session handoff | sì |
| `fix/qsa-factor-names-canonical` | `6fbf247` | 2026-06-27 | 541 | test(qsa): canonical factor-name guard + dedup cases; align test names to source | sì |
| `fix/qsa-resume-server-gate` | `55010ab` | 2026-07-04 | 240 | docs: update CONTEXT.md with AI providers, RAG system, data models, API endpoints, backend modules, Pellerey blocks, and new architecture notes | sì |
| `fix/qsa-second-level-interplay` | `ac3f569` | 2026-06-27 | 538 | docs(qsa): add after-fixes battery handoff (before→after) | sì |
| `fix/skills-budget-and-priority` | `ea23f4b` | 2026-08-31 | 88 | fix(skills): give the answer material the budget before the illustration | — |
| `fix/skills-preview-knowledge-and-pytest` | `e8f6e2c` | 2026-08-30 | 165 | chore: add pytest to the backend requirements | sì |
| `fix/student-booklet-compilations` | `d75466c` | 2026-06-29 | 428 | fix: preserve demo student data ownership | sì |
| `fix/taccuino-first-row-on-top` | `3315a96` | 2026-06-29 | 400 | refactor: move taccuino action row to top with back arrow | sì |
| `fix/taccuino-profile-labels` | `8561757` | 2026-06-29 | 455 | fix: clarify taccuino profile labels and header tooltip | sì |
| `pc` | `8bbf7bb` | 2026-06-25 | 567 | feat: add 'paese' field to survey responses and update related components | sì |
| `refactor/remove-decorative-icons` | `4782d52` | 2026-06-28 | 462 | refactor: remove decorative icons from student-facing UI | — |
| `refactor/remove-resume-chat` | `9d81232` | 2026-06-29 | 413 | fix: adjust button hierarchy on selector, making 'Usa lo strumento' primary green and questionnaire completion secondary | sì |
| `refactor/unify-first-line` | `9de1778` | 2026-06-29 | 402 | refactor: unify first-line selection affordances across QSA flow and taccuino | sì |

Totale: 75 branch.

## Non confluiti in `main`

Lavoro ancora aperto, non storia: il tip **non** è raggiungibile da main.

| Branch | Tip | Data | Avanti a main | Ultimo commit | Su origin |
|---|---|---|---|---|---|
| `fix/telegram-webhook-and-bot-link` | `746b956` | 2026-08-31 | 4 | feat: run pQBL practice sessions from the Telegram bot | sì |
