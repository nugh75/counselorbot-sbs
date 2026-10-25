# Ciclo di vita delle somministrazioni

Docente e admin trovano **Archivia** nelle schede di Somministrazioni e nel modulo di modifica. Dai percorsi di classe il collegamento alla vista somministrazioni apre la stessa scheda.

La conferma sospende la raccolta, conserva risultati e riferimenti dei percorsi e rende visibile lo stato archiviato. **Ripristina** riporta lo stato a pianificato, conservando i dati precedenti. Non equivale a una nuova raccolta vuota.

API: `PUT /admin/administration-plans/{id}` e l'equivalente classe `PUT /teacher/administrations/{id}`, con `{revision, status: "archived"}` (o `"planned"` per ripristinare). Restano validi i permessi esistenti e il conflitto 409 su revisione obsoleta. Verifica istituto e scritture risultati rifiutano un piano archiviato con `administration_inactive`; le letture storiche rimangono disponibili. Nessuna migrazione necessaria.
