"""Static prompt health check (phase 1, #760): no model, warnings only.

Reads the active prompt texts, compares them with the registry and rebuilds
the request of every guided path x step x mode with the same code as the
admin request preview (`prompt_audit.build_prompt_audit`). It reports:

- prompts that never arrive: unregistered keys, empty prompts, stored texts
  that differ from the factory without being marked as customised;
- rule conflicts between pieces sent in the same turn, computed from the
  structured rules of the registry (a rule is active when its evidence
  sentence is in the assembled request);
- wrong references: unresolved placeholders, factor codes or step ids unknown
  to the code, step counts that disagree with the path.

Results are stored by the hash of the texts they were computed from: an
unchanged hash reuses the stored run. Saving a prompt is never blocked.
"""
from __future__ import annotations

import hashlib
import inspect
import json
import logging
import re
from collections import defaultdict
from contextlib import contextmanager
from functools import lru_cache

from sqlalchemy.orm import Session

from . import models, prompt_registry, prompt_revisions
from .prompt_registry import (
    REGISTRY,
    Rule,
    config_entry,
    factory_text,
    is_prompt_config_key,
    step_entry,
)

logger = logging.getLogger(__name__)

CHECK_VERSION = 2  # 2: sentence positions, token sentences (#761)
KEEP_RUNS = 20
HIGH, MEDIUM, LOW = "high", "medium", "low"
SEVERITY_RANK = {HIGH: 0, MEDIUM: 1, LOW: 2}

ADVICE_MESSAGE = "Puoi suggerirmi una strategia pratica?"
FOLLOW_UP_MESSAGE = "Ok."

_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}
_NUM = r"(\d+|one|two|three|four|five|six|seven|eight|nine|ten)"
_QUESTION_BUDGET_RE = re.compile(
    rf"\b(exactly|at most|ask)\s+{_NUM}\s+(?:[a-z-]+\s+){{0,3}}questions?\b", re.IGNORECASE)
_STEP_COUNT_RE = re.compile(rf"\bin {_NUM} steps\b", re.IGNORECASE)
_AREA_RE = re.compile(r"\bArea (\d+)/(\d+)\b")
_PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z_][\w]*)\s*\}\}|(?<!\{)\{([a-z_][a-z0-9_]*)\}(?!\})")
_FACTOR_RE = re.compile(r"\b([A-Z]\d{1,2}r?)\b")
_STEP_PREFIXES = ("sl", "qsar", "ztpi", "savickas", "evstudio", "evprof", "obbstudio", "obbdocenza", "qpcs", "qpcc", "qap", "idea")
_STEP_REF_RE = re.compile(r"\b(?:%s)-[a-z0-9]+(?:-[a-z0-9]+)*\b" % "|".join(_STEP_PREFIXES))


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _number(token: str) -> int:
    return int(token) if token.isdigit() else _WORDS[token.lower()]


# --- Active texts ---------------------------------------------------------------

def active_texts(db: Session) -> dict[str, str]:
    """Prompt texts in the database, keyed `config:<key>` or `guided_step:<id>`."""
    texts = {}
    for key, value in db.query(models.Config.key, models.Config.value).all():
        if is_prompt_config_key(key):
            texts[f"config:{key}"] = value or ""
    for step_id, prompt in db.query(models.GuidedStep.id, models.GuidedStep.prompt).all():
        texts[f"guided_step:{step_id}"] = prompt or ""
    return texts


@lru_cache(maxsize=1)
def _code_signature() -> str:
    """Digest of the code the result depends on: registry, factory and request builders."""
    from . import chat_logic, chat_preparation, prompt_contract
    parts = [str(CHECK_VERSION), repr(sorted(REGISTRY.items()))]
    parts += [inspect.getsource(module) for module in (prompt_contract, chat_preparation, chat_logic)]
    parts += [factory_text(entry) or "" for _, entry in sorted(REGISTRY.items())]
    return _digest("\n".join(parts))


def texts_hash(db: Session, texts: dict[str, str] | None = None) -> str:
    texts = active_texts(db) if texts is None else texts
    return _digest(_code_signature() + json.dumps(texts, sort_keys=True, ensure_ascii=False))


