# Handoff — refactor/chat-primitives-tokens-961 (issue #961)

Aggiornato: 2026-11-16

## Stato
In corso: codice e docs pronti, manca commit/push/PR. Nessun dev server né Docker.

## Fatto
- 16 primitive chat da palette grezza ai token semantici (`ink*`, `surface*`,
  `line*`, `brand*`, `link`, `move`, stati): `ChatBubble`, `ChatShell`,
  `ChatMarkdown`, `ChatOptionsMenu`, `ChatActionsPopover`, `AudioInput`,
  `ResponseFormatSelector`, `ResponseLengthSelector`, `ReasoningSelector`,
  `InlineRename` (via `dark:`), `PencilButton`, `ConfirmInline`, `FlowStepper`,
  `AudioLanguageOption`, `AudioSendOption`, `ChatContinuation`.
- Campi nativi → `Select`/`Textarea` (dettatura, lingua audio, formato);
  pulsanti primari di rinomina e conferma → `Button`.
- `uppercase`, `font-medium`/`font-bold`, `h-9`/`h-11`/`min-h-11`,
  `outline-none` rimossi; target a 44px (`min-h-control`).
- `lib/ui-primitives-tokens.test.ts`: i 16 file entrano nella lista delle
  primitive + due test nuovi (tabella di sostituzione e zero campi/pillole
  scritte a mano). Il regex dell'hex ora ignora i riferimenti alle issue.
- Guida `docs-counselorbot/funzionalita-counselorbot.md` e `docs/design.md`.

## Verifiche
- `npx tsc --noEmit -p frontend` (con `next-env.d.ts` generato e
  `node_modules` link al checkout principale): verde, 3m15.
- eslint sui 17 file toccati: 0 errori.
- `node --test` mirati: `ui-primitives-tokens` (35/35), `loading-states`,
  `chat-markdown`, `chat-preferences` (18/18): verdi.
- Nessun controllo visivo (niente dev server né browser).

## Prossimi passi
- Commit atomici, push, PR su `main` con milestone e progetto CounselorBot.

## Blocchi e rischi
- Il composer (`ChatShell`) e l'input di `InlineRename` restano `<textarea>`/
  `<input>` nativi (AutoGrow / ref), sui token: eccezione documentata nel test.
- Da verificare a occhio in deploy: altezza dei suggerimenti rapidi e del
  selettore lingua compatto nel popover, ora a 44px.