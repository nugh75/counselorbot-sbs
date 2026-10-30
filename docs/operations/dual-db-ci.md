# CI backend su Postgres e SQLite (F1-05a)

> **Aggiornamento 2026-10-29**: SQLite non è più supportato. I job `tests (sqlite)` e `startup (sqlite)`, `sqlite_known_failures.txt` e i test solo-SQLite sono rimossi; `backend-db.yml` esegue solo Postgres (`ubuntu-24.04`, perché il graphviz di ubuntu-26.04 non ha i layout circo/twopi). Le sezioni SQLite sotto restano come storia.

La PR #522 implementa ADR-0003 §5 e l'issue #520. Non modifica il motore
F1-05b, le rotte applicative o il guscio F1-02. La PR resta **DRAFT**:
la revisione applicabile e l'accettazione dell'estensione Postgres descritta
sotto restano necessarie prima del merge, coordinato dal Timoniere.

## Provenienza della baseline

Head ereditato: `5feafc410c951e249fb6705a825ca098a1d11c85`.
Base del branch prima di F1-05a: `e3863061` (il relativo SHA completo si ricava
con `git rev-parse e3863061`). Le due esecuzioni complete hanno **gli stessi
48 node ID Postgres e 581 node ID SQLite**, confrontati dagli artifact,
non soltanto lo stesso numero di fallimenti.

