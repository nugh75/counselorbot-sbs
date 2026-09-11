"""Test del tavolo: vocabolario delle connessioni, proposte, resa a parole.

La persistenza e' provata dallo smoke sul DB; qui si prova la logica pura.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_tavolo
"""
import pytest

from backend.tavolo import (
    FAMILIES,
    REL_FAMILY,
    TavoloError,
    accept,
    family_of,
    from_idea_map,
    live,
    parse_composition,
    parse_graph,
    parse_proposal,
    propose,
    reject,
    rendition,
)

GRAPH = {
    "title": "Perche' rimando",
    "nodes": [
        {"id": "a", "label": "Compito difficile", "form": "concept"},
        {"id": "b", "label": "Ansia", "form": "concept"},
        {"id": "c", "label": "Rimando", "form": "action"},
    ],
    "edges": [
        {"from": "a", "to": "b", "rel": "causes"},
        {"from": "b", "to": "c", "rel": "causes", "strength": 3},
    ],
}


def _base():
    return parse_graph(GRAPH)


# --- il vocabolario ---

def test_the_rel_decides_the_family():
    assert family_of("supports") == "argument"
    assert family_of("causes") == "cause"
    assert family_of("then") == "time"
    assert family_of("part-of") == "part"


def test_every_rel_belongs_to_one_of_the_four_families():
    assert set(REL_FAMILY.values()) == set(FAMILIES)


def test_an_unknown_rel_is_refused():
    with pytest.raises(TavoloError):
        parse_graph({**GRAPH, "edges": [{"from": "a", "to": "b", "rel": "pushes"}]})


def test_the_family_is_derived_not_declared():
    """Il modello nomina un token solo: una famiglia scritta a mano si ignora."""
    graph = parse_graph({**GRAPH, "edges": [
        {"from": "a", "to": "b", "rel": "supports", "family": "time"},
    ]})
    assert graph.edges[0].family == "argument"


def test_an_edge_to_an_unknown_node_is_refused():
    with pytest.raises(TavoloError):
        parse_graph({**GRAPH, "edges": [{"from": "a", "to": "zz", "rel": "causes"}]})


# --- i modificatori ---

def test_strength_and_doubt_are_modifiers_of_any_rel():
    graph = parse_graph({**GRAPH, "edges": [
        {"from": "a", "to": "b", "rel": "causes", "strength": 1},
        {"from": "b", "to": "c", "rel": "causes", "strength": 3, "hypothesis": True},
    ]})
    assert [edge.rel for edge in graph.edges] == ["causes", "causes"]
    assert [edge.strength for edge in graph.edges] == [1, 3]
    assert [edge.hypothesis for edge in graph.edges] == [False, True]


def test_a_link_can_hold_both_ways():
    """Il terzo modificatore: due punte, non due verbi."""
    graph = parse_graph({**GRAPH, "edges": [
        {"from": "a", "to": "b", "rel": "causes", "reciprocal": True},
        {"from": "b", "to": "c", "rel": "causes"},
    ]})
    assert [edge.reciprocal for edge in graph.edges] == [True, False]
    assert [edge.rel for edge in graph.edges] == ["causes", "causes"]


def test_the_rendition_says_a_link_holds_both_ways():
    graph = parse_graph({**GRAPH, "edges": [
        {"from": "a", "to": "b", "rel": "causes", "reciprocal": True},
    ]})
    assert "nei due sensi" in rendition(graph, "it")
    assert "both ways" in rendition(graph, "en")


def test_a_strength_outside_the_scale_is_refused():
    with pytest.raises(TavoloError):
        parse_graph({**GRAPH, "edges": [{"from": "a", "to": "b", "rel": "causes", "strength": 7}]})


def test_only_one_piece_can_be_accented():
    graph = parse_graph({**GRAPH, "nodes": [
        {"id": "a", "label": "Compito difficile", "accent": True},
        {"id": "b", "label": "Ansia"},
        {"id": "c", "label": "Rimando"},
    ]})
    assert [node.accent for node in graph.nodes] == [True, False, False]
    with pytest.raises(TavoloError):
        parse_graph({**GRAPH, "nodes": [
            {"id": "a", "label": "Compito difficile", "accent": True},
            {"id": "b", "label": "Ansia", "accent": True},
            {"id": "c", "label": "Rimando"},
        ]})


