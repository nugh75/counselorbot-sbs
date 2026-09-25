# Obiettivi come rete: design

Data: 2026-09-24 · Branch: `feature/goal-network` · Stato: in revisione utente

Sostituisce, per la pagina `/profilo/obiettivi`, lo schema «elenco a sinistra +
dettaglio a destra» dell'handoff Area personale (0.3 lotto 2). Include la
correzione F06 del piano `2026-09-23-area-personale-audit-piano-ux.md`.

## 1. Obiettivo

Gli obiettivi personali diventano una **rete**: più alberi indipendenti,
obiettivi fratelli sullo stesso livello, profondità libera e un obiettivo che
può servire più sopraobiettivi. La pagina mostra la rete come elenco rientrato;
la modifica avviene in un popup.

## 2. Fondamenti

| Fonte | Principio | Traduzione nel prodotto |
| --- | --- | --- |
| Carver & Scheier (1998); Vallacher & Wegner (1987) | Gerarchia perché (in alto) / come (in basso) | Popup con sezioni «Serve a (perché?)» e «Si raggiunge con (come?)»; «+ Sottobiettivo» suggerisce «Come ci arrivi?» |
| Kruglanski et al. (2002) | Multifinalità ed equifinalità | Più genitori per obiettivo (rete, non albero) |
| Bandura & Schunk (1981); Locke & Latham (2002) | Sottobiettivi prossimali; criteri specifici | Data di revisione e stato visibili su ogni riga |
| Harkin et al. (2016) | Il monitoraggio dei progressi aiuta | Contatore «n/m sottobiettivi conclusi», solo informativo |
| Sheldon & Elliot (1999) | Obiettivi auto-concordanti | Il campo motivazione resta; stato sempre manuale |

Rimandati: intenzioni di attuazione «se… allora…» e ostacoli (Gollwitzer 1999;
Oettingen 2014) riguardano le attività, non questa pagina.

## 3. Decisioni (confermate dall'utente)

1. **Rete a profondità libera.** Più radici, fratelli, più genitori.
2. **Eliminazione:** il ramo si spezza. I figli perdono solo quel genitore; chi
   non ne ha altri diventa radice. Nessuna cancellazione a cascata di obiettivi.
3. **Stato solo manuale.** Nessun completamento automatico né suggerimento; il
   contatore n/m è solo informazione.
4. **Posizione:** «+ Sottobiettivo» su ogni obiettivo; nel popup «Aggiungi a un
   altro obiettivo» e [×] per staccare da un genitore. Niente trascinamento.
5. **Condivisione per ramo.** Un obiettivo è visibile a un gruppo se esso o
   **uno qualsiasi dei suoi antenati** ha `shared_group_id` di quel gruppo.
   Gli antenati non condivisi restano privati. Ogni cambio di struttura che
   altera la visibilità è annunciato prima di salvare.
6. **Pagina senza sidebar:** elenco rientrato a tutta larghezza; popup modale
   (desktop) o foglio a tutto schermo (mobile).
7. **Vista mappa solo desktop** (≥1024 px), in alternativa all'elenco; su
   mobile resta solo l'elenco rientrato.
8. Guardia bozze generica e condivisa (`useDraftGuard`).
9. Contesto chat con `part_of` (fino a 3 sopraobiettivi).

## 4. Modello dati

Nuova tabella `goal_edges` (in `backend/models.py`):

| Colonna | Tipo | Note |
| --- | --- | --- |
| `id` | Integer PK | |
| `parent_id` | FK `personal_goals.id` ON DELETE CASCADE | indicizzata |
| `child_id` | FK `personal_goals.id` ON DELETE CASCADE | indicizzata |
| `created_at` | DateTime tz | server default now |

Vincoli: `UNIQUE(parent_id, child_id)`, `CHECK(parent_id <> child_id)`.
La tabella è nuova: la crea `create_all`, nessun `ALTER` necessario. Gli
obiettivi esistenti diventano radici senza migrazione dei dati.

