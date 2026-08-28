# Congelamento e ripresa della sessione guidata — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dare allo studente un pulsante che congela la sessione guidata e una ripresa che, da qualsiasi dispositivo, riapre lo stesso step con la trascrizione completa.

**Architecture:** al congelamento il frontend invia uno snapshot dello stato visibile (messaggi, step, punteggi, counselor, lingua) a quattro endpoint nuovi; il backend lo conserva nella tabella `frozen_sessions`, una riga per `(username, session_id)`. Alla ripresa il frontend rilegge lo snapshot e ricostruisce la chat invece di ripartire dalla sola riga "ripreso allo step X".

**Tech Stack:** FastAPI + SQLAlchemy + Postgres lato backend; Next.js 16 (App Router) + TypeScript + Tailwind lato frontend.

**Spec:** [docs/superpowers/specs/2026-08-28-frozen-sessions-design.md](../specs/2026-08-28-frozen-sessions-design.md)

## Global Constraints

- Branch di lavoro: `feature/frozen-sessions`. Commit atomici con Conventional Commits, come da `CLAUDE.md`.
- Nessuna migrazione: lo schema nasce da `models.Base.metadata.create_all` in [backend/main.py:139](../../../backend/main.py#L139). Non introdurre alembic.
- I router backend sono registrati **senza** prefisso `/api`; il frontend chiama `/api/...`. Path backend: `/session/freeze`, `/session/frozen`, `/session/frozen/{session_id}`.
- Ownership sempre su `username` dell'identità autenticata, mai sul solo `session_id`. Pattern di riferimento: [backend/routes/portfolio.py](../../../backend/routes/portfolio.py).
- Test backend sul Postgres dedicato `counselorbot_test`, dentro [backend/tests/test_smoke.py](../../../backend/tests/test_smoke.py). Esecuzione: `docker exec counselorbot_backend python -m pytest backend/tests/test_smoke.py -k <nome> -v`.
- Il frontend non ha framework di test: la verifica è `npx tsc --noEmit`, `npx eslint <file>`, `npm run build` dentro `frontend/`.
- Ogni stringa UI nuova va in tutte e sei le lingue di [frontend/src/lib/i18n.ts](../../../frontend/src/lib/i18n.ts): `it`, `en`, `es`, `fr`, `de`, `sv`.
- Dopo modifiche a codice applicativo: `docker compose up -d --build` e controllo di `docker compose ps` e dei log.

## File Structure

| file | responsabilità |
|---|---|
| `backend/models.py` (modifica) | tabella `frozen_sessions` |
| `backend/schemas.py` (modifica) | modelli Pydantic di richiesta/risposta dello snapshot |
| `backend/routes/frozen_sessions.py` (nuovo) | i quattro endpoint, ownership e validazione |
| `backend/main.py` (modifica) | import e `include_router` |
| `backend/tests/test_smoke.py` (modifica) | rotte attese + test di round-trip e isolamento |
| `frontend/src/lib/frozen-session.ts` (nuovo) | client tipizzato dei quattro endpoint |
| `frontend/src/lib/i18n.ts` (modifica) | chiavi `frozen.*` in sei lingue |
| `frontend/src/components/qsa/GuidedChatInterface.tsx` (modifica) | pulsante "Congela" e ripristino dello snapshot |
| `frontend/src/components/layout/HeaderResume.tsx` (modifica) | icona di ripresa alimentata dal server |
| `frontend/src/app/page.tsx` (modifica) | rotta `/?frozen=<id>`, ricostruzione dello stato, pulizia a fine percorso |

---

### Task 1: Backend — tabella, schemi ed endpoint

**Files:**
- Modify: `backend/models.py` (in coda al file, accanto agli altri modelli per-utente)
- Modify: `backend/schemas.py` (dopo i modelli del portfolio)
- Create: `backend/routes/frozen_sessions.py`
- Modify: `backend/main.py:1530-1553` (blocco `include_router`)
- Test: `backend/tests/test_smoke.py`

**Interfaces:**
- Consumes: `auth.get_current_user` (restituisce un dict con `username`, `email`, `is_admin`), `database.get_db`.
- Produces: `models.FrozenSession`; `schemas.FrozenSessionCreate`, `schemas.FrozenSessionSummary`, `schemas.FrozenSessionDetail`; le rotte `POST /session/freeze`, `GET /session/frozen`, `GET /session/frozen/{session_id}`, `DELETE /session/frozen/{session_id}`.

- [ ] **Step 1: Scrivi i test che falliscono**

In fondo a `backend/tests/test_smoke.py`:

```python
def test_frozen_session_round_trip_and_isolation():
    def _as(username: str, email: str):
        main.app.dependency_overrides[auth.get_current_user] = lambda: _identity(
            username, email, is_researcher=False
        )

    _as("student-a", "a@example.test")
    try:
        payload = {
            "session_id": "frozen-session-1",
            "questionnaire_type": "QSA",
            "messages": [
                {"role": "system", "content": "--- Step 1 ---"},
                {"role": "user", "content": "Vorrei capire come organizzarmi."},
                {"role": "assistant", "content": "Partiamo dal tuo profilo.", "responseId": "r-1"},
            ],
            "current_phase": "step-1",
            "scores": {"C1": 7.0},
            "counselor_id": 3,
            "experience": "standard",
            "locale": "it",
            "response_length": "short",
            "label": "QSA — Step 1",
        }
        r = client.post("/session/freeze", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["session_id"] == "frozen-session-1"

        listed = client.get("/session/frozen")
        assert listed.status_code == 200, listed.text
        rows = listed.json()
        assert [row["session_id"] for row in rows] == ["frozen-session-1"]
        assert rows[0]["label"] == "QSA — Step 1"
        assert "messages" not in rows[0]

        detail = client.get("/session/frozen/frozen-session-1")
        assert detail.status_code == 200, detail.text
        body = detail.json()
        assert len(body["messages"]) == 3
        assert body["messages"][2]["responseId"] == "r-1"
        assert body["current_phase"] == "step-1"
        assert body["scores"] == {"C1": 7.0}
        assert body["counselor_id"] == 3
        assert body["response_length"] == "short"

        # Ricongelare aggiorna la riga esistente invece di duplicarla.
        payload["messages"].append({"role": "user", "content": "Riprendo da qui."})
        payload["current_phase"] = "step-2"
        assert client.post("/session/freeze", json=payload).status_code == 200
        again = client.get("/session/frozen")
        assert len(again.json()) == 1
        assert client.get("/session/frozen/frozen-session-1").json()["current_phase"] == "step-2"

        # Un altro studente non vede né cancella la sessione del primo.
        _as("student-b", "b@example.test")
        assert client.get("/session/frozen").json() == []
        assert client.get("/session/frozen/frozen-session-1").status_code == 404
        assert client.delete("/session/frozen/frozen-session-1").status_code == 404

        _as("student-a", "a@example.test")
        assert client.delete("/session/frozen/frozen-session-1").status_code == 200
        assert client.get("/session/frozen").json() == []
    finally:
        main.app.dependency_overrides.pop(auth.get_current_user, None)


def test_frozen_session_rejects_unknown_questionnaire():
    main.app.dependency_overrides[auth.get_current_user] = _fake_user_identity
    try:
        r = client.post("/session/freeze", json={
            "session_id": "frozen-session-2",
            "questionnaire_type": "NOPE",
            "messages": [],
        })
        assert r.status_code == 422, r.text
    finally:
        main.app.dependency_overrides.pop(auth.get_current_user, None)
```

Aggiungi inoltre le quattro rotte a `EXPECTED_ROUTES` (blocco che inizia a `backend/tests/test_smoke.py:243`), accanto a `("GET", "/user/portfolio")`:

```python
    ("POST", "/session/freeze"),
    ("GET", "/session/frozen"),
    ("GET", "/session/frozen/{session_id}"),
    ("DELETE", "/session/frozen/{session_id}"),
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `docker exec counselorbot_backend python -m pytest backend/tests/test_smoke.py -k "frozen_session or all_routes" -v`
Expected: FAIL — `test_all_routes_registered` segnala le rotte mancanti, i due test nuovi ricevono 404.

- [ ] **Step 3: Aggiungi il modello**

In `backend/models.py`, dopo `class PortfolioItem`:

```python
class FrozenSession(Base):
    """Sessione guidata congelata dallo studente.

    Una riga per (username, session_id): ricongelare aggiorna lo snapshot.
    `data` contiene lo stato visibile della chat (messaggi, step, punteggi,
    counselor, lingua) per riprendere il percorso da qualsiasi dispositivo.
    """

    __tablename__ = "frozen_sessions"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, index=True)
    session_id = Column(String, nullable=False, index=True)
    questionnaire_type = Column(String, nullable=False, index=True)
    data = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

