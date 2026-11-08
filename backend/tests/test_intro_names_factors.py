"""The introduction may name the factors but never mentions or interprets a result."""
from backend import prompt_config
from backend.prompt_config import _text

SCORE_BASED_INTROS = (
    prompt_config.DEFAULT_SYSTEM_PROMPT_INTRO, prompt_config.DEFAULT_SYSTEM_PROMPT_QSAR_INTRO,
    prompt_config.DEFAULT_SYSTEM_PROMPT_ZTPI_INTRO, prompt_config.DEFAULT_SYSTEM_PROMPT_QPCS_INTRO,
    prompt_config.DEFAULT_SYSTEM_PROMPT_QPCC_INTRO, prompt_config.DEFAULT_SYSTEM_PROMPT_QAP_INTRO,
)


def test_score_based_intros_forbid_results_and_allow_factors():
    # Prompt health #46: "present the cognitive and affective factors" contradicted
    # "do not mention any factor". Only results are off limits in the introduction.
    for text in SCORE_BASED_INTROS:
        assert "Do NOT yet mention or interpret any result: no score, level, or table." in text
        assert "You may name the factors and areas the path will explore." in text
        assert "mention any score, factor" not in text
    for name in ("qsa_step_intro", "score_based_intro_step_prompt"):
        step = _text(name)
        assert "no score, level, or table; naming the factors is fine." in step
        assert "mention any factor" not in step


def test_the_narrative_intro_keeps_its_rule():
    assert "Do NOT yet: mention any score, factor, or table." in prompt_config.DEFAULT_SYSTEM_PROMPT_SAVICKAS_INTRO
