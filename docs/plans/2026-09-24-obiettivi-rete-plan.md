# Obiettivi come rete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare `/profilo/obiettivi` in una rete di obiettivi (più genitori, profondità libera) mostrata come elenco rientrato, con modifica in popup, vista mappa solo desktop e guardia bozze completa (F06).

**Architecture:** Il backend aggiunge la tabella `goal_edges` (genitore → figlio) con controllo dei cicli, `parent_ids` in ogni obiettivo, rotte per aggiungere/togliere genitori e condivisione per ramo. Il frontend calcola la struttura con funzioni pure (`lib/goal-network.ts`) e la mostra con `GoalTree` (elenco), `GoalMap` (mappa desktop) e `GoalDialog` (`<dialog>` nativo).

**Tech Stack:** FastAPI + SQLAlchemy su Postgres; Next.js/React 19 + Tailwind; `@xyflow/react` + `@dagrejs/dagre` (già dipendenze); test con pytest, `node --test`, Playwright.

**Spec:** `docs/plans/2026-09-24-obiettivi-rete-design.md`

## Global Constraints

- Branch `feature/goal-network`. Mai `git add -A`: aggiungere file per nome (altri agenti lavorano nello stesso tree).
- Commit Conventional, uno per tipo di cambiamento, con riga finale `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Test backend su Postgres dedicato, mai SQLite. Comando host (dalla root del repo):
  `set -a && . ./.env && set +a && DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" python3 -m pytest backend/tests/test_goals.py -q`
- Testi UI in 6 lingue nell'ordine `it, en, es, fr, de, sv` (array in `frontend/src/lib/i18n-goals.ts`).
- Stato obiettivo sempre manuale: nessun completamento o suggerimento automatico.
- Nessun trascinamento di nodi/archi; mappa solo da 1024 px (`lg`).
- Ogni cambio di struttura che altera la visibilità ai gruppi va annunciato e confermato prima del salvataggio.
- Nessun rebuild Docker senza avvisare l'utente prima.

---

## File map

| File | Azione | Responsabilità |
| --- | --- | --- |
| `backend/models.py` | Modify | modello `GoalEdge` |
| `backend/goals.py` | Modify | `ParentWrite`, `parent_id` in `GoalCreate`, `parent_ids`/`descendant_ids`/`lock_network`, `part_of` nel contesto |
| `backend/routes/goals.py` | Modify | create con genitore, rotte `/parents`, delete che incrementa i figli, condivisione per ramo |
| `backend/tests/test_goals.py` | Modify | test rete |
| `frontend/src/lib/goals.ts` | Modify | `parent_ids` nei tipi |
| `frontend/src/lib/goal-network.ts` | Create | funzioni pure della rete |
| `frontend/src/lib/goal-network.test.ts` | Create | test unitari |
| `frontend/src/lib/use-category-draft-guard.ts` → `use-draft-guard.ts` | Rename | guardia bozze generica `useDraftGuard` |
| `frontend/src/app/docente/orientamento/page.tsx` | Modify | nuovo import |
| `frontend/src/lib/i18n-goals.ts` | Modify | nuove chiavi + `goalFormat` |
| `frontend/src/components/goals/GoalForm.tsx` | Create | `GoalForm` estratto da `GoalsPanel` |
| `frontend/src/components/goals/GoalDialog.tsx` | Create | popup crea/modifica |
| `frontend/src/components/goals/GoalTree.tsx` | Create | elenco rientrato |
| `frontend/src/components/goals/GoalCatalogDialog.tsx` | Create | catalogo in popup |
| `frontend/src/components/goals/GoalMap.tsx` | Create | mappa desktop |
| `frontend/src/components/goals/GoalsPanel.tsx` | Rewrite | orchestrazione pagina |
| `frontend/src/components/goals/GoalCatalogEditor.tsx` | Modify | vista docente rientrata |
| `frontend/src/app/profilo/obiettivi/page.tsx`, `layout.tsx` | Modify/Create | testata Area personale, metadata |
| `frontend/tests/personal-goals.test.mjs` | Modify | test browser |
| `backend/tests/goals_browser_server.py` | Modify | utente `student-network` |
| `docs-counselorbot/funzionalita-counselorbot.md`, handoff | Modify | documentazione |

Nota di design: lo spec (§6) indica `role="tree"` con frecce. Il piano usa invece **liste annidate con pulsanti di apertura** (`aria-expanded`, Tab tra gli elementi): pattern disclosure WAI-ARIA, equivalente per l'accessibilità e molto meno fragile. Il Task 12 aggiorna lo spec.

---

### Task 1: Backend — archi, `parent_ids`, creazione con genitore

**Files:**
- Modify: `backend/models.py` (import riga 1; nuova classe dopo `GoalResourceLink`, ~riga 562)
- Modify: `backend/goals.py`
- Modify: `backend/routes/goals.py` (`create_goal`)
- Test: `backend/tests/test_goals.py`

**Interfaces:**
- Produces: `models.GoalEdge(parent_id, child_id)`; `goals.parent_ids(db, goal_id) -> list[int]`; `goals.descendant_ids(db, ids) -> set[int]`; `goals.lock_network(db, username)`; `GoalCreate.parent_id: int | None`; ogni risposta obiettivo contiene `parent_ids: list[int]`.

- [ ] **Step 1: Write the failing test** — in fondo a `backend/tests/test_goals.py`:

```python
def test_create_subgoal_under_owned_parent(setup):
    db, c, who, group_id = setup
    parent = goal(c, title='Erasmus')
    assert parent['parent_ids'] == []
    child = goal(c, title='Inglese', parent_id=parent['id'])
    assert child['parent_ids'] == [parent['id']]
    student(who, 'bob')
    assert c.post('/user/goals', json=dict(title='x', parent_id=parent['id'])).status_code == 404
    student(who)
    assert c.post('/user/goals', json=dict(title='x', parent_id=987654)).status_code == 404
```

- [ ] **Step 2: Run to verify it fails**

Run: comando pytest delle Global Constraints con `-k create_subgoal`
Expected: FAIL — `KeyError: 'parent_ids'` (o 422 per campo `parent_id` sconosciuto).

- [ ] **Step 3: Implement**

`backend/models.py` riga 1: aggiungere `CheckConstraint` all'import da `sqlalchemy`. Dopo `GoalResourceLink`:

```python
class GoalEdge(Base):
    """Rete degli obiettivi: il figlio serve il genitore; un figlio può avere più genitori.

    L'eliminazione di un obiettivo rimuove i suoi archi (il ramo si spezza, i figli restano).
    """

    __tablename__ = "goal_edges"
    __table_args__ = (
        UniqueConstraint("parent_id", "child_id", name="uq_goal_edge"),
        CheckConstraint("parent_id <> child_id", name="ck_goal_edge_not_self"),
    )
    id = Column(Integer, primary_key=True)
    parent_id = Column(Integer, ForeignKey("personal_goals.id", ondelete="CASCADE"), nullable=False, index=True)
    child_id = Column(Integer, ForeignKey("personal_goals.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

`backend/goals.py`: aggiungere `import hashlib` e `from sqlalchemy import or_, text` (sostituisce l'import di `or_`). In `GoalCreate` aggiungere:

```python
    parent_id: int | None = Field(default=None, gt=0)
```

Dopo `ActionCreate` aggiungere:

```python
class ParentWrite(Strict):
    parent_id: int = Field(gt=0)
    revision: int = Field(ge=1)
```

Dopo `validate_share`:

```python
def lock_network(db, username):
    """Serialize structure changes per student so concurrent requests cannot close a cycle."""
    if db.get_bind().dialect.name == 'postgresql':
        key = int.from_bytes(hashlib.sha256(f'goal-network:{username}'.encode()).digest()[:8], 'big', signed=True)
        db.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': key})


def parent_ids(db, goal_id):
    return [p for (p,) in db.query(models.GoalEdge.parent_id).filter_by(child_id=goal_id).order_by(models.GoalEdge.parent_id)]


def descendant_ids(db, ids):
    """All goals reachable downwards from `ids` (edges only join goals of one student)."""
    seen, frontier = set(), list(ids)
    while frontier:
        children = [c for (c,) in db.query(models.GoalEdge.child_id).filter(models.GoalEdge.parent_id.in_(frontier))]
        frontier = [c for c in children if c not in seen]
        seen.update(frontier)
    return seen
```

In `goal_dict`, subito dopo la costruzione di `data`:

```python
    data['parent_ids'] = parent_ids(db, row.id)
```

`backend/routes/goals.py`: importare `lock_network` da `..goals`. In `create_goal`, dopo `validate_share(...)`:

```python
    if payload.parent_id is not None:
        lock_network(db, user['username'])
        owned_goal(db, user['username'], payload.parent_id)
```

e sostituire la riga `values = ...` e l'inserimento con:

```python
    values = payload.model_dump(exclude={'revision', 'catalog_id', 'catalog_version', 'parent_id'})
    row = models.PersonalGoal(username=user['username'], catalog_id=payload.catalog_id, catalog_snapshot=snapshot, **values)
    db.add(row); db.flush()
    if payload.parent_id is not None:
        db.add(models.GoalEdge(parent_id=payload.parent_id, child_id=row.id))
    db.commit(); db.refresh(row)
    return goal_dict(db, row)
```

- [ ] **Step 4: Run tests** — intero `backend/tests/test_goals.py`. Expected: tutti PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/models.py backend/goals.py backend/routes/goals.py backend/tests/test_goals.py
git commit -m "feat: add goal network edges and create sub-goals"
```

---

### Task 2: Backend — aggiungere/togliere genitori, cicli, eliminazione che spezza il ramo

**Files:**
- Modify: `backend/routes/goals.py`
- Test: `backend/tests/test_goals.py`

**Interfaces:**
- Consumes: `GoalEdge`, `ParentWrite`, `descendant_ids`, `lock_network` (Task 1).
- Produces: `POST /user/goals/{id}/parents` body `{parent_id, revision}` → obiettivo figlio; `DELETE /user/goals/{id}/parents/{parent_id}?revision=` → obiettivo figlio; `422 'Cycle'`; `DELETE /user/goals/{id}` incrementa `revision` dei figli.

- [ ] **Step 1: Write the failing tests**

