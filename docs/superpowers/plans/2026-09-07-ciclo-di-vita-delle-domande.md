# Ciclo di vita delle domande — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una domanda del counselor rimasta senza risposta smette di sparire in silenzio: si registra da quale fase viene, decade quando la conversazione l'ha superata, si chiude quando lo studente ha risposto nel discorso, e il counselor riceve tre regole diverse per i tre casi.

**Architecture:** Lo stato vive nel payload della riga `RecommendationHistory` che già registra ogni domanda dichiarata dal counselor. Una regola deterministica nel ledger manda in `stale` le domande superate; il `thread_guard` — il giudice async che gira già a ogni turno — chiude quelle a cui lo studente ha risposto parlando. Il ledger legge il registro invece della regex sull'ultima risposta e produce tre righe con tre direttive. La sidebar mostra i quattro stati.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, Postgres, pytest; Next.js 16 + TypeScript, `node --test`.

**Spec:** [`docs/superpowers/specs/2026-09-07-ciclo-di-vita-delle-domande-design.md`](../specs/2026-09-07-ciclo-di-vita-delle-domande-design.md)

## Global Constraints

- Branch: `feature/question-lifecycle`, creato da `main`. Mai commit diretti su `main`.
- I test backend girano su Postgres reale, mai SQLite. Comando (da radice repo):
  ```bash
  set -a && . ./.env && set +a
  export SESSION_MEMORY_DIR=/tmp/cb-tests
  DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" \
    python3 -m pytest backend/tests/<file> -q
  ```
  `SESSION_MEMORY_DIR` serve perché `session_memory/` nel checkout è di root (bind mount): senza, ~30 test falliscono con `PermissionError` che non c'entrano nulla.
- Il codice backend **non** è montato nel container: `docker exec … pytest` gira il codice dell'immagine. Testare sull'host; ricostruire (`docker compose up -d --build backend frontend`) solo alla fine.
- Test frontend: `cd frontend && npm test` (e `npx tsc --noEmit`).
- Sei lingue per ogni testo rivolto allo studente: `it, en, es, fr, de, sv`.
- Stati esistenti da non rompere: `proposed, selected, tried, dismissed, closed` restano validi per letture e strategie.
- Commenti nel codice: si scrivono nella lingua del file che si modifica (i moduli toccati sono misti italiano/inglese — seguire il file, non una regola globale).
- Nessuna migrazione: tutto vive in `RecommendationHistory.payload` (JSON). Le righe scritte prima leggono i default.

---

### Task 1: Il registro — stati, chi ha chiuso, quale fase

**Files:**
- Modify: `backend/recommendation_service.py:34-35` (costanti), `:145-176` (`set_state`), `:262-270` (`_state_fields`)
- Modify: `backend/routes/chat.py:372-383` (firma `_record_recommendations`), `:445-449` (registrazione note), `:638-651` e `:971-984` (chiamate), `:1253-1264` (endpoint PATCH)
- Test: `backend/tests/test_recommendation_state.py`

**Interfaces:**
- Consumes: niente (primo task).
- Produces:
  - `recommendation_service.QUESTION_STATUSES = ("proposed", "closed", "stale")`
  - `recommendation_service.CLOSED_BY = ("student", "conversation")`
  - `recommendation_service.set_state(db, *, session_id: str, username: str, recommendation_type: str, slug: str, status: str | None = None, helpful=UNSET, closed_by=UNSET, revived=UNSET) -> models.RecommendationHistory | None`
  - Chiavi di payload lette dai task successivi: `status`, `closed_by` (`"student" | "conversation" | None`), `revived` (`bool`), `step_id` (`str`), `step_order` (`int | None`).

- [ ] **Step 1: Scrivi i test che falliscono**

In `backend/tests/test_recommendation_state.py`, in fondo al file:

```python
def _question(db, slug='note-q', turn=1, step_id='affective', step_order=2):
    service.record(
        db, session_id='fixture', username='alice', recommendation_type='advice',
        payloads=[{'slug': slug, 'name': 'Che cosa cambieresti?', 'kind': 'question',
                   'step_id': step_id, 'step_order': step_order}],
        turn_index=turn,
    )


def _advice_item(db, slug='note-q'):
    entries = service.list_for_session(db, session_id='fixture', username='alice')['advice']
    return next(item for item in entries if item['slug'] == slug)


def test_only_a_question_can_be_retired(db):
    _question(db)
    service.set_state(db, session_id='fixture', username='alice',
                      recommendation_type='advice', slug='note-q', status='stale')
    item = _advice_item(db)
    assert item['status'] == 'stale'
    assert item['step_id'] == 'affective' and item['step_order'] == 2
    with pytest.raises(ValueError):
        service.set_state(db, session_id='fixture', username='alice',
                          recommendation_type='strategy', slug='active', status='stale')


def test_who_closed_the_question_is_recorded_and_cleared_on_reopen(db):
    _question(db)
    service.set_state(db, session_id='fixture', username='alice', recommendation_type='advice',
                      slug='note-q', status='closed', closed_by='conversation')
    assert _advice_item(db)['closed_by'] == 'conversation'
    # Riaperta dallo studente: chi l'aveva chiusa non conta piu', e la domanda
    # e' sottratta alla regola di decadenza.
    service.set_state(db, session_id='fixture', username='alice', recommendation_type='advice',
                      slug='note-q', status='proposed', revived=True)
    item = _advice_item(db)
    assert item['status'] == 'proposed' and item['closed_by'] is None and item['revived'] is True


def test_an_unknown_closer_is_refused(db):
    _question(db)
    with pytest.raises(ValueError):
        service.set_state(db, session_id='fixture', username='alice', recommendation_type='advice',
                          slug='note-q', status='closed', closed_by='counselor')


def test_the_students_own_close_is_attributed_to_the_student(db):
    _question(db)
    result = asyncio.run(update_session_recommendation(
        session_id='fixture', recommendation_type='advice', slug='note-q',
        update=RecommendationStateUpdate(status='closed'), db=db, identity={'username': 'alice'},
    ))
    item = next(entry for entry in result['advice'] if entry['slug'] == 'note-q')
    assert item['status'] == 'closed' and item['closed_by'] == 'student'
    result = asyncio.run(update_session_recommendation(
        session_id='fixture', recommendation_type='advice', slug='note-q',
        update=RecommendationStateUpdate(status='proposed'), db=db, identity={'username': 'alice'},
    ))
    item = next(entry for entry in result['advice'] if entry['slug'] == 'note-q')
    assert item['closed_by'] is None and item['revived'] is True


def test_state_survives_the_same_question_declared_again(db):
    _question(db)
    service.set_state(db, session_id='fixture', username='alice', recommendation_type='advice',
                      slug='note-q', status='closed', closed_by='conversation')
    _question(db, turn=5, step_id='cognitive', step_order=1)
    item = _advice_item(db)
    # Lo stato e' dello studente e resta; la fase e' del turno e si aggiorna.
    assert item['status'] == 'closed' and item['closed_by'] == 'conversation'
    assert item['step_id'] == 'cognitive' and item['step_order'] == 1
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

```bash
set -a && . ./.env && set +a
export SESSION_MEMORY_DIR=/tmp/cb-tests
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" \
  python3 -m pytest backend/tests/test_recommendation_state.py -q
