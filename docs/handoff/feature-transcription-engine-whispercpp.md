# Handoff — feature/transcription-engine-whispercpp

Issue #683 · milestone «Voice and audio» · agente s15-stt-opus.

## Obiettivo
Motore di trascrizione configurabile da Amministrazione: `faster-whisper`
(predefinito, comportamento invariato) oppure `whisper.cpp` (modelli ggml
quantizzati per CPU deboli). Audio sempre locale.

## Fatto
- `services/transcription`: stage di build whisper.cpp v1.9.5 (commit
  `d1be6fd`, binario statico `whisper-cli`, senza OpenMP); modelli
  `base`/`small` q5_1 e `large-v3-turbo` q5_0 da HF rev. `5359861`, SHA-256
  verificato. `server.py`: campo `engine` su `/transcribe`, `transcribe_cpp`
  (WAV temporaneo in `/tmp`, JSON, cartella eliminata), `/models` con `engine`.
  Modello non del motore → 422 `unsupported_model`.
- `backend/routes/audio_input.py`: `selected()` legge `transcription_engine` e
  `transcription_model`; motore sconosciuto → faster-whisper, modello assente
  nel motore → default del motore (`large-v3-turbo` / `small`).
- `AudioModelsPanel.tsx`: scelta del motore, modelli filtrati, riga qualità +
  RAM/CPU indicative, salva entrambe le chiavi. i18n nelle sei lingue.
- Docs: `docs/operations/audio-input.md`, `funzionalita-counselorbot.md`.

## Test
- Backend: `TEST_DB=sqlite python3.11 -m pytest backend/tests/test_audio_input.py`.
- Servizio: `docker run --rm cb-stt-test:after python -m unittest test_server -v`
  (la classe `BundledEngineTests` usa binario e modelli reali dell'immagine).
- Frontend: `next dev -H 127.0.0.1 -p 3163` poi
  `node --test tests/admin-transcription-engine.test.mjs`.

## Limiti noti
- whisper.cpp: nessun VAD; modello mappato a ogni richiesta (nessun residente).
- I modelli faster-whisper restano precaricati all'avvio anche se il motore
  scelto è whisper.cpp.
- `-march=native` del build host: l'immagine va costruita sull'host che la usa.

## Follow-up
App desktop Tauri con whisper.cpp come sidecar: piano nella issue #683.
