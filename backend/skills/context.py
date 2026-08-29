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
    # Comportamento primario richiesto: advice|reading|compare|clarify|guided.
    intent: str = ""
    session_id: str = ""
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
    # Ultimo risultato strutturato per strumento, sempre dello stesso utente.
    profile_results: tuple[Mapping[str, Any], ...] = ()
    # Fonti RAG recuperate per questo turno ({title, source}): sono l'unico
    # materiale citabile da una skill di lettura.
    knowledge_sources: tuple[Mapping[str, Any], ...] = ()
    db: Any = None
    ai_service: Any = None


@dataclass
class SkillOutput:
    """Blocco reso da una skill, pronto per l'envelope."""

    text: str = ""
    # Identificatori del materiale usato (slug strategie): finiscono nei log.
    ids: list[str] = field(default_factory=list)
    meta: dict = field(default_factory=dict)
    # Un handler puo' dichiarare che la skill non e' applicabile: in tal caso
    # vengono scartate anche le istruzioni statiche della skill.
    applicable: bool = True
    reason: str = ""
    # Se valorizzato, il materiale del handler va in uno slot diverso dalle
    # istruzioni (es. dati in knowledge, comportamento in directive_tail).
    slot: str | None = None
