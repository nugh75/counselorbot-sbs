# Handoff — Timoniere Counselorbot
Agente: `t-copilota-hnup` · Pane: `wT:pN` · Branch: `chore/timoniere-journal-alignment`
Aggiornato: 29 ottobre 2026, Europe/Stockholm.

## Stato
- Diario e nomi riallineati; Opus al lavoro sulla milestone #39, prima slice #653.
- Altre modifiche al prodotto richiedono il consenso del proprietario.

## Fatto
- Nomi verificati: Timoniere `wT:pN`; `s1-consiglio-orientativo` su `wT:p6`.
- OpenCode RAG `wT:pM` chiuso esternamente prima della rinomina; non ricreato.
- Diario: 33 issue aperte rappresentate, sei task conclusi e tre incarichi superati annullati.
- PR #662, #663 e #664 registrate come integrate; #664 MERGED verificata su GitHub.
- Due obiettivi raggiunti; nove gruppi di backlog aggiunti senza attivare la sync automatica.
- Esiti CI non verdi preservati nel task dedicato; nessuna attestazione di test nuovi.
- `s3-chat-ux-opus` avviato alle 12:00:00 CET su `wT:pP`, tab `S3: Chat UX (Opus)`.
- Prompt consegnato alle 12:00:05; CLI viva, lavoro corroborato, task #653 in corso.

## Verifiche
- Tutte le 90 operazioni CLI riuscite; altri progetti del diario invariati.
- Nessun nuovo ID duplicato; tre duplicati storici conservati e registrati come bug locale.
- Binding `.timoniere.json`: JSON valido e routing al pane live `wT:pN` verificato.
- Controllo documentazione e diff riusciti; nessuna suite applicativa necessaria per questi metadati.
- Nessun codice applicativo, database, container di produzione o dato reale modificato.

## Prossimi passi
- Monitorare la PR della prima slice #653; modello effettivo `claude-opus-5-5`, effort high.
- Task #653: `80b9695c-9581-4b26-baf7-fe5560adce8a`; branch `feature/chat-ux-shared-shell-653`.
- Worktree persistente: `../Counselorbot-worktrees/feature-chat-ux-shared-shell-653`.
- Prompt preparato: scope minimo, ponytail, output brevi, test mirati e nessuna delega ulteriore.
- PR per slice; merge del proprietario, revisione soltanto su richiesta.

## Blocchi e rischi
- Ambiente del Timoniere eredita `HERDR_PANE_ID=wT:p6`: usare esplicitamente `wT:pN` nei bootstrap.
- Bug locali: `8bdf9684` (pane ereditato), `5d245396` (CI), `aee61291` (duplicati storici).
- Milestone #12/#26: contatori divergenti; #83 aperta nella #21 chiusa. Issue e milestone invariate.
- Sette task storici senza prova conclusiva restano aperti; autopilot preesistente invariato.
