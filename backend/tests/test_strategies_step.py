"""Passo «Strategie e consigli» (#749, audit di coerenza dei prompt, sezione 2).

I passi sui fattori analizzano soltanto; strategie e letture arrivano nel passo
che segue la sintesi. L'intento si legge solo sul messaggio dello studente.
"""
import os
from types import SimpleNamespace

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import pytest

from backend import prompt_config
from backend.chat_logic import (
    STRATEGIES_CANDIDATE_LIMIT,
    STRATEGIES_STEP_MODE,
    _apply_advice_distribution_directive,
    _coerce_certified_strategy_limit,
    _default_certified_strategy_limit,
    _step_allows_practical_advice,
    is_advice_follow_up,
    student_intent,
)
from backend.prompt_contract import turn_contract
from backend.reading_frame import READING_FRAME
from backend.skills.intents import KNOWN_INTENTS, classify

LANGUAGES = ("it", "en", "es", "fr", "de", "sv")

STEP_LISTS = {
    "QSA": prompt_config.DEFAULT_GUIDED_STEPS,
    "QSAr": prompt_config.DEFAULT_QSAR_GUIDED_STEPS,
    "ZTPI": prompt_config.DEFAULT_ZTPI_GUIDED_STEPS,
    "QPCS": prompt_config.DEFAULT_QPCS_GUIDED_STEPS,
    "QPCC": prompt_config.DEFAULT_QPCC_GUIDED_STEPS,
    "QAP": prompt_config.DEFAULT_QAP_GUIDED_STEPS,
}
SYNTHESIS_IDS = {
    "QSA": "sl-synthesis", "QSAr": "qsar-synthesis", "ZTPI": "ztpi-btp",
    "QPCS": "qpcs-sintesi", "QPCC": "qpcc-sintesi", "QAP": "qap-sintesi",
}


# --- Riconoscimento delle richieste (C01, C02) -------------------------------

@pytest.mark.parametrize("message", [
    "Puoi suggerirmi una strategia semplice da usare subito?",
    "Mi suggerisci qualche strategia per concentrarmi?",
    "Quali strategie posso usare per l'ansia?",
    "Can you suggest a study strategy?",
    "What strategies could help me focus?",
    "Give me some tips to stay motivated",
    "¿Puedes sugerirme una estrategia sencilla para usar ya?",
    "¿Qué estrategias puedo usar?",
    "Peux-tu me suggérer une stratégie simple à utiliser tout de suite ?",
    "Quelles stratégies puis-je utiliser ?",
    "Kannst du mir eine einfache Strategie vorschlagen, die ich sofort nutzen kann?",
    "Welche Strategien kann ich nutzen?",
    "Kan du föreslå en enkel strategi som jag kan använda direkt?",
    "Vilka strategier kan jag använda?",
])
def test_strategy_requests_are_advice_in_six_languages(message):
    assert classify(message) == "advice"


@pytest.mark.parametrize("message", [
    "La mia strategia di studio è rileggere tutto la sera prima",
    "My strategy is to reread my notes",
    "Non darmi strategie, voglio solo capire il punteggio",
    "Don't suggest a strategy yet",
])
def test_talking_about_a_strategy_is_not_a_request(message):
    assert classify(message) != "advice"


def _request(message="", memory_message=None, **kwargs):
    base = dict(phase="qpcc-comunicazione", use_phase_prompt=False, internal_message=False,
                message=message, memory_message=memory_message)
    base.update(kwargs)
    return SimpleNamespace(**base)


WRAPPED = (
    'CURRENT STEP INTERNAL INSTRUCTIONS (use them only as guidance; answer the student in language "it"):\n'
    "Explore the area. If they reject a reading or strategy, do not offer it again.\n\n"
    "STUDENT ANSWER:\n{answer}"
)


def test_intent_reads_only_the_students_own_message():
    """C01: le istruzioni del passo reinviate dal frontend o da Telegram non
    sono l'intento dello studente."""
    wrapped = _request(WRAPPED.format(answer="Vorrei un consiglio concreto"))
    assert student_intent(wrapped) == "advice"
    unsure = _request(WRAPPED.format(answer="Non saprei"))
    assert student_intent(unsure) == ""
    # Il messaggio pulito vince quando c'e': Telegram e web lo mandano entrambi.
    both = _request(WRAPPED.format(answer="Non saprei"), memory_message="Non saprei")
    assert student_intent(both) == ""