# --- Findings -------------------------------------------------------------------

def _finding(code, severity, prompts, *, surfaces=(), sentences=(), params=None) -> dict:
    prompts = list(dict.fromkeys(prompts))
    ident = _digest(json.dumps([code, prompts, [s["text"] for s in sentences], params or {}], sort_keys=True))[:16]
    return {
        "id": ident, "code": code, "severity": severity, "prompts": prompts,
        "surfaces": list(surfaces), "sentences": list(sentences), "params": params or {},
    }


def _entry_for(prompt_id: str):
    kind, _, key = prompt_id.partition(":")
    return config_entry(key) if kind == "config" else step_entry(key)


def _registration_findings(texts: dict[str, str]) -> list[dict]:
    return [
        _finding("unregistered_prompt", MEDIUM, [pid])
        for pid in texts if pid.startswith("config:") and _entry_for(pid) is None
    ]


def _instrument_of(db: Session) -> dict[str, str | None]:
    """Prompt id -> the one instrument that receives it (None when shared)."""
    from .chat_logic import (
        _system_prompt_key,
        guided_step_follow_up_mode,
        guided_step_system_prompt_key,
    )
    users: dict[str, set] = defaultdict(set)
    for step in db.query(models.GuidedStep).all():
        instrument = step.questionnaire_type
        users[f"guided_step:{step.id}"].add(instrument)
        users[f"config:{guided_step_system_prompt_key(step)}"].add(instrument)
        users[f"config:{_system_prompt_key(guided_step_follow_up_mode(step), step.id, step)}"].add(instrument)
    out = {pid: next(iter(found)) if len(found) == 1 else None for pid, found in users.items()}
    for definition in prompt_registry.prompt_config.META_SYSTEM_PROMPT_DEFINITIONS:
        out.setdefault(f"config:{definition['key']}", None)
    return out


def _meta_instrument(key: str, instruments: set[str]) -> str | None:
    rest = key.removeprefix("prompt_meta_")
    for instrument in sorted(instruments, key=len, reverse=True):
        if rest == instrument.upper() or rest.startswith(instrument.upper() + "_"):
            return instrument
    return None


