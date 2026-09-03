"""Chi prende per primo il budget delle skill, e quanto ce n'e'.

Un blocco che non entra nel budget sparisce senza errore e senza log: il
modello riceve meno di quanto doveva e nessuno se ne accorge. Questi test
tengono ferme le due cose che lo rendevano probabile.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_skills_budget
"""
from dataclasses import dataclass

from backend.skills.engine import DEFAULT_TOTAL_MAX_CHARS, _render_order


@dataclass
class _Skill:
    slug: str
    routing: str


@dataclass
class _Binding:
    skill: _Skill
    sort_order: int

    @property
    def slug(self) -> str:
        return self.skill.slug


def _order(*bindings) -> list[str]:
    return [b.slug for b in sorted(bindings, key=_render_order)]


def test_the_answer_material_takes_the_budget_before_the_illustration():
    # Il caso vero: certified-advice (primary, 50) restava senza budget perche'
    # concept-diagram (optional, 35) veniva prima e ne consumava due terzi.
    advice = _Binding(_Skill("certified-advice", "primary"), 50)
    diagram = _Binding(_Skill("concept-diagram", "optional"), 35)
    assert _order(diagram, advice) == ["certified-advice", "concept-diagram"]


def test_structural_skills_still_come_first():
    always = _Binding(_Skill("idea-focus", "always"), 40)
    advice = _Binding(_Skill("certified-advice", "primary"), 10)
    assert _order(advice, always) == ["idea-focus", "certified-advice"]


def test_sort_order_still_decides_inside_a_tier():
    first = _Binding(_Skill("profile-wayfinder", "primary"), 10)
    second = _Binding(_Skill("reading-guide", "primary"), 20)
    assert _order(second, first) == ["profile-wayfinder", "reading-guide"]


def test_an_unknown_routing_never_starves_a_primary():
    odd = _Binding(_Skill("qualcosa", "sperimentale"), 1)
    advice = _Binding(_Skill("certified-advice", "primary"), 99)
    assert _order(odd, advice) == ["certified-advice", "qualcosa"]


def test_the_budget_holds_the_contracts_actually_shipped():
    from backend.skills_seed import (
        CONCEPT_DIAGRAM_INSTRUCTIONS_EN,
        CERTIFIED_ADVICE_INSTRUCTIONS_EN,
    )

    # I due che si contendevano il budget devono starci insieme, con margine
    # per il materiale certificato che viaggia nello slot knowledge.
    together = len(CONCEPT_DIAGRAM_INSTRUCTIONS_EN) + len(CERTIFIED_ADVICE_INSTRUCTIONS_EN)
    assert together < DEFAULT_TOTAL_MAX_CHARS, (
        f"i due contratti fanno {together} contro un budget di {DEFAULT_TOTAL_MAX_CHARS}"
    )


def test_the_budget_holds_the_map_contract_next_to_the_sources():
    from backend.skills_seed import (
        IDEA_FOCUS_INSTRUCTIONS_EN,
        READING_GUIDE_INSTRUCTIONS_EN,
        WEB_LOOKUP_INSTRUCTIONS_EN,
    )

    # Su Idea la mappa e' `always`: prende il budget per prima, e a 4500 le
    # fonti pubbliche e il catalogo restavano fuori in silenzio. Il tetto deve
    # reggere le tre direttive piu' il materiale che portano con se'.
    contracts = (
        len(IDEA_FOCUS_INSTRUCTIONS_EN)
        + len(READING_GUIDE_INSTRUCTIONS_EN)
        + len(WEB_LOOKUP_INSTRUCTIONS_EN)
    )
    material = 700 + 900  # estratto di web-lookup, poi le letture del catalogo
    assert contracts + material < DEFAULT_TOTAL_MAX_CHARS, (
        f"contratti e materiale fanno {contracts + material} "
        f"contro un budget di {DEFAULT_TOTAL_MAX_CHARS}"
    )


if __name__ == "__main__":
    import sys

    failures = 0
    for name, fn in sorted(globals().items()):
        if not name.startswith("test_") or not callable(fn):
            continue
        try:
            fn()
        except Exception as exc:  # pragma: no cover - percorso manuale
            failures += 1
            print(f"FAIL {name}: {exc}")
    print("OK: test_skills_budget" if not failures else f"{failures} test falliti")
    sys.exit(1 if failures else 0)
