"""Seed append-only dei comportamenti specializzati della chat.

Le condizioni dichiarative decidono *quale comportamento* e' pertinente; gli
handler continuano a decidere se esistono dati o materiali utilizzabili.

Come per i prompt degli step, il seed non aggiorna mai una riga esistente.
"""
from __future__ import annotations

import json
import logging

from . import models

logger = logging.getLogger(__name__)

# Strumenti che ricevono il materiale certificato nella chat guidata.
SEEDED_INSTRUMENTS = ("QSA", "QSAr", "ZTPI", "QPCS", "QPCC", "QAP", "SAVICKAS")

CERTIFIED_ADVICE_INSTRUCTIONS_EN = """## Student advice contract

- Use only the certified strategies supplied in the context block.
- Connect the advice to the student's request and profile without diagnostic labels.
- Propose one concrete, bounded and verifiable action; a second strategy may appear only as support.
- Briefly explain why it is relevant and invite the student to verify its usefulness.
- Never show internal identifiers or present the advice as a prescription.
- If no relevant certified strategy is available, do not force advice.
"""

PROFILE_WAYFINDER_INSTRUCTIONS_EN = """## Reflective profile clarification

- Start from the uncertainty in the student's question and answer it directly.
- Keep questionnaire evidence, construct meaning and possible lived interpretation distinct.
- A score describes a response or self-perception; it does not define the person and is not a diagnosis.
- When useful, relate at most two or three factors and explain the relation; do not list the whole profile.
- State a limitation or alternative interpretation when the evidence is insufficient.
- End with one concrete reflective question that lets the student test the reading against experience.
- Do not turn clarification into unrequested advice, reading guidance or comparison.
"""

READING_GUIDE_INSTRUCTIONS_EN = """## Relevant reading guidance

- Suggest at most two identifiable readings or resources directly relevant to the question and profile.
- Use only titles, authors and sources actually present in [KNOWLEDGE]; never invent references, DOI values or links.
- Explain in one sentence what each reading can help the student understand.
- Distinguish an introductory source from a deeper one when both are available.
- If [KNOWLEDGE] has no identifiable source, say so and offer a topic to search for instead of an invented title.
- Do not replace a reading request with practical advice.
"""

PROFILE_COMPARISON_INSTRUCTIONS_EN = """## Reflective profile comparison

- Compare only results listed under [COMPARABLE_PROFILES].
- If fewer than two profiles are available, ask which second result to use and do not simulate a comparison.
- Separate similarities, differences and possible relations; do not infer causality.
- Compare compatible constructs and explain when two scales measure different aspects.
- Identify one convergence and one tension supported by the data, then ask one reflective question.
- Do not automatically turn the comparison into an action plan.
"""



SKILL_INSTRUCTIONS_I18N = {
    "certified-advice": {"en": CERTIFIED_ADVICE_INSTRUCTIONS_EN},
    "profile-wayfinder": {"en": PROFILE_WAYFINDER_INSTRUCTIONS_EN},
    "reading-guide": {"en": READING_GUIDE_INSTRUCTIONS_EN},
    "profile-comparison": {"en": PROFILE_COMPARISON_INSTRUCTIONS_EN},
}

CERTIFIED_ADVICE_POLICY_MARKER = "skills_certified_advice_policy_v1"
SPECIALIZED_SKILLS_POLICY_MARKER = "skills_specialized_behaviors_v1"
READING_AND_TRANSLATIONS_POLICY_MARKER = "skills_reading_sources_and_i18n_v1"
ENGLISH_SKILL_INSTRUCTIONS_POLICY_MARKER = "skills_english_instructions_v1"

