# Graph Report - /home/nugh75/counselorbot-sbs/docs/questionari/strumenti  (2026-06-25)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 34 nodes · 29 edges · 7 communities (4 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Career Adaptability Questionnaire|Career Adaptability Questionnaire]]
- [[_COMMUNITY_Time Perspective Inventory|Time Perspective Inventory]]
- [[_COMMUNITY_Learning Strategies Questionnaire|Learning Strategies Questionnaire]]
- [[_COMMUNITY_Perceived Competencies and Self-Efficacy|Perceived Competencies and Self-Efficacy]]
- [[_COMMUNITY_QAP Italian Document|QAP Italian Document]]
- [[_COMMUNITY_Competence Perception Questionnaire|Competence Perception Questionnaire]]
- [[_COMMUNITY_Strategic Competence Perception|Strategic Competence Perception]]

## God Nodes (most connected - your core abstractions)
1. `Questionario sull'Adattabilità Professionale (QAP)` - 10 edges
2. `Zimbardo Time Perspective Inventory (ZTPI)` - 8 edges
3. `Questionario sulle strategie di apprendimento (QSA)` - 7 edges
4. `Michele Pellerey` - 4 edges
5. `Questionario di percezione delle proprie competenze e convinzioni (QPCC)` - 3 edges
6. `Questionario di Percezione delle Proprie Competenze Strategiche (QPCS)` - 1 edges
7. `Mark Savickas` - 1 edges
8. `Erik J. Porfeli` - 1 edges
9. `Massimo Margottini` - 1 edges
10. `Roberto Leproni` - 1 edges

## Surprising Connections (you probably didn't know these)
- `Questionario sulle strategie di apprendimento (QSA)` --references--> `Michele Pellerey`  [EXTRACTED]
  schede-bibliografiche/QSA_it.md → schede-bibliografiche/QAP_it.md
- `Questionario di percezione delle proprie competenze e convinzioni (QPCC)` --references--> `Michele Pellerey`  [EXTRACTED]
  schede-bibliografiche/QPCC_it.md → schede-bibliografiche/QAP_it.md
- `Questionario di Percezione delle Proprie Competenze Strategiche (QPCS)` --references--> `Michele Pellerey`  [EXTRACTED]
  schede-bibliografiche/QPCS_it.md → schede-bibliografiche/QAP_it.md

## Import Cycles
- None detected.

## Communities (7 total, 3 thin omitted)

### Community 0 - "Career Adaptability Questionnaire"
Cohesion: 0.20
Nodes (10): Roberto Leproni, Massimo Margottini, Erik J. Porfeli, Mark Savickas, Career Adaptability, Preoccupazione (Concern), Fiducia (Confidence), Controllo (Control) (+2 more)

### Community 1 - "Time Perspective Inventory"
Cohesion: 0.22
Nodes (8): John N. Boyd, Philip G. Zimbardo, Fatalismo, Futuro, Passato, Presente, Prospettiva temporale, Zimbardo Time Perspective Inventory (ZTPI)

### Community 2 - "Learning Strategies Questionnaire"
Cohesion: 0.29
Nodes (5): Ansia da valutazione, Autoregolazione, Metacognizione, CounselorBot SBS, Questionario sulle strategie di apprendimento (QSA)

### Community 3 - "Perceived Competencies and Self-Efficacy"
Cohesion: 0.40
Nodes (5): Francesco Orio, Michele Pellerey, Autoefficacia, Questionario di percezione delle proprie competenze e convinzioni (QPCC), Questionario di Percezione delle Proprie Competenze Strategiche (QPCS)

## Knowledge Gaps
- **26 isolated node(s):** `QAP_it Document`, `QPCC_it Document`, `QPCS_it Document`, `Questionario di Percezione delle Proprie Competenze Strategiche (QPCS)`, `Mark Savickas` (+21 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Questionario sull'Adattabilità Professionale (QAP)` connect `Career Adaptability Questionnaire` to `Perceived Competencies and Self-Efficacy`?**
  _High betweenness centrality (0.273) - this node is a cross-community bridge._
- **Why does `Michele Pellerey` connect `Perceived Competencies and Self-Efficacy` to `Career Adaptability Questionnaire`, `Learning Strategies Questionnaire`?**
  _High betweenness centrality (0.267) - this node is a cross-community bridge._
- **Why does `Questionario sulle strategie di apprendimento (QSA)` connect `Learning Strategies Questionnaire` to `Perceived Competencies and Self-Efficacy`?**
  _High betweenness centrality (0.199) - this node is a cross-community bridge._
- **What connects `QAP_it Document`, `QPCC_it Document`, `QPCS_it Document` to the rest of the system?**
  _26 weakly-connected nodes found - possible documentation gaps or missing edges._