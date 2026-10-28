"""Contratto «Nessuno» e lunghezza come intervallo.

Test puri: nessuna rete e nessun database. Verificano che la direttiva di
reasoning venga sostituita (non solo affiancata) quando il reasoning è spento,
che i modelli non-reasoning non ricevano un invito a produrre `<think>`, e che
la lunghezza abbia minimo, obiettivo e tetto.
"""
from backend.chat_logic import (
    DEFAULT_NO_REASONING_DIRECTIVE,
    DEFAULT_THINKING_DIRECTIVE,
    RESPONSE_LENGTH_PROFILES,
    _apply_reasoning_directive,
    _apply_response_length_directive,
    _effective_model_name,
    _limit_visible_words,
    _reasoning_disabled_for,
)
from backend.reasoning_profiles import (
    DEEP_REASONING_BUDGET,
    ReasoningPlan,
    is_mandatory_reasoning,
    mark_openrouter_mandatory_reasoning,
)
from backend.ai_service import AIService
from types import SimpleNamespace


class _AI:
    def __init__(self, *, disable=False, model="qwen3.8:latest", provider="ollama"):
        self.disable_thinking = disable
        self.config = {"active_provider": provider, "model_name": model}
        self.personal_target = None
        self.chatgpt_model = None


def test_reasoning_off_replaces_the_thinking_directive():
    base = "BASE\n\n" + DEFAULT_THINKING_DIRECTIVE + "\n\n[RETRIEVAL] keep me"
    out = _apply_reasoning_directive(
        base, disabled=True, no_reasoning_directive=DEFAULT_NO_REASONING_DIRECTIVE,
    )
    assert "[THINKING]" not in out
    assert "[NO REASONING]" in out
    assert "[RETRIEVAL] keep me" in out


def test_reasoning_on_restores_one_canonical_directive():
    out = _apply_reasoning_directive(
        "BASE", disabled=False, thinking_directive=DEFAULT_THINKING_DIRECTIVE,
    )
    assert out.count("[THINKING]") == 1
    assert "[NO REASONING]" not in out


def test_explicit_off_wins_over_a_personal_source_default():
    ai = _bare_ai()
    ai.personal_reasoning = "high"
    assert ai.disable_thinking is False

    ai.reasoning_effort_override = "off"
    assert ai.disable_thinking is True
    assert ai.reasoning_budget_override == 0

    ai.reasoning_effort_override = "deep"
    assert ai.disable_thinking is False
    assert ai.reasoning_budget_override == DEEP_REASONING_BUDGET


def test_openai_effort_follows_the_explicit_choice():
    ai = _bare_ai()
    assert ai._openai_reasoning_effort("mistral-large-4-0") is None
    ai.personal_reasoning = "none"
    assert ai._openai_reasoning_effort("o3") == "minimal"
    ai.reasoning_effort_override = "deep"
    assert ai._openai_reasoning_effort("o3") == "high"
    ai.reasoning_effort_override = "off"
    assert ai._openai_reasoning_effort("o3") == "minimal"


def test_stream_suppresses_native_and_inline_reasoning_when_off():
    ai = _bare_ai()
    ai._disable_thinking = True
    chunks = [
        _chunk(reasoning="native secret"),
        _chunk(content="<think>inline secret</think>visible answer"),
        _chunk(content="", finish_reason="stop"),
    ]
    items = list(ai._iter_chat_stream(_client(chunks), "test-model", "system", "user"))
    assert [item for item in items if item["type"] == "reasoning"] == []
    assert "".join(item["text"] for item in items if item["type"] == "content") == "visible answer"
    assert ai.last_thinking == "native secretinline secret"


def test_stream_keeps_reasoning_when_it_is_on():
    ai = _bare_ai()
    ai._disable_thinking = False
    chunks = [_chunk(reasoning="native secret"), _chunk(content="visible answer", finish_reason="stop")]
    items = list(ai._iter_chat_stream(_client(chunks), "test-model", "system", "user"))
    assert [item["text"] for item in items if item["type"] == "reasoning"] == ["native secret"]


def test_no_think_token_is_only_sent_to_qwen3_llama_cpp():
    ai = _bare_ai()
    ai._disable_thinking = True
    assert ai._apply_no_think("system", "qwen3.8:latest") == "system\n\n/no_think"
    assert ai._apply_no_think("system", "mistral") == "system"
    assert ai._apply_ollama_thinking_directive("system") == "system"
    ai._disable_thinking = False
    assert ai._apply_no_think("system", "qwen3.8:latest") == "system"


def _stream_service(chunks, disabled=True):
    ai = _bare_ai()
    ai._disable_thinking = disabled
    ai.personal_target = None
    ai.chatgpt_model = None
    ai.last_completion = None
    ai._targets = lambda *args: [("test", "model")]
    prepared = SimpleNamespace(stream_restorer=lambda: None, restore=lambda value: value)
    ai._attempt_input = lambda *args: ({"stream": lambda *a, **kw: iter(chunks)}, None, "user", "system", None, prepared)
    ai._attempt_report = lambda attempt: None
    ai._record_completion = lambda *args: None
    return ai


def test_reasoning_off_buffers_orphan_tags_before_they_can_reach_chat():
    consumed = []
    def provider():
        for part in ["English internal instructions", "</thi", "nk>", "Risposta italiana."]:
            consumed.append(part)
            yield {"type": "content", "text": part}
    ai = _stream_service(provider())
    stream = ai.stream_response("user", "system", "generic")
    first = next(stream)
    assert len(consumed) == 4
    assert first == {"type": "content", "text": "Risposta italiana."}
    assert list(stream) == []


