"""Mappa dei prompt delle chat guidate, dal comune al particolare (admin).

Quattro livelli: comune a tutte le chat guidate, gruppi (testi condivisi da più
strumenti), strumento, step. Ogni testo compare una sola volta, al livello a cui
appartiene; gli step lo ricevono come riferimento (`refs`). Il livello si
calcola dai dati, contando strumenti e step che usano la chiave, con le stesse
funzioni della chat (`chat_logic`, `routes.chat.guided_phase_text_keys`), non
con liste cablate.

Sola lettura: nessuna scrittura su `configs`, `guided_steps` o revisioni. Ogni
voce indica l'endpoint esistente che la salva.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from . import models
from .chat_logic import (
    _instrument_meta_system_prompt,
    guided_step_follow_up_mode,
    guided_step_system_prompt_key,
    _system_prompt_key,
    get_prompt_component_flags,
    prompt_component_config_key,
    prompt_meta_config_key,
)
from .chat_preparation import IDEA_VARIANT_KEYS
from .counselor_scope import restricted_instruments, suits
from .guided_step_questions_seed import FIXED_QUESTIONS_STEP_ID
from .guided_text_i18n import SECONDARY_LANGS
from .idea_map import IDEA_INSTRUMENT
from .prompt_config import ALL_CONFIG_TEXT_DEFINITIONS, GLOBAL_DIRECTIVE_DEFINITIONS
from .routes.chat import guided_phase_text_keys

LEVEL_COMMON = "common"
LEVEL_GROUP = "group"
LEVEL_INSTRUMENT = "instrument"
LEVEL_STEP = "step"
_LEVEL_RANK = {LEVEL_STEP: 0, LEVEL_INSTRUMENT: 1, LEVEL_GROUP: 2, LEVEL_COMMON: 3}

DEST_MODEL = "model"
DEST_STUDENT = "student"
DEST_ADMIN = "admin"
DEST_CONTEXT = "context_filter"

WHEN_ENTRY = "entry"
WHEN_EVERY_TURN = "every_turn"
WHEN_FOLLOW_UP = "follow_up"
WHEN_STUDENT = "student"
WHEN_ADMIN = "admin"

# Stesso ordine dell'esportazione dei prompt (routes/admin.py).
INSTRUMENT_ORDER = [
    "QSA", "QSAr", "ZTPI", "SAVICKAS", "EVENTO_STUDIO", "EVENTO_PROFESSIONALE",
    "OBIETTIVO_STUDIO", "OBIETTIVO_DOCENZA", "QPCS", "QPCC", "QAP", "IDEA",
]
QUESTIONS_PHASE = "questions"
CONCLUSION_PHASE = "conclusion"

_CONFIG_EDITOR = {"method": "POST", "path": "/admin/config"}
_DEFAULTS = {item["key"]: item.get("default", "") for item in ALL_CONFIG_TEXT_DEFINITIONS}
_DEFINITION_LABELS = {item["key"]: item.get("label", "") for item in ALL_CONFIG_TEXT_DEFINITIONS}
_DESCRIPTIONS = {item["key"]: item.get("description", "") for item in ALL_CONFIG_TEXT_DEFINITIONS}
_PHASE_TEXT_ROLE = {
    "label_guided_questions": ("phase_label", QUESTIONS_PHASE),
    "text_guided_questions_phase_banner": ("phase_banner", QUESTIONS_PHASE),
    "text_guided_questions_intro": ("phase_text", QUESTIONS_PHASE),
    "label_guided_conclusion": ("phase_label", CONCLUSION_PHASE),
    "text_guided_conclusion": ("phase_text", CONCLUSION_PHASE),
}


@dataclass(frozen=True)
class _Use:
    key: str
    role: str
    destination: str
    when: str
    instrument: str
    step_id: str | None
    # Livello minimo: i testi propri dello strumento (meta, follow-up, testi di
    # fase) restano almeno al livello 3 anche se oggi li usa un solo step.
    min_level: str = LEVEL_STEP


def _guidance_key(instrument: str, step_id: str) -> str:
    """Note dell'admin sulla fase (ConfigForm): stessa forma della chiave dei componenti."""
    return "prompt_guidance_" + prompt_component_config_key(instrument, step_id).removeprefix("prompt_components_")


def ordered_instruments(db) -> list[dict]:
    """Strumenti con almeno uno step guidato, nell'ordine dell'admin."""
    counts: dict[str, int] = defaultdict(int)
    for (questionnaire_type,) in db.query(models.GuidedStep.questionnaire_type).all():
        counts[questionnaire_type] += 1
    ordered = [i for i in INSTRUMENT_ORDER if i in counts]
    ordered += sorted(i for i in counts if i not in INSTRUMENT_ORDER)
    return [{"id": i, "step_count": counts[i]} for i in ordered]


