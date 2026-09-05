# Compact chat controls — 2026-09-05

## Scope and source

Implementation: `9de1e32`, branch `fix/mobile-chat-controls`, worktree
`/home/nugh75/counselorbot-sbs-mobile-compact`.

The baseline is `b3e1676` from `fix/design-usability`, which supplied the deployed
frontend. The main workspace on `feat/chat-workspace-layout` has separate,
uncommitted changes; those were preserved and are not part of this branch.

- Mobile message actions (card, diagram, listening, available feedback) move into
  a message-specific three-dot popover. Saved diagrams remain in the transcript.
- Conversation options also open the existing path/resources panel. Response
  length and freezing remain available there.
- Previous/next/retry are accessible 44 px icon buttons. Retry retains its
  existing failed-analysis condition; completion uses a check icon.
- Desktop advancement sits outside and below the chat box, after the composer,
  and names the current step. That name is removed from the desktop chat header.
- Mobile advancement remains above the composer. The empty composer uses one
  line; messages have less padding and no nested border on mobile.
- UI labels and the options guide cover all six languages.

## Verification

- `npm run lint`: no errors; four existing warnings in `page.tsx`, `ConfigForm.tsx`
  and `IdeaMapPanel.tsx`. Localization check: 2425 keys across six languages.
- `npm test`: 104 passed. TypeScript and the Docker production build passed.
- Production browser fixture suite `design-usability.test.mjs`: 22 passed,
  including viewport resize/draft preservation, dark mode, popover bounds and
  keyboard focus, desktop placement, and advance/retry/previous behavior.
- Artifact suite: 14 passed before the final popover positioning adjustment;
  its three message-diagram tests were rerun successfully against the final image.
- The visual-tools test for creating an editable card from a message passed
  against the final image.
- Screenshots inspected at 390×844, 320×568 (dark), 1440×1000, and 320×568 German.
  At 390×844, the transcript viewport increased from 604 to approximately 635 px;
  the empty composer decreased from 68 to 45 px. No horizontal page overflow.
- All browser API calls were mocked. Physical-phone software keyboards and
  authenticated production conversations were not exercised.

Popover dismissal and keyboard traversal use the browser's native Popover API;
positioning uses the visual viewport and avoids clipping by the transcript.
Reference: [MDN Popover API](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using).

## Deployment

Only `counselorbot_frontend` was recreated. Backend, database and volumes were
not changed. Image: `counselorbot-10-step-frontend:mobile-compact-20260905`,
Docker image ID:
`sha256:8840c016ae347bc837224ede39085be111d4cb1a60e55bef982ff1852d558b3c`.

Compose combines `/home/nugh75/counselorbot-sbs/docker-compose.yml` with
`/tmp/cb-mobile-compact-deploy.yml`. The override selects the image above and
build context `/home/nugh75/counselorbot-sbs-mobile-compact/frontend`.

Local `/` returns HTTP 200; the public host redirects unauthenticated requests
(HTTP 302). The running container matches the tested image and starts normally.
Previous frontend image retained: `counselorbot-10-step-frontend:chat-focus-20260905`.
