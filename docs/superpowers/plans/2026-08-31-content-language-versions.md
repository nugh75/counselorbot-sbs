# Content Language Versions — Implementation Plan (sotto-progetto 1: fondamenta)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere lo stato di certificazione dei contenuti una proprietà della coppia (contenuto, lingua), spostare i testi da colonne per-lingua a JSON `_i18n`, e far dipendere l'esposizione all'utente da quello stato invece che da liste scritte a mano.

**Architecture:** Un registro `content_language_versions` tiene stato, provenienza e approvatore per ogni coppia (tipo di contenuto, chiave, lingua). I testi passano a colonne JSON `{lingua: testo}` con lettura in ripiego sulle vecchie colonne, che non vengono rimosse. `scoring_service` smette di avere una tupla di locale scritta a mano e chiede al registro se una lingua è somministrabile. Il frontend smette di tenere una seconda copia degli item e legge `/api/instruments/{code}/rules`.

**Tech Stack:** FastAPI, SQLAlchemy (no Alembic: migrazioni SQL idempotenti in `backend/main.py:_seed_and_migrate`), PostgreSQL, Next.js App Router, TypeScript.

**Spec:** `docs/superpowers/specs/2026-08-31-content-language-versions-design.md`

## Global Constraints

- **Lingue dell'app**: esattamente `("it", "en", "es", "fr", "de", "sv")`. Nessun'altra.
- **Migrazioni non distruttive**: si aggiungono colonne, non si rimuovono. Le colonne `*_it/_en/_es/_sv` restano e restano leggibili in ripiego.
- **Idempotenza**: ogni migrazione e ogni seed deve poter girare due volte senza cambiare il risultato. Pattern: `try/except` con `logger.debug` attorno a ogni `ALTER TABLE`, come le migrazioni già presenti in `backend/main.py:302-340`.
- **Nessun ripiego silenzioso di lingua per gli strumenti**: se un locale non è somministrabile, si risponde `409` con lo stato, mai contenuto di un'altra lingua.
- **Non-regressione**: `en` e `sv` restano somministrabili da chiunque dopo la migrazione. Un test lo blocca.
- **Il cancello dei tool non si accende in questo sotto-progetto** (spec §3.4): `certified_strategy_service._localized` mantiene il ripiego sull'italiano. Qui si scrive solo il registro.
- **Test su Postgres dedicato** `counselorbot_test`, mai SQLite. Esecuzione: `docker exec counselorbot_backend python -m backend.tests.<modulo>`.
- **Docker**: il codice è dentro l'immagine, nessun volume mount. Ogni modifica al backend o al frontend richiede `docker compose up -d --build`.
- **Commit**: Conventional Commits, atomici, uno per task.

---

### Task 1: Vocabolari di stato e transizioni

Logica pura, nessun DB. È il pezzo su cui si appoggia tutto il resto.

**Files:**
- Create: `backend/content_versions.py`
- Test: `backend/tests/test_content_versions.py`

**Interfaces:**
- Consumes: niente.
- Produces:
  - `APP_LOCALES: tuple[str, ...]`
  - `INSTRUMENT_STATUSES: tuple[str, ...]`, `TOOL_STATUSES: tuple[str, ...]`
  - `CONTENT_TYPES: dict[str, tuple[str, ...]]`
  - `ContentVersionError(ValueError)`
  - `statuses_for(content_type: str) -> tuple[str, ...]`
  - `is_served(content_type: str, status: str) -> bool`
  - `can_transition(content_type: str, current: str, target: str) -> bool`
  - `assert_transition(content_type: str, current: str, target: str) -> None`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_content_versions.py`:

```python
"""Test degli stati di certificazione per (contenuto, lingua).

Parte pura: vocabolari e transizioni. Nessun database.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_content_versions
"""
from backend.content_versions import (
    APP_LOCALES,
    CONTENT_TYPES,
    INSTRUMENT_STATUSES,
    TOOL_STATUSES,
    ContentVersionError,
    assert_transition,
    can_transition,
    is_served,
    statuses_for,
)


def test_app_locales_are_the_six_of_the_interface():
    assert APP_LOCALES == ("it", "en", "es", "fr", "de", "sv")


def test_instruments_and_tools_have_different_ladders():
    assert INSTRUMENT_STATUSES == ("draft", "translated", "reviewed", "pilot", "validated")
    assert TOOL_STATUSES == ("draft", "translated", "certified")
    assert statuses_for("instrument") == INSTRUMENT_STATUSES
    assert statuses_for("certified_strategy") == TOOL_STATUSES


def test_unknown_content_type_is_refused():
    try:
        statuses_for("nonesiste")
    except ContentVersionError:
        return
    raise AssertionError("un tipo di contenuto sconosciuto deve essere rifiutato")


def test_only_the_last_rungs_are_served():
    assert is_served("instrument", "pilot") is True
    assert is_served("instrument", "validated") is True
    assert is_served("instrument", "reviewed") is False
    assert is_served("instrument", "draft") is False
    assert is_served("certified_strategy", "certified") is True
    assert is_served("certified_strategy", "translated") is False


def test_promotion_advances_one_rung_at_a_time():
    assert can_transition("instrument", "draft", "translated") is True
    assert can_transition("instrument", "translated", "reviewed") is True
    # saltare la revisione cognitiva per andare al pilot non e' ammesso
    assert can_transition("instrument", "translated", "pilot") is False
    assert can_transition("instrument", "draft", "validated") is False


def test_demotion_is_always_allowed():
    # una traduzione trovata sbagliata deve poter tornare indietro di quanto serve
    assert can_transition("instrument", "validated", "draft") is True
    assert can_transition("instrument", "pilot", "translated") is True
    assert can_transition("certified_strategy", "certified", "draft") is True


def test_same_status_is_not_a_transition():
    assert can_transition("instrument", "pilot", "pilot") is False


def test_status_outside_the_ladder_is_refused():
    assert can_transition("certified_strategy", "draft", "validated") is False
    try:
        assert_transition("certified_strategy", "draft", "validated")
    except ContentVersionError as exc:
        assert "validated" in str(exc)
        return
    raise AssertionError("uno stato fuori vocabolario deve essere rifiutato")


def test_every_content_type_has_a_served_status():
    for content_type, ladder in CONTENT_TYPES.items():
        assert any(is_served(content_type, s) for s in ladder), content_type


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

Run: `docker exec counselorbot_backend python -m backend.tests.test_content_versions`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.content_versions'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/content_versions.py`:

```python
"""Stato di certificazione di un contenuto in una lingua.

`instruments.status` e' per strumento e `certified_strategies.status` e' per
riga, ma il protocollo di validazione impone che ogni lingua abbia un cammino
suo: lo svedese puo' essere validato mentre il francese e' ancora bozza. Qui
vivono i vocabolari di stato e la regola di transizione; il registro che li
applica sta in `content_version_service.py`.
"""
from __future__ import annotations

# Le lingue dell'interfaccia. Unica lista autorevole lato backend.
APP_LOCALES = ("it", "en", "es", "fr", "de", "sv")

# Strumenti psicometrici: il cammino del protocollo di validazione
# (docs/validazione/progetto-validazione-qsa-qsar-sv-en.md).
INSTRUMENT_STATUSES = ("draft", "translated", "reviewed", "pilot", "validated")

# Tool: non sono misure, non hanno norme, si fermano alla revisione admin.
TOOL_STATUSES = ("draft", "translated", "certified")

CONTENT_TYPES: dict[str, tuple[str, ...]] = {
    "instrument": INSTRUMENT_STATUSES,
    "certified_strategy": TOOL_STATUSES,
    "certified_reading": TOOL_STATUSES,
    "guided_step_question": TOOL_STATUSES,
    "assistant_question": TOOL_STATUSES,
}

# Stati in cui il contenuto arriva all'utente finale.
_SERVED: dict[str, tuple[str, ...]] = {
    "instrument": ("pilot", "validated"),
    "certified_strategy": ("certified",),
    "certified_reading": ("certified",),
    "guided_step_question": ("certified",),
    "assistant_question": ("certified",),
}


class ContentVersionError(ValueError):
    """Tipo di contenuto, stato o transizione fuori vocabolario."""


def statuses_for(content_type: str) -> tuple[str, ...]:
    try:
        return CONTENT_TYPES[content_type]
    except KeyError:
        raise ContentVersionError(f"Tipo di contenuto sconosciuto: {content_type}") from None


def is_served(content_type: str, status: str) -> bool:
    """Il contenuto in questo stato viene mostrato all'utente finale?"""
    return status in _SERVED.get(content_type, ())


def can_transition(content_type: str, current: str, target: str) -> bool:
    """Avanti di un gradino alla volta; indietro di quanto serve.

    La promozione salta-gradini nasconderebbe un passo del protocollo (per
    esempio le interviste cognitive prima del pilot). La retrocessione invece e'
    sempre legittima: una traduzione trovata sbagliata deve poter tornare in
    bozza subito, non un gradino per volta.
    """
    ladder = statuses_for(content_type)
    if current not in ladder or target not in ladder:
        return False
    delta = ladder.index(target) - ladder.index(current)
    return delta == 1 or delta < 0


def assert_transition(content_type: str, current: str, target: str) -> None:
    if not can_transition(content_type, current, target):
        raise ContentVersionError(
            f"Transizione non ammessa per {content_type}: {current} -> {target}"
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec counselorbot_backend python -m backend.tests.test_content_versions`
Expected: PASS — `9/9 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/content_versions.py backend/tests/test_content_versions.py
git commit -m "feat: add per-language certification status vocabularies

Instruments follow the validation protocol ladder and tools stop at admin
review, so the two need different vocabularies. Promotion advances one rung at
a time because skipping one would hide a step of the protocol; demotion is
unrestricted because a translation found wrong must be withdrawable at once."
```