# --- le proposte ---

def test_a_proposal_never_enters_the_live_graph():
    proposed = propose(_base(), parse_proposal({
        "add_nodes": [{"id": "d", "label": "Meno tempo", "form": "outcome"}],
        "add_edges": [{"from": "c", "to": "d", "rel": "causes"}],
    }))
    assert [node.id for node in live(proposed).nodes] == ["a", "b", "c"]
    assert [node.state for node in proposed.nodes if node.id == "d"] == ["pending"]
    assert all(node.by == "model" for node in proposed.nodes if node.state == "pending")


def test_accept_promotes_only_what_was_named():
    proposed = propose(_base(), parse_proposal({
        "add_nodes": [
            {"id": "d", "label": "Meno tempo"},
            {"id": "e", "label": "Compito piu' difficile"},
        ],
    }))
    settled = accept(proposed, ["d"])
    assert [node.id for node in live(settled).nodes] == ["a", "b", "c", "d"]
    assert [node.state for node in settled.nodes if node.id == "e"] == ["pending"]


def test_an_accepted_edge_needs_both_ends_alive():
    proposed = propose(_base(), parse_proposal({
        "add_nodes": [{"id": "d", "label": "Meno tempo"}],
        "add_edges": [{"from": "c", "to": "d", "rel": "causes"}],
    }))
    with pytest.raises(TavoloError):
        accept(proposed, ["c->d"])


def test_reject_drops_the_element_and_leaves_the_rest():
    proposed = propose(_base(), parse_proposal({
        "add_nodes": [
            {"id": "d", "label": "Meno tempo"},
            {"id": "e", "label": "Compito piu' difficile"},
        ],
    }))
    settled = reject(proposed, ["d"])
    assert [node.state for node in settled.nodes if node.id == "d"] == ["dropped"]
    assert [node.state for node in settled.nodes if node.id == "e"] == ["pending"]
    assert [node.id for node in live(settled).nodes] == ["a", "b", "c"]


def test_a_dropped_element_stays_dropped():
    proposed = propose(_base(), parse_proposal({"add_nodes": [{"id": "d", "label": "Meno tempo"}]}))
    settled = accept(reject(proposed, ["d"]), ["d"])
    assert [node.state for node in settled.nodes if node.id == "d"] == ["dropped"]


def test_the_model_cannot_accent_a_piece():
    """L'enfasi e' della persona: una proposta che si accenta da sola scriverebbe."""
    proposed = propose(_base(), parse_proposal({
        "add_nodes": [{"id": "d", "label": "Meno tempo", "accent": True}],
    }))
    assert [node.accent for node in proposed.nodes] == [False, False, False, False]


def test_a_proposal_cannot_rewrite_what_is_already_there():
    proposed = propose(_base(), parse_proposal({
        "add_nodes": [{"id": "a", "label": "Un altro nome"}],
    }))
    assert [node.label for node in proposed.nodes if node.id == "a"] == ["Compito difficile"]


# --- l'eredita' dalla mappa di Idea ---

def test_a_map_from_idea_keeps_its_meaning():
    graph = from_idea_map({
        "type": "mindmap",
        "title": "Tesi sulla dispersione",
        "nodes": [
            {"id": "idea", "label": "Tesi sulla dispersione", "role": "idea"},
            {"id": "a1", "label": "I dati sono accessibili", "role": "assumption"},
            {"id": "s1", "label": "Chiedere i dati", "role": "step"},
        ],
        "edges": [
            {"from": "idea", "to": "a1", "kind": "link"},
            {"from": "a1", "to": "s1", "kind": "strengthens"},
        ],
    })
    assert [edge.rel for edge in graph.edges] == ["part-of", "supports"]
    assert all(node.by == "person" for node in graph.nodes)
    assert [node.form for node in graph.nodes if node.id == "s1"] == ["action"]


# --- la resa a parole ---

def test_the_rendition_names_the_convention_of_every_connection():
    spoken = rendition(_base(), "it")
    assert "Perche' rimando" in spoken
    assert "Compito difficile" in spoken
    assert "porta a" in spoken


