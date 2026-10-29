# Agenti di servizio locali

Configurazione Counselorbot del 29 ottobre 2026. Entrambi usano Claude Code
con Sonnet (`claude-sonnet-5-5`), lanciati con
`herdr agent start <nome> --kind claude --pane <pane> -- --model sonnet`.
Hanno sostituito Codex `gpt-6.1-terra` low, fermo per crediti esauriti.

| Tab Herdr | Nome agente | Compito |
| --- | --- | --- |
| `S: srv-stato` | `srv-stato` | Risponde sullo stato di agenti, compiti, PR e verifiche consultando le fonti attuali. |
| `S: srv-deploy` | `srv-deploy` | Consulta Docker e salute macchina; esegue deploy soltanto su ordine esplicito. |

## Uso

Aprire la tab e scrivere direttamente la richiesta, per esempio «A che punto è
Opus sulla #653?» oppure «Quali container Counselorbot sono healthy?».
Ogni resoconto distingue evidenze attuali, informazioni mancanti, merge e deploy.
Il monitor mantiene un mandato in sola lettura e non svolge lavoro applicativo.

I servizi restano disponibili quando termina una risposta: lo stato Herdr
`idle`/`done` indica la fine del turno, mentre i task di servizio nel diario
restano `in corso`. L'aggiornamento si attiva sulla domanda dell'utente o sul
pacchetto del Timoniere; durante il coordinamento attivo il Timoniere passa
checkpoint e aggiornamenti ogni 30 minuti, evitando invii a un agente occupato.

## Isolamento e limiti

I checkout `../Counselorbot-worktrees/srv-stato-terra` e
`../Counselorbot-worktrees/srv-deploy` hanno branch propri e un albero documentale
parziale. Servono alla consultazione e non sono contesti validi per costruire immagini.
Il monitor consulta esplicitamente il checkout principale, i worktree di lavoro,
il diario, Herdr e GitHub. Le sessioni Claude Code usano l'auto mode per
l'accesso agli strumenti necessari.

Il servizio Docker identifica progetto Compose e contesto reale dalle etichette
e dalle procedure correnti. Su un ordine di deploy verifica merge/SHA, aggiorna
il checkout pertinente e ricostruisce soltanto i servizi autorizzati; poi controlla
health, log depurati e smoke test. Preserva il checkout `deploy-production`
bloccato per la documentazione montata. I dati, volumi e servizi di altri progetti
richiedono un mandato specifico; le anomalie non autorizzano correzioni automatiche.

Prima e dopo un deploy con passi sudo, comunica il comando esatto che il
proprietario deve dare a mano. L'agente non inserisce password né esegue sudo.
La procedura portable Console corrente non richiede `sudo ./update_nginx.sh`;
il contratto va ricontrollato per il deploy richiesto.

## Configurazione e arresto

Prompt, configurazione e ricevuta del recupero del monitor restano nella
directory dati Console `service-agents/Counselorbot/`. Non contengono `.env`
o credenziali. Il primo inventario è stato esclusivamente in lettura.

Per terminare un servizio, verificare il suo stato e conservarne l'handoff;
se sta lavorando, interromperlo e attendere la fine del turno prima di chiudere
la tab. Chiudere la tab ferma l'agente, senza spegnere i container del progetto.