---

### Task 2: Modello e servizio del registro

**Files:**
- Modify: `backend/models.py` (in fondo, dopo `IdeaReference`)
- Create: `backend/content_version_service.py`
- Modify: `backend/tests/test_content_versions.py` (aggiunge la parte con DB)

**Interfaces:**
- Consumes: `backend.content_versions.{statuses_for, assert_transition, is_served, APP_LOCALES}`
- Produces:
  - `models.ContentLanguageVersion`
  - `content_version_service.get_version(db, content_type, content_key, locale) -> models.ContentLanguageVersion | None`
  - `content_version_service.upsert_version(db, content_type, content_key, locale, *, status, source=None, version_label=None, notes=None, approved_by=None) -> models.ContentLanguageVersion`
  - `content_version_service.promote(db, version, target_status, approved_by) -> models.ContentLanguageVersion`
  - `content_version_service.served_locales(db, content_type, content_key) -> list[str]`
  - `content_version_service.status_map(db, content_type, content_key) -> dict[str, str]`

- [ ] **Step 1: Write the failing test**

Aggiungi in fondo a `backend/tests/test_content_versions.py`, **prima** del blocco `if __name__ == "__main__":`, e aggiungi gli import in cima al file:

```python
# --- in cima al file, dopo gli import esistenti ---
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import uuid
from urllib.parse import urlsplit, urlunsplit

import psycopg2
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import database, models
from backend import content_version_service as cvs

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


# --- registro (con database) -------------------------------------------------

def test_upsert_creates_then_updates_the_same_row():
    db = _TestSession()
    try:
        key = f"{PREFIX}-QSA"
        first = cvs.upsert_version(db, "instrument", key, "fr", status="draft", source="llm:gemma")
        again = cvs.upsert_version(db, "instrument", key, "fr", status="translated")
        assert first.id == again.id
        assert again.status == "translated"
        # la provenienza precedente non viene cancellata da un aggiornamento parziale
        assert again.source == "llm:gemma"
    finally:
        db.close()


def test_promote_records_who_approved_and_when():
    db = _TestSession()
    try:
        key = f"{PREFIX}-QSAr"
        row = cvs.upsert_version(db, "instrument", key, "de", status="draft")
        promoted = cvs.promote(db, row, "translated", approved_by="daniele")
        assert promoted.status == "translated"
        assert promoted.approved_by == "daniele"
        assert promoted.approved_at is not None
    finally:
        db.close()


def test_promote_refuses_a_skipped_rung():
    db = _TestSession()
    try:
        key = f"{PREFIX}-ZTPI"
        row = cvs.upsert_version(db, "instrument", key, "de", status="translated")
        try:
            cvs.promote(db, row, "pilot", approved_by="daniele")
        except ContentVersionError:
            db.rollback()
            return
        raise AssertionError("promuovere da translated a pilot deve essere rifiutato")
    finally:
        db.close()


def test_served_locales_returns_only_the_exposed_ones():
    db = _TestSession()
    try:
        key = f"{PREFIX}-QPCS"
        cvs.upsert_version(db, "instrument", key, "en", status="pilot")
        cvs.upsert_version(db, "instrument", key, "sv", status="validated")
        cvs.upsert_version(db, "instrument", key, "es", status="draft")
        assert sorted(cvs.served_locales(db, "instrument", key)) == ["en", "sv"]
        assert cvs.status_map(db, "instrument", key)["es"] == "draft"
    finally:
        db.close()


def test_upsert_refuses_a_locale_outside_the_app():
    db = _TestSession()
    try:
        try:
            cvs.upsert_version(db, "instrument", f"{PREFIX}-X", "pt", status="draft")
        except ContentVersionError:
            db.rollback()
            return
        raise AssertionError("una lingua fuori dalle sei deve essere rifiutata")
    finally:
        db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec counselorbot_backend python -m backend.tests.test_content_versions`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.content_version_service'`

- [ ] **Step 3: Write minimal implementation**

Aggiungi in fondo a `backend/models.py`:

```python
class ContentLanguageVersion(Base):
    """Stato di certificazione di un contenuto in una lingua.

    Autorita' sullo STATO, non sul contenuto: il testo resta nella sua tabella.
    Tenere separate le due cose evita che una promozione riscriva un testo o che
    una correzione di testo cambi in silenzio uno stato di certificazione.
    """

    __tablename__ = "content_language_versions"
    __table_args__ = (
        UniqueConstraint("content_type", "content_key", "locale", name="uq_content_language_version"),
    )

    id = Column(Integer, primary_key=True, index=True)
    content_type = Column(String, nullable=False, index=True)   # instrument | certified_strategy | ...
    content_key = Column(String, nullable=False, index=True)    # codice strumento, slug, ...
    locale = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, default="draft")
    source = Column(String, nullable=True)                      # human | published:<rif> | llm:<modello>
    version_label = Column(String, nullable=True)               # aggancia le validation_responses
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

Se `UniqueConstraint` non è già importato in cima a `backend/models.py`, aggiungilo alla riga di import di SQLAlchemy.

Create `backend/content_version_service.py`:

```python
"""Registro degli stati di certificazione per (contenuto, lingua)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from . import models
from .content_versions import (
    APP_LOCALES,
    ContentVersionError,
    assert_transition,
    is_served,
    statuses_for,
)


def _validate(content_type: str, locale: str, status: Optional[str] = None) -> None:
    ladder = statuses_for(content_type)  # solleva se il tipo e' sconosciuto
    if locale not in APP_LOCALES:
        raise ContentVersionError(f"Lingua fuori dall'app: {locale}")
    if status is not None and status not in ladder:
        raise ContentVersionError(f"Stato {status} non previsto per {content_type}")


def get_version(db: Session, content_type: str, content_key: str, locale: str):
    return (
        db.query(models.ContentLanguageVersion)
        .filter(
            models.ContentLanguageVersion.content_type == content_type,
            models.ContentLanguageVersion.content_key == content_key,
            models.ContentLanguageVersion.locale == locale,
        )
        .first()
    )


def upsert_version(
    db: Session,
    content_type: str,
    content_key: str,
    locale: str,
    *,
    status: str,
    source: Optional[str] = None,
    version_label: Optional[str] = None,
    notes: Optional[str] = None,
    approved_by: Optional[str] = None,
) -> models.ContentLanguageVersion:
    """Crea o aggiorna la riga. I campi lasciati a None non vengono azzerati."""
    _validate(content_type, locale, status)
    row = get_version(db, content_type, content_key, locale)
    if row is None:
        row = models.ContentLanguageVersion(
            content_type=content_type, content_key=content_key, locale=locale
        )
        db.add(row)
    row.status = status
    if source is not None:
        row.source = source
    if version_label is not None:
        row.version_label = version_label
    if notes is not None:
        row.notes = notes
    if approved_by is not None:
        row.approved_by = approved_by
        row.approved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return row


def promote(
    db: Session,
    version: models.ContentLanguageVersion,
    target_status: str,
    approved_by: str,
) -> models.ContentLanguageVersion:
    """Transizione di stato tracciata. Rifiuta i salti non previsti."""
    assert_transition(version.content_type, version.status, target_status)
    version.status = target_status
    version.approved_by = approved_by
    version.approved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(version)
    return version


def status_map(db: Session, content_type: str, content_key: str) -> dict[str, str]:
    rows = (
        db.query(models.ContentLanguageVersion)
        .filter(
            models.ContentLanguageVersion.content_type == content_type,
            models.ContentLanguageVersion.content_key == content_key,
        )
        .all()
    )
    return {r.locale: r.status for r in rows}


def served_locales(db: Session, content_type: str, content_key: str) -> list[str]:
    """Le lingue in cui questo contenuto puo' essere mostrato, in ordine d'app."""
    statuses = status_map(db, content_type, content_key)
    return [loc for loc in APP_LOCALES if is_served(content_type, statuses.get(loc, ""))]
```

Aggiungi anche l'import di `ContentVersionError` in cima al file di test se non c'è già (è già importato al Task 1).

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec counselorbot_backend python -m backend.tests.test_content_versions`
Expected: PASS — tutti i test, inclusi i cinque nuovi.

- [ ] **Step 5: Commit**

```bash
git add backend/models.py backend/content_version_service.py backend/tests/test_content_versions.py
git commit -m "feat: add the content language version registry

The registry owns the status, not the text: the text stays in its own table.
Keeping them apart means a promotion cannot rewrite a translation and an edit to
a translation cannot silently change a certification status."
```

---

### Task 3: Colonne JSON `_i18n` e lettore con ripiego

**Files:**
- Create: `backend/i18n_fields.py`
- Modify: `backend/models.py` (`Instrument`, `Factor`, `QuestionnaireItem`, `CertifiedStrategy`)
- Modify: `backend/main.py` (dentro `_seed_and_migrate`, nella lista `for table, clause in [...]` alle righe ~322-340)
- Create: `backend/content_versions_seed.py`
- Modify: `backend/tests/test_content_versions.py`

**Interfaces:**
- Consumes: `backend.content_versions.APP_LOCALES`
- Produces:
  - `i18n_fields.LEGACY_LOCALES: tuple[str, ...]`
  - `i18n_fields.localized(row, field: str, locale: str) -> str | None`
  - `i18n_fields.merged_i18n(row, field: str) -> dict[str, str]`
  - `i18n_fields.locales_with_text(row, field: str) -> set[str]`
  - `content_versions_seed.backfill_i18n_columns(db) -> int`
  - Colonne nuove: `Instrument.name_i18n`, `Factor.label_i18n`, `Factor.description_i18n`, `QuestionnaireItem.text_i18n`, `CertifiedStrategy.name_i18n`, `CertifiedStrategy.recommended_when_i18n`, `CertifiedStrategy.description_i18n`

- [ ] **Step 1: Write the failing test**

Aggiungi a `backend/tests/test_content_versions.py`, prima del blocco `if __name__ == "__main__":`:

```python
# --- campi i18n -------------------------------------------------------------

from backend import i18n_fields
from backend.content_versions_seed import backfill_i18n_columns


def test_json_wins_over_the_legacy_column():
    item = models.QuestionnaireItem(
        instrument_code="X", item_number=1,
        text_en="legacy english", text_i18n={"en": "json english", "fr": "francais"},
    )
    assert i18n_fields.localized(item, "text", "en") == "json english"
    assert i18n_fields.localized(item, "text", "fr") == "francais"


def test_legacy_column_is_still_read_when_json_is_missing():
    item = models.QuestionnaireItem(instrument_code="X", item_number=1, text_sv="svenska")
    assert i18n_fields.localized(item, "text", "sv") == "svenska"


def test_a_missing_language_is_none_not_another_language():
    item = models.QuestionnaireItem(instrument_code="X", item_number=1, text_en="english")
    assert i18n_fields.localized(item, "text", "de") is None


def test_merged_view_lists_every_language_that_has_text():
    factor = models.Factor(
        instrument_code="X", code="C1",
        label_en="Elaborative", label_sv="Elaborativa", label_i18n={"fr": "Elaboratives"},
    )
    assert i18n_fields.merged_i18n(factor, "label") == {
        "en": "Elaborative", "sv": "Elaborativa", "fr": "Elaboratives",
    }
    assert i18n_fields.locales_with_text(factor, "label") == {"en", "sv", "fr"}


def test_empty_string_does_not_count_as_translated():
    factor = models.Factor(instrument_code="X", code="C1", label_en="", label_i18n={"sv": "   "})
    assert i18n_fields.locales_with_text(factor, "label") == set()


def test_backfill_moves_legacy_columns_into_json_and_is_idempotent():
    db = _TestSession()
    try:
        code = f"{PREFIX}-BF"
        db.add(models.QuestionnaireItem(
            instrument_code=code, item_number=1, text_en="english", text_sv="svenska",
        ))
        db.commit()
        moved = backfill_i18n_columns(db)
        assert moved >= 1
        row = (
            db.query(models.QuestionnaireItem)
            .filter(models.QuestionnaireItem.instrument_code == code)
            .first()
        )
        assert row.text_i18n == {"en": "english", "sv": "svenska"}
        # la colonna vecchia non viene svuotata: un rollback del codice deve poter leggere ancora
        assert row.text_en == "english"
        # seconda passata: nessuna riga toccata
        assert backfill_i18n_columns(db) == 0
    finally:
        db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec counselorbot_backend python -m backend.tests.test_content_versions`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.i18n_fields'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/i18n_fields.py`:

```python
"""Lettura di un campo multilingue durante la convivenza JSON / colonne vecchie.

