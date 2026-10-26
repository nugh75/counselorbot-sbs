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


## Incontri nel builder (c8a79b2b)

Nel tipo «Partecipa a un incontro», «Gestisci incontri» apre il gestore esistente
in una modale: si sceglie un incontro, se ne crea uno di gruppo o individuale,
si preparano le fasce, oppure si modifica un incontro già presente. Ogni passo
incontro offre anche «Modifica incontro», che apre direttamente il suo form.
Le API restano `/teacher/groups/{id}/meetings`, `/teacher/meetings/{id}` e quelle
esistenti di fasce, prenotazioni e presenze.

Titolo e data aggiornati sono subito visibili nel passo. Il salvataggio
dell'incontro non cancella la bozza del piano e non rende modificato un piano
altrimenti già salvato: sono aggiornati solo i metadati della risorsa condivisa.
Le presenze restano registrate anche se si sposta la data.

Le modifiche non salvate, comprese le nuove fasce individuali, sono protette
anche premendo rapidamente Esc. Un errore conserva i campi; un conflitto di
revisione offre «Ricarica», con conferma prima di sostituire il form con i dati
correnti. Si può poi modificare e salvare con la revisione aggiornata.