```python
def test_parents_add_remove_revision_and_idempotence(setup):
    db, c, who, group_id = setup
    a, b, child = goal(c, title='A'), goal(c, title='B'), goal(c, title='C')
    url = f"/user/goals/{child['id']}/parents"
    added = c.post(url, json=dict(parent_id=a['id'], revision=1)).json()
    assert added['parent_ids'] == [a['id']] and added['revision'] == 2
    assert c.post(url, json=dict(parent_id=b['id'], revision=1)).status_code == 409
    both = c.post(url, json=dict(parent_id=b['id'], revision=2)).json()
    assert both['parent_ids'] == sorted([a['id'], b['id']])
    same = c.post(url, json=dict(parent_id=b['id'], revision=3)).json()
    assert same['revision'] == 3
    removed = c.delete(f"{url}/{a['id']}?revision=3").json()
    assert removed['parent_ids'] == [b['id']] and removed['revision'] == 4
    assert c.delete(f"{url}/{a['id']}?revision=4").status_code == 404
    student(who, 'bob')
    assert c.post(url, json=dict(parent_id=a['id'], revision=4)).status_code == 404


def test_parents_reject_cycles_and_foreign_parent(setup):
    db, c, who, group_id = setup
    a = goal(c, title='A'); b = goal(c, title='B', parent_id=a['id']); d = goal(c, title='D', parent_id=b['id'])
    assert c.post(f"/user/goals/{a['id']}/parents", json=dict(parent_id=a['id'], revision=1)).status_code == 422
    assert c.post(f"/user/goals/{a['id']}/parents", json=dict(parent_id=d['id'], revision=1)).status_code == 422
    student(who, 'bob')
    foreign = goal(c, title='Bob')
    student(who)
    assert c.post(f"/user/goals/{a['id']}/parents", json=dict(parent_id=foreign['id'], revision=1)).status_code == 404


def test_deleting_parent_breaks_branch_and_keeps_children(setup):
    db, c, who, group_id = setup
    a = goal(c, title='A'); other = goal(c, title='Other')
    child = goal(c, title='Child', parent_id=a['id'])
    both = c.post(f"/user/goals/{child['id']}/parents", json=dict(parent_id=other['id'], revision=1)).json()
    orphan = goal(c, title='Orphan', parent_id=a['id'])
    assert c.delete(f"/user/goals/{a['id']}?revision=1").status_code == 200
    rows = {r['title']: r for r in c.get('/user/goals').json()}
    assert rows['Child']['parent_ids'] == [other['id']] and rows['Child']['revision'] == both['revision'] + 1
    assert rows['Orphan']['parent_ids'] == [] and rows['Orphan']['revision'] == orphan['revision'] + 1
    assert db.query(models.GoalEdge).filter_by(parent_id=a['id']).count() == 0
```

- [ ] **Step 2: Run to verify they fail** — `-k "parents or deleting_parent"`. Expected: FAIL (404 route not found / revision not incremented).

- [ ] **Step 3: Implement** — in `backend/routes/goals.py` importare `ParentWrite, descendant_ids` da `..goals`. Sostituire `delete_goal` e aggiungere le rotte:

```python
@router.delete('/user/goals/{goal_id}')
def delete_goal(goal_id: int, revision: int = Query(ge=1), db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    lock_network(db, user['username'])
    row = owned_goal(db, user['username'], goal_id, revision)
    # Children lose this parent: the edge belongs to the child, so its revision moves.
    children = db.query(models.GoalEdge.child_id).filter_by(parent_id=goal_id)
    db.query(models.PersonalGoal).filter(models.PersonalGoal.id.in_(children)).update(
        {models.PersonalGoal.revision: models.PersonalGoal.revision + 1}, synchronize_session=False)
    db.delete(row); db.commit()
    return {'deleted': True}


@router.post('/user/goals/{goal_id}/parents')
def add_parent(goal_id: int, payload: ParentWrite, db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    lock_network(db, user['username'])
    row = owned_goal(db, user['username'], goal_id, payload.revision)
    owned_goal(db, user['username'], payload.parent_id)
    if payload.parent_id == goal_id or payload.parent_id in descendant_ids(db, [goal_id]):
        raise HTTPException(422, 'Cycle')
    if not db.query(models.GoalEdge).filter_by(parent_id=payload.parent_id, child_id=goal_id).first():
        db.add(models.GoalEdge(parent_id=payload.parent_id, child_id=goal_id))
        row.revision += 1
    db.commit(); db.refresh(row)
    return goal_dict(db, row)


@router.delete('/user/goals/{goal_id}/parents/{parent_id}')
def remove_parent(goal_id: int, parent_id: int, revision: int = Query(ge=1), db: Session = Depends(database.get_db), user=Depends(auth.get_current_user)):
    lock_network(db, user['username'])
    row = owned_goal(db, user['username'], goal_id, revision)
    edge = db.query(models.GoalEdge).filter_by(parent_id=parent_id, child_id=goal_id).first()
    if not edge:
        raise HTTPException(404, 'Parent unavailable')
    db.delete(edge); row.revision += 1
    db.commit(); db.refresh(row)
    return goal_dict(db, row)
```

Nota: `test_parents_reject_cycles_and_foreign_parent` verifica 422 sull'auto-arco prima che il `CHECK` del DB intervenga.

- [ ] **Step 4: Run tests** — intero `test_goals.py`. Expected: PASS (anche `test_link_ownership...` che elimina un obiettivo senza figli).

- [ ] **Step 5: Commit**

```bash
git add backend/routes/goals.py backend/tests/test_goals.py
git commit -m "feat: attach and detach goal parents without cycles"
```

---

### Task 3: Backend — condivisione per ramo e `part_of` nel contesto chat

**Files:**
- Modify: `backend/routes/goals.py` (`shared_goals`)
- Modify: `backend/goals.py` (`goals_context`)
- Test: `backend/tests/test_goals.py`

**Interfaces:**
- Consumes: `descendant_ids` (Task 1).
- Produces: `GET /teacher/groups/{group_id}/goals` → righe `{id, username, title, status, criteria, reflection, review_date, parent_ids}` con `parent_ids` filtrati alla risposta; `goals_context` include `part_of: list[str]` (≤3 titoli, ≤120 caratteri).

- [ ] **Step 1: Write the failing tests**

```python
def test_sharing_follows_the_branch_without_private_ancestors(setup):
    db, c, who, group_id = setup
    top = goal(c, title='Privato in alto')
    branch = goal(c, title='Ramo condiviso', parent_id=top['id'], shared_group_id=group_id)
    leaf = goal(c, title='Foglia', parent_id=branch['id'])
    deep = goal(c, title='Profonda', parent_id=leaf['id'])
    goal(c, title='Altro privato', parent_id=top['id'])
    teacher(who)
    rows = {r['title']: r for r in c.get(f'/teacher/groups/{group_id}/goals').json()}
    assert set(rows) == {'Ramo condiviso', 'Foglia', 'Profonda'}
    assert rows['Ramo condiviso']['parent_ids'] == []
    assert rows['Foglia']['parent_ids'] == [branch['id']] and rows['Profonda']['parent_ids'] == [leaf['id']]
    assert 'motivation' not in rows['Foglia']
    student(who)
    assert c.delete(f"/user/goals/{leaf['id']}/parents/{branch['id']}?revision=1").status_code == 200
    teacher(who)
    assert {r['title'] for r in c.get(f'/teacher/groups/{group_id}/goals').json()} == {'Ramo condiviso'}


def test_context_names_parent_goals(setup):
    db, c, who, group_id = setup
    parent = goal(c, title='Erasmus in Spagna')
    goal(c, title='Migliorare inglese', parent_id=parent['id'])
    context = goals_context(db, 'alice')
    assert '"part_of": ["Erasmus in Spagna"]' in context
```

- [ ] **Step 2: Run to verify they fail** — `-k "branch or parent_goals"`. Expected: FAIL.

- [ ] **Step 3: Implement** — sostituire il corpo di `shared_goals` dopo il controllo `is_active`:

```python
    members = db.query(models.GroupMembership.username).filter_by(group_id=group_id)
    seeds = [i for (i,) in db.query(models.PersonalGoal.id).filter(
        models.PersonalGoal.shared_group_id == group_id, models.PersonalGoal.username.in_(members))]
    # Sharing a goal shares its whole branch below it, never the ancestors above it.
    visible = set(seeds) | descendant_ids(db, seeds)
    rows = db.query(models.PersonalGoal).filter(models.PersonalGoal.id.in_(visible),
        models.PersonalGoal.username.in_(members)).order_by(models.PersonalGoal.username, models.PersonalGoal.id).all()
    edges = {}
    for parent, child in db.query(models.GoalEdge.parent_id, models.GoalEdge.child_id).filter(
            models.GoalEdge.child_id.in_(visible), models.GoalEdge.parent_id.in_(visible)).order_by(models.GoalEdge.parent_id):
        edges.setdefault(child, []).append(parent)
    # Explicit sharing covers this summary only, never linked notebooks or private artifacts.
    return [{**{key: getattr(row, key) for key in ('id', 'username', 'title', 'status', 'criteria', 'reflection', 'review_date')},
             'parent_ids': edges.get(row.id, [])} for row in rows]
```

Importare `descendant_ids` in `routes/goals.py` se non già fatto. In `goals_context`, nel ciclo `for row in rows:` prima di `content.append(...)`:

```python
        part_of = [title[:120] for (title,) in db.query(models.PersonalGoal.title).join(
            models.GoalEdge, models.GoalEdge.parent_id == models.PersonalGoal.id).filter(
            models.GoalEdge.child_id == row.id).order_by(models.PersonalGoal.id).limit(3)]
```

e aggiungere `part_of=part_of,` nel `dict(...)` subito dopo `title=row.title,`.

- [ ] **Step 4: Run tests** — intero `test_goals.py`. Expected: PASS (inclusi `test_sharing_is_voluntary...` e `test_context_seed...`).

- [ ] **Step 5: Commit**

```bash
git add backend/routes/goals.py backend/goals.py backend/tests/test_goals.py
git commit -m "feat: share goal branches and name parents in chat context"
```

---

### Task 4: Frontend — funzioni pure della rete

**Files:**
- Modify: `frontend/src/lib/goals.ts`
- Create: `frontend/src/lib/goal-network.ts`
- Test: `frontend/src/lib/goal-network.test.ts`

**Interfaces:**
- Produces (tutte esportate da `goal-network.ts`):
  - `type TreeNode = { key: string; goal: PersonalGoal; depth: number; repeat: boolean; otherParents: PersonalGoal[]; children: TreeNode[] }`
  - `compareGoals(a, b): number`
  - `descendants(goals, id): Set<number>` · `ancestors(goals, id): Set<number>`
  - `wouldCycle(goals, childId, parentId): boolean`
  - `effectiveShares(goals, id): Map<number, PersonalGoal>` (gruppo → obiettivo che condivide)
  - `progress(goals, id): { done: number; total: number }`
  - `visibilityDelta(before, after, ids: number[]): { gained: number[]; lost: number[] }`
  - `visibleGoals(goals, showClosed): PersonalGoal[]`
  - `buildForest(goals, showClosed): TreeNode[]`
  - `orderBranches<T extends { id: number; parent_ids: number[] }>(rows: T[]): { row: T; depth: number }[]`

- [ ] **Step 1: Types** — in `frontend/src/lib/goals.ts` cambiare `PersonalGoal`:

```ts
export type PersonalGoal = GoalFields & { id: number; catalog_id: number | null; catalog_snapshot: { version?: number; data?: CatalogData }; links: GoalResource[]; parent_ids: number[] };
```

