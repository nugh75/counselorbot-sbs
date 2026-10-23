"""Guardia contro la deriva fra i prompt gemelli QSA e QSAr.

Ogni modalita' esiste in due righe (`prompt_factor`/`prompt_qsar_factor`,
`prompt_factor_qa`/`prompt_qsar_factor_qa`, `prompt_second_level`/
`prompt_qsar_second_level`): il corpo diverge apposta (il QSAr e' un profilo
ridotto), ma le direttive che valgono per entrambi devono restare identiche.
Quando una direttiva viene aggiunta a mano da un lato solo, lo strumento
dimenticato resta indietro senza che nessuno se ne accorga: e' cosi' che le
chiusure del secondo livello sono rimaste per mesi con la formula vecchia.

Le direttive condivise arrivano da un file solo (`backend/prompts/*.md`)
appeso via sentinella: questo test verifica che sia ancora vero, cioe' che
nessuno abbia ricopiato il testo dentro un ramo.

Eseguibile senza pytest:
    python -m backend.tests.test_prompt_pair_drift
"""
import re

from backend.prompt_config import (
    DEFAULT_QA_DEPTH_DIRECTIVE,
    DEFAULT_SECOND_LEVEL_METHOD,
    DEFAULT_SYSTEM_PROMPT_FACTOR,
    DEFAULT_SYSTEM_PROMPT_FACTOR_QA,
    DEFAULT_SYSTEM_PROMPT_QSAR_FACTOR,
    DEFAULT_SYSTEM_PROMPT_QSAR_FACTOR_QA,
    DEFAULT_SYSTEM_PROMPT_QSAR_SECOND_LEVEL,
    DEFAULT_SYSTEM_PROMPT_SECOND_LEVEL,
    DEFAULT_SYSTEM_PROMPT_ZTPI_FACTOR,
    META_SYSTEM_PROMPT_DEFINITIONS,
    SYSTEM_PROMPT_DEFINITIONS,
)

PAIRS = (
    ("factor", DEFAULT_SYSTEM_PROMPT_FACTOR, DEFAULT_SYSTEM_PROMPT_QSAR_FACTOR),
    ("factor-qa", DEFAULT_SYSTEM_PROMPT_FACTOR_QA, DEFAULT_SYSTEM_PROMPT_QSAR_FACTOR_QA),
    ("second-level", DEFAULT_SYSTEM_PROMPT_SECOND_LEVEL, DEFAULT_SYSTEM_PROMPT_QSAR_SECOND_LEVEL),
)


def _block(text: str, sentinel: str) -> str:
    """Il blocco che inizia con la sentinella, fino alla fine o al blocco dopo."""
    match = re.search(rf"\[{re.escape(sentinel)}\].*?(?=\n\n\[[A-Z]|\Z)", text, re.S)
    return match.group(0).strip() if match else ""


def test_anchor_directive_is_removed_from_every_factor_prompt():
    # [ANCHOR] e' stato rimosso dai default di fabbrica dei fattori: la regola
    # della domanda di chiusura variata e agganciata all'esperienza passa nel
    # contratto di facilitazione (fase 3 dell'audit).
    for name, prompt in (("QSA", DEFAULT_SYSTEM_PROMPT_FACTOR),
                         ("QSAr", DEFAULT_SYSTEM_PROMPT_QSAR_FACTOR),
                         ("ZTPI", DEFAULT_SYSTEM_PROMPT_ZTPI_FACTOR)):
        assert "[ANCHOR]" not in prompt, f"{name} factor prompt ha ancora [ANCHOR]"


def test_qsar_register_lives_in_the_qsar_prompts_not_in_the_global_directive():
    # #423: il registro per la secondaria di primo grado e' del solo QSAr; la
    # direttiva globale tiene i vincoli comuni (il "tu") e non parla di strumenti.
    import json
    from pathlib import Path

    from backend.prompt_config import (
        ALL_CONFIG_TEXT_DEFINITIONS,
        DEFAULT_QSAR_REGISTER_DIRECTIVE,
        DEFAULT_SYSTEM_PROMPT_QSAR_GENERIC,
    )
    from backend.prompt_updates import digest

    directive = DEFAULT_QSAR_REGISTER_DIRECTIVE.strip()
    assert directive.startswith("[QSAR REGISTER]") and "lower-secondary" in directive
    qsar = {
        "prompt_qsar_factor": DEFAULT_SYSTEM_PROMPT_QSAR_FACTOR,
        "prompt_qsar_factor_qa": DEFAULT_SYSTEM_PROMPT_QSAR_FACTOR_QA,
        "prompt_qsar_second_level": DEFAULT_SYSTEM_PROMPT_QSAR_SECOND_LEVEL,
        "prompt_qsar_generic": DEFAULT_SYSTEM_PROMPT_QSAR_GENERIC,
    }
    for key, prompt in qsar.items():
        assert prompt.count(directive) == 1, f"{key}: registro QSAr assente o duplicato"
    for prompt in (DEFAULT_SYSTEM_PROMPT_FACTOR, DEFAULT_SYSTEM_PROMPT_FACTOR_QA,
                   DEFAULT_SYSTEM_PROMPT_SECOND_LEVEL, DEFAULT_SYSTEM_PROMPT_ZTPI_FACTOR):
        assert "[QSAR REGISTER]" not in prompt
    register = next(i["default"] for i in ALL_CONFIG_TEXT_DEFINITIONS if i["key"] == "directive_register")
    assert "'tu'" in register and "QSAr" not in register and "secondary" not in register
    # Le righe ferme al testo di fabbrica precedente restano allineabili.
    legacy = json.loads((Path(__file__).parents[1] / "prompt_factory_legacy.json").read_text())
    for key, prompt in qsar.items():
        assert digest(prompt) in legacy["configs"][key], key
        assert len(legacy["configs"][key]) >= 2, f"{key}: hash di fabbrica precedente perso"


