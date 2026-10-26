# Handoff — contratto PostgreSQL unico

## Stato
- Docs in revisione finale; branch `docs/postgresql-unified-contract`, base `147bb356` (#595 merged).
- Task `a6baeee2-d7c6-4b8b-a065-862b92cf518c`; nessuna implementazione runtime o accesso dati reali.

## Fatto
- Creato ADR-0004: PostgreSQL 15 unico target, `desktop_contract=2`, layout 2 e confine SQLite legacy.
- Fissati risorse/binari 15.19, cluster proprietario, credenziali OS, init/health/stop e ownership PID.
- Definiti converter transazionale/ripetibile, stato/report, verifiche dati/file, dump/restore e rollback.
- Aggiornati ADR 0001/0002/0003 e indice, piano desktop con gate PG-00..03 e sequenza dei task.
- Aggiornati runbook, guide/test desktop, DPIA/contesto e grounding senza dichiarare il target consegnato.
- `v0.1.1` resta esplicitamente SQLite/layout 1; nessuna release autorizzata.

## Verifiche
- `git diff --check`: superato; controllo finale previsto anche sullo staged.
- Link Markdown locali verificati in 117 documenti: OK.
- `make version-check`: versione 0.1.1 allineata.
- `make guidance-refresh` e `make guidance-check`: allineati; aggiornato `platform-guidance-state.json`.
- Revisione manuale del contratto: corretto ordine init/start/creazione DB e ripresa post-commit.

## Prossimi passi
1. Controllare diff/staged finali, creare il commit atomico docs e fare l'unico push.
2. Aprire PR a main con Project CounselorBot e dipendenza #600 esplicita.
3. Verificare CI sullo SHA della PR; notificare esiti senza commit accessori e chiudere il task docs.

## Blocchi e rischi
- PR #600 ancora aperta: non incorporarla; il Timoniere le dà precedenza prima del merge di questa PR.
- I task runtime/dati/unificazione non partono prima dei rispettivi merge; restano tutti da fare.
- Hash artifact effettivi e gate sui quattro OS saranno verificati nell'implementazione, non simulati qui.
