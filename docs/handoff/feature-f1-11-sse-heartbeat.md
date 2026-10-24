# Handoff — F1-11 heartbeat SSE
Agente: s48-f111-codex · Branch: feature/f1-11-sse-heartbeat
Task diario: 293dc817-4b51-48ef-be46-425bb11c426e · PR: —
Aggiornato: 2026-10-24

## Stato
In corso — implementazione committata, tutti i controlli finali verdi; restano commit docs e PR.

## Fatto
- Commit implementazione d0f0d2a8: helper backend/sse.py sui quattro stream: 15 s di silenzio, un solo next pendente, chiusura su disconnessione.
- Su richiesta esplicita: prepare_chat_turn resta sincrono prima della StreamingResponse; HTTP 409/502 invariati.
- Solo site_chat sposta il retrieval dopo il primo evento e possiede la sessione DB dello stream.
- Parser frontend invariati; test commenti byte per byte; fixture HTTP e workflow manuale quick tunnel.
- CONTEXT, piano e funzionalità allineati; guida operativa docs/operations/sse-heartbeat.md.

## Verifiche
- Python 3.11, SQLite: 142 test superati (heartbeat/continuazione/think/voice/platform/headroom).
- Node 22: 34 test parser/proxy superati; compileall, diff --check, guidance-check verdi.
- Locale e quick tunnel: 75 s di silenzio, 4 ping per stream, max gap ~15,1 s; fixture/tunnel fermati.
- Workflow: YAML e bash -n validi. Rebuild backend isolato aggiornato riuscito; 16 test SSE nell’immagine superati (Python 3.10).
- Tre smoke Postgres isolati superati. Raccolta combinata duplica il mock: sospetto Diario 80500170-d0c1-4994-b32e-e001ce09719f.
- SQLite raccolta legacy: cd77cd5e-c38a-454f-b577-a606c5c3c915; fixture RAG obsoleta: c686bf9e-4e7b-47d0-967c-6822b44f7179. Bug registrati LOCAL.
- Ruff: nuovi file/site_chat/voice verdi; 7 rilievi preesistenti invariati su chat/OpenCode.

## Prossimi passi
- Commit docs, push, PR, notify e update-task.
- Fixture, tunnel e Postgres effimero già arrestati; nessun processo dev F1-11 attivo.

## Blocchi e rischi
- Preparazione chat prima delle intestazioni non coperta da heartbeat, come richiesto dall'utente.
- next sincrono in corso termina con i timeout del provider; poi chiusura senza altra generazione.
- Conservare .metadata_never_index non tracciato. Nessun servizio/dato di produzione toccato.
