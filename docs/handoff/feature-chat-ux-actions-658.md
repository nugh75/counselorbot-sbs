# Handoff — feature/chat-ux-actions-658 (#658)

## Stato
Completo: attesa, feedback e azioni extra allineati alla chat guidata in Bussola
e Assistente. Nessuna modifica backend.

## Fatto
- `ChatBubble.tsx`: `ChatPendingIndicator` (spinner + testo) condiviso; `ChatPending`
  lo usa, e la chat guidata lo usa dentro la bolla vuota al posto dello spinner
  corsivo diverso.
- `ChatShell.tsx`: `ChatMessageActions` (role=group «Azioni del messaggio»,
  `data-voice-ignore`, flex-wrap) e `chatActionButtonClass` (44 px).
- Chat guidata: la riga azioni passa a `ChatMessageActions` (markup invariato).
- Bussola: «Ascolta» esce dalla bolla nella riga azioni; aggiunto «Diagramma».
- Assistente: «Ascolta» e pollici escono dalla bolla nella riga azioni, pollici
  nello stile guidata (ghost, Tooltip, `aria-pressed`), voto unico, «Grazie!» come
  `role=status`; aggiunto «Diagramma». Le fonti/anteprima restano nella bolla.
- Diagrammi in Bussola/Assistente con `sessionId=""`: il backend non salva
  (`session_owner` accetta solo sessioni guidate/frozen); restano in stato locale.
- Doc: `docs-counselorbot/funzionalita-counselorbot.md` (sezione chat comuni).
- Test: `frontend/tests/chat-actions.test.mjs` (Bussola/Assistente, 390/1440).

## Verifiche
Dev isolato :3173 (`scripts/dev-chat-shell-tests.sh`, API sintetiche).
- `chat-actions` 4/4; `chat-shell` 4/4; `chat-markdown` 2/2; `assistant-audio` 4/4.
- `design-usability` «mobile chat keeps controls compact» 2/2 (riga guidata).
- `chat-recovery` 28/32: i 4 falliti sono la baseline nota (bug 90d5eee3).
- ESLint sui file toccati pulito; `tsc` solo errori TS2307 sulle PNG (manca
  `next-env.d.ts` nel worktree, preesistente); i18n: 12 baseline, nessuna nuova.
- `visual-tools.test.mjs` non avviabile: importa `src/lib/i18n-chat-layout.js`
  inesistente (preesistente su main).

## Sovrapposizioni per il merge
- #656 PR #670: `assistente/page.tsx`, `bussola/page.tsx`, `GuidedChatInterface.tsx`,
  `ChatShell.tsx`, `funzionalita-counselorbot.md`, `platform-guidance-state.json`.
- #657 PR #671: `assistente/page.tsx`, `bussola/page.tsx`, `GuidedChatInterface.tsx`,
  `funzionalita-counselorbot.md`, `platform-guidance-state.json`.
- In `ChatShell.tsx` le aggiunte sono un blocco autonomo prima di `ChatComposerInput`.

## Prossimi passi
- Merge con #670/#671 nella sessione dedicata; rigenerare guidance dopo i merge.

## Blocchi e rischi
- Feedback in Bussola non offerto: il backend Bussola non restituisce `response_id`.
- Diagrammi Bussola/Assistente non persistono al ricaricamento (scelta voluta, no backend).