```
Atteso: FAIL — `set_state() got an unexpected keyword argument 'closed_by'`, e `Stato non valido: stale`.

- [ ] **Step 3: Allarga stati e campi in `recommendation_service.py`**

Costanti (sostituisci le righe 34-35):

```python
# `proposed` = mostrata dal counselor; le altre le sceglie lo studente.
RECOMMENDATION_STATUSES = ("proposed", "selected", "tried", "dismissed", "closed", "stale")
DEFAULT_STATUS = "proposed"
# Una domanda ha una vita sua: aperta, chiusa (da qualcuno) o decaduta.
QUESTION_STATUSES = ("proposed", "closed", "stale")
CLOSED_BY = ("student", "conversation")
```

`_state_fields` (sostituisci il corpo):

```python
def _state_fields(source: dict | None) -> dict:
    """Stato e giudizio normalizzati; quello che non c'e' legge il default."""
    source = source or {}
    status = source.get("status")
    helpful = source.get("helpful")
    closed_by = source.get("closed_by")
    return {
        "status": status if status in RECOMMENDATION_STATUSES else DEFAULT_STATUS,
        "helpful": helpful if isinstance(helpful, bool) else None,
        # Chi ha chiuso la domanda, e se lo studente l'ha rimessa in vita: senza,
        # `_carry_over` li perderebbe alla prima ridichiarazione dello stesso slug.
        "closed_by": closed_by if closed_by in CLOSED_BY else None,
        "revived": bool(source.get("revived")),
    }
```

`set_state`: firma e validazioni.

```python
def set_state(
    db: Session,
    *,
    session_id: str,
    username: str,
    recommendation_type: str,
    slug: str,
    status: str | None = None,
    helpful=UNSET,
    closed_by=UNSET,
    revived=UNSET,
) -> models.RecommendationHistory | None:
```

Dentro, dopo aver letto `payload` e prima di `payload.update(_state_fields(payload))`, sostituisci le due validazioni esistenti con:

```python
    is_question = payload.get("kind") == "question"
    if is_question and status is not None and status not in QUESTION_STATUSES:
        raise ValueError("Question status must be proposed, closed or stale")
    if status in ("closed", "stale") and not is_question:
        raise ValueError("Only a question can be closed or retired")
    if closed_by is not UNSET:
        if closed_by is not None and closed_by not in CLOSED_BY:
            raise ValueError(f"Chi ha chiuso non e' valido: {closed_by}")
        payload["closed_by"] = closed_by
    if revived is not UNSET:
        payload["revived"] = bool(revived)
    if status is not None:
        payload["status"] = status
        # Una domanda che torna aperta non ha piu' nessuno che l'ha chiusa.
        if status != "closed":
            payload["closed_by"] = None
```

- [ ] **Step 4: Registra fase e numero di fase sulla nota**

In `backend/routes/chat.py`, firma di `_record_recommendations` (riga 372): aggiungi due parametri in coda, dopo `notes`:

```python
    notes: list[dict] | None = None,
    step_id: str | None = None,
    step_order: int | None = None,
) -> dict[str, list[dict]]:
```

E la registrazione delle note (riga ~445):

```python
    if notes:
        # La domanda porta con se' la fase in cui e' nata: `step_id` serve alla
        # regola di decadenza, il numero a dire di che fase si tratta.
        stamped = [{**note, "step_id": step_id or "", "step_order": step_order} for note in notes]
        _recommendation_service.record(
            db, session_id=session_id, username=username,
            recommendation_type="advice", payloads=stamped, turn_index=turn_index,
        )
```

Entrambe le chiamate (righe ~638 e ~971) passano i due valori. `step` è già in scope in tutti e due i punti (`db.query(models.GuidedStep)…first()` alle righe 467 e 689):

```python
        matched_on=recommendation_meta,
        turn_index=max(0, len(session_memory.get_transcript(session_id)) - 1),
        step_id=request.phase or "",
        step_order=step.sort_order if step else None,
    )
