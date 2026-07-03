# Graph Report - /home/nugh75/counselorbot-sbs/docs-counselorbot  (2026-07-02)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 53 nodes · 71 edges · 8 communities (7 shown, 1 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_QSA Learning Strategies|QSA Learning Strategies]]
- [[_COMMUNITY_Student Teacher Assistant|Student Teacher Assistant]]
- [[_COMMUNITY_AI Configuration Stack|AI Configuration Stack]]
- [[_COMMUNITY_CounselorBot Platform|CounselorBot Platform]]
- [[_COMMUNITY_Career Construction Interviews|Career Construction Interviews]]
- [[_COMMUNITY_Guided Chat Strategy|Guided Chat Strategy]]
- [[_COMMUNITY_Strategic Competences KB|Strategic Competences KB]]
- [[_COMMUNITY_Session History|Session History]]

## God Nodes (most connected - your core abstractions)
1. `CounselorBot Platform` - 16 edges
2. `Role: Researcher / Administrator` - 10 edges
3. `Guided Chat` - 8 edges
4. `Informational Assistant (/assistente)` - 7 edges
5. `QSA — Learning Strategies Questionnaire` - 7 edges
6. `Knowledge Base: Strategic Competences` - 5 edges
7. `Portfolio` - 4 edges
8. `Savickas — Narrative Career Construction Interview` - 4 edges
9. `Role: Student` - 4 edges
10. `AI Configuration (console)` - 4 edges

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

## Communities (8 total, 1 thin omitted)

### Community 0 - "QSA Learning Strategies"
Cohesion: 0.18
Nodes (12): Administration Plans (console), Benchmark (console), Monitoring & Costs (console), Prompt Audit (console), Research Contacts (console), Role Preview (console), Training Dataset (console), Validation Export (console) (+4 more)

### Community 1 - "Student Teacher Assistant"
Cohesion: 0.24
Nodes (10): Informational Assistant (/assistente), Jemstedt & Bälter Method, Knowledge Base: CounselorBot, Open Learner Model (/profilo), Portfolio, pQBL (pure Question-Based Learning), Role: Student, Role: Teacher (+2 more)

### Community 2 - "AI Configuration Stack"
Cohesion: 0.25
Nodes (9): ai4auth (proxy forward-auth), AI Counselors, AIService (provider dispatcher), configs table (DB config), AI Configuration (console), Counselors Management (console), Model Presets (console), PostgreSQL 15 (production) (+1 more)

### Community 3 - "CounselorBot Platform"
Cohesion: 0.29
Nodes (8): CounselorBot Platform, Interface languages (it/en/es/fr/de/sv), OpenCode Workspace (/opencode), QAP — Career Adaptability Resources, QPCC — Perceived Competences and Beliefs, QPCS — Perceived Strategic Competences, Session Memory, Test-mode languages (en/es/sv)

### Community 4 - "Career Construction Interviews"
Cohesion: 0.40
Nodes (5): Combined Analysis, Narrative Career Construction principle, Savickas — Narrative Career Construction Interview, Self-Regulated Learning (SRL) principle, ZTPI — Zimbardo Time Perspective Inventory

### Community 5 - "Guided Chat Strategy"
Cohesion: 0.67
Nodes (4): Certified Strategy Memory, Guided Chat, GuidedStep (DB-driven steps), Strategy Memory (approved_strategies.md)

### Community 6 - "Strategic Competences KB"
Cohesion: 0.50
Nodes (4): competenzestrategiche.it project, graphify corpus, Knowledge Base: Strategic Competences, Ollama embeddings

## Knowledge Gaps
- **21 isolated node(s):** `Session History`, `QPCS — Perceived Strategic Competences`, `QPCC — Perceived Competences and Beliefs`, `QAP — Career Adaptability Resources`, `Session Memory` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CounselorBot Platform` connect `CounselorBot Platform` to `QSA Learning Strategies`, `Student Teacher Assistant`, `AI Configuration Stack`, `Career Construction Interviews`, `Guided Chat Strategy`, `Strategic Competences KB`?**
  _High betweenness centrality (0.614) - this node is a cross-community bridge._
- **Why does `Role: Researcher / Administrator` connect `QSA Learning Strategies` to `AI Configuration Stack`?**
  _High betweenness centrality (0.286) - this node is a cross-community bridge._
- **Why does `ai4auth (proxy forward-auth)` connect `AI Configuration Stack` to `QSA Learning Strategies`, `CounselorBot Platform`?**
  _High betweenness centrality (0.266) - this node is a cross-community bridge._
- **What connects `Session History`, `QPCS — Perceived Strategic Competences`, `QPCC — Perceived Competences and Beliefs` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._