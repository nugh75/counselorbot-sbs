# Referenti ed eventi di orientamento — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dare a CounselorBot un catalogo certificato di figure di riferimento e di eventi di orientamento, agganciato all'istituto dello studente, consultabile sia dalla chat (skill `referral-guide`) sia da una pagina dell'area personale.

**Architecture:** tre tabelle nuove (`institutions`, `orientation_referrals`, `orientation_events`) più una colonna su `student_groups`. Un vocabolario chiuso di *bisogni* è la chiave d'aggancio, come i temi lo sono per le letture. Un modulo di scoping risolve l'istituto dello studente (taccuino, poi classe, più le righe nazionali). Un servizio di retrieval alimenta sia l'handler della skill sia l'endpoint della directory; la differenza è che la directory non filtra per bisogno. La skill entra in chat solo su intent esplicito `referral`.

**Tech Stack:** Python 3 / FastAPI / SQLAlchemy / PostgreSQL; Next.js App Router / React / TypeScript / Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-03-orientamento-referenti-eventi-design.md`

## Global Constraints

- Database di test: Postgres dedicato `counselorbot_test`, **mai SQLite**. Le suite si eseguono con `docker exec counselorbot_backend python -m backend.tests.<modulo>`.
- Istruzioni delle skill: **solo inglese**, in `instructions_i18n = {"en": ...}`. Il materiale consegnato al modello (etichette, direttive d'uso) va invece nelle sei lingue dell'interfaccia: `it, en, es, fr, de, sv`.
- Seed **append-only**: non sovrascrivere righe di `skills`, `guided_steps` o prompt già presenti in DB.
- Vocabolari chiusi: una chiave sconosciuta fa fallire la validazione (fail closed), non attiva comportamenti.
- Staging git **esplicito**: mai `git add -A`; sull'albero lavorano altri agenti. Ogni step di commit elenca i file.
- Messaggi di commit Conventional, in italiano, con `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Il nome dell'istituto **non entra mai nel prompt**: `institution_slug` resta fuori da `LEARNER_PROFILE_LABELS`.
- Branch: `feature/orientation-referrals` (già creato, contiene lo spec).

## Scostamenti dallo spec, decisi durante la stesura del piano

Tre punti dove il codice reale impone una scelta migliore di quella scritta nello spec. Sono correzioni, non cambi di sostanza.

1. **`routing: "primary"`, non `"optional"`.** Tutte le skill guidate da intent (`certified-advice`, `reading-guide`, `profile-comparison`, `profile-wayfinder`) usano `routing: "primary"` e `slot: "directive_tail"`, e l'handler sposta il proprio materiale su `knowledge` con `SkillOutput(slot=...)`. `_ROUTING_RANK` in `skills/engine.py:58` dà il budget prima alle primarie: con `optional` la skill perderebbe caratteri contro `concept-diagram`.
2. **Nessun marker di policy.** `seed_skills()` è idempotente e crea skill e agganci mancanti a ogni avvio (`skills_seed.py:762`). I marker `apply_*_policy` servono a *migrare installazioni esistenti*; una skill nuova non ne ha bisogno. Basta una voce in `SKILL_SEEDS`.
3. **Nessun aggancio a `ContentLanguageVersion`.** Le letture passano da `served_locale()` perché il loro catalogo è governato dal sistema di versioni linguistiche. Il testo dei referenti lo scrive l'admin dell'istituto: qui basta una catena di fallback `lingua → en → it`. Agganciarlo alle versioni di contenuto è una decisione separata.

## File Structure

**Backend, nuovi**

| file | responsabilità |
|---|---|
| `backend/referral_needs.py` | vocabolario chiuso degli otto bisogni; estrazione dei bisogni dal testo |
| `backend/referral_frame.py` | cornice del blocco `[REFERRALS]` nelle sei lingue |
| `backend/referral_scope.py` | risoluzione degli istituti dello studente |
| `backend/orientation_referral_service.py` | retrieval di figure ed eventi, e resa del blocco |
| `backend/routes/institutions.py` | CRUD admin degli istituti + elenco pubblico |
| `backend/routes/orientation_referrals.py` | CRUD admin di figure ed eventi + directory dello studente |
| `backend/tests/test_referral_needs_scope.py` | vocabolario e scoping (parte pura + DB) |
| `backend/tests/test_orientation_referrals.py` | retrieval, guard di certificazione, handler |

**Backend, modificati**

| file | modifica |
|---|---|
| `backend/models.py` | `Institution`, `OrientationReferral`, `OrientationEvent`, `StudentGroup.institution_id` |
| `backend/main.py` | riga di `ALTER` idempotente; registrazione dei due router |
| `backend/schemas.py` | schemi Pydantic; `institution_slug` in `LEARNER_PROFILE_FIELDS` e `LearnerProfileSave` |
| `backend/skills/intents.py` | pattern e ordine dell'intent `referral` |
| `backend/skills/handlers.py` | handler `orientation_referrals` |
| `backend/skills_seed.py` | istruzioni EN e voce in `SKILL_SEEDS` |

**Frontend, nuovi**

| file | responsabilità |
|---|---|
| `frontend/src/lib/referrals-api.ts` | tipi e chiamate della directory e del pannello |
| `frontend/src/lib/i18n-referrals.ts` | dizionario nelle sei lingue |
| `frontend/src/components/admin/OrientationReferralsPanel.tsx` | pannello admin, due schede |
| `frontend/src/components/profile/OrientationDirectoryCard.tsx` | directory dello studente |
| `frontend/src/app/profilo/orientamento/page.tsx` | rotta della sezione |
| `frontend/src/app/profilo/orientamento/layout.tsx` | metadata della rotta |

**Frontend, modificati**

| file | modifica |
|---|---|
| `frontend/src/lib/i18n.ts` | merge di `REFERRAL_DICTS` nei sei dizionari |
| `frontend/src/components/profile/LearnerProfileCard.tsx` | campo `institution_slug` di tipo `select` |
| `frontend/src/app/profilo/page.tsx` | voce `orientation` in `PERSONAL_AREAS` e resa della sezione |
| `frontend/src/app/admin/page.tsx` | montaggio del pannello |

---

### Task 1: Vocabolario dei bisogni

**Files:**
- Create: `backend/referral_needs.py`
- Test: `backend/tests/test_referral_needs_scope.py`

**Interfaces:**
- Consumes: niente (primo task, modulo puro senza database)
- Produces: `REFERRAL_NEEDS: dict[str, dict]` (chiavi = codici bisogno, valori con `label` e `keywords`); `needs_from_text(text) -> set[str]`; `known_needs(codes) -> list[str]`

- [ ] **Step 1: Write the failing test**

Crea `backend/tests/test_referral_needs_scope.py`:

```python
"""Vocabolario dei bisogni e risoluzione dell'istituto dello studente.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_referral_needs_scope
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from backend.referral_needs import REFERRAL_NEEDS, known_needs, needs_from_text


# --- vocabolario dei bisogni -------------------------------------------------

def test_every_need_declares_label_and_keywords():
    assert len(REFERRAL_NEEDS) == 8
    for code, need in REFERRAL_NEEDS.items():
        assert need["label"].strip(), code
        assert need["keywords"], code


def test_needs_come_from_the_student_words():
    assert "disagio-emotivo" in needs_from_text("vorrei parlare con uno psicologo")
    assert "dsa-bes" in needs_from_text("ho una certificazione dsa, chi segue queste cose")
    assert "iscrizioni-scadenze" in needs_from_text("quando scadono le iscrizioni")
    assert "mobilita-estero" in needs_from_text("vorrei fare un erasmus")


def test_a_greeting_names_no_need():
    assert needs_from_text("ciao, grazie mille") == set()
    assert needs_from_text("") == set()


def test_known_needs_drops_what_is_not_in_the_vocabulary():
    assert known_needs(["scelta-percorso", "inventato"]) == ["scelta-percorso"]
    assert known_needs(None) == []


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"ok   {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}")
        except Exception as exc:
            failed += 1
            print(f"ERROR {test.__name__}: {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec counselorbot_backend python -m backend.tests.test_referral_needs_scope`
Expected: `ModuleNotFoundError: No module named 'backend.referral_needs'`

- [ ] **Step 3: Write minimal implementation**

Crea `backend/referral_needs.py`:

```python
"""Vocabolario controllato dei bisogni di orientamento.

Chiave d'aggancio di figure ed eventi, come `reading_themes` lo e' delle
letture. I temi di lettura non sono riusabili: dicono di cosa parla un'opera,
non quale servizio serve.

La lista e' chiusa di proposito. Un bisogno libero per riga renderebbe il
filtro inservibile e farebbe arrivare allo studente contatti a caso.

Nessun aggancio ai codici fattore: uno sportello non e' la conseguenza di un
punteggio, e legarcelo produrrebbe rimandi automatici che nessuno ha chiesto.
"""
from __future__ import annotations

import re
import unicodedata

REFERRAL_NEEDS: dict[str, dict] = {
    "scelta-percorso": {
        "label": "Scelta del percorso",
        "keywords": ["orientamento", "quale scuola", "quale corso", "quale facolta",
                     "cosa fare dopo", "indirizzo", "che universita", "iscrivermi a",
                     "orientation", "which course", "which degree", "what to do after"],
    },
    "metodo-di-studio": {
        "label": "Metodo di studio",
        "keywords": ["metodo di studio", "tutor", "recupero", "sportello didattico",
                     "aiuto nello studio", "ripetizioni", "study method", "tutoring"],
    },
    "disagio-emotivo": {
        "label": "Disagio emotivo",
        "keywords": ["psicolog", "sportello d ascolto", "sportello di ascolto", "ascolto",
                     "sto male", "ansia", "counselor", "consulenza psicologica",
                     "counselling", "mental health", "wellbeing"],
    },
    "dsa-bes": {
        "label": "DSA e bisogni educativi speciali",
        "keywords": ["dsa", "bes", "dislessia", "discalculia", "disabilita", "sostegno",
                     "referente inclusione", "pdp", "learning disability", "disability"],
    },
    "tirocinio-lavoro": {
        "label": "Tirocinio e lavoro",
        "keywords": ["tirocinio", "stage", "pcto", "alternanza", "lavoro", "placement",
                     "internship", "job", "career service"],
    },
    "borse-e-tasse": {
        "label": "Borse di studio e tasse",
        "keywords": ["borsa di studio", "borse", "tasse", "isee", "esonero", "diritto allo studio",
                     "scholarship", "tuition", "fees", "grant"],
    },
    "mobilita-estero": {
        "label": "Mobilita' e studio all'estero",
        "keywords": ["erasmus", "estero", "scambio", "mobilita", "exchange", "study abroad",
                     "mobility"],
    },
    "iscrizioni-scadenze": {
        "label": "Iscrizioni e scadenze",
        "keywords": ["iscrizion", "immatricolazion", "scadenza", "scadono", "bando",
                     "graduatoria", "test d ingresso", "enrolment", "enrollment", "deadline"],
    },
}


def _plain(text) -> str:
    normalized = unicodedata.normalize("NFKD", str(text or "").casefold())
    return "".join(char for char in normalized if not unicodedata.combining(char))


def needs_from_text(text) -> set[str]:
    """Bisogni nominati dallo studente. Insieme vuoto = nessun filtro."""
    plain = _plain(text)
    if not plain.strip():
        return set()
    found: set[str] = set()
    for code, need in REFERRAL_NEEDS.items():
        for keyword in need["keywords"]:
            if re.search(rf"\b{re.escape(_plain(keyword))}", plain):
                found.add(code)
                break
    return found


def known_needs(codes) -> list[str]:
    """Filtra una lista di bisogni tenendo solo quelli del vocabolario."""
    return [str(c).strip() for c in (codes or []) if str(c).strip() in REFERRAL_NEEDS]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec counselorbot_backend python -m backend.tests.test_referral_needs_scope`
