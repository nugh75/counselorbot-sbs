# Calendario del percorso e diario

La linea del tempo nell’Area personale è un unico percorso personale, indipendente dalle sessioni.

1. Apri **Aggiungi tappa** e scrivi un titolo.
2. Scegli **Evento in un giorno** oppure **Periodo o scadenza** e usa i selettori calendario.
3. Per un periodo puoi inserire entrambe le date, solo l’inizio o solo la fine. Puoi completare un estremo aperto successivamente. La fine non può precedere l’inizio.
4. Seleziona una tappa nella grafica per aprirne i dettagli. **Cosa programmo** conserva l’intenzione iniziale; **Diario** raccoglie il racconto e le riflessioni, anche retrospettive. Il passaggio della data non dichiara un’attività svolta.
5. Premi **Salva nell’Area personale** prima di uscire. Il salvataggio è esplicito; programma e diario restano modificabili.

Sul desktop le date sono disposte lungo un asse orizzontale: i punti rappresentano eventi di un giorno, le barre rappresentano periodi e un’estremità tratteggiata indica una data ancora aperta. «Oggi» è evidenziato. Sul telefono la sequenza è verticale e cronologica; le durate sono indicate dalle date, non dalla distanza fra le schede.

L’ordine usa la data di inizio, oppure quella di fine quando l’inizio non è definito. Le vecchie tappe con periodi testuali rimangono in **Da collocare nel calendario**: il testo e le riflessioni si conservano finché si scelgono esplicitamente le date. Non vengono dedotte date da espressioni come «durante la scuola».

Nei dettagli restano disponibili attività, collegamenti al Portfolio e agli strumenti personali. **Altri strumenti personali** apre le schede già disponibili. Le date istituzionali rimangono gestite dall’istituto. La copia nel Portfolio richiede anteprima e conferma ed è indipendente dalle modifiche successive del diario. PDF e testo esportano sia programma sia diario.

## Contratto e verifica

Gli endpoint `/user/timeline` mantengono il contratto di revisione e proprietà esistente. Ogni tappa può ora contenere `date_mode` (`point`, `period` o `null` per il formato precedente), `start_date`, `end_date` (date ISO `YYYY-MM-DD`) e `planned` (massimo 1000 caratteri). `reflection` conserva il diario esistente. `period` rimane compatibile con le vecchie tappe ed è ricavato dal server per quelle datate. Nessuna migrazione di schema: il contenuto resta nel workspace personale già versionato.

Copertura: `backend/tests/test_personal_timeline.py`, `backend/tests/test_timeline.py`, `frontend/src/lib/timeline-dates.test.ts` e i casi calendar/timeline di `frontend/tests/visual-tools.test.mjs`. Le prove browser usano fixture isolate; il caso `TIMELINE_LIVE=1` usa il server API di test dedicato.
