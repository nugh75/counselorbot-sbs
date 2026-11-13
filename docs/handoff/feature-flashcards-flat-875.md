# Handoff — feature/flashcards-flat-875 (#875)

## Stato
Implementazione fatta; verifiche statiche in corso, poi commit, push e PR.

## Fatto
- `FlashcardsPage.tsx`: mazzi ed editor carte in `Card` piatta; «Aggiungi carta», fine sessione ed elenco vuoto senza box; filetto sotto l'intestazione «I miei mazzi".
- `VisualTools.tsx`: guida «Come si usa», details/form di creazione (azioni, carte, confronto, criteri), colonne azioni/carte e mazzi senza riquadri annidati.
- Invariati: carta in studio, carte del tavolo, campi, finestre di dialogo, evidenziazione di trascinamento.
- Test `frontend/tests/flashcards-flat.test.mjs`; doc funzionalità aggiornata.

## Verifiche
- `node --test tests/flashcards-flat.test.mjs`: ok.
- `make guidance-check`: ok.
- `tests/flashcards-autosave.test.mjs` (browser, Playwright + server): non eseguito.
- Nessun controllo visivo/browser (nessun dev server avviato).

## Prossimi passi
- tsc + eslint, commit, PR su main (milestone UI consistency).

## Blocchi e rischi
- Possibile conflitto testuale su `funzionalita-counselorbot.md` con issue sorelle di #861.
