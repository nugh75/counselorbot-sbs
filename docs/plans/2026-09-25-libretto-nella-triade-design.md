# Il libretto confluisce nella triade: design

Data: 2026-09-25 · Branch: `feature/libretto-triade` · Stato: implementato (2026-09-26, lotti A–D)

Il libretto (`StudentBooklet`, `/profilo/libretto`) viene eliminato. Ogni sua
domanda passa in una sezione che esiste già o che viene estesa, e gli obiettivi
diventano la conseguenza della riflessione invece di esserne la cornice.

## 1. Problema

1. **Gli obiettivi stanno in cima alle pagine di riflessione.** `JourneyOverview`
   (riquadro «Obiettivi collegati») è reso sopra taccuino, libretto, portfolio e
   Tavolo (`app/profilo/page.tsx:482`) e sopra carte, confronto e azioni
   (`PersonalVisualWorkspacePage.tsx:40`). Il messaggio implicito è «prima
   l'obiettivo, poi la riflessione che lo serve». Il percorso voluto è quello
   opposto.
2. **Il libretto duplica la triade Obiettivi, Azioni e Linea del tempo.** La sua
   definizione («ogni scheda diventa un percorso con obiettivi, strategie e
   verifiche») coincide con quella degli Obiettivi, ma solo come testo libero:
   il campo «Obiettivo: mi propongo di…» e i veri `PersonalGoal` non si conoscono.
   La biografia è già copiata nella Linea del tempo da `booklet_timeline.py`.
3. **Agli Obiettivi mancano metà delle domande del libretto:** il metodo, le
   azioni di controllo e il bilancio (impegni rispettati, raggiungimento,
   soddisfazione, ostacoli, cambiamento, cosa faccio diversamente).
4. **Il legame obiettivo–risorsa non ha ruolo.** `GoalResourceLink` non
   distingue «nasce da», «si raggiunge con» e «ne è la prova».

Dati di produzione al 2026-09-25: 10 schede di 9 utenti (QSA 7, QSAr 1,
SAVICKAS 1, IDEA 1). In tutte sono compilati solo `strength` e `growth_area`;
`motivation`, `objective` e `strategy` sono compilati in 2 schede, la biografia
in 1. 5 obiettivi personali. La migrazione è quasi a costo zero.

## 2. Principio

Ogni sezione risponde a una domanda; nessuna domanda ha due posti.

| Domanda | Sezione | Fase (Zimmerman 2000) |
| --- | --- | --- |
| Chi sono? Cosa conta per me? | **Taccuino** | — |
| Cosa mi dice lo strumento? | **Compilazioni** · «La mia lettura» | previsione |
| Dove voglio andare, perché, con quale metodo? | **Obiettivi** | previsione |
| Cosa faccio, come controllo? | **Azioni** (anche di tipo controllo) | esecuzione |
| Com'è andata? Cosa faccio diversamente? | **Obiettivi** · Bilancio | auto-riflessione |
| Cosa è successo, cosa ho capito? | **Linea del tempo** · tappa passata | auto-riflessione |
| Cosa lo prova? | **Portfolio** (collegato come prova) | — |

L'obiettivo nasce da una fonte riflessiva: un'area della lettura, la difficoltà
nel taccuino, «cosa proverò» in una tappa, la sintesi di una chat. La fonte
resta registrata come origine.

## 3. Fondamenti

| Fonte | Principio | Traduzione nel prodotto |
| --- | --- | --- |
| Zimmerman (2000) | Ciclo previsione, esecuzione, auto-riflessione | Lettura e metodo prima; azioni e controlli durante; bilancio dopo |
| Egan, *The Skilled Helper* | Situazione attuale → scenario preferito → strategie | L'obiettivo nasce dalla lettura, non la precede |
| Sheldon & Elliot (1999) | Obiettivi auto-concordanti | «Cosa conta per me» nel taccuino; «Perché conta» nell'obiettivo |
| Carver & Scheier (1998); Harkin et al. (2016) | Anello di retroazione; il monitoraggio aiuta | Azioni di controllo con storico, non una data sola |
| Oettingen (2014) | Contrasto mentale con gli ostacoli | «Cosa mi ha ostacolato?» nel bilancio |
| Gollwitzer (1999) | Intenzioni di attuazione | «Cosa faccio diversamente?» → nuovo obiettivo o azione |

