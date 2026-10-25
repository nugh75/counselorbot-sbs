# Somministrazioni: archiviazione e sostituzione

## Stato
Task 10c7f497 completato (test API e flusso Node verdi). Task f683d85a successivo.

## Fatto
- Archivia/Ripristina visibili nelle schede e nel modulo di modifica, condivisi da docente e admin.
- Conferma esplicita, controllo revisione, ripristino come pianificata; risultati consultabili e conservati.
- Le somministrazioni archiviate rifiutano verifiche istituto e nuove scritture di risultati.
- Test API su database temporaneo e test Node del flusso conferma/annulla/conflitto/ripristino.

## Verifiche
- pytest mirato SQLite: 4 passati.
- node --test administration-plans.test.ts: 5 passati.
- ESLint mirato: zero errori, un avviso preesistente su window.location.
- Browser: compilazione Next oltre 120 s, azioni non raggiunte; da ripetere.
- i18n globale: corretti tre falsi positivi preesistenti del Consiglio; riesecuzione in corso.

## Prossimi passi
- Completare sostituzione guidata e verifiche finali, aprire PR unica verso main.

## Blocchi
Mac sotto pressione di memoria; controlli statici lenti e browser sospeso. Nessun deploy. Frontend dev arrestato.