```

- [ ] **Step 5: L'endpoint attribuisce la chiusura allo studente**

`backend/routes/chat.py`, dentro `update_session_recommendation` (riga ~1256):

```python
    status = fields.get("status")
    try:
        row = _recommendation_service.set_state(
            db,
            session_id=session_id,
            username=username,
            recommendation_type=recommendation_type,
            slug=slug,
            status=status,
            helpful=fields["helpful"] if "helpful" in fields else _recommendation_service.UNSET,
            # Da qui passa solo lo studente: il giudice chiama `set_state` diretto.
            closed_by="student" if status == "closed" else _recommendation_service.UNSET,
            revived=True if status == "proposed" else _recommendation_service.UNSET,
        )
```

(`revived` su una lettura o una strategia è un campo inerte: nessuno lo legge.)

- [ ] **Step 6: Esegui i test e verifica che passino**

```bash
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" \
  python3 -m pytest backend/tests/test_recommendation_state.py backend/tests/test_recommendations.py backend/tests/test_session_notes_chat.py -q
```
Atteso: PASS su tutti e tre (gli altri due file toccano lo stesso registro e sono la rete di sicurezza).

- [ ] **Step 7: Commit**

```bash
git add backend/recommendation_service.py backend/routes/chat.py backend/tests/test_recommendation_state.py
git commit -m "feat: record who closed a question, and which step it came from"
```

---

### Task 2: La decadenza, deterministica

**Files:**
- Modify: `backend/session_ledger.py:39-40` (costante), aggiunta di due funzioni in coda alla sezione helper
- Modify: `backend/chat_preparation.py:1-16` (import), `:358-366` (chiamata prima del ledger)
- Test: `backend/tests/test_session_ledger.py`

**Interfaces:**
- Consumes: `recommendation_service.set_state(..., status="stale")`, chiavi payload `status`, `revived`, `step_id`, `step_order` (Task 1).
- Produces:
  - `session_ledger.QUESTION_MAX_AGE = 3`
  - `session_ledger.retire_stale_questions(db, *, session_id: str, username: str, step_id: str | None, turn_index: int) -> list[str]` — ritorna gli slug mandati in `stale`.
  - `session_ledger.questions(db, *, session_id: str, username: str, step_id: str | None) -> dict[str, list[dict]]` con chiavi `open`, `answered_in_talk`, `left_behind`; ogni voce è `{"text": str, "step_order": int | None}`.
  - `session_ledger.question_rows(db, *, session_id: str, username: str) -> list[models.RecommendationHistory]` — le righe che sono domande, dalla più vecchia.

- [ ] **Step 1: Scrivi i test che falliscono**

In `backend/tests/test_session_ledger.py`, in fondo:

```python
from backend import recommendation_service


def _note(db, slug, *, text, step_id, step_order, turn, status='proposed', closed_by=None):
    recommendation_service.record(
        db, session_id=SESSION, username=STUDENT, recommendation_type='advice',
        payloads=[{'slug': slug, 'name': text, 'kind': 'question',
                   'step_id': step_id, 'step_order': step_order}],
        turn_index=turn,
    )
    if status != 'proposed':
        recommendation_service.set_state(
            db, session_id=SESSION, username=STUDENT, recommendation_type='advice',
            slug=slug, status=status,
            closed_by=closed_by if closed_by else recommendation_service.UNSET,
        )


def test_a_question_from_another_step_is_retired(db):
    _note(db, 'q-old', text='Quando un risultato ti delude, che cosa prevale?',
          step_id='affective', step_order=2, turn=1)
    retired = session_ledger.retire_stale_questions(
        db, session_id=SESSION, username=STUDENT, step_id='cognitive', turn_index=2)
    assert retired == ['q-old']
    assert session_ledger.questions(
        db, session_id=SESSION, username=STUDENT, step_id='cognitive')['left_behind'][0]['step_order'] == 2


def test_a_question_older_than_the_age_is_retired_in_its_own_step(db):
    _note(db, 'q-aged', text='Che cosa cambieresti?', step_id='cognitive', step_order=1, turn=1)
    assert session_ledger.retire_stale_questions(
        db, session_id=SESSION, username=STUDENT, step_id='cognitive',
        turn_index=1 + session_ledger.QUESTION_MAX_AGE) == []
    assert session_ledger.retire_stale_questions(
        db, session_id=SESSION, username=STUDENT, step_id='cognitive',
        turn_index=2 + session_ledger.QUESTION_MAX_AGE) == ['q-aged']


def test_a_closed_question_never_decays_and_a_revived_one_is_spared(db):
    _note(db, 'q-closed', text='Chiusa?', step_id='affective', step_order=2, turn=1,
          status='closed', closed_by='student')
    _note(db, 'q-revived', text='Ripresa?', step_id='affective', step_order=2, turn=1)
    recommendation_service.set_state(
        db, session_id=SESSION, username=STUDENT, recommendation_type='advice',
        slug='q-revived', status='proposed', revived=True)
    assert session_ledger.retire_stale_questions(
        db, session_id=SESSION, username=STUDENT, step_id='cognitive', turn_index=9) == []


def test_retiring_twice_writes_nothing_the_second_time(db):
    _note(db, 'q-old', text='Superata?', step_id='affective', step_order=2, turn=1)
    assert session_ledger.retire_stale_questions(
        db, session_id=SESSION, username=STUDENT, step_id='cognitive', turn_index=2) == ['q-old']
    assert session_ledger.retire_stale_questions(
        db, session_id=SESSION, username=STUDENT, step_id='cognitive', turn_index=2) == []


def test_questions_are_read_by_their_recorded_state(db):
    _note(db, 'q-open', text='Aperta?', step_id='cognitive', step_order=1, turn=4)
    _note(db, 'q-talk', text='Gia risposta?', step_id='cognitive', step_order=1, turn=2,
          status='closed', closed_by='conversation')
    _note(db, 'q-mine', text='Chiusa da me?', step_id='cognitive', step_order=1, turn=2,
          status='closed', closed_by='student')
    _note(db, 'q-gone', text='Rimasta indietro?', step_id='affective', step_order=2, turn=1,
          status='stale')
    buckets = session_ledger.questions(db, session_id=SESSION, username=STUDENT, step_id='cognitive')
    assert [item['text'] for item in buckets['open']] == ['Aperta?']
    assert [item['text'] for item in buckets['answered_in_talk']] == ['Gia risposta?']
    assert [item['text'] for item in buckets['left_behind']] == ['Rimasta indietro?']
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