## 4. Decisioni (confermate dall'utente)

1. **Il libretto sparisce.** La voce scompare dall'Area personale e
   `/profilo/libretto` reindirizza a `/profilo/compilazioni`.
2. **Mappa delle domande** del libretto:

   | Libretto | Nuova sede |
   | --- | --- |
   | Punti di forza / aree da migliorare | Compilazioni · «La mia lettura» |
   | Perché è importante per me | Taccuino «Cosa conta per me» + motivazione dell'obiettivo |
   | Obiettivo: mi propongo di… | `PersonalGoal`, con origine |
   | Strategia: mi impegno a… | Obiettivo · **Metodo** |
   | Da / A | date delle azioni e dei controlli, data di revisione |
   | Ho rispettato gli impegni? · Valutazione finale · Miglioramenti · Difficoltà · Cosa ho capito | Obiettivo · **Bilancio** |
   | Biografia (data, occasione, ho scoperto che, parole chiave) | Linea del tempo · tappa passata |
   | Scheda evento (ruolo, cosa ha funzionato e cosa no, rilettura, cosa proverai, come e quando) | Linea del tempo · tappa passata |
   | Note / osservazioni finali | riflessione della tappa o del bilancio |

3. **Metodo = campo dell'obiettivo.** Accetta strategie del catalogo certificato
   e **strategie create dallo studente**. Quelle dello studente finiscono anche
   nella lista personale «Le mie strategie», riproposta nei nuovi obiettivi.
   Non vengono mai certificate e restano marcate come proprie (✎ contro ✦).
4. **Il monitoraggio è un'azione** di tipo controllo (`Action.kind='check'`).
5. **La chiusura dell'obiettivo passa dal Bilancio**, che sostituisce il cambio
   di stato fatto a mano verso «concluso»; lo stato resta comunque manuale.
6. **Il PDF del libretto diventa il PDF «Percorso dell'obiettivo».**
7. **Il riquadro `JourneyOverview` non sta più in cima a nessuna pagina.** Sulle
   pagine riflessive lo sostituisce un ponte in fondo («→ Rendi obiettivo»).

## 5. Modello dati

### 5.1 `PersonalGoal` (colonne nuove)

| Colonna | Tipo | Note |
| --- | --- | --- |
| `method` | JSON, default `[]` | lista di `{kind: 'certified', slug}` o `{kind: 'own', id}`; al massimo 12 voci |

La motivazione resta `motivation`. Il campo `reflection` resta per compatibilità
e non viene più mostrato: il suo contenuto migra nel primo bilancio (§ 8).

### 5.2 `goal_resource_links.role` (colonna nuova)

`String`, default `'related'`. Valori: `origin` | `means` | `evidence` | `related`.

| Kind | Ruolo ammesso |
| --- | --- |
| `reading` (nuovo), `notebook`, `event`, `session` (nuovo) | `origin` |
| `action` | `means` |
| `portfolio` | `evidence` o `related` |
| `tavolo`, `card`, `comparison` | `related` |

Un obiettivo ha al massimo **un** collegamento `origin`. `ResourceKind` perde
`booklet` e guadagna `reading` e `session`. Aggiunta con `ALTER TABLE … ADD
COLUMN IF NOT EXISTS` in `main.py`, nello stesso stile delle migrazioni esistenti.

### 5.3 `personal_strategies` (tabella nuova)

| Colonna | Tipo | Note |
| --- | --- | --- |
| `id` | Integer PK | |
| `username` | String, indice | |
| `text` | String(300) | |
| `created_at`, `updated_at` | DateTime tz | |

L'eliminazione è permessa solo se nessun obiettivo la usa; altrimenti 409 con
l'elenco degli obiettivi che la usano.

### 5.4 `goal_reviews` (tabella nuova, il Bilancio)