- [ ] **Step 2: Write the failing test** — `frontend/src/lib/goal-network.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error -- Node runs TypeScript files directly.
import { buildForest, compareGoals, descendants, ancestors, wouldCycle, effectiveShares, progress, visibilityDelta, visibleGoals, orderBranches } from './goal-network.ts';
import type { PersonalGoal } from './goals';

const g = (id: number, parent_ids: number[] = [], values: Partial<PersonalGoal> = {}) =>
    ({ id, title: `G${id}`, status: 'active', priority: 2, review_date: null, shared_group_id: null, parent_ids, links: [], ...values } as PersonalGoal);
// 1 Erasmus → 3 Inglese ← 2 Laurea; 3 → 4 (B2, concluso), 3 → 5
const net = () => [g(1, [], { shared_group_id: 7 }), g(2), g(3, [1, 2]), g(4, [3], { status: 'completed' }), g(5, [3])];

test('descendants, ancestors and cycles follow every parent', () => {
    assert.deepEqual([...descendants(net(), 1)].sort(), [3, 4, 5]);
    assert.deepEqual([...ancestors(net(), 4)].sort(), [1, 2, 3]);
    assert.equal(wouldCycle(net(), 1, 5), true);
    assert.equal(wouldCycle(net(), 1, 1), true);
    assert.equal(wouldCycle(net(), 5, 2), false);
});
test('shares are inherited from any ancestor and progress counts direct children', () => {
    assert.deepEqual([...effectiveShares(net(), 5).keys()], [7]);
    assert.equal(effectiveShares(net(), 5).get(7)?.id, 1);
    assert.equal(effectiveShares(net(), 2).size, 0);
    assert.deepEqual(progress(net(), 3), { done: 1, total: 2 });
});
test('visibility delta reports groups gained and lost by a branch', () => {
    const before = net();
    const detached = before.map(x => x.id === 3 ? { ...x, parent_ids: [2] } : x);
    assert.deepEqual(visibilityDelta(before, detached, [3]), { gained: [], lost: [7] });
    assert.deepEqual(visibilityDelta(detached, before, [3]), { gained: [7], lost: [] });
});
test('forest repeats multi-parent goals, collapses later occurrences and hides closed leaves', () => {
    const forest = buildForest(net(), false);
    assert.deepEqual(forest.map(n => n.goal.id), [2, 1]);
    const under2 = forest[0].children[0]; const under1 = forest[1].children[0];
    assert.equal(under2.goal.id, 3); assert.equal(under2.repeat, false);
    assert.deepEqual(under2.otherParents.map(p => p.id), [1]);
    assert.equal(under1.repeat, true);
    assert.deepEqual(under2.children.map(n => n.goal.id), [5]);
    assert.deepEqual(buildForest(net(), true)[0].children[0].children.map(n => n.goal.id).sort(), [4, 5]);
    assert.equal(under2.children[0].depth, 2);
});
test('closed goals with open descendants stay visible', () => {
    const rows = [g(1, [], { status: 'completed' }), g(2, [1])];
    assert.deepEqual(visibleGoals(rows, false).map(x => x.id).sort(), [1, 2]);
    assert.deepEqual(visibleGoals([g(9, [], { status: 'archived' })], false), []);
});
test('ordering uses priority, review date, newest first', () => {
    const rows = [g(1, [], { priority: 2 }), g(2, [], { priority: 1 }), g(3, [], { priority: 2, review_date: '2026-10-01' }), g(4, [], { priority: 2 })];
    assert.deepEqual(rows.sort(compareGoals).map(x => x.id), [2, 3, 4, 1]);
});
test('shared branches are ordered depth-first once each', () => {
    const rows = [{ id: 10, parent_ids: [] }, { id: 12, parent_ids: [11] }, { id: 11, parent_ids: [10] }];
    assert.deepEqual(orderBranches(rows).map(r => [r.row.id, r.depth]), [[10, 0], [11, 1], [12, 2]]);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd frontend && node --test --experimental-strip-types src/lib/goal-network.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement** — `frontend/src/lib/goal-network.ts`:

```ts
// Rete degli obiettivi: funzioni pure su PersonalGoal[] con parent_ids dal backend.
// Il backend rifiuta i cicli; qui li si evita comunque per non bloccare la pagina.
import type { PersonalGoal } from './goals';

export type TreeNode = { key: string; goal: PersonalGoal; depth: number; repeat: boolean; otherParents: PersonalGoal[]; children: TreeNode[] };

const closed = (goal: PersonalGoal) => goal.status === 'completed' || goal.status === 'archived';

export function compareGoals(a: PersonalGoal, b: PersonalGoal): number {
    return a.priority - b.priority || (a.review_date ?? '9999').localeCompare(b.review_date ?? '9999') || b.id - a.id;
}

function index(goals: PersonalGoal[]) {
    const byId = new Map(goals.map(goal => [goal.id, goal]));
    const children = new Map<number, PersonalGoal[]>();
    for (const goal of goals) for (const parent of goal.parent_ids) if (byId.has(parent)) children.set(parent, [...(children.get(parent) ?? []), goal]);
    for (const list of children.values()) list.sort(compareGoals);
    return { byId, children };
}

function walk(start: number[], next: (id: number) => number[]): Set<number> {
    const seen = new Set<number>(); const stack = [...start];
    while (stack.length) for (const id of next(stack.pop()!)) if (!seen.has(id)) { seen.add(id); stack.push(id); }
    return seen;
}

export function descendants(goals: PersonalGoal[], id: number): Set<number> {
    const { children } = index(goals);
    return walk([id], n => (children.get(n) ?? []).map(goal => goal.id));
}

export function ancestors(goals: PersonalGoal[], id: number): Set<number> {
    const { byId } = index(goals);
    return walk([id], n => (byId.get(n)?.parent_ids ?? []).filter(p => byId.has(p)));
}

export function wouldCycle(goals: PersonalGoal[], childId: number, parentId: number): boolean {
    return childId === parentId || descendants(goals, childId).has(parentId);
}

/** Groups that see a goal: its own share or any ancestor's. Maps group → goal that grants it. */
export function effectiveShares(goals: PersonalGoal[], id: number): Map<number, PersonalGoal> {
    const { byId } = index(goals); const result = new Map<number, PersonalGoal>();
    for (const goalId of [id, ...ancestors(goals, id)]) {
        const goal = byId.get(goalId);
        if (goal?.shared_group_id && !result.has(goal.shared_group_id)) result.set(goal.shared_group_id, goal);
    }
    return result;
}

export function progress(goals: PersonalGoal[], id: number): { done: number; total: number } {
    const children = index(goals).children.get(id) ?? [];
    return { done: children.filter(goal => goal.status === 'completed').length, total: children.length };
}

/** Groups gained or lost by `ids` and their descendants when the network changes from `before` to `after`. */
export function visibilityDelta(before: PersonalGoal[], after: PersonalGoal[], ids: number[]): { gained: number[]; lost: number[] } {
    const scope = new Set(ids.flatMap(id => [id, ...descendants(before, id), ...descendants(after, id)]));
    const groups = (goals: PersonalGoal[], id: number) => new Set(goals.some(goal => goal.id === id) ? effectiveShares(goals, id).keys() : []);
    const gained = new Set<number>(); const lost = new Set<number>();
    for (const id of scope) {
        const was = groups(before, id); const now = groups(after, id);
        now.forEach(group => { if (!was.has(group)) gained.add(group); });
        was.forEach(group => { if (!now.has(group)) lost.add(group); });
    }
    const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b);
    return { gained: sorted(gained), lost: sorted(lost) };
}

/** Closed goals stay visible while they lead to open work, so no open goal loses its place. */
export function visibleGoals(goals: PersonalGoal[], showClosed: boolean): PersonalGoal[] {
    if (showClosed) return goals;
    const { byId } = index(goals);
    const open = goals.filter(goal => !closed(goal)).map(goal => goal.id);
    const keep = new Set([...open, ...walk(open, n => (byId.get(n)?.parent_ids ?? []).filter(p => byId.has(p)))]);
    return goals.filter(goal => keep.has(goal.id));
}

export function buildForest(goals: PersonalGoal[], showClosed: boolean): TreeNode[] {
    const shown = visibleGoals(goals, showClosed);
    const { byId, children } = index(shown);
    const seen = new Set<number>();
    const build = (goal: PersonalGoal, depth: number, key: string, parentId: number | null, path: Set<number>): TreeNode => {
        const repeat = seen.has(goal.id); seen.add(goal.id);
        const otherParents = goal.parent_ids.filter(p => p !== parentId && byId.has(p)).map(p => byId.get(p)!);
        const next = (children.get(goal.id) ?? []).filter(child => !path.has(child.id));
        return { key, goal, depth, repeat, otherParents, children: next.map(child => build(child, depth + 1, `${key}/${child.id}`, goal.id, new Set([...path, child.id]))) };
    };
    return shown.filter(goal => !goal.parent_ids.some(p => byId.has(p))).sort(compareGoals)
        .map(goal => build(goal, 0, String(goal.id), null, new Set([goal.id])));
}

/** Teacher view: each shared goal once, depth-first under its first visible parent. */
export function orderBranches<T extends { id: number; parent_ids: number[] }>(rows: T[]): { row: T; depth: number }[] {
    const ids = new Set(rows.map(row => row.id)); const seen = new Set<number>(); const result: { row: T; depth: number }[] = [];
    const visit = (row: T, depth: number) => {
        if (seen.has(row.id)) return; seen.add(row.id); result.push({ row, depth });
        rows.filter(child => child.parent_ids.find(p => ids.has(p)) === row.id).forEach(child => visit(child, depth + 1));
    };
    rows.filter(row => !row.parent_ids.some(p => ids.has(p))).forEach(row => visit(row, 0));
    return result;
}
```

- [ ] **Step 5: Run tests** — `cd frontend && npm test`. Expected: tutti PASS (inclusi i test esistenti; `personal-area.test.ts` usa un cast e non richiede `parent_ids`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/goals.ts frontend/src/lib/goal-network.ts frontend/src/lib/goal-network.test.ts
git commit -m "feat: add pure goal network helpers"
```

---

### Task 5: Frontend — guardia bozze generica

**Files:**
- Rename: `frontend/src/lib/use-category-draft-guard.ts` → `frontend/src/lib/use-draft-guard.ts`
- Modify: `frontend/src/app/docente/orientamento/page.tsx` (riga 10 e 73)

**Interfaces:**
- Produces: `useDraftGuard(dirty: boolean, message: string): void` da `@/lib/use-draft-guard`.

- [ ] **Step 1: Rename**

```bash
git mv frontend/src/lib/use-category-draft-guard.ts frontend/src/lib/use-draft-guard.ts
```

- [ ] **Step 2: Edit** — in `use-draft-guard.ts`: commento JSDoc → `/** Protect an explicit-save draft across links, browser history and tab closing. */`; `export function useCategoryDraftGuard` → `export function useDraftGuard`; le tre occorrenze `categoryDraftGuard` (chiave nello stato history) → `draftGuard`. In `app/docente/orientamento/page.tsx`: import → `import { useDraftGuard } from '@/lib/use-draft-guard';`, chiamata → `useDraftGuard(dirty || busy, l('leave'));`.

- [ ] **Step 3: Verify**

