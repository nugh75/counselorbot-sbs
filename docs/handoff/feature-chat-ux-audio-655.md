# Handoff — audio uguale nelle tre chat (#655)

## Stato
In consegna — milestone #39, terza slice. Branch `feature/chat-ux-audio-655`
da `origin/main` 83fc5423 (merge #668). Task Diario b82161d7.

## Fatto
- Decisione del proprietario: audio anche nell'Assistente, come chat guidata e
  Bussola. Solo `frontend/src/app/assistente/page.tsx`; backend invariato
  (`/api/audio/transcribe` e `/api/tts/stream` chiedono solo il login, che
  l'Assistente già richiede).
- `AudioInput` accanto a Invia (dettatura da microfono o file; in conversazione
  vocale il pulsante Parla sostituisce campo, «?» e Invia).
- Nuovo `ChatActionsPopover` «Opzioni della conversazione» nella riga controlli:
  conversazione vocale, invio immediato, lingua parlata (come la Bussola).
  Formato e lunghezza restano dove sono (#656 composer).
- `send(audioMessage?, onPartial?)` restituisce la risposta e passa lo streaming
  alla voce, che legge a pezzi mentre arriva; invio bloccato mentre trascrive.
- `ListenButton` + `data-voice-source` sulle risposte finite (non su quella in
  streaming), testo da `diagramContentForSpeech` come nella chat guidata.
- `sessionKey` = collezione:pubblico:argomento: cambiare contesto annulla
  registrazione e lettura in corso.

## Verifiche
- `tests/assistant-audio.test.mjs` 4/4 (390/1440): dettatura senza invio e
  microfono rilasciato, Ascolta con counselor_id, conversazione vocale con un
  solo invio e risposta letta tutta e in ordine, nessuno scroll orizzontale.
- `chat-shell` 4/4, `chat-markdown` 2/2.
- `voice-reader` + `audio-input`: Bussola e test vocali in maggioranza verdi;
  9 fallimenti su chat guidata e `/guide` anche a server caldo. Quei test non
  aprono `/assistente`, unico sorgente cambiato → preesistenti, non da #655.
- `tsc`: solo i moduli `.png` (manca `next-env.d.ts` nel worktree); ESLint
  file toccato 0; `i18n:check` solo i 12 di baseline; guidance-check ok.
- Dev :3173 (script `dev-chat-shell-tests.sh`) fermato a fine sessione.

## Prossimi passi
- #656 composer (unificare opzioni Assistente nel menu), #657, #658, #661.

## Blocchi e rischi
- Fallimenti preesistenti audio-input/voice-reader su chat guidata e guida da
  indagare a parte (setChecked invio immediato, lettura pagina guida).
