# Skills Engine Implementation Plan

> **Aggiornamento 2026-08-30:** il contratto linguistico originario è stato
> sostituito: le istruzioni delle skill sono archiviate, validate e iniettate
> esclusivamente in inglese (`{"en": ...}`). Gli esempi multilingua sottostanti
> restano documentazione storica del piano, non descrivono il comportamento live.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sostituire il suggerimento di strategie hardcoded in `chat_logic` con un motore di skill dichiarative, editabili dall'admin, agganciabili agli step del percorso guidato e selezionabili da regole più un router LLM.

**Architecture:** Due tabelle nuove (`skills`, `guided_step_skills`) e un package `backend/skills/` con quattro responsabilità separate: valutazione delle condizioni (puro), handler Python whitelisted (I/O verso i servizi strategie esistenti), router (regole + LLM con fallback deterministico), engine (esecuzione, budget, rendering). `chat_logic._retrieved_context` delega al motore solo quando il feature flag è attivo per lo strumento corrente; altrimenti percorre il codice attuale invariato.

**Tech Stack:** Python 3, FastAPI, SQLAlchemy (nessun Alembic: `create_all` allo startup), Pydantic v2, PostgreSQL, Next.js App Router + React + TypeScript, lucide-react, `useI18n`.

**Spec:** `docs/superpowers/specs/2026-08-21-skills-engine-design.md`

## Global Constraints

