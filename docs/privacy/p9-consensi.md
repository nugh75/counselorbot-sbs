# P9 — Documenti, finalità e scelte privacy (backend)

Implementazione tecnica di [02 §7](02-progettazione.md#7-informative-consensi-finalità),
issue #582. Testi e decisioni del titolare/DPO restano **[DA VALIDARE]**:
questa implementazione non attesta conformità. La UI P10 resta da costruire.

## Persistenza e avvio

- `privacy_documents`: metadati immutabili per kind/version/locale, SHA-256 del
  contenuto, riferimento al corpo, data di pubblicazione, `requires_new_consent`.
- `privacy_purposes`: chiave, descrizioni i18n, base giuridica, consenso richiesto,
  attivazione, riferimento alla conservazione e `document_kind` pertinente.
- `privacy_events`: scelte append-only; P9 usa i campi documento/versione/scelta/
  scadenza già predisposti da P7 e aggiunge `document_locale`, necessario per
  distinguere versioni omonime nelle diverse lingue. Timestamp UTC a microsecondi.

La migrazione `20261025_privacy_consent` parte da `backend.main`, funziona su
SQLite e Postgres ed è idempotente. Crea otto finalità (`guided_chat`,
`teacher_noticing`, `teaching`, `orientation`, `research`, `teacher_sharing`,
`survey_feedback`, `administration_validation`), tutte inattive con base
`undefined` e descrizione **[DA VALIDARE]**. Un secondo avvio conserva le
configurazioni del titolare. Non pubblica automaticamente documenti o bozze.
Su installazione nuova l'elenco documenti è quindi vuoto.

Le bozze [P16](bozze/README.md) restano riferimenti di lavoro. Dopo le decisioni
P0, un operatore autorizzato può pubblicare metadati usando
`consent.publish_document(db, kind=..., version="1.0.0", locale="it",
body_ref=..., content=bytes_del_corpo, requires_new_consent=...)` e committare.
Il corpo deve stare in un archivio immutabile accessibile al client: P9 non
implementa un CMS né recupera URL esterni. L'hash è calcolato sui byte effettivi;
la stessa versione/lingua/tipo non può essere sostituita attraverso l'helper.
È responsabilità dell'operatore mantenere il riferimento coerente con l'hash.
La pubblicazione di metadati non equivale ad approvazione legale.

## API per P10

Rotte relative al backend (proxy web con prefisso `/api`). Nessuna API consente
al client di cambiare basi, pubblicare testi o scegliere per un altro utente.
Le scritture e la cronologia usano l'identità autenticata originale, senza
applicare la modalità amministrativa «vedi come».

| Metodo e rotta | Contratto |
|---|---|
| `GET /privacy/documents?locale=it` | Documento corrente per ogni tipo, nella lingua esatta; nessun fallback implicito. Esclude pubblicazioni future. Include hash, body_ref, versione, flag e stato `[DA VALIDARE]`. |
| `GET /privacy/purposes` | Finalità configurate; `active=false` anche se il flag è true ma la base resta undefined. |
| `GET /privacy/choices` | Scelte effettive per finalità/target e cronologia propria; `granted` è ricalcolato, senza cache. Non include PID di altri soggetti. |
| `POST /privacy/notices` | `{ "document_id": 12 }`; registra solo `notice_viewed`. |
| `POST /privacy/choices/{purpose}` | `{ "document_id": 12, "granted": true }`; booleano rigoroso, documento corrente e del tipo previsto. `valid_until` opzionale, UTC futura. |
| `POST /privacy/choices/{purpose}/revoke` | `{}` per finalità generiche; revoca disponibile anche con finalità disattivata o documento cambiato. |

Per `teacher_sharing`, scelta e revoca richiedono anche `teacher_username` e
`group_id`. La condivisione riguarda **solo il taccuino**, solo lo studente
stesso, solo una classe attiva di cui è membro, e il docente proprietario o
co-docente autorizzato (con controllo istituto quando applicabile). Portfolio,
obiettivi e sintesi restano fuori da questo incremento: nessuna condivisione
generica implicita. I campi aggiuntivi nei payload sono rifiutati (422).

Gli errori privacy hanno codici fissi: 403 `privacy.errors.purpose_disabled`,
`privacy.errors.policy_blocked` o `privacy.errors.access_denied`; audit non
persistibile ⇒ 503 `privacy.errors.audit_unavailable`. Richieste anonime alle
scelte ⇒ 401. Una presa visione non abilita alcuna finalità.

## Regole del consenso

Lo stato deriva dall'ultimo evento di scelta del soggetto per finalità/target;
le prese visione non sostituiscono le scelte. `undefined` e finalità inattive
negano l'abilitazione, anche con vecchio consenso. Un rifiuto riguarda solo
quella finalità; funzioni indipendenti e lettura dei propri dati restano valide.
Non si registra consenso positivo per finalità che non lo richiedono (la base
`consent` lo richiede comunque). Rifiuto e revoca non richiedono una base attiva.

La nuova versione richiede nuovo consenso solo se esiste un aggiornamento
successivo nella stessa lingua e dello stesso tipo con
`requires_new_consent=true`. La barriera resta anche se una terza versione è
minore e ha flag false. Si può allora accettare il documento corrente. Una
pubblicazione futura o in un'altra lingua non invalida la scelta esistente.
La scadenza viene verificata a ogni lettura, senza cache.

`consent.require_purpose(db, ctx)` è il controllo persistente per le nuove
funzioni. Il gateway P6 usa il resolver P9 per default: `strict` applica il
blocco per base undefined/consenso assente; `transitional` continua a contare
le verifiche senza bloccare le rotte AI esistenti. Questo rilascio non cambia
il default transitional e non introduce una richiesta globale di consenso.

## Grant P7 e transazioni

Ogni consenso al taccuino crea un grant distinto con `basis=consent`, categoria
`notebook`, scopi `teaching`/`orientation`, e riferimento all'evento. Il target
dell'evento contiene solo ID classe e PID del docente, mai il suo username.
Rifiuto/revoca chiudono i grant `consent`/`student_share` di quel docente/classe;
i grant istituzionali rimangono separati. Il controllo P7 seleziona il grant
adatto alla categoria/finalità e riverifica anche consenso, versione e scadenza
prima della lettura. Le sincronizzazioni di iscrizione/co-docenza non riattivano
mai i grant di consenso revocati. Uscita dalla classe e rimozione co-docente
continuano a revocare tutti i grant interessati.

Evento, grant e revoca condividono una transazione; audit fallito ⇒ rollback.
`record_privacy_event(..., commit=False)` permette il flush senza commit
anticipato; il comportamento preesistente `commit=True` resta disponibile.
I lock usano la connessione già associata alla transazione, evitando un secondo
writer SQLite quando la sessione ha già effettuato scritture.

## Flussi client precedenti

In `survey.py` sono aggiunte soltanto chiamate di registrazione evento:

- `/survey`: il client storico controlla la casella ma non invia il booleano.
  Si registra un'osservazione `consent_given`, `target=legacy_client`, marcata
  `unversioned`/`client_only`, con PID casuale per invio anonimo. Non è prova
  verificata del consenso e non può autorizzare una finalità P9.
- `/instruments/{code}/score`, con salvataggio: solo un booleano effettivo in
  `response_metadata.consent` produce `consent_given`/`consent_refused` per
  `administration_validation`. Stringhe e campo assente non producono eventi.
  Nessuna versione viene inventata a partire da `version_label` dello strumento.

Nessun cambiamento a validazione, scoring o interfaccia dei flussi precedenti.
Gli eventi contengono solo metadati controllati, PID e contatori; nessuna
risposta, score, commento, username, testo del documento o metadato libero del
client. Le osservazioni legacy non entrano nello stato di consenso versionato.

## Verifiche e limiti

Test mirati in `backend/tests/test_privacy_p9_consent.py`, più regressioni
P7/P6 e contratti privacy. Esecuzione con Python 3.11, `TEST_DB=sqlite` oppure
`TEST_DB=postgres` e un database di test dedicato. Inclusi migrazione ripetuta,
rifiuto indipendente, versioni intermedie, lingue, scadenze, revoca immediata,
isolamento docenti, rollback, autenticazione, eventi legacy e assenza di testo
libero. Nessun dato di produzione usato. P0, pubblicazione dei documenti e UI
P10 sono passaggi successivi espliciti; nessun consenso preselezionato dal backend.

Verifica del rilascio P9: **303 test SQLite**, **33 test Postgres** (P9/P7),
**25 test P9 nell'immagine Docker Python 3.10**, compilazione Python, portabilità
SQL e `make guidance-refresh`/`make guidance-check` passati. Immagine di prova:
`counselorbot-p9-backend:test`; nessun rebuild o riavvio dei container produttivi.
