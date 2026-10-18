# Checkpoint baseline frontend — 18 ottobre 2026

PR #351 ancora in bozza. Dopo il merge di main, `npm run lint` restituisce
zero errori e 62 warning; 593 unit test, controllo i18n e build Next passano.
La prima esecuzione browser estesa restituisce 249 passati, 15 falliti e
2 saltati su 266 test. Sono stati aggiornati i selettori del catalogo QSA
(tre casi poi passati) e delle preferenze chat (dieci casi passati insieme,
OpenCode passato dopo la correzione finale). La suite completa deve essere
rieseguita dopo aver diagnosticato accesso di classe, navbar con nomi lunghi
e zoom, teacher-area-home e scelta del taccuino.

Usata una build isolata con `NEXT_IMAGES_UNOPTIMIZED=1` e server su
`127.0.0.1:3155`, ora fermato. Nessun collegamento al database di produzione.
La nuova ricerca dei preset è consegnata separatamente nella PR #401.
