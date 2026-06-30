# CounselorBot documentation

This directory is the canonical entry point for stable project documentation, research materials, implementation notes, and curated source archives.

## Index

- [Implemented documentation organization](progetto/organizzazione/proposta-organizzazione-docs-implementata-2026-05-30.md): inventory, mapping, and migration decisions.
- [Documentation graph](progetto/organizzazione/grafo-docs-2026-05-30.md): Mermaid view of the `docs/` structure.
- [Graphify documentation graph](progetto/organizzazione/graphify-docs-2026-05-30/README.md): generated output from `safishamsi/graphify`.
- [Project log](progetto/diario.md): project chronology.
- [Communications](progetto/comunicazioni/): contact drafts and messages.
- [Validation](validazione/): scientific plan, operating manual, psychometric details, diagnosis, and stanine notes.
- [Questionnaires](questionari/): instrument PDFs and item-catalog guide.
- [Prompting](prompting/): prompt translation reviews and analyses.
- [Implementation](implementazione/): technical checks and development notes.
- [Future implementation](future-implementazione/): deferred technical plans and audits.
- [Handoffs](handoff/): working-session handoffs and prompt-audit findings.
- [Sources](fonti/): bibliographic material, the archived `competenzestrategiche.it` public site content, and linked external sources.

## Placement rules

- Stable documentation belongs in `docs/`.
- Runtime files stay where the application loads them, unless code is updated together with the move.
- Local technical README files may remain next to the module or generated artifact they document.
- Generated or temporary files should not be treated as canonical documentation unless they are intentionally published artifacts.
