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


def test_anchor_directive_is_identical_in_every_factor_prompt():
    # [ANCHOR] vive in un file per strumento (default_system_prompt_factor.md e
    # le varianti qsar/ztpi): l'unico blocco condiviso ancora scritto piu' volte,
    # e la chiusura di uno strumento non deve invecchiare da sola.
    qsa = _block(DEFAULT_SYSTEM_PROMPT_FACTOR, "ANCHOR")
    assert qsa, "QSA factor prompt senza [ANCHOR]"
    for name, prompt in (("QSAr", DEFAULT_SYSTEM_PROMPT_QSAR_FACTOR),
                         ("ZTPI", DEFAULT_SYSTEM_PROMPT_ZTPI_FACTOR)):
        other = _block(prompt, "ANCHOR")
        assert other, f"{name} factor prompt senza [ANCHOR]"
        assert qsa == other, f"[ANCHOR] diverso fra QSA e {name}:\nQSA:  {qsa}\n{name}: {other}"


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


def test_qpcc_and_qap_share_one_summary_text():
    # Due file distinti con lo stesso identico testo: se una direttiva entra in
    # uno solo, il percorso gemello resta indietro senza segnali.
    qpcc = _default_for("prompt_qpcc_summary")
    qap = _default_for("prompt_qap_summary")
    assert qpcc == qap, "prompt_qpcc_summary e prompt_qap_summary sono divergenti"


def test_the_three_competence_metas_stay_one_text():
    # QPCS, QPCC e QAP condividono il quadro Pellerey: devono continuare a
    # puntare allo stesso default, non a tre copie da allineare a mano.
    metas = {key: _default_for(key) for key in ("prompt_meta_QPCS", "prompt_meta_QPCC", "prompt_meta_QAP")}
    assert len(set(metas.values())) == 1, "i meta delle competenze sono divergenti"


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
