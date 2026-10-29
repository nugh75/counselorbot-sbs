# Handoff — Timoniere Counselorbot
Agente: `t-copilota-hnup` · Pane: `wT:pN` · Branch: `docs/service-agent-profiles`
Aggiornato: 29 ottobre 2026, Europe/Stockholm.

## Stato
- Opus ha consegnato #653 nella PR #667 ed è idle; otto issue ancora da avviare, servizi Terra disponibili.
- Altre modifiche al prodotto e deploy richiedono un ordine esplicito.

## Fatto
- PR #665 MERGED verificata; main aggiornato, branch locale precedente eliminato.
- Nomi verificati: Timoniere `wT:pN`; `s1-consiglio-orientativo` su `wT:p6`.
- Diario: 33 issue aperte rappresentate, sei task conclusi e tre incarichi superati annullati.
- PR #662, #663 e #664 registrate come integrate; #664 MERGED verificata su GitHub.
- Due obiettivi raggiunti; nove gruppi di backlog aggiunti senza attivare la sync automatica.
- #653: browser 4/4 e voce 7/7, TS/lint OK; quattro recovery e dodici i18n preesistenti documentati da Opus.
- `s3-chat-ux-opus` avviato alle 12:00:00 CET su `wT:pP`, tab `S3: Chat UX (Opus)`.
- PR #667 aperta, head `7a41ffb4`, worktree pulito; task #653 fatto, consegna recuperata dal Timoniere.
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
- Attendere CI desktop e merge della PR #667 dal proprietario; nessuna revisione, come richiesto dall'utente.
- Task #653: `80b9695c-9581-4b26-baf7-fe5560adce8a`; branch `feature/chat-ux-shared-shell-653`.
- Aggiornare srv-stato ai checkpoint e ogni 30 minuti durante il coordinamento attivo, solo quando disponibile.
- Servizi persistenti: lasciare i task in corso anche se il singolo turno è idle/done.
- Dopo il merge proseguire da #654; altre issue #655–#661. Operatività servizi: `docs/operations/service-agents.md`.

## Blocchi e rischi
- Ambiente del Timoniere eredita `HERDR_PANE_ID=wT:p6`: usare esplicitamente `wT:pN` nei bootstrap.
- Bug locali: `8bdf9684` (pane ereditato), `5d245396` (CI), `aee61291` (duplicati storici).
- Milestone #12/#26: contatori divergenti; #83 aperta nella #21 chiusa. Issue e milestone invariate.
- Sette task storici da verificare, autopilot invariato; Docker non ha un mandato di intervento autonomo.
