# Tavolo: editing, counselor e ritorno agli strumenti

Aggiornamento del 14 settembre 2026, in risposta alle segnalazioni d'uso.

## Comportamento

- Il selettore e la Guida spiegano che un modello locale lavora sui server della piattaforma, mentre un modello cloud riceve il testo tramite un servizio esterno. Questa distinzione non coincide con l'abilitazione a uno strumento.
- Se il counselor scelto non è attivo o non è abilitato allo strumento richiesto, la scelta riappare nel percorso, prima di avviare la conversazione. Strumento, punteggi e sessione in preparazione restano nello stato della pagina. Indietro abbandona la scelta senza modificare le preferenze; Continua le salva e riprende la preparazione.
- Nel Tavolo il counselor è visibile e modificabile prima della richiesta. La scelta viene inviata anche quando si compone dall'elenco nell'Area personale. La verifica iniziale legge la configurazione e indica un eventuale modello di riserva locale o cloud; non certifica che un modello raggiungibile produrrà sempre uno schema valido.
- Le modifiche manuali vengono accodate e salvate dopo una breve pausa. **Salva modifiche** (anche Invio sul nome del pezzo) conferma subito. Un salvataggio lento non sovrascrive le modifiche successive. **Salva il tavolo**, proposte, rinomina e domande attendono le scritture in corso. Gli errori restano visibili con Riprova.
- **Salva il tavolo** assegna il nome e rende la bozza reperibile nell'elenco; su un tavolo già salvato aggiorna il salvataggio senza chiedere nuovamente il nome. La cattura PNG resta facoltativa.
- **Collega pezzi** offre origine, destinazione e parole-legame senza richiedere il trascinamento. Le parole di una freccia sono cliccabili e aprono l'editor del collegamento. Resta disponibile il trascinamento dagli agganci.
- **Visualizza proposte** elenca pezzi e collegamenti in sospeso, con visualizzazione, accettazione e scarto individuali. Il conteggio riguarda elementi della stessa mappa, non mappe alternative. Accettare un collegamento comprende i suoi estremi ancora proposti; scartare un pezzo scarta anche i collegamenti proposti che dipendono da esso.
- **Chiedi al counselor** apre uno scambio sul contenuto corrente del Tavolo e sul suo utilizzo. Le risposte non modificano né approvano il grafo. Domanda e risposte restano quando il pannello si chiude e riapre, per la durata di quella visita. Le ultime sei coppie domanda/risposta accompagnano la richiesta successiva.
- Il nome si modifica dalla matita nel Tavolo o dall'elenco. L'eliminazione è nell'elenco, richiede conferma nell'interfaccia e rimuove il tavolo, le sue revisioni e la cattura.
- Un pezzo si scrive dentro se stesso: doppio clic (o doppio tocco) apre un campo di testo dentro il pezzo, con Invio, Esc o un clic fuori a chiuderlo. Il campo non avvia trascinamenti né zoom mentre si scrive.
- Ogni pezzo porta il proprio bidone sul bordo, visibile al passaggio del mouse, alla selezione o al fuoco da tastiera: lo toglie dal tavolo insieme a tutti i collegamenti che lo riguardano, senza passare dal pannello.
- Le immagini del set caricato dall'amministrazione si scelgono nel pannello del pezzo, alla sezione Immagine, per nome o per utilizzo. L'immagine affianca il nome come un'icona grande, oppure il pezzo assume la forma Immagine e il file diventa quasi tutto il pezzo, col nome sotto. Un'immagine e un'icona sono alternative sullo stesso pezzo: sceglierne una toglie l'altra. Un'id d'immagine fuori catalogo si perde alla scrittura, non il tavolo.
- Il set d'immagini si cura solo da amministrazione (scheda "Immagini del tavolo"): il caricamento è massivo, le immagini accompagnate dal file CSV che dice per ognuna nome e utilizzo (separatore `;` o `,`). Un'immagine senza riga nel CSV entra comunque, col nome del file e l'utilizzo vuoto, segnalata nell'elenco per essere completata. Limite: 10 MiB a file, 200 immagini in catalogo.
- Dall'elenco il Tavolo si apre nella stessa scheda. Le pagine del Tavolo, dell'Area personale, della Guida e dei dettagli degli strumenti tornano alla pagina effettivamente visitata; per un accesso diretto usano una destinazione interna di ripiego. Nel pannello **Strumenti visivi**, il Tavolo si apre all'interno dello stesso pannello: pulsante Indietro, cronologia del browser ed Escape ripristinano strumenti, scheda selezionata e bozze già presenti.
- Sotto 1024 px il Tavolo resta in lettura, con il comando Indietro disponibile. Non è stata introdotta la modifica del grafo da telefono.

## API

