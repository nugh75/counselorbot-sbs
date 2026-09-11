"""Test dei generi di schema: grammatica, esempi, prompt d'esempio.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_tavolo_presets
"""
import pytest

from backend.tavolo import MAX_LABEL, PRESET_IDS, REL_FAMILY, TavoloProposal, parse_graph, rendition
from backend.tavolo_presets import (
    PRESETS,
    conform,
    example_graph,
    preset_of,
    prompt_examples,
)

# Le sei lingue dell'interfaccia: un esempio deve reggere in ognuna, non solo
# nella lingua in cui e' stato scritto a mano.
LANGS = ("it", "en", "es", "fr", "de", "sv")
# `TavoloEdge.label` non ha una costante nominata come `MAX_LABEL`: il tetto e'
# scritto qui perche' e' lo stesso numero del `Field(max_length=40)` in tavolo.py.
MAX_EDGE_LABEL = 40


def test_the_five_genres_are_the_ones_the_graph_accepts():
    assert set(PRESETS) == set(PRESET_IDS)


def test_every_genre_only_uses_verbs_of_the_vocabulary():
    for preset in PRESETS.values():
        assert set(preset["rels"]) <= set(REL_FAMILY), preset["id"]


def test_an_unknown_genre_is_nobody():
    assert preset_of("mind-map") is None
    assert preset_of(None) is None
    assert preset_of("workflow")["rankdir"] == "LR"


def test_a_verb_outside_the_genre_is_dropped_and_the_rest_kept():
    proposal = TavoloProposal.model_validate({
        "add_nodes": [{"id": "a", "label": "Raccogli", "form": "action"},
                      {"id": "b", "label": "Studia", "form": "action"}],
        "add_edges": [{"from": "a", "to": "b", "rel": "then"},
                      {"from": "b", "to": "a", "rel": "supports"}],
    })
    kept = conform(PRESETS["workflow"], proposal)
    assert [edge.rel for edge in kept.add_edges] == ["then"]
    assert len(kept.add_nodes) == 2


def test_a_form_outside_the_genre_falls_back_to_the_first_one():
    proposal = TavoloProposal.model_validate({
        "add_nodes": [{"id": "a", "label": "Ansia", "form": "decision"}],
    })
    kept = conform(PRESETS["causal"], proposal)
    assert kept.add_nodes[0].form == "concept"


def test_a_concept_map_refuses_an_edge_without_a_word_on_it():
    proposal = TavoloProposal.model_validate({
        "add_nodes": [{"id": "a", "label": "QSA"}, {"id": "b", "label": "Area cognitiva"}],
        "add_edges": [{"from": "b", "to": "a", "rel": "part-of"},
                      {"from": "a", "to": "b", "rel": "part-of", "label": "contiene"}],
    })
    kept = conform(PRESETS["concept"], proposal)
    assert [edge.label for edge in kept.add_edges] == ["contiene"]


def test_every_example_graph_holds_up_and_obeys_its_own_genre():
    """Ogni esempio, in ognuna delle sei lingue: non solo quella scritta a mano.

    Una traduzione che sfora il tetto di un'etichetta arriva comunque a
    `preset_of`/`_word` senza sfigurare, ma poi `parse_graph` la rifiuta a
    runtime quando la persona apre l'esempio: e' lo scarto che questo giro di
    lingue deve trovare qui, non in produzione.
    """
    for preset_id, preset in PRESETS.items():
        for lang in LANGS:
            graph = parse_graph(example_graph(preset_id, lang))
            here = (preset_id, lang)
            assert graph.preset == preset_id, here
            assert graph.nodes, here
            assert {edge.rel for edge in graph.edges} <= set(preset["rels"]), here
            assert {node.form for node in graph.nodes} <= set(preset["forms"]), here
            if preset["edge_label_required"]:
                assert all((edge.label or "").strip() for edge in graph.edges), here
            assert all(len(node.label) <= MAX_LABEL for node in graph.nodes), here
            assert all(len(edge.label or "") <= MAX_EDGE_LABEL for edge in graph.edges), here
            assert sum(1 for node in graph.nodes if node.accent) <= 1, here


def test_a_missing_language_falls_back_to_english():
    from backend.tavolo_presets import _word
    assert _word({"en": "only english"}, "sv") == "only english"
    assert _word({"en": "english", "it": "italiano"}, "it") == "italiano"


def test_every_genre_offers_two_example_prompts():
    for preset_id in PRESETS:
        assert len(prompt_examples(preset_id, "it")) == 2


def test_the_rendition_names_the_genre_of_the_table():
    spoken = rendition(parse_graph(example_graph("causal", "it")), "it")
    assert "Genere: mappa causale" in spoken
    assert "Genre: causal map" in rendition(parse_graph(example_graph("causal", "en")), "en")


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(pytest.main([__file__, "-q"]))