| Colonna | Tipo | Note |
| --- | --- | --- |
| `id` | Integer PK | |
| `goal_id` | FK `personal_goals.id` ON DELETE CASCADE | indice |
| `commitment` | `full` \| `enough` \| `partial` \| `none` | «Ho fatto ciò che avevo deciso?» |
| `outcome` | `reached` \| `partial` \| `not_reached` \| `abandoned` | |
| `satisfaction` | `much` \| `enough` \| `little` \| `none` | |
| `obstacles`, `change`, `learned`, `next_step` | Text ≤ 1500 | tutti facoltativi |
| `created_at` | DateTime tz | |

Append-only: riaprire un obiettivo e richiuderlo produce un secondo bilancio.
Effetto sullo stato: `abandoned` → `archived`, tutti gli altri esiti →
`completed`. Il bilancio incrementa `revision` dell'obiettivo (409 se cambiato).

### 5.5 `result_readings` (tabella nuova, «La mia lettura»)

| Colonna | Tipo | Note |
| --- | --- | --- |
| `id` | Integer PK | |
| `username` | String, indice | |
| `session_id` | String, indice | la compilazione letta |
| `questionnaire_type` | String | |
| `strengths`, `growth_areas` | JSON lista | codici fattore o testo libero (come `factorMulti` oggi) |
| `note` | Text ≤ 2000 | «Cosa mi dice di me» |
| `created_at`, `updated_at` | DateTime tz | |

Vincolo `UNIQUE(username, session_id)`: una lettura per compilazione.
Per gli strumenti senza fattori (SAVICKAS, IDEA) restano solo i campi
testuali, e forza e aree da far crescere diventano testo libero.

### 5.6 `Action` (workspace personale, `visual_tools.py`)

- `kind` guadagna `'check'`.
- Campi nuovi, facoltativi, validi solo con `kind='check'`: `progress`
  (`on_track` | `slow` | `stuck`) e `adjustment` (≤ 1000, «Cosa cambio»). La
  riflessione esistente diventa «Cosa osservo».
- Un controllo senza obiettivo collegato è ammesso ma sconsigliato: la UI lo
  crea sempre a partire da un obiettivo.

### 5.7 `TimelineEvent` (tappa passata)

Campo nuovo facoltativo `review`, valido solo per le tappe passate:

```
review: {
  role: 'protagonist' | 'observer' | 'alongside' | null,
  worked: str[] (≤10), did_not_work: str[] (≤10),
  reading: str ≤1500,          // la tua rilettura
  discovery: str ≤1000,        // ho scoperto che
  keywords: str ≤200,
  try_next: str ≤1000, how_when: str ≤1000
}
```

`personal_links` perde `'booklet'`. Le tappe generate dal bilancio hanno
`symbol='milestone'`, un `source` che rimanda al goal id, e sono in sola
lettura nella linea (si modificano dal bilancio).

### 5.8 Taccuino

`LEARNER_PROFILE_FIELDS` guadagna `values` («Cosa conta per me», ≤ 1000). Il
campo `goal`, già nascosto, resta nello storico.

## 6. API

- **Obiettivi** (`routes/goals.py`)
  - `GoalWrite` + `method`. `goal_dict` + `method` (risolto con titolo e
    provenienza), `origin` (risorsa risolta o `null`), `reviews` (lista, dalla
    più recente), `checks` (azioni `check` collegate, con esito).
  - `POST /user/goals` + `origin: {kind, target_id}` facoltativo: l'arco
    `origin` nasce nella stessa transazione.
  - `LinkWrite` + `role`; 422 se la combinazione kind/ruolo non è ammessa o se
    esiste già un `origin`.
  - `POST /user/goals/{id}/reviews` body `{…bilancio, revision}` → crea il
    bilancio, aggiorna lo stato e la tappa nella linea; ritorna l'obiettivo.
  - `GET /user/goals/{id}/pdf` → PDF «Percorso dell'obiettivo».
- **Strategie personali:** `GET/POST/PATCH/DELETE /user/strategies`.
- **Letture:** `GET /user/readings?session_id=`, `PUT /user/readings/{session_id}`
  (upsert), `DELETE /user/readings/{session_id}` (409 se è origine di un obiettivo).
- **Rimossi:** le rotte del libretto in `routes/survey.py` (CRUD, PDF,
  `STUDENT_BOOKLET_TYPES`) e `sync_booklet_biography`. Dopo la migrazione
  restano 410 per un rilascio, poi si eliminano.
