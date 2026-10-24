# SQLite: carico e concorrenza con 30 studenti (F1-05h)

Riferimenti: [ADR-0003 §4](../architecture/adr/0003-dual-database-postgres-sqlite.md),
[piano desktop](../architecture/desktop-apps-plan.md). Prova locale del 24 ottobre
2026, Python 3.11.9, SQLAlchemy 2.0.55, SQLite 3.51.0, macOS arm64.

## Esecuzione ripetibile

Dalla radice del repository, con le dipendenze backend installate:

```bash
~/.pyenv/versions/3.11.9/bin/python -m pytest backend/tests/test_sqlite_load_concurrency.py
~/.pyenv/versions/3.11.9/bin/python scripts/benchmarks/sqlite_concurrency_stress.py \
  --students 30 --rounds 10 --chunks 6 --chunk-delay 0.01 \
  --json /tmp/sqlite-load-report.json
make guidance-check
```

Il benchmark crea e rimuove sempre un **file temporaneo proprio**; non usa il
database indicato da `DATABASE_URL` per il carico. Non avvia HTTP, tunnel o provider,
non richiede chiavi, non modifica dati reali e non lascia processi attivi. Per
eseguirlo nell'immagine backend: `python scripts/benchmarks/sqlite_concurrency_stress.py`.
`--students` indica thread simulati; il desktop mantiene **un processo uvicorn**.
`--workers` resta riservato al controllo di sicurezza dei processi del backend.

## Scenario e criteri di successo

- 30 thread studente, 10 turni ciascuno; ogni turno carica la configurazione con
  `AIService`, salva l'ingresso, committa e chiude, poi usa il dispatch streaming
  reale con un provider sostituito da sei chunk sintetici, distanziati di 10 ms.
- Una barriera al primo turno richiede che tutti i 30 provider siano attivi
  insieme: uno stream serializzato da una transazione rimasta aperta non supera
  questa verifica. Il budget mensile è attivo, per esercitare la query lazy.
- Ogni chunk aggiorna uno snapshot `FrozenSession` in una sessione di scrittura
  breve; a fine turno vengono salvati log e conteggio token. È un carico DB più
  frequente del normale log finale delle rotte; non introduce salvataggi per token
  nel prodotto.
- Un writer aggiuntivo aggiorna lo stato di manutenzione e cancella log scaduti
  sintetici con il pattern lettura/scrittura/commit dei cicli di retention; un
  lettore separato interroga i log. Si contano le operazioni terminate mentre
  almeno un provider è attivo. `_memory_cleanup_loop` è file based: non viene
  eseguito sullo store reale.
- Motore e `as_write_session` di produzione, pool ordinario, nessun retry nel
  benchmark. WAL, `busy_timeout=5000`, chiavi esterne attive, `synchronous=NORMAL`.
  Un listener SQLAlchemy raccoglie anche le eccezioni SQLite `locked`/`busy`.
- Uscita **0** solo se tutti i turni terminano, tutte le scritture/token risultano
  presenti, il picco raggiunge 30, lettore e manutenzione avanzano durante gli
  stream, non ci sono errori e `integrity_check` restituisce `ok`.

I percentili usano il metodo nearest rank, in millisecondi, includendo attese del
pool e dei lock. Il tempo al primo token parte dalla preparazione del turno,
non dal primo evento SSE di metadati; nel primo giro include l'attesa della
barriera. Il turno termina dopo il log finale. Non ci sono soglie di latenza
rigide dipendenti dalla velocità del runner.

## Misura locale

Comando sopra: **300/300 turni**, **1.800/1.800 token salvati**, picco **30 stream**,
**0 errori** e **0 lock exceptions**, `integrity_check=ok`, durata **7,712 s**.
Durante gli stream: **192 commit di manutenzione** e **428 letture** completati.

