# Graph Report - .  (2026-06-30)

## Corpus Check
- Corpus is ~4,692 words - fits in a single context window. You may not need a graph.

## Summary
- 67 nodes · 84 edges · 8 communities (7 shown, 1 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Instruments & Student Experience|Instruments & Student Experience]]
- [[_COMMUNITY_Console Research & Training|Console: Research & Training]]
- [[_COMMUNITY_Informational Assistant & Knowledge Bases|Informational Assistant & Knowledge Bases]]
- [[_COMMUNITY_AI Configuration & Tech Stack|AI Configuration & Tech Stack]]
- [[_COMMUNITY_Guided Chat & Learner Memory|Guided Chat & Learner Memory]]
- [[_COMMUNITY_Detect Metadata (noise)|Detect Metadata (noise)]]
- [[_COMMUNITY_Detect File Categories (noise)|Detect File Categories (noise)]]
- [[_COMMUNITY_Session History|Session History]]

## God Nodes (most connected - your core abstractions)
1. `CounselorBot Platform` - 16 edges
2. `Role: Researcher / Administrator` - 10 edges
3. `Guided Chat` - 8 edges
4. `Informational Assistant (/assistente)` - 7 edges
5. `QSA — Learning Strategies Questionnaire` - 7 edges
6. `files` - 6 edges
7. `Knowledge Base: Strategic Competences` - 5 edges
8. `Portfolio` - 4 edges
9. `Savickas — Narrative Career Construction Interview` - 4 edges
10. `Role: Student` - 4 edges

## Surprising Connections (you probably didn't know these)
- `Guided Chat` --references--> `GuidedStep (DB-driven steps)`  [EXTRACTED]
  counselorbot-platform.md → technical-pedagogical-description.md
- `Benchmark (console)` --references--> `QSA — Learning Strategies Questionnaire`  [EXTRACTED]
  counselorbot-guide-teachers.md → counselorbot-platform.md
- `QSA — Learning Strategies Questionnaire` --references--> `Pellerey SRL Model`  [EXTRACTED]
  counselorbot-platform.md → technical-pedagogical-description.md
- `ZTPI — Zimbardo Time Perspective Inventory` --conceptually_related_to--> `Self-Regulated Learning (SRL) principle`  [INFERRED]
  counselorbot-platform.md → technical-pedagogical-description.md
- `AIService (provider dispatcher)` --shares_data_with--> `AI Counselors`  [INFERRED]
  technical-pedagogical-description.md → counselorbot-platform.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Combined Analysis Prerequisite (QSA/QSAr + ZTPI + Savickas)** — combined_analysis, qsa, ztpi, savickas [EXTRACTED 1.00]
- **Informational Assistant dual knowledge base retrieval** — informational_assistant, kb_competences, kb_counselorbot, ollama_embeddings, graphify_corpus [EXTRACTED 1.00]
- **Memory subsystems injected into AI context** — session_memory, strategy_memory, certified_strategy_memory, shared_response_memory, guided_chat [EXTRACTED 0.90]

## Communities (8 total, 1 thin omitted)

### Community 0 - "Instruments & Student Experience"
Cohesion: 0.18
Nodes (13): Combined Analysis, CounselorBot Platform, Interface languages (it/en/es/fr/de/sv), Narrative Career Construction principle, OpenCode Workspace (/opencode), QAP — Career Adaptability Resources, QPCC — Perceived Competences and Beliefs, QPCS — Perceived Strategic Competences (+5 more)

### Community 1 - "Console: Research & Training"
Cohesion: 0.18
Nodes (12): Administration Plans (console), Benchmark (console), Monitoring & Costs (console), Prompt Audit (console), Research Contacts (console), Role Preview (console), Training Dataset (console), Validation Export (console) (+4 more)

### Community 2 - "Informational Assistant & Knowledge Bases"
Cohesion: 0.22
Nodes (10): competenzestrategiche.it project, graphify corpus, Informational Assistant (/assistente), Jemstedt & Bälter Method, Knowledge Base: Strategic Competences, Knowledge Base: CounselorBot, Ollama embeddings, pQBL (pure Question-Based Learning) (+2 more)

### Community 3 - "AI Configuration & Tech Stack"
Cohesion: 0.25
Nodes (9): ai4auth (proxy forward-auth), AI Counselors, AIService (provider dispatcher), configs table (DB config), AI Configuration (console), Counselors Management (console), Model Presets (console), PostgreSQL 15 (production) (+1 more)

### Community 4 - "Guided Chat & Learner Memory"
Cohesion: 0.36
Nodes (8): Certified Strategy Memory, Guided Chat, GuidedStep (DB-driven steps), Open Learner Model (/profilo), Portfolio, Role: Student, Strategy Memory (approved_strategies.md), Student Booklet

### Community 5 - "Detect Metadata (noise)"
Cohesion: 0.25
Nodes (7): graphifyignore_patterns, needs_graph, scan_root, skipped_sensitive, total_files, total_words, warning

### Community 6 - "Detect File Categories (noise)"
Cohesion: 0.33
Nodes (6): files, code, document, image, paper, video

## Knowledge Gaps
- **33 isolated node(s):** `code`, `document`, `paper`, `image`, `video` (+28 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CounselorBot Platform` connect `Instruments & Student Experience` to `Console: Research & Training`, `Informational Assistant & Knowledge Bases`, `AI Configuration & Tech Stack`, `Guided Chat & Learner Memory`?**
  _High betweenness centrality (0.379) - this node is a cross-community bridge._
- **Why does `Role: Researcher / Administrator` connect `Console: Research & Training` to `AI Configuration & Tech Stack`?**
  _High betweenness centrality (0.177) - this node is a cross-community bridge._
- **Why does `ai4auth (proxy forward-auth)` connect `AI Configuration & Tech Stack` to `Instruments & Student Experience`, `Console: Research & Training`?**
  _High betweenness centrality (0.164) - this node is a cross-community bridge._
- **What connects `code`, `document`, `paper` to the rest of the system?**
  _33 weakly-connected nodes found - possible documentation gaps or missing edges._