- [ ] **Step 4: Aggiungi gli schemi Pydantic**

In `backend/schemas.py`, dopo `class PortfolioItemResponse`:

```python
# --- Sessioni guidate congelate ---

FROZEN_SESSION_TYPES = {"QSA", "QSAr", "ZTPI", "SAVICKAS", "QPCS", "QPCC", "QAP"}
FROZEN_SESSION_MAX_MESSAGES = 400
FROZEN_SESSION_MAX_CONTENT_CHARS = 20000


class FrozenSessionMessage(BaseModel):
    role: str
    content: str
    reasoning: Optional[str] = None
    strategyIds: Optional[List[str]] = None
    responseId: Optional[str] = None
    feedbackPhase: Optional[str] = None
    feedback: Optional[bool] = None

    @validator("content", pre=True)
    def _cap_content(cls, v):
        return str(v or "")[:FROZEN_SESSION_MAX_CONTENT_CHARS]


class FrozenSessionCreate(BaseModel):
    session_id: str
    questionnaire_type: str
    messages: List[FrozenSessionMessage] = Field(default_factory=list)
    current_phase: str = ""
    scores: Dict[str, float] = Field(default_factory=dict)
    counselor_id: Optional[int] = None
    experience: Optional[str] = None
    locale: Optional[str] = None
    response_length: Optional[str] = None
    label: Optional[str] = None

    @validator("session_id", pre=True)
    def _require_session_id(cls, v):
        text = str(v or "").strip()
        if not text:
            raise ValueError("session_id is required")
        return text

    @validator("questionnaire_type", pre=True)
    def _known_questionnaire(cls, v):
        text = str(v or "").strip()
        if text not in FROZEN_SESSION_TYPES:
            raise ValueError("unsupported questionnaire_type")
        return text

    @validator("messages")
    def _cap_messages(cls, v):
        if len(v) > FROZEN_SESSION_MAX_MESSAGES:
            raise ValueError("too many messages")
        return v


class FrozenSessionSummary(BaseModel):
    session_id: str
    questionnaire_type: str
    label: Optional[str] = None
    current_phase: str = ""
    experience: Optional[str] = None
    updated_at: Optional[datetime] = None


class FrozenSessionDetail(FrozenSessionSummary):
    messages: List[FrozenSessionMessage] = Field(default_factory=list)
    scores: Dict[str, float] = Field(default_factory=dict)
    counselor_id: Optional[int] = None
    locale: Optional[str] = None
    response_length: Optional[str] = None
```