Run: `cd frontend && grep -rn "useCategoryDraftGuard\|use-category-draft-guard\|categoryDraftGuard" src; npx tsc --noEmit -p .`
Expected: nessuna occorrenza; tsc senza errori.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/use-draft-guard.ts frontend/src/app/docente/orientamento/page.tsx
git commit -m "refactor: generalize draft guard hook for any editor"
```

---

### Task 6: Frontend — testi i18n

**Files:**
- Modify: `frontend/src/lib/i18n-goals.ts`

**Interfaces:**
- Produces: chiavi `servesTo, reachedBy, addSubgoal, addParent, attach, detach, howPrompt, alsoUnder, subgoalsDone, showClosed, visibilityGain, visibilityLoss, visibilityConfirm, inheritedShare, deleteKeepsChildren, cycle, level, viewList, viewMap, mapLabel, close, expand, collapse`; funzione `goalFormat(lang, key, values)`.

- [ ] **Step 1: Add keys** — prima di `} as const;` (riga 83):

```ts
    servesTo: ['Serve a (perché?)', 'Serves (why?)', 'Sirve para (¿por qué?)', 'Sert à (pourquoi ?)', 'Dient zu (warum?)', 'Tjänar till (varför?)'],
    reachedBy: ['Si raggiunge con (come?)', 'Reached through (how?)', 'Se alcanza con (¿cómo?)', 'Se réalise par (comment ?)', 'Erreicht durch (wie?)', 'Nås genom (hur?)'],
    addSubgoal: ['Aggiungi sottobiettivo', 'Add sub-goal', 'Añadir subobjetivo', 'Ajouter un sous-objectif', 'Unterziel hinzufügen', 'Lägg till delmål'],
    addParent: ['Aggiungi a un altro obiettivo', 'Add to another goal', 'Añadir a otro objetivo', 'Rattacher à un autre objectif', 'Einem anderen Ziel zuordnen', 'Lägg till under ett annat mål'],
    attach: ['Aggiungi', 'Add', 'Añadir', 'Ajouter', 'Hinzufügen', 'Lägg till'],
    detach: ['Stacca da', 'Detach from', 'Separar de', 'Détacher de', 'Lösen von', 'Koppla loss från'],
    howPrompt: ['Come ci arrivi? Scrivi un passo più concreto.', 'How will you get there? Write a more concrete step.', '¿Cómo llegarás? Escribe un paso más concreto.', 'Comment y arriveras-tu ? Écris une étape plus concrète.', 'Wie kommst du dahin? Schreibe einen konkreteren Schritt.', 'Hur tar du dig dit? Skriv ett mer konkret steg.'],
    alsoUnder: ['anche sotto', 'also under', 'también en', 'aussi sous', 'auch unter', 'även under'],
    subgoalsDone: ['sottobiettivi conclusi', 'sub-goals completed', 'subobjetivos completados', 'sous-objectifs terminés', 'Unterziele abgeschlossen', 'delmål klara'],
    showClosed: ['Mostra conclusi e archiviati', 'Show completed and archived', 'Mostrar completados y archivados', 'Afficher terminés et archivés', 'Abgeschlossene und archivierte anzeigen', 'Visa klara och arkiverade'],
    visibilityGain: ['Ora visibile anche ai docenti di:', 'Now also visible to teachers of:', 'Ahora visible también para el profesorado de:', 'Désormais visible aussi par les enseignants de :', 'Jetzt auch sichtbar für Lehrkräfte von:', 'Nu även synligt för lärare i:'],
    visibilityLoss: ['Non più visibile ai docenti di:', 'No longer visible to teachers of:', 'Ya no visible para el profesorado de:', 'Plus visible par les enseignants de :', 'Nicht mehr sichtbar für Lehrkräfte von:', 'Inte längre synligt för lärare i:'],
    visibilityConfirm: ['Questo cambia chi può vedere i tuoi obiettivi. Continuare?', 'This changes who can see your goals. Continue?', 'Esto cambia quién puede ver tus objetivos. ¿Continuar?', 'Cela change qui peut voir tes objectifs. Continuer ?', 'Das ändert, wer deine Ziele sehen kann. Fortfahren?', 'Detta ändrar vem som kan se dina mål. Fortsätta?'],
    inheritedShare: ['Visibile ai docenti di {group} tramite «{goal}»', 'Visible to teachers of {group} through “{goal}”', 'Visible para el profesorado de {group} a través de «{goal}»', 'Visible par les enseignants de {group} via « {goal} »', 'Sichtbar für Lehrkräfte von {group} über „{goal}“', 'Synligt för lärare i {group} via ”{goal}”'],
    deleteKeepsChildren: ['I suoi {n} sottobiettivi non verranno eliminati: perdono solo questo obiettivo superiore.', 'Its {n} sub-goals will not be deleted: they only lose this parent goal.', 'Sus {n} subobjetivos no se eliminarán: solo pierden este objetivo superior.', 'Ses {n} sous-objectifs ne seront pas supprimés : ils perdent seulement cet objectif parent.', 'Seine {n} Unterziele werden nicht gelöscht: Sie verlieren nur dieses übergeordnete Ziel.', 'Dess {n} delmål raderas inte: de förlorar bara detta överordnade mål.'],
    cycle: ['Non puoi collegarlo qui: creerebbe un cerchio tra obiettivi.', 'You cannot attach it here: it would create a loop between goals.', 'No puedes vincularlo aquí: crearía un ciclo entre objetivos.', 'Impossible de le rattacher ici : cela créerait une boucle entre objectifs.', 'Hier nicht möglich: Es entstünde ein Kreis zwischen Zielen.', 'Går inte här: det skulle skapa en slinga mellan mål.'],
    level: ['livello {n}', 'level {n}', 'nivel {n}', 'niveau {n}', 'Ebene {n}', 'nivå {n}'],
    viewList: ['Elenco', 'List', 'Lista', 'Liste', 'Liste', 'Lista'],
    viewMap: ['Mappa', 'Map', 'Mapa', 'Carte', 'Karte', 'Karta'],
    mapLabel: ['Mappa degli obiettivi. Lo stesso contenuto è nella vista Elenco.', 'Goal map. The same content is in the List view.', 'Mapa de objetivos. El mismo contenido está en la vista Lista.', 'Carte des objectifs. Le même contenu est dans la vue Liste.', 'Zielkarte. Derselbe Inhalt steht in der Listenansicht.', 'Målkarta. Samma innehåll finns i listvyn.'],
    close: ['Chiudi', 'Close', 'Cerrar', 'Fermer', 'Schließen', 'Stäng'],
    expand: ['Mostra sottobiettivi di', 'Show sub-goals of', 'Mostrar subobjetivos de', 'Afficher les sous-objectifs de', 'Unterziele anzeigen von', 'Visa delmål för'],
    collapse: ['Nascondi sottobiettivi di', 'Hide sub-goals of', 'Ocultar subobjetivos de', 'Masquer les sous-objectifs de', 'Unterziele ausblenden von', 'Dölj delmål för'],
```

In fondo al file:

```ts
export function goalFormat(lang: string, key: GoalTextKey, values: Record<string, string | number>): string {
    return goalText(lang, key).replace(/\{(\w+)\}/g, (match, name: string) => name in values ? String(values[name]) : match);
}
```

- [ ] **Step 2: Verify** — `cd frontend && npx tsc --noEmit -p . && npm run i18n:check`. Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/i18n-goals.ts
git commit -m "feat: add goal network texts in six languages"
```

---

### Task 7: Frontend — `GoalForm` e `GoalDialog`

**Files:**
- Create: `frontend/src/components/goals/GoalForm.tsx`
- Create: `frontend/src/components/goals/GoalDialog.tsx`

**Interfaces:**
- Consumes: Task 4 (`compareGoals, descendants, effectiveShares, progress, visibilityDelta`), Task 5 (`useDraftGuard`), Task 6 (chiavi + `goalFormat`), `GoalUI` esistente.
- Produces:
  - `GoalForm({ form, setForm, groups })` (stesso codice di oggi, spostato).
  - `type DialogTarget = { kind: 'edit'; id: number } | { kind: 'create'; parentId?: number; source?: CatalogEntry }`
  - `GoalDialog(props: { target: DialogTarget; goals: PersonalGoal[]; groups: GoalGroup[]; saved: boolean; onTarget(t: DialogTarget): void; onClose(): void; onSaved(row: PersonalGoal): void; onCreated(row: PersonalGoal): void; onDeleted(): void; onReload(): void })`

- [ ] **Step 1: `GoalForm.tsx`** — spostare la funzione `GoalForm` (righe 23-38 di `GoalsPanel.tsx`) in un file nuovo, esportata, con gli import che usa:

```tsx
'use client';
import { useI18n } from '@/lib/i18n-context';
import { goalText, type GoalTextKey } from '@/lib/i18n-goals';
import type { GoalFields, GoalGroup } from '@/lib/goals';
import { Field, input } from './GoalUI';

type FormProps = { form: GoalFields; setForm: (form: GoalFields) => void; groups: GoalGroup[] };
export function GoalForm({ form, setForm, groups }: FormProps) {
    // corpo identico a GoalsPanel.tsx righe 25-37
}
```

- [ ] **Step 2: `GoalDialog.tsx`**

