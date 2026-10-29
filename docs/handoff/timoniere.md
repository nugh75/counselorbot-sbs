# Handoff — Timoniere Counselorbot
Agente: `t-copilota-hnup` · Pane: `wT:pN` · Branch: `docs/service-agent-profiles`
Aggiornato: 29 ottobre 2026, Europe/Stockholm.

## Stato
- Opus al lavoro sulla milestone #39, prima slice #653; servizi Terra disponibili su richiesta.
- Altre modifiche al prodotto e deploy richiedono un ordine esplicito.

## Fatto
- PR #665 MERGED verificata; main aggiornato, branch locale precedente eliminato.
- Nomi verificati: Timoniere `wT:pN`; `s1-consiglio-orientativo` su `wT:p6`.
- Diario: 33 issue aperte rappresentate, sei task conclusi e tre incarichi superati annullati.
- PR #662, #663 e #664 registrate come integrate; #664 MERGED verificata su GitHub.
- Due obiettivi raggiunti; nove gruppi di backlog aggiunti senza attivare la sync automatica.
- Esiti CI non verdi preservati nel task dedicato; nessuna attestazione di test nuovi.
- `s3-chat-ux-opus` avviato alle 12:00:00 CET su `wT:pP`, tab `S3: Chat UX (Opus)`.
- Prompt consegnato alle 12:00:05; CLI viva, lavoro corroborato, task #653 in corso.
- `srv-stato`: tab `S: srv-stato`, pane `wT:pS`, letture Herdr/GitHub verificate dopo ripresa.
- `srv-deploy`: tab `S: srv-deploy`, pane `wT:pR`, inventario Docker in sola lettura completato.
- Entrambi T0 `gpt-6.1-terra` low scelti dall'utente; worktree documentali separati, non contesti build.
- Task persistenti: stato `792f65ea-d615-4226-a3a7-6dd0cd6033bb`, deploy `47f38ff3-2374-4e78-999e-30822d554d19`.

## Verifiche
- CLI vive, modelli e consegne corroborati; monitor legge diario, Herdr e GitHub.
- Docker: servizi principali Counselorbot/Console healthy, restart count 0 al primo inventario.
- Nessun deploy, rebuild, riavvio, sudo o modifica di dati eseguito creando i servizi.
- Config/prompt/ricevute locali: directory dati Console `service-agents/Counselorbot/`.

## Prossimi passi
- Monitorare la PR della prima slice #653; modello effettivo `claude-opus-5-5`, effort high.
- Task #653: `80b9695c-9581-4b26-baf7-fe5560adce8a`; branch `feature/chat-ux-shared-shell-653`.
- Aggiornare srv-stato ai checkpoint e ogni 30 minuti durante il coordinamento attivo, solo quando disponibile.
- Servizi persistenti: lasciare i task in corso anche se il singolo turno è idle/done.
- Operatività: `docs/operations/service-agents.md`; PR per slice, merge del proprietario.

## Blocchi e rischi
- Ambiente del Timoniere eredita `HERDR_PANE_ID=wT:p6`: usare esplicitamente `wT:pN` nei bootstrap.
- Bug locali: `8bdf9684` (pane ereditato), `5d245396` (CI), `aee61291` (duplicati storici).
- Milestone #12/#26: contatori divergenti; #83 aperta nella #21 chiusa. Issue e milestone invariate.
- Sette task storici da verificare, autopilot invariato; Docker non ha un mandato di intervento autonomo.
