# Attività e Linea del tempo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un solo oggetto «attività» con data facoltativa (Bacheca), una «Linea del tempo» che mostra tutto (tappe passate, attività con data, revisioni degli obiettivi, appuntamenti), nessuna tappa futura personale, nessun doppione attività+evento.

**Architecture:** `Action` riceve i campi data di `TimelineEvent` (validatore condiviso). Il workspace personale rifiuta eventi personali futuri; una migrazione per utente, idempotente, eseguita da `ensure_personal_timeline`, converte quelli esistenti in attività. Obiettivi e Assegnazioni creano solo attività datate. Il frontend costruisce le voci della linea del tempo con una funzione pura (`lib/timeline-items.ts`) da workspace + obiettivi.

**Tech Stack:** FastAPI + SQLAlchemy su Postgres; Next.js/React + Tailwind; pytest, `node --test`, Playwright.

**Spec:** `docs/plans/2026-09-25-attivita-linea-del-tempo-design.md`

## Global Constraints

- Branch `feature/activities-timeline`. Mai `git add -A`: file per nome. Non toccare `HANDOFF.md`.
- Commit Conventional, uno per tipo, con trailer `Co-Authored-By:` del modello che scrive.
- Test backend su Postgres dedicato: `set -a && . ./.env && set +a && DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" python3 -m pytest <file> -q`
- Testi in 6 lingue, ordine it, en, es, fr, de, sv.
- Strumenti visuali delle chat (workspace di sessione) invariati nel comportamento.
- Nessun rebuild Docker, nessun push: il controller chiede all'utente; prima si prova in dev.
- La porta 3107 è usata anche dal dev frontend dell'utente: prima di avviare server di test controllare `ss -ltnp | grep -E ':(3107|18096) '`; se occupata, usare `GOALS_BASE_URL`/porta alternativa (es. 3117) senza fermare processi altrui.

## Ruling nel piano

- Lo spec §5 dice «all'avvio»: la migrazione gira invece **per utente** dentro `ensure_personal_timeline` (già chiamata da tutte le rotte personali, con il lock del salvataggio). Stesso effetto, nessun job di avvio, copre anche workspace importati dopo.

---

### Task 1: Backend — date sulle attività, niente tappe future personali

**Files:** Modify `backend/visual_tools.py`; Test `backend/tests/test_activities_timeline.py` (nuovo)

**Interfaces — Produces:** `DatedItem` mixin con `date_mode/start_date/end_date` e validazione; `Action` la eredita; `save_workspace(..., session_id=None)` → 422 `'Future milestones belong to goals or activities'` per eventi con `tense='future'` e senza `institution_event`.

- [ ] **Step 1: test che falliscono** — `backend/tests/test_activities_timeline.py`:

```python
"""Activities carry optional dates; the personal timeline keeps only past milestones and institution events."""
import pytest
from pydantic import ValidationError
from backend import models
from backend.visual_tools import Action, PersonalWorkspace, SavePersonalWorkspace, Workspace, load_workspace, save_workspace
from backend.tests.artifact_database import artifact_session


def test_action_dates_follow_event_rules():
    assert Action(id='a1', title='Studio', date_mode='point', start_date='2026-10-01').start_date == '2026-10-01'
    assert Action(id='a2', title='Corso', date_mode='period', start_date='2026-10-01', end_date='2026-10-20').end_date == '2026-10-20'
    assert Action(id='a3', title='Senza data').date_mode is None
    for bad in (dict(date_mode='point'), dict(start_date='2026-10-01'), dict(date_mode='period', start_date='2026-10-20', end_date='2026-10-01'), dict(date_mode='point', start_date='2026-02-30')):
        with pytest.raises(ValidationError):
            Action(id='x', title='x', **bad)
    assert Workspace(actions=[{'id': 'a', 'title': 'chat', 'date_mode': 'point', 'start_date': '2026-10-01'}]).actions[0].start_date == '2026-10-01'


def test_personal_workspace_rejects_personal_future_milestones():
    with artifact_session() as db:
        state = load_workspace(db, None, 'alice')
        work = state['workspace']
        work['timeline']['events'] = [dict(id='f1', title='Laurea', period='2027', tense='future')]
        with pytest.raises(Exception) as raised:
            save_workspace(db, None, 'alice', SavePersonalWorkspace(revision=state['revision'], workspace=PersonalWorkspace.model_validate(work)))
        assert getattr(raised.value, 'status_code', None) == 422
        work['timeline']['events'] = [dict(id='p1', title='Diploma', period='2024', tense='past')]
        saved = save_workspace(db, None, 'alice', SavePersonalWorkspace(revision=state['revision'], workspace=PersonalWorkspace.model_validate(work)))
        assert [e['id'] for e in saved['workspace']['timeline']['events']] == ['p1']


def test_session_workspace_still_accepts_future_events():
    with artifact_session() as db:
        ws = Workspace.model_validate({'timeline': {'events': [dict(id='f1', title='Piano', period='2027', tense='future')]}})
        from backend.visual_tools import SaveWorkspace
        saved = save_workspace(db, 'session-1', 'alice', SaveWorkspace(revision=0, workspace=ws))
        assert saved['workspace']['timeline']['events'][0]['tense'] == 'future'
```