SKILL_CONFIG_DEFAULTS = (
    (
        "skills_engine_enabled",
        "true",
        "Motore di skill attivo (true/false). Spento: la chat usa il percorso strategie storico.",
    ),
    (
        "skills_engine_instruments",
        json.dumps(list(SEEDED_INSTRUMENTS)),
        "Lista JSON degli strumenti su cui il motore di skill e' attivo.",
    ),
    ("skills_router_threshold", "3", "Numero di skill opzionali candidate oltre il quale interviene il router LLM."),
    ("skills_router_model", "", "Modello usato dal router delle skill; vuoto = modello attivo."),
    ("skills_router_timeout_s", "6", "Timeout in secondi della chiamata di routing delle skill."),
    ("skills_total_max_chars", "3000", "Tetto complessivo in caratteri dei blocchi prodotti dalle skill."),
)

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
        "is_active": False,
        "bind": False,
    },
    {
        "slug": "certified-advice",
        "name": "Strategie certificate (catalogo)",
        "description": (
            "Strategie di apprendimento certificate dall'admin, collegate ai fattori "
            "del profilo: da usare quando lo studente lavora su un'area di crescita."
        ),
        "instructions_i18n": SKILL_INSTRUCTIONS_I18N["certified-advice"],
        "conditions": {"intents": ["advice", "guided"]},
        "handler": "certified_strategies",
        "handler_params": {"limit": 2},
        "routing": "primary",
        "slot": "directive_tail",
        "max_chars": 2800,
        "sort_order": 50,
        "is_active": True,
        "bind": True,
    },
    {
        "slug": "profile-wayfinder",
        "name": "Chiarificazione riflessiva del profilo",
        "description": "Chiarisce significato, confini e relazioni dei risultati quando lo studente esprime dubbio o confusione.",
        "instructions_i18n": SKILL_INSTRUCTIONS_I18N["profile-wayfinder"],
        "conditions": {"intents": ["clarify"]},
        "handler": None,
        "handler_params": {},
        "routing": "primary",
        "slot": "directive_tail",
        "max_chars": 1600,
        "sort_order": 10,
        "is_active": True,
        "bind": True,
    },
    {
        "slug": "reading-guide",
        "name": "Guida a letture pertinenti",
        "description": "Suggerisce letture verificabili quando lo studente chiede fonti o approfondimenti.",
        "instructions_i18n": SKILL_INSTRUCTIONS_I18N["reading-guide"],
        "conditions": {"intents": ["reading"]},
        # L'handler consegna la whitelist delle fonti realmente recuperate: il
        # divieto di inventare riferimenti diventa cosi' un filtro, non solo una
        # direttiva al modello.
        "handler": "reading_sources",
        "handler_params": {"limit": 6},
        "routing": "primary",
        "slot": "directive_tail",
        "max_chars": 2200,
        "sort_order": 20,
        "is_active": True,
        "bind": True,
    },
    {
        "slug": "profile-comparison",
        "name": "Confronto riflessivo dei profili",
        "description": "Confronta risultati strutturati dello stesso studente senza inventare dati o causalita'.",
        "instructions_i18n": SKILL_INSTRUCTIONS_I18N["profile-comparison"],
        "conditions": {"intents": ["compare"]},
        "handler": "profile_comparison",
        "handler_params": {},
        "routing": "primary",
        "slot": "directive_tail",
        "max_chars": 2600,
        "sort_order": 30,
        "is_active": True,
        "bind": True,
    },
]


def seed_skill_configs(db) -> bool:
    """Inserisce i valori operativi mancanti senza sovrascrivere l'admin."""
    changed = False
    for key, default, description in SKILL_CONFIG_DEFAULTS:
        if db.query(models.Config).filter(models.Config.key == key).first() is None:
            db.add(models.Config(key=key, value=default, description=description))
            changed = True
    if changed:
        db.commit()
    return changed


def apply_certified_advice_policy(db) -> bool:
    """Migra una sola volta l'installazione alla fonte certificata unica."""
    marker = db.query(models.Config).filter(
        models.Config.key == CERTIFIED_ADVICE_POLICY_MARKER
    ).first()
    if marker is not None:
        return False

    seed_skill_configs(db)
    seed_skills(db)

    config_values = {
        "skills_engine_enabled": "true",
        "skills_engine_instruments": json.dumps(list(SEEDED_INSTRUMENTS)),
    }
    for key, value in config_values.items():
        row = db.query(models.Config).filter(models.Config.key == key).one()
        row.value = value

    approved = db.query(models.Skill).filter(
        models.Skill.slug == "approved-strategies"
    ).one()
    approved.is_active = False
    for binding in db.query(models.GuidedStepSkill).filter(
        models.GuidedStepSkill.skill_id == approved.id
    ).all():
        binding.enabled = False

    certified = db.query(models.Skill).filter(
        models.Skill.slug == "certified-advice"
    ).one()
    certified.is_active = True
    certified.status = "published"
    certified.max_chars = max(int(certified.max_chars or 0), 2800)
    certified.instructions_i18n = {"en": CERTIFIED_ADVICE_INSTRUCTIONS_EN}
    for questionnaire_type in SEEDED_INSTRUMENTS:
        binding = db.query(models.GuidedStepSkill).filter(
            models.GuidedStepSkill.questionnaire_type == questionnaire_type,
            models.GuidedStepSkill.step_id == "*",
            models.GuidedStepSkill.skill_id == certified.id,
        ).first()
        if binding is None:
            db.add(models.GuidedStepSkill(
                questionnaire_type=questionnaire_type,
                step_id="*",
                skill_id=certified.id,
                sort_order=certified.sort_order,
                enabled=True,
            ))
        else:
            binding.enabled = True

    db.add(models.Config(
        key=CERTIFIED_ADVICE_POLICY_MARKER,
        value="applied",
        description="Migrazione una tantum: certified-advice unica fonte di consigli.",
    ))
    db.commit()
    return True


