# Il libretto confluisce nella triade: piano di implementazione

> **Per agenti:** SUB-SKILL RICHIESTA: superpowers:subagent-driven-development (consigliata) o
> superpowers:executing-plans. I passi usano checkbox (`- [ ]`).

**Goal:** eliminare il libretto e portarne le domande in Compilazioni («La mia lettura»), Taccuino,
Obiettivi (metodo, controlli, bilancio, prove, origine) e Linea del tempo, con un PDF «Percorso
dell'obiettivo».

**Architecture:** quattro lotti rilasciabili in ordine. A: dati, API e migrazione (backend, senza
UI). B: Obiettivi (popup, metodo, bilancio, controlli in bacheca). C: Compilazioni, Taccuino, Linea
del tempo, chat e rimozione del libretto. D: PDF, contesto AI e documentazione. Tra un lotto e
l'altro l'app resta coerente: il libretto sparisce solo in C, dopo che tutte le nuove sedi esistono.

**Tech Stack:** FastAPI + SQLAlchemy + Pydantic v2 su Postgres; Next.js (App Router) + React + TypeScript;
test backend pytest su DB `counselorbot_test`; test frontend `node --test` (unit) e test browser `.mjs`.

**Spec:** `docs/plans/2026-09-25-libretto-nella-triade-design.md` (leggerla prima di ogni lotto).

## Global Constraints

- Branch: `feature/libretto-triade`. Mai `git add -A`: aggiungere i file per nome (altri agenti lavorano nello stesso tree).
- Commit atomici, Conventional Commits, messaggio in inglese, chiusi da `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Test backend sul DB Postgres di test (mai SQLite). Comando `PYTEST` usato in tutto il piano:
  ```bash
  cd /home/nugh75/counselorbot-sbs && set -a && . ./.env && set +a && \
  DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" \
  python3 -m pytest <file> -q
  ```
  `test_smoke.py` va girato in un worktree in `/tmp` o nel container (`session_memory/` root-owned nel checkout principale).
  Fallimenti preesistenti noti: 4 in `test_diagram_icon_catalog.py`/`test_diagram_factor_symbols.py`, 1 in `test_orientation.py`.
- Testi UI in **6 lingue** nell'ordine `[it, en, es, fr, de, sv]` (formato di `lib/i18n-goals.ts`). Terminologia: vedi glossario in `CONTEXT.md`; niente calchi dall'inglese.
- Nuove colonne su tabelle esistenti: `ALTER TABLE … ADD COLUMN IF NOT EXISTS` nel blocco migrazioni di `backend/main.py`; tabelle nuove via `create_all`.
- Prompt in DB personalizzati: solo **append**, mai sovrascrivere.
- Prima di ogni rebuild Docker avvisare l'utente; provare prima nell'ambiente dev (`scripts/dev-backend.sh` su 8002, `scripts/dev-frontend.sh` su 3107; non insieme ai test browser che usano 3107).
- Nessun passo sudo previsto (nessuna modifica nginx). Se cambia, il comando da dare a mano è `sudo ./update_nginx.sh`.

## Mappa dei file

| File | Lotto | Responsabilità |
| --- | --- | --- |
| `backend/models.py` | A | `PersonalGoal.method`, `GoalResourceLink.role`, `PersonalStrategy`, `GoalReview`, `ResultReading` |
| `backend/main.py` | A,C | ALTER colonne, router nuovi, hook migrazione |
| `backend/goals.py` | A,D | kind/ruoli, metodo, origine, bilancio, `goal_dict` arricchito, `goals_context` |
| `backend/routes/goals.py` | A,D | origine alla creazione, ruolo nei link, `POST …/reviews`, `GET …/pdf`, azioni `check` |
| `backend/routes/personal_strategies.py` (nuovo) | A | CRUD «Le mie strategie» |
| `backend/routes/readings.py` (nuovo) | A | «La mia lettura» per compilazione |
| `backend/visual_tools.py` | A | `Action` kind `check` + `progress`/`adjustment`; `TimelineEvent.review` |
| `backend/booklet_migration.py` (nuovo) | A | migrazione una tantum libretto → nuove sedi |
| `backend/routes/milestones.py` (nuovo) | C | salva una tappa passata (usata dalla chat evento) |
| `backend/routes/survey.py`, `backend/booklet_timeline.py` | C | rotte libretto → 410; sync biografia eliminata |
| `backend/visual_personal.py`, `backend/routes/orientation.py` | C | destinazione `reading`; controllo attività legacy |
| `backend/chat_logic.py`, `prompt_contract.py`, `prompt_config.py`, `orientation.py`, `tool_brief_seed.py`, `event_booklet.py` | D | contesto lettura, testi fissi |
| `backend/pdf_generator.py` | D | `generate_goal_path_pdf`; rimozione PDF libretto |
| `frontend/src/lib/goals.ts`, `lib/i18n-goals.ts` | B | tipi e testi |
| `frontend/src/components/goals/MethodPicker.tsx` (nuovo) | B | metodo: catalogo + strategie proprie |
| `frontend/src/components/goals/GoalReviewStep.tsx` (nuovo) | B | passo Bilancio |
| `frontend/src/components/goals/GoalDialog.tsx` | B | sezioni nuove |
| `frontend/src/components/visual/VisualTools.tsx` | B | controllo in bacheca |
| `frontend/src/components/profile/ResultReadingCard.tsx` (nuovo) | C | «La mia lettura» |
| `frontend/src/components/profile/LearnerProfileCard.tsx` | C | «Cosa conta per me» + ponte |
| `frontend/src/components/visual/TimelineTools.tsx`, `PersonalTimeline.tsx` | C | «Rileggere l'esperienza», legenda, bilanci |
| `frontend/src/components/qsa/EventBookletCard.tsx` → `EventMilestoneCard.tsx` | C | bozza evento → tappa |
| `frontend/src/app/profilo/page.tsx`, `lib/personal-area.ts`, `app/profilo/libretto/page.tsx` | C | rimozioni e redirect |

---

# Lotto A — Dati, API e migrazione

### Task A1: Modello dati e colonne nuove

**Files:**
- Modify: `backend/models.py` (dopo `GoalEdge`, ~riga 581; `PersonalGoal` riga 534; `GoalResourceLink` riga 555)
- Modify: `backend/main.py` (blocco migrazioni in `lifespan`, accanto al ciclo `for table in ("questionnaire_results", …)`, ~riga 520)
- Test: `backend/tests/test_goal_triad_models.py` (nuovo)

**Interfaces:**
- Produces: `models.PersonalGoal.method: list[dict]`, `models.GoalResourceLink.role: str`,
  `models.PersonalStrategy(id, username, text, created_at, updated_at)`,
  `models.GoalReview(id, goal_id, commitment, outcome, satisfaction, obstacles, change, learned, next_step, created_at)`,
  `models.ResultReading(id, username, session_id, questionnaire_type, strengths, growth_areas, note, created_at, updated_at)`.

- [ ] **Step 1: test che fallisce**

```python
"""Nuove tabelle e colonne della triade: persistono e rispettano i vincoli."""
import pytest
from sqlalchemy.exc import IntegrityError
from backend import models
from backend.tests.artifact_database import artifact_session


def test_triad_tables_roundtrip():
    with artifact_session() as db:
        goal = models.PersonalGoal(username='alice', title='Parlare in pubblico',
                                   method=[{'kind': 'own', 'id': 1}])
        db.add(goal); db.flush()
        db.add(models.GoalResourceLink(goal_id=goal.id, kind='reading', target_id='s1', role='origin'))
        db.add(models.PersonalStrategy(username='alice', text='Ripeto a voce'))
        db.add(models.GoalReview(goal_id=goal.id, outcome='reached', commitment='enough', satisfaction='much'))
        db.add(models.ResultReading(username='alice', session_id='s1', questionnaire_type='QSA',
                                    strengths=['C1'], growth_areas=['C3'], note='Mi agito'))
        db.commit()
        assert db.query(models.GoalResourceLink).one().role == 'origin'
        assert db.query(models.PersonalGoal).one().method == [{'kind': 'own', 'id': 1}]
        assert db.query(models.GoalReview).one().outcome == 'reached'


def test_link_role_defaults_to_related_and_reading_is_unique_per_session():
    with artifact_session() as db:
        goal = models.PersonalGoal(username='alice', title='x'); db.add(goal); db.flush()
        db.add(models.GoalResourceLink(goal_id=goal.id, kind='card', target_id='c1')); db.commit()
        assert db.query(models.GoalResourceLink).one().role == 'related'
        assert db.query(models.PersonalGoal).one().method == []
        db.add(models.ResultReading(username='alice', session_id='s1', questionnaire_type='QSA'))
        db.add(models.ResultReading(username='alice', session_id='s1', questionnaire_type='QSA'))
        with pytest.raises(IntegrityError):
            db.flush()
```

- [ ] **Step 2:** `PYTEST backend/tests/test_goal_triad_models.py` → FAIL (`TypeError: 'method' is an invalid keyword argument`).

- [ ] **Step 3: implementazione**

In `PersonalGoal` dopo `revision`:
```python
    # Metodo: strategie certificate {kind:'certified', slug} o proprie {kind:'own', id}.
    method = Column(JSON, nullable=False, default=list)
```
In `GoalResourceLink` dopo `target_id`:
```python
    # origin (da dove nasce) | means (azione) | evidence (prova) | related
    role = Column(String, nullable=False, default='related', server_default='related')
