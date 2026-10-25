# Ciclo di vita delle somministrazioni

Docente e admin trovano **Archivia** nelle schede di Somministrazioni e nel modulo di modifica. Dai percorsi di classe il collegamento alla vista somministrazioni apre la stessa scheda.

La conferma sospende la raccolta, conserva risultati e riferimenti dei percorsi e rende visibile lo stato archiviato. **Ripristina** riporta lo stato a pianificato, conservando i dati precedenti. Non equivale a una nuova raccolta vuota.

API: `PUT /admin/administration-plans/{id}` e l'equivalente classe `PUT /teacher/administrations/{id}`, con `{revision, status: "archived"}` (o `"planned"` per ripristinare). Restano validi i permessi esistenti e il conflitto 409 su revisione obsoleta. Verifica istituto e scritture risultati rifiutano un piano archiviato con `administration_inactive`; le letture storiche rimangono disponibili. Nessuna migrazione necessaria.


## Sostituire una raccolta già usata

**Sostituisci** apre un nuovo modulo precompilato: si scelgono strumento, lingua e dettagli, poi **Archivia e avvia la nuova** chiede conferma. `POST /admin/administration-plans/{id}/replace` riceve `{revision, replacement: AdministrationPlanCreate}` e, nella stessa transazione, crea un nuovo ID/codice AP con zero risposte e archivia la precedente incrementandone la revisione. Un errore annulla entrambe le operazioni; una richiesta ripetuta con revisione vecchia restituisce 409. Sono ammessi solo nuovi stati planned/active. Per una classe restano invariati classe e istituto; la lingua deve essere disponibile. Le letture storiche restano raggiungibili dalla vecchia scheda. Il nuovo piano va aggiunto ai percorsi interessati: i riferimenti storici non sono riscritti.

Nei **Piani operativi**, Sostituisci su un passo questionario permette di scegliere o creare una nuova somministrazione. Dopo la conferma, il salvataggio invia `replaces_step_id` sul nuovo `questionnaire_administration` a `PUT /teacher/paths/{id}`. Il server verifica revisione del percorso, accesso alla classe, identità del passo originale (che deve essere omesso), classe del nuovo target e assenza di risposte o precedenti passi collegati al target. Solo dopo tutte le validazioni archivia la precedente e rimuove logicamente il vecchio passo, inserendone uno nuovo con nuova attivazione e nessuna evidenza ereditata. Annullare prima di salvare non archivia nulla. L'archiviazione interrompe la raccolta anche negli altri percorsi che usano la stessa somministrazione: la conferma e il messaggio guida lo dichiarano. Restano valide le protezioni dei passi attivati e dei questionari referenziati da approfondimenti.

Cambiare direttamente strumento, lingua, classe o istituto su un piano con risultati restituisce `administration_has_results_replace_required`: modifiche a titolo, note o stato restano possibili. Non servono migrazioni né variabili nuove.

Per somministrazioni italiane, l’eventuale chiusura della raccolta sul sito esterno resta un’operazione separata.