Le nuove rotte rispettano i controlli di autenticazione/proprietà già usati dal Tavolo; quelle del tavolo dipendono da `feature_tavolo`, mentre le rotte d'immagini sono pubbliche in lettura (come le icone dei diagrammi) e riservate all'amministrazione in scrittura. Nessuna migrazione del database o nuova configurazione è necessaria oltre alla nuova tabella `tavolo_images`, creata da `create_all` all'avvio.

| Metodo e percorso | Contratto |
| --- | --- |
| `GET /tavolo/capabilities?counselor_id=…` | `{available, fallback_origin}`: configurazione dei candidati usati anche per generare; il counselor senza preset usa la configurazione globale, come in chat. |
| `GET /tavolo-images` | Il catalogo d'immagini (`{images: [{id, name, usage}]}`), pubblico come le icone dei diagrammi. |
| `GET /tavolo-images/{id}/file` | Il file d'immagine con il suo content type; un'id fuori catalogo è `404`. |
| `POST /admin/tavolo-images` | Solo admin, multipart: `files` (una o più immagini, png/jpg/webp/gif/svg, 10 MiB a file) e `csv_file` (una riga per file: nome_file, nome, utilizzo). Risponde `{created, unlisted}`; le immagini senza riga entrano con il nome del file e utilizzo vuoto. Tetto di 200 immagini in catalogo (`409`). |
| `PATCH /admin/tavolo-images/{id}` | Solo admin: `{name?, usage?}` per completare un'immagine entrata senza riga. |
| `DELETE /admin/tavolo-images/{id}` | Solo admin: rimuove la riga e il file. |
| `PATCH /tavolo/{id}` | `{title}`: nome non vuoto, spazi esterni rimossi, massimo 80 caratteri; il grafo e le revisioni restano invariati. |
| `DELETE /tavolo/{id}` | Elimina tavolo, revisioni e cattura. |
| `POST /tavolo/{id}/help` | `{question, history?, counselor_id?, lang?}`; domanda fino a 1200 caratteri, massimo sei coppie di contesto, risposta `{reply}` fino a 4000 caratteri. Nessuna scrittura nel grafo. |

La pagina autonoma e il Tavolo interno agli Strumenti condividono `TavoloWorkspace`. Il controllo di concorrenza del grafo resta `base_index` con risposta `409`. Le risposte AI continuano a passare da validazione e accettazione esplicita.

## Verifica

- `backend/tests/test_tavolo_feedback.py`: HTTP su database SQLite isolato; proprietà, nomi, eliminazione e cattura, conflitti, lettura contestuale senza scritture, counselor locali/cloud e configurazione globale.
- `backend/tests/test_tavolo_images.py`: caricamento massivo con CSV a `;` e `,`, immagini senza riga completabili, formati e dimensioni rifiutate, tetto del catalogo, solo admin carica/modifica/elimina, rotte pubbliche di catalogo e file, pruning degli id d'immagine sconosciuti alla scrittura del tavolo.
- `frontend/tests/tavolo.test.mjs`: browser reale con API simulate e stato persistente nella fixture; salvataggi immediati, richieste lente, errori e riprova, parole-legame, proposte, domande, gestione dell'elenco, ritorni desktop/mobile e pannello incorporato. Cattura PNG verificata anche a livello di pixel. Scrittura interna al pezzo con doppio clic, bidone sul pezzo con i fili collegati, immagine del catalogo che toglie l'icona e si vede sul pezzo.
- `frontend/tests/account-onboarding.test.mjs`: ripresa della scelta del counselor dentro il flusso e ritorno agli strumenti; preservazione delle preferenze, delle conversazioni e delle bozze.
- Controlli TypeScript, ESLint sui file modificati, test delle librerie e completezza delle sei lingue. Build delle immagini backend/frontend prima del rilascio.

Prova aggiuntiva con il modello reale di Omar nella configurazione di produzione: composizione di una mappa sintetica con tre pezzi e due collegamenti, poi domanda sul comando Collega pezzi. Entrambe le richieste hanno risposto HTTP 200. Configurazione letta in sola lettura; tavolo e revisioni in SQLite in memoria, senza dati personali o scritture nel database applicativo.

Esito del rilascio: 57 test backend, 162 test delle librerie frontend, 32 test browser Tavolo, 16 test del flusso counselor e 13 verifiche mirate di Strumenti visivi/Guida superati. I test browser usano API simulate; la prova del modello reale descritta sopra è separata. TypeScript, ESLint mirato, controllo delle sei lingue e build Docker completati. Frontend e backend ricreati sul progetto Compose esistente, mantenendo database, volumi e altri servizi. Il sito pubblico richiede correttamente il login; i controlli HTTP interni rispondono 200.