def apply_specialized_skills_policy(db) -> bool:
    """Allinea una sola volta le skill live al contratto comportamentale."""
    marker = db.query(models.Config).filter(
        models.Config.key == SPECIALIZED_SKILLS_POLICY_MARKER
    ).first()
    if marker is not None:
        return False

    seed_skills(db)
    seeds = {seed["slug"]: seed for seed in SKILL_SEEDS}
    for slug in ("certified-advice", "profile-wayfinder", "reading-guide", "profile-comparison"):
        seed = seeds[slug]
        skill = db.query(models.Skill).filter(models.Skill.slug == slug).one()
        skill.description = seed["description"]
        skill.instructions_i18n = seed["instructions_i18n"]
        skill.conditions = seed["conditions"]
        skill.handler = seed["handler"]
        skill.handler_params = seed["handler_params"]
        skill.routing = seed["routing"]
        skill.slot = seed["slot"]
        skill.max_chars = seed["max_chars"]
        skill.sort_order = seed["sort_order"]
        skill.is_active = True
        skill.status = "published"
        for questionnaire_type in SEEDED_INSTRUMENTS:
            binding = db.query(models.GuidedStepSkill).filter(
                models.GuidedStepSkill.questionnaire_type == questionnaire_type,
                models.GuidedStepSkill.step_id == "*",
                models.GuidedStepSkill.skill_id == skill.id,
            ).one()
            binding.enabled = True
            binding.sort_order = seed["sort_order"]

    db.add(models.Config(
        key=SPECIALIZED_SKILLS_POLICY_MARKER,
        value="applied",
        description="Migrazione una tantum: comportamenti primari specializzati della chat.",
    ))
    db.commit()
    return True


def apply_reading_and_translations_policy(db) -> bool:
    """Preserve the historical migration marker and enable verified readings.

    Instruction-language normalization now belongs to the dedicated
    English-only policy that runs immediately after this migration.
    """
    marker = db.query(models.Config).filter(
        models.Config.key == READING_AND_TRANSLATIONS_POLICY_MARKER
    ).first()
    if marker is not None:
        return False

    seed_skills(db)
    reading = db.query(models.Skill).filter(models.Skill.slug == "reading-guide").first()
    if reading is not None and not (reading.handler or "").strip():
        reading.handler = "reading_sources"
        reading.handler_params = {"limit": 6}
        reading.max_chars = max(int(reading.max_chars or 0), 2200)

    db.add(models.Config(
        key=READING_AND_TRANSLATIONS_POLICY_MARKER,
        value="applied",
        description="Historical migration: verified reading-source handler enabled.",
    ))
    db.commit()
    return True


def apply_english_skill_instructions_policy(db) -> bool:
    """Canonicalize every stored skill instruction to English only.

    Built-in skills receive their canonical English contract. Custom skills
    retain an existing English contract; non-English-only instructions are
    removed because translating behavioral directives implicitly is unsafe.
    """
    marker = db.query(models.Config).filter(
        models.Config.key == ENGLISH_SKILL_INSTRUCTIONS_POLICY_MARKER
    ).first()
    if marker is not None:
        return False

    seed_skills(db)
    for skill in db.query(models.Skill).all():
        canonical = SKILL_INSTRUCTIONS_I18N.get(skill.slug)
        if canonical is not None:
            skill.instructions_i18n = dict(canonical)
            continue
        current = skill.instructions_i18n if isinstance(skill.instructions_i18n, dict) else {}
        english = current.get("en")
        skill.instructions_i18n = {"en": english} if isinstance(english, str) and english.strip() else {}

    db.add(models.Config(
        key=ENGLISH_SKILL_INSTRUCTIONS_POLICY_MARKER,
        value="applied",
        description="One-time migration: skill instructions are stored in English only.",
    ))
    db.commit()
    return True


def seed_skills(db) -> bool:
    """Crea le skill mancanti e i loro agganci wildcard. Idempotente."""
    changed = False
    for seed in SKILL_SEEDS:
        skill = db.query(models.Skill).filter(models.Skill.slug == seed["slug"]).first()
        if skill is None:
            model_values = {
                key: value for key, value in seed.items()
                if key not in {"bind", "is_active"}
            }
            skill = models.Skill(
                status="published",
                is_active=bool(seed.get("is_active", True)),
                **model_values,
            )
            db.add(skill)
            db.commit()
            db.refresh(skill)
            changed = True
            logger.info("Seed skill creata: %s", seed["slug"])

        if not seed.get("bind", True):
            continue

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
