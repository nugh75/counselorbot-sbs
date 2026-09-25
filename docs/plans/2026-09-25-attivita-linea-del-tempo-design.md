# Attività e Linea del tempo: design

Data: 2026-09-25 · Branch: `feature/activities-timeline` · Stato: approvato in chat, in revisione scritta

## 1. Problema

Nel gruppo «Il mio percorso» dell'Area personale, «Attività» e «Calendario e diario»
si sovrappongono:

- un evento **futuro** del calendario è quasi un'attività con una data;
- «Crea attività» con data (Obiettivi) e «Pianifica» (Assegnazioni) creano **due
  oggetti**: un'attività e un evento collegato;
- una tappa futura («Laurea 2027») somiglia a un obiettivo.

Dati in produzione al 2026-09-25: 3 utenti, 2 attività, 2 eventi (futuri, non
collegati). La migrazione è quasi a costo zero.

## 2. Principio

Ogni cosa ha un solo posto:

| Funzione | Dove | Oggetto |
| --- | --- | --- |
| Il futuro che desidero | Obiettivi | obiettivo (rete, data di revisione) |
| Cosa faccio, a che punto sono | Attività | attività con **data facoltativa** |
| Cosa è successo e cosa significa | Linea del tempo | tappa passata con riflessione |
| Quando | Linea del tempo | **vista unica** di tutto il resto |

## 3. Decisioni (confermate dall'utente)

1. Le tappe future non esistono più come oggetto: il futuro desiderato sta negli
   Obiettivi, le cose da fare con una data sono attività.
2. **Attività** (`/profilo/azioni`): solo la Bacheca (da fare / in corso / fatte),
   con data facoltativa (giorno o periodo). Nessuna scheda calendario.
3. **Linea del tempo** (`/profilo/timeline`, oggi «Calendario e diario»): un asse
   dal passato al futuro che mostra **tutto**: tappe passate, attività con data,
   date di revisione degli obiettivi attivi, appuntamenti dell'istituto.
4. Nella Linea del tempo si scrivono solo **tappe passate**; per il futuro due
   pulsanti portano a «+ Obiettivo» e «+ Attività».
5. Nome pagina: «Linea del tempo» (6 lingue). Immagine invariata.
6. Strumenti visuali dentro le chat (bacheca e linea del tempo di sessione):
   invariati.

## 4. Modello dati

`Action` (backend/visual_tools.py) acquisisce gli stessi campi data di
`TimelineEvent`, facoltativi:

| Campo | Tipo | Note |
| --- | --- | --- |
| `date_mode` | `'point' \| 'period' \| None` | assente = senza data |
| `start_date` | `YYYY-MM-DD \| None` | |
| `end_date` | `YYYY-MM-DD \| None` | solo con `period` |

Stesse regole di validazione degli eventi (riuso del validatore esistente).
Valgono sia per il workspace personale sia per quello di sessione (in chat i
campi restano semplicemente vuoti).

