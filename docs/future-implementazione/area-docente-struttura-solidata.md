# Area docenti: struttura più solidata

> **Stato:** proposto (da fare).
> **Ambito:** frontend, Area docenti (`frontend/src/app/docente/*`, `frontend/src/components/teacher/*`).

## Problema

L'Area docenti ha una home illustrata ben organizzata (`TeacherAreaHome.tsx`,
gruppi in `lib/teacher-area.ts`), ma ogni sottopagina vive in pagina propria
senza un guscio condiviso: niente breadcrumb, niente navigazione interna
coerente tra le sezioni.

Struttura attuale della home:

```
Area docenti
├── Percorso obiettivo  → card verso chat (?start=OBIETTIVO_DOCENZA)
├── In classe          → Classi · Assegnazioni
├── Cataloghi          → Catalogo obiettivi · Strategie · Materiali
├── Ricerca            → Orientamento (solo teacher) · Somministrazioni
└── Taccuino           → notebookSlot (scelta contesto chat)
```

## Cosa fare

Guscio condiviso (layout/shell) per tutte le sottopagine `/docente/*`:

- breadcrumb "Area docenti › Classi" (o la sezione di pertinenza) su ogni pagina;
- titolo di pagina uniforme;
- navigazione tra sezioni coerente (stessa grammatica dell'Area personale).

Opzionale, da valutare a parte: ripensare i raggruppamenti della home e stati
vuoti/caricamento/errori uniformi nelle pagine docente.

## Prossimi passi

1. Diagramma ASCII della struttura proposta, da validare prima del codice
   (prassi del progetto).
2. Implementazione del guscio condiviso su branch `feature/...`.