- **Contesto chat** (`chat_logic.py`): `_student_booklet_context` è sostituito
  da `_reading_context`, cioè la lettura della compilazione corrente più gli
  obiettivi che ne sono nati. `goals_context` aggiunge a ogni obiettivo attivo:
  metodo (titoli, ✎/✦), ultimo controllo (esito + cambio), ultimo bilancio se
  riaperto. Il budget resta 6500 caratteri. L'header
  «## Libretto dello studente» sparisce; `test_smoke` va aggiornato.
- **Chat per evento** (`event_booklet.py`, `routes/chat.py`): il blocco privato
  resta ```` ```booklet ```` per compatibilità con i prompt, ma la bozza ora si
  salva come **tappa passata** con `review`. La direttiva `[BOOKLET DRAFT]`
  cambia solo il testo che dice dove finisce la bozza. `tool_brief_seed.py`:
  «save in their Booklet» → «save as a milestone in their Timeline».
- **Trasferimento dagli strumenti visuali** (`visual_personal.py`): la
  destinazione `booklet` è sostituita da `reading` (nota della lettura). Dei
  campi `BOOKLET_FIELDS`, solo `note` resta come destinazione.
- **Orientamento** (`routes/orientation.py:_has_legacy_activity`): il libretto è
  sostituito da `result_readings` o `personal_goals`.
- **Prompt con testi fissi** (`prompt_contract.py`, `prompt_config.py`,
  `orientation.py`): «Notebook, Booklet and Portfolio» → «Notebook, readings,
  goals and Portfolio». I prompt personalizzati in DB si aggiornano solo in
  append (stessa regola dei prompt di step, PR #5), mai sovrascritti.

## 7. Frontend

Le bozze ASCII approvate sono nella conversazione del 2026-09-25; qui la struttura.

### 7.1 Area personale

`personalAreaGroups.reflection` = `['taccuino', 'cambiamenti', 'compilazioni']`.
`app/profilo/libretto/page.tsx` → `redirect('/profilo/compilazioni')`,
conservando `?instrument=`. Vanno aggiornati anche `personalAreaImages`,
`i18n-personal-area.ts` e la guida.

### 7.2 Compilazioni · «La mia lettura» (`components/profile/ResultReadingCard.tsx`, nuovo)

Sotto il grafico dell'esito: forza e aree da far crescere (riusa il selettore
a fattori di `StudentBookletCard`), «Cosa mi dice di me», un pulsante
`[→ Rendi obiettivo]` per ogni area da far crescere, e l'elenco «Obiettivi
nati da qui». «Rendi obiettivo» apre `GoalDialog` precompilato (titolo vuoto,
motivazione = nota della lettura) con `origin={kind:'reading'}`.

### 7.3 Taccuino (`LearnerProfileCard`)

Campo «Cosa conta per me» dopo il contesto. In fondo, un ponte
`[→ Rendi obiettivo la difficoltà]` se `main_difficulty` non è vuota
(`origin={kind:'notebook'}`, motivazione precompilata con `values`).
Il `JourneyOverview` in cima viene rimosso.

### 7.4 `GoalDialog`

Sezioni, in ordine: **Nato da** (origine, sola lettura, link) · Serve a ·
**Cosa voglio** (titolo, perché conta, criteri) · **Come ci arrivo** (Metodo,
Sottobiettivi, Azioni; «→ Metti in pratica» su una strategia crea un'azione
collegata) · **Come controllo** (controlli con esito; «+ Controllo» con data)
· **Prove** (portfolio con ruolo `evidence`) · **Bilancio** (storico dei
bilanci; «Fai il bilancio») · barra fissa. Le sezioni vuote restano chiuse.
Tabella «Collegamenti»: `booklet` sparisce, gli altri tipi diventano `related`.

`GoalReviewStep.tsx` (nuovo): il passo Bilancio dentro lo stesso `<dialog>`,
con la stessa guardia bozze (`useDraftGuard`). I pulsanti «→ nuovo obiettivo»
e «→ nuova azione» usano `next_step` come testo iniziale; il nuovo obiettivo ha
`origin={kind:'session'}` se esiste la sessione, altrimenti nessuna origine e
un collegamento `related` all'obiettivo chiuso. «→ aggiorna taccuino» apre il
taccuino con `change` proposto come nota.

`MethodPicker.tsx` (nuovo): menu con «Le mie strategie» sopra il catalogo
certificato filtrato per lingua, più «Scrivi una mia strategia», che la crea
in `personal_strategies` e la aggiunge.

`[⤓ Scarica il percorso]` nella barra, sempre disponibile.

### 7.5 Azioni (bacheca)

Pulsante «+ Controllo» (chiede l'obiettivo). Scheda del controllo con ◷ e la
domanda «Come va con: {obiettivo}?». Spostarlo in «Fatte» apre un mini-modulo
(a che punto sono / cosa osservo / cosa cambio); senza «a che punto sono» non
si chiude.

### 7.6 Linea del tempo

Legenda: ● tappa, ◆ bilancio, ◷ controllo, ☐ azione, ◎ revisione. Il modulo
della tappa passata ha una sezione chiudibile «Rileggere l'esperienza» con i
campi di `review`. Da `try_next`: `[→ obiettivo]` `[→ azione]` con
`origin={kind:'event'}`.

### 7.7 Chat guidate

- `EventBookletCard` → `EventMilestoneCard`: «Salva come tappa» e poi, se
  `try_next` è compilato, «Rendi obiettivo».
- `GoalDraftCard`: invariata, più `origin={kind:'session', target_id: sessionId}`.
- Chat QSA/QSAr: nessuna scheda nuova in questo lotto. La lettura si compila
  dalle Compilazioni.

### 7.8 Rimozione di `JourneyOverview` in cima

- `app/profilo/page.tsx:482` e `PersonalVisualWorkspacePage.tsx:40`: rimossi.
- Portfolio: ogni voce collegata mostra il chip «prova di: {obiettivo}».
- Tavolo, carte e confronto: nessun riquadro; il collegamento si vede dal lato
  obiettivo.
- `JourneyOverview` sopravvive solo senza `kind` (Area personale), se usato;
  altrimenti si elimina.

### 7.9 Eliminazioni

`StudentBookletCard.tsx`, `booklet-biography.ts`, la sezione libretto di
`app/profilo/page.tsx`, i link `/profilo/libretto` in `goals.ts` e `GoalUI.tsx`,
le chiavi `booklet.*` non più usate (dopo lo spostamento di quelle riusate
in `reading.*` e `goalReview.*`).

## 8. Migrazione (una volta, idempotente, marcatore in `app_settings`)

Per ogni `StudentBooklet`, in ordine di id:

1. **Lettura:** `strength`, `growth_area`, `discovery` e `improvements` →
   `result_readings` sulla compilazione (`session_id` della scheda, altrimenti
   l'ultima compilazione dello stesso tipo). Se nessuna compilazione esiste,
   la lettura non si crea e il testo va nelle note del taccuino con prefisso
   «Dal libretto ({strumento}, {data}): …» come nuova revisione `source='migration'`.
   Più schede sulla stessa compilazione: i campi si concatenano.
2. **Obiettivo:** se `objective` non è vuoto → `PersonalGoal` con titolo =
   `objective` (160 car.; il resto nei criteri), motivazione = `motivation`,
   metodo = righe di `strategy` come strategie proprie, `review_date` =
   `period_end`, origine = la lettura del punto 1.
3. **Bilancio:** se `commitment` o `final_satisfaction` sono compilati → un
   bilancio sull'obiettivo del punto 2 (`outcome='partial'` se manca
   un'indicazione), con `difficulties` → `obstacles` e `improvements` → `change`.
4. **Biografia:** gli eventi derivati `booklet-*` già nella Linea del tempo
   diventano tappe normali (rimosso il prefisso di sincronizzazione, tolto
   `booklet` da `personal_links`), con `discovery` e `keywords` in `review`.
5. **Schede evento** (`EVENTO_*`): diventano tappe passate con `review`.
6. **Obiettivi esistenti** con `reflection` non vuota: se lo stato è
   `completed` o `archived` e non hanno bilanci, si crea un bilancio con
   `outcome='reached'` (o `'abandoned'` se archiviato), `commitment` e
   `satisfaction` nulli e `learned` = `reflection`. Gli obiettivi ancora aperti
   tengono il testo dov'è (nascosto nel popup) e il PDF lo stampa come «Note».
7. Le schede restano nella tabella `student_booklets` per un rilascio (backup),
   senza API. Si elimina la tabella nel rilascio successivo.

In produzione: 10 schede, 2 con un obiettivo. Un test copre ogni ramo.

## 9. PDF «Percorso dell'obiettivo» (`pdf_generator.generate_goal_path_pdf`)

Sezioni, nell'ordine: intestazione (titolo, nome, periodo, stato) · 1 Da dove
nasce (origine, lettura, perché conta, «serve a») · 2 Criteri · 3 Metodo
(✦/✎) · 4 Sottobiettivi (solo titolo e stato) e azioni · 5 Controlli · 6 Prove
· 7 Bilancio (l'ultimo; i precedenti in sintesi). Un obiettivo aperto ha il
timbro «in corso» e niente sezione 7. Si riusano font e stili del PDF
libretto; `generate_student_booklet_pdf` si elimina. Testi del PDF in 6 lingue.

## 10. Errori

- 409 revisione su bilancio, metodo o collegamenti → messaggio conflitto e
  «Ricarica»; la bozza del popup resta.
- 409 eliminazione di una strategia usata o di una lettura d'origine →
  elenco degli obiettivi coinvolti.
- 422 ruolo non ammesso o secondo `origin`.
- 410 sulle vecchie rotte del libretto, con `Location` verso le Compilazioni.

## 11. Test

Backend (DB Postgres di test `counselorbot_test`):
- `test_goals.py`: `method` (certificata, propria, strategia di altro utente → 404);
  `origin` alla creazione e unicità; ruoli ammessi; bilancio → stato,
  revisione, tappa nella linea; secondo bilancio dopo la riapertura;
  `goals_context` con metodo, controlli e bilancio entro il budget.
- `test_strategies.py`: CRUD, 409 se usata.
- `test_readings.py`: upsert, unicità, 409 se origine, strumenti senza fattori.
- `test_visual_tools.py`: `check` con `progress`/`adjustment`; campi rifiutati su
  altri `kind`; `review` sulla tappa passata, rifiutato su quella futura.
- `test_booklet_migration.py`: ogni ramo del § 8, idempotenza.
- `test_smoke`: header del contesto aggiornato; nessun «Libretto dello studente».
- `test_event_booklet.py`: la bozza diventa tappa.

Frontend unit: `goal-network` invariato; nuovi `goal-method.test.ts` (unione
catalogo + proprie, marcatura) e `timeline-legend.test.ts`.

Browser:
- Compilazioni: lettura, «Rendi obiettivo», origine visibile nel popup.
- Taccuino: nessun riquadro in cima; ponte in fondo.
- Popup: metodo con strategia propria riusata nel secondo obiettivo; controllo
  dalla bacheca con mini-modulo; bilancio → stato concluso e tappa ◆ nella linea.
- `/profilo/libretto` reindirizza.
- Tappa evento dalla chat → linea del tempo con «Rileggere l'esperienza».
- PDF scaricabile (200, `application/pdf`) per un obiettivo aperto e uno chiuso.
- Mobile 360 px: popup a foglio, nessuno scorrimento orizzontale.

## 12. Documentazione

`CONTEXT.md` (glossario: «libretto» ritirato; «lettura», «metodo»,
«controllo», «bilancio» aggiunti, con coppie nelle 6 lingue),
`docs-counselorbot/funzionalita-counselorbot.md`, la guida e le catture
nelle 6 lingue, `make guidance-check`, e la knowledge card dell'assistente
del sito (il valore in DB si aggiorna solo in append).

## 13. Fuori ambito

- Scheda «La mia lettura» proposta dal counselor a fine chat QSA.
- Suggerimenti automatici di controlli o di esiti.
- Più origini per un obiettivo.
- Condivisione di letture e bilanci con il docente: restano privati, e il
  docente vede solo i campi degli obiettivi esposti oggi.
- Strategie proprie proposte all'admin per la certificazione.