```tsx
'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n-context';
import { goalFormat, goalText, type GoalTextKey } from '@/lib/i18n-goals';
import { blankGoal, goalApi, goalFields, GoalError, type CatalogEntry, type GoalFields, type GoalGroup, type GoalResource, type PersonalGoal } from '@/lib/goals';
import { compareGoals, descendants, effectiveShares, progress, visibilityDelta } from '@/lib/goal-network';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { GoalForm } from './GoalForm';
import { Field, GoalIssue, input, resourceLabel } from './GoalUI';

export type DialogTarget = { kind: 'edit'; id: number } | { kind: 'create'; parentId?: number; source?: CatalogEntry };
type Shared = { goals: PersonalGoal[]; groups: GoalGroup[]; onSaved: (row: PersonalGoal) => void; onCreated: (row: PersonalGoal) => void; onDeleted: () => void; onReload: () => void };
type Props = Shared & { target: DialogTarget; saved: boolean; onTarget: (target: DialogTarget) => void; onClose: () => void };

/** Modal on desktop, full-screen sheet on mobile. Unsaved work is confirmed before any exit. */
export function GoalDialog({ target, saved, onTarget, onClose, ...shared }: Props) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const dialog = useRef<HTMLDialogElement>(null); const dirty = useRef(false);
    const leave = (action: () => void) => { if (!dirty.current || window.confirm(l('discard'))) { dirty.current = false; action(); } };
    const onDirty = useCallback((value: boolean) => { dirty.current = value; }, []);
    useEffect(() => {
        const node = dialog.current; const opener = document.activeElement as HTMLElement | null;
        if (node && !node.open) node.showModal();
        return () => opener?.focus?.();
    }, []);
    const goal = target.kind === 'edit' ? shared.goals.find(row => row.id === target.id) : undefined;
    const title = goal?.title ?? (target.kind === 'create' && target.source ? l('adopt') : l('custom'));
    const bodyKey = target.kind === 'edit' ? `${target.id}-${goal?.revision}` : `new-${target.parentId ?? ''}-${target.source?.id ?? ''}`;
    return <dialog ref={dialog} aria-labelledby="goal-dialog-title"
        onCancel={event => { event.preventDefault(); leave(onClose); }}
        onClick={event => { if (event.target === dialog.current) leave(onClose); }}
        className="m-0 h-dvh max-h-none w-full max-w-none bg-white p-0 text-slate-900 backdrop:bg-slate-900/50 sm:m-auto sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-xl">
        <div className="flex h-full max-h-[inherit] flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 sm:px-6">
                <h2 id="goal-dialog-title" className="min-w-0 break-words text-xl font-bold">{title}</h2>
                <Button type="button" variant="ghost" aria-label={l('close')} onClick={() => leave(onClose)}><X className="h-5 w-5" aria-hidden /></Button>
            </div>
            {target.kind === 'edit' && !goal ? <p className="p-6">{l('unavailable')}</p>
                : <GoalDialogBody key={bodyKey} target={target} goal={goal} saved={saved} onDirty={onDirty}
                    onNavigate={next => leave(() => onTarget(next))} onRequestClose={() => leave(onClose)} {...shared}
                    onCreated={row => { dirty.current = false; shared.onCreated(row); }} />}
        </div>
    </dialog>;
}

type BodyProps = Shared & { target: DialogTarget; goal?: PersonalGoal; saved: boolean; onDirty: (dirty: boolean) => void; onNavigate: (target: DialogTarget) => void; onRequestClose: () => void };

function GoalDialogBody({ target, goal, goals, groups, saved, onDirty, onNavigate, onRequestClose, onSaved, onCreated, onDeleted, onReload }: BodyProps) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const source = target.kind === 'create' ? target.source : undefined;
    const parentId = target.kind === 'create' ? target.parentId : undefined;
    const initial = useMemo<GoalFields>(() => goal ? goalFields(goal) : { ...blankGoal, title: source?.data.title || '', criteria: source?.data.criteria || '' }, [goal, source]);
    const [form, setForm] = useState<GoalFields>(initial);
    const [action, setAction] = useState({ title: '', detail: '', date: '' });
    const [selection, setSelection] = useState(''); const [parentChoice, setParentChoice] = useState('');
    const [resources, setResources] = useState<GoalResource[]>([]); const [resourcesError, setResourcesError] = useState<unknown>(null);
    const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
    const actionRequest = useRef(''); const createRequest = useRef(crypto.randomUUID());
    const fieldsDirty = JSON.stringify(form) !== JSON.stringify(initial);
    // F06: every field the student typed counts, not only the goal form.
    const dirty = fieldsDirty || Boolean(action.title || action.detail || action.date || selection || parentChoice);
    useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
    useDraftGuard(dirty, l('discard'));
    const loadResources = useCallback(() => { void goalApi<GoalResource[]>('/user/goal-resources').then(rows => { setResources(rows); setResourcesError(null); }).catch(setResourcesError); }, []);
    useEffect(() => { if (goal) loadResources(); }, [goal, loadResources]);

    const byId = (id: number) => goals.find(row => row.id === id);
    const groupName = (id: number) => groups.find(group => group.id === id)?.name ?? `#${id}`;
    const confirmVisibility = (after: PersonalGoal[], ids: number[]) => {
        const { gained, lost } = visibilityDelta(goals, after, ids);
        if (!gained.length && !lost.length) return true;
        return window.confirm([gained.length ? `${l('visibilityGain')} ${gained.map(groupName).join(', ')}` : '', lost.length ? `${l('visibilityLoss')} ${lost.map(groupName).join(', ')}` : '', l('visibilityConfirm')].filter(Boolean).join('\n'));
    };
    const run = async (work: () => Promise<PersonalGoal>, done: (row: PersonalGoal) => void = onSaved) => {
        setBusy(true); setError(null);
        try { done(await work()); } catch (e) { setError(e); } finally { setBusy(false); }
    };
    const patched = (patch: Partial<PersonalGoal>) => goals.map(row => row.id === goal!.id ? { ...row, ...patch } : row);
    const base = goal ? `/user/goals/${goal.id}` : '';

    const submit = () => {
        if (!goal) return void run(() => goalApi<PersonalGoal>('/user/goals', 'POST', { ...form, parent_id: parentId ?? null, catalog_id: source?.id ?? null, catalog_version: source?.version ?? null, request_id: createRequest.current }), onCreated);
        if (!confirmVisibility(patched({ shared_group_id: form.shared_group_id }), [goal.id])) return;
        void run(() => goalApi<PersonalGoal>(base, 'PUT', form));
    };
    const attach = () => {
        const id = Number(parentChoice); if (!goal || !id) return;
        if (!confirmVisibility(patched({ parent_ids: [...goal.parent_ids, id] }), [goal.id])) return;
        void run(async () => { try { return await goalApi<PersonalGoal>(`${base}/parents`, 'POST', { parent_id: id, revision: goal.revision }); } catch (e) { if (e instanceof GoalError && e.status === 422) window.alert(l('cycle')); throw e; } });
    };
    const detach = (id: number) => {
        if (!goal || !confirmVisibility(patched({ parent_ids: goal.parent_ids.filter(p => p !== id) }), [goal.id])) return;
        void run(() => goalApi<PersonalGoal>(`${base}/parents/${id}?revision=${goal.revision}`, 'DELETE'));
    };
    const remove = async () => {
        if (!goal) return;
        const children = goals.filter(row => row.parent_ids.includes(goal.id));
        const after = goals.filter(row => row.id !== goal.id).map(row => ({ ...row, parent_ids: row.parent_ids.filter(p => p !== goal.id) }));
        const { lost } = visibilityDelta(goals, after, children.map(row => row.id));
        const message = [l('deleteConfirm'), children.length ? goalFormat(lang, 'deleteKeepsChildren', { n: children.length }) : '', lost.length ? `${l('visibilityLoss')} ${lost.map(groupName).join(', ')}` : ''].filter(Boolean).join('\n');
        if (!window.confirm(message)) return;
        setBusy(true);
        try { await goalApi(`${base}?revision=${goal.revision}`, 'DELETE'); onDirty(false); onDeleted(); } catch (e) { setError(e); } finally { setBusy(false); }
    };

    const parents = goal ? goal.parent_ids.map(byId).filter((row): row is PersonalGoal => Boolean(row)) : parentId && byId(parentId) ? [byId(parentId)!] : [];
    const children = goal ? goals.filter(row => row.parent_ids.includes(goal.id)).sort(compareGoals) : [];
    const blocked = goal ? new Set([goal.id, ...descendants(goals, goal.id), ...goal.parent_ids]) : new Set<number>();
    const candidates = goal ? goals.filter(row => !blocked.has(row.id)).sort(compareGoals) : [];
    const inherited = goal ? [...effectiveShares(goals, goal.id)].filter(([, from]) => from.id !== goal.id) : parentId ? [...effectiveShares(goals, parentId)] : [];
    const { done, total } = goal ? progress(goals, goal.id) : { done: 0, total: 0 };
    const available = goal ? resources.filter(r => !goal.links.some(link => link.kind === r.kind && link.target_id === r.target_id)) : [];
    const goalRow = (row: PersonalGoal, icon: React.ReactNode, extra?: React.ReactNode) => <li key={row.id} className="flex items-center gap-2 rounded-md bg-slate-50 px-2">
        {icon}<button type="button" className="min-h-11 min-w-0 flex-1 break-words text-left text-indigo-700 underline" onClick={() => onNavigate({ kind: 'edit', id: row.id })}>{row.title}</button>
        {row.status !== 'active' && <span className="text-xs text-slate-500">{l(row.status as GoalTextKey)}</span>}{extra}
    </li>;

    return <>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:px-6">
            {saved && <p role="status" className="text-indigo-700">{l('saved')}</p>}
            <GoalIssue error={error} lang={lang} retry={onReload} />
            {parents.length > 0 && <section className="space-y-2"><h3 className="font-bold">{l('servesTo')}</h3>
                <ul className="space-y-1">{parents.map(row => goalRow(row, <ArrowUp className="h-4 w-4 shrink-0" aria-hidden />, goal && <Button type="button" variant="ghost" disabled={busy || fieldsDirty} aria-label={`${l('detach')} ${row.title}`} onClick={() => detach(row.id)}><X className="h-4 w-4" aria-hidden /></Button>))}</ul>
            </section>}
            {goal && candidates.length > 0 && <div className="flex flex-wrap items-end gap-2"><div className="min-w-0 flex-1"><Field label={l('addParent')}><select className={input} disabled={busy || fieldsDirty} value={parentChoice} onChange={e => setParentChoice(e.target.value)}><option value="">—</option>{candidates.map(row => <option key={row.id} value={row.id}>{row.title.slice(0, 120)}</option>)}</select></Field></div><Button type="button" variant="secondary" disabled={!parentChoice || busy || fieldsDirty} onClick={attach}>{l('attach')}</Button></div>}
            {!goal && parentId && <p className="text-sm text-slate-600">{l('howPrompt')}</p>}
            {goal?.catalog_snapshot.data && <details className="rounded-md bg-slate-50 p-3 text-sm"><summary className="cursor-pointer py-1 font-semibold">{l('source')} · {l('version')} {goal.catalog_snapshot.version}</summary><p className="mt-2">{goal.catalog_snapshot.data.description}</p><p className="mt-2 whitespace-pre-wrap"><strong>{l('suggestions')}: </strong>{goal.catalog_snapshot.data.suggestions}</p></details>}
            <form id="goal-dialog-form" onSubmit={e => { e.preventDefault(); submit(); }}><fieldset disabled={busy} className="space-y-4">
                <GoalForm form={form} setForm={setForm} groups={groups} />
                {inherited.map(([group, from]) => <p key={group} className="text-sm text-slate-600">ℹ {goalFormat(lang, 'inheritedShare', { group: groupName(group), goal: from.title })}</p>)}
                {goal && <p className="text-sm text-slate-600">{l('doneHelp')}</p>}
            </fieldset></form>
            {goal && fieldsDirty && <p role="status" className="text-sm text-slate-600">{l('unsaved')}</p>}
            {goal && <section className="space-y-2"><h3 className="font-bold">{l('reachedBy')}{total > 0 && <span className="ml-2 text-sm font-normal text-slate-600">{done}/{total} {l('subgoalsDone')}</span>}</h3>
                <ul className="space-y-1">{children.map(row => goalRow(row, <ArrowDown className="h-4 w-4 shrink-0" aria-hidden />))}</ul>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => onNavigate({ kind: 'create', parentId: goal.id })}><Plus className="h-4 w-4" aria-hidden />{l('addSubgoal')}</Button>
            </section>}
            {goal && <details className="rounded-md border border-slate-200 p-3"><summary className="cursor-pointer py-2 font-semibold">{l('links')} · {goal.links.length}</summary>
                <div className="mt-3 space-y-3">
                    {goal.links.map(link => <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 p-3">
                        <div className="min-w-0 flex-1"><p className="text-xs text-slate-500">{resourceLabel(lang, link.kind)}{link.stage && ` · ${link.stage === 'done' ? l('completed') : link.stage === 'doing' ? l('active') : l('next')}`}{link.date && ` · ${link.date}`}</p>{link.available && link.href ? <Link className="break-words font-medium text-indigo-700 underline" href={link.href}>{link.title}</Link> : <span>{l('unavailable')}</span>}</div>
                        <Button type="button" variant="ghost" disabled={busy || fieldsDirty} onClick={() => void run(() => goalApi<PersonalGoal>(`${base}/links/${link.id}?revision=${goal.revision}`, 'DELETE'))}>{l('unlink')}</Button>
                    </div>)}
                    <GoalIssue error={resourcesError} lang={lang} retry={loadResources} />
                    <form onSubmit={e => { e.preventDefault(); const resource = available.find(r => `${r.kind}:${r.target_id}` === selection); if (resource) void run(() => goalApi<PersonalGoal>(`${base}/links`, 'POST', { kind: resource.kind, target_id: resource.target_id, revision: goal.revision })); }}>
                        <fieldset disabled={busy || fieldsDirty} className="flex flex-wrap items-end gap-2"><div className="min-w-0 flex-1"><Field label={l('pickResource')}><select required className={input} value={selection} onChange={e => setSelection(e.target.value)}><option value="">—</option>{available.map(r => <option key={`${r.kind}:${r.target_id}`} value={`${r.kind}:${r.target_id}`}>{resourceLabel(lang, r.kind)} · {r.title.slice(0, 120)}</option>)}</select></Field></div><Button type="submit" disabled={!selection}>{l('link')}</Button></fieldset>
                    </form>
                </div>
            </details>}
            {goal && <details className="rounded-md border border-slate-200 p-3"><summary className="cursor-pointer py-2 font-semibold">{l('createAction')}</summary>
                <form className="mt-3" onSubmit={e => { e.preventDefault(); actionRequest.current ||= crypto.randomUUID(); void run(() => goalApi<PersonalGoal>(`${base}/actions`, 'POST', { ...action, date: action.date || null, revision: goal.revision, request_id: actionRequest.current })); }}><fieldset disabled={busy || fieldsDirty} className="space-y-3">
                    <p className="text-sm text-slate-600">{l('actionHelp')}</p>
                    <Field label={l('actionTitle')}><input className={input} required maxLength={160} value={action.title} onChange={e => setAction({ ...action, title: e.target.value })} /></Field>
                    <Field label={l('detail')}><textarea className={input} maxLength={1000} value={action.detail} onChange={e => setAction({ ...action, detail: e.target.value })} /></Field>
                    <Field label={l('date')}><input className={input} type="date" value={action.date} onChange={e => setAction({ ...action, date: e.target.value })} /></Field>
                    <Button type="submit">{l('createAction')}</Button>
                </fieldset></form>
            </details>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white p-4 sm:px-6">
            {goal && <Button type="button" variant="ghost" disabled={busy || fieldsDirty} onClick={() => void remove()}>{l('delete')}</Button>}
            <div className="ml-auto flex gap-2"><Button type="button" variant="secondary" onClick={onRequestClose}>{l('cancel')}</Button><Button type="submit" form="goal-dialog-form" disabled={busy || (goal ? !fieldsDirty : !form.title.trim())}>{l('save')}</Button></div>
        </div>
    </>;
}
```

- [ ] **Step 3: Verify** — `cd frontend && npx tsc --noEmit -p . && npx eslint src/components/goals`. Expected: nessun errore (il componente non è ancora montato; il comportamento si verifica nel Task 11).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/goals/GoalForm.tsx frontend/src/components/goals/GoalDialog.tsx
git commit -m "feat: add goal dialog with network sections and full draft guard"
```

