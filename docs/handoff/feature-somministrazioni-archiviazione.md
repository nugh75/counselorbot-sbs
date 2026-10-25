# Somministrazioni: archiviazione e sostituzione

## Stato
Entrambi i task completati e segnati fatto nel diario: 10c7f497 e f683d85a (CLI con UUID completi). Branch `feature/somministrazioni-archiviazione`, [PR unica #594](https://github.com/nugh75/counselorbot-sbs/pull/594) verso main. Nessun merge o deploy.

## Fatto
- Archivia/Ripristina visibili nelle schede e nel modulo di modifica condivisi da docente e admin; conferma anche per cambio stato dal selettore.
- Archiviazione reversibile come pianificata, con risultati consultabili. Verifiche istituto e nuove scritture rifiutano piani archiviati.
- Sostituisci apre il nuovo modulo: creazione con nuovo codice/zero risposte e archiviazione precedente nella stessa transazione, protetta dalla revisione. Contesto classe/istituto e lingue validati.
- Sostituzione nei piani operativi: `replaces_step_id` richiede una nuova somministrazione mai usata; archivia la precedente e rimuove logicamente il vecchio passo senza spostare risultati, attestazioni o completamenti.
- i18n in sei lingue, documentazione di prodotto/API e guida operativa aggiornate.
- Correzione separata del checker i18n: tre chiavi del Consiglio già tradotte erano interpretate come testi visibili. Nessun cambiamento a quel flusso.

## Verifiche
- pytest: **80 passati su PostgreSQL**, includendo lifecycle/sostituzione, publication e class_paths; **11 passati su SQLite** nelle due suite nuove.
- Node: **50 test passati** (i 43 pertinenti a somministrazioni/percorsi, più auth-provider e runtime-config dopo integrazione main).
- Browser sulla build standalone con sole API simulate: **3 test passati** per docente/admin, archivia/ripristina, annulla, sostituisci e conflitto con aggiornamento revisione senza perdere la bozza. **Suite class-path-add-step passata**, incluso nuovo scenario di sostituzione con conferma/annullamento e `replaces_step_id` nel salvataggio.
- Integrazione di `origin/main` e72cf3fa: codice unito automaticamente; unico conflitto nel manifest generato della guida, rigenerato. Ripetuti Node/TypeScript/i18n e gli 11 test SQLite. Backend applicativo invariato rispetto agli 80 test PostgreSQL verdi.
- TypeScript `tsc --noEmit --incremental false`, i18n (**3530 chiavi / 6 lingue**), guidance-check con base origin/main e SQL portability: passati.
- ESLint mirato: zero errori; un avviso preesistente su `window.location.href` nel pannello. Fixture browser adeguate ai titoli e campi già presenti nell'interfaccia.
- Docker: immagini isolate `counselorbot-s12-backend` e `counselorbot-s12-frontend` ricostruite; build Next completa. **10 test passati nell'immagine backend**. Frontend standalone avviato, HTTP 200 e log regolari, usato per i test browser e poi fermato.
- Prime prove browser su Next dev rallentate dalla pressione di memoria; ripetizione sulla build standalone interamente verde. La prima SQLite estesa aveva 13 fallimenti già noti di publication/forum (`statement_timestamp`), riconosciuti dal ratchet; le corrispondenti verifiche PostgreSQL sono verdi.

## Prossimi passi
Revisione e merge dell'utente dalla PR unica; deploy ordinario dopo il merge. Nessuna migrazione, variabile nuova o comando sudo richiesto. Per sostituzioni dalla vista ricerca, aggiungere la nuova somministrazione ai percorsi interessati; il flusso Piani operativi sostituisce direttamente il passo.

## Blocchi
Nessuno. Nessun container di produzione riavviato. Frontend dev e container di test arrestati; porta 3162 libera. Il Postgres effimero `counselorbot-s12-postgres` (127.0.0.1:18632, tmpfs) è fermo; anche `counselorbot-s12-frontend-test` e il successivo `counselorbot-s12-frontend-integrated-test` sono fermi.

Dipendenze frontend locali: `frontend/node_modules` è un symlink alla cache `/tmp/counselorbot-403-deps/node_modules` (Next 16.3.8); installazione interrotta conservata in `node_modules/s12-incomplete-dependencies`, ignorata da Git. Test Node eseguiti con Node 22.23.3. Le build Docker hanno usato le dipendenze Linux della relativa immagine, senza `.env` nel contesto frontend.