def _steps_by_instrument(db) -> dict[str, list]:
    rows = db.query(models.GuidedStep).order_by(models.GuidedStep.sort_order, models.GuidedStep.id).all()
    out: dict[str, list] = defaultdict(list)
    for row in rows:
        out[row.questionnaire_type].append(row)
    return out


def _instrument_uses(db, instrument: str, steps: list) -> list[_Use]:
    """Chiavi di config che la chat legge per lo strumento, con ruolo e momento."""
    uses: list[_Use] = []
    for definition in GLOBAL_DIRECTIVE_DEFINITIONS:
        uses.append(_Use(definition["key"], "directive", DEST_MODEL, WHEN_EVERY_TURN, instrument, None))
    uses.append(_Use(prompt_meta_config_key(instrument), "meta", DEST_MODEL, WHEN_EVERY_TURN,
                     instrument, None, LEVEL_INSTRUMENT))
    if instrument == IDEA_INSTRUMENT:
        for key in IDEA_VARIANT_KEYS.values():
            uses.append(_Use(key, "variant", DEST_MODEL, WHEN_EVERY_TURN, instrument, None, LEVEL_INSTRUMENT))
    for field, key in guided_phase_text_keys(instrument).items():
        if key:
            role, phase = _PHASE_TEXT_ROLE[field]
            uses.append(_Use(key, role, DEST_STUDENT, WHEN_STUDENT, instrument, phase, LEVEL_INSTRUMENT))
    uses.append(_Use(_system_prompt_key("generic", QUESTIONS_PHASE), "system_prompt", DEST_MODEL,
                     WHEN_EVERY_TURN, instrument, QUESTIONS_PHASE))
    instrument_meta = _instrument_meta_system_prompt(db, instrument)
    for step in steps:
        entry_key = guided_step_system_prompt_key(step)
        follow_up_key = _system_prompt_key(guided_step_follow_up_mode(step), step.id, step)
        if follow_up_key == entry_key:
            uses.append(_Use(entry_key, "system_prompt", DEST_MODEL, WHEN_EVERY_TURN, instrument, step.id))
        else:
            uses.append(_Use(entry_key, "system_prompt", DEST_MODEL, WHEN_ENTRY, instrument, step.id))
            uses.append(_Use(follow_up_key, "follow_up_prompt", DEST_MODEL, WHEN_FOLLOW_UP,
                             instrument, step.id, LEVEL_INSTRUMENT))
        step_meta = _instrument_meta_system_prompt(db, instrument, step.id)
        if step_meta and step_meta != instrument_meta:
            uses.append(_Use(prompt_meta_config_key(instrument, step.id), "meta_step", DEST_MODEL,
                             WHEN_EVERY_TURN, instrument, step.id))
        uses.append(_Use(prompt_component_config_key(instrument, step.id), "components", DEST_CONTEXT,
                         WHEN_EVERY_TURN, instrument, step.id))
        uses.append(_Use(_guidance_key(instrument, step.id), "guidance", DEST_ADMIN, WHEN_ADMIN,
                         instrument, step.id))
    return uses


def _level(uses: list[_Use], all_instruments: set[str]) -> str:
    instruments = {u.instrument for u in uses}
    steps = {(u.instrument, u.step_id) for u in uses if u.step_id}
    if len(all_instruments) > 1 and instruments >= all_instruments:
        level = LEVEL_COMMON
    elif len(instruments) > 1:
        level = LEVEL_GROUP
    elif len(steps) > 1 or any(u.step_id is None for u in uses):
        level = LEVEL_INSTRUMENT
    else:
        level = LEVEL_STEP
    floor = max((u.min_level for u in uses), key=_LEVEL_RANK.__getitem__)
    return max(level, floor, key=_LEVEL_RANK.__getitem__)