---

### Task 8: Frontend — elenco rientrato, catalogo in popup, pagina

**Files:**
- Create: `frontend/src/components/goals/GoalTree.tsx`
- Create: `frontend/src/components/goals/GoalCatalogDialog.tsx`
- Rewrite: `frontend/src/components/goals/GoalsPanel.tsx`
- Modify: `frontend/src/app/profilo/obiettivi/page.tsx`
- Create: `frontend/src/app/profilo/obiettivi/layout.tsx`

**Interfaces:**
- Consumes: `buildForest, effectiveShares, progress, TreeNode` (Task 4); `GoalDialog, DialogTarget` (Task 7); `goalFormat` (Task 6).
- Produces: `GoalTree({ goals, forest, groups, onOpen(id), onAddChild(id) })`; `GoalCatalogDialog({ catalog, onPick(entry), onClose() })`; `GoalsPanel()` accetta `?goal=<id>` e apre il popup; stato vista `'list' | 'map'` salvato in `localStorage['cb_goals_view']` (usato dal Task 9).

- [ ] **Step 1: `GoalTree.tsx`**

```tsx
'use client';
import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n-context';
import { goalFormat, goalText, type GoalTextKey } from '@/lib/i18n-goals';
import type { GoalGroup, PersonalGoal } from '@/lib/goals';
import { effectiveShares, progress, type TreeNode } from '@/lib/goal-network';

type Props = { goals: PersonalGoal[]; forest: TreeNode[]; groups: GoalGroup[]; onOpen: (id: number) => void; onAddChild: (id: number) => void };

/** Nested disclosure lists: later occurrences of a multi-parent goal start collapsed. */
export function GoalTree({ goals, forest, groups, onOpen, onAddChild }: Props) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const [flipped, setFlipped] = useState<Set<string>>(new Set());
    const flip = (key: string) => setFlipped(previous => { const next = new Set(previous); if (!next.delete(key)) next.add(key); return next; });
    const render = (node: TreeNode): ReactNode => {
        const goal = node.goal; const open = node.repeat === flipped.has(node.key);
        const { done, total } = progress(goals, goal.id);
        const shares = [...effectiveShares(goals, goal.id).keys()].map(id => groups.find(group => group.id === id)?.name ?? `#${id}`);
        return <li key={node.key} className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-slate-200 bg-white p-2 sm:p-3">
                {node.children.length > 0
                    ? <button type="button" aria-expanded={open} aria-label={`${l(open ? 'collapse' : 'expand')} ${goal.title}`} onClick={() => flip(node.key)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-slate-100">{open ? <ChevronDown className="h-5 w-5" aria-hidden /> : <ChevronRight className="h-5 w-5" aria-hidden />}</button>
                    : <span className="w-11 shrink-0" aria-hidden />}
                <button type="button" onClick={() => onOpen(goal.id)} className="min-h-11 min-w-0 flex-1 break-words text-left font-semibold hover:underline">{goal.title}</button>
                <span className="text-sm text-slate-600">{l(goal.status as GoalTextKey)}{goal.review_date && ` · ${l('reviewDate')}: ${goal.review_date}`}{total > 0 && ` · ${done}/${total} ${l('subgoalsDone')}`}</span>
                {shares.length > 0 && <span className="inline-flex items-center gap-1 text-sm text-slate-600"><Users className="h-4 w-4" aria-hidden /><span className="sr-only">{l('shared')}:</span>{shares.join(', ')}</span>}
                <Button type="button" variant="ghost" aria-label={`${l('addSubgoal')}: ${goal.title}`} onClick={() => onAddChild(goal.id)}><Plus className="h-5 w-5" aria-hidden /></Button>
                {node.otherParents.length > 0 && <p className="basis-full pl-13 text-xs text-slate-500">⧉ {l('alsoUnder')}: {node.otherParents.map(parent => parent.title).join(', ')}</p>}
                {node.depth >= 4 && <p className="basis-full pl-13 text-xs text-slate-500">↳ {goalFormat(lang, 'level', { n: node.depth + 1 })}</p>}
            </div>
            {open && node.children.length > 0 && <ul className={`space-y-1 ${node.depth < 3 ? 'pl-3 sm:pl-6' : ''}`}>{node.children.map(render)}</ul>}
        </li>;
    };
    return <ul className="space-y-2" aria-label={l('goals')}>{forest.map(render)}</ul>;
}
```

Verificare che la chiave `shared` esista in `i18n-goals.ts` (è in elenco: `shared`); se il testo non è adatto come etichetta, usare `share`.

- [ ] **Step 2: `GoalCatalogDialog.tsx`** — catalogo spostato da `GoalsPanel` (righe 104-108 attuali) dentro un `<dialog>`:

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n-context';
import { goalText, type GoalTextKey } from '@/lib/i18n-goals';
import type { CatalogEntry } from '@/lib/goals';
import { Field, input } from './GoalUI';

export function GoalCatalogDialog({ catalog, onPick, onClose }: { catalog: CatalogEntry[]; onPick: (entry: CatalogEntry) => void; onClose: () => void }) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const dialog = useRef<HTMLDialogElement>(null);
    const [search, setSearch] = useState(''); const [area, setArea] = useState('');
    useEffect(() => { const node = dialog.current; if (node && !node.open) node.showModal(); }, []);
    const entries = catalog.filter(row => (!area || row.data.area === area) && `${row.data.title} ${row.data.description} ${row.data.audience}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    return <dialog ref={dialog} aria-labelledby="goal-catalog-title" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === dialog.current) onClose(); }}
        className="m-0 h-dvh max-h-none w-full max-w-none bg-white p-0 text-slate-900 backdrop:bg-slate-900/50 sm:m-auto sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-xl">
        <div className="flex h-full max-h-[inherit] flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 sm:px-6"><h2 id="goal-catalog-title" className="text-xl font-bold">{l('catalog')}</h2><Button type="button" variant="ghost" aria-label={l('close')} onClick={onClose}><X className="h-5 w-5" aria-hidden /></Button></div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:px-6">
                <div className="grid gap-3 sm:grid-cols-2"><Field label={l('search')}><input className={input} value={search} onChange={e => setSearch(e.target.value)} /></Field><Field label={l('area')}><select className={input} value={area} onChange={e => setArea(e.target.value)}><option value="">{l('allAreas')}</option>{[...new Set(catalog.map(row => row.data.area).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}</select></Field></div>
                {!entries.length && <p>{l('noResults')}</p>}
                <div className="grid gap-4 md:grid-cols-2">{entries.map(entry => <article key={entry.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5"><p className="text-xs text-slate-500">{entry.data.area} · {entry.data.language.toUpperCase()}{entry.data.audience && ` · ${entry.data.audience}`}</p><h3 className="break-words text-lg font-bold" lang={entry.data.language}>{entry.data.title}</h3><p className="whitespace-pre-wrap text-sm text-slate-600" lang={entry.data.language}>{entry.data.description}</p>{entry.data.suggestions && <details className="text-sm"><summary className="cursor-pointer py-2">{l('suggestions')}</summary><p className="whitespace-pre-wrap" lang={entry.data.language}>{entry.data.suggestions}</p></details>}<Button type="button" variant="secondary" className="mt-auto self-start" onClick={() => onPick(entry)}>{l('adopt')}</Button></article>)}</div>
            </div>
        </div>
    </dialog>;
}
```

- [ ] **Step 3: Rewrite `GoalsPanel.tsx`**

```tsx
'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { List, Network, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n-context';
import { goalText, type GoalTextKey } from '@/lib/i18n-goals';
import { goalApi, type CatalogEntry, type GoalGroup, type PersonalGoal } from '@/lib/goals';
import { buildForest, visibleGoals } from '@/lib/goal-network';
import { GoalCatalogDialog } from './GoalCatalogDialog';
import { GoalDialog, type DialogTarget } from './GoalDialog';
import { GoalMap } from './GoalMap';
import { GoalTree } from './GoalTree';
import { GoalIssue } from './GoalUI';

const VIEW_KEY = 'cb_goals_view';
const readView = (): 'list' | 'map' => { try { return localStorage.getItem(VIEW_KEY) === 'map' ? 'map' : 'list'; } catch { return 'list'; } };

export function GoalsPanel() {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const [goals, setGoals] = useState<PersonalGoal[]>([]); const [catalog, setCatalog] = useState<CatalogEntry[]>([]); const [groups, setGroups] = useState<GoalGroup[]>([]);
    const [loading, setLoading] = useState(true); const [error, setError] = useState<unknown>(null);
    const [target, setTarget] = useState<DialogTarget | null>(null); const [catalogOpen, setCatalogOpen] = useState(false);
    const [saved, setSaved] = useState(false); const [showClosed, setShowClosed] = useState(false); const [view, setView] = useState<'list' | 'map'>('list');
    useEffect(() => { setView(readView()); }, []);
    const chooseView = (next: 'list' | 'map') => { setView(next); try { localStorage.setItem(VIEW_KEY, next); } catch { /* per-viewer convenience only */ } };
    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const [rows, entries, memberships] = await Promise.all([goalApi<PersonalGoal[]>('/user/goals'), goalApi<CatalogEntry[]>('/user/goal-catalog'), goalApi<GoalGroup[]>('/user/goal-groups')]);
            setGoals(rows); setCatalog(entries); setGroups(memberships);
        } catch (e) { setError(e); } finally { setLoading(false); }
    }, []);
    useEffect(() => {
        void load().then(() => {
            const requested = Number(new URLSearchParams(window.location.search).get('goal'));
            if (requested) setTarget({ kind: 'edit', id: requested });
        });
    }, [load]);
    const open = (next: DialogTarget) => { setSaved(false); setTarget(next); };
    const forest = useMemo(() => buildForest(goals, showClosed), [goals, showClosed]);
    const shown = useMemo(() => visibleGoals(goals, showClosed), [goals, showClosed]);
    const viewButton = (value: 'list' | 'map', icon: React.ReactNode, key: GoalTextKey) => <Button type="button" variant={view === value ? 'primary' : 'secondary'} aria-pressed={view === value} onClick={() => chooseView(value)}>{icon}{l(key)}</Button>;
    return <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => open({ kind: 'create' })}><Plus className="h-4 w-4" aria-hidden />{l('custom')}</Button>
            <Button type="button" variant="secondary" onClick={() => setCatalogOpen(true)}>{l('choose')}</Button>
            <label className="inline-flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} />{l('showClosed')}</label>
            <div className="ml-auto hidden gap-2 lg:flex">{viewButton('list', <List className="h-4 w-4" aria-hidden />, 'viewList')}{viewButton('map', <Network className="h-4 w-4" aria-hidden />, 'viewMap')}</div>
        </div>
        <GoalIssue error={error} lang={lang} retry={() => void load()} />
        {loading ? <p role="status">{l('loading')}</p> : <>
            {!goals.length && !error && <p className="py-3">{l('empty')}</p>}
            <div className={view === 'map' ? 'lg:hidden' : ''}><GoalTree goals={goals} forest={forest} groups={groups} onOpen={id => open({ kind: 'edit', id })} onAddChild={id => open({ kind: 'create', parentId: id })} /></div>
            {view === 'map' && goals.length > 0 && <GoalMap goals={shown} all={goals} onOpen={id => open({ kind: 'edit', id })} />}
            <Link className="block py-3 text-sm text-indigo-700 underline" href="/bussola">{l('unsure')}</Link>
        </>}
        {catalogOpen && <GoalCatalogDialog catalog={catalog} onClose={() => setCatalogOpen(false)} onPick={entry => { setCatalogOpen(false); open({ kind: 'create', source: entry }); }} />}
        {target && <GoalDialog target={target} goals={goals} groups={groups} saved={saved}
            onTarget={next => open(next)} onClose={() => setTarget(null)} onReload={() => void load()}
            onSaved={row => { setGoals(previous => previous.map(goal => goal.id === row.id ? row : goal)); setSaved(true); }}
            onCreated={row => { setGoals(previous => [row, ...previous]); setSaved(true); setTarget({ kind: 'edit', id: row.id }); }}
            onDeleted={() => { setTarget(null); void load(); }} />}
    </div>;
}
```

Fino al Task 9 creare uno stub `GoalMap.tsx` che esporta `export function GoalMap(_: { goals: PersonalGoal[]; all: PersonalGoal[]; onOpen: (id: number) => void }) { return null; }` per far compilare questo task.

- [ ] **Step 4: Pagina e metadata** — `frontend/src/app/profilo/obiettivi/page.tsx`:

```tsx
'use client';

import { PersonalAreaHeader } from '@/components/profile/PersonalAreaHeader';
import { GoalsPanel } from '@/components/goals/GoalsPanel';

export default function GoalsPage() {
    return (
        <main className="page-wide space-y-5 px-4 py-8">
            <PersonalAreaHeader slug="obiettivi" />
            <GoalsPanel />
        </main>
    );
}
```

`frontend/src/app/profilo/obiettivi/layout.tsx`:

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Obiettivi - CounselorBot',
    description: 'Obiettivi personali organizzati dal perché al come.',
};

export default function ProfiloObiettiviLayout({ children }: { children: React.ReactNode }) {
    return children;
}
```

In `PersonalAreaHeader.tsx` aggiornare il commento di riga 11: `// Used by Orientamento and Obiettivi. Editable pages need their exit guards before adoption.`

- [ ] **Step 5: Verify** — `cd frontend && npx tsc --noEmit -p . && npx eslint src/components/goals src/app/profilo/obiettivi && npm test`. Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/goals/GoalTree.tsx frontend/src/components/goals/GoalCatalogDialog.tsx frontend/src/components/goals/GoalsPanel.tsx frontend/src/components/goals/GoalMap.tsx frontend/src/app/profilo/obiettivi/page.tsx frontend/src/app/profilo/obiettivi/layout.tsx frontend/src/components/profile/PersonalAreaHeader.tsx
git commit -m "feat: show goals as an indented network with popup editing"
```

---

### Task 9: Frontend — mappa desktop

**Files:**
- Modify (sostituisce lo stub): `frontend/src/components/goals/GoalMap.tsx`

**Interfaces:**
- Consumes: `progress`, `effectiveShares` (Task 4); pattern di `components/tavolo/TavoloCanvas.tsx` righe 27-28, 67-75.
- Produces: `GoalMap({ goals, all, onOpen })` — `goals` = obiettivi visibili, `all` = rete completa (per progresso e condivisione).

- [ ] **Step 1: Implement**

```tsx
'use client';
import { memo, useMemo } from 'react';
import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Dagre from '@dagrejs/dagre';
import { useI18n } from '@/lib/i18n-context';
import { goalText, type GoalTextKey } from '@/lib/i18n-goals';
import type { PersonalGoal } from '@/lib/goals';
import { effectiveShares, progress } from '@/lib/goal-network';

type GoalNodeData = { goal: PersonalGoal; detail: string; shared: boolean; onOpen: (id: number) => void };
const WIDTH = 220; const HEIGHT = 76;

const GoalNode = memo(function GoalNode({ data }: NodeProps<Node<GoalNodeData>>) {
    return <div style={{ width: WIDTH }}>
        <Handle type="target" position={Position.Top} isConnectable={false} />
        <button type="button" onClick={() => data.onOpen(data.goal.id)} className="block w-full rounded-lg border border-slate-300 bg-white p-2 text-left shadow-sm hover:border-indigo-400 focus-visible:outline-2 focus-visible:outline-cyan-600">
            <span className="line-clamp-2 break-words text-sm font-semibold">{data.goal.title}</span>
            <span className="block text-xs text-slate-600">{data.detail}{data.shared && ' · 👥'}</span>
        </button>
        <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>;
});
const nodeTypes = { goal: GoalNode };

/** Desktop-only reading view: structure changes stay in the dialog, never by dragging. */
export function GoalMap({ goals, all, onOpen }: { goals: PersonalGoal[]; all: PersonalGoal[]; onOpen: (id: number) => void }) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const { nodes, edges } = useMemo(() => {
        const ids = new Set(goals.map(goal => goal.id));
        const layout = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
        layout.setGraph({ rankdir: 'TB', ranksep: 70, nodesep: 40 });
        goals.forEach(goal => layout.setNode(String(goal.id), { width: WIDTH, height: HEIGHT }));
        const edges: Edge[] = goals.flatMap(goal => goal.parent_ids.filter(parent => ids.has(parent)).map(parent => {
            layout.setEdge(String(parent), String(goal.id));
            return { id: `${parent}-${goal.id}`, source: String(parent), target: String(goal.id) };
        }));
        Dagre.layout(layout);
        const nodes: Node<GoalNodeData>[] = goals.map(goal => {
            const at = layout.node(String(goal.id)); const { done, total } = progress(all, goal.id);
            const detail = [l(goal.status as GoalTextKey), goal.review_date, total ? `${done}/${total}` : ''].filter(Boolean).join(' · ');
            return { id: String(goal.id), type: 'goal', position: { x: at.x - WIDTH / 2, y: at.y - HEIGHT / 2 }, data: { goal, detail, shared: effectiveShares(all, goal.id).size > 0, onOpen } };
        });
        return { nodes, edges };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- l depends only on lang
    }, [goals, all, lang, onOpen]);
    return <section aria-label={l('mapLabel')} className="hidden h-[70vh] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 lg:block">
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.2 }}
            nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} proOptions={{ hideAttribution: true }}>
            <Background /><Controls showInteractive={false} />
        </ReactFlow>
    </section>;
}
```

In `GoalsPanel.tsx` passare `onOpen` stabile: `const openGoal = useCallback((id: number) => { setSaved(false); setTarget({ kind: 'edit', id }); }, []);` e usarlo per `GoalMap` e `GoalTree`.

- [ ] **Step 2: Verify** — `cd frontend && npx tsc --noEmit -p . && npx eslint src/components/goals`. Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/goals/GoalMap.tsx frontend/src/components/goals/GoalsPanel.tsx
git commit -m "feat: add desktop-only goal map view"
```

---

### Task 10: Frontend — vista docente dei rami condivisi

**Files:**
- Modify: `frontend/src/components/goals/GoalCatalogEditor.tsx` (riga 11 tipo, riga 64 rendering)

**Interfaces:**
- Consumes: `orderBranches` (Task 4); `parent_ids` dalla risposta del Task 3.

- [ ] **Step 1: Implement** — riga 11:

```ts
type SharedGoal = { id: number; username: string; title: string; status: string; criteria: string; reflection: string; review_date: string | null; parent_ids: number[] };
```

importare `import { orderBranches } from '@/lib/goal-network';` e sostituire `{shared.map(row => <article key={row.id} className="space-y-2 rounded-lg bg-slate-50 p-4">` con:

