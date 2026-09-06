# Graph Report - /home/nugh75/counselorbot-sbs/docs-counselorbot  (2026-09-06)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 230 nodes · 210 edges · 38 communities (25 shown, 13 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Platform Architecture and Deployment|Platform Architecture and Deployment]]
- [[_COMMUNITY_Administration and Configuration Panels|Administration and Configuration Panels]]
- [[_COMMUNITY_AI Counseling Engine|AI Counseling Engine]]
- [[_COMMUNITY_Guided Chat and Dashboard Visualization|Guided Chat and Dashboard Visualization]]
- [[_COMMUNITY_Question-Based Learning Module|Question-Based Learning Module]]
- [[_COMMUNITY_OpenCode Workspace Environment|OpenCode Workspace Environment]]
- [[_COMMUNITY_Session Memory Management|Session Memory Management]]
- [[_COMMUNITY_Certified Strategy Retrieval System|Certified Strategy Retrieval System]]
- [[_COMMUNITY_Counselor Profile Configuration|Counselor Profile Configuration]]
- [[_COMMUNITY_Teacher and Researcher Roles|Teacher and Researcher Roles]]
- [[_COMMUNITY_Administration Plan Management|Administration Plan Management]]
- [[_COMMUNITY_External Authentication Verification|External Authentication Verification]]
- [[_COMMUNITY_Conversation Log Management|Conversation Log Management]]
- [[_COMMUNITY_AI Cost Monitoring and Control|AI Cost Monitoring and Control]]
- [[_COMMUNITY_Questionnaire and Factor Configuration|Questionnaire and Factor Configuration]]
- [[_COMMUNITY_Strategy Knowledge Base|Strategy Knowledge Base]]
- [[_COMMUNITY_Student Profile Tracking|Student Profile Tracking]]
- [[_COMMUNITY_Strategic Competences Knowledge Base|Strategic Competences Knowledge Base]]
- [[_COMMUNITY_Training Data Management|Training Data Management]]
- [[_COMMUNITY_AI Model Preset Configuration|AI Model Preset Configuration]]
- [[_COMMUNITY_Research Contact Management|Research Contact Management]]
- [[_COMMUNITY_Student Reporting and Scoring|Student Reporting and Scoring]]
- [[_COMMUNITY_QSA Questionnaire Model|QSA Questionnaire Model]]
- [[_COMMUNITY_Student Portfolio Management|Student Portfolio Management]]
- [[_COMMUNITY_Student Booklet Types|Student Booklet Types]]
- [[_COMMUNITY_Administrator Group Configuration|Administrator Group Configuration]]
- [[_COMMUNITY_Conversational Scaffolding Pedagogy|Conversational Scaffolding Pedagogy]]
- [[_COMMUNITY_Combined Data Analysis|Combined Data Analysis]]
- [[_COMMUNITY_Teacher Guide Documentation|Teacher Guide Documentation]]
- [[_COMMUNITY_Platform Overview Documentation|Platform Overview Documentation]]
- [[_COMMUNITY_Critical Thinking Pedagogy|Critical Thinking Pedagogy]]
- [[_COMMUNITY_Student User Guide Documentation|Student User Guide Documentation]]
- [[_COMMUNITY_Incremental Streaming Providers|Incremental Streaming Providers]]
- [[_COMMUNITY_Open Learner Model Pedagogy|Open Learner Model Pedagogy]]
- [[_COMMUNITY_Question-Based Learning Pedagogy|Question-Based Learning Pedagogy]]
- [[_COMMUNITY_Single-Chunk Streaming Providers|Single-Chunk Streaming Providers]]
- [[_COMMUNITY_Technical Pedagogical Documentation|Technical Pedagogical Documentation]]
- [[_COMMUNITY_Test Mode Administration|Test Mode Administration]]