- Branch di lavoro: `feature/skills-engine`. Un commit per task.
- Nessuna migrazione Alembic nel progetto: le tabelle nuove nascono da `models.Base.metadata.create_all(bind=database.engine)` in `backend/main.py:135`. Le colonne aggiunte a tabelle esistenti si fanno con raw SQL idempotente in `_seed_and_migrate()`. In questo piano non si alterano tabelle esistenti.
- Seed **append-only**: si creano solo le righe mancanti per `slug`; non si aggiorna mai una riga esistente (i contenuti in produzione sono personalizzati dall'admin).
- Il motore è spento di default: `skills_engine_enabled = "false"`, `skills_engine_instruments = "[]"`.
- Con motore spento, l'output di `_retrieved_context` deve essere identico byte per byte a quello attuale.
- Il motore non deve mai sollevare eccezioni verso il turno di chat: ogni errore ⇒ log + blocco vuoto.
- Le condizioni non riconosciute **falliscono chiuso**: la skill non si attiva e viene loggato un warning.
- Commenti e messaggi di log in italiano, come il resto di `backend/`; nomi di simboli in inglese.
- Test eseguibili in due modi, come gli altri test del progetto: `pytest backend/tests/test_x.py` e `docker exec counselorbot_backend python -m backend.tests.test_x`. Ogni file test finisce con il runner `if __name__ == "__main__"` già usato in `backend/tests/test_qsa_factor_directive.py`.
- I test che importano moduli applicativi impostano prima `os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")` e `os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")`.
- Lingue gestite: `it` sorgente, più `en`, `es`, `sv`, `fr`, `de` dove esistono.

## File Structure

**Nuovi**

| File | Responsabilità |
|---|---|
| `backend/skills/__init__.py` | export pubblico: `SkillContext`, `SkillOutput`, `run_skills`, `build_context`, `enabled` |
| `backend/skills/context.py` | dataclass `SkillContext` e `SkillOutput`, nessuna dipendenza dal DB |
| `backend/skills/conditions.py` | valutatore dichiarativo puro `match(conditions, ctx) -> (bool, reason)` |
| `backend/skills/registry.py` | caricamento skill pubblicate e agganci step, merge dei parametri, mappa slug → component flag |
| `backend/skills/handlers.py` | registry a decoratore + handler `certified_strategies` e `approved_strategies` |
| `backend/skills/router.py` | selezione: `always` + `optional` con router LLM oltre soglia e fallback deterministico |
| `backend/skills/engine.py` | flag, costruzione contesto, esecuzione, budget, rendering, trace |
| `backend/skills_seed.py` | seed append-only delle due skill pilota e degli agganci wildcard |
| `backend/routes/skills.py` | CRUD admin, mappa step, elenco handler, preview |
| `frontend/src/components/admin/SkillsPanel.tsx` | pannello admin |
| `backend/tests/test_skills_conditions.py` | test puri del valutatore |
| `backend/tests/test_skills_engine.py` | test puri di budget, ordinamento, handler mancante |
| `backend/tests/test_skills_router.py` | test puri del router con `ai_service` finto |
| `backend/tests/test_skills_parity.py` | test su DB: motore acceso ≡ motore spento |

**Modificati**

| File | Modifica |
|---|---|
| `backend/models.py` | classi `Skill` e `GuidedStepSkill` |
| `backend/schemas.py` | schemi Pydantic per skill, mappa step, preview |
| `backend/certified_strategy_service.py` | due wrapper pubblici a fondo modulo (`factor_tokens`, `score_bands`) |
| `backend/chat_logic.py` | `_retrieved_context`: ramo motore; `build_context_envelope`: slot `section` e `directive_tail` |
| `backend/main.py` | import e `include_router` di `skills_routes`; chiamata a `seed_skills(db)`; sei chiavi config nuove |
| `frontend/src/app/admin/page.tsx` | nuovo tab `skills` |
| `CONTEXT.md` | tabelle, config, package nuovi |

---

### Task 1: Modello dati e valutatore delle condizioni

**Files:**
- Modify: `backend/models.py` (in coda al file)
- Create: `backend/skills/__init__.py`
- Create: `backend/skills/context.py`
- Create: `backend/skills/conditions.py`
- Test: `backend/tests/test_skills_conditions.py`

**Interfaces:**
- Consumes: niente.
- Produces:
  - `models.Skill`, `models.GuidedStepSkill`
  - `backend.skills.context.SkillContext` (dataclass frozen) e `SkillOutput`
  - `backend.skills.conditions.match(conditions: dict | None, ctx: SkillContext) -> tuple[bool, str]`
  - `backend.skills.conditions.KNOWN_CONDITION_KEYS: frozenset[str]`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `backend/tests/test_skills_conditions.py`:

```python
"""Test puri del valutatore di condizioni delle skill.

Nessuna rete, nessun DB: `conditions.match` e' una funzione pura su
`SkillContext`. Le condizioni sono la parte dichiarativa che sostituisce le
regex di policy del vecchio gating strategie.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_skills_conditions
Con pytest:
    pytest backend/tests/test_skills_conditions.py
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from backend.skills.conditions import KNOWN_CONDITION_KEYS, match
from backend.skills.context import SkillContext


def _ctx(**kwargs) -> SkillContext:
    base = dict(
        questionnaire_type="QSA",
        step_id="qsa-c6",
        step_mode="factor",
        language="it",
        query="",
        message="",
        scores_context="C6: 8/9",
        salient_factors=frozenset({"C6", "A2"}),
        score_bands={"C6": "growth", "A2": "strength"},
    )
    base.update(kwargs)
    return SkillContext(**base)


def test_empty_conditions_always_match():
    assert match(None, _ctx()) == (True, "")
    assert match({}, _ctx()) == (True, "")


def test_unknown_key_fails_closed():
    ok, reason = match({"questionario": ["QSA"]}, _ctx())
    assert ok is False
    assert "questionario" in reason


def test_questionnaire_types_case_insensitive():
    assert match({"questionnaire_types": ["qsa", "qsar"]}, _ctx())[0] is True
    assert match({"questionnaire_types": ["ZTPI"]}, _ctx())[0] is False


def test_step_modes_and_step_ids():
    assert match({"step_modes": ["factor", "generic"]}, _ctx())[0] is True
    assert match({"step_modes": ["generic"]}, _ctx())[0] is False
    assert match({"step_ids": ["qsa-c6"]}, _ctx())[0] is True
    assert match({"step_ids": ["qsa-c1"]}, _ctx())[0] is False


def test_languages():
    assert match({"languages": ["it", "en"]}, _ctx())[0] is True
    assert match({"languages": ["en"]}, _ctx(language="it"))[0] is False


def test_requires_scores():
    assert match({"requires_scores": True}, _ctx())[0] is True
    assert match({"requires_scores": True}, _ctx(scores_context="  "))[0] is False
    assert match({"requires_scores": False}, _ctx(scores_context=""))[0] is True


def test_min_salient_factors():
    assert match({"min_salient_factors": 2}, _ctx())[0] is True
    assert match({"min_salient_factors": 3}, _ctx())[0] is False
    ok, reason = match({"min_salient_factors": "molti"}, _ctx())
    assert ok is False and "min_salient_factors" in reason


def test_factor_bands_any_of():
    assert match({"factor_bands": {"any_of": ["growth"]}}, _ctx())[0] is True
    assert match({"factor_bands": {"any_of": ["normal"]}}, _ctx())[0] is False
    ok, reason = match({"factor_bands": ["growth"]}, _ctx())
    assert ok is False and "any_of" in reason


def test_conditions_are_anded():
    conditions = {"questionnaire_types": ["QSA"], "step_modes": ["generic"]}
    assert match(conditions, _ctx())[0] is False


def test_known_keys_are_documented():
    assert KNOWN_CONDITION_KEYS == frozenset({
        "questionnaire_types", "step_modes", "step_ids",
        "factor_bands", "min_salient_factors", "languages", "requires_scores",
    })


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"ok   {t.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {t.__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `pytest backend/tests/test_skills_conditions.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'backend.skills'`

- [ ] **Step 3: Crea il contesto**

Crea `backend/skills/__init__.py`:

```python
"""Motore di skill: unita' dichiarative iniettate nel prompt della chat.

Una skill e' una riga DB (`models.Skill`) con condizioni dichiarative, testo di
istruzioni multilingua e un `handler` Python opzionale per il materiale che va
recuperato (strategie certificate, knowledge base approvata). Gli agganci agli
step vivono in `models.GuidedStepSkill`.
"""
from .context import SkillContext, SkillOutput

__all__ = ["SkillContext", "SkillOutput"]
```

Crea `backend/skills/context.py`:

```python
"""Contesto e risultato di una skill. Nessuna dipendenza da FastAPI o dal DB
oltre alla sessione opaca: cosi' il valutatore e il router restano testabili
senza database."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping


@dataclass(frozen=True)
class SkillContext:
    """Fotografia del turno di chat, costruita una volta sola da `chat_logic`."""

    questionnaire_type: str = ""
    step_id: str | None = None
    step_mode: str | None = None
    language: str = "it"
    # Query di retrieval generica, come la riceve `_retrieved_context`.
    query: str = ""
    # Query arricchita con label e prompt dello step piu' i punteggi della fase:
    # e' quella che il retrieval delle strategie certificate usa oggi.
    step_query: str = ""
    # Solo il messaggio dello studente: e' quello che legge il router LLM.
    message: str = ""
    # Punteggi gia' scope-ati ai codici della fase corrente.
    scores_context: str = ""
    salient_factors: frozenset[str] = frozenset()
    score_bands: Mapping[str, str] = field(default_factory=dict)
    component_flags: Mapping[str, Any] = field(default_factory=dict)
    handler_options: Mapping[str, Any] = field(default_factory=dict)
    db: Any = None
    ai_service: Any = None


@dataclass
class SkillOutput:
    """Blocco reso da una skill, pronto per l'envelope."""

    text: str = ""
    # Identificatori del materiale usato (slug strategie): finiscono nei log.
    ids: list[str] = field(default_factory=list)
    meta: dict = field(default_factory=dict)
```

- [ ] **Step 4: Scrivi il valutatore**

Crea `backend/skills/conditions.py`:

```python
"""Valutatore dichiarativo delle condizioni di attivazione.

Sostituisce le regex di policy del vecchio gating: qui si dichiara *quando* una
skill vale, non *come* si estraggono i dati (quello resta negli handler).
Regola: chiave sconosciuta => la skill NON si attiva (fail closed), cosi' un
errore di battitura dell'admin non inietta materiale in tutti i turni.
"""
from __future__ import annotations

import logging

from .context import SkillContext

logger = logging.getLogger(__name__)

KNOWN_CONDITION_KEYS = frozenset({
    "questionnaire_types",
    "step_modes",
    "step_ids",
    "factor_bands",
    "min_salient_factors",
    "languages",
    "requires_scores",
})


def match(conditions: dict | None, ctx: SkillContext) -> tuple[bool, str]:
    """Ritorna (attiva, motivo). `motivo` e' vuoto quando attiva; altrimenti
    spiega l'esclusione ed e' mostrato nella preview del pannello admin."""
    if not conditions:
        return True, ""
    if not isinstance(conditions, dict):
        return False, "conditions non e' un oggetto JSON"

    unknown = sorted(set(conditions) - KNOWN_CONDITION_KEYS)
    if unknown:
        logger.warning("Skill con condizioni sconosciute %s: non attivata", unknown)
        return False, f"chiavi di condizione sconosciute: {', '.join(unknown)}"

    values = conditions.get("questionnaire_types")
    if values and (ctx.questionnaire_type or "").upper() not in {str(v).upper() for v in values}:
        return False, "strumento non ammesso"

    values = conditions.get("step_modes")
    if values and (ctx.step_mode or "").strip().lower() not in {str(v).strip().lower() for v in values}:
        return False, "step_mode non ammesso"

    values = conditions.get("step_ids")
    if values and (ctx.step_id or "") not in {str(v) for v in values}:
        return False, "step non ammesso"

    values = conditions.get("languages")
    if values and (ctx.language or "it").strip().lower() not in {str(v).strip().lower() for v in values}:
        return False, "lingua non ammessa"

    if conditions.get("requires_scores") and not (ctx.scores_context or "").strip():
        return False, "punteggi assenti nel turno"

    minimum = conditions.get("min_salient_factors")
    if minimum is not None:
        try:
            needed = int(minimum)
        except (TypeError, ValueError):
            return False, "min_salient_factors non numerico"
        if len(ctx.salient_factors) < needed:
            return False, f"fattori salienti < {needed}"

    bands = conditions.get("factor_bands")
    if bands:
        if not isinstance(bands, dict) or "any_of" not in bands:
            return False, "factor_bands richiede la chiave any_of"
        wanted = {str(b).strip().lower() for b in (bands.get("any_of") or [])}
        present = {str(b).strip().lower() for b in (ctx.score_bands or {}).values()}
        if not (wanted & present):
            return False, "nessun fattore nelle bande richieste"

    return True, ""
```

- [ ] **Step 5: Esegui il test e verifica che passi**

Run: `pytest backend/tests/test_skills_conditions.py -v`
Expected: PASS, 10 test

- [ ] **Step 6: Aggiungi le tabelle**

In coda a `backend/models.py`:

```python
class Skill(Base):
    """Unita' dichiarativa iniettabile nel prompt della chat.

    La definizione e' editabile dall'admin: condizioni di attivazione,
    istruzioni multilingua, handler Python opzionale per il materiale
    recuperato. Entra in chat solo se `status == "published"` e `is_active`,
    ed e' agganciata allo strumento/step da `GuidedStepSkill`.
    """

    __tablename__ = "skills"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    # Letta dal router LLM: descrive quando la skill e' utile.
    description = Column(Text, nullable=True)
    instructions_i18n = Column(JSON, nullable=True)   # {"it": "...", "en": "..."}
    conditions = Column(JSON, nullable=True)          # gating dichiarativo
    handler = Column(String, nullable=True)           # nome whitelisted
    handler_params = Column(JSON, nullable=True)
    routing = Column(String, nullable=False, default="optional")  # always | optional
    slot = Column(String, nullable=False, default="knowledge")    # section | knowledge | directive_tail
    max_chars = Column(Integer, nullable=False, default=1400)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    status = Column(String, nullable=False, default="draft")      # draft | published
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class GuidedStepSkill(Base):
    """Aggancio di una skill a uno step del percorso guidato.

    `step_id == "*"` vale per tutti gli step dello strumento; un aggancio
    esplicito sullo stesso step vince sul wildcard.
    """

    __tablename__ = "guided_step_skills"

    id = Column(Integer, primary_key=True, index=True)
    questionnaire_type = Column(String, nullable=False, index=True)
    step_id = Column(String, nullable=False, index=True)
    skill_id = Column(Integer, nullable=False, index=True)
    sort_order = Column(Integer, nullable=False, default=0)
    enabled = Column(Boolean, nullable=False, default=True)
    override_params = Column(JSON, nullable=True)
```

Verifica che `Column, Integer, String, Text, Boolean, DateTime, JSON, func` siano già importati in cima al file; aggiungi solo quelli mancanti.

- [ ] **Step 7: Verifica che le tabelle si creino**

Run:
```bash
docker compose up -d --build backend
docker exec counselorbot_backend python -c "
from backend import models, database
models.Base.metadata.create_all(bind=database.engine)
from sqlalchemy import inspect
print(sorted(t for t in inspect(database.engine).get_table_names() if 'skill' in t))
"
```
Expected: `['guided_step_skills', 'skills']`

- [ ] **Step 8: Commit**

```bash
git add backend/models.py backend/skills/ backend/tests/test_skills_conditions.py
git commit -m "feat: add skill tables and declarative condition matcher"
```

---

### Task 2: Handler, registry ed engine

**Files:**
- Modify: `backend/certified_strategy_service.py` (in coda al file)
- Create: `backend/skills/handlers.py`
- Create: `backend/skills/registry.py`
- Create: `backend/skills/engine.py`
- Modify: `backend/skills/__init__.py`
- Test: `backend/tests/test_skills_engine.py`

**Interfaces:**
- Consumes: `SkillContext`, `SkillOutput`, `conditions.match` (Task 1); `models.Skill`, `models.GuidedStepSkill` (Task 1).
- Produces:
  - `backend.skills.handlers.handler(name)` decoratore; `get_handler(name) -> Callable | None`; `handler_names() -> list[str]`
  - `backend.skills.handlers.compute_salient_factors(text) -> frozenset[str]`; `compute_score_bands(questionnaire_type, scores_context) -> dict[str, str]`
  - `backend.skills.registry.SkillBinding(skill, params, sort_order)` dataclass
  - `backend.skills.registry.bindings_for(db, questionnaire_type, step_id) -> list[SkillBinding]`
  - `backend.skills.registry.COMPONENT_FLAG_BY_SLUG: dict[str, str]`
  - `backend.skills.engine.SkillsResult(blocks: dict[str, list[str]], ids: dict[str, list[str]], trace: list[dict])`
  - `backend.skills.engine.render(bindings, ctx, total_max_chars) -> SkillsResult`
  - `backend.skills.engine.truncate(text, limit) -> str`
  - `backend.certified_strategy_service.factor_tokens(text)`, `score_bands(questionnaire, scores_context)`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `backend/tests/test_skills_engine.py`:

```python
"""Test puri di engine e handler registry.

Nessun DB: si costruiscono `SkillBinding` con oggetti finti al posto delle
righe `models.Skill`. Copre budget, troncamento, ordine e handler mancante.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_skills_engine
Con pytest:
    pytest backend/tests/test_skills_engine.py
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from types import SimpleNamespace

from backend.skills import engine, handlers
from backend.skills.context import SkillContext, SkillOutput
from backend.skills.registry import SkillBinding


def _skill(slug, **kwargs):
    data = dict(
        slug=slug, name=slug, description="", instructions_i18n={"it": f"istruzioni {slug}"},
        conditions=None, handler=None, handler_params=None, routing="always",
        slot="knowledge", max_chars=1400, sort_order=0, is_active=True, status="published",
    )
    data.update(kwargs)
    return SimpleNamespace(**data)


def _binding(slug, **kwargs):
    skill = _skill(slug, **kwargs)
    return SkillBinding(skill=skill, params=dict(skill.handler_params or {}), sort_order=skill.sort_order)


def _ctx(**kwargs):
    base = dict(questionnaire_type="QSA", step_id="qsa-c6", step_mode="factor", language="it")
    base.update(kwargs)
    return SkillContext(**base)


def test_truncate_cuts_on_line_boundary():
    text = "riga uno\nriga due\nriga tre"
    assert engine.truncate(text, 100) == text
    assert engine.truncate(text, 12) == "riga uno"


def test_text_only_skill_renders_instructions():
    result = engine.render([_binding("intro")], _ctx(), total_max_chars=3000)
    assert result.blocks["knowledge"] == ["istruzioni intro"]
    assert result.ids == {}


def test_instructions_fall_back_to_italian():
    binding = _binding("intro", instructions_i18n={"it": "solo italiano"})
    result = engine.render([binding], _ctx(language="sv"), total_max_chars=3000)
    assert result.blocks["knowledge"] == ["solo italiano"]


def test_handler_output_is_appended_after_instructions():
    @handlers.handler("_test_echo")
    def _echo(ctx, params):
        return SkillOutput(text=f"materiale {params.get('n', 0)}", ids=["x1"])

    binding = _binding("echo", handler="_test_echo", handler_params={"n": 7})
    result = engine.render([binding], _ctx(), total_max_chars=3000)
    assert result.blocks["knowledge"] == ["istruzioni echo\n\nmateriale 7"]
    assert result.ids["echo"] == ["x1"]


def test_unknown_handler_is_skipped_not_raised():
    binding = _binding("broken", handler="does_not_exist")
    result = engine.render([binding], _ctx(), total_max_chars=3000)
    assert result.blocks == {}
    assert result.trace[0]["skipped"] == "handler sconosciuto: does_not_exist"


def test_handler_exception_is_swallowed():
    @handlers.handler("_test_boom")
    def _boom(ctx, params):
        raise RuntimeError("kaboom")

    result = engine.render([_binding("boom", handler="_test_boom")], _ctx(), total_max_chars=3000)
    assert result.blocks == {}
    assert "kaboom" in result.trace[0]["skipped"]


def test_per_skill_max_chars():
    binding = _binding("long", instructions_i18n={"it": "a" * 50}, max_chars=10)
    result = engine.render([binding], _ctx(), total_max_chars=3000)
    assert result.blocks["knowledge"] == ["a" * 10]


def test_total_budget_drops_late_blocks():
    first = _binding("a", instructions_i18n={"it": "x" * 40}, sort_order=1)
    second = _binding("b", instructions_i18n={"it": "y" * 40}, sort_order=2)
    result = engine.render([first, second], _ctx(), total_max_chars=45)
    assert result.blocks["knowledge"] == ["x" * 40]
    assert result.trace[1]["skipped"] == "budget complessivo esaurito"


def test_blocks_are_grouped_by_slot_and_sorted():
    a = _binding("a", slot="section", sort_order=2)
    b = _binding("b", slot="section", sort_order=1)
    c = _binding("c", slot="directive_tail", sort_order=1)
    result = engine.render([a, b, c], _ctx(), total_max_chars=3000)
    assert result.blocks["section"] == ["istruzioni b", "istruzioni a"]
    assert result.blocks["directive_tail"] == ["istruzioni c"]


def test_handler_names_are_sorted_and_include_pilot_handlers():
    names = handlers.handler_names()
    assert names == sorted(names)
    assert "certified_strategies" in names
    assert "approved_strategies" in names


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"ok   {t.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {t.__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `pytest backend/tests/test_skills_engine.py -v`
Expected: FAIL con `ImportError: cannot import name 'engine' from 'backend.skills'`

- [ ] **Step 3: Esponi i wrapper pubblici nel servizio strategie**

In coda a `backend/certified_strategy_service.py`, dopo `certified_strategy_memory = CertifiedStrategyMemory()`:

```python


# --- API pubblica riusata dal motore di skill ---------------------------------
# Il parsing dei punteggi e dei codici fattore resta qui: e' logica di dominio
# gia' testata. Il motore di skill la consuma da queste due funzioni invece di
# duplicare le regex.

def factor_tokens(text: str) -> set[str]:
    """Codici fattore citati nel testo (C6, A2, T1, C4r...), upper-case."""
    return certified_strategy_memory._factor_tokens(text)


def score_bands(questionnaire: str, scores_context: str) -> dict[str, str]:
    """Mappa codice -> banda (growth/adequate/normal/strength) per QSA/QSAr."""
    raw = certified_strategy_memory._score_bands((questionnaire or "").upper(), scores_context or "")
    return {code: info["band"] for code, info in raw.items()}
```

- [ ] **Step 4: Scrivi gli handler**

Crea `backend/skills/handlers.py`:

```python
"""Registry degli handler Python richiamabili da una skill.

Solo i nomi registrati qui sono accettati in `Skill.handler`: un nome
sconosciuto disattiva la skill invece di eseguire codice arbitrario.
Gli handler sono la meta' "codice" del modello ibrido: qui vivono il parsing
dei punteggi e le chiamate ai servizi di retrieval; le condizioni di
attivazione stanno invece in `conditions.py`, dichiarative.
"""
from __future__ import annotations

import logging
from typing import Callable

from .. import models
from ..certified_strategy_service import (
    certified_strategy_memory,
    factor_tokens,
    score_bands,
)
from ..strategy_memory import APPROVED_STRATEGIES_CONFIG_KEY, strategy_memory
from .context import SkillContext, SkillOutput

logger = logging.getLogger(__name__)

_HANDLERS: dict[str, Callable[[SkillContext, dict], SkillOutput]] = {}


def handler(name: str):
    """Registra una funzione come handler invocabile da `Skill.handler`."""

    def decorator(fn: Callable[[SkillContext, dict], SkillOutput]):
        _HANDLERS[name] = fn
        return fn

    return decorator


def get_handler(name: str) -> Callable[[SkillContext, dict], SkillOutput] | None:
    return _HANDLERS.get(name)


def handler_names() -> list[str]:
    return sorted(_HANDLERS)


def compute_salient_factors(text: str) -> frozenset[str]:
    return frozenset(factor_tokens(text or ""))


def compute_score_bands(questionnaire_type: str, scores_context: str) -> dict[str, str]:
    return score_bands(questionnaire_type, scores_context)


def _allowed(entries: list[dict], allowed_ids) -> list[dict]:
    """Whitelist per step salvata dall'admin. `None` = nessuna whitelist."""
    if allowed_ids is None or not isinstance(allowed_ids, list):
        return entries
    allowed = {str(item).strip() for item in allowed_ids if str(item).strip()}
    return [entry for entry in entries if str(entry.get("id", "")).strip() in allowed]


@handler("certified_strategies")
def certified_strategies(ctx: SkillContext, params: dict) -> SkillOutput:
    """Strategie certificate dal catalogo DB, gate sui fattori e sul profilo."""
    limit = int(params.get("limit", 2) or 0)
    if limit <= 0:
        return SkillOutput()
    entries = certified_strategy_memory.retrieve(
        ctx.db,
        questionnaire_type=ctx.questionnaire_type,
        scores_context=ctx.scores_context,
        # Il catalogo certificato usa la query arricchita di step e punteggi.
        query=ctx.step_query or ctx.query,
        language=ctx.language or "it",
        limit=limit,
        ai_service=ctx.ai_service,
    )
    entries = _allowed(entries, params.get("allowed_strategies"))
    text = certified_strategy_memory.render_context(entries, ctx.language or "it")
    return SkillOutput(text=text, ids=[entry["id"] for entry in entries])


@handler("approved_strategies")
def approved_strategies(ctx: SkillContext, params: dict) -> SkillOutput:
    """Knowledge base Markdown delle strategie approvate (file o config DB)."""
    row = (
        ctx.db.query(models.Config)
        .filter(models.Config.key == APPROVED_STRATEGIES_CONFIG_KEY)
        .first()
    )
    entries = strategy_memory.retrieve(
        questionnaire_type=ctx.questionnaire_type,
        phase=ctx.step_id or "",
        query=ctx.query,
        language=ctx.language or "it",
        ai_service=ctx.ai_service,
        markdown_text=row.value if row else None,
    )
    entries = _allowed(entries, params.get("allowed_strategies"))
    text = strategy_memory.render_context(entries)
    return SkillOutput(text=text, ids=[entry["id"] for entry in entries])
```

Nota: `strategy_memory.retrieve` accetta `phase`, non `step_id`; il valore passato è lo step corrente, come oggi in `_retrieved_context` dove si passa `request.phase`.

- [ ] **Step 5: Scrivi il registry**

Crea `backend/skills/registry.py`:

```python
"""Caricamento delle skill agganciate a uno step.

Solo le skill agganciate girano: nessuna attivazione implicita. Un aggancio con
`step_id == "*"` vale per tutti gli step dello strumento; l'aggancio esplicito
sullo stesso step lo sovrascrive.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .. import models

# Le vecchie spunte per componente del pannello prompt continuano a valere e
# precedono le condizioni: spegnere la componente spegne la skill.
COMPONENT_FLAG_BY_SLUG = {
    "approved-strategies": "approved_strategies",
    "certified-advice": "certified_strategies",
}


@dataclass
class SkillBinding:
    """Una skill risolta per lo step corrente, con i parametri gia' uniti."""

    skill: Any
    params: dict = field(default_factory=dict)
    sort_order: int = 0

    @property
    def slug(self) -> str:
        return self.skill.slug


def bindings_for(db, questionnaire_type: str, step_id: str | None) -> list[SkillBinding]:
    """Skill pubblicate e attive agganciate a (strumento, step), ordinate."""
    rows = (
        db.query(models.GuidedStepSkill)
        .filter(
            models.GuidedStepSkill.questionnaire_type == questionnaire_type,
            models.GuidedStepSkill.enabled.is_(True),
            models.GuidedStepSkill.step_id.in_([step_id or "*", "*"]),
        )
        .all()
    )
    if not rows:
        return []

    # L'aggancio esplicito allo step vince sul wildcard.
    by_skill: dict[int, models.GuidedStepSkill] = {}
    for row in rows:
        current = by_skill.get(row.skill_id)
        if current is None or (current.step_id == "*" and row.step_id != "*"):
            by_skill[row.skill_id] = row

    skills = (
        db.query(models.Skill)
        .filter(
            models.Skill.id.in_(list(by_skill)),
            models.Skill.is_active.is_(True),
            models.Skill.status == "published",
        )
        .all()
    )

    bindings = []
    for skill in skills:
        row = by_skill[skill.id]
        params = dict(skill.handler_params or {})
        params.update(row.override_params or {})
        bindings.append(SkillBinding(skill=skill, params=params, sort_order=row.sort_order or skill.sort_order or 0))
    bindings.sort(key=lambda b: (b.sort_order, b.slug))
    return bindings
```

- [ ] **Step 6: Scrivi l'engine**

Crea `backend/skills/engine.py`:

```python
"""Esecuzione delle skill: rendering, budget, trace.

Il motore non solleva mai: ogni errore diventa una voce di `trace` e un blocco
mancante, perche' un turno di chat non deve fallire per una skill.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

from . import handlers
from .context import SkillContext, SkillOutput
from .registry import SkillBinding

logger = logging.getLogger(__name__)

DEFAULT_TOTAL_MAX_CHARS = 3000


@dataclass
class SkillsResult:
    # slot -> blocchi renderizzati, nell'ordine di iniezione
    blocks: dict[str, list[str]] = field(default_factory=dict)
    # slug -> identificatori del materiale usato (per i log e il feedback)
    ids: dict[str, list[str]] = field(default_factory=dict)
    # diagnostica per la preview admin
    trace: list[dict] = field(default_factory=list)


def truncate(text: str, limit: int) -> str:
    """Taglia a `limit` caratteri sul confine di riga piu' vicino."""
    if limit <= 0:
        return ""
    if len(text) <= limit:
        return text
    cut = text[:limit]
    newline = cut.rfind("\n")
    return (cut[:newline] if newline > 0 else cut).rstrip()


def _instructions(skill, language: str) -> str:
    data = skill.instructions_i18n or {}
    if not isinstance(data, dict):
        return ""
    return (data.get(language) or data.get("it") or "").strip()


def _render_order(binding: SkillBinding) -> tuple:
    # Le skill strutturali (`always`) hanno la precedenza sul budget complessivo.
    return (0 if binding.skill.routing == "always" else 1, binding.sort_order, binding.slug)


def render(bindings: list[SkillBinding], ctx: SkillContext, total_max_chars: int = DEFAULT_TOTAL_MAX_CHARS) -> SkillsResult:
    """Esegue le skill selezionate e produce i blocchi per slot."""
    result = SkillsResult()
    used = 0
    for binding in sorted(bindings, key=_render_order):
        skill = binding.skill
        entry = {"slug": skill.slug, "slot": skill.slot, "chars": 0, "skipped": ""}

        parts = []
        instructions = _instructions(skill, ctx.language or "it")
        if instructions:
            parts.append(instructions)

        if skill.handler:
            fn = handlers.get_handler(skill.handler)
            if fn is None:
                entry["skipped"] = f"handler sconosciuto: {skill.handler}"
                logger.warning("Skill %s: %s", skill.slug, entry["skipped"])
                result.trace.append(entry)
                continue
            try:
                output = fn(ctx, binding.params) or SkillOutput()
            except Exception as exc:  # una skill rotta non deve rompere il turno
                entry["skipped"] = f"handler fallito: {exc}"
                logger.warning("Skill %s: %s", skill.slug, entry["skipped"])
                result.trace.append(entry)
                continue
            if output.text:
                parts.append(output.text.strip())
            if output.ids:
                result.ids[skill.slug] = list(output.ids)

        text = "\n\n".join(part for part in parts if part)
        if not text:
            entry["skipped"] = "nessun contenuto"
            result.trace.append(entry)
            continue

        text = truncate(text, int(skill.max_chars or 0) or len(text))
        remaining = total_max_chars - used
        if len(text) > remaining:
            entry["skipped"] = "budget complessivo esaurito"
            result.trace.append(entry)
            continue

        used += len(text)
        entry["chars"] = len(text)
        result.blocks.setdefault(skill.slot, []).append(text)
        result.trace.append(entry)
    return result
```

- [ ] **Step 7: Esporta i simboli nel package**

Sostituisci `backend/skills/__init__.py`:

```python
"""Motore di skill: unita' dichiarative iniettate nel prompt della chat.

Una skill e' una riga DB (`models.Skill`) con condizioni dichiarative, testo di
istruzioni multilingua e un `handler` Python opzionale per il materiale che va
recuperato (strategie certificate, knowledge base approvata). Gli agganci agli
step vivono in `models.GuidedStepSkill`.
"""
from . import conditions, engine, handlers, registry, router
from .context import SkillContext, SkillOutput

__all__ = [
    "SkillContext",
    "SkillOutput",
    "conditions",
    "engine",
    "handlers",
    "registry",
    "router",
]
```

Nota: `router` non esiste ancora — rimuovilo da import e `__all__` finché non arriva il Task 4, poi rimettilo. Per questo task il file contiene solo `conditions, engine, handlers, registry`.

- [ ] **Step 8: Esegui i test e verifica che passino**

Run: `pytest backend/tests/test_skills_engine.py backend/tests/test_skills_conditions.py -v`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend/skills/ backend/certified_strategy_service.py backend/tests/test_skills_engine.py
git commit -m "feat: add skill handlers, registry and rendering engine"
```

---

### Task 3: Seed, feature flag e integrazione in chat_logic

**Files:**
- Create: `backend/skills_seed.py`
- Modify: `backend/skills/engine.py` (aggiunta di `enabled` e `build_context`)
- Modify: `backend/chat_logic.py` (`_retrieved_context`, `build_context_envelope`)
- Modify: `backend/main.py` (config nuove + chiamata al seed)
- Test: `backend/tests/test_skills_parity.py`

**Interfaces:**
- Consumes: `registry.bindings_for`, `engine.render`, `conditions.match`, `handlers.compute_*` (Task 2).
- Produces:
  - `backend.skills.engine.enabled(db, questionnaire_type) -> bool`
  - `backend.skills.engine.build_context(db, ai_service, *, questionnaire_type, step_id, step_mode, language, query, step_query, message, scores_context, component_flags, handler_options) -> SkillContext`
  - `backend.skills.engine.run_skills(ctx, *, router_enabled=True) -> SkillsResult`
  - `backend.skills_seed.seed_skills(db) -> bool`
  - Config: `skills_engine_enabled`, `skills_engine_instruments`, `skills_router_threshold`, `skills_router_model`, `skills_router_timeout_s`, `skills_total_max_chars`

- [ ] **Step 1: Scrivi il test di parità che fallisce**

Crea `backend/tests/test_skills_parity.py`:

```python
"""Parita' motore acceso / motore spento per il blocco strategie.

Test su DB (Postgres di test): costruisce due strategie certificate e una
knowledge base approvata, poi confronta l'output di `_retrieved_context` con
`skills_engine_enabled` spento e acceso. Devono coincidere: il pilota migra il
*dove* vive la logica, non il comportamento.

Il RAG e' disattivato dai component flags, cosi' il test non tocca la rete.

Eseguibile:
    docker exec counselorbot_backend python -m backend.tests.test_skills_parity
    pytest backend/tests/test_skills_parity.py
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import json
import uuid

from backend import database, models
from backend.api_models import ChatRequest
from backend.chat_logic import _retrieved_context
from backend.skills_seed import seed_skills

NO_RAG_FLAGS = {
    "rag_competenzestrategiche": False,
    "rag_counselorbot": False,
    "rag_questionari": False,
    "approved_strategies": True,
    "certified_strategies": True,
    "shared_responses": False,
    "allowed_strategies": None,
}

SCORES = "C6: 8/9\nA2: 2/9"


def _set_config(db, key: str, value: str) -> None:
    row = db.query(models.Config).filter(models.Config.key == key).first()
    if row is None:
        db.add(models.Config(key=key, value=value))
    else:
        row.value = value
    db.commit()


def _ensure_certified(db) -> None:
    if db.query(models.CertifiedStrategy).filter(models.CertifiedStrategy.slug == "parity-c6").first():
        return
    db.add(models.CertifiedStrategy(
        slug="parity-c6",
        name_it="Organizzare lo studio",
        recommended_when_it="Utile quando C6 e' un'area di crescita",
        description_it="Dividi il materiale in blocchi da 25 minuti.",
        factor_codes=["C6"], match_mode="any", questionnaire_types=["QSA"],
        keywords="organizzazione studio tempo", status="certified", sort_order=1, is_active=True,
    ))
    db.commit()


def _request() -> ChatRequest:
    return ChatRequest(
        message="Come faccio a organizzarmi meglio?",
        session_id=f"parity-{uuid.uuid4().hex[:8]}",
        phase=None,
        language="it",
        scores_context=SCORES,
    )


def _run(db) -> tuple[str, list, list]:
    return _retrieved_context(
        db,
        session_id="parity-session",
        request=_request(),
        questionnaire_type="QSA",
        query="organizzazione dello studio",
        ai_service=None,
        certified_strategy_limit=2,
        component_flags=dict(NO_RAG_FLAGS),
    )


def test_engine_on_matches_engine_off():
    db = database.SessionLocal()
    try:
        _ensure_certified(db)
        seed_skills(db)

        _set_config(db, "skills_engine_enabled", "false")
        off_text, off_strategy_ids, off_certified_ids = _run(db)

        _set_config(db, "skills_engine_enabled", "true")
        _set_config(db, "skills_engine_instruments", json.dumps(["QSA"]))
        on_text, on_strategy_ids, on_certified_ids = _run(db)

        assert on_text == off_text, f"testo diverso:\n--- off ---\n{off_text}\n--- on ---\n{on_text}"
        assert on_strategy_ids == off_strategy_ids
        assert on_certified_ids == off_certified_ids
    finally:
        _set_config(db, "skills_engine_enabled", "false")
        _set_config(db, "skills_engine_instruments", "[]")
        db.close()


def test_engine_off_for_unlisted_instrument():
    db = database.SessionLocal()
    try:
        seed_skills(db)
        _set_config(db, "skills_engine_enabled", "true")
        _set_config(db, "skills_engine_instruments", json.dumps(["ZTPI"]))
        from backend.skills import engine
        assert engine.enabled(db, "QSA") is False
        assert engine.enabled(db, "ZTPI") is True
    finally:
        _set_config(db, "skills_engine_enabled", "false")
        _set_config(db, "skills_engine_instruments", "[]")
        db.close()


def test_disabled_binding_removes_only_its_block():
    db = database.SessionLocal()
    try:
        _ensure_certified(db)
        seed_skills(db)
        _set_config(db, "skills_engine_enabled", "true")
        _set_config(db, "skills_engine_instruments", json.dumps(["QSA"]))

        full_text, _, full_certified_ids = _run(db)

        skill = db.query(models.Skill).filter(models.Skill.slug == "certified-advice").first()
        binding = (
            db.query(models.GuidedStepSkill)
            .filter(models.GuidedStepSkill.skill_id == skill.id,
                    models.GuidedStepSkill.questionnaire_type == "QSA")
            .first()
        )
        binding.enabled = False
        db.commit()
        try:
            reduced_text, _, reduced_certified_ids = _run(db)
        finally:
            binding.enabled = True
            db.commit()

        assert reduced_certified_ids == []
        assert len(reduced_text) < len(full_text)
        if full_certified_ids:
            assert "Strategie certificate" not in reduced_text
    finally:
        _set_config(db, "skills_engine_enabled", "false")
        _set_config(db, "skills_engine_instruments", "[]")
        db.close()


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"ok   {t.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {t.__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
```

`ChatRequest` vive in `backend/api_models.py` (non in `schemas.py`) e i campi usati sono `message`, `session_id`, `phase`, `language`, `scores_context`, tutti con default. L'intestazione del blocco certificato è quella prodotta da `certified_strategy_memory.render_context`: leggila in `backend/certified_strategy_service.py` e usa la stringa esatta nell'ultima asserzione di `test_disabled_binding_removes_only_its_block`.

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `docker exec counselorbot_backend python -m backend.tests.test_skills_parity`
Expected: FAIL con `ModuleNotFoundError: No module named 'backend.skills_seed'`

- [ ] **Step 3: Aggiungi flag e costruzione contesto all'engine**

In coda a `backend/skills/engine.py`:

```python

def _config_value(db, key: str, default: str = "") -> str:
    from .. import models as _models

    row = db.query(_models.Config).filter(_models.Config.key == key).first()
    return (row.value if row and row.value is not None else default) or default


def _config_int(db, key: str, default: int) -> int:
    try:
        return int(_config_value(db, key, str(default)))
    except (TypeError, ValueError):
        return default


def enabled(db, questionnaire_type: str) -> bool:
    """Il motore gira solo se acceso globalmente e per questo strumento."""
    import json as _json

    if _config_value(db, "skills_engine_enabled", "false").strip().lower() not in ("1", "true", "yes", "on"):
        return False
    try:
        instruments = _json.loads(_config_value(db, "skills_engine_instruments", "[]") or "[]")
    except (TypeError, ValueError):
        return False
    if not isinstance(instruments, list):
        return False
    return (questionnaire_type or "").upper() in {str(i).upper() for i in instruments}


def build_context(
    db,
    ai_service,
    *,
    questionnaire_type: str,
    step_id: str | None,
    step_mode: str | None,
    language: str,
    query: str,
    step_query: str,
    message: str,
    scores_context: str,
    component_flags: dict | None = None,
    handler_options: dict | None = None,
) -> SkillContext:
    """Fotografa il turno: i fattori salienti e le bande si calcolano una volta."""
    return SkillContext(
        questionnaire_type=questionnaire_type or "",
        step_id=step_id,
        step_mode=step_mode,
        language=language or "it",
        query=query or "",
        step_query=step_query or "",
        message=message or "",
        scores_context=scores_context or "",
        salient_factors=handlers.compute_salient_factors(f"{scores_context} {step_query}"),
        score_bands=handlers.compute_score_bands(questionnaire_type, scores_context),
        component_flags=dict(component_flags or {}),
        handler_options=dict(handler_options or {}),
        db=db,
        ai_service=ai_service,
    )


def run_skills(ctx: SkillContext, *, router_enabled: bool = True) -> SkillsResult:
    """Filtra, seleziona e rende le skill agganciate allo step corrente."""
    from . import conditions as _conditions
    from .registry import COMPONENT_FLAG_BY_SLUG, bindings_for

    result = SkillsResult()
    try:
        bindings = bindings_for(ctx.db, ctx.questionnaire_type, ctx.step_id)
    except Exception as exc:
        logger.warning("Caricamento skill fallito: %s", exc)
        return result

    candidates = []
    for binding in bindings:
        flag = COMPONENT_FLAG_BY_SLUG.get(binding.slug)
        if flag is not None and not bool(ctx.component_flags.get(flag, True)):
            result.trace.append({"slug": binding.slug, "skipped": f"componente {flag} disattivata"})
            continue
        ok, reason = _conditions.match(binding.skill.conditions, ctx)
        if not ok:
            result.trace.append({"slug": binding.slug, "skipped": reason})
            continue
        # Le opzioni per step configurate dall'admin vincono sui parametri skill.
        params = dict(binding.params)
        if binding.slug == "certified-advice" and "certified_strategy_limit" in ctx.handler_options:
            params["limit"] = ctx.handler_options["certified_strategy_limit"]
        if "allowed_strategies" in ctx.handler_options:
            params["allowed_strategies"] = ctx.handler_options["allowed_strategies"]
        binding.params = params
        candidates.append(binding)

    if router_enabled:
        from .router import select

        selected, router_trace = select(candidates, ctx)
        result.trace.extend(router_trace)
    else:
        selected = candidates

    rendered = render(selected, ctx, total_max_chars=_config_int(ctx.db, "skills_total_max_chars", DEFAULT_TOTAL_MAX_CHARS))
    result.blocks = rendered.blocks
    result.ids = rendered.ids
    result.trace.extend(rendered.trace)
    return result
```

`run_skills` importa `router` in modo differito: fino al Task 4 la funzione va invocata con `router_enabled=False`. Il Task 4 rimuove questa nota.

- [ ] **Step 4: Scrivi il seed**

Crea `backend/skills_seed.py`:

```python
"""Seed append-only delle skill pilota e dei loro agganci.

Le condizioni dei seed sono VUOTE di proposito: oggi il gating delle strategie
vive dentro `certified_strategy_memory.retrieve` (fattori salienti, allineamento
al profilo) e li' resta. Aggiungere condizioni dichiarative qui cambierebbe il
comportamento e romperebbe la parita'. L'admin puo' aggiungerle dal pannello.

Come per i prompt degli step, il seed non aggiorna mai una riga esistente.
"""
from __future__ import annotations

import logging

from . import models

logger = logging.getLogger(__name__)

# Strumenti che oggi ricevono il materiale strategie nella chat guidata.
SEEDED_INSTRUMENTS = ("QSA", "QSAr", "ZTPI", "QPCS", "QPCC", "QAP", "SAVICKAS")

SKILL_SEEDS = [
    {
        "slug": "approved-strategies",
        "name": "Strategie approvate (knowledge base)",
        "description": (
            "Interventi generici approvati editorialmente, utili quando lo studente "
            "chiede cosa fare in concreto e il tema non e' coperto dal catalogo certificato."
        ),
        "instructions_i18n": {},
        "conditions": {},
        "handler": "approved_strategies",
        "handler_params": {},
        "routing": "optional",
        "slot": "knowledge",
        "max_chars": 1000,
        "sort_order": 40,
    },
    {
        "slug": "certified-advice",
        "name": "Strategie certificate (catalogo)",
        "description": (
            "Strategie di apprendimento certificate dall'admin, collegate ai fattori "
            "del profilo: da usare quando lo studente lavora su un'area di crescita."
        ),
        "instructions_i18n": {},
        "conditions": {},
        "handler": "certified_strategies",
        "handler_params": {"limit": 2},
        "routing": "optional",
        "slot": "knowledge",
        "max_chars": 1400,
        "sort_order": 50,
    },
]


def seed_skills(db) -> bool:
    """Crea le skill mancanti e i loro agganci wildcard. Idempotente."""
    changed = False
    for seed in SKILL_SEEDS:
        skill = db.query(models.Skill).filter(models.Skill.slug == seed["slug"]).first()
        if skill is None:
            skill = models.Skill(status="published", is_active=True, **seed)
            db.add(skill)
            db.commit()
            db.refresh(skill)
            changed = True
            logger.info("Seed skill creata: %s", seed["slug"])

        for questionnaire_type in SEEDED_INSTRUMENTS:
            exists = (
                db.query(models.GuidedStepSkill)
                .filter(
                    models.GuidedStepSkill.questionnaire_type == questionnaire_type,
                    models.GuidedStepSkill.step_id == "*",
                    models.GuidedStepSkill.skill_id == skill.id,
                )
                .first()
            )
            if exists is None:
                db.add(models.GuidedStepSkill(
                    questionnaire_type=questionnaire_type,
                    step_id="*",
                    skill_id=skill.id,
                    sort_order=seed["sort_order"],
                    enabled=True,
                ))
                changed = True
        db.commit()
    return changed
```

- [ ] **Step 5: Integra in `_retrieved_context`**

In `backend/chat_logic.py`, aggiungi l'import accanto agli altri import locali (dopo la riga 22):

```python
from .skills import engine as skills_engine
```

Dentro `_retrieved_context`, sostituisci il calcolo di `strategy_context` e `certified_context` con un ramo condizionale. Il codice attuale (dalla riga con `strategies = []` fino a `certified_context = certified_strategy_memory.render_context(...)`) resta intatto e finisce dentro il ramo `else`:

```python
    engine_on = skills_engine.enabled(db, questionnaire_type)

    step = db.query(models.GuidedStep).filter(models.GuidedStep.id == request.phase).first() if request.phase else None
    phase_codes = _phase_factor_codes(db, request.phase)
    certified_scores_context = _scope_scores_to_codes(request.scores_context or "", phase_codes) if phase_codes else (request.scores_context or "")
    certified_phase_query = " ".join(
        part.strip()
        for part in (
            step.label if step else "",
            step.prompt if step else "",
            request.message or "",
            certified_scores_context,
        )
        if part and part.strip()
    )
    step_mode = step.system_prompt_mode if step else request.mode
    certified_limit = _coerce_certified_strategy_limit(
        certified_strategy_limit,
        _default_certified_strategy_limit(step_mode),
    )

    if engine_on:
        ctx = skills_engine.build_context(
            db,
            ai_service,
            questionnaire_type=questionnaire_type,
            step_id=request.phase,
            step_mode=step_mode,
            language=request.language or "it",
            # `query` e' quella generica usata oggi da strategy_memory;
            # `step_query` quella arricchita usata dal catalogo certificato.
            query=query,
            step_query=certified_phase_query,
            message=request.message or "",
            scores_context=certified_scores_context,
            component_flags=dict(component_flags),
            handler_options={
                "certified_strategy_limit": certified_limit,
                "allowed_strategies": component_flags.get("allowed_strategies"),
            },
        )
        skills_result = skills_engine.run_skills(ctx)
        knowledge_blocks = skills_result.blocks.get("knowledge", [])
        strategy_ids = skills_result.ids.get("approved-strategies", [])
        certified_ids = skills_result.ids.get("certified-advice", [])
    else:
        # ... qui resta INVARIATO il codice attuale che calcola
        #     strategies / strategy_context / certified / certified_context ...
        knowledge_blocks = [strategy_context, certified_context]
        strategy_ids = [strategy["id"] for strategy in strategies]
        certified_ids = [strategy["id"] for strategy in certified]
```

Attenzione: `step`, `phase_codes`, `certified_scores_context`, `certified_phase_query`, `step_mode` e `certified_limit` erano già calcolati nel corpo della funzione; vanno spostati **prima** del ramo (come sopra) e rimossi dalla loro posizione originale, senza cambiarne il contenuto.

Poi sostituisci la costruzione finale di `sections` e il `return`:

```python
    sections = [
        section
        for section in (
            graph_context,
            counselorbot_context,
            questionari_context,
            *knowledge_blocks,
            learned_context,
        )
        if section
    ]
    return "\n\n".join(sections), strategy_ids, certified_ids
```

- [ ] **Step 6: Aggancia gli slot `section` e `directive_tail`**

In `build_context_envelope`, il pilota non usa questi slot ma il punto di innesto va predisposto. Aggiungi un parametro keyword-only `skills_blocks: dict[str, list[str]] | None = None` alla firma, e nel corpo:

- subito dopo il blocco che appende `[META SYSTEM PROMPT]`:

```python
    for block in (skills_blocks or {}).get("section", []):
        parts_system.append(block)
```

- subito prima di `system_prompt_final = "\n\n".join(parts_system)`:

```python
    for block in (skills_blocks or {}).get("directive_tail", []):
        parts_system.append(block)
```

I chiamanti attuali non passano `skills_blocks`: il comportamento resta identico.

- [ ] **Step 7: Registra config e seed in `main.py`**

In `backend/main.py`, nella lista di tuple `for key, default, descr in [...]` (intorno alla riga 591), aggiungi:

```python
            ("skills_engine_enabled", "false", "Motore di skill attivo (true/false). Spento: la chat usa il percorso strategie storico."),
            ("skills_engine_instruments", "[]", "Lista JSON degli strumenti su cui il motore di skill e' attivo, es. [\"QSA\"]."),
            ("skills_router_threshold", "3", "Numero di skill opzionali candidate oltre il quale interviene il router LLM."),
            ("skills_router_model", "", "Modello usato dal router delle skill; vuoto = modello attivo."),
            ("skills_router_timeout_s", "6", "Timeout in secondi della chiamata di routing delle skill."),
            ("skills_total_max_chars", "3000", "Tetto complessivo in caratteri dei blocchi prodotti dalle skill."),
```

Subito dopo quel ciclo, aggiungi il seed:

```python
        # Skill pilota + agganci: append-only, non tocca definizioni esistenti.
        try:
            from .skills_seed import seed_skills
            if seed_skills(db):
                logger.info("Seed skill completato")
        except Exception as e:
            logger.warning(f"Seed skill fallito: {e}")
```

- [ ] **Step 8: Esegui il test di parità**

Run:
```bash
docker compose up -d --build backend
docker exec counselorbot_backend python -m backend.tests.test_skills_parity
```
Expected: PASS, 3 test

- [ ] **Step 9: Verifica che gli altri test non regrediscano**

Run:
```bash
docker exec counselorbot_backend python -m backend.tests.test_smoke
docker exec counselorbot_backend python -m backend.tests.test_qsa_factor_directive
docker exec counselorbot_backend python -m backend.tests.test_skills_engine
docker exec counselorbot_backend python -m backend.tests.test_skills_conditions
```
Expected: tutti PASS

- [ ] **Step 10: Commit**

```bash
git add backend/skills_seed.py backend/skills/engine.py backend/chat_logic.py backend/main.py backend/tests/test_skills_parity.py
git commit -m "feat: route strategy retrieval through skills engine behind feature flag"
```

---

### Task 4: Router LLM con fallback deterministico

**Files:**
- Create: `backend/skills/router.py`
- Modify: `backend/skills/__init__.py` (rimetti `router` in import e `__all__`)
- Modify: `backend/skills/engine.py` (togli la nota su `router_enabled`)
- Test: `backend/tests/test_skills_router.py`

**Interfaces:**
- Consumes: `SkillBinding` (Task 2), `SkillContext` (Task 1), `engine._config_value` / `_config_int` (Task 3).
- Produces: `backend.skills.router.select(candidates: list[SkillBinding], ctx: SkillContext) -> tuple[list[SkillBinding], list[dict]]`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `backend/tests/test_skills_router.py`:

```python
"""Test puri del router delle skill.

`ai_service` e `db` sono finti: si verifica che il router chiami l'LLM solo
oltre soglia, che accetti solo slug esistenti e che qualunque guasto degradi
sul fallback deterministico senza propagare eccezioni.

Eseguibile:
    docker exec counselorbot_backend python -m backend.tests.test_skills_router
    pytest backend/tests/test_skills_router.py
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from types import SimpleNamespace

from backend.skills.context import SkillContext
from backend.skills.registry import SkillBinding
from backend.skills.router import select


class FakeConfigDB:
    """DB finto: risponde solo alle query di configurazione del router."""

    def __init__(self, values):
        self.values = values

    def query(self, *_args):
        return self

    def filter(self, *_args):
        return self

    def first(self):
        return None


def _binding(slug, routing="optional", sort_order=0):
    skill = SimpleNamespace(
        slug=slug, name=slug, description=f"descrizione {slug}", instructions_i18n={"it": slug},
        conditions=None, handler=None, handler_params=None, routing=routing,
        slot="knowledge", max_chars=1400, sort_order=sort_order, is_active=True, status="published",
    )
    return SkillBinding(skill=skill, params={}, sort_order=sort_order)


def _ctx(ai_service=None):
    return SkillContext(
        questionnaire_type="QSA", step_id="qsa-c6", step_mode="factor", language="it",
        message="come mi organizzo?", db=FakeConfigDB({}), ai_service=ai_service,
    )


class RecordingService:
    def __init__(self, reply):
        self.reply = reply
        self.calls = 0

    def call_model(self, provider, model, user_message, system_prompt, max_tokens=None):
        self.calls += 1
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply

    config = {"active_provider": "ollama", "model_name": "test-model"}


def test_always_skills_bypass_the_router():
    service = RecordingService('["b"]')
    candidates = [_binding("a", routing="always"), _binding("b"), _binding("c"), _binding("d"), _binding("e")]
    selected, _ = select(candidates, _ctx(service))
    assert "a" in [b.slug for b in selected]


def test_below_threshold_no_llm_call():
    service = RecordingService('["b"]')
    candidates = [_binding("b"), _binding("c")]
    selected, trace = select(candidates, _ctx(service))
    assert service.calls == 0
    assert [b.slug for b in selected] == ["b", "c"]
    assert trace == []


def test_above_threshold_llm_selects():
    service = RecordingService('["c", "e"]')
    candidates = [_binding(s) for s in ("b", "c", "d", "e")]
    selected, trace = select(candidates, _ctx(service))
    assert service.calls == 1
    assert sorted(b.slug for b in selected) == ["c", "e"]
    assert trace[0]["router"] == "llm"


def test_llm_reply_with_unknown_slugs_is_filtered():
    service = RecordingService('["c", "inventata"]')
    candidates = [_binding(s) for s in ("b", "c", "d", "e")]
    selected, _ = select(candidates, _ctx(service))
    assert [b.slug for b in selected] == ["c"]


def test_llm_failure_falls_back_deterministically():
    service = RecordingService(RuntimeError("timeout"))
    candidates = [_binding(s, sort_order=i) for i, s in enumerate(("b", "c", "d", "e"))]
    selected, trace = select(candidates, _ctx(service))
    assert [b.slug for b in selected] == ["b", "c", "d"]
    assert trace[0]["router"] == "fallback"


def test_unparsable_reply_falls_back():
    service = RecordingService("non e' json")
    candidates = [_binding(s, sort_order=i) for i, s in enumerate(("b", "c", "d", "e"))]
    selected, trace = select(candidates, _ctx(service))
    assert [b.slug for b in selected] == ["b", "c", "d"]
    assert trace[0]["router"] == "fallback"


def test_missing_ai_service_falls_back():
    candidates = [_binding(s, sort_order=i) for i, s in enumerate(("b", "c", "d", "e"))]
    selected, trace = select(candidates, _ctx(None))
    assert [b.slug for b in selected] == ["b", "c", "d"]
    assert trace[0]["router"] == "fallback"


def test_empty_candidates():
    selected, trace = select([], _ctx(None))
    assert selected == [] and trace == []


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"ok   {t.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {t.__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `pytest backend/tests/test_skills_router.py -v`
Expected: FAIL con `ModuleNotFoundError: No module named 'backend.skills.router'`

- [ ] **Step 3: Scrivi il router**

Crea `backend/skills/router.py`:

```python
"""Selezione delle skill: regole prima, LLM solo sul residuo.

Le skill `always` passano sempre: sono le direttive strutturali, devono essere
riproducibili. Le `optional` passano tutte finche' sono poche; oltre la soglia
un router LLM sceglie le piu' pertinenti al messaggio dello studente.
Qualunque problema (servizio assente, timeout, risposta non parsabile) degrada
sul fallback deterministico: prime K per sort_order.
"""
from __future__ import annotations

import json
import logging
import re

from .context import SkillContext
from .registry import SkillBinding

logger = logging.getLogger(__name__)

ROUTER_SYSTEM_PROMPT = (
    "Sei un selettore di strumenti. Ricevi un elenco di skill con identificatore "
    "e descrizione, piu' il messaggio di uno studente. Scegli SOLO le skill "
    "davvero pertinenti a quel messaggio. Rispondi esclusivamente con un array "
    "JSON di identificatori, senza testo attorno. Se nessuna e' pertinente, "
    "rispondi []."
)

_JSON_ARRAY_RE = re.compile(r"\[[^\]]*\]", re.DOTALL)


def select(candidates: list[SkillBinding], ctx: SkillContext) -> tuple[list[SkillBinding], list[dict]]:
    """Ritorna (skill selezionate, voci di trace del router)."""
    if not candidates:
        return [], []

    always = [b for b in candidates if b.skill.routing == "always"]
    optional = [b for b in candidates if b.skill.routing != "always"]

    from .engine import _config_int

    threshold = _config_int(ctx.db, "skills_router_threshold", 3)
    if len(optional) <= threshold:
        return always + optional, []

    fallback = sorted(optional, key=lambda b: (b.sort_order, b.slug))[:threshold]
    chosen = _llm_select(optional, ctx, threshold)
    if chosen is None:
        return always + fallback, [{"router": "fallback", "chosen": [b.slug for b in fallback]}]
    return always + chosen, [{"router": "llm", "chosen": [b.slug for b in chosen]}]


def _llm_select(optional: list[SkillBinding], ctx: SkillContext, limit: int) -> list[SkillBinding] | None:
    """`None` segnala al chiamante di usare il fallback deterministico."""
    if ctx.ai_service is None:
        return None

    from .engine import _config_value

    catalogue = "\n".join(f"- {b.slug}: {(b.skill.description or b.skill.name or '').strip()}" for b in optional)
    user_message = (
        f"MESSAGGIO DELLO STUDENTE:\n{(ctx.message or '').strip()[:800]}\n\n"
        f"STEP CORRENTE: {ctx.step_id or 'nessuno'} ({ctx.step_mode or 'n/d'})\n\n"
        f"SKILL DISPONIBILI:\n{catalogue}\n\n"
        f"Scegli al massimo {limit} identificatori."
    )

    try:
        provider = ctx.ai_service.config.get("active_provider", "openai")
        model = _config_value(ctx.db, "skills_router_model", "") or ctx.ai_service.config.get("model_name", "")
        reply = ctx.ai_service.call_model(
            provider=provider,
            model=model,
            user_message=user_message,
            system_prompt=ROUTER_SYSTEM_PROMPT,
            max_tokens=200,
        )
    except Exception as exc:
        logger.warning("Router skill non disponibile, uso il fallback: %s", exc)
        return None

    slugs = _parse_slugs(reply)
    if slugs is None:
        logger.warning("Router skill: risposta non parsabile, uso il fallback")
        return None

    by_slug = {b.slug: b for b in optional}
    chosen = [by_slug[slug] for slug in slugs if slug in by_slug]
    return chosen[:limit]


def _parse_slugs(reply) -> list[str] | None:
    if not isinstance(reply, str):
        return None
    match = _JSON_ARRAY_RE.search(reply)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except (TypeError, ValueError):
        return None
    if not isinstance(data, list):
        return None
    return [str(item).strip() for item in data if str(item).strip()]
```

Nota sul timeout: `AIService.call_model` non espone un timeout per chiamata; `skills_router_timeout_s` resta la config prevista dalla spec ed è consumata al Step 5.

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `pytest backend/tests/test_skills_router.py -v`
Expected: PASS, 8 test

- [ ] **Step 5: Applica il timeout**

Avvolgi la chiamata in un esecutore con scadenza, dentro `_llm_select`, sostituendo il blocco `reply = ctx.ai_service.call_model(...)`:

```python
        from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
        from .engine import _config_int

        timeout_s = _config_int(ctx.db, "skills_router_timeout_s", 6)
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(
                ctx.ai_service.call_model,
                provider=provider,
                model=model,
                user_message=user_message,
                system_prompt=ROUTER_SYSTEM_PROMPT,
                max_tokens=200,
            )
            try:
                reply = future.result(timeout=timeout_s)
            except FutureTimeout:
                logger.warning("Router skill: timeout dopo %ss, uso il fallback", timeout_s)
                return None
```

Aggiungi un test che copre il timeout, in `backend/tests/test_skills_router.py`:

```python
def test_slow_service_times_out_to_fallback():
    import time

    class SlowService(RecordingService):
        def call_model(self, provider, model, user_message, system_prompt, max_tokens=None):
            self.calls += 1
            time.sleep(2)
            return '["c"]'

    ctx = _ctx(SlowService('["c"]'))
    ctx.db.values["skills_router_timeout_s"] = "1"
    candidates = [_binding(s, sort_order=i) for i, s in enumerate(("b", "c", "d", "e"))]
    selected, trace = select(candidates, ctx)
    assert trace[0]["router"] == "fallback"
```

Perché il test veda il timeout a 1s, `FakeConfigDB.first()` deve restituire una riga con `value`. Aggiorna la classe finta:

```python
class FakeConfigDB:
    def __init__(self, values):
        self.values = values
        self._key = None

    def query(self, *_args):
        return self

    def filter(self, *criteria):
        # Estrae il valore letterale confrontato con Config.key.
        for criterion in criteria:
            right = getattr(criterion, "right", None)
            value = getattr(right, "value", None)
            if isinstance(value, str):
                self._key = value
        return self

    def first(self):
        key = self._key
        self._key = None
        if key in self.values:
            return SimpleNamespace(key=key, value=self.values[key])
        return None
```

- [ ] **Step 6: Riesegui i test del router**

Run: `pytest backend/tests/test_skills_router.py -v`
Expected: PASS, 9 test

- [ ] **Step 7: Riattiva il router nel package**

In `backend/skills/__init__.py` rimetti `router` nella riga di import e in `__all__`. In `backend/skills/engine.py` cancella la nota che dice di invocare `run_skills` con `router_enabled=False`.

- [ ] **Step 8: Verifica la parità con il router attivo**

Run: `docker exec counselorbot_backend python -m backend.tests.test_skills_parity`
Expected: PASS — con due sole skill candidate il router non interviene (soglia 3), quindi la parità regge.

- [ ] **Step 9: Commit**

```bash
git add backend/skills/router.py backend/skills/__init__.py backend/skills/engine.py backend/tests/test_skills_router.py
git commit -m "feat: add LLM skill router with deterministic fallback"
```

---

### Task 5: API admin e preview

**Files:**
- Modify: `backend/schemas.py` (in coda al file)
- Create: `backend/routes/skills.py`
- Modify: `backend/main.py` (import + `include_router`)
- Test: `backend/tests/test_smoke.py`

**Interfaces:**
- Consumes: `models.Skill`, `models.GuidedStepSkill`, `handlers.handler_names`, `engine.build_context`, `engine.run_skills`, `registry.bindings_for`.
- Produces: gli endpoint elencati sotto e gli schemi `SkillCreate`, `SkillUpdate`, `SkillResponse`, `StepSkillEntry`, `StepSkillMap`, `SkillPreviewRequest`, `SkillPreviewResponse`.

- [ ] **Step 1: Aggiungi gli schemi Pydantic**

In coda a `backend/schemas.py`:

```python
class SkillBase(BaseModel):
    slug: str
    name: str
    description: Optional[str] = None
    instructions_i18n: Optional[dict] = None
    conditions: Optional[dict] = None
    handler: Optional[str] = None
    handler_params: Optional[dict] = None
    routing: str = "optional"
    slot: str = "knowledge"
    max_chars: int = 1400
    sort_order: int = 0
    is_active: bool = True
    status: str = "draft"


class SkillCreate(SkillBase):
    pass


class SkillUpdate(BaseModel):
    slug: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    instructions_i18n: Optional[dict] = None
    conditions: Optional[dict] = None
    handler: Optional[str] = None
    handler_params: Optional[dict] = None
    routing: Optional[str] = None
    slot: Optional[str] = None
    max_chars: Optional[int] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    status: Optional[str] = None


class SkillResponse(SkillBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class StepSkillEntry(BaseModel):
    questionnaire_type: str
    step_id: str
    skill_id: int
    sort_order: int = 0
    enabled: bool = True
    override_params: Optional[dict] = None


class StepSkillMap(BaseModel):
    questionnaire_type: str
    entries: List[StepSkillEntry]


class SkillPreviewRequest(BaseModel):
    questionnaire_type: str
    step_id: Optional[str] = None
    language: str = "it"
    scores_context: str = ""
    message: str = ""


class SkillPreviewResponse(BaseModel):
    blocks: dict
    ids: dict
    trace: List[dict]
```

Verifica come gli altri schemi del file dichiarano la lettura da ORM (`ConfigDict(from_attributes=True)` oppure `class Config: orm_mode`) e allinea `SkillResponse` a quello stile.

- [ ] **Step 2: Scrivi le rotte**

Crea `backend/routes/skills.py`:

```python
"""Skill della chat: CRUD admin, mappa step, preview.

La preview e' lo strumento diagnostico principale: mostra quali skill si
attivano per uno step, con che testo, e il motivo di ogni esclusione (condizioni
non soddisfatte, componente spenta, budget esaurito, scelta del router).
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import auth, database, models, schemas
from ..skills import engine as skills_engine
from ..skills import handlers as skills_handlers

router = APIRouter()
get_db = database.get_db

_ALLOWED_ROUTING = {"always", "optional"}
_ALLOWED_SLOTS = {"section", "knowledge", "directive_tail"}
_ALLOWED_STATUS = {"draft", "published"}


def _validate(payload_dict: dict) -> None:
    routing = payload_dict.get("routing")
    if routing is not None and routing not in _ALLOWED_ROUTING:
        raise HTTPException(status_code=400, detail=f"routing non valido: {routing}")
    slot = payload_dict.get("slot")
    if slot is not None and slot not in _ALLOWED_SLOTS:
        raise HTTPException(status_code=400, detail=f"slot non valido: {slot}")
    status = payload_dict.get("status")
    if status is not None and status not in _ALLOWED_STATUS:
        raise HTTPException(status_code=400, detail=f"status non valido: {status}")
    handler = payload_dict.get("handler")
    if handler and handler not in skills_handlers.handler_names():
        raise HTTPException(status_code=400, detail=f"handler sconosciuto: {handler}")


@router.get("/admin/skills", response_model=List[schemas.SkillResponse])
async def list_skills(
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.Skill)
        .order_by(models.Skill.sort_order.asc(), models.Skill.id.asc())
        .all()
    )


@router.get("/admin/skills/handlers")
async def list_handlers(
    current_user: models.User = Depends(auth.get_current_active_admin),
):
    return {"handlers": skills_handlers.handler_names()}


@router.post("/admin/skills", response_model=schemas.SkillResponse)
async def create_skill(
    payload: schemas.SkillCreate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    data = payload.model_dump()
    slug = (data.get("slug") or "").strip()
    if not slug:
        raise HTTPException(status_code=400, detail="slug obbligatorio")
    if db.query(models.Skill).filter(models.Skill.slug == slug).first():
        raise HTTPException(status_code=409, detail="slug gia' esistente")
    _validate(data)
    data["slug"] = slug
    skill = models.Skill(**data)
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill


@router.put("/admin/skills/{skill_id}", response_model=schemas.SkillResponse)
async def update_skill(
    skill_id: int,
    payload: schemas.SkillUpdate,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    skill = db.query(models.Skill).filter(models.Skill.id == skill_id).first()
    if skill is None:
        raise HTTPException(status_code=404, detail="skill non trovata")
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    _validate(data)
    for key, value in data.items():
        setattr(skill, key, value)
    db.commit()
    db.refresh(skill)
    return skill


@router.delete("/admin/skills/{skill_id}")
async def delete_skill(
    skill_id: int,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    skill = db.query(models.Skill).filter(models.Skill.id == skill_id).first()
    if skill is None:
        raise HTTPException(status_code=404, detail="skill non trovata")
    bound = db.query(models.GuidedStepSkill).filter(models.GuidedStepSkill.skill_id == skill_id).count()
    if bound:
        raise HTTPException(status_code=409, detail=f"skill agganciata a {bound} step: sganciala prima")
    db.delete(skill)
    db.commit()
    return {"status": "deleted"}


@router.get("/admin/skills/step-map", response_model=schemas.StepSkillMap)
async def get_step_map(
    questionnaire_type: str,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(models.GuidedStepSkill)
        .filter(models.GuidedStepSkill.questionnaire_type == questionnaire_type)
        .order_by(models.GuidedStepSkill.sort_order.asc(), models.GuidedStepSkill.id.asc())
        .all()
    )
    return schemas.StepSkillMap(
        questionnaire_type=questionnaire_type,
        entries=[
            schemas.StepSkillEntry(
                questionnaire_type=row.questionnaire_type,
                step_id=row.step_id,
                skill_id=row.skill_id,
                sort_order=row.sort_order,
                enabled=row.enabled,
                override_params=row.override_params,
            )
            for row in rows
        ],
    )


@router.put("/admin/skills/step-map", response_model=schemas.StepSkillMap)
async def put_step_map(
    payload: schemas.StepSkillMap,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    questionnaire_type = payload.questionnaire_type
    db.query(models.GuidedStepSkill).filter(
        models.GuidedStepSkill.questionnaire_type == questionnaire_type
    ).delete()
    for entry in payload.entries:
        db.add(models.GuidedStepSkill(
            questionnaire_type=questionnaire_type,
            step_id=entry.step_id,
            skill_id=entry.skill_id,
            sort_order=entry.sort_order,
            enabled=entry.enabled,
            override_params=entry.override_params,
        ))
    db.commit()
    return await get_step_map(questionnaire_type, current_user, db)


@router.post("/admin/skills/preview", response_model=schemas.SkillPreviewResponse)
async def preview_skills(
    payload: schemas.SkillPreviewRequest,
    current_user: models.User = Depends(auth.get_current_active_admin),
    db: Session = Depends(get_db),
):
    from ..ai_service import AIService

    step = (
        db.query(models.GuidedStep).filter(models.GuidedStep.id == payload.step_id).first()
        if payload.step_id
        else None
    )
    ctx = skills_engine.build_context(
        db,
        AIService(db),
        questionnaire_type=payload.questionnaire_type,
        step_id=payload.step_id,
        step_mode=step.system_prompt_mode if step else None,
        language=payload.language,
        query=payload.message,
        step_query=" ".join(
            part for part in (step.label if step else "", step.prompt if step else "", payload.message, payload.scores_context) if part
        ),
        message=payload.message,
        scores_context=payload.scores_context,
        component_flags={},
        handler_options={},
    )
    result = skills_engine.run_skills(ctx)
    return schemas.SkillPreviewResponse(blocks=result.blocks, ids=result.ids, trace=result.trace)
```

- [ ] **Step 3: Monta il router**

In `backend/main.py`, accanto agli altri import di rotte (intorno alla riga 69):

```python
from .routes import skills as skills_routes
```

e accanto agli altri `include_router` (intorno alla riga 1501):

```python
app.include_router(skills_routes.router)
```

- [ ] **Step 4: Estendi lo smoke test**

`backend/tests/test_smoke.py` verifica che nessun endpoint sparisca tramite l'insieme `EXPECTED_ROUTES` (riga 241), confrontato con le route registrate a riga 444. Aggiungi dentro `EXPECTED_ROUTES`, accanto alle altre voci `/admin/...`:

```python
    ("GET", "/admin/skills"),
    ("POST", "/admin/skills"),
    ("PUT", "/admin/skills/{skill_id}"),
    ("DELETE", "/admin/skills/{skill_id}"),
    ("GET", "/admin/skills/handlers"),
    ("GET", "/admin/skills/step-map"),
    ("PUT", "/admin/skills/step-map"),
    ("POST", "/admin/skills/preview"),
```

Aggiungi poi, in coda al file prima del blocco `if __name__ == "__main__":`, un test che valida la whitelist degli handler. Riusa il client e il DB di test già costruiti nel modulo (cerca il `TestClient` esistente e l'helper di autenticazione admin usati dagli altri test, e chiamali allo stesso modo):

```python
def test_skills_handler_whitelist():
    """Un handler non registrato deve essere rifiutato, non salvato."""
    from backend.skills import handlers as skills_handlers

    assert "certified_strategies" in skills_handlers.handler_names()
    assert "approved_strategies" in skills_handlers.handler_names()

    res = _client.post("/admin/skills", json={
        "slug": "smoke-broken",
        "name": "Smoke broken",
        "handler": "inesistente",
    })
    assert res.status_code == 400, res.text
    assert "handler sconosciuto" in res.json()["detail"]
```

Sostituisci `_client` con il nome effettivo del `TestClient` definito nel modulo.

- [ ] **Step 5: Esegui i test**

Run:
```bash
docker compose up -d --build backend
docker exec counselorbot_backend python -m backend.tests.test_smoke
```
Expected: PASS

- [ ] **Step 6: Verifica la preview a mano**

Run:
```bash
docker exec counselorbot_backend python -c "
from backend import database
from backend.skills import engine
db = database.SessionLocal()
ctx = engine.build_context(db, None, questionnaire_type='QSA', step_id=None, step_mode='generic',
                           language='it', query='organizzazione studio',
                           step_query='organizzazione studio C6: 8/9', message='come mi organizzo?',
                           scores_context='C6: 8/9', component_flags={}, handler_options={})
print(engine.run_skills(ctx).trace)
db.close()
"
```
Expected: una lista di voci di trace, una per skill agganciata a QSA.

- [ ] **Step 7: Commit**

```bash
git add backend/schemas.py backend/routes/skills.py backend/main.py backend/tests/test_smoke.py
git commit -m "feat: add skills admin API with activation preview"
```

---

### Task 6: Pannello admin e documentazione

**Files:**
- Create: `frontend/src/components/admin/SkillsPanel.tsx`
- Modify: `frontend/src/app/admin/page.tsx`
- Modify: `CONTEXT.md`

**Interfaces:**
- Consumes: gli endpoint del Task 5.
- Produces: componente esportato `SkillsPanel`; tab admin `skills`.

- [ ] **Step 1: Scrivi il pannello**

Crea `frontend/src/components/admin/SkillsPanel.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Play } from 'lucide-react';

interface Skill {
    id: number;
    slug: string;
    name: string;
    description: string | null;
    instructions_i18n: Record<string, string> | null;
    conditions: Record<string, unknown> | null;
    handler: string | null;
    handler_params: Record<string, unknown> | null;
    routing: string;
    slot: string;
    max_chars: number;
    sort_order: number;
    is_active: boolean;
    status: string;
}

interface StepSkillEntry {
    questionnaire_type: string;
    step_id: string;
    skill_id: number;
    sort_order: number;
    enabled: boolean;
    override_params: Record<string, unknown> | null;
}

type FormState = {
    slug: string; name: string; description: string;
    instructionsIt: string; conditions: string; handler: string; handlerParams: string;
    routing: string; slot: string; maxChars: string; sortOrder: string;
    isActive: boolean; status: string;
};

const EMPTY: FormState = {
    slug: '', name: '', description: '',
    instructionsIt: '', conditions: '{}', handler: '', handlerParams: '{}',
    routing: 'optional', slot: 'knowledge', maxChars: '1400', sortOrder: '0',
    isActive: true, status: 'draft',
};

const INSTRUMENTS = ['QSA', 'QSAr', 'ZTPI', 'QPCS', 'QPCC', 'QAP', 'SAVICKAS'];

export function SkillsPanel() {
    const [skills, setSkills] = useState<Skill[]>([]);
    const [handlers, setHandlers] = useState<string[]>([]);
    const [instrument, setInstrument] = useState('QSA');
    const [stepMap, setStepMap] = useState<StepSkillEntry[]>([]);
    const [editingId, setEditingId] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [error, setError] = useState('');
    const [previewMessage, setPreviewMessage] = useState('');
    const [previewScores, setPreviewScores] = useState('C6: 8/9');
    const [preview, setPreview] = useState<{ blocks: Record<string, string[]>; trace: Record<string, unknown>[] } | null>(null);

    const load = useCallback(async () => {
        const [sr, hr] = await Promise.all([
            fetch('/api/admin/skills'),
            fetch('/api/admin/skills/handlers'),
        ]);
        if (sr.ok) setSkills(await sr.json());
        if (hr.ok) setHandlers((await hr.json()).handlers ?? []);
    }, []);

    const loadStepMap = useCallback(async (qt: string) => {
        const res = await fetch(`/api/admin/skills/step-map?questionnaire_type=${encodeURIComponent(qt)}`);
        if (res.ok) setStepMap((await res.json()).entries ?? []);
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { loadStepMap(instrument); }, [instrument, loadStepMap]);

    const startEdit = (skill: Skill) => {
        setEditingId(skill.id);
        setError('');
        setForm({
            slug: skill.slug, name: skill.name, description: skill.description ?? '',
            instructionsIt: skill.instructions_i18n?.it ?? '',
            conditions: JSON.stringify(skill.conditions ?? {}, null, 2),
            handler: skill.handler ?? '',
            handlerParams: JSON.stringify(skill.handler_params ?? {}, null, 2),
            routing: skill.routing, slot: skill.slot,
            maxChars: String(skill.max_chars), sortOrder: String(skill.sort_order),
            isActive: skill.is_active, status: skill.status,
        });
    };

    const save = async () => {
        let conditions: unknown;
        let handlerParams: unknown;
        try {
            conditions = JSON.parse(form.conditions || '{}');
            handlerParams = JSON.parse(form.handlerParams || '{}');
        } catch {
            setError('Condizioni o parametri: JSON non valido');
            return;
        }
        const body = {
            slug: form.slug.trim(), name: form.name.trim(), description: form.description,
            instructions_i18n: form.instructionsIt ? { it: form.instructionsIt } : {},
            conditions, handler: form.handler || null, handler_params: handlerParams,
            routing: form.routing, slot: form.slot,
            max_chars: Number(form.maxChars) || 1400, sort_order: Number(form.sortOrder) || 0,
            is_active: form.isActive, status: form.status,
        };
        const isNew = editingId === 'new';
        const res = await fetch(isNew ? '/api/admin/skills' : `/api/admin/skills/${editingId}`, {
            method: isNew ? 'POST' : 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            setError((await res.json()).detail ?? 'Salvataggio fallito');
            return;
        }
        setEditingId(null);
        setForm(EMPTY);
        setError('');
        load();
    };

    const remove = async (id: number) => {
        const res = await fetch(`/api/admin/skills/${id}`, { method: 'DELETE' });
        if (!res.ok) setError((await res.json()).detail ?? 'Eliminazione fallita');
        load();
    };

    const toggleBinding = async (skillId: number) => {
        const existing = stepMap.find((e) => e.skill_id === skillId && e.step_id === '*');
        const entries = existing
            ? stepMap.map((e) => (e === existing ? { ...e, enabled: !e.enabled } : e))
            : [...stepMap, { questionnaire_type: instrument, step_id: '*', skill_id: skillId, sort_order: 0, enabled: true, override_params: null }];
        const res = await fetch('/api/admin/skills/step-map', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ questionnaire_type: instrument, entries }),
        });
        if (res.ok) setStepMap((await res.json()).entries ?? []);
    };

    const runPreview = async () => {
        const res = await fetch('/api/admin/skills/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                questionnaire_type: instrument, step_id: null, language: 'it',
                scores_context: previewScores, message: previewMessage,
            }),
        });
        if (res.ok) setPreview(await res.json());
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Skill della chat</h2>
                <button
                    onClick={() => { setEditingId('new'); setForm(EMPTY); setError(''); }}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                >
                    <Plus className="h-4 w-4" /> Nuova skill
                </button>
            </div>

            {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

            {editingId !== null && (
                <div className="space-y-3 rounded-lg border p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-sm">Slug
                            <input className="mt-1 w-full rounded border px-2 py-1" value={form.slug}
                                onChange={(e) => setForm({ ...form, slug: e.target.value })} />
                        </label>
                        <label className="text-sm">Nome
                            <input className="mt-1 w-full rounded border px-2 py-1" value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })} />
                        </label>
                    </div>
                    <label className="block text-sm">Descrizione (la legge il router)
                        <textarea className="mt-1 w-full rounded border px-2 py-1" rows={2} value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    </label>
                    <label className="block text-sm">Istruzioni (IT, Markdown)
                        <textarea className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" rows={5} value={form.instructionsIt}
                            onChange={(e) => setForm({ ...form, instructionsIt: e.target.value })} />
                    </label>
                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-sm">Condizioni (JSON)
                            <textarea className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" rows={6} value={form.conditions}
                                onChange={(e) => setForm({ ...form, conditions: e.target.value })} />
                        </label>
                        <label className="text-sm">Parametri handler (JSON)
                            <textarea className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" rows={6} value={form.handlerParams}
                                onChange={(e) => setForm({ ...form, handlerParams: e.target.value })} />
                        </label>
                    </div>
                    <div className="grid gap-3 md:grid-cols-4">
                        <label className="text-sm">Handler
                            <select className="mt-1 w-full rounded border px-2 py-1" value={form.handler}
                                onChange={(e) => setForm({ ...form, handler: e.target.value })}>
                                <option value="">(nessuno)</option>
                                {handlers.map((h) => <option key={h} value={h}>{h}</option>)}
                            </select>
                        </label>
                        <label className="text-sm">Routing
                            <select className="mt-1 w-full rounded border px-2 py-1" value={form.routing}
                                onChange={(e) => setForm({ ...form, routing: e.target.value })}>
                                <option value="optional">optional</option>
                                <option value="always">always</option>
                            </select>
                        </label>
                        <label className="text-sm">Slot
                            <select className="mt-1 w-full rounded border px-2 py-1" value={form.slot}
                                onChange={(e) => setForm({ ...form, slot: e.target.value })}>
                                <option value="knowledge">knowledge</option>
                                <option value="section">section</option>
                                <option value="directive_tail">directive_tail</option>
                            </select>
                        </label>
                        <label className="text-sm">Stato
                            <select className="mt-1 w-full rounded border px-2 py-1" value={form.status}
                                onChange={(e) => setForm({ ...form, status: e.target.value })}>
                                <option value="draft">draft</option>
                                <option value="published">published</option>
                            </select>
                        </label>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={save} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">
                            <Check className="h-4 w-4" /> Salva
                        </button>
                        <button onClick={() => { setEditingId(null); setError(''); }} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                            <X className="h-4 w-4" /> Annulla
                        </button>
                    </div>
                </div>
            )}

            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b text-left">
                        <th className="py-2">Slug</th><th>Handler</th><th>Routing</th><th>Slot</th><th>Stato</th><th></th>
                    </tr>
                </thead>
                <tbody>
                    {skills.map((skill) => (
                        <tr key={skill.id} className="border-b">
                            <td className="py-2">{skill.slug}</td>
                            <td>{skill.handler ?? '—'}</td>
                            <td>{skill.routing}</td>
                            <td>{skill.slot}</td>
                            <td>{skill.status}</td>
                            <td className="text-right">
                                <button onClick={() => startEdit(skill)} className="mr-2 p-1"><Pencil className="h-4 w-4" /></button>
                                <button onClick={() => remove(skill.id)} className="p-1"><Trash2 className="h-4 w-4" /></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center gap-3">
                    <h3 className="font-medium">Agganci per strumento</h3>
                    <select className="rounded border px-2 py-1 text-sm" value={instrument} onChange={(e) => setInstrument(e.target.value)}>
                        {INSTRUMENTS.map((i) => <option key={i} value={i}>{i}</option>)}
                    </select>
                </div>
                <ul className="space-y-1 text-sm">
                    {skills.map((skill) => {
                        const entry = stepMap.find((e) => e.skill_id === skill.id && e.step_id === '*');
                        return (
                            <li key={skill.id} className="flex items-center gap-2">
                                <input type="checkbox" checked={Boolean(entry?.enabled)} onChange={() => toggleBinding(skill.id)} />
                                <span>{skill.slug}</span>
                                <span className="text-muted-foreground">tutti gli step</span>
                            </li>
                        );
                    })}
                </ul>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
                <h3 className="font-medium">Preview</h3>
                <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm">Messaggio dello studente
                        <input className="mt-1 w-full rounded border px-2 py-1" value={previewMessage}
                            onChange={(e) => setPreviewMessage(e.target.value)} />
                    </label>
                    <label className="text-sm">Punteggi
                        <input className="mt-1 w-full rounded border px-2 py-1" value={previewScores}
                            onChange={(e) => setPreviewScores(e.target.value)} />
                    </label>
                </div>
                <button onClick={runPreview} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Play className="h-4 w-4" /> Esegui
                </button>
                {preview && (
                    <div className="space-y-2">
                        <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{JSON.stringify(preview.trace, null, 2)}</pre>
                        {Object.entries(preview.blocks).map(([slot, blocks]) => (
                            <div key={slot}>
                                <p className="text-xs font-medium uppercase text-muted-foreground">{slot}</p>
                                <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">{blocks.join('\n\n')}</pre>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Aggiungi il tab**

In `frontend/src/app/admin/page.tsx`:

- import: `import { SkillsPanel } from '@/components/admin/SkillsPanel';` e aggiungi `Wand2` alla lista di icone importate da `lucide-react`;
- tipo `AdminTab`: aggiungi `| 'skills'`;
- nel gruppo `t('admin.group.aiConfig')`, dopo `certifiedStrategies`: `{ id: 'skills', label: 'Skill', icon: Wand2 },`;
- nel blocco che rende il contenuto per tab, accanto agli altri: `{activeTab === 'skills' && <SkillsPanel />}` (segui la forma esatta usata dagli altri pannelli nello stesso file).

- [ ] **Step 3: Verifica la build del frontend**

Run:
```bash
cd frontend && npm run build
```
Expected: build completata senza errori TypeScript

- [ ] **Step 4: Verifica il pannello nell'app**

Run:
```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=40 backend
```
Poi apri il pannello admin, tab **Skill**: la lista mostra `approved-strategies` e `certified-advice`, gli agganci per QSA sono spuntati, la preview restituisce un trace.

- [ ] **Step 5: Aggiorna CONTEXT.md**

In `CONTEXT.md`, sezione **Data Model**, aggiungi:

```markdown
- **Skill / GuidedStepSkill**: skill dichiarative iniettate nel prompt della chat (condizioni, istruzioni multilingua, handler Python opzionale) e loro aggancio a strumento/step (`step_id = "*"` = tutti gli step). Motore in `backend/skills/`, seed in `backend/skills_seed.py`, API `/admin/skills`. Spento di default: `skills_engine_enabled`, `skills_engine_instruments`.
```

Nella sezione **Core Concepts**, dopo *Suggested questions*, aggiungi:

```markdown
- **Skills engine**: `backend/skills/` seleziona e rende le skill agganciate allo step corrente. Filtro deterministico sulle `conditions`, poi router LLM solo se le skill opzionali candidate superano `skills_router_threshold` (fallback deterministico su errore o timeout). Il pilota copre il suggerimento di strategie (`approved-strategies`, `certified-advice`); il percorso storico in `chat_logic._retrieved_context` resta attivo a flag spento.
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/SkillsPanel.tsx frontend/src/app/admin/page.tsx CONTEXT.md
git commit -m "feat: add skills admin panel with activation preview"
```

- [ ] **Step 7: Verifica finale e push**

Run:
```bash
docker exec counselorbot_backend python -m backend.tests.test_smoke
docker exec counselorbot_backend python -m backend.tests.test_skills_conditions
docker exec counselorbot_backend python -m backend.tests.test_skills_engine
docker exec counselorbot_backend python -m backend.tests.test_skills_router
docker exec counselorbot_backend python -m backend.tests.test_skills_parity
docker exec counselorbot_backend python -m backend.tests.test_qsa_factor_directive
cd frontend && npm run build
git push -u origin feature/skills-engine
```
Expected: tutti PASS, build ok, branch pubblicato.

---

## Attivazione (dopo il merge, manuale)

Il motore resta spento finché un admin non lo accende. Per attivarlo su uno strumento:

1. Pannello admin → Config → `skills_engine_enabled` = `true`.
2. `skills_engine_instruments` = `["QSA"]`.
3. Tab Skill → Preview su uno step reale: verifica che i blocchi corrispondano a quelli attesi.
4. Una conversazione di prova su QSA, confronto del prompt loggato (`log_full_prompt` è attivo di default) con una conversazione precedente.
5. Solo dopo, estendere la lista agli altri strumenti.

Rollback: rimettere `skills_engine_enabled` a `false`. Nessun dato viene perso: le skill restano in tabella.