| Operazione | Campioni | p50 ms | p95 ms | p99 ms | massimo ms |
|---|---:|---:|---:|---:|---:|
| Primo token | 300 | 18,450 | 1.151,122 | 1.158,096 | 1.663,988 |
| Turno completo | 300 | 308,145 | 1.920,193 | 2.810,245 | 4.620,731 |
| Preparazione | 300 | 4,000 | 746,632 | 1.015,457 | 1.648,163 |
| Salvataggio chunk | 1.800 | 13,784 | 140,743 | 906,443 | 3.378,017 |
| Lettura | 429 | 1,671 | 45,172 | 125,377 | 672,884 |
| Manutenzione | 193 | 6,205 | 111,089 | 703,288 | 1.484,087 |

Esecuzione su macchina condivisa, anche durante un rebuild Docker: risultati
indicativi del carico sintetico, senza promessa di throughput o latenza su altri
PC. Il JSON completo si rigenera con il comando; non contiene conversazioni,
credenziali o dati reali.

## Confini delle transazioni verificati

| Percorso | Prima dello stream | Durante/dopo lo stream |
|---|---|---|
| `chat.py /chat/stream` | Preparazione sincrona e relativi HTTP 409/502 conservati; valori dello step, codici dei fattori e prompt del guardiano copiati; commit e close espliciti | Nessun riuso della sessione richiesta; log, mappa Idea, raccomandazioni ed errori in write session brevi |
| `site_chat.py /site-chat/stream` | Configurazione, permessi e persona risolti; commit e close prima anche del retrieval | Nessuna write session estesa al generatore; persistenza ed errori con sessioni brevi |
| `voice_reader.py /tts/stream` | Voce risolta, commit e close | Sintesi e streaming senza accessi DB |
| Budget `AIService` | Lettura indipendente senza ereditare `BEGIN IMMEDIATE` | Sessione chiusa prima del dispatch, anche se il budget è calcolato pigramente |
| Trasporto ChatGPT | Consenso, scelta del modello e credenziali verificati in una sessione breve; rinnovo serializzato in write session propria | Connessioni rilasciate prima di `responses.create`; stessa identità e lingua conservate |

`database.independent_read_session(db)` legge lo stato committato con un bind
Engine separato; i bind Connection delle fixture mantengono i savepoint. Va usata
con `with`, e il chiamante deve aver chiuso eventuali transazioni lunghe prima
del provider. Non committa scritture pendenti del chiamante. La preferenza ChatGPT
non apre più un secondo writer SQLite per una semplice lettura.

I test delle tre rotte usano sessioni/file reali e provider sintetici, con
successo, errore e disconnessione. Verificano che una scrittura pendente sia
visibile prima del provider, che un altro writer possa committare prima della
risposta e che la sessione della richiesta non venga riaperta. La preparazione
del prompt della chat e lo store di memoria sono sostituiti in queste regressioni;
i relativi test di comportamento restano separati. Altri test verificano la
lettura WAL con writer ancora aperto, il budget lazy e le credenziali ChatGPT
con e senza rinnovo, senza connessioni occupate all'ingresso nel trasporto.

## Limiti e operatività

- La prova non misura HTTP, tunnel, tokenizzazione, qualità o latenza del modello,
  retrieval reale, tutti i percorsi di preparazione dei prompt o l'intera lezione
  con 30 browser. Servono prove separate sul PC docente con provider e rete scelti.
- WAL consente letture durante una scrittura; SQLite resta un database con un
  writer alla volta. Il completamento di tutti i lavori e il test causale di
  lettura escludono starvation nello scenario misurato, non garantiscono equità
  per qualunque workload. Le scritture lunghe vanno evitate anche nei nuovi job.
- Nessuna modifica di schema o dipendenza. Il Dockerfile include il benchmark
  perché sia i test dell'immagine sia l'operatore possano eseguirlo offline.
- Nessun deploy o comando sudo richiesto. Le immagini di produzione non vengono
  avviate o riavviate da questo benchmark.