Invarianti applicative (verificate nel backend, mai solo nel client):
- genitore e figlio appartengono allo stesso `username`;
- nessun ciclo: prima di inserire `parent → child`, `parent` non deve essere tra
  i discendenti di `child` (visita in ampiezza sugli archi dell'utente);
- l'eliminazione di un obiettivo rimuove i suoi archi per cascata (rete spezzata).

Revisione: un arco appartiene al **figlio**. Aggiungere o togliere un genitore
incrementa `revision` del figlio e usa il suo controllo ottimistico (409 se cambiato).

## 5. API

Tutte sotto le rotte esistenti in `backend/routes/goals.py`.

- `goal_dict` aggiunge `parent_ids: list[int]` (ordinati).
- `POST /user/goals`: nuovo campo facoltativo `parent_id` (int > 0). Se presente,
  deve essere un obiettivo dell'utente; l'arco nasce nella stessa transazione.
  Idempotenza `request_id` invariata.
- `POST /user/goals/{id}/parents` body `{parent_id, revision}` → aggiunge arco.
  404 genitore non dell'utente; 409 revisione; 422 `'Cycle'` se crea un ciclo;
  idempotente se l'arco esiste già. Ritorna il figlio aggiornato.
- `DELETE /user/goals/{id}/parents/{parent_id}?revision=` → toglie l'arco.
  404 se l'arco non esiste; 409 revisione.
- `DELETE /user/goals/{id}` invariato (la cascata spezza il ramo).
- `GET /teacher/groups/{group_id}/goals`: restituisce gli obiettivi dei membri
  visibili al gruppo per condivisione **propria o ereditata**. Aggiunge
  `parent_ids` filtrati ai soli obiettivi presenti nella risposta, così il
  docente vede la struttura del ramo e mai gli antenati privati. Campi esposti
  invariati più `parent_ids`.
- `goals_context` (contesto chat): per ogni obiettivo attivo aggiunge
  `part_of`: fino a 3 titoli di genitori, 120 caratteri ciascuno; il budget di
  6500 caratteri resta.

## 6. Frontend

### Struttura dei componenti (`frontend/src/components/goals/`)

| Unità | Responsabilità |
| --- | --- |
| `lib/goal-network.ts` | Funzioni pure: `buildForest(goals)`, `descendants(id)`, `ancestors(id)`, `effectiveGroups(id)`, `wouldCycle(child, parent)`, `progress(id)`, ordinamento fratelli (priorità, poi data revisione, poi id). Testate in isolamento. |
| `GoalsPanel.tsx` | Carica dati, barra azioni (+ Nuovo, Catalogo, «Mostra conclusi e archiviati»), gestisce quale popup è aperto, legge `?goal=` per aprire il popup direttamente. |
| `GoalTree.tsx` | Liste annidate con pulsanti di apertura (`aria-expanded`), Tab tra gli elementi, Invio apre il popup. Seconda occorrenza di un obiettivo con più genitori: chiusa, con «⧉ anche sotto: …». Da livello 4 il rientro si ferma e compare «↳ livello n». |
| `GoalDialog.tsx` | `<dialog>` nativo (`showModal`), foglio a tutto schermo sotto `sm`. Crea/modifica: «Serve a», campi, condivisione (propria + ereditata in sola lettura), «Si raggiunge con», Collegamenti e Crea attività in sezioni chiudibili, barra fissa Elimina/Annulla/Salva. Navigazione ↑/↓ interna al popup. |
| `GoalMap.tsx` | Vista mappa desktop (vedi sotto). |
| `GoalCatalogDialog.tsx` | Ricerca + filtro area; «Adotta» passa a `GoalDialog` precompilato. |
| `GoalForm`, `GoalUI.tsx` | Riusati. |

`app/profilo/obiettivi/page.tsx` usa `PersonalAreaHeader slug="obiettivi"` al
posto di `PageHeader` (sottotitolo sostituito dalla descrizione dell'Area personale).

### Vista mappa (solo desktop)

- Interruttore «Elenco / Mappa» nella barra azioni, visibile solo da `lg`
  (1024 px); la scelta è ricordata in `localStorage` (`cb_goals_view`) con
  try/catch. Sotto `lg` l'interruttore non c'è e si vede sempre l'elenco.
- `GoalMap.tsx` riusa `@xyflow/react` + `@dagrejs/dagre`, già usati dal Tavolo:
  layout a livelli dall'alto (perché) al basso (come); ogni obiettivo compare
  **una sola volta**, con tanti archi entranti quanti genitori.
- Nodo: titolo, stato, data revisione, n/m, 👥 se condiviso (proprio o ereditato);
  conclusi e archiviati seguono lo stesso filtro dell'elenco.
- Sola lettura della struttura: niente trascinamento di nodi né creazione di
  archi con il mouse. Pan e zoom sì; «Adatta alla vista». Clic o Invio su un
  nodo apre lo stesso `GoalDialog`; dopo il salvataggio il layout si ricalcola.
- Accessibilità: i nodi sono focalizzabili in ordine di elenco; la mappa ha
  un'etichetta che rimanda all'elenco come alternativa equivalente.

### Guardia bozze (F06)

- La bozza del popup comprende: campi obiettivo, campi «Crea attività»,
  selezione «Collega risorsa», genitore scelto in «Aggiungi a…» non ancora salvato.
- Il popup aperto con bozza chiede conferma su: ✕, Annulla, Esc (`cancel`),
  clic sul fondo, navigazione ↑/↓ interna, link della pagina, Indietro del
  browser, chiusura scheda.
- Si riusa l'hook esistente `use-category-draft-guard.ts`, rinominato
  `use-draft-guard.ts` con export `useDraftGuard` (un solo consumatore oggi:
  `app/docente/orientamento/page.tsx`, da aggiornare). La guardia locale in
  `GoalsPanel` viene eliminata.
- Regola aggiunta in implementazione: una sola bozza per volta; mentre una
  parte del popup (campi, nuova attività, collegamento, genitore scelto) ha
  testo non salvato, gli altri comandi che salvano sono disabilitati.

### Avvisi di visibilità

Prima di salvare un cambio che modifica i gruppi effettivi (aggiungere o
togliere un genitore, cambiare condivisione di un obiettivo con discendenti,
eliminare un genitore condiviso), il popup mostra quali gruppi guadagnano o
perdono la visibilità di quali obiettivi e chiede conferma. Calcolo nel client
con `effectiveGroups` prima/dopo.

### Eliminazione

Conferma: «Eliminare “X”? I suoi N sottobiettivi non verranno eliminati:
perdono questo genitore.» (+ avviso di visibilità se pertinente).

### Consumatori esistenti

- `JourneyOverview`, `personal-area.ts`, `PersonalAreaHome`: i link
  `?goal=id` aprono il popup; nessun altro cambio.
- `AssignmentWork`, `GoalDraftCard`: invariati (`parent_ids` in più è ignorato).
- `GoalCatalogEditor` (vista docente dei condivisi): elenco rientrato semplice
  tramite `parent_ids`, sola lettura.

### i18n

Nuove chiavi in `lib/i18n-goals.ts` in tutte e 6 le lingue (it, en, es, fr, de,
sv): servesTo, reachedBy, addSubgoal, addParent, detach, howPrompt, alsoUnder,
progress, showClosed, visibilityGain, visibilityLoss, inheritedShare,
deleteKeepsChildren, cycle, level.

## 7. Errori

- 409 → messaggio conflitto esistente + «Ricarica»; il popup conserva la bozza.
- 422 ciclo → messaggio `cycle`; il menu «Aggiungi a…» già esclude i cicli, il
  422 copre richieste concorrenti.
- 404 genitore scomparso → ricarica rete, bozza conservata.
- Errori di rete → `GoalIssue` con «Riprova» come oggi.

## 8. Test

Backend (`backend/tests/test_goals.py`, DB Postgres dedicato):
- crea sottobiettivo con `parent_id`; genitore di altro utente → 404;
- aggiunta/rimozione genitore, idempotenza, 409 revisione;
- ciclo diretto e indiretto → 422; auto-arco → 422;
- eliminazione genitore: figli restano, archi rimossi, figlio orfano = radice;
- condivisione ereditata: il docente vede il ramo, non l'antenato privato;
  `parent_ids` filtrati; più percorsi → più gruppi;
- `goals_context` con `part_of` e budget rispettato.

Frontend unit (`lib/goal-network.test.ts`): forest, cicli, antenati,
gruppi effettivi, progresso, ordinamento, rete con più genitori.

Browser (`frontend/tests/personal-goals.test.mjs` + `goals_browser_server.py`):
- elenco rientrato, apri/chiudi rami, seconda occorrenza chiusa con ⧉;
- popup crea/modifica/sottobiettivo/aggiungi e stacca genitore;
- F06: testo in «Crea attività» → ✕, Esc, «← Area personale», Indietro chiedono conferma;
- avviso di visibilità spostando sotto un ramo condiviso;
- mobile 360 px: foglio a tutto schermo, nessuno scorrimento orizzontale;
- tastiera: Tab tra righe e pulsanti di apertura, Invio apre, focus torna alla riga alla chiusura;
- mappa: visibile a 1280 px, assente a 360 px; un obiettivo con due genitori
  compare una volta con due archi; clic sul nodo apre il popup.

## 9. Documentazione

Dopo il rilascio: `docs-counselorbot/funzionalita-counselorbot.md`, guida e
catture Obiettivi nelle 6 lingue, `make guidance-check`, handoff Area personale
(0.3 Obiettivi chiuso + F06).

## 10. Fuori ambito

Mappa su mobile; trascinamento di nodi o archi; intenzioni «se… allora…» nelle attività;
creare un obiettivo senza compilare il bilancio (lotto 3A); completamento o
suggerimenti automatici.
