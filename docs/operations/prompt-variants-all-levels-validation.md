# Varianti DB per tutti i prompt e tre livelli

Data: 5 ottobre 2026. Worktree `/tmp/counselorbot-prompt-variants-all-levels-1005`,
branch `feature/prompt-variants-all-levels`, base `origin/main` dd48085
(PR #53 già unita e rilasciata). Questa correzione richiede una nuova PR.

## Risultato

Ogni istruzione del modello nella Mappa ha Totale, Ristretto e Minimo:
direttive, sistema/follow-up, meta strumento/step, varianti Idea, step e persona.
Salvataggio esplicito nel DB con revisioni, conferme per prompt condivisi e
rilettura. Totale conserva il proprietario esistente; varianti Config separate.
Vuoto eredita Totale; __short rimane compatibile soltanto con Ristretto.
Il modello assegnato e ogni ripiego scelgono i propri testi. Contratti e dati
sono raccolti una sola volta e conservati; nessuna sostituzione del messaggio
libero dello studente. Anteprima a blocchi e messaggi allineata al livello.

## Verifiche

- Backend: **168 test** passati nell'immagine isolata Python 3.10; suite contesto,
  API, composizione, routing, Mappa, factory, revisioni e Prompt Lab. Include la
  parità 65 step × 6 lingue × 3 lunghezze e 14 regressioni nuove. Le prove API
  scrivono e rileggono Config/revisioni reali in schemi PostgreSQL con rollback.
- Frontend: **265 unit test**, TypeScript, ESLint dei file modificati senza
  errori e i18n **3139 chiavi / 6 lingue**. Build Docker Next riuscita.
- Browser: Mappa **21 prove**, anteprima **2 prove**, desktop 1440 e mobile
  390 px. API simulate, scritture indipendenti dei due livelli, rilettura dei
  valori, conferme, bozza conservata mentre si modifica, persona e nessuno
  scorrimento orizzontale. [Desktop](img/prompt-variants-1440.png),
  [mobile](img/prompt-variants-390.png).
- Immagini di prova ricostruite: `counselorbot-prompt-variants-backend:validation`
  e `counselorbot-prompt-variants-frontend:validation`. Frontend solo su loopback
  3167 con backend inaccessibile. PostgreSQL dedicato su 18598, dati sintetici.
- Lint globale: rimane **1 errore preesistente** in NewDeckDialog.tsx:36 e
  44 warning; file invariato rispetto alla base, bug Diario aggiornato.
- Documentazione funzionale, procedure e manifest aggiornati. Guida pubblica
  in sei lingue riesaminata: nessun nuovo percorso studente/docente.

La nuova prova senza generazione comprende **108 richieste**, tre step per
ciascuno dei dodici strumenti, in italiano con evidenza sintetica e prompt di
fabbrica: Totale 153146, Ristretto 139168, Minimo 134902 token stimati aggregati.
[Sintesi depurata](prompt-variants-context-tokens-2026-10-05.json). Il runner live
ora prevede 216 prove con due modelli; non è stata rieseguita la valutazione
qualitativa live, né sono stati generati testi brevi amministrativi. I risultati
qualitativi precedenti restano storici e non certificano le nuove varianti.

## Limiti e rilascio

I limiti dei blocchi si applicano dopo la selezione: i default Ristretto e
Minimo escludono il meta prompt. Per inviarlo, attivare «Includi meta prompt»
nel livello. Persona troppo lunga: omessa interamente come prima. Non sono
stati salvati prompt/assegnazioni operative, né modificati servizi operativi.

Dopo il merge serve rebuild di backend, frontend e worker Prompt Lab; poi
l'amministratore scrive le varianti nella Mappa e assegna i livelli ai modelli.
Nessuna migrazione DB o modifica proxy richiesta. Nessun passo sudo in questa
verifica. I container/processi di prova propri vengono arrestati alla consegna;
le immagini e il worktree restano disponibili.

Comando backend: la suite indicata in
[CR1–CR4](model-context-levels-validation.md), aggiungendo
`backend/tests/test_prompt_variants.py backend/tests/test_prompt_revisions.py`.
Comando browser da `frontend` (indicare il Chromium installato):

```bash
PROMPT_MAP_BASE_URL=http://127.0.0.1:3167 \
PROMPT_PREVIEW_BASE_URL=http://127.0.0.1:3167 \
CHROMIUM_PATH=<percorso-chromium> \
node --test tests/admin-prompt-map.test.mjs tests/prompt-request-preview.test.mjs
```

## Diario bug

Tutti salvati LOCAL, sync `not-linked`; nessuna issue pubblicata a mano.

- e45e4b58-6dd9-4498-86c8-33d0f7e01001: copertura limitata a un solo __short,
  risolta con varianti indipendenti per tutti i testi modello.
- 026d5d79-2404-4b99-92f9-7e9c1040e092: componenti anteprima diversi dal livello
  dell'envelope, risolto con regressione dedicata.
- 6828a230-5dbf-4c3d-ae8e-77ac211f620f: override mode invariato cambiava il
  prompt ereditato nella nuova composizione, riprodotto e risolto.
- 7e1b04f7-67ee-4e8f-b472-85031ddca6fb: chiavi personalizzate con doppi
  underscore troncate; corrette e coperte da regressione.
- 4f902bb5-5cbf-4c33-a3c1-512d7e16e868: vecchio test anteprima non contava il
  preset modello aggiunto da #53; aggiornato e risolto.
- 60998c3f-474e-47db-82d8-9df6b266b290, 6e79ffe8-3449-40c8-b9e8-8039f6001e4e,
  31491d1a-adc7-4109-be43-eeab654b313f: errori nelle nuove fixture (slug,
  viewport, GET/POST), tutti riprodotti, corretti e risolti.
- 2a50c13c-0ad7-4f41-b3ab-01f56888de76: errore lint preesistente,
  confermato, fuori dal compito; evidenza aggiornata.

### Bug non registrati

Nessuno.