Se `Dict` non è già importato in cima al file, aggiungilo a `from typing import ...`.

- [ ] **Step 5: Scrivi il router**

Crea `backend/routes/frozen_sessions.py`:

```python
"""Sessioni guidate congelate.

Lo studente sospende il percorso con un gesto esplicito e lo riprende da
qualsiasi dispositivo. Ownership su `username`, come il portfolio: il solo
`session_id` non basta ad accedere a uno snapshot.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas

router = APIRouter()
get_db = database.get_db


def _summary(row: models.FrozenSession) -> schemas.FrozenSessionSummary:
    data = row.data or {}
    return schemas.FrozenSessionSummary(
        session_id=row.session_id,
        questionnaire_type=row.questionnaire_type,
        label=data.get("label"),
        current_phase=data.get("current_phase") or "",
        experience=data.get("experience"),
        updated_at=row.updated_at,
    )


def _detail(row: models.FrozenSession) -> schemas.FrozenSessionDetail:
    data = row.data or {}
    return schemas.FrozenSessionDetail(
        **_summary(row).model_dump(),
        messages=data.get("messages") or [],
        scores=data.get("scores") or {},
        counselor_id=data.get("counselor_id"),
        locale=data.get("locale"),
        response_length=data.get("response_length"),
    )


def _owned(db: Session, session_id: str, current_user: dict) -> models.FrozenSession:
    row = (
        db.query(models.FrozenSession)
        .filter(
            models.FrozenSession.username == current_user["username"],
            models.FrozenSession.session_id == session_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Sessione congelata non trovata")
    return row


@router.post("/session/freeze", response_model=schemas.FrozenSessionSummary)
async def freeze_session(
    payload: schemas.FrozenSessionCreate,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Congela la sessione: upsert dello snapshot per (username, session_id)."""
    username = current_user["username"]
    data = payload.model_dump(exclude={"session_id", "questionnaire_type"})
    row = (
        db.query(models.FrozenSession)
        .filter(
            models.FrozenSession.username == username,
            models.FrozenSession.session_id == payload.session_id,
        )
        .first()
    )
    if row:
        row.questionnaire_type = payload.questionnaire_type
        row.data = data
    else:
        row = models.FrozenSession(
            username=username,
            session_id=payload.session_id,
            questionnaire_type=payload.questionnaire_type,
            data=data,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return _summary(row)


@router.get("/session/frozen", response_model=List[schemas.FrozenSessionSummary])
async def list_frozen_sessions(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Elenco leggero per l'header: nessun messaggio nel payload."""
    rows = (
        db.query(models.FrozenSession)
        .filter(models.FrozenSession.username == current_user["username"])
        .order_by(models.FrozenSession.updated_at.desc())
        .all()
    )
    return [_summary(row) for row in rows]


@router.get("/session/frozen/{session_id}", response_model=schemas.FrozenSessionDetail)
async def get_frozen_session(
    session_id: str,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    return _detail(_owned(db, session_id, current_user))


@router.delete("/session/frozen/{session_id}")
async def delete_frozen_session(
    session_id: str,
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Rimuove lo snapshot: percorso concluso o ripresa scartata."""
    row = _owned(db, session_id, current_user)
    db.delete(row)
    db.commit()
    return {"status": "deleted", "session_id": session_id}
```

