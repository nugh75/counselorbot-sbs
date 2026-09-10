# Laboratorio prompt: pilota locale

Il pannello **Amministrazione → Monitoraggio → Esperimenti sui prompt** permette
prove manuali su step QSA non di sintesi. L'amministratore sceglie obiettivi e
criteri, lingue, modelli locali che preparano i casi, propongono le modifiche,
valutano e rispondono. Lo stesso modello può ricoprire più ruoli, che restano
registrati separatamente. La finalità «Sola verifica» non genera candidati.

Il pilota usa casi sintetici, profili QSA neutri (5/9) e ingresso nello step.
Usa la preparazione condivisa della chat su una copia temporanea, oltre alla
pulizia della risposta visibile. Non riproduce persona del counselor, retrieval,
skill dinamiche, Taccuino e memoria di conversazioni reali. Queste limitazioni,
insieme alle lingue mancanti, **bloccano l'attivazione reale**: un risultato
tecnico positivo non certifica un prompt condiviso in tutti i suoi contesti.
La decisione atomica e il ripristino sono implementati e verificati su database
di test; completare il replay rappresentativo e la copertura è ancora necessario
prima di consentire «Accetta e attiva» in produzione. Non esiste un pulsante per
ignorare questi blocchi. Nessun prompt attivo viene modificato durante le prove.

## Orientarsi nel pannello

**Dove interviene la proposta** mostra il percorso «Chat guidata → QSA → ingresso
nel passaggio», il nome del passaggio evidenziato tra quelli del percorso e il
suo testo. Durante la creazione è un'anteprima della configurazione attuale;
quando si apre un esperimento, nomi, ordine e testo provengono dalla copia
congelata alla sua creazione. Il codice tecnico resta consultabile nei dettagli.
L'elenco degli esperimenti mostra anche il nome storico del passaggio.

Il bersaglio è il campo `guided_steps.prompt`: le istruzioni che avviano quel
passaggio. Il sistema le carica quando la chat richiede il prompt della fase e
non fornisce un messaggio sostitutivo. Non è l'intero prompt composto per il
modello: direttive generali, system prompt, riferimenti pedagogici e contesto
contribuiscono separatamente. La modifica, se attivabile e approvata, sarebbe
condivisa dalle sessioni che caricano quel passaggio, non limitata al modello
scelto per la prova. Il pilota non modifica Bussola, IDEA o altri strumenti.

Ogni candidato presenta un breve **Pro e contro della proposta**, prima del
confronto dei testi. Il beneficio atteso è esplicitamente un'ipotesi del
proponente. I vantaggi e gli svantaggi misurati confrontano risposte che superano
i controlli, mantenendo separati modello, lingua e insieme di validazione o
verifica finale. Campioni mancanti, di dimensione diversa o con errori non
vengono presentati come vantaggi. Le ripetizioni non sono studenti diversi e i
conteggi non sostituiscono l'esito complessivo del protocollo. Il report mostra
anche limiti e blocchi dell'attivazione, senza nuove chiamate AI.

L'API amministrativa `GET /admin/prompt-experiments/options` include nei target
`label_i18n`, `sort_order`, `prompt`, `system_prompt_mode` e `questionnaire_type`
per rendere consultabile l'anteprima; le prove salvate usano lo snapshot esistente.

## Avvio

Il file Compose ordinario lascia il laboratorio disattivato. Per abilitarlo:

```bash
docker compose -f docker-compose.yml -f docker-compose.prompt-lab.yml build backend frontend prompt-lab-init prompt-lab-worker prompt-lab-model-gateway
docker compose -f docker-compose.yml -f docker-compose.prompt-lab.yml up -d prompt-lab-model-gateway prompt-lab-worker
docker compose -f docker-compose.yml -f docker-compose.prompt-lab.yml up -d --no-deps backend frontend
```

