# Handoff — feature/chat-ux-diagrams-661

## Stato
Completo: diagramma per messaggio e correzione dopo il disegno (#661).
Branch da `origin/main`, nessun merge dei branch #655–#658.

## Fatto
- `MessageDiagramButton`: disegno e stato della richiesta legati alla chiave
  del messaggio sorgente; se la riga mostra un'altra risposta (nuovo turno,
  rigenerata) il disegno del turno precedente non compare più.
- Dopo il disegno il campo diventa «Cosa vuoi correggere nel diagramma?»:
  con testo invia `previous_spec` + `instruction`; vuoto, ridisegna da capo.
  Il campo si svuota dopo il successo; niente più precompilazione con la
  richiesta salvata.
- Backend `/api/diagram/from-message`: `previous_spec` facoltativo, validato
  con `parse_spec` (422 prima di chiamare il modello); il prompt di
  correzione resta materiale non fidato. Salvataggio invariato: revisioni
  in append, `list_diagrams` tiene l'ultima per `source_key`.
- Fixture `test_diagram_generation`: stub di `personal_api` (db=None);
  7 test tolti dalle liste known-failures (sqlite e postgres).
- Etichette `correct`/`correctSend` in 6 lingue (`i18n-diagram.ts`).
- Doc: funzionalità, `live-dev-environment.md`, `scripts/dev-diagram-tests.sh` (:3181).

## Verifiche
- pytest (TEST_DB=sqlite) `test_diagram_generation` + `test_message_diagrams`: 18/18.
- Unit `diagram-request`, `diagram-content`, `chat-markdown`: 12/12.
- Browser `conversation-artifacts` pattern diagram: 9/11 + nuovo test
  correzione verde; i 2 «mobile counselor selection» falliscono anche su main.
- `chat-shell` 4/4, `chat-markdown` 2/2, `assistant-audio` 4/4.
- `audio-input`: 9 fallimenti chat guidata = baseline #655 (falliscono anche
  su codice main), macchina carica (load 15–25).
- tsc: solo moduli `.png` (manca `next-env.d.ts`); ESLint file toccati 0;
  i18n solo i 12 di baseline.

## Sovrapposizioni per il merge
- `docs-counselorbot/funzionalita-counselorbot.md` e
  `docs/operations/live-dev-environment.md`: toccati anche da #655–#658.
- `frontend/tests/conversation-artifacts.test.mjs`: possibile con #658 (azioni).
- `MessageDiagramButton.tsx` è montato da `GuidedChatInterface.tsx` (non
  modificato qui), che #656/#657/#658 toccano.

## Prossimi passi
- Merge insieme alle altre PR della milestone #39.

## Blocchi e rischi
- `frontend/node_modules` è un link al worktree #653 (non tracciato).
- Test «mobile counselor selection» rotto su main: da indagare a parte.