def _config_entry(key: str, uses: list[_Use], level: str, configs: dict, step_labels: dict) -> dict:
    first = uses[0]
    row = configs.get(key)
    when = {u.when for u in uses}
    entry = {
        "key": key,
        "kind": "config",
        "role": first.role,
        "level": level,
        "destination": first.destination,
        "when": first.when if len(when) == 1 else WHEN_EVERY_TURN,
        "label": _DEFINITION_LABELS.get(key, ""),
        # Descrizione della riga: il salvataggio (POST /admin/config) la riscrive.
        "description": row.description if row is not None and row.description else _DESCRIPTIONS.get(key, ""),
        "value": row.value if row is not None and row.value is not None else _DEFAULTS.get(key, ""),
        "stored": row is not None,
        "default": _DEFAULTS.get(key),
        "used_by": _used_by(uses, step_labels),
        "editor": dict(_CONFIG_EDITOR),
        "read_only": False,
    }
    entry["shared"] = len(entry["used_by"]["instruments"]) > 1 or len(entry["used_by"]["steps"]) > 1
    if first.destination == DEST_STUDENT:
        entry["translations"] = {
            lang: configs[f"{key}__{lang}"].value or ""
            for lang in SECONDARY_LANGS if f"{key}__{lang}" in configs
        }
    return entry


def _used_by(uses: list[_Use], step_labels: dict) -> dict:
    instruments = [i for i in INSTRUMENT_ORDER if any(u.instrument == i for u in uses)]
    instruments += sorted({u.instrument for u in uses} - set(instruments))
    seen = set()
    steps = []
    for u in uses:
        if u.step_id and (u.instrument, u.step_id) not in seen:
            seen.add((u.instrument, u.step_id))
            label, label_i18n = step_labels.get((u.instrument, u.step_id), (u.step_id, {}))
            steps.append({
                "instrument": u.instrument,
                "step_id": u.step_id,
                "label": label,
                "label_i18n": label_i18n,
                "fixed": u.step_id in (QUESTIONS_PHASE, CONCLUSION_PHASE),
            })
    return {"instruments": instruments, "steps": steps}


def _step_field(step, field: str, destination: str, when: str, value) -> dict:
    entry = {
        "key": f"guided_step:{step.id}:{field}",
        "kind": "guided_step",
        "field": field,
        "role": "step_field",
        "level": LEVEL_STEP,
        "destination": destination,
        "when": when,
        "value": value,
        "stored": True,
        "shared": False,
        "used_by": {"instruments": [step.questionnaire_type], "steps": [
            {"instrument": step.questionnaire_type, "step_id": step.id, "label": step.label},
        ]},
        "editor": {"method": "PUT", "path": f"/admin/guided-steps/{step.id}", "field": field},
        "read_only": False,
    }
    if field == "label":
        entry["translations"] = dict(step.label_i18n or {})
    return entry


def _questions_entry(instrument: str, step_id: str, rows: list) -> dict:
    by_lang: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        by_lang[row.language].append(row.text)
    return {
        "key": f"guided_step_questions:{instrument}:{step_id}",
        "kind": "step_questions",
        "field": "suggested_questions",
        "role": "suggested_questions",
        "level": LEVEL_STEP,
        "destination": DEST_STUDENT,
        "when": WHEN_STUDENT,
        "value": dict(by_lang),
        "stored": bool(rows),
        "shared": False,
        "used_by": {"instruments": [instrument], "steps": [{"instrument": instrument, "step_id": step_id, "label": step_id}]},
        "editor": {"method": "PUT", "path": "/admin/guided-step-questions/{id}", "panel": "guided-step-questions"},
        "read_only": True,
    }


def _persona_entry(db, instrument: str) -> dict:
    restricted = restricted_instruments(db)
    rows = (
        db.query(models.Counselor)
        .filter(models.Counselor.owner_username.is_(None), models.Counselor.is_active.is_(True))
        .order_by(models.Counselor.sort_order.asc(), models.Counselor.id.asc())
        .all()
    )
    counselors = [
        {"id": r.id, "name": r.name, "persona": r.persona or ""}
        for r in rows if suits(r, instrument, restricted)
    ]
    return {
        "key": "counselor_persona",
        "kind": "counselor_persona",
        "role": "persona",
        "level": LEVEL_COMMON,
        "destination": DEST_MODEL,
        "when": WHEN_EVERY_TURN,
        "value": counselors,
        "stored": True,
        "shared": True,
        "used_by": {"instruments": [instrument], "steps": []},
        "editor": {"method": "PUT", "path": "/admin/counselors/{id}", "field": "persona", "panel": "counselors"},
        "read_only": True,
    }