- [ ] **Step 6: Registra il router**

In `backend/main.py`, accanto agli altri import di router:

```python
from .routes import frozen_sessions as frozen_sessions_routes
```

e dopo `app.include_router(groups_routes.router)`:

```python
app.include_router(frozen_sessions_routes.router)
```

Segui la forma esatta degli import già presenti nel file (stesso stile di `portfolio` e `groups`).

- [ ] **Step 7: Esegui i test e verifica che passino**

Run: `docker exec counselorbot_backend python -m pytest backend/tests/test_smoke.py -k "frozen_session or all_routes" -v`
Expected: PASS su tutti e tre i test.

- [ ] **Step 8: Esegui la suite completa**

Run: `docker exec counselorbot_backend python -m pytest backend/tests/test_smoke.py -v`
Expected: nessuna regressione rispetto al risultato precedente all'inizio del task (annota eventuali test già rossi prima delle modifiche).

- [ ] **Step 9: Commit**

```bash
git add backend/models.py backend/schemas.py backend/routes/frozen_sessions.py backend/main.py backend/tests/test_smoke.py
git commit -m "feat: store and serve frozen guided sessions"
```

---

### Task 2: Client frontend e stringhe

**Files:**
- Create: `frontend/src/lib/frozen-session.ts`
- Modify: `frontend/src/lib/i18n.ts` (sei blocchi lingua)

