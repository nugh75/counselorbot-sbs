# Accesso diretto alle attività dei piani

Il piano e l’attività sono le due viste dello studente. L’avvio e la ripresa non
richiedono una pagina di conferma. La barra dell’attività identifica piano e
passo; «Salva ed esci» attende il salvataggio prima del ritorno. Il collegamento
di ritorno ammette soltanto le pagine locali dei piani/cataloghi e riapre il passo.

## Stato e tentativi

`GET /user/paths` espone `step.activity`: tipo, tentativo corrente, storico e
azioni con destinazione. `GET /user/paths/{path}/steps/{step}/activity` aggiunge
contesto, bozza e risultati del solo studente. L’elenco dei piani non trasporta
risposte o punteggi. Le precedenti API e i collegamenti `/approfondimento`
rimangono compatibili.

- Mai iniziato: Inizia; in corso: Riprendi e Fai un altro tentativo; concluso:
  Rivedi e Fai un altro tentativo. Per i questionari il comando è Nuova compilazione.
- Il completamento già ottenuto conserva il progresso. Un nuovo tentativo aperto
  mostra «Nuovo tentativo in corso» e Riprendi; lo storico rimane consultabile.
- Le nuove chat autonome e le bozze hanno una riga in
  `class_path_activity_attempts` già all’apertura. La tabella è additiva, creata
  dall’inizializzazione dello schema PostgreSQL. Nessun dato esistente
  viene convertito, eliminato o attribuito per somiglianza del nome dello strumento.
- `POST .../attempts` è idempotente sul UUID e distingue un avvio iniziale da un
  nuovo tentativo esplicito. Il primo riusa l’attività già aperta anche se due
  schede tentano l’avvio. Gli UUID non possono rivendicare sessioni altrui.
- Le analisi e le compilazioni già esistenti sono adattate dai rispettivi legami
  immutabili. Le vecchie pause autonome si associano soltanto tramite piano,
  passo e strumento esatti. Le chat personali restano personali.
- Il completamento delle nuove chat guidate usa il marcatore della loro sessione
  e del loro strumento, non una conversazione personale sullo stesso argomento.
- Una conversazione con turni registrati ma senza pausa recuperabile espone un
  errore e Riprova. Non viene avviata una chat vuota con l’etichetta Riprendi.
- Rivedi apre riepilogo, PDF e conversazione in lettura. Lo storico dei tentativi
  si trova nella scheda del piano, fuori dalla chat.
- Il menu Da riprendere integra lo stesso stato dei piani, comprese le bozze
  senza snapshot. Deduplica le sessioni locali/salvate ed esclude i tentativi
  conclusi; la vista Tutti gli strumenti nasconde quelli di classe.

## Questionari e altre attività

La somministrazione termina salvando i dati. Non apre automaticamente una chat:
se esiste un passo di analisi collegato, offre Vai all’approfondimento. L’analisi
usa l’ultima compilazione valida del passo di origine. Ripetere un’analisi riusa
il risultato; una nuova compilazione raccoglie dati nuovi.
Nell’editor e nei modelli si può scegliere un questionario del piano o una
compilazione personale. La navigazione indipendente conserva questi collegamenti
ai dati: modificare un modello non li converte in risultati personali.

`PUT .../attempts/{session}/draft` salva risposte e punteggi provvisori sul server,
con controllo di revisione. Un retry identico dopo una risposta persa è accettato;
una bozza diversa con revisione superata dà 409. Password e grant dell’istituto
restano esclusi. Le bozze si recuperano anche da un altro browser; la verifica
dell’istituto resta richiesta al momento di confermare i risultati.

Se più compilazioni personali sono disponibili, la scheda del piano permette
di scegliere quella da analizzare prima dell’apertura. L’accesso diretto senza
una scelta conserva il selettore come recupero.
Per gli strumenti che supportano il percorso completo o essenziale, la scelta
facoltativa è nelle opzioni della scheda; il piano apre direttamente il percorso
scelto (completo per default), senza chiedere un secondo Inizia nella chat.

Forum: Apri discussione e spunta reversibile Intervento concluso. Incontri:
dettagli, prenotazione e presenza nella scheda. Strumenti personali: Apri conserva
gli stessi contenuti. Compiti: il collegamento apre direttamente il dettaglio
dell’assegnazione e conserva le consegne precedenti.

## Verifica e distribuzione

Test di contratto: `backend/tests/test_path_activity.py`, insieme alle regressioni
dei piani, delle somministrazioni e delle analisi su PostgreSQL 15. Test
browser sintetici: `frontend/tests/plan-questionnaire-chats.test.mjs` a 390/1440 px.
Le prove usano immagini di produzione, un database temporaneo e API intercettate,
senza provider LLM né dati operativi.

Ricostruire backend e frontend insieme dopo il merge. Fare un backup prima
dell’aggiornamento. Il rollback può lasciare la nuova tabella inutilizzata senza
rimuoverla; evitare scritture concorrenti da una versione vecchia durante il cambio.
La configurazione nginx portable resta valida: `sudo ./update_nginx.sh` non serve.