Expected: `4/4 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/referral_needs.py backend/tests/test_referral_needs_scope.py
git commit -m "feat(orientamento): vocabolario chiuso dei bisogni di orientamento

Otto bisogni con etichetta e parole chiave, gemello di reading_themes ma
senza aggancio ai codici fattore: uno sportello non e' la conseguenza di
un punteggio.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Modelli e colonna

**Files:**
- Modify: `backend/models.py` (in fondo, dopo `GuidedStepSkill`), `backend/models.py:884` (`StudentGroup`), `backend/main.py:342-353` (lista degli `ALTER`)
- Test: `backend/tests/test_orientation_referrals.py`

**Interfaces:**
- Consumes: `REFERRAL_NEEDS` da Task 1 (solo come vocabolario dei valori ammessi in `needs`)
- Produces: `models.Institution`, `models.OrientationReferral`, `models.OrientationEvent`, `models.StudentGroup.institution_id`

- [ ] **Step 1: Write the failing test**

Crea `backend/tests/test_orientation_referrals.py` con l'intestazione, il bootstrap del DB dedicato e il primo test:

```python
"""Catalogo dei referenti e degli eventi di orientamento.

Retrieval su database Postgres DEDICATO ai test (`counselorbot_test`).

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_orientation_referrals
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit, urlunsplit

import psycopg2
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

from backend import database, models

TEST_DB_NAME = "counselorbot_test"
_prod = urlsplit(os.environ["DATABASE_URL"])
_test_url = urlunsplit((_prod.scheme, _prod.netloc, f"/{TEST_DB_NAME}", _prod.query, _prod.fragment))
_admin_url = urlunsplit((_prod.scheme, _prod.netloc, "/postgres", _prod.query, _prod.fragment))


def _ensure_test_database():
    conn = psycopg2.connect(_admin_url)
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TEST_DB_NAME,))
            if not cur.fetchone():
                cur.execute(f'CREATE DATABASE "{TEST_DB_NAME}"')
    finally:
        conn.close()


_ensure_test_database()
_engine = create_engine(_test_url)
_TestSession = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
database.Base.metadata.create_all(bind=_engine)

# Il modulo gira anche dopo le altre suite sullo stesso DB dedicato: parte
# senza righe residue, che altererebbero ordinamenti e limit.
with _TestSession() as _cleanup_db:
    _cleanup_db.query(models.OrientationEvent).delete(synchronize_session=False)
    _cleanup_db.query(models.OrientationReferral).delete(synchronize_session=False)
    _cleanup_db.query(models.Institution).delete(synchronize_session=False)
    _cleanup_db.commit()

PREFIX = f"t{uuid.uuid4().hex[:6]}"
NOW = datetime.now(timezone.utc)


def _institution(db, slug="istituto", **kwargs):
    data = dict(
        slug=f"{PREFIX}-{slug}", name="Liceo di prova", kind="school",
        website_url="https://esempio.test",
        orientation_page_url="https://esempio.test/orientamento",
        is_active=True,
    )
    data.update(kwargs)
    row = models.Institution(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _referral(db, slug="sportello", **kwargs):
    data = dict(
        slug=f"{PREFIX}-{slug}",
        role_label_i18n={"it": "Sportello d'ascolto", "en": "Listening desk"},
        needs=["disagio-emotivo"], audience=["secondaria"],
        contact_channel={"email": "sportello@esempio.test", "hours": "mar 10-12"},
        what_for_i18n={"it": "Puoi parlare di come stai."},
        how_to_reach_i18n={"it": "Passa in aula 12 negli orari indicati."},
        status="certified", is_active=True, sort_order=0,
    )
    data.update(kwargs)
    row = models.OrientationReferral(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _event(db, slug="openday", **kwargs):
    data = dict(
        slug=f"{PREFIX}-{slug}", kind="open-day",
        title_i18n={"it": "Open day"}, summary_i18n={"it": "Visita alla scuola."},
        starts_at=NOW + timedelta(days=10), ends_at=NOW + timedelta(days=10, hours=4),
        page_url="https://esempio.test/openday",
        needs=["scelta-percorso"], audience=["secondaria"],
        status="certified", is_active=True, sort_order=0,
    )
    data.update(kwargs)
    row = models.OrientationEvent(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _clear(db):
    db.query(models.OrientationEvent).delete(synchronize_session=False)
    db.query(models.OrientationReferral).delete(synchronize_session=False)
    db.query(models.Institution).delete(synchronize_session=False)
    db.commit()


# --- schema ------------------------------------------------------------------

def test_the_three_tables_and_the_group_column_exist():
    names = set(inspect(_engine).get_table_names())
    assert {"institutions", "orientation_referrals", "orientation_events"} <= names
    columns = {c["name"] for c in inspect(_engine).get_columns("student_groups")}
    assert "institution_id" in columns


def test_a_referral_and_an_event_can_be_stored_against_an_institution():
    db = _TestSession()
    try:
        institution = _institution(db)
        referral = _referral(db, institution_id=institution.id)
        event = _event(db, institution_id=institution.id)
        assert referral.institution_id == institution.id
        assert event.ends_at > NOW
        assert referral.needs == ["disagio-emotivo"]
    finally:
        _clear(db); db.close()


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"ok   {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}")
        except Exception as exc:
            failed += 1
            print(f"ERROR {test.__name__}: {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec counselorbot_backend python -m backend.tests.test_orientation_referrals`
Expected: `AttributeError: module 'backend.models' has no attribute 'OrientationEvent'`

- [ ] **Step 3: Write minimal implementation**

In `backend/models.py`, aggiungi la colonna a `StudentGroup` subito dopo `school_level`:

```python
    # Istituto della classe: fallback quando lo studente non lo ha scelto nel
    # taccuino. Nessuna FK dichiarata, come per le altre relazioni del modulo.
    institution_id = Column(Integer, index=True, nullable=True)
```

In fondo al file, dopo `GuidedStepSkill`:

```python
class Institution(Base):
    """Scuola o universita' a cui si agganciano referenti ed eventi.

    Esiste perche' l'URL della pagina di orientamento va scritto una volta
    sola, e perche' un istituto con dieci classi non va ridichiarato dieci
    volte. Il testo libero `student_groups.school` non regge il confronto fra
    «Liceo Galilei» e «L.S. Galilei».
    """

    __tablename__ = "institutions"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    kind = Column(String, nullable=False, default="school")   # school | university
    website_url = Column(String, nullable=True)
    orientation_page_url = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class OrientationReferral(Base):
    """Figura o ufficio a cui uno studente puo' rivolgersi.

    L'identita' primaria e' il RUOLO, non la persona: uno sportello sopravvive
    a chi lo tiene, e una riga che nomina qualcuno invecchia in un anno.
    `person_name` resta facoltativo, e solo per figure gia' pubbliche sul sito.

    `contact_channel` accetta il canale istituzionale — email d'ufficio,
    pagina, orari, stanza. Mai un recapito personale: queste righe raggiungono
    minorenni e finiscono nel contesto di un modello.
    """

    __tablename__ = "orientation_referrals"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, index=True, nullable=False)
    # NULL = riga nazionale, valida per ogni istituto.
    institution_id = Column(Integer, index=True, nullable=True)

    role_label_i18n = Column(JSON, nullable=False)     # {lang: "Sportello d'ascolto"}
    person_name = Column(String, nullable=True)

    needs = Column(JSON, nullable=True)                # chiave d'aggancio, obbligatoria
    audience = Column(JSON, nullable=True)             # ["secondaria", ...]
    questionnaire_types = Column(JSON, nullable=True)  # opzionale

    contact_channel = Column(JSON, nullable=True)      # {email, page_url, hours, location}
    what_for_i18n = Column(JSON, nullable=True)        # cosa puoi chiedere, una frase
    how_to_reach_i18n = Column(JSON, nullable=True)

    source_reference = Column(Text, nullable=True)
    certified_by = Column(String, nullable=True)
    status = Column(String, nullable=False, default="draft")   # draft | certified
    is_active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class OrientationEvent(Base):
    """Appuntamento o scadenza di orientamento.

    Differenza sostanziale rispetto a letture e strategie: **scade**. Il
    retrieval filtra su `ends_at`, quindi un open day passato sparisce senza
    che nessuno lo cancelli, e il catalogo non chiede manutenzione periodica.
    """

    __tablename__ = "orientation_events"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, index=True, nullable=False)
    institution_id = Column(Integer, index=True, nullable=True)

    # open-day | workshop | sportello | fiera | scadenza | webinar
    kind = Column(String, nullable=False, default="open-day")
    title_i18n = Column(JSON, nullable=False)
    summary_i18n = Column(JSON, nullable=True)

    starts_at = Column(DateTime(timezone=True), nullable=False)
    ends_at = Column(DateTime(timezone=True), nullable=False)
    registration_deadline = Column(DateTime(timezone=True), nullable=True)

    page_url = Column(String, nullable=True)
    location = Column(String, nullable=True)
    is_online = Column(Boolean, nullable=False, default=False)

    needs = Column(JSON, nullable=True)
    audience = Column(JSON, nullable=True)

    status = Column(String, nullable=False, default="draft")
    is_active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

In `backend/main.py`, nella lista degli `ALTER` idempotenti (dopo `("student_groups", "ADD COLUMN school_level VARCHAR")`, riga ~348):

```python
            ("student_groups", "ADD COLUMN institution_id INTEGER"),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec counselorbot_backend python -m backend.tests.test_orientation_referrals`
Expected: `2/2 passed`

Poi riavvia il backend perché l'`ALTER` giri sul database di sviluppo:

Run: `docker compose restart backend && docker compose logs --tail=40 backend`
Expected: nessun errore; la colonna `institution_id` compare in `student_groups`.

- [ ] **Step 5: Commit**

```bash
git add backend/models.py backend/main.py backend/tests/test_orientation_referrals.py
git commit -m "feat(orientamento): modelli di istituto, referenti ed eventi

Institution tiene una volta sola nome e pagina di orientamento;
OrientationReferral si identifica col ruolo e non con la persona;
OrientationEvent porta starts_at/ends_at perche' un evento scade e deve
sparire da se'. Colonna institution_id su student_groups per il fallback.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Risoluzione dell'istituto dello studente

**Files:**
- Create: `backend/referral_scope.py`
- Modify: `backend/tests/test_referral_needs_scope.py` (aggiunge la parte su database)

**Interfaces:**
- Consumes: `models.Institution`, `models.StudentGroup.institution_id` (Task 2)
- Produces: `NOT_LISTED: str` (la sentinella del taccuino); `institution_ids_for(db, username) -> list[int]` (istituti risolti, **senza** il `None` delle righe nazionali, che il servizio aggiunge da sé); `institution_for(db, username) -> models.Institution | None` (il primo, per l'intestazione della directory)

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_referral_needs_scope.py`, sopra il blocco `if __name__`, aggiungi il bootstrap del DB dedicato e i test di scoping. Riusa lo stesso schema di `test_orientation_referrals.py` (Task 2, Step 1) per `_ensure_test_database`, `_engine`, `_TestSession`, e aggiungi:

```python
import uuid
from urllib.parse import urlsplit, urlunsplit

import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import database, models
from backend.referral_scope import NOT_LISTED, institution_for, institution_ids_for

TEST_DB_NAME = "counselorbot_test"
_prod = urlsplit(os.environ["DATABASE_URL"])
_test_url = urlunsplit((_prod.scheme, _prod.netloc, f"/{TEST_DB_NAME}", _prod.query, _prod.fragment))
_admin_url = urlunsplit((_prod.scheme, _prod.netloc, "/postgres", _prod.query, _prod.fragment))


def _ensure_test_database():
    conn = psycopg2.connect(_admin_url)
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TEST_DB_NAME,))
            if not cur.fetchone():
                cur.execute(f'CREATE DATABASE "{TEST_DB_NAME}"')
    finally:
        conn.close()


_ensure_test_database()
_engine = create_engine(_test_url)
_TestSession = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
database.Base.metadata.create_all(bind=_engine)

PREFIX = f"t{uuid.uuid4().hex[:6]}"


def _institution(db, slug, **kwargs):
    row = models.Institution(slug=f"{PREFIX}-{slug}", name=f"Istituto {slug}",
                             kind="school", is_active=kwargs.pop("is_active", True), **kwargs)
    db.add(row); db.commit(); db.refresh(row)
    return row


def _notebook(db, username, institution_slug):
    data = {"context": "prova"}
    if institution_slug is not None:
        data["institution_slug"] = institution_slug
    row = models.LearnerProfileRevision(username=username, data=data, source="manual")
    db.add(row); db.commit()
    return row


def _class_with_institution(db, username, institution_id):
    group = models.StudentGroup(
        code=f"{PREFIX[:6].upper()}{uuid.uuid4().hex[:4].upper()}",
        name="Classe di prova", owner_username="docente", is_active=True,
        institution_id=institution_id,
    )
    db.add(group); db.commit(); db.refresh(group)
    db.add(models.GroupMembership(group_id=group.id, username=username, joined_via="teacher"))
    db.commit()
    return group


def _scope_clear(db, username):
    db.query(models.GroupMembership).filter(models.GroupMembership.username == username).delete()
    db.query(models.LearnerProfileRevision).filter(
        models.LearnerProfileRevision.username == username).delete()
    db.query(models.StudentGroup).filter(models.StudentGroup.owner_username == "docente").delete()
    db.query(models.Institution).filter(models.Institution.slug.like(f"{PREFIX}-%")).delete()
    db.commit()


# --- scoping -----------------------------------------------------------------

def test_the_notebook_wins_over_the_class():
    db = _TestSession(); user = f"{PREFIX}-a"
    try:
        mine = _institution(db, "mio")
        other = _institution(db, "altro")
        _class_with_institution(db, user, other.id)
        _notebook(db, user, mine.slug)
        assert institution_ids_for(db, user) == [mine.id]
        assert institution_for(db, user).id == mine.id
    finally:
        _scope_clear(db, user); db.close()


def test_without_a_notebook_the_class_supplies_the_institution():
    db = _TestSession(); user = f"{PREFIX}-b"
    try:
        school = _institution(db, "classe")
        _class_with_institution(db, user, school.id)
        assert institution_ids_for(db, user) == [school.id]
    finally:
        _scope_clear(db, user); db.close()


def test_the_not_listed_sentinel_does_not_block_the_class_fallback():
    db = _TestSession(); user = f"{PREFIX}-c"
    try:
        school = _institution(db, "sentinella")
        _class_with_institution(db, user, school.id)
        _notebook(db, user, NOT_LISTED)
        assert institution_ids_for(db, user) == [school.id]
    finally:
        _scope_clear(db, user); db.close()


def test_no_notebook_and_no_class_means_national_rows_only():
    db = _TestSession(); user = f"{PREFIX}-d"
    try:
        assert institution_ids_for(db, user) == []
        assert institution_for(db, user) is None
    finally:
        _scope_clear(db, user); db.close()


def test_a_deactivated_institution_counts_as_not_declared():
    db = _TestSession(); user = f"{PREFIX}-e"
    try:
        closed = _institution(db, "chiuso", is_active=False)
        _notebook(db, user, closed.slug)
        assert institution_ids_for(db, user) == []
    finally:
        _scope_clear(db, user); db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec counselorbot_backend python -m backend.tests.test_referral_needs_scope`
Expected: `ModuleNotFoundError: No module named 'backend.referral_scope'`

- [ ] **Step 3: Write minimal implementation**

Crea `backend/referral_scope.py`:

```python
"""Quali istituti valgono per questo studente.

Il taccuino vince perche' e' la persona a dichiararlo, e uno studente puo'
appartenere a una classe creata da un ricercatore esterno che non e' la sua
scuola. La classe e' il fallback perche' copre chi il taccuino non lo apre mai.

La sentinella `NOT_LISTED` viene salvata perche' l'interfaccia non richieda la
scelta a ogni apertura del taccuino, ma qui e' **ignorata**: non trovare il
proprio istituto in elenco non significa che la propria classe non lo sappia.

Le righe nazionali (`institution_id IS NULL`) non compaiono qui: valgono
sempre, e ad aggiungerle e' il servizio di retrieval.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from . import models

# Valore salvato dal taccuino quando lo studente sceglie «non trovo il mio
# istituto». Non e' uno slug: nessun istituto puo' chiamarsi cosi'.
NOT_LISTED = "__not_listed__"


def _declared_slug(db: Session, username: str) -> str:
    revision = (
        db.query(models.LearnerProfileRevision)
        .filter(models.LearnerProfileRevision.username == username)
        .order_by(models.LearnerProfileRevision.id.desc())
        .first()
    )
    if revision is None or not isinstance(revision.data, dict):
        return ""
    slug = str(revision.data.get("institution_slug") or "").strip()
    return "" if slug == NOT_LISTED else slug


def _from_classes(db: Session, username: str) -> list[int]:
    rows = (
        db.query(models.StudentGroup.institution_id)
        .join(models.GroupMembership, models.GroupMembership.group_id == models.StudentGroup.id)
        .filter(
            models.GroupMembership.username == username,
            models.StudentGroup.is_active.is_(True),
            models.StudentGroup.institution_id.isnot(None),
        )
        .all()
    )
    seen: list[int] = []
    for (institution_id,) in rows:
        if institution_id not in seen:
            seen.append(institution_id)
    return seen


def _active(db: Session, ids: list[int]) -> list[int]:
    if not ids:
        return []
    live = {
        row.id for row in
        db.query(models.Institution.id)
        .filter(models.Institution.id.in_(ids), models.Institution.is_active.is_(True))
        .all()
    }
    return [i for i in ids if i in live]


def institution_ids_for(db: Session, username: str) -> list[int]:
    """Istituti dello studente: taccuino, altrimenti classi. Solo quelli attivi."""
    owner = (username or "").strip()
    if db is None or not owner:
        return []

    slug = _declared_slug(db, owner)
    if slug:
        row = (
            db.query(models.Institution)
            .filter(models.Institution.slug == slug, models.Institution.is_active.is_(True))
            .first()
        )
        if row is not None:
            return [row.id]
        # Istituto dichiarato ma disattivato o sparito: vale come non
        # dichiarato, e il fallback riprende da capo.

    return _active(db, _from_classes(db, owner))


def institution_for(db: Session, username: str) -> models.Institution | None:
    """Il primo istituto risolto, per l'intestazione della directory."""
    ids = institution_ids_for(db, username)
    if not ids:
        return None
    return db.query(models.Institution).filter(models.Institution.id == ids[0]).first()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec counselorbot_backend python -m backend.tests.test_referral_needs_scope`
Expected: `9/9 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/referral_scope.py backend/tests/test_referral_needs_scope.py
git commit -m "feat(orientamento): risoluzione dell'istituto dello studente

Taccuino, poi classe. La sentinella «non trovo il mio istituto» viene
salvata per l'interfaccia ma ignorata dalla risoluzione: non trovarlo in
elenco non significa che la classe non lo sappia. Un istituto disattivato
vale come non dichiarato e lascia riprendere il fallback.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Cornice multilingua e servizio di retrieval

**Files:**
- Create: `backend/referral_frame.py`, `backend/orientation_referral_service.py`
- Modify: `backend/tests/test_orientation_referrals.py`

**Interfaces:**
- Consumes: `needs_from_text`, `known_needs` (Task 1); i tre modelli (Task 2); `reading_audience.audience_allows`
- Produces: `referral_frame.frame(language) -> dict[str, str]`; `orientation_referral_memory.retrieve_referrals(db, *, needs=(), institution_ids=(), audience_band=None, questionnaire_type="", language="it", limit=2) -> list[dict]`; `.retrieve_events(...) -> list[dict]` (stessa firma); `.render_context(referrals, events, language="it") -> str`

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_orientation_referrals.py`, sopra il blocco `if __name__`:

```python
from backend.orientation_referral_service import orientation_referral_memory
from backend.referral_frame import REFERRAL_FRAME, frame


def test_the_frame_covers_the_six_interface_languages():
    assert set(REFERRAL_FRAME) == {"it", "en", "es", "fr", "de", "sv"}
    for lang in REFERRAL_FRAME:
        assert frame(lang)["intro"].strip(), lang
    # Una lingua sconosciuta ricade sull'inglese, mai su una a caso.
    assert frame("pt") == frame("en")


def test_a_need_match_lets_a_referral_through():
    db = _TestSession()
    try:
        institution = _institution(db)
        _referral(db, institution_id=institution.id)
        out = orientation_referral_memory.retrieve_referrals(
            db, needs={"disagio-emotivo"}, institution_ids=[institution.id],
            audience_band="secondaria", language="it")
        assert [e["id"] for e in out] == [f"{PREFIX}-sportello"]
        block = orientation_referral_memory.render_context(out, [], "it")
        assert "[REFERRALS]" in block
        assert "Sportello d'ascolto" in block
    finally:
        _clear(db); db.close()


def test_a_row_without_needs_never_enters():
    db = _TestSession()
    try:
        institution = _institution(db)
        _referral(db, institution_id=institution.id, needs=[])
        out = orientation_referral_memory.retrieve_referrals(
            db, needs={"disagio-emotivo"}, institution_ids=[institution.id], language="it")
        assert out == []
        # Nemmeno senza filtro sui bisogni: una riga che entrerebbe ovunque
        # non e' una raccomandazione.
        assert orientation_referral_memory.retrieve_referrals(
            db, needs=set(), institution_ids=[institution.id], language="it") == []
    finally:
        _clear(db); db.close()


def test_an_empty_need_set_does_not_filter_by_need():
    db = _TestSession()
    try:
        institution = _institution(db)
        _referral(db, "uno", institution_id=institution.id, needs=["dsa-bes"])
        out = orientation_referral_memory.retrieve_referrals(
            db, needs=set(), institution_ids=[institution.id], language="it")
        assert [e["id"] for e in out] == [f"{PREFIX}-uno"]
    finally:
        _clear(db); db.close()


def test_a_draft_row_never_reaches_a_student():
    db = _TestSession()
    try:
        institution = _institution(db)
        _referral(db, institution_id=institution.id, status="draft")
        assert orientation_referral_memory.retrieve_referrals(
            db, needs={"disagio-emotivo"}, institution_ids=[institution.id], language="it") == []
    finally:
        _clear(db); db.close()


def test_another_institution_row_is_not_visible():
    db = _TestSession()
    try:
        mine = _institution(db, "mio")
        theirs = _institution(db, "loro")
        _referral(db, "loro-sportello", institution_id=theirs.id)
        assert orientation_referral_memory.retrieve_referrals(
            db, needs={"disagio-emotivo"}, institution_ids=[mine.id], language="it") == []
    finally:
        _clear(db); db.close()


def test_a_national_row_reaches_everyone():
    db = _TestSession()
    try:
        mine = _institution(db, "mio")
        _referral(db, "nazionale", institution_id=None)
        out = orientation_referral_memory.retrieve_referrals(
            db, needs={"disagio-emotivo"}, institution_ids=[mine.id], language="it")
        assert [e["id"] for e in out] == [f"{PREFIX}-nazionale"]
    finally:
        _clear(db); db.close()


def test_audience_excludes_the_wrong_band():
    db = _TestSession()
    try:
        institution = _institution(db)
        _referral(db, institution_id=institution.id, audience=["universita"])
        assert orientation_referral_memory.retrieve_referrals(
            db, needs={"disagio-emotivo"}, institution_ids=[institution.id],
            audience_band="secondaria", language="it") == []
    finally:
        _clear(db); db.close()


def test_a_past_event_is_never_returned():
    db = _TestSession()
    try:
        institution = _institution(db)
        _event(db, "passato", institution_id=institution.id,
               starts_at=NOW - timedelta(days=30), ends_at=NOW - timedelta(days=29))
        assert orientation_referral_memory.retrieve_events(
            db, needs={"scelta-percorso"}, institution_ids=[institution.id], language="it") == []
    finally:
        _clear(db); db.close()


