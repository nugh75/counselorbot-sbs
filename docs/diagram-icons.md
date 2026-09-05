# Semantic icons for diagrams

The diagram catalogue contains **100 stable IDs**: the original ten symbols and
90 selected Lucide icons. `backend/diagram_icon_catalog.json` is the source of
truth for each ID, its English operational meaning, its Italian preview label,
and the Lucide component used for new assets.

Open [the searchable catalogue](diagrams/icon-catalog.html) to review all 100.
The preview is self-contained and works offline; search accepts Italian labels,
English meanings and IDs. It is a review artifact, not a new application page.

## Selection and compatibility

The manual generation prompt and the `concept-diagram` skill share the complete
meaning dictionary. The model must interpret each node in its source context,
including negation, and may omit `icon` or return `null`. It must not represent
an unmet goal as an achievement or assign a generic mental/emotional symbol to
an abstract self-belief. This is model guidance, not a guarantee of semantic
correctness; labels remain authoritative and require human review.

Icons retain the current symbol presentation. Nodes without an icon retain
their `form`; mixed diagrams are allowed. No extra AI call is introduced.
The renderer and browser validate against the same catalogue. Unknown IDs still
degrade to readable text; the original IDs/assets and saved specifications remain
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
   3,871 characters and its cap is 3,900; global skill budgets are unchanged.
5. Rebuild backend and frontend together, then verify generated and restored
   diagrams and SVG/PNG/PDF exports.

`skills_diagram_semantic_icons_v1` migrates only the recognized previous stock
English skill text (SHA-256 checked). It preserves custom instructions and the
skill's active/published state. Custom texts can be reviewed in the admin skill
editor; startup never replaces them with this contract. Future dictionary changes
need their own reviewed migration for existing stored instructions.

## Verification

Automated checks cover all 100 vectors/raster pairs, frontend/backend ID parity,
legacy IDs, mixed diagrams with explicit `null`, full prompt retention, PDF image
embedding, and idempotent migration with custom-text preservation. Live synthetic
examples cover planning, comparison with an unmet goal, and low self-efficacy.
The self-efficacy example retained a textual node while using task, feedback and
revision icons for concrete activities. Representative light/dark renders and the
catalogue at desktop/mobile sizes were inspected.