**Interfaces:**
- Consumes: gli endpoint del Task 1; `apiFetch` da [frontend/src/lib/auth.ts:79](../../../frontend/src/lib/auth.ts#L79).
- Produces: i tipi `FrozenSessionSummary`, `FrozenSessionDetail`, `FrozenSessionSnapshot` e le funzioni `freezeSession`, `listFrozenSessions`, `getFrozenSession`, `deleteFrozenSession`; le chiavi i18n `frozen.freeze`, `frozen.frozen`, `frozen.resumeTitle`, `frozen.resumeOne`.

- [ ] **Step 1: Scrivi il client**

Crea `frontend/src/lib/frozen-session.ts`:

```typescript
// Client delle sessioni guidate congelate: lo studente sospende il percorso e
// lo riprende da qualsiasi dispositivo (lo stato vive sul server, non in
// localStorage come il punto di ripresa di `lib/resume.ts`).

import { apiFetch } from '@/lib/auth';

export interface FrozenSessionMessage {
    role: string;
    content: string;
    reasoning?: string;
    strategyIds?: string[];
    responseId?: string;
    feedbackPhase?: string;
    feedback?: boolean;
}

export interface FrozenSessionSummary {
    session_id: string;
    questionnaire_type: string;
    label?: string | null;
    current_phase: string;
    experience?: 'standard' | 'opencode' | null;
    updated_at?: string | null;
}

export interface FrozenSessionDetail extends FrozenSessionSummary {
    messages: FrozenSessionMessage[];
    scores: Record<string, number>;
    counselor_id?: number | null;
    locale?: string | null;
    response_length?: 'short' | 'medium' | 'long' | null;
}

export interface FrozenSessionSnapshot {
    session_id: string;
    questionnaire_type: string;
    messages: FrozenSessionMessage[];
    current_phase: string;
    scores: Record<string, number>;
    counselor_id: number | null;
    experience: 'standard' | 'opencode';
    locale: string;
    response_length: 'short' | 'medium' | 'long';
    label: string;
}

export async function freezeSession(snapshot: FrozenSessionSnapshot): Promise<void> {
    const res = await apiFetch('/api/session/freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
    });
    if (!res.ok) throw new Error(`Freeze fallito (${res.status})`);
}

export async function listFrozenSessions(): Promise<FrozenSessionSummary[]> {
    const res = await apiFetch('/api/session/frozen');
    if (!res.ok) return [];
    return (await res.json()) as FrozenSessionSummary[];
}

export async function getFrozenSession(sessionId: string): Promise<FrozenSessionDetail | null> {
    const res = await apiFetch(`/api/session/frozen/${encodeURIComponent(sessionId)}`);
    if (!res.ok) return null;
    return (await res.json()) as FrozenSessionDetail;
}

export async function deleteFrozenSession(sessionId: string): Promise<void> {
    await apiFetch(`/api/session/frozen/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
}
```

- [ ] **Step 2: Aggiungi le chiavi i18n**

In `frontend/src/lib/i18n.ts`, accanto alle chiavi `responseLength.*` di **ciascuno** dei sei blocchi lingua:

```typescript
// it
    'frozen.freeze': "Congela sessione",
    'frozen.frozen': "Sessione congelata: puoi riprenderla quando vuoi.",
    'frozen.resumeTitle': "Riprendi una sessione",
    'frozen.resumeOne': "Riprendi la sessione congelata",
// en
    'frozen.freeze': "Freeze session",
    'frozen.frozen': "Session frozen: you can resume it whenever you want.",
    'frozen.resumeTitle': "Resume a session",
    'frozen.resumeOne': "Resume the frozen session",
// es
    'frozen.freeze': "Congelar sesión",
    'frozen.frozen': "Sesión congelada: puedes retomarla cuando quieras.",
    'frozen.resumeTitle': "Retomar una sesión",
    'frozen.resumeOne': "Retomar la sesión congelada",
// fr
    'frozen.freeze': "Geler la séance",
    'frozen.frozen': "Séance gelée : vous pouvez la reprendre quand vous voulez.",
    'frozen.resumeTitle': "Reprendre une séance",
    'frozen.resumeOne': "Reprendre la séance gelée",
// de
    'frozen.freeze': "Sitzung einfrieren",
    'frozen.frozen': "Sitzung eingefroren: Du kannst sie jederzeit fortsetzen.",
    'frozen.resumeTitle': "Sitzung fortsetzen",
    'frozen.resumeOne': "Eingefrorene Sitzung fortsetzen",
