# Handoff — #83 schermate della guida dopo la navbar nuova

## Stato
Completo sul branch `docs/guide-screenshots-83` da `origin/main`. Nessun sudo,
Docker, segreto o dato di produzione. Server Next FERMATO a fine lavoro.

## Fatto
- `frontend/scripts/capture-guide.mjs` riallineato al flusso attuale (come i test
  di #911), senza modificare il prodotto:
  - il catalogo obiettivi non ha più «Assegna»: l'assegnazione si crea da
    `/docente/assegnazioni` (dialog «Nuova assegnazione», gruppo + obiettivo);
  - fixture del catalogo con `parent_ids` (evita il crash della pagina);
  - sezioni «Contatti» e «Appuntamenti» delle categorie di orientamento aperte
    prima della cattura (decode immagini tollerante all'illustrazione SVG);
  - gruppi cercati come `EntryLink` (link, non heading);
  - righe compatte del piano studente aperte prima di attendere il meeting;
  - eccezione all'assert «nessun alert» sulla panoramica classe (callout
    distruttivo «Elimina classe», role=alert per design);
  - nuovo ramo `GUIDE_SCREENS=assignments` per iterare catalogo/assegnazione/riscontro.
- Rigenerate tutte le 35 schermate per lingua in it/en/es/fr/de/sv; quick-guide
  (390 px) non rigenerata perché la barra non vi compare.

## Verifiche
- `npm ci --no-audit --no-fund`; `next build --webpack` + `next start` isolato su
  `127.0.0.1:3245` con `BACKEND_ORIGIN=http://127.0.0.1:9`, API sintetiche.
- `GUIDE_BASE_URL=http://127.0.0.1:3245 node --experimental-strip-types
  scripts/capture-guide.mjs` (216 schermate, 36 per lingua), poi
  `GUIDE_SCREENS=student-instruments`, `GUIDE_SCREENS=class-paths` e
  `GUIDE_SCREENS=institution-categories` per le sei lingue: tutto verde,
  «Contatti» e «Appuntamenti» aperti e verificati sull'immagine it.
- `git diff --stat`: 210 PNG cambiati, 35 per lingua; invariati solo quick-guide
  e le due immagini degli istituti generate dai test.
- Ispezionate catalogo, assegnazione, riscontro, panoramica/strumenti classe e
  class-paths: navbar nuova e layout attuale.
- `python3 scripts/check-platform-guidance.py --base origin/main`: allineata.
- `docs/operations/navbar-visibility-tests.md` aggiornato con l'esito.

## Prossimi passi
- Commit separati (script `test:`/`chore:`, immagini+docs `docs:`) e PR non in
  bozza; merge al proprietario. Resta la prova con uno screen reader reale.

## Blocchi e rischi
- `opencode.json` modificato localmente: NON committato. Nessun `output/`.
- `capture-quick-guide.mjs` invariato di proposito; rigenerarlo solo se cambia
  una schermata mobile.
