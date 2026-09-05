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

## Follow-up: mobile resource windows

This follow-up supersedes the mobile resource-panel placement and deployment above.
The horizontal three-dot conversation menu now has separate Path, Scores and
Visual tools entries. Path and Scores open native modal windows with an X,
Escape dismissal, keyboard focus containment and focus restoration. Recommended
readings and strategies remain reachable through the same menu. No resource
panel occupies space below the mobile chat. The menu also remains available
after completion, so visual work can still be consulted and exported.

VisualTools stays mounted when its window closes; opening it from the menu
preserves drafts and the selected tab. Creating a card from a message still
opens the card editor with its source. Desktop sidebar resizing and advancement
below the chat remain intact. The guide and close labels cover all six languages.

Validation: 104 unit tests and all 59 production browser fixture tests passed
(design, artifacts and visual tools). Lint and TypeScript passed, with the same
four existing lint warnings. Mobile screenshots were inspected in light and
dark themes at 320 and 390 px. Browser APIs were mocked; physical phone keyboards
and authenticated live conversations were not tested.

Only the frontend was rebuilt and recreated, using
`counselorbot-10-step-frontend:mobile-windows-20260905` and
`/tmp/cb-mobile-windows-deploy.yml`. Tested and deployed image ID:
`sha256:0c765e6c3be1d8042d97aedc8a5f4b8606e4cc8b3e4f13895d2aaf1db43ce231`.
Local HTTP 200 and unauthenticated public HTTP 302 were verified. Backend and
PostgreSQL container IDs and start times are unchanged. The previous
`mobile-compact-20260905` image is retained.

## Follow-up: desktop tools and shared kebab menus

The user's subsequent choice moves all desktop message actions into the same
compact menu used on mobile. Both message and conversation menus now use
vertical dots (kebab), superseding the horizontal orientation above.
In the desktop message menu, Visual tools replaces Create a card and explicitly
opens Actions. Mobile retains the message-to-card action. Opening Actions after
visiting another tab preserves the unsubmitted draft and creates no entries.

The VisualTools window now fills the viewport on desktop and mobile, with its
header/close control and footer outside the scrolling content. Sidebar panels
have matching borders and heading styles; the recommendation stripe and active
step's decorative ring are removed. Guides were updated in all six languages.

Validation: 104 unit tests and 60 production browser fixture tests passed.
The latter verify full viewport bounds at 320, 390 and 1440 px, menu placement,
opening Actions after Cards, draft preservation, and the existing visual,
diagram, recommendation and chat workflows. Light desktop and dark mobile
screenshots were inspected. Lint has no errors and the same four existing
warnings; TypeScript and the Docker build passed. Browser APIs remain mocked.

Only the frontend was recreated from
`counselorbot-10-step-frontend:desktop-tools-20260905`, with image ID
`sha256:40a1b9d0436431c277b890060e6d38234ee898631bb05c4ba96c39f4f0bf7e5b`.
The compose override is `/tmp/cb-desktop-tools-deploy.yml`. Local HTTP 200,
unauthenticated public HTTP 302 and normal container startup were verified.
Backend and PostgreSQL container IDs/start times are unchanged; the previous
`mobile-windows-20260905` image is retained.

## Correction: one conversation menu and direct response controls

The final requested arrangement supersedes the per-message menus above:

- Exactly one kebab remains beside the composer (also available after completion).
- Visual tools opens only from that menu, on Actions, in the full-page window.
  Its launcher is removed from the sidebar; its state remains mounted separately.
- Diagram, Listen and eligible positive/negative feedback are direct 44 px icon
  controls below their response, with localized tooltips and accessible labels.
  Diagram placement was explicitly confirmed by the user. Feedback retains its
  existing target eligibility and endpoint; selected votes have a visible state.
- Cards are created in the Cards tab. Guides describe the final arrangement in
  all six languages.

Validation: 104 unit tests and all 62 production browser fixture tests passed.
New checks count a single menu with 20 replies, verify audio request text and
stop controls, and assert that both positive and negative votes carry the correct
response ID. APIs and audio playback are mocked. Light desktop and dark mobile
screenshots were inspected. Lint has no errors and four pre-existing warnings;
TypeScript, localization checks and the Docker build passed.