// sv
    'frozen.freeze': "Frys sessionen",
    'frozen.frozen': "Sessionen är fryst: du kan återuppta den när du vill.",
    'frozen.resumeTitle': "Återuppta en session",
    'frozen.resumeOne': "Återuppta den frysta sessionen",
```

- [ ] **Step 3: Verifica tipi e lint**

Run (da `frontend/`): `npx tsc --noEmit && npx eslint src/lib/frozen-session.ts src/lib/i18n.ts`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/frozen-session.ts frontend/src/lib/i18n.ts
git commit -m "feat: add frozen session client and translations"
```

---

### Task 3: Pulsante "Congela" nella chat guidata

**Files:**
- Modify: `frontend/src/components/qsa/GuidedChatInterface.tsx`

**Interfaces:**
- Consumes: `freezeSession` e il tipo `FrozenSessionSnapshot` dal Task 2; lo stato già presente nel componente (`messages`, `currentPhase`, `responseLength`, `sessionId`, `questionnaireType`, `activeLocale`, `getSelectedCounselorId()`, `getPhaseLabel()`).
- Produces: una prop opzionale `onFrozen?: () => void` sull'interfaccia `GuidedChatInterfaceProps`, chiamata dopo il congelamento riuscito (il Task 4 la usa per uscire dalla chat).

- [ ] **Step 1: Aggiungi la prop e l'handler**

In `GuidedChatInterfaceProps` (blocco che inizia a riga 36) aggiungi:

```typescript
    onFrozen?: () => void;
```

e includila nella destrutturazione della funzione (riga 378 circa).

Dopo gli altri handler del componente, aggiungi:

```typescript
    // Congela la sessione: salva lo stato visibile lato server e lascia che il
    // chiamante chiuda la chat. Lo studente la riprende da qualsiasi dispositivo.
    const handleFreeze = async () => {
        if (isLoading) return;
        try {
            await freezeSession({
                session_id: sessionId,
                questionnaire_type: questionnaireType,
                messages,
                current_phase: currentPhase,
                scores,
                counselor_id: getSelectedCounselorId(),
                experience: 'standard',
                locale: activeLocale,
                response_length: responseLength,
                label: `${questionnaireType} — ${getPhaseLabel(currentPhase)}`,
            });
            toast.success(t('frozen.frozen'));
            onFrozen?.();
        } catch {
            toast.error(t('toast.error'));
        }
    };
```

`toast` non è ancora importato in questo componente; `t('toast.error')` è la chiave generica già presente in `i18n.ts`. Aggiungi in cima al file:

```typescript
import { toast } from '@/components/ui/Toast';
import { freezeSession } from '@/lib/frozen-session';
```

e aggiungi `Snowflake` alla lista di icone già importate da `lucide-react` alla riga 3.