def test_internal_turns_have_the_guided_intent():
    internal = _request("Ask one reflective question about a strategy already discussed",
                        memory_message="", internal_message=True, phase="questions")
    assert student_intent(internal) == "guided"
    entry = _request("", use_phase_prompt=True, phase="cognitive")
    assert student_intent(entry) == "guided"


def test_strategies_step_turns_open_advice_and_readings():
    assert "strategies" in KNOWN_INTENTS
    entry = _request("", use_phase_prompt=True, phase="sl-strategies")
    assert student_intent(entry, STRATEGIES_STEP_MODE) == "strategies"
    for message in ("Grazie", "Puoi suggerirmi una strategia?", "C'è un libro che mi può aiutare?"):
        assert student_intent(_request(message, phase="sl-strategies"), STRATEGIES_STEP_MODE) == "strategies"
    # Un confronto resta un confronto anche qui.
    compare = _request("Confronta con il mio profilo precedente", phase="sl-strategies")
    assert student_intent(compare, STRATEGIES_STEP_MODE) == "compare"


def test_advice_follow_up_uses_the_clean_message():
    assert is_advice_follow_up(_request(WRAPPED.format(answer="Vorrei un consiglio concreto"))) is True
    assert is_advice_follow_up(_request(WRAPPED.format(answer="Non saprei"))) is False


# --- Gate: quando si danno le strategie (2.2, 2.3, 2.4, C03) ------------------

ANALYSIS_MODES = (
    "factor", "factor-qa", "second-level", "qsar-factor", "qsar-factor-qa", "qsar-second-level",
    "ztpi-factor", "ztpi-btp", "qpcs-factor", "qpcs-analysis", "qpcs-summary",
    "qpcc-factor", "qpcc-interview", "qpcc-summary", "qap-factor", "qap-interview", "qap-summary",
)


@pytest.mark.parametrize("mode", ANALYSIS_MODES)
def test_factor_and_synthesis_steps_give_no_strategy_even_on_request(mode):
    assert _default_certified_strategy_limit(mode, "some-step") == 0
    assert _default_certified_strategy_limit(mode, "some-step", True) == 0
    assert _step_allows_practical_advice(mode, "some-step") is False


def test_strategies_step_has_no_per_reply_limit():
    assert STRATEGIES_CANDIDATE_LIMIT > 1
    assert _default_certified_strategy_limit(STRATEGIES_STEP_MODE, "sl-strategies") == STRATEGIES_CANDIDATE_LIMIT
    assert _default_certified_strategy_limit(STRATEGIES_STEP_MODE, "sl-strategies", True) == STRATEGIES_CANDIDATE_LIMIT
    assert _step_allows_practical_advice(STRATEGIES_STEP_MODE, "sl-strategies") is True
    # Un limite salvato non viene tagliato a uno.
    assert _coerce_certified_strategy_limit(STRATEGIES_CANDIDATE_LIMIT, STRATEGIES_CANDIDATE_LIMIT) == STRATEGIES_CANDIDATE_LIMIT
    assert _coerce_certified_strategy_limit(0, STRATEGIES_CANDIDATE_LIMIT) == 0


def test_questions_phase_answers_an_explicit_request():
    """C03: la fase domande resta libera, ma una richiesta esplicita ha risposta."""
    assert _default_certified_strategy_limit("generic", "questions") == 0
    assert _default_certified_strategy_limit("generic", "questions", True) == STRATEGIES_CANDIDATE_LIMIT
    assert _default_certified_strategy_limit("qsar-generic", "questions", True) == STRATEGIES_CANDIDATE_LIMIT


def test_paths_without_a_strategies_step_keep_their_rules():
    assert _default_certified_strategy_limit("savickas-summary", "savickas-final") == 1
    assert _default_certified_strategy_limit("generic") == 1
    assert _default_certified_strategy_limit("savickas-interview", "savickas-q1") == 0


def test_advice_directive_has_no_fixed_number():
    directive = _apply_advice_distribution_directive("base")
    assert "[ADVICE DISTRIBUTION]" in directive
    assert "at most ONE" not in directive
    assert _apply_advice_distribution_directive(directive) == directive


# --- Contratto del turno -------------------------------------------------------

def test_contract_defers_to_the_named_strategies_step():
    text = turn_contract(language="it", questionnaire_type="QSA", phase="cognitive",
                         advice_allowed=False, strategies_step_label="Strategie e consigli")
    assert "«Strategie e consigli»" in text
    assert "Introduce no new practical action" in text


