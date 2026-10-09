# Restyling: schermata di gestione delle assegnazioni (docente)
Data: 2026-09-27 | Stato: TODO (piano validato dall'utente, nessun codice scritto)

## Obiettivo
Rimodernare la schermata del docente `/docente/assegnazioni`
(`frontend/src/components/teacher/AssignmentsPanel.tsx` con `teacher`):
la lista è oggi un muro di schede sempre espanse; serve gerarchia e
stato visibile a colpo d'occhio.

## Stato di partenza (sopralluogo fatto)
- Schede docente **sempre tutte espanse** (invii, riscontri, revoca insieme).
- Meta riga testo semplice (`Obiettivo · Laboratorio di studio · 21/09/2026`),
  finalità solo testo petrolio, nessun chip/badge di stato.
- Filtri solo sopra le 2 righe, `select` nudi inline.
- Captura di riferimento: `frontend/public/guide/it/teacher-feedback.png`
  (e `received-assignments.png` per lo studente).
- La vista studente `/profilo/assegnazioni` è già allineata al restyling
  dell'area personale: nessun intervento previsto salvo accordo contrario.

## Struttura ASCII concordata (validare di nuovo prima del codice, se cambia)

```
┌ Assegnazioni effettuate ────────────────────────────────┐
│ [Filtro classe ▾] [Tipo ▾] [Finalità ▾]   + conteggio   │  ← toolbar, glass-panel
└─────────────────────────────────────────────────────────┘

┌ glass-panel ────────────────────────────────────────────┐
│ [chip tipo] classe · 21/09              [badge stato]    │
│ Organizzare lo studio                    [Dettaglio ▾]  │
│ ⏱ scadenza 15/10 · finalità · destinatari (2)           │
│   ┌ istruzioni in callout info ──────────────────────┐  │
│   └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘

espanso: sezioni divise — consegna (istruzioni, response prompt, fonte),
riscontri (contatore, invii + editor), riga azioni a destra con Revoca.
```

## Decisioni attese prima dell'implementazione (da confermare)
1. Toggle dettaglio docente: APERTO = passare a anteprima compatta con
   `[Dettaglio ▾]` (oggi è sempre espanso) — stato default da definire
   (probabilmente aperto per coerenza col comportamento attuale).
2. Badge di stato: condivisa / da riscontro / nuova — le informazioni
   esistono già (`progress` è solo studente; lato docente serve un cursore
   semplice: 0 invii, invii < ricevuti attesi, riscontri scritti? verificare
   con l'API `/teacher/assignments/{id}/submissions` quanto è disponibile
   senza chiamate aggiuntive; se le submissions non sono nell'elenco,
   usare solo i dati di riga dell'assegnazione).
3. Vista studente fuori dal perimetro.

## Vincoli (da docs/design.md e testi esistenti)
- `glass-panel`, `page-wide`, radius unico, focus 2px petrol, target 44px.
- Petrol = azione (indigo-remap), ocra = movimento/CTA d'ingresso;
  ocra ≠ ambra; niente hex a mano; slate unica scala neutra.
- Testi e i18n INVARIATI: nessuna nuova chiave se non per un eventuale
  contatore riscontri (aggiungerla in `i18n-assignments.ts` 6 lingue).
- Non toccare `AssignmentWork.tsx` (già ok) né la API.
- Test da aggiornare: `frontend/tests/assignments.test.mjs` e
  `tests/teacher-catalogs/others` che usano i selettori della pannello;
  capture guide (`scripts/capture-guide.mjs`) per `teacher-feedback.png`
  se cambia il markup del dettaglio (#assignment-1 potrebbe cambiare).
- Docs gate: CONTEXT.md + `docs-counselorbot/funzionalita-counselorbot.md`
  + `make guidance-refresh` + `make guidance-check`.

## Comandi utili
- Server in ascolto già attivi un ALTRO qualsiasi giorno: verificare
  `ss -ltn | grep -E "3107|8002"` e, se assenti, avviare i due script
  `scripts/dev-backend.sh` / `scripts/dev-frontend.sh` (fork di hollow dev).
- Browser test: fixture docente = `python -m backend.tests.assignments_browser_server`
  con `DATABASE_URL=postgresql://counselorbot_user:<pw>@127.0.0.1:5435/counselorbot`
  porta :18099, poi `node --test tests/<test>.test.mjs` da frontend.

## Prossimi passi
- [ ] Confermare le 3 decisioni con l'utente
- [ ] Implementare il restyling
- [ ] Test browser aggiornati + tsc + lint
- [ ] Capture guide rigenerate (teacher-assignment, teacher-feedback)
- [ ] Docs gate
