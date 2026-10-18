"""Verifica che i prompt dei percorsi guidati a intervista applichino la regola
della domanda singola su un solo aspetto e non contengano elenchi multi-domanda.

Audit 2026-10-18: BLOCCANTE-3 (parte testi) e NON BLOCCANTE-5; bug 676c4d54 e 80e1d321.
"""
import re
from backend import prompt_config, qpcc


ALL_STEP_LISTS = (
    ("QPCC", prompt_config.DEFAULT_QPCC_GUIDED_STEPS),
    ("QAP", prompt_config.DEFAULT_QAP_GUIDED_STEPS),
    ("QPCS", prompt_config.DEFAULT_QPCS_GUIDED_STEPS),
    ("QSAR", prompt_config.DEFAULT_QSAR_GUIDED_STEPS),
    ("ZTPI", prompt_config.DEFAULT_ZTPI_GUIDED_STEPS),
    ("SAVICKAS", prompt_config.DEFAULT_SAVICKAS_GUIDED_STEPS),
    ("EVENTO_STUDIO", prompt_config.DEFAULT_EVENTO_STUDIO_GUIDED_STEPS),
    ("EVENTO_PROFESSIONALE", prompt_config.DEFAULT_EVENTO_PROFESSIONALE_GUIDED_STEPS),
    ("OBIETTIVO_STUDIO", prompt_config.DEFAULT_OBIETTIVO_STUDIO_GUIDED_STEPS),
    ("OBIETTIVO_DOCENZA", prompt_config.DEFAULT_OBIETTIVO_DOCENZA_GUIDED_STEPS),
    ("QSA", prompt_config.DEFAULT_GUIDED_STEPS),
)


def test_qpcc_contract_framing_and_refusal_rules():
    """Il contratto QPCC deve trattare i punteggi come autopercezioni/ipotesi,
    vietare diagnosi, vietare attribuzioni di emozioni non nominate e vietare
    di riproporre letture o strategie rifiutate."""
    contract = qpcc.directive()
    assert "[CANONICAL QPCC CONTRACT]" in contract
    assert "declared self-perceptions, not objective facts, grades or clinical diagnoses" in contract
    assert "tentative hypotheses to check with the person, never as established truths" in contract
    assert "High A1/A2/A3 scores reflect more self-reported difficulty" in contract
    assert "never treat difficulties as fixed traits or pathology" in contract
    assert "Never attribute emotions or feelings (such as anxiety or insecurity) unless the person named them first" in contract
    assert "If the person rejects a reading or strategy, accept the correction immediately and never offer it again" in contract
    assert "exactly ONE open question per turn on a single aspect, never a list of questions" in contract
    assert "after about five exchanges at most" in contract
    assert "Close the area when a concrete way of acting has emerged" in contract


def test_no_multi_question_bullet_or_itemized_lists_in_step_prompts():
    """Nei prompt degli step non devono esserci formulazioni che elencano
    più aspetti/domande da chiedere nello stesso turno."""
    multi_question_patterns = [
        re.compile(r"experiences competence, recognition and causes", re.IGNORECASE),
        re.compile(r"where, who \(by role\), what was done and said", re.IGNORECASE),
        re.compile(r"what worked in the person and what in the setting", re.IGNORECASE),
        re.compile(r"what in the setting got in the way and what could have gone better", re.IGNORECASE),
        re.compile(r"ask what the person felt, did and said", re.IGNORECASE),
        re.compile(r"ask where and when the work on the objective is planned, and what usually gets in the way", re.IGNORECASE),
        re.compile(r"ask what they could show, do or produce that proves it, and when they want to check", re.IGNORECASE),
    ]

    for instrument, steps in ALL_STEP_LISTS:
        for step in steps:
            prompt = step.get("prompt", "")
            for pattern in multi_question_patterns:
                assert not pattern.search(prompt), (
                    f"Found multi-question pattern '{pattern.pattern}' in {instrument}:{step['id']}"
                )


def test_interview_step_prompts_enforce_single_question():
    """Tutti gli step a intervista devono contenere la prescrizione esplicita
    di chiedere esattamente una sola domanda aperta su un solo aspetto e mai
    elenchi di domande."""
    single_q_indicator = re.compile(
        r"(exactly ONE open question|ONE open question|ONE question per turn|one main question per turn)",
        re.IGNORECASE,
    )
    never_list_indicator = re.compile(r"never a list of questions", re.IGNORECASE)

    # Step speciali di presentazione iniziale, lettura profilo o sintesi finale
    skip_step_ids = {
        "intro", "qpcc-profilo", "qpcc-intro", "qap-profilo", "qap-intro",
        "qpcs-profilo", "qpcs-intro", "qsar-intro", "ztpi-intro",
        "savickas-intro", "savickas-patto", "evstudio-intro", "evstudio-patto",
        "evprof-intro", "evprof-patto", "obbstudio-intro", "obbdocenza-intro",
        "qpcc-sintesi", "qap-sintesi", "qpcs-sintesi", "qsar-synthesis",
        "ztpi-btp", "savickas-final", "evstudio-final", "evprof-final",
        "obbstudio-final", "obbdocenza-final", "sl-synthesis",
    }

    for instrument, steps in ALL_STEP_LISTS:
        for step in steps:
            step_id = step["id"]
            if step_id in skip_step_ids:
                continue
            prompt = step.get("prompt", "")
            assert single_q_indicator.search(prompt), (
                f"{instrument}:{step_id} missing single-question prescription: {prompt}"
            )
            assert never_list_indicator.search(prompt), (
                f"{instrument}:{step_id} missing 'never a list of questions': {prompt}"
            )


def test_qpcc_interview_steps_have_avanza_step_and_single_question():
    """Tutti gli step di approfondimento QPCC hanno [[AVANZA_STEP]] e prescrizione
    di singola domanda su singolo aspetto."""
    interview_steps = [s for s in prompt_config.DEFAULT_QPCC_GUIDED_STEPS if s["id"] not in ("qpcc-intro", "qpcc-profilo", "qpcc-sintesi")]
    assert len(interview_steps) == 5
    for step in interview_steps:
        prompt = step["prompt"]
        assert "exactly ONE open question" in prompt
        assert "never a list of questions" in prompt
        assert "[[AVANZA_STEP]]" in prompt


def test_system_prompt_files_consistency():
    """I prompt di sistema in backend/prompts/ per QPCC, QAP, QPCS, Savickas, Evento, Obiettivo
    devono essere coerenti con la direttiva di una sola domanda aperta per turno."""
    files_to_check = [
        "prompt_qpcc_interview.md",
        "prompt_qap_interview.md",
        "default_system_prompt_qpcs_analysis.md",
        "default_system_prompt_savickas_interview.md",
        "default_system_prompt_evento_interview.md",
        "default_system_prompt_obiettivo_interview.md",
    ]
    for filename in files_to_check:
        text = prompt_config._text(filename.replace(".md", ""))
        assert "exactly ONE open question per turn on a single aspect" in text or "ONE open question per turn" in text, (
            f"{filename} lacks single question directive"
        )
        assert "never a list of questions" in text, (
            f"{filename} lacks 'never a list of questions'"
        )