def _text_findings(db: Session, texts: dict[str, str]) -> list[dict]:
    from .prompt_factory_alignment import factory_owned
    from .telegram_state import allowed_factor_codes

    findings = []
    steps = db.query(models.GuidedStep).all()
    instruments = {s.questionnaire_type for s in steps}
    step_ids = {s.id for s in steps}
    known_steps = step_ids | set(prompt_registry.prompt_config.GUIDED_PHASE_ALIASES)
    from .qsa_essential import _ESSENTIAL_PATHS, _FOLLOWUP_PHASES
    for phases in _ESSENTIAL_PATHS.values():
        known_steps.update(phases)
    known_steps.update(_FOLLOWUP_PHASES.values())
    owner = _instrument_of(db)
    factor_cache: dict[str, set[str]] = {}

    def factors(instrument):
        if instrument not in factor_cache:
            factor_cache[instrument] = {c.upper() for c in allowed_factor_codes(db, instrument)}
        return factor_cache[instrument]

    for pid, value in sorted(texts.items()):
        entry = _entry_for(pid)
        if entry is None:
            continue
        kind, _, key = pid.partition(":")
        factory = factory_text(entry)
        text = value or ""
        # Prompts that never arrive: empty text.
        if not text.strip():
            if kind == "guided_step":
                findings.append(_finding("step_without_prompt", MEDIUM, [pid]))
            elif not entry.empty_fallback and factory:
                findings.append(_finding("empty_prompt", MEDIUM, [pid]))
            continue
        # Stored text different from the factory.
        customised = False
        if factory is not None and text != factory:
            scope = "config" if kind == "config" else "guided_step"
            if prompt_revisions.is_admin_owned(db, scope, key):
                customised = True
            elif factory_owned(db, scope, key, text, cached=True):
                findings.append(_finding("factory_update_pending", LOW, [pid]))
            else:
                customised = True
                findings.append(_finding("unmarked_difference", MEDIUM, [pid]))
        if customised:
            missing = [r for r in entry.rules if r.evidence not in text]
            if missing:
                findings.append(_finding("rules_unverified", LOW, [pid], sentences=[
                    {"prompt": pid, "text": r.evidence, "field": r.field} for r in missing]))
        # Placeholders the consumer does not resolve.
        written = {}
        for match in _PLACEHOLDER_RE.finditer(text):
            written.setdefault(match.group(1) or match.group(2), match.group(0))
        unknown = sorted(set(written) - set(entry.placeholders) - {"counselor_name"})
        if unknown:
            findings.append(_finding("unknown_placeholder", MEDIUM, [pid], params={"names": unknown},
                                     sentences=[{"prompt": pid, "text": written[name]} for name in unknown]))
        # References unknown to the code.
        instrument = _meta_instrument(key, instruments) if key.startswith("prompt_meta_") else owner.get(pid)
        if instrument and factors(instrument):
            allowed = factors(instrument)
            bad = sorted({c for c in _FACTOR_RE.findall(text) if c.upper() not in allowed} - entry.known_refs)
            if bad:
                findings.append(_finding("unknown_factor", MEDIUM, [pid], params={"codes": bad, "instrument": instrument},
                                         sentences=[{"prompt": pid, "text": code} for code in bad]))
        bad_steps = sorted({s for s in _STEP_REF_RE.findall(text) if s not in known_steps})
        if bad_steps:
            findings.append(_finding("unknown_step", LOW, [pid], params={"steps": bad_steps},
                                     sentences=[{"prompt": pid, "text": step} for step in bad_steps]))
        if instrument and kind == "guided_step":
            path_steps = [s for s in steps if s.questionnaire_type == instrument
                          and not s.id.endswith("-intro") and s.system_prompt_mode != "strategies"]
            for match in _STEP_COUNT_RE.finditer(text):
                if _number(match.group(1)) != len(path_steps):
                    findings.append(_finding("number_mismatch", LOW, [pid], sentences=[{"prompt": pid, "text": match.group(0)}],
                                             params={"stated": _number(match.group(1)), "actual": len(path_steps)}))
            for match in _AREA_RE.finditer(text):
                areas = sum(1 for s in steps if s.questionnaire_type == instrument and _AREA_RE.search(s.prompt or ""))
                if int(match.group(2)) != areas:
                    findings.append(_finding("number_mismatch", LOW, [pid], sentences=[{"prompt": pid, "text": match.group(0)}],
                                             params={"stated": int(match.group(2)), "actual": areas}))
    return findings


# --- Rule conflicts in assembled turns ------------------------------------------------

def _detected_rules(text: str) -> tuple[Rule, ...]:
    """Question budgets stated with an explicit number (customised texts only)."""
    rules = []
    for match in _QUESTION_BUDGET_RE.finditer(text):
        n = _number(match.group(2))
        lo = 0 if match.group(1).lower() == "at most" else n
        rules.append(Rule("questions", (lo, n), match.group(0)))
    return tuple(rules)


def _probe(text: str) -> str | None:
    """Opening of a text, before any placeholder: proves the piece is in a request."""
    first = (text or "").strip().split("\n", 1)[0].split("{", 1)[0].strip()[:60]
    return first if len(first) >= 15 else None


def _rules_by_piece(texts: dict[str, str]) -> list[tuple[str, str | None, Rule]]:
    """(prompt id, presence probe, rule) for every registered and detected rule."""
    pieces = []
    for entry in REGISTRY.values():
        if not entry.rules:
            continue
        if entry.kind == "code":
            probe = entry.marker
        else:
            probe = _probe(texts.get(entry.id) or factory_text(entry) or "")
        pieces.extend((entry.id, probe, rule) for rule in entry.rules)
    for pid, text in texts.items():
        entry = _entry_for(pid)
        if entry is None or not text:
            continue
        if text != (factory_text(entry) or ""):
            pieces.extend((pid, _probe(text), rule) for rule in _detected_rules(text))
    return pieces