Nessun controllo di autenticazione serve nel componente: [page.tsx:481](../../../frontend/src/app/page.tsx#L481) blocca l'intera pagina quando l'identità non è autenticata, quindi la chat guidata è raggiungibile solo da utenti loggati.

- [ ] **Step 2: Aggiungi il pulsante**

Accanto al selettore di lunghezza (blocco `<div className="mb-2 flex justify-end">` intorno a riga 1418), trasforma la riga in un contenitore con i due controlli:

```tsx
                        <div className="mb-2 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => void handleFreeze()}
                                disabled={isLoading || !sessionId}
                                title={t('frozen.freeze')}
                                className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Snowflake className="h-3.5 w-3.5" />
                                {t('frozen.freeze')}
                            </button>
                            <ResponseLengthSelector
                                value={responseLength}
                                onChange={setResponseLength}
                                disabled={isLoading}
                            />
                        </div>
```

- [ ] **Step 3: Verifica tipi e lint**

Run (da `frontend/`): `npx tsc --noEmit && npx eslint src/components/qsa/GuidedChatInterface.tsx`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/qsa/GuidedChatInterface.tsx
git commit -m "feat: add freeze button to guided chat"
```

---

### Task 4: Ripresa dallo snapshot

**Files:**
- Modify: `frontend/src/components/layout/HeaderResume.tsx`
- Modify: `frontend/src/app/page.tsx:220-245` (ramo `params.get('resume')`), `frontend/src/app/page.tsx:640-650` (uso di `GuidedChatInterface`)
- Modify: `frontend/src/components/qsa/GuidedChatInterface.tsx` (ripristino dello snapshot)

**Interfaces:**
- Consumes: `listFrozenSessions`, `getFrozenSession`, `FrozenSessionDetail` dal Task 2; `onFrozen` dal Task 3.
- Produces: una prop opzionale `frozenSnapshot?: FrozenSessionDetail | null` su `GuidedChatInterfaceProps`; la rotta client `/?frozen=<session_id>`.

- [ ] **Step 1: Header alimentato dal server**

Riscrivi `HeaderResume.tsx` mantenendo il fallback locale:

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { RotateCcw } from 'lucide-react';
import { getResume, subscribeToResume } from '@/lib/resume';
import { listFrozenSessions, type FrozenSessionSummary } from '@/lib/frozen-session';
import { useI18n } from '@/lib/i18n-context';
import { Tooltip } from '@/components/ui/Tooltip';

// Pulsante "Riprendi" nell'header: compare quando c'è una sessione congelata
// sul server (ripresa da qualsiasi dispositivo) o una chat interrotta salvata
// localmente. Disponibile da ogni pagina.
export function HeaderResume() {
    const { t } = useI18n();
    const hasLocalResume = useSyncExternalStore(
        subscribeToResume,
        () => (getResume() ? '1' : null),
        () => null,
    );
    const [frozen, setFrozen] = useState<FrozenSessionSummary[]>([]);

    useEffect(() => {
        let alive = true;
        listFrozenSessions()
            .then((rows) => { if (alive) setFrozen(rows); })
            .catch(() => { if (alive) setFrozen([]); });
        return () => { alive = false; };
    }, []);

    const href = frozen.length === 1
        ? `/?frozen=${encodeURIComponent(frozen[0].session_id)}`
        : frozen.length > 1
        ? '/?frozen=list'
        : '/?resume=1';
    const label = frozen.length > 1 ? t('frozen.resumeTitle') : frozen.length === 1 ? t('frozen.resumeOne') : t('header.resume');

    if (!hasLocalResume && frozen.length === 0) return null;

    return (
        <Tooltip content={label}>
            <Link href={href} className="console-topbar-icon" aria-label={label} title={label}>
                <RotateCcw className="h-4 w-4" />
            </Link>
        </Tooltip>
    );
}
```

- [ ] **Step 2: Ricostruzione in `page.tsx`**

Nel `useEffect` che legge i parametri (riga 222 circa), **prima** del ramo `params.get('resume')`, aggiungi:

```tsx
        // Ripresa di una sessione congelata: lo stato arriva dal server, non da localStorage.
        const frozenParam = params.get('frozen');
        if (frozenParam && frozenParam !== 'list') {
            window.history.replaceState(null, '', window.location.pathname);
            void (async () => {
                const snapshot = await getFrozenSession(frozenParam);
                if (!snapshot) return;
                const q = QUESTIONNAIRES[snapshot.questionnaire_type as QuestionnaireType];
                if (!q) return;
                setSelectedQuestionnaire(q);
                setSelectedInstrumentId(snapshot.questionnaire_type);
                if (snapshot.counselor_id != null) setSelectedCounselorId(snapshot.counselor_id);
                setSessionId(snapshot.session_id);
                setScores(snapshot.scores || {});
                setExperience('standard');
                setFrozenSnapshot(snapshot);
                setStep('interaction');
            })();
            return;
        }
```

Aggiungi lo stato `const [frozenSnapshot, setFrozenSnapshot] = useState<FrozenSessionDetail | null>(null);` accanto agli altri `useState` (riga 190 circa) e gli import:

```tsx
import { deleteFrozenSession, getFrozenSession, type FrozenSessionDetail } from '@/lib/frozen-session';
```

Passa lo snapshot e l'handler di congelamento al componente (riga 640 circa):

```tsx
                                <GuidedChatInterface
                                    ...
                                    frozenSnapshot={frozenSnapshot}
                                    onFrozen={() => {
                                        setResume(null);
                                        setFrozenSnapshot(null);
                                        setStep('questionnaire-select');
                                    }}
                                />
```

(mantieni le prop già presenti; aggiungi soltanto le due nuove).

- [ ] **Step 3: Ripristino dentro `GuidedChatInterface`**

Aggiungi la prop all'interfaccia e alla destrutturazione:

```typescript
    frozenSnapshot?: FrozenSessionDetail | null;
```

con `import type { FrozenSessionDetail } from '@/lib/frozen-session';`.

Nel blocco di ripristino di `loadData` (`GuidedChatInterface.tsx:527-560`), lo snapshot ha la precedenza sulla memoria di sessione:

```tsx
                if (frozenSnapshot && shouldRestoreSession && phaseOrder.includes(frozenSnapshot.current_phase)) {
                    setCurrentPhase(frozenSnapshot.current_phase);
                    setMessages(frozenSnapshot.messages as ChatMessage[]);
                    if (frozenSnapshot.response_length) {
                        setResponseLength(frozenSnapshot.response_length);
                    }
                    loadedSessionScopeRef.current = sessionScope;
                } else {
                    // ...blocco esistente che interroga /api/memory/user/{sessionId}
                }
```

Aggiungi `frozenSnapshot` alle dipendenze dello `useEffect` (riga 591).

- [ ] **Step 4: Verifica tipi e lint**

Run (da `frontend/`): `npx tsc --noEmit && npx eslint src/app/page.tsx src/components/layout/HeaderResume.tsx src/components/qsa/GuidedChatInterface.tsx`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/page.tsx frontend/src/components/layout/HeaderResume.tsx frontend/src/components/qsa/GuidedChatInterface.tsx
git commit -m "feat: resume guided chat from a frozen session"
```

---

### Task 5: Chiusura del ciclo, build e verifica

**Files:**
- Modify: `frontend/src/app/page.tsx` (`handleInteractionComplete`, riga 411 circa)
- Modify: `CONTEXT.md`

**Interfaces:**
- Consumes: `deleteFrozenSession` dal Task 2 (già importata nel Task 4).
- Produces: nessuna nuova interfaccia.

- [ ] **Step 1: Cancella lo snapshot a percorso concluso**

```tsx
    const handleInteractionComplete = () => {
        setResume(null);
        if (sessionId) void deleteFrozenSession(sessionId);
        setFrozenSnapshot(null);
        setStep('completed');
    };
```

- [ ] **Step 2: Documenta la funzionalità**

In `CONTEXT.md`, nella sezione che descrive il percorso guidato, aggiungi un paragrafo: la sessione si congela dal pulsante nella chat, lo snapshot vive in `frozen_sessions` legato allo `username`, la ripresa avviene dall'icona nell'header o da `/?frozen=<session_id>`, e lo snapshot viene cancellato a percorso concluso.

- [ ] **Step 3: Build del frontend**

Run (da `frontend/`): `npm run build`
Expected: build completata senza errori.

- [ ] **Step 4: Rebuild dei container e controllo**

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=20 backend frontend
```

Expected: backend e frontend `Up`, nessun errore nei log, tabella `frozen_sessions` creata all'avvio (verificabile con `docker exec counselorbot_postgres psql -U <user> -d counselorbot -c '\d frozen_sessions'`).

- [ ] **Step 5: Verifica manuale**

Con la stessa utenza su due browser diversi: avvia un percorso guidato, scambia qualche messaggio, premi "Congela sessione", apri il secondo browser, usa l'icona di ripresa nell'header e controlla che tornino sia lo step sia la trascrizione completa.

- [ ] **Step 6: Commit e push**

```bash
git add frontend/src/app/page.tsx CONTEXT.md
git commit -m "feat: clear frozen session when the guided path ends"
git push origin feature/frozen-sessions
```
