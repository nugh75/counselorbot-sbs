# Chat workspace layout

The chat is the main working surface. Its header contains two separate controls:

- **Tools** reopens the saved action board, comparisons and cards.
- **Panel** shows or hides the path, recommendations and scores. When closed, it
  shows the number of available recommendations without reopening automatically.

**Create a card** under an assistant reply prepares an editable card from that
reply. It does not save the card or send a chat message. The graphical OpenCode
chat also keeps its Tools access in the header.

## Responsive panel

`ChatWorkspace.tsx` owns the layout and panel preferences. At desktop widths the
panel is beside the chat; closing it gives the chat the available width. Users
can resize with a pointer, Left/Right/Home/End on the separator, or the two width
buttons. Width is bounded to 260–480 CSS pixels and further limited to preserve
space for the chat. Desktop visibility and preferred width are stored locally in
`cb_chat_panel`; invalid or unavailable storage falls back to the default layout.

On phones the panel stays **below the chat**, in the normal page flow. It is
collapsible and never overlays the conversation. The header shortcut opens it
and scrolls to it only after the user clicks. Returning a recommendation to the
chat closes the mobile panel and focuses the composer, preserving existing text.

## Guided progression

One navigation bar sits inside the guided chat, above the composer and outside
the scrolling transcript. It preserves the existing advance/back/retry handlers,
loading restrictions and Savickas conditions. IDEA keeps its map-driven flow
without displaying an ordered-step bar. Completed sessions retain export/tools
access without showing progression controls.

UI text and tooltips cover Italian, English, Spanish, French, German and Swedish.
Regression coverage includes mobile placement, expanded chat width, draft
retention, pointer/keyboard/button resizing, persisted preferences, a long
transcript, and a single phase transition.