- [ ] **Step 2: RED** — `pytest backend/tests/test_activities_timeline.py -q` → FAIL (campi data sconosciuti; nessun 422).

- [ ] **Step 3: implementazione** in `backend/visual_tools.py`:
  - prima di `Action`, estrarre dal validatore di `TimelineEvent` la parte date in una classe:

```python
class DatedItem(Item):
    date_mode: Literal['point', 'period'] | None = None
    start_date: str | None = Field(default=None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    end_date: str | None = Field(default=None, pattern=r'^\d{4}-\d{2}-\d{2}$')

    def check_dates(self):
        for value in (self.start_date, self.end_date):
            if value:
                date.fromisoformat(value)
        if self.date_mode == 'point' and (not self.start_date or self.end_date):
            raise ValueError('A single event requires only a start date')
        if self.date_mode == 'period' and not (self.start_date or self.end_date):
            raise ValueError('A period requires a start or end date')
        if self.date_mode is None and (self.start_date or self.end_date):
            raise ValueError('Choose an event or a period')
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError('End date precedes start date')
```

  - `class Action(DatedItem)` con `@model_validator(mode='after') def valid_dates(self): self.check_dates(); return self`;
  - `class TimelineEvent(DatedItem)`: rimuovere i tre campi duplicati e, nel suo validatore, sostituire i controlli data con `self.check_dates()` mantenendo il resto (period, duplicati) identico;
  - in `save_workspace`, dentro `if session_id is None:` prima di `validate_institution_links`:

```python
        if any(e.tense == 'future' and not e.institution_event for e in update.workspace.timeline.events):
            raise HTTPException(422, 'Future milestones belong to goals or activities')
```

- [ ] **Step 4: GREEN** — il nuovo file + `backend/tests/test_goals.py` + ogni test esistente che importa `visual_tools` (`grep -l visual_tools backend/tests/*.py`). Se un test esistente salva eventi personali futuri, **non** va corretto qui: annotarlo nel report (lo sistema il Task 3 o la migrazione).
- [ ] **Step 5: commit** `feat: add optional dates to activities and keep personal timeline in the past`

---

### Task 2: Backend — migrazione eventi futuri → attività

**Files:** Modify `backend/personal_timeline.py`; Test `backend/tests/test_activities_timeline.py`

