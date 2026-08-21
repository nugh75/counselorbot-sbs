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
