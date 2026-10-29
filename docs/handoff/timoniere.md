# Handoff — Timoniere Counselorbot
Agente: `t-copilota-5mmx` (Claude Opus) · Pane: `wT:pT` · Branch: `docs/service-agent-profiles`
Aggiornato: 29 ottobre 2026, Europe/Stockholm.

## Stato
- Codex senza crediti (29/10, ~14:00): Timoniere sostituito da Claude Opus; `ex-t-copilota-hnup` resta su `wT:pN` solo per consultazione.
- `srv-stato` e `srv-deploy` rilanciati su Claude Sonnet (`claude-sonnet-5-5`) nelle stesse pane; `s1-consiglio-orientativo` chiuso (PR #664 MERGED, task fatto).
- PR #667 MERGED, #653 chiusa; lo stesso Opus lavora sulla #654, sette issue successive da avviare.
- Altre modifiche al prodotto e deploy richiedono un ordine esplicito.

## Fatto
- PR #665 MERGED verificata; main aggiornato, branch locale precedente eliminato.
- Nomi verificati: Timoniere `wT:pT`; `s1-consiglio-orientativo` chiuso.
- Diario: 33 issue aperte rappresentate, sei task conclusi e tre incarichi superati annullati.
- PR #662, #663 e #664 registrate come integrate; #664 MERGED verificata su GitHub.
- Due obiettivi raggiunti; nove gruppi di backlog aggiunti senza attivare la sync automatica.
- #653: browser 4/4 e voce 7/7, TS/lint OK; quattro recovery e dodici i18n preesistenti documentati da Opus.
- `s3-chat-ux-opus` avviato alle 12:00:00 CET su `wT:pP`, tab `S3: Chat UX (Opus)`.
- PR #667 MERGED verificata (`1eeddc57`); main aggiornato, branch locale #653 eliminato con -d.
- `srv-stato`: tab `S: srv-stato`, pane `wT:pS`, letture Herdr/GitHub verificate dopo ripresa.
- `srv-deploy`: tab `S: srv-deploy`, pane `wT:pR`, inventario Docker in sola lettura completato.
- Entrambi T0 Claude Sonnet (prima Codex `gpt-6.1-terra` low); worktree documentali separati, non contesti build.
- Task persistenti: stato `792f65ea-d615-4226-a3a7-6dd0cd6033bb`, deploy `47f38ff3-2374-4e78-999e-30822d554d19`.

## Verifiche
- CLI vive, modelli e consegne corroborati; monitor legge diario, Herdr e GitHub.
- Docker: servizi principali Counselorbot/Console healthy, restart count 0 al primo inventario.
- Nessun deploy, rebuild, riavvio, sudo o modifica di dati eseguito creando i servizi.
- Config/prompt/ricevute locali: directory dati Console `service-agents/Counselorbot/`.

## Prossimi passi
- Nuove deleghe: Claude (Sonnet per compiti semplici, Opus per T2), niente Codex finché la quota non torna.
- Monitorare #654; nessun revisore automatico, #667 unita senza revisione su scelta dell'utente.
- Task #654: `ee7368f4-eada-416f-9f8b-2afae5e34f47`, branch `feature/chat-ux-markdown-654`; worktree precedente riusato.
- Aggiornare srv-stato ai checkpoint e ogni 30 minuti durante il coordinamento attivo, solo quando disponibile.
- Servizi persistenti: lasciare i task in corso anche se il singolo turno è idle/done.
- Dopo il merge della nuova slice: #655–#661. PR #666 servizi ancora aperta; `docs/operations/service-agents.md`.

## Blocchi e rischi
- Ambiente del Timoniere eredita `HERDR_PANE_ID=wT:p6`: usare esplicitamente `wT:pT` nei bootstrap.
- Bug locali: `8bdf9684` (pane ereditato), `5d245396` (CI), `aee61291` (duplicati storici).
- Milestone #12/#26: contatori divergenti; #83 aperta nella #21 chiusa. Issue e milestone invariate.
- Sette task storici da verificare, autopilot invariato; Docker non ha un mandato di intervento autonomo.
