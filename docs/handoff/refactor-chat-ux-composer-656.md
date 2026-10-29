# Handoff — composer e pulsanti uguali nelle tre chat (#656)

## Stato
In consegna — milestone #39, slice composer. Branch
`refactor/chat-ux-composer-656` da `origin/main` 83fc5423. Task Diario a3659979.

## Fatto
- `ChatShell.tsx`: nuovo `ChatSuggestions` (elenco richiudibile sopra il
  campo; il suggerimento si aggiunge alla bozza, «…» lascia la frase aperta,
  poi fuoco sul campo). Comportamento estratto dalla chat guidata.
- Chat guidata e Bussola usano `ChatSuggestions` (la Bussola prima sostituiva
  la bozza, ora la integra come la guidata).
- Assistente: composer con la forma della guidata — `ChatActionsPopover`
  «Opzioni della conversazione» (formato + lunghezza, stesse righe della
  guidata) a sinistra, `ChatComposerInput` con stile standard e
  `id="assistente-composer"`, `ChatSendButton` a destra. Il pulsante «?»
  (una variante alla volta) diventa `ChatSuggestions` con le domande
  dell'argomento (DB, poi varianti i18n del prompt). Rimossi `prepareQuestion`,
  `questionVariantIdx`, chiave `assistant.prepareQuestion` (6 lingue) e la
  regola CSS `.assistente-composer textarea:focus-visible` (la card non fa più
  da indicatore di focus). La classe `assistente-composer` resta: la usano i test.
- Graffetta allegati (chat delle idee): 44×44, stessi angoli e colori del
  trigger opzioni.
- Bussola senza «Ferma»: la risposta arriva intera (non streaming), invariato.

## Verifiche
- `tests/chat-shell.test.mjs` esteso: trigger opzioni = invio per misura e
  raggio, opzioni a sinistra e invio a destra del campo; in Bussola il
  suggerimento si aggiunge alla bozza.
- `chat-shell` 4/4, `chat-markdown` 2/2 (primo giro: timeout di compilazione
  a freddo della chat guidata, poi verde). Dev :3173 con
  `scripts/dev-chat-shell-tests.sh`, fermato a fine sessione.
- `voice-reader` (`VOICE_BASE_URL`): le prove su chat guidata e Bussola verdi;
  6 falliti sulla lettura delle pagine/guida, non toccata.
- `audio-input` (`AUDIO_INPUT_BASE_URL`): 4 falliti (invio immediato guidata,
  opzioni inglesi, trascrizione annullata, voce Bussola 1440) falliscono uguali
  con i file di main → baseline, come già annotato in #655.
- `tsc` 0, ESLint file toccati 0, `i18n:check` solo i 12 di baseline;
  `make guidance-refresh` + `guidance-check` allineati.

## Prossimi passi
- #657, #658, #661 (fuori da questa slice).

## Sovrapposizioni per il merge
- PR #669 (#655, audio Assistente): `frontend/src/app/assistente/page.tsx`
  (stesso blocco composer: conflitto atteso — risoluzione: tenere la forma di
  questa slice e mettere voce/invio immediato/lingua di #655 nello stesso
  popover opzioni, `AudioInput` tra campo e Invia, `hidden={voiceMode}` sul
  campo), `docs-counselorbot/funzionalita-counselorbot.md` (paragrafi
  adiacenti), `docs/operations/platform-guidance-state.json` (rigenerare).

## Blocchi e rischi
- Dev Next sul volume esterno lento alla prima compilazione.
