# s11-builder — builder dei piani operativi

## Stato
Task 2014148c completato; eb537b45 e c8a79b2b da iniziare, in sequenza.
Branch: feature/piano-builder-interno. Una sola PR verso main.

## Fatto
- Passi autonomi anche per i piani storici strict; ordine solo visivo.
- Rimosso abbinamento chat/incontro; nuove analisi con scelta della compilazione.
- Riferimenti storici ai risultati conservati senza vincolare ordine/rimozione.

## Verifiche
- SQLite: 120 test verdi (piani, chat guidate, inserimento risultati, approfondimenti), ratchet senza eccezioni per queste suite.
- Node: 59 test verdi; UI aggiunta/sostituzione step su desktop e telefono verde.
- Typecheck verde; i18n: 3510 chiavi in sei lingue. Lint: nessun errore (import inutilizzato rimosso).
- PostgreSQL: suite principali eseguite; verifica aggiuntiva modelli/inserimento risultati in conclusione.
- Rebuild immagini isolato da completare con il codice finale; nessun deploy.
- Il checker i18n riconosce tre chiavi di feedback del consiglio già tradotte, senza cambiare quei componenti.

## Prossimi passi
Forum in pagina (eb537b45), poi incontri in pagina (c8a79b2b); commit separati.

## Blocchi
Nessuno. Dati e servizi di produzione non utilizzati.
