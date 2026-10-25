# s11-builder — builder dei piani operativi

## Stato
Task 2014148c completato (014a72d4, diario fatto); eb537b45 completato (e5603d11, diario fatto); c8a79b2b completato, chiusura in corso.
Branch: feature/piano-builder-interno. Una sola PR verso main.

## Fatto
- Passi autonomi anche per i piani storici strict; ordine solo visivo.
- Rimosso abbinamento chat/incontro; nuove analisi con scelta della compilazione.
- Riferimenti storici ai risultati conservati senza vincolare ordine/rimozione.

- Forum: creazione e modifica titolo/testo dentro una modale del builder, con i form e gli endpoint esistenti.
- Bozza del piano preservata; protezioni per uscita, tastiera, salvataggi in corso e permessi del forum.

- Incontri: gestore riusato in modale per incontri di gruppo, colloqui e fasce; apertura diretta da ogni passo.
- Titolo/data aggiornati senza perdere o sporcare la bozza del piano; gestione revisioni e conferma per ricaricare un form modificato.
- La chiusura rapida protegge anche una fascia individuale appena digitata.

## Verifiche
- SQLite: 120 test verdi (piani, chat guidate, inserimento risultati, approfondimenti), ratchet senza eccezioni per queste suite.
- Node: 59 test verdi; UI aggiunta/sostituzione step su desktop e telefono verde.
- Typecheck verde; i18n: 3510 chiavi in sei lingue. Lint: nessun errore (import inutilizzato rimosso).
- PostgreSQL task 1: 117 test passati nella suite principale; vecchia aspettativa di blocco aggiornata e verificata nella suite aggiuntiva (51 verdi), più 2 regressioni mirate verdi.
- Task 2: 17 test Node, 4 casi API PostgreSQL mirati, UI desktop IT e mobile SV verdi; i18n 3512 chiavi, lint e typecheck verdi.
- Task 3: 11 casi API SQLite, 24 test Node, quattro scenari UI complessivi verdi (forum desktop IT/mobile SV, incontri gruppo IT/individuale SV).
- Typecheck e lint verdi; i18n 3514 chiavi in sei lingue. Nuovo test API incontri anche su PostgreSQL verde.
- Backend Docker ricostruito come counselorbot-s11-backend:builder; smoke import senza rete verde. Frontend Docker in costruzione; nessun deploy.
- Il checker i18n riconosce tre chiavi di feedback del consiglio già tradotte, senza cambiare quei componenti.

## Prossimi passi
Concludere verifica packaging, arrestare i soli processi di prova, push e PR unica; revisione/merge a cura del proprietario.

## Blocchi
Nessun blocco funzionale. Limite già censito: le scritture forum usano statement_timestamp e le suite forum storiche falliscono su SQLite; verifiche forum su PostgreSQL. Dati e servizi di produzione non utilizzati.
