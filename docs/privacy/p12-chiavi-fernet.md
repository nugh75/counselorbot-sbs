# P12 — migrazione delle chiavi Fernet

Riferimenti: [progetto §4.2 e §9](02-progettazione.md), [KeyRing P5](p5-crittografia-chiavi.md),
[cifratura contenuti P11](p11-cifratura-db.md). Questo blocco riguarda esclusivamente i segreti delle connessioni;
`PRIVACY_DB_ENCRYPTION` continua a controllare i contenuti indipendentemente.

## Attivazione e compatibilità

`PRIVACY_CREDENTIAL_ENCRYPTION=on` abilita le nuove scritture AES-256-GCM tramite il KeyRing di P5.
Richiede **una sola** fra `PRIVACY_KEK` e `PRIVACY_KEK_FILE`. Valori ammessi: `1/on/true/yes`, `0/off/false/no`;
un valore non riconosciuto blocca le scritture. Le DEK vengono create all'avvio prima delle richieste, fuori dalle
transazioni di scrittura SQLite. Le richieste non creano DEK mancanti; anche il bootstrap rifiuta di ricrearle
se trova già token versionati per quell’archivio. Non si memorizzano chiavi di questo servizio in una cache fra richieste:
una rotazione committata è usata dalla scrittura successiva senza riavvio.

**Default spento:** senza nuove variabili il deploy attuale continua a leggere e scrivere Fernet, con gli stessi
file/volumi e priorità delle variabili. L'attivazione è deliberatamente manuale: l'installazione non possiede
necessariamente una KEK di P5. La definizione «lettura vecchia/scrittura nuova» si applica dopo l'attivazione.
Non serve cambiare i volumi Docker. Il campo API `key_source=environment` indica la KEK quando lo switch è acceso.

## Chiavi e formato

| Archivio | DEK (`privacy_keys.purpose`) | Sorgenti Fernet precedenti, ancora necessarie per leggere i record vecchi |
| --- | --- | --- |
| API personali (settings e connections) | `cred_api` | `PERSONAL_API_ENCRYPTION_KEY`, `_FILE`, oppure `credential.key` gestita |
| Credenziali OAuth ChatGPT | `cred_chatgpt` | `CHATGPT_CREDENTIAL_KEY`, `_FILE`, oppure `credential.key` gestita |
| Copia visualizzabile password istituto | `cred_institute` | `INSTITUTION_CREDENTIAL_KEY`, `_FILE`, oppure chiave gestita nel volume API personali |

Tre DEK casuali indipendenti, avvolte dalla KEK e conservate in `privacy_keys`; restano separati i vecchi scopi
`credentials`, `content`, `mapping`, `research`, `pid`, `index`. La migrazione aggiorna il CHECK di `privacy_keys`
su Postgres; SQLite usa l'allineamento CHECK di F1-05g all'avvio. Nessuna modifica alle colonne dei segreti.

Token nuovi: `v1.<key_id>.<base64url(nonce|ciphertext|tag)>`, nonce casuale di 96 bit, DEK AES di 256 bit.
AAD `credential_store:<purpose>:v1`: un token copiato in un altro archivio non si apre. L'AAD non include l'id della
riga; per le API personali resta il controllo dell'account/provider/connessione nel JSON cifrato preesistente.
Il blocco non aggiunge un legame per riga ai token OAuth o istituto.

La lettura sceglie dal prefisso `v1.` anche se lo switch è spento. Un token versionato malformato, alterato o di
un altro archivio non passa mai al lettore Fernet. Chiave assente/KEK errata/DEK irrecuperabile ⇒ `keyMissing`;
formato/integrità errati ⇒ `notConfigured`. Gli errori contengono solo codici fissi e nessun segreto.
Le API personali e ChatGPT conservano i propri errori applicativi; l'app risponde 503 con codice
`privacy.errors.credential_keyMissing`/`privacy.errors.credential_notConfigured` per gli errori della copia istituto.
In modalità DEK la copia istituto fallisce esplicitamente, senza salvare `None` al posto del segreto; il fallback
storico della copia opzionale rimane soltanto per Fernet con switch spento.

## Passi manuali per il deploy