Le tabelle degli strumenti e delle strategie certificate nascono con una colonna
per lingua (`text_it`, `text_en`, ...). Passano a un JSON `{lingua: testo}`, ma
le colonne vecchie restano per una release: un rollback del codice non deve
perdere testi. Qui c'e' l'unico punto che sa di questa convivenza.
"""
from __future__ import annotations

from typing import Any, Optional

# Le sole lingue che hanno mai avuto una colonna dedicata.
LEGACY_LOCALES = ("it", "en", "es", "sv")


def _clean(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def localized(row: Any, field: str, locale: str) -> Optional[str]:
    """Il testo di `field` in `locale`, o None. Nessun ripiego su altre lingue.

    Il ripiego di lingua e' una decisione di prodotto, non di lettura: chi legge
    decide se mostrare nulla o chiedere altro. Qui si risponde solo alla domanda
    posta.
    """
    data = getattr(row, f"{field}_i18n", None)
    if isinstance(data, dict):
        value = _clean(data.get(locale))
        if value:
            return value
    if locale in LEGACY_LOCALES:
        return _clean(getattr(row, f"{field}_{locale}", None))
    return None


def merged_i18n(row: Any, field: str) -> dict[str, str]:
    """Vista unica delle lingue disponibili: colonne vecchie piu' JSON, JSON vince."""
    out: dict[str, str] = {}
    for locale in LEGACY_LOCALES:
        value = _clean(getattr(row, f"{field}_{locale}", None))
        if value:
            out[locale] = value
    data = getattr(row, f"{field}_i18n", None)
    if isinstance(data, dict):
        for locale, value in data.items():
            cleaned = _clean(value)
            if cleaned:
                out[locale] = cleaned
    return out


def locales_with_text(row: Any, field: str) -> set[str]:
    return set(merged_i18n(row, field).keys())
```

In `backend/models.py`, aggiungi la colonna JSON accanto alle colonne per lingua esistenti:

```python
# in Instrument, dopo name_sv
    name_i18n = Column(JSON, nullable=True)        # {lingua: nome}; le colonne name_* restano in ripiego

# in Factor, dopo description_sv
    label_i18n = Column(JSON, nullable=True)
    description_i18n = Column(JSON, nullable=True)

# in QuestionnaireItem, dopo text_sv
    text_i18n = Column(JSON, nullable=True)

# in CertifiedStrategy, dopo description_sv
    name_i18n = Column(JSON, nullable=True)
    recommended_when_i18n = Column(JSON, nullable=True)
    description_i18n = Column(JSON, nullable=True)
