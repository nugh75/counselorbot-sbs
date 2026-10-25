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
