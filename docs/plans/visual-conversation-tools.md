# Visual conversation tools

## Scope and acceptance

Implement the first three tools proposed to the user: a personal action board,
a comparison of up to three alternatives, and reflection cards to sort.
Reuse existing recommendations as optional source material. Do not generate new
recommendations, change prompts, inject hidden model instructions, or write to
the Taccuino automatically. Explicit discussion places the student's work in the
composer for review before sending.

## Delivery plan

1. Isolate work on `feature/visual-conversation-tools` in its own worktree.
2. Add session-owned, versioned storage with validation and conflict detection.
   Reuse the existing Log table; no schema migration or prompt configuration.
3. Add a shared visual workspace to guided chat and the graphical OpenCode chat.
   Provide a visible entry point, source-to-card action, editable action stages,
   comparison criteria/notes/choice, card sorting, undo and explicit save/retry.
4. Support six UI languages, 44px controls, keyboard navigation, mobile layout,
   dark mode, a text handoff and PDF export. Sorting works with simple controls;
   dragging is not required. The final session PDF includes saved visual work.
5. Test validation, ownership, stale-save conflicts, persistence, export, and
   browser interactions. Inspect mobile and desktop screenshots.
6. Inspect the other agent's changed paths. Keep its worktree untouched; check
   our patch against its in-progress changes before integrating and deploying.
   Only router registration and PDF data loading may need small separate hunks
   in shared integration files. Never copy or deploy unfinished prompt changes.

## Boundaries

- Prompt worktree: `/home/nugh75/counselorbot-sbs-prompts` (read-only).
- No edits to prompts, chat preparation, model context, routing policies,
  recommendation generation, skills, admin configuration, or Compose settings.
- Actions are the student's plan, separate from certified recommendation state.
- Comparison notes express the student's criteria, not computed suitability.
- Timeline, branching scenarios and flashcards are subsequent work.

## Verification before integration

- 104 frontend unit tests; TypeScript; six-language checks; ESLint (only four existing warnings).
- 24 targeted backend tests: ownership, bounded data, revision conflicts, persistence,
  final PDF compatibility and multi-page content.
- Eight visual-workspace browser cases, including 320/390/1440px, Italian/German/English,
  dark mode, keyboard focus, undo, network failures, conflicts, PDF retry, OpenCode
  and completed-session behavior. Fourteen existing artifact cases also pass.
- Actual screenshots inspected for mobile/desktop and the generated PDF.
- Our two integration files apply cleanly to a read-only snapshot of the prompt
  agent's in-progress files. No file in that worktree was edited.
- Touch validation uses browser emulation; no physical-device test was performed.
