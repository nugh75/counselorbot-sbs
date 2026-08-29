"""Seed append-only della skill certificata e dei suoi agganci.

Le condizioni dei seed sono VUOTE di proposito: oggi il gating delle strategie
vive dentro `certified_strategy_memory.retrieve` (fattori salienti, allineamento
al profilo) e li' resta. Aggiungere condizioni dichiarative qui cambierebbe il
comportamento e romperebbe la parita'. L'admin puo' aggiungerle dal pannello.

Come per i prompt degli step, il seed non aggiorna mai una riga esistente.
"""
from __future__ import annotations

import json
import logging

from . import models

logger = logging.getLogger(__name__)

# Strumenti che ricevono il materiale certificato nella chat guidata.
SEEDED_INSTRUMENTS = ("QSA", "QSAr", "ZTPI", "QPCS", "QPCC", "QAP", "SAVICKAS")

CERTIFIED_ADVICE_INSTRUCTIONS_IT = """## Contratto per i consigli allo studente

- Usa esclusivamente le strategie certificate fornite nel blocco di contesto.
- Collega il consiglio alla richiesta e al profilo senza etichette diagnostiche.
- Proponi una sola azione concreta, circoscritta e verificabile; una seconda strategia puo' comparire soltanto come supporto.
- Spiega brevemente perche' l'azione e' pertinente e invita lo studente a verificarne l'utilita'.
- Non mostrare identificatori interni e non presentare il consiglio come prescrizione.
- Se non e' disponibile una strategia certificata pertinente, non forzare un consiglio.
"""

CERTIFIED_ADVICE_POLICY_MARKER = "skills_certified_advice_policy_v1"

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
        "instructions_i18n": {"it": CERTIFIED_ADVICE_INSTRUCTIONS_IT},
        "conditions": {},
        "handler": "certified_strategies",
        "handler_params": {"limit": 2},
        "routing": "optional",
        "slot": "knowledge",
        "max_chars": 2800,
        "sort_order": 50,
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
    instructions = dict(certified.instructions_i18n or {})
    instructions["it"] = CERTIFIED_ADVICE_INSTRUCTIONS_IT
    certified.instructions_i18n = instructions
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