**Interfaces — Consumes:** Task 1. **Produces:** `migrate_future_events(db, username) -> bool`, chiamata alla fine di `ensure_personal_timeline` (anche quando l'import legacy è già stato fatto); marcatore `Log(action='activities_timeline_migration', username=...)`.

Regole (spec §5): per ogni evento personale `tense='future'` senza `institution_event`:
1. se `action_ids` contiene **esattamente un** id di attività esistente → quella attività riceve `date_mode/start_date/end_date` dell'evento se non ne ha già; se `planned` non vuoto e non contenuto nel `detail`, lo si accoda (`detail + '\n\n' + planned`, troncato a 1000); se l'attività ha `reflection` vuota riceve quella dell'evento. Id risultante = id dell'attività.
2. altrimenti → nuova attività `id = 'm-' + event.id[:60]`, `title`, `detail = planned`, `reflection`, date, `stage='todo'`, `source` dell'evento. Id risultante = nuovo id.
3. l'evento viene rimosso dal workspace.
4. `GoalResourceLink(kind='event', target_id=event.id)` → `kind='action', target_id=<id risultante>`; se esiste già un link `action` identico sullo stesso obiettivo, si cancella quello `event`. `PersonalGoal.revision += 1` per gli obiettivi toccati.
5. `AssignmentWork.event_id == event.id` → `NULL`; se l'evento aveva `reflection` e l'attività `assignment-{id}` esiste senza riflessione, riceve quella dell'evento.
6. Salvataggio tramite `save_workspace(..., commit=False)` con la revisione corrente, poi marcatore, poi `db.commit()`. Nessun evento da migrare → solo marcatore.

- [ ] **Step 1: test che falliscono** (aggiungere al file del Task 1; usare `artifact_session`, inserire il workspace legacy con `models.Log(action=PERSONAL_ACTION, username='alice', session_id=None, details={'workspace': {...}})` e un marcatore di import legacy `models.Log(action='personal_timeline_import', username='alice')` così `ensure_personal_timeline` salta l'import):
  - evento futuro isolato → diventa attività `m-<id>` con date e detail = planned; evento sparito;
  - evento futuro con `action_ids=['a1']` → `a1` riceve le date, nessuna attività nuova;
  - obiettivo con link `event` → diventa `action` verso l'id risultante, revisione obiettivo +1; link doppione eliminato;
  - `AssignmentWork` con `event_id` = evento migrato → `event_id is None`, riflessione passata all'attività `assignment-<n>`;
  - eventi passati e istituzionali intatti;
  - idempotenza: seconda chiamata a `ensure_personal_timeline` non cambia la revisione del workspace.
- [ ] **Step 2: RED**.
- [ ] **Step 3: implementazione** in `personal_timeline.py`: scomporre `ensure_personal_timeline` in `_import_legacy(db, username)` (corpo attuale, senza return anticipato sull'intera funzione) + `migrate_future_events(db, username)`; `ensure_personal_timeline` prende il lock una volta e chiama entrambe. Usare `PersonalWorkspace`/`load_workspace`/`save_workspace` esistenti; import di `models.GoalResourceLink`, `models.PersonalGoal`, `models.AssignmentWork` dentro la funzione.
- [ ] **Step 4: GREEN** — file nuovo + `test_goals.py` + test assegnazioni esistenti (`grep -l assignment backend/tests/*.py`).
- [ ] **Step 5: commit** `feat: migrate personal future milestones into dated activities`

---

### Task 3: Backend — Obiettivi e Assegnazioni creano solo attività datate

**Files:** Modify `backend/routes/goals.py` (`create_action`), `backend/routes/assignment_work.py` (`plan`, `reflection`, `_state`); Test `backend/tests/test_goals.py`, test assegnazioni esistenti.

- [ ] **Step 1: test** — in `test_goals.py` sostituire le asserzioni di `test_activity_is_shared_with_calendar_and_does_not_complete_goal` sugli eventi con: l'attività ha `date_mode='point'`, `start_date='2026-10-02'`; `timeline.events == []`; un solo link `kind='action'`. Nei test assegnazioni: `plan` con data → attività `assignment-<id>` con data, nessun evento, `AssignmentWork.event_id is None`; `reflection` scrive `action.reflection`; `_state` espone `event: null` e l'attività con date.
- [ ] **Step 2: RED**.
- [ ] **Step 3: implementazione**
  - `create_action`: l'attività nasce con `date_mode='point', start_date=payload.date` se c'è una data; rimuovere creazione evento e link `event`.
  - `plan`: attività con `date_mode/start_date` se `payload.date`; niente evento; `AssignmentWork(..., event_id=None)`; il controllo 409 guarda solo l'id attività.
  - `reflection`: se `row.event_id` e l'evento esiste → comportamento attuale; altrimenti aggiorna `action.reflection` dell'attività `row.action_id` (404 `'Linked activity no longer exists'` se manca).
  - `_state`: invariato nella forma (`event` può essere `None`); aggiungere `reflection` coerente per il frontend (Task 7): nessun campo nuovo, il frontend legge `action.reflection` quando `event` è `null`.
- [ ] **Step 4: GREEN** — tutti i test backend toccati.
- [ ] **Step 5: commit** `feat: create only dated activities from goals and assignments`

---

### Task 4: Frontend lib — tipi e voci della linea del tempo

**Files:** Modify `frontend/src/lib/visual-tools.ts` (tipo `Action` + campi data facoltativi); Create `frontend/src/lib/timeline-items.ts`, `frontend/src/lib/timeline-items.test.ts`.

**Produces:**
```ts
export type TimelineItemKind = 'milestone' | 'action' | 'goal' | 'appointment';
export type TimelineItem = { key: string; kind: TimelineItemKind; title: string; start: string | null; end: string | null; href: string | null; editable: boolean; eventId?: string; stage?: string; status?: string };
export function timelineItems(workspace: { actions: Action[]; timeline: { events: TimelineEvent[] } }, goals: Pick<PersonalGoal, 'id' | 'title' | 'status' | 'review_date'>[]): TimelineItem[];
export function splitByToday(items: TimelineItem[], today: string): { past: TimelineItem[]; future: TimelineItem[]; undated: TimelineItem[] };
export function filterItems(items: TimelineItem[], kinds: Set<TimelineItemKind>): TimelineItem[];
```
Regole: eventi con `institution_event` → `appointment` (non editabili, `href` null); altri eventi → `milestone` editabili (`eventId`); attività con `date_mode` → `action`, `href='/profilo/azioni#action-<id>'`; obiettivi `status==='active'` con `review_date` → `goal`, `href='/profilo/obiettivi?goal=<id>'`; ordinamento per `start ?? end`, poi titolo; senza data → `undated`; `past` = data < today (per periodi: `end ?? start` < today).

- [ ] Step 1 test (casi: ogni tipo mappato, attività senza data esclusa, obiettivo non attivo escluso, ordinamento, split con periodo a cavallo di oggi → future, filtro) · Step 2 RED · Step 3 implementazione · Step 4 `cd frontend && npm test && npx tsc --noEmit -p .` · Step 5 commit `feat: build unified timeline items`.

---

### Task 5: Frontend — Attività: date sulla bacheca

**Files:** `frontend/src/components/visual/VisualTools.tsx` (sezione bacheca, solo in modalità `personal`), eventualmente un componente estratto `ActionDates.tsx`; `frontend/src/lib/i18n-visual-tools.ts`.

Requisiti: nel dettaglio di un'attività (modalità personale) i campi data con `TimelineDateFields` (nessuna / giorno / periodo); sulla scheda la data formattata (`toLocaleDateString(locale)`) e il link «Vedi sulla linea del tempo» → `/profilo/timeline?item=action-<id>`; ogni scheda ha `id="action-<id>"` per l'ancora; `/profilo/azioni?new=1` apre direttamente la creazione di un'attività. In chat (non personale) nessun campo data visibile. Salvataggio con il meccanismo esistente (revisione, 409).

- [ ] Implementare · verificare `tsc`, `eslint` sui file toccati, `npm test`, `npm run build` · commit `feat: add optional dates to activities board`.

---

### Task 6: Frontend — pagina Linea del tempo

**Files:** `frontend/src/components/visual/PersonalVisualWorkspacePage.tsx` (ramo `timeline`), `frontend/src/components/visual/TimelineTools.tsx` (modalità personale), nuovo `frontend/src/components/visual/PersonalTimeline.tsx`, `frontend/src/components/visual/TimelineCalendar.tsx`, `frontend/src/lib/i18n-personal-area.ts`, `frontend/src/lib/i18n-visual-tools.ts`.

Requisiti (spec §7):
- testata `PersonalAreaHeader slug="timeline"` al posto di `PageHeader` per questa pagina; nome «Linea del tempo» e nuova descrizione in 6 lingue (`i18n-personal-area.ts`): it «Guarda nel tempo tappe, attività, obiettivi e appuntamenti.» (tradurre fedelmente);
- carica workspace (`/user/timeline`) e obiettivi (`/user/goals`); voci da `timelineItems`;
- barra: «+ Tappa» (editor tappa: solo passato, nessuna scelta passato/futuro, data con `TimelineDateFields`, simbolo, riflessione, collegamenti portfolio come oggi), «+ Attività» → `/profilo/azioni?new=1`, «+ Obiettivo» → `/profilo/obiettivi?new=1` (aggiungere in `GoalsPanel` l'apertura del popup di creazione con `?new=1`, poi rimuovere il parametro come per `?goal=`);
- filtri per tipo (checkbox, tutti attivi di default, `localStorage` `cb_timeline_filters` con try/catch);
- elenco verticale: sezione «Passato», separatore «Oggi», «Futuro», «Senza data»; ogni voce con icona/tipo; tappe cliccabili → editor; attività/obiettivi → `href`; appuntamenti come oggi (disponibilità, scadenza);
- `?item=action-<id>` o `?event=<id>` evidenzia e scorre alla voce;
- vista calendario esistente alimentata dalle stesse voci (adattare `TimelineCalendar` a `TimelineItem[]`);
- `useDraftGuard` sull'editor tappa; guardia già presente per il workspace mantenuta;
- esportazione nel Portfolio invariata (solo tappe);
- `JourneyOverview kind='event'` sulla pagina resta.
- Nessuno scorrimento orizzontale a 390 px.

- [ ] Implementare · verificare `tsc`, `eslint`, `npm test`, `npm run build` · commit `feat: show everything on a single personal timeline`.

---

### Task 7: Frontend — assegnazioni, testi, guida, documentazione

**Files:** `frontend/src/components/teacher/AssignmentWork.tsx` (riflessione da `event?.reflection ?? action?.reflection`), `frontend/src/lib/i18n.ts` (guida: sezioni che citano calendario/diario/tappe future — cercare con `grep -n "Calendario e diario\|tappe\|diario" frontend/src/lib/i18n.ts`), `docs-counselorbot/funzionalita-counselorbot.md` (righe Attività e Calendario), `make guidance-check` (+ refresh se richiesto).

- [ ] Implementare · `tsc`, `i18n:check`, `npm test`, `guidance-check` · commit separati `fix: read assignment reflection from the activity` e `docs: describe activities and the unified timeline`.

---

### Task 8: Test browser e verifica completa

**Files:** nuovo `frontend/tests/activities-timeline.test.mjs` sul modello di `personal-goals.test.mjs` (fixture API: estendere `backend/tests/goals_browser_server.py` con il router `visual_tools` già incluso e un utente `student-timeline`), script `test:timeline` in `frontend/package.json`.

Casi: attività con data creata in Bacheca → compare nella Linea del tempo e il clic riporta all'ancora dell'attività; obiettivo attivo con revisione → compare, clic apre il popup; «+ Tappa» crea una tappa passata senza scelta passato/futuro; filtri nascondono/mostrano; `personal-goals` suite ancora verde (il test «student goal» ora verifica che l'attività con data compaia sulla linea del tempo, non un evento); 390 px senza scorrimento orizzontale.

- [ ] Eseguire su server di test freschi (porte libere, vedi Global Constraints) · verifica completa: tutti i test backend toccati, `npm test`, `tsc`, `npm run lint` (errori solo in file non toccati → segnalati), `npm run build`, `make guidance-check` · commit `test: cover activities with dates and the unified timeline`.
- [ ] **Stop:** il controller propone all'utente la prova in dev (`scripts/dev-backend.sh`, `scripts/dev-frontend.sh`) e poi rebuild + push.