1. Salvare e verificare backup coerenti del database **e** di tutte le chiavi Fernet/volumi; conservarli separati
   dal kit di recupero KEK. Provare il ripristino su dati isolati. Non rigenerare chiavi mancanti.
2. Predisporre la KEK con il canale segreti dell'installazione, esportare e verificare un kit di recupero P5.
   Non inserirla in comandi registrati, PR, log, file `.env` committati o backup del database.
3. Distribuire la nuova immagine backend con lo switch spento e verificare le connessioni esistenti.
   Questo aggiornamento non richiede sudo o modifiche nginx. Nessun deploy viene eseguito da questo lavoro.
4. Impostare `PRIVACY_CREDENTIAL_ENCRYPTION=on` nello stesso ambiente protetto del backend e riavviarlo.
   Un errore KEK blocca l'avvio: correggere la configurazione o ripristinare la chiave, senza fallback automatici.
5. Verificare una lettura vecchia e una nuova scrittura per ciascun archivio su una copia isolata prima del rollout.

## Ricifratura idempotente

La sola lettura non modifica righe. Nuovi salvataggi/rinnovi usano la DEK attiva. Per i record rimasti, fermare
**tutti** i processi che scrivono credenziali e tutte le rotazioni; mantenere gli stessi segreti protetti del backend.
Con ambiente configurato e schema già aggiornato, dalla radice (o dentro la nuova immagine):

```sh
python -m backend.privacy.credential_migration --apply --batch-size 100
```

Il comando richiede lo switch acceso; non attiva la migrazione, non legge file `.env`, non stampa chiavi, token,
identificatori o contenuti. Restituisce soltanto `scanned` e `rewritten`. Processa settings API, connections API,
ChatGPT e istituti in ordine di chiave primaria; ogni lotto viene committato. Verifica anche i token già correnti,
salta quelli sulla DEK attiva e riscrive Fernet o DEK ritirate. Un errore ferma il job, annulla il lotto corrente e
lascia committati i lotti precedenti: ripetere il comando dopo il ripristino della chiave. Il job non cambia
username, provider, routing, verificatori password, preferenze o contenuto JSON. Un lotto contiene al massimo
`batch-size` righe per tabella; non eseguire in parallelo con l'app.

## Rotazione, perdita chiavi e rollback

- In una sessione amministrativa P5: `KeyRing(db).rotate("cred_api")` (oppure `cred_chatgpt`/`cred_institute`), poi
  `db.commit()`. Le altre due DEK restano attive. I record vecchi restano leggibili grazie alle chiavi ritirate.
  Per completarvi la rotazione usare lo stesso job. Non cancellare le righe delle chiavi ritirate.
- Rotazione KEK: `KeyRing.rewrap(new_kek)` di P5 avvolge **tutte** le chiavi, comprese le tre nuove; coordinare
  arresto dei worker, commit, aggiornamento del segreto e kit di recupero. Non cambiare solo la variabile KEK.
- KEK o DEK perduta: ripristinare la KEK dal kit o le righe avvolte dal backup coerente; una chiave nuova non
  recupera i segreti precedenti. Un token versionato non viene provato con la chiave Fernet.
- Switch spento: le nuove scritture tornano Fernet; con questa versione i token DEK restano leggibili con la KEK.
  Conservare quindi entrambe le famiglie di chiavi. Il codice precedente a P12 non legge i token DEK: per tornare
  a quella versione occorre ripristinare insieme backup pre-migrazione di database e chiavi.
- Conservare le chiavi Fernet finché esistono righe **o backup trattenuti** che le richiedono. Il job non elimina
  mai chiavi, backup, volumi o dati.

## Verifiche

`TEST_DB=sqlite|postgres python -m pytest backend/tests/test_privacy_p12_credentials.py`: lettura Fernet da env/file/
chiave gestita senza nuove variabili, scrittura DEK per tutti gli archivi, rotazioni indipendenti e rewrap KEK,
chiavi mancanti/errate, assenza di fallback, token alterati/scambiati, servizi applicativi, riscrittura idempotente
di tutte le colonne e perdita chiave durante il job. Chiavi e segreti dei nuovi test sono generati a runtime.
