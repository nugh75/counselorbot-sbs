"""Vocabolario dei bisogni e risoluzione dell'istituto dello studente.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_referral_needs_scope
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

from backend.referral_needs import REFERRAL_NEEDS, known_needs, needs_from_text


# --- vocabolario dei bisogni -------------------------------------------------

def test_every_need_declares_label_and_keywords():
    assert len(REFERRAL_NEEDS) == 8
    for code, need in REFERRAL_NEEDS.items():
        assert need["label"].strip(), code
        assert need["keywords"], code


def test_needs_come_from_the_student_words():
    assert "disagio-emotivo" in needs_from_text("vorrei parlare con uno psicologo")
    assert "dsa-bes" in needs_from_text("ho una certificazione dsa, chi segue queste cose")
    assert "iscrizioni-scadenze" in needs_from_text("quando scadono le iscrizioni")
    assert "mobilita-estero" in needs_from_text("vorrei fare un erasmus")


def test_a_greeting_names_no_need():
    assert needs_from_text("ciao, grazie mille") == set()
    assert needs_from_text("") == set()


def test_known_needs_drops_what_is_not_in_the_vocabulary():
    assert known_needs(["scelta-percorso", "inventato"]) == ["scelta-percorso"]
    assert known_needs(None) == []


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
