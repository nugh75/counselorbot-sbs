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
