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
- Dall'elenco il Tavolo si apre nella stessa scheda. Le pagine del Tavolo, dell'Area personale, della Guida e dei dettagli degli strumenti tornano alla pagina effettivamente visitata; per un accesso diretto usano una destinazione interna di ripiego. Nel pannello **Strumenti visivi**, il Tavolo si apre all'interno dello stesso pannello: pulsante Indietro, cronologia del browser ed Escape ripristinano strumenti, scheda selezionata e bozze già presenti.
- Sotto 1024 px il Tavolo resta in lettura, con il comando Indietro disponibile. Non è stata introdotta la modifica del grafo da telefono.

## API

Le nuove rotte rispettano `feature_tavolo` e i controlli di autenticazione/proprietà già usati dal Tavolo. Nessuna migrazione del database o nuova configurazione è necessaria.

| Metodo e percorso | Contratto |
| --- | --- |
| `GET /tavolo/capabilities?counselor_id=…` | `{available, fallback_origin}`: configurazione dei candidati usati anche per generare; il counselor senza preset usa la configurazione globale, come in chat. |
| `PATCH /tavolo/{id}` | `{title}`: nome non vuoto, spazi esterni rimossi, massimo 80 caratteri; il grafo e le revisioni restano invariati. |
| `DELETE /tavolo/{id}` | Elimina tavolo, revisioni e cattura. |
| `POST /tavolo/{id}/help` | `{question, history?, counselor_id?, lang?}`; domanda fino a 1200 caratteri, massimo sei coppie di contesto, risposta `{reply}` fino a 4000 caratteri. Nessuna scrittura nel grafo. |

La pagina autonoma e il Tavolo interno agli Strumenti condividono `TavoloWorkspace`. Il controllo di concorrenza del grafo resta `base_index` con risposta `409`. Le risposte AI continuano a passare da validazione e accettazione esplicita.

## Verifica

- `backend/tests/test_tavolo_feedback.py`: HTTP su database SQLite isolato; proprietà, nomi, eliminazione e cattura, conflitti, lettura contestuale senza scritture, counselor locali/cloud e configurazione globale.
- `frontend/tests/tavolo.test.mjs`: browser reale con API simulate e stato persistente nella fixture; salvataggi immediati, richieste lente, errori e riprova, parole-legame, proposte, domande, gestione dell'elenco, ritorni desktop/mobile e pannello incorporato. Cattura PNG verificata anche a livello di pixel.
- `frontend/tests/account-onboarding.test.mjs`: ripresa della scelta del counselor dentro il flusso e ritorno agli strumenti; preservazione delle preferenze, delle conversazioni e delle bozze.
- Controlli TypeScript, ESLint sui file modificati, test delle librerie e completezza delle sei lingue. Build delle immagini backend/frontend prima del rilascio.

Prova aggiuntiva con il modello reale di Omar nella configurazione di produzione: composizione di una mappa sintetica con tre pezzi e due collegamenti, poi domanda sul comando Collega pezzi. Entrambe le richieste hanno risposto HTTP 200. Configurazione letta in sola lettura; tavolo e revisioni in SQLite in memoria, senza dati personali o scritture nel database applicativo.

Esito del rilascio: 57 test backend, 162 test delle librerie frontend, 32 test browser Tavolo, 16 test del flusso counselor e 13 verifiche mirate di Strumenti visivi/Guida superati. I test browser usano API simulate; la prova del modello reale descritta sopra è separata. TypeScript, ESLint mirato, controllo delle sei lingue e build Docker completati. Frontend e backend ricreati sul progetto Compose esistente, mantenendo database, volumi e altri servizi. Il sito pubblico richiede correttamente il login; i controlli HTTP interni rispondono 200.