def test_events_come_out_with_the_nearest_first():
    db = _TestSession()
    try:
        institution = _institution(db)
        _event(db, "lontano", institution_id=institution.id,
               starts_at=NOW + timedelta(days=40), ends_at=NOW + timedelta(days=41))
        _event(db, "vicino", institution_id=institution.id,
               starts_at=NOW + timedelta(days=2), ends_at=NOW + timedelta(days=3))
        out = orientation_referral_memory.retrieve_events(
            db, needs={"scelta-percorso"}, institution_ids=[institution.id],
            language="it", limit=5)
        assert [e["id"] for e in out] == [f"{PREFIX}-vicino", f"{PREFIX}-lontano"]
    finally:
        _clear(db); db.close()


def test_the_block_falls_back_to_english_then_italian():
    db = _TestSession()
    try:
        institution = _institution(db)
        _referral(db, institution_id=institution.id,
                  role_label_i18n={"en": "Listening desk"},
                  what_for_i18n={"it": "Puoi parlare di come stai."})
        out = orientation_referral_memory.retrieve_referrals(
            db, needs={"disagio-emotivo"}, institution_ids=[institution.id], language="sv")
        assert out[0]["role"] == "Listening desk"
        assert out[0]["what_for"] == "Puoi parlare di come stai."
    finally:
        _clear(db); db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec counselorbot_backend python -m backend.tests.test_orientation_referrals`
Expected: `ModuleNotFoundError: No module named 'backend.referral_frame'`

- [ ] **Step 3: Write minimal implementation**

Crea `backend/referral_frame.py`:

```python
"""Cornice testuale del blocco dei referenti, nelle sei lingue dell'interfaccia.

Le istruzioni comportamentali della skill restano in inglese (contratto unico,
`skills_seed`). Questo e' invece il materiale che il modello consegna al turno:
etichette di campo e direttiva d'uso, che accompagnano testi gia' nella lingua
dello studente. Lasciarle in italiano dentro un turno svedese farebbe parlare
due lingue allo stesso blocco.
"""
from __future__ import annotations

FALLBACK_LANGUAGE = "en"

_INTRO_IT = (
    "Elenco approvato: sono le uniche figure ed eventi che puoi nominare. "
    "Riporta nomi, orari, date e recapiti esattamente come scritti qui, al massimo "
    "due figure e due eventi. Non aggiungere contatti che non compaiano in questo elenco."
)
_INTRO_EN = (
    "Approved list: these are the only people, offices and events you may name. "
    "Report names, opening times, dates and contacts exactly as written here, at most "
    "two figures and two events. Do not add contacts absent from this list."
)

REFERRAL_FRAME: dict[str, dict[str, str]] = {
    "it": {
        "intro": _INTRO_IT,
        "referrals": "A chi rivolgersi",
        "events": "Appuntamenti e scadenze",
        "what_for": "Cosa puoi chiedere",
        "how_to_reach": "Come raggiungerla",
        "contact": "Contatto",
        "when": "Quando",
        "where": "Dove",
        "online": "online",
        "deadline": "Iscrizioni entro",
        "page": "Pagina",
        "empty": (
            "Nessun referente o evento approvato copre questa richiesta: dillo in una riga, "
            "rimanda alla pagina di orientamento dell'istituto e non inventare contatti."
        ),
    },
    "en": {
        "intro": _INTRO_EN,
        "referrals": "Who to turn to",
        "events": "Dates and deadlines",
        "what_for": "What you can bring them",
        "how_to_reach": "How to reach them",
        "contact": "Contact",
        "when": "When",
        "where": "Where",
        "online": "online",
        "deadline": "Register by",
        "page": "Page",
        "empty": (
            "No approved referral or event covers this request: say so in one line, point to "
            "the institution's orientation page and do not invent contacts."
        ),
    },
    "es": {
        "intro": _INTRO_EN,
        "referrals": "A quien dirigirse",
        "events": "Citas y plazos",
        "what_for": "Que puedes consultarle",
        "how_to_reach": "Como contactar",
        "contact": "Contacto",
        "when": "Cuando",
        "where": "Donde",
        "online": "en linea",
        "deadline": "Inscripciones hasta",
        "page": "Pagina",
        "empty": (
            "Ningun referente o evento aprobado cubre esta peticion: dilo en una linea, "
            "remite a la pagina de orientacion del centro y no inventes contactos."
        ),
    },
    "fr": {
        "intro": _INTRO_EN,
        "referrals": "A qui s'adresser",
        "events": "Rendez-vous et echeances",
        "what_for": "Ce que tu peux lui demander",
        "how_to_reach": "Comment la joindre",
        "contact": "Contact",
        "when": "Quand",
        "where": "Ou",
        "online": "en ligne",
        "deadline": "Inscriptions avant le",
        "page": "Page",
        "empty": (
            "Aucun referent ni evenement approuve ne couvre cette demande : dis-le en une ligne, "
            "renvoie a la page d'orientation de l'etablissement et n'invente aucun contact."
        ),
    },
    "de": {
        "intro": _INTRO_EN,
        "referrals": "An wen du dich wenden kannst",
        "events": "Termine und Fristen",
        "what_for": "Was du dort ansprechen kannst",
        "how_to_reach": "So erreichst du sie",
        "contact": "Kontakt",
        "when": "Wann",
        "where": "Wo",
        "online": "online",
        "deadline": "Anmeldung bis",
        "page": "Seite",
        "empty": (
            "Keine freigegebene Anlaufstelle und kein Termin deckt diese Frage ab: sag das in "
            "einer Zeile, verweise auf die Orientierungsseite der Schule und erfinde keine Kontakte."
        ),
    },
    "sv": {
        "intro": _INTRO_EN,
        "referrals": "Vem du kan vanda dig till",
        "events": "Tider och sista datum",
        "what_for": "Vad du kan ta upp",
        "how_to_reach": "Sa nar du dem",
        "contact": "Kontakt",
        "when": "Nar",
        "where": "Var",
        "online": "online",
        "deadline": "Anmalan senast",
        "page": "Sida",
        "empty": (
            "Ingen godkand kontaktperson eller handelse tacker den har fragan: sag det pa en rad, "
            "hanvisa till skolans orienteringssida och hitta inte pa kontakter."
        ),
    },
}


def frame(language: str) -> dict[str, str]:
    """Etichette nella lingua del turno. Lingua ignota: inglese, mai una a caso."""
    return REFERRAL_FRAME.get((language or "").strip().lower()) or REFERRAL_FRAME[FALLBACK_LANGUAGE]
```

Crea `backend/orientation_referral_service.py`:

```python
"""Recupero dei referenti e degli eventi pertinenti.

Cugino di `certified_reading_service`, con due differenze che vengono dalla
natura del materiale.

**Gli eventi scadono.** Il filtro su `ends_at` fa sparire da se' un open day
passato: nessuno deve ricordarsi di cancellarlo.

**Niente embedding.** Le letture usano il recupero semantico perche' il loro
catalogo e' grande e il match sfumato. Qui i bisogni sono otto e discreti: il
match insiemistico basta, e un embedding aggiungerebbe latenza e
non-determinismo a un problema che non li ha.

Regole non negoziabili implementate qui:
  - una riga senza bisogni non entra mai, nemmeno quando il filtro e' spento:
    una voce che entrerebbe ovunque non e' una raccomandazione;
  - solo `status == "certified"` raggiunge uno studente;
  - un istituto diverso dal proprio non e' visibile; le righe nazionali si';
  - la fascia di pubblico dichiarata non viene scavalcata.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy.orm import Session

from . import models
from .reading_audience import audience_allows
from .referral_frame import frame

MAX_REFERRAL_CONTEXT_CHARS = 1800
_I18N_FALLBACKS = ("en", "it")


def _i18n(data, language: str) -> str:
    """Testo nella lingua del turno, poi inglese, poi italiano."""
    if not isinstance(data, dict):
        return ""
    for lang in (language or "it", *_I18N_FALLBACKS):
        value = str(data.get(lang) or "").strip()
        if value:
            return value
    return ""


def _scoped(rows, institution_ids: Iterable[int]):
    allowed = {int(i) for i in institution_ids or ()}
    return [r for r in rows if r.institution_id is None or r.institution_id in allowed]


def _matches(row, wanted: set[str], audience_band, questionnaire: str) -> bool:
    row_needs = {str(n) for n in (row.needs or [])}
    if not row_needs:
        return False  # una voce che entra ovunque non e' una raccomandazione
    if wanted and not (row_needs & wanted):
        return False
    if not audience_allows(row.audience, audience_band):
        return False
    scope = {str(s).upper() for s in (getattr(row, "questionnaire_types", None) or [])}
    if scope and questionnaire and questionnaire.upper() not in scope:
        return False
    return True


class OrientationReferralMemory:
    def retrieve_referrals(
        self,
        db: Session,
        *,
        needs: Iterable[str] = (),
        institution_ids: Iterable[int] = (),
        audience_band: str | None = None,
        questionnaire_type: str = "",
        language: str = "it",
        limit: int = 2,
    ) -> list[dict]:
        wanted = {str(n) for n in needs}
        rows = (
            db.query(models.OrientationReferral)
            .filter(models.OrientationReferral.status == "certified",
                    models.OrientationReferral.is_active.is_(True))
            .order_by(models.OrientationReferral.sort_order.asc(),
                      models.OrientationReferral.id.asc())
            .all()
        )
        eligible = [
            row for row in _scoped(rows, institution_ids)
            if _matches(row, wanted, audience_band, questionnaire_type)
        ]
        # A parita', la riga del proprio istituto viene prima di quella nazionale.
        eligible.sort(key=lambda row: 0 if row.institution_id is not None else 1)
        return [self._render_referral(row, language) for row in eligible[:max(0, limit)]]

    def retrieve_events(
        self,
        db: Session,
        *,
        needs: Iterable[str] = (),
        institution_ids: Iterable[int] = (),
        audience_band: str | None = None,
        questionnaire_type: str = "",
        language: str = "it",
        limit: int = 2,
    ) -> list[dict]:
        wanted = {str(n) for n in needs}
        now = datetime.now(timezone.utc)
        rows = (
            db.query(models.OrientationEvent)
            .filter(models.OrientationEvent.status == "certified",
                    models.OrientationEvent.is_active.is_(True),
                    models.OrientationEvent.ends_at >= now)
            .order_by(models.OrientationEvent.starts_at.asc(),
                      models.OrientationEvent.id.asc())
            .all()
        )
        eligible = [
            row for row in _scoped(rows, institution_ids)
            if _matches(row, wanted, audience_band, questionnaire_type)
        ]
        return [self._render_event(row, language) for row in eligible[:max(0, limit)]]

    def _render_referral(self, row, language: str) -> dict:
        contact = row.contact_channel if isinstance(row.contact_channel, dict) else {}
        return {
            "id": row.slug,
            "role": _i18n(row.role_label_i18n, language),
            "person": (row.person_name or "").strip(),
            "needs": list(row.needs or []),
            "what_for": _i18n(row.what_for_i18n, language),
            "how_to_reach": _i18n(row.how_to_reach_i18n, language),
            "email": str(contact.get("email") or "").strip(),
            "hours": str(contact.get("hours") or "").strip(),
            "location": str(contact.get("location") or "").strip(),
            "page_url": str(contact.get("page_url") or "").strip(),
            "institution_id": row.institution_id,
        }

    def _render_event(self, row, language: str) -> dict:
        return {
            "id": row.slug,
            "kind": row.kind,
            "title": _i18n(row.title_i18n, language),
            "summary": _i18n(row.summary_i18n, language),
            "needs": list(row.needs or []),
            "starts_at": row.starts_at.isoformat() if row.starts_at else "",
            "ends_at": row.ends_at.isoformat() if row.ends_at else "",
            "registration_deadline": (
                row.registration_deadline.isoformat() if row.registration_deadline else ""
            ),
            "page_url": (row.page_url or "").strip(),
            "location": (row.location or "").strip(),
            "is_online": bool(row.is_online),
            "institution_id": row.institution_id,
        }

    def render_context(self, referrals: list[dict], events: list[dict], language: str = "it") -> str:
        """Blocco `[REFERRALS]` per il prompt, nella lingua del turno.

        Il tag resta invariato: e' un marcatore per il motore, non una frase."""
        if not referrals and not events:
            return ""
        label = frame(language)
        lines = ["[REFERRALS]", label["intro"]]

        if referrals:
            lines.append(f"{label['referrals']}:")
            for entry in referrals:
                head = f"- {entry['role']}"
                if entry["person"]:
                    head += f" ({entry['person']})"
                lines.append(head)
                if entry["what_for"]:
                    lines.append(f"    {label['what_for']}: {entry['what_for']}")
                if entry["how_to_reach"]:
                    lines.append(f"    {label['how_to_reach']}: {entry['how_to_reach']}")
                contact = " · ".join(p for p in (entry["hours"], entry["location"],
                                                 entry["email"], entry["page_url"]) if p)
                if contact:
                    lines.append(f"    {label['contact']}: {contact}")

        if events:
            lines.append(f"{label['events']}:")
            for entry in events:
                lines.append(f"- {entry['title']}")
                if entry["summary"]:
                    lines.append(f"    {entry['summary']}")
                when = entry["starts_at"][:16].replace("T", " ")
                lines.append(f"    {label['when']}: {when}")
                where = label["online"] if entry["is_online"] else entry["location"]
                if where:
                    lines.append(f"    {label['where']}: {where}")
                if entry["registration_deadline"]:
                    deadline = entry["registration_deadline"][:10]
                    lines.append(f"    {label['deadline']}: {deadline}")
                if entry["page_url"]:
                    lines.append(f"    {label['page']}: {entry['page_url']}")

        return "\n".join(lines)[:MAX_REFERRAL_CONTEXT_CHARS]


orientation_referral_memory = OrientationReferralMemory()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec counselorbot_backend python -m backend.tests.test_orientation_referrals`
Expected: `13/13 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/referral_frame.py backend/orientation_referral_service.py backend/tests/test_orientation_referrals.py
git commit -m "feat(orientamento): retrieval di referenti ed eventi

Filtro su bisogni, istituto, fascia di pubblico e stato certificato. Gli
eventi filtrano su ends_at e escono col piu' vicino per primo: un open day
passato sparisce da se'. Una riga senza bisogni non entra mai, nemmeno a
filtro spento. Cornice del blocco nelle sei lingue.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Intent, handler e seed della skill

**Files:**
- Modify: `backend/skills/intents.py:19-121`, `backend/skills/handlers.py` (in fondo), `backend/skills_seed.py:180` e `:237`
- Test: `backend/tests/test_orientation_referrals.py`, `backend/tests/test_skills_intents.py`

**Interfaces:**
- Consumes: `needs_from_text` (Task 1), `institution_ids_for` (Task 3), `orientation_referral_memory` + `frame` (Task 4), `SkillContext`/`SkillOutput`
- Produces: intent `"referral"` da `intents.classify`; handler registrato col nome `"orientation_referrals"`; skill `referral-guide` in `SKILL_SEEDS`

**Ordine dell'intent — leggere prima di scrivere.** `classify()` ritorna **un solo** intent scorrendo una tupla ordinata (`intents.py:130`). `referral` va inserito **prima di `factual`**, perché il pattern factual contiene `chi\s+(?:e|era|sono|erano)\s+\w` e catturerebbe «chi è il referente DSA». È sicuro solo se il pattern di referral è stretto: richiede un sostantivo di servizio (sportello, referente, tutor, open day) oppure la costruzione esplicita «a chi rivolgersi». «Chi è Vygotskij» non contiene nessuno dei due e resta factual.

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_skills_intents.py`, in fondo prima dell'eventuale runner:

```python
def test_referral_is_recognised_and_does_not_steal_factual_questions():
    from backend.skills.intents import classify
    assert classify("a chi posso rivolgermi per l'ansia?") == "referral"
    assert classify("c'e' uno sportello di ascolto?") == "referral"
    assert classify("quando e' l'open day?") == "referral"
    assert classify("chi e' il referente DSA?") == "referral"
    assert classify("who can I talk to about this?") == "referral"
    # Non deve rubare le domande enciclopediche ne' quelle sulle letture.
    assert classify("chi e' Vygotskij?") == "factual"
    assert classify("mi consigli una lettura?") == "reading"
```

In `backend/tests/test_orientation_referrals.py`, sopra il runner:

```python
from backend.skills import handlers
from backend.skills.context import SkillContext


def _ctx(**kwargs):
    base = dict(questionnaire_type="QSA", step_id=None, step_mode=None, language="it")
    base.update(kwargs)
    return SkillContext(**base)


def test_the_handler_declares_itself_inapplicable_on_an_empty_catalogue():
    db = _TestSession()
    try:
        out = handlers.get_handler("orientation_referrals")(
            _ctx(db=db, message="a chi posso rivolgermi?", session_id="s1"), {})
        assert out.applicable is False
        assert out.reason
    finally:
        _clear(db); db.close()


def test_the_handler_puts_the_catalogue_in_the_knowledge_slot():
    db = _TestSession()
    try:
        _referral(db, "nazionale", institution_id=None)
        out = handlers.get_handler("orientation_referrals")(
            _ctx(db=db, message="vorrei parlare con uno psicologo", session_id="s2"), {})
        assert out.applicable is True
        assert out.slot == "knowledge"
        assert "[REFERRALS]" in out.text
        assert out.ids == [f"{PREFIX}-nazionale"]
    finally:
        _clear(db); db.close()