```bash
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" \
  python3 -m pytest backend/tests/test_session_ledger.py -q -k "retire or questions_are_read"
```
Atteso: FAIL con `AttributeError: module 'backend.session_ledger' has no attribute 'retire_stale_questions'`.

- [ ] **Step 3: Implementa lettura e ritiro in `session_ledger.py`**

Sostituisci la costante `OPEN_QUESTION_MAX_AGE = 2` (righe 39-40) con:

```python
# Oltre questi turni la conversazione ha superato la domanda: decade, e la
# decadenza e' un fatto registrato, non una sparizione.
QUESTION_MAX_AGE = 3
MAX_LEDGER_QUESTIONS = 2
```

Aggiungi l'import in cima, accanto a `from . import models`:

```python
from . import models, recommendation_service
```

E in coda alla sezione helper:

```python
def question_rows(db, *, session_id: str, username: str) -> list:
    """Le righe di registro che sono domande, dalla piu' vecchia. Pubblica perche'
    la legge anche `thread_guard` per numerare le domande al giudice."""
    rows = db.query(models.RecommendationHistory).filter(
        models.RecommendationHistory.recommendation_type == "advice",
        models.RecommendationHistory.session_id == session_id,
        models.RecommendationHistory.username == username,
    ).order_by(models.RecommendationHistory.turn_index.asc().nulls_last(),
               models.RecommendationHistory.created_at.asc()).all()
    return [row for row in rows if (row.payload or {}).get("kind") == "question"]


def _decayed(payload: dict, turn_index: int | None, *, step_id: str | None, current_turn: int) -> bool:
    """Superata dalla conversazione: la fase e' cambiata, o e' passato troppo.

    Chi l'ha riaperta l'ha voluta viva: il click dello studente non puo' essere
    annullato dalla prima costruzione del ledger che segue.
    """
    if payload.get("revived"):
        return False
    asked_in = (payload.get("step_id") or "").strip()
    if step_id and asked_in and asked_in != step_id:
        return True
    return current_turn - (turn_index or 0) > QUESTION_MAX_AGE


def retire_stale_questions(db, *, session_id: str, username: str,
                           step_id: str | None, turn_index: int) -> list[str]:
    """Manda in `stale` le domande che la conversazione ha superato.

    Si scrive invece di calcolare: se restasse un calcolo, la sidebar mostrerebbe
    "aperta" una domanda che il modello ha gia' lasciato andare.
    """
    if not session_id or not username:
        return []
    retired = []
    for row in question_rows(db, session_id=session_id, username=username):
        payload = row.payload or {}
        if payload.get("status") != "proposed":
            continue
        if not _decayed(payload, row.turn_index, step_id=step_id, current_turn=turn_index):
            continue
        recommendation_service.set_state(
            db, session_id=session_id, username=username,
            recommendation_type="advice", slug=row.slug, status="stale",
        )
        retired.append(row.slug)
    return retired


def questions(db, *, session_id: str, username: str, step_id: str | None) -> dict[str, list[dict]]:
    """Le domande della sessione divise per destino, lette dallo stato registrato.

    Nessun giudizio qui dentro: chi decide ha gia' scritto (`retire_stale_questions`
    per la decadenza, `thread_guard` per la risposta nel discorso).
    """
    buckets: dict[str, list[dict]] = {"open": [], "answered_in_talk": [], "left_behind": []}
    if not session_id or not username:
        return buckets
    for row in question_rows(db, session_id=session_id, username=username):
        payload = row.payload or {}
        item = {"text": _clean(payload.get("name", ""), MAX_QUESTION_CHARS),
                "step_order": payload.get("step_order")}
        if not item["text"]:
            continue
        status = payload.get("status")
        asked_in = (payload.get("step_id") or "").strip()
        if status == "closed":
            if payload.get("closed_by") == "conversation":
                buckets["answered_in_talk"].append(item)
            continue
        if status == "stale" or (step_id and asked_in and asked_in != step_id):
            buckets["left_behind"].append(item)
        elif status == "proposed":
            buckets["open"].append(item)
    return {key: value[-MAX_LEDGER_QUESTIONS:] for key, value in buckets.items()}
```

- [ ] **Step 4: Chiama il ritiro prima di costruire il ledger**

In `backend/chat_preparation.py`, aggiungi l'import accanto agli altri (riga ~9):

```python
from .memory_service import session_memory
```

e, subito prima di `ledger = session_ledger.block(` (riga ~363):

```python
        # La decadenza si scrive prima della lettura: il ledger deve vedere lo
        # stesso registro che vedra' la sidebar. Stessa misura del turno usata da
        # chi registra le note, o le due eta' non sarebbero confrontabili.
        session_ledger.retire_stale_questions(
            db, session_id=session_id, username=(identity or {}).get("username", ""),
            step_id=request.phase,
            turn_index=max(0, len(session_memory.get_transcript(session_id)) - 1),
        )
```

- [ ] **Step 5: Esegui i test e verifica che passino**

