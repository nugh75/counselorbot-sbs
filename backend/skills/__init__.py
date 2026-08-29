"""Motore di skill: unita' dichiarative iniettate nel prompt della chat.

Una skill e' una riga DB (`models.Skill`) con condizioni dichiarative, testo di
istruzioni multilingua e un `handler` Python opzionale per il materiale che va
recuperato (strategie certificate, knowledge base approvata). Gli agganci agli
step vivono in `models.GuidedStepSkill`.
"""
from . import conditions, engine, handlers, intents, registry, router
from .context import SkillContext, SkillOutput

__all__ = [
    "SkillContext",
    "SkillOutput",
    "conditions",
    "engine",
    "handlers",
    "intents",
    "registry",
    "router",
]
