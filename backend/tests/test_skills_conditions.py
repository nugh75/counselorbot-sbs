"""Test puri del valutatore di condizioni delle skill.

Nessuna rete, nessun DB: `conditions.match` e' una funzione pura su
`SkillContext`. Le condizioni sono la parte dichiarativa che sostituisce le
regex di policy del vecchio gating strategie.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_skills_conditions
Con pytest:
    pytest backend/tests/test_skills_conditions.py
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from backend.skills.conditions import KNOWN_CONDITION_KEYS, match
from backend.skills.context import SkillContext


def _ctx(**kwargs) -> SkillContext:
    base = dict(
        questionnaire_type="QSA",
        step_id="qsa-c6",
        step_mode="factor",
        language="it",
        query="",
        message="",
        scores_context="C6: 8/9",
        salient_factors=frozenset({"C6", "A2"}),
        score_bands={"C6": "growth", "A2": "strength"},
    )
    base.update(kwargs)
    return SkillContext(**base)


def test_empty_conditions_always_match():
    assert match(None, _ctx()) == (True, "")
    assert match({}, _ctx()) == (True, "")


def test_unknown_key_fails_closed():
    ok, reason = match({"questionario": ["QSA"]}, _ctx())
    assert ok is False
    assert "questionario" in reason


def test_questionnaire_types_case_insensitive():
    assert match({"questionnaire_types": ["qsa", "qsar"]}, _ctx())[0] is True
    assert match({"questionnaire_types": ["ZTPI"]}, _ctx())[0] is False


def test_step_modes_and_step_ids():
    assert match({"step_modes": ["factor", "generic"]}, _ctx())[0] is True
    assert match({"step_modes": ["generic"]}, _ctx())[0] is False
    assert match({"step_ids": ["qsa-c6"]}, _ctx())[0] is True
    assert match({"step_ids": ["qsa-c1"]}, _ctx())[0] is False


def test_languages():
    assert match({"languages": ["it", "en"]}, _ctx())[0] is True
    assert match({"languages": ["en"]}, _ctx(language="it"))[0] is False


def test_intents():
    assert match({"intents": ["clarify", "reflect"]}, _ctx(intent="clarify"))[0] is True
    ok, reason = match({"intents": ["advice"]}, _ctx(intent="reading"))
    assert ok is False and "intenzione" in reason


def test_requires_scores():
    assert match({"requires_scores": True}, _ctx())[0] is True
    assert match({"requires_scores": True}, _ctx(scores_context="  "))[0] is False
    assert match({"requires_scores": False}, _ctx(scores_context=""))[0] is True


def test_min_salient_factors():
    assert match({"min_salient_factors": 2}, _ctx())[0] is True
    assert match({"min_salient_factors": 3}, _ctx())[0] is False
    ok, reason = match({"min_salient_factors": "molti"}, _ctx())
    assert ok is False and "min_salient_factors" in reason


def test_factor_bands_any_of():
    assert match({"factor_bands": {"any_of": ["growth"]}}, _ctx())[0] is True
    assert match({"factor_bands": {"any_of": ["normal"]}}, _ctx())[0] is False
    ok, reason = match({"factor_bands": ["growth"]}, _ctx())
    assert ok is False and "any_of" in reason


def test_conditions_are_anded():
    conditions = {"questionnaire_types": ["QSA"], "step_modes": ["generic"]}
    assert match(conditions, _ctx())[0] is False


def test_known_keys_are_documented():
    assert KNOWN_CONDITION_KEYS == frozenset({
        "questionnaire_types", "step_modes", "step_ids",
        "factor_bands", "min_salient_factors", "languages", "requires_scores", "intents",
    })


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