def build_prompt_map(db, instrument: str) -> dict | None:
    """Mappa a quattro livelli per uno strumento; None se lo strumento non ha step."""
    steps_by_instrument = _steps_by_instrument(db)
    if instrument not in steps_by_instrument:
        return None
    all_instruments = set(steps_by_instrument)
    configs = {row.key: row for row in db.query(models.Config).all()}
    step_labels = {
        (s.questionnaire_type, s.id): (s.label, dict(s.label_i18n or {}))
        for steps in steps_by_instrument.values() for s in steps
    }
    for i in all_instruments:
        step_labels[(i, QUESTIONS_PHASE)] = (QUESTIONS_PHASE, {})
        step_labels[(i, CONCLUSION_PHASE)] = (CONCLUSION_PHASE, {})

    uses_by_key: dict[str, list[_Use]] = defaultdict(list)
    for i in sorted(all_instruments):
        for use in _instrument_uses(db, i, steps_by_instrument[i]):
            uses_by_key[use.key].append(use)

    common, instrument_level = [], []
    groups: dict[tuple, list] = defaultdict(list)
    step_entries: dict[str, list] = defaultdict(list)
    step_refs: dict[str, list] = defaultdict(list)
    level_of: dict[str, str] = {}
    for key, uses in uses_by_key.items():
        if not any(u.instrument == instrument for u in uses):
            continue
        level = _level(uses, all_instruments)
        level_of[key] = level
        entry = _config_entry(key, uses, level, configs, step_labels)
        if uses[0].role == "components":
            # Flag effettivi come li calcola la chat (default di codice + override salvato).
            entry["effective"] = get_prompt_component_flags(db, instrument, uses[0].step_id)
        if level == LEVEL_COMMON:
            common.append(entry)
        elif level == LEVEL_GROUP:
            groups[tuple(entry["used_by"]["instruments"])].append(entry)
        elif level == LEVEL_INSTRUMENT:
            instrument_level.append(entry)
        else:
            step_entries[uses[0].step_id].append(entry)
        if level != LEVEL_STEP:
            for use in uses:
                if use.instrument == instrument and use.step_id:
                    step_refs[use.step_id].append({"key": key, "level": level, "role": use.role, "when": use.when})

    meta_key = prompt_meta_config_key(instrument)
    questions = (
        db.query(models.GuidedStepQuestion)
        .filter(models.GuidedStepQuestion.questionnaire_type == instrument,
                models.GuidedStepQuestion.is_active.is_(True))
        .order_by(models.GuidedStepQuestion.step_id, models.GuidedStepQuestion.sort_order)
        .all()
    )
    questions_by_step: dict[str, list] = defaultdict(list)
    for row in questions:
        questions_by_step[row.step_id].append(row)

    steps_out = []
    for step in steps_by_instrument[instrument]:
        entries = [
            _step_field(step, "label", DEST_STUDENT, WHEN_STUDENT, step.label),
            _step_field(step, "color_theme", DEST_STUDENT, WHEN_STUDENT, step.color_theme),
            _step_field(step, "prompt", DEST_MODEL, WHEN_ENTRY, step.prompt),
            *step_entries.get(step.id, []),
            _questions_entry(instrument, step.id, questions_by_step.get(step.id, [])),
        ]
        refs = list(step_refs.get(step.id, []))
        if not any(e["role"] == "meta_step" for e in entries):
            refs.append({"key": meta_key, "level": level_of[meta_key], "role": "meta", "when": WHEN_EVERY_TURN,
                         # Chiave che sovrascrive il meta prompt solo per questo step.
                         "override_key": prompt_meta_config_key(instrument, step.id)})
        steps_out.append({
            "id": step.id,
            "label": step.label,
            "label_i18n": dict(step.label_i18n or {}),
            "color_theme": step.color_theme,
            "sort_order": step.sort_order,
            "system_prompt_mode": step.system_prompt_mode,
            "system_prompt_key": guided_step_system_prompt_key(step),
            "follow_up_mode": guided_step_follow_up_mode(step),
            "fixed": False,
            "entries": entries,
            "refs": refs,
        })
    for phase in (QUESTIONS_PHASE, CONCLUSION_PHASE):
        entries = list(step_entries.get(phase, []))
        if phase == QUESTIONS_PHASE:
            entries.append(_questions_entry(instrument, FIXED_QUESTIONS_STEP_ID, questions_by_step.get(FIXED_QUESTIONS_STEP_ID, [])))
        steps_out.append({
            "id": phase,
            "label": phase,
            "label_i18n": {},
            "color_theme": None,
            "sort_order": None,
            "system_prompt_mode": None,
            "system_prompt_key": _system_prompt_key("generic", phase) if phase == QUESTIONS_PHASE else None,
            "follow_up_mode": None,
            "fixed": True,
            "entries": entries,
            "refs": list(step_refs.get(phase, [])),
        })

    common.insert(0, _persona_entry(db, instrument))
    return {
        "instrument": instrument,
        "instruments": ordered_instruments(db),
        "levels": {
            "common": common,
            "groups": [{"instruments": list(k), "entries": v} for k, v in groups.items()],
            "instrument": instrument_level,
            "steps": steps_out,
        },
    }
