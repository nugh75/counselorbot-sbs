# Caricamento Markdown e conversione PDF nel RAG

Il RAG indicizza esclusivamente sorgenti Markdown. L'endpoint amministrativo
`POST /admin/rag/docs?collection=...` accetta `.md` e `.pdf`; i PDF vengono
convertiti **prima** del salvataggio nella collezione e della ricostruzione
dell'indice. Il nome restituito e usato nelle citazioni è `nome.md`.

La regola vale per tutte le collezioni, comprese quelle dinamiche. I PDF inseriti
manualmente nelle cartelle non vengono indicizzati: importarli attraverso
l'endpoint oppure convertirli esplicitamente. Anche un'inclusione forzata
nello scope non permette di indicizzare un PDF grezzo. Gli alias delle vecchie
citazioni e dello scope continuano a risolvere il Markdown omonimo.

## Conversione

- Motori locali PyMuPDF/PyMuPDF4LLM 1.28.2, versionati in `backend/requirements.txt`.
- Processo separato, limite di 300 secondi; input fino a 50 MB. Nessuna chiamata
  a servizi esterni per conversione o OCR.
- OCR italiano/inglese sulle pagine prive di testo con immagini o disegni.
  I dati Tesseract sono installati nell'immagine Docker.
- Testo originale acquisito prima della ricostruzione del layout. Se il layout
  perde oltre il 2% delle parole confrontabili della pagina, viene usato il
  testo originale, con struttura semplificata. Le pagine OCR usano il testo OCR.
- Metadati `pdf2md` con hash della sorgente e del corpo Markdown, pagine,
  pagine OCR, struttura semplificata e pagine senza testo riconosciuto.
- Pagine senza testo segnalate nel documento e nel campo `warning` della risposta.
  Grafici, formule e OCR richiedono revisione quando l'esattezza è essenziale.

Il PDF di un nuovo upload è temporaneo; resta nella collezione solo il Markdown.
Conservare autonomamente l'originale se serve per revisione o impaginazione.
Questo contratto riguarda le basi di conoscenza RAG: i flussi dei profili QSA,
degli allegati delle conversazioni e delle attività pQBL mantengono i loro formati.

## Errori e sostituzioni

- `422`: PDF non valido, protetto da password, illeggibile anche dopo OCR o
  conversione scaduta; nessuna sorgente pubblicata e nessun reindex.
- `409`: un PDF vorrebbe sostituire un Markdown omonimo; rinominare l'upload
  oppure rimuovere esplicitamente la sorgente precedente. Anche una creazione
  concorrente viene rilevata, senza sovrascrittura.
- Gli upload `.md` devono essere UTF-8 e non vuoti; possono aggiornare un Markdown
  esistente. La pubblicazione è atomica: il RAG non legge file scritti a metà.
- Un Markdown caricato dall'admin viene incluso nello scope se non ha esclusioni
  salvate. La collezione `competenzestrategiche` conserva il vincolo delle guide:
  per altri nomi occorre usare esplicitamente il flag Scope.

La risposta conserva `status`, `filename`, `warning`, `stats` e aggiunge
`original_filename` e `converted`. Dopo la pubblicazione viene eseguito il reindex;
se il servizio di embedding fallisce, il Markdown resta disponibile e si può
riprovare il reindex amministrativo.

## Verifica e distribuzione

```bash
docker compose build backend
docker compose run --rm --no-deps backend python -m unittest backend.tests.test_rag_markdown backend.tests.test_rag_pdf_upload -v
docker compose run --rm --no-deps backend python -m backend.tests.test_smoke
docker compose up -d --no-deps backend
```

I test coprono conversione reale, OCR reale, conservazione del testo quando il
layout modifica il documento, errori, collisioni, upload HTTP e corpus Markdown.
La versione della firma degli indici è incrementata: il primo reindex elimina
eventuali sorgenti PDF pregresse e riutilizza gli embedding già in cache.

Validazione del 19 settembre 2026: 24 test mirati e 202 verifiche smoke superati.
Nell'immagine distribuita, una collezione temporanea ha ricevuto un PDF testuale
e una scansione attraverso l'endpoint HTTP, indicizzandoli con
`qwen3-embedding:4b`. La ricerca reale ha restituito `text.md` e `scan.md`;
anteprima HTTP 200 e collisione HTTP 409. La collezione di prova è stata rimossa.
I quattro indici persistenti sono stati ricostruiti: 8.173 blocchi, tutte le
sorgenti Markdown; riutilizzati 7.961 embedding in cache e rigenerati i 212
blocchi della collezione delle guide.
