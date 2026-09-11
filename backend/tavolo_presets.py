"""I generi di schema del tavolo: una grammatica per genere, non un prompt fatto.

Un genere restringe il vocabolario *prima* che il modello parli: e' la stessa
lezione delle quattro famiglie, dove il modello sbaglia meno quando ha meno da
nominare. La restrizione vale solo nel momento della generazione — dopo, la
persona collega quello che vuole, con tutti e dodici i verbi.

Questo modulo importa da `tavolo.py` e mai il contrario: la' stanno solo gli id,
qui la grammatica.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import TypeVar

from .tavolo import TavoloComposition, TavoloProposal

_CATALOG = json.loads(Path(__file__).with_name("tavolo_presets.json").read_text(encoding="utf-8"))
PRESETS: dict[str, dict] = {entry["id"]: entry for entry in _CATALOG}

Moves = TypeVar("Moves", TavoloProposal, TavoloComposition)


def preset_of(value: str | None) -> dict | None:
    """Il genere, o nessuno. Un id inventato non e' un errore: e' nessun genere."""
    return PRESETS.get(value or "")


def conform(preset: dict, moves: Moves) -> Moves:
    """Cio' che sta nella grammatica del genere.

    Un arco fuori grammatica si scarta, non rompe lo schema: la stessa regola
    dell'icona inventata. Una forma fuori grammatica ripiega sulla prima del
    genere, perche' un pezzo senza forma non si disegna.
    """
    rels = set(preset["rels"])
    forms = set(preset["forms"])
    # Non e' preset["forms"][0]: per `algorithm` sarebbe "decision", un bivio
    # senza diramazioni, la sola cosa che la grammatica di quel genere vieta.
    default_form = preset["default_form"]
    nodes = [
        node if node.form in forms else node.model_copy(update={"form": default_form})
        for node in moves.add_nodes
    ]
    edges = [
        edge for edge in moves.add_edges
        if edge.rel in rels
        and (not preset["edge_label_required"] or (edge.label or "").strip())
    ]
    return moves.model_copy(update={"add_nodes": nodes, "add_edges": edges})


def _word(value: dict, lang: str) -> str:
    """Una lingua che manca ripiega sull'inglese, come la resa a parole."""
    return value.get((lang or "en").lower()[:2]) or value["en"]


def examples_of(preset_id: str, lang: str) -> list[dict]:
    """Gli esempi del genere, id e titolo: l'elenco che la persona scorre.

    Sono piu' di uno per genere perche' un genere si capisce dal confronto: due
    mappe causali diverse dicono cos'e' una mappa causale meglio di una sola.
    """
    return [
        {"id": example["id"], "title": _word(example["title"], lang)}
        for example in PRESETS[preset_id]["examples"]
    ]


def example_graph(preset_id: str, example_id: str, lang: str) -> dict:
    """Un grafo d'esempio, pronto da passare a `POST /tavolo`.

    Solleva `KeyError` se il genere o l'esempio non esistono: chi chiama
    traduce, qui non si inventa un ripiego su un esempio che non e' stato
    chiesto.
    """
    example = next(
        (item for item in PRESETS[preset_id]["examples"] if item["id"] == example_id),
        None,
    )
    if example is None:
        raise KeyError(example_id)
    return {
        "title": _word(example["title"], lang),
        "preset": preset_id,
        "nodes": [
            {
                "id": node["id"],
                "label": _word(node["label"], lang),
                "form": node["form"],
                "icon": node.get("icon"),
                "accent": bool(node.get("accent")),
                "x": node["x"],
                "y": node["y"],
            }
            for node in example["nodes"]
        ],
        "edges": [
            {
                "from": edge["from"],
                "to": edge["to"],
                "rel": edge["rel"],
                "strength": edge.get("strength", 2),
                "hypothesis": bool(edge.get("hypothesis")),
                **({"label": _word(edge["label"], lang)} if edge.get("label") else {}),
            }
            for edge in example["edges"]
        ],
    }


def prompt_examples(preset_id: str, lang: str) -> list[str]:
    """I due prompt d'esempio: servono a far vedere come si chiede."""
    prompts = PRESETS[preset_id]["prompts"]
    return prompts.get((lang or "en").lower()[:2]) or prompts["en"]