def test_reasoning_off_strips_analysis_and_preserves_ordinary_prose():
    for parts, expected in [
        (["<analysis>private", " thought</analysis>", "Risposta."], "Risposta."),
        (["Una risposta", " normale."], "Una risposta normale."),
    ]:
        ai = _stream_service({"type": "content", "text": part} for part in parts)
        assert ''.join(item['text'] for item in ai.stream_response('u', 's', 'generic')) == expected


def test_reasoning_on_keeps_incremental_content():
    consumed = []
    def provider():
        for part in ['prima ', 'dopo']:
            consumed.append(part)
            yield {'type': 'content', 'text': part}
    stream = _stream_service(provider(), disabled=False).stream_response('u', 's', 'generic')
    assert next(stream)['text'] == 'prima '
    assert consumed == ['prima ']
    assert next(stream)['text'] == 'dopo'


def test_interrupted_hidden_output_does_not_escape_and_can_use_fallback():
    def interrupted(*args, **kwargs):
        yield {'type': 'content', 'text': 'Unfinished private thought'}
        raise RuntimeError('interrupted')
    def fallback(*args, **kwargs):
        yield {'type': 'content', 'text': 'Risposta di riserva'}
    ai = _stream_service([])
    ai._targets = lambda *args: [('first', 'one'), ('second', 'two')]
    prepared = SimpleNamespace(stream_restorer=lambda: None, restore=lambda value: value)
    ai._attempt_input = lambda provider, *args: ({'stream': interrupted if provider == 'first' else fallback}, None, 'u', 's', None, prepared)
    items = list(ai.stream_response('u', 's', 'generic'))
    assert items == [{'type': 'content', 'text': 'Risposta di riserva'}]
    assert [attempt['status'] for attempt in ai.last_attempts] == ['failed', 'succeeded']


def _bare_ai():
    ai = AIService.__new__(AIService)
    ai.personal_reasoning = None
    ai._reasoning_effort_override = None
    ai._disable_thinking = False
    ai._reasoning_budget_override = None
    ai.temperature = None
    ai.last_usage = None
    ai.last_thinking = None
    return ai


class _Delta:
    def __init__(self, *, reasoning=None, content=None):
        self.reasoning = reasoning
        self.reasoning_content = None
        self.content = content


class _Choice:
    def __init__(self, delta):
        self.delta = delta


class _Chunk:
    def __init__(self, delta, finish_reason=None):
        self.model = "test-model"
        self.usage = None
        self.choices = [_Choice(delta)] if delta is not None else []
        self.finish_reason = finish_reason


def _chunk(*, reasoning=None, content=None, finish_reason=None):
    return _Chunk(_Delta(reasoning=reasoning, content=content), finish_reason)


class _Completions:
    def __init__(self, chunks):
        self.chunks = chunks

    def create(self, **_kwargs):
        return iter(self.chunks)


class _Chat:
    def __init__(self, chunks):
        self.completions = _Completions(chunks)


class _Client:
    def __init__(self, chunks):
        self.chat = _Chat(chunks)


def _client(chunks):
    return _Client(chunks)


def test_known_non_reasoning_models_do_not_get_a_thinking_invite():
    assert _reasoning_disabled_for(_AI(model="mistral-large-4-0")) is True
    assert _reasoning_disabled_for(_AI(model="qwen3.8:latest")) is False
    assert _reasoning_disabled_for(_AI(model="qwen3.8:latest", disable=True)) is True


def test_effective_model_prefers_personal_source_and_chatgpt():
    ai = _AI(model="configured-model")
    ai.personal_target = ("openrouter", "personal/model")
    assert _effective_model_name(ai) == "personal/model"
    ai.personal_target = None
    ai.chatgpt_model = "account-model"
    assert _effective_model_name(ai) == "account-model"


def test_mandatory_reasoning_is_provider_aware_and_dynamic():
    assert is_mandatory_reasoning("openai/o1", "openrouter") is True
    assert is_mandatory_reasoning("openai/o1", "openai") is False
    fake = "test-provider/mandatory-learned"
    assert is_mandatory_reasoning(fake, "openrouter") is False
    mark_openrouter_mandatory_reasoning(fake)
    assert is_mandatory_reasoning(fake, "openrouter") is True


def test_response_length_is_a_range_with_a_hard_cap():
    for name, profile in RESPONSE_LENGTH_PROFILES.items():
        assert profile["min_words"] < profile["target_words"] < profile["max_words"], name
        directive = _apply_response_length_directive("BASE", name)
        assert f"{profile['min_words']}-{profile['max_words']}" in directive
        assert f"about {profile['target_words']} words" in directive
    text = " ".join(f"w{i}" for i in range(120))
    clipped, truncated = _limit_visible_words(text, "short")
    assert truncated is True
    assert len(clipped.split()) <= RESPONSE_LENGTH_PROFILES["short"]["max_words"] + 1


def test_openai_effort_uses_the_resolved_preset_effort():
    ai = _bare_ai()
    ai._reasoning_plan = ReasoningPlan(
        enabled=True, reasoning_budget=5000, max_tokens=7000, effort="medium",
    )
    assert ai._openai_reasoning_effort("o3") == "medium"
    ai._reasoning_plan = ReasoningPlan(
        enabled=True, reasoning_budget=16000, max_tokens=18000, effort="max",
    )
    assert ai._openai_reasoning_effort("o3") == "high"