def _active(pid: str, probe: str | None, rule: Rule, envelope: str, phase: str | None) -> bool:
    if rule.evidence not in envelope:
        return False
    if pid.startswith("guided_step:"):
        return pid == f"guided_step:{phase}"  # step instructions reach only their own step
    return probe is None or probe in envelope


_STRATEGY_CONFLICTS = {
    frozenset({"none", "proactive"}): HIGH,
    frozenset({"none", "certified_or_approved"}): MEDIUM,
    frozenset({"certified", "certified_or_approved"}): MEDIUM,
}


def _conflict_severity(a: Rule, b: Rule) -> str | None:
    if a.field != b.field or a.value == b.value:
        return None
    if a.field == "questions":
        (alo, ahi), (blo, bhi) = a.value, b.value
        return MEDIUM if ahi < blo or bhi < alo else None
    if a.field == "format":
        return MEDIUM if {a.value, b.value} == {"prose", "list"} else None
    if a.field == "language":
        return HIGH
    if a.field == "strategies":
        return _STRATEGY_CONFLICTS.get(frozenset({a.value, b.value}))
    if a.field == "step_marker":
        return HIGH
    return None


def _turns(db: Session, instrument_filter: str | None = None, step_filter: str | None = None):
    """(surface label, request payload) for every guided path x step x mode.

    The filters restrict the turns to one instrument or one step (check on save).
    """
    for surface, payload in _all_turns(db):
        if step_filter is not None and payload.get("phase") != step_filter:
            continue
        if instrument_filter is not None and payload.get("questionnaire_type") != instrument_filter:
            continue
        yield surface, payload


def _all_turns(db: Session):
    from .chat_logic import guided_step_follow_up_mode
    from .prompt_map import INSTRUMENT_ORDER
    from .qsa_essential import _ESSENTIAL_PATHS

    steps_by = defaultdict(list)
    for step in db.query(models.GuidedStep).order_by(models.GuidedStep.sort_order, models.GuidedStep.id).all():
        steps_by[step.questionnaire_type].append(step)
    ordered = [i for i in INSTRUMENT_ORDER if i in steps_by] + sorted(i for i in steps_by if i not in INSTRUMENT_ORDER)
    for instrument in ordered:
        for step in steps_by[instrument]:
            base = {"questionnaire_type": instrument, "phase": step.id}
            yield f"{instrument} · {step.id} · entry", {**base, "mode": step.system_prompt_mode, "use_phase_prompt": True}
            follow = guided_step_follow_up_mode(step)
            yield f"{instrument} · {step.id} · follow_up", {**base, "mode": follow, "message": FOLLOW_UP_MESSAGE}
            yield f"{instrument} · {step.id} · advice", {**base, "mode": follow, "message": ADVICE_MESSAGE}
        mode = "qsar-generic" if instrument == "QSAr" else "generic"
        yield f"{instrument} · questions · follow_up", {"questionnaire_type": instrument, "phase": "questions",
                                                        "mode": mode, "message": FOLLOW_UP_MESSAGE}
    for instrument, phases in _ESSENTIAL_PATHS.items():
        instrument = next((i for i in steps_by if i.upper() == instrument), instrument)
        for phase in phases:
            yield f"{instrument} · essential · {phase}", {"questionnaire_type": instrument, "phase": phase,
                                                          "mode": "generic", "guided_path": "essential",
                                                          "message": FOLLOW_UP_MESSAGE}
    yield "free chat", {"questionnaire_type": "QSA", "mode": "free", "message": FOLLOW_UP_MESSAGE}


def assembled_request(db: Session, payload: dict) -> str:
    """Envelope text of one turn, built by the admin request preview (no model, no retrieval)."""
    from . import schemas
    from .prompt_audit import build_prompt_audit
    request = schemas.PromptAuditRequest(language="it", include_knowledge=False, include_history=False, **payload)
    result = build_prompt_audit(db, request)
    envelope = result["envelope"]
    return envelope["system_prompt_final"] + "\n\n" + envelope["full_message"]