`TimelineEvent` resta invariato nello schema. Nel workspace **personale** il
backend rifiuta (422) la creazione o modifica di eventi personali con
`tense='future'`; restano ammessi:
- eventi `tense='past'` (tappe, biografia del Libretto);
- eventi con `institution_event` (appuntamenti dell'istituto), qualunque data.

## 5. Migrazione una tantum (all'avvio, idempotente, senza perdite)

Per ogni workspace personale, gli eventi con `tense='future'` e senza
`institution_event`:

1. diventano attività: `title`, `detail = planned`, `reflection`, date copiate,
   `stage='todo'` (o lo stage dell'attività collegata, se una sola in `action_ids`);
2. se l'evento aveva esattamente un'attività in `action_ids`, **si fondono**:
   l'attività esistente riceve le date (e il `planned` in coda al dettaglio se
   diverso), niente doppione;
3. i collegamenti degli obiettivi `kind='event'` verso l'evento migrato diventano
   `kind='action'` verso l'attività risultante (senza duplicati);
4. `AssignmentWork.event_id` verso un evento migrato diventa `NULL`; la riflessione
   dell'assegnazione passa sull'attività (vedi §6);
5. un marcatore `Log(action='activities_timeline_migration')` per utente rende la
   migrazione idempotente; lo stesso advisory lock del salvataggio evita doppi
   passaggi con più worker.

## 6. Flussi che cambiano

- **Obiettivi → «Crea attività» con data**: crea solo l'attività con `date_mode`
  e date; nessun evento, un solo collegamento `kind='action'`.
- **Assegnazioni → Pianifica**: crea solo l'attività `assignment-{id}` con la data;
  `event_id` resta `NULL`. La riflessione della restituzione
  (`PUT /user/assignments/{id}/reflection`) si scrive su `action.reflection`; per
  righe storiche con `event_id` ancora valido (evento passato) continua a
  funzionare sull'evento.
- **Libretto → biografia**: invariato (crea tappe passate).
- **Orientamento → aggiungi appuntamento**: invariato (evento istituzionale).
- **Portfolio → esporta linea del tempo**: esporta le tappe passate (come oggi
  esporta gli eventi); le attività non entrano nell'esportazione.

## 7. Frontend

### Attività (`/profilo/azioni`)

- Bacheca attuale; nel dettaglio di un'attività i campi data riusano
  `TimelineDateFields` (giorno / periodo / nessuna data).
- Sulla scheda di un'attività con data: la data formattata e il link
  «Vedi sulla linea del tempo» (`/profilo/timeline?item=action-<id>`).

### Linea del tempo (`/profilo/timeline`)

- Testata `PersonalAreaHeader slug="timeline"` (come Obiettivi/Orientamento).
- Barra: «+ Tappa» (solo passato), «+ Attività» (→ `/profilo/azioni`,
  apre la creazione), «+ Obiettivo» (→ `/profilo/obiettivi`, apre il popup di
  creazione), filtri per tipo (tappe, attività, obiettivi, appuntamenti), tutti
  attivi di default e ricordati in `localStorage` (`cb_timeline_filters`, try/catch).
- Un asse unico ordinato per data, con separatore «Oggi»; voci senza data (tappe
  con solo testo) in una sezione finale «Senza data».
- Ogni voce mostra un'icona della sua provenienza e il tipo; solo le tappe si
  modificano qui (editor attuale ridotto a tappe passate). Attività e obiettivi
  sono di sola lettura: clic → pagina di origine sull'elemento
  (`/profilo/azioni#action-<id>`, `/profilo/obiettivi?goal=<id>`).
- Appuntamenti dell'istituto: come oggi (disponibilità, scadenze).
- La vista a calendario esistente (`TimelineCalendar`) mostra le stesse voci.
- Sotto 1024 px: elenco verticale; nessuno scorrimento orizzontale.
- Guardia bozze (F06) sull'editor delle tappe con `useDraftGuard`.

### Testi e guida

Nome e descrizione in `i18n-personal-area.ts`, etichette in
`i18n-visual-tools.ts`, guida in-app (`guide.*` pertinenti) in 6 lingue;
`docs-counselorbot/funzionalita-counselorbot.md`; `make guidance-check`.

## 8. Test

Backend (Postgres):
- `Action` accetta/rifiuta date come gli eventi; il workspace personale rifiuta
  eventi personali futuri, accetta passati e istituzionali;
- migrazione: evento futuro → attività; evento con una attività collegata → fusione;
  link obiettivo `event` → `action`; `AssignmentWork.event_id` → NULL con riflessione
  conservata; idempotenza (seconda esecuzione non cambia nulla);
- Obiettivi «Crea attività» con data: un'attività con date, nessun evento;
- Assegnazioni pianifica + riflessione: sull'attività.

Frontend unit: costruzione delle voci della linea del tempo da workspace, obiettivi
e appuntamenti; filtri; ordinamento e separatore «Oggi».

Browser: attività con data → compare sulla linea del tempo e il clic riporta
all'attività; obiettivo con revisione → compare; filtri; creazione tappa passata;
nessuna scelta passato/futuro; mobile 390 px senza scorrimento orizzontale.

Verifica manuale in **dev** (`scripts/dev-backend.sh`, `scripts/dev-frontend.sh`)
prima del rebuild Docker.

## 9. Fuori ambito

Strumenti visuali delle chat; Carte e Confronto; ridisegno della Bacheca oltre ai
campi data; notifiche o promemoria; sincronizzazione con calendari esterni.
