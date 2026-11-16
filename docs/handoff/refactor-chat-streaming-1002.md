# Handoff — refactor/chat-streaming-1002 (#1002)

## Stato
Completo: PR aperta verso main, in attesa di merge del proprietario.

## Fatto
- `frontend/src/lib/streamed-message.ts`: percorso unico per il messaggio in streaming
  (`createStreamedMessage`: `stream` a ritmo limitato 50 ms, `set`, `drop`, `finish`; flush su abort).
- Sostituite le tre copie `updateLast`/`dropLast` di `GuidedChatInterface`, quella di
  `FreeChatInterface` e quella dell'Assistente (`app/assistente/page.tsx`).
- `ChatMarkdown` memoizzato: i messaggi precedenti non vengono rianalizzati a ogni token.
- Doc: `funzionalita-counselorbot.md`, `CONTEXT.md`.

## Verifiche
- `node --test src/lib/streamed-message.test.ts` 7/7; `npm run test:ci` 959/959.
- eslint sui file toccati: pulito. `tsc --noEmit`: nessun errore oltre agli import `.png`
  (manca `next-env.d.ts` generato nel worktree).
- `make guidance-check`: ok. Nessun controllo visivo (niente dev server per vincolo RAM).

## Prossimi passi
- Merge PR; deploy solo frontend (nessun backend, nessun passo sudo).

## Blocchi e rischi
- Fuori scope, stessa duplicazione: `components/profile/ProfileChangeReflection.tsx`.
- Riga messaggio di `GuidedChatInterface` non estratta in componente memoizzato: troppe
  callback non stabili; il costo pesante (Markdown/diagrammi) è già coperto dal memo.