```

Create `backend/content_versions_seed.py`:

```python
"""Travaso delle colonne per lingua nei campi JSON e derivazione degli stati.

Girano all'avvio, dopo `create_all`. Entrambi idempotenti: la seconda esecuzione
non tocca nulla.
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from . import models
from .i18n_fields import merged_i18n

logger = logging.getLogger(__name__)

# (modello, campi da travasare)
_I18N_FIELDS = [
    (models.Instrument, ("name",)),
    (models.Factor, ("label", "description")),
    (models.QuestionnaireItem, ("text",)),
    (models.CertifiedStrategy, ("name", "recommended_when", "description")),
]


def backfill_i18n_columns(db: Session) -> int:
    """Copia le colonne per lingua nei campi JSON. Ritorna le righe toccate.

    Non svuota le colonne vecchie: restano leggibili finche' esistono, cosi' un
    rollback del codice non perde testi.
    """
    touched = 0
    for model, fields in _I18N_FIELDS:
        for row in db.query(model).all():
            changed = False
            for field in fields:
                if getattr(row, f"{field}_i18n", None):
                    continue  # gia' popolato: non si sovrascrive
                merged = merged_i18n(row, field)
                if merged:
                    setattr(row, f"{field}_i18n", merged)
                    changed = True
            if changed:
                touched += 1
    if touched:
        db.commit()
        logger.info("backfill i18n: %d righe travasate", touched)
    return touched
```

In `backend/main.py`, dentro `_seed_and_migrate`, aggiungi le clausole alla lista `for table, clause in [...]` che sta intorno alla riga 322 (quella con `administration_plans`/`teacher_notes`):

```python
            # Testi multilingue: da colonna per lingua a JSON {lingua: testo}.
            # Le colonne vecchie restano, lette in ripiego da backend/i18n_fields.py.
            ("instruments", "ADD COLUMN name_i18n JSON"),
            ("factors", "ADD COLUMN label_i18n JSON"),
            ("factors", "ADD COLUMN description_i18n JSON"),
            ("questionnaire_items", "ADD COLUMN text_i18n JSON"),
            ("certified_strategies", "ADD COLUMN name_i18n JSON"),
            ("certified_strategies", "ADD COLUMN recommended_when_i18n JSON"),
            ("certified_strategies", "ADD COLUMN description_i18n JSON"),
```

Sempre in `_seed_and_migrate`, dopo le migrazioni raw-SQL e prima del `finally`, chiama il travaso:

```python
        # Travaso dei testi nelle colonne JSON (idempotente).
        try:
            from .content_versions_seed import backfill_i18n_columns
            backfill_i18n_columns(db)
        except Exception as e:
            logger.debug(f"backfill i18n skipped/failed: {e}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec counselorbot_backend python -m backend.tests.test_content_versions`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/i18n_fields.py backend/content_versions_seed.py backend/models.py backend/main.py backend/tests/test_content_versions.py
git commit -m "feat: store instrument and strategy texts as {lang: text} JSON

Fixed per-language columns meant every new language was a schema migration on
four tables. The JSON fields follow the pattern already used by guided step
labels, counselor descriptions and certified readings.

The old columns are kept and still read as a fallback, so a rollback of the code
loses no text. Removing them is a later, separate change."
```

---

### Task 4: Derivazione degli stati iniziali

**Files:**
- Modify: `backend/content_versions_seed.py`
- Modify: `backend/main.py` (`_seed_and_migrate`)
- Modify: `backend/tests/test_content_versions.py`

**Interfaces:**
- Consumes: `content_version_service.upsert_version`, `i18n_fields.locales_with_text`, `content_versions.APP_LOCALES`
- Produces:
  - `content_versions_seed.derive_instrument_versions(db) -> int`
  - `content_versions_seed.derive_strategy_versions(db) -> int`

- [ ] **Step 1: Write the failing test**

Aggiungi a `backend/tests/test_content_versions.py`:

```python
# --- derivazione degli stati iniziali ---------------------------------------

from backend.content_versions_seed import derive_instrument_versions, derive_strategy_versions


def test_derivation_gives_every_language_a_row():
    db = _TestSession()
    try:
        code = f"{PREFIX}-DER"
        db.add(models.Instrument(code=code, response_scale_min=1, response_scale_max=4))
        db.add(models.Factor(instrument_code=code, code="C1", label_en="Elaborative"))
        db.add(models.QuestionnaireItem(
            instrument_code=code, item_number=1, factor_code="C1",
            text_en="english item", text_sv="svenskt item",
        ))
        db.commit()

        derive_instrument_versions(db)
        statuses = cvs.status_map(db, "instrument", code)
        # tutte e sei hanno una riga: "in che stato e' il tedesco?" ha sempre risposta
        assert set(statuses) == set(APP_LOCALES)
        # en e sv hanno item ma nessuna norma validata -> pilot, come oggi
        assert statuses["en"] == "pilot"
        assert statuses["sv"] == "pilot"
        # le altre non hanno item -> draft
        assert statuses["es"] == "draft"
        assert statuses["fr"] == "draft"
        assert statuses["de"] == "draft"
        assert statuses["it"] == "draft"
    finally:
        db.close()


def test_validated_norms_promote_the_language_to_validated():
    db = _TestSession()
    try:
        code = f"{PREFIX}-NORM"
        db.add(models.Instrument(code=code, response_scale_min=1, response_scale_max=4))
        db.add(models.QuestionnaireItem(
            instrument_code=code, item_number=1, factor_code="C1", text_en="english item",
        ))
        db.add(models.NormThreshold(
            instrument_code=code, locale="en", factor_code="C1",
            raw_min=0, raw_max=10, stanine=5, status="validated",
        ))
        db.commit()

        derive_instrument_versions(db)
        assert cvs.status_map(db, "instrument", code)["en"] == "validated"
    finally:
        db.close()


def test_derivation_never_overwrites_an_existing_row():
    db = _TestSession()
    try:
        code = f"{PREFIX}-KEEP"
        db.add(models.Instrument(code=code, response_scale_min=1, response_scale_max=4))
        db.add(models.QuestionnaireItem(
            instrument_code=code, item_number=1, factor_code="C1", text_en="english item",
        ))
        db.commit()
        # un admin ha gia' portato l'inglese a reviewed: la derivazione non lo riporta a pilot
        cvs.upsert_version(db, "instrument", code, "en", status="reviewed", approved_by="daniele")

        derive_instrument_versions(db)
        assert cvs.status_map(db, "instrument", code)["en"] == "reviewed"
    finally:
        db.close()


def test_derivation_is_idempotent():
    db = _TestSession()
    try:
        code = f"{PREFIX}-IDEM"
        db.add(models.Instrument(code=code, response_scale_min=1, response_scale_max=4))
        db.add(models.QuestionnaireItem(
            instrument_code=code, item_number=1, factor_code="C1", text_en="english item",
        ))
        db.commit()
        first = derive_instrument_versions(db)
        assert first >= 1
        assert derive_instrument_versions(db) == 0
    finally:
        db.close()


def test_certified_strategies_get_an_italian_registry_row():
    db = _TestSession()
    try:
        slug = f"{PREFIX}-strategia"
        db.add(models.CertifiedStrategy(
            slug=slug, name_it="Ripasso distribuito", description_it="Come si fa",
            status="certified", is_active=True,
        ))
        db.commit()
        derive_strategy_versions(db)
        statuses = cvs.status_map(db, "certified_strategy", slug)
        assert statuses["it"] == "certified"
        # le altre lingue non hanno testo: restano bozza, non nascono certificate
        assert statuses["de"] == "draft"
    finally:
        db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec counselorbot_backend python -m backend.tests.test_content_versions`
Expected: FAIL — `ImportError: cannot import name 'derive_instrument_versions'`

- [ ] **Step 3: Write minimal implementation**

Aggiungi in fondo a `backend/content_versions_seed.py`:

```python
from .content_version_service import get_version, upsert_version
from .content_versions import APP_LOCALES
from .i18n_fields import locales_with_text


def _instrument_locales_with_items(db: Session, code: str) -> set[str]:
    items = (
        db.query(models.QuestionnaireItem)
        .filter(
            models.QuestionnaireItem.instrument_code == code,
            models.QuestionnaireItem.active == True,  # noqa: E712
        )
        .all()
    )
    found: set[str] = set()
    for item in items:
        found |= locales_with_text(item, "text")
    return found


def _validated_norm_locales(db: Session, code: str) -> set[str]:
    rows = (
        db.query(models.NormThreshold)
        .filter(
            models.NormThreshold.instrument_code == code,
            models.NormThreshold.status == "validated",
        )
        .all()
    )
    return {r.locale for r in rows}


def derive_instrument_versions(db: Session) -> int:
    """Stato iniziale di ogni (strumento, lingua), dedotto dai dati presenti.

    Nessun indovinello: una lingua senza item e' bozza; una lingua con item ma
    senza norme validate e' `pilot`, che e' esattamente il comportamento di oggi
    (somministrabile con avviso sperimentale e stanine non normate); con norme
    validate e' `validated`. Non tocca mai una riga esistente: una promozione
    decisa da un admin vale piu' di una deduzione.
    """
    created = 0
    for instrument in db.query(models.Instrument).all():
        with_items = _instrument_locales_with_items(db, instrument.code)
        with_norms = _validated_norm_locales(db, instrument.code)
        for locale in APP_LOCALES:
            if get_version(db, "instrument", instrument.code, locale) is not None:
                continue
            if locale not in with_items:
                status = "draft"
            elif locale in with_norms:
                status = "validated"
            else:
                status = "pilot"
            upsert_version(
                db, "instrument", instrument.code, locale,
                status=status, source="derived",
                notes="stato dedotto dai dati alla migrazione",
            )
            created += 1
    return created


def derive_strategy_versions(db: Session) -> int:
    """Stato iniziale di ogni (strategia, lingua).

    Una strategia gia' `certified` lo e' nelle lingue in cui ha testo; nelle
    altre e' bozza. Il seed e' italiano, quindi in pratica nasce certificata solo
    in italiano.
    """
    created = 0
    for strategy in db.query(models.CertifiedStrategy).all():
        with_text = locales_with_text(strategy, "description") | locales_with_text(strategy, "name")
        for locale in APP_LOCALES:
            if get_version(db, "certified_strategy", strategy.slug, locale) is not None:
                continue
            if locale in with_text and strategy.status == "certified":
                status = "certified"
            elif locale in with_text:
                status = "translated"
            else:
                status = "draft"
            upsert_version(
                db, "certified_strategy", strategy.slug, locale,
                status=status, source="derived",
                notes="stato dedotto dai dati alla migrazione",
            )
            created += 1
    return created
```

In `backend/main.py`, estendi la chiamata aggiunta al Task 3:

```python
        # Travaso dei testi nelle colonne JSON e stato iniziale per lingua (idempotenti).
        try:
            from .content_versions_seed import (
                backfill_i18n_columns,
                derive_instrument_versions,
                derive_strategy_versions,
            )
            backfill_i18n_columns(db)
            derive_instrument_versions(db)
            derive_strategy_versions(db)
        except Exception as e:
            logger.debug(f"content language versions seed skipped/failed: {e}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec counselorbot_backend python -m backend.tests.test_content_versions`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/content_versions_seed.py backend/main.py backend/tests/test_content_versions.py
git commit -m "feat: derive the initial language status from the data

English and Swedish have items but no validated norms, which is exactly what
pilot means: administrable with an experimental banner and unnormed stanines. So
they land on pilot and nobody loses an access they had. Spanish, French, German
and Italian have no items and land on draft.

Derivation never overwrites an existing row: an admin's promotion outranks a
deduction."
```

---

### Task 5: `scoring_service` chiede al registro

**Files:**
- Modify: `backend/scoring_service.py:18` (tupla `SUPPORTED_LOCALES`), `:102` (`_label_for`), `:134`, `:251` (controlli di locale), `:281-318` (`get_rules`), `:186` (copy `_TEXT`)
- Modify: `backend/tests/test_content_versions.py`

**Interfaces:**
- Consumes: `content_version_service.{served_locales, status_map}`, `i18n_fields.localized`, `content_versions.APP_LOCALES`
- Produces:
  - `scoring_service.LocaleUnavailable(ScoringError)` con attributi `.locale`, `.status`, `.available`
  - `scoring_service.SUPPORTED_LOCALES` diventa un alias di `APP_LOCALES` (retrocompatibilità degli import)

- [ ] **Step 1: Write the failing test**

Aggiungi a `backend/tests/test_content_versions.py`:

```python
# --- cancello di somministrazione -------------------------------------------

from backend import scoring_service


def _instrument_with_english_items(db, code):
    db.add(models.Instrument(code=code, name_en="Test instrument",
                             response_scale_min=1, response_scale_max=4))
    db.add(models.Factor(instrument_code=code, code="C1", label_en="Elaborative",
                         orientation="resource"))
    db.add(models.QuestionnaireItem(instrument_code=code, item_number=1,
                                    factor_code="C1", text_en="english item"))
    db.commit()
    derive_instrument_versions(db)


def test_supported_locales_covers_the_six_app_languages():
    assert set(scoring_service.SUPPORTED_LOCALES) == set(APP_LOCALES)


def test_a_language_without_items_is_refused_with_its_status():
    db = _TestSession()
    try:
        code = f"{PREFIX}-GATE"
        _instrument_with_english_items(db, code)
        try:
            scoring_service.get_rules(db, code, "de")
        except scoring_service.LocaleUnavailable as exc:
            assert exc.status == "draft"
            assert "en" in exc.available
            return
        raise AssertionError("il tedesco senza item non deve essere somministrabile")
    finally:
        db.close()


def test_the_language_that_has_items_is_served():
    db = _TestSession()
    try:
        code = f"{PREFIX}-OK"
        _instrument_with_english_items(db, code)
        rules = scoring_service.get_rules(db, code, "en")
        assert rules["items"][0]["text"] == "english item"
        assert rules["factors"][0]["label"] == "Elaborative"
        assert rules["locale_status"] == "pilot"
    finally:
        db.close()


def test_no_locale_ever_serves_another_language_text():
    db = _TestSession()
    try:
        code = f"{PREFIX}-MIX"
        db.add(models.Instrument(code=code, response_scale_min=1, response_scale_max=4))
        db.add(models.Factor(instrument_code=code, code="C1", label_en="Elaborative"))
        db.add(models.QuestionnaireItem(instrument_code=code, item_number=1,
                                        factor_code="C1",
                                        text_i18n={"en": "english item", "sv": "svenskt item"}))
        db.commit()
        derive_instrument_versions(db)
        en = scoring_service.get_rules(db, code, "en")["items"][0]["text"]
        sv = scoring_service.get_rules(db, code, "sv")["items"][0]["text"]
        assert en != sv, "due lingue non possono servire lo stesso testo"
    finally:
        db.close()


def test_a_locale_outside_the_app_is_a_plain_scoring_error():
    db = _TestSession()
    try:
        code = f"{PREFIX}-PT"
        _instrument_with_english_items(db, code)
        try:
            scoring_service.get_rules(db, code, "pt")
        except scoring_service.LocaleUnavailable:
            raise AssertionError("una lingua inesistente non e' 'non ancora disponibile'")
        except scoring_service.ScoringError:
            return
        raise AssertionError("una lingua fuori dall'app deve essere rifiutata")
    finally:
        db.close()


def test_scoring_refuses_an_unavailable_locale_before_computing():
    db = _TestSession()
    try:
        code = f"{PREFIX}-SCORE"
        _instrument_with_english_items(db, code)
        try:
            scoring_service.compute_profile(db, code, "fr", {1: 3})
        except scoring_service.LocaleUnavailable:
            return
        raise AssertionError("non si calcola un profilo in una lingua non somministrabile")
    finally:
        db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec counselorbot_backend python -m backend.tests.test_content_versions`
Expected: FAIL — `AttributeError: module 'backend.scoring_service' has no attribute 'LocaleUnavailable'`

- [ ] **Step 3: Write minimal implementation**

In `backend/scoring_service.py`:

Sostituisci la riga 18:

```python
from .content_versions import APP_LOCALES
from .content_version_service import served_locales, status_map
from .i18n_fields import localized

# Le lingue ammesse sono quelle dell'interfaccia. Quali siano somministrabili per
# uno strumento lo dice il registro, non questa tupla.
SUPPORTED_LOCALES = APP_LOCALES
```

Aggiungi la classe d'errore accanto a `ScoringError` (se `ScoringError` non è ancora definita in cima, mettila subito dopo la sua definizione):

```python
class LocaleUnavailable(ScoringError):
    """Lingua nota all'app ma non ancora somministrabile per questo strumento.

    Distinta da una lingua inesistente: qui la risposta giusta e' "non ancora",
    con lo stato e le lingue disponibili, non "non esiste".
    """

    def __init__(self, instrument_code: str, locale: str, status: str, available: list[str]):
        super().__init__(
            f"{instrument_code}: la lingua {locale} non e' somministrabile (stato {status})"
        )
        self.locale = locale
        self.status = status
        self.available = available
```

Aggiungi l'helper condiviso, sopra `compute_profile`:

```python
def _assert_locale_available(db: Session, instrument_code: str, locale: str) -> str:
    """Rifiuta una lingua sconosciuta o non ancora somministrabile. Ritorna lo stato."""
    if locale not in APP_LOCALES:
        raise ScoringError(f"Locale non supportato: {locale}")
    statuses = status_map(db, "instrument", instrument_code)
    available = served_locales(db, "instrument", instrument_code)
    if locale not in available:
        raise LocaleUnavailable(instrument_code, locale, statuses.get(locale, "draft"), available)
    return statuses[locale]
```

In `compute_profile`, sostituisci il controllo alla riga ~134:

```python
    if locale not in APP_LOCALES:
        raise ScoringError(f"Locale non supportato: {locale}")
```

con:

```python
    _assert_locale_available(db, instrument_code, locale)
```

(il controllo va **dopo** la verifica che lo strumento esista, così un codice sbagliato resta un `ScoringError` di strumento sconosciuto; sposta quindi la chiamata subito sotto il blocco che solleva `Strumento sconosciuto`).

In `get_rules`, stessa sostituzione alla riga ~251, e aggiungi lo stato nella risposta:

```python
    locale_status = _assert_locale_available(db, instrument_code, locale)
```

e nel dict di ritorno, accanto a `"uses_validated_norms"`:

```python
        "locale_status": locale_status,
        "available_locales": served_locales(db, "instrument", instrument.code),
```

Sostituisci `_label_for` (riga ~102):

```python
def _label_for(factor: models.Factor, locale: str) -> str:
    return localized(factor, "label", locale) or factor.code
```

Nota: sparisce il ripiego su `label_en`. Un fattore senza etichetta nella lingua servita mostra il codice, non l'inglese: il codice è neutro, l'inglese sarebbe una schermata mista.

Nel dict `items` di `get_rules`, sostituisci `getattr(it, f"text_{locale}", None)` con:

```python
                "text": localized(it, "text", locale),
```

E il nome dello strumento:

```python
            "name": localized(instrument, "name", locale) or instrument.code,
```

Infine aggiungi a `_TEXT` le due lingue mancanti, subito dopo il blocco `"es"`:

```python
    "fr": {
        "band": {"lower": "Fréquence plus faible", "moderate": "Fréquence modérée", "higher": "Fréquence plus élevée"},
        "resource": {
            "lower": "Recours déclaré plus faible à cette stratégie ou ressource.",
            "moderate": "Recours déclaré modéré à cette stratégie ou ressource.",
            "higher": "Recours déclaré plus élevé à cette stratégie ou ressource.",
        },
        "difficulty": {
            "lower": "Fréquence déclarée plus faible de cette difficulté.",
            "moderate": "Fréquence déclarée modérée de cette difficulté.",
            "higher": "Fréquence déclarée plus élevée de cette difficulté.",
        },
        "neutral": {
            "lower": "Présence déclarée plus faible de cette dimension.",
            "moderate": "Présence déclarée modérée de cette dimension.",
            "higher": "Présence déclarée plus élevée de cette dimension.",
        },
    },
    "de": {
        "band": {"lower": "Geringere Häufigkeit", "moderate": "Mittlere Häufigkeit", "higher": "Höhere Häufigkeit"},
        "resource": {
            "lower": "Geringere berichtete Nutzung dieser Strategie oder Ressource.",
            "moderate": "Mittlere berichtete Nutzung dieser Strategie oder Ressource.",
            "higher": "Höhere berichtete Nutzung dieser Strategie oder Ressource.",
        },
        "difficulty": {
            "lower": "Geringere berichtete Häufigkeit dieser Schwierigkeit.",
            "moderate": "Mittlere berichtete Häufigkeit dieser Schwierigkeit.",
            "higher": "Höhere berichtete Häufigkeit dieser Schwierigkeit.",
        },
        "neutral": {
            "lower": "Geringeres berichtetes Vorhandensein dieser Dimension.",
            "moderate": "Mittleres berichtetes Vorhandensein dieser Dimension.",
            "higher": "Höheres berichtetes Vorhandensein dieser Dimension.",
        },
    },
```

E rendi la lettura difensiva, in `compute_profile`:

```python
    copy = _TEXT.get(locale) or _TEXT["en"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec counselorbot_backend python -m backend.tests.test_content_versions`
Expected: PASS

Poi il guardrail generale:

Run: `docker exec counselorbot_backend python -m backend.tests.test_smoke`
Expected: PASS, nessuna regressione.

- [ ] **Step 5: Commit**

```bash
git add backend/scoring_service.py backend/tests/test_content_versions.py
git commit -m "feat: gate instrument administration on the language registry

SUPPORTED_LOCALES was a hand-written tuple that raised ScoringError for French
and German before any content question could be asked. It now names the six
interface languages, and which of them a given instrument can be administered in
comes from the registry.

A language known to the app but not yet administrable raises LocaleUnavailable
carrying its status and the languages that are available, so the caller can say
'not yet' instead of 'unknown'. Factor labels no longer fall back to English: an
unlabelled factor shows its code, because a code is neutral and English would be
a mixed-language screen."
```

---

### Task 6: API — elenco pubblico, 409 e registro admin

**Files:**
- Modify: `backend/routes/survey.py:238-247`
- Modify: `backend/routes/admin.py` (in fondo, accanto agli endpoint `/admin/instruments`)
- Modify: `backend/schemas.py` (dopo `NormThresholdResponse`)
- Modify: `backend/tests/test_smoke.py` (registrazione endpoint)

**Interfaces:**
- Consumes: `scoring_service.LocaleUnavailable`, `content_version_service.*`, `content_versions.CONTENT_TYPES`
- Produces:
  - `GET /instruments` → `[{code, name, status, locales: {lang: status}, available_locales: [...], item_count}]`
  - `GET /instruments/{code}/rules?locale=` → `409` con `{detail, status, available_locales}` se non somministrabile
  - `GET /admin/content-versions?content_type=&content_key=&locale=`
  - `POST /admin/content-versions/{id}/promote` body `{target_status}`
  - `schemas.ContentLanguageVersionResponse`, `schemas.ContentVersionPromoteRequest`

- [ ] **Step 1: Write the failing test**

Aggiungi a `backend/tests/test_content_versions.py`:

```python
# --- API --------------------------------------------------------------------

def test_registered_routes_cover_the_new_endpoints():
    import backend.main as main

    paths = {r.path for r in main.app.routes}
    assert "/instruments" in paths
    assert "/admin/content-versions" in paths
    assert "/admin/content-versions/{version_id}/promote" in paths
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker exec counselorbot_backend python -m backend.tests.test_content_versions`
Expected: FAIL — `/instruments` non è fra i path registrati.

- [ ] **Step 3: Write minimal implementation**

In `backend/schemas.py`, dopo `NormThresholdResponse`:

```python
class ContentLanguageVersionResponse(BaseModel):
    id: int
    content_type: str
    content_key: str
    locale: str
    status: str
    source: Optional[str] = None
    version_label: Optional[str] = None
    approved_by: Optional[str] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class ContentVersionPromoteRequest(BaseModel):
    target_status: str
```

In `backend/routes/survey.py`, sostituisci `get_instrument_rules` e aggiungi l'elenco:

```python
@router.get("/instruments")
async def list_instruments(db: Session = Depends(get_db)):
    """Strumenti con, per ogni lingua, lo stato di certificazione.

    Alimenta il selettore e la pagina di somministrazione: la lista delle lingue
    offerte non e' piu' scritta a mano nel frontend.
    """
    out = []
    for instrument in db.query(models.Instrument).order_by(models.Instrument.code).all():
        item_count = (
            db.query(models.QuestionnaireItem)
            .filter(
                models.QuestionnaireItem.instrument_code == instrument.code,
                models.QuestionnaireItem.active == True,  # noqa: E712
            )
            .count()
        )
        out.append({
            "code": instrument.code,
            "name_i18n": i18n_fields.merged_i18n(instrument, "name"),
            "status": instrument.status,
            "report_scale_type": instrument.report_scale_type,
            "item_count": item_count,
            "locales": content_version_service.status_map(db, "instrument", instrument.code),
            "available_locales": content_version_service.served_locales(db, "instrument", instrument.code),
        })
    return out


@router.get("/instruments/{code}/rules")
async def get_instrument_rules(code: str, locale: str = Query("en"), db: Session = Depends(get_db)):
    """Regole di scala leggibili (item->fattore, reverse, scala, fattori) per la vista frontend."""
    try:
        return scoring_service.get_rules(db, code, locale)
    except scoring_service.LocaleUnavailable as e:
        raise HTTPException(status_code=409, detail={
            "message": str(e),
            "locale": e.locale,
            "status": e.status,
            "available_locales": e.available,
        })
    except scoring_service.ScoringError as e:
        raise HTTPException(status_code=404, detail=str(e))
```

E in `score_instrument`, prima del ramo `except scoring_service.ScoringError`:

```python
    except scoring_service.LocaleUnavailable as e:
        raise HTTPException(status_code=409, detail={
            "message": str(e),
            "locale": e.locale,
            "status": e.status,
            "available_locales": e.available,
        })
```

Aggiungi in cima a `backend/routes/survey.py`, agli import esistenti da `backend`:

```python
from .. import content_version_service, i18n_fields
```

In `backend/routes/admin.py`, dopo gli endpoint `/admin/instruments/{code}/norm-thresholds`:

```python
@router.get("/admin/content-versions", response_model=List[schemas.ContentLanguageVersionResponse])
async def list_content_versions(
    content_type: Optional[str] = Query(None),
    content_key: Optional[str] = Query(None),
    locale: Optional[str] = Query(None),
    _: dict = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    """Registro degli stati di certificazione, filtrabile."""
    q = db.query(models.ContentLanguageVersion)
    if content_type:
        q = q.filter(models.ContentLanguageVersion.content_type == content_type)
    if content_key:
        q = q.filter(models.ContentLanguageVersion.content_key == content_key)
    if locale:
        q = q.filter(models.ContentLanguageVersion.locale == locale)
    return q.order_by(
        models.ContentLanguageVersion.content_type,
        models.ContentLanguageVersion.content_key,
        models.ContentLanguageVersion.locale,
    ).all()


@router.post(
    "/admin/content-versions/{version_id}/promote",
    response_model=schemas.ContentLanguageVersionResponse,
)
async def promote_content_version(
    version_id: int,
    payload: schemas.ContentVersionPromoteRequest,
    identity: dict = Depends(auth.require_admin),
    db: Session = Depends(get_db),
):
    """Transizione di stato. Rifiuta i salti previsti dal protocollo."""
    row = db.query(models.ContentLanguageVersion).filter(
        models.ContentLanguageVersion.id == version_id
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Versione non trovata")
    try:
        return content_version_service.promote(
            db, row, payload.target_status, approved_by=identity.get("username") or "admin"
        )
    except ContentVersionError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

Aggiungi agli import in cima a `backend/routes/admin.py`:

```python
from .. import content_version_service
from ..content_versions import ContentVersionError
```

Verifica il nome esatto della dipendenza admin già usata nel file (`auth.require_admin` o equivalente): usa quella, non introdurne una nuova.

- [ ] **Step 4: Run test to verify it passes**

Run: `docker exec counselorbot_backend python -m backend.tests.test_content_versions`
Expected: PASS

Run: `docker exec counselorbot_backend python -m backend.tests.test_smoke`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routes/survey.py backend/routes/admin.py backend/schemas.py backend/tests/test_content_versions.py
git commit -m "feat: expose per-language instrument availability over the API

GET /instruments now reports, per language, the certification status and whether
the instrument can be administered, so the frontend stops keeping its own list.
An unavailable language answers 409 with that status and the languages that do
work, which is a different answer from the 404 an unknown instrument gets."
```

---

### Task 7: Il frontend legge il catalogo invece di duplicarlo

Il pezzo più grosso. `frontend/src/lib/test-administrations.ts` (962 righe) tiene una seconda copia degli item e ci ospita il bug dello spagnolo. Va cancellato, separando due cose che oggi sono mescolate: i **dati dello strumento** (item, fattori, nome, scala) che vengono dall'API, e la **cornice** (istruzioni, avvisi, pulsanti) che va in `i18n.ts` nelle sei lingue.

**Files:**
- Modify: `frontend/src/lib/i18n.ts` (nuove chiavi `admin.run.*` nelle sei lingue)
- Modify: `frontend/src/components/administration/QuestionnaireRunner.tsx`
- Modify: `frontend/src/app/somministrazione/page.tsx`
- Modify: `frontend/src/app/somministrazione/[instrument]/[locale]/page.tsx`
- Modify: `frontend/src/app/strumenti/[id]/page.tsx:28-36`
- Modify: `frontend/src/lib/test-scoring.ts:1` (import dei tipi)
- Delete: `frontend/src/lib/test-administrations.ts`
- Create: `frontend/src/lib/instruments-api.ts`

**Interfaces:**
- Consumes: `GET /api/instruments`, `GET /api/instruments/{code}/rules?locale=`
- Produces:
  - `instruments-api.ts`: `type InstrumentSummary`, `type InstrumentRules`, `fetchInstruments(): Promise<InstrumentSummary[]>`, `fetchRules(code: string, locale: string): Promise<InstrumentRules | { unavailable: true; status: string; availableLocales: string[] }>`

- [ ] **Step 1: Scrivi il modulo client e i tipi**

Create `frontend/src/lib/instruments-api.ts`:

```typescript
// Catalogo strumenti letto dal backend. Sostituisce test-administrations.ts:
// gli item vivono nel DB, non in una seconda copia nel bundle.
import { apiFetch } from './auth';

export interface InstrumentSummary {
    code: string;
    name_i18n: Record<string, string>;
    status: string;
    report_scale_type: string;
    item_count: number;
    locales: Record<string, string>;        // lingua -> stato di certificazione
    available_locales: string[];            // le lingue somministrabili
}

export interface InstrumentRuleFactor {
    code: string;
    dimension: string | null;
    orientation: string;
    is_interpretation_inverted: boolean;
    label: string;
    item_numbers: number[];
    reverse_item_numbers: number[];
}

export interface InstrumentRuleItem {
    item_number: number;
    factor_code: string | null;
    reverse_scoring: boolean;
    active: boolean;
    text: string | null;
}

export interface InstrumentRules {
    instrument: {
        code: string;
        name: string;
        response_scale_min: number;
        response_scale_max: number;
        response_labels: string[] | null;
        report_scale_type: string;
        status: string;
    };
    uses_validated_norms: boolean;
    locale_status: string;
    available_locales: string[];
    factors: InstrumentRuleFactor[];
    items: InstrumentRuleItem[];
}

export interface RulesUnavailable {
    unavailable: true;
    status: string;
    availableLocales: string[];
}

export async function fetchInstruments(): Promise<InstrumentSummary[]> {
    const res = await apiFetch('/api/instruments');
    if (!res.ok) throw new Error(`GET /api/instruments: ${res.status}`);
    return res.json();
}

export async function fetchRules(
    code: string,
    locale: string,
): Promise<InstrumentRules | RulesUnavailable> {
    const res = await apiFetch(`/api/instruments/${code}/rules?locale=${locale}`);
    if (res.status === 409) {
        const body = await res.json();
        const detail = body?.detail ?? {};
        return {
            unavailable: true,
            status: detail.status ?? 'draft',
            availableLocales: detail.available_locales ?? [],
        };
    }
    if (!res.ok) throw new Error(`GET /api/instruments/${code}/rules: ${res.status}`);
    return res.json();
}
```

- [ ] **Step 2: Sposta la cornice in `i18n.ts`**

In `frontend/src/lib/i18n.ts`, aggiungi a **ognuno dei sei dizionari** le chiavi seguenti. I testi italiani, inglesi, spagnoli e svedesi si prendono da `EN_BASE`/`ES_BASE`/`SV_BASE` e da `PAGE_COPY`/`BLOCKED_COPY`/`INVALID_COPY`/`META_COPY` in `test-administrations.ts`, `somministrazione/page.tsx` e `somministrazione/[instrument]/[locale]/page.tsx` prima di cancellarli; francese e tedesco vanno tradotti dall'inglese.

Elenco esatto delle chiavi da creare (le stesse in tutte e sei le lingue):

```
admin.run.badge
admin.run.intro
admin.run.warningTitle
admin.run.warningBody
admin.run.draftNote
admin.run.instructions
admin.run.privacyNote
admin.run.progress            // con segnaposto {answered} / {total}
admin.run.missingAnswers
admin.run.submit
admin.run.submittedTitle
admin.run.submittedBody
admin.run.profileMethod
admin.run.rawAverage
admin.run.stanineScore
admin.run.restart
admin.run.back
admin.run.startChat
admin.run.unavailable.title
admin.run.unavailable.body        // "Questo strumento non e' ancora disponibile in {lang}."
admin.run.unavailable.languages   // "Disponibile in: {langs}"
admin.run.meta.sectionTitle
admin.run.meta.anonHint
admin.run.meta.researchCodeLabel
admin.run.meta.researchCodeHint
admin.run.meta.participationContextLabel
admin.run.meta.recruitmentSourceLabel
admin.run.meta.studyCodeLabel
admin.run.meta.studyCodePlaceholder
admin.run.meta.ageLabel
admin.run.meta.genderLabel
admin.run.meta.eduLabel
admin.run.meta.eduPlaceholder
admin.run.meta.consent
admin.run.meta.consentError
admin.run.meta.loginRequired
admin.run.meta.loginAction
admin.run.meta.preferNot
admin.run.meta.under18
admin.run.meta.female
admin.run.meta.male
admin.run.meta.other
admin.run.meta.contextLesson
admin.run.meta.contextLibrary
admin.run.meta.contextHome
admin.run.meta.contextLab
admin.run.meta.contextRemote
admin.run.meta.contextEvent
admin.run.meta.contextOther
admin.run.meta.sourceTeacher
admin.run.meta.sourceResearcher
admin.run.meta.sourceQr
admin.run.meta.sourceClassActivity
admin.run.meta.sourceWebsite
admin.run.meta.sourcePeer
admin.run.meta.sourceOther
```

- [ ] **Step 3: Verifica che le sei lingue siano complete**

Run: `cd frontend && node scripts/check-i18n.mjs`
Expected: PASS, con il conteggio chiavi cresciuto di 55 per lingua. Se manca una chiave in una lingua lo script la nomina: aggiungila.

- [ ] **Step 4: Riscrivi `QuestionnaireRunner`**

Cambia la firma: invece di ricevere `copy: AdministrationCopy` e `locale: 'en' | 'es' | 'sv'`, riceve `instrument: string` e usa `useI18n()` per la cornice e `fetchRules(instrument, lang)` per i dati.

```typescript
// firma nuova
interface QuestionnaireRunnerProps {
    instrument: string;
}

export function QuestionnaireRunner({ instrument }: QuestionnaireRunnerProps) {
    const { t, lang } = useI18n();
    const [rules, setRules] = useState<InstrumentRules | null>(null);
    const [unavailable, setUnavailable] = useState<RulesUnavailable | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setRules(null);
        setUnavailable(null);
        setLoadError(null);
        fetchRules(instrument, lang)
            .then((result) => {
                if (cancelled) return;
                if ('unavailable' in result) setUnavailable(result);
                else setRules(result);
            })
            .catch((e) => { if (!cancelled) setLoadError(String(e)); });
        return () => { cancelled = true; };
    }, [instrument, lang]);

    if (unavailable) {
        return (
            <section className="glass-panel max-w-xl mx-auto p-8 text-center space-y-4">
                <h1 className="text-2xl font-bold text-slate-900">{t('admin.run.unavailable.title')}</h1>
                <p className="text-slate-600">{t('admin.run.unavailable.body')}</p>
                {unavailable.availableLocales.length > 0 && (
                    <p className="text-sm text-slate-500">
                        {t('admin.run.unavailable.languages').replace(
                            '{langs}', unavailable.availableLocales.join(', '),
                        )}
                    </p>
                )}
            </section>
        );
    }
    // ...resto invariato, con:
    //   copy.items[i]          -> rules.items[i].text
    //   copy.scale             -> rules.instrument.response_labels
    //   copy.title             -> rules.instrument.name
    //   copy.dimensionTitles   -> raggruppamento per rules.factors[].dimension, etichetta rules.factors[].label
    //   copy.<chrome>          -> t('admin.run.<chrome>')
    //   META_COPY[locale].<x>  -> t('admin.run.meta.<x>')
}
```

`response_labels` può essere `null` (strumento senza etichette di scala): in quel caso mostra i numeri della scala, da `response_scale_min` a `response_scale_max`.

Elimina da questo file `META_COPY` e la sua interfaccia `MetaCopy`: le chiavi vivono ora in `i18n.ts`.

- [ ] **Step 5: Aggiorna le tre pagine**

`frontend/src/app/somministrazione/[instrument]/[locale]/page.tsx` → la route perde il segmento `[locale]`: la lingua è quella dell'interfaccia. Sposta il file in `frontend/src/app/somministrazione/[instrument]/page.tsx` e riducilo a:

```typescript
'use client';

import { useParams } from 'next/navigation';
import { QuestionnaireRunner } from '@/components/administration/QuestionnaireRunner';

export default function AdministrationPage() {
    const params = useParams<{ instrument: string }>();
    return <QuestionnaireRunner instrument={params.instrument} />;
}
```

Il vecchio path `/somministrazione/<strumento>/<locale>` resta valido per i link già in giro: crea `frontend/src/app/somministrazione/[instrument]/[locale]/page.tsx` che reindirizza a `/somministrazione/<strumento>` (la lingua la decide l'interfaccia, non l'URL):

```typescript
'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function LegacyLocaleRedirect() {
    const params = useParams<{ instrument: string; locale: string }>();
    const router = useRouter();
    useEffect(() => {
        router.replace(`/somministrazione/${params.instrument}`);
    }, [params.instrument, router]);
    return null;
}
```

`frontend/src/app/somministrazione/page.tsx` → elenca gli strumenti da `fetchInstruments()`, mostra `name_i18n[lang] ?? name_i18n.en ?? code`, `item_count`, e per ognuno se la lingua corrente è in `available_locales`. Uno strumento non disponibile nella lingua corrente si mostra disabilitato con `t('admin.run.unavailable.languages')`, **non** si nasconde: sparire senza spiegazione è peggio che dire perché. Elimina `BLOCKED_COPY` e `PAGE_COPY` (le pagine non sono più riservate a tre lingue) e la lista `instruments` scritta a mano.

`frontend/src/app/strumenti/[id]/page.tsx:28-36` → sostituisci il calcolo di `inAppAdministration` (che oggi mappa a mano `en|es|sv` e altrimenti ripiega su `en`) con la lettura di `available_locales` dell'API: il link alla somministrazione compare se `lang` è fra quelle disponibili, altrimenti si mostra il testo di non-disponibilità. Sparisce `isEnglishFallback` e le chiavi `detail.assessment.inapp.english*` diventano inutilizzate — lasciale in `i18n.ts` (rimuoverle è un'altra modifica) ma togli il ramo che le usa.

`frontend/src/lib/test-scoring.ts:1` → importava `AdministrationInstrument` e `AdministrationLocale` solo come tipi. Sostituiscili con `string`: lo scoring è server-side, quel modulo non deve più conoscere l'elenco.

- [ ] **Step 6: Cancella il file duplicato**

```bash
rm frontend/src/lib/test-administrations.ts
```

- [ ] **Step 7: Verifica**

Run: `cd frontend && npx tsc --noEmit`
Expected: nessun errore. Se ne resta uno che nomina `test-administrations`, hai saltato un consumatore.

Run: `cd frontend && npm run lint`
Expected: PASS

Run: `cd frontend && npm run build`
Expected: build completata.

- [ ] **Step 8: Commit**

```bash
git add frontend/src
git rm frontend/src/lib/test-administrations.ts
git commit -m "refactor: read instrument items from the API instead of a second copy

test-administrations.ts kept its own copy of all 276 items, and that is where
the Spanish administration served English items under Spanish chrome. Deleting
it removes the bug by construction rather than by patch.

The file mixed two things that now separate: instrument data (items, factors,
name, scale) comes from GET /instruments/{code}/rules, and interface chrome
moves into i18n.ts in all six languages. The URL no longer carries a locale
either — the language is the interface language, and the old three-locale paths
redirect."
```

---

### Task 8: Pannelli admin per lingua

**Files:**
- Modify: `frontend/src/components/admin/QuestionnaireEditor.tsx`
- Modify: `frontend/src/components/admin/CertifiedStrategiesPanel.tsx`
- Modify: `frontend/src/components/admin/ValidationExportPanel.tsx:107-110`
- Modify: `frontend/src/lib/i18n-admin.ts` (chiavi nuove, sei lingue)

**Interfaces:**
- Consumes: `GET /admin/content-versions`, `POST /admin/content-versions/{id}/promote`
- Produces: nessuna nuova interfaccia condivisa.

- [ ] **Step 1: Selettore di lingua nell'editor degli strumenti**

`QuestionnaireEditor.tsx` oggi mostra quattro campi affiancati (`text_it`, `text_en`, `text_es`, `text_sv`). Sostituiscili con **un** campo più un selettore delle sei lingue in cima al pannello. Il campo scrive dentro `text_i18n[lingua]`.

Accanto al selettore, mostra lo stato di certificazione di quella lingua letto da `/api/admin/content-versions?content_type=instrument&content_key=<code>&locale=<lang>`, con un pulsante di promozione che chiama `/promote`. Se la transizione è rifiutata, il backend risponde `400` con il motivo: mostralo, non nasconderlo.

- [ ] **Step 2: Stessa forma per le strategie certificate**

`CertifiedStrategiesPanel.tsx` — stesso selettore, campi `name_i18n`, `recommended_when_i18n`, `description_i18n`, e la riga di stato con `content_type=certified_strategy`, `content_key=<slug>`.

- [ ] **Step 3: L'export dichiara la versione linguistica**

`ValidationExportPanel.tsx:107-110` — la funzione che sceglie il nome per lingua diventa una lettura di `name_i18n`. Aggiungi alla riga esportata lo stato della lingua e il `version_label` del registro: un dataset di ricerca deve dire a quale versione linguistica appartiene, altrimenti due raccolte fatte prima e dopo una revisione di traduzione diventano indistinguibili.

- [ ] **Step 4: Verifica**

Run: `cd frontend && node scripts/check-i18n.mjs`
Expected: PASS

Run: `cd frontend && npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/admin frontend/src/lib/i18n-admin.ts
git commit -m "feat: edit instrument and strategy texts one language at a time

Four side-by-side fields could only ever hold four languages, and they showed no
sign of which of them had been reviewed. A language selector plus the
certification status of that language replaces them, with the promotion refused
by the backend when it would skip a rung of the protocol.

The validation export now carries the language status and version label, so two
collections taken before and after a translation revision stay distinguishable."
```

---

### Task 9: Documentazione e verifica finale

**Files:**
- Modify: `CONTEXT.md` (sezione «Data Model», e la tabella «Adding an instrument: the lists to touch»)
- Modify: `docs/superpowers/specs/2026-08-31-content-language-versions-design.md` (stato)

- [ ] **Step 1: Aggiorna `CONTEXT.md`**

Nella sezione **Data Model**, aggiungi la voce:

```markdown
- **ContentLanguageVersion**: stato di certificazione per (tipo di contenuto, chiave, lingua) — `content_language_versions`. Gli strumenti seguono la scala del protocollo di validazione (`draft → translated → reviewed → pilot → validated`), i tool si fermano a `certified`. La promozione avanza di un gradino per volta, la retrocessione no: una traduzione trovata sbagliata deve poter tornare in bozza subito. `is_served()` in `backend/content_versions.py` decide se il contenuto arriva all'utente; per gli strumenti il cancello è attivo (`scoring_service` risponde `409 LocaleUnavailable`), per i tool no ancora — `certified_strategy_service._localized` ripiega tuttora sull'italiano, e il cancello si accenderà quando le traduzioni esisteranno. Lo stato iniziale è dedotto dai dati in `content_versions_seed.derive_*`, mai indovinato, e non sovrascrive una riga esistente.
- **Testi multilingue**: `instruments.name_i18n`, `factors.label_i18n`/`description_i18n`, `questionnaire_items.text_i18n`, `certified_strategies.name_i18n`/`recommended_when_i18n`/`description_i18n` sono JSON `{lingua: testo}`. Le vecchie colonne `*_it/_en/_es/_sv` **esistono ancora** e sono lette in ripiego da `backend/i18n_fields.py`: la rimozione è un lavoro successivo. Un campo si legge sempre con `i18n_fields.localized(row, campo, lingua)`, che non ripiega mai su un'altra lingua — il ripiego è una decisione di prodotto, non di lettura.
```

Nella tabella «Adding an instrument: the lists to touch», aggiungi la riga:

```markdown
| `content_language_versions` | riga per ogni lingua, via `derive_instrument_versions` | lo strumento non è somministrabile in nessuna lingua |
```

E correggi la riga su `test-administrations.ts`: il file non esiste più, gli item vengono da `GET /instruments/{code}/rules`.

- [ ] **Step 2: Segna lo stato nella spec**

Nella spec, cambia l'intestazione `| Stato | Design approvato, sotto-progetto 1 in implementazione |` in `| Stato | Sotto-progetto 1 completato |`.

- [ ] **Step 3: Verifica completa**

```bash
docker compose up -d --build
docker compose ps
docker exec counselorbot_backend python -m backend.tests.test_content_versions
docker exec counselorbot_backend python -m backend.tests.test_smoke
docker exec counselorbot_backend python -m backend.tests.test_certified_readings
cd frontend && node scripts/check-i18n.mjs && npx tsc --noEmit && npm run lint && npm run build
```

Expected: container `Up`, tutte le suite verdi, build completata.

Controlla poi i log per la migrazione:

```bash
docker compose logs backend | grep -i "backfill i18n\|content language versions"
```

Expected: una riga `backfill i18n: N righe travasate` alla prima esecuzione, nessun errore alla seconda.

- [ ] **Step 4: Commit e push**

```bash
git add CONTEXT.md docs/superpowers/specs/2026-08-31-content-language-versions-design.md
git commit -m "docs: record the per-language content versioning in CONTEXT.md"
git push -u origin feature/content-language-versions
```

---

## Nota per chi esegue

Il cancello dei **tool** non si accende qui (vincolo globale). Se durante il
lavoro viene la tentazione di far rispettare `is_served` anche a
`certified_strategy_service`, fermati: toglierebbe i consigli certificati a ogni
lingua diversa dall'italiano senza darne di nuovi, e l'app peggiorerebbe fino al
sotto-progetto 2. Il registro qui si scrive e si legge; si applica dopo.