def _conflict_findings(db: Session, texts: dict[str, str], turns=None) -> list[dict]:
    pieces = _rules_by_piece(texts)
    conflicts: dict[tuple, dict] = {}
    failures = []
    for surface, payload in (_turns(db) if turns is None else turns):
        try:
            with db.begin_nested():  # a failed turn rolls back only itself (drafts stay applied)
                text = assembled_request(db, payload)
        except Exception as exc:  # the check must never break: report and go on
            failures.append((surface, type(exc).__name__))
            continue
        phase = payload.get("phase")
        active = [(pid, rule) for pid, probe, rule in pieces if _active(pid, probe, rule, text, phase)]
        for i, (pa, ra) in enumerate(active):
            for pb, rb in active[i + 1:]:
                if pa == pb:
                    continue
                severity = _conflict_severity(ra, rb)
                if severity is None:
                    continue
                (p1, r1), (p2, r2) = sorted(((pa, ra), (pb, rb)), key=lambda x: (x[0], x[1].evidence))
                key = (r1.field, p1, r1.evidence, p2, r2.evidence)
                if key not in conflicts:
                    conflicts[key] = _finding(
                        "rule_conflict", severity, [p1, p2],
                        sentences=[{"prompt": p1, "text": r1.evidence, "value": _jsonable(r1.value)},
                                   {"prompt": p2, "text": r2.evidence, "value": _jsonable(r2.value)}],
                        params={"field": r1.field},
                    )
                if surface not in conflicts[key]["surfaces"]:
                    conflicts[key]["surfaces"].append(surface)
    out = list(conflicts.values())
    for surface, error in failures:
        out.append(_finding("assembly_failed", LOW, [], surfaces=[surface], params={"error": error}))
    return out


def _jsonable(value):
    return list(value) if isinstance(value, tuple) else value


# --- Runs -------------------------------------------------------------------------

def compute_findings(db: Session, texts: dict[str, str] | None = None) -> list[dict]:
    texts = active_texts(db) if texts is None else texts
    findings = _registration_findings(texts) + _text_findings(db, texts) + _conflict_findings(db, texts)
    unique = {f["id"]: f for f in findings}
    return annotate(sorted(unique.values(), key=_sort_key), texts)


def _sort_key(finding: dict):
    return SEVERITY_RANK[finding["severity"]], finding["code"], finding["prompts"]


def _counts(findings: list[dict]) -> dict:
    counts = {HIGH: 0, MEDIUM: 0, LOW: 0}
    for finding in findings:
        counts[finding["severity"]] += 1
    return {**counts, "total": len(findings)}


# --- Positions (#761) -------------------------------------------------------------

def locate(text: str, needle: str) -> tuple[int, int] | None:
    """First position of `needle` in `text`: as a whole token, then anywhere, then ignoring case."""
    if not needle or not text:
        return None
    match = re.search(r"(?<!\w)" + re.escape(needle) + r"(?!\w)", text)
    if match:
        return match.start(), match.end()
    start = text.find(needle)
    if start < 0:
        start = text.lower().find(needle.lower())
    return (start, start + len(needle)) if start >= 0 else None


def annotate(findings: list[dict], texts: dict[str, str]) -> list[dict]:
    """Add the exact position of each sentence in the text it was read from, and
    which prompts of the finding can be edited (`editable`) or still carry the
    factory text (`factory`, the ones to fix in the code). Not part of the id."""
    for finding in findings:
        for sentence in finding["sentences"]:
            found = locate(texts.get(sentence["prompt"], ""), sentence["text"])
            sentence["start"], sentence["end"] = found if found else (None, None)
        finding["editable"] = [pid for pid in finding["prompts"] if pid in texts]
        finding["factory"] = [
            pid for pid in finding["prompts"]
            if pid.startswith("code:") or (pid in texts and (entry := _entry_for(pid)) is not None
                                           and texts[pid] == (factory_text(entry) or ""))
        ]
    return findings


# --- Marked as intended (#761) ------------------------------------------------------

def acks(db: Session) -> dict[str, dict]:
    return {
        row.finding_id: {"note": row.note or "", "author": row.author,
                         "created_at": row.created_at.isoformat() if row.created_at else None}
        for row in db.query(models.PromptHealthAck).all()
    }


