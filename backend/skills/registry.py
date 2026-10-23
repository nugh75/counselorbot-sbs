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


def bindings_for(db, questionnaire_type: str, step_id: str | None, *, include_skill_id: int | None = None,
                 include_skill=None) -> list[SkillBinding]:
    """Skill pubblicate e attive agganciate a (strumento, step), ordinate.

    `include_skill_id` e `include_skill` servono solo all'anteprima admin:
    aggiungono quella skill anche se e' in bozza, spenta o non ancora
    agganciata, cosi' la si prova prima di pubblicarla. `include_skill` e' una
    `Skill` non salvata (il form del wizard): con lo stesso id sostituisce la
    versione salvata. Condizioni, router e budget restano quelli veri.
    """
    rows = (
        db.query(models.GuidedStepSkill)
        .filter(
            models.GuidedStepSkill.questionnaire_type == questionnaire_type,
            models.GuidedStepSkill.step_id.in_([step_id or "*", "*"]),
        )
        .all()
    )
    included = include_skill
    if included is None and include_skill_id is not None:
        included = db.query(models.Skill).filter(models.Skill.id == include_skill_id).first()
    if not rows and included is None:
        return []

    # L'aggancio esplicito allo step vince sul wildcard, anche spento: e' cosi'
    # che si toglie da un solo step una skill valida per tutto lo strumento.
    by_skill: dict[int, models.GuidedStepSkill] = {}
    for row in rows:
        current = by_skill.get(row.skill_id)
        if current is None or (current.step_id == "*" and row.step_id != "*"):
            by_skill[row.skill_id] = row
    by_skill = {skill_id: row for skill_id, row in by_skill.items() if row.enabled}

    skills = (
        db.query(models.Skill)
        .filter(
            models.Skill.id.in_(list(by_skill)),
            models.Skill.is_active.is_(True),
            models.Skill.status == "published",
        )
        .all()
    )

    if included is not None:
        skills = [skill for skill in skills if included.id is None or skill.id != included.id]
        skills.append(included)

    bindings = []
    for skill in skills:
        row = by_skill.get(skill.id)
        params = dict(skill.handler_params or {})
        params.update((row.override_params if row else None) or {})
        sort_order = (row.sort_order if row else 0) or skill.sort_order or 0
        bindings.append(SkillBinding(skill=skill, params=params, sort_order=sort_order))
    bindings.sort(key=lambda b: (b.sort_order, b.slug))
    return bindings
