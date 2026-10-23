# QSA e Prompting: diagnosi del 13 ottobre 2026

Task Diario `5ef78f32-f179-41fe-84ce-791dc90722f8`, branch
`fix/qsa-prompting-regression`, base `cfb48674` (merge PR #252).
Segnalazione `7202fceb-a1b6-47cf-a549-aed35c80a7bc`: rimane sospetta finché
non è dimostrato che la sessione dell'utente abbia incontrato il difetto sotto.

## Evidenze di versione, tutte in lettura

- Frontend operativo: container `counselorbot-portable-counselorbot-frontend-1`,
  identificatore `.Image` `7777c19dfec0`, creato `2026-10-13T09:10:37Z`;
  build Next `GEf8yCNVVekTK2S3SzSPs`. Il manifest del tag frontend è `14be720cb553`:
  Docker può esporre digest diversi per configurazione e manifest. I digest
  differenti da soli non provano un rollback.
- Backend operativo: container `counselorbot-portable-counselorbot-backend-1`,
  `.Image` `bed91a94925a`, creato `2026-10-13T09:10:35Z`. SHA256 dei file
  `prompt_config.py`, `chat_logic.py`, `routes/admin.py`, `main.py` identici al
  worktree `cfb48674`. Non sono stati letti o mostrati segreti né prompt personali.
- Query in transazione PostgreSQL `SET TRANSACTION READ ONLY`: QSA ha dieci step,
  con id, ordine e modo uguali al seed. Gli id ordinati sono `intro`, `cognitive`,
  `affective`, `sl-elaboration`, `sl-selfcontrol`, `sl-motivation`, `sl-emotions`,
  `sl-attribution`, `sl-social`, `sl-synthesis`. Si aggiungono le fasi fisse
  Domande/Conclusione nella UI. Il numero di domande suggerite è stato controllato
  per step, senza leggerne i testi.
- GET `/qsa/guided-ui-texts?questionnaire_type=QSA&lang=it` direttamente sul
  backend e tramite il proxy frontend: HTTP 200, stessi dieci id. Il percorso
  esiste nel DB; questo controllo puntuale non esclude errori transitori precedenti.
- Il reset locale di main da `247aa54c` a `ed5a44a7` compare nel reflog.
  `git diff 247aa54c cfb48674 -- frontend/src/components/admin/ConfigForm.tsx
  frontend/src/components/admin/PromptMap.tsx frontend/src/components/qsa/ChatWorkspace.tsx`
  è vuoto. Le nove linee cambiate in `GuidedChatInterface.tsx` riguardano QPCC.
  Il reset non dimostra una perdita di queste UI.
- Il ridisegno della Mappa è nei commit `35e726f7` (PR #49), `809a0288`
  (livelli/step espandibili) e `b90c4213` (struttura step, PR #52), tutti già
  inclusi in main. Le copie di questi componenti nella cronologia riscritta sono
  equivalenti. Il bundle operativo contiene la Mappa; la sua suite browser con
  API sintetiche passa 22/22 sull'artefatto distribuito.
- PR #253: OPEN, head `f870b08cc065db88d978316a63cb72a9844a2d57`, non distribuita.
  Non cambia ConfigForm, PromptMap o GuidedChatInterface rispetto alla base.
  Nessun difetto correlato alla segnalazione è stato identificato nel suo diff;
  non è una causa della regressione di produzione.

## Difetto riprodotto e correzione circoscritta

Bug separato confermato nel Diario: `945e01ec-3457-40bb-89d1-82657baa70d6`.
Un errore HTTP, di rete o JSON nel caricamento degli step faceva entrare il QSA
completo nel fallback `questions/conclusion`. I dieci step sparivano e veniva
richiesto un turno AI per le domande finali. Nessun avviso permetteva di ritentare.
`git blame` attribuisce il fallback a `4917ee49d` (13 aprile 2026): è un
difetto preesistente, non introdotto dalla PR #252.

Il test sull'immagine originale, con una sola risposta sintetica 503, fallisce:

```text
No recoverable load error: requested phases=questions
```

La correzione mostra un errore localizzato e Riprova. Il retry rilegge gli step
per la stessa sessione senza sostituire prompt o dati; ripristina fase e messaggi
congelati e non genera un turno AI di domande finali. Il percorso essenziale QSA
continua a usare le proprie fasi. Il fallback degli altri strumenti è invariato.

La riproduzione prova il difetto del codice, non che il 503 sia stato ricevuto
dall'utente il 13 ottobre. La diversa UI Prompting ricordata dall'utente non è
stata ancora identificata; non va dichiarata ripristinata né inventata.
La Mappa disponibile si apre da Sezione oppure direttamente con
`/admin?section=prompt-map&instrument=QSA`. La vista classica per strumento e
Generale restano raggiungibili dallo stesso selettore.

## Ripetere le prove senza produzione

Installa le dipendenze frontend e avvia lo script isolato:

```bash
./scripts/dev-qsa-prompting-frontend.sh
```

Lo script esclude i file ambiente, usa un backend irraggiungibile e ascolta solo
su `127.0.0.1:3158`. Le suite intercettano le API con dati sintetici; non serve DB.
In un altro terminale:

```bash
cd frontend
QSA_PROMPTING_BASE_URL=http://127.0.0.1:3158 node --test tests/qsa-prompting-regression.test.mjs
PROMPT_MAP_BASE_URL=http://127.0.0.1:3158 node --test tests/admin-prompt-map.test.mjs
QPCC_BASE_URL=http://127.0.0.1:3158 node --test tests/qpcc-alignment.test.mjs
```

La suite QSA verifica dieci step su mobile/desktop, avanzamento dalla fase
ripresa, riapertura del pannello salvato chiuso e retry dopo HTTP503, errore di
rete e JSON invalido. Le richieste verso origini esterne sono bloccate.
La suite Prompting verifica anche espansioni, editor, livelli ereditati, step e
varianti; ogni sua scrittura è simulata nel browser.

Il build Docker dedicato esclude `.env*` tramite `frontend/.dockerignore`:

```bash
docker build -t s9-qsa-prompting-frontend:local \
  --build-arg BACKEND_ORIGIN=http://127.0.0.1:9 \
  --build-arg NEXT_PUBLIC_API_URL=/api \
  --build-arg NEXT_PUBLIC_APP_URL=http://127.0.0.1:3159 frontend
docker run -d --name s9-qsa-prompting-fixed -p 127.0.0.1:3159:3000 \
  -e HOSTNAME=0.0.0.0 -e BACKEND_ORIGIN=http://127.0.0.1:9 \
  -e NEXT_TELEMETRY_DISABLED=1 s9-qsa-prompting-frontend:local
```

Per le suite sostituisci la porta con 3159. Verifica prima che sia libera.
Stop: Ctrl+C per lo script; `docker stop s9-qsa-prompting-fixed` per il container.
Nessun volume operativo è collegato. Il backend non cambia e non richiede rebuild.

## Passi conservativi per l'operatore

Non eseguire reset di alberi, allineamento dei prompt di fabbrica o scritture DB
per questa segnalazione: nessuna perdita di step è stata dimostrata.
Se la UI continua a differire, identificare prima il disegno atteso (riferimento
visivo o revisione), l'URL aperto e il build servito al browser. Per QSA verificare
lo stato della richiesta `guided-ui-texts` senza esportare payload, prompt o log
privati; il pannello può essere riaperto da Mostra pannello su desktop o
Opzioni → Percorso su mobile. Non cancellare preferenze o sessioni come tentativo
alla cieca. Un successivo intervento operativo va riferito al Timoniere prima di
qualsiasi scrittura. Nessun deploy, merge, sudo o operazione di recovery è incluso.

## Stato della verifica e della PR

Il fix è implementato, con review indipendente senza blocker (stesso modello
scelto esplicitamente dall'utente). Verificati: 429 test unitari, TypeScript,
lint mirato, i18n e guidance-check. Sul codice corretto è osservato il successo
anche del singolo retry HTTP503. I conteggi22/22 Prompting,8/8 QPCC e3/3 QSA
sopra si riferiscono all'artefatto precedente, non al nuovo build.

La suite finale6/6 e il risultato del build Docker dedicato restano da attestare:
al cambio del profilo di esecuzione le sessioni tool sono state perse. La nuova
sandbox nega il socket Docker, l'avvio di Chromium, la scrittura dell'indice Git
del worktree e la rete GitHub. Nessun commit, push o PR è stato creato; il task
Diario non è chiuso. Per riprendere servono le capacità di esecuzione già
autorizzate, poi test finali, commit atomici e PR con check verdi. Nessun intervento
in produzione o operazione di recovery è richiesto da questo handoff.
