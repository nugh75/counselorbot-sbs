"""Test puri di engine e handler registry.

Nessun DB: si costruiscono `SkillBinding` con oggetti finti al posto delle
righe `models.Skill`. Copre budget, troncamento, ordine e handler mancante.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_skills_engine
Con pytest:
    pytest backend/tests/test_skills_engine.py
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from types import SimpleNamespace

from backend.skills import engine, handlers
from backend.skills.context import SkillContext, SkillOutput
from backend.skills.registry import SkillBinding


def _skill(slug, **kwargs):
    data = dict(
        slug=slug, name=slug, description="", instructions_i18n={"it": f"istruzioni {slug}"},
        conditions=None, handler=None, handler_params=None, routing="always",
        slot="knowledge", max_chars=1400, sort_order=0, is_active=True, status="published",
    )
    data.update(kwargs)
    return SimpleNamespace(**data)


def _binding(slug, **kwargs):
    skill = _skill(slug, **kwargs)
    return SkillBinding(skill=skill, params=dict(skill.handler_params or {}), sort_order=skill.sort_order)


def _ctx(**kwargs):
    base = dict(questionnaire_type="QSA", step_id="qsa-c6", step_mode="factor", language="it")
    base.update(kwargs)
    return SkillContext(**base)


def test_truncate_cuts_on_line_boundary():
    text = "riga uno\nriga due\nriga tre"
    assert engine.truncate(text, 100) == text
    assert engine.truncate(text, 12) == "riga uno"


def test_text_only_skill_renders_instructions():
    result = engine.render([_binding("intro")], _ctx(), total_max_chars=3000)
    assert result.blocks["knowledge"] == ["istruzioni intro"]
    assert result.ids == {}


def test_instructions_fall_back_to_italian():
    binding = _binding("intro", instructions_i18n={"it": "solo italiano"})
    result = engine.render([binding], _ctx(language="sv"), total_max_chars=3000)
    assert result.blocks["knowledge"] == ["solo italiano"]


def test_handler_output_is_appended_after_instructions():
    @handlers.handler("_test_echo")
    def _echo(ctx, params):
        return SkillOutput(text=f"materiale {params.get('n', 0)}", ids=["x1"])

    binding = _binding("echo", handler="_test_echo", handler_params={"n": 7})
    result = engine.render([binding], _ctx(), total_max_chars=3000)
    assert result.blocks["knowledge"] == ["istruzioni echo\n\nmateriale 7"]
    assert result.ids["echo"] == ["x1"]


def test_non_applicable_handler_drops_its_instructions_too():
    @handlers.handler("_test_not_applicable")
    def _not_applicable(ctx, params):
        return SkillOutput(applicable=False, reason="nessun materiale pertinente")

    result = engine.render(
        [_binding("conditional", handler="_test_not_applicable")],
        _ctx(),
        total_max_chars=3000,
    )
    assert result.blocks == {}
    assert result.trace[0]["skipped"] == "nessun materiale pertinente"


def test_handler_can_put_material_in_a_different_slot_from_instructions():
    @handlers.handler("_test_split_slots")
    def _split_slots(ctx, params):
        return SkillOutput(text="dati strutturati", slot="knowledge")

    binding = _binding(
        "comparison",
        handler="_test_split_slots",
        slot="directive_tail",
        instructions_i18n={"it": "regole confronto"},
    )
    result = engine.render([binding], _ctx(), total_max_chars=3000)
    assert result.blocks["directive_tail"] == ["regole confronto"]
    assert result.blocks["knowledge"] == ["dati strutturati"]


def test_split_slot_directive_is_dropped_when_its_material_does_not_fit():
    @handlers.handler("_test_split_budget")
    def _split_budget(ctx, params):
        return SkillOutput(text="dati necessari", ids=["not-injected"], slot="knowledge")

    binding = _binding(
        "budgeted",
        handler="_test_split_budget",
        slot="directive_tail",
        instructions_i18n={"it": "direttiva lunga"},
        max_chars=10,
    )
    result = engine.render([binding], _ctx(), total_max_chars=3000)
    assert result.blocks == {}
    assert result.ids == {}
    assert result.trace[0]["skipped"] == "materiale escluso dal budget della skill"


def test_unknown_handler_is_skipped_not_raised():
    binding = _binding("broken", handler="does_not_exist")
    result = engine.render([binding], _ctx(), total_max_chars=3000)
    assert result.blocks == {}
    assert result.trace[0]["skipped"] == "handler sconosciuto: does_not_exist"


def test_handler_exception_is_swallowed():
    @handlers.handler("_test_boom")
    def _boom(ctx, params):
        raise RuntimeError("kaboom")

    result = engine.render([_binding("boom", handler="_test_boom")], _ctx(), total_max_chars=3000)
    assert result.blocks == {}
    assert "kaboom" in result.trace[0]["skipped"]


def test_per_skill_max_chars():
    binding = _binding("long", instructions_i18n={"it": "a" * 50}, max_chars=10)
    result = engine.render([binding], _ctx(), total_max_chars=3000)
    assert result.blocks["knowledge"] == ["a" * 10]


def test_total_budget_drops_late_blocks():
    first = _binding("a", instructions_i18n={"it": "x" * 40}, sort_order=1)
    second = _binding("b", instructions_i18n={"it": "y" * 40}, sort_order=2)
    result = engine.render([first, second], _ctx(), total_max_chars=45)
    assert result.blocks["knowledge"] == ["x" * 40]
    assert result.trace[1]["skipped"] == "budget complessivo esaurito"


def test_total_budget_does_not_report_ids_for_dropped_block():
    @handlers.handler("_test_budget_ids")
    def _with_ids(ctx, params):
        return SkillOutput(text="y" * 40, ids=["not-injected"])

    first = _binding("a", instructions_i18n={"it": "x" * 40}, sort_order=1)
    second = _binding(
        "b",
        instructions_i18n={},
        handler="_test_budget_ids",
        sort_order=2,
    )

    result = engine.render([first, second], _ctx(), total_max_chars=45)

    assert result.blocks["knowledge"] == ["x" * 40]
    assert result.ids == {}
    assert result.trace[1]["skipped"] == "budget complessivo esaurito"


def test_blocks_are_grouped_by_slot_and_sorted():
    a = _binding("a", slot="section", sort_order=2)
    b = _binding("b", slot="section", sort_order=1)
    c = _binding("c", slot="directive_tail", sort_order=1)
    result = engine.render([a, b, c], _ctx(), total_max_chars=3000)
    assert result.blocks["section"] == ["istruzioni b", "istruzioni a"]
    assert result.blocks["directive_tail"] == ["istruzioni c"]


def test_handler_names_are_sorted_and_include_pilot_handlers():
    names = handlers.handler_names()
    assert names == sorted(names)
    assert "certified_strategies" in names
    assert "approved_strategies" in names


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"ok   {t.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {t.__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