def test_the_rendition_says_the_doubt_out_loud():
    graph = parse_graph({**GRAPH, "edges": [
        {"from": "a", "to": "b", "rel": "causes", "hypothesis": True},
    ]})
    assert "ipotesi" in rendition(graph, "it")


def test_the_rendition_leaves_out_what_is_only_proposed():
    proposed = propose(_base(), parse_proposal({"add_nodes": [{"id": "d", "label": "Meno tempo"}]}))
    assert "Meno tempo" not in rendition(proposed, "it")


def test_an_invented_colour_is_dropped_like_an_invented_form():
    graph = parse_graph({**GRAPH, "nodes": [
        {"id": "a", "label": "Compito difficile", "color": "green"},
        {"id": "b", "label": "Ansia", "color": "fucsia"},
        {"id": "c", "label": "Rimando"},
    ]})
    assert [node.color for node in graph.nodes] == ["green", None, None]


def test_the_model_cannot_colour_a_piece():
    """Il colore e' il raggruppamento della persona, non una mossa del modello."""
    proposed = propose(_base(), parse_proposal({
        "add_nodes": [{"id": "d", "label": "Meno tempo", "color": "blue"}],
    }))
    assert proposed.nodes[-1].color is None


def test_the_rendition_reads_the_colour_groups():
    graph = parse_graph({**GRAPH, "nodes": [
        {"id": "a", "label": "Compito difficile", "color": "green"},
        {"id": "b", "label": "Ansia", "color": "green"},
        {"id": "c", "label": "Rimando", "color": "blue"},
    ]})
    said = rendition(graph, "it")
    assert "Gruppi: verde (Compito difficile, Ansia); blu (Rimando)" in said
    # Senza colori non si dice niente: una riga vuota e' rumore.
    assert "Gruppi" not in rendition(_base(), "it")


def test_the_rendition_says_which_piece_is_the_point():
    graph = parse_graph({**GRAPH, "nodes": [
        {"id": "a", "label": "Compito difficile"},
        {"id": "b", "label": "Ansia", "accent": True},
        {"id": "c", "label": "Rimando"},
    ]})
    assert "Il punto: Ansia" in rendition(graph, "it")
    assert "The point: Ansia" in rendition(graph, "en")


def test_the_rendition_speaks_every_supported_language():
    for lang in ("it", "en", "es", "fr", "de", "sv"):
        assert rendition(_base(), lang).startswith("Perche' rimando")


def test_an_invented_icon_is_dropped_like_an_invented_form():
    graph = parse_graph({**GRAPH, "nodes": [
        {"id": "a", "label": "Compito difficile", "icon": "unicorno"},
        {"id": "b", "label": "Ansia", "icon": "distress"},
        {"id": "c", "label": "Rimando"},
    ]})
    assert graph.nodes[0].icon is None
    assert graph.nodes[1].icon == "distress"


def test_an_invented_genre_is_dropped_like_an_invented_colour():
    assert parse_graph({**GRAPH, "preset": "mind-map"}).preset is None
    assert parse_graph({**GRAPH, "preset": "causal"}).preset == "causal"


def test_the_genre_survives_a_proposal_and_the_live_view():
    graph = parse_graph({**GRAPH, "preset": "causal"})
    proposed = propose(graph, parse_proposal({"add_nodes": [{"id": "d", "label": "Meno tempo"}]}))
    assert proposed.preset == "causal"
    assert live(proposed).preset == "causal"


def test_a_composition_that_overflows_the_table_is_a_tavolo_error_not_a_validation_error():
    """Il difetto trovato in review: un tavolo pieno sollevava `ValidationError`
    (pydantic) da dentro `propose()`, che `except TavoloError` nelle rotte non
    prende, e FastAPI rispondeva 500. Trenta pezzi piu' sedici e' esattamente
    la riproduzione della review: sotto ai due tetti singolarmente, sopra
    insieme (MAX_NODES = 40)."""
    full = parse_graph({
        "title": "Pieno",
        "nodes": [{"id": f"n{i}", "label": f"Pezzo {i}"} for i in range(30)],
    })
    composition = parse_composition({
        "add_nodes": [{"id": f"m{i}", "label": f"Nuovo {i}"} for i in range(16)],
    })
    with pytest.raises(TavoloError):
        propose(full, composition)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(pytest.main([__file__, "-q"]))