def test_shared_directives_reach_both_members_of_each_pair():
    # Le direttive a sorgente unica devono essere composte in entrambi i rami:
    # se un refactor ne stacca uno, lo strumento perde la regola in silenzio.
    for name, qsa, qsar in PAIRS:
        if name == "factor-qa":
            shared = DEFAULT_QA_DEPTH_DIRECTIVE.strip()
        elif name == "second-level":
            shared = DEFAULT_SECOND_LEVEL_METHOD.strip()
        else:
            continue
        assert shared in qsa, f"{name}: direttiva condivisa assente dal ramo QSA"
        assert shared in qsar, f"{name}: direttiva condivisa assente dal ramo QSAr"


def test_pairs_still_differ_where_they_should():
    # Il contrario della deriva: i due rami non devono collassare in copie
    # identiche. Il corpo del QSAr dice che il profilo e' ridotto; il default di
    # fabbrica lo fa dove serve (factor e second-level), il follow-up eredita la
    # regola dallo scope gia' fissato dallo step.
    for name, qsa, qsar in PAIRS:
        assert qsa != qsar, f"{name}: i due prompt sono diventati identici"
    for name, _, qsar in PAIRS:
        if name == "factor-qa":
            continue
        assert any(word in qsar.lower() for word in ("reduced", "compact", "short")), (
            f"{name}: il ramo QSAr non dice piu' che il profilo e' ridotto"
        )


def _default_for(key: str) -> str:
    for item in (*SYSTEM_PROMPT_DEFINITIONS, *META_SYSTEM_PROMPT_DEFINITIONS):
        if item["key"] == key:
            return item["default"]
    raise AssertionError(f"chiave {key} assente dai default")


def test_qpcc_and_qap_summaries_keep_their_domain_and_shared_output_safeguards():
    # Due file distinti con lo stesso identico testo: se una direttiva entra in
    # uno solo, il percorso gemello resta indietro senza segnali.
    qpcc = _default_for("prompt_qpcc_summary")
    qap = _default_for("prompt_qap_summary")
    assert '[CANONICAL QPCC CONTRACT]' in qpcc
    assert 'ten' in qpcc and 'QPCC' not in qap
    for text in (qpcc, qap):
        assert '[[AVANZA_STEP]]' in text
        assert 'certified candidate' in text
        assert 'agreed timeframes' in text


def test_the_three_competence_metas_stay_one_text():
    # QPCS, QPCC e QAP condividono il quadro Pellerey: devono continuare a
    # puntare allo stesso default, non a tre copie da allineare a mano.
    metas = {key: _default_for(key) for key in ("prompt_meta_QPCS", "prompt_meta_QPCC", "prompt_meta_QAP")}
    assert len(set(metas.values())) == 1, "i meta delle competenze sono divergenti"


def test_every_step_receives_a_theory_frame():
    # Ogni step prende il meta della sua chiave, altrimenti quello di strumento:
    # se nessuno dei due c'e', quello step gira senza quadro teorico. E' quanto
    # e' successo a ztpi-t1..t4 e alle cinque domande Savickas.
    from backend.chat_logic import prompt_meta_config_key
    from backend.prompt_config import (
        DEFAULT_GUIDED_STEPS,
        DEFAULT_QAP_GUIDED_STEPS,
        DEFAULT_QPCC_GUIDED_STEPS,
        DEFAULT_QPCS_GUIDED_STEPS,
        DEFAULT_QSAR_GUIDED_STEPS,
        DEFAULT_SAVICKAS_GUIDED_STEPS,
        DEFAULT_ZTPI_GUIDED_STEPS,
    )

    metas = {item["key"]: (item["default"] or "").strip() for item in META_SYSTEM_PROMPT_DEFINITIONS}
    paths = (
        ("QSA", DEFAULT_GUIDED_STEPS), ("QSAR", DEFAULT_QSAR_GUIDED_STEPS),
        ("ZTPI", DEFAULT_ZTPI_GUIDED_STEPS), ("SAVICKAS", DEFAULT_SAVICKAS_GUIDED_STEPS),
        ("QPCS", DEFAULT_QPCS_GUIDED_STEPS), ("QPCC", DEFAULT_QPCC_GUIDED_STEPS),
        ("QAP", DEFAULT_QAP_GUIDED_STEPS),
    )
    for questionnaire_type, steps in paths:
        instrument = metas.get(prompt_meta_config_key(questionnaire_type), "")
        for step in steps:
            own = metas.get(prompt_meta_config_key(questionnaire_type, step["id"]), "")
            frame = own or instrument
            assert frame, f"{questionnaire_type}:{step['id']} senza quadro teorico"
            assert frame.lstrip().startswith("["), f"{questionnaire_type}:{step['id']} senza sentinella"


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
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
