# Piano e verifica dei fix di usabilità

Ambito approvato: i sei rilievi dell’audit del 5 settembre 2026. Identità visiva,
catalogo completo, scelta del counselor e dati delle sessioni vanno preservati.

## Piano operativo

1. Dimensionare la chat sullo spazio realmente disponibile; conservare campo
   di scrittura, bozza e avanzamento al ridimensionamento.
2. Raccogliere i comandi dell’intestazione nel menu compatto sotto 1280px,
   conservando counselor, ripresa, tema, movimento e lingua.
3. Mantenere visibile la conferma dello strumento durante lo scorrimento.
4. Mostrare ripresa e catalogo prima delle preferenze nella home di ritorno.
5. Usare 15px per i messaggi, 16px per il campo di scrittura e target principali
   di almeno 44px effettivi.
6. Distinguere Idea dall’intervista guidata e allineare la guida nelle sei lingue.

## Criteri di accettazione

- Chat QSA con 16 messaggi: campo di scrittura e avanzamento dentro il viewport
  a 320×568, 390×844, 768×1024, 1280×720 e 1440×1000. Il trascritto scorre in
  un contenitore interno; il campo conserva la bozza dopo il ridimensionamento.
- Chat OpenCode: campo di scrittura visibile e messaggi con scorrimento interno
  a 320×568 e 1280×720. Sul telefono il profilo rimane sotto la conversazione.
- Nessuna sovrapposizione o uscita dai bordi nei comandi dell’intestazione,
  anche con touch, nome lungo, ruolo amministratore e lingua tedesca.
- Selezionando Savickas in fondo al catalogo, nome e Continua sono visibili
  e il percorso prosegue alla revisione del taccuino prevista per il primo uso.
- Tutti i nove strumenti restano nella home. Cambio counselor e ritorno alla
  home funzionano; la presentazione iniziale resta accessibile.
- Menu touch con target di almeno 44px e colori leggibili in tema scuro.

## Verifica ripetibile

Dal frontend, `npm run test:design` usa Playwright e l’app in esecuzione su
localhost:3000. `DESIGN_BASE_URL` permette di usare un’anteprima separata.
Tutte le API, incluso il congelamento automatico, sono intercettate con dati
fittizi: la verifica non scrive sui servizi reali.

Controlli complementari: `npm test`, `npm run lint`, `npm run build`,
`npm run test:artifacts` e `npm run test:visual`.

Il ridimensionamento del viewport è verificato automaticamente; il comportamento
della tastiera di un dispositivo fisico richiede una prova sul dispositivo.

## Confine con il lavoro contemporaneo

Il workspace contiene una revisione esterna della chat (`ChatWorkspace`,
pannelli e strumenti visivi), pubblicata nel frattempo su `main` in `4f9599c`.
I fix dell’audit non modificano quei file.
La misura dell’altezza supporta sia la navigazione mobile esterna della chat
già tracciata, sia quella interna della nuova struttura, così i commit
dell’audit restano separati dal lavoro contemporaneo. La build di consegna
integra anche `4f9599c` per preservare le funzionalità già in produzione.

## Esito della consegna

Fix implementati nel commit `21d6cf0`, integrati con la versione già online in
`7bdf2e4`, sul branch `fix/design-usability`. Il worktree di consegna è
`/home/nugh75/counselorbot-sbs-design-fixes`; le modifiche esterne nel workspace
originale sono state preservate.

| Controllo | Esito |
| --- | --- |
| Test di base (`npm test`) | 104 superati |
| Usabilità sul container di produzione (`test:design`) | 16 superati |
| Artefatti sul container di produzione (`test:artifacts`) | 14 superati |
| Strumenti visivi sul container di produzione (`test:visual`) | 23 superati |
| Traduzioni | 2425 chiavi allineate nelle 6 lingue |
| Lint | 0 errori, 4 avvisi preesistenti |
| Build Docker con `next build` / Turbopack e TypeScript | Superata, 25 pagine statiche |
| Container frontend e HTTP locale | In esecuzione, risposta 200 |

Il test del menu attende esplicitamente il caricamento del nome del counselor
dopo l’apertura: la build di produzione ha evidenziato una verifica anticipata
nel test, corretta senza modificare il comportamento dell’applicazione.

La home mobile a 390px mostra il titolo del catalogo a circa 383px dall’inizio
della pagina, con una sessione da riprendere. I nove strumenti sono mantenuti.

Immagine distribuita: `counselorbot-10-step-frontend:design-usability-20260905`,
ID `sha256:59f3e77dedc0cb9ffbf5c97bb42964557d18f4988be4c5ddea6dfaf7396dad9a`.
È stato ricreato solo `counselorbot_frontend`, usando il progetto Compose
`counselorbot-10-step`, il Compose originale e `/tmp/cb-design-deploy.yml`.
Backend e dati persistenti non sono stati ricreati. L’override specifica
l’immagine sopra e il contesto `frontend` del worktree di consegna.

Limiti della verifica: i test browser usano API simulate e non attestano una
conversazione reale con un modello o un accesso SSO autenticato. Il controllo
della tastiera fisica mobile rimane da eseguire su dispositivo.

Avvisi fuori ambito: i quattro warning lint riguardano dipendenze degli hook
già presenti in `page.tsx` e `ConfigForm.tsx`, e `variant` non utilizzato in
`IdeaMapPanel.tsx`. `npm ci` segnala 14 vulnerabilità nelle dipendenze (1 bassa,
3 moderate, 10 alte); le versioni e il lockfile non sono stati modificati.