def set_ack(db: Session, finding_id: str, note: str, author: str | None) -> None:
    row = db.get(models.PromptHealthAck, finding_id)
    if row is None:
        db.add(models.PromptHealthAck(finding_id=finding_id, note=note, author=author))
    else:
        row.note, row.author = note, author
    db.commit()


def clear_ack(db: Session, finding_id: str) -> None:
    db.query(models.PromptHealthAck).filter(models.PromptHealthAck.finding_id == finding_id).delete()
    db.commit()


def with_acks(findings: list[dict], marked: dict[str, dict]) -> list[dict]:
    return [{**finding, "ack": marked.get(finding["id"])} for finding in findings]


def serialize(run: models.PromptHealthRun | None, *, current_hash: str | None = None,
              marked: dict[str, dict] | None = None) -> dict | None:
    """Run as JSON. Findings marked as intended keep their note and leave the counter."""
    if run is None:
        return None
    marked = marked or {}
    findings = with_acks(run.findings or [], marked)
    counts = _counts([f for f in findings if not f["ack"]])
    counts["acknowledged"] = len(findings) - counts["total"]
    return {
        "id": run.id, "texts_hash": run.texts_hash, "trigger": run.trigger,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "counts": counts, "findings": findings,
        "current": current_hash is None or current_hash == run.texts_hash,
    }


def latest_run(db: Session) -> models.PromptHealthRun | None:
    return (db.query(models.PromptHealthRun)
            .filter(models.PromptHealthRun.check_version == CHECK_VERSION)
            .order_by(models.PromptHealthRun.id.desc()).first())


def run_check(db: Session, *, trigger: str = "manual", force: bool = False) -> tuple[models.PromptHealthRun, models.PromptHealthRun | None]:
    """Run the check, or reuse the stored run with the same hash. Returns (current, previous)."""
    texts = active_texts(db)
    current_hash = texts_hash(db, texts)
    previous = latest_run(db)
    if previous is not None and previous.texts_hash == current_hash and not force:
        return previous, previous
    findings = compute_findings(db, texts)
    run = models.PromptHealthRun(texts_hash=current_hash, check_version=CHECK_VERSION, trigger=trigger,
                                 findings=findings, counts=_counts(findings))
    db.add(run)
    db.flush()
    stale = (db.query(models.PromptHealthRun.id).order_by(models.PromptHealthRun.id.desc())
             .offset(KEEP_RUNS).all())
    if stale:
        db.query(models.PromptHealthRun).filter(models.PromptHealthRun.id.in_([r.id for r in stale])).delete(
            synchronize_session=False)
    db.commit()
    db.refresh(run)
    return run, previous


def new_findings(current: models.PromptHealthRun, previous: models.PromptHealthRun | None,
                 prompt_id: str | None = None) -> list[dict]:
    """Findings of `current` absent from `previous`, optionally only those that involve one prompt."""
    before = {f["id"] for f in (previous.findings or [])} if previous is not None and previous.id != current.id else set()
    fresh = [f for f in current.findings or [] if f["id"] not in before]
    if prompt_id:
        fresh = [f for f in fresh if prompt_id in f["prompts"]]
    return fresh


def check_prompt(db: Session, prompt_id: str) -> list[dict]:
    """Findings that involve one prompt and are not in the latest stored run (shown on save).

    Rebuilds only the turns that can receive the prompt: its own step, or the
    instrument that owns it; a shared prompt rebuilds every turn.
    """
    texts = active_texts(db)
    findings = _findings_for(db, texts, [prompt_id], _turns_for(db, [prompt_id]))
    previous = latest_run(db)
    known = {f["id"] for f in (previous.findings or [])} if previous is not None else set()
    return [f for f in findings if f["id"] not in known]


def _turns_for(db: Session, prompt_ids) -> list | None:
    """Turns that can receive any of the prompts: their own step or owning instrument.

    None (every turn) when one of them is shared by several instruments.
    """
    turns: dict[str, dict] = {}
    owners = None
    for prompt_id in prompt_ids:
        kind, _, key = prompt_id.partition(":")
        if kind == "guided_step":
            turns.update(_turns(db, step_filter=key))
            continue
        if owners is None:
            owners = _instrument_of(db)
        owner = owners.get(prompt_id)
        if owner is None and key.startswith("prompt_meta_"):
            owner = _meta_instrument(key, {s.questionnaire_type for s in db.query(models.GuidedStep).all()})
        if owner is None:
            return None
        turns.update(_turns(db, instrument_filter=owner))
    return list(turns.items())