```
Dopo `GoalEdge`:
```python
class PersonalStrategy(Base):
    """Strategia scritta dallo studente, riusabile nel metodo di più obiettivi. Mai certificata."""
    __tablename__ = "personal_strategies"
    id = Column(Integer, primary_key=True)
    username = Column(String, nullable=False, index=True)
    text = Column(String(300), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class GoalReview(Base):
    """Bilancio di chiusura di un obiettivo. Append-only: riaprire e richiudere ne aggiunge un altro."""
    __tablename__ = "goal_reviews"
    id = Column(Integer, primary_key=True)
    goal_id = Column(Integer, ForeignKey("personal_goals.id", ondelete="CASCADE"), nullable=False, index=True)
    commitment = Column(String, nullable=True)    # full|enough|partial|none
    outcome = Column(String, nullable=False)      # reached|partial|not_reached|abandoned
    satisfaction = Column(String, nullable=True)  # much|enough|little|none
    obstacles = Column(Text, nullable=False, default="")
    change = Column(Text, nullable=False, default="")
    learned = Column(Text, nullable=False, default="")
    next_step = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ResultReading(Base):
    """«La mia lettura» di una compilazione: forza, aree da far crescere, cosa mi dice di me."""
    __tablename__ = "result_readings"
    __table_args__ = (UniqueConstraint("username", "session_id", name="uq_result_reading_session"),)
    id = Column(Integer, primary_key=True)
    username = Column(String, nullable=False, index=True)
    session_id = Column(String, nullable=False, index=True)
    questionnaire_type = Column(String, nullable=False)
    strengths = Column(JSON, nullable=False, default=list)
    growth_areas = Column(JSON, nullable=False, default=list)
    note = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```
In `backend/main.py`, subito dopo il ciclo `for table in ("questionnaire_results", "validation_responses", "telegram_account_links"):`:
```python
        for table, clause in [
            ("personal_goals", "ADD COLUMN IF NOT EXISTS method JSON NOT NULL DEFAULT '[]'"),
            ("goal_resource_links", "ADD COLUMN IF NOT EXISTS role VARCHAR NOT NULL DEFAULT 'related'"),
        ]:
            try:
                with database.engine.connect() as conn:
                    conn.execute(sa_text(f"ALTER TABLE {table} {clause}"))
                    conn.commit()
            except Exception as e:
                logger.debug(f"{table} migration skipped/failed ({clause}): {e}")
```

- [ ] **Step 4:** `PYTEST backend/tests/test_goal_triad_models.py` → PASS. Rigirare `backend/tests/test_goals.py` → PASS invariato.

- [ ] **Step 5: commit**
```bash
git add backend/models.py backend/main.py backend/tests/test_goal_triad_models.py
git commit -m "feat: add goal method, link roles, reviews, strategies and readings tables"
```

---

### Task A2: Ruoli dei collegamenti e origine dell'obiettivo

**Files:**
- Modify: `backend/goals.py` (`ResourceKind`, `GoalCreate`, `LinkWrite`, `resources`, `goal_dict`)
- Modify: `backend/routes/goals.py` (`create_goal`, `link_resource`)
- Test: `backend/tests/test_goals.py` (aggiunte in coda)

**Interfaces:**
- Consumes: `models.GoalResourceLink.role`, `models.ResultReading` (A1).
- Produces: `ResourceKind` (senza `booklet`, con `reading`, `session`); `LinkRole`; `ALLOWED_ROLES: dict[str, set[str]]`;
  `default_role(kind) -> str`; `OriginWrite{kind, target_id}`; `validate_origin(db, username, origin) -> None`;
  `goal_dict(...)['links'][i]['role']`; `goal_dict(...)['origin'] -> dict | None`.

- [ ] **Step 1: test che falliscono** (in coda a `test_goals.py`)

```python
def reading(db, session_id='s1', username='alice'):
    db.add(models.ResultReading(username=username, session_id=session_id, questionnaire_type='QSA',
                                growth_areas=['C3'], note='Mi agito agli esami'))
    db.commit()


def test_goal_created_from_reading_keeps_single_origin(setup):
    db, c, who, _ = setup
    reading(db)
    row = goal(c, origin=dict(kind='reading', target_id='s1'))
    assert row['origin']['kind'] == 'reading' and row['origin']['role'] == 'origin'
    assert row['origin']['available'] is True
    again = c.post(f"/user/goals/{row['id']}/links", json=dict(kind='reading', target_id='s1', role='origin', revision=row['revision']))
    assert again.status_code == 422


def test_origin_must_be_owned(setup):
    db, c, who, _ = setup
    reading(db, username='bob')
    assert c.post('/user/goals', json=dict(title='x', origin=dict(kind='reading', target_id='s1'))).status_code == 404


def test_link_role_rules(setup):
    db, c, who, _ = setup
    row = goal(c)
    bad = c.post(f"/user/goals/{row['id']}/links", json=dict(kind='notebook', target_id='current', role='evidence', revision=row['revision']))
    assert bad.status_code == 422


def test_booklet_kind_is_gone(setup):
    db, c, who, _ = setup
    row = goal(c)
    r = c.post(f"/user/goals/{row['id']}/links", json=dict(kind='booklet', target_id='1', revision=row['revision']))
    assert r.status_code == 422
```

- [ ] **Step 2:** `PYTEST backend/tests/test_goals.py -k "origin or role or booklet"` → FAIL.

- [ ] **Step 3: implementazione** in `backend/goals.py`

```python
ResourceKind = Literal['action', 'event', 'portfolio', 'tavolo', 'notebook', 'card', 'comparison', 'reading', 'session']
LinkRole = Literal['origin', 'means', 'evidence', 'related']
OriginKind = Literal['reading', 'notebook', 'event', 'session']
# Spec § 5.2: quali ruoli può avere ogni tipo di collegamento.
ALLOWED_ROLES = {
    'reading': {'origin'}, 'session': {'origin'},
    'notebook': {'origin', 'related'}, 'event': {'origin', 'related'},
    'action': {'means'}, 'portfolio': {'evidence', 'related'},
    'tavolo': {'related'}, 'card': {'related'}, 'comparison': {'related'},
}


def default_role(kind):
    return {'action': 'means', 'reading': 'origin', 'session': 'origin'}.get(kind, 'related')


class OriginWrite(Strict):
    kind: OriginKind
    target_id: str = Field(min_length=1, max_length=100)
```
`GoalCreate` guadagna `origin: OriginWrite | None = None`. `LinkWrite` guadagna `role: LinkRole | None = None`.

In `resources()`: eliminare il ciclo su `StudentBooklet`; aggiungere dopo il portfolio:
```python
    for row in db.query(models.ResultReading).filter_by(username=username).order_by(models.ResultReading.id.desc()).all():
        add('reading', row.session_id, f'{row.questionnaire_type} · {row.created_at:%Y-%m-%d}' if row.created_at else row.questionnaire_type,
            f'/profilo/compilazioni?session={row.session_id}')
```
Nuove funzioni:
```python
def session_resource(db, username, session_id):
    """Origine «chat»: la sessione deve appartenere allo studente; non compare tra le risorse collegabili."""
    log = db.query(models.Log).filter_by(session_id=session_id, username=username).order_by(models.Log.id).first()
    if log is None:
        return None
    return dict(kind='session', target_id=session_id, title=log.questionnaire_type or 'Chat', href=None, available=True)


def validate_origin(db, username, origin):
    if origin.kind == 'session':
        found = session_resource(db, username, origin.target_id)
    else:
        found = next((r for r in resources(db, username) if (r['kind'], r['target_id']) == (origin.kind, origin.target_id)), None)
    if found is None:
        raise HTTPException(404, 'Resource unavailable')
```
In `goal_dict`, sostituire il ciclo dei link:
```python
    data['links'] = []
    data['origin'] = None
    for link in db.query(models.GoalResourceLink).filter_by(goal_id=row.id).order_by(models.GoalResourceLink.id).all():
        resolved = resource_map.get((link.kind, link.target_id))
        if resolved is None and link.kind == 'session':
            resolved = session_resource(db, row.username, link.target_id)
        item = dict(resolved or dict(kind=link.kind, target_id=link.target_id, title='', href=None, available=False), id=link.id, role=link.role)
        if link.role == 'origin':
            data['origin'] = item
        else:
            data['links'].append(item)
```
In `backend/routes/goals.py`:
- import `ALLOWED_ROLES, default_role, validate_origin`.
- `create_goal`: dopo `validate_share(...)` aggiungere `if payload.origin: validate_origin(db, user['username'], payload.origin)`; `values = payload.model_dump(exclude={'revision', 'catalog_id', 'catalog_version', 'parent_id', 'origin'})`; dopo `db.flush()`:
```python
    if payload.origin:
        db.add(models.GoalResourceLink(goal_id=row.id, kind=payload.origin.kind, target_id=payload.origin.target_id, role='origin'))
```
- `link_resource`, dopo `owned_goal(...)`:
```python
    role = payload.role or default_role(payload.kind)
    if role not in ALLOWED_ROLES[payload.kind]:
        raise HTTPException(422, 'Role not allowed')
    if role == 'origin':
        if db.query(models.GoalResourceLink).filter_by(goal_id=goal_id, role='origin').first():
            raise HTTPException(422, 'Origin already set')
        validate_origin(db, user['username'], payload)  # LinkWrite ha kind/target_id come OriginWrite
    else:
        allowed = {(r['kind'], r['target_id']) for r in resources(db, user['username'])}
        if (payload.kind, payload.target_id) not in allowed:
            raise HTTPException(404, 'Resource unavailable')
```
e passare `role=role` al `GoalResourceLink(...)`. In `create_action` il link nasce con `role='means'`.
Nota: `validate_origin` legge solo `kind` e `target_id`, quindi accetta anche un `LinkWrite`.

- [ ] **Step 4:** `PYTEST backend/tests/test_goals.py` → PASS (anche i test preesistenti).
- [ ] **Step 5: commit** `feat: give goal links a role and record where a goal comes from`

---

### Task A3: Metodo dell'obiettivo e «Le mie strategie»

**Files:**
- Create: `backend/routes/personal_strategies.py`
- Modify: `backend/goals.py` (`MethodItem`, `GoalWrite.method`, `validate_method`, `method_view`, `goal_dict`)
- Modify: `backend/routes/goals.py` (`create_goal`, `update_goal` validano il metodo)
- Modify: `backend/main.py` (import e `include_router`, accanto a `goals_routes` righe 71 e 1854)
- Test: `backend/tests/test_personal_strategies.py` (nuovo), `backend/tests/test_goals.py`

**Interfaces:**
- Produces: `MethodItem = CertifiedMethod | OwnMethod` (discriminato da `kind`); `validate_method(db, username, items: list[MethodItem]) -> None`;
  `method_view(db, username, method: list[dict], lang='it') -> list[dict{kind, slug|id, title, available}]`;
  rotte `GET/POST /user/strategies`, `PATCH/DELETE /user/strategies/{id}`; risposta `{id, text, used_by: list[int]}`.

- [ ] **Step 1: test che falliscono** — `backend/tests/test_personal_strategies.py`:

```python
"""Strategie scritte dallo studente: proprie, riusabili, non eliminabili se in uso."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend import auth, database, models
from backend.routes.goals import router as goals_router
from backend.routes.personal_strategies import router
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def client():
    with artifact_session() as db:
        identity = dict(username='alice', authenticated=True, is_admin=False, groups=['studenti'])
        app = FastAPI(); app.include_router(router); app.include_router(goals_router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        db.add(models.CertifiedStrategy(slug='self-test', name_it='Autoverifica', status='certified', is_active=True)); db.commit()
        with TestClient(app) as c:
            yield db, c, identity


def test_create_use_and_protect_strategy(client):
    db, c, who = client
    own = c.post('/user/strategies', json=dict(text='Ripeto a voce registrandomi')).json()
    goal = c.post('/user/goals', json=dict(title='Esame orale', method=[
        dict(kind='certified', slug='self-test'), dict(kind='own', id=own['id'])])).json()
    assert [m['title'] for m in goal['method']] == ['Autoverifica', 'Ripeto a voce registrandomi']
    assert [m['kind'] for m in goal['method']] == ['certified', 'own']
    assert c.get('/user/strategies').json()[0]['used_by'] == [goal['id']]
    assert c.delete(f"/user/strategies/{own['id']}").status_code == 409


def test_method_rejects_unknown_or_foreign_items(client):
    db, c, who = client
    assert c.post('/user/goals', json=dict(title='x', method=[dict(kind='certified', slug='nope')])).status_code == 404
    own = c.post('/user/strategies', json=dict(text='Mia')).json()
    who['username'] = 'bob'
    assert c.post('/user/goals', json=dict(title='x', method=[dict(kind='own', id=own['id'])])).status_code == 404
    assert c.patch(f"/user/strategies/{own['id']}", json=dict(text='rubata')).status_code == 404


def test_unused_strategy_can_be_renamed_and_deleted(client):
    db, c, who = client
    own = c.post('/user/strategies', json=dict(text='Prima')).json()
    assert c.patch(f"/user/strategies/{own['id']}", json=dict(text='Dopo')).json()['text'] == 'Dopo'
    assert c.delete(f"/user/strategies/{own['id']}").status_code == 200
    assert c.get('/user/strategies').json() == []
```

- [ ] **Step 2:** `PYTEST backend/tests/test_personal_strategies.py` → FAIL (modulo assente).

- [ ] **Step 3: implementazione.** In `backend/goals.py`:

```python
class CertifiedMethod(Strict):
    kind: Literal['certified']
    slug: str = Field(min_length=1, max_length=120)


class OwnMethod(Strict):
    kind: Literal['own']
    id: int = Field(gt=0)


MethodItem = Annotated[CertifiedMethod | OwnMethod, Field(discriminator='kind')]


def validate_method(db, username, items):
    slugs = {i.slug for i in items if i.kind == 'certified'}
    ids = {i.id for i in items if i.kind == 'own'}
    found_slugs = {s for (s,) in db.query(models.CertifiedStrategy.slug).filter(
        models.CertifiedStrategy.slug.in_(slugs), models.CertifiedStrategy.status == 'certified',
        models.CertifiedStrategy.is_active.is_(True))} if slugs else set()
    found_ids = {i for (i,) in db.query(models.PersonalStrategy.id).filter(
        models.PersonalStrategy.id.in_(ids), models.PersonalStrategy.username == username)} if ids else set()
    if slugs - found_slugs or ids - found_ids:
        raise HTTPException(404, 'Strategy unavailable')


def method_view(db, username, method, lang='it'):
    slugs = [m['slug'] for m in method if m.get('kind') == 'certified']
    ids = [m['id'] for m in method if m.get('kind') == 'own']
    certified = {r.slug: r for r in db.query(models.CertifiedStrategy).filter(models.CertifiedStrategy.slug.in_(slugs))} if slugs else {}
    own = {r.id: r for r in db.query(models.PersonalStrategy).filter(models.PersonalStrategy.id.in_(ids),
           models.PersonalStrategy.username == username)} if ids else {}
    view = []
    for item in method:
        if item.get('kind') == 'certified':
            row = certified.get(item['slug'])
            title = ((row.name_i18n or {}).get(lang) or row.name_it or row.slug) if row else ''
            view.append(dict(kind='certified', slug=item['slug'], title=title, available=bool(row)))
        else:
            row = own.get(item['id'])
            view.append(dict(kind='own', id=item['id'], title=row.text if row else '', available=bool(row)))
    return view
```
(aggiungere `Annotated` all'import da `typing`). `GoalWrite` guadagna `method: list[MethodItem] = Field(default_factory=list, max_length=12)`.
In `goal_dict` aggiungere `'method'` alla lista delle chiavi e poi `data['method'] = method_view(db, row.username, row.method or [])`.
In `routes/goals.py`: `create_goal` e `update_goal` chiamano `validate_method(db, user['username'], payload.method)` prima di scrivere;
`values`/`setattr` salvano `method` come `[m.model_dump() for m in payload.method]` (in `create_goal`: `values['method'] = [m.model_dump() for m in payload.method]`; in `update_goal`: dopo il ciclo `row.method = [m.model_dump() for m in payload.method]`).

`backend/routes/personal_strategies.py`:
```python
"""«Le mie strategie»: testi dello studente riusabili nel metodo dei suoi obiettivi."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..goals import Strict

router = APIRouter()


class StrategyWrite(Strict):
    text: str = Field(min_length=1, max_length=300)


def used_by(db, username, strategy_id):
    rows = db.query(models.PersonalGoal.id, models.PersonalGoal.method).filter_by(username=username).all()
    return sorted(goal_id for goal_id, method in rows
                  if any(m.get('kind') == 'own' and m.get('id') == strategy_id for m in (method or [])))


def strategy_dict(db, row):
    return dict(id=row.id, text=row.text, used_by=used_by(db, row.username, row.id))


def owned(db, username, strategy_id):
    row = db.query(models.PersonalStrategy).filter_by(id=strategy_id, username=username).first()
    if row is None:
        raise HTTPException(404, 'Strategy unavailable')
    return row


@router.get('/user/strategies')
def list_strategies(db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    rows = db.query(models.PersonalStrategy).filter_by(username=user['username']).order_by(models.PersonalStrategy.id).all()
    return [strategy_dict(db, row) for row in rows]


@router.post('/user/strategies', status_code=201)
def create_strategy(payload: StrategyWrite, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    row = models.PersonalStrategy(username=user['username'], text=payload.text)
    db.add(row); db.commit(); db.refresh(row)
    return strategy_dict(db, row)


@router.patch('/user/strategies/{strategy_id}')
def rename_strategy(strategy_id: int, payload: StrategyWrite, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    row = owned(db, user['username'], strategy_id)
    row.text = payload.text
    db.commit(); db.refresh(row)
    return strategy_dict(db, row)


@router.delete('/user/strategies/{strategy_id}')
def delete_strategy(strategy_id: int, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    row = owned(db, user['username'], strategy_id)
    users = used_by(db, user['username'], strategy_id)
    if users:
        raise HTTPException(409, {'message': 'Strategy in use', 'goal_ids': users})
    db.delete(row); db.commit()
    return {'deleted': True}
```
`backend/main.py`: `from .routes import personal_strategies as personal_strategies_routes` accanto a riga 71; `app.include_router(personal_strategies_routes.router)` accanto a riga 1854.

Catalogo per il selettore: `GET /user/certified-strategies` (`backend/routes/survey.py:628`) oggi richiede `questionnaire_type`, che un obiettivo non ha. Renderlo facoltativo: `questionnaire_type: Optional[str] = Query(None)`, `code = _normalize_booklet_type(questionnaire_type) if questionnaire_type else None`, e nel ciclo `if code and scope and code.upper() not in scope: continue`. Test in `test_personal_strategies.py`:
```python
def test_certified_catalog_without_instrument(client):
    db, c, who = client
    from backend.routes.survey import router as survey_router
    c.app.include_router(survey_router)
    assert [s['slug'] for s in c.get('/user/certified-strategies', params={'lang': 'it'}).json()] == ['self-test']
```
(se la riga di catalogo nella fixture non ha nome/descrizione localizzati sufficienti, aggiungere `description_it='Controllo cosa ricordo'`).

- [ ] **Step 4:** `PYTEST backend/tests/test_personal_strategies.py backend/tests/test_goals.py` → PASS.
- [ ] **Step 5: commit** `feat: add goal method with certified and personal strategies`

---

### Task A4: Controlli (azioni `check`) e tappe con rilettura

**Files:**
- Modify: `backend/visual_tools.py` (`Action`, nuova `EventReview`, `TimelineEvent`)
- Modify: `backend/goals.py` (`ActionCreate.kind`, `resources()` espone `action_kind`, `progress`)
- Modify: `backend/routes/goals.py` (`create_action` usa `payload.kind`)
- Test: `backend/tests/test_activities_timeline.py`, `backend/tests/test_goals.py`

**Interfaces:**
- Produces: `Action.kind` include `'check'`; `Action.progress: Literal['on_track','slow','stuck'] | None`; `Action.adjustment: str`;
  `EventReview`; `TimelineEvent.review: EventReview | None`; `ActionCreate.kind: Literal['activity','check']`;
  risorsa `action` con chiavi extra `action_kind`, `progress`.

- [ ] **Step 1: test che falliscono** — in `test_activities_timeline.py`:

```python
def test_check_actions_need_progress_to_be_done():
    ok = Action(id='k1', title='Come va?', kind='check', stage='done', progress='slow', adjustment='Ripasso al mattino')
    assert ok.progress == 'slow'
    with pytest.raises(ValidationError):
        Action(id='k2', title='Come va?', kind='check', stage='done')
    with pytest.raises(ValidationError):
        Action(id='a1', title='Leggere', kind='activity', progress='slow')


def test_past_milestone_accepts_review_future_does_not():
    from backend.visual_tools import TimelineEvent
    e = TimelineEvent(id='p1', title='Esame di chimica', period='2026-03', tense='past',
                      review=dict(role='protagonist', worked=['Schema'], did_not_work=['Ansia'], reading='…', try_next='Ripasso a voce'))
    assert e.review.worked == ['Schema']
    with pytest.raises(ValidationError):
        TimelineEvent(id='f1', title='Esame', period='2027', tense='future', review=dict(reading='x'))
```
In `test_goals.py`:
```python
def test_goal_can_create_a_check(setup):
    db, c, who, _ = setup
    row = goal(c)
    r = c.post(f"/user/goals/{row['id']}/actions", json=dict(title='Come va?', kind='check', date='2026-10-10',
               revision=row['revision'], request_id='check-000001'))
    link = r.json()['links'][0]
    assert link['action_kind'] == 'check' and link['role'] == 'means'
```

- [ ] **Step 2:** `PYTEST backend/tests/test_activities_timeline.py backend/tests/test_goals.py -k "check or review"` → FAIL.

- [ ] **Step 3: implementazione** in `backend/visual_tools.py`:

```python
class Action(DatedItem):
    kind: Literal['activity', 'book', 'article', 'film', 'check'] = 'activity'
    title: str = Field(min_length=1, max_length=160)
    detail: str = Field(default='', max_length=1000)
    stage: Literal['todo', 'doing', 'done'] = 'todo'
    reflection: str = Field(default='', max_length=1000)  # per un controllo: «Cosa osservo»
    progress: Literal['on_track', 'slow', 'stuck'] | None = None
    adjustment: str = Field(default='', max_length=1000)  # per un controllo: «Cosa cambio»

    @model_validator(mode='after')
    def valid_dates(self):
        self.check_dates()
        if self.kind != 'check' and (self.progress or self.adjustment):
            raise ValueError('Progress belongs to checks only')
        if self.kind == 'check' and self.stage == 'done' and not self.progress:
            raise ValueError('A completed check needs its progress')
        return self


class EventReview(StrictModel):
    """Rilettura di una tappa passata (ex scheda evento e biografia del libretto)."""
    role: Literal['protagonist', 'observer', 'alongside'] | None = None
    worked: list[Annotated[str, Field(max_length=300)]] = Field(default_factory=list, max_length=10)
    did_not_work: list[Annotated[str, Field(max_length=300)]] = Field(default_factory=list, max_length=10)
    reading: str = Field(default='', max_length=1500)
    discovery: str = Field(default='', max_length=1000)
    keywords: str = Field(default='', max_length=200)
    try_next: str = Field(default='', max_length=1000)
    how_when: str = Field(default='', max_length=1000)
```
In `TimelineEvent`: nuovo campo `review: EventReview | None = None` e, nel validatore `unique_links`, prima del `return`:
```python
        if self.review is not None and self.tense != 'past':
            raise ValueError('Only past milestones carry a review')
```
`personal_links` resta `Literal['notebook', 'booklet', 'orientation']`: `booklet` è accettato solo come dato legacy (la migrazione A7 lo toglie; la UI non lo offre più). Scriverlo in un commento sopra il campo.

In `backend/goals.py`: `ActionCreate` guadagna `kind: Literal['activity', 'check'] = 'activity'`; in `resources()`:
```python
        add('action', action['id'], action['title'], '/profilo/azioni', stage=action['stage'],
            action_kind=action.get('kind', 'activity'), progress=action.get('progress'),
            date=action.get('start_date') or action.get('end_date'))
```
In `routes/goals.py` `create_action`: `kind=payload.kind` invece di `kind='activity'`.

- [ ] **Step 4:** `PYTEST backend/tests/test_activities_timeline.py backend/tests/test_goals.py backend/tests/test_personal_timeline.py` → PASS.
- [ ] **Step 5: commit** `feat: add check actions and past-milestone reviews to the personal workspace`

---

### Task A5: Bilancio dell'obiettivo

**Files:**
- Modify: `backend/goals.py` (`ReviewWrite`, `review_dict`, `add_review_milestone`, `goal_dict` → `reviews`, `checks`)
- Modify: `backend/routes/goals.py` (`POST /user/goals/{id}/reviews`)
- Test: `backend/tests/test_goals.py`

**Interfaces:**
- Consumes: `models.GoalReview` (A1), `load_workspace`/`save_workspace`/`SavePersonalWorkspace`, `ensure_personal_timeline`.
- Produces: `ReviewWrite{commitment, outcome, satisfaction, obstacles, change, learned, next_step, revision}`;
  `goal_dict(...)['reviews']: list[review_dict]` (più recente prima); `goal_dict(...)['checks']: list[link]`;
  tappa nella linea con id `goal-review-{review_id}` e `source='goal:{goal_id}'`.

- [ ] **Step 1: test che falliscono**

```python
def test_review_closes_goal_and_adds_milestone(setup):
    db, c, who, _ = setup
    row = goal(c)
    r = c.post(f"/user/goals/{row['id']}/reviews", json=dict(commitment='enough', outcome='reached', satisfaction='much',
               learned='Parlare a voce alta mi aiuta', next_step='Provare con la classe', revision=row['revision']))
    assert r.status_code == 200, r.text
    closed = r.json()
    assert closed['status'] == 'completed' and closed['reviews'][0]['outcome'] == 'reached'
    events = c.get('/user/timeline').json()['workspace']['timeline']['events']
    milestone = next(e for e in events if e['id'].startswith('goal-review-'))
    assert milestone['source'] == f"goal:{row['id']}" and milestone['tense'] == 'past'
    stale = c.post(f"/user/goals/{row['id']}/reviews", json=dict(outcome='partial', revision=row['revision']))
    assert stale.status_code == 409


def test_abandoned_goal_is_archived_and_reopen_allows_second_review(setup):
    db, c, who, _ = setup
    row = goal(c)
    closed = c.post(f"/user/goals/{row['id']}/reviews", json=dict(outcome='abandoned', revision=row['revision'])).json()
    assert closed['status'] == 'archived'
    reopened = c.put(f"/user/goals/{row['id']}", json=edit_payload(closed, status='active')).json()
    again = c.post(f"/user/goals/{row['id']}/reviews", json=dict(outcome='partial', revision=reopened['revision'])).json()
    assert [rv['outcome'] for rv in again['reviews']] == ['partial', 'abandoned']
```
`/user/timeline` è la rotta di lettura del workspace personale (`backend/routes/visual_tools.py:80`); la fixture di `test_goals.py` include già `visual_router`.
`edit_payload` va esteso con `'method'`: `{**{k: row[k] for k in (...)}, 'method': [ {k: v for k, v in m.items() if k in ('kind','slug','id')} for m in row['method'] ], **kwargs}`.

- [ ] **Step 2:** `PYTEST backend/tests/test_goals.py -k review` → FAIL.

- [ ] **Step 3: implementazione** in `backend/goals.py`:

```python
class ReviewWrite(Strict):
    commitment: Literal['full', 'enough', 'partial', 'none'] | None = None
    outcome: Literal['reached', 'partial', 'not_reached', 'abandoned']
    satisfaction: Literal['much', 'enough', 'little', 'none'] | None = None
    obstacles: str = Field(default='', max_length=1500)
    change: str = Field(default='', max_length=1500)
    learned: str = Field(default='', max_length=1500)
    next_step: str = Field(default='', max_length=1500)
    revision: int = Field(ge=1)


def review_dict(row):
    return {k: getattr(row, k) for k in ('id', 'commitment', 'outcome', 'satisfaction', 'obstacles',
                                         'change', 'learned', 'next_step', 'created_at')}


def add_review_milestone(db, username, goal, review):
    """Il bilancio compare come tappa passata; il titolo è quello dell'obiettivo (nessun testo UI salvato)."""
    state = load_workspace(db, None, username)
    work = state['workspace']
    event_id = f'goal-review-{review.id}'
    if any(e['id'] == event_id for e in work['timeline']['events']):
        return
    today = date.today().isoformat()
    work['timeline']['events'].append(dict(id=event_id, title=goal.title[:160], period=today, tense='past',
        symbol='milestone', date_mode='point', start_date=today, reflection=(review.learned or '')[:1000],
        source=f'goal:{goal.id}'))
    work['timeline']['title'] = work['timeline']['title'] or 'Timeline'
    save_workspace(db, None, username, SavePersonalWorkspace(revision=state['revision'], workspace=work), commit=False)
```
(import `date` da `datetime` e `SavePersonalWorkspace`, `save_workspace` da `.visual_tools`).
In `goal_dict`, dopo i link:
```python
    data['reviews'] = [review_dict(r) for r in db.query(models.GoalReview).filter_by(goal_id=row.id).order_by(models.GoalReview.id.desc())]
    data['checks'] = [l for l in data['links'] if l['kind'] == 'action' and l.get('action_kind') == 'check']
```
In `routes/goals.py`:
```python
@router.post('/user/goals/{goal_id}/reviews')
def review_goal(goal_id: int, payload: ReviewWrite, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    ensure_personal_timeline(db, user['username'])
    row = owned_goal(db, user['username'], goal_id, payload.revision)
    review = models.GoalReview(goal_id=goal_id, **payload.model_dump(exclude={'revision'}))
    db.add(review); db.flush()
    row.status = 'archived' if payload.outcome == 'abandoned' else 'completed'
    row.revision += 1
    add_review_milestone(db, user['username'], row, review)
    db.commit(); db.refresh(row)
    return goal_dict(db, row)
```

- [ ] **Step 4:** `PYTEST backend/tests/test_goals.py` → PASS.
- [ ] **Step 5: commit** `feat: close goals through a review that becomes a timeline milestone`

---

### Task A6: «La mia lettura» (API)

**Files:**
- Create: `backend/routes/readings.py`
- Modify: `backend/main.py` (router)
- Test: `backend/tests/test_readings.py` (nuovo)

**Interfaces:**
- Produces: `GET /user/readings?session_id=` → `reading_dict | null`; `PUT /user/readings/{session_id}` body
  `{strengths: str[], growth_areas: str[], note: str}` → `reading_dict`; `DELETE /user/readings/{session_id}`;
  `reading_dict = {session_id, questionnaire_type, strengths, growth_areas, note, goal_ids, updated_at}`.

- [ ] **Step 1: test che falliscono**

```python
"""«La mia lettura»: una per compilazione, solo dello studente, protetta se origine di un obiettivo."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend import auth, database, models
from backend.routes.goals import router as goals_router
from backend.routes.readings import router
from backend.tests.artifact_database import artifact_session


@pytest.fixture
def client():
    with artifact_session() as db:
        identity = dict(username='alice', authenticated=True, is_admin=False, groups=['studenti'])
        app = FastAPI(); app.include_router(router); app.include_router(goals_router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        db.add(models.QuestionnaireResult(session_id='s1', username='alice', questionnaire_type='QSA', scores={'C3': 8}))
        db.commit()
        with TestClient(app) as c:
            yield db, c, identity


def body(**kw):
    return {'strengths': ['C1'], 'growth_areas': ['C3'], 'note': 'Mi agito agli esami', **kw}


def test_upsert_and_read(client):
    db, c, who = client
    assert c.get('/user/readings', params={'session_id': 's1'}).json() is None
    c.put('/user/readings/s1', json=body())
    saved = c.put('/user/readings/s1', json=body(note='Aggiornata')).json()
    assert saved['note'] == 'Aggiornata' and saved['questionnaire_type'] == 'QSA'
    assert db.query(models.ResultReading).count() == 1


def test_foreign_session_is_404(client):
    db, c, who = client
    who['username'] = 'bob'
    assert c.put('/user/readings/s1', json=body()).status_code == 404


def test_origin_reading_cannot_be_deleted(client):
    db, c, who = client
    c.put('/user/readings/s1', json=body())
    goal = c.post('/user/goals', json=dict(title='Gestire l’ansia', origin=dict(kind='reading', target_id='s1'))).json()
    assert c.get('/user/readings', params={'session_id': 's1'}).json()['goal_ids'] == [goal['id']]
    assert c.delete('/user/readings/s1').status_code == 409
```
Se `QuestionnaireResult` richiede altri campi obbligatori, aggiungerli nella fixture (controllare `models.QuestionnaireResult`).

- [ ] **Step 2:** `PYTEST backend/tests/test_readings.py` → FAIL.

- [ ] **Step 3: implementazione** `backend/routes/readings.py`:

```python
"""«La mia lettura» di una compilazione: sostituisce la parte riflessiva del libretto."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import Field
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..goals import Strict

router = APIRouter()


class ReadingWrite(Strict):
    strengths: list[str] = Field(default_factory=list, max_length=12)
    growth_areas: list[str] = Field(default_factory=list, max_length=12)
    note: str = Field(default='', max_length=2000)


def owned_result(db, username, session_id):
    row = db.query(models.QuestionnaireResult).filter_by(session_id=session_id, username=username).first()
    if row is None:
        raise HTTPException(404, 'Result unavailable')
    return row


def origin_goal_ids(db, username, session_id):
    return sorted(i for (i,) in db.query(models.GoalResourceLink.goal_id).join(
        models.PersonalGoal, models.PersonalGoal.id == models.GoalResourceLink.goal_id).filter(
        models.PersonalGoal.username == username, models.GoalResourceLink.kind == 'reading',
        models.GoalResourceLink.target_id == session_id, models.GoalResourceLink.role == 'origin'))


def reading_dict(db, row):
    return dict(session_id=row.session_id, questionnaire_type=row.questionnaire_type, strengths=row.strengths or [],
                growth_areas=row.growth_areas or [], note=row.note, updated_at=row.updated_at,
                goal_ids=origin_goal_ids(db, row.username, row.session_id))


@router.get('/user/readings')
def get_reading(session_id: str = Query(min_length=1), db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    row = db.query(models.ResultReading).filter_by(username=user['username'], session_id=session_id).first()
    return reading_dict(db, row) if row else None


@router.put('/user/readings/{session_id}')
def save_reading(session_id: str, payload: ReadingWrite, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    result = owned_result(db, user['username'], session_id)
    clean = lambda items: [s.strip()[:120] for s in items if s.strip()]
    row = db.query(models.ResultReading).filter_by(username=user['username'], session_id=session_id).with_for_update().first()
    if row is None:
        row = models.ResultReading(username=user['username'], session_id=session_id, questionnaire_type=result.questionnaire_type)
        db.add(row)
    row.strengths, row.growth_areas, row.note = clean(payload.strengths), clean(payload.growth_areas), payload.note
    db.commit(); db.refresh(row)
    return reading_dict(db, row)


@router.delete('/user/readings/{session_id}')
def delete_reading(session_id: str, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    row = db.query(models.ResultReading).filter_by(username=user['username'], session_id=session_id).first()
    if row is None:
        raise HTTPException(404, 'Reading unavailable')
    goals = origin_goal_ids(db, user['username'], session_id)
    if goals:
        raise HTTPException(409, {'message': 'Reading is the origin of goals', 'goal_ids': goals})
    db.delete(row); db.commit()
    return {'deleted': True}
```
Registrare il router in `main.py` come in A3 (`readings as readings_routes`).

- [ ] **Step 4:** `PYTEST backend/tests/test_readings.py` → PASS.
- [ ] **Step 5: commit** `feat: add per-result readings as the reflective part of the booklet`

---

### Task A7: Migrazione del libretto

**Files:**
- Create: `backend/booklet_migration.py`
- Modify: `backend/main.py` (hook in `lifespan`, subito dopo `seed_goals(db)` ~riga 1264)
- Test: `backend/tests/test_booklet_migration.py` (nuovo)

**Interfaces:**
- Consumes: A1–A6; `ensure_personal_timeline`; `biography_events` di `booklet_timeline.py` (copiarla nel modulo: `booklet_timeline.py` sparisce in C5).
- Produces: `MIGRATION_ACTION = 'booklet_triade_migration'`; `migrate_booklets(db, username) -> dict` (conteggi); `migrate_all_booklets(db) -> int`.

Regole: spec § 8. In breve, per ogni scheda (ordine id):
1. lettura su `session_id` della scheda o ultima compilazione dello stesso tipo; campi `strength`→`strengths`, `growth_area`→`growth_areas`, `discovery`/`improvements`/`student_notes`/`final_observations` → `note` (paragrafi con etichetta italiana, es. «Cosa ho capito: …»); più schede sulla stessa compilazione si concatenano; senza compilazione → nuova revisione del taccuino (`source='migration'`) con le stesse righe aggiunte a `notes` precedute da «Dal libretto ({tipo}, {data}):».
2. `objective` non vuoto → `PersonalGoal(title=objective[:160], criteria=objective[160:1500], motivation=motivation, review_date=period_end se ISO valida, method=[own…])` con una `PersonalStrategy` per ogni riga non vuota di `strategy` (tolto il trattino iniziale); origine `reading` se la lettura esiste.
3. `commitment` o `final_satisfaction` → `GoalReview` sull'obiettivo del punto 2 (se esiste): `commitment` mappato 1:1 (`full|enough|partial|none`), `satisfaction` da `final_satisfaction` (`much|enough|little|none`), `outcome='partial'`, `obstacles=difficulties`, `change=improvements`, `learned=discovery`; stato `completed`.
4. eventi della linea con id `booklet-{id}-*`: nuovo id `migrated-` + hash, `personal_links` senza `booklet`, `review={discovery, keywords}` dalla biografia della scheda.
5. schede `EVENTO_*`: una tappa passata con `review` da `event_role`, `strength`→`worked`, `growth_area`→`did_not_work`, `discovery`→`reading`, e `try_next`/`how_when` se presenti in `data`.
6. obiettivi `completed`/`archived` con `reflection` e senza bilanci → bilancio con `outcome` `reached`/`abandoned` e `learned=reflection`.
7. collegamenti `GoalResourceLink(kind='booklet')`: se la scheda ha prodotto una lettura e l'obiettivo non ha origine → `kind='reading', role='origin'`; altrimenti eliminati.
8. marcatore `Log(action=MIGRATION_ACTION, username, details={counts})`. Seconda esecuzione = no-op.

- [ ] **Step 1: test che falliscono** (un test per ramo)

```python
"""Migrazione una tantum del libretto nelle nuove sedi (spec § 8)."""
from backend import models
from backend.booklet_migration import MIGRATION_ACTION, migrate_booklets
from backend.tests.artifact_database import artifact_session
from backend.visual_tools import load_workspace


def booklet(db, **data):
    qtype = data.pop('questionnaire_type', 'QSA'); session_id = data.pop('session_id', None)
    row = models.StudentBooklet(username='alice', questionnaire_type=qtype, session_id=session_id, data=data)
    db.add(row); db.commit(); return row


def result(db, session_id='s1', qtype='QSA'):
    db.add(models.QuestionnaireResult(session_id=session_id, username='alice', questionnaire_type=qtype, scores={}))
    db.commit()


def test_reading_goal_method_and_review():
    with artifact_session() as db:
        result(db)
        booklet(db, session_id='s1', strength=['C1'], growth_area=['C3'], motivation='Voglio stare calmo',
                objective='Gestire l’ansia agli orali', strategy='- Respiro prima di parlare\n- Simulazioni',
                period_end='2026-11-30', commitment='enough', final_satisfaction='much', discovery='Posso farcela')
        counts = migrate_booklets(db, 'alice')
        reading = db.query(models.ResultReading).one()
        assert reading.strengths == ['C1'] and reading.growth_areas == ['C3'] and 'Posso farcela' in reading.note
        goal = db.query(models.PersonalGoal).one()
        assert goal.title == 'Gestire l’ansia agli orali' and goal.review_date == '2026-11-30'
        assert [s.text for s in db.query(models.PersonalStrategy).order_by(models.PersonalStrategy.id)] == ['Respiro prima di parlare', 'Simulazioni']
        assert len(goal.method) == 2 and all(m['kind'] == 'own' for m in goal.method)
        link = db.query(models.GoalResourceLink).one()
        assert (link.kind, link.target_id, link.role) == ('reading', 's1', 'origin')
        review = db.query(models.GoalReview).one()
        assert (review.commitment, review.satisfaction, review.outcome) == ('enough', 'much', 'partial')
        assert counts['goals'] == 1


def test_booklet_without_result_goes_to_notebook():
    with artifact_session() as db:
        booklet(db, questionnaire_type='IDEA', strength=['Curiosità'], discovery='Mi piace progettare')
        migrate_booklets(db, 'alice')
        notebook = db.query(models.LearnerProfileRevision).filter_by(username='alice').order_by(models.LearnerProfileRevision.id.desc()).first()
        assert notebook.source == 'migration' and 'Dal libretto (IDEA' in notebook.data['notes']
        assert db.query(models.ResultReading).count() == 0


def test_event_booklet_becomes_past_milestone():
    with artifact_session() as db:
        booklet(db, questionnaire_type='EVENTO_STUDIO', title='Esame di chimica', event_role='protagonist',
                strength=['Schema'], growth_area=['Ansia'], discovery='Ripetere a voce aiuta')
        migrate_booklets(db, 'alice')
        events = load_workspace(db, None, 'alice')['workspace']['timeline']['events']
        event = next(e for e in events if e['title'] == 'Esame di chimica')
        assert event['tense'] == 'past' and event['review']['worked'] == ['Schema'] and event['review']['role'] == 'protagonist'


def test_migration_is_idempotent():
    with artifact_session() as db:
        result(db)
        booklet(db, session_id='s1', objective='Leggere più veloce')
        migrate_booklets(db, 'alice'); migrate_booklets(db, 'alice')
        assert db.query(models.PersonalGoal).count() == 1
        assert db.query(models.Log).filter_by(username='alice', action=MIGRATION_ACTION).count() == 1
```
Aggiungere un test per il punto 4 (evento `booklet-1-…` già nella linea → rinominato, senza `booklet` in `personal_links`), uno per il punto 6 e uno per il punto 7, sullo stesso schema.

- [ ] **Step 2:** `PYTEST backend/tests/test_booklet_migration.py` → FAIL.

- [ ] **Step 3: implementazione.** Struttura di `backend/booklet_migration.py`:

```python
"""Una tantum: il libretto confluisce in letture, obiettivi, bilanci, taccuino e linea del tempo (spec § 8)."""
import hashlib
import re
from datetime import date

from . import models
from .personal_timeline import ensure_personal_timeline
from .visual_tools import SavePersonalWorkspace, load_workspace, save_workspace

MIGRATION_ACTION = 'booklet_triade_migration'
_ISO = re.compile(r'^\d{4}-\d{2}-\d{2}$')
_NOTE_LABELS = [('discovery', 'Cosa ho capito'), ('improvements', 'Miglioramenti osservati'),
                ('difficulties', 'Difficoltà incontrate'), ('student_notes', 'Note'), ('final_observations', 'Osservazioni finali')]


def _text(value):
    return str(value or '').strip()


def _items(value):
    if isinstance(value, list):
        return [_text(v) for v in value if _text(v)]
    return [_text(v) for v in str(value or '').split(',') if _text(v)]


def _note(data):
    return '\n\n'.join(f'{label}: {_text(data.get(key))}' for key, label in _NOTE_LABELS if _text(data.get(key)))


def _result_session(db, username, booklet):
    query = db.query(models.QuestionnaireResult).filter_by(username=username, questionnaire_type=booklet.questionnaire_type)
    if booklet.session_id:
        row = query.filter_by(session_id=booklet.session_id).first()
        if row:
            return row.session_id
    row = query.order_by(models.QuestionnaireResult.id.desc()).first()
    return row.session_id if row else None


def _reading(db, username, booklet, data):
    """Punto 1. Ritorna la session_id della lettura creata o estesa, None se non c'è compilazione."""
    session_id = _result_session(db, username, booklet)
    if session_id is None:
        return None
    strengths, growth, note = _items(data.get('strength')), _items(data.get('growth_area')), _note(data)
    row = db.query(models.ResultReading).filter_by(username=username, session_id=session_id).first()
    if row is None:
        row = models.ResultReading(username=username, session_id=session_id,
                                   questionnaire_type=booklet.questionnaire_type, strengths=[], growth_areas=[], note='')
        db.add(row)
    row.strengths = list(dict.fromkeys((row.strengths or []) + strengths))[:12]
    row.growth_areas = list(dict.fromkeys((row.growth_areas or []) + growth))[:12]
    row.note = '\n\n'.join(part for part in (row.note, note) if part)[:2000]
    db.flush()
    return session_id


def _to_notebook(db, username, booklet, data):
    latest = db.query(models.LearnerProfileRevision).filter(
        models.LearnerProfileRevision.username == username,
        models.LearnerProfileRevision.source != 'autosave').order_by(models.LearnerProfileRevision.id.desc()).first()
    profile = dict(latest.data or {}) if latest else {}
    when = booklet.updated_at.date().isoformat() if booklet.updated_at else ''
    lines = [f'Dal libretto ({booklet.questionnaire_type}, {when}):']
    if _items(data.get('strength')):
        lines.append('Punti di forza: ' + ', '.join(_items(data.get('strength'))))
    if _items(data.get('growth_area')):
        lines.append('Da far crescere: ' + ', '.join(_items(data.get('growth_area'))))
    if _note(data):
        lines.append(_note(data))
    profile['notes'] = '\n\n'.join(part for part in (_text(profile.get('notes')), '\n'.join(lines)) if part)
    db.add(models.LearnerProfileRevision(username=username, data=profile, source='migration'))
    db.flush()


def _goal(db, username, booklet, data, reading_session):
    """Punto 2."""
    objective = _text(data.get('objective'))
    if not objective:
        return None
    method = []
    for line in _text(data.get('strategy')).splitlines():
        text = line.strip().lstrip('-•* ').strip()
        if text:
            strategy = models.PersonalStrategy(username=username, text=text[:300])
            db.add(strategy); db.flush()
            method.append({'kind': 'own', 'id': strategy.id})
    end = _text(data.get('period_end'))
    goal = models.PersonalGoal(username=username, title=objective[:160], criteria=objective[160:1500],
                               motivation=_text(data.get('motivation'))[:2000], method=method[:12],
                               review_date=end if _ISO.match(end) else None, status='active')
    db.add(goal); db.flush()
    if reading_session:
        db.add(models.GoalResourceLink(goal_id=goal.id, kind='reading', target_id=reading_session, role='origin'))
    return goal


_COMMITMENT = {'full', 'enough', 'partial', 'none'}
_SATISFACTION = {'much', 'enough', 'little', 'none'}


def _review(db, goal, data):
    """Punto 3."""
    commitment, satisfaction = _text(data.get('commitment')), _text(data.get('final_satisfaction'))
    if not (commitment or satisfaction):
        return False
    db.add(models.GoalReview(goal_id=goal.id, outcome='partial',
                             commitment=commitment if commitment in _COMMITMENT else None,
                             satisfaction=satisfaction if satisfaction in _SATISFACTION else None,
                             obstacles=_text(data.get('difficulties'))[:1500], change=_text(data.get('improvements'))[:1500],
                             learned=_text(data.get('discovery'))[:1500]))
    goal.status = 'completed'
    goal.revision += 1
    return True


def _migrated_id(booklet_id, event_id):
    return 'migrated-' + hashlib.sha256(f'{booklet_id}:{event_id}'.encode()).hexdigest()[:24]


def _timeline(db, username, booklets):
    """Punti 4 e 5, con un solo salvataggio del workspace."""
    state = load_workspace(db, None, username)
    work = state['workspace']
    events = work['timeline']['events']
    by_booklet = {b.id: b for b in booklets}
    count = 0
    for event in events:
        if not event['id'].startswith('booklet-'):
            continue
        booklet_id = int(event['id'].split('-')[1])
        bio = next((b for b in biography_events((by_booklet.get(booklet_id) or models.StudentBooklet(data={})).data)
                    if (b['context'] or '') == event['title'] or not b['context']), None)
        event['id'] = _migrated_id(booklet_id, event['id'])
        event['personal_links'] = [link for link in event.get('personal_links', []) if link != 'booklet']
        if bio and (bio['discovery'] or bio['keywords']):
            event['review'] = {'discovery': bio['discovery'][:1000], 'keywords': bio['keywords'][:200]}
        count += 1
    for booklet in booklets:
        if not booklet.questionnaire_type.startswith('EVENTO_'):
            continue
        data = booklet.data or {}
        role = _text(data.get('event_role'))
        when = _text(data.get('bio_date')) or _text(data.get('date'))
        event = dict(id=_migrated_id(booklet.id, 'event'), title=(_text(data.get('title')) or booklet.questionnaire_type)[:160],
                     tense='past', symbol='milestone', period=(when or (booklet.created_at.date().isoformat() if booklet.created_at else '—'))[:100],
                     review=dict(role=role if role in ('protagonist', 'observer', 'alongside') else None,
                                 worked=[i[:300] for i in _items(data.get('strength'))][:10],
                                 did_not_work=[i[:300] for i in _items(data.get('growth_area'))][:10],
                                 reading=_text(data.get('discovery') or data.get('reading'))[:1500],
                                 try_next=_text(data.get('try_next'))[:1000], how_when=_text(data.get('how_when'))[:1000]))
        if _ISO.match(when):
            event.update(date_mode='point', start_date=when)
        if not any(e['id'] == event['id'] for e in events):
            events.append(event); count += 1
    if count:
        work['timeline']['title'] = work['timeline']['title'] or 'Timeline'
        save_workspace(db, None, username, SavePersonalWorkspace(revision=state['revision'], workspace=work), commit=False)
    return count


def _legacy_reflections(db, username):
    """Punto 6."""
    count = 0
    goals = db.query(models.PersonalGoal).filter(models.PersonalGoal.username == username,
        models.PersonalGoal.status.in_(('completed', 'archived')), models.PersonalGoal.reflection != '').all()
    for goal in goals:
        if db.query(models.GoalReview.id).filter_by(goal_id=goal.id).first():
            continue
        db.add(models.GoalReview(goal_id=goal.id, outcome='abandoned' if goal.status == 'archived' else 'reached',
                                 learned=goal.reflection[:1500]))
        count += 1
    return count


def _booklet_links(db, username, reading_by_booklet):
    """Punto 7."""
    links = db.query(models.GoalResourceLink).join(models.PersonalGoal, models.PersonalGoal.id == models.GoalResourceLink.goal_id).filter(
        models.PersonalGoal.username == username, models.GoalResourceLink.kind == 'booklet').all()
    for link in links:
        session_id = reading_by_booklet.get(int(link.target_id)) if link.target_id.isdigit() else None
        has_origin = db.query(models.GoalResourceLink.id).filter_by(goal_id=link.goal_id, role='origin').first()
        if session_id and not has_origin:
            link.kind, link.target_id, link.role = 'reading', session_id, 'origin'
        else:
            db.delete(link)
    db.flush()


def migrate_booklets(db, username):
    if db.query(models.Log.id).filter_by(username=username, action=MIGRATION_ACTION).first():
        return {}
    ensure_personal_timeline(db, username)
    booklets = db.query(models.StudentBooklet).filter_by(username=username).order_by(models.StudentBooklet.id).all()
    counts = dict(readings=0, notebook=0, goals=0, reviews=0, milestones=0)
    reading_by_booklet = {}
    for booklet in booklets:
        data = booklet.data or {}
        if booklet.questionnaire_type.startswith('EVENTO_'):
            continue  # diventano tappe in _timeline
        session_id = _reading(db, username, booklet, data)
        if session_id:
            reading_by_booklet[booklet.id] = session_id; counts['readings'] += 1
        elif _items(data.get('strength')) or _items(data.get('growth_area')) or _note(data):
            _to_notebook(db, username, booklet, data); counts['notebook'] += 1
        goal = _goal(db, username, booklet, data, session_id)
        if goal:
            counts['goals'] += 1
            if _review(db, goal, data):
                counts['reviews'] += 1
    counts['milestones'] = _timeline(db, username, booklets)
    counts['reviews'] += _legacy_reflections(db, username)
    _booklet_links(db, username, reading_by_booklet)
    db.add(models.Log(username=username, session_id=None, action=MIGRATION_ACTION, details={'counts': counts}))
    db.commit()
    return counts


def migrate_all_booklets(db):
    users = [u for (u,) in db.query(models.StudentBooklet.username).distinct()]
    users += [u for (u,) in db.query(models.PersonalGoal.username).filter(models.PersonalGoal.reflection != '').distinct()]
    done = 0
    for username in sorted(set(users)):
        if migrate_booklets(db, username):
            done += 1
    return done
```
Copiare in testa al modulo `biography_events` da `backend/booklet_timeline.py` (righe 11-38), invariata: quel file sparisce in C5.

Hook in `main.py` dopo `seed_goals(db)` (spento nel lotto A, acceso in C5 togliendo la condizione):
```python
        from .booklet_migration import migrate_all_booklets
        if os.getenv('BOOKLET_MIGRATION') == '1':
            try:
                migrated = migrate_all_booklets(db)
                if migrated:
                    logger.info(f"booklet migration: {migrated} users migrated")
            except Exception as e:
                db.rollback()
                logger.error(f"booklet migration failed: {e}")
```

- [ ] **Step 4:** `PYTEST backend/tests/test_booklet_migration.py` → PASS. Poi prova a secco su una copia dei dati di produzione: `pg_dump` di `student_booklets`, `personal_goals`, `questionnaire_results`, `learner_profile_revisions`, `logs` → restore in `counselorbot_test`, `python3 -c "from backend.booklet_migration import migrate_all_booklets; …"` e controllo manuale dei conteggi (attesi: 10 schede, ~2 obiettivi, 1 biografia).
- [ ] **Step 5: commit** `feat: migrate booklet entries into readings, goals, reviews and timeline`

**Fine lotto A:** `PYTEST backend/tests/test_goals.py backend/tests/test_personal_strategies.py backend/tests/test_readings.py backend/tests/test_booklet_migration.py backend/tests/test_activities_timeline.py backend/tests/test_personal_timeline.py backend/tests/test_goal_triad_models.py` tutto verde. Il libretto esiste ancora in UI: non rilasciare A da solo in produzione se la migrazione è attiva. **La migrazione parte solo in C5** (nel lotto A l'hook resta dietro `if os.getenv('BOOKLET_MIGRATION') == '1':`; C5 toglie la condizione).

---

# Lotto B — Obiettivi

### Task B1: Tipi e testi frontend

**Files:**
- Modify: `frontend/src/lib/goals.ts`, `frontend/src/lib/i18n-goals.ts`
- Test: `frontend/src/lib/goal-method.test.ts` (nuovo), `frontend/src/lib/goal-method.ts` (nuovo)

**Interfaces:**
- Produces (TypeScript):
```ts
export type ResourceKind = 'action' | 'event' | 'portfolio' | 'tavolo' | 'notebook' | 'card' | 'comparison' | 'reading' | 'session';
export type LinkRole = 'origin' | 'means' | 'evidence' | 'related';
export type GoalResource = { kind: ResourceKind; target_id: string; title: string; href: string | null; available: boolean; stage?: string; date?: string; id?: number; role?: LinkRole; action_kind?: string; progress?: 'on_track' | 'slow' | 'stuck' | null };
export type MethodRef = { kind: 'certified'; slug: string } | { kind: 'own'; id: number };
export type MethodItem = MethodRef & { title: string; available: boolean };
export type GoalReview = { id: number; commitment: Commitment | null; outcome: Outcome; satisfaction: Satisfaction | null; obstacles: string; change: string; learned: string; next_step: string; created_at: string };
export type Commitment = 'full' | 'enough' | 'partial' | 'none';
export type Outcome = 'reached' | 'partial' | 'not_reached' | 'abandoned';
export type Satisfaction = 'much' | 'enough' | 'little' | 'none';
export type GoalOrigin = { kind: 'reading' | 'notebook' | 'event' | 'session'; target_id: string };
export type PersonalStrategy = { id: number; text: string; used_by: number[] };
// GoalFields guadagna: method: MethodRef[]
// PersonalGoal guadagna: method: MethodItem[]; origin: GoalResource | null; reviews: GoalReview[]; checks: GoalResource[]
```
- `goal-method.ts`: `methodRefs(items: MethodItem[]): MethodRef[]`, `sameRef(a: MethodRef, b: MethodRef): boolean`, `pickerOptions(own: PersonalStrategy[], certified: {slug: string; name: string}[], chosen: MethodRef[])` → `{ own: PersonalStrategy[]; certified: {slug; name}[] }` senza i già scelti.

- [ ] **Step 1: test che falliscono** `goal-method.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { methodRefs, pickerOptions, sameRef } from './goal-method.ts';

test('methodRefs strips titles', () => {
    assert.deepEqual(methodRefs([{ kind: 'own', id: 3, title: 'x', available: true }, { kind: 'certified', slug: 'a', title: 'A', available: true }]),
        [{ kind: 'own', id: 3 }, { kind: 'certified', slug: 'a' }]);
});

test('picker hides chosen items and keeps own strategies first', () => {
    const options = pickerOptions([{ id: 1, text: 'Mia', used_by: [] }, { id: 2, text: 'Altra', used_by: [] }],
        [{ slug: 'a', name: 'A' }, { slug: 'b', name: 'B' }], [{ kind: 'own', id: 2 }, { kind: 'certified', slug: 'a' }]);
    assert.deepEqual(options.own.map(s => s.id), [1]);
    assert.deepEqual(options.certified.map(s => s.slug), ['b']);
    assert.ok(sameRef({ kind: 'own', id: 1 }, { kind: 'own', id: 1 }));
    assert.ok(!sameRef({ kind: 'own', id: 1 }, { kind: 'certified', slug: '1' }));
});
```
- [ ] **Step 2:** `cd frontend && npm test` → FAIL.
- [ ] **Step 3:** scrivere `goal-method.ts` (tre funzioni pure), aggiornare `goals.ts` (tipi sopra; `blankGoal.method = []`; `goalFields` copia `method: goal.method.map(...)` usando `methodRefs` se l'input ha `title`), aggiungere a `i18n-goals.ts` le chiavi, in 6 lingue:
  `bornFrom, method, pickStrategy, writeStrategy, myStrategies, certifiedStrategies, putInPractice, ownMark, certifiedMark, howIGetThere, howICheck, addCheck, checkQuestion, progress_on_track, progress_slow, progress_stuck, whatIObserve, whatIChange, evidence, addEvidence, evidenceOf, review, doReview, reviewCommitment, commitment_full, commitment_enough, commitment_partial, commitment_none, reviewOutcome, outcome_reached, outcome_partial, outcome_not_reached, outcome_abandoned, reviewSatisfaction, satisfaction_much, satisfaction_enough, satisfaction_little, satisfaction_none, obstacles, change, learned, nextStep, toNewGoal, toNewAction, toNotebook, closeGoal, downloadPath, pastReviews`.
  Testi italiani (fonte): «Nato da», «Metodo», «Scegli una strategia», «Scrivi una mia strategia», «Le mie strategie», «Strategie certificate», «Metti in pratica», «mia», «certificata», «Come ci arrivo», «Come controllo», «+ Controllo», «Come va con: {goal}?», «in linea», «a rilento», «fermo», «Cosa osservo», «Cosa cambio», «Prove», «Aggiungi una prova», «prova di: {goal}», «Bilancio», «Fai il bilancio», «Ho fatto ciò che avevo deciso?», «del tutto», «abbastanza», «in parte», «per niente», «L'obiettivo è raggiunto?», «sì», «in parte», «no», «lo abbandono», «Quanto sono soddisfatto?», «molto», «abbastanza», «poco», «per niente», «Cosa mi ha ostacolato?», «Cosa è cambiato in me?», «Cosa ho capito?», «Cosa faccio diversamente?», «→ nuovo obiettivo», «→ nuova azione», «→ aggiorna il taccuino», «Chiudi l'obiettivo», «Scarica il percorso», «Bilanci precedenti». Le altre 5 lingue: tradurre con lo stesso registro delle chiavi esistenti; per FR/DE/SV/ES verificare i termini tecnici sulle fonti (non coniare composti).
- [ ] **Step 4:** `npm test && npm run lint && npx tsc --noEmit` → PASS (correggere i consumatori che rompono la compilazione: `GoalUI.tsx` `resourceLabel` perde `booklet`, guadagna `reading` «Lettura» e `session` «Chat» in 6 lingue).
- [ ] **Step 5: commit** `feat: add goal method, review and origin types to the frontend`

### Task B2: `MethodPicker`

**Files:** Create `frontend/src/components/goals/MethodPicker.tsx`.

**Interfaces:**
- Consumes: `pickerOptions`, `sameRef` (B1); `GET /api/user/strategies`, `POST /api/user/strategies`; `GET /api/user/certified-strategies?lang=` senza `questionnaire_type` (A3) → `{slug, name, …}[]`.
- Produces: `<MethodPicker value={MethodRef[]} items={MethodItem[]} onChange={(next: MethodRef[]) => void} disabled={boolean} />`.

- [ ] **Step 1:** componente:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n-context';
import { goalText, type GoalTextKey } from '@/lib/i18n-goals';
import { goalApi, type MethodItem, type MethodRef, type PersonalStrategy } from '@/lib/goals';
import { pickerOptions, sameRef } from '@/lib/goal-method';
import { Field, input } from './GoalUI';

type Certified = { slug: string; name: string };

/** Metodo dell'obiettivo: strategie certificate (✦) e dello studente (✎). Le proprie restano riusabili. */
export function MethodPicker({ value, items, onChange, disabled }: { value: MethodRef[]; items: MethodItem[]; onChange: (next: MethodRef[]) => void; disabled?: boolean }) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const [own, setOwn] = useState<PersonalStrategy[]>([]); const [certified, setCertified] = useState<Certified[]>([]);
    const [choice, setChoice] = useState(''); const [draft, setDraft] = useState('');
    useEffect(() => {
        void goalApi<PersonalStrategy[]>('/user/strategies').then(setOwn).catch(() => setOwn([]));
        void goalApi<Certified[]>(`/user/certified-strategies?lang=${lang}`).then(setCertified).catch(() => setCertified([]));
    }, [lang]);
    const titleOf = (ref: MethodRef) => items.find(item => sameRef(item, ref))?.title
        ?? (ref.kind === 'own' ? own.find(s => s.id === ref.id)?.text : certified.find(s => s.slug === ref.slug)?.name) ?? '';
    const options = pickerOptions(own, certified, value);
    const add = (ref: MethodRef) => { onChange([...value, ref]); setChoice(''); };
    const write = async () => {
        const created = await goalApi<PersonalStrategy>('/user/strategies', 'POST', { text: draft.trim() });
        setOwn([...own, created]); setDraft(''); add({ kind: 'own', id: created.id });
    };
    return <section className="space-y-2" aria-label={l('method')}>
        <h4 className="font-semibold">{l('method')}</h4>
        <ul className="space-y-1">{value.map(ref => <li key={ref.kind === 'own' ? `o${ref.id}` : `c${ref.slug}`} className="flex items-center gap-2 rounded-md bg-slate-50 px-2">
            <span aria-hidden>{ref.kind === 'own' ? '✎' : '✦'}</span>
            <span className="min-w-0 flex-1 break-words py-2">{titleOf(ref)} <span className="text-xs text-slate-500">({l(ref.kind === 'own' ? 'ownMark' : 'certifiedMark')})</span></span>
            <Button type="button" variant="ghost" disabled={disabled} aria-label={`✕ ${titleOf(ref)}`} onClick={() => onChange(value.filter(v => !sameRef(v, ref)))}><X className="h-4 w-4" aria-hidden /></Button>
        </li>)}</ul>
        <div className="flex flex-wrap items-end gap-2"><div className="min-w-0 flex-1"><Field label={l('pickStrategy')}>
            <select className={input} disabled={disabled} value={choice} onChange={e => { const [k, v] = e.target.value.split(':'); if (k === 'o') add({ kind: 'own', id: Number(v) }); else if (k === 'c') add({ kind: 'certified', slug: v }); }}>
                <option value="">—</option>
                {options.own.length > 0 && <optgroup label={l('myStrategies')}>{options.own.map(s => <option key={s.id} value={`o:${s.id}`}>✎ {s.text}</option>)}</optgroup>}
                <optgroup label={l('certifiedStrategies')}>{options.certified.map(s => <option key={s.slug} value={`c:${s.slug}`}>✦ {s.name}</option>)}</optgroup>
            </select></Field></div></div>
        <div className="flex flex-wrap items-end gap-2"><div className="min-w-0 flex-1"><Field label={l('writeStrategy')}>
            <input className={input} maxLength={300} disabled={disabled} value={draft} onChange={e => setDraft(e.target.value)} /></Field></div>
            <Button type="button" variant="secondary" disabled={disabled || !draft.trim()} onClick={() => void write()}>+</Button></div>
    </section>;
}
```
- [ ] **Step 2:** `npx tsc --noEmit && npm run lint` → PASS.
- [ ] **Step 3: commit** `feat: add method picker with personal strategies`

### Task B3: `GoalDialog` con origine, metodo, controlli, prove

**Files:** Modify `frontend/src/components/goals/GoalDialog.tsx`, `GoalForm.tsx`.

**Interfaces:**
- Consumes: `MethodPicker` (B2), tipi B1, `POST …/actions` con `kind: 'check'` (A4), link con `role: 'evidence'` (A2).
- Produces: `DialogTarget` guadagna `{ kind: 'create'; parentId?: number; source?: CatalogEntry; origin?: GoalOrigin; prefill?: { motivation?: string; title?: string } }` (usato da C1, C2, C3, C4).

- [ ] **Step 1:** modifiche, nell'ordine delle sezioni della spec § 7.4:
  1. **Nato da:** se `goal?.origin`, prima di «Serve a» una riga `{l('bornFrom')}: <Link href={origin.href}>{resourceLabel(lang, origin.kind)} · {origin.title}</Link>` (senza link se `href` è null).
  2. **Creazione con origine:** `initial` usa `target.prefill` (titolo, motivazione); `submit` in creazione invia `origin: target.origin ?? null`.
  3. **Cosa voglio:** `GoalForm` invariato (titolo, perché conta, criteri, stato, priorità, data, condivisione); il campo `reflection` **non** si mostra più (resta nel payload).
  4. **Come ci arrivo:** titolo `l('howIGetThere')`; dentro, in ordine: `<MethodPicker value={form.method} items={goal?.method ?? []} onChange={method => setForm({ ...form, method })} disabled={busy || (Boolean(goal) && otherDraft)} />`, i sottobiettivi (sezione `reachedBy` esistente) e le azioni `means` non di controllo (`goal.links.filter(l => l.role === 'means' && l.action_kind !== 'check')`). Il blocco «Crea attività» esistente resta qui. Accanto a ogni strategia già salvata, «Metti in pratica» precompila `action.title` con il titolo della strategia.
  5. **Come controllo:** elenco `goal.checks` con ◷, data, esito (`l('progress_' + progress)`) se fatto; form «+ Controllo» uguale a «Crea attività» ma con `kind: 'check'` e data obbligatoria (`required`).
  6. **Prove:** link con `role === 'evidence'`; select limitata alle risorse `portfolio` che invia `{kind: 'portfolio', target_id, role: 'evidence', revision}`.
  7. **Collegamenti:** i restanti `role === 'related'` (sezione esistente, rinominata solo se serve), la select esclude `reading`/`session`.
  8. **Bilancio:** `goal.reviews.length > 0` → ultima in sintesi (esito, soddisfazione, data) + `<details>` «Bilanci precedenti»; pulsante `l('doReview')` che mette `mode='review'` nello stato del body e rende `GoalReviewStep` (B4) al posto del contenuto.
  9. **Barra fissa:** aggiungere `<a href={`/api/user/goals/${goal.id}/pdf?lang=${lang}`} download>{l('downloadPath')}</a>` (la rotta arriva in D1; fino ad allora il link resta nascosto dietro `const PDF_READY = false`, che D1 porta a `true`).
  La guardia bozze (`dirty`, `otherDraft`) include il draft del controllo e la select delle prove, come per «Crea attività».
- [ ] **Step 2:** `npx tsc --noEmit && npm run lint && npm test` → PASS.
- [ ] **Step 3: commit** `feat: show origin, method, checks and evidence in the goal dialog`

### Task B4: `GoalReviewStep`

**Files:** Create `frontend/src/components/goals/GoalReviewStep.tsx`; Modify `GoalDialog.tsx`.

**Interfaces:**
- Consumes: `POST /user/goals/{id}/reviews` (A5), `DialogTarget.prefill` (B3).
- Produces: `<GoalReviewStep goal={PersonalGoal} onDone={(row: PersonalGoal) => void} onCancel={() => void} onNavigate={(t: DialogTarget) => void} onDirty={(d: boolean) => void} />`.

- [ ] **Step 1:** componente con quattro gruppi di radio (`fieldset` + `legend`: commitment, outcome obbligatorio, satisfaction) e cinque `textarea` (obstacles, change, learned, next_step); sotto i criteri dell'obiettivo in sola lettura e il numero delle prove. Salvataggio:
```tsx
const save = async () => {
    setBusy(true);
    try { const row = await goalApi<PersonalGoal>(`/user/goals/${goal.id}/reviews`, 'POST', { ...form, revision: goal.revision }); onDirty(false); onDone(row); }
    catch (e) { setError(e); } finally { setBusy(false); }
};
```
Dopo il salvataggio compaiono i tre ponti: `→ nuovo obiettivo` (`onNavigate({ kind: 'create', prefill: { title: form.next_step.slice(0, 160) } })`), `→ nuova azione` (torna al popup con il campo «Crea attività» precompilato) e `→ aggiorna il taccuino` (`<Link href={`/profilo/taccuino?note=${encodeURIComponent(form.change)}`}>`, letto da C2).
`onDirty(true)` appena un campo cambia; `useDraftGuard` come nel popup.
- [ ] **Step 2:** `npx tsc --noEmit && npm run lint` → PASS.
- [ ] **Step 3: commit** `feat: add the goal review step`

### Task B5: Controlli in bacheca

**Files:** Modify `frontend/src/components/visual/VisualTools.tsx` (righe ~334-351), `frontend/src/lib/visual-tools.ts` (tipo `Action`), `frontend/src/lib/i18n-visual-tools.ts`.

- [ ] **Step 1:** tipo `Action` guadagna `kind?: 'activity' | 'book' | 'article' | 'film' | 'check'; progress?: 'on_track' | 'slow' | 'stuck' | null; adjustment?: string`.
- [ ] **Step 2:** nella card di un'azione con `kind === 'check'`: icona ◷; la select `actionKind` non la offre (un controllo nasce solo da un obiettivo: B3); campi «A che punto sono?» (select `progress`), «Cosa osservo» (= `reflection`), «Cosa cambio» (= `adjustment`); nella select «Sposta», l'opzione `done` è `disabled` finché `progress` è vuoto, con testo d'aiuto `l('checkNeedsProgress')`. Nuove chiavi in `i18n-visual-tools.ts` (6 lingue): `check`, `progress`, `on_track`, `slow`, `stuck`, `observe`, `adjust`, `checkNeedsProgress`.
- [ ] **Step 3:** `npm test && npm run lint && npx tsc --noEmit` → PASS; `npm run test:visual` → PASS.
- [ ] **Step 4: commit** `feat: let students record progress on check actions`

### Task B6: Test browser Obiettivi

**Files:** Modify `frontend/tests/personal-goals.test.mjs`, `backend/tests/goals_browser_server.py` (includere i router di A3/A5).

- [ ] **Step 1:** nuovi casi: (a) metodo con una strategia certificata e una propria scritta nel popup, riusata in un secondo obiettivo; (b) «+ Controllo» con data → compare in bacheca; «Fatte» disabilitato finché non si sceglie «a rilento»; (c) «Fai il bilancio» con esito «sì» → stato «Concluso», bilancio visibile, tappa ◆ nella Linea del tempo; (d) un portfolio collegato come prova compare in «Prove»; (e) mobile 360 px: nessuno scorrimento orizzontale nel passo bilancio.
- [ ] **Step 2:** `cd frontend && npm run build && npm run test:goals` → PASS (non avviare `dev-frontend.sh` in parallelo: porta 3107).
- [ ] **Step 3: commit** `test: cover goal method, checks and review in the browser`

**Fine lotto B:** chiedere all'utente se provare in dev (`scripts/dev-backend.sh`, `scripts/dev-frontend.sh`) e poi, **dopo avviso**, rebuild: `docker compose up -d --build backend frontend`, controllo `docker compose ps` e log.

---

# Lotto C — Compilazioni, Taccuino, Linea del tempo, rimozione del libretto

### Task C1: «La mia lettura» nelle Compilazioni

**Files:** Create `frontend/src/components/profile/ResultReadingCard.tsx`, `frontend/src/lib/i18n-reading.ts`; Modify `frontend/src/app/profilo/page.tsx` (in fondo alla sezione `sessions`, prima della chiusura `</section>` a ~riga 788).

**Interfaces:**
- Consumes: `GET/PUT /api/user/readings` (A6), `GoalDialog` con `origin`/`prefill` (B3), `GoalsPanel`-style apertura popup.
- Produces: `<ResultReadingCard sessionId={string} questionnaireType={string} scores={Record<string, number> | null} />`.

- [ ] **Step 1:** estrarre da `StudentBookletCard.tsx` il selettore a fattori (`factorMulti` e le opzioni da `QUESTIONNAIRES[type]`) in `frontend/src/components/profile/FactorMultiSelect.tsx` con props `{ label, value: string[], onChange, questionnaireType }`, e farlo usare da `StudentBookletCard` (ancora vivo fino a C5) per non duplicare.
- [ ] **Step 2:** `ResultReadingCard`: carica la lettura, due `FactorMultiSelect` (forza, da far crescere), `textarea` «Cosa mi dice di me», Salva (PUT). Sotto, per ogni area da far crescere salvata, `[→ Rendi obiettivo]` che apre `GoalDialog` con `{ kind: 'create', origin: { kind: 'reading', target_id: sessionId }, prefill: { motivation: reading.note } }`: montare `GoalDialog` nella card (serve `goals`/`groups`: caricarli come fa `GoalsPanel`). Elenco «Obiettivi nati da qui» da `reading.goal_ids` con link `/profilo/obiettivi?goal={id}`. Chiavi i18n in `i18n-reading.ts` (6 lingue): `title` «La mia lettura», `strengths` «Punti di forza da valorizzare», `growth` «Da far crescere», `note` «Cosa mi dice di me», `toGoal` «→ Rendi obiettivo», `born` «Obiettivi nati da qui», `save`, `saved`.
- [ ] **Step 3:** montare `<ResultReadingCard key={selectedSession.session_id} sessionId=… questionnaireType=… scores=… />` sotto il grafico.
- [ ] **Step 4:** `npm run lint && npx tsc --noEmit && npm test` → PASS.
- [ ] **Step 5: commit** `feat: add "my reading" to questionnaire results with a bridge to goals`

### Task C2: Taccuino — «Cosa conta per me», ponte, riquadri in cima

**Files:** Modify `backend/schemas.py` (`LEARNER_PROFILE_FIELDS`, `LearnerProfileSave` riga ~644-680), `frontend/src/components/profile/LearnerProfileCard.tsx`, `frontend/src/lib/i18n.ts` (`lp.field.values` in 6 lingue), `frontend/src/app/profilo/page.tsx` (riga 482), `frontend/src/components/visual/PersonalVisualWorkspacePage.tsx` (riga 40), `frontend/src/components/profile/PortfolioCard.tsx`; Test `backend/tests/test_smoke.py` o il test del learner profile esistente (`grep -ln "learner-profile" backend/tests`).

- [ ] **Step 1: test** backend: salvare un taccuino con `values='La giustizia'` e rileggerlo (nel file di test del learner profile). FAIL.
- [ ] **Step 2:** `values` in `LEARNER_PROFILE_FIELDS`, campo `values: Optional[str] = None` e nel validatore `pre=True`. PASS.
- [ ] **Step 3:** `LearnerProfileCard`: campo `{ key: 'values', labelKey: 'lp.field.values', multiline: true }` dopo `context`; se `?note=` è nell'URL (da B4), precompilare `notes` accodando il testo e segnare la bozza come modificata; in fondo, se `main_difficulty` non è vuota, `[→ Rendi obiettivo la difficoltà]` (`origin: {kind: 'notebook', target_id: 'current'}`, `prefill: {motivation: values}`).
- [ ] **Step 4:** rimuovere `JourneyOverview` da `page.tsx:482` e `PersonalVisualWorkspacePage.tsx:40` (e il suo import e `GOAL_KIND`); spostare `<TeacherNotesCard lang={lang} />` dalla sezione libretto alla sezione `notebook`, dopo `LearnerProfileCard`. `PortfolioCard`: per ogni voce, chip «prova di: {titolo}» per gli obiettivi che la collegano con `role === 'evidence'` (una chiamata `/user/goals` e mappa `target_id → titoli`). Se `JourneyOverview` non ha più consumatori con `kind`, togliere la prop e il ramo `kind`.
- [ ] **Step 5:** `npm run lint && npx tsc --noEmit && npm test`; `PYTEST` sul file backend → PASS.
- [ ] **Step 6: commit** separati: `feat: add "what matters to me" to the notebook with a bridge to goals` e `refactor: remove goal panels from the top of reflection pages`.

### Task C3: Linea del tempo — rilettura, legenda, bilanci

**Files:** Modify `frontend/src/components/visual/TimelineTools.tsx`, `PersonalTimeline.tsx`, `frontend/src/lib/visual-tools.ts` (tipo `TimelineEvent.review`), `i18n-visual-tools.ts`; Create `frontend/src/lib/timeline-legend.ts` + `.test.ts`.

**Interfaces:**
- Produces: `timelineGlyph(item: { kind: 'event' | 'action'; id: string; tense?: string; action_kind?: string; review_date?: boolean }) => '●' | '◆' | '◷' | '☐' | '◎'`.

- [ ] **Step 1: test** `timeline-legend.test.ts`: `goal-review-3` → ◆; evento passato → ●; azione `check` → ◷; azione → ☐; data di revisione → ◎. FAIL.
- [ ] **Step 2:** implementare `timelineGlyph`; PASS.
- [ ] **Step 3:** nel modulo della tappa passata (`TimelineTools.tsx`), sezione chiudibile «Rileggere l'esperienza» con i campi di `review` (ruolo come radio con le etichette `eventBooklet.role.*` già esistenti, «Cosa ha funzionato» / «Cosa non ha funzionato» una voce per riga, «La tua rilettura», «Ho scoperto che», «Parole chiave», «Cosa proverai la prossima volta», «Come e quando»); se `try_next` è compilato, `[→ obiettivo]` apre `GoalDialog` con `origin: {kind: 'event', target_id: event.id}` e `prefill.title = try_next`, e `[→ azione]` porta a `/profilo/azioni?new=1&title=…`. In `PersonalTimeline.tsx`: legenda con i cinque simboli; gli eventi con id `goal-review-*` sono in sola lettura, con link «Apri l'obiettivo» a `/profilo/obiettivi?goal={source.slice(5)}`.
- [ ] **Step 4:** `npm test && npm run lint && npx tsc --noEmit && npm run test:timeline` → PASS.
- [ ] **Step 5: commit** `feat: add experience review to past milestones and a timeline legend`

### Task C4: Chat — la bozza evento diventa una tappa; origine della sessione

**Files:** Create `backend/routes/milestones.py`; Modify `backend/main.py`; Rename `frontend/src/components/qsa/EventBookletCard.tsx` → `EventMilestoneCard.tsx`; Modify `GuidedChatInterface.tsx`, `GoalDraftCard.tsx`, `frontend/src/lib/event-booklet.ts`, `backend/event_booklet.py` (solo testo `DIRECTIVE`), `backend/tool_brief_seed.py` (righe 138 e 153); Test `backend/tests/test_milestones.py` (nuovo), `backend/tests/test_event_booklet.py`.

**Interfaces:**
- Produces: `POST /user/timeline/milestones` body `{request_id, title, date: 'YYYY-MM-DD' | null, period: str, review: EventReview, session_id: str | null}` → `{event_id}`; idempotente per `request_id` (id evento = `chat-` + sha256(username:request_id)[:24]).

- [ ] **Step 1: test** `test_milestones.py`: crea tappa con `review.worked=['Schema']` → presente nel workspace personale, `tense='past'`; stessa `request_id` due volte → un solo evento; `date` futura → 422. FAIL.
- [ ] **Step 2:** implementazione:
```python
"""Salva una tappa passata dalla chat (ex «Salva nel libretto» dei percorsi evento)."""
import hashlib
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field, field_validator
from sqlalchemy.orm import Session

from .. import auth, database
from ..goals import Strict
from ..personal_timeline import ensure_personal_timeline
from ..visual_tools import EventReview, SavePersonalWorkspace, load_workspace, save_workspace

router = APIRouter()


class MilestoneCreate(Strict):
    request_id: str = Field(pattern=r'^[a-zA-Z0-9_-]{8,64}$')
    title: str = Field(min_length=1, max_length=160)
    date: str | None = None
    period: str = Field(default='', max_length=100)
    review: EventReview
    session_id: str | None = Field(default=None, max_length=100)

    @field_validator('date')
    @classmethod
    def past_date(cls, value):
        if value is not None and date.fromisoformat(value) > date.today():
            raise ValueError('A milestone is in the past')
        return value


@router.post('/user/timeline/milestones', status_code=201)
def create_milestone(payload: MilestoneCreate, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    ensure_personal_timeline(db, user['username'])
    event_id = 'chat-' + hashlib.sha256(f"{user['username']}:{payload.request_id}".encode()).hexdigest()[:24]
    state = load_workspace(db, None, user['username'])
    work = state['workspace']
    if not any(e['id'] == event_id for e in work['timeline']['events']):
        event = dict(id=event_id, title=payload.title, tense='past', symbol='milestone', review=payload.review.model_dump(),
                     period=payload.period or payload.date or date.today().isoformat(),
                     source=f'session:{payload.session_id}' if payload.session_id else '')
        if payload.date:
            event.update(date_mode='point', start_date=payload.date)
        work['timeline']['events'].append(event)
        work['timeline']['title'] = work['timeline']['title'] or 'Timeline'
        save_workspace(db, None, user['username'], SavePersonalWorkspace(revision=state['revision'], workspace=work))
    return {'event_id': event_id}
```
Router in `main.py`. PASS.
- [ ] **Step 3:** frontend: `EventMilestoneCard` = `EventBookletCard` con salvataggio su `/api/user/timeline/milestones` (mappa: `title`, `date`, `role`, `worked`, `didNotWork`, `reading`, `try`→`try_next`, `howWhen`→`how_when`); testi `eventBooklet.save` → nuove chiavi `eventMilestone.save` «Salva come tappa», `saved` «Tappa salvata nella tua linea del tempo», `open` «Apri la linea del tempo» (6 lingue). Dopo il salvataggio, se `try_next` c'è: «Rendi obiettivo» → `/profilo/obiettivi?new=1&origin=event:{event_id}&title=…` (supportare questi parametri in `GoalsPanel` aprendo `GoalDialog` con `origin`/`prefill`). `GoalDraftCard`: aggiungere `origin: { kind: 'session', target_id: sessionId }` al POST.
- [ ] **Step 4:** backend testi: `DIRECTIVE` in `event_booklet.py` («pre-fills their booklet entry» → «pre-fills a milestone in their Timeline»); `tool_brief_seed.py` righe 138/153 «save in their Booklet» → «save as a milestone in their Timeline». Aggiornare le asserzioni di `test_event_booklet.py`/`test_evento_significativo.py` che cercano la parola «booklet» nei testi. Il nome del blocco ```` ```booklet ```` resta.
- [ ] **Step 5:** `PYTEST backend/tests/test_milestones.py backend/tests/test_event_booklet.py backend/tests/test_event_booklet_chat.py backend/tests/test_evento_significativo.py`; `npm run lint && npx tsc --noEmit` → PASS.
- [ ] **Step 6: commit** `feat: save event chat drafts as timeline milestones` e `feat: record the chat session as the origin of drafted goals`.

### Task C5: Rimozione del libretto e avvio della migrazione

**Files:**
- Backend: `backend/routes/survey.py` (rotte libretto righe 423-700 tranne `/user/certified-strategies` → 410; `/user/certified-strategies` resta, con `_normalize_booklet_type` rinominato `_normalize_instrument`; `STUDENT_BOOKLET_TYPES` → `INSTRUMENT_TYPES` se ancora usato da `visual_personal.py`), `backend/booklet_timeline.py` (eliminare; `biography_events` vive già in `booklet_migration.py`), `backend/visual_personal.py` (destinazione `reading`), `backend/routes/orientation.py:129` (`ResultReading`/`PersonalGoal` al posto di `StudentBooklet`), `backend/personal_timeline.py:19` (togliere `('booklet', 'Libretto')`), `backend/main.py` (togliere la condizione `BOOKLET_MIGRATION`).
- Frontend: `lib/personal-area.ts` (gruppo `reflection` senza `libretto`, via da `personalAreaImages`), `lib/i18n-personal-area.ts`, `app/profilo/libretto/page.tsx` (redirect), `app/profilo/page.tsx` (sezione `booklet`, stato `selectedBookletType` e import), eliminare `components/profile/StudentBookletCard.tsx`, `lib/booklet-biography.ts` (+ test), `components/qsa/EventBookletCard.tsx` se ancora presente; `components/visual/VisualPersonalTransfer.tsx` + `lib/visual-personal.ts` (destinazione `reading`); `lib/goals.ts`, `GoalUI.tsx` (nessun `booklet`); `lib/i18n.ts` (chiavi `booklet.*` non più usate; `eventBooklet.role.*` restano se usate da C3); `lib/i18n-guide-audiences.ts`, `ProfileChangeReflection.tsx`, `ConfigForm.tsx`/`i18n-admin.ts` (voce del componente `student_booklet`: vedi D2).
- Test: `backend/tests/test_visual_personal*.py` (se esiste; `grep -ln visual_personal backend/tests`), `frontend/src/lib/visual-personal.test.ts`, `backend/tests/test_orientation.py`.

- [ ] **Step 1: test** che falliscono: `GET /user/student-booklets/instrument/QSA` → 410; trasferimento visuale con `destination='reading'` scrive nella `note` della lettura della compilazione della sessione (422 se la sessione non ha compilazione); `orientation_status` di un utente con sola lettura → attività legacy vera.
- [ ] **Step 2:** implementazione backend.
  - 410: un solo helper `def _booklet_gone(): raise HTTPException(410, 'The booklet moved to results, goals and timeline')` richiamato da ogni rotta libretto (corpi eliminati); la rotta PDF per id idem.
  - `visual_personal.py`: `destination: Literal['notebook', 'reading']`, `BOOKLET_FIELDS` → `READING_FIELDS = ('note',)`, `booklet_id` eliminato; `personal_context` restituisce `reading: {session_id, note} | None` al posto di `booklets`, cercando la compilazione con `session_questionnaire`/`QuestionnaireResult` della sessione; limite `2000`.
- [ ] **Step 3:** frontend: rimozioni e redirect (`import { redirect } from 'next/navigation'; export default function Page({ searchParams }) { redirect('/profilo/compilazioni'); }` — mantenere `?instrument=` se presente), `VisualPersonalTransfer` con destinazione «La mia lettura». Cercare residui: `grep -rn "libretto\|booklet\|Booklet" frontend/src backend --include=*.ts --include=*.tsx --include=*.py | grep -v "event_booklet\|eventBooklet\|booklet_migration\|```booklet"` → ogni riga rimasta va giustificata o tolta.
- [ ] **Step 4:** `PYTEST` su tutti i test toccati + `test_smoke.py` (worktree in /tmp); `npm test && npm run lint && npx tsc --noEmit && npm run build && npm run test:goals && npm run test:timeline && npm run test:visual` → PASS.
- [ ] **Step 5: commit** separati: `feat!: retire the student booklet` (backend + frontend rimozioni, redirect, 410) e `feat: send visual work to "my reading" instead of the booklet`.

**Fine lotto C:** avvisare l'utente prima del rebuild; la migrazione gira all'avvio del backend. Dopo il rebuild: log `booklet migration: N users migrated`, controllo in DB (`select count(*) from result_readings; select count(*) from goal_reviews;`), verifica a mano di una scheda migrata.

---

# Lotto D — PDF, contesto AI, documentazione

### Task D1: PDF «Percorso dell'obiettivo»

**Files:** Modify `backend/pdf_generator.py` (nuova `generate_goal_path_pdf`; eliminare `generate_student_booklet_pdf` riga 1181 e i suoi helper `bio_events` riga ~1133 se non usati altrove), `backend/routes/goals.py`; `frontend/src/components/goals/GoalDialog.tsx` (`PDF_READY = true`); Test `backend/tests/test_goal_pdf.py` (nuovo).

**Interfaces:**
- Produces: `generate_goal_path_pdf(goal: dict, parents: list[str], children: list[dict], lang: str, student_name: str) -> bytes`; `GET /user/goals/{goal_id}/pdf?lang=it` → `application/pdf`, `Content-Disposition: attachment; filename="percorso-obiettivo-{id}.pdf"`.

- [ ] **Step 1: test:** obiettivo con origine, metodo (✦ e ✎), un'azione, un controllo fatto, una prova, un bilancio → 200, `content-type` PDF, `pypdf` (o la libreria già usata dai test PDF: `grep -n "import" backend/tests/test_pdf_summary.py`) estrae il testo e contiene il titolo, «Metodo», «Bilancio», il testo della strategia propria; obiettivo aperto → contiene «in corso» e non «Bilancio»; obiettivo di un altro utente → 404. FAIL.
- [ ] **Step 2:** implementare riusando font, stili e intestazione del PDF libretto (stesso modulo), con le sezioni 1–7 della spec § 9 e i testi del PDF in un dizionario per 6 lingue nello stile di quelli esistenti in `pdf_generator.py`. La rotta costruisce `goal_dict`, i titoli dei genitori, i sottobiettivi (titolo + stato) e il nome dello studente come fa oggi la rotta PDF libretto.
- [ ] **Step 3:** `PYTEST backend/tests/test_goal_pdf.py backend/tests/test_pdf_summary.py` → PASS; frontend `PDF_READY = true`, lint/tsc.
- [ ] **Step 4: commit** `feat: download a goal's path as a PDF` e `refactor: remove the booklet PDF`.

### Task D2: Contesto AI e testi fissi

**Files:** Modify `backend/chat_logic.py` (righe 2365, 2537-2627, 2859-2861), `backend/goals.py` (`goals_context`), `backend/prompt_contract.py` (righe 51, 68), `backend/prompt_config.py` (605-623), `backend/orientation.py` (138, 463, 820), `backend/model_context.py:68` (marcatore `BOOKLET` → `READING`), `frontend/src/components/admin/ConfigForm.tsx` + `lib/i18n-admin.ts` (etichetta del componente); Test `backend/tests/test_smoke.py`, `backend/tests/test_goals.py`, `backend/tests/test_prompt_*.py` interessati.

- [ ] **Step 1: test:**
  - `goals_context` contiene per l'obiettivo `method` con `✎`/`✦`, `last_check` (`progress` + `adjustment`) e resta sotto 6500 caratteri con 5 obiettivi pieni;
  - `_reading_context(db, 'alice', 'QSA', 's1')` restituisce `## La mia lettura dello strumento` con forza, aree e nota, e gli obiettivi nati da lì; stringa vuota senza lettura;
  - in `test_smoke.py` le asserzioni su «## Libretto dello studente» diventano «## La mia lettura dello strumento».
  FAIL.
- [ ] **Step 2:** implementazione:
  - `chat_logic.py`: `MAX_BOOKLET_CONTEXT_CHARS` → `MAX_READING_CONTEXT_CHARS = 1800`; `_student_booklet_context` → `_reading_context(db, username, questionnaire_type, session_id)`: lettura della sessione, altrimenti l'ultima dello stesso tipo; righe `Punti di forza: …`, `Da far crescere: …`, `Cosa mi dice di me: …`, `Obiettivi nati da questa lettura: titolo (stato)…`. Il flag componente resta `student_booklet` per compatibilità con la configurazione salvata in DB (etichetta UI: «La mia lettura»); `components["student_booklet"]` invariato come chiave.
  - `goals_context`: al dict di ogni obiettivo aggiungere `method=[('✎ ' if m['kind']=='own' else '✦ ') + m['title'][:120] for m in goal['method'] if m['available']][:6]`, `last_check` (ultimo controllo fatto: `progress`, `date`) e togliere `reflection` (sostituito dall'ultimo bilancio se l'obiettivo è stato riaperto: `last_review={outcome, learned[:300]}`). Aggiornare l'intestazione: «Checks are the student's own progress notes; a review closes a goal».
  - Testi fissi: «the Notebook, Booklet and Portfolio» → «the Notebook, readings of results, goals and the Portfolio»; «the Booklet reflections on each instrument» → «readings the student wrote about each result»; `orientation.py:138` e `:463`: il libretto non c'è più («the Notebook holds what cuts across tools, the reading of each result stays with that result, goals and the Timeline follow the journey»). I prompt in DB personalizzati si aggiornano con `backend.prompt_updates` **solo in append** (vedi `docs/make-prompt-testing.md`); preparare lo snippet e chiedere conferma all'utente prima di applicarlo.
- [ ] **Step 3:** `PYTEST backend/tests/test_goals.py backend/tests/test_prompt_*.py`; `test_smoke.py` in worktree /tmp → PASS (rispetto alla baseline dei fallimenti noti).
- [ ] **Step 4: commit** `feat: give the counselor the student's reading instead of the booklet` e `docs: update fixed prompt texts after retiring the booklet`.

### Task D3: Documentazione e guida

**Files:** `CONTEXT.md` (glossario righe ~49-50), `docs-counselorbot/funzionalita-counselorbot.md`, `frontend/src/lib/i18n.ts` (`guide.section12.body` e simili nelle 6 lingue), catture della guida (`frontend/scripts/capture-guide.mjs`), `area-personale-handoff.md`, `docs/plans/2026-09-25-libretto-nella-triade-design.md` (stato → implementato).

- [ ] **Step 1:** glossario: «Libretto» → voce ritirata con rimando; nuove voci **lettura** (`ResultReading`; EN reading, ES lectura, FR lecture, DE Deutung, SV tolkning — verificare ciascun termine sulla fonte della lingua), **metodo**, **controllo**, **bilancio**, **origine**, **prova**, con coppie nelle 6 lingue.
- [ ] **Step 2:** guida: sezione Area personale e Obiettivi riscritte (niente libretto; lettura → obiettivo → metodo → azioni e controlli → bilancio; PDF del percorso). Rigenerare le catture Obiettivi, Compilazioni, Linea del tempo nelle 6 lingue.
- [ ] **Step 3:** `make guidance-check` → PASS; `npm run lint` → PASS.
- [ ] **Step 4:** knowledge card dell'assistente del sito: il valore in DB si aggiorna solo in append; preparare il testo e chiedere conferma.
- [ ] **Step 5: commit** `docs: describe readings, goal method, checks and reviews`

### Task D4: Verifica finale e rilascio

- [ ] **Step 1:** backend completo nel container o in worktree /tmp: `python3 -m pytest backend/tests -q` → solo i fallimenti noti.
- [ ] **Step 2:** frontend: `npm test && npm run lint && npx tsc --noEmit && npm run build && npm run test:goals && npm run test:timeline && npm run test:visual`.
- [ ] **Step 3:** prova in dev con l'utente (8002/3107): compilazione → lettura → obiettivo → metodo con strategia propria → controllo → bilancio → PDF; chat evento → tappa → obiettivo.
- [ ] **Step 4:** avviso all'utente, poi `docker compose up -d --build backend frontend`, `docker compose ps`, log del backend (migrazione, errori).
- [ ] **Step 5:** push del branch; PR verso `main` con riepilogo dei lotti, test eseguiti, migrazione (conteggi), nessun passo sudo. Promemoria: nessuna modifica nginx; se servisse, `sudo ./update_nginx.sh` va dato a mano.

---

## Auto-revisione del piano rispetto alla spec

| Spec | Task |
| --- | --- |
| § 4.1 libretto sparisce, redirect | C5 |
| § 4.2 mappa delle domande | A6, A7, B3, B4, C1–C4 |
| § 4.3 metodo + strategie proprie | A3, B2 |
| § 4.4 controllo come azione | A4, B3, B5 |
| § 4.5 bilancio | A5, B4 |
| § 4.6 PDF percorso | D1 |
| § 4.7 niente riquadro in cima + ponti | C1, C2, C3 |
| § 5 modello dati | A1, A2, A4 |
| § 6 API | A2–A6, C4, C5, D1, D2 |
| § 7 frontend | B1–B6, C1–C5 |
| § 8 migrazione | A7, C5 |
| § 10 errori | A2, A3, A5, A6, C5 |
| § 11 test | ogni task + B6, D4 |
| § 12 documentazione | D3 |

Scostamenti dalla spec, da riportare nella spec quando si chiude il lotto A:
- `notebook` ed `event` ammettono anche `related` (i collegamenti esistenti non hanno ruolo `origin`).
- `personal_links` accetta ancora `booklet` come dato legacy; la migrazione lo toglie e la UI non lo offre.
- `TeacherNotesCard` (oggi nella sezione libretto) passa al Taccuino: non era nella spec.
- La migrazione si attiva solo in C5 (variabile `BOOKLET_MIGRATION` nel lotto A).
- Il flag del componente di contesto resta `student_booklet` come chiave per compatibilità con la configurazione salvata.