```bash
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" \
  python3 -m pytest backend/tests/test_session_ledger.py backend/tests/test_chat_preparation.py -q
```
Atteso: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/session_ledger.py backend/chat_preparation.py backend/tests/test_session_ledger.py
git commit -m "feat: retire the questions the conversation has passed"
```

---

### Task 3: Le tre righe del ledger

**Files:**
- Modify: `backend/session_ledger.py:64-103` (`build`), `:136-139` (`_empty`), `:140-175` (`_compose`), `:177-202` (`_directives`), `:231-253` (rimozione di `_open_question`), `:294-300` (rimozione di `_last_question` se resta orfana)
- Test: `backend/tests/test_session_ledger.py`

**Interfaces:**
- Consumes: `session_ledger.questions(...)` (Task 2).
- Produces: `build()` ritorna la chiave `questions` (il dict a tre bucket) al posto di `open_question`; `render()` emette le tre righe e le tre direttive.

- [ ] **Step 1: Scrivi i test che falliscono**

```python
def test_the_three_fates_get_three_different_rules(db):
    _note(db, 'q-open', text='Che cosa ti blocca?', step_id='cognitive', step_order=1, turn=4)
    _note(db, 'q-talk', text='Ti pesa di piu il tempo o il metodo?', step_id='cognitive',
          step_order=1, turn=2, status='closed', closed_by='conversation')
    _note(db, 'q-gone', text='Quando un risultato ti delude, che cosa prevale?',
          step_id='affective', step_order=2, turn=1, status='stale')
    text = session_ledger.block(db, session_id=SESSION, username=STUDENT, step_id='cognitive')
    assert 'Che cosa ti blocca?' in text and 'once' in text
    assert 'Ti pesa di piu il tempo o il metodo?' in text
    assert 'already answered those questions while talking' in text
    assert 'Quando un risultato ti delude, che cosa prevale?' in text
    assert '(2)' in text  # la fase da cui viene
    assert 'only if the student goes back to it' in text


def test_a_ledger_without_questions_says_nothing_about_them(db):
    _turn(db, student="ok", counselor="Bene.")
    text = session_ledger.block(db, session_id=SESSION, username=STUDENT, step_id='cognitive')
    assert 'unanswered' not in text and 'while talking' not in text
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

```bash
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" \
  python3 -m pytest backend/tests/test_session_ledger.py -q -k "three_fates or without_questions"
```
Atteso: FAIL — il blocco non contiene ancora nessuna delle tre righe.

- [ ] **Step 3: Sostituisci `open_question` con `questions` in `build` e `_empty`**

In `build`, togli il calcolo di `open_question` e il ciclo sulle note che lo chiudeva (righe 79-90), e nel dict ritornato sostituisci la chiave:

```python
    return {
        "answers": _answers(rows),
        "replayed_step": _replayed(rows, step_id),
        "questions": questions(db, session_id=session_id, username=username, step_id=step_id),
        "pending_actions": chosen,
        …
```

`_empty`:

```python
def _empty() -> dict:
    return {"answers": [], "questions": {"open": [], "answered_in_talk": [], "left_behind": []},
            "pending_actions": [], "proposed_action": "", "refused_actions": [],
            "verification_asked": False, "replayed_step": False, "guard_notes": []}
```

- [ ] **Step 4: Le tre righe in `_compose` e le tre regole in `_directives`**

In `_compose`, sostituisci il blocco `if ledger["open_question"]:` con:

```python
    asked = ledger["questions"]
    if asked["open"]:
        lines.append("Your own reflective question, still unanswered:")
        lines.extend(f"- \"{item['text']}\"" for item in asked["open"])
    if asked["answered_in_talk"]:
        lines.append("Questions the student already answered while talking, without answering them:")
        lines.extend(f"- \"{item['text']}\"" for item in asked["answered_in_talk"])
    if asked["left_behind"]:
        lines.append("Questions the conversation has passed:")
        lines.extend(
            f"- ({item['step_order']}) \"{item['text']}\"" if item["step_order"] is not None
            else f"- \"{item['text']}\""
            for item in asked["left_behind"]
        )
```

E la guardia in cima a `render` (riga ~115) legge la nuova forma:

```python
    if not any((answers, ledger["pending_actions"], ledger["refused_actions"],
                any(ledger["questions"].values()), ledger["proposed_action"],
                ledger["replayed_step"], ledger["guard_notes"])):
        return ""
```

In `_directives`, sostituisci la direttiva su `open_question` con le tre:

```python
    asked = ledger["questions"]
    if asked["open"]:
        directives.append(
            "Take your unanswered question back up once, reformulated, instead of stacking a "
            "new one on top of it; do not repeat it word for word."
        )
    if asked["answered_in_talk"]:
        directives.append(
            "The student already answered those questions while talking: use what was said as "
            "something already said, and never ask them again."
        )
    if asked["left_behind"]:
        directives.append(
            "Those questions belong to a step the conversation has left: pick one back up only "
            "if the student goes back to it, and never bring them up yourself."
        )
```

- [ ] **Step 5: Togli il codice rimasto orfano**

`_open_question` (righe ~231-253) e `OPEN_QUESTION_MAX_AGE` non hanno più chiamanti: cancellali. `_last_question` resta usata solo da `_open_question`: dopo la rimozione, cancella anche quella e la costante `_SENTENCE_END` **solo se** nessun'altra funzione del file la usa (`grep -n "_SENTENCE_END\|_last_question" backend/session_ledger.py` prima di cancellare). Anche `thread_guard._ledger` legge `ledger["open_question"]` (riga ~358): sostituisci quella riga con

```python
    for item in (ledger.get("questions") or {}).get("open") or []:
        lines.append(f'question left open by the counselor: "{_safe(item.get("text", ""))}"')
```

- [ ] **Step 6: Esegui i test e verifica che passino**

```bash
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" \
  python3 -m pytest backend/tests/test_session_ledger.py backend/tests/test_thread_guard.py backend/tests/test_chat_preparation.py -q
```
Atteso: PASS. Se un test del ledger asseriva `ledger["open_question"]`, aggiornalo alla nuova chiave: è la stessa informazione con un nome nuovo, non un comportamento diverso.