def _findings_for(db: Session, texts: dict[str, str], prompt_ids, turns) -> list[dict]:
    """Findings that involve any of the prompts, computed on `texts` for `turns` only."""
    findings = _registration_findings(texts) + _text_findings(db, texts) + _conflict_findings(db, texts, turns)
    wanted = set(prompt_ids)
    unique = {f["id"]: f for f in findings if wanted & set(f["prompts"])}
    return annotate(sorted(unique.values(), key=_sort_key), texts)


# --- Compare screen (#761) ------------------------------------------------------------

def _scope_key(prompt_id: str) -> tuple[str, str]:
    kind, _, key = prompt_id.partition(":")
    if kind not in ("config", "guided_step") or not key:
        raise ValueError("not an editable prompt")
    return kind, key


def _live_row(db: Session, prompt_id: str):
    kind, key = _scope_key(prompt_id)
    if kind == "config":
        if not is_prompt_config_key(key):
            raise ValueError("not a prompt key")
        return db.query(models.Config).filter(models.Config.key == key).first(), "value"
    return db.query(models.GuidedStep).filter(models.GuidedStep.id == key).first(), "prompt"


@contextmanager
def _sandbox(db: Session):
    """A session whose writes are always rolled back: drafts are evaluated, never saved."""
    connection = db.get_bind().connect()
    outer = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint", autoflush=False)
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        connection.close()


def evaluate(db: Session, *, drafts: dict[str, str] | None = None, prompt_ids=(), surface: str | None = None) -> dict:
    """Findings of unsaved drafts (or of saved prompts, «Ricontrolla»), with positions in the draft.

    The drafts are written in a transaction that is rolled back, as if the
    admin saved them, then only the affected turns are rebuilt: the selected
    `surface` (path · step · mode) or the turns that receive the prompts.
    With a surface, `assembled` is that turn's request as the model would get it.
    """
    drafts = drafts or {}
    wanted = list(dict.fromkeys([*prompt_ids, *drafts]))
    with _sandbox(db) as session:
        for prompt_id, text in drafts.items():
            row, field = _live_row(session, prompt_id)
            if row is None:
                raise LookupError(prompt_id)
            setattr(row, field, text)
            kind, key = _scope_key(prompt_id)
            prompt_revisions.record(session, kind, key, text, prompt_revisions.ORIGIN_ADMIN, author="draft")
        session.flush()
        texts = active_texts(session)
        if surface:
            turns = [(label, payload) for label, payload in _all_turns(session) if label == surface]
            if not turns:
                raise LookupError(surface)
        else:
            turns = _turns_for(session, wanted)
        findings = _findings_for(session, texts, wanted, turns)
        assembled = None
        if surface:
            try:
                assembled = assembled_request(session, turns[0][1])
            except Exception as exc:  # shown as a finding already
                logger.info("Prompt health: turn %s not assembled: %s", surface, exc)
    return {"findings": with_acks(findings, acks(db)), "assembled": assembled,
            "prompt_ids": wanted, "surface": surface}


def save_prompt(db: Session, prompt_id: str, text: str, author: str | None) -> None:
    """Save one prompt as the admin's text. Never blocked by findings."""
    row, field = _live_row(db, prompt_id)
    if row is None:
        raise LookupError(prompt_id)
    setattr(row, field, text)
    kind, key = _scope_key(prompt_id)
    prompt_revisions.record(db, kind, key, text, prompt_revisions.ORIGIN_ADMIN, author=author)
    db.commit()