## God Nodes (most connected - your core abstractions)
1. `Administration Console` - 31 edges
2. `CounselorBot Platform` - 26 edges
3. `AI Counselor` - 11 edges
4. `pQBL - Pure Question-Based Learning Module` - 11 edges
5. `OpenCode Workspace (/opencode)` - 9 edges
6. `Guided Chat Feature` - 9 edges
7. `Certified Strategy Memory Subsystem` - 8 edges
8. `AIService Module` - 8 edges
9. `CounselorsPanel Admin (AI counselors)` - 8 edges
10. `Session Memory Subsystem` - 7 edges

## Surprising Connections (you probably didn't know these)
- `CounselorBot Platform` --deployed_with--> `Docker Compose Deployment`  [EXTRACTED]
  counselorbot-platform.md → technical-pedagogical-description.md
- `CounselorBot Platform` --uses--> `FastAPI Backend (Python)`  [EXTRACTED]
  counselorbot-platform.md → technical-pedagogical-description.md
- `CounselorBot Platform` --deployed_with--> `Nginx Proxy Manager`  [EXTRACTED]
  counselorbot-platform.md → technical-pedagogical-description.md
- `AI Counselor` --implements--> `Counselor Conversation Memory (remembers what you talked about)`  [EXTRACTED]
  counselorbot-platform.md → technical-pedagogical-description.md
- `AI Counselor` --implements--> `Counselor Linguistic Register Adaptation`  [EXTRACTED]
  counselorbot-platform.md → technical-pedagogical-description.md

## Import Cycles
- None detected.

## Communities (38 total, 13 thin omitted)

### Community 0 - "Platform Architecture and Deployment"
Cohesion: 0.06
Nodes (32): CounselorBot Platform, Docker Compose Deployment, FastAPI Backend (Python), Frontend Error Throw on Error Events, Frontend Serve /api/chat/stream (SSE filesystem route), GDPR Session Deletion Feature, Manual Retention Run Feature, Multilingual Support (it/en/es/fr/de/sv) (+24 more)

### Community 1 - "Administration and Configuration Panels"
Cohesion: 0.06
Nodes (31): Administration Console, AdministrationPlansPanel Admin Panel, Assistant Questions by Topic and Language, AssistantQuestionsPanel Admin, Benchmark Panel, BenchmarkPanel Admin Panel, CertifiedStrategiesPanel Admin, Certified Strategy Attributes (name, description, when to recommend, linked factor codes, match mode) (+23 more)

### Community 2 - "AI Counseling Engine"
Cohesion: 0.11
Nodes (19): AI Counselor, AIError Exception Handling System, AIService Module, Anthropic AI Provider, Counselor Conversation Memory (remembers what you talked about), Counselor Linguistic Register Adaptation, Counselor Non-Directiveness Pedagogy (proposes ideas, asks for confirmation), {{counselor_name}} Placeholder in Personas (+11 more)

### Community 3 - "Guided Chat and Dashboard Visualization"
Cohesion: 0.13
Nodes (15): Certified vs Interpretive Suggestions Distinction in Chat, Factor Code Expansion in Chat (e.g. C1 → C1 (Elaborative strategies)), Free-Text Questions in Chat, Green Band (Strength) in Dashboard, Guided Chat Feature, Explicit Language for Inverted Factors in Chat (growth area indication), Inverted Factors Handling (corrected for inverted factors), Next-Step Button in Score-Based Chat Paths (+7 more)

### Community 4 - "Question-Based Learning Module"
Cohesion: 0.18
Nodes (11): Final Test Mode (pQBL), Formative Feedback per Alternative (pQBL), Learning Mode (pQBL), MCQ Bank Generation (pQBL), Parallel Chunking (4 questions/chunk, 3 pages/segment), PDF Upload (pQBL, ≤100 MB), Per-Skill Analytics (pQBL), pQBL - Pure Question-Based Learning Module (+3 more)

