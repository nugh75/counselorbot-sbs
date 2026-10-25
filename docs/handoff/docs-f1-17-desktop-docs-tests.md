# F1-17 — s73-f1-17-docs

## Stato
Consegna PR https://github.com/nugh75/counselorbot-sbs/pull/584
Branch `docs/f1-17-desktop-docs-tests`; milestone installazione, board CounselorBot.
Task `a8f4b202-cc7b-42de-ae42-1eef04bdbc22`, issue #213.

## Fatto
- Guida docente IT, SHA-256, checklist, DPIA L2 [DA VALIDARE] e riferimenti P9/P12.
- Lifecycle completo: lifespan, schema/seed/FK/integrità SQLite e health pubblico.
- Fix API catch-all runtime; SSE e WebSocket preservati, test sintetici in CI.
- P9 e P12 integrati da main conservando documentazione e note desktop.
- README privacy e .env.example uniti automaticamente; manifest guidance rigenerato.

## Verifiche
- Python 3.11.9 SQLite: 207 passati dopo P12, nessun nuovo fallimento.
- 14 test Node desktop + 21 API/origine/stream; ESLint, TypeScript e Docker verdi.
- HTTP/SSE/WS reali: 11+11 passati; harness CI verificato nel container.
- Run 40174257696: tutti i quattro runner e Generate update manifests verdi,
  incluso lifecycle Mac Intel concluso prima del merge P12 richiesto dall'utente.
- Nessuna modifica frontend da P9/P12: immagine Docker isolata resta valida.
- make guidance-refresh/check post-P12 verdi; nessuna UI modificata.

## Prossimi passi
- Merge P12 verificato; commit/push di consegna, nessun merge PR agente.
- Proprietario: revisione/merge; stato CI autorevole nella PR.

## Blocchi e rischi
- Fase 1 aperta: GUI locale/pairing/dispositivi, Release e checklist manuale mancanti.
- F1-16 implementato; F1-15 packaging completo, distribuzione Release parziale.
- Bug runtime API LOCAL confermato `2055bf26-39ff-4beb-ace0-50c6679206e8`, fix in PR.
- Limiti integrazione LOCAL `302912bf-1be6-4bd7-85b4-bf22a7e65d00`, sync not-linked.
- Notifica PR accodata: recipient_working; mobile disattivato. Nessun NOT_REGISTERED.
- Nessun deploy/dev; container temporanei ripuliti, produzione intatta.