def restore_factory(db: Session, prompt_id: str, author: str | None) -> str:
    """Put the factory text back. The prompt becomes factory-owned again: later
    factory updates reach it through the alignment."""
    entry = _entry_for(prompt_id)
    factory = factory_text(entry) if entry is not None else None
    if factory is None:
        raise LookupError(prompt_id)
    row, field = _live_row(db, prompt_id)
    if row is None:
        raise LookupError(prompt_id)
    setattr(row, field, factory)
    kind, key = _scope_key(prompt_id)
    last = prompt_revisions.latest(db, kind, key)
    if last is None or last.value != factory or last.origin == prompt_revisions.ORIGIN_ADMIN:
        db.add(models.PromptRevision(scope=kind, target_key=key, value=factory, author=author,
                                     origin=prompt_revisions.ORIGIN_MIGRATION, note="ripristino testo di fabbrica"))
    db.commit()
    return factory


def _surface_prompt_ids(step, owners_keys) -> list[str]:
    from .chat_logic import (
        _system_prompt_key,
        guided_step_follow_up_mode,
        guided_step_system_prompt_key,
    )
    ids = [f"guided_step:{step.id}", f"config:{guided_step_system_prompt_key(step)}",
           f"config:{_system_prompt_key(guided_step_follow_up_mode(step), step.id, step)}"]
    for key in (f"prompt_meta_{step.questionnaire_type.upper()}", f"prompt_meta_{step.questionnaire_type.upper()}_{step.id}"):
        if key in owners_keys:
            ids.append(f"config:{key}")
    return list(dict.fromkeys(ids))


def turn_map(db: Session) -> list[dict]:
    """Paths x steps: the prompts that compose each step and its turns (path · step · mode)."""
    from .prompt_map import INSTRUMENT_ORDER
    config_keys = {key for (key,) in db.query(models.Config.key).all()}
    by_instrument: dict[str, list[dict]] = defaultdict(list)
    for step in db.query(models.GuidedStep).order_by(models.GuidedStep.sort_order, models.GuidedStep.id).all():
        by_instrument[step.questionnaire_type].append({
            "id": step.id, "label": step.label or step.id,
            "prompts": _surface_prompt_ids(step, config_keys),
            "surfaces": [f"{step.questionnaire_type} · {step.id} · {mode}" for mode in ("entry", "follow_up", "advice")],
        })
    ordered = [i for i in INSTRUMENT_ORDER if i in by_instrument] + sorted(i for i in by_instrument if i not in INSTRUMENT_ORDER)
    return [{"instrument": instrument, "steps": by_instrument[instrument]} for instrument in ordered]


def prompt_card(db: Session, prompt_id: str) -> dict:
    """One prompt: text, factory text, where it arrives and its findings in the latest run."""
    entry = _entry_for(prompt_id) if ":" in prompt_id else None
    kind, _, key = prompt_id.partition(":")
    if entry is None and kind not in ("config", "guided_step"):
        raise LookupError(prompt_id)
    text = None
    if kind in ("config", "guided_step"):
        row, field = _live_row(db, prompt_id)
        if row is None:
            raise LookupError(prompt_id)
        text = getattr(row, field) or ""
    factory = factory_text(entry) if entry is not None else None
    run = latest_run(db)
    findings = [f for f in (run.findings if run else []) if prompt_id in f["prompts"]]
    turns = _turns_for(db, [prompt_id]) if kind in ("config", "guided_step") else None
    return {
        "id": prompt_id, "kind": kind, "text": text, "factory": factory, "editable": text is not None,
        "differs_from_factory": factory is not None and text is not None and text != factory,
        "customised": text is not None and prompt_revisions.is_admin_owned(db, kind, key),
        "consumer": entry.consumer if entry else None, "app_surfaces": list(entry.surfaces) if entry else [],
        # Turns that can receive it; None when it is shared by every path.
        "surfaces": None if turns is None else [label for label, _ in turns],
        "findings": with_acks(findings, acks(db)),
    }


def run_at_startup() -> None:
    from .database import SessionLocal
    db = SessionLocal()
    try:
        run, previous = run_check(db, trigger="startup")
        if previous is None or run.id != previous.id:
            logger.info("Prompt health: %s findings (%s)", run.counts.get("total"), run.counts)
    except Exception as exc:  # never block startup
        db.rollback()
        logger.warning("Prompt health check failed at startup: %s", exc)
    finally:
        db.close()
