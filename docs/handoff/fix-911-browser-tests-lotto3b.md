# Handoff — #911 Lotto 3b: admin, chat, prompt, forum e residui

## Stato
Completo (ultima PR di #911, `Fixes #911`). Branch `fix/911-browser-tests-lotto3b`
da `origin/main` 65934eac. Scope: `frontend/tests/`, 3 piccoli fix in `src/`, docs.

## Fatto
- Test obsoleti riscritti sul markup/flusso attuale (mai saltati o cancellati):
  admin-prompt-map, admin-transcription-engine, audio-input, chat-preferences,
  chat-recovery, chatgpt-admin-settings, chatgpt-subscription, conversation-artifacts,
  document-retrieval, draft-protection, forum, guided-chat-follow-up,
  guided-navigation, log-viewer, prompt-factory-alignment (spostato in «Salute dei
  prompt»), prompt-request-preview (anteprima nella Mappa dei prompt),
  qpcc-alignment, qpcc-chat-formatting, voice-reader.
- Rimossi i path Chromium hardcoded (`/usr/bin/chromium`) in 5 file.
- Bug reali corretti (3 commit `fix:` separati):
  - `PromptMap.tsx`: la riga «dal livello …» va a capo a 390px (era overflow 23px).
  - `use-resume-entries.ts`: un errore transitorio non svuota le sessioni mostrate.
  - `GuidedChatInterface`/`ChatWorkspace`: «Mappa e rami» raggiungibile su telefono.
- Bug registrati nel Diario (locale, non sincronizzati): `2c470b10` (overflow mappa),
  `59c658d7` (resume svuotato), `366935cc` (IDEA mobile). Nessun NOT_REGISTERED.

## Verifiche (file → pass/totale; tutti verdi)
| File | Esito |
|---|---|
| admin-model-search 15/15 · admin-prompt-map 22/22 · admin-section-filter 20/20 | ok |
| admin-step-system-prompt-key 2/2 · admin-transcription-engine 4/4 · assistant-audio 4/4 | ok |
| audio-input 21/21 (+2 skip live) · chat-actions 4/4 · chat-markdown 2/2 | ok |
| chat-preferences 11/11 · chat-recovery 33/33 · chat-settings 4/4 · chat-shell 4/4 | ok |
| chatgpt-admin-settings 13/13 · chatgpt-subscription 16/16 | ok |
| conversation-artifacts 31/31 · document-retrieval 15/15 · draft-protection 24/24 | ok |
| external-privacy 16/16 · forum 27/27 · guided-chat-follow-up 1/1 | ok |
| guided-navigation 12/12 · log-viewer 4/4 · prompt-factory-alignment 8/8 | ok |
| prompt-health-management 8/8 · prompt-lab 10/10 · prompt-lab-comparison 2/2 | ok |
| prompt-request-preview 2/2 · qpcc-alignment 8/8 · qpcc-chat-formatting 5/5 | ok |
| qsa-prompting-regression 6/6 · voice-reader 16/16 (+2 skip) | ok |
| stream-proxy 8/8 · request-origin 8/8 (frontend isolato su :3203) | ok |
- `npx eslint` su src e test toccati: 0 errori, 0 warning. `npx tsc --noEmit`: 0.
- `python3 scripts/check-platform-guidance.py --base origin/main`: allineata.
- Ambiente: `next build --webpack` + `next start` isolato su `127.0.0.1:3202`
  (`BACKEND_ORIGIN=127.0.0.1:9`), più :3203 per i test del proxy. Il dev server
  Next 16 dava 500 intermittenti sul manifest durante lo sweep.
  Dev server e server proxy **fermati**; nessun container/Postgres avviato.

## Non eseguiti (opt-in, backend/DB sintetici reali)
- `admin-class-settings-live` (`CLASS_ADMIN_LIVE=1`), `forum-live`,
  `forum-links-live`, `forum-options-live` (`FORUM_LIVE`/`FORUM_LINKS_LIVE=1`).

## Prossimi passi / rischi
- PR non in bozza [#1050](https://github.com/nugh75/counselorbot-sbs/pull/1050)
  (`Fixes #911`), aggiunta alla board 5; merge al proprietario. `opencode.json`
  modificato in locale: NON committato.