### Community 5 - "OpenCode Workspace Environment"
Cohesion: 0.20
Nodes (10): Authenticated WebSocket for OpenCode PTY, OpenCode Chat Logging (opencode_chat), OpenCode Headless API, OpenCode Isolated Per-Workspace Container, OpenCode Live Terminal PTY (browser xterm.js over WebSocket), OpenCode Sandbox Security (no bash/webfetch), OpenCode Six Interface Languages Support, OpenCode Working Documents (documento.md, appunti.md, guida-questionario.md, memoria.md) (+2 more)

### Community 6 - "Session Memory Management"
Cohesion: 0.20
Nodes (10): Background Cleanup Loop for Memory, Disk-Based Session Memory, External Notes Sync from OpenCode (appunti.md), Last 16 Episodes Tracking in Memory, Log Retention Loop for Memory, Memory Expiration (2 hours), memory_service.py, Memory Tracking Categories (state, facts, preferences, goals, external notes) (+2 more)

### Community 7 - "Certified Strategy Retrieval System"
Cohesion: 0.22
Nodes (9): Certified-Advice Directive for AI Context, Certified Status Filter (only certified strategies injected), Certified Strategy Injection with certified-advice Directive, Certified Strategy Memory Subsystem, certified_strategy_service.py, Factor Salience Gating for Certified Strategies, is_active Filter for Strategies, Match Mode Configuration for Certified Strategies (+1 more)

### Community 8 - "Counselor Profile Configuration"
Cohesion: 0.25
Nodes (8): Counselor Avatar Attribute, Counselor is_active Flag Attribute, Counselor Language Attribute, Counselor Linked Preset Attribute, Counselor Attributes (slug, name, description with i18n), Counselor Sort Order Attribute, Counselor Supported Questionnaire Types Attribute, CounselorsPanel Admin (AI counselors)

### Community 9 - "Teacher and Researcher Roles"
Cohesion: 0.33
Nodes (6): Research Data Separation Pedagogy (individual counseling vs research), Research Groups Configuration, Researcher Role, Supplementary Teaching Tool Pedagogy (CounselorBot does not replace teacher), Teacher/Researcher Capabilities (administer questionnaires, use assistant, export data, configure tone/content, monitor usage/costs, train and audit), Teacher Role

### Community 10 - "Administration Plan Management"
Cohesion: 0.40
Nodes (5): Administration Plan Attributes (instrument, locale, scheduled date/location, linked researchers, status), Administration Plan Code Format (AP-XXXXXX), Administration Plan Status Values (planned/active/completed/archived), Administration Plans Panel (AP-XXXXXX), Linked Responses View for Administration Plans

### Community 11 - "External Authentication Verification"
Cohesion: 0.40
Nodes (5): ai4auth Authentication System, Direct Cookie Verification (AI4AUTH_VERIFY_URL), No Client-Side Tokens Authentication, Shared Secret Verification for Signed Headers, Signed Headers Authentication (Remote-Email, Remote-User, Remote-Name, Remote-Groups)

### Community 12 - "Conversation Log Management"
Cohesion: 0.40
Nodes (5): Conversation Log Filters (provider, questionnaire type, phase, cost, PII, feedback, audience, model, paid-only), Conversation Reconstruction Feature, Log Viewer Panel, PII Report Endpoint, Retention Status Tracking

### Community 13 - "AI Cost Monitoring and Control"
Cohesion: 0.40
Nodes (5): Cost Monitoring Panel, Monthly Budget Enforcement Feature, qwen3.5:9b Fallback Model (budget enforcement), Run-Rate Projection Feature, USD/EUR Rate Configuration

### Community 14 - "Questionnaire and Factor Configuration"
Cohesion: 0.40
Nodes (5): Factor Mapping Configuration, Instrument Catalog Editor Attributes (instruments, factors, items, reverse scoring, norm thresholds), Normative Ranges Configuration, Questionnaire Editor Panel, Reverse-Scoring Rules Configuration

### Community 15 - "Strategy Knowledge Base"
Cohesion: 0.50
Nodes (4): knowledge/approved_strategies.md, Strategy Memory Subsystem, strategy_memory.py, Strategy Retrieval Methods (keyword overlap or semantic similarity)

