# Migrazione delle sorgenti RAG da PDF a Markdown

Il 19 settembre 2026 sono stati convertiti tutti i 64 PDF presenti nel progetto
(2.277 pagine). I 46 PDF di riferimento in `docs/` e `docs-counselorbot/` sono
stati sostituiti dai Markdown omonimi. I 18 PDF degli upload restano nei percorsi
dell'applicazione; i loro derivati sono locali e non vengono pubblicati in Git.

## Provenienza e verifiche

- Archivio locale degli originali: `/home/nugh75/counselorbot-sbs-pdf-markdown/originals/`.
- Copie dei derivati e rapporto completo: stessa radice, cartella `markdown/`
  e file `report.md`, `report.json`, `summary.json`.
- Il [manifest di migrazione](rag-markdown-migration-2026-09-19.json) conserva
  percorsi, SHA-256, pagine OCR, pagine con struttura semplificata e verifiche
  per le sole 46 sorgenti versionate. Gli upload privati sono esclusi.
- Conversione con `ai4educ-shared-config/scripts/pdf2md`, PyMuPDF4LLM 1.28.2,
  versione del convertitore 3. Il confronto usa il testo catturato prima
  della ricostruzione del layout: il motore può modificare il documento in memoria.
- OCR locale italiano/inglese su 23 pagine, tramite PyMuPDF/Tesseract e
  `tessdata_fast` al commit `87416418657359cb625c412a48b6e1d6d41c29bd`.
- Su 811 pagine si è preferita l'estrazione testuale completa alla ricostruzione
  del layout. Restano 35 pagine senza testo estraibile/riconosciuto, segnalate
  nei derivati: la conversione non interpreta il contenuto dei grafici.
- Verificati checksum degli originali archiviati e dei Markdown, numerazione
  completa delle pagine e conservazione lessicale del testo nativo almeno al
  98% per pagina (normalizzazione delle sillabazioni e dei trattini discrezionali).
  Questo controllo non certifica la correttezza semantica dell'OCR o delle formule.

## Contratto del RAG

Le sorgenti Markdown canoniche prevalgono sulle copie Graphify e sugli eventuali
PDF omonimi. Anche in assenza della cartella `graphify-out/converted`, il corpus
legge i documenti diretti. I filtri di raccolta e di firma applicano le stesse
regole, evitando duplicazioni e ricostruzioni continue.

I confini predefiniti delle collezioni rimangono gli stessi: guide, framework e
questionari accettano i derivati identificati dal commento `pdf2md`; README e
schede bibliografiche preesistenti non entrano automaticamente nel corpus.
L'amministratore può continuare ad assegnare altri Markdown esplicitamente.
Le inclusioni/esclusioni salvate con il nome PDF vengono risolte sul Markdown,
così come i collegamenti del grafo e le anteprime delle vecchie citazioni.

## Esercizio e ripristino

Gli indici si ricostruiscono con il comando amministrativo di reindex delle
quattro collezioni, dopo aver distribuito il backend aggiornato. Il modello
di embedding configurato rimane invariato. Gli indici precedenti sono stati
copiati nell'archivio locale `rag-index-before/` prima della ricostruzione.

Per ripristinare un derivato: verificare l'hash del Markdown archiviato con il
manifest, ripristinarlo nel percorso `replacement` e ricostruire la collezione.
Per rigenerarlo dal PDF, verificare l'hash dell'originale e convertirlo nuovamente
prima della sostituzione. Gli indici ora accettano solo Markdown: rimettere il
PDF nella cartella non lo rende indicizzabile. Per i nuovi caricamenti vale il
[contratto di conversione automatica](rag-markdown-upload.md).

Verifica mirata senza rete o database:

```bash
python -m unittest backend.tests.test_rag_markdown -v
```

La verifica completa del backend usa il database dedicato ai test:

```bash
docker exec counselorbot_backend python -m backend.tests.test_smoke
```

## Esito della distribuzione

Backend ricostruito e avviato; endpoint OpenAPI HTTP 200. Le quattro collezioni
sono state ricostruite con il modello locale configurato `qwen3-embedding:4b`:

| Collezione | Sorgenti totali | Blocchi indicizzati |
| --- | ---: | ---: |
| competenzestrategiche | 2 | 212 |
| questionari | 6 | 74 |
| counselorbot | 16 | 246 |
| framework | 35 | 7.641 |

Verificata la presenza di tutti i 46 derivati del manifest, senza sorgenti PDF
residue negli indici. Le 46 anteprime richieste con il vecchio percorso PDF
risolvono al Markdown. Una ricerca reale per collezione ha restituito risultati
leggibili; le firme degli indici coincidono con il corpus e non richiedono
un'altra ricostruzione. Evidenza locale: `runtime-verification.json` nell'archivio.

Controlli superati: 9 test mirati del RAG, 202 verifiche smoke del backend e
14 test del convertitore. Le verifiche automatiche non sostituiscono una
revisione editoriale di tabelle, formule e pagine sottoposte a OCR.