def test_the_seeded_skill_is_intent_gated_and_bound_everywhere():
    from backend.skills_seed import ENGINE_INSTRUMENTS, SKILL_SEEDS
    seed = next(s for s in SKILL_SEEDS if s["slug"] == "referral-guide")
    assert seed["conditions"] == {"intents": ["referral"]}
    assert seed["handler"] == "orientation_referrals"
    assert seed["routing"] == "primary"
    assert seed["instructions_i18n"].get("en", "").strip()
    assert tuple(seed["bind_instruments"]) == ENGINE_INSTRUMENTS
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec counselorbot_backend python -m backend.tests.test_skills_intents`
Expected: `KeyError: 'referral'` oppure l'assert su `classify(...) == "referral"` che fallisce con `""`.

Run: `docker exec counselorbot_backend python -m backend.tests.test_orientation_referrals`
Expected: `TypeError: 'NoneType' object is not callable` (handler non registrato).

- [ ] **Step 3: Write minimal implementation**

In `backend/skills/intents.py`, dentro `_PATTERNS`, aggiungi la voce (prima di `"factual"` per leggibilità; l'ordine che conta è quello di `classify`):

```python
    # Chi puo' aiutare dal vivo: una persona, un ufficio, un appuntamento.
    # Pattern stretto di proposito: senza un sostantivo di servizio o la
    # costruzione esplicita "a chi rivolgersi", "chi e' X" resta una domanda
    # enciclopedica e deve restare a `factual`.
    "referral": re.compile(
        r"\b(?:sportello|referente|tutor\b|orientatore|orientatrice|"
        r"psicolog|counsell?or\s+scolastic|segreteria|ufficio\s+\w+|"
        r"open\s?day|porte\s+aperte|help\s?desk|career\s+service|"
        r"student\s+(?:services|support)|welcome\s+desk|"
        r"a\s+chi\s+(?:mi\s+)?(?:posso\s+)?(?:rivolg|chied|parl)|"
        r"con\s+chi\s+(?:posso\s+)?parl|chi\s+(?:mi\s+)?puo\s+aiutar|"
        r"who\s+can\s+i\s+(?:talk|speak|turn)|who\s+should\s+i\s+(?:ask|contact)|"
        r"quien\s+me\s+puede\s+ayudar|a\s+quien\s+me\s+dirijo|"
        r"a\s+qui\s+(?:je\s+)?m\W?adress|qui\s+peut\s+m\W?aider|"
        r"an\s+wen\s+kann\s+ich\s+mich\s+wenden|wer\s+kann\s+mir\s+helfen|"
        r"vem\s+kan\s+jag\s+(?:prata|vanda))"
    ),
```

Nella tupla di `classify` (riga ~130), inserisci `referral` subito dopo `compare`:

```python
    for intent in ("compare", "referral", "factual", "reading", "advice", "clarify"):
```

E aggiorna la docstring di `classify`:

```python
    """Ritorna compare|referral|factual|reading|advice|clarify|guided oppure "".

    L'ordine e' intenzionale: un confronto o una lettura possono contenere la
    parola "strategia/consiglio", ma restano comportamenti piu' specifici. La
    domanda fattuale precede la lettura perche' "di cosa parla quel libro"
    chiede un dato su un'opera, non una nuova raccomandazione. `referral`
    precede `factual` perche' "chi e' il referente DSA" e' una richiesta di
    contatto, non una voce di enciclopedia: il suo pattern e' stretto apposta,
    cosi' "chi e' Vygotskij" resta a `factual`.
    """
```

In `backend/skills/handlers.py`, aggiungi gli import in cima:

```python
from ..orientation_referral_service import orientation_referral_memory
from ..referral_frame import frame as referral_frame
from ..referral_needs import needs_from_text
from ..referral_scope import institution_ids_for
```

e l'handler in fondo al file:

```python
@handler("orientation_referrals")
def orientation_referrals(ctx: SkillContext, params: dict) -> SkillOutput:
    """Figure ed eventi di orientamento del proprio istituto.

    Il modello riceve righe certificate, mai la scuola dello studente: il nome
    dell'istituto e' quasi-identificante e resta fuori dal prompt. Quando lo
    studente non nomina un bisogno specifico il filtro si spegne — l'intent ha
    gia' fatto da gate — ma una riga senza bisogni non entra comunque.
    """
    if ctx.db is None:
        return SkillOutput(applicable=False, reason="nessun database")

    needs = needs_from_text(ctx.message or ctx.query)
    institution_ids = institution_ids_for(ctx.db, ctx.session_username or "")
    language = ctx.language or "it"

    referrals = orientation_referral_memory.retrieve_referrals(
        ctx.db,
        needs=needs,
        institution_ids=institution_ids,
        audience_band=ctx.audience_band,
        questionnaire_type=ctx.questionnaire_type,
        language=language,
        limit=int(params.get("limit_referrals", 2) or 0),
    )
    events = orientation_referral_memory.retrieve_events(
        ctx.db,
        needs=needs,
        institution_ids=institution_ids,
        audience_band=ctx.audience_band,
        language=language,
        limit=int(params.get("limit_events", 2) or 0),
    )
    if not referrals and not events:
        # L'assenza e' una direttiva, non un dato: resta nello slot della skill
        # cosi' raggiunge il modello anche senza blocco [KNOWLEDGE].
        return SkillOutput(text=referral_frame(language)["empty"])

    return SkillOutput(
        text=orientation_referral_memory.render_context(referrals, events, language),
        ids=[entry["id"] for entry in (*referrals, *events)],
        slot="knowledge",
    )
```

`SkillContext` non ha oggi il campo `session_username`. Aggiungilo in `backend/skills/context.py`, accanto a `session_id`:

```python
    # Chi sta parlando: serve a risolvere il suo istituto. Mai iniettato nel
    # prompt, e' solo una chiave di lettura.
    session_username: str = ""