- [ ] **Step 7: Commit**

```bash
git add backend/session_ledger.py backend/thread_guard.py backend/tests/test_session_ledger.py
git commit -m "feat: give the counselor three rules for three kinds of unanswered question"
```

---

### Task 4: Il giudice chiude ciò a cui lo studente ha risposto parlando

**Files:**
- Modify: `backend/thread_guard.py:88-93` (`Verdict`), `:182-200` (`store`), `:265-286` (`build_input`), `:408-433` (`SYSTEM_PROMPT`), `:458-492` (`evaluate`)
- Test: `backend/tests/test_thread_guard.py`

**Interfaces:**
- Consumes: `session_ledger.questions(...)["open"]` (Task 2), `recommendation_service.set_state(..., status="closed", closed_by="conversation")` (Task 1).
- Produces:
  - `thread_guard.Verdict.answered: list[int]` (default `[]`)
  - `thread_guard.open_questions(db, *, session_id: str, username: str, step_id: str | None) -> list[dict]` — voci `{"slug": str, "text": str, "step_order": int | None}`, al più due
  - `thread_guard.build_input(..., open_questions: list[dict] | None = None)`
  - `thread_guard.store(db, *, session_id, username, turn, verdict, open_questions: list[dict] | None = None) -> list[str]`

- [ ] **Step 1: Scrivi i test che falliscono**

In `backend/tests/test_thread_guard.py`:

```python
def test_a_verdict_without_answered_still_parses():
    verdict = thread_guard.parse('{"on_thread": {"ok": true, "note": null},'
                                 ' "question_fit": {"ok": true, "note": null},'
                                 ' "advice_grounded": {"ok": true, "note": null}}')
    assert verdict is not None and verdict.answered == []


def test_the_judge_closes_the_question_answered_while_talking(db):
    _question_row(db, 'q-1', 'Ti pesa il tempo o il metodo?')
    verdict = thread_guard.parse('{"on_thread": {"ok": true, "note": null},'
                                 ' "question_fit": {"ok": true, "note": null},'
                                 ' "advice_grounded": {"ok": true, "note": null},'
                                 ' "answered": [1]}')
    thread_guard.store(db, session_id=SESSION, username=STUDENT, turn='t', verdict=verdict,
                       open_questions=[{'slug': 'q-1', 'text': 'Ti pesa il tempo o il metodo?',
                                        'step_order': 1}])
    item = recommendation_service.list_for_session(
        db, session_id=SESSION, username=STUDENT)['advice'][0]
    assert item['status'] == 'closed' and item['closed_by'] == 'conversation'


def test_an_index_outside_the_list_closes_nothing(db):
    _question_row(db, 'q-1', 'Ti pesa il tempo o il metodo?')
    verdict = thread_guard.parse('{"on_thread": {"ok": true, "note": null},'
                                 ' "question_fit": {"ok": true, "note": null},'
                                 ' "advice_grounded": {"ok": true, "note": null},'
                                 ' "answered": [7, 0, -1]}')
    thread_guard.store(db, session_id=SESSION, username=STUDENT, turn='t', verdict=verdict,
                       open_questions=[{'slug': 'q-1', 'text': 'x', 'step_order': 1}])
    item = recommendation_service.list_for_session(
        db, session_id=SESSION, username=STUDENT)['advice'][0]
    assert item['status'] == 'proposed'


def test_the_open_questions_reach_the_judge_numbered_with_their_step():
    rendered = thread_guard._open_questions_section([
        {'slug': 'q-1', 'text': 'Ti pesa il tempo o il metodo?', 'step_order': 2},
    ])
    assert '1. (step 2) "Ti pesa il tempo o il metodo?"' in rendered
    assert thread_guard._open_questions_section([]) == ''
```

`test_thread_guard.py` oggi è puro: non ha né DB né costanti di sessione. In cima
al file, dopo `from backend import thread_guard`, aggiungi:

```python
import pytest

from backend import recommendation_service, session_ledger  # noqa: F401
from backend.tests.artifact_database import artifact_session

SESSION = "guard-fixture"
STUDENT = "alice"


@pytest.fixture
def db():
    with artifact_session() as session:
        yield session


def _question_row(db, slug, text, *, step_id='cognitive', step_order=1, turn=1):
    recommendation_service.record(
        db, session_id=SESSION, username=STUDENT, recommendation_type='advice',
        payloads=[{'slug': slug, 'name': text, 'kind': 'question',
                   'step_id': step_id, 'step_order': step_order}], turn_index=turn)
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

```bash
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" \
  python3 -m pytest backend/tests/test_thread_guard.py -q
```
Atteso: FAIL — `Verdict` non ha `answered`, `_open_questions_section` non esiste.

- [ ] **Step 3: Il campo nel verdetto e la sezione in input**

`Verdict`:

```python
class Verdict(BaseModel):
    model_config = {"extra": "ignore"}
    on_thread: Check
    question_fit: Check
    advice_grounded: Check
    # Gli indici delle domande aperte a cui lo studente ha risposto parlando.
    # Assente nei verdetti dei modelli che non lo conoscono: lista vuota.
    answered: list[int] = []
```

Sezione e lettura, accanto agli altri helper:

```python
MAX_JUDGED_QUESTIONS = 2


def open_questions(db, *, session_id: str, username: str, step_id: str | None) -> list[dict]:
    """Le domande aperte che il giudice puo' dichiarare risposte nel discorso."""
    rows = session_ledger.question_rows(db, session_id=session_id, username=username)
    found = []
    for row in rows:
        payload = row.payload or {}
        if payload.get("status") != "proposed":
            continue
        asked_in = (payload.get("step_id") or "").strip()
        if step_id and asked_in and asked_in != step_id:
            continue
        found.append({"slug": row.slug, "text": payload.get("name", ""),
                      "step_order": payload.get("step_order")})
    return found[-MAX_JUDGED_QUESTIONS:]


