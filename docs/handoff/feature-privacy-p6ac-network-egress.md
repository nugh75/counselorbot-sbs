# P6a-c — s52-p6ac-codex

## Stato
Task `4d2e0973-0b46-4c43-84df-527c4297d544`; branch `feature/privacy-p6ac-network-egress`.
Implementazione e verifiche in corso; base allineata a origin/main `81a4c395`.

## Fatto
- Host locali: loopback o allowlist operatore; LAN e nomi provider non bastano.
- Vision/QSA/pQBL bloccano immagini esterne; nessun bypass prima del consenso P9.
- Detector NER remoto bloccato; Ollama/llama.cpp remoti filtrati anche con opt-out.
- Edge redatto dopo pronuncia e prima dei segmenti; filtro con errore bloccante.
- API lettore: default automatico Piper fidato se raggiungibile, altrimenti Edge filtrato.
- Conservato il divieto Piper teacher-pc (F1-07); scelte esplicite del client rispettate.

## Verifiche
- Python 3.11.9: suite P6a-c iniziale, 57 pass; rete reale vietata dai test.
- Prima regressione Python 3.11.9/SQLite: 350 pass (OCR, lettore, teacher-pc, PII e P1).
- Rebuild backend con tag isolato avviato; casi redirect/Piper, regressione SSE e guidance in corso.

## Prossimi passi
- Completare documentazione, regressioni, guidance, rebuild e smoke Docker senza rete.
- Commit atomico, push e PR main nella board CounselorBot; notifica Diario.

## Blocchi e rischi
- Filtro Edge deterministico: non copre nomi/luoghi/salute; gateway completo resta P6.
- Fiducia hostname configurata dall'operatore, senza risoluzione/pinning DNS (P6).
- Bug privacy registrato local-only: `3cbd6803-6d6d-43f2-80ab-d8561bf03821`.
- Nessun deploy, sudo o processo dev avviato; `.metadata_never_index` preesistente escluso.
