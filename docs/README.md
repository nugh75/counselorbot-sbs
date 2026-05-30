# Documentazione CounselorBot

Questa cartella e' il punto unico di ingresso per la documentazione del progetto.

## Indice

- [Organizzazione docs implementata](progetto/organizzazione/proposta-organizzazione-docs-implementata-2026-05-30.md): inventario, mappatura e decisioni della migrazione.
- [Grafo della documentazione](progetto/organizzazione/grafo-docs-2026-05-30.md): vista Mermaid della struttura `docs/`.
- [Diario di bordo](progetto/diario.md): cronologia del progetto.
- [Comunicazioni](progetto/comunicazioni/): bozze e testi di contatto.
- [Validazione](validazione/): progetto scientifico, manuale operativo, dettagli psicometrici, diagnosi e stanine.
- [Questionari](questionari/): strumenti PDF e guida al catalogo item.
- [Prompting](prompting/): review e analisi delle traduzioni dei prompt.
- [Implementazione](implementazione/): verifiche tecniche e note di sviluppo.
- [Fonti](fonti/): materiali bibliografici, archivio del sito competenzestrategiche.it e fonti esterne collegate.

## Regole di collocazione

- La documentazione stabile vive in `docs/`.
- I file necessari al runtime restano dove il codice li carica, oppure vengono spostati solo aggiornando il codice.
- I README tecnici locali possono restare accanto al modulo che documentano quando servono a chi lavora direttamente in quella cartella.
- I file generati o temporanei non dovrebbero entrare nella documentazione canonica, salvo che siano artefatti deliberatamente pubblicati.