### Community 16 - "Student Profile Tracking"
Cohesion: 0.50
Nodes (4): Change Reflection Notes Feature (/profilo/cambiamenti), Historical Profile Review Feature (/profilo), Revision History Feature (append-only), Student Profile (/profilo)

### Community 17 - "Strategic Competences Knowledge Base"
Cohesion: 0.50
Nodes (4): competenzestrategiche.it Project, Informational Assistant (/assistente), CounselorBot Knowledge Base, Strategic Competences Knowledge Base

### Community 18 - "Training Data Management"
Cohesion: 0.50
Nodes (4): JSONL Export for Fine-Tuning, Synthetic QSA Example Generation, Training Dataset Panel, Training Example Approval Workflow

### Community 19 - "AI Model Preset Configuration"
Cohesion: 0.50
Nodes (4): Model Preset Attributes (provider + model + temperature + reasoning budget), Preset Assignable to Counselors and Benchmarks, PresetsPanel Admin (model presets), provider_configured Indicator (API key set)

### Community 20 - "Research Contact Management"
Cohesion: 0.50
Nodes (4): PDF Card Generation for Research Contacts, QR Card Generation for Research Contacts, Research Contact Code Format (RC-XXXXXX), Research Contacts Panel (RC-XXXXXX)

### Community 21 - "Student Reporting and Scoring"
Cohesion: 0.50
Nodes (4): PDF Report Generation Feature, Session History Feature, Stanine Scores (1-9), Student Role

### Community 22 - "QSA Questionnaire Model"
Cohesion: 0.50
Nodes (4): Pellerey Model (QSA), QSA 100 Items (14 factors), QSA - Learning Strategies Questionnaire, Self-Regulated Learning (SRL) Pedagogy

### Community 23 - "Student Portfolio Management"
Cohesion: 0.50
Nodes (4): Student Portfolio, Portfolio Context Injection into Informational Assistant for Personalization, Portfolio Context Injection into Guided Chat for Personalization, Portfolio Image Attachments (≤10 MB)

### Community 24 - "Student Booklet Types"
Cohesion: 0.67
Nodes (3): EVENTO_PROFESSIONALE Booklet Type, EVENTO_STUDIO Booklet Type, Student Booklet

## Knowledge Gaps
- **171 isolated node(s):** `Administrator Role`, `competenzestrategiche.it Project`, `PostgreSQL 15 Database`, `Combined Analysis Feature`, `CounselorBot Knowledge Base` (+166 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `CounselorBot Platform` connect `Platform Architecture and Deployment` to `Administration and Configuration Panels`, `AI Counseling Engine`, `Question-Based Learning Module`, `OpenCode Workspace Environment`, `Session Memory Management`, `Certified Strategy Retrieval System`, `External Authentication Verification`, `Strategy Knowledge Base`, `Strategic Competences Knowledge Base`, `QSA Questionnaire Model`?**
  _High betweenness centrality (0.493) - this node is a cross-community bridge._
- **Why does `Administration Console` connect `Administration and Configuration Panels` to `Platform Architecture and Deployment`, `Counselor Profile Configuration`, `Administration Plan Management`, `Conversation Log Management`, `AI Cost Monitoring and Control`, `Questionnaire and Factor Configuration`, `Training Data Management`, `AI Model Preset Configuration`, `Research Contact Management`?**
  _High betweenness centrality (0.378) - this node is a cross-community bridge._
- **Why does `AI Counselor` connect `AI Counseling Engine` to `Platform Architecture and Deployment`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **What connects `Administrator Role`, `competenzestrategiche.it Project`, `PostgreSQL 15 Database` to the rest of the system?**
  _171 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Platform Architecture and Deployment` be split into smaller, more focused modules?**
  _Cohesion score 0.0625 - nodes in this community are weakly interconnected._
- **Should `Administration and Configuration Panels` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `AI Counseling Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._