def _open_questions_section(items: list[dict]) -> str:
    if not items:
        return ""
    lines = ["OPEN QUESTIONS (asked earlier, still unanswered)"]
    for index, item in enumerate(items, start=1):
        step = f"(step {item['step_order']}) " if item.get("step_order") is not None else ""
        lines.append(f'{index}. {step}"{_safe(item.get("text", ""))}"')
    return "\n".join(lines)
```

`build_input` guadagna il parametro e la sezione:

```python
def build_input(
    db, *, session_id: str, username: str, questionnaire_type: str,
    step_id: str | None, step_label: str, step_prompt: str = "", language: str = "it",
    advice_ids: list[str] | None = None, candidate_ids: list[str] | None = None,
    open_questions: list[dict] | None = None,
) -> str:
```

e, dentro, `sections` guadagna in coda `_open_questions_section(open_questions or [])`.

`session_ledger` va importato in `thread_guard` (accanto a `models, pii, session_ledger` — già c'è).

- [ ] **Step 4: `store` chiude, `evaluate` passa la stessa lista**

`store`:

```python
def store(db, *, session_id: str, username: str, turn: str, verdict: Verdict | None,
          open_questions: list[dict] | None = None) -> list[str]:
    """Write the verdict and return the lines that will actually be injected."""
    lines = notes(verdict)
    _close_answered(db, session_id=session_id, username=username,
                    verdict=verdict, open_questions=open_questions or [])
    …
```

e l'helper:

```python
def _close_answered(db, *, session_id: str, username: str, verdict: Verdict | None,
                    open_questions: list[dict]) -> None:
    """Chiude le domande a cui lo studente ha risposto parlando.

    Gli indici valgono sulla lista mostrata al giudice: fra la costruzione
    dell'input e qui e' passata una chiamata a modello, e rileggere il registro
    ora rischierebbe di numerare domande diverse.
    """
    if verdict is None or not open_questions:
        return
    for index in verdict.answered:
        if not isinstance(index, int) or not 1 <= index <= len(open_questions):
            continue
        slug = open_questions[index - 1].get("slug")
        if not slug:
            continue
        try:
            recommendation_service.set_state(
                db, session_id=session_id, username=username, recommendation_type="advice",
                slug=slug, status="closed", closed_by="conversation",
            )
        except ValueError:  # una riga che non e' una domanda non si chiude
            logger.info("Thread guard could not close %s", slug)
```

Import in cima: `from . import models, pii, recommendation_service, session_ledger`.

`evaluate`: legge la lista **una volta** e la usa per input e chiusura.

```python
    asked = open_questions(db, session_id=session_id, username=username, step_id=step_id)
    try:
        raw = call(
            provider=provider, model=model,
            user_message=build_input(
                db, session_id=session_id, username=username,
                questionnaire_type=questionnaire_type, step_id=step_id,
                step_label=step_label, step_prompt=step_prompt, language=language,
                advice_ids=advice_ids, candidate_ids=candidate_ids,
                open_questions=asked,
            ),
            system_prompt=SYSTEM_PROMPT,
        )
    …
    return store(db, session_id=session_id, username=username, turn=turn, verdict=verdict,
                 open_questions=asked)
```

- [ ] **Step 5: La riga nel prompt del giudice**

In `SYSTEM_PROMPT`, la forma JSON diventa:

```
{"on_thread": {"ok": true, "note": null},
 "question_fit": {"ok": true, "note": null},
 "advice_grounded": {"ok": true, "note": null},
 "answered": []}
```

e dopo la riga di `advice_grounded`:

```
answered - the numbers of the OPEN QUESTIONS the student answered in substance in this
exchange, even without answering them as questions. Empty when the section is absent, when
nobody answered, or whenever you are unsure: a question closed by mistake is lost.
```

- [ ] **Step 6: Esegui i test e verifica che passino**

```bash
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" \
  python3 -m pytest backend/tests/test_thread_guard.py backend/tests/test_session_ledger.py -q
```
Atteso: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/thread_guard.py backend/tests/test_thread_guard.py
git commit -m "feat: let the judge close a question the student answered while talking"
```

---

### Task 5: La sidebar mostra i quattro destini

**Files:**
- Modify: `frontend/src/lib/recommendations.ts:10-12` (stati), `:50-57` (tipo `AdviceRecommendation`)
- Modify: `frontend/src/components/qsa/RecommendationsPanel.tsx:393-410` (`AdviceCard`)
- Modify: `frontend/src/lib/i18n-recommendations.ts` (2 chiavi × 6 lingue)
- Test: `frontend/src/lib/recommendations.test.ts`

**Interfaces:**
- Consumes: payload `status`, `closed_by`, `step_order` (Task 1), serviti da `/chat/session/{id}/recommendations`.
- Produces: nessuna interfaccia per task successivi (ultimo task).

- [ ] **Step 1: Scrivi il test che fallisce**

In `frontend/src/lib/recommendations.test.ts`:

```ts
test('a retired question and its step survive normalisation', () => {
    const catalog = normalizeRecommendationCatalog({
        advice: [
            { slug: 'q1', kind: 'question', name: 'Rimasta?', status: 'stale', step_order: 2 },
            { slug: 'q2', kind: 'question', name: 'Risposta?', status: 'closed', closed_by: 'conversation' },
        ],
    });
    assert.equal(catalog.advice[0].status, 'stale');
    assert.equal(catalog.advice[0].step_order, 2);
    assert.equal(catalog.advice[1].closed_by, 'conversation');
});

test('an unknown status still falls back to proposed', () => {
    const catalog = normalizeRecommendationCatalog({ advice: [{ slug: 'q3', kind: 'question', status: 'boh' }] });
    assert.equal(catalog.advice[0].status, 'proposed');
});
```

