# F1-17 — s73-f1-17-docs

## Stato
Fix API runtime verificato localmente; PR https://github.com/nugh75/counselorbot-sbs/pull/584
Branch `docs/f1-17-desktop-docs-tests`; milestone installazione, board CounselorBot.
Task `a8f4b202-cc7b-42de-ae42-1eef04bdbc22`, issue #213; base `2220ef99`.

## Fatto
- Guida docente IT (bundle/SHA-256, chiavi, tunnel, LLM, backup/rollback), checklist.
- DPIA L2 collegata a P16 e P6/P7/P11, [DA VALIDARE]; documentazione aggiornata.
- Lifecycle `--full`: lifespan, schema/seed/FK/integrità, health locale/pubblico.
- CI quattro runner e regressioni SQLite Linux; nuovo check HTTP/SSE/WS standalone.
- Fix API catch-all runtime con corpi/risposte streaming, cookie e firma origine;
  upgrade WebSocket nel proxy prima della route per preservare il terminale web.

## Verifiche
- Python 3.11.9 + SQLite: 173 passati, nessun nuovo fallimento; Node desktop 14/14.
- API/origine/stream Node 22: 21 passati; lint, Bash e YAML verdi.
- Docker runner build + TypeScript verdi; HTTP/SSE/WS reali: 11+11 passati.
- Primo giro CI: backend/SQLite OK, Mac ARM /api/health 500 e tunnel health KO:
  causa rewrite Next congelato al build. Run 40170449319 annullata dopo diagnosi.
- Bug confermato LOCAL `2055bf26-39ff-4beb-ace0-50c6679206e8`, sync not-linked.
- Immagine `counselorbot-f117-frontend:check` ricostruita; produzione intatta.
- make guidance-refresh/check verdi; nessun controllo UI cambiato.

## Prossimi passi
- Harness CI verificato nel container: 11+11 passati, processi ripuliti.
- Commit fix `e77b9400`, CI `7e069511`; harness e container ripuliti.
- Main P9 `f6073230` integrato: conflitti documentali risolti conservando entrambi.
- DPIA aggiornata a P9; post-merge 173 test Python e guidance verdi.
- Nessun cambiamento frontend da main: immagine/test Docker restano validi.
- Commit atomici fix/ci/docs, push; aggiornare PR e chiudere task solo con verifiche verdi.

## Blocchi e rischi
- Fase 1 aperta: GUI docente/pairing/dispositivi, Release e prove OS manuali mancanti.
- F1-16 implementato; F1-15 packaging completo, distribuzione Release parziale.
- Altro bug LOCAL `302912bf-1be6-4bd7-85b4-bf22a7e65d00`, sospetto, sync not-linked.
- Notifica PR accodata: recipient_working, consegna non confermata; mobile disattivato.
- Nessun deploy o dev avviato; nessun bug NOT_REGISTERED.
