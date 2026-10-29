# Handoff — ChatShell condiviso (#653)

## Stato
Consegnata in PR, in attesa di revisione/merge — milestone #39 «Chat UX unification», prima slice. Branch
`feature/chat-ux-shared-shell-653` da `origin/main` 48d5e025 (dopo #664).

## Fatto
- `frontend/src/components/ui/ChatShell.tsx`: `ChatTranscript` (role="log" +
  regione aria-live separata), `ChatRow` (larghezza unica: piena, 90% da lg),
  `ChatComposerInput` (AutoGrowTextarea 1–6 righe, Invio invia via form),
  `ChatSendButton` (44×44, invio/stop opzionale). Estratti dalla chat guidata.
- Adottati in chat guidata (pura estrazione), Bussola e Assistente.
  Assistente: composer ora in `<form>`, attesa con `ChatPending`, textarea con
  aria-label. Bussola: textarea auto-grow con aria-label. Audio invariato
  (AudioInput in guidata e Bussola, nessuno in Assistente).
- Test browser `frontend/tests/chat-shell.test.mjs`, runner
  `scripts/dev-chat-shell-tests.sh` (:3173, fixture sintetiche).
- Doc funzionale: paragrafo «Forma comune della conversazione».

## Verifiche
- `tests/chat-shell.test.mjs` 4/4 (Bussola/Assistente, 390/1440), due run.
- `voice-reader` (Bussola + chat guidata) 7/7; `chat-recovery` 28/32: i 4
  falliti (ripresa/cancellazione) falliscono uguali con i file di main →
  baseline, registrata nel Diario.
- `tsc` 0, ESLint file toccati 0; `i18n:check` 12 testi fissi altrui (baseline).
- `make guidance-refresh` + `make guidance-check` allineati.
- Immagine isolata `counselorbot-frontend:chat-shell-653` (target runner)
  costruita; nessun container avviato, produzione non toccata.
- PR #667.

## Prossimi passi
- Layout composer Assistente (opzioni nel popover) → #656; Markdown → #654;
  audio/TTS → #655. Non iniziati.

## Blocchi e rischi
- Dev Next sul volume esterno: prima compilazione fino a 3 min; il test
  aspetta fino a 120 s il primo caricamento.
- Pulsante invio ora min 44px (radice 15px: prima 41px).
