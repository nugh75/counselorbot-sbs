"""Test degli stati di certificazione per (contenuto, lingua).

Parte pura: vocabolari e transizioni. Nessun database.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_content_versions
"""
from backend.content_versions import (
    APP_LOCALES,
    CONTENT_TYPES,
    INSTRUMENT_STATUSES,
    TOOL_STATUSES,
    ContentVersionError,
    assert_transition,
    can_transition,
    is_served,
    statuses_for,
)


def test_app_locales_are_the_six_of_the_interface():
    assert APP_LOCALES == ("it", "en", "es", "fr", "de", "sv")


def test_instruments_and_tools_have_different_ladders():
    assert INSTRUMENT_STATUSES == ("draft", "translated", "reviewed", "pilot", "validated")
    assert TOOL_STATUSES == ("draft", "translated", "certified")
    assert statuses_for("instrument") == INSTRUMENT_STATUSES
    assert statuses_for("certified_strategy") == TOOL_STATUSES


def test_unknown_content_type_is_refused():
    try:
        statuses_for("nonesiste")
    except ContentVersionError:
        return
    raise AssertionError("un tipo di contenuto sconosciuto deve essere rifiutato")


def test_only_the_last_rungs_are_served():
    assert is_served("instrument", "pilot") is True
    assert is_served("instrument", "validated") is True
    assert is_served("instrument", "reviewed") is False
    assert is_served("instrument", "draft") is False
    assert is_served("certified_strategy", "certified") is True
    assert is_served("certified_strategy", "translated") is False


def test_promotion_advances_one_rung_at_a_time():
    assert can_transition("instrument", "draft", "translated") is True
    assert can_transition("instrument", "translated", "reviewed") is True
    # saltare la revisione cognitiva per andare al pilot non e' ammesso
    assert can_transition("instrument", "translated", "pilot") is False
    assert can_transition("instrument", "draft", "validated") is False


def test_demotion_is_always_allowed():
    # una traduzione trovata sbagliata deve poter tornare indietro di quanto serve
    assert can_transition("instrument", "validated", "draft") is True
    assert can_transition("instrument", "pilot", "translated") is True
    assert can_transition("certified_strategy", "certified", "draft") is True


def test_same_status_is_not_a_transition():
    assert can_transition("instrument", "pilot", "pilot") is False


def test_status_outside_the_ladder_is_refused():
    assert can_transition("certified_strategy", "draft", "validated") is False
    try:
        assert_transition("certified_strategy", "draft", "validated")
    except ContentVersionError as exc:
        assert "validated" in str(exc)
        return
    raise AssertionError("uno stato fuori vocabolario deve essere rifiutato")


def test_every_content_type_has_a_served_status():
    for content_type, ladder in CONTENT_TYPES.items():
        assert any(is_served(content_type, s) for s in ladder), content_type


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"ok   {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}")
        except Exception as exc:
            failed += 1
            print(f"ERROR {test.__name__}: {type(exc).__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
