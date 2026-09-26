# Handoff: rimodernizzazione della schermata assegnazioni
Data: 2026-09-28 | Stato: PIANO APPROVATO IN SOSPESO — nessun codice toccato

## Objective
Rimodernizzare la schermata assegnazioni (lavoro pianificato, da riprendere).
Un solo componente alimenta tre superfici: studente `/profilo/assegnazioni`
(via `frontend/src/app/profilo/page.tsx`, `activeSection === 'assignments'`),
docente `/docente/assegnazioni` ed embed in scheda classe (`GroupAssignments.tsx`).
Obiettivo: gerarchia visiva nelle card (icona tipo, chip finalità/stato, scadenza),
vista docente meno muro di testo, filtri e stati coerenti con `docs/design.md`
(petrol identificazione, ocra solo movimento, slate neutro, zero animazioni decorative).

## Progress
- [x] Audit del componente condiviso `frontend/src/components/teacher/AssignmentsPanel.tsx`
      (studente + docente) e di `AssignmentWork.tsx`, `GroupAssignments.tsx`, i18n esistenti
- [x] Piano di rimodernizzazione presentato all'utente con diagramma ASCII
- [ ] Conferma finale dell'utente su: entrambe le superfici insieme o solo una?
      (domanda rimasta SENZA risposta — chiedere alla ripresa)
- [ ] Nessuna modifica al codice: working tree pulito su `main`

## Problems Encountered
Nessuno (solo analisi).

## Resolutions
- Mappatura superfici: `/profilo/assegnazioni/page.tsx` fa `export { default } from '../page'`;
  il pannello vero è in `profilo/page.tsx` riga ~778 (`AssignmentsPanel showHeading={false}`).
- Il pannello è unico per studente e docente (`teacher` prop): modernizzarlo copre
  entrambe le superfici; `GroupAssignments.tsx` riceve solo restyling leggero.
- Riusare chiavi i18n esistenti (`i18n-assignments.ts`, `i18n-assignment-work.ts`),
  nessuna modifica a API, fetch, hash deep-link `#assignment-N`, filtri F27–F31.

## Decision Log
- Piano di interventi proposto (da validare alla ripresa):
  - Riga card: icona tipo (lucide: goal/strategia/lettura) in tinta petrol, titolo in evidenza,
    chip finalità (neutro) e chip stato (emerald solo "con riscontro", ocra "da esplorare").
  - Scadenza con icona orologio; ocra solo se a breve.
  - Card studente cliccabile intera, hover bordo `indigo-300` (token esistente),
    `aria-expanded` preservata sul bottone per accessibilità.
  - Dettaglio separato da divider; istruzioni in callout info; avviso contenuto
    in callout warning (oggi testo amber nudo — viola i ruoli semantici di `docs/design.md`).
  - Filtri: più chiari + contatore risultati; empty state con icona e invito all'azione.
- Approccio: lettura della skill `frontend-design` già fatta; procedere con
  prototipazione ASCII → codice solo dopo conferma struttura (regola ASCII Prototyping).
- Branch da creare alla ripresa: `feature/assegnazioni-modernizzazione` da `main` aggiornato.