`normalizeRecommendationCatalog` è già importata in cima al file di test.

- [ ] **Step 2: Esegui il test e verifica che fallisca**

```bash
cd frontend && npm test 2>&1 | grep -A 5 "retired question"
```
Atteso: FAIL — `status` normalizzato a `proposed`, `step_order` assente.

- [ ] **Step 3: Stati e campi in `recommendations.ts`**

```ts
export type RecommendationStatus = 'proposed' | 'selected' | 'tried' | 'dismissed' | 'closed' | 'stale';

const STATUSES: RecommendationStatus[] = ['proposed', 'selected', 'tried', 'dismissed', 'closed', 'stale'];
```

In `AdviceRecommendation`, accanto a `kind`:

```ts
    // Chi ha chiuso la domanda, e da quale fase veniva: la sigla della fase e'
    // un numero, non un'etichetta da tradurre.
    closed_by?: 'student' | 'conversation' | null;
    step_order?: number | null;
```

In `normalizeBucket`, dove l'item viene composto, i due campi passano invariati (arrivano già dallo spread del payload; se il normalizzatore elenca i campi uno a uno, aggiungili con `Reflect.get`).

- [ ] **Step 4: L'etichetta in `AdviceCard`**

In `RecommendationsPanel.tsx`, dentro `AdviceCard`, sostituisci la riga dell'etichetta:

```tsx
    const questionLabel: RecommendationTextKey = item.status === 'stale' ? 'question.stale'
        : item.status === 'closed'
            ? (item.closed_by === 'conversation' ? 'question.answeredInTalk' : 'question.closed')
            : 'question.open';
    const phase = typeof item.step_order === 'number' ? ` · ${item.step_order}` : '';
    return (
        <article className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-2xs font-semibold text-indigo-700">
                {question ? `${rec(questionLabel)}${phase}` : rec('advice.label')}
            </p>
```

e il bottone vale per ogni stato diverso da `proposed`:

```tsx
            {question && canAct ? (
                <button type="button" disabled={pending} onClick={() => onPatch({ status: item.status === 'proposed' ? 'closed' : 'proposed' })}
                    className="mt-2 min-h-9 rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-indigo-700 disabled:opacity-60">
                    {rec(item.status === 'proposed' ? 'question.close' : 'question.reopen')}
                </button>
            ) : null}
```

- [ ] **Step 5: Le due chiavi in sei lingue**

In `i18n-recommendations.ts`, accanto a `"question.closed"` in ciascuno dei sei dizionari:

```
it: "question.answeredInTalk": "Risposta nel discorso",   "question.stale": "Rimasta senza risposta"
en: "question.answeredInTalk": "Answered while talking",  "question.stale": "Left unanswered"
es: "question.answeredInTalk": "Respondida al hablar",    "question.stale": "Quedó sin respuesta"
fr: "question.answeredInTalk": "Répondue en parlant",     "question.stale": "Restée sans réponse"
de: "question.answeredInTalk": "Im Gespräch beantwortet", "question.stale": "Ohne Antwort geblieben"
sv: "question.answeredInTalk": "Besvarad i samtalet",     "question.stale": "Blev obesvarad"
```

- [ ] **Step 6: Esegui test, typecheck e lint**

```bash
cd frontend && npm test && npx tsc --noEmit && npm run lint
```
Atteso: test PASS, `tsc` senza output, lint con i soli 4 warning preesistenti (`page.tsx`, `ConfigForm.tsx` ×2, `IdeaMapPanel.tsx`) e 0 errori.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/recommendations.ts frontend/src/lib/recommendations.test.ts \
        frontend/src/lib/i18n-recommendations.ts frontend/src/components/qsa/RecommendationsPanel.tsx
git commit -m "feat: show the four fates of a question in the sidebar"
```

---

### Task 6: Verifica d'insieme e rilascio

**Files:**
- Nessuna modifica prevista; se qualcosa emerge, si corregge qui.

**Interfaces:**
- Consumes: tutto quanto sopra.

- [ ] **Step 1: Suite backend sui file toccati e sui vicini**

```bash
set -a && . ./.env && set +a
export SESSION_MEMORY_DIR=/tmp/cb-tests
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" \
  python3 -m pytest backend/tests/test_recommendation_state.py backend/tests/test_recommendations.py \
    backend/tests/test_session_ledger.py backend/tests/test_thread_guard.py \
    backend/tests/test_session_notes_chat.py backend/tests/test_recommendation_blocks.py \
    backend/tests/test_chat_preparation.py -q
```
Atteso: PASS.

- [ ] **Step 2: Smoke test da solo**

```bash
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5435/${POSTGRES_DB}" \
  python3 -m pytest backend/tests/test_smoke.py -q
```
Atteso: PASS (189 test alla baseline del 2026-09-07). Girare `test_smoke.py` **da solo**: insieme a `test_chat_preparation.py` inquina e produce 6 fallimenti di streaming che non sono regressioni.

- [ ] **Step 3: Ricostruisci i container e guarda i log**

```bash
docker compose up -d --build backend frontend
sleep 10 && docker compose ps && docker compose logs --tail 20 backend
```
Atteso: `backend` e `frontend` `Up`, log senza traceback.

- [ ] **Step 4: Prova a mano il giro completo**

Con una sessione guidata QSA: fai porre una domanda al counselor nello step dei fattori cognitivi, non rispondere, avanza allo step successivo, e verifica nella sidebar che la domanda risulti «Rimasta senza risposta · 1». Poi riaprila e controlla che al cambio di step successivo resti aperta (`revived`).

- [ ] **Step 5: Merge e push**

```bash
git checkout main && git merge --no-ff feature/question-lifecycle
git push origin main
```