Il bootstrap genera password diverse in volumi dedicati. `prompt-lab-postgres`
contiene solo `prompt_lab`; `prompt-lab-init` crea le tabelle, applica le estensioni
idempotenti e assegna i permessi. Il backend monta soltanto le credenziali owner;
il worker soltanto quelle del ruolo limitato. Nessuna porta del laboratorio è
pubblicata. Il database operativo e i suoi volumi rimangono separati.

Il worker ha filesystem in sola lettura e una cartella temporanea per il
componente di memoria condiviso. È collegato esclusivamente alla rete interna
`lab-execution`, senza credenziali applicative o di provider esterni. Il gateway
espone solo elenco, metadati e chat verso l'Ollama locale configurato. Rifiuta
redirect, modelli cloud e metadati privi di pesi locali. Ollama può esporre modelli
cloud anche sull'indirizzo locale: il solo hostname non garantisce inferenza
locale ([documentazione Ollama](https://docs.ollama.com/cloud)).

`PROMPT_LAB_OLLAMA_UPSTREAM` e `PROMPT_LAB_EGRESS_SUBNET` sono opzionali; vedere
`.env.example`. Non copiare il `DATABASE_URL` di produzione nel laboratorio.
Usare sempre entrambi i file Compose nei successivi aggiornamenti del backend,
altrimenti viene rimossa la configurazione aggiuntiva. Per aggiornare lo schema,
eseguire nuovamente `prompt-lab-init` prima di aggiornare il worker.

Per sospendere le nuove prove senza perdere dati:

```bash
docker compose -f docker-compose.yml -f docker-compose.prompt-lab.yml stop prompt-lab-worker
```

Non rimuovere i volumi per fermare o aggiornare il laboratorio. Il backup del
laboratorio riguarda il suo database e i volumi delle credenziali; le ricevute
di decisione e le revisioni dei prompt fanno parte del backup applicativo.

## Prove e decisioni

1. Creare un esperimento con un obiettivo e un criterio osservabile.
2. Selezionare i preset: vengono congelati parametri, versioni dei modelli,
   prompt e dipendenze. Un modello mancante non viene sostituito automaticamente.
3. Preparare i casi sintetici, rivederli ed eventualmente correggerli. Servono
   almeno due casi per lingua e insieme; il miglioramento usa sviluppo,
   validazione e verifica finale, la sola verifica gli ultimi due.
4. Confermare la revisione e avviare. Budget massimo: 240 chiamate, 60 minuti,
   sei modelli da testare e due proposte. Anche giudizi, calibrazione e retry
   consumano il budget. Un solo worker opera alla volta. I limiti valgono per ciascuna esecuzione,
   inclusa la preparazione. L’inferenza usa l’Ollama locale condiviso: database e
   rete del worker sono separati, la GPU non è riservata al laboratorio.
5. Consultare risposte, differenze, controlli critici, esiti per obiettivo,
   modello e lingua, errori e cronologia. Il selettore delle esecuzioni recupera
   anche i risultati precedenti. I dettagli tecnici contengono hash, limiti,
   calibrazione e tentativi.
6. Rifiutare una proposta motivando la decisione. L'accettazione rimane vincolata
   a prove complete, vantaggio verificato, copertura e versione ancora corrente.
   Il ripristino di una proposta già accettata protegge eventuali modifiche
   amministrative successive e non dipende dalla disponibilità del DB laboratorio.

La calibrazione controlla che il giudice distingua due risposte predefinite;
non dimostra accuratezza generale. I suoi giudizi restano rivedibili. Errori,
risposte troncate e giudizi assenti non diventano successi. Le ripetizioni hanno
numerosità uguali fra baseline e candidati; un miglioramento aggregato non
compensa regressioni su un modello, lingua, obiettivo o controllo critico.
I gruppi e i messaggi identici non possono attraversare insiemi diversi; la
revisione umana deve controllare anche le somiglianze semantiche.

I casi diventano immutabili dopo la prima valutazione. Un esperimento di sola
verifica può essere ripetuto; un miglioramento richiede un nuovo esperimento
con casi indipendenti, per non riutilizzare la verifica finale nella ricerca.
Non sono implementati importazione di conversazioni reali, raccolta automatica
dei problemi, pianificazione notturna e completamento della matrice di copertura.

## API e archiviazione

Tutti gli endpoint `/admin/prompt-experiments` richiedono l'amministratore
applicativo, compresi quelli di lettura. Il frontend usa il proxy `/api`.

| Metodo | Percorso relativo | Funzione |
|---|---|---|
| GET | `/options` | Disponibilità, preset locali attivi, step, lingue |
| GET / POST | radice | Elenco / creazione con obiettivi e modelli |
| GET | `/{id}` | Dettaglio; `result_run_id` seleziona risultati storici |
| POST | `/{id}/prepare` | Generazione dei casi, poi attesa della revisione |
| PUT | `/{id}/cases` | Salvataggio dei casi prima delle prove |
| POST | `/{id}/run` | Avvio con `cases_reviewed: true` |
| POST | `/{id}/cancel` | Arresto prima della prossima chiamata |
| POST | `/{id}/decision` | Accettazione/rifiuto con hash, candidato e motivazione |
| POST | `/{id}/restore` | Ripristino con hash e motivazione |

`lab_experiments`, `lab_runs`, `lab_results` sono separati dalle tabelle operative.
`prompt_experiment_decisions` conserva ricevute univoche nel DB applicativo,
insieme alle revisioni con origine `admin`. Aggiornamento del prompt, revisione
e ricevuta sono nella stessa transazione. Un retry della stessa decisione
restituisce la ricevuta; una decisione incompatibile riceve 409.

## Verifica del rilascio

```bash
.venv/bin/python -m pytest backend/tests/test_prompt_lab*.py -q
cd frontend
npx tsc --noEmit
npm run i18n:check
node --experimental-strip-types --test tests/prompt-lab.test.mjs
```

I test PostgreSQL richiedono `DATABASE_URL` e usano esclusivamente uno schema
transazionale in `counselorbot_test`. Quelli di isolamento vanno eseguiti nel
worker con `PROMPT_LAB_DEPLOYMENT_TEST=1`; non scrivono dati di produzione.

Il 10 settembre 2026 è stata eseguita una verifica tecnica sintetica con il
preset Qwen locale 12: quattro risposte, dieci chiamate comprensive dei giudizi,
calibrazione superata e nessun errore di trasporto. Il giudice ha segnalato zero
successi sull'obiettivo della domanda focalizzata. È un controllo del circuito,
non una valutazione educativa. È conservato anche il primo tentativo fallito
prima delle chiamate, che ha evidenziato la cartella temporanea da configurare.
Il codice di presentazione è stato successivamente allineato alla pulizia dei
blocchi privati della chat; le prove anteriori restano riconoscibili dallo hash.


La prova di miglioramento con protocollo 1 ha completato 35 chiamate e 16
risposte: una variante, 3/4 successi finali contro 1/4 della baseline. Il rapporto
originale resta conservato. L'oscillazione fra ripetizioni impedisce di trattare
quel vantaggio come stabile: una lettura offline con il protocollo 2 restituisce
`inconclusive`, senza riscrivere il rapporto storico. Il protocollo 2 fissa questa
regola prima delle nuove prove e lega ogni risposta all'hash del testo testato.
Il cambio di protocollo e di dipendenze rende obsolete le vecchie proposte.

Verifiche completate: 62 test locali; 2 test di isolamento dal worker; 3 test
PostgreSQL (decisioni/ripristino e regressione delle revisioni); 9 prove browser
nelle sei lingue, compresi mobile, temi, selezione di due modelli, più obiettivi
e decisioni su fixture. TypeScript, lint dei file interessati, controllo i18n e
build Docker completati. I tre test saltati nella suite locale sono eseguiti nei
rispettivi container. Nessuna ricevuta di attivazione in produzione; prompt
operativi confrontati con gli snapshot e rimasti invariati.
