# Ripresa del 4 novembre 2026 — Codex sulla milestone «Prompt ownership»

Handoff del Timoniere (sessione del 30–31 ottobre). Il 4 novembre si riazzerano i crediti settimanali di Codex (GPT-6.1-Sol): da quel giorno le modifiche le fanno gli agenti Codex. Questo file dice cosa è stato fatto, cosa resta aperto e come ripartire.

## 1. Stato al 31 ottobre

**In produzione** (`counselorbot.labform.net`, portable su questo Mac, 5 container sani, circa 16 GiB liberi, nessun `sudo`):

- grafica uniforme in tutte le zone (milestone UI consistency chiusa);
- trascrizione configurabile (faster-whisper, whisper.cpp, OpenRouter, Mistral);
- correzioni della chat: niente JSON né ragionamento visibili, diagrammi che restano, linguetta Diagrammi, voce in botta e risposta;
- sicurezza (#641–#644), rimozione di SQLite (#735) e di OpenCode (#739);
- chat libera separata, con la sua barra e i suoi prompt (#756);
- milestone «Prompt coherence» chiusa: correzioni tecniche, passo «Strategie e consigli», una domanda per risposta, contenuti allineati;
- milestone «Prompt health» chiusa: registro dei prompt, controllo statico, pagina «Salute dei prompt» con confronto affiancato, uso reale, controllo con modello scelto da menu.

**Su main ma non ancora in produzione:** #769 (CI desktop verde) e #772 (regressioni dei test del backend, suite verde). Vanno nel prossimo deploy insieme alla #770.

**PR aperte al momento dell'handoff:**

| PR | Cosa | Stato | Prossimo passo |
|---|---|---|---|
| #770 | backup PostgreSQL prima degli aggiornamenti desktop (#738) | aggiornata con main, CI in corso | unire solo con test e 4 build desktop verdi |
| #774 | errori ESLint con Next 16.4.3 (#759): circa 55 errori corretti, job ESLint in CI non bloccante | in revisione | unire con CI verde; i ~100 loader restano in #773 |

**Rilascio desktop 2.1.0:** non ancora fatto. Va fatto dopo #770 e #774, con la procedura di `docs/operations/release.md`:

1. PR `chore/release-2.1.0` con solo i file di versione (`VERSION`, poi `make version-sync` e `make version-check`), unita dal proprietario.
2. `gh workflow run desktop-teacher.yml --ref main`, con 4 build verdi.
3. Release `v2.1.0`: c'è già una bozza di Release Drafter. Si pubblica con gli installer, i `.sha256` e i manifest. Gli installer non sono firmati se mancano le chiavi `TAURI_SIGNING_*`.

Se il 4 novembre il rilascio non è ancora fatto, si fa **prima** della milestone sotto.

## 2. Il lavoro del 4 novembre: milestone «Prompt ownership (Nov 2026)»

Obiettivo: una sola fonte di verità per i prompt, anche con istanze distribuite (scuole, PC dei docenti, server ai4educ). Tutto si gestisce dentro **Amministrazione › Salute dei prompt**: nessun altro posto.

### Decisioni del proprietario (31 ottobre)

1. **Due livelli.** La **fabbrica** è del progetto e la cambia solo il proprietario (manutentore). Ogni **istanza** personalizza la propria copia nel database.
2. **Database come unica fonte a runtime.** Ogni versione salvata resta nello storico (autore e data) e si può ripristinare.
3. **«Allinea prompt di fabbrica» resta**, come azione multipla: elenco delle differenze, selezione di più prompt (o tutti) e applicazione. I prompt personalizzati sono in un elenco a parte e vanno scelti esplicitamente. Sparisce solo la sovrascrittura nascosta (`FORCED_FACTORY_KEYS`).
4. **Aggiornamenti di fabbrica come proposte:** accetta, ignora o unisci a mano. I prompt mai personalizzati si aggiornano da soli.
5. **Modalità manutentore**, solo sull'istanza del proprietario: «Rendi testo di fabbrica» apre una PR su GitHub. Nelle istanze distribuite la fabbrica è in sola lettura.
6. **Nessun prompt protetto, ma due livelli:**
   - **primo livello:** regole comuni del turno, privacy e sicurezza, formato privato di raccomandazioni e marcatori, lingua; si modifica con una **doppia conferma**, cioè prima la modifica e poi una schermata di avvertenza sulle conseguenze;
   - **secondo livello:** passi, tono, contenuti, esempi; modifica normale.
7. **«Suggerisci al progetto»:** un'istanza manda la proposta al proprietario **via email o come issue su GitHub**. La fabbrica non cambia finché il proprietario non la accetta.

### Issue in ordine di lavoro

Una issue alla volta, perché toccano gli stessi file (`backend/prompt_registry.py`, `backend/prompt_health*.py`, `backend/prompt_config.py`, l'allineamento di fabbrica, `PromptHealthPage`).

1. **#775:** database come unica fonte, storico delle versioni, stato di ogni prompt, «Allinea» come azione multipla (vedi il commento del proprietario).
2. **#776:** proposte di aggiornamento di fabbrica (accetta, ignora, unisci a mano) e contatore.
3. **#778:** primo e secondo livello nel registro, doppia conferma per il primo livello.
4. **#777:** modalità manutentore, «Rendi testo di fabbrica» con una PR su GitHub (token configurato solo sull'istanza del proprietario).
5. **#779:** «Suggerisci al progetto» via email al manutentore o issue su GitHub.

Ogni PR: issue in inglese con `Closes #N`, milestone «Prompt ownership (Nov 2026)», `--project "CounselorBot"`, doc `docs-counselorbot/funzionalita-counselorbot.md`, `make guidance-check`.

## 3. Come far partire gli agenti Codex

- **Avvio in modalità yolo** (altrimenti si bloccano sui permessi ogni pochi minuti):

  ```bash
  herdr agent start <nome> --kind codex --pane <pane> --timeout 120000 -- --dangerously-bypass-approvals-and-sandbox
  ```

- **All'avvio** può comparire l'avviso di aggiornamento di Codex: si salta con `esc` (`herdr pane send-keys <pane> esc`).
- **Il bootstrap `j-cli-p` fallisce dalle worktree:** scriverlo nel prompt e aggiornare il diario dal Timoniere.
- **Worktree e branch:** come con `launch-task.sh` (`/Volumes/sviluppo/console-platform/portable/data/console/service-agents/Counselorbot/`). Lo script lancia Claude; per Codex creare la worktree e la scheda come fa lo script, poi usare `agent start --kind codex`.
- **Cartelle nuove:** può comparire la domanda di fiducia. Si risponde con `herdr pane send-keys <pane> down`, poi `enter`. Il testo del prompt si invia con `herdr pane send-text`, non con `send-keys`.
- **Modello:** `gpt-6.1-sol` (predefinito in `~/.codex/config.toml`, ragionamento `xhigh`).
- **Prompt di partenza:** quelli dei compiti di questa sessione in `service-agents/Counselorbot/prompt-*.txt` (ad esempio `prompt-health2.txt`) sono un buon modello: ruolo, worktree, compito, decisioni, test, regole su PR e conflitti, riepilogo in italiano.

## 4. Regole da rispettare (lezioni di questa sessione)

- **Unire solo con la CI verde**, compreso `tests (postgres)`. Il 31 ottobre, unendo senza aspettare quel test, si sono accumulate 30 regressioni (sistemate in #772). Il ratchet è stretto: un test che torna a passare va tolto da `backend/tests/postgres_known_failures.txt`.
- Le build desktop non bloccano le PR normali, ma il rilascio desktop sì.
- Su questo Mac (8 GB) gira **una sola suite del backend con un solo Postgres di test** alla volta: gli agenti controllano `docker ps` e rimuovono i propri container. Niente dev server, browser o build di produzione negli agenti.
- **Deploy sempre tramite `srv-deploy`:** backup, build del backend poi del frontend `--no-deps`, prune solo di immagini orfane e cache, mai volumi, stop se `/` scende sotto 8 GiB. Dopo un cambiamento di prompt si lancia «Allinea prompt di fabbrica» (`make_plan` + `apply_review` dal container).
- **Lanci degli agenti:** mai in un ciclo che riprova all'infinito. Una volta ha aperto otto schede.
- **Disco lento** durante le build: `git fetch` può dare «incorrect old value», basta riprovare dopo un po'.

## 5. Altro aperto (non per il 4 novembre, salvo indicazioni)

- **#773:** refactor dei loader segnalati da ESLint, per area.
- **#734:** Python 3.12 come predefinito e `AUTH_PROVIDER` fissato nel compose del portable.
- **Avviso «Salute dei prompt» su `evstudio-criticita` / `evprof-criticita`:** il passo dice «No advice yet», ma la regola del turno può permettere una strategia su richiesta. **Decisione aperta del proprietario:** nell'Evento di studio e in quello professionale le strategie si danno nell'ultimo passo o mai? Poi correzione nel codice e la regola del codice mostrata in sola lettura nel confronto.
- Avviso basso su Savickas: «cinque passi», ma i passi sono 7.
- **Cose del proprietario:**
  - scegliere il modello in «Salute dei prompt»;
  - approvare o togliere le 3 strategie in bozza sulle competenze sociali e le 15 letture di prova;
  - togliere `OPENCODE_CHAT_MODEL` dal `.env`;
  - più avanti, togliere `location /api/term` da nginx sul server ai4educ (`sudo ./update_nginx.sh`).