```tsx
{orderBranches(shared).map(({ row, depth }) => <article key={row.id} style={{ marginInlineStart: `${Math.min(depth, 3) * 1.5}rem` }} className="space-y-2 rounded-lg bg-slate-50 p-4">
```

(il resto dell'`article` invariato).

- [ ] **Step 2: Verify** — `cd frontend && npx tsc --noEmit -p . && npx eslint src/components/goals/GoalCatalogEditor.tsx`. Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/goals/GoalCatalogEditor.tsx
git commit -m "feat: indent shared goal branches in teacher view"
```

---

### Task 11: Test browser

**Files:**
- Modify: `backend/tests/goals_browser_server.py` (elenco utenti)
- Modify: `frontend/tests/personal-goals.test.mjs`

**Interfaces:**
- Consumes: tutta l'interfaccia dei Task 7-10 (etichette dai testi italiani del Task 6).

Ambiente (tre terminali, dalla root):

```bash
# 1. fixture API su Postgres di test
set -a && . ./.env && set +a
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" GOALS_TEST_PORT=18096 python3 -m backend.tests.goals_browser_server
# 2. frontend di produzione su 3107
cd frontend && npm run build && npx next start -p 3107
# 3. test
cd frontend && npm run test:goals
```

- [ ] **Step 1: Fixture** — in `goals_browser_server.py` aggiungere `'student-network'` alla lista degli utenti.

- [ ] **Step 2: Adattare i test esistenti** in `personal-goals.test.mjs`:
  - Test «student goal…»: dopo `Salva` attendere `page.getByRole('dialog').getByRole('heading', { name: \`Studiare con un piano ${width}\` })`; attività, collegamento e asserzioni restano nel popup. Dopo `page.reload()` riaprire con `page.getByRole('button', { name: \`Studiare con un piano ${width}\`, exact: true }).click()`.
  - Test lingue: i titoli attesi diventano quelli dell'Area personale: `['en','Goals'], ['es','Objetivos'], ['fr','Objectifs'], ['de','Ziele'], ['sv','Mål']`.
  - Test «stale edits…»: sostituire il clic su «Scegli dal catalogo» (ora inerte dietro il popup modale) con:

```js
        page.once('dialog', dialog => dialog.dismiss());
        await page.keyboard.press('Escape');
        assert.equal(await page.getByLabel('Perché conta per me', { exact: true }).inputValue(), 'Questa modifica deve restare.');
```

- [ ] **Step 3: Nuovi test** (in fondo al file)

```js
test('goals form a network with sub-goals, extra parents and inherited sharing', async () => {
    const username = 'student-network';
    const { page, context, errors } = await fixture({ username });
    const create = async (title, share) => {
        await page.getByRole('button', { name: 'Scrivi il tuo obiettivo', exact: true }).click();
        await page.getByLabel('Obiettivo', { exact: true }).fill(title);
        if (share) await page.getByLabel('Condividi il riepilogo con i docenti di').selectOption({ label: 'Gruppo di prova' });
        await page.getByRole('button', { name: 'Salva', exact: true }).click();
        await page.getByRole('dialog').getByRole('heading', { name: title, exact: true }).waitFor();
        await page.getByRole('button', { name: 'Chiudi', exact: true }).click();
    };
    try {
        await page.goto(`${origin}/profilo/obiettivi`);
        await page.getByRole('heading', { name: 'Obiettivi', exact: true, level: 1 }).waitFor();
        await create('Erasmus in Spagna', true);
        await create('Laurea in lingue');
        await page.getByRole('button', { name: 'Aggiungi sottobiettivo: Erasmus in Spagna', exact: true }).click();
        await page.getByText('Come ci arrivi? Scrivi un passo più concreto.').waitFor();
        await page.getByText('Visibile ai docenti di Gruppo di prova tramite «Erasmus in Spagna»').waitFor();
        await page.getByLabel('Obiettivo', { exact: true }).fill('Migliorare l’inglese');
        await page.getByRole('button', { name: 'Salva', exact: true }).click();
        await page.getByRole('dialog').getByRole('heading', { name: 'Migliorare l’inglese', exact: true }).waitFor();
        await page.getByLabel('Aggiungi a un altro obiettivo').selectOption({ label: 'Laurea in lingue' });
        await page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Laurea in lingue', exact: true }).waitFor();
        let message = '';
        page.once('dialog', dialog => { message = dialog.message(); void dialog.accept(); });
        await page.getByRole('button', { name: 'Stacca da Erasmus in Spagna', exact: true }).click();
        await page.getByRole('button', { name: 'Stacca da Erasmus in Spagna', exact: true }).waitFor({ state: 'detached' });
        assert.match(message, /Non più visibile ai docenti di: Gruppo di prova/);
        await page.getByLabel('Aggiungi a un altro obiettivo').selectOption({ label: 'Erasmus in Spagna' });
        page.once('dialog', dialog => { message = dialog.message(); void dialog.accept(); });
        await page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
        await page.getByRole('button', { name: 'Stacca da Erasmus in Spagna', exact: true }).waitFor();
        assert.match(message, /Ora visibile anche ai docenti di: Gruppo di prova/);
        await page.getByRole('button', { name: 'Chiudi', exact: true }).click();
        await page.getByText(/⧉ anche sotto: /).first().waitFor();
        const rows = await (await fetch(`${api}/user/goals`, { headers: { 'x-test-user': username } })).json();
        assert.equal(rows.find(r => r.title === 'Migliorare l’inglese').parent_ids.length, 2);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: '/tmp/personal-goals-network.png', fullPage: true });
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

test('F06: text in a new activity is protected on every exit from the dialog', async () => {
    const { page, context, errors } = await fixture({ username: 'student-network' });
    try {
        await page.goto(`${origin}/profilo`);
        await page.getByRole('link', { name: 'Obiettivi', exact: true }).click();
        await page.getByRole('button', { name: 'Laurea in lingue', exact: true }).first().click();
        await page.getByText('Aggiungi un’attività', { exact: true }).first().click();
        await page.getByLabel('Cosa farò').fill('Frase non ancora salvata');
        for (const exit of [() => page.keyboard.press('Escape'), () => page.getByRole('button', { name: 'Chiudi', exact: true }).click(), () => page.getByRole('button', { name: 'Annulla', exact: true }).click(), () => page.goBack()]) {
            page.once('dialog', dialog => dialog.dismiss());
            await exit();
            await page.getByLabel('Cosa farò').waitFor();
            assert.equal(await page.getByLabel('Cosa farò').inputValue(), 'Frase non ancora salvata');
        }
        page.once('dialog', dialog => dialog.accept());
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        assert.deepEqual(errors, []);
    } finally { await context.close(); }
});

for (const width of [1280, 390]) {
    test(`map view is desktop-only at ${width}px`, async () => {
        const { page, context, errors } = await fixture({ username: 'student-network', width });
        try {
            await page.goto(`${origin}/profilo/obiettivi`);
            await page.getByRole('button', { name: 'Laurea in lingue', exact: true }).first().waitFor();
            const toggle = page.getByRole('button', { name: 'Mappa', exact: true });
            if (width < 1024) { assert.equal(await toggle.isVisible(), false); return; }
            await toggle.click();
            const map = page.getByRole('region', { name: /Mappa degli obiettivi/ });
            await map.waitFor();
            assert.equal(await map.getByRole('button', { name: /Migliorare l’inglese/ }).count(), 1);
            assert.equal(await map.locator('.react-flow__edge').count(), 2);
            await map.getByRole('button', { name: /Migliorare l’inglese/ }).click();
            await page.getByRole('dialog').getByRole('heading', { name: 'Migliorare l’inglese', exact: true }).waitFor();
            await page.screenshot({ path: '/tmp/personal-goals-map.png' });
            assert.deepEqual(errors, []);
        } finally { await context.close(); }
    });
}
```

- [ ] **Step 4: Run** — ambiente sopra, poi `npm run test:goals`. Expected: tutti PASS. Se un test fallisce, correggere il componente (non l'asserzione) salvo errore dimostrabile nel test.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/goals_browser_server.py frontend/tests/personal-goals.test.mjs
git commit -m "test: cover goal network, dialog draft guard and map in browser"
```

---

### Task 12: Documentazione, verifica finale, rilascio

**Files:**
- Modify: `docs/plans/2026-09-24-obiettivi-rete-design.md` (§6 `GoalTree`: pattern disclosure invece di `role="tree"`; §8 test tastiera)
- Modify: `docs-counselorbot/funzionalita-counselorbot.md` (riga 149)
- Modify: `area-personale-handoff.md`

- [ ] **Step 1: Spec** — nella tabella §6 sostituire la cella di `GoalTree.tsx` con: «Liste annidate con pulsanti di apertura (`aria-expanded`), Tab tra gli elementi, Invio apre il popup. Seconda occorrenza…» (resto invariato); in §8 sostituire «frecce nell'albero» con «Tab tra righe e pulsanti di apertura».

- [ ] **Step 2: Documentazione funzionalità** — riga 149:

```markdown
| Obiettivi | `/profilo/obiettivi` | Organizzare gli obiettivi in una rete, dal perché al come: sopraobiettivi e sottobiettivi, anche con più genitori; modificarli in un popup; adottare proposte del catalogo; collegare lavori e attività; condividere un ramo con i docenti di un gruppo. Su computer anche vista mappa. |
```

Poi `make guidance-check` (se segnala contenuti non allineati: `make guidance-refresh` e ricontrollare). Guida e catture Obiettivi nelle 6 lingue: individuare lo script delle catture con `grep -rln "profilo/obiettivi" scripts docs frontend/public | head` e rigenerare solo le immagini Obiettivi; se lo script non esiste, segnalarlo nell'handoff come lavoro aperto invece di improvvisarlo.

- [ ] **Step 3: Verifica completa**

```bash
set -a && . ./.env && set +a
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" python3 -m pytest backend/tests/test_goals.py -q
cd frontend && npm test && npx tsc --noEmit -p . && npm run lint && npm run build
```

Expected: tutto verde. Riportare esattamente eventuali fallimenti preesistenti (vedi memoria test Postgres).

- [ ] **Step 4: Handoff** — in `area-personale-handoff.md` segnare la voce 24/09 Obiettivi come completata: rete + popup + mappa desktop + F06 su Obiettivi, con riferimento a spec e piano; F06 resta aperto per Libretto, Portfolio, strumenti visuali e calendario (lotto 1A).

- [ ] **Step 5: Commit**

```bash
git add docs/plans/2026-09-24-obiettivi-rete-design.md docs-counselorbot/funzionalita-counselorbot.md area-personale-handoff.md
git commit -m "docs: describe goal network page and close Obiettivi step"
```

(aggiungere per nome anche i file rigenerati da `guidance-refresh`, se presenti).

- [ ] **Step 6: Rilascio — chiedere prima all'utente.** Solo dopo conferma: `docker compose up -d --build backend frontend`, poi `docker compose ps` e `docker compose logs --tail=50 backend frontend` (nessun traceback; tabella `goal_edges` creata all'avvio). Infine `git push -u origin feature/goal-network`.
