# Handoff: chore/flat-token-cleanup-922 (#922)

## Stato
Implementazione completata; PR aperta contro main (milestone Flat visual consistency, Nov 2026).

## Fatto
- **Ombre (B2)**: `Toast` `rounded-card` + `shadow-pop`; bolle `ChatBubble` senza ombra; `ChatActionsPopover` `shadow-pop`; `DiagramBlock` (visore a schermo intero) `shadow-pop`; `ChatWorkspace` dialogo e sezione `shadow-card`; `IdeaConclusion` e `IdeaBranchTree` `shadow-card`. `MessageDiagramButton:172` non aveva un'ombra vera, solo `transition-shadow` (inutile senza ombra): rimossa. Restano solo i tre token.
- **44 px (B9)**: in tutto `frontend/src` (escluso `components/admin/`) `min-h-[44px]`→`min-h-control`, `h-[44px]`→`h-control`, `min-w-[44px]`→`min-w-control`. `w-[44px]` non è nello scope, lasciato. `min-w-control` esiste (`--spacing-control` in `globals.css`).
- **Testi sotto `text-xs` (B4)**: `text-[11px]`/`[10px]`/`[9px]`→`text-xs` in `frontend/src` (esclusi `components/admin/` e `ui/DiagramBlock.tsx`); `text-2xs` invariato.
- **Glifi (B10)**: `PlanActivityFlow` «←»→`ArrowLeft` (16 px, aria-hidden), `GuidedChatInterface` «→»→`ArrowRight`, `admin/ConfigForm` «▼»→`ChevronDown`; nelle sei lingue di `class-group-texts.ts` rimosso « →» da `openClass`. Nota: `openClass` non è renderizzato da nessun componente (solo `groups-directory.test.ts` ne verifica l'esistenza), quindi non c'era un call-site dove mettere `ArrowRight`.
- Test stale riscritto: `lib/idea-branching.test.ts` aspettava `<AutoGrowTextarea` nel compositore, oggi è `<ChatComposerInput` (falliva già su `origin/main`).
- Doc: `docs-counselorbot/funzionalita-counselorbot.md`, `CONTEXT.md`.

## Verifiche
- `tsc --noEmit -p frontend/tsconfig.json`: 0 errori dai file toccati; 252 errori pre-esistenti `public/guide/{sv,...}/*.png` mancanti (immagini guida non versionate nel worktree), identici su main.
- `eslint` sui file toccati: 0 errori, 22 warning pre-esistenti (unused/img/window.location), nessuno sulle righe modificate.
- `node --test --experimental-strip-types` (Node 22.23.3; il PATH di default ha Node 20 senza strip-types):
  - `idea-layout`, `idea-branching`, `groups-directory`, `operational-plan-naming`, `teacher-subpages-flat`, `ui-primitives-tokens`: 39/39.
  - `tests/flashcards-flat`, `flat-area-subpages`, `compass-entry-flat`, `forum-changes-flat`, `resources-flat`: 16/16.
- Accettazione grep vuota: `grep -rn "min-h-\[44px\]\|text-\[11px\]\|text-\[10px\]\|text-\[9px\]" frontend/src --include=*.tsx | grep -v components/admin`.
- Nessun controllo visivo/browser (Mac 8 GB, volume esterno lento): nessuna modifica a markup, id, testid o nomi dei link.

## Prossimi passi
- Revisione e merge della PR dall'app.

## Blocchi e rischi
- `frontend/node_modules` è un symlink al checkout principale (solo per tsc/eslint/test); non versionato.
- `MessageDiagramButton:172` e il call-site mancante di `openClass` sono discrepanze dell'audit, annotate in PR.