def test_contract_allows_strategies_without_a_number():
    text = turn_contract(language="it", questionnaire_type="QSA", phase="sl-strategies", advice_allowed=True)
    assert "at most ONE new practical action" not in text
    assert "approved support strategies" in text


# --- Il passo nei percorsi -----------------------------------------------------

@pytest.mark.parametrize("instrument", sorted(STEP_LISTS))
def test_strategies_step_follows_the_synthesis(instrument):
    steps = sorted(STEP_LISTS[instrument], key=lambda s: s["sort_order"])
    ids = [s["id"] for s in steps]
    strategies = [s for s in steps if s["system_prompt_mode"] == STRATEGIES_STEP_MODE]
    assert len(strategies) == 1
    step = strategies[0]
    assert ids.index(step["id"]) == ids.index(SYNTHESIS_IDS[instrument]) + 1
    assert step is steps[-1]
    assert step["questionnaire_type"] == instrument
    assert step["label"] == f"{step['sort_order']}. Strategie e consigli"
    assert set(step["label_i18n"]) == set(LANGUAGES) - {"it"}
    assert step["label_i18n"]["en"] == f"{step['sort_order']}. Strategies and advice"
    # Nessun codice fattore nel prompt: lo scoping per passo resta su tutto il profilo.
    from backend.chat_logic import _extract_factor_codes
    assert not _extract_factor_codes(step["prompt"])


def test_other_paths_have_no_strategies_step():
    for name in ("DEFAULT_SAVICKAS_GUIDED_STEPS", "DEFAULT_IDEA_GUIDED_STEPS",
                 "DEFAULT_EVENTO_STUDIO_GUIDED_STEPS", "DEFAULT_OBIETTIVO_STUDIO_GUIDED_STEPS"):
        assert all(s["system_prompt_mode"] != STRATEGIES_STEP_MODE for s in getattr(prompt_config, name))


def test_strategies_mode_has_its_own_system_prompt():
    key = prompt_config.MODE_TO_SYSTEM_PROMPT_KEY[STRATEGIES_STEP_MODE]
    defaults = {d["key"]: d["default"] for d in prompt_config.ALL_CONFIG_TEXT_DEFINITIONS}
    text = defaults[key]
    assert "approved support" in text
    assert "no fixed number" in text.lower()


# --- Testi di fabbrica allineati -----------------------------------------------

def test_factor_and_synthesis_prompts_no_longer_offer_actions():
    defaults = {d["key"]: d["default"] for d in prompt_config.ALL_CONFIG_TEXT_DEFINITIONS}
    for text in (defaults["prompt_second_level"], defaults["prompt_qpcs_summary"],
                 defaults["prompt_qpcc_summary"], defaults["prompt_qap_summary"],
                 prompt_config.SYNTHESIS_ADVICE_DIRECTIVE):
        assert "at most ONE new practical" not in text
        assert "at most ONE practical action" not in text
        assert "Strategies and advice" in text


def test_pellerey_social_meta_is_descriptive():
    """A08: i consigli pratici escono dal meta ed entrano nel catalogo, in bozza."""
    assert "Concrete suggestions" not in prompt_config.PELLEREY_SOCIAL
    from backend.certified_strategy_seed import DEFAULT_CERTIFIED_STRATEGIES
    social = [s for s in DEFAULT_CERTIFIED_STRATEGIES if s["slug"].startswith("qsa-social-")]
    assert len(social) == 3
    assert all(s.get("status") == "draft" and s["factor_codes"] == ["C4"] for s in social)


def test_one_whitelist_for_readings():
    """A12: catalogo e fonti recuperate si possono proporre e citare entrambi."""
    for language in LANGUAGES:
        frame = READING_FRAME[language]
        assert "«" not in frame["intro"]  # nessuna virgoletta di formato
        assert frame["intro"] != READING_FRAME["en"]["intro"] or language == "en"
    en = READING_FRAME["en"]
    assert "propose and cite" in en["intro"]
    assert "catalogue" in en["sources_intro"]


def test_forced_keys_cover_the_rewritten_factory_texts():
    from backend.prompt_factory_alignment import FORCED_FACTORY_KEYS
    assert {"prompt_second_level", "prompt_qpcs_summary", "prompt_qpcc_summary", "prompt_qap_summary",
            "prompt_meta_QSA_sl-social"} <= FORCED_FACTORY_KEYS["config"]
    assert {"sl-synthesis", "qsar-synthesis"} <= FORCED_FACTORY_KEYS["guided_step"]
