# Handoff — feature/navbar-ai-source-1020 (#1020)

## Stato
Implementazione completa; PR in apertura.

## Fatto
- Backend: `backend/ai_source.py` + `GET /me/ai-source?counselor=<id>` in `backend/routes/personal_api.py` (mai la chiave).
- Frontend: `HeaderAISource` nella navbar (KeyRound + distintivo ruolo + logo provider, avviso di ripiego), dettaglio a hover/focus/tocco con «Gestisci le tue API».
- Testi 6 lingue in `frontend/src/lib/ai-source.ts`; loghi Simple Icons (OpenAI, Anthropic, Gemini, Ollama), Mistral/OpenRouter icona neutra `Bot`.
- `getActiveSessionCounselorId` in `frontend/src/lib/counselor.ts`: in chat il counselor in uso, altrove la scelta predefinita.
- Docs: funzionalità, CONTEXT.md.

## Verifiche
- `backend/tests/test_ai_source.py`: 6 passed (Postgres temporaneo tmpfs `counselorbot-1020-pg`, rimosso).
- `src/lib/ai-source.test.ts` 3/3; `npm run test:ci` 962/962; eslint file toccati OK; tsc OK (solo errori PNG per `next-env.d.ts` mancante nel worktree).
- Nessun controllo visivo (niente dev server per vincolo RAM).

## Prossimi passi
- Verifica visiva dopo il deploy (frontend + backend).

## Blocchi e rischi
- «Ripiego» = scelta personale non usabile (funzione spenta, classe, ChatGPT non collegato): `AIService` non ripiega sul sistema quando una chiave personale fallisce, quindi quel caso resta un errore in chat, non un'icona.
- Aggiornamento: al cambio counselor e di pagina; nessun evento dedicato dopo un errore.
