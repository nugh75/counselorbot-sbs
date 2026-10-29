# Handoff — standard UX delle chat (#660)

## Stato
Completo, in consegna — milestone #39, slice documentale. Branch
`docs/chat-ux-standard-660` da `origin/main` 904798af. Task Diario 1e726ae5.
Solo documentazione: nessun codice, nessun backend.

## Fatto
- `docs/operations/chat-ux-standard.md`: componenti condivisi (ChatShell,
  ChatMarkdown, ChatResponseSettings, AudioInput, ListenButton), regole di
  layout, Markdown, composer, impostazioni per chat, audio, streaming/recupero/
  privacy/i18n/accessibilità, checklist per nuove chat, differenze note.
- Paragrafo di rimando in `docs-counselorbot/funzionalita-counselorbot.md`.
- Ogni affermazione verificata sul codice di `main` (props, ordine righe,
  `onStop`/`audioBusy` per chat, chiavi i18n, `cb_audio_auto_send`).

## Verifiche
- Solo doc: nessun test browser. `make guidance-refresh` + `guidance-check` ok.

## Sovrapposizioni per il merge
- `docs-counselorbot/funzionalita-counselorbot.md` (#656 PR #670, #658 PR #672,
  #661 PR #673): aggiungo 3 righe dopo il paragrafo «Forma comune»; tenere tutti.
- `docs/operations/platform-guidance-state.json`: non risolvere a mano, dopo i
  merge `make guidance-refresh` + `make guidance-check`.
- Il §9 del nuovo doc segnala che suggerimenti (#656), azioni del messaggio
  (#658) e diagramma per messaggio (#661) non sono in main: aggiornare il doc
  dopo i merge.

## Prossimi passi
- Dopo i merge #670/#672/#673 integrare le regole di quelle slice nel doc.

## Blocchi e rischi
- Nessuno.