```

e valorizzalo dove `chat_logic` costruisce il contesto (cerca `SkillContext(` in `backend/chat_logic.py` e passa lo username già disponibile nella funzione).

In `backend/skills_seed.py`, aggiungi la costante delle istruzioni accanto alle altre:

```python
REFERRAL_GUIDE_INSTRUCTIONS_EN = """## Referral and event guidance

- Name only the people, offices and events listed in [REFERRALS]. Never invent
  a name, an address, an email, an opening time or a date.
- Suggest at most two figures and two events.
- For each figure, say in one sentence what the student can bring to them, then
  how to reach them, in the student's own words.
- A referral is an option, never an instruction: the student decides.
- If the list holds nothing for what they asked, say so plainly and point to the
  institution's orientation page. Do not fill the gap from memory.
- A referral never replaces urgent help. If the student describes something that
  cannot wait, say that first and do not turn it into a list of offices.
- Never show internal identifiers, slugs or need codes.
"""
```

registrala in `SKILL_INSTRUCTIONS_I18N`:

```python
    "referral-guide": {"en": REFERRAL_GUIDE_INSTRUCTIONS_EN},
```

e aggiungi la voce in fondo a `SKILL_SEEDS`:

```python
    {
        "slug": "referral-guide",
        "name": "Referenti ed eventi di orientamento",
        "description": (
            "Figure, uffici ed eventi certificati del proprio istituto, da usare quando "
            "lo studente chiede a chi rivolgersi o quando c'e' un appuntamento. "
            "Porta contatti verificati, non consigli."
        ),
        "instructions_i18n": SKILL_INSTRUCTIONS_I18N["referral-guide"],
        "conditions": {"intents": ["referral"]},
        "handler": "orientation_referrals",
        "handler_params": {"limit_referrals": 2, "limit_events": 2},
        "routing": "primary",
        "slot": "directive_tail",
        "max_chars": 2000,
        "sort_order": 60,
        "is_active": True,
        "bind": True,
        "bind_instruments": ENGINE_INSTRUMENTS,
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker exec counselorbot_backend python -m backend.tests.test_skills_intents`
Expected: tutti i test passano, incluso il nuovo.

Run: `docker exec counselorbot_backend python -m backend.tests.test_orientation_referrals`
Expected: `16/16 passed`

Run: `docker exec counselorbot_backend python -m backend.tests.test_skills_parity && docker exec counselorbot_backend python -m backend.tests.test_skills_engine`
Expected: nessuna regressione.

Riavvia il backend perché `seed_skills` crei la riga e gli agganci:

Run: `docker compose restart backend && docker compose logs --tail=30 backend | grep -i "seed skill"`
Expected: `Seed skill creata: referral-guide`

- [ ] **Step 5: Commit**

```bash
git add backend/skills/intents.py backend/skills/handlers.py backend/skills/context.py backend/chat_logic.py backend/skills_seed.py backend/tests/test_orientation_referrals.py backend/tests/test_skills_intents.py
git commit -m "feat(orientamento): skill referral-guide su intent esplicito

Nuovo intent referral, stretto e collocato prima di factual perche' «chi
e' il referente DSA» e' una richiesta di contatto, non una voce di
enciclopedia. L'handler consegna righe certificate e mai il nome della
scuola: e' un dato quasi-identificante e resta fuori dal prompt.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Schemi e route degli istituti

**Files:**
- Create: `backend/routes/institutions.py`
- Modify: `backend/schemas.py` (in fondo), `backend/main.py:70-72` e `:1698`
- Test: `backend/tests/test_orientation_referrals.py`

**Interfaces:**
- Consumes: `models.Institution` (Task 2)
- Produces: `schemas.InstitutionBase/Create/Update/Response`; endpoint `GET /institutions` (pubblico, autenticato), `GET|POST|PUT|DELETE /admin/institutions`

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_orientation_referrals.py`, sopra il runner:

```python
def test_the_public_institution_list_exposes_no_internal_fields():
    from backend import schemas
    fields = set(schemas.InstitutionPublic.model_fields)
    assert fields == {"id", "slug", "name", "kind", "orientation_page_url", "website_url"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec counselorbot_backend python -m backend.tests.test_orientation_referrals`
Expected: `AttributeError: module 'backend.schemas' has no attribute 'InstitutionPublic'`

- [ ] **Step 3: Write minimal implementation**

In fondo a `backend/schemas.py`:

```python
# --- Istituti, referenti ed eventi di orientamento ---

class InstitutionBase(BaseModel):
    slug: str
    name: str
    kind: str = "school"          # school | university
    website_url: Optional[str] = None
    orientation_page_url: Optional[str] = None
    is_active: bool = True


class InstitutionCreate(InstitutionBase):
    pass


class InstitutionUpdate(BaseModel):
    name: Optional[str] = None
    kind: Optional[str] = None
    website_url: Optional[str] = None
    orientation_page_url: Optional[str] = None
    is_active: Optional[bool] = None


class InstitutionResponse(InstitutionBase):
    id: int

    class Config:
        from_attributes = True


class InstitutionPublic(BaseModel):
    """Quel che uno studente puo' vedere per scegliere il proprio istituto."""
    id: int
    slug: str
    name: str
    kind: str
    website_url: Optional[str] = None
    orientation_page_url: Optional[str] = None

    class Config:
        from_attributes = True
```

Crea `backend/routes/institutions.py`:

```python
"""Anagrafica degli istituti: CRUD admin ed elenco per lo studente.

L'elenco pubblico serve al select del taccuino. Espone solo nome, tipo e le
pagine istituzionali: nulla che riguardi le persone.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas

router = APIRouter()
get_db = database.get_db

VALID_KINDS = {"school", "university"}


def _fetch(db: Session, institution_id: int) -> models.Institution:
    row = db.query(models.Institution).filter(models.Institution.id == institution_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Istituto non trovato")
    return row


def _validate(row: models.Institution) -> None:
    if (row.kind or "") not in VALID_KINDS:
        raise HTTPException(status_code=400, detail="Tipo non valido: school o university")
    if not (row.name or "").strip():
        raise HTTPException(status_code=400, detail="Nome obbligatorio")


@router.get("/institutions", response_model=List[schemas.InstitutionPublic])
async def list_institutions(
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Istituti attivi, per il selettore del taccuino."""
    return (
        db.query(models.Institution)
        .filter(models.Institution.is_active.is_(True))
        .order_by(models.Institution.name.asc())
        .all()
    )


@router.get("/admin/institutions", response_model=List[schemas.InstitutionResponse])
async def admin_list_institutions(
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    return db.query(models.Institution).order_by(models.Institution.name.asc()).all()


@router.post("/admin/institutions", response_model=schemas.InstitutionResponse)
async def create_institution(
    payload: schemas.InstitutionCreate,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    slug = (payload.slug or "").strip()
    if not slug:
        raise HTTPException(status_code=400, detail="slug obbligatorio")
    if db.query(models.Institution).filter(models.Institution.slug == slug).first():
        raise HTTPException(status_code=409, detail="slug gia' presente")
    row = models.Institution(**payload.model_dump())
    row.slug = slug
    _validate(row)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/admin/institutions/{institution_id}", response_model=schemas.InstitutionResponse)
async def update_institution(
    institution_id: int,
    payload: schemas.InstitutionUpdate,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    row = _fetch(db, institution_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    _validate(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/admin/institutions/{institution_id}")
async def delete_institution(
    institution_id: int,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Disattiva invece di cancellare: le righe del taccuino citano lo slug,
    e cancellarlo renderebbe illeggibile la storia gia' scritta."""
    row = _fetch(db, institution_id)
    row.is_active = False
    db.commit()
    return {"status": "deactivated", "id": institution_id}
```

In `backend/main.py`, accanto agli altri import di route (riga ~70):

```python
from .routes import institutions as institutions_routes
```

e accanto agli altri `include_router` (riga ~1698):

```python
app.include_router(institutions_routes.router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec counselorbot_backend python -m backend.tests.test_orientation_referrals`
Expected: `17/17 passed`

Run: `docker compose restart backend && curl -s -o /dev/null -w "%{http_code}\n" localhost:8000/institutions`
Expected: `401` o `403` (senza header di autenticazione), non `404`: la rotta è montata.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/institutions.py backend/schemas.py backend/main.py backend/tests/test_orientation_referrals.py
git commit -m "feat(orientamento): anagrafica degli istituti

CRUD admin ed elenco per il selettore del taccuino, che espone solo nome,
tipo e pagine istituzionali. La cancellazione disattiva invece di
eliminare: il taccuino cita lo slug, e cancellarlo renderebbe illeggibile
la storia gia' scritta.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Route admin di referenti ed eventi, con i guard di certificazione

**Files:**
- Create: `backend/routes/orientation_referrals.py`
- Modify: `backend/schemas.py` (in fondo), `backend/main.py` (import e `include_router`)
- Test: `backend/tests/test_orientation_referrals.py`

**Interfaces:**
- Consumes: `REFERRAL_NEEDS`, `known_needs` (Task 1); i modelli (Task 2)
- Produces: `schemas.OrientationReferralCreate/Update/Response`, `schemas.OrientationEventCreate/Update/Response`; `_guard_referral(row)` e `_guard_event(row)` (esportati per i test); endpoint `/admin/referral-needs`, `/admin/orientation-referrals`, `/admin/orientation-events`

**Perché i guard stanno qui e non nel modello.** Una riga in bozza può essere incompleta: è il passaggio a `certified` che deve poter essere consegnato a uno studente. Stesso taglio di `routes/certified_readings.py:43`.

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_orientation_referrals.py`, sopra il runner:

```python
from fastapi import HTTPException

from backend.routes.orientation_referrals import _guard_event, _guard_referral


def _guard_raises(fn, row) -> str:
    try:
        fn(row)
    except HTTPException as exc:
        return str(exc.detail)
    return ""


def test_a_draft_row_is_never_guarded():
    row = models.OrientationReferral(slug="x", role_label_i18n={}, status="draft")
    assert _guard_raises(_guard_referral, row) == ""


def test_certifying_a_referral_needs_a_need_from_the_vocabulary():
    row = models.OrientationReferral(
        slug="x", role_label_i18n={"it": "Sportello"}, needs=[], status="certified",
        what_for_i18n={"it": "cosa"}, contact_channel={"email": "a@b.test"})
    assert "bisogno" in _guard_raises(_guard_referral, row)

    row.needs = ["inventato"]
    assert "vocabolario" in _guard_raises(_guard_referral, row)


def test_certifying_a_referral_needs_a_role_a_reason_and_a_channel():
    base = dict(slug="x", needs=["dsa-bes"], status="certified")
    no_role = models.OrientationReferral(role_label_i18n={}, **base)
    assert "ruolo" in _guard_raises(_guard_referral, no_role)

    no_reason = models.OrientationReferral(
        role_label_i18n={"it": "Referente"}, what_for_i18n={}, **base)
    assert "puo' chiedere" in _guard_raises(_guard_referral, no_reason)

    no_channel = models.OrientationReferral(
        role_label_i18n={"it": "Referente"}, what_for_i18n={"it": "cosa"},
        contact_channel={}, **base)
    assert "contatto" in _guard_raises(_guard_referral, no_channel)


def test_certifying_an_event_needs_a_page_and_an_end():
    base = dict(slug="e", needs=["scelta-percorso"], status="certified",
                title_i18n={"it": "Open day"}, starts_at=NOW)
    no_page = models.OrientationEvent(page_url="", ends_at=NOW + timedelta(hours=2), **base)
    assert "page_url" in _guard_raises(_guard_event, no_page)

    no_end = models.OrientationEvent(page_url="https://x.test", ends_at=None, **base)
    assert "fine" in _guard_raises(_guard_event, no_end)


def test_an_off_domain_email_is_a_warning_and_not_a_block():
    from backend.routes.orientation_referrals import warn_off_domain_email

    institution = models.Institution(slug="x", name="Liceo", kind="school",
                                     website_url="https://liceogalilei.test")
    row = models.OrientationReferral(
        slug="x", role_label_i18n={"it": "Sportello"}, needs=["dsa-bes"],
        what_for_i18n={"it": "cosa"}, status="certified",
        contact_channel={"email": "sportello@gmail.test"})
    assert "non e' sul dominio" in warn_off_domain_email(row, institution)
    # Nessun blocco: la voce si certifica lo stesso.
    assert _guard_raises(_guard_referral, row) == ""

    row.contact_channel = {"email": "sportello@liceogalilei.test"}
    assert warn_off_domain_email(row, institution) == ""


def test_an_event_cannot_end_before_it_starts():
    row = models.OrientationEvent(
        slug="e", needs=["scelta-percorso"], status="certified",
        title_i18n={"it": "Open day"}, page_url="https://x.test",
        starts_at=NOW + timedelta(days=2), ends_at=NOW + timedelta(days=1))
    assert "prima" in _guard_raises(_guard_event, row)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec counselorbot_backend python -m backend.tests.test_orientation_referrals`
Expected: `ModuleNotFoundError: No module named 'backend.routes.orientation_referrals'`

- [ ] **Step 3: Write minimal implementation**

In fondo a `backend/schemas.py`, dopo gli schemi degli istituti:

```python
class OrientationReferralBase(BaseModel):
    slug: str
    institution_id: Optional[int] = None
    role_label_i18n: Dict[str, str]
    person_name: Optional[str] = None
    needs: Optional[List[str]] = None
    audience: Optional[List[str]] = None
    questionnaire_types: Optional[List[str]] = None
    contact_channel: Optional[Dict[str, Any]] = None
    what_for_i18n: Optional[Dict[str, str]] = None
    how_to_reach_i18n: Optional[Dict[str, str]] = None
    source_reference: Optional[str] = None
    certified_by: Optional[str] = None
    status: str = "draft"
    is_active: bool = True
    sort_order: int = 0


class OrientationReferralCreate(OrientationReferralBase):
    pass


class OrientationReferralUpdate(BaseModel):
    institution_id: Optional[int] = None
    role_label_i18n: Optional[Dict[str, str]] = None
    person_name: Optional[str] = None
    needs: Optional[List[str]] = None
    audience: Optional[List[str]] = None
    questionnaire_types: Optional[List[str]] = None
    contact_channel: Optional[Dict[str, Any]] = None
    what_for_i18n: Optional[Dict[str, str]] = None
    how_to_reach_i18n: Optional[Dict[str, str]] = None
    source_reference: Optional[str] = None
    certified_by: Optional[str] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class OrientationReferralResponse(OrientationReferralBase):
    id: int

    class Config:
        from_attributes = True


class OrientationEventBase(BaseModel):
    slug: str
    institution_id: Optional[int] = None
    kind: str = "open-day"
    title_i18n: Dict[str, str]
    summary_i18n: Optional[Dict[str, str]] = None
    starts_at: datetime
    ends_at: datetime
    registration_deadline: Optional[datetime] = None
    page_url: Optional[str] = None
    location: Optional[str] = None
    is_online: bool = False
    needs: Optional[List[str]] = None
    audience: Optional[List[str]] = None
    status: str = "draft"
    is_active: bool = True
    sort_order: int = 0


class OrientationEventCreate(OrientationEventBase):
    pass


class OrientationEventUpdate(BaseModel):
    institution_id: Optional[int] = None
    kind: Optional[str] = None
    title_i18n: Optional[Dict[str, str]] = None
    summary_i18n: Optional[Dict[str, str]] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    registration_deadline: Optional[datetime] = None
    page_url: Optional[str] = None
    location: Optional[str] = None
    is_online: Optional[bool] = None
    needs: Optional[List[str]] = None
    audience: Optional[List[str]] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class OrientationEventResponse(OrientationEventBase):
    id: int

    class Config:
        from_attributes = True


class OrientationDirectoryResponse(BaseModel):
    """Quel che la pagina dell'area personale mostra allo studente."""
    institution: Optional[InstitutionPublic] = None
    referrals: List[Dict[str, Any]] = Field(default_factory=list)
    events: List[Dict[str, Any]] = Field(default_factory=list)
```

Crea `backend/routes/orientation_referrals.py`:

```python
"""Catalogo dei referenti e degli eventi: CRUD admin e directory dello studente.

Le voci nascono in bozza. Entrano nella chat e nella pagina dello studente solo
quando un admin le porta a `certified`, e la certificazione e' bloccata finche'
mancano i dati minimi: un bisogno del vocabolario, il motivo per cui rivolgersi
a quella figura e un canale per raggiungerla.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas
from ..orientation_referral_service import orientation_referral_memory
from ..reading_audience import resolve_audience_band
from ..referral_needs import REFERRAL_NEEDS
from ..referral_scope import institution_for, institution_ids_for

router = APIRouter()
get_db = database.get_db

VALID_STATUS = {"draft", "certified"}
VALID_EVENT_KINDS = {"open-day", "workshop", "sportello", "fiera", "scadenza", "webinar"}
# Quel che la directory mostra: non e' un turno di chat, non c'e' un budget di
# prompt da rispettare, ma un elenco infinito non e' una pagina leggibile.
DIRECTORY_LIMIT = 50


def _check_needs(row) -> None:
    if not (row.needs or []):
        raise HTTPException(
            status_code=400,
            detail="Serve almeno un bisogno: senza, la voce non verrebbe mai proposta",
        )
    unknown = [n for n in row.needs if n not in REFERRAL_NEEDS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Bisogni fuori vocabolario: {unknown}")


def _has_text(data) -> bool:
    return isinstance(data, dict) and any((v or "").strip() for v in data.values())


def _guard_referral(row: models.OrientationReferral) -> None:
    """Una figura certificata deve poter essere consegnata a uno studente."""
    if row.status != "certified":
        return
    _check_needs(row)
    if not _has_text(row.role_label_i18n):
        raise HTTPException(status_code=400, detail="Serve il ruolo in almeno una lingua")
    if not _has_text(row.what_for_i18n):
        raise HTTPException(
            status_code=400,
            detail="Serve dire cosa lo studente puo' chiedere a questa figura",
        )
    channel = row.contact_channel if isinstance(row.contact_channel, dict) else {}
    if not any(str(channel.get(k) or "").strip() for k in ("email", "page_url", "location", "hours")):
        raise HTTPException(
            status_code=400,
            detail="Serve un contatto istituzionale: email d'ufficio, pagina, stanza o orari",
        )


def _guard_event(row: models.OrientationEvent) -> None:
    if row.status != "certified":
        return
    _check_needs(row)
    if not _has_text(row.title_i18n):
        raise HTTPException(status_code=400, detail="Serve il titolo in almeno una lingua")
    if not (row.page_url or "").strip():
        raise HTTPException(status_code=400, detail="Evento senza page_url: aggiungi la pagina dell'istituto")
    if row.ends_at is None:
        raise HTTPException(status_code=400, detail="Serve la data di fine: e' cio' che fa scadere l'evento")
    if row.starts_at is not None and row.ends_at < row.starts_at:
        raise HTTPException(status_code=400, detail="L'evento non puo' finire prima di iniziare")


def warn_off_domain_email(row: models.OrientationReferral, institution) -> str:
    """Avviso, non blocco: un servizio consorziato fra scuole ha per forza
    un'email fuori dal dominio dell'istituto, e un guard duro lo rifiuterebbe.
    Torna la stringa vuota quando non c'e' nulla da segnalare."""
    channel = row.contact_channel if isinstance(row.contact_channel, dict) else {}
    email = str(channel.get("email") or "").strip().lower()
    site = str(getattr(institution, "website_url", "") or "").strip().lower()
    if "@" not in email or not site:
        return ""
    host = site.split("//")[-1].split("/")[0].removeprefix("www.")
    domain = email.rsplit("@", 1)[-1]
    if host and domain and not (domain.endswith(host) or host.endswith(domain)):
        return f"L'email {email} non e' sul dominio dell'istituto ({host}): controlla che sia un recapito d'ufficio."
    return ""


def _validate_common(row, kinds: set[str] | None = None) -> None:
    if (row.status or "") not in VALID_STATUS:
        raise HTTPException(status_code=400, detail="Stato non valido: draft o certified")
    if kinds is not None and (row.kind or "") not in kinds:
        raise HTTPException(status_code=400, detail=f"Tipo non valido: usa uno fra {sorted(kinds)}")


@router.get("/admin/referral-needs")
async def list_referral_needs(
    current_user: dict = Depends(auth.get_current_active_admin),
):
    """Vocabolario dei bisogni, per popolare il pannello."""
    return [{"code": code, "label": need["label"]} for code, need in REFERRAL_NEEDS.items()]


# --- figure ------------------------------------------------------------------

@router.get("/admin/orientation-referrals")
async def list_referrals(
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    """Le figure piu' l'avviso editoriale sul recapito, che non blocca nulla."""
    rows = (
        db.query(models.OrientationReferral)
        .order_by(models.OrientationReferral.sort_order.asc(), models.OrientationReferral.id.asc())
        .all()
    )
    institutions = {i.id: i for i in db.query(models.Institution).all()}
    out = []
    for row in rows:
        item = schemas.OrientationReferralResponse.model_validate(row).model_dump()
        item["warning"] = warn_off_domain_email(row, institutions.get(row.institution_id))
        out.append(item)
    return out


@router.post("/admin/orientation-referrals", response_model=schemas.OrientationReferralResponse)
async def create_referral(
    payload: schemas.OrientationReferralCreate,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    slug = (payload.slug or "").strip()
    if not slug:
        raise HTTPException(status_code=400, detail="slug obbligatorio")
    if db.query(models.OrientationReferral).filter(models.OrientationReferral.slug == slug).first():
        raise HTTPException(status_code=409, detail="slug gia' presente")
    row = models.OrientationReferral(**payload.model_dump())
    row.slug = slug
    _validate_common(row)
    _guard_referral(row)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/admin/orientation-referrals/{referral_id}", response_model=schemas.OrientationReferralResponse)
async def update_referral(
    referral_id: int,
    payload: schemas.OrientationReferralUpdate,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    row = db.query(models.OrientationReferral).filter(models.OrientationReferral.id == referral_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Referente non trovato")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    _validate_common(row)
    _guard_referral(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/admin/orientation-referrals/{referral_id}")
async def delete_referral(
    referral_id: int,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    row = db.query(models.OrientationReferral).filter(models.OrientationReferral.id == referral_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Referente non trovato")
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": referral_id}


# --- eventi ------------------------------------------------------------------

@router.get("/admin/orientation-events", response_model=List[schemas.OrientationEventResponse])
async def list_events(
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.OrientationEvent)
        .order_by(models.OrientationEvent.starts_at.asc(), models.OrientationEvent.id.asc())
        .all()
    )


@router.post("/admin/orientation-events", response_model=schemas.OrientationEventResponse)
async def create_event(
    payload: schemas.OrientationEventCreate,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    slug = (payload.slug or "").strip()
    if not slug:
        raise HTTPException(status_code=400, detail="slug obbligatorio")
    if db.query(models.OrientationEvent).filter(models.OrientationEvent.slug == slug).first():
        raise HTTPException(status_code=409, detail="slug gia' presente")
    row = models.OrientationEvent(**payload.model_dump())
    row.slug = slug
    _validate_common(row, VALID_EVENT_KINDS)
    _guard_event(row)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/admin/orientation-events/{event_id}", response_model=schemas.OrientationEventResponse)
async def update_event(
    event_id: int,
    payload: schemas.OrientationEventUpdate,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    row = db.query(models.OrientationEvent).filter(models.OrientationEvent.id == event_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Evento non trovato")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    _validate_common(row, VALID_EVENT_KINDS)
    _guard_event(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/admin/orientation-events/{event_id}")
async def delete_event(
    event_id: int,
    current_user: dict = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    row = db.query(models.OrientationEvent).filter(models.OrientationEvent.id == event_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Evento non trovato")
    db.delete(row)
    db.commit()
    return {"status": "deleted", "id": event_id}
```

In `backend/main.py`, l'import accanto agli altri e il montaggio:

```python
from .routes import orientation_referrals as orientation_referrals_routes
```
```python
app.include_router(orientation_referrals_routes.router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec counselorbot_backend python -m backend.tests.test_orientation_referrals`
Expected: `23/23 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/routes/orientation_referrals.py backend/schemas.py backend/main.py backend/tests/test_orientation_referrals.py
git commit -m "feat(orientamento): CRUD admin di referenti ed eventi

I guard bloccano la certificazione finche' manca cio' che serve a
consegnare la voce a uno studente: un bisogno del vocabolario, il motivo
per rivolgersi a quella figura, un canale per raggiungerla, e per un
evento la pagina e la data di fine che lo fara' scadere.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Directory dello studente

**Files:**
- Modify: `backend/routes/orientation_referrals.py` (aggiunge l'endpoint), `backend/tests/test_orientation_referrals.py`

**Interfaces:**
- Consumes: `institution_for`, `institution_ids_for` (Task 3); `orientation_referral_memory` (Task 4); `resolve_audience_band`
- Produces: `GET /orientation-directory?lang=` → `schemas.OrientationDirectoryResponse`

**La differenza che conta.** La chat filtra per bisogno perché non deve iniettare materiale estraneo al turno. La directory **non** filtra: è un elenco, e deve mostrare tutto quello che riguarda il proprio istituto. Restano attivi la fascia di pubblico, lo stato certificato e la scadenza degli eventi.

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_orientation_referrals.py`, sopra il runner:

```python
def test_the_directory_shows_rows_whose_need_the_student_never_named():
    """La chat filtra per bisogno; la directory no: e' un elenco, non un turno."""
    db = _TestSession()
    try:
        institution = _institution(db)
        _referral(db, "psico", institution_id=institution.id, needs=["disagio-emotivo"])
        _referral(db, "borse", institution_id=institution.id, needs=["borse-e-tasse"])
        out = orientation_referral_memory.retrieve_referrals(
            db, needs=set(), institution_ids=[institution.id],
            language="it", limit=DIRECTORY_LIMIT)
        assert {e["id"] for e in out} == {f"{PREFIX}-psico", f"{PREFIX}-borse"}
    finally:
        _clear(db); db.close()


def test_the_directory_still_hides_expired_events():
    db = _TestSession()
    try:
        institution = _institution(db)
        _event(db, "scaduto", institution_id=institution.id,
               starts_at=NOW - timedelta(days=5), ends_at=NOW - timedelta(days=4))
        _event(db, "futuro", institution_id=institution.id)
        out = orientation_referral_memory.retrieve_events(
            db, needs=set(), institution_ids=[institution.id],
            language="it", limit=DIRECTORY_LIMIT)
        assert [e["id"] for e in out] == [f"{PREFIX}-futuro"]
    finally:
        _clear(db); db.close()
```

I due test sopra passano già con il servizio di Task 4: misurano la regola, non la rotta. Serve quindi anche il test che fallisce davvero, cioè che la rotta esista e sia montata:

```python
def test_the_directory_route_is_mounted_for_students():
    from backend.main import app

    routes = {getattr(r, "path", "") for r in app.routes}
    assert "/orientation-directory" in routes
```

Aggiungi l'import in cima al file di test, accanto agli altri:

```python
from backend.routes.orientation_referrals import DIRECTORY_LIMIT
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec counselorbot_backend python -m backend.tests.test_orientation_referrals`
Expected: `FAIL test_the_directory_route_is_mounted_for_students` — la rotta non esiste ancora. Gli altri due passano già: verifica che sia davvero così, perché confermano che il servizio di Task 4 non filtra quando l'insieme dei bisogni è vuoto.

- [ ] **Step 3: Write minimal implementation**

In fondo a `backend/routes/orientation_referrals.py`:

```python
# --- directory dello studente ------------------------------------------------

@router.get("/orientation-directory", response_model=schemas.OrientationDirectoryResponse)
async def orientation_directory(
    lang: str = Query("it"),
    current_user: dict = Depends(auth.get_current_user),
    db: Session = Depends(get_db),
):
    """Figure ed eventi del proprio istituto, senza filtro sui bisogni.

    Il filtro per bisogno esiste perche' la chat non inietti materiale
    estraneo al turno. Qui e' un elenco: deve mostrare tutto cio' che riguarda
    il proprio istituto. Restano la fascia di pubblico, lo stato certificato e
    la scadenza degli eventi.
    """
    username = current_user["username"]
    institution_ids = institution_ids_for(db, username)
    band = resolve_audience_band(db, username)
    return schemas.OrientationDirectoryResponse(
        institution=institution_for(db, username),
        referrals=orientation_referral_memory.retrieve_referrals(
            db, needs=set(), institution_ids=institution_ids,
            audience_band=band, language=lang, limit=DIRECTORY_LIMIT),
        events=orientation_referral_memory.retrieve_events(
            db, needs=set(), institution_ids=institution_ids,
            audience_band=band, language=lang, limit=DIRECTORY_LIMIT),
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec counselorbot_backend python -m backend.tests.test_orientation_referrals`
Expected: `26/26 passed`

Run: `docker compose restart backend && curl -s -o /dev/null -w "%{http_code}\n" "localhost:8000/orientation-directory?lang=it"`
Expected: `401` o `403`, non `404`.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/orientation_referrals.py backend/tests/test_orientation_referrals.py
git commit -m "feat(orientamento): endpoint della directory dello studente

Elenco di figure ed eventi del proprio istituto senza filtro sui bisogni:
quel filtro serve alla chat, che non deve iniettare materiale estraneo al
turno. Restano la fascia di pubblico, lo stato certificato e la scadenza.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: L'istituto nel taccuino

**Files:**
- Modify: `backend/schemas.py:621` e `:624-648` (`LEARNER_PROFILE_FIELDS`, `LearnerProfileSave`), `frontend/src/components/profile/LearnerProfileCard.tsx:20-52` e `:196-232`
- Test: `backend/tests/test_referral_needs_scope.py`

**Interfaces:**
- Consumes: `NOT_LISTED` (Task 3); `GET /institutions` (Task 6)
- Produces: campo `institution_slug` accettato e salvato dal taccuino; select nell'interfaccia

**L'esclusione dal prompt avviene per omissione.** `student_context.py:22` e `chat_logic.py:1686` iterano entrambi su `LEARNER_PROFILE_LABELS`. Aggiungere il campo a `LEARNER_PROFILE_FIELDS` (che decide cosa si salva) e **non** a `LEARNER_PROFILE_LABELS` (che decide cosa entra nel prompt) è quanto basta. Il test qui sotto blocca la regressione.

- [ ] **Step 1: Write the failing test**

In `backend/tests/test_referral_needs_scope.py`, sopra il runner:

```python
def test_the_institution_is_saved_but_never_reaches_the_prompt():
    """Il nome dell'istituto di un minorenne e' quasi-identificante: e' una
    chiave di retrieval, non un fatto da raccontare al counselor."""
    from backend import schemas
    from backend.student_context import LEARNER_PROFILE_LABELS

    assert "institution_slug" in schemas.LEARNER_PROFILE_FIELDS
    assert "institution_slug" in schemas.LearnerProfileSave.model_fields
    assert "institution_slug" not in LEARNER_PROFILE_LABELS


def test_the_notebook_round_trips_the_chosen_slug():
    db = _TestSession(); user = f"{PREFIX}-f"
    try:
        school = _institution(db, "roundtrip")
        payload = schemas.LearnerProfileSave(
            context="prova", institution_slug=school.slug, source="manual")
        data = {
            key: value
            for key in schemas.LEARNER_PROFILE_FIELDS
            if (value := getattr(payload, key)) is not None
        }
        assert data["institution_slug"] == school.slug
    finally:
        _scope_clear(db, user); db.close()
```

Aggiungi `from backend import schemas` agli import del file di test.

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec counselorbot_backend python -m backend.tests.test_referral_needs_scope`
Expected: `FAIL test_the_institution_is_saved_but_never_reaches_the_prompt` sull'assert `"institution_slug" in schemas.LEARNER_PROFILE_FIELDS`.

- [ ] **Step 3: Write minimal implementation**

In `backend/schemas.py:621`, estendi la tupla:

```python
LEARNER_PROFILE_FIELDS = ("context", "goal", "main_difficulty", "strengths", "weaknesses", "notes", "gender", "age", "school_class", "school_year", "institution_slug")
```

In `LearnerProfileSave`, aggiungi il campo dopo `school_year` e includilo nel validator:

```python
    # Scelto da un elenco chiuso, non digitato: e' la chiave con cui la
    # directory trova i referenti. Resta fuori da LEARNER_PROFILE_LABELS,
    # quindi non entra mai nel prompt.
    institution_slug: Optional[str] = None
```

```python
    @validator("context", "goal", "main_difficulty", "strengths", "weaknesses", "notes", "gender", "age", "school_class", "school_year", "institution_slug", pre=True)
    def _trim_and_cap(cls, v):
```

Nel frontend, `frontend/src/components/profile/LearnerProfileCard.tsx`. Estendi il tipo dei dati (riga ~28):

```tsx
    school_year?: string;
    institution_slug?: string;
```

Estendi il tipo dell'array `FIELDS` e aggiungi la voce (riga ~48):

```tsx
const FIELDS: {
    key: keyof LearnerProfileData;
    labelKey: string;
    multiline?: boolean;
    type?: 'number' | 'select';
}[] = [
    { key: 'age', labelKey: 'lp.field.age', type: 'number' },
    { key: 'gender', labelKey: 'lp.field.gender' },
    { key: 'school_class', labelKey: 'lp.field.schoolClass' },
    { key: 'school_year', labelKey: 'lp.field.schoolYear' },
    { key: 'institution_slug', labelKey: 'lp.field.institution', type: 'select' },
```

Sopra il componente, carica l'elenco degli istituti:

```tsx
import { INSTITUTION_NOT_LISTED, fetchInstitutions, type Institution } from '@/lib/referrals-api';
```

Dentro il componente, accanto agli altri `useState`:

```tsx
    const [institutions, setInstitutions] = useState<Institution[]>([]);

    // L'elenco serve solo al select: un errore di rete non deve impedire di
    // salvare il resto del taccuino, quindi si degrada a lista vuota.
    useEffect(() => {
        let alive = true;
        fetchInstitutions()
            .then((rows) => { if (alive) setInstitutions(rows); })
            .catch(() => { if (alive) setInstitutions([]); });
        return () => { alive = false; };
    }, []);
```

Nel ternario della resa (riga ~206), aggiungi il ramo `select` prima di quello `number`:

```tsx
                        {f.type === 'select' ? (
                            <select
                                value={form[f.key] || ''}
                                onChange={(e) => {
                                    setValidationError('');
                                    setForm((prev) => ({ ...prev, [f.key]: e.target.value }));
                                }}
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            >
                                <option value="">{t('lp.institution.choose')}</option>
                                {institutions.map((institution) => (
                                    <option key={institution.slug} value={institution.slug}>
                                        {institution.name}
                                    </option>
                                ))}
                                {/* Un campo libero riporterebbe dentro il match fragile
                                    che l'anagrafica esiste per evitare: chi non si trova
                                    in elenco lo dichiara, e vede le sole righe nazionali. */}
                                <option value={INSTITUTION_NOT_LISTED}>{t('lp.institution.notListed')}</option>
                            </select>
                        ) : f.type === 'number' ? (
```

Nella resa di sola lettura (`filledEntries`, riga ~197), sostituisci lo slug col nome leggibile:

```tsx
    const filledEntries = FIELDS
        .map((f) => {
            const raw = (profile?.data?.[f.key] || '').trim();
            if (f.key !== 'institution_slug') return { ...f, value: raw };
            if (raw === INSTITUTION_NOT_LISTED) return { ...f, value: t('lp.institution.notListed') };
            const match = institutions.find((i) => i.slug === raw);
            return { ...f, value: match ? match.name : '' };
        })
        .filter((f) => f.value);
```

Crea `frontend/src/lib/referrals-api.ts`:

```ts
import { apiFetch } from './auth';
import type { Lang } from './i18n';

// Deve restare identico a backend/referral_scope.py::NOT_LISTED.
export const INSTITUTION_NOT_LISTED = '__not_listed__';

export interface Institution {
    id: number;
    slug: string;
    name: string;
    kind: 'school' | 'university';
    website_url?: string | null;
    orientation_page_url?: string | null;
}

export interface DirectoryReferral {
    id: string;
    role: string;
    person: string;
    needs: string[];
    what_for: string;
    how_to_reach: string;
    email: string;
    hours: string;
    location: string;
    page_url: string;
}

export interface DirectoryEvent {
    id: string;
    kind: string;
    title: string;
    summary: string;
    needs: string[];
    starts_at: string;
    ends_at: string;
    registration_deadline: string;
    page_url: string;
    location: string;
    is_online: boolean;
}

export interface OrientationDirectory {
    institution: Institution | null;
    referrals: DirectoryReferral[];
    events: DirectoryEvent[];
}

export async function fetchInstitutions(): Promise<Institution[]> {
    const res = await apiFetch('/institutions');
    if (!res.ok) throw new Error(`institutions: ${res.status}`);
    return res.json();
}

export async function fetchOrientationDirectory(lang: Lang): Promise<OrientationDirectory> {
    const res = await apiFetch(`/orientation-directory?lang=${lang}`);
    if (!res.ok) throw new Error(`orientation-directory: ${res.status}`);
    return res.json();
}
```

Aggiungi le chiavi mancanti nei sei dizionari di `frontend/src/lib/i18n.ts`, accanto a `'lp.field.schoolYear'`. Italiano:

```ts
    'lp.field.institution': 'Il tuo istituto',
    'lp.institution.choose': 'Scegli il tuo istituto',
    'lp.institution.notListed': 'Non trovo il mio istituto',
```

Inglese: `'Your institution'`, `'Choose your institution'`, `'I cannot find my institution'`.
Spagnolo: `'Tu centro'`, `'Elige tu centro'`, `'No encuentro mi centro'`.
Francese: `'Ton établissement'`, `'Choisis ton établissement'`, `'Je ne trouve pas mon établissement'`.
Tedesco: `'Deine Schule'`, `'Wähle deine Schule'`, `'Ich finde meine Schule nicht'`.
Svedese: `'Din skola'`, `'Välj din skola'`, `'Jag hittar inte min skola'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker exec counselorbot_backend python -m backend.tests.test_referral_needs_scope`
Expected: `11/11 passed`

Run: `cd frontend && npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add backend/schemas.py frontend/src/lib/referrals-api.ts frontend/src/lib/i18n.ts frontend/src/components/profile/LearnerProfileCard.tsx backend/tests/test_referral_needs_scope.py
git commit -m "feat(taccuino): scelta dell'istituto da elenco chiuso

Nuovo campo institution_slug: select, non testo libero, perche' un campo
libero riporterebbe il match fragile che l'anagrafica esiste per evitare.
Salvato in LEARNER_PROFILE_FIELDS ma deliberatamente fuori da
LEARNER_PROFILE_LABELS: il nome dell'istituto di un minorenne e'
quasi-identificante e non deve entrare nel prompt. Un test lo blocca.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Sezione «Orientamento» nell'area personale

**Files:**
- Create: `frontend/src/lib/i18n-referrals.ts`, `frontend/src/components/profile/OrientationDirectoryCard.tsx`, `frontend/src/app/profilo/orientamento/page.tsx`, `frontend/src/app/profilo/orientamento/layout.tsx`
- Modify: `frontend/src/lib/i18n.ts:6327-6334`, `frontend/src/app/profilo/page.tsx:41-85` e `:805-815`

**Interfaces:**
- Consumes: `fetchOrientationDirectory`, i tipi `DirectoryReferral`/`DirectoryEvent`/`Institution` (Task 9); `GET /orientation-directory` (Task 8)
- Produces: sezione `orientation` (slug `orientamento`) nell'area personale

- [ ] **Step 1: Scrivi il dizionario e la rotta**

Crea `frontend/src/lib/i18n-referrals.ts`, sul modello di `i18n-orientation.ts`. Riporto italiano e inglese per intero; per `es`, `fr`, `de`, `sv` traduci le stesse chiavi mantenendo il registro (rivolto allo studente, del tu):

```ts
import type { Lang } from './i18n';

type Dict = Record<string, string>;

const it: Dict = {
    'referrals.area.title': 'Orientamento',
    'referrals.area.description': 'Le persone a cui puoi rivolgerti e gli appuntamenti del tuo istituto.',
    'referrals.institution.label': 'Il tuo istituto',
    'referrals.institution.page': 'Pagina di orientamento',
    'referrals.institution.change': 'Cambia nel taccuino',
    'referrals.institution.missing': 'Scegli il tuo istituto nel taccuino per vedere i referenti della tua scuola.',
    'referrals.events.title': 'Prossimi appuntamenti',
    'referrals.events.empty': 'Nessun appuntamento in programma al momento.',
    'referrals.events.online': 'Online',
    'referrals.events.deadline': 'Iscrizioni entro il {date}',
    'referrals.events.page': 'Vai alla pagina',
    'referrals.people.title': 'A chi rivolgerti',
    'referrals.people.empty': 'Il tuo istituto non ha ancora referenti registrati.',
    'referrals.people.whatFor': 'Cosa puoi chiedere',
    'referrals.people.howTo': 'Come raggiungerla',
    'referrals.filter.all': 'Tutti',
    'referrals.loading': 'Carico i referenti…',
    'referrals.error': 'Non riesco a caricare i referenti in questo momento.',
};

const en: Dict = {
    'referrals.area.title': 'Orientation',
    'referrals.area.description': 'The people you can turn to and the dates at your institution.',
    'referrals.institution.label': 'Your institution',
    'referrals.institution.page': 'Orientation page',
    'referrals.institution.change': 'Change it in your notebook',
    'referrals.institution.missing': 'Choose your institution in your notebook to see the people at your school.',
    'referrals.events.title': 'Upcoming dates',
    'referrals.events.empty': 'Nothing scheduled right now.',
    'referrals.events.online': 'Online',
    'referrals.events.deadline': 'Register by {date}',
    'referrals.events.page': 'Open the page',
    'referrals.people.title': 'Who to turn to',
    'referrals.people.empty': 'Your institution has no registered contacts yet.',
    'referrals.people.whatFor': 'What you can bring them',
    'referrals.people.howTo': 'How to reach them',
    'referrals.filter.all': 'All',
    'referrals.loading': 'Loading contacts…',
    'referrals.error': 'I cannot load the contacts right now.',
};

const es: Dict = {
    'referrals.area.title': 'Orientacion',
    'referrals.area.description': 'Las personas a las que puedes acudir y las citas de tu centro.',
    'referrals.institution.label': 'Tu centro',
    'referrals.institution.page': 'Pagina de orientacion',
    'referrals.institution.change': 'Cambialo en tu cuaderno',
    'referrals.institution.missing': 'Elige tu centro en el cuaderno para ver a las personas de tu escuela.',
    'referrals.events.title': 'Proximas citas',
    'referrals.events.empty': 'No hay nada programado por ahora.',
    'referrals.events.online': 'En linea',
    'referrals.events.deadline': 'Inscripciones hasta el {date}',
    'referrals.events.page': 'Abrir la pagina',
    'referrals.people.title': 'A quien dirigirte',
    'referrals.people.empty': 'Tu centro todavia no tiene personas registradas.',
    'referrals.people.whatFor': 'Que puedes consultarle',
    'referrals.people.howTo': 'Como contactar',
    'referrals.filter.all': 'Todos',
    'referrals.loading': 'Cargando los contactos…',
    'referrals.error': 'Ahora mismo no puedo cargar los contactos.',
};

const fr: Dict = {
    'referrals.area.title': 'Orientation',
    'referrals.area.description': 'Les personnes vers qui te tourner et les rendez-vous de ton etablissement.',
    'referrals.institution.label': 'Ton etablissement',
    'referrals.institution.page': 'Page d\'orientation',
    'referrals.institution.change': 'Change-le dans ton carnet',
    'referrals.institution.missing': 'Choisis ton etablissement dans le carnet pour voir les personnes de ton ecole.',
    'referrals.events.title': 'Prochains rendez-vous',
    'referrals.events.empty': 'Rien de prevu pour le moment.',
    'referrals.events.online': 'En ligne',
    'referrals.events.deadline': 'Inscriptions avant le {date}',
    'referrals.events.page': 'Ouvrir la page',
    'referrals.people.title': 'A qui t\'adresser',
    'referrals.people.empty': 'Ton etablissement n\'a pas encore de personnes enregistrees.',
    'referrals.people.whatFor': 'Ce que tu peux lui demander',
    'referrals.people.howTo': 'Comment la joindre',
    'referrals.filter.all': 'Tous',
    'referrals.loading': 'Chargement des contacts…',
    'referrals.error': 'Je ne peux pas charger les contacts pour l\'instant.',
};

const de: Dict = {
    'referrals.area.title': 'Orientierung',
    'referrals.area.description': 'Die Menschen, an die du dich wenden kannst, und die Termine deiner Schule.',
    'referrals.institution.label': 'Deine Schule',
    'referrals.institution.page': 'Orientierungsseite',
    'referrals.institution.change': 'Im Notizbuch andern',
    'referrals.institution.missing': 'Wahle deine Schule im Notizbuch, um die Anlaufstellen deiner Schule zu sehen.',
    'referrals.events.title': 'Nachste Termine',
    'referrals.events.empty': 'Derzeit ist nichts geplant.',
    'referrals.events.online': 'Online',
    'referrals.events.deadline': 'Anmeldung bis zum {date}',
    'referrals.events.page': 'Seite offnen',
    'referrals.people.title': 'An wen du dich wenden kannst',
    'referrals.people.empty': 'Deine Schule hat noch keine eingetragenen Anlaufstellen.',
    'referrals.people.whatFor': 'Was du dort ansprechen kannst',
    'referrals.people.howTo': 'So erreichst du sie',
    'referrals.filter.all': 'Alle',
    'referrals.loading': 'Kontakte werden geladen…',
    'referrals.error': 'Die Kontakte lassen sich gerade nicht laden.',
};

const sv: Dict = {
    'referrals.area.title': 'Vagledning',
    'referrals.area.description': 'Personerna du kan vanda dig till och tiderna pa din skola.',
    'referrals.institution.label': 'Din skola',
    'referrals.institution.page': 'Sida om vagledning',
    'referrals.institution.change': 'Andra i anteckningsboken',
    'referrals.institution.missing': 'Valj din skola i anteckningsboken for att se personerna pa din skola.',
    'referrals.events.title': 'Kommande tider',
    'referrals.events.empty': 'Inget ar inplanerat just nu.',
    'referrals.events.online': 'Online',
    'referrals.events.deadline': 'Anmalan senast den {date}',
    'referrals.events.page': 'Oppna sidan',
    'referrals.people.title': 'Vem du kan vanda dig till',
    'referrals.people.empty': 'Din skola har inga registrerade kontakter an.',
    'referrals.people.whatFor': 'Vad du kan ta upp',
    'referrals.people.howTo': 'Sa nar du dem',
    'referrals.filter.all': 'Alla',
    'referrals.loading': 'Laddar kontakter…',
    'referrals.error': 'Jag kan inte ladda kontakterna just nu.',
};

// Etichette dei bisogni: le chiavi sono i codici di backend/referral_needs.py.
// In italiano sono le `label` del vocabolario; nelle altre lingue la stessa cosa
// detta a uno studente, non il termine amministrativo.
const NEEDS: Record<Lang, Dict> = {
    it: {
        'referrals.need.scelta-percorso': 'Scelta del percorso',
        'referrals.need.metodo-di-studio': 'Metodo di studio',
        'referrals.need.disagio-emotivo': 'Disagio emotivo',
        'referrals.need.dsa-bes': 'DSA e bisogni educativi speciali',
        'referrals.need.tirocinio-lavoro': 'Tirocinio e lavoro',
        'referrals.need.borse-e-tasse': 'Borse di studio e tasse',
        'referrals.need.mobilita-estero': 'Studio all\'estero',
        'referrals.need.iscrizioni-scadenze': 'Iscrizioni e scadenze',
    },
    en: {
        'referrals.need.scelta-percorso': 'Choosing a path',
        'referrals.need.metodo-di-studio': 'Study method',
        'referrals.need.disagio-emotivo': 'Emotional difficulty',
        'referrals.need.dsa-bes': 'Learning differences and support needs',
        'referrals.need.tirocinio-lavoro': 'Placements and work',
        'referrals.need.borse-e-tasse': 'Grants and fees',
        'referrals.need.mobilita-estero': 'Studying abroad',
        'referrals.need.iscrizioni-scadenze': 'Enrolment and deadlines',
    },
    es: {
        'referrals.need.scelta-percorso': 'Eleccion del itinerario',
        'referrals.need.metodo-di-studio': 'Metodo de estudio',
        'referrals.need.disagio-emotivo': 'Malestar emocional',
        'referrals.need.dsa-bes': 'Dificultades de aprendizaje y apoyo',
        'referrals.need.tirocinio-lavoro': 'Practicas y trabajo',
        'referrals.need.borse-e-tasse': 'Becas y tasas',
        'referrals.need.mobilita-estero': 'Estudiar en el extranjero',
        'referrals.need.iscrizioni-scadenze': 'Matriculas y plazos',
    },
    fr: {
        'referrals.need.scelta-percorso': 'Choix du parcours',
        'referrals.need.metodo-di-studio': 'Methode de travail',
        'referrals.need.disagio-emotivo': 'Mal-etre',
        'referrals.need.dsa-bes': 'Troubles des apprentissages et accompagnement',
        'referrals.need.tirocinio-lavoro': 'Stages et travail',
        'referrals.need.borse-e-tasse': 'Bourses et frais',
        'referrals.need.mobilita-estero': 'Etudier a l\'etranger',
        'referrals.need.iscrizioni-scadenze': 'Inscriptions et echeances',
    },
    de: {
        'referrals.need.scelta-percorso': 'Wahl des Wegs',
        'referrals.need.metodo-di-studio': 'Lernmethode',
        'referrals.need.disagio-emotivo': 'Seelische Belastung',
        'referrals.need.dsa-bes': 'Lernschwierigkeiten und Forderbedarf',
        'referrals.need.tirocinio-lavoro': 'Praktikum und Arbeit',
        'referrals.need.borse-e-tasse': 'Stipendien und Gebuhren',
        'referrals.need.mobilita-estero': 'Studium im Ausland',
        'referrals.need.iscrizioni-scadenze': 'Anmeldung und Fristen',
    },
    sv: {
        'referrals.need.scelta-percorso': 'Val av vag',
        'referrals.need.metodo-di-studio': 'Studieteknik',
        'referrals.need.disagio-emotivo': 'Psykisk ohalsa',
        'referrals.need.dsa-bes': 'Las- och skrivsvarigheter och stod',
        'referrals.need.tirocinio-lavoro': 'Praktik och arbete',
        'referrals.need.borse-e-tasse': 'Stipendier och avgifter',
        'referrals.need.mobilita-estero': 'Studera utomlands',
        'referrals.need.iscrizioni-scadenze': 'Anmalan och sista datum',
    },
};

export const REFERRAL_DICTS: Record<Lang, Dict> = {
    it: { ...it, ...NEEDS.it },
    en: { ...en, ...NEEDS.en },
    es: { ...es, ...NEEDS.es },
    fr: { ...fr, ...NEEDS.fr },
    de: { ...de, ...NEEDS.de },
    sv: { ...sv, ...NEEDS.sv },
};
```

In `frontend/src/lib/i18n.ts`, importa e unisci il dizionario nei sei blocchi (riga ~6327):

```ts
import { REFERRAL_DICTS } from './i18n-referrals';
```
```ts
const DICTS: Record<Lang, Dict> = {
    it: { ...it, ...FACTOR_DICTS.it, ...SURVEY_DICTS.it, ...ADMIN_DICTS.it, ...ORIENTATION_DICTS.it, ...REFERRAL_DICTS.it },
    en: { ...en, ...FACTOR_DICTS.en, ...SURVEY_DICTS.en, ...ADMIN_DICTS.en, ...ORIENTATION_DICTS.en, ...REFERRAL_DICTS.en },
    es: { ...es, ...FACTOR_DICTS.es, ...SURVEY_DICTS.es, ...ADMIN_DICTS.es, ...ORIENTATION_DICTS.es, ...REFERRAL_DICTS.es },
    fr: { ...fr, ...FACTOR_DICTS.fr, ...SURVEY_DICTS.fr, ...ADMIN_DICTS.fr, ...ORIENTATION_DICTS.fr, ...REFERRAL_DICTS.fr },
    de: { ...de, ...FACTOR_DICTS.de, ...SURVEY_DICTS.de, ...ADMIN_DICTS.de, ...ORIENTATION_DICTS.de, ...REFERRAL_DICTS.de },
    sv: { ...sv, ...FACTOR_DICTS.sv, ...SURVEY_DICTS.sv, ...ADMIN_DICTS.sv, ...ORIENTATION_DICTS.sv, ...REFERRAL_DICTS.sv },
};
```

Crea `frontend/src/app/profilo/orientamento/page.tsx`:

```tsx
export { default } from '../page';
```

Crea `frontend/src/app/profilo/orientamento/layout.tsx`:

```tsx
import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Orientamento - CounselorBot',
    description: 'Referenti e appuntamenti del tuo istituto.',
};

export default function ProfiloOrientamentoLayout({ children }: { children: React.ReactNode }) {
    return children;
}
```

- [ ] **Step 2: Scrivi il componente della directory**

Crea `frontend/src/components/profile/OrientationDirectoryCard.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ExternalLink, MapPin, Users } from 'lucide-react';

import { useI18n } from '@/lib/i18n-context';
import {
    fetchOrientationDirectory,
    type DirectoryEvent,
    type DirectoryReferral,
    type Institution,
} from '@/lib/referrals-api';

function formatDate(value: string, lang: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function OrientationDirectoryCard() {
    const { t, lang } = useI18n();
    const [institution, setInstitution] = useState<Institution | null>(null);
    const [referrals, setReferrals] = useState<DirectoryReferral[]>([]);
    const [events, setEvents] = useState<DirectoryEvent[]>([]);
    const [need, setNeed] = useState<string>('');
    const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

    useEffect(() => {
        let alive = true;
        setState('loading');
        fetchOrientationDirectory(lang)
            .then((data) => {
                if (!alive) return;
                setInstitution(data.institution);
                setReferrals(data.referrals);
                setEvents(data.events);
                setState('ready');
            })
            .catch(() => { if (alive) setState('error'); });
        return () => { alive = false; };
    }, [lang]);

    // I filtri offerti sono solo i bisogni realmente presenti: una chip che
    // non filtra niente e' una promessa vuota.
    const needs = useMemo(() => {
        const found = new Set<string>();
        [...referrals, ...events].forEach((row) => row.needs.forEach((n) => found.add(n)));
        return Array.from(found).sort();
    }, [referrals, events]);

    const shownReferrals = need ? referrals.filter((r) => r.needs.includes(need)) : referrals;
    const shownEvents = need ? events.filter((e) => e.needs.includes(need)) : events;

    if (state === 'loading') return <p className="text-sm text-slate-500">{t('referrals.loading')}</p>;
    if (state === 'error') return <p className="text-sm text-rose-600">{t('referrals.error')}</p>;

    return (
        <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
                    {t('referrals.institution.label')}
                </p>
                {institution ? (
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-base font-semibold text-slate-800">{institution.name}</span>
                        {institution.orientation_page_url && (
                            <a href={institution.orientation_page_url} target="_blank" rel="noreferrer"
                               className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline">
                                {t('referrals.institution.page')} <ExternalLink className="h-3 w-3" />
                            </a>
                        )}
                        <a href="/profilo/taccuino" className="text-sm text-slate-500 hover:underline">
                            {t('referrals.institution.change')}
                        </a>
                    </div>
                ) : (
                    <p className="mt-1 text-sm text-slate-600">
                        {t('referrals.institution.missing')}{' '}
                        <a href="/profilo/taccuino" className="text-indigo-600 hover:underline">
                            {t('referrals.institution.change')}
                        </a>
                    </p>
                )}
            </div>

            {needs.length > 1 && (
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setNeed('')}
                            className={`rounded-full px-3 py-1 text-xs ${need === '' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                        {t('referrals.filter.all')}
                    </button>
                    {needs.map((code) => (
                        <button key={code} type="button" onClick={() => setNeed(code)}
                                className={`rounded-full px-3 py-1 text-xs ${need === code ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                            {t(`referrals.need.${code}`)}
                        </button>
                    ))}
                </div>
            )}

            <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <CalendarDays className="h-4 w-4" /> {t('referrals.events.title')}
                </h3>
                {shownEvents.length === 0 ? (
                    <p className="text-sm text-slate-500">{t('referrals.events.empty')}</p>
                ) : shownEvents.map((event) => (
                    <article key={event.id} className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-sm font-semibold text-slate-800">{event.title}</p>
                        <p className="text-xs text-slate-500">{formatDate(event.starts_at, lang)}</p>
                        {event.summary && <p className="mt-1 text-sm text-slate-600">{event.summary}</p>}
                        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                            <MapPin className="h-3 w-3" />
                            {event.is_online ? t('referrals.events.online') : event.location}
                        </p>
                        {event.registration_deadline && (
                            <p className="mt-1 text-xs text-amber-700">
                                {t('referrals.events.deadline', { date: formatDate(event.registration_deadline, lang) })}
                            </p>
                        )}
                        {event.page_url && (
                            <a href={event.page_url} target="_blank" rel="noreferrer"
                               className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline">
                                {t('referrals.events.page')} <ExternalLink className="h-3 w-3" />
                            </a>
                        )}
                    </article>
                ))}
            </section>

            <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Users className="h-4 w-4" /> {t('referrals.people.title')}
                </h3>
                {shownReferrals.length === 0 ? (
                    <p className="text-sm text-slate-500">{t('referrals.people.empty')}</p>
                ) : shownReferrals.map((referral) => (
                    <article key={referral.id} className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-sm font-semibold text-slate-800">
                            {referral.role}{referral.person ? ` — ${referral.person}` : ''}
                        </p>
                        {referral.what_for && (
                            <p className="mt-1 text-sm text-slate-600">
                                <span className="text-slate-500">{t('referrals.people.whatFor')}: </span>
                                {referral.what_for}
                            </p>
                        )}
                        {referral.how_to_reach && (
                            <p className="mt-1 text-sm text-slate-600">
                                <span className="text-slate-500">{t('referrals.people.howTo')}: </span>
                                {referral.how_to_reach}
                            </p>
                        )}
                        <p className="mt-1 text-xs text-slate-500">
                            {[referral.hours, referral.location, referral.email].filter(Boolean).join(' · ')}
                        </p>
                        {referral.page_url && (
                            <a href={referral.page_url} target="_blank" rel="noreferrer"
                               className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline">
                                {t('referrals.institution.page')} <ExternalLink className="h-3 w-3" />
                            </a>
                        )}
                    </article>
                ))}
            </section>
        </div>
    );
}
```

- [ ] **Step 3: Registra la sezione**

In `frontend/src/app/profilo/page.tsx`, riga ~41, estendi il tipo:

```tsx
type PersonalSection = 'notebook' | 'booklet' | 'groups' | 'telegram' | 'portfolio' | 'sessions' | 'orientation';
```

Aggiungi la voce in `PERSONAL_AREAS`, dopo `booklet`:

```tsx
    {
        id: 'orientation',
        slug: 'orientamento',
        icon: Compass,
        titleKey: 'referrals.area.title',
        descriptionKey: 'referrals.area.description',
    },
```

Importa l'icona e il componente in cima al file:

```tsx
import { Compass } from 'lucide-react';
import OrientationDirectoryCard from '@/components/profile/OrientationDirectoryCard';
```

E la resa, accanto alle altre sezioni (riga ~810):

```tsx
            {activeSection === 'orientation' && (
            <section className="space-y-4" aria-label={t('referrals.area.title')}>
                <OrientationDirectoryCard />
            </section>
            )}
```

- [ ] **Step 4: Verifica**

Run: `cd frontend && npx tsc --noEmit`
Expected: nessun errore.

Run: `cd frontend && npm run lint`
Expected: nessun errore nuovo.

Run: `docker compose up -d --build frontend && docker compose ps`
Expected: container `Up`.

Verifica a mano, con un utente autenticato: apri `/profilo/orientamento`.
Expected: senza istituto scelto compare l'invito a sceglierlo nel taccuino; dopo averlo scelto compaiono referenti ed eventi certificati di quell'istituto; un evento con `ends_at` passato non compare; cambiando lingua dall'interfaccia cambiano etichette e testi.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/i18n-referrals.ts frontend/src/lib/i18n.ts frontend/src/components/profile/OrientationDirectoryCard.tsx frontend/src/app/profilo/orientamento/page.tsx frontend/src/app/profilo/orientamento/layout.tsx frontend/src/app/profilo/page.tsx
git commit -m "feat(area personale): sezione Orientamento con referenti ed eventi

Directory dell'istituto dello studente: appuntamenti col piu' vicino per
primo, figure con cosa puoi chiedere e come raggiungerle, filtro sui soli
bisogni realmente presenti. Senza istituto scelto la pagina invita a
sceglierlo nel taccuino invece di restare vuota.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Pannello admin

**Files:**
- Create: `frontend/src/components/admin/OrientationReferralsPanel.tsx`
- Modify: `frontend/src/lib/i18n-admin.ts` (chiave della scheda, sei lingue), `frontend/src/app/admin/page.tsx:14`, `:62`, `:231`, `frontend/src/components/admin/GroupsPanel.tsx` (selettore istituto sulla classe)

**Interfaces:**
- Consumes: `/admin/institutions`, `/admin/referral-needs`, `/admin/orientation-referrals`, `/admin/orientation-events` (Task 6 e 7); `fetchInstitutions` e `Institution` (Task 9)
- Produces: scheda admin `orientationReferrals`

**Perché un pannello solo con due schede interne.** Figure ed eventi condividono istituto, bisogni, pubblico e stato: separarli in due voci di menu costringerebbe l'admin a saltare avanti e indietro mentre popola lo stesso istituto.

- [ ] **Step 1: Scrivi il pannello**

Crea `frontend/src/components/admin/OrientationReferralsPanel.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, Plus, Trash2 } from 'lucide-react';

import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';

type Lang = 'it' | 'en' | 'es' | 'fr' | 'de' | 'sv';
const LANGS: Lang[] = ['it', 'en', 'es', 'fr', 'de', 'sv'];
const AUDIENCES = ['secondaria', 'universita', 'adulti'] as const;
const EVENT_KINDS = ['open-day', 'workshop', 'sportello', 'fiera', 'scadenza', 'webinar'] as const;

interface Institution { id: number; slug: string; name: string; kind: string; }
interface Need { code: string; label: string; }

interface Referral {
    id: number; slug: string; institution_id: number | null;
    role_label_i18n: Record<string, string>; person_name: string | null;
    needs: string[] | null; audience: string[] | null;
    contact_channel: Record<string, string> | null;
    what_for_i18n: Record<string, string> | null;
    how_to_reach_i18n: Record<string, string> | null;
    status: string; is_active: boolean; sort_order: number;
    // Avviso editoriale calcolato dal server (email fuori dal dominio
    // dell'istituto): non blocca nulla, ma l'admin deve vederlo.
    warning?: string;
}

interface EventRow {
    id: number; slug: string; institution_id: number | null; kind: string;
    title_i18n: Record<string, string>; summary_i18n: Record<string, string> | null;
    starts_at: string; ends_at: string; registration_deadline: string | null;
    page_url: string | null; location: string | null; is_online: boolean;
    needs: string[] | null; audience: string[] | null;
    status: string; is_active: boolean; sort_order: number;
}

function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function OrientationReferralsPanel() {
    const { t } = useI18n();
    const [tab, setTab] = useState<'people' | 'events'>('people');
    const [institutions, setInstitutions] = useState<Institution[]>([]);
    const [needs, setNeeds] = useState<Need[]>([]);
    const [referrals, setReferrals] = useState<Referral[]>([]);
    const [events, setEvents] = useState<EventRow[]>([]);
    const [institutionFilter, setInstitutionFilter] = useState<string>('');
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setError('');
        try {
            const [i, n, r, e] = await Promise.all([
                apiFetch('/admin/institutions').then((res) => res.json()),
                apiFetch('/admin/referral-needs').then((res) => res.json()),
                apiFetch('/admin/orientation-referrals').then((res) => res.json()),
                apiFetch('/admin/orientation-events').then((res) => res.json()),
            ]);
            setInstitutions(i); setNeeds(n); setReferrals(r); setEvents(e);
        } catch {
            setError(t('admin.referrals.loadError'));
        }
    }, [t]);

    useEffect(() => { void load(); }, [load]);

    // Il messaggio del server e' la spiegazione del guard di certificazione:
    // mostrarlo com'e' dice all'admin che cosa manca, un "errore" generico no.
    const save = async (path: string, method: 'POST' | 'PUT', body: unknown) => {
        const res = await apiFetch(path, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const detail = await res.json().catch(() => ({}));
            setError(typeof detail.detail === 'string' ? detail.detail : `HTTP ${res.status}`);
            return false;
        }
        await load();
        return true;
    };

    const remove = async (path: string) => {
        const res = await apiFetch(path, { method: 'DELETE' });
        if (res.ok) await load();
    };

    const matchesFilter = (institutionId: number | null) =>
        !institutionFilter || String(institutionId ?? '') === institutionFilter;

    const institutionName = (id: number | null) =>
        id === null ? t('admin.referrals.national') : (institutions.find((i) => i.id === id)?.name ?? '—');

    return (
        <div className="space-y-4">
            {error && (
                <p className="flex items-center gap-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    <AlertTriangle className="h-4 w-4" /> {error}
                </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-1 rounded-md bg-slate-100 p-1">
                    {(['people', 'events'] as const).map((id) => (
                        <button key={id} type="button" onClick={() => setTab(id)}
                                className={`rounded px-3 py-1 text-sm ${tab === id ? 'bg-white shadow-sm' : 'text-slate-600'}`}>
                            {t(id === 'people' ? 'admin.referrals.people' : 'admin.referrals.events')}
                        </button>
                    ))}
                </div>
                <select value={institutionFilter} onChange={(e) => setInstitutionFilter(e.target.value)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                    <option value="">{t('admin.referrals.allInstitutions')}</option>
                    {institutions.map((i) => <option key={i.id} value={String(i.id)}>{i.name}</option>)}
                </select>
            </div>

            {tab === 'people' ? (
                <ReferralList
                    rows={referrals.filter((r) => matchesFilter(r.institution_id))}
                    institutions={institutions} needs={needs}
                    institutionName={institutionName}
                    onSave={(id, body) => save(
                        id ? `/admin/orientation-referrals/${id}` : '/admin/orientation-referrals',
                        id ? 'PUT' : 'POST', body)}
                    onDelete={(id) => remove(`/admin/orientation-referrals/${id}`)}
                />
            ) : (
                <EventList
                    rows={events.filter((e) => matchesFilter(e.institution_id))}
                    institutions={institutions} needs={needs}
                    institutionName={institutionName}
                    onSave={(id, body) => save(
                        id ? `/admin/orientation-events/${id}` : '/admin/orientation-events',
                        id ? 'PUT' : 'POST', body)}
                    onDelete={(id) => remove(`/admin/orientation-events/${id}`)}
                />
            )}
        </div>
    );
}
```

Nello stesso file, i pezzi condivisi e le due liste. I due form differiscono solo nei campi propri: tutto il resto — istituto, bisogni, pubblico, stato — vive in `SharedFields`, così una regola cambiata si cambia in un posto solo.

```tsx
function Chips({ values, selected, labelOf, onToggle }: {
    values: string[]; selected: string[];
    labelOf: (v: string) => string; onToggle: (v: string) => void;
}) {
    return (
        <div className="flex flex-wrap gap-1">
            {values.map((value) => (
                <button key={value} type="button" onClick={() => onToggle(value)}
                        className={`rounded-full px-2 py-0.5 text-xs ${
                            selected.includes(value) ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {labelOf(value)}
                </button>
            ))}
        </div>
    );
}

/** Un campo per lingua: il contratto i18n del catalogo e' un dizionario, non
 *  una colonna, e l'admin deve vedere quali lingue ha davvero compilato. */
function I18nFields({ label, value, onChange }: {
    label: string; value: Record<string, string>;
    onChange: (next: Record<string, string>) => void;
}) {
    return (
        <div>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">{label}</p>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
                {LANGS.map((lang) => (
                    <label key={lang} className="flex items-center gap-2">
                        <span className="w-6 text-xs uppercase text-slate-400">{lang}</span>
                        <input value={value[lang] || ''}
                               onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
                               className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
                    </label>
                ))}
            </div>
        </div>
    );
}

function SharedFields({ form, setForm, institutions, needs }: {
    form: Record<string, unknown>;
    setForm: (next: Record<string, unknown>) => void;
    institutions: Institution[]; needs: Need[];
}) {
    const selectedNeeds = (form.needs as string[]) || [];
    const selectedAudience = (form.audience as string[]) || [];
    return (
        <>
            <label className="block">
                <span className="text-xs uppercase text-slate-500">slug</span>
                <input value={(form.slug as string) || ''}
                       onChange={(e) => setForm({ ...form, slug: e.target.value })}
                       className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
            </label>
            <label className="block">
                <span className="text-xs uppercase text-slate-500">istituto</span>
                <select value={form.institution_id === null ? '' : String(form.institution_id)}
                        onChange={(e) => setForm({
                            ...form,
                            institution_id: e.target.value ? Number(e.target.value) : null,
                        })}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
                    <option value="">nazionale</option>
                    {institutions.map((i) => <option key={i.id} value={String(i.id)}>{i.name}</option>)}
                </select>
            </label>
            <div>
                <p className="text-xs uppercase text-slate-500">bisogni</p>
                <Chips values={needs.map((n) => n.code)} selected={selectedNeeds}
                       labelOf={(c) => needs.find((n) => n.code === c)?.label ?? c}
                       onToggle={(c) => setForm({ ...form, needs: toggle(selectedNeeds, c) })} />
            </div>
            <div>
                <p className="text-xs uppercase text-slate-500">pubblico</p>
                <Chips values={[...AUDIENCES]} selected={selectedAudience} labelOf={(a) => a}
                       onToggle={(a) => setForm({ ...form, audience: toggle(selectedAudience, a) })} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <select value={(form.status as string) || 'draft'}
                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                        className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                    <option value="draft">draft</option>
                    <option value="certified">certified</option>
                </select>
                <label className="flex items-center gap-1 text-sm">
                    <input type="checkbox" checked={Boolean(form.is_active)}
                           onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                    attiva
                </label>
                <label className="flex items-center gap-1 text-sm">
                    ordine
                    <input type="number" value={Number(form.sort_order) || 0}
                           onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                           className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm" />
                </label>
            </div>
        </>
    );
}

const EMPTY_REFERRAL = {
    slug: '', institution_id: null, role_label_i18n: {}, person_name: '',
    needs: [], audience: [], contact_channel: {}, what_for_i18n: {}, how_to_reach_i18n: {},
    status: 'draft', is_active: true, sort_order: 0,
};

function ReferralList({ rows, institutions, needs, institutionName, onSave, onDelete }: {
    rows: Referral[];
    institutions: Institution[]; needs: Need[];
    institutionName: (id: number | null) => string;
    onSave: (id: number | null, body: unknown) => Promise<boolean>;
    onDelete: (id: number) => void;
}) {
    const [editing, setEditing] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState<Record<string, unknown>>(EMPTY_REFERRAL);

    const open = (row?: Referral) => {
        setEditing(row ? row.id : 'new');
        setForm(row ? { ...row } : { ...EMPTY_REFERRAL });
    };

    const channel = (form.contact_channel as Record<string, string>) || {};
    const setChannel = (key: string, value: string) =>
        setForm({ ...form, contact_channel: { ...channel, [key]: value } });

    return (
        <div className="space-y-3">
            <button type="button" onClick={() => open()}
                    className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1 text-sm text-white">
                <Plus className="h-4 w-4" /> nuova figura
            </button>

            {rows.map((row) => (
                <article key={row.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        {row.status === 'certified' && <BadgeCheck className="h-4 w-4 text-emerald-600" />}
                        <span className="text-sm font-semibold text-slate-800">
                            {row.role_label_i18n.it || row.role_label_i18n.en || row.slug}
                        </span>
                        <span className="text-xs text-slate-500">{institutionName(row.institution_id)}</span>
                        <button type="button" onClick={() => open(row)} className="text-xs text-indigo-600">modifica</button>
                        <button type="button" onClick={() => onDelete(row.id)} className="text-xs text-rose-600">
                            <Trash2 className="h-3 w-3" />
                        </button>
                    </div>
                    {row.warning && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-amber-700">
                            <AlertTriangle className="h-3 w-3" /> {row.warning}
                        </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">{(row.needs || []).join(' · ')}</p>
                </article>
            ))}

            {editing !== null && (
                <form className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3"
                      onSubmit={async (e) => {
                          e.preventDefault();
                          const id = editing === 'new' ? null : editing;
                          if (await onSave(id, form)) setEditing(null);
                      }}>
                    <SharedFields form={form} setForm={setForm} institutions={institutions} needs={needs} />
                    <I18nFields label="ruolo o ufficio"
                                value={(form.role_label_i18n as Record<string, string>) || {}}
                                onChange={(v) => setForm({ ...form, role_label_i18n: v })} />
                    <I18nFields label="cosa puoi chiedere"
                                value={(form.what_for_i18n as Record<string, string>) || {}}
                                onChange={(v) => setForm({ ...form, what_for_i18n: v })} />
                    <I18nFields label="come raggiungerla"
                                value={(form.how_to_reach_i18n as Record<string, string>) || {}}
                                onChange={(v) => setForm({ ...form, how_to_reach_i18n: v })} />
                    <label className="block">
                        <span className="text-xs uppercase text-slate-500">persona (facoltativa, solo se gia' pubblica)</span>
                        <input value={(form.person_name as string) || ''}
                               onChange={(e) => setForm({ ...form, person_name: e.target.value })}
                               className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {(['email', 'hours', 'location', 'page_url'] as const).map((key) => (
                            <label key={key} className="block">
                                <span className="text-xs uppercase text-slate-500">{key}</span>
                                <input value={channel[key] || ''} onChange={(e) => setChannel(key, e.target.value)}
                                       className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
                            </label>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" className="rounded-md bg-indigo-600 px-3 py-1 text-sm text-white">salva</button>
                        <button type="button" onClick={() => setEditing(null)} className="text-sm text-slate-600">annulla</button>
                    </div>
                </form>
            )}
        </div>
    );
}

const EMPTY_EVENT = {
    slug: '', institution_id: null, kind: 'open-day', title_i18n: {}, summary_i18n: {},
    starts_at: '', ends_at: '', registration_deadline: '', page_url: '', location: '',
    is_online: false, needs: [], audience: [], status: 'draft', is_active: true, sort_order: 0,
};

function EventList({ rows, institutions, needs, institutionName, onSave, onDelete }: {
    rows: EventRow[]; institutions: Institution[]; needs: Need[];
    institutionName: (id: number | null) => string;
    onSave: (id: number | null, body: unknown) => Promise<boolean>;
    onDelete: (id: number) => void;
}) {
    const [editing, setEditing] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState<Record<string, unknown>>(EMPTY_EVENT);

    const open = (row?: EventRow) => {
        setEditing(row ? row.id : 'new');
        // `datetime-local` vuole i primi 16 caratteri ISO senza fuso.
        setForm(row ? {
            ...row,
            starts_at: (row.starts_at || '').slice(0, 16),
            ends_at: (row.ends_at || '').slice(0, 16),
            registration_deadline: (row.registration_deadline || '').slice(0, 16),
        } : { ...EMPTY_EVENT });
    };

    return (
        <div className="space-y-3">
            <button type="button" onClick={() => open()}
                    className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1 text-sm text-white">
                <Plus className="h-4 w-4" /> nuovo evento
            </button>

            {rows.map((row) => (
                <article key={row.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        {row.status === 'certified' && <BadgeCheck className="h-4 w-4 text-emerald-600" />}
                        <span className="text-sm font-semibold text-slate-800">
                            {row.title_i18n.it || row.title_i18n.en || row.slug}
                        </span>
                        <span className="text-xs text-slate-500">
                            {row.starts_at.slice(0, 10)} · {institutionName(row.institution_id)}
                        </span>
                        <button type="button" onClick={() => open(row)} className="text-xs text-indigo-600">modifica</button>
                        <button type="button" onClick={() => onDelete(row.id)} className="text-xs text-rose-600">
                            <Trash2 className="h-3 w-3" />
                        </button>
                    </div>
                </article>
            ))}

            {editing !== null && (
                <form className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3"
                      onSubmit={async (e) => {
                          e.preventDefault();
                          const id = editing === 'new' ? null : editing;
                          const body = {
                              ...form,
                              registration_deadline: form.registration_deadline || null,
                          };
                          if (await onSave(id, body)) setEditing(null);
                      }}>
                    <SharedFields form={form} setForm={setForm} institutions={institutions} needs={needs} />
                    <label className="block">
                        <span className="text-xs uppercase text-slate-500">tipo</span>
                        <select value={(form.kind as string) || 'open-day'}
                                onChange={(e) => setForm({ ...form, kind: e.target.value })}
                                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
                            {EVENT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                    </label>
                    <I18nFields label="titolo" value={(form.title_i18n as Record<string, string>) || {}}
                                onChange={(v) => setForm({ ...form, title_i18n: v })} />
                    <I18nFields label="descrizione" value={(form.summary_i18n as Record<string, string>) || {}}
                                onChange={(v) => setForm({ ...form, summary_i18n: v })} />
                    <div className="grid gap-2 sm:grid-cols-3">
                        {(['starts_at', 'ends_at', 'registration_deadline'] as const).map((key) => (
                            <label key={key} className="block">
                                <span className="text-xs uppercase text-slate-500">{key}</span>
                                <input type="datetime-local" value={(form[key] as string) || ''}
                                       onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                                       className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
                            </label>
                        ))}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block">
                            <span className="text-xs uppercase text-slate-500">page_url</span>
                            <input value={(form.page_url as string) || ''}
                                   onChange={(e) => setForm({ ...form, page_url: e.target.value })}
                                   className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
                        </label>
                        <label className="block">
                            <span className="text-xs uppercase text-slate-500">luogo</span>
                            <input value={(form.location as string) || ''}
                                   onChange={(e) => setForm({ ...form, location: e.target.value })}
                                   className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm" />
                        </label>
                    </div>
                    <label className="flex items-center gap-1 text-sm">
                        <input type="checkbox" checked={Boolean(form.is_online)}
                               onChange={(e) => setForm({ ...form, is_online: e.target.checked })} />
                        online
                    </label>
                    <div className="flex gap-2">
                        <button type="submit" className="rounded-md bg-indigo-600 px-3 py-1 text-sm text-white">salva</button>
                        <button type="button" onClick={() => setEditing(null)} className="text-sm text-slate-600">annulla</button>
                    </div>
                </form>
            )}
        </div>
    );
}
```

L'errore restituito dal server viene mostrato in cima al pannello **senza riformularlo**: è il testo del guard di certificazione, e dice esattamente che cosa manca. Un «errore» generico costringerebbe l'admin a indovinare.

- [ ] **Step 2: Monta la scheda**

In `frontend/src/lib/i18n-admin.ts`, aggiungi in ciascuna delle sei lingue:

```ts
    'admin.tab.orientationReferrals': 'Referenti ed eventi',
    'admin.referrals.people': 'Figure',
    'admin.referrals.events': 'Eventi',
    'admin.referrals.allInstitutions': 'Tutti gli istituti',
    'admin.referrals.national': 'Nazionale',
    'admin.referrals.loadError': 'Non riesco a caricare il catalogo.',
```

(en: `'Referrals and events'`, `'People'`, `'Events'`, `'All institutions'`, `'National'`, `'I cannot load the catalogue.'` — e le corrispondenti in es, fr, de, sv.)

In `frontend/src/app/admin/page.tsx`:

```tsx
import { OrientationReferralsPanel } from '@/components/admin/OrientationReferralsPanel';
```

nella lista delle schede, dopo `certifiedReadings` (riga ~62):

```tsx
                { id: 'orientationReferrals', label: t('admin.tab.orientationReferrals'), icon: Compass },
```

e nella resa (riga ~231):

```tsx
                        {activeTab === 'orientationReferrals' && <OrientationReferralsPanel />}
```

- [ ] **Step 3: Aggiungi l'istituto alla classe**

In `frontend/src/components/admin/GroupsPanel.tsx` (o nel pannello classi del docente, se la gestione è lì), aggiungi al form della classe un select `institution_id` alimentato da `/admin/institutions`, con opzione vuota. È ciò che alimenta il fallback di `referral_scope.py` per gli studenti che il taccuino non lo compilano.

Verifica che lo schema Pydantic della classe accetti il campo: se `StudentGroupCreate`/`Update` in `backend/schemas.py` non hanno `institution_id: Optional[int] = None`, aggiungilo, e assicurati che la route delle classi lo passi al modello.

- [ ] **Step 4: Verifica**

Run: `cd frontend && npx tsc --noEmit && npm run lint`
Expected: nessun errore.

Run: `docker compose up -d --build frontend`
Expected: container `Up`.

Verifica a mano, da admin: crea un istituto; crea una figura in bozza senza bisogni e prova a portarla a `certified`.
Expected: errore leggibile «Serve almeno un bisogno: senza, la voce non verrebbe mai proposta».

Poi completa la figura e certificala, assegna l'istituto a una classe, apri `/profilo/orientamento` come studente di quella classe.
Expected: la figura compare.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin/OrientationReferralsPanel.tsx frontend/src/lib/i18n-admin.ts frontend/src/app/admin/page.tsx frontend/src/components/admin/GroupsPanel.tsx backend/schemas.py
git commit -m "feat(admin): pannello di referenti ed eventi di orientamento

Due schede in un pannello solo, perche' figure ed eventi condividono
istituto, bisogni, pubblico e stato: separarli farebbe saltare avanti e
indietro mentre si popola lo stesso istituto. Gli errori del guard di
certificazione vengono mostrati come li scrive il server: dicono cosa
manca, un errore generico no. Selettore istituto sulla classe.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verifica finale

Prima di considerare il lavoro chiuso:

- [ ] `docker exec counselorbot_backend python -m backend.tests.test_referral_needs_scope` — verde
- [ ] `docker exec counselorbot_backend python -m backend.tests.test_orientation_referrals` — verde
- [ ] `docker exec counselorbot_backend python -m backend.tests.test_skills_intents` — verde
- [ ] `docker exec counselorbot_backend python -m backend.tests.test_skills_parity` — verde
- [ ] `docker exec counselorbot_backend python -m backend.tests.test_skills_engine` — verde
- [ ] `docker exec counselorbot_backend python -m backend.tests.test_certified_readings` — verde (nessuna regressione sui cataloghi vicini)
- [ ] `docker exec counselorbot_backend python -m backend.tests.test_smoke` — verde
- [ ] `cd frontend && npx tsc --noEmit && npm run lint` — nessun errore
- [ ] `docker compose up -d --build` e `docker compose ps` — tutti i container `Up`
- [ ] `make prompt-dry Q=QSA STEP=intro MSG="a chi posso rivolgermi?"` — l'envelope contiene il blocco `[REFERRALS]` oppure la direttiva di assenza, e **non** il nome dell'istituto
- [ ] `git push -u origin feature/orientation-referrals`