| Run / tentativo | Checkout effettivo | Postgres | SQLite |
|---|---|---|---|
| [40065921563](https://github.com/nugh75/counselorbot-sbs/actions/runs/40065921563), 1 | head precedente `7625d765` | cancellata | cancellata |
| [40066013563](https://github.com/nugh75/counselorbot-sbs/actions/runs/40066013563), 1 | push `5feafc41` | 5018 pass, 48 fail, 10 skip | 4015 pass, 344 fail, 237 error, 10 skip |
| [40066026591](https://github.com/nugh75/counselorbot-sbs/actions/runs/40066026591), 1 | merge PR `982abb0`, base `b315fa7f` | 5033 pass, 48 fail, 10 skip | 4030 pass, 344 fail, 237 error, 10 skip |

La replica del vecchio head (`40066026591`, tentativo 2) è stata cancellata
dalla normale concorrenza della PR dopo il push del nuovo codice; non entra
nelle misure. La run `40065921563` non contiene artifact di fallimenti.

Conferma su `ddbdb18c`, con dipendenze corrette e ratchet rigoroso:

| Run | Postgres | SQLite |
|---|---|---|
| [40071395812](https://github.com/nugh75/counselorbot-sbs/actions/runs/40071395812), dispatch del branch | 5031 pass, 45 fail, 10 skip | 4028 pass, 341 fail, 237 error, 10 skip |
| [40071399643](https://github.com/nugh75/counselorbot-sbs/actions/runs/40071399643), merge PR | 5046 pass, 45 fail, 10 skip | 4043 pass, 341 fail, 237 error, 10 skip |
| `tests (postgres baseline)`, nello stesso dispatch, codice `e3863061` | 5016 pass, gli stessi 45 fail, 10 skip | — |

Tutte le suite riportano anche 23 subtest passati e zero voci nuove/non più
fallenti. I 45 node ID Postgres coincidono fra branch, merge PR e controllo
sulla base; i 578 SQLite coincidono fra branch e merge PR. Non sono emerse
differenze da flake nei node ID delle repliche confrontate. Entrambe le run
sono concluse con successo (cinque job nel dispatch, quattro nella PR).
I tre test OCR/PDF esclusi dalla baseline passano nel JUnit del dispatch.
La differenza di 15 pass tra branch e merge PR resta quella della base.
Ambiente registrato nei log: immagine `ubuntu-24.04` `20261012.334.1`,
Python 3.12, SQLite 3.45.1, SQLAlchemy 2.0.55, pytest 9.1.1,
psycopg2-binary 2.9.13, PyMuPDF/PyMuPDF4LLM 1.28.2. I requisiti restano quelli
del repository: prima di attribuire differenze al codice, confrontare anche
le versioni risolte e l'immagine runner delle run confrontate.

Dei 237 errori SQLite, 24 sono moduli non importabili: i test contenuti
**non sono eseguiti**.
La differenza di 15 pass tra push e PR deriva dai test di firma origine
aggiunti dalla base della PR; non è un miglioramento della compatibilità.
La run cancellata non è usata per popolare le liste. I numeri della prima
run `40064430312` precedono i fix alle 46 guardie URL e l'installazione di
Graphviz: non sono la baseline dell'head consegnato.

Tre fallimenti degli artifact sono esclusi dalle liste: i due test OCR in
`test_rag_pdf_upload.py` e il PDF con font Inter in `test_pdf_diagrams.py`.
Il runner installa ora Graphviz, Inter e i dati Tesseract italiano/inglese,
come l'immagine backend. Le liste iniziali contengono quindi **45 node ID
Postgres e 578 SQLite**, confermati dalle run con le dipendenze corrette.
Nessun nuovo errore va inserito per rendere verde CI.

## Estensione esplicita del contratto Postgres

ADR-0003 prescriveva il cricchetto solo SQLite. `postgres_known_failures.txt`
è un'**estensione proposta**, necessaria per introdurre una suite completa
bloccante senza confondere debito precedente e regressioni. Il verde significa
"nessun fallimento diverso dalla lista riprodotta", non "tutti i test passano".
L'estensione richiede revisione; questa PR non ne presume l'approvazione.

I fallimenti riguardano soprattutto aspettative dei prompt cambiate, mock
obsoleti, dipendenze dall'ordine dei test, concorrenza forum e riferimenti RAG
rimossi. Non sono tutti automaticamente errori dei test: finché non analizzati,
restano problemi osservati da diagnosticare. Non si cambia il prodotto in F1-05a.
I 15 file che contengono i 45 node ID Postgres sono identici byte per byte
alla base `e3863061`; anche il corpo della fixture Postgres ha lo stesso AST
(l'import di psycopg2 è soltanto spostato dentro la funzione). Nessun file
applicativo del backend è cambiato nel branch F1-05a.
Diversi hanno già bug nel Diario (fra gli altri forum privacy, QPCC brief,
parità prompt, component flags e smoke RAG); i restanti sono segnalati come gruppo.

Per riprodurre il controllo sul codice precedente al lavoro, il dispatch può
aggiungere un job Postgres sullo SHA completo della base:

```sh
gh workflow run backend-db.yml --ref chore/f1-05a-dual-db-ci \
  -f baseline_ref="$(git rev-parse e3863061)"
```

Il job `tests (postgres baseline)` estrae quella revisione in una directory
temporanea del runner, preservandone applicazione, fixture e test. Sovrappone
solo `conftest.py` (chiave effimera e registrazione fallimenti), la lista
Postgres e i quattro file di test con le guardie URL corrette in F1-05a.
Questi ultimi differiscono dalla base solo nelle guardie del database di prova.
Nessuna baseline è accettabile se il controllo presenta nuovi fallimenti o
voci che non falliscono più. Il dispatch normale esegue solo i quattro job.

## Uso e manutenzione

Il workflow parte per PR che toccano backend, controlli o workflow stesso,
oppure con `workflow_dispatch`. Il trigger push temporaneo è rimosso.
Postgres 15 usa esclusivamente il servizio effimero `counselorbot_test` del
runner; SQLite usa file in `RUNNER_TEMP`. Nessun database operativo è raggiunto.

```sh
# Test mirati sul Postgres di test (un solo container alla volta).
PYTHONPATH=. python3 -m pytest backend/tests/test_dual_db_checks.py -q
python3 scripts/check-sql-portability.py

# Suite completa: preferire CI remota.
PYTHONPATH=. python3 -m pytest backend/tests -q \
  --strict-known-failures --failures-out /tmp/postgres-failures.txt
```

`--failures-out` scrive node ID ordinati e univoci, anche per errori di setup
e raccolta. La CI pubblica anche JUnit XML. `--strict-known-failures` fallisce
per ogni voce che non fallisce più, incluse voci rimosse, saltate o deselezionate.
Nei test locali mirati, senza strict, le voci di moduli non eseguiti sono ignorate.
Un errore interno/di configurazione o un'interruzione di pytest resta bloccante.
Il cricchetto non è un marcatore xfail e conserva le diagnostiche originali.

Le liste sono istantanee revisionate: **si accorciano soltanto**. Non copiarvi
l'artifact di una nuova run automaticamente, non unire gli insiemi di run
discordanti per assorbire flake. Confrontare SHA, checkout effettivo, dipendenze
e node ID; diagnosticare ogni differenza. I test di migrazioni legacy possono
usare `@pytest.mark.postgres_only`, con motivazione. I moduli in baseline
possono coprire errori successivi al primo: quando tornano importabili, i nuovi
node ID emersi richiedono analisi e revisione, non un aggiornamento meccanico.

## Startup SQLite: due avvii reali (rimosso)

Il probe avvia il backend due volte sullo stesso file SQLite e accetta HTTP 200
(oppure 404 finché `/health` arriva con F1-02). Qualunque altro esito blocca:
dipendenze, import, timeout, errori SQL. Da F1-05c non esistono eccezioni: le
colonne dell'avvio passano da `db_compat.add_column_if_missing`, che controlla
la colonna con `sqlalchemy.inspect` e su Postgres mantiene `IF NOT EXISTS` per i
worker concorrenti. I log sono artifact del runner.

Nessun deploy, processo dev o rebuild Docker locale è necessario per F1-05a.
