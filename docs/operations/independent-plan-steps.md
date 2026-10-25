# Passi autonomi dei piani operativi

Dal task 2014148c ogni passo si svolge e conta nel progresso autonomamente.
La posizione resta solo un ordine di visualizzazione, modificabile con le frecce.
Il builder aggiunge una sola attività alla volta; chat e incontri si aggiungono separatamente.
Le nuove chat sui risultati fanno scegliere allo studente una propria compilazione.

Le API accettano ancora `mode: strict` dai vecchi client, ma salvano e restituiscono
`recommended`: anche un piano storico ancora strict nel database non blocca i passi.
Il campo `follows` non è più accettato. La colonna storica `follows_step_id` resta
per compatibilità dello schema, non viene esposta come collegamento attivo ed è
azzerata al salvataggio. Non occorre una migrazione distruttiva.

Nei piani storici `results_step_id` identifica la fonte dei dati del questionario:
non impone più un ordine tra passi e la rimozione logica della fonte non cancella
il questionario o i risultati. Le normali autorizzazioni e la necessità di una
compilazione da analizzare restano applicate.


## Discussioni nel builder (eb537b45)

Nel tipo «Partecipa a una discussione» si può creare una discussione oppure
modificare quella selezionata. Ogni passo forum già inserito offre «Modifica
discussione». Titolo e testo si modificano in una modale, senza cambiare pagina.
Si riusano i form del forum e le API `POST /groups/{id}/forum/topics`,
`GET /forum/topics/{id}`, `PATCH /forum/topics/{id}` con gli stessi permessi.

Il salvataggio riguarda subito la discussione nel forum della classe; il piano
mantiene la propria bozza e si salva separatamente. La discussione appena creata
è selezionata per poterla aggiungere al piano. Un errore conserva il testo;
annullare o premere Esc chiede conferma se ci sono modifiche alla discussione.
Durante l'invio non si può chiudere la modale. Le risposte di altre classi non
sono editabili nel builder. Nessun nuovo endpoint o campo nel database.
