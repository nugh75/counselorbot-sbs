# Semantic icons for diagrams

The diagram catalogue contains **100 stable IDs**: the original ten symbols and
90 selected Lucide icons. `backend/diagram_icon_catalog.json` is the source of
truth for each ID, its English operational meaning, its Italian preview label,
and the Lucide component used for new assets.

Open [the searchable catalogue](diagrams/icon-catalog.html) to review all 100,
or the [41 factor bindings](diagrams/factor-symbols.html).
The preview is self-contained and works offline; search accepts Italian labels,
English meanings and IDs. It is a review artifact, not a new application page.

## Selection and compatibility

The manual generation prompt and the `concept-diagram` skill share the complete
meaning dictionary. The model must interpret each node in its source context,
including negation. `diagram_symbols.py` also applies the dictionary in code:
recognized factor identities receive their fixed symbol even if the model omits
the icon or supplies another. Exact general dictionary terms and curated aliases
fill missing icons; unmatched concepts may still omit `icon` or return `null`.
Labels remain authoritative: an unmet goal must not become an achievement.

`diagram_factor_symbols.json` binds all 41 catalogued factors of QSA, QSAr, ZTPI,
QPCS, QPCC and QAP to existing icons. Labels reuse the application's six language
translations; tests compare every binding with the instrument catalogue and
`pdf_generator.FACTOR_TRANS`. Node `factor` metadata uses a namespaced ID such as
`QSA:A6`; it is internal identity, separate from the visible wording. A symbol
represents the factor, not its score or polarity. Related factors may share a
symbol (for example, the two perspectives on the past); the labels distinguish
them. These are application visual conventions, not validated psychometric signs.

When metadata is absent, the server recognizes complete factor names, bounded
level qualifiers, and matching codes. Bare codes need questionnaire context;
multi-factor nodes and conflicting names/codes remain unresolved. It never scans
arbitrary sentences for a keyword and treats it as a factor. New manual diagrams
receive their questionnaire from the ownership-checked session and the matching
factor dictionary on every model/repair attempt. Inline diagrams can declare
factor IDs or use canonical names. Saved manual diagrams are resolved on read
without rewriting their historical records; SVG/PNG/PDF share this normalization.

Icons retain the current symbol presentation. Nodes without an icon retain
their `form`; mixed diagrams are allowed. No extra AI call is introduced.
The renderer and browser validate against the same catalogue. Unknown IDs still
degrade to readable text or a recognized dictionary symbol; original IDs/assets and saved specifications remain
valid. The IDEA role-to-icon defaults are unchanged.

SVG embeds local vectors; PNG and PDF use the matching 48px raster assets in
light and dark themes. All paths remain local and allowlisted. The new assets
carry the installed Lucide package's ISC/Feather attribution in
`backend/diagram_icons/LUCIDE-LICENSE`.

## Catalogue choice

Reviewed on 2026-09-05:

| Catalogue | Relevant characteristics | Decision |
| --- | --- | --- |
| [Lucide](https://lucide.dev/) | Over 1,800 SVG icons; consistent strokes; ISC license. | Selected: the frontend already depends on Lucide. New assets use installed **0.562.0**, with no dependency upgrade. |
| [Tabler](https://tabler.io/icons) | Over 6,000 icons including outline and filled variants; MIT license. | A larger alternative if a future meaning is missing from Lucide. |
| [Phosphor](https://github.com/phosphor-icons/core) | SVG assets in multiple weights with tags and categories; MIT license. | Useful alternative, but introduces another visual family. |

Catalogue totals change over time. The app ships only its reviewed 100 IDs,
not a remote catalogue fetched during generation.

## Updating assets and instructions

1. Edit `backend/diagram_icon_catalog.json`; keep existing IDs stable.
2. Run `node scripts/generate_diagram_icons.mjs` after installing the frontend
   dependencies. It writes SVG/PNG assets, the two frontend allowlist declarations,
   the license, and the searchable review page. It preserves the original assets.
3. Run `node scripts/generate_diagram_icons.mjs --check` and the catalogue tests.
4. Recheck the skill's complete length before deployment. The current contract is
   3,992 characters and its cap is 4,100; global skill budgets are unchanged.
5. Rebuild backend and frontend together, then verify generated and restored
   diagrams and SVG/PNG/PDF exports.

`skills_diagram_semantic_icons_v1` migrates only the recognized previous stock
English skill text (SHA-256 checked). It preserves custom instructions and the
skill's active/published state. Custom texts can be reviewed in the admin skill
editor; startup never replaces them with this contract. Future dictionary changes
need their own reviewed migration for existing stored instructions.

`skills_diagram_factor_symbols_v1` similarly upgrades only the preceding stock
semantic-icon prompt (or the current stock text) and raises its cap to 4100.
When adding factors, update the bindings from the canonical instrument names and
translations, run the parity tests, and regenerate the preview with the same
asset generator. The general icon catalogue stays at 100 entries.

## Verification

Automated checks cover all 100 vectors/raster pairs, frontend/backend ID parity,
legacy IDs, mixed diagrams with explicit `null`, full prompt retention, PDF image
embedding, and idempotent migration with custom-text preservation. Live synthetic
examples cover planning, comparison with an unmet goal, and low self-efficacy.
Factor regression checks cover a saved QSA diagram whose model omitted every
icon, all 41 factors in six languages, metadata preservation, conflicting and
multi-factor labels, low/high levels, and dictionary retention through fallback
and repair. Representative light/dark renders and the catalogue at desktop/mobile
sizes are checked alongside SVG/PNG/PDF exports.