Deployed frontend: `counselorbot-10-step-frontend:single-chat-menu-20260905`, image
`sha256:3d3910dfcc74d72a89029c71b7b6961a0425988ae63b5c06e5396cddde4063dc`.
Override: `/tmp/cb-single-menu-deploy.yml`. Local HTTP 200, unauthenticated public
HTTP 302 and normal startup were verified. Backend and PostgreSQL container
IDs/start times are unchanged. The previous `desktop-tools-20260905` image is
retained. The separate worktree on `feat/chat-workspace-layout` was not modified.

## Correction: toggle the sidebar from the conversation menu

On desktop, Path and resources now toggles the sidebar instead of always opening
it. Closing keeps focus on the conversation menu trigger; reopening focuses the
sidebar. Saved visibility and width, composer drafts and mobile dialogs are
preserved.

Validation: the new browser regression reproduced the deployed bug before the
fix. It now passes, alongside 11 relevant desktop/mobile browser checks, against
the production image with mocked APIs. Localization, lint (four existing
warnings, no errors), TypeScript and the Docker build passed.

Deployed frontend: `counselorbot-10-step-frontend:sidebar-toggle-20260905`, image
`sha256:506b389a6cac322d35b648d11e7903b1c7756dd5000a14159104b862d4fb73a7`.
Override: `/tmp/cb-sidebar-toggle-deploy.yml`. Local HTTP 200, unauthenticated
public HTTP 302 and normal startup were verified. Backend and PostgreSQL
container IDs/start times are unchanged; the previous frontend image is retained.

## Correction: restore the navbar, neutral phases and icon controls

The global navbar remains visible during both guided chat and OpenCode. The
upper flow-stage overview stays hidden during the interaction step. Guided
phases now use the same neutral slate styling regardless of their configured
colour; numbers, the active highlight and completion marks retain orientation.
On mobile, advancement follows the composer. Desktop advancement remains below
the chat box. Visual tools and diagram controls use compact 44 px icons with
localized accessible names and tooltips, including their internal toolbars,
tabs, creation, removal, retry and export actions. Visual board stage headings
also lose their coloured decorative stripes. Guides were updated in six languages.

Validation: 104 unit tests and 64 production browser fixture tests passed.
Checks cover the restored navbar, viewport bounds, advancement placement,
phase-colour stability, icon sizes and labels, sidebar toggling and persistence,
diagram interaction/export, and visual-workspace editing and saving. Browser
APIs are mocked. Desktop light and mobile dark screenshots were inspected.
Lint has no errors and four existing warnings; localization, TypeScript and
the frontend Docker build passed.

Deployed frontend: `counselorbot-10-step-frontend:neutral-chat-20260905`, image
`sha256:2e520bf380f70d0367c3aa6c47fa75ad2c57231db27be7261944073e9c444d94`.
Override: `/tmp/cb-neutral-chat-deploy.yml`. Local HTTP 200, unauthenticated
public HTTP 302 and normal startup were verified. Backend and PostgreSQL
container IDs/start times are unchanged. The previous frontend image is retained,
and the separate `feat/chat-workspace-layout` worktree was not modified.

## Correction: a single diagram toolbar

Diagram controls share one 52.5 px row. Primary and step controls can scroll
horizontally on narrow screens; the options menu and fullscreen/close control
stay fixed at the right. Zoom, SVG/PNG export, animation preferences and usage
hints move into an overlaid popover. Opening it does not resize the drawing.
The permanent help/text-button strip below the drawing is removed; selected
concepts, step explanations, text alternatives, notes and legends remain.
Escape dismisses a focused tooltip, then the options menu, then fullscreen.

Validation: all 16 browser artifact checks passed against the production image,
including two layout/menu regressions at 320 and 1440 px. Browser APIs are mocked.
Light/dark screenshots at 320, 390 and 1440 px were inspected: the default drawing
has 662–688 px of an 844 px viewport. Export, reduced motion, touch zoom/pan,
text fallback, fullscreen focus and reading-position preservation passed.
Lint has no errors and four existing warnings; localization, TypeScript and the
Docker build passed.

Deployed frontend: `counselorbot-10-step-frontend:diagram-toolbar-20260905`, image
`sha256:8e83dc3025adac00289f1419328aec5504ec3340301b81ad3083bb0d3f3dca97`.
Override: `/tmp/cb-diagram-toolbar-deploy.yml`. Local HTTP 200, unauthenticated
public HTTP 302 and normal startup were verified. Backend and PostgreSQL
container IDs/start times are unchanged. The prior image and unrelated worktree
changes are preserved